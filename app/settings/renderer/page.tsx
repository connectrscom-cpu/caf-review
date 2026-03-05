"use client";

import { useEffect, useState } from "react";

interface HealthData {
  base_url: string;
  reachable: boolean;
  ok?: boolean;
  version?: string;
  uptime_seconds?: number;
  error?: string;
}

export default function RendererSettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/renderer/health")
      .then((r) => r.json())
      .then((data: HealthData) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealth({ base_url: "", reachable: false, error: "Request failed" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <h1 className="text-xl font-semibold text-card-foreground">Renderer Settings / Health</h1>
        <p className="text-sm text-muted-foreground">CAF Renderer connectivity and status</p>
      </header>

      <main className="p-6">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {!loading && health && (
          <div className="max-w-xl space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">RENDERER_BASE_URL</h2>
              <p className="font-mono text-sm break-all">{health.base_url || "(not set)"}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Status</h2>
              <p>
                {health.reachable ? (
                  <span className="text-green-600 dark:text-green-400">Reachable</span>
                ) : (
                  <span className="text-destructive">Not reachable</span>
                )}
              </p>
              {health.version != null && (
                <p className="mt-2 text-sm text-muted-foreground">Version: {health.version}</p>
              )}
              {health.uptime_seconds != null && (
                <p className="text-sm text-muted-foreground">Uptime: {health.uptime_seconds}s</p>
              )}
              {health.error && (
                <p className="mt-2 text-sm text-destructive">{health.error}</p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              n8n should use <code className="rounded bg-muted px-1">RENDERER_BASE_URL</code> (e.g.{" "}
              <code className="rounded bg-muted px-1">{health.base_url}/render</code>) with no hardcoded tunnel URL.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
