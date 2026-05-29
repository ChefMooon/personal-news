import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

function printUsage() {
  console.log(
    "Usage: node scripts/release-notes-from-changelog.mjs <version> [channel] [--dry-run]",
  );
  console.log("");
  console.log("Arguments:");
  console.log("  version   Semantic version without v prefix (example: 1.3.1)");
  console.log("  channel   release (default), alpha, or beta");
  console.log("");
  console.log("Options:");
  console.log("  --dry-run   Print extracted notes and skip gh release edit");
  console.log("  --help      Show this help message");
}

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => arg !== "--dry-run");

  const [version, channelRaw] = positional;
  const channel = channelRaw ?? "release";

  return { help: false, dryRun, version, channel };
}

function assertSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function normalizeChannel(channel) {
  const normalized = String(channel).toLowerCase();
  if (
    normalized !== "release" &&
    normalized !== "alpha" &&
    normalized !== "beta"
  ) {
    throw new Error(
      `Invalid channel: ${channel}. Expected release, alpha, or beta.`,
    );
  }
  return normalized;
}

function computeTagVersion(version, channel) {
  if (channel === "alpha") {
    return `v${version}-alpha`;
  }
  if (channel === "beta") {
    return `v${version}-beta`;
  }
  return `v${version}`;
}

function extractChangelogNotes(changelogContent, version) {
  const lines = changelogContent.split(/\r?\n/);
  const sectionHeaderPattern = new RegExp(
    `^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\] - `,
  );
  const startIndex = lines.findIndex((line) => sectionHeaderPattern.test(line));

  if (startIndex < 0) {
    throw new Error(`CHANGELOG section for ${version} not found.`);
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && /^## \[/.test(line),
  );
  const sectionLines = lines.slice(
    startIndex + 1,
    endIndex >= 0 ? endIndex : lines.length,
  );
  const notes = sectionLines.join("\n").trim();

  if (!notes) {
    throw new Error(`CHANGELOG section for ${version} is empty.`);
  }

  return notes;
}

function runGhReleaseEdit(tagVersion, notesFilePath) {
  const result = spawnSync(
    "gh",
    ["release", "edit", tagVersion, "--notes-file", notesFilePath],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `gh release edit failed for ${tagVersion} with exit code ${String(result.status)}.`,
    );
  }
}

function main() {
  const { help, dryRun, version, channel } = parseArgs(process.argv);

  if (help) {
    printUsage();
    return;
  }

  if (!version) {
    throw new Error("Missing required argument: version");
  }

  if (!assertSemver(version)) {
    throw new Error(
      `Invalid version: ${version}. Expected semantic version format x.y.z.`,
    );
  }

  const normalizedChannel = normalizeChannel(channel);
  const tagVersion = computeTagVersion(version, normalizedChannel);

  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  const changelogContent = readFileSync(changelogPath, "utf8");
  const notes = extractChangelogNotes(changelogContent, version);

  if (dryRun) {
    console.log(`Tag: ${tagVersion}`);
    console.log("---");
    console.log(notes);
    return;
  }

  const tempDir = mkdtempSync(
    path.join(tmpdir(), "personal-news-release-notes-"),
  );
  const notesFilePath = path.join(tempDir, `${tagVersion}.md`);

  try {
    writeFileSync(notesFilePath, notes, "utf8");
    runGhReleaseEdit(tagVersion, notesFilePath);
    console.log(`Applied CHANGELOG notes to ${tagVersion}.`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
