import { afterEach, describe, expect, it, vi } from "vitest";
import { clearXPostTextCacheForTests, extractOEmbedText, fetchXPostText } from "../x-oembed";

describe("X oEmbed text enrichment", () => {
  afterEach(() => { clearXPostTextCacheForTests(); vi.unstubAllGlobals(); });

  it("extracts only paragraph text and decodes entities", () => {
    expect(extractOEmbedText('<blockquote><p>Hello <a href="https://evil.test">world</a><br> &amp; welcome</p><script>steal()</script></blockquote>'))
      .toBe("Hello world & welcome");
    expect(extractOEmbedText("<div><p>Not a tweet</p></div>")).toBeNull();
  });

  it("calls the fixed HTTPS endpoint with the recognized ID and caches the extracted text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ html: '<blockquote><p>Public post</p><script>x</script></blockquote>' }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchXPostText("123")).toBe("Public post");
    expect(await fetchXPostText("123")).toBe("Public post");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request, options] = fetchMock.mock.calls[0];
    const endpoint = new URL(String(request));
    expect(endpoint.origin + endpoint.pathname).toBe("https://publish.x.com/oembed");
    expect(endpoint.searchParams.get("url")).toBe("https://x.com/i/web/status/123");
    expect(endpoint.searchParams.get("omit_script")).toBe("1");
    expect(options).toMatchObject({ redirect: "manual", method: "GET" });
  });

  it("uses the recognized handle and does not let a handleless miss block it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ html: "<blockquote><p>Post text</p></blockquote>" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchXPostText("123")).toBeNull();
    expect(await fetchXPostText("123", "malikyoloo")).toBe("Post text");
    const endpoint = new URL(String(fetchMock.mock.calls[1][0]));
    expect(endpoint.searchParams.get("url")).toBe("https://x.com/malikyoloo/status/123");
  });

  it("does not request unrecognized IDs, follows no redirects, and caches failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 302, headers: { location: "https://attacker.test/" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchXPostText("not-an-id")).toBeNull();
    expect(await fetchXPostText("55")).toBeNull();
    expect(await fetchXPostText("55")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("rejects oversized response bodies and returns local fallback", async () => {
    const huge = "x".repeat(70 * 1024);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(huge, { status: 200 })));
    expect(await fetchXPostText("77")).toBeNull();
  });
});
