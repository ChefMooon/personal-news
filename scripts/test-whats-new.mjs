import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runElectronHarness } from "./electron-playwright-harness.mjs";
import {
  findVersionSection,
  inlineToText,
  parseReleaseNotes,
} from "../src/shared/release-notes-markdown.mjs";

const SEEN_KEY = "whats_new_last_seen_version";
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const changelog = readFileSync("CHANGELOG.md", "utf8");
const currentNotes = parseReleaseNotes(
  findVersionSection(changelog, packageVersion).body,
).notes;
assert(currentNotes.sections.length > 0, "CHANGELOG has no entry for package version");

// Items from the most recent earlier release that the current entry lacks.
const changelogVersions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - /gm)]
  .map((match) => match[1]);
const currentVersionIndex = changelogVersions.indexOf(packageVersion);
const earlierVersion = changelogVersions[currentVersionIndex + 1];
const bulletTexts = (notes) =>
  notes.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.type === "list"
        ? block.items.flatMap((item) => [
            inlineToText(item.inline),
            ...item.children.map((child) => inlineToText(child.inline)),
          ])
        : [],
    ),
  );
const currentItems = new Set(bulletTexts(currentNotes));
const earlierOnlyItems = earlierVersion
  ? bulletTexts(parseReleaseNotes(findVersionSection(changelog, earlierVersion).body).notes)
      .filter((item) => !currentItems.has(item))
  : [];

const SIMULATED_VERSION = "9.9.9";
const SIMULATED_HTML =
  '<h3>Added</h3>\n<ul>\n<li>Simulated feature <code>Alpha</code> with <a href="https://example.com/a" rel="nofollow">a link</a></li>\n<li>Fish &amp; chips support<ul><li>Nested note</li></ul></li>\n</ul>\n' +
  "<h3>Fixed</h3>\n<ul>\n<li>Simulated fix Beta</li>\n</ul>";

const invoke = (page, channel, ...args) =>
  page.evaluate(([c, a]) => window.api.invoke(c, ...a), [channel, args]);

