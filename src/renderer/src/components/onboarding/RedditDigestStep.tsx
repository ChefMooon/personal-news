import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { IPC, type IpcMutationResult } from "../../../../shared/ipc-types";
import { normalizeSubredditInput } from "../../lib/subreddits";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface RedditDigestStepProps {
  onNext: () => void;
}

function parseSubreddits(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((value): value is string => typeof value === "string")
          .map((value) => normalizeSubredditInput(value))
          .filter((value): value is string => value !== null),
      ),
    ].sort();
  } catch {
    return [];
  }
}

export function RedditDigestStep({
  onNext,
}: RedditDigestStepProps): React.ReactElement {
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    window.api
      .invoke(IPC.SETTINGS_GET, "reddit_digest_subreddits")
      .then((raw) => {
        if (active) setSubreddits(parseSubreddits(raw));
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load Reddit Digest settings.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = async (next: string[]): Promise<void> => {
    await window.api.invoke(
      IPC.SETTINGS_SET,
      "reddit_digest_subreddits",
      JSON.stringify(next),
    );
    setSubreddits(next);
  };

  const addSubreddit = async (): Promise<void> => {
    const normalized = normalizeSubredditInput(draft);
    if (!normalized) {
      toast.error(
        "Subreddits may contain letters, numbers, and underscores only.",
      );
      return;
    }
    if (subreddits.includes(normalized)) {
      toast.error(`r/${normalized} is already configured.`);
      return;
    }

    setSaving(true);
    try {
      const result = (await window.api.invoke(
        IPC.REDDIT_VALIDATE_DIGEST_SUBREDDIT,
        normalized,
      )) as IpcMutationResult;
      if (!result.ok) {
        toast.error(result.error ?? `r/${normalized} could not be added.`);
        return;
      }
      await persist([...subreddits, normalized].sort());
      setDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add Reddit Digest subreddit.",
      );
    } finally {
      setSaving(false);
    }
  };

  const removeSubreddit = async (subreddit: string): Promise<void> => {
    setSaving(true);
    try {
      await persist(subreddits.filter((value) => value !== subreddit));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save Reddit Digest settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="onboarding-subreddit" className="text-sm font-medium">
          Add a subreddit
        </label>
        <div className="flex gap-2">
          <Input
            id="onboarding-subreddit"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addSubreddit();
              }
            }}
            placeholder="r/news"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void addSubreddit()}
            disabled={saving || loading || !draft.trim()}
          >
            {saving ? "Saving..." : "Add"}
          </Button>
        </div>
      </div>

      <section className="space-y-2" aria-label="Configured subreddits">
        <h3 className="text-sm font-medium">Subreddits</h3>
        {subreddits.length > 0 ? (
          <ul className="space-y-2">
            {subreddits.map((subreddit) => (
              <li
                key={subreddit}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="text-sm">r/{subreddit}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void removeSubreddit(subreddit)}
                  disabled={saving}
                  aria-label={`Remove r/${subreddit}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading subreddits..." : "No subreddits added yet."}
          </p>
        )}
      </section>

      <div className="sticky bottom-0 z-10 flex justify-end bg-background py-2">
        <Button type="button" onClick={onNext}>
          {subreddits.length === 0 ? "Skip for now" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
