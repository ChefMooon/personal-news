import { IPC } from "../../../shared/ipc-types";

type YouTubeUpdatedListener = () => void;

const listeners = new Set<YouTubeUpdatedListener>();
let unsubscribeFromIpc: (() => void) | null = null;

function dispatchYouTubeUpdated(): void {
  listeners.forEach((listener) => listener());
}

/** Keep one Electron IPC listener while any renderer consumer is subscribed. */
export function subscribeToYouTubeUpdated(
  listener: YouTubeUpdatedListener,
): () => void {
  listeners.add(listener);

  if (!unsubscribeFromIpc) {
    unsubscribeFromIpc = window.api.on(IPC.YOUTUBE_UPDATED, dispatchYouTubeUpdated);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeFromIpc?.();
      unsubscribeFromIpc = null;
    }
  };
}
