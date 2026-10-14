import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC } from "../../../shared/ipc-types";
import {
  DEFAULT_SPORTS_VIEW_CONFIG,
  useSportsViewConfig,
} from "./useSportsViewConfig";

const hooks = vi.hoisted(() => ({
  effect: null as null | (() => () => void),
  setState: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, hooks.setState],
  useEffect: (effect: () => () => void) => {
    hooks.effect = effect;
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

let listener: () => void;
let cleanup: () => void;
const invoke = vi.fn();
const unsubscribe = vi.fn();
const on = vi.fn((_channel: string, handler: () => void) => {
  listener = handler;
  return unsubscribe;
});
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  vi.clearAllMocks();
  hooks.effect = null;
  vi.stubGlobal("window", { api: { invoke, on } });
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
});

describe("Sports config fixture update subscription", () => {
  it("reloads migrated/reset settings in a mounted widget and unsubscribes", async () => {
    invoke.mockResolvedValueOnce(JSON.stringify({ sport: "Baseball" }));
    useSportsViewConfig("fixture");
    cleanup = hooks.effect!();
    await flush();
    expect(hooks.setState).toHaveBeenLastCalledWith(
      expect.objectContaining({ sport: "Baseball" }),
    );
    expect(on).toHaveBeenCalledWith(
      IPC.DEV_TEST_DATA_UPDATED,
      expect.any(Function),
    );
    invoke.mockResolvedValueOnce(
      JSON.stringify({ sport: "all", viewMode: "detailed" }),
    );
    listener();
    await flush();
    expect(invoke).toHaveBeenLastCalledWith(
      "settings:get",
      "sports_view_config:fixture",
    );
    expect(hooks.setState).toHaveBeenLastCalledWith(
      expect.objectContaining({ sport: "all", viewMode: "detailed" }),
    );
    invoke.mockResolvedValueOnce(null);
    listener();
    await flush();
    expect(hooks.setState).toHaveBeenLastCalledWith(DEFAULT_SPORTS_VIEW_CONFIG);
    cleanup();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("ignores a stale initial read and responses after unmount", async () => {
    let resolveInitial!: (raw: string) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveInitial = resolve;
        }),
    );
    useSportsViewConfig("fixture");
    cleanup = hooks.effect!();
    invoke.mockResolvedValueOnce(JSON.stringify({ sport: "all" }));
    listener();
    await flush();
    resolveInitial(JSON.stringify({ sport: "Baseball" }));
    await flush();
    expect(hooks.setState).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValueOnce(JSON.stringify({ sport: "Basketball" }));
    listener();
    cleanup();
    await flush();
    expect(hooks.setState).toHaveBeenCalledTimes(1);
  });
});
