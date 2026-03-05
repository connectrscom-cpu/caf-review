"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_JSON = `{
  "body_slides": [
    { "headline": "Example headline", "body": "Example body text." }
  ],
  "cta_text": "See more",
  "cta_handle": "@handle"
}`;

export default function PlaygroundPage() {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [jsonInput, setJsonInput] = useState(DEFAULT_JSON);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/renderer/templates")
      .then((r) => r.json())
      .then((data: { ok?: boolean; templates?: string[] }) => {
        if (!cancelled && data.templates?.length) {
          setTemplates(data.templates);
          if (!selectedTemplate) setSelectedTemplate(data.templates[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (templates.length && !selectedTemplate) setSelectedTemplate(templates[0]);
  }, [templates, selectedTemplate]);

  const runPreview = useCallback(async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    try {
      let data: unknown;
      try {
        data = JSON.parse(jsonInput);
      } catch {
        setError("Invalid JSON");
        return;
      }
      const res = await fetch("/api/renderer/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: selectedTemplate, data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { error?: string }).error || res.statusText);
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [selectedTemplate, jsonInput]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <h1 className="text-xl font-semibold text-card-foreground">Template Playground</h1>
        <p className="text-sm text-muted-foreground">Preview carousel templates with your slide JSON</p>
      </header>

      <main className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Template</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              {templates.length === 0 && <option value="">Loading…</option>}
              {templates.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Slide data (JSON)</label>
            <textarea
              className="h-64 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              spellCheck={false}
            />
          </div>
          <button
            type="button"
            onClick={runPreview}
            disabled={loading || !selectedTemplate}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Rendering…" : "Preview slide 1"}
          </button>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">Preview</h2>
          {previewUrl && (
            <div className="rounded-lg border bg-card p-4">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-[500px] w-auto rounded border object-contain"
              />
            </div>
          )}
          {!previewUrl && !loading && (
            <p className="text-sm text-muted-foreground">Click &quot;Preview slide 1&quot; to render.</p>
          )}
        </div>
      </main>
    </div>
  );
}
