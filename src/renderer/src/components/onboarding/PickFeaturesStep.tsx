import React from "react";
import { FEATURE_MANIFEST, isSelectedByDefault } from "../../../../shared/feature-manifest";
import type { FeatureId } from "../../../../shared/feature-manifest";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";

interface PickFeaturesStepProps {
  selected: readonly FeatureId[];
  onSelectionChange: (id: FeatureId, selected: boolean) => void;
}

export function PickFeaturesStep({
  selected,
  onSelectionChange,
}: PickFeaturesStepProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Choose your features</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick what you want to use. You can change this any time in Settings → Features.
        </p>
      </div>
      <div className="space-y-2">
        {FEATURE_MANIFEST.map((feature) => {
          const checked = selected.includes(feature.id);
          return (
            <section
              key={feature.id}
              className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5"
              data-feature-id={feature.id}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{feature.displayName}</h3>
                  {feature.needsSetup && feature.setupHint ? (
                    <Badge variant="outline">Needs setup</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{feature.blurb}</p>
                {feature.needsSetup && feature.setupHint ? (
                  <p className="text-xs text-muted-foreground">
                    {feature.setupHint}
                  </p>
                ) : null}
              </div>
              <Switch
                checked={checked}
                onCheckedChange={(value) =>
                  onSelectionChange(feature.id, value)
                }
                aria-label={`Use ${feature.displayName}`}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function getDefaultOnboardingSelection(): FeatureId[] {
  return FEATURE_MANIFEST.filter(isSelectedByDefault).map(({ id }) => id);
}
