import { describe, expect, it } from "vitest";
import { shouldCloseEditorOnEscape } from "./useEditorEscape";

describe("shouldCloseEditorOnEscape", () => {
  it("allows an unhandled Escape to close the editor", () => {
    expect(
      shouldCloseEditorOnEscape({ key: "Escape", defaultPrevented: false }),
    ).toBe(true);
  });

  it("does not close when Escape was already handled", () => {
    expect(
      shouldCloseEditorOnEscape({ key: "Escape", defaultPrevented: true }),
    ).toBe(false);
  });

  it("does not close for other keys", () => {
    expect(
      shouldCloseEditorOnEscape({ key: "Enter", defaultPrevented: false }),
    ).toBe(false);
  });
});
