import { describe, expect, it, vi } from "vitest";
import type { SavedPostInput } from "../../../shared/ipc-types";
import { fetchMetadataForUrl, normalizeManualSavedPostInput } from "../link-sources";
import { fetchRedditPost } from "../reddit/metadata";

vi.mock("../reddit/metadata", () => ({
  fetchRedditPost: vi.fn(),
}));

const mockFetchRedditPost = vi.mocked(fetchRedditPost);

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

  it("uses the Bluesky handle for a local fallback title and tag", async () => {
    const metadata = await fetchMetadataForUrl(
      "https://bsky.app/profile/User.Example/post/3lxyzabc123",
      null,
    );

    expect(metadata.title).toBe("Post by @User.Example");
    expect(metadata.author).toBe("User.Example");
    expect(metadata.tags).toEqual(["user.example"]);
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
