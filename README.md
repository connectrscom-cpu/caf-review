# CAF Review Console

Human validation console for the CAF (Content Automation Framework) pipeline. Reads and writes the **Review_Queue** Google Sheet as the source of truth.

## Prerequisites

1. **Google Cloud project** with **Google Sheets API** enabled
2. **Service Account** with a **JSON key**
3. The Google Sheet shared with the service account email (**Editor**)

## Environment variables

### Vercel / Production

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Service account email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Yes | Private key (multiline; in Vercel replace `\n` with real newlines or use `replace(/\\n/g, '\n')` in code — already handled) |
| `GOOGLE_SHEET_ID` | Yes | Spreadsheet ID from the sheet URL |
| `REVIEW_QUEUE_TAB` | No | Tab name (default: `Review_Queue`) |
| `REVIEW_WRITE_TOKEN` | Yes | Secret for `x-review-token` header on POST decision (protect write endpoint) |
| `NEXT_PUBLIC_APP_URL` | No | App URL for links |
| `CACHE_TTL_SECONDS` | No | Sheet read cache TTL (default: 15) |

### Optional client-side

- `NEXT_PUBLIC_REVIEW_WRITE_TOKEN` — if set, the decision form can submit without prompting for the token (only use if the app is not public).

## What you need to provide

1. **`GOOGLE_SHEET_ID`** — from the sheet URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`
2. **`REVIEW_QUEUE_TAB`** — exact tab name (e.g. `Review_Queue`)
3. **Header row** — first row of the Review_Queue sheet (for column mapping). The app normalizes headers (trim, lowercase, spaces → `_`).
4. **Decision values** — must match downstream n8n: `APPROVED`, `NEEDS_EDIT`, `REJECTED`.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy (Vercel)

1. Push to GitHub and connect the repo in Vercel.
2. Add the environment variables above in Project → Settings → Environment Variables.
3. Deploy.

## Routes

- **`/`** — Workbench: filter and list tasks, link to task detail
- **`/r/[run_id]`** — Run view: same list filtered by `run_id`, “Review next pending” button
- **`/t/[task_id]`** — Task detail: preview (preview_url → video_url → slides JSON) + decision panel (Approve / Needs Edit / Reject)

## API

- **`GET /api/tasks`** — List tasks (query params: project, run_id, platform, flow_type, review_status, decision, recommended_route, qc_status, risk_score_min, has_preview, search, sort, page, limit)
- **`GET /api/task/[task_id]`** — Single task by `task_id`
- **`POST /api/task/[task_id]/decision`** — Write decision (body: `decision`, `notes`, `rejection_tags`, `validator`; header: `x-review-token`)

## Resilience

- Headers are normalized (trim, lowercase); extra spaces in sheet headers are handled.
- If expected columns are missing, the API returns `missing_columns[]` and the app does not crash; UI can hide controls for missing fields.
