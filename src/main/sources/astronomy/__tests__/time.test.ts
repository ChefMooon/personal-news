import { describe, expect, it } from "vitest";
import { localDayIntervalUtc } from "../time";

describe("Astronomy local-day boundaries", () => {
  it("uses a 23-hour interval across spring DST transition", () => {
    const interval = localDayIntervalUtc("2026-03-08", "America/New_York");
    expect(interval).not.toBeNull();
    expect(interval!.end - interval!.start).toBe(23 * 60 * 60);
  });

  it("uses a 25-hour interval across fall DST transition", () => {
    const interval = localDayIntervalUtc("2026-11-01", "America/New_York");
    expect(interval).not.toBeNull();
    expect(interval!.end - interval!.start).toBe(25 * 60 * 60);
  });

  it("rejects an unknown timezone", () => {
    expect(localDayIntervalUtc("2026-01-01", "Not/A-Timezone")).toBeNull();
  });
});
