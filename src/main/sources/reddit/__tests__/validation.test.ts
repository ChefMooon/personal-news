import { describe, expect, it } from "vitest";
import { parseRedditPostUrl } from "../validation";
import { createRedditLinkOnlyPost, fetchMetadataForUrl } from "../../link-sources";
import { vi } from "vitest";

describe("link-first Reddit post parsing", () => {
  it("accepts known Reddit hosts and extracts post ids", () => {
    expect(parseRedditPostUrl("https://old.reddit.com/r/Tools/comments/abc123/title?x=1")).toEqual({
      postId: "abc123", subreddit: "Tools", canonicalUrl: "https://www.reddit.com/r/Tools/comments/abc123/title/",
    });
  });

  it("accepts comment-specific permalink suffixes and keeps the submitted URL", () => {
    const url = "https://www.reddit.com/r/Tools/comments/abc123/a_thread/comment987/?context=3";
    expect(parseRedditPostUrl(url)).toMatchObject({
      postId: "abc123", subreddit: "Tools",
    });
    expect(createRedditLinkOnlyPost(url, null).url).toBe(url);
  });

  it("uses a stable URL hash for short shares without resolving them", () => {
    const url = "https://www.reddit.com/r/Tools/s/AbC123?share_id=one";
    const first = createRedditLinkOnlyPost(url, "note");
    const second = createRedditLinkOnlyPost("https://old.reddit.com/r/Tools/s/AbC123#share", null);
    expect(first.postId).toMatch(/^reddit_link_[a-f0-9]{64}$/);
    expect(first.postId).toBe(second.postId);
    expect(first.url).toBe(url);
  });

  it("does not make a Reddit metadata network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchMetadataForUrl("https://www.reddit.com/r/Tools/comments/abc123/title", null)).resolves.toMatchObject({
      postId: "abc123", metadataStatus: "link_only",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects deceptive hosts and malformed post paths", () => {
    expect(parseRedditPostUrl("https://reddit.com.attacker.test/r/x/comments/id/title")).toBeNull();
    expect(parseRedditPostUrl("https://www.reddit.com/r/x/comments/id/title/commentid/extra")).toBeNull();
  });
});
