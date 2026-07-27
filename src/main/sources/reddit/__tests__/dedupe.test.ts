import { describe, expect, it } from "vitest";
import { normalizeUrlForDedupe } from "../dedupe";

describe("normalizeUrlForDedupe", () => {
  it("normalizes scheme, host, port, fragment, and trailing slash", () => {
    expect(normalizeUrlForDedupe("https://Example.com:443/path/?q=1#fragment")).toBe(
      "https://example.com/path/?q=1",
    );
  });

  it("removes default ports and trailing slash from root paths", () => {
    expect(normalizeUrlForDedupe("http://example.com:80/")).toBe("http://example.com");
  });

  it("returns null for invalid URLs", () => {
    expect(normalizeUrlForDedupe("not a url")).toBeNull();
  });
});
