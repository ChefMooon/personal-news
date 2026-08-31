import React from "react";
import type { WeatherLayoutProps } from "./WeatherSummary";
import { WeatherSummary } from "./WeatherSummary";
import { WeatherAlertCard } from "./WeatherAlertCard";
import { WeatherHourly } from "./WeatherHourly";
import { WeatherDaily } from "./WeatherDaily";
import { WeatherAstronomy } from "./WeatherAstronomy";

export function WeatherLarge(props: WeatherLayoutProps): React.ReactElement {
  const { snapshot, config, settings, policy } = props;
  return (
    <div className="min-w-0 space-y-3 overflow-y-auto">
      <WeatherSummary
        snapshot={snapshot}
        config={config}
        settings={settings}
        trailing={
          policy.showAlerts ? (
            <WeatherAlertCard
              snapshot={snapshot}
              visible={policy.showAlerts}
              detail={policy.alertDetail}
            />
          ) : undefined
        }
      />
      {policy.showAstronomy && snapshot.location.timezone && (
        <WeatherAstronomy
          astronomy={snapshot.astronomy}
          timezone={snapshot.location.timezone}
          settings={settings}
          variant="row"
        />
      )}
      {policy.showDaily && (
        <WeatherDaily
          points={snapshot.daily}
          yesterday={snapshot.yesterday}
          config={config}
          settings={settings}
          cap={policy.dailyCap}
        />
      )}
      {policy.showHourly && (
        <WeatherHourly
          points={snapshot.hourly}
          config={config}
          settings={settings}
          cap={policy.hourlyCap}
          presentation="tabbed"
          chartHeight={85}
          onMetricChange={props.onMetricChange}
        />
      )}
    </div>
  );
}
