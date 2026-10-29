import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  isPathWithinDirectory,
  isPythonScriptFilePath,
  isScriptScheduleInputShape,
  isValidScriptExecutionInput,
  validateScriptUpdateFields,
} from "../policy";

describe("script input policy", () => {
  const validUpdate = {
    id: 1,
    name: "My script",
    description: null,
    file_path: resolve("custom-scripts/report.py"),
    interpreter: "C:\\Python\\python.exe",
    args: "--title \"weekly report\"",
    enabled: false,
    schedule: { type: "manual" },
  };

  it("preserves custom interpreters and arguments while rejecting malformed input", () => {
    expect(validateScriptUpdateFields(validUpdate)).toBeNull();
    expect(validateScriptUpdateFields({ ...validUpdate, interpreter: "python\0 --help" })).not.toBeNull();
    expect(validateScriptUpdateFields({ ...validUpdate, args: "x".repeat(8_193) })).not.toBeNull();
    expect(validateScriptUpdateFields({ ...validUpdate, enabled: "true" })).not.toBeNull();
    expect(validateScriptUpdateFields({ ...validUpdate, schedule: null })).not.toBeNull();
    expect(isScriptScheduleInputShape({ type: "interval", minutes: "10" })).toBe(false);
    expect(isScriptScheduleInputShape({ type: "weekly", daysOfWeek: [1, 5] })).toBe(true);
  });

  it("accepts only absolute Python script paths", () => {
    expect(isPythonScriptFilePath(resolve("custom-scripts/report.PY"))).toBe(true);
    expect(isPythonScriptFilePath("relative/report.py")).toBe(false);
    expect(isPythonScriptFilePath(resolve("custom-scripts/report.exe"))).toBe(false);
  });

  it("keeps scripts inside the configured directory boundary", () => {
    const root = resolve("custom-scripts");
    expect(isPathWithinDirectory(resolve("custom-scripts/report.py"), root)).toBe(true);
    expect(isPathWithinDirectory(resolve("custom-scripts/nested/report.py"), root)).toBe(true);
    expect(isPathWithinDirectory(resolve("other/report.py"), root)).toBe(false);
  });

  it("bounds process inputs and rejects NULs before spawning", () => {
    expect(isValidScriptExecutionInput({
      id: 1,
      filePath: validUpdate.file_path,
      interpreter: validUpdate.interpreter,
      args: validUpdate.args,
      extraArgs: ["--db-path", "C:\\data\\app.sqlite"],
    })).toBe(true);
    expect(isValidScriptExecutionInput({
      id: 1,
      filePath: validUpdate.file_path,
      interpreter: validUpdate.interpreter,
      args: "bad\0arg",
      extraArgs: [],
    })).toBe(false);
  });
});
