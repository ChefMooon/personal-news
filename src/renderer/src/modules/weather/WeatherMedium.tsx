import React from "react";
import type { WeatherLayoutProps } from "./WeatherSummary";
import { WeatherAlerts, WeatherSummary } from "./WeatherSummary";
import { WeatherHourly } from "./WeatherHourly";
import { WeatherDaily } from "./WeatherDaily";
import { WeatherAstronomy } from "./WeatherAstronomy";

export function WeatherMedium(props: WeatherLayoutProps): React.ReactElement {
  const { snapshot, config, settings, policy } = props;
  const weather = (
    <div className="min-w-0 space-y-3">
      <WeatherSummary snapshot={snapshot} config={config} settings={settings} />
      <WeatherAlerts
        {...props}
        visible={policy.showAlerts}
        detail={policy.alertDetail}
      />
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
          chartHeight={67}
          onMetricChange={props.onMetricChange}
        />
      )}
    </div>
  );
  return (
    <div
      className={
        policy.verticalOverflow === "widget"
          ? "grid min-w-0 grid-cols-1 gap-3"
          : "grid min-h-0 min-w-0 grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-3"
      }
    >
      <div
        className={
          policy.verticalOverflow === "weather-column"
            ? "min-h-0 min-w-0 overflow-y-auto"
            : "min-w-0"
        }
      >
        {weather}
      </div>
      {policy.showAstronomy && snapshot.location.timezone && (
        <WeatherAstronomy
          astronomy={snapshot.astronomy}
          timezone={snapshot.location.timezone}
          settings={settings}
          variant="stacked"
        />
      )}
    </div>
  );
}
