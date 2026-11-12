import assert from "node:assert/strict";
import { runElectronHarness } from "./electron-playwright-harness.mjs";

const observeOnboardingState = (page) =>
  page.evaluate(() => window.api.invoke("settings:getOnboardingState"));
const observeSetting = (page, key) =>
  page.evaluate((settingKey) => window.api.invoke("settings:get", settingKey), key);
const assertButtonInsideViewport = async (button, viewportHeight) => {
  const bounds = await button.boundingBox();
  assert(bounds, "Expected onboarding button to be visible");
  assert(bounds.y >= 0, "Onboarding button starts above the viewport");
  assert(
    bounds.y + bounds.height <= viewportHeight,
    "Onboarding button extends below the viewport",
  );
};

const optInResult = await runElectronHarness({
  name: "onboarding",
  extraEnv: { PERSONAL_NEWS_ONBOARDING: "1" },
  async scenario({ page, artifacts, record }) {
    const wizard = page.getByRole("dialog", {
      name: "Welcome to Personal News",
    });
    await wizard.waitFor();
    assert.equal((await observeOnboardingState(page)).required, true);

    await page.setViewportSize({ width: 900, height: 600 });
    await wizard.getByRole("switch", { name: "Use Sports" }).click();
    await wizard.getByRole("switch", { name: "Use Reddit Digest" }).click();
    for (const feature of ["Sports", "Reddit Digest"]) {
      assert.equal(
        await wizard
          .getByRole("switch", { name: `Use ${feature}` })
          .getAttribute("aria-checked"),
        "false",
        `${feature} should be off in the selected onboarding features`,
      );
    }
    await page.screenshot({
      path: `${artifacts}/pick-900x600.png`,
    });

    const continueButton = wizard.getByRole("button", {
      name: "Continue",
      exact: true,
    });
    await assertButtonInsideViewport(continueButton, 600);
    await continueButton.click();

    let detailSteps = 0;
    const finishHeading = wizard.getByText("You're all set", { exact: true });
    while ((await finishHeading.count()) === 0) {
      assert(detailSteps < 6, "Onboarding did not reach its Finish step");
      const stepLabel = wizard.getByText(/^Step \d+ of \d+$/);
      const label = await stepLabel.innerText();
      const [, currentStep, totalSteps] = label.match(
        /^Step (\d+) of (\d+)$/,
      ) ?? [];
      assert(currentStep && totalSteps, `Unexpected step indicator: ${label}`);
      assert(
        Number(currentStep) < Number(totalSteps),
        `Expected a detail step before Finish, got ${label}`,
      );

      const nextButton = wizard
        .getByRole("button", { name: /^(Skip for now|Continue|Later)$/ })
        .last();
      await assertButtonInsideViewport(nextButton, 600);
      record("detail-step", `Advancing from ${label}`);
      await nextButton.click();
      detailSteps += 1;
      await wizard
        .getByText(`Step ${Number(currentStep) + 1} of ${totalSteps}`, {
          exact: true,
        })
        .waitFor();
    }
    assert.equal(detailSteps, 1, "Expected the combined location detail step");

    const finishButton = wizard.getByRole("button", {
      name: "Finish",
      exact: true,
    });
    await assertButtonInsideViewport(finishButton, 600);
    await page.screenshot({
      path: `${artifacts}/finish-900x600.png`,
    });

    const releaseNotes = await page.evaluate(() =>
      window.api.invoke("updates:getCurrentReleaseNotes"),
    );
    const whatsNewButton = wizard.getByRole("button", {
      name: "What's in this version",
      exact: true,
    });
    if (releaseNotes?.notes?.sections?.length > 0) {
      await whatsNewButton.waitFor();
      await whatsNewButton.click();
      const whatsNewDialog = page.getByRole("dialog", {
        name: /What's new in/,
      });
      await whatsNewDialog.waitFor();
      await whatsNewDialog
        .getByRole("button", { name: "Got it", exact: true })
        .click();
      await whatsNewDialog.waitFor({ state: "hidden" });
      record(
        "whats-new",
        `Opened and closed the bundled release notes for ${releaseNotes.version}`,
      );
    } else {
      await page.waitForTimeout(500);
      assert.equal(
        await whatsNewButton.count(),
        0,
        "What's in this version should be absent without bundled notes",
      );
      record("whats-new", "No bundled release notes are available for this version");
    }

    await finishButton.click();
    await wizard.waitFor({ state: "hidden" });
    const completedState = await observeOnboardingState(page);
    assert.equal(
      completedState.required,
      false,
      "The persisted completion marker should make onboarding unnecessary",
    );
    for (const key of [
      "sports_enabled",
      "reddit_digest_enabled",
      "youtube_enabled",
      "saved_posts_enabled",
    ]) {
      assert.equal(await observeSetting(page, key), "false", `${key} should be false`);
    }
    await page.getByRole("link", { name: "Sports", exact: true }).waitFor({
      state: "detached",
    });
    record("completion", "Completion marker, disabled flags, and hidden Sports link verified");

    await page.reload();
    await page.getByRole("link", { name: "Settings", exact: true }).waitFor();
    assert.equal((await observeOnboardingState(page)).required, false);
    assert.equal(
      await page.getByRole("dialog", { name: "Welcome to Personal News" }).count(),
      0,
      "Wizard reappeared after reload",
    );
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Features", exact: true }).click();

    const expectedSwitches = [
      ["YouTube", false],
      ["Reddit Digest", false],
      ["Saved Posts", false],
      ["Sports", false],
      ["Weather", true],
      ["Astronomy", true],
    ];
    for (const [feature, expectedEnabled] of expectedSwitches) {
      const featureSwitch = page.getByRole("switch", {
        name: `Enable ${feature}`,
      });
      await featureSwitch.waitFor();
      assert.equal(
        await featureSwitch.getAttribute("aria-checked"),
        String(expectedEnabled),
        `Unexpected Features switch state for ${feature}`,
      );
    }
    record("features", "All six Features switches match the persisted onboarding choices");
  },
});
console.log(`Onboarding opt-in harness passed; artifacts: ${optInResult.artifacts}`);

const defaultOffResult = await runElectronHarness({
  name: "onboarding-default-off",
  async scenario({ page, record }) {
    await page.getByRole("link", { name: "Settings", exact: true }).waitFor();
    assert.equal((await observeOnboardingState(page)).required, false);
    await page.waitForTimeout(500);
    assert.equal(
      await page.getByRole("dialog", { name: "Welcome to Personal News" }).count(),
      0,
      "Wizard appeared without onboarding opt-in",
    );
    record("default-off", "No wizard appeared and onboarding is not required");
  },
});
console.log(
  `Onboarding default-off harness passed; artifacts: ${defaultOffResult.artifacts}`,
);
