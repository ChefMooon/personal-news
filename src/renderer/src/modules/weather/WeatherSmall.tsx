import React from "react";
import type { WeatherLayoutProps } from "./WeatherSummary";
import { WeatherInlineAlert, WeatherSummary } from "./WeatherSummary";
import { WeatherAlertCard } from "./WeatherAlertCard";
import { WeatherHourly } from "./WeatherHourly";
import { WeatherAstronomy } from "./WeatherAstronomy";

export function WeatherSmall(props: WeatherLayoutProps): React.ReactElement {
  const { snapshot, config, settings, policy } = props;
  return (
    <div className="min-w-0 space-y-1.5">
      <WeatherSummary
        snapshot={snapshot}
        config={config}
        settings={settings}
        compact
        trailing={
          policy.showAlerts ? (
            policy.alertPresentation === "icon" ? (
              <WeatherInlineAlert
                {...props}
                visible={policy.showAlerts}
                detail={policy.alertDetail}
                presentation={policy.alertPresentation}
              />
            ) : (
              <WeatherAlertCard
                snapshot={snapshot}
                visible={policy.showAlerts}
                detail={policy.alertDetail}
              />
            )
          ) : undefined
        }
      />
      {policy.showAstronomy && snapshot.location.timezone && (
        <WeatherAstronomy
          astronomy={snapshot.astronomy}
          timezone={snapshot.location.timezone}
          settings={settings}
          variant="strip"
        />
      )}
      {policy.showHourly && (
        <WeatherHourly
          points={snapshot.hourly}
          config={config}
          settings={settings}
          cap={policy.hourlyCap}
          presentation="compact"
          onMetricChange={props.onMetricChange}
        />
      )}
    </div>
  );
}
