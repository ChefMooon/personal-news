import React from "react";
import { AlertTriangle } from "lucide-react";
import type { WeatherSnapshot } from "../../../../shared/ipc-types";

export interface WeatherAlertCardProps {
  snapshot: WeatherSnapshot;
  visible: boolean;
  detail: "summary" | "detailed";
}

export function WeatherAlertCard({
  snapshot,
  visible,
  detail,
}: WeatherAlertCardProps): React.ReactElement | null {
  if (!visible || snapshot.alerts.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex min-w-0 items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
        <div className="min-w-0">
          <p className="break-words text-xs font-medium text-foreground">
            {snapshot.alerts.map((alert) => alert.title).join(" · ")}
          </p>
          {detail === "detailed" &&
            snapshot.alerts.map((alert) => (
              <p
                key={alert.id}
                className="break-words text-[11px] text-foreground"
              >
                {alert.message}
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}
