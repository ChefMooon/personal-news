// CANONICAL corpus runner helpers for release-notes-md-v1. Copy unchanged with the parser.
// Framework-neutral: each project's test file loads cases.json and calls runCase() inside its own it()/test().

import { parseReleaseNotes, toPlainText } from "./release-notes-markdown.mjs";

export function expandCaseInput(testCase) {
  if (typeof testCase.input === "string") return testCase.input;
  return testCase.inputParts
    .map((part) => (typeof part === "string" ? part : part.repeat.repeat(part.times)))
    .join("");
}

/** Returns an array of problem strings; empty means the case passed. */
export function runCase(testCase) {
  const problems = [];
  const input = expandCaseInput(testCase);
  const result = parseReleaseNotes(input);

  if (result.valid !== testCase.valid) {
    problems.push(`${testCase.id}: expected valid=${testCase.valid}, got ${result.valid} (${JSON.stringify(result.violations)})`);
    return problems;
  }
  if (testCase.valid) {
    if (testCase.plain !== undefined) {
      const plain = toPlainText(result.notes);
      if (plain !== testCase.plain) {
        problems.push(`${testCase.id}: plain text mismatch.\n  expected: ${JSON.stringify(testCase.plain)}\n  actual:   ${JSON.stringify(plain)}`);
      }
    }
    if (testCase.notes !== undefined && JSON.stringify(result.notes) !== JSON.stringify(testCase.notes)) {
      problems.push(`${testCase.id}: tree mismatch.\n  expected: ${JSON.stringify(testCase.notes)}\n  actual:   ${JSON.stringify(result.notes)}`);
    }
  } else {
    for (const expected of testCase.violations ?? []) {
      const found = result.violations.some(
        (violation) => violation.line === expected.line && violation.message.includes(expected.contains),
      );
      if (!found) {
        problems.push(`${testCase.id}: missing violation line ${expected.line} containing "${expected.contains}"; got ${JSON.stringify(result.violations)}`);
      }
    }
  }
  return problems;
}
