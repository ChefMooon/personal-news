import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBounded, fetchBoundedText, parseHttpUrl, readBoundedText } from "../network";

afterEach(() => vi.unstubAllGlobals());

describe("network response guards", () => {
  it("accepts configured HTTP integrations, including local ntfy servers", () => {
    expect(parseHttpUrl("http://localhost:8080").hostname).toBe("localhost");
  });

  it("rejects non-HTTP and credential-bearing URLs", () => {
    expect(() => parseHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => parseHttpUrl("https://user:pass@example.com/")).toThrow();
  });

  it("checks redirect targets and bounds redirect hops", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBounded("https://example.com", {
      validateRedirect: (_from, to) => to.hostname === "example.com",
    })).rejects.toThrow("not trusted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized response streams", async () => {
    const response = new Response(new Uint8Array(9));
    await expect(readBoundedText(response, 8)).rejects.toThrow("8-byte limit");
  });

  it("does not start a request when the caller signal was already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchBoundedText("https://example.com", { signal: controller.signal }))
      .rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a stalled response body when its deadline expires", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() { canceled = true; },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchBoundedText("https://example.com", { timeoutMs: 15 }))
      .rejects.toThrow();
    expect(canceled).toBe(true);
  });
});
