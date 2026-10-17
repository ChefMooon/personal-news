import { describe, expect, it } from "vitest";
import { normalizeSidebarConfig } from "../ipc-types";

describe("sidebar configuration normalization", () => {
  it("appends Astronomy to legacy orders without losing saved preferences", () => {
    const normalized = normalizeSidebarConfig({
      itemOrder: ["sports", "dashboard", "scripts"],
      hiddenItemIds: ["sports"],
      collapsed: true,
    });

    expect(normalized).toEqual({
      itemOrder: [
        "sports",
        "dashboard",
        "scripts",
        "youtube",
        "reddit-digest",
        "saved-posts",
        "astronomy",
      ],
      hiddenItemIds: ["sports"],
      collapsed: true,
    });
  });
});
