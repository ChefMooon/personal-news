import type { WidgetSize } from "../../../../shared/ipc-types";

export interface YouTubeContentPolicy {
  channelLimit: number;
  carouselRows: 1 | 2;
  compactRows: boolean;
  videoDensity: "compact" | "detailed";
  compactStreams: boolean;
}

export function getYouTubeContentPolicy(
  size: WidgetSize,
  configuredDensity: "compact" | "detailed",
  isEditing = false,
): YouTubeContentPolicy {
  const editChannelLimit = size === "large" ? 2 : 1;

  if (size === "small") {
    return {
      channelLimit: editChannelLimit,
      carouselRows: 1,
      compactRows: true,
      videoDensity: "compact",
      compactStreams: true,
    };
  }

  return {
    channelLimit: isEditing
      ? editChannelLimit
      : size === "medium"
        ? 2
        : Number.POSITIVE_INFINITY,
    carouselRows: 1,
    compactRows: size !== "large",
    videoDensity: size === "medium" ? "compact" : configuredDensity,
    compactStreams: false,
  };
}
