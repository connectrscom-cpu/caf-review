import type { ReviewQueueRow } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/server";
import { getCachedSheetData, setCachedSheetData, invalidateSheetCache } from "@/lib/cache";

const CACHE_TTL_MS =
  (typeof process.env.CACHE_TTL_SECONDS !== "undefined"
    ? Number(process.env.CACHE_TTL_SECONDS)
    : 15) * 1000;

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
 * Fetch full review queue from Supabase: tasks table, with optional first asset per task for video_url.
 * Maps tasks.status → review_status for filters. Cached.
 */
export async function getReviewQueue(): Promise<ReviewQueueData> {
  const cached = getCachedSheetData();
  if (cached) {
    return {
      ...cached,
      rawHeaders: cached.headers,
    };
  }

  const supabase = getSupabase();
  const { data: tasksData, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

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
    const baseIds = [...new Set(taskIds.map((id) => baseTaskId(id)))];
    const allIds = [...new Set([...taskIds, ...baseIds])];
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
}

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
      final_title_override: payload.final_title_override ?? null,
      final_hook_override: payload.final_hook_override ?? null,
      final_caption_override: payload.final_caption_override ?? null,
      final_slides_json_override: payload.final_slides_json_override ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("task_id", taskId);

  if (error) throw new Error(error.message);
  invalidateSheetCache();
}
