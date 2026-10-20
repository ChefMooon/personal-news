import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToYouTubeUpdated } from "./youtube-updated-subscription";

const handlers: Array<(...args: unknown[]) => void> = [];
const cleanups: Array<() => void> = [];
const unsubscribeFromIpc = vi.fn();
const on = vi.fn((_channel: string, handler: (...args: unknown[]) => void) => {
  handlers.push(handler);
  return unsubscribeFromIpc;
});

beforeEach(() => {
  handlers.length = 0;
  cleanups.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("window", { api: { on } });
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe("YouTube update subscriptions", () => {
  it("multiplexes consumers through one IPC listener and removes it after the last consumer", () => {
    const consumers = Array.from({ length: 11 }, () => vi.fn());
    consumers.forEach((consumer) => {
      cleanups.push(subscribeToYouTubeUpdated(consumer));
    });

    expect(on).toHaveBeenCalledTimes(1);
    expect(handlers).toHaveLength(1);

    handlers[0]();
    consumers.forEach((consumer) => expect(consumer).toHaveBeenCalledTimes(1));

    cleanups.splice(0, 10).forEach((cleanup) => cleanup());
    expect(unsubscribeFromIpc).not.toHaveBeenCalled();

    cleanups.splice(0).forEach((cleanup) => cleanup());
    expect(unsubscribeFromIpc).toHaveBeenCalledTimes(1);
  });
});
