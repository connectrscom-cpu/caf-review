import { NextRequest, NextResponse } from "next/server";
import {
  getTaskByTaskIdFromSupabase,
  getTaskByTaskId,
  getContentPreviewUrl,
} from "@/lib/data/review-queue";
import type { ReviewQueueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/content/[task_id] — load task by ID (Supabase first, then sheet).
 * Used for stable preview URLs that work before and after approval.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
) {
  try {
    const { task_id } = await params;
    const decodedId = decodeURIComponent(task_id);

    let data: ReviewQueueRow | null = null;
    const fromSupabase = await getTaskByTaskIdFromSupabase(decodedId);
    if (fromSupabase) {
      data = fromSupabase.data;
    } else {
      const fromQueue = await getTaskByTaskId(decodedId);
      if (fromQueue) data = fromQueue.data;
    }
    if (!data) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const previewUrl = getContentPreviewUrl(decodedId);
    if (previewUrl && !data.preview_url) data.preview_url = previewUrl;

    const response: { data: ReviewQueueRow } = { data };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/content/[task_id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load content" },
      { status: 500 }
    );
  }
}
