"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TaskViewer } from "@/components/TaskViewer";
import { DecisionPanel } from "@/components/DecisionPanel";
import { CarouselEdits } from "@/components/CarouselEdits";
import { Button } from "@/components/ui/button";
import { buildSlidesJson, parseSlidesFromJson } from "@/lib/carousel-slides";
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

  useEffect(() => {
    setEditedSlides([]);
  }, [task_id]);

  useEffect(() => {
    if (initialSlides.length === 0 || editedSlides.length > 0) return;
    setEditedSlides(initialSlides);
  }, [initialSlides, editedSlides.length]);

  useEffect(() => {
    if (!data) return;
    setEditedCaption((data.generated_caption ?? "").trim());
    setEditedTitle((data.final_title_override ?? data.generated_title ?? "").trim());
    setEditedHook((data.final_hook_override ?? data.generated_hook ?? "").trim());
  }, [data?.generated_caption, data?.generated_title, data?.generated_hook, data?.final_title_override, data?.final_hook_override, data?.task_id]);

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
        const btn = document.querySelector('[data-decision="APPROVED"]') as HTMLButtonElement;
        btn?.click();
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
  }, []);

  const runId = (data?.run_id ?? "").trim();

  const finalSlidesJsonOverride =
    editedSlides.length > 0 && rawPayload !== undefined
      ? JSON.stringify(buildSlidesJson(editedSlides, rawPayload))
      : undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            ← Workbench
          </Link>
          {runId && (
            <Link
              href={`/r/${encodeURIComponent(runId)}`}
              className="text-muted-foreground hover:text-foreground"
            >
              Run: {runId}
            </Link>
          )}
          <h1 className="truncate text-lg font-semibold text-card-foreground">
            {task_id}
          </h1>
        </div>
      </header>

      <main className="p-6">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading && !data && <div className="text-muted-foreground">Loading…</div>}

        {data && !loading && (
          <div className="grid gap-8 lg:grid-cols-[1fr,340px]">
            <div>
              <TaskViewer
                data={data}
                assetUrls={assetUrls}
                editedSlides={editedSlides.length > 0 ? editedSlides : undefined}
                onSlidesChange={setEditedSlides}
                fallbackPreviewUrl={assetUrls?.[0]}
              />
            </div>
            <div className="flex flex-col gap-6">
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
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
