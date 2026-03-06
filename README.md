# CAF Backend

Operational backend for the **Content Automation Framework (CAF)**. It hosts:

1. **Renderer API** — generate assets from JSON (Puppeteer + Handlebars)
2. **Template Playground** — preview and test carousel templates
3. **Review Console** — review and approve generated content (only tasks in the Validation Review Queue)

The Review Console uses the **Validation "Review Queue" Google Sheet** as the source of truth for which tasks appear. Only tasks in that sheet with `status = IN_REVIEW` and not yet submitted are shown. Task and asset data are loaded from **Supabase**; when you submit a decision, the backend updates **Supabase** and **writes the decision fields back to the same sheet** (submit, status, decision, notes, validator, submitted_at). See [Review Queue: reading and writing](#review-queue-reading-and-writing) below.

For architecture, renderer integration, and deployment requirements, see **[AGENTS.md](AGENTS.md)**.

---

## What you need to do

### 1. Supabase (required)

- Create or use an existing Supabase project and run the schema/migrations (see [Supabase schema](#supabase-schema)).
- Set **`NEXT_PUBLIC_SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** (see [Environment variables](#environment-variables)).

### 2. Review Console: show only “waiting for review” tasks

The console shows **only** tasks that are in your **Validation "Review Queue"** Google Sheet with:

- `status` = **IN_REVIEW** (uses column `status` or `review_status` in the sheet)
- `submit` ≠ **TRUE** (not yet submitted)

When you submit a decision, the backend also **writes** the decision fields back to the sheet (submit, status, decision, notes, validator, submitted_at). The sheet must be shared with **Editor** access for writes.

**Option A: Service account**

1. Create a Google Cloud service account, download its JSON key, enable **Google Sheets API**.
2. Share the Validation spreadsheet with the service account email with **Editor** access (required for writing decisions back).
3. Set **`GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID`**, **`GOOGLE_REVIEW_QUEUE_SHEET_NAME`** (optional), and either **`GOOGLE_SERVICE_ACCOUNT_JSON`** (full JSON string, for Vercel) or **`GOOGLE_APPLICATION_CREDENTIALS`** (path to key file, for local).

**Option B: OAuth2 (no service account key)**

Use this when you cannot create service account keys (e.g. org policy). See **[docs/review-queue-oauth-setup.md](docs/review-queue-oauth-setup.md)** for the full guide. In short: create OAuth 2.0 credentials, get a refresh token (e.g. via [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)), share the spreadsheet with that Google account as **Editor**, and set **`GOOGLE_CLIENT_ID`**, **`GOOGLE_CLIENT_SECRET`**, **`GOOGLE_REFRESH_TOKEN`**.

If the sheet env vars are **not** set or auth fails, the Review Console shows an **empty** queue (it never shows all tasks from the database).

### 3. Renderer (for Playground and n8n)

- Run the renderer locally (`services/renderer`) or deploy it to a stable URL.
- Set **`RENDERER_BASE_URL`** in the app (e.g. `http://localhost:3333` for local).

### 4. Decision endpoint (required for submitting decisions)

- Set **`REVIEW_WRITE_TOKEN`** and send it as the **`x-review-token`** header when calling `POST /api/task/[task_id]/decision`.

---

## Where to set environment variables

| Where you run the app | Where to set variables |
|------------------------|------------------------|
| **Local (npm run dev)** | In a **`.env`** file in the project root. Copy from `.env.example`: `cp .env.example .env` then edit `.env`. Never commit `.env`. |
| **Vercel** | Project → Settings → Environment Variables. Add each variable (e.g. `GOOGLE_SERVICE_ACCOUNT_JSON` as the full JSON string; for multi-line, paste as one line or use Vercel’s “sensitive” field). |
| **Other hosts (Railway, Render, etc.)** | Use that platform’s “Environment” or “Config” UI to add the same variables. |

For **`GOOGLE_SERVICE_ACCOUNT_JSON`** on Vercel: copy the entire JSON from the key file, then paste as one line (no line breaks) into the env value. For OAuth2, set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (see [docs/review-queue-oauth-setup.md](docs/review-queue-oauth-setup.md)). Or use the platform’s “multi-line secret” if available.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| **Supabase** | | |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (Project Settings → API). Server-side only. |
| **Review Console – decisions** | | |
| `REVIEW_WRITE_TOKEN` | Yes | Secret for `x-review-token` header when submitting decisions |
| **Review Console – what appears (Google Sheet)** | | |
| `GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID` | For queue* | VALIDATION spreadsheet ID (from sheet URL). If missing, console shows empty queue. |
| `GOOGLE_REVIEW_QUEUE_SHEET_NAME` | No | Sheet tab name (default `Review Queue`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | For queue* | Full service account JSON string (Vercel/serverless). Share sheet with SA email (Editor). |
| `GOOGLE_APPLICATION_CREDENTIALS` | For queue* | Path to service account JSON file (local). Share sheet with SA email (Editor). |
| `GOOGLE_CLIENT_ID` | For queue* | OAuth2 client ID (use with OAuth2 when you cannot use service account keys). |
| `GOOGLE_CLIENT_SECRET` | For queue* | OAuth2 client secret. |
| `GOOGLE_REFRESH_TOKEN` | For queue* | OAuth2 refresh token (one-time consent; see docs/review-queue-oauth-setup.md). |
| **Optional** | | |
| `DECISION_WEBHOOK_URL` | No | If set, app POSTs decision payload here after saving to Supabase (e.g. n8n) |
| `RENDERER_BASE_URL` | No** | Renderer base URL (e.g. `http://localhost:3333`). Required for Playground and Renderer Settings; n8n should use this for `/render`. |
| `CACHE_TTL_SECONDS` | No | Cache TTL for task list (default 15) |
| `NEXT_PUBLIC_APP_URL` | No | App URL for links |
| `NEXT_PUBLIC_REVIEW_WRITE_TOKEN` | No | Pre-fill token in browser (only if app is private) |

\* For the queue you need `GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID` plus either (1) `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`, or (2) `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`.  
\** Required if you use the Template Playground or Renderer Settings.

---

## Supabase schema

The app expects your **CAF Storage** schema:

- **`tasks`** — one row per content task (`task_id`, `run_id`, `project`, `platform`, `flow_type`, `variation_name`, `status`, `recommended_route`, `preview_url`, …).
- **`assets`** — linked by `task_id`; used for `video_url` when the task has no `preview_url` (first asset’s `public_url`).
- **`runs`** — referenced by `tasks.run_id`.

**Review columns on `tasks`** (add if missing). Run in **Supabase → SQL Editor**:

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

---

## Run locally

1. **Next.js app (Review Console, Playground, Settings)**

```bash
npm install
cp .env.example .env
# Edit .env: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEW_WRITE_TOKEN,
# and for Review Queue: GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID plus either service account vars
# or OAuth2 (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN). See docs/review-queue-oauth-setup.md.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

2. **Renderer (for Template Playground and n8n)**

```bash
cd services/renderer && npm install && npm start
```

Runs on port 3333. Set `RENDERER_BASE_URL=http://localhost:3333` in the app `.env`.

---

## Deploy (e.g. Vercel)

1. Import the repo and add the env vars in Project → Settings → Environment Variables.
2. For the Review Queue, set `GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID` and either service account vars (`GOOGLE_SERVICE_ACCOUNT_JSON` as one line) or OAuth2 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`).
3. Deploy.

---

## Routes

| Path | Description |
|------|-------------|
| `/` | Workbench: filter and list tasks (from Review Queue sheet + Supabase) |
| `/r/[run_id]` | Run view: list filtered by run, “Review next pending” |
| `/t/[task_id]` | Task: preview + decision panel |
| `/playground` | Template Playground: choose template, paste slide JSON, preview |
| `/settings/renderer` | Renderer Settings / Health: RENDERER_BASE_URL, status, version |

---

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/tasks` | List tasks (only those in Review Queue with status IN_REVIEW + not submitted), with filtering, sort, pagination |
| `GET /api/task/[task_id]` | Single task (and first asset for video_url) |
| `POST /api/task/[task_id]/decision` | Save decision to Supabase. Header: `x-review-token`. If `DECISION_WEBHOOK_URL` is set, POSTs payload there. |
| `GET /api/renderer/health` | Renderer health (base_url, reachable, version, uptime) |
| `GET /api/renderer/templates` | List template names from renderer |
| `POST /api/renderer/preview` | Preview one slide (body: `{ template, data }`), returns PNG |

---

## Review Queue: reading and writing

The Review Console only shows tasks that are “in” the Review Queue. That list comes from the **Validation "Review Queue" Google Sheet**, not from the full Supabase `tasks` table.

### Reading (what appears in the console)

1. **Sheet as filter:** The backend reads the Review Queue sheet (Google Sheets API) and finds every row where:
   - **`status`** (or **`review_status`**) = **IN_REVIEW**
   - **`submit`** ≠ TRUE  
   It collects the **`task_id`** values from those rows.

2. **Supabase for data:** It then loads **only those tasks** from Supabase (`tasks` table), plus their **assets** (for preview URLs). No other tasks are queried.

3. **If the sheet is missing or auth fails:** The allowed list is empty, so the console shows an **empty** queue. It never shows all DB tasks.

4. **Caching:** The task list and sheet-derived IDs are cached; the cache is cleared when a decision is saved.

### Writing (when you submit a decision)

1. **Supabase:** The backend updates the **`tasks`** row in Supabase (decision, notes, rejection_tags, validator, submit, submitted_at, status, overrides).

2. **Sheet:** It then finds the same task’s row in the Review Queue sheet (by **`task_id`**) and **writes** the decision fields into that row: `submit`, `status`/`review_status`, `decision`, `notes`, `validator`, `submitted_at` (and optionally `rejection_tags`). That row then has `submit = TRUE` and typically `status = SUBMITTED`, so it no longer appears in “waiting for review”.

3. **Cache:** Sheet and queue caches are invalidated so the next load reflects the update.

4. **Optional:** If **`DECISION_WEBHOOK_URL`** is set, the app POSTs the decision payload there (e.g. for n8n).

The sheet must be shared with **Editor** access (service account or OAuth user) so the backend can write. If the sheet write fails (e.g. wrong permissions), the Supabase update still succeeds; the sheet row just won’t be updated until permissions are fixed.

---

## Rework types (Needs Edit)

When a human reviewer sends content back for changes (“Needs Edit”), there are two kinds of rework:

- **Partial rework** — The reviewer only changes **overrides** (title, caption, hook, template, or slide JSON). These go to the **renderer** only; the carousel/video is re-rendered with the new text or template. No full regeneration of the content.

- **Full rework** — The reviewer selects one or more **rejection tags** (e.g. Quality, Factual, Tone, Brand, Length, Wrong platform, Other). Using rejection tags signals that the content itself must be reworked (e.g. quality off, factual off, tone off, brand off). Downstream (e.g. n8n / Validation) should treat this as a **full rework of the video/carousel** — regeneration, not just re-render.

The Review Console shows a warning near the rejection-tags control: selecting tags will demand a full rework of the video.
