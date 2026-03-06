import type { ReviewQueueRow } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/server";
import { getCachedSheetData, setCachedSheetData, invalidateSheetCache } from "@/lib/cache";
import { getReviewQueueTaskIdsFromSheet, updateReviewQueueRow, invalidateReviewQueueSheetCache } from "@/lib/google-sheets";

const CACHE_TTL_MS =
  (typeof process.env.CACHE_TTL_SECONDS !== "undefined"
    ? Number(process.env.CACHE_TTL_SECONDS)
    : 15) * 1000;

/** Stable content URL for a task (works before and after approval). Used for preview_url in the sheet. */
export function getContentPreviewUrl(taskId: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/content/${encodeURIComponent(taskId)}`;
}

/** Convert a DB row (any types) to ReviewQueueRow (string | undefined). */
function rowToReviewRow(raw: Record<string, unknown>): ReviewQueueRow {
  const out: ReviewQueueRow = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) out[k] = undefined;
    else if (typeof v === "object" && typeof (v as { toISOString?: () => string }).toISOString === "function")
      out[k] = (v as Date).toISOString();
    else out[k] = String(v);
  }
  return out;
}

/** Build keys/headers from first row (for compatibility with existing list/detail API shape). */
function buildKeysFromRows(rows: ReviewQueueRow[]): { keys: string[]; keyToOriginal: Record<string, string>; rawHeaders: string[] } {
  const keySet = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      keySet.add(k);
    }
  }
  const keys = Array.from(keySet).sort();
  const keyToOriginal: Record<string, string> = {};
  for (const k of keys) keyToOriginal[k] = k;
  return { keys, keyToOriginal, rawHeaders: keys };
}

export interface ReviewQueueData {
  keyToOriginal: Record<string, string>;
  keys: string[];
  rows: ReviewQueueRow[];
  rawHeaders: string[];
}

/**
 * Fetch review queue: only tasks that appear in the Validation "Review Queue" sheet
 * with status = IN_REVIEW and submit != TRUE. Data is loaded from Supabase and
 * filtered by the sheet; tasks.status → review_status for filters. Cached.
 * If the sheet is not configured or returns no allowed task_ids, returns empty (never all DB tasks).
 */
export async function getReviewQueue(): Promise<ReviewQueueData> {
  const cached = getCachedSheetData();
  if (cached) {
    return {
      ...cached,
      rawHeaders: cached.headers,
    };
  }

  const sheetResult = await getReviewQueueTaskIdsFromSheet();
  // If sheet is not configured or returns null, show nothing (do not show all DB tasks).
  const taskIdFilter =
    sheetResult === null || sheetResult.taskIds.length === 0
      ? []
      : sheetResult.taskIds;
  const sheetRowsByTaskId = sheetResult?.rowsByTaskId ?? {};

  // When tasks first appear in the console (status=Generated, review_status=READY), update sheet to IN_REVIEW and set stable preview_url.
  if (sheetResult?.markInReview.length) {
    for (const taskId of sheetResult.markInReview) {
      const fields: Parameters<typeof updateReviewQueueRow>[1] = { review_status: "IN_REVIEW" };
      const previewUrl = getContentPreviewUrl(taskId);
      if (previewUrl) fields.preview_url = previewUrl;
      await updateReviewQueueRow(taskId, fields);
    }
    invalidateReviewQueueSheetCache();
    invalidateSheetCache();
  }

  const supabase = getSupabase();
  let query = supabase.from("tasks").select("*").order("created_at", { ascending: false });
  if (taskIdFilter.length > 0) {
    query = query.in("task_id", taskIdFilter);
  } else {
    // No tasks in review queue: return empty result without hitting DB for all rows
    const { keys, keyToOriginal, rawHeaders } = buildKeysFromRows([]);
    return { keyToOriginal, keys, rows: [], rawHeaders };
  }

  const { data: tasksData, error: tasksError } = await query;

  if (tasksError) throw new Error(tasksError.message);

  const tasks = (tasksData ?? []) as Record<string, unknown>[];
  const taskIds = tasks.map((t) => t.task_id).filter(Boolean) as string[];

  // Required for building asset preview URLs; without it, video_url stays empty and previews show "Missing"
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

  /** Normalize task_id for fallback match (e.g. SNS_..._row0008_v1 -> SNS_..._row0008). */
  function baseTaskId(id: string): string {
    const s = String(id).trim();
    const m = s.match(/^(.+)_v\d+$/);
    return m ? m[1] : s;
  }

  let assetsByTask: Record<string, { public_url?: string }> = {};
  let assetsByBase: Record<string, { public_url?: string }> = {};
  if (taskIds.length > 0) {
    const baseIds = Array.from(new Set(taskIds.map((id) => baseTaskId(id))));
    const allIds = Array.from(new Set(taskIds.concat(baseIds)));
    const { data: assetsData } = await getSupabase()
      .from("assets")
      .select("task_id, public_url, asset_type, bucket, object_path")
      .in("task_id", allIds)
      .order("position", { ascending: true });
    const assets = (assetsData ?? []) as {
      task_id: string;
      public_url: string | null;
      asset_type: string | null;
      bucket: string | null;
      object_path: string | null;
    }[];
    for (const a of assets) {
      let url = a.public_url ?? null;
      if (!url && a.bucket && a.object_path && supabaseUrl) {
        const path = a.object_path.startsWith("/") ? a.object_path.slice(1) : a.object_path;
        url = `${supabaseUrl}/storage/v1/object/public/${a.bucket}/${path}`;
      }
      if (url) {
        if (!assetsByTask[a.task_id]) assetsByTask[a.task_id] = {};
        if (!assetsByTask[a.task_id].public_url) assetsByTask[a.task_id].public_url = url;
        const base = baseTaskId(a.task_id);
        if (!assetsByBase[base]) assetsByBase[base] = {};
        if (!assetsByBase[base].public_url) assetsByBase[base].public_url = url;
      }
    }
  }

  const rows: ReviewQueueRow[] = tasks.map((t) => {
    const row = rowToReviewRow(t);
    if (row.status != null) row.review_status = row.status;
    const tid = String(t.task_id);
    const asset = assetsByTask[tid] ?? assetsByBase[baseTaskId(tid)];
    if (asset?.public_url && !row.video_url) row.video_url = asset.public_url;
    const sheetRow = sheetRowsByTaskId[tid];
    if (sheetRow) {
      for (const [k, v] of Object.entries(sheetRow)) {
        if (k) row[k] = v === "" ? undefined : v;
      }
    }
    return row;
  });

  const { keys, keyToOriginal, rawHeaders } = buildKeysFromRows(rows);
  const data = { headers: rawHeaders, keyToOriginal, keys, rows };
  setCachedSheetData(data);
  return { keyToOriginal, keys, rows, rawHeaders };
}

export async function getTaskByTaskId(
  taskId: string
): Promise<{ rowIndex: number; data: ReviewQueueRow } | null> {
  const { rows } = await getReviewQueue();
  const idx = rows.findIndex(
    (r) => (r.task_id ?? "").trim() === taskId.trim()
  );
  if (idx === -1) return null;
  const data = rows[idx];
  if (data.status != null && data.review_status == null) data.review_status = data.status;
  return { rowIndex: idx + 2, data };
}

/** Normalize task_id for fallback match (e.g. SNS_..._row0008_v1 -> SNS_..._row0008). */
function baseTaskId(id: string): string {
  const s = String(id).trim();
  const m = s.match(/^(.+)_v\d+$/);
  return m ? m[1] : s;
}

/**
 * Load a single task by task_id directly from Supabase (no queue filter).
 * Use for stable "content view" URLs that work before and after approval.
 * Returns the same row shape as getTaskByTaskId (with video_url from assets if needed).
 */
export async function getTaskByTaskIdFromSupabase(
  taskId: string
): Promise<{ data: ReviewQueueRow } | null> {
  const supabase = getSupabase();
  const { data: taskRow, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("task_id", taskId.trim())
    .maybeSingle();

  if (taskError || !taskRow) return null;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const tid = String(taskRow.task_id);
  const allIds = Array.from(new Set([tid, baseTaskId(tid)]));
  const { data: assetsData } = await getSupabase()
    .from("assets")
    .select("task_id, public_url, asset_type, bucket, object_path")
    .in("task_id", allIds)
    .order("position", { ascending: true });

  const assets = (assetsData ?? []) as {
    task_id: string;
    public_url: string | null;
    bucket: string | null;
    object_path: string | null;
  }[];
  let videoUrl: string | undefined;
  for (const a of assets) {
    let url = a.public_url ?? null;
    if (!url && a.bucket && a.object_path && supabaseUrl) {
      const path = a.object_path.startsWith("/") ? a.object_path.slice(1) : a.object_path;
      url = `${supabaseUrl}/storage/v1/object/public/${a.bucket}/${path}`;
    }
    if (url) {
      videoUrl = url;
      break;
    }
  }

  const data = rowToReviewRow(taskRow as Record<string, unknown>);
  if (data.status != null && data.review_status == null) data.review_status = data.status;
  if (videoUrl && !data.video_url) data.video_url = videoUrl;
  return { data };
}

/** Default limit for approved content list. */
const APPROVED_LIST_LIMIT = 500;

/**
 * Fetch tasks that were approved (decision = APPROVED, submit = TRUE) from Supabase.
 * Used for the "Approved content" list; same row shape as queue (with video_url from assets).
 * Not cached so the list stays up to date.
 */
export async function getApprovedContent(limit = APPROVED_LIST_LIMIT): Promise<ReviewQueueData> {
  const supabase = getSupabase();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

  // submit is stored as string "TRUE" when we write from the decision API
  const { data: tasksData, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("decision", "APPROVED")
    .eq("submit", "TRUE")
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (tasksError) throw new Error(tasksError.message);

  const tasks = (tasksData ?? []) as Record<string, unknown>[];
  const taskIds = tasks.map((t) => t.task_id).filter(Boolean) as string[];

  if (taskIds.length === 0) {
    const { keys, keyToOriginal, rawHeaders } = buildKeysFromRows([]);
    return { keyToOriginal, keys, rows: [], rawHeaders };
  }

  const baseIds = Array.from(new Set(taskIds.map((id) => baseTaskId(id))));
  const allIds = Array.from(new Set(taskIds.concat(baseIds)));
  const { data: assetsData } = await getSupabase()
    .from("assets")
    .select("task_id, public_url, asset_type, bucket, object_path")
    .in("task_id", allIds)
    .order("position", { ascending: true });

  const assets = (assetsData ?? []) as {
    task_id: string;
    public_url: string | null;
    asset_type: string | null;
    bucket: string | null;
    object_path: string | null;
  }[];

  const assetsByTask: Record<string, { public_url?: string }> = {};
  const assetsByBase: Record<string, { public_url?: string }> = {};
  for (const a of assets) {
    let url = a.public_url ?? null;
    if (!url && a.bucket && a.object_path && supabaseUrl) {
      const path = a.object_path.startsWith("/") ? a.object_path.slice(1) : a.object_path;
      url = `${supabaseUrl}/storage/v1/object/public/${a.bucket}/${path}`;
    }
    if (url) {
      if (!assetsByTask[a.task_id]) assetsByTask[a.task_id] = {};
      if (!assetsByTask[a.task_id].public_url) assetsByTask[a.task_id].public_url = url;
      const base = baseTaskId(a.task_id);
      if (!assetsByBase[base]) assetsByBase[base] = {};
      if (!assetsByBase[base].public_url) assetsByBase[base].public_url = url;
    }
  }

  const rows: ReviewQueueRow[] = tasks.map((t) => {
    const row = rowToReviewRow(t);
    if (row.status != null) row.review_status = row.status;
    const tid = String(t.task_id);
    const asset = assetsByTask[tid] ?? assetsByBase[baseTaskId(tid)];
    if (asset?.public_url && !row.video_url) row.video_url = asset.public_url;
    if (!row.preview_url) {
      const previewUrl = getContentPreviewUrl(tid);
      if (previewUrl) row.preview_url = previewUrl;
    }
    return row;
  });

  const { keys, keyToOriginal, rawHeaders } = buildKeysFromRows(rows);
  return { keyToOriginal, keys, rows, rawHeaders };
}

export interface DecisionUpdate {
  decision: string;
  notes?: string;
  rejection_tags?: string;
  validator?: string;
  submit: string;
  submitted_at: string;
  review_status: string;
  final_title_override?: string | null;
  final_hook_override?: string | null;
  final_caption_override?: string | null;
  final_slides_json_override?: string | null;
  template_key?: string | null;
}

/**
 * Save decision: full payload to the Review Queue sheet; minimal fields to Supabase.
 * - Sheet: all decision + override columns (source of truth for captions, overrides, template).
 * - Supabase: only decision, submit, submitted_at, status, notes, rejection_tags, validator
 *   so the Approved list works and we don't duplicate caption/override data in the DB.
 */
export async function updateTaskDecision(
  taskId: string,
  payload: DecisionUpdate
): Promise<void> {
  const { error } = await getSupabase()
    .from("tasks")
    .update({
      decision: payload.decision,
      notes: payload.notes ?? null,
      rejection_tags: payload.rejection_tags ?? null,
      validator: payload.validator ?? null,
      submit: payload.submit,
      submitted_at: payload.submitted_at,
      status: payload.review_status,
      updated_at: new Date().toISOString(),
    })
    .eq("task_id", taskId);

  if (error) throw new Error(error.message);

  const sheetFields: Parameters<typeof updateReviewQueueRow>[1] = {
    submit: payload.submit,
    review_status: payload.decision,
    decision: payload.decision,
    notes: payload.notes ?? undefined,
    rejection_tags: payload.rejection_tags ?? undefined,
    validator: payload.validator ?? undefined,
    submitted_at: payload.submitted_at,
    final_title_override: payload.final_title_override ?? undefined,
    final_hook_override: payload.final_hook_override ?? undefined,
    final_caption_override: payload.final_caption_override ?? undefined,
    final_slides_json_override: payload.final_slides_json_override ?? undefined,
    template_key: payload.template_key ?? undefined,
  };
  const previewUrl = getContentPreviewUrl(taskId);
  if (previewUrl) sheetFields.preview_url = previewUrl;
  await updateReviewQueueRow(taskId, sheetFields);
  invalidateReviewQueueSheetCache();
  invalidateSheetCache();
}
