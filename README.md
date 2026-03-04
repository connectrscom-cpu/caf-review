# CAF Review Console

Human validation console for the CAF pipeline. **Reads tasks and assets from your Supabase project** and **writes review decisions back to Supabase**. Optional webhook to notify n8n after each decision.

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

## Run locally

```bash
npm install
cp .env.example .env   # set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEW_WRITE_TOKEN
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy (Vercel)

1. Import the repo and add the env vars above.
2. Deploy.

## Routes

- **`/`** — Workbench: filter and list tasks from Supabase
- **`/r/[run_id]`** — Run view: list filtered by run, “Review next pending”
- **`/t/[task_id]`** — Task: preview (`preview_url` → `video_url` from assets → slides JSON) + decision panel

## API

- **`GET /api/tasks`** — List tasks (from Supabase), with filtering, sort, pagination
- **`GET /api/task/[task_id]`** — Single task (and first asset for video_url)
- **`POST /api/task/[task_id]/decision`** — Saves decision to Supabase (`tasks.decision`, `notes`, `rejection_tags`, `validator`, `submit`, `submitted_at`, `status`). If `DECISION_WEBHOOK_URL` is set, also POSTs the payload to that URL.

## Data flow

1. **Read**: `tasks` (+ first asset per task for video) → workbench and task detail.
2. **Write**: Submit decision → update `tasks` row in Supabase → optional webhook call.
