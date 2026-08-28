import React from "react";
import type { WeatherLayoutProps } from "./WeatherSummary";
import { WeatherAlerts, WeatherSummary } from "./WeatherSummary";
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
      />
      <WeatherAlerts
        {...props}
        visible={policy.showAlerts}
        detail={policy.alertDetail}
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
