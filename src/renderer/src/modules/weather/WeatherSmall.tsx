import React from "react";
import type { WeatherLayoutProps } from "./WeatherSummary";
import { WeatherInlineAlert, WeatherSummary } from "./WeatherSummary";
import { WeatherAlertCard } from "./WeatherAlertCard";
import { WeatherHourly } from "./WeatherHourly";
import { WeatherAstronomy } from "./WeatherAstronomy";

export function WeatherSmall(props: WeatherLayoutProps): React.ReactElement {
  const { snapshot, config, settings, policy } = props;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-1">
      <div className="shrink-0">
        <WeatherSummary
          snapshot={snapshot}
          config={config}
          settings={settings}
          compact
          denseSpacing
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
      </div>
      {policy.showAstronomy && snapshot.location.timezone && (
        <div className="shrink-0">
          <WeatherAstronomy
            astronomy={snapshot.astronomy}
            timezone={snapshot.location.timezone}
            settings={settings}
            variant="strip"
          />
        </div>
      )}
      {policy.showHourly && (
        <WeatherHourly
          points={snapshot.hourly}
          config={config}
          settings={settings}
          cap={policy.hourlyCap}
          presentation="compact"
          denseSpacing
          fillAvailable
          onMetricChange={props.onMetricChange}
        />
      )}
    </div>
  );
}
