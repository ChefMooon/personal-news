// CANONICAL shared helpers for the release scripts. Copy unchanged into each project (the audit compares hashes).
// Node 20+, no dependencies. Project-specific values live only in release.config.json.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function normalizeTag(input) {
  const value = String(input ?? "").trim();
  const match = SEMVER.exec(value);
  if (!match) {
    throw new Error(`"${value}" is not a valid release version; expected X.Y.Z or X.Y.Z-beta.N (optional leading v).`);
  }
  const version = value.replace(/^v/, "");
  return { tag: `v${version}`, version, prerelease: Boolean(match[4]) };
}

export function compareVersions(a, b) {
  const parse = (v) => {
    const m = SEMVER.exec(v);
    if (!m) throw new Error(`Invalid version: ${v}`);
    return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].slice(1).split(".") : [] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i += 1) if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i] ? -1 : 1;
  if (!x.pre.length && !y.pre.length) return 0;
  if (!x.pre.length) return 1;
  if (!y.pre.length) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i += 1) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) {
      if (Number(p) !== Number(q)) return Number(p) < Number(q) ? -1 : 1;
    } else if (pn !== qn) {
      return pn ? -1 : 1;
    } else if (p !== q) {
      return p < q ? -1 : 1;
    }
  }
  return 0;
}

export function loadConfig(root = process.cwd(), file = "release.config.json") {
  const full = path.resolve(root, file);
  let raw;
  try {
    raw = fs.readFileSync(full, "utf8");
  } catch {
    throw new Error(`Cannot read ${file} at ${full}.`);
  }
  let config;
  try {
    config = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`);
  }
  const problems = validateConfig(config);
  if (problems.length) throw new Error(`${file} is invalid:\n- ${problems.join("\n- ")}`);
  return {
    releaseBranch: "main",
    releaseTitle: "{tag}",
    verify: [],
    ...config,
    changelog: { file: "CHANGELOG.md", style: "user", format: "release-notes-md-v1", ...config.changelog },
  };
}

export function validateConfig(config) {
  const problems = [];
  if (!config || typeof config !== "object") return ["config must be an object"];
  if (config.schema !== 1) problems.push("schema must be 1");
  if (!["electron", "tauri"].includes(config.stack)) problems.push('stack must be "electron" or "tauri"');
  if (!config.productName || typeof config.productName !== "string") problems.push("productName is required");
  if (!Array.isArray(config.versionFiles) || config.versionFiles.length === 0) problems.push("versionFiles must be a non-empty array");
  const formats = ["release-notes-md-v1", "release-notes-md-v0"];
  if (config.changelog?.format && !formats.includes(config.changelog.format)) problems.push(`changelog.format must be one of ${formats.join(", ")}`);
  const platforms = config.platforms;
  if (!platforms || typeof platforms !== "object") {
    problems.push("platforms is required");
  } else {
    let enabled = 0;
    for (const [name, platform] of Object.entries(platforms)) {
      if (!["windows", "macos", "linux"].includes(name)) problems.push(`unknown platform "${name}"`);
      if (typeof platform.enabled !== "boolean") problems.push(`platforms.${name}.enabled must be true or false`);
      if (!["ci", "local"].includes(platform.build)) problems.push(`platforms.${name}.build must be "ci" or "local"`);
      if (platform.build === "local" && !platform.script) problems.push(`platforms.${name}.script is required when build is "local"`);
      if (!Array.isArray(platform.assets) || platform.assets.length === 0) problems.push(`platforms.${name}.assets must be a non-empty array`);
      if (platform.enabled) enabled += 1;
    }
    if (enabled === 0) problems.push("at least one platform must be enabled");
  }
  return problems;
}

export function enabledPlatforms(config) {
  return Object.entries(config.platforms)
    .filter(([, platform]) => platform.enabled)
    .map(([name, platform]) => ({ name, ...platform }));
}

export function expandPlaceholders(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

export function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

export function expectedAssetPatterns(config, { version, builds = "all" }) {
  const result = [];
  for (const platform of enabledPlatforms(config)) {
    if (builds !== "all" && platform.build !== builds) continue;
    for (const pattern of platform.assets) {
      result.push({ platform: platform.name, pattern: expandPlaceholders(pattern, { productName: config.productName, version }) });
    }
  }
  return result;
}

export function releaseTitle(config, { tag, version }) {
  return expandPlaceholders(config.releaseTitle, { tag, version, productName: config.productName });
}

export function slugFromRemote(url) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  if (!match) throw new Error(`Remote "${url}" is not a recognizable GitHub repository URL.`);
  return `${match[1]}/${match[2]}`;
}

export function runCommand(command, args, { input, cwd } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", input, cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.error) throw new Error(`${command} could not run: ${result.error.message}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function gh(args, options) {
  return runCommand("gh", args, { ...options });
}

export function ghJson(args, options) {
  const result = gh(args, options);
  if (result.status !== 0) throw new Error(`gh ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`gh ${args.join(" ")} did not return JSON.`);
  }
}

/** Paginated list through gh api (`--paginate --slurp`), flattened into one array. */
export function ghPaginate(endpoint) {
  const pages = ghJson(["api", "--paginate", "--slurp", endpoint]);
  return pages.flat();
}

export function parseArgs(argv, { flags = [], values = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (flags.includes(name)) out[name] = true;
    else if (values.includes(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
      out[name] = value;
      i += 1;
    } else throw new Error(`Unknown option --${name}.`);
  }
  return out;
}

export function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}
