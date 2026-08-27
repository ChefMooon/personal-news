import React from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import Dashboard from "./routes/Dashboard";
import SavedPosts from "./routes/SavedPosts";
import YouTubePage from "./routes/YouTube";
import RedditDigest from "./routes/RedditDigest";
import ScriptManager from "./routes/ScriptManager";
import Settings from "./routes/Settings";
import SportsPage from "./routes/Sports";
import { RedditDigestEnabledProvider } from "./contexts/RedditDigestEnabledContext";
import { AstronomyEnabledProvider } from "./contexts/AstronomyEnabledContext";
import { RadioPlayerProvider } from "./contexts/RadioPlayerContext";
import { SavedPostsEnabledProvider } from "./contexts/SavedPostsEnabledContext";
import { SidebarConfigProvider } from "./contexts/SidebarConfigContext";
import { SportsEnabledProvider } from "./contexts/SportsEnabledContext";
import { WeatherEnabledProvider } from "./contexts/WeatherEnabledContext";
import { useSidebarConfig } from "./hooks/useSidebarConfig";
import { RadioPlayer } from "./components/RadioPlayer";
import { WindowTitleBar } from "./components/WindowTitleBar";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  IPC,
  type IpcMutationResult,
  type NtfyIngestCompleteEvent,
  type UpdateStatusEvent,
} from "../../shared/ipc-types";
import { buildNtfyFailureToastContent } from "./lib/ntfyNotifications";

function AppShell(): React.ReactElement {
  const { loading } = useSidebarConfig();

  return (
    <RadioPlayerProvider>
      <TooltipProvider delayDuration={120} skipDelayDuration={0}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
          <WindowTitleBar />
          <div
            className="flex flex-1 overflow-hidden"
            style={{ visibility: loading ? "hidden" : "visible" }}
          >
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/reddit-digest" element={<RedditDigest />} />
                <Route path="/saved-posts" element={<SavedPosts />} />
                <Route path="/youtube" element={<YouTubePage />} />
                <Route path="/sports" element={<SportsPage />} />
                <Route path="/scripts" element={<ScriptManager />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
            <RadioPlayer />
          </div>
        </div>
      </TooltipProvider>
      <Toaster
        position="bottom-right"
        richColors
        containerAriaLabel="Notifications"
        toastOptions={{ closeButtonAriaLabel: "Close notification" }}
      />
    </RadioPlayerProvider>
  );
}

export default function App(): React.ReactElement {
  const lastUpdateToastKeyRef = React.useRef<string | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    return window.api.on(IPC.APP_SHOW_TRAY_HINT, () => {
      toast.info("Personal News is still running in the system tray.", {
        description:
          "Use the tray icon to reopen the app or quit it completely.",
        duration: 5000,
      });
    });
  }, []);

  React.useEffect(() => {
    return window.api.on(IPC.REDDIT_NTFY_INGEST_COMPLETE, (payload) => {
      const event = payload as NtfyIngestCompleteEvent;
      const toastContent = buildNtfyFailureToastContent(event.summary ?? null);

      if (!toastContent) {
        return;
      }

      toast.error(toastContent.title, {
        description: toastContent.description,
        duration: 8000,
        action: {
          label: "View details",
          onClick: () => {
            navigate("/settings?tab=saved-posts&section=sync-details");
          },
        },
      });
    });
  }, []);

  React.useEffect(() => {
    const handleUpdateStatus = (event: UpdateStatusEvent): void => {
      const toastKey = `${event.state}|${event.version ?? ""}|${event.friendlyMessage ?? ""}|${event.message}`;
      if (toastKey === lastUpdateToastKeyRef.current) {
        return;
      }

      lastUpdateToastKeyRef.current = toastKey;

      const versionLabel = event.version ? ` ${event.version}` : "";

      if (event.state === "available") {
        toast.info(`Update${versionLabel} is available.`, {
          description: "Downloading in the background.",
        });
        return;
      }

      if (event.state === "downloaded") {
        toast.success(`Update${versionLabel} is ready.`, {
          description: "Install now to restart on the latest version.",
          duration: Infinity,
          action: {
            label: "Install and restart",
            onClick: () => {
              window.api
                .invoke(IPC.UPDATES_INSTALL_UPDATE)
                .then((result) => {
                  const mutation = result as IpcMutationResult;
                  if (!mutation.ok) {
                    throw new Error(
                      mutation.error ?? "Unable to install update.",
                    );
                  }
                })
                .catch((error: unknown) => {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Unable to install update.";
                  toast.error(message);
                });
            },
          },
        });
        return;
      }

      if (event.state === "not-available") {
        toast.success("You are already on the latest version.", {
          description: `Current version: ${event.currentVersion}`,
        });
        return;
      }

      if (event.state === "error") {
        toast.error(
          event.friendlyMessage ||
            event.message ||
            "Auto-update encountered an error.",
        );
      }
    };

    window.api
      .invoke(IPC.UPDATES_GET_STATUS)
      .then((result) => {
        handleUpdateStatus(result as UpdateStatusEvent);
      })
      .catch(() => {});

    return window.api.on(IPC.UPDATES_STATUS, (event) => {
      handleUpdateStatus(event as UpdateStatusEvent);
    });
  }, []);

  return (
    <RedditDigestEnabledProvider>
      <SavedPostsEnabledProvider>
        <SportsEnabledProvider>
          <AstronomyEnabledProvider>
            <WeatherEnabledProvider>
              <SidebarConfigProvider>
                <AppShell />
              </SidebarConfigProvider>
            </WeatherEnabledProvider>
          </AstronomyEnabledProvider>
        </SportsEnabledProvider>
      </SavedPostsEnabledProvider>
    </RedditDigestEnabledProvider>
  );
}
