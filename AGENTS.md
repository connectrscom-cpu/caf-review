# CAF Backend — Agent & Developer Guide

This repo is the **CAF Backend platform**, not just a review app. Read this for architecture, scope, and how to work on the project.

---

## Project Scope Change

The project previously built as **CAF Review Console** is now the **CAF Backend Platform**.

The CAF Backend is the **operational backend for the Content Automation Framework (CAF)**.

It hosts three major capabilities:

1. **Renderer API** — generate assets from JSON (Puppeteer + Handlebars)
2. **Template Playground** — preview and test carousel templates
3. **Content Review Console** — review and approve generated content

The renderer is integrated into this repo under `services/renderer` and must **not be rewritten**; it was **migrated** from the standalone caf-renderer project.

---

## Existing Renderer (Migrated)

CAF has a working renderer service (now in `services/renderer`).

The renderer is an Express + Puppeteer service that:

- accepts `POST /render` (one slide per request)
- uses Handlebars templates (`.hbs` in `templates/`)
- returns PNG screenshots
- supports **sync and async** rendering (`?async=1` + poll `/render/status/:id`)
- serves output at `GET /output/*`

Current endpoints:

- `POST /render` — render one slide
- `GET /render/status/:id` — async job status
- `GET /output/*` — static PNGs
- `GET /health` — health + version + uptime
- `GET /version` — version
- `GET /templates` — list template names

---

## Target CAF Backend Architecture

```
CAF Backend
│
├── Renderer Service     (services/renderer) — HTTP API for n8n + playground
├── Template Playground — visual preview of templates (Next.js app)
├── Review Console      — review generated content (Next.js app)
├── Supabase Integration — assets + tasks storage
└── Shared Renderer Engine — same Puppeteer + Handlebars for API and preview
```

The renderer engine is shared between:

- render API (n8n, batch jobs)
- template playground (live preview)

---

## Renderer Integration

The renderer runs as a module inside the CAF Backend repo (`services/renderer`).

Endpoints:

- `POST /render` — one slide (existing)
- `GET /render/status/:id` — async status (existing)
- `GET /output/*` — rendered images (existing)
- `POST /render-carousel` — render all slides (batch)
- `POST /preview-template` — used by template playground (single slide preview)

The same Puppeteer + Handlebars engine is reused everywhere.

---

## Template Playground

The CAF Backend includes a **template playground**.

Purpose: let developers preview and edit carousel templates visually.

Features:

- choose template
- paste slide JSON
- live preview
- tweak layout
- export slides

The playground uses the **same renderer engine** as the render API so preview and production renders are identical.

---

## Review Console

The review console (existing) remains part of the CAF Backend.

Responsibilities:

- browse tasks
- preview assets
- filter by project / run / platform
- approve / reject / needs edit

Data source: **Supabase** (`tasks`, `assets`).

---

## CAF Backend External API (n8n)

n8n interacts with the CAF Backend via HTTP.

Example flow:

```
n8n
  → POST RENDERER_BASE_URL/render (or /render-carousel)
  → CAF Renderer
  → Supabase Storage / tasks / assets
  → Review Console
```

The CAF Backend is the **central compute layer** of CAF. All render calls must use `RENDERER_BASE_URL` (env); no hardcoded tunnel URLs.

---

## Renderer Connectivity & Deployment Requirement

This is a **deployment and connectivity requirement**, not a feature. The app must **stop depending on Cloudflare Tunnel** by giving the renderer a stable deployment and URL.

### Current state (problem)

- The CAF Renderer was exposed via a Cloudflare Tunnel URL.
- The tunnel URL is ephemeral (changes); long requests can hit timeouts.
- n8n had to call this URL directly, so every run could require updating the URL.

### Target state (goal)

- The renderer is reachable at a **permanent, stable URL** (e.g. `https://renderer.mycaf.com`).
- n8n uses a single environment variable: **`RENDERER_BASE_URL`**.
- The CAF Backend has a **Renderer Settings / Health page** showing: current `RENDERER_BASE_URL`, `/health` status, renderer version, optional queue stats.

### Implementation requirements

1. **Abstract the renderer base URL** — All render calls use `process.env.RENDERER_BASE_URL` (or equivalent). No node or client hardcodes a tunnel URL.
2. **Health endpoints** — Renderer exposes `GET /health` (ok + version + uptime) and optionally `GET /version`.
3. **Async rendering by default** — Prefer `POST /render?async=1` + polling (or job-based endpoints); long sync requests are fragile behind tunnels and in some serverless environments.

### Deployment plan

- Deploy the renderer as a **containerized service** on a platform that supports Puppeteer (e.g. Railway, Fly.io, Render.com, ECS).
- Use a **stable URL** behind a domain (e.g. `renderer.<domain>`).

### Definition of done

- No manual URL changes per run.
- n8n calls `{{$env.RENDERER_BASE_URL}}/render` (or equivalent).
- Renderer is deployed once with a stable URL.
- CAF Backend can verify renderer availability via `/health`.

**Do not** "make Cloudflare Tunnel static." Tunnels are ephemeral. The correct approach is to **deploy the renderer** and stop relying on the tunnel.

---

## Repo Structure (Target)

```
CAF (this repo)
├── app/                    — Next.js: Review Console + Playground + Settings
├── services/
│   └── renderer/            — Express + Puppeteer renderer (server.js, templates/)
├── supabase/
│   └── migrations/
├── AGENTS.md                — this file
└── README.md
```

---

## Task Summary for AI / Developers

When working on this repo:

1. **Integrate / maintain the renderer** in `services/renderer`; do not rewrite its core logic.
2. **Expose renderer API** (existing + `/render-carousel`, `/preview-template` as needed).
3. **Template playground** — UI to choose template, paste JSON, preview (same renderer engine).
4. **Review console** — keep working (tasks, assets, decisions, Supabase).
5. **Use Supabase** for assets and tasks.
6. **RENDERER_BASE_URL** — all callers use this env; Renderer Health page shows status.
7. **Maintain n8n compatibility** — same contract for `POST /render`, async, and output URLs.
