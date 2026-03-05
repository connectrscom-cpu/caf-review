"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WorkbenchFilters } from "@/components/WorkbenchFilters";
import { TaskTable } from "@/components/TaskTable";
import type { ReviewQueueRow } from "@/lib/types";
import type { GroupBy } from "@/components/TaskTable";

interface TasksResponse {
  items: ReviewQueueRow[];
  total: number;
  page: number;
  limit: number;
  statusCounts?: Record<string, number>;
  missingPreviewCount?: number;
  missing_columns?: string[];
}

interface FacetsResponse {
  project?: string[];
  run_id?: string[];
  platform?: string[];
  flow_type?: string[];
  recommended_route?: string[];
}

function WorkbenchContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<TasksResponse | null>(null);
  const [facets, setFacets] = useState<FacetsResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    searchParams.forEach((v, k) => q.set(k, v));
    return q.toString();
  }, [searchParams]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks?${queryString}`);
      if (!res.ok) throw new Error(await res.text());
      const json: TasksResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/facets")
      .then((r) => r.ok ? r.json() : {})
      .then((f: FacetsResponse) => {
        if (!cancelled) setFacets(f);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const groupBy = (searchParams.get("group") ?? "") as GroupBy;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card px-6 py-4">
        <h1 className="text-xl font-semibold text-card-foreground">CAF Review Console</h1>
        <p className="text-sm text-muted-foreground">Workbench</p>
      </header>

      <main className="flex gap-6 p-6">
        <div className="w-64 shrink-0">
          <WorkbenchFilters
            projectValues={facets.project ?? []}
            runIdValues={facets.run_id ?? []}
            platformValues={facets.platform ?? []}
            flowTypeValues={facets.flow_type ?? []}
            recommendedRouteValues={facets.recommended_route ?? []}
            reviewStatusValues={data?.statusCounts ? Object.keys(data.statusCounts) : undefined}
          />
        </div>

        <div className="min-w-0 flex-1">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}
          {loading && !data && (
            <div className="text-muted-foreground">Loading…</div>
          )}
          {data && !loading && (
            <TaskTable
              items={data.items}
              groupBy={groupBy}
              page={data.page}
              limit={data.limit}
              total={data.total}
              missingPreviewCount={data.missingPreviewCount}
              statusCounts={data.statusCounts}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default function WorkbenchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card px-6 py-4">
          <h1 className="text-xl font-semibold">CAF Review Console</h1>
          <p className="text-sm text-muted-foreground">Workbench</p>
        </header>
        <main className="flex gap-6 p-6">
          <div className="text-muted-foreground">Loading…</div>
        </main>
      </div>
    }>
      <WorkbenchContent />
    </Suspense>
  );
}
