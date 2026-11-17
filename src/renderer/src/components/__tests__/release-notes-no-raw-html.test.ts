import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("keeps release notes rendering free of raw HTML sinks", () => {
  const files = [
    "src/renderer/src/components/ReleaseNotesView.tsx",
    "src/renderer/src/lib/release-notes.ts",
    "src/renderer/src/components/WhatsNewDialog.tsx",
    "src/main/updates/release-notes.ts",
    "src/main/updates/bundled-notes.ts",
  ];
  for (const file of files) {
    expect(readFileSync(join(process.cwd(), file), "utf8"), file).not.toMatch(
      /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML/,
    );
  }
});
