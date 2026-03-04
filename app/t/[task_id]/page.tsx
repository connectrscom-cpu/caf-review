"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TaskViewer } from "@/components/TaskViewer";
import { DecisionPanel } from "@/components/DecisionPanel";
import { Button } from "@/components/ui/button";
import type { ReviewQueueRow } from "@/lib/types";

interface TaskDetailResponse {
  rowIndex: number;
  data: ReviewQueueRow;
}

export default function TaskPage() {
  const params = useParams();
  const router = useRouter();
  const task_id = typeof params.task_id === "string" ? params.task_id : "";

  const [data, setData] = useState<ReviewQueueRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    if (!task_id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/task/${encodeURIComponent(task_id)}`);
      if (res.status === 404) {
        setError("Task not found");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const json: TaskDetailResponse = await res.json();
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load task");
      setData(null);
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
              <TaskViewer data={data} />
            </div>
            <div>
              <DecisionPanel
                taskId={task_id}
                onSuccess={fetchTask}
                existingDecision={decision}
                existingNotes={notes}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
