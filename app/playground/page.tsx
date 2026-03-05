"use client";

import Handlebars from "handlebars";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_JSON = `{
  "cover": "5 hooks to fix your landing page",
  "cover_subtitle": "Swipe through before your next launch",

  "body_slides": [
    {
      "headline": "1. Make it about *them*",
      "body": "Replace “we” and “our” with “you” and “your” so visitors instantly see what they get."
    },
    {
      "headline": "2. Kill vague CTAs",
      "body": "Swap “Learn more” for concrete actions like “See pricing”, “Get the checklist” or “Book a demo”."
    },
    {
      "headline": "3. Show proof fast",
      "body": "Add 1–2 sharp proof points above the fold: logos, quick metrics or a short testimonial."
    }
  ],

  "cta_text": "Save this playbook",
  "cta_handle": "@yourbrand"
}`;

const STARTER_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1350">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; }
    .slide { width: 1080px; height: 1350px; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 80px; text-align: center; }
    .slide-inner { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .cover-title { font-size: 72px; font-weight: 700; margin-bottom: 24px; }
    .cover-subtitle { font-size: 36px; opacity: 0.9; }
    .body-title { font-size: 56px; font-weight: 600; margin-bottom: 20px; color: #a78bfa; }
    .body-text { font-size: 32px; line-height: 1.5; max-width: 700px; }
    .cta-text { font-size: 64px; font-weight: 700; color: #34d399; }
    .cta-handle { font-size: 40px; margin-top: 16px; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="slide-inner">
      <h1 class="cover-title">{{#if cover}}{{cover}}{{else}}Title{{/if}}</h1>
      {{#if cover_subtitle}}<p class="cover-subtitle">{{cover_subtitle}}</p>{{/if}}
    </div>
  </div>
  {{#each body_slides}}
  <div class="slide">
    <div class="slide-inner">
      <h2 class="body-title">{{headline}}</h2>
      <p class="body-text">{{body}}</p>
    </div>
  </div>
  {{/each}}
  <div class="slide">
    <div class="slide-inner">
      <span class="cta-text">{{#if cta_text}}{{cta_text}}{{/if}}</span>
      {{#if cta_handle}}<span class="cta-handle">{{cta_handle}}</span>{{/if}}
    </div>
  </div>
</body>
</html>`;

export default function PlaygroundPage() {
  const [activeTab, setActiveTab] = useState<"preview" | "design">("preview");
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [jsonInput, setJsonInput] = useState(DEFAULT_JSON);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Design tab state
  const [templateName, setTemplateName] = useState("my_carousel");
  const [templateHtml, setTemplateHtml] = useState(STARTER_TEMPLATE);
  const [designJson, setDesignJson] = useState(DEFAULT_JSON);
  const [designPreviewError, setDesignPreviewError] = useState<string | null>(null);
  const [designLoadError, setDesignLoadError] = useState<string | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const designDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [backendTemplateNames, setBackendTemplateNames] = useState<string[]>([]);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: { ok?: boolean; names?: string[] }) => {
        if (!cancelled && Array.isArray(data.names)) setBackendTemplateNames(data.names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (templates.length && !selectedTemplate) setSelectedTemplate(templates[0]);
  }, [templates, selectedTemplate]);

  const allTemplatesForDesign = [...new Set([...templates, ...backendTemplateNames])].sort();

  useEffect(() => {
    if (allTemplatesForDesign.length && selectedTemplate && !allTemplatesForDesign.includes(selectedTemplate)) {
      setSelectedTemplate(allTemplatesForDesign[0]);
    }
  }, [allTemplatesForDesign, selectedTemplate]);

  // Live preview for Design tab: debounced Handlebars compile + iframe inject
  useEffect(() => {
    if (activeTab !== "design" || !previewIframeRef.current) return;
    if (designDebounceRef.current) clearTimeout(designDebounceRef.current);
    designDebounceRef.current = setTimeout(() => {
      try {
        let data: unknown;
        try {
          data = JSON.parse(designJson);
        } catch {
          setDesignPreviewError("Invalid JSON");
          return;
        }
        setDesignPreviewError(null);
        const compiled = Handlebars.compile(templateHtml);
        const html = compiled(data as Record<string, unknown>);
        const iframe = previewIframeRef.current;
        if (iframe?.contentDocument) {
          iframe.contentDocument.open();
          iframe.contentDocument.write(html);
          iframe.contentDocument.close();
        }
      } catch (e) {
        setDesignPreviewError(e instanceof Error ? e.message : "Template error");
      }
    }, 400);
    return () => {
      if (designDebounceRef.current) clearTimeout(designDebounceRef.current);
    };
  }, [activeTab, templateHtml, designJson]);

  const runPreview = useCallback(async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    setPreviewUrls([]);
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

  const loadTemplateForEdit = useCallback(async (name: string) => {
    if (!name) return;
    setDesignLoadError(null);
    try {
      let res = await fetch(`/api/renderer/template-source?name=${encodeURIComponent(name)}`);
      let json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; source?: string };
      if (!res.ok || !json?.source) {
        res = await fetch(`/api/templates/${encodeURIComponent(name)}`);
        json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; source?: string };
      }
      if (!res.ok || !json?.source) {
        setDesignLoadError(json?.error || res.statusText || "Failed to load template");
        return;
      }
      const baseName = name.replace(/\.hbs$/i, "");
      setTemplateName(baseName);
      setTemplateHtml(json.source);
      setDesignJson(DEFAULT_JSON);
    } catch (e) {
      setDesignLoadError(e instanceof Error ? e.message : "Failed to load template");
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "design" || !editTemplateName) return;
    loadTemplateForEdit(editTemplateName);
  }, [activeTab, editTemplateName, loadTemplateForEdit]);

  const saveToBackend = useCallback(
    async (nameToSave: string) => {
      const finalName = nameToSave.trim().replace(/[^a-zA-Z0-9_.-]/g, "_") || "template";
      const nameWithExt = finalName.endsWith(".hbs") ? finalName : `${finalName}.hbs`;
      setSaveStatus("saving");
      setSaveMessage(null);
      try {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nameWithExt, source: templateHtml }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; name?: string };
        if (!res.ok || !data.ok) {
          setSaveStatus("error");
          setSaveMessage(data.error || res.statusText || "Save failed");
          return;
        }
        setSaveStatus("ok");
        setSaveMessage(`Saved as ${data.name ?? nameWithExt}`);
        setTemplateName(finalName.replace(/\.hbs$/i, ""));
        setBackendTemplateNames((prev) => (prev.includes(nameWithExt) ? prev : [...prev, nameWithExt].sort()));
        setTimeout(() => {
          setSaveStatus("idle");
          setSaveMessage(null);
        }, 3000);
      } catch (e) {
        setSaveStatus("error");
        setSaveMessage(e instanceof Error ? e.message : "Save failed");
      }
    },
    [templateHtml]
  );

  const handleSaveOverwrite = useCallback(() => {
    const name = templateName.trim() || editTemplateName.replace(/\.hbs$/i, "") || "template";
    saveToBackend(name);
  }, [templateName, editTemplateName, saveToBackend]);

  const handleSaveAsNew = useCallback(() => {
    const newName = window.prompt("Save as new template (name):", templateName.trim() || "my_carousel");
    if (newName == null || !newName.trim()) return;
    saveToBackend(newName.trim());
  }, [templateName, saveToBackend]);

  const runPreviewAll = useCallback(async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    setPreviewUrls([]);
    try {
      let data: unknown;
      try {
        data = JSON.parse(jsonInput);
      } catch {
        setError("Invalid JSON");
        return;
      }
      const res = await fetch("/api/renderer/preview-carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: selectedTemplate, data }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; urls?: string[] };
      if (!res.ok) {
        setError(json.error || res.statusText);
        return;
      }
      if (json.ok && Array.isArray(json.urls) && json.urls.length > 0) {
        setPreviewUrls(json.urls);
      } else {
        setError(json.error || "No slides returned");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [selectedTemplate, jsonInput]);

  const handleDesignDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      if (name.endsWith(".css")) {
        setTemplateHtml(
          `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=1080, height=1350">\n<style>\n${content}\n</style>\n</head>\n<body>\n  <div class="slide"><div class="slide-inner"><h1>{{cover}}</h1><p>{{cover_subtitle}}</p></div></div>\n  {{#each body_slides}}\n  <div class="slide"><div class="slide-inner"><h2>{{headline}}</h2><p>{{body}}</p></div></div>\n  {{/each}}\n  <div class="slide"><div class="slide-inner"><p>{{cta_text}}</p><p>{{cta_handle}}</p></div></div>\n</body>\n</html>`
        );
      } else {
        setTemplateHtml(content);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDesignDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDesignFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      if (name.endsWith(".css")) {
        setTemplateHtml(
          `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=1080, height=1350">\n<style>\n${content}\n</style>\n</head>\n<body>\n  <div class="slide"><div class="slide-inner"><h1>{{cover}}</h1><p>{{cover_subtitle}}</p></div></div>\n  {{#each body_slides}}\n  <div class="slide"><div class="slide-inner"><h2>{{headline}}</h2><p>{{body}}</p></div></div>\n  {{/each}}\n  <div class="slide"><div class="slide-inner"><p>{{cta_text}}</p><p>{{cta_handle}}</p></div></div>\n</body>\n</html>`
        );
      } else {
        setTemplateHtml(content);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <h1 className="text-xl font-semibold text-card-foreground">Template Playground</h1>
        <p className="text-sm text-muted-foreground">Preview carousel templates or design new ones with live preview</p>
        <nav className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${activeTab === "preview" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("design")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${activeTab === "design" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            Design
          </button>
        </nav>
      </header>

      {activeTab === "preview" && (
        <main className="grid gap-6 p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Template</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                {allTemplatesForDesign.length === 0 && <option value="">Loading…</option>}
                {allTemplatesForDesign.map((t) => (
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runPreview}
                disabled={loading || !selectedTemplate}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Rendering…" : "Preview slide 1"}
              </button>
              <button
                type="button"
                onClick={runPreviewAll}
                disabled={loading || !selectedTemplate}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                Preview all slides
              </button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Preview</h2>
            {previewUrl && (
              <div className="rounded-lg border bg-card p-4">
                <img
                  src={previewUrl}
                  alt="Preview slide 1"
                  className="max-h-[500px] w-auto rounded border object-contain"
                />
              </div>
            )}
            {previewUrls.length > 0 && (
              <div className="space-y-4 rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{previewUrls.length} slide(s)</p>
                <div className="flex flex-col gap-4 overflow-auto max-h-[70vh]">
                  {previewUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Slide ${i + 1}`}
                      className="max-h-[500px] w-auto rounded border object-contain"
                    />
                  ))}
                </div>
              </div>
            )}
            {!previewUrl && previewUrls.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">Click &quot;Preview slide 1&quot; or &quot;Preview all slides&quot; to render.</p>
            )}
          </div>
        </main>
      )}

      {activeTab === "design" && (
        <main className="grid gap-6 p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Edit template</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={editTemplateName}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTemplateName(v);
                  if (!v) {
                    setTemplateHtml(STARTER_TEMPLATE);
                    setTemplateName("my_carousel");
                    setDesignLoadError(null);
                  }
                }}
              >
                <option value="">New template</option>
                {allTemplatesForDesign.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Pick one to edit, or start from New template.</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Template name (for save)</label>
              <input
                type="text"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="my_carousel"
              />
            </div>

            <div
              onDrop={handleDesignDrop}
              onDragOver={handleDesignDragOver}
              className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center"
            >
              <p className="mb-2 text-sm text-muted-foreground">Drop HTML, CSS or .hbs file here</p>
              <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                <input type="file" accept=".html,.htm,.hbs,.css" className="sr-only" onChange={handleDesignFileInput} />
                Or click to choose file
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Template (HTML + Handlebars)</label>
              <textarea
                className="h-72 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                value={templateHtml}
                onChange={(e) => setTemplateHtml(e.target.value)}
                spellCheck={false}
                placeholder="Full HTML with {{...}} placeholders"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Preview data (JSON)</label>
              <textarea
                className="h-40 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                value={designJson}
                onChange={(e) => setDesignJson(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveOverwrite}
                disabled={saveStatus === "saving"}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saveStatus === "saving" ? "Saving…" : "Save (overwrite)"}
              </button>
              <button
                type="button"
                onClick={handleSaveAsNew}
                disabled={saveStatus === "saving"}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                Save as new
              </button>
            </div>
            {saveStatus === "ok" && saveMessage && <p className="text-sm text-green-600 dark:text-green-400">{saveMessage}</p>}
            {saveStatus === "error" && saveMessage && <p className="text-sm text-destructive">{saveMessage}</p>}
            {designPreviewError && <p className="text-sm text-destructive">{designPreviewError}</p>}
            {designLoadError && <p className="text-sm text-destructive">{designLoadError}</p>}
            <p className="text-xs text-muted-foreground">
              Templates are saved in the CAF backend. Set <code className="rounded bg-muted px-1">CAF_TEMPLATE_API_URL</code> on the renderer to your CAF app URL so it uses saved templates.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Live preview</h2>
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Updates as you type. Scaled for layout; final PNGs come from the renderer.
              </div>
              <div className="overflow-auto max-h-[520px] bg-muted/20 p-4">
                <div
                  className="relative rounded border border-border bg-white overflow-hidden"
                  style={{ width: "378px", height: "473px" }}
                >
                  <div
                    className="absolute left-0 top-0"
                    style={{
                      width: "1080px",
                      height: "1350px",
                      transform: "scale(0.35)",
                      transformOrigin: "top left",
                    }}
                  >
                    <iframe
                      ref={previewIframeRef}
                      title="Design preview"
                      className="border-0 bg-white block"
                      sandbox="allow-same-origin"
                      style={{ width: "1080px", height: "1350px" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
