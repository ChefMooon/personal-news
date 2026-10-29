import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchBoundedText = vi.fn();
vi.mock("../../security/network", () => ({ fetchBoundedText }));

describe("Bluesky AppView lookup", () => {
  beforeEach(() => { fetchBoundedText.mockReset(); vi.resetModules(); });
  afterEach(() => vi.useRealTimers());

  it("coalesces concurrent lookups and uses only the fixed public AppView without redirects", async () => {
    fetchBoundedText
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        text: JSON.stringify({ did: "did:plc:abcdefghijklmnopqrstuvwx" }),
      })
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        text: JSON.stringify({ thread: { post: { record: { text: "A public post" } } } }),
      });
    const { fetchBlueskyPostText } = await import("../bluesky");
    const post = { handle: "alice.example", rkey: "3lxyzabc123" };
    const first = fetchBlueskyPostText(post);
    const concurrent = fetchBlueskyPostText(post);
    await expect(Promise.all([first, concurrent])).resolves.toEqual(["A public post", "A public post"]);
    expect(fetchBoundedText).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchBoundedText.mock.calls) {
      expect(url).toMatch(/^https:\/\/public\.api\.bsky\.app\/xrpc\//);
      expect(options).toMatchObject({ timeoutMs: 5_000, maxBytes: 128_000, maxRedirects: 0 });
    }
  });

  it("sequences a handle resolution and its post fetch at least one second apart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    fetchBoundedText
      .mockResolvedValueOnce({ response: new Response(null, { status: 200 }), text: JSON.stringify({ did: "did:plc:abcdefghijklmnopqrstuvwx" }) })
      .mockResolvedValueOnce({ response: new Response(null, { status: 200 }), text: JSON.stringify({ thread: { post: { record: { text: "text" } } } }) });
    const { fetchBlueskyPostText } = await import("../bluesky");
    const promise = fetchBlueskyPostText({ handle: "alice.example", rkey: "3lxyzabc123" });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchBoundedText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchBoundedText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe("text");
    expect(fetchBoundedText).toHaveBeenCalledTimes(2);
  });

  it("honors HTTP-date Retry-After globally and does not cache the rate-limited lookup", async () => {
    vi.useFakeTimers();
    const started = new Date("2030-01-01T00:00:00.000Z");
    vi.setSystemTime(started);
    fetchBoundedText
      .mockResolvedValueOnce({ response: new Response(null, { status: 429, headers: { "retry-after": new Date(started.getTime() + 120_000).toUTCString() } }), text: "" })
      .mockResolvedValueOnce({ response: new Response(null, { status: 200 }), text: JSON.stringify({ thread: { post: { record: { text: "after cooldown" } } } }) });
    const { fetchBlueskyPostText } = await import("../bluesky");
    const post = { handle: "did:plc:abcdefghijklmnopqrstuvwx", rkey: "3lxyzabc123" };
    await expect(fetchBlueskyPostText(post)).resolves.toBeNull();
    await expect(fetchBlueskyPostText(post)).resolves.toBeNull();
    expect(fetchBoundedText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(fetchBlueskyPostText(post)).resolves.toBe("after cooldown");
    expect(fetchBoundedText).toHaveBeenCalledTimes(2);
  });

  it("skips a distinct lookup while busy instead of building an unbounded waiter queue", async () => {
    let releaseFirst!: (value: { response: Response; text: string }) => void;
    fetchBoundedText.mockReturnValueOnce(new Promise((resolve) => { releaseFirst = resolve; }));
    const { fetchBlueskyPostText } = await import("../bluesky");
    const first = fetchBlueskyPostText({ handle: "did:plc:abcdefghijklmnopqrstuvwx", rkey: "3lxyzabc123" });
    await vi.waitFor(() => expect(fetchBoundedText).toHaveBeenCalledTimes(1));
    await expect(fetchBlueskyPostText({ handle: "did:plc:zyxwvutsrqponmlkjihgfedcba", rkey: "3lxyzabc123" })).resolves.toBeNull();
    expect(fetchBoundedText).toHaveBeenCalledTimes(1);
    releaseFirst({ response: new Response(null, { status: 200 }), text: JSON.stringify({ thread: { post: { record: { text: "first" } } } }) });
    await expect(first).resolves.toBe("first");
  });

  it("stops at the rolling request cap without caching a capacity skip", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    fetchBoundedText.mockImplementation(async () => ({ response: new Response(null, { status: 404 }), text: "" }));
    const { fetchBlueskyPostText } = await import("../bluesky");
    for (let index = 0; index < 28; index += 1) {
      const request = fetchBlueskyPostText({ handle: "did:plc:abcdefghijklmnopqrstuvwx", rkey: `key_${index}` });
      if (index > 0) await vi.advanceTimersByTimeAsync(1_000);
      await expect(request).resolves.toBeNull();
    }
    const skippedPost = { handle: "did:plc:abcdefghijklmnopqrstuvwx", rkey: "after-cap" };
    await expect(fetchBlueskyPostText(skippedPost)).resolves.toBeNull();
    expect(fetchBoundedText).toHaveBeenCalledTimes(28);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(fetchBlueskyPostText(skippedPost)).resolves.toBeNull();
    expect(fetchBoundedText).toHaveBeenCalledTimes(29);
  });
});
