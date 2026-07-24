export function processNtfyMessage(msg) {
  const trimmed = msg.trim();

  // Some ntfy share-sheet clients send JSON like {"":"https://..."} or {"url":"https://..."}
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      for (const value of Object.values(json)) {
        if (typeof value === "string" && /^https?:\/\//i.test(value)) {
          return { url: value.trim(), note: null };
        }
      }
    } catch {
      // Not JSON — fall through to plain-text parsing
    }
  }

  const newlineIdx = trimmed.indexOf("\n");
  if (newlineIdx === -1) {
    return { url: trimmed, note: null };
  }
  const url = trimmed.slice(0, newlineIdx).trim();
  const rest = trimmed.slice(newlineIdx + 1).trim();
  return { url, note: rest || null };
}
