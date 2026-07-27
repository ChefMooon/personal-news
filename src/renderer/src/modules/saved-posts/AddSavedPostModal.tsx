import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  IPC,
  type CreateSavedPostRequest,
  type PreviewSavedPostMetadataRequest,
  type SavedPostMetadataPreview,
} from "../../../../shared/ipc-types";
import {
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
} from "lucide-react";

interface AddSavedPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function AddSavedPostModal({
  open,
  onOpenChange,
  onSaved,
}: AddSavedPostModalProps): React.ReactElement {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<SavedPostMetadataPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [urlValidation, setUrlValidation] = useState<"idle" | "valid" | "invalid">("idle");

  useEffect(() => {
    if (!open) return;

    window.api
      .invoke(IPC.REDDIT_GET_ALL_TAGS)
      .then((result) => setAllTags(result as string[]))
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Failed to load managed tags.",
        );
      });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setNote("");
      setSelectedTags([]);
      setNewTag("");
      setSaving(false);
      setShowPreview(false);
      setPreview(null);
      setPreviewLoading(false);
    }
  }, [open]);

  const managedTagSuggestions = useMemo(() => {
    const query = newTag.trim().toLowerCase();

    return allTags
      .filter((tag) => !selectedTags.includes(tag))
      .filter((tag) => (query ? tag.toLowerCase().includes(query) : true))
      .slice(0, 8);
  }, [allTags, newTag, selectedTags]);

  const getUrlValidationState = (value: string): "idle" | "valid" | "invalid" => {
    const trimmed = value.trim();
    if (!trimmed) return "idle";

    if (!/^https?:\/\//i.test(trimmed)) return "invalid";

    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  };

  const loadPreview = async (): Promise<void> => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setPreview(null);
      return;
    }

    if (getUrlValidationState(trimmedUrl) !== "valid") {
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    try {
      const payload: PreviewSavedPostMetadataRequest = {
        url: trimmedUrl,
        note: note.trim() || null,
      };
      const result = await window.api.invoke(
        IPC.REDDIT_PREVIEW_SAVED_POST_METADATA,
        payload,
      );
      setPreview(result as SavedPostMetadataPreview);
    } catch (err) {
      setPreview(null);
      toast.error(
        err instanceof Error ? err.message : "Failed to preview metadata.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const nextState = getUrlValidationState(url);
    setUrlValidation(nextState);

    if (!showPreview || nextState !== "valid") {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadPreview();
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [open, showPreview, url, note]);

  const addTag = (): void => {
    const candidate = newTag.trim();
    if (!candidate) return;

    setSelectedTags((current) => normalizeTags([...current, candidate]));
    setNewTag("");
  };

  const handleUrlPaste = (event: React.ClipboardEvent<HTMLInputElement>): void => {
    const pasted = event.clipboardData.getData("text");
    if (pasted) {
      event.preventDefault();
      setUrl(pasted);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error("Please enter a URL.");
      return;
    }

    if (getUrlValidationState(trimmedUrl) !== "valid") {
      toast.error("Please enter a valid HTTP or HTTPS URL.");
      return;
    }

    setSaving(true);
    try {
      const payload: CreateSavedPostRequest = {
        url: trimmedUrl,
        note: note.trim() || null,
        tags: normalizeTags(selectedTags),
      };

      const result = await window.api.invoke(IPC.REDDIT_CREATE_SAVED_POST, payload);
      const response = result as { ok?: boolean; error?: string | null };
      if (!response.ok) {
        toast.error(response.error ?? "Failed to save post.");
        return;
      }

      toast.success("Saved post added.");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save post.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[calc(100dvh-2rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add saved post</DialogTitle>
          <DialogDescription>
            Save a link directly to Saved Posts without sending it through ntfy.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto px-1">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="saved-post-url">
              URL
            </label>
            <div className="relative">
              <Input
                id="saved-post-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onPaste={handleUrlPaste}
                placeholder="https://example.com"
                aria-invalid={urlValidation === "invalid"}
                className={`pr-10 ${urlValidation === "invalid" ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
              {urlValidation === "valid" ? (
                <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
              ) : null}
              {urlValidation === "invalid" ? (
                <CircleAlert className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-destructive" />
              ) : null}
            </div>
            <p className={`text-xs ${urlValidation === "valid" ? "text-emerald-600" : urlValidation === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>
              {urlValidation === "valid"
                ? "This link looks valid."
                : urlValidation === "invalid"
                  ? "Enter a valid HTTP or HTTPS link."
                  : "Paste or type a link to validate it."}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="saved-post-note">
              Note
            </label>
            <textarea
              id="saved-post-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              placeholder="Add an optional note"
              className="flex max-h-40 min-h-[96px] w-full resize-y overflow-visible overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">Tags</label>
              <span className="text-xs text-muted-foreground">
                {selectedTags.length} selected
              </span>
            </div>
            <div className="flex max-h-24 min-h-10 flex-wrap gap-1 overflow-y-auto rounded-md border border-dashed px-3 py-2">
              {selectedTags.length > 0 ? (
                selectedTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTags((current) => current.filter((value) => value !== tag))
                      }
                      className="hover:text-destructive"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No tags yet.</span>
              )}
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Input
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  placeholder="Add a tag"
                  className="overflow-visible"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                {managedTagSuggestions.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-background p-2 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>Managed tags</span>
                      <span>{managedTagSuggestions.length} suggestions</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {managedTagSuggestions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setSelectedTags((current) => normalizeTags([...current, tag]));
                            setNewTag("");
                          }}
                          className="rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <Button type="button" variant="outline" onClick={addTag} className="shrink-0">
                <Plus className="h-4 w-4" />
                Add tag
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-muted/20">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
              onClick={async () => {
                const nextValue = !showPreview;
                setShowPreview(nextValue);
                if (nextValue) {
                  await loadPreview();
                }
              }}
            >
              <span>Metadata preview</span>
              {showPreview ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            {showPreview ? (
              <div className="border-t px-3 py-3 text-sm text-muted-foreground">
                {previewLoading ? (
                  <p>Loading metadata preview...</p>
                ) : preview ? (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Title
                      </p>
                      <p className="font-medium text-foreground">{preview.title}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-background px-2 py-1">
                        Source: {preview.source}
                      </span>
                      {preview.subreddit ? (
                        <span className="rounded-full bg-background px-2 py-1">
                          Subreddit: {preview.subreddit}
                        </span>
                      ) : null}
                      {preview.author ? (
                        <span className="rounded-full bg-background px-2 py-1">
                          Author: {preview.author}
                        </span>
                      ) : null}
                    </div>
                    {preview.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {preview.tags.map((tag) => (
                          <span key={tag} className="rounded-full border px-2 py-1 text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p>
                    {url.trim()
                      ? "Preview is unavailable for this URL yet."
                      : "Enter a URL to preview its detected metadata."}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Saving..." : "Save post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
