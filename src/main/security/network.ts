export interface BoundedFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  validateRedirect?: (from: URL, to: URL) => boolean;
}

/** Reject non-web schemes and credential-bearing URLs before making a request. */
export function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("Only credential-free HTTP(S) URLs are supported.");
  }
  return url;
}

/** Fetch with a deadline, bounded redirects and validation at each redirect hop. */
export async function fetchBounded(
  value: string,
  options: BoundedFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 10_000,
    maxBytes = 2_000_000,
    maxRedirects = 5,
    validateRedirect,
    ...requestInit
  } = options;
  let current = parseHttpUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = requestInit.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) {
    clearTimeout(timeout);
    throw externalSignal.reason ?? new DOMException("Aborted", "AbortError");
  }
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  try {
    for (let hop = 0; ; hop += 1) {
      const response = await fetch(current, {
        ...requestInit,
        signal: controller.signal,
        redirect: "manual",
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return response;
      }
      const location = response.headers.get("location");
      if (!location || hop >= maxRedirects) {
        await response.body?.cancel();
        throw new Error("Request redirected too many times or omitted its target.");
      }
      let next: URL;
      try {
        next = parseHttpUrl(new URL(location, current).toString());
      } catch (error) {
        await response.body?.cancel();
        throw error;
      }
      if (validateRedirect && !validateRedirect(current, next)) {
        await response.body?.cancel();
        throw new Error("Request redirect target is not trusted.");
      }
      await response.body?.cancel();
      current = next;
    }
  } catch (error) {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

/** Read a response stream without allowing an untrusted server to exhaust memory. */
export async function readBoundedText(
  response: Response,
  maxBytes = 2_000_000,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const declaredSize = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Response exceeds the ${maxBytes}-byte limit.`);
  }
  if (!response.body) {
    const text = await raceWithAbort(response.text(), signal);
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error(`Response exceeds the ${maxBytes}-byte limit.`);
    }
    return text;
  }
  const reader = response.body.getReader();
  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`Response exceeds the ${maxBytes}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export async function fetchBoundedText(
  url: string,
  options: BoundedFetchOptions = {},
): Promise<{ response: Response; text: string }> {
  const maxBytes = options.maxBytes ?? 2_000_000;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal;
  const relayAbort = () => controller.abort();
  if (signal?.aborted) controller.abort(signal.reason);
  signal?.addEventListener("abort", relayAbort, { once: true });
  try {
    const response = await fetchBounded(url, { ...options, signal: controller.signal, timeoutMs: timeoutMs + 100 });
    const text = await readBoundedText(response, maxBytes, controller.signal);
    return { response, text };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}
