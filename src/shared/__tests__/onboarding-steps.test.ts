import { describe, expect, it } from "vitest";
import { planOnboardingSteps } from "../onboarding-steps";

describe("planOnboardingSteps", () => {
  it("includes only the pick and finish steps when nothing is selected", () => {
    expect(planOnboardingSteps([])).toEqual([
      { id: "pick", featureIds: [] },
      { id: "finish", featureIds: [] },
    ]);
  });

  it("combines Weather and Astronomy into one location step", () => {
    expect(planOnboardingSteps(["weather", "astronomy"])).toEqual([
      { id: "pick", featureIds: [] },
      { id: "location", featureIds: ["weather", "astronomy"] },
      { id: "finish", featureIds: [] },
    ]);
  });

  it("includes one location step for Astronomy alone", () => {
    expect(planOnboardingSteps(["astronomy"])).toEqual([
      { id: "pick", featureIds: [] },
      { id: "location", featureIds: ["astronomy"] },
      { id: "finish", featureIds: [] },
    ]);
  });

  it("plans every feature step in the specified order", () => {
    expect(
      planOnboardingSteps([
        "youtube",
        "reddit_digest",
        "saved_posts",
        "sports",
        "weather",
        "astronomy",
      ]),
    ).toEqual([
      { id: "pick", featureIds: [] },
      { id: "location", featureIds: ["weather", "astronomy"] },
      { id: "sports", featureIds: ["sports"] },
      { id: "reddit_digest", featureIds: ["reddit_digest"] },
      { id: "youtube", featureIds: ["youtube"] },
      { id: "saved_posts", featureIds: ["saved_posts"] },
      { id: "finish", featureIds: [] },
    ]);
  });

  it("keeps its order stable regardless of selection order", () => {
    const first = planOnboardingSteps([
      "saved_posts",
      "astronomy",
      "reddit_digest",
      "sports",
      "youtube",
      "weather",
    ]);
    const second = planOnboardingSteps([
      "youtube",
      "sports",
      "weather",
      "saved_posts",
      "reddit_digest",
      "astronomy",
    ]);

    expect(first).toEqual(second);
    expect(first.map(({ id }) => id)).toEqual([
      "pick",
      "location",
      "sports",
      "reddit_digest",
      "youtube",
      "saved_posts",
      "finish",
    ]);
  });
});
