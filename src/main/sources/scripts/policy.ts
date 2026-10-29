import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export interface ScriptUpdateFields {
  id: unknown;
  name: unknown;
  description: unknown;
  file_path: unknown;
  interpreter: unknown;
  args: unknown;
  enabled: unknown;
  schedule: unknown;
}

export function validateScriptUpdateFields(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Invalid script settings.";
  const input = value as ScriptUpdateFields;
  if (!Number.isInteger(input.id) || (input.id as number) <= 0) return "Invalid script ID.";
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200) return "Script name must contain 1 to 200 characters.";
  if (input.description !== null && input.description !== undefined && (typeof input.description !== "string" || input.description.length > 4_000)) return "Script description is too long.";
  if (typeof input.file_path !== "string" || !input.file_path.trim() || input.file_path.length > 32_768 || /[\u0000-\u001f\u007f]/.test(input.file_path)) return "Invalid script file path.";
  if (typeof input.interpreter !== "string" || !input.interpreter.trim() || input.interpreter.length > 4_096 || /[\u0000-\u001f\u007f]/.test(input.interpreter)) return "Invalid interpreter.";
  if (input.args !== null && input.args !== undefined && (typeof input.args !== "string" || input.args.length > 8_192 || input.args.includes("\0"))) return "Script arguments are too long or contain invalid characters.";
  if (typeof input.enabled !== "boolean") return "Invalid script enabled state.";
  if (!isScriptScheduleInputShape(input.schedule)) return "Invalid script schedule.";
  return null;
}

export function isScriptScheduleInputShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schedule = value as Record<string, unknown>;
  if (!["manual", "on_app_start", "interval", "daily", "fixed_time", "weekly", "monthly"].includes(String(schedule.type))) return false;
  for (const field of ["minutes", "hour", "minute", "dayOfMonth"]) {
    if (schedule[field] !== undefined && (typeof schedule[field] !== "number" || !Number.isFinite(schedule[field]))) return false;
  }
  if (schedule.runOnAppStart !== undefined && typeof schedule.runOnAppStart !== "boolean") return false;
  if (schedule.daysOfWeek !== undefined && (!Array.isArray(schedule.daysOfWeek) || !schedule.daysOfWeek.every((day) => typeof day === "number" && Number.isFinite(day)))) return false;
  return true;
}

export function isPythonScriptFilePath(filePath: string): boolean {
  return isAbsolute(filePath) && extname(filePath).toLowerCase() === ".py" && !/[\u0000-\u001f\u007f]/.test(filePath);
}

export function isPathWithinDirectory(filePath: string, directoryPath: string): boolean {
  const candidate = resolve(filePath);
  const root = resolve(directoryPath);
  const relativePath = relative(root, candidate);
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

export function isValidScriptExecutionInput(input: {
  id: unknown;
  filePath: unknown;
  interpreter: unknown;
  args: unknown;
  extraArgs: unknown;
}): boolean {
  return Number.isInteger(input.id) && (input.id as number) > 0 &&
    typeof input.filePath === "string" && input.filePath.length <= 32_768 && isPythonScriptFilePath(input.filePath) &&
    typeof input.interpreter === "string" && input.interpreter.trim().length > 0 && input.interpreter.length <= 4_096 && !/[\u0000-\u001f\u007f]/.test(input.interpreter) &&
    (input.args === null || (typeof input.args === "string" && input.args.length <= 8_192 && !input.args.includes("\0"))) &&
    Array.isArray(input.extraArgs) && input.extraArgs.length <= 64 && input.extraArgs.every((arg) => typeof arg === "string" && arg.length <= 8_192 && !arg.includes("\0"));
}
