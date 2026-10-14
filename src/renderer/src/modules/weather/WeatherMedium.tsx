import React from "react";
import type { WeatherLayoutProps } from "./WeatherSummary";
import { WeatherInlineAlert, WeatherSummary } from "./WeatherSummary";
import { WeatherHourly } from "./WeatherHourly";
import { WeatherDaily } from "./WeatherDaily";
import { WeatherAstronomy } from "./WeatherAstronomy";

export function WeatherMedium(props: WeatherLayoutProps): React.ReactElement {
  const { snapshot, config, settings, policy } = props;
  const stacked = policy.verticalOverflow === "widget";
  const weather = (
    <div
      className={
        stacked
          ? "min-w-0 space-y-1"
          : "flex h-full min-h-0 min-w-0 flex-col gap-2"
      }
    >
      <div className="shrink-0">
        <WeatherSummary
          snapshot={snapshot}
          config={config}
          settings={settings}
          denseSpacing
          trailing={
            policy.showAlerts && snapshot.alerts.length > 0 ? (
              <WeatherInlineAlert
                {...props}
                visible={policy.showAlerts}
                detail={policy.alertDetail}
                presentation={policy.alertPresentation}
              />
            ) : undefined
          }
        />
      </div>
      {policy.showDaily && (
        <div className="shrink-0">
          <WeatherDaily
            points={snapshot.daily}
            yesterday={snapshot.yesterday}
            config={config}
            settings={settings}
            cap={policy.dailyCap}
            denseSpacing
          />
        </div>
      )}
      {policy.showHourly && (
        <WeatherHourly
          points={snapshot.hourly}
          config={config}
          settings={settings}
          cap={policy.hourlyCap}
          presentation="tabbed"
          chartHeight={stacked ? 28 : 36}
          denseSpacing
          fillAvailable={!stacked}
          onMetricChange={props.onMetricChange}
        />
      )}
    </div>
  );
  return (
    <div
      className={
        policy.verticalOverflow === "widget"
          ? "grid min-w-0 grid-cols-1 gap-1"
          : "grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-2"
      }
    >
      <div
        data-weather-vertical-viewport={
          policy.verticalOverflow === "weather-column" ? "" : undefined
        }
        className={
          policy.verticalOverflow === "weather-column"
            ? "h-full min-h-0 min-w-0 overflow-hidden"
            : "min-h-0 min-w-0"
        }
      >
        {weather}
      </div>
      {policy.showAstronomy && snapshot.location.timezone && (
        <WeatherAstronomy
          astronomy={snapshot.astronomy}
          timezone={snapshot.location.timezone}
          settings={settings}
          variant={stacked ? "medium-compact" : "stacked"}
        />
      )}
    </div>
  );
}
