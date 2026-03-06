import type { ReviewQueueRow } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/server";
import { getCachedSheetData, setCachedSheetData, invalidateSheetCache, type QueueStatusTab } from "@/lib/cache";
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
 * Fetch review queue for one tab: In Review, Approved, or Rejected.
 * All data comes from the Review Queue sheet (filtered by status); Supabase is only for task/asset fields to merge.
 * Cached per status.
 */
export async function getReviewQueue(status: QueueStatusTab = "in_review"): Promise<ReviewQueueData> {
  const cached = getCachedSheetData(status);
  if (cached) {
    return {
      ...cached,
      rawHeaders: cached.headers,
    };
  }

  const sheetResult = await getReviewQueueTaskIdsFromSheet();
  if (sheetResult === null) {
    const { keys, keyToOriginal, rawHeaders } = buildKeysFromRows([]);
    return { keyToOriginal, keys, rows: [], rawHeaders };
  }

  const taskIdFilter =
    status === "in_review"
      ? sheetResult.taskIds
      : status === "approved"
        ? sheetResult.approvedTaskIds
        : sheetResult.rejectedTaskIds;
  const sheetRowsByTaskId =
    status === "in_review"
      ? sheetResult.rowsByTaskId
      : status === "approved"
        ? sheetResult.approvedRowsByTaskId
        : sheetResult.rejectedRowsByTaskId;

  // When tasks first appear in the console (status=Generated, review_status=READY), update sheet to IN_REVIEW and set stable preview_url.
  if (status === "in_review" && sheetResult.markInReview.length) {
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
  setCachedSheetData(data, status);
  return { keyToOriginal, keys, rows, rawHeaders };
}

/** Find a task in any tab (in review, approved, rejected) and return merged row from sheet + Supabase. */
export async function getTaskByTaskId(
  taskId: string
): Promise<{ rowIndex: number; data: ReviewQueueRow } | null> {
  const sheetResult = await getReviewQueueTaskIdsFromSheet();
  const normalizedId = taskId.trim();
  const sheetRow =
    sheetResult != null
      ? sheetResult.rowsByTaskId[normalizedId] ??
        sheetResult.approvedRowsByTaskId[normalizedId] ??
        sheetResult.rejectedRowsByTaskId[normalizedId]
      : undefined;
  const fromSupabase = await getTaskByTaskIdFromSupabase(taskId);
  const data: ReviewQueueRow = fromSupabase
    ? rowToReviewRow(fromSupabase.data as Record<string, unknown>)
    : {};
  if (sheetRow) {
    for (const [k, v] of Object.entries(sheetRow)) {
      if (k) data[k] = v === "" ? undefined : v;
    }
  }
  if (Object.keys(data).length === 0) return null;
  if (data.status != null && data.review_status == null) data.review_status = data.status;
  return { rowIndex: 1, data };
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
 * Save decision to the Review Queue sheet only (no Supabase write).
 * Sheet is source of truth; preview_url is written so the Approved/Rejected tabs show the link.
 */
export async function updateTaskDecision(
  taskId: string,
  payload: DecisionUpdate
): Promise<void> {
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
