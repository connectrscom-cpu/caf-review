"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TaskViewer } from "@/components/TaskViewer";
import { DecisionPanel } from "@/components/DecisionPanel";
import { CarouselEdits, CarouselEditsExport } from "@/components/CarouselEdits";
import { Button } from "@/components/ui/button";
import { buildSlidesJson, createSyntheticSlides, parseSlidesFromJson } from "@/lib/carousel-slides";
import type { NormalizedSlide } from "@/lib/carousel-slides";
import type { ReviewQueueRow } from "@/lib/types";

interface TaskDetailResponse {
  rowIndex: number;
  data: ReviewQueueRow;
}

interface AssetsResponse {
  assets: { position: number; public_url: string }[];
}

export default function TaskPage() {
  const params = useParams();
  const router = useRouter();
  const task_id = typeof params.task_id === "string" ? params.task_id : "";

  const [data, setData] = useState<ReviewQueueRow | null>(null);
  const [assetUrls, setAssetUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { slides: initialSlides, raw: rawPayload } = useMemo(
    () => parseSlidesFromJson(data?.generated_slides_json?.trim() || undefined),
    [data?.generated_slides_json]
  );

  const [editedSlides, setEditedSlides] = useState<NormalizedSlide[]>([]);
  const [editedCaption, setEditedCaption] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedHook, setEditedHook] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [templateOptions, setTemplateOptions] = useState<string[]>([]);

  useEffect(() => {
    setEditedSlides([]);
  }, [task_id]);

  useEffect(() => {
    if (initialSlides.length > 0) {
      setEditedSlides((prev) => (prev.length !== initialSlides.length ? initialSlides : prev));
      return;
    }
    if (assetUrls.length > 0) {
      setEditedSlides((prev) =>
        prev.length !== assetUrls.length ? createSyntheticSlides(assetUrls.length) : prev
      );
    }
  }, [initialSlides, initialSlides.length, assetUrls.length]);

  useEffect(() => {
    if (!data) return;
    setEditedCaption((data.final_caption_override ?? data.generated_caption ?? "").trim());
    setEditedTitle((data.final_title_override ?? data.generated_title ?? "").trim());
    setEditedHook((data.final_hook_override ?? data.generated_hook ?? "").trim());
    setTemplateKey((data.template_key ?? "").trim());
  }, [data?.generated_caption, data?.generated_title, data?.generated_hook, data?.final_caption_override, data?.final_title_override, data?.final_hook_override, data?.template_key, data?.task_id]);

  useEffect(() => {
    fetch("/api/renderer/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: string[] }) => setTemplateOptions(Array.isArray(d.templates) ? d.templates : []))
      .catch(() => setTemplateOptions([]));
  }, []);

  const fetchTask = useCallback(async () => {
    if (!task_id) return;
    setLoading(true);
    setError(null);
    try {
      const [taskRes, assetsRes] = await Promise.all([
        fetch(`/api/task/${encodeURIComponent(task_id)}`),
        fetch(`/api/task/${encodeURIComponent(task_id)}/assets`),
      ]);
      if (taskRes.status === 404) {
        setError("Task not found");
        setData(null);
        setAssetUrls([]);
        return;
      }
      if (!taskRes.ok) throw new Error(await taskRes.text());
      const taskJson: TaskDetailResponse = await taskRes.json();
      setData(taskJson.data);
      if (assetsRes.ok) {
        const assetsJson: AssetsResponse = await assetsRes.json();
        setAssetUrls(
          (assetsJson.assets ?? [])
            .sort((a, b) => a.position - b.position)
            .map((a) => a.public_url)
        );
      } else {
        setAssetUrls([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load task");
      setData(null);
      setAssetUrls([]);
    } finally {
      setLoading(false);
    }
  }, [task_id]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const decision = useMemo(() => (data?.decision ?? "").trim(), [data?.decision]);
  const notes = useMemo(() => (data?.notes ?? "").trim(), [data?.notes]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (!hasEdits) {
          const btn = document.querySelector('[data-decision="APPROVED"]') as HTMLButtonElement;
          btn?.click();
        }
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        const btn = document.querySelector('[data-decision="NEEDS_EDIT"]') as HTMLButtonElement;
        btn?.click();
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const btn = document.querySelector('[data-decision="REJECTED"]') as HTMLButtonElement;
        btn?.click();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hasEdits]);

  const runId = (data?.run_id ?? "").trim();

  const hasEdits = useMemo(() => {
    if (!data) return false;
    const initialTitle = (data.final_title_override ?? data.generated_title ?? "").trim();
    const initialHook = (data.final_hook_override ?? data.generated_hook ?? "").trim();
    const initialCaption = (data.final_caption_override ?? data.generated_caption ?? "").trim();
    const initialTemplateKey = (data.template_key ?? "").trim();
    if (
      editedTitle !== initialTitle ||
      editedHook !== initialHook ||
      editedCaption !== initialCaption ||
      templateKey !== initialTemplateKey
    )
      return true;
    if (editedSlides.length !== initialSlides.length) return true;
    for (let i = 0; i < editedSlides.length; i++) {
      const a = editedSlides[i];
      const b = initialSlides[i];
      if (!b || a.headline !== b.headline || a.body !== b.body) return true;
    }
    return false;
  }, [
    data,
    editedTitle,
    editedHook,
    editedCaption,
    templateKey,
    editedSlides,
    initialSlides,
  ]);

  const finalSlidesJsonOverride =
    editedSlides.length > 0 && rawPayload !== undefined
      ? JSON.stringify(buildSlidesJson(editedSlides, rawPayload))
      : undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Workbench
          </Link>
          {runId && (
            <Link
              href={`/r/${encodeURIComponent(runId)}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Run: {runId}
            </Link>
          )}
          <h1 className="min-w-0 truncate text-base font-semibold text-card-foreground sm:text-lg">
            {task_id}
          </h1>
        </div>
      </header>

      <main className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading && !data && <div className="text-muted-foreground">Loading…</div>}

        {data && !loading && (
          <div className="grid gap-6 lg:grid-cols-[1fr,340px] lg:gap-8">
            <div className="min-w-0">
              <TaskViewer
                data={data}
                assetUrls={assetUrls}
                editedSlides={editedSlides.length > 0 ? editedSlides : undefined}
                onSlidesChange={setEditedSlides}
                fallbackPreviewUrl={assetUrls?.[0]}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <CarouselEdits
                taskId={task_id}
                runId={runId || undefined}
                editedSlides={editedSlides}
                rawPayload={rawPayload ?? null}
                finalTitleOverride={editedTitle}
                onFinalTitleOverrideChange={setEditedTitle}
                finalHookOverride={editedHook}
                onFinalHookOverrideChange={setEditedHook}
                generatedCaption={editedCaption}
                onCaptionChange={setEditedCaption}
                extraFields={{
                  generated_title: (data.generated_title ?? "").trim(),
                  generated_hook: (data.generated_hook ?? "").trim(),
                }}
                exportAtEnd
                templateKey={templateKey}
                onTemplateKeyChange={setTemplateKey}
                templateOptions={templateOptions}
              />
              <DecisionPanel
                taskId={task_id}
                onSuccess={fetchTask}
                existingDecision={decision}
                existingNotes={notes}
                finalTitleOverride={editedTitle}
                finalHookOverride={editedHook}
                finalCaptionOverride={editedCaption}
                finalSlidesJsonOverride={finalSlidesJsonOverride}
                templateKey={templateKey}
                hasEdits={hasEdits}
              />
              <CarouselEditsExport
                taskId={task_id}
                runId={runId || undefined}
                editedSlides={editedSlides}
                rawPayload={rawPayload ?? null}
                finalTitleOverride={editedTitle}
                finalHookOverride={editedHook}
                generatedCaption={editedCaption}
                templateKey={templateKey}
                extraFields={{
                  generated_title: (data.generated_title ?? "").trim(),
                  generated_hook: (data.generated_hook ?? "").trim(),
                }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
