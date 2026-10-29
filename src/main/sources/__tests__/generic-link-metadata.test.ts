import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { extractGenericMetadata, fetchGenericLinkMetadata } from "../generic-link-metadata";

function response(statusCode: number, headers: Record<string, string> = {}): EventEmitter & { statusCode: number; headers: Record<string, string>; resume: () => void } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; resume: () => void };
  res.statusCode = statusCode;
  res.headers = headers;
  res.resume = vi.fn();
  return res;
}

describe("generic link metadata", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("extracts and decodes title and description with a document-title fallback", () => {
    expect(extractGenericMetadata('<meta content="A &amp; B" property="og:title"><meta name="description" content="A&#32;summary">'))
      .toEqual({ title: "A & B", description: "A summary" });
    expect(extractGenericMetadata("<title>Article &amp; notes</title>")).toEqual({ title: "Article & notes", description: null });
  });

  it("refuses literal private addresses without making a request", async () => {
    for (const host of ["127.0.0.1", "10.0.0.8", "192.168.1.4", "169.254.169.254"]) {
      expect(await fetchGenericLinkMetadata(new URL(`http://${host}/`))).toEqual({ title: null, description: null });
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("revalidates redirects and does not request a private redirect target", async () => {
    mocks.lookup.mockImplementation((host: string) => Promise.resolve([
      { address: host === "127.0.0.1" ? "127.0.0.1" : "93.184.216.34", family: 4 },
    ]));
    mocks.request.mockImplementation((_url: URL, _options: unknown, callback: (res: ReturnType<typeof response>) => void) => {
      callback(response(302, { location: "http://127.0.0.1/admin" }));
      return Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    });
    expect(await fetchGenericLinkMetadata(new URL("http://example.com/"))).toEqual({ title: null, description: null });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("returns a fallback result for DNS and socket failures", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("DNS failure"));
    expect(await fetchGenericLinkMetadata(new URL("https://unresolvable.example/"))).toEqual({ title: null, description: null });

    mocks.lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    mocks.request.mockImplementation(() => {
      const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
      queueMicrotask(() => req.emit("error", new Error("socket failure")));
      return req;
    });
    expect(await fetchGenericLinkMetadata(new URL("https://example.com/"))).toEqual({ title: null, description: null });
  });

  it("bounds DNS resolution by the same overall deadline", async () => {
    vi.useFakeTimers();
    mocks.lookup.mockReturnValue(new Promise(() => undefined));
    const result = fetchGenericLinkMetadata(new URL("https://slow-dns.example/"));
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual({ title: null, description: null });
    vi.useRealTimers();
  });
});
