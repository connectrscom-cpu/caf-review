"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { buildSlidesJson } from "@/lib/carousel-slides";
import type { NormalizedSlide } from "@/lib/carousel-slides";
import type { CarouselSlidesPayload } from "@/lib/carousel-slides";

export interface CarouselEditsProps {
  taskId: string;
  runId?: string;
  /** Edited slides from CarouselSlider */
  editedSlides: NormalizedSlide[];
  /** Raw parsed payload (for rebuilding JSON with unchanged keys) */
  rawPayload: CarouselSlidesPayload | null;
  /** Editable overrides (saved with decision + included in export) */
  finalTitleOverride: string;
  onFinalTitleOverrideChange: (value: string) => void;
  finalHookOverride: string;
  onFinalHookOverrideChange: (value: string) => void;
  /** Editable generated caption → final_caption_override */
  generatedCaption: string;
  onCaptionChange: (value: string) => void;
  /** Other task fields to include in export. Keys and current values. */
  extraFields?: Record<string, string>;
  /** When true, do not show Export button here (use separate block at end of review). */
  exportAtEnd?: boolean;
  /** Selected template for rework (dropdown). */
  templateKey?: string;
  onTemplateKeyChange?: (value: string) => void;
  /** List of template names for dropdown (from renderer). */
  templateOptions?: string[];
}

/**
 * Editable caption + "Export edited JSON" for rework flow.
 * Builds a JSON file with edited slides, caption, and task identifiers.
 */
export function CarouselEdits({
  taskId,
  runId,
  editedSlides,
  rawPayload,
  finalTitleOverride,
  onFinalTitleOverrideChange,
  finalHookOverride,
  onFinalHookOverrideChange,
  generatedCaption,
  onCaptionChange,
  extraFields = {},
  exportAtEnd = false,
  templateKey = "",
  onTemplateKeyChange,
  templateOptions = [],
}: CarouselEditsProps) {
  const exportEdited = useCallback(() => {
    const slidesPayload = buildSlidesJson(editedSlides, rawPayload);
    const payload = {
      task_id: taskId,
      run_id: runId || undefined,
      final_title_override: finalTitleOverride.trim() || undefined,
      final_hook_override: finalHookOverride.trim() || undefined,
      final_caption_override: generatedCaption.trim() || undefined,
      final_slides_json_override: slidesPayload,
      ...extraFields,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rework-${taskId}-edited.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [taskId, runId, editedSlides, rawPayload, finalTitleOverride, finalHookOverride, generatedCaption, extraFields]);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">Edits for rework</h3>

      <div className="grid gap-2">
        <Label className="text-xs">Final title override</Label>
        <input
          type="text"
          value={finalTitleOverride}
          onChange={(e) => onFinalTitleOverrideChange(e.target.value)}
          placeholder="Override title (saved with decision)"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <div className="grid gap-2">
        <Label className="text-xs">Final hook override</Label>
        <input
          type="text"
          value={finalHookOverride}
          onChange={(e) => onFinalHookOverrideChange(e.target.value)}
          placeholder="Override hook (saved with decision)"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {templateOptions.length > 0 && (
        <div className="grid gap-2">
          <Label className="text-xs">Template (for rework)</Label>
          <select
            value={templateKey}
            onChange={(e) => onTemplateKeyChange?.(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Keep current —</option>
            {templateOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-2">
        <Label className="text-xs">Final caption override</Label>
        <textarea
          value={generatedCaption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Override caption (saved with decision)"
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          rows={3}
        />
      </div>

      {!exportAtEnd && (
        <>
          <Button type="button" variant="outline" onClick={exportEdited} className="w-full">
            Export edited JSON (for rework flow)
          </Button>
          <p className="text-xs text-muted-foreground">
            Downloads a JSON file with edited slides, caption, and task id for the rework pipeline.
          </p>
        </>
      )}
    </div>
  );
}

/** Export-only block to place at the end of the review (after Decision). */
export interface CarouselEditsExportProps {
  taskId: string;
  runId?: string;
  editedSlides: NormalizedSlide[];
  rawPayload: CarouselSlidesPayload | null;
  finalTitleOverride: string;
  finalHookOverride: string;
  generatedCaption: string;
  templateKey?: string;
  extraFields?: Record<string, string>;
}

export function CarouselEditsExport({
  taskId,
  runId,
  editedSlides,
  rawPayload,
  finalTitleOverride,
  finalHookOverride,
  generatedCaption,
  templateKey,
  extraFields = {},
}: CarouselEditsExportProps) {
  const exportEdited = useCallback(() => {
    const slidesPayload = buildSlidesJson(editedSlides, rawPayload);
    const payload = {
      task_id: taskId,
      run_id: runId || undefined,
      final_title_override: finalTitleOverride.trim() || undefined,
      final_hook_override: finalHookOverride.trim() || undefined,
      final_caption_override: generatedCaption.trim() || undefined,
      final_slides_json_override: slidesPayload,
      ...(templateKey?.trim() && { template_key: templateKey.trim() }),
      ...extraFields,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rework-${taskId}-edited.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [taskId, runId, editedSlides, rawPayload, finalTitleOverride, finalHookOverride, generatedCaption, templateKey, extraFields]);

  return (
    <div className="space-y-2 rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">End of review</h3>
      <Button type="button" variant="outline" onClick={exportEdited} className="w-full">
        Export edited JSON (for rework flow)
      </Button>
      <p className="text-xs text-muted-foreground">
        Download JSON with edited slides, caption, and task id for the rework pipeline.
      </p>
    </div>
  );
}
