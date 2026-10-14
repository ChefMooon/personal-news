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
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="shrink-0">
        <WeatherSummary
          snapshot={snapshot}
          config={config}
          settings={settings}
          denseSpacing
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
      </div>
      {policy.showAstronomy && snapshot.location.timezone && (
        <div className="shrink-0">
          <WeatherAstronomy
            astronomy={snapshot.astronomy}
            timezone={snapshot.location.timezone}
            settings={settings}
            variant="row"
          />
        </div>
      )}
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
          chartHeight={72}
          denseSpacing
          fillAvailable
          onMetricChange={props.onMetricChange}
        />
      )}
    </div>
  );
}
