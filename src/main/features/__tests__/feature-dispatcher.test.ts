import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FEATURE_IDS } from "../../../shared/feature-manifest";
import {
  assertAllFeatureHooksRegistered,
  clearFeatureHooks,
  dispatchFeatureEnabledChange,
  dispatchFeatureEnabledChangeWithRollback,
  registerFeatureHook,
} from "../feature-dispatcher";

afterEach(() => {
  clearFeatureHooks();
});

describe("feature dispatcher", () => {
  it("runs a registered hook once when the feature changes", () => {
    const hook = vi.fn();
    registerFeatureHook("weather", hook);

    expect(dispatchFeatureEnabledChange("weather", true, false)).toBe(true);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(true);
  });

  it("does not run a registered hook when the feature is unchanged", () => {
    const hook = vi.fn();
    registerFeatureHook("weather", hook);

    expect(dispatchFeatureEnabledChange("weather", false, false)).toBe(false);
    expect(hook).not.toHaveBeenCalled();
  });

  it("logs and rethrows hook errors with feature context", () => {
    const error = new Error("hook failed");
    const hook = vi.fn(() => {
      throw error;
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    registerFeatureHook("astronomy", hook);

    let thrown: unknown;
    try {
      dispatchFeatureEnabledChange("astronomy", true, false);
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({
      message: "Failed to enable astronomy: hook failed",
      cause: error,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[Features] Hook for astronomy failed:",
      error,
    );
    consoleError.mockRestore();
  });

  it("rolls back the persisted flag when a hook fails", () => {
    const hook = vi.fn(() => {
      throw new Error("hook failed");
    });
    let persistedValue = "false";
    registerFeatureHook("weather", hook);
    persistedValue = "true";

    expect(() =>
      dispatchFeatureEnabledChangeWithRollback(
        "weather",
        true,
        false,
        () => {
          persistedValue = "false";
        },
      ),
    ).toThrow("Failed to enable weather: hook failed");
    expect(persistedValue).toBe("false");
  });

  it("rejects duplicate hook registrations", () => {
    registerFeatureHook("sports", vi.fn());

    expect(() => registerFeatureHook("sports", vi.fn())).toThrow(
      "Feature hook already registered: sports",
    );
  });

  it("requires a hook for every manifest feature", () => {
    expect(() => assertAllFeatureHooksRegistered()).toThrow(
      `Feature hooks not registered: ${FEATURE_IDS.join(", ")}`,
    );

    FEATURE_IDS.slice(0, -1).forEach((id) => {
      registerFeatureHook(id, vi.fn());
    });
    expect(() => assertAllFeatureHooksRegistered()).toThrow(
      "Feature hooks not registered: astronomy",
    );

    registerFeatureHook("astronomy", vi.fn());
    expect(() => assertAllFeatureHooksRegistered()).not.toThrow();
  });

  it("guards IPC mutations through the dispatcher and removes the old weather branch", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../ipc/index.ts", import.meta.url)),
      "utf8",
    );

    expect(
      source.match(/dispatchFeatureEnabledChangeWithRollback\(/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(source).not.toMatch(
      /if\s*\(\s*key\s*===\s*["']weather_enabled["']\s*\)/,
    );
  });
});
