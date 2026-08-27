import { useEffect, useState } from "react";

/**
 * Ticking current time in milliseconds, refreshed on an interval while active.
 * Countdown wording is always derived from this clock plus absolute snapshot
 * timestamps so relative labels never freeze at fetch time.
 */
export function useNowMilliseconds(
  active: boolean,
  intervalMs = 30_000,
): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
