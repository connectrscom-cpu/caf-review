# CAF Backend — Agent & Developer Guide

This repo is the **CAF Backend platform**, not just a review app. Read this for architecture, scope, and how to work on the project.

---

## Project scope

The CAF Backend is the **operational backend for the Content Automation Framework (CAF)**. It hosts three capabilities:

1. **Renderer API** — generate assets from JSON (Puppeteer + Handlebars)
2. **Template Playground** — preview and test carousel templates
3. **Content Review Console** — review and approve generated content (only tasks in the Validation Review Queue)

The renderer lives in `services/renderer` and was **migrated** from the standalone caf-renderer project; **do not rewrite** its core logic.

---

## Architecture

```
CAF Backend
│
├── Renderer Service     (services/renderer) — HTTP API for n8n + playground
├── Template Playground  — visual preview of templates (Next.js app)
├── Review Console      — review content in Validation Review Queue (Next.js app)
├── Supabase            — tasks + assets storage; decisions written here
└── Validation Sheet    — Google Sheet "Review Queue" = source of truth for what appears in console
```

- **n8n** calls the renderer at `RENDERER_BASE_URL` and writes to Supabase; the Validation layer appends rows to the Review Queue sheet; the CAF Backend reads that sheet to decide which tasks to show.
- The renderer engine is shared between the render API and the template playground.

---

## Renderer (services/renderer)

Express + Puppeteer service:

- `POST /render` — one slide
- `GET /render/status/:id` — async job status
- `GET /output/*` — static PNGs
- `GET /health`, `GET /version` — health and version
- `GET /templates` — list template names
- `POST /render-carousel` — batch render all slides
- `POST /preview-template` — used by Template Playground (single slide preview)

Templates are Handlebars (`.hbs`) in `templates/`. All render calls must use `RENDERER_BASE_URL` (env); no hardcoded tunnel URLs. Deploy the renderer at a **stable URL** (e.g. Railway, Fly.io, Render.com).

---

## Template Playground

- Choose template, paste slide JSON, live preview, tweak layout, export.
- Uses the same renderer engine as the render API (`RENDERER_BASE_URL`).

---

## Review Console

**Responsibilities:** Browse tasks, preview assets, filter by project/run/platform, approve / reject / needs edit.

**Data:**

- **Storage:** Supabase (`tasks`, `assets`). Decisions are written to `tasks` (decision, notes, rejection_tags, validator, submit, submitted_at, status).
- **What appears:** Only tasks that are in the **Validation "Review Queue"** Google Sheet with:
  - **`status` = `Generated`** and **`review_status` = `READY`** (new items), or **`status` = `IN_REVIEW`** and **`review_status` = `READY`** (already loaded into console)
  - **`submit` ≠ TRUE** (not yet submitted)

So the **sheet is the source of truth** for “waiting for review.” Task list is built by:

1. Reading the Review Queue sheet (Google Sheets API, service account) → list of `task_id`s that have status IN_REVIEW and are not submitted.
2. Loading those tasks (and assets) from Supabase.

If the Review Queue sheet is **not configured** (env vars missing or API error), the console shows an **empty** queue; it does **not** show all DB tasks.

**Environment variables for the Review Queue:**