try {
  const result = await runElectronHarness({
    name: "whats-new",
    async scenario({ page, record, artifacts }) {
      let dialogExpected = false;
      const dialogAppeared = [];
      const watchDialog = async () => {
        const seen = await page
          .getByRole("dialog", { name: /What's new in/ })
          .count();
        if (seen > 0 && !dialogExpected) dialogAppeared.push(page.url());
      };
      const dialogTitle = (version) =>
        page.getByRole("dialog", { name: `What's new in ${version}` });
      const noDialog = async () => {
        await page.waitForTimeout(1000);
        assert.equal(
          await page.getByRole("dialog", { name: /What's new in/ }).count(),
          0,
          "Unexpected What's new dialog",
        );
      };

      // 1. Silent fresh seed
      await page.getByRole("link", { name: "Settings", exact: true }).waitFor();
      await page.waitForFunction(
        async ([key, expected]) =>
          (await window.api.invoke("settings:get", key)) === expected,
        [SEEN_KEY, packageVersion],
        { timeout: 15_000 },
      );
      await noDialog();
      record("seed", `Fresh profile seeded ${SEEN_KEY} silently to ${packageVersion}`);

      // 2. Pre-update toast and Settings row
      const simulated = await invoke(page, "updates:simulateStatus", {
        version: SIMULATED_VERSION,
        releaseNotesHtml: SIMULATED_HTML,
      });
      assert.equal(simulated?.ok, true, `simulateStatus failed: ${JSON.stringify(simulated)}`);
      await page.getByText(`Update ${SIMULATED_VERSION} is ready.`).waitFor();
      const toast = page.locator("[data-sonner-toast]").filter({
        hasText: `Update ${SIMULATED_VERSION} is ready.`,
      });
      await toast.getByRole("button", { name: "See what's new" }).click();
      const incoming = dialogTitle(SIMULATED_VERSION);
      await incoming.waitFor();
      await incoming
        .getByText("Included in the update that is ready to install.")
        .waitFor();
      for (const heading of ["Added", "Fixed"]) {
        await incoming.getByRole("heading", { name: heading, exact: true }).waitFor();
      }
      for (const item of ["Nested note", "Simulated fix Beta"]) {
        await incoming.getByText(item, { exact: true }).waitFor();
      }
      const featureItem = incoming
        .getByRole("listitem")
        .filter({ hasText: "Simulated feature" })
        .first();
      assert(
        (await featureItem.innerText()).includes("Simulated feature Alpha with a link"),
        "Simulated feature list item text is missing",
      );
      const fishItem = incoming
        .getByRole("listitem")
        .filter({ hasText: "Fish & chips support" })
        .first();
      assert(
        (await fishItem.innerText()).includes("Fish & chips support"),
        "Fish and chips parent list item text is missing",
      );
      const simulatedLink = incoming.getByRole("link", { name: "a link" });
      await simulatedLink.waitFor();
      assert.equal(await simulatedLink.getAttribute("href"), "https://example.com/a");
      await incoming.getByRole("button", { name: "Got it", exact: true }).click();
      await incoming.waitFor({ state: "hidden" });
      record("toast", "Toast opened and closed the incoming-update dialog");

      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
      await page.getByText(`Downloaded update ${SIMULATED_VERSION}`).waitFor();
      await page.getByRole("button", { name: "Install and restart" }).first().waitFor();
      // The toast has its own "See what's new" link-button; target the outline button.
      await page
        .getByRole("button", { name: "See what's new", exact: true })
        .last()
        .click();
      await incoming.waitFor();
      await incoming.getByRole("button", { name: "Got it", exact: true }).click();
      await incoming.waitFor({ state: "hidden" });
      assert.equal(
        await invoke(page, "settings:get", SEEN_KEY),
        packageVersion,
        "Incoming-update dialog must not change the last-seen version",
      );
      record("settings", "Settings Downloaded update row opened and closed the dialog");

      // 3. Post-update dialog
      await invoke(page, "settings:set", SEEN_KEY, "0.0.1");
      dialogExpected = true;
      await page.reload();
      const installed = dialogTitle(packageVersion);
      await installed.waitFor();
      await installed.getByText(`You are now on version ${packageVersion}.`).waitFor();
      const dialogText = await installed.innerText();
      for (const section of currentNotes.sections) {
        if (section.heading) {
          await installed
            .getByRole("heading", { name: section.heading, exact: true })
            .waitFor();
        }
        for (const block of section.blocks) {
          if (block.type === "list") {
            for (const item of block.items) {
              const itemText = inlineToText(item.inline);
              assert(dialogText.includes(itemText), `Dialog is missing item: ${itemText}`);
              for (const child of item.children) {
                const childText = inlineToText(child.inline);
                assert(dialogText.includes(childText), `Dialog is missing item: ${childText}`);
              }
            }
          }
        }
      }
      assert.equal(
        await installed.getByRole("listitem").count(),
        bulletTexts(currentNotes).length,
        "Dialog item count differs from CHANGELOG",
      );
      for (const item of earlierOnlyItems) {
        assert(!dialogText.includes(item), `Dialog leaked earlier entry: ${item}`);
      }
      await installed.getByRole("button", { name: "Got it", exact: true }).click();
      await installed.waitFor({ state: "hidden" });
      dialogExpected = false;
      await page.waitForFunction(
        async ([key, expected]) =>
          (await window.api.invoke("settings:get", key)) === expected,
        [SEEN_KEY, packageVersion],
        { timeout: 10_000 },
      );
      await page.reload();
      await page.getByRole("link", { name: "Settings", exact: true }).waitFor();
      await noDialog();
      record("post-update", "Dialog matched CHANGELOG, was acknowledged, and stayed dismissed");

      // 4. Gating
      await watchDialog();
      assert.deepEqual(dialogAppeared, [], "Dialog appeared outside expected steps");
      await page.screenshot({ path: `${artifacts}/final.png` });
    },
  });
  console.log(`What's new harness passed; artifacts: ${result.artifacts}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
