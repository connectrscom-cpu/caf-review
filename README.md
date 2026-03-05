# CAF Backend

Operational backend for the **Content Automation Framework (CAF)**. It hosts the **Renderer API** (generate assets from JSON), **Template Playground** (preview and test templates), and **Review Console** (review and approve generated content).

For architecture, scope change, renderer integration, and deployment requirements, see **[AGENTS.md](AGENTS.md)**.

This repo includes the Review Console (human validation), which reads tasks and assets from Supabase and writes review decisions back. Optional webhook notifies n8n after each decision.

## Supabase schema

The app expects your existing **CAF Storage** schema:

- **`tasks`** — one row per content task (`task_id`, `run_id`, `project`, `platform`, `flow_type`, `variation_name`, `status`, `recommended_route`, `preview_url`, …).
- **`assets`** — linked by `task_id`; used for `video_url` when the task has no `preview_url` (first asset’s `public_url`).
- **`runs`** — referenced by `tasks.run_id`.

**Review columns on `tasks`** (add if missing): run the migration in **Supabase → SQL Editor**:

```sql
-- See supabase/migrations/20250304000000_add_review_columns_to_tasks.sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS rejection_tags text,
  ADD COLUMN IF NOT EXISTS validator text,
  ADD COLUMN IF NOT EXISTS submit text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (Project Settings → API). Used server-side only. |
| `REVIEW_WRITE_TOKEN` | Yes | Secret for `x-review-token` header when submitting decisions |
| `DECISION_WEBHOOK_URL` | No | If set, app POSTs decision payload here after saving to Supabase (e.g. n8n) |
| `CACHE_TTL_SECONDS` | No | Cache for task list (default 15) |
| `NEXT_PUBLIC_APP_URL` | No | App URL for links |
| `NEXT_PUBLIC_REVIEW_WRITE_TOKEN` | No | Pre-fill token in browser (only if app is private) |
| `RENDERER_BASE_URL` | No* | Renderer base URL (e.g. `http://localhost:3333`). Required for Playground and Renderer Settings. n8n should use this for `/render` (no hardcoded tunnel). |

## Run locally

1. **Next.js app (Review Console, Playground, Settings)**

```bash
npm install
cp .env.example .env   # set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEW_WRITE_TOKEN, RENDERER_BASE_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

2. **Renderer (for Template Playground and n8n)**

```bash
cd services/renderer && npm install && npm start
```

Runs on port 3333. Set `RENDERER_BASE_URL=http://localhost:3333` in the main app `.env`.

## Deploy (Vercel)

1. Import the repo and add the env vars above.
2. Deploy.

## Routes

- **`/`** — Workbench: filter and list tasks from Supabase
- **`/r/[run_id]`** — Run view: list filtered by run, “Review next pending”
- **`/t/[task_id]`** — Task: preview + decision panel
- **`/playground`** — Template Playground: choose template, paste slide JSON, preview
- **`/settings/renderer`** — Renderer Settings / Health: RENDERER_BASE_URL, status, version

## API

- **`GET /api/tasks`** — List tasks (from Supabase), with filtering, sort, pagination
- **`GET /api/task/[task_id]`** — Single task (and first asset for video_url)
- **`POST /api/task/[task_id]/decision`** — Saves decision to Supabase
- **`GET /api/renderer/health`** — Renderer health (base_url, reachable, version, uptime)
- **`GET /api/renderer/templates`** — List template names from renderer
- **`POST /api/renderer/preview`** — Preview one slide (body: `{ template, data }`), returns PNG (`tasks.decision`, `notes`, `rejection_tags`, `validator`, `submit`, `submitted_at`, `status`). If `DECISION_WEBHOOK_URL` is set, also POSTs the payload to that URL.

## Data flow

1. **Read**: `tasks` (+ first asset per task for video) → workbench and task detail.
2. **Write**: Submit decision → update `tasks` row in Supabase → optional webhook call.