- `GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID` — VALIDATION spreadsheet ID (from sheet URL).
- `GOOGLE_REVIEW_QUEUE_SHEET_NAME` — optional; default `"Review Queue"`.
- `GOOGLE_SERVICE_ACCOUNT_JSON` — full service account JSON string (serverless), **or**
- `GOOGLE_APPLICATION_CREDENTIALS` — path to key file (local), **or**
- **OAuth2 (no service account key):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` — see **docs/review-queue-oauth-setup.md** when you cannot create service account keys.

**Setup for writing to the sheet:** Share the Validation spreadsheet with the service account email (or OAuth account) with **Editor** access. When the user submits a decision (Approve / Needs Edit / Reject), the backend updates Supabase and then the matching row in the sheet by `task_id`. Sheet columns written: `submit`, `status`/`review_status` (set to the decision: APPROVED, NEEDS_EDIT, REJECTED), `decision`, `notes`, `rejection_tags`, `validator`, `submitted_at`, `final_title_override`, `final_hook_override`, `final_caption_override`, `final_slides_json_override`, `template_key`. If the sheet is not configured or the row is missing, the save still succeeds (Supabase is updated).

The spreadsheet must be **shared with the service account or OAuth account as Editor**. Implementation: `lib/google-sheets.ts` (read allowed task_ids; `updateReviewQueueRow()` writes all decision and override fields above), `lib/data/review-queue.ts` (on decision save, updates Supabase then the sheet). Cache: queue and allowed-ids are cached; both are invalidated when a decision is saved. Task content (e.g. `generated_slides_json`) is loaded from Supabase for the review UI; the sheet can mirror the same columns for external workflows.

**Stable preview URL:** The backend writes a **preview_url** to the sheet that points to a **content view** that works before and after approval. Route `/content/[task_id]` (and API `GET /api/content/[task_id]`) loads the task by ID from Supabase only (no queue filter), so the link keeps working once the task is approved and no longer in the review queue. `preview_url` is set when a task is first marked IN_REVIEW and again when a decision is submitted. Set `NEXT_PUBLIC_APP_URL` so the stored URL is absolute (e.g. `https://your-app.vercel.app/content/{task_id}`).

---

## n8n integration

- n8n calls `RENDERER_BASE_URL` for `/render` (or `/render-carousel`).
- Rendered assets and task data live in Supabase; Validation layer writes to the Review Queue sheet.
- Optional: `DECISION_WEBHOOK_URL` — app POSTs decision payload after saving to Supabase.

---

## Renderer connectivity (deployment requirement)

- **Goal:** Renderer at a **stable URL**; n8n uses `RENDERER_BASE_URL` only.
- **Do not** rely on Cloudflare Tunnel as the long-term solution; deploy the renderer as a service (e.g. container with Puppeteer).
- CAF Backend has a Renderer Settings / Health page showing base URL, `/health` status, version.

---

## Repo structure

```
CAF (this repo)
├── app/                    — Next.js: Review Console, Playground, Settings
├── lib/
│   ├── data/
│   │   └── review-queue.ts — getReviewQueue() filters by sheet; getTaskByTaskId(); updateTaskDecision()
│   ├── google-sheets.ts    — read task_ids from sheet; updateReviewQueueRow() writes decision fields
│   ├── cache.ts            — queue cache; invalidateSheetCache() also clears sheet allowed-ids cache
│   └── supabase/           — server client
├── services/renderer/      — Express + Puppeteer renderer
├── supabase/migrations/
├── AGENTS.md               — this file
└── README.md
```

---

## Environment variables (summary)

| Purpose | Variables |
|--------|-----------|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Decisions | `REVIEW_WRITE_TOKEN` (required for POST decision) |
| Review Queue (what appears) | `GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID`, `GOOGLE_REVIEW_QUEUE_SHEET_NAME` (optional), `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` |
| Renderer | `RENDERER_BASE_URL` |
| Optional | `DECISION_WEBHOOK_URL`, `CACHE_TTL_SECONDS`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_REVIEW_WRITE_TOKEN` |

Where to set them: **local** → `.env` (copy from `.env.example`); **Vercel** → Project → Settings → Environment Variables; **other hosts** → that platform’s env/config UI.

---

## Task summary for AI / developers

When working on this repo:

1. **Renderer:** Maintain in `services/renderer`; do not rewrite core logic. Expose existing + `/render-carousel`, `/preview-template` as needed.
2. **Template Playground:** Same renderer engine; choose template, paste JSON, preview.
3. **Review Console:** Only show tasks that are in the Validation “Review Queue” sheet with `status = IN_REVIEW` and `submit ≠ TRUE`. Data from Supabase filtered by sheet. Keep decisions writing to Supabase and optional webhook.
4. **Review Queue source of truth:** Google Sheet. Implementation: `lib/google-sheets.ts` (task_ids from sheet), `lib/data/review-queue.ts` (filter Supabase by those ids). If sheet not configured, show empty queue.
5. **Supabase:** Use for tasks and assets; RLS/service role as per existing setup.
6. **RENDERER_BASE_URL:** All render calls use this env; Renderer Health page shows status.
7. **n8n:** Same contract for `POST /render`, async, and output URLs.
