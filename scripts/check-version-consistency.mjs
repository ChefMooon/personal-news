#!/usr/bin/env node
// CANONICAL: check (or with --write, set) the release version in every file listed in release.config.json versionFiles.
// Usage: node scripts/check-version-consistency.mjs --version 1.2.3 [--write] [--config release.config.json]
// Exit 0 when every file matches (after writing, when --write), 1 on mismatch or unreadable file, 2 on bad usage.
// versionFiles entries are file paths (kind chosen by file name: package.json, package-lock.json, tauri.conf.json,
// Cargo.toml, Cargo.lock) or { "path": "...", "pattern": "regex with one capture group for the version" }.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, normalizeTag, parseArgs } from "./release-lib.mjs";

const q = '"';

function cargoName(text) {
  const match = /\[package\][\s\S]*?\nname\s*=\s*"([^"]+)"/.exec(text);
  return match ? match[1] : null;
}

function locators(entry, { root, cargoPackage }) {
  const file = typeof entry === "string" ? entry : entry.path;
  const base = path.basename(file);
  if (typeof entry === "object" && entry.pattern) {
    const re = new RegExp(entry.pattern, "g");
    return { file, read: (t) => [...t.matchAll(re)].map((m) => m[1]), write: (t, v) => t.replace(re, (m, g) => m.replace(g, v)) };
  }
  if (base === "package.json" || base === "tauri.conf.json") {
    const re = new RegExp(`(${q}version${q}\\s*:\\s*${q})[^${q}]*(${q})`);
    return { file, read: (t) => [JSON.parse(t.replace(/^﻿/, "")).version], write: (t, v) => t.replace(re, `$1${v}$2`) };
  }
  if (base === "package-lock.json") {
    const top = new RegExp(`(${q}version${q}\\s*:\\s*${q})[^${q}]*(${q})`);
    const rootPkg = new RegExp(`(${q}packages${q}\\s*:\\s*\\{\\s*${q}${q}\\s*:\\s*\\{[^}]*?${q}version${q}\\s*:\\s*${q})[^${q}]*(${q})`);
    return {
      file,
      read: (t) => {
        const j = JSON.parse(t.replace(/^﻿/, ""));
        return [j.version, j.packages?.[""]?.version].filter((v) => v !== undefined);
      },
      write: (t, v) => t.replace(top, `$1${v}$2`).replace(rootPkg, `$1${v}$2`),
    };
  }
  if (base === "Cargo.toml") {
    const re = /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]*(")/;
    return { file, read: (t) => [(re.exec(t) ?? [])[0]?.match(/version\s*=\s*"([^"]*)"/)?.[1]].filter(Boolean), write: (t, v) => t.replace(re, `$1${v}$2`) };
  }
  if (base === "Cargo.lock") {
    let name = cargoPackage;
    if (!name) {
      const toml = path.resolve(root, path.dirname(file), "Cargo.toml");
      if (fs.existsSync(toml)) name = cargoName(fs.readFileSync(toml, "utf8"));
    }
    if (!name) throw new Error(`${file}: set "cargoPackage" in release.config.json (cannot find the crate name).`);
    const re = new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\r?\\nversion = ")[^"]*(")`);
    return { file, read: (t) => [(re.exec(t) ?? [])[0]?.match(/version = "([^"]*)"/)?.[1]].filter(Boolean), write: (t, v) => t.replace(re, `$1${v}$2`) };
  }
  throw new Error(`${file}: unknown version file kind; use { "path", "pattern" }.`);
}

export function checkVersions({ root = process.cwd(), entries, version, write = false, cargoPackage }) {
  const results = [];
  for (const entry of entries) {
    let loc;
    try {
      loc = locators(entry, { root, cargoPackage });
    } catch (error) {
      results.push({ file: typeof entry === "string" ? entry : entry.path, ok: false, found: [], error: error.message });
      continue;
    }
    const full = path.resolve(root, loc.file);
    let text;
    try {
      text = fs.readFileSync(full, "utf8");
    } catch {
      results.push({ file: loc.file, ok: false, found: [], error: "file not found" });
      continue;
    }
    let found = loc.read(text);
    if (write && (found.length === 0 || found.some((v) => v !== version))) {
      const updated = loc.write(text, version);
      if (updated !== text) fs.writeFileSync(full, updated, "utf8");
      found = loc.read(updated);
    }
    const ok = found.length > 0 && found.every((v) => v === version);
    results.push({ file: loc.file, ok, found, error: found.length === 0 ? "no version found" : undefined });
  }
  return results;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { flags: ["write"], values: ["version", "config"] });
    if (!args.version) throw new Error("--version is required.");
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const config = loadConfig(process.cwd(), args.config ?? "release.config.json");
  const { version } = normalizeTag(args.version);
  const results = checkVersions({ entries: config.versionFiles, version, write: Boolean(args.write), cargoPackage: config.cargoPackage });
  let bad = 0;
  for (const r of results) {
    if (r.ok) console.log(`ok       ${r.file} = ${version}`);
    else {
      bad += 1;
      console.error(`MISMATCH ${r.file}: ${r.error ?? `found ${r.found.join(", ")}, expected ${version}`}`);
    }
  }
  process.exit(bad ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
