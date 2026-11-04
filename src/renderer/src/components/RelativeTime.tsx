import React from "react";
import { useNowMilliseconds } from "../hooks/useNowMilliseconds";
import { formatRelativeTime } from "../lib/time";

interface RelativeTimeProps {
  unixTimestamp: number;
}

/** Keeps relative labels current without coupling clock ticks to data loading. */
export function RelativeTime({ unixTimestamp }: RelativeTimeProps): React.ReactElement {
  const nowMilliseconds = useNowMilliseconds(true);
  return <>{formatRelativeTime(unixTimestamp, nowMilliseconds)}</>;
}
