import React, { useMemo } from "react";
import type { WeatherLocation } from "../../../../shared/ipc-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Separator } from "../../components/ui/separator";
import type { AstronomyViewConfig } from "../../hooks/useAstronomyConfig";

function formatLocationLabel(
  location: Pick<WeatherLocation, "name" | "admin1" | "country">,
): string {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");
}

interface AstronomySettingsPanelProps {
  config: AstronomyViewConfig;
  onChange: (config: AstronomyViewConfig) => void;
  locations: WeatherLocation[];
  defaultLocationId: string | null;
  sizeControl?: React.ReactNode;
}

export function AstronomySettingsPanel({
  config,
  onChange,
  locations,
  defaultLocationId,
  sizeControl,
}: AstronomySettingsPanelProps): React.ReactElement {
  const currentValue = config.locationId ?? "__default__";
  const defaultLocationLabel = useMemo(() => {
    if (!defaultLocationId) return "No default location selected";
    const currentDefault = locations.find(
      (location) => location.id === defaultLocationId,
    );
    return currentDefault
      ? formatLocationLabel(currentDefault)
      : "Use app default location";
  }, [defaultLocationId, locations]);

  return (
    <div className="flex h-full w-full min-w-0 flex-1 flex-col">
      <ScrollArea className="h-full w-full">
        <div className="space-y-5 pb-2 pr-4">
          {sizeControl}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Location</h3>
            <label className="mb-2 block text-sm">Displayed location</label>
            <Select
              value={currentValue}
              onValueChange={(value) =>
                onChange({
                  ...config,
                  locationId: value === "__default__" ? null : value,
                })
              }
            >
              <SelectTrigger className="h-8" aria-label="Displayed location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  Use app default: {defaultLocationLabel}
                </SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {formatLocationLabel(location)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Saved locations are managed in the Weather widget and Settings -
              Weather.
            </p>
          </div>

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-semibold">View</h3>
            <label className="mb-2 block text-sm">View mode</label>
            <Select
              value={config.viewMode}
              onValueChange={(value) =>
                onChange({
                  ...config,
                  viewMode: value as AstronomyViewConfig["viewMode"],
                })
              }
            >
              <SelectTrigger className="h-8" aria-label="View mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Summary</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
