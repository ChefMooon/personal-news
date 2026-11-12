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
import AstronomyDetails from "./routes/AstronomyDetails";
import { RedditDigestEnabledProvider } from "./contexts/RedditDigestEnabledContext";
import { AstronomyEnabledProvider } from "./contexts/AstronomyEnabledContext";
import { RadioPlayerProvider } from "./contexts/RadioPlayerContext";
import { SavedPostsEnabledProvider } from "./contexts/SavedPostsEnabledContext";
import { SidebarConfigProvider } from "./contexts/SidebarConfigContext";
import { SportsEnabledProvider } from "./contexts/SportsEnabledContext";
import { WeatherEnabledProvider } from "./contexts/WeatherEnabledContext";
import { YouTubeEnabledProvider } from "./contexts/YouTubeEnabledContext";
import { useSidebarConfig } from "./hooks/useSidebarConfig";
import { RadioPlayer } from "./components/RadioPlayer";
import { WindowTitleBar } from "./components/WindowTitleBar";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  IPC,
  type IpcMutationResult,
  type NtfyIngestCompleteEvent,
  type ReleaseNotesDocument,
  type UpdateStatusEvent,
  type WhatsNewPayload,
} from "../../shared/ipc-types";
import { WhatsNewDialog } from "./components/WhatsNewDialog";
import { buildNtfyFailureToastContent } from "./lib/ntfyNotifications";
import { OnboardingGate } from "./components/onboarding/OnboardingGate";

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
                <Route
                  path="/astronomy/details"
                  element={<AstronomyDetails />}
                />
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
  const updateReadyToastIdRef = React.useRef<string | number | null>(null);
  const updateReadyToastVersionRef = React.useRef<string | null>(null);
  const navigate = useNavigate();
  const [whatsNew, setWhatsNew] = React.useState<{
    version: string;
    notes: ReleaseNotesDocument | null;
    variant: "incoming" | "installed";
    // Content stays after closing so the dialog can animate out.
    open: boolean;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    window.api
      .invoke(IPC.UPDATES_GET_PENDING_WHATS_NEW)
      .then((result) => {
        const payload = result as WhatsNewPayload | null;
        if (!cancelled && payload) {
          setWhatsNew((current) =>
            current?.open
              ? current
              : {
                  version: payload.version,
                  notes: payload.notes,
                  variant: "installed",
                  open: true,
                },
          );
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load pending release notes", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleWhatsNewOpenChange = (open: boolean): void => {
    if (open || !whatsNew?.open) return;
    const dismissed = whatsNew;
    setWhatsNew({ ...dismissed, open: false });
    if (dismissed.variant !== "installed") return;
    window.api
      .invoke(IPC.UPDATES_ACKNOWLEDGE_WHATS_NEW, dismissed.version)
      .catch((error: unknown) => {
        console.error("Failed to acknowledge release notes", error);
      });
  };

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

      if (event.installRequested && updateReadyToastIdRef.current !== null) {
        toast.dismiss(updateReadyToastIdRef.current);
        updateReadyToastIdRef.current = null;
        updateReadyToastVersionRef.current = null;
      }

      const versionLabel = event.version ? ` ${event.version}` : "";

      if (event.state === "available") {
        if (
          updateReadyToastIdRef.current !== null &&
          updateReadyToastVersionRef.current !== event.version
        ) {
          toast.dismiss(updateReadyToastIdRef.current);
          updateReadyToastIdRef.current = null;
          updateReadyToastVersionRef.current = null;
        }
        toast.info(`Update${versionLabel} is available.`, {
          description: "Downloading in the background.",
          className: "update-toast",
        });
        return;
      }

      if (event.state === "downloaded") {
        if (event.installRequested) return;
        updateReadyToastVersionRef.current = event.version ?? null;
        const readyNotes = event.downloadedReleaseNotes ?? event.releaseNotes;
        const readyVersion = event.downloadedVersion ?? event.version ?? "";
        const readyText = "Install now to restart on the latest version.";
        updateReadyToastIdRef.current = toast.success(`Update${versionLabel} is ready.`, {
          description:
            readyNotes && readyNotes.sections.length > 0 ? (
              <span>
                {readyText}{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  onClick={() =>
                    setWhatsNew((current) =>
                      // Never replace an open dialog: swapping out the installed
                      // one would skip its acknowledgement.
                      current?.open &&
                      (current.variant === "installed" ||
                        current.version === readyVersion)
                        ? current
                        : {
                            version: readyVersion,
                            notes: readyNotes,
                            variant: "incoming",
                            open: true,
                          },
                    )
                  }
                >
                  See what's new
                </button>
              </span>
            ) : (
              readyText
            ),
          duration: Infinity,
          className: "update-toast",
          classNames: { actionButton: "update-toast__action" },
          action: {
            label: "Install and restart",
            onClick: () => {
              window.api
                .invoke(IPC.UPDATES_INSTALL_UPDATE)
                .then((result) => {
                  const mutation = result as IpcMutationResult;
                  if (!mutation.ok) {
                    return;
                  }
                  if (updateReadyToastIdRef.current !== null) {
                    toast.dismiss(updateReadyToastIdRef.current);
                    updateReadyToastIdRef.current = null;
                    updateReadyToastVersionRef.current = null;
                  }
                  toast.info("Install and restart requested.", { description: "The app will restart if the installer starts successfully. If it remains open, restart manually and check for updates again.", className: "update-toast" });
                })
                .catch((error: unknown) => {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Unable to install update.";
                  toast.error(message, { className: "update-toast" });
                });
            },
          },
        });
        return;
      }

      if (event.state === "not-available") {
        if (event.operationOrigin !== "manual") return;
        toast.success("You are already on the latest version.", {
          description: `Current version: ${event.currentVersion}`,
          className: "update-toast",
        });
        return;
      }

      if (event.state === "error") {
        toast.error(
          event.friendlyMessage ||
            event.message ||
            "Auto-update encountered an error.",
          { className: "update-toast" },
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
    <>
      <YouTubeEnabledProvider>
        <RedditDigestEnabledProvider>
          <SavedPostsEnabledProvider>
            <SportsEnabledProvider>
              <AstronomyEnabledProvider>
                <WeatherEnabledProvider>
                  <SidebarConfigProvider>
                    <>
                      <AppShell />
                      <OnboardingGate />
                    </>
                  </SidebarConfigProvider>
                </WeatherEnabledProvider>
              </AstronomyEnabledProvider>
            </SportsEnabledProvider>
          </SavedPostsEnabledProvider>
        </RedditDigestEnabledProvider>
      </YouTubeEnabledProvider>
      {whatsNew ? (
        <WhatsNewDialog
          open={whatsNew.open}
          onOpenChange={handleWhatsNewOpenChange}
          version={whatsNew.version}
          notes={whatsNew.notes}
          variant={whatsNew.variant}
        />
      ) : null}
    </>
  );
}
