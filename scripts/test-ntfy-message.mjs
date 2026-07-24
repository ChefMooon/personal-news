#!/usr/bin/env node
import { processNtfyMessage } from "../src/main/sources/reddit/ntfy-message.mjs";

const args = process.argv.slice(2);
const input = args.join(" ").trim();

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

function isLikelyHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function formatNtfyMessageSummary(parsed, context = {}) {
  const inputPreview = context.input?.trim() ?? "";
  const url = parsed?.url?.trim() ?? "";
  const note = parsed?.note?.trim() ?? null;

  if (url && isLikelyHttpUrl(url)) {
    return [
      "✅ SUCCESS",
      `URL: ${url}`,
      `Note: ${note || "none"}`,
      ...(inputPreview ? [`Input: ${inputPreview}`] : []),
    ].join("\n");
  }

  return [
    "❌ FAIL",
    "Reason: no URL found in the message",
    ...(inputPreview ? [`Input: ${inputPreview}`] : []),
    `Parsed: ${JSON.stringify(parsed, null, 2)}`,
  ].join("\n");
}

const message = input || (await readStdin());

if (!message.trim()) {
  console.error("❌ FAIL\nReason: no input was provided\nInput: <empty>");
  process.exit(1);
}

const parsed = processNtfyMessage(message);
const summary = formatNtfyMessageSummary(parsed, { input: message });
const isSuccess = Boolean(parsed?.url && isLikelyHttpUrl(parsed.url));

if (isSuccess) {
  console.log(summary);
} else {
  console.error(summary);
}

process.exitCode = isSuccess ? 0 : 1;
