"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DecisionValue } from "@/lib/types";

const REJECTION_TAG_OPTIONS = [
  "Quality",
  "Factual",
  "Tone",
  "Brand",
  "Length",
  "Wrong platform",
  "Other",
];

export interface DecisionPanelProps {
  taskId: string;
  onSuccess?: () => void;
  existingDecision?: string;
  existingNotes?: string;
  /** Overrides to save with decision (final_*_override columns) */
  finalTitleOverride?: string;
  finalHookOverride?: string;
  finalCaptionOverride?: string;
  finalSlidesJsonOverride?: string;
  /** Template for rework (saved with decision, used when re-rendering) */
  templateKey?: string;
  /** When true, Approve is disabled; any change must go through Needs Edit */
  hasEdits?: boolean;
  /** Short list of what changed (e.g. ["Title", "Slide 2"]) when hasEdits is true */
  editsSummary?: string[];
}

export function DecisionPanel({
  taskId,
  onSuccess,
  existingDecision,
  existingNotes = "",
  finalTitleOverride,
  finalHookOverride,
  finalCaptionOverride,
  finalSlidesJsonOverride,
  templateKey,
  hasEdits = false,
  editsSummary = [],
}: DecisionPanelProps) {
  const [decision, setDecision] = useState<DecisionValue | "">(
    (existingDecision as DecisionValue) || ""
  );
  const [notes, setNotes] = useState(existingNotes);
  const [tags, setTags] = useState<string[]>([]);
  const [validator, setValidator] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const token =
    typeof window !== "undefined"
      ? (document.cookie.match(/x-review-token=([^;]+)/)?.[1] ?? "")
      : "";

  const hasToken = !!(process.env.NEXT_PUBLIC_REVIEW_WRITE_TOKEN || token);

  const getToken = useCallback(() => {
    return (process.env.NEXT_PUBLIC_REVIEW_WRITE_TOKEN ?? token ?? "").trim();
  }, [token]);

  const submit = useCallback(async () => {
    if (!decision || !["APPROVED", "NEEDS_EDIT", "REJECTED"].includes(decision)) {
      setError("Select a decision: Approve, Needs Edit, or Reject");
      return;
    }
    const authToken = getToken();
    if (!authToken) {
      setError("Review write token required. Set NEXT_PUBLIC_REVIEW_WRITE_TOKEN in Vercel, or enter it below and click Save.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const effectiveDecision = decision === "APPROVED" && hasEdits ? "NEEDS_EDIT" : decision;
    try {
      const res = await fetch(`/api/task/${encodeURIComponent(taskId)}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-review-token": authToken,
        },
        body: JSON.stringify({
          decision: effectiveDecision,
          notes: notes.trim() || undefined,
          rejection_tags: tags,
          validator: validator.trim() || undefined,
          ...(finalTitleOverride !== undefined && { final_title_override: finalTitleOverride }),
          ...(finalHookOverride !== undefined && { final_hook_override: finalHookOverride }),
          ...(finalCaptionOverride !== undefined && { final_caption_override: finalCaptionOverride }),
          ...(finalSlidesJsonOverride !== undefined && { final_slides_json_override: finalSlidesJsonOverride }),
          ...(templateKey !== undefined && { template_key: templateKey || null }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 401
            ? "Unauthorized: set REVIEW_WRITE_TOKEN in Vercel and send the same value (NEXT_PUBLIC_REVIEW_WRITE_TOKEN or Save token below)."
            : json.error ?? `HTTP ${res.status}`;
        setError(msg);
        return;
      }
      setSubmittedMessage(effectiveDecision === "APPROVED" ? "Approved" : "Decision submitted");
      setTimeout(() => onSuccess?.(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }, [
    decision,
    notes,
    tags,
    validator,
    taskId,
    onSuccess,
    getToken,
    finalTitleOverride,
    finalHookOverride,
    finalCaptionOverride,
    finalSlidesJsonOverride,
    templateKey,
    hasEdits,
  ]);

  const saveTokenToCookie = useCallback(() => {
    const val = tokenInput.trim();
    if (!val || typeof document === "undefined") return;
    document.cookie = `x-review-token=${encodeURIComponent(val)}; path=/; max-age=31536000; samesite=strict`;
    setError(null);
  }, [tokenInput]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">Decision</h3>

      <div className="flex flex-wrap gap-2">
        <Button
          data-decision="APPROVED"
          variant={decision === "APPROVED" ? "success" : "outline"}
          size="sm"
          onClick={() => setDecision("APPROVED")}
          title={hasEdits ? "Not available when edits are made (use Needs Edit)" : "Shortcut: A"}
          disabled={hasEdits}
        >
          Approve
        </Button>
        <Button
          data-decision="NEEDS_EDIT"
          variant={decision === "NEEDS_EDIT" ? "warning" : "outline"}
          size="sm"
          onClick={() => setDecision("NEEDS_EDIT")}
          title="Shortcut: E"
        >
          Needs Edit
        </Button>
        <Button
          data-decision="REJECTED"
          variant={decision === "REJECTED" ? "destructive" : "outline"}
          size="sm"
          onClick={() => setDecision("REJECTED")}
          title="Shortcut: R"
        >
          Reject
        </Button>
      </div>
      {hasEdits && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Approve is only for no edits. Use <strong>Needs Edit</strong> when you changed:
          </p>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400" title="Revert these to allow Approve">
            {editsSummary.length > 0 ? editsSummary.join(" · ") : "—"}
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <Label className="text-xs">Notes</Label>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Optional notes for downstream"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label className="text-xs">Rejection tags</Label>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Using rejection tags will require a <strong>full rework</strong> of the video/carousel. Text or template overrides alone only trigger a re-render.
        </p>
        <div className="flex flex-wrap gap-2">
          {REJECTION_TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                tags.includes(tag)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-muted"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label className="text-xs">Validator</Label>
        <input
          type="text"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Your name or ID"
          value={validator}
          onChange={(e) => setValidator(e.target.value)}
        />
      </div>

      {!hasToken && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            Review write token required to submit decisions
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">REVIEW_WRITE_TOKEN</code> and{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">NEXT_PUBLIC_REVIEW_WRITE_TOKEN</code> in
            Vercel (or .env), or enter the token below and save (stored in this browser).
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              placeholder="Paste token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="button" variant="secondary" size="sm" onClick={saveTokenToCookie} disabled={!tokenInput.trim()}>
              Save token
            </Button>
          </div>
        </div>
      )}

      {submittedMessage && (
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          {submittedMessage}. Taking you back to queue…
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button onClick={submit} disabled={submitting || !!submittedMessage}>
        {submitting ? "Submitting…" : submittedMessage ? "Submitted" : "Submit decision"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Shortcuts: A (Approve), E (Needs Edit), R (Reject)
      </p>
    </div>
  );
}
