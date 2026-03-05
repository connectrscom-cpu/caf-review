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
}: DecisionPanelProps) {
  const [decision, setDecision] = useState<DecisionValue | "">(
    (existingDecision as DecisionValue) || ""
  );
  const [notes, setNotes] = useState(existingNotes);
  const [tags, setTags] = useState<string[]>([]);
  const [validator, setValidator] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token =
    typeof window !== "undefined"
      ? (document.cookie.match(/x-review-token=([^;]+)/)?.[1] ?? "")
      : "";

  const getToken = useCallback(() => {
    const t = process.env.NEXT_PUBLIC_REVIEW_WRITE_TOKEN ?? token;
    return (t || (typeof window !== "undefined" ? prompt("Review write token (REVIEW_WRITE_TOKEN):") : null)) ?? "";
  }, [token]);

  const submit = useCallback(async () => {
    if (!decision || !["APPROVED", "NEEDS_EDIT", "REJECTED"].includes(decision)) {
      setError("Select a decision: Approve, Needs Edit, or Reject");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/task/${encodeURIComponent(taskId)}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-review-token": getToken(),
        },
        body: JSON.stringify({
          decision,
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
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      onSuccess?.();
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
  ]);

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
          title="Shortcut: A"
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

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button onClick={submit} disabled={submitting}>
        {submitting ? "Submitting…" : "Submit decision"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Shortcuts: A (Approve), E (Needs Edit), R (Reject)
      </p>
    </div>
  );
}
