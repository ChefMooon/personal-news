import type { FeatureId } from "./feature-manifest";

export type OnboardingStepId =
  | "pick"
  | "location"
  | "sports"
  | "reddit_digest"
  | "youtube"
  | "saved_posts"
  | "finish";

export interface OnboardingStep {
  id: OnboardingStepId;
  featureIds: FeatureId[];
}

export function planOnboardingSteps(
  selected: readonly FeatureId[],
): OnboardingStep[] {
  const selectedIds = new Set(selected);
  const steps: OnboardingStep[] = [{ id: "pick", featureIds: [] }];
  const locationFeatureIds: FeatureId[] = [];

  if (selectedIds.has("weather")) locationFeatureIds.push("weather");
  if (selectedIds.has("astronomy")) locationFeatureIds.push("astronomy");
  if (locationFeatureIds.length > 0) {
    steps.push({ id: "location", featureIds: locationFeatureIds });
  }

  for (const id of ["sports", "reddit_digest", "youtube", "saved_posts"] as const) {
    if (selectedIds.has(id)) steps.push({ id, featureIds: [id] });
  }

  steps.push({ id: "finish", featureIds: [] });
  return steps;
}
