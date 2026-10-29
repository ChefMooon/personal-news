import { describe, expect, it, vi } from "vitest";
import type { SavedPostInput } from "../../../shared/ipc-types";
import {
  detectSource,
  fetchMetadataForUrl,
  normalizeManualSavedPostInput,
} from "../link-sources";
import { fetchRedditPost } from "../reddit/metadata";
import { fetchGenericLinkMetadata } from "../generic-link-metadata";

vi.mock("../reddit/metadata", () => ({
  fetchRedditPost: vi.fn(),
}));
vi.mock("../generic-link-metadata", () => ({
  fetchGenericLinkMetadata: vi.fn(),
}));
vi.mock("../x-oembed", () => ({ fetchXPostText: vi.fn().mockResolvedValue(null) }));

const mockFetchRedditPost = vi.mocked(fetchRedditPost);
const mockFetchGeneric = vi.mocked(fetchGenericLinkMetadata);

describe("link source metadata", () => {
  it("adds a lowercased subreddit tag to Reddit posts", async () => {
    const redditPost: SavedPostInput = {
      postId: "abc123",
      title: "Useful Godot thread",
      url: "https://reddit.com/r/GodotEngine/comments/abc123/useful_thread/",
      permalink: "/r/GodotEngine/comments/abc123/useful_thread/",
      subreddit: "GodotEngine",
      author: "dev",
      score: 12,
      body: null,
      source: "reddit",
      savedAt: 1_700_000_000,
      note: null,
      tags: null,
    };
    mockFetchRedditPost.mockResolvedValueOnce(redditPost);

    const metadata = await fetchMetadataForUrl(
      "https://reddit.com/r/GodotEngine/comments/abc123/useful_thread/",
      null,
    );

    expect(metadata.tags).toEqual(["godotengine"]);
  });

  it("uses the X handle for a local fallback title and tag", async () => {
    const metadata = await fetchMetadataForUrl(
      "https://x.com/SomeUser/status/1234567890",
      null,
    );

    expect(metadata.title).toBe("Post by @SomeUser");
    expect(metadata.author).toBe("SomeUser");
    expect(metadata.tags).toEqual(["someuser"]);
  });

  it("keeps an X note as the title while still tagging the handle", async () => {
    const metadata = await fetchMetadataForUrl(
      "https://twitter.com/SomeUser/status/1234567890",
      "Remember this launch thread",
    );

    expect(metadata.title).toBe("Remember this launch thread");
    expect(metadata.tags).toEqual(["someuser"]);
  });

  it.each([
    "https://mobile.twitter.com/SomeUser/status/1234567890?s=46#media",
    "https://www.x.com/SomeUser/status/1234567890/photo/1",
    "https://m.twitter.com/SomeUser/status/1234567890/video/2",
    "https://x.com/i/web/status/1234567890",
    "https://x.com/i/status/1234567890",
  ])("preserves a stable X identity for %s", async (url) => {
    const metadata = await fetchMetadataForUrl(url, "Keep this");
    expect(metadata).toMatchObject({
      postId: "x_1234567890",
      source: "x",
      note: "Keep this",
      title: "Keep this",
      url,
    });
  });

  it("provides a useful handleless post fallback", async () => {
    expect(
      await fetchMetadataForUrl("https://x.com/i/web/status/123", null),
    ).toMatchObject({
      postId: "x_123",
      title: "X post 123",
      author: null,
      tags: null,
    });
  });

  it.each([
    "https://x.com/home",
    "https://x.com/SomeUser",
    "https://x.com/search?q=test",
    "https://x.com/intent/post",
    "https://x.com/a/status/123oops",
    "https://x.com/a/status/123/unrecognized",
  ])("does not invent a post author for %s", async (url) => {
    expect(await fetchMetadataForUrl(url, null)).toMatchObject({
      source: "x",
      title: "X link",
      author: null,
      tags: null,
    });
  });

  it.each([
    "https://x.com.evil.test/a/status/123",
    "https://user@x.com/a/status/123",
    "https://x.com:8443/a/status/123",
  ])(
    "does not classify lookalikes or credentialed/custom-port URLs as X: %s",
    (url) => {
      expect(detectSource(url)).toBe("generic");
    },
  );

  it("uses the Bluesky handle for a local fallback title and tag", async () => {
    const metadata = await fetchMetadataForUrl(
      "https://bsky.app/profile/User.Example/post/3lxyzabc123",
      null,
    );

    expect(metadata.title).toBe("Post by @User.Example");
    expect(metadata.author).toBe("User.Example");
    expect(metadata.tags).toEqual(["user.example"]);
  });

  it("saves arbitrary links with metadata and a stable SHA-256 identity", async () => {
    mockFetchGeneric.mockResolvedValueOnce({
      title: "An article",
      description: "Useful summary",
    });
    const a = await fetchMetadataForUrl("https://example.com/story#top", null);
    mockFetchGeneric.mockResolvedValueOnce({
      title: "An article",
      description: "Useful summary",
    });
    const b = await fetchMetadataForUrl("https://EXAMPLE.com/story", null);
    expect(a).toMatchObject({
      title: "An article",
      body: "Useful summary",
      source: "generic",
    });
    expect(a.postId).toMatch(/^link_[a-f0-9]{64}$/);
    expect(a.postId).toBe(b.postId);
  });

  it("uses note and host fallbacks when metadata is unavailable and rejects credentialed URLs", async () => {
    mockFetchGeneric.mockResolvedValueOnce({ title: null, description: null });
    const withNote = await fetchMetadataForUrl(
      "https://example.com/a",
      "Keep this",
    );
    expect(withNote.title).toBe("Keep this");
    mockFetchGeneric.mockResolvedValueOnce({ title: null, description: null });
    const fallback = await fetchMetadataForUrl("https://example.com/a", null);
    expect(fallback.title).toBe("example.com");
    await expect(
      fetchMetadataForUrl("https://user:pass@example.com", null),
    ).rejects.toThrow();
  });

  it("normalizes manual saved-post input by trimming whitespace and preserving tags", () => {
    const normalized = normalizeManualSavedPostInput({
      url: " https://example.com ",
      note: "  Keep this  ",
      tags: [" alpha ", "beta", "", "alpha"],
    });

    expect(normalized).toEqual({
      url: "https://example.com",
      note: "Keep this",
      tags: ["alpha", "beta"],
    });
  });
});
