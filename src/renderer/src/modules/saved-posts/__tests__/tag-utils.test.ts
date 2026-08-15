import { describe, expect, it } from "vitest";
import { getManagedTagSuggestions, normalizeTags } from "../tag-utils";

describe("normalizeTags", () => {
  it("trims values, removes empty tags, and deduplicates case-insensitively", () => {
    expect(normalizeTags([" News ", "", "news", "  Sports"])).toEqual([
      "News",
      "Sports",
    ]);
  });
});

describe("getManagedTagSuggestions", () => {
  it("filters selected tags and matches queries case-insensitively", () => {
    expect(
      getManagedTagSuggestions(
        ["News", "Sports", "AI", "newsroom"],
        ["news"],
        "NE",
      ),
    ).toEqual(["newsroom"]);
  });

  it("removes empty and duplicate suggestions and caps the result", () => {
    expect(
      getManagedTagSuggestions(["a", " A ", "b", "c", "d"], [], "", 3),
    ).toEqual(["a", "b", "c"]);
  });
});
