import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export async function fetchGenericLinkMetadata(start: URL): Promise<{ title: string | null; description: string | null }> {
  try {
    const deadline = Date.now() + TIMEOUT_MS;
    const html = await fetchHtml(start, 0, deadline);
    return extractGenericMetadata(html);
  } catch {
    return { title: null, description: null };
  }
}

async function fetchHtml(url: URL, redirects: number, deadline: number): Promise<string> {
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname) throw new Error("Unsafe URL");
  const address = await resolvePublicAddress(url.hostname, deadline);
  const get = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (typeof options === "object" && options.all) callback(null, [{ address, family: address.includes(":") ? 6 : 4 }]);
      else callback(null, address, address.includes(":") ? 6 : 4);
    };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new Error("Request timed out"));
    const timer = setTimeout(() => req.destroy(new Error("Request timed out")), remaining);
    const req = get(url, { headers: { "User-Agent": "PersonalNews/1.0", Accept: "text/html", "Accept-Encoding": "identity" }, lookup: pinnedLookup }, (res) => {
      const status = res.statusCode ?? 0;
      if ([301,302,303,307,308].includes(status) && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        if (redirects >= MAX_REDIRECTS) return reject(new Error("Too many redirects"));
        let next: URL;
        try { next = new URL(res.headers.location, url); } catch { return reject(new Error("Invalid redirect")); }
        if (next.username || next.password) return reject(new Error("Unsafe redirect"));
        void fetchHtml(next, redirects + 1, deadline).then(resolve, reject);
        return;
      }
      const type = res.headers["content-type"] ?? "";
      if (status < 200 || status >= 300 || !/text\/html|application\/xhtml\+xml/i.test(type)) { res.resume(); clearTimeout(timer); return resolve(""); }
      let body = "";
      let bytes = 0;
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { bytes += Buffer.byteLength(chunk); if (bytes > MAX_BYTES) { req.destroy(new Error("Response too large")); return; } body += chunk; });
      res.on("end", () => { clearTimeout(timer); resolve(body); });
      res.on("error", (error) => { clearTimeout(timer); reject(error); });
    });
    req.on("error", (error) => { clearTimeout(timer); reject(error); });
    req.end();
  });
}

async function resolvePublicAddress(host: string, deadline: number): Promise<string> {
  if (/^(localhost|.*\.localhost|.*\.local)$/i.test(host)) throw new Error("Local host");
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Request timed out");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("DNS lookup timed out")), remaining); }),
  ]).finally(() => { if (timeout) clearTimeout(timeout); });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("Non-public host");
  return addresses[0].address;
}

function isPublicAddress(address: string): boolean {
  if (address.includes(":")) {
    const value = address.toLowerCase();
    return value.startsWith("2001:") || value.startsWith("2600:") || value.startsWith("2a00:") || value.startsWith("2c00:");
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = p;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)));
}

export function extractGenericMetadata(html: string): { title: string | null; description: string | null } {
  const title = first(html, [/<meta\b[^>]*\bproperty\s*=\s*["']og:title["'][^>]*\bcontent\s*=\s*["']([^"']*)/i, /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bproperty\s*=\s*["']og:title["']/i, /<title\b[^>]*>([\s\S]*?)<\/title>/i]);
  const description = first(html, [/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*["']([^"']*)/i, /<meta\b[^>]*\bproperty\s*=\s*["']og:description["'][^>]*\bcontent\s*=\s*["']([^"']*)/i, /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']description["']/i]);
  return { title: clean(title), description: clean(description) };
}

function first(html: string, patterns: RegExp[]): string | null { for (const pattern of patterns) { const match = pattern.exec(html); if (match) return match[1]; } return null; }
function clean(value: string | null): string | null {
  if (!value) return null;
  const decoded = value.replace(/<[^>]*>/g, " ").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    const named: Record<string,string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (code[0] === "#") { const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2),16) : parseInt(code.slice(1),10); return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; }
    return named[code.toLowerCase()] ?? entity;
  }).replace(/\s+/g, " ").trim();
  return decoded ? decoded.slice(0, 1000) : null;
}
