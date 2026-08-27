/** Convert a local calendar date to its DST-aware UTC interval. */
export function localDayIntervalUtc(
  localDate: string,
  timeZone: string,
): { start: number; end: number } | null {
  try {
    const start = localMidnightUtc(localDate, timeZone);
    const nextDate = new Date(`${localDate}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const end = localMidnightUtc(nextDate.toISOString().slice(0, 10), timeZone);
    if (start == null || end == null || end <= start) return null;
    return { start, end };
  } catch {
    return null;
  }
}

function localMidnightUtc(localDate: string, timeZone: string): number | null {
  let guess = Date.parse(`${localDate}T12:00:00Z`);
  if (!Number.isFinite(guess)) return null;
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date(guess));
    const raw =
      parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
    const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offset = match
      ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;
    guess = Date.parse(`${localDate}T00:00:00Z`) - offset * 60_000;
  }
  return Math.floor(guess / 1000);
}
