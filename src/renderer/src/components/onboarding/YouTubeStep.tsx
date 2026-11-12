import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  IPC,
  type IpcMutationResult,
  type YouTubeApiKeyStatus,
} from "../../../../shared/ipc-types";
import { useYouTubeChannels } from "../../hooks/useYouTubeChannels";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface YouTubeStepProps {
  onNext: () => void;
}

export function YouTubeStep({ onNext }: YouTubeStepProps): React.ReactElement {
  const { channels, loading: loadingChannels } = useYouTubeChannels();
  const [apiKey, setApiKey] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    window.api
      .invoke(IPC.SETTINGS_GET_YOUTUBE_API_KEY_STATUS)
      .then((value) => {
        if (active) {
          setApiKeySet((value as YouTubeApiKeyStatus | null)?.isSet === true);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load API key status.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const saveKey = async (): Promise<void> => {
    setSavingKey(true);
    setApiKeyError(null);
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_YOUTUBE_API_KEY,
        apiKey,
      )) as IpcMutationResult;
      if (!result.ok) {
        setApiKeyError(result.error ?? "Failed to save API key.");
        return;
      }
      setApiKey("");
      setApiKeySet(true);
    } catch (error) {
      setApiKeyError(
        error instanceof Error ? error.message : "Failed to save API key.",
      );
    } finally {
      setSavingKey(false);
    }
  };

  const addChannel = async (): Promise<void> => {
    setAddingChannel(true);
    try {
      const result = (await window.api.invoke(
        IPC.YOUTUBE_ADD_CHANNEL,
        channelInput.trim(),
      )) as IpcMutationResult;
      if (!result.ok) {
        toast.error(result.error ?? "Failed to add YouTube channel.");
        return;
      }
      setChannelInput("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add YouTube channel.",
      );
    } finally {
      setAddingChannel(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="onboarding-youtube-key" className="text-sm font-medium">
          YouTube Data API key
        </label>
        <div className="flex gap-2">
          <Input
            id="onboarding-youtube-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={apiKeySet ? "API key saved" : "Enter your API key"}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void saveKey()}
            disabled={savingKey || !apiKey.trim()}
          >
            {savingKey ? "Saving..." : "Save key"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Create a free key in the Google Cloud console (YouTube Data API v3).
        </p>
        {apiKeyError ? (
          <p role="alert" className="text-sm text-destructive">
            {apiKeyError}
          </p>
        ) : null}
      </div>

      {apiKeySet ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <label
              htmlFor="onboarding-youtube-channel"
              className="text-sm font-medium"
            >
              Add a channel (URL, handle, or ID)
            </label>
            <div className="flex gap-2">
              <Input
                id="onboarding-youtube-channel"
                value={channelInput}
                onChange={(event) => setChannelInput(event.target.value)}
                placeholder="YouTube channel"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void addChannel()}
                disabled={addingChannel || !channelInput.trim()}
              >
                {addingChannel ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
          <section className="space-y-2" aria-label="YouTube channels">
            <h3 className="text-sm font-medium">Channels</h3>
            {loadingChannels ? (
              <p className="text-sm text-muted-foreground">
                Loading channels...
              </p>
            ) : channels.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {channels.map((channel) => (
                  <li key={channel.channel_id}>{channel.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No channels added yet.
              </p>
            )}
          </section>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 flex justify-end bg-background py-2">
        <Button type="button" onClick={onNext}>
          {apiKeySet && channels.length > 0 ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
