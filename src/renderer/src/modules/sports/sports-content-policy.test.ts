import { describe, expect, it } from "vitest";
import { getSportsContentPolicy } from "./sports-content-policy";

describe("getSportsContentPolicy", () => {
  it("keeps Small to one live game and two secondary items", () => {
    const policy = getSportsContentPolicy({
      size: "small",
      viewMode: "detailed",
      liveGameCount: 2,
      teamCount: 5,
      eventCount: 6,
    });

    expect(policy).toMatchObject({
      effectiveViewMode: "today",
      liveGameLimit: 1,
      teamLimit: 1,
      eventLimit: 3,
      secondaryItemLimit: 2,
      showLiveSelector: true,
      capped: true,
      overflow: "hidden",
    });
  });

  it("enables the Medium team carousel only at a readable width", () => {
    expect(
      getSportsContentPolicy({
        size: "medium",
        viewMode: "today",
        liveGameCount: 1,
        teamCount: 5,
        eventCount: 4,
        contentWidth: 439,
      }).showTeamCarousel,
    ).toBe(false);
    expect(
      getSportsContentPolicy({
        size: "medium",
        viewMode: "today",
        liveGameCount: 1,
        teamCount: 5,
        eventCount: 4,
        contentWidth: 440,
      }).showTeamCarousel,
    ).toBe(true);
  });

  it("preserves the configured view mode outside Small", () => {
    expect(
      getSportsContentPolicy({
        size: "medium",
        viewMode: "standard",
        liveGameCount: 0,
        teamCount: 2,
        eventCount: 2,
      }).effectiveViewMode,
    ).toBe("standard");
    const policy = getSportsContentPolicy({
      size: "large",
      viewMode: "detailed",
      liveGameCount: 2,
      teamCount: 10,
      eventCount: 12,
    });
    expect(policy.overflow).toBe("auto");
    expect(policy.showTeamCarousel).toBe(false);
  });
});
