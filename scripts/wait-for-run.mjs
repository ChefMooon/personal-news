#!/usr/bin/env node
// CANONICAL: find the workflow run for a release tag and wait for it, in one non-interactive process.
// Usage: node scripts/wait-for-run.mjs --repo OWNER/REPO --workflow release.yml --sha FULL_SHA --tag v1.2.3
//          [--event push|workflow_dispatch] [--since ISO_UTC] [--timeout 1800] [--interval 30]
// Prints exactly one JSON object on stdout. Exit 0 only for completed + success on the matching run.
// Selects by head SHA, tag ref, event and creation time, never by recency alone. Ambiguity is an error.

import { pathToFileURL } from "node:url";
import { ghJson, parseArgs } from "./release-lib.mjs";

export function selectRuns(runs, { sha, tag, event, since, workflow }) {
  const sinceMs = since ? Date.parse(since) : 0;
  return runs.filter(
    (run) =>
      run.head_sha === sha &&
      run.head_branch === tag &&
      (!event || run.event === event) &&
      Date.parse(run.created_at) >= sinceMs &&
      (!workflow || (run.path ?? "").endsWith(`/${workflow}`) || run.name === workflow),
  );
}

export function summarize(run, extra = {}) {
  return { runId: run?.id ?? null, url: run?.html_url ?? null, sha: run?.head_sha ?? null, ref: run?.head_branch ?? null, event: run?.event ?? null, status: run?.status ?? null, conclusion: run?.conclusion ?? null, timedOut: false, error: null, ...extra };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { values: ["repo", "workflow", "sha", "tag", "event", "since", "timeout", "interval"] });
    for (const key of ["repo", "sha", "tag"]) if (!args[key]) throw new Error(`--${key} is required.`);
    if (!/^[0-9a-f]{40}$/i.test(args.sha)) throw new Error("--sha must be a full 40-character SHA.");
  } catch (error) {
    console.log(JSON.stringify(summarize(null, { error: error.message })));
    process.exit(2);
  }
  const timeoutMs = Number(args.timeout ?? 1800) * 1000;
  const intervalMs = Number(args.interval ?? 30) * 1000;
  const deadline = Date.now() + timeoutMs;
  const criteria = { sha: args.sha.toLowerCase(), tag: args.tag, event: args.event, since: args.since, workflow: args.workflow };
  let runId = null;
  let last = null;

  while (true) {
    try {
      const endpoint = runId ? `repos/${args.repo}/actions/runs/${runId}` : `repos/${args.repo}/actions/runs?per_page=50&head_sha=${criteria.sha}`;
      const data = ghJson(["api", endpoint], { env: undefined });
      if (runId) last = data;
      else {
        const matches = selectRuns(data.workflow_runs ?? [], criteria);
        if (matches.length > 1) {
          console.log(JSON.stringify(summarize(null, { error: `ambiguous: ${matches.length} runs match (${matches.map((r) => r.id).join(", ")})` })));
          process.exit(1);
        }
        if (matches.length === 1) {
          last = matches[0];
          runId = last.id;
        }
      }
    } catch (error) {
      console.log(JSON.stringify(summarize(last, { error: error.message })));
      process.exit(1);
    }
    if (last?.status === "completed") {
      console.log(JSON.stringify(summarize(last)));
      process.exit(last.conclusion === "success" ? 0 : 1);
    }
    if (Date.now() + intervalMs > deadline) {
      console.log(JSON.stringify(summarize(last, { timedOut: true, error: runId ? "timed out waiting for the run to complete" : "timed out waiting for a matching run to appear" })));
      process.exit(1);
    }
    await sleep(intervalMs);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
