import { NextRequest, NextResponse } from "next/server";
import { getTaskByTaskIdFromSupabase } from "@/lib/data/review-queue";
import type { ReviewQueueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/content/[task_id] — load task by ID from Supabase only (no queue filter).
 * Used for stable preview URLs that work before and after approval.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
) {
  try {
    const { task_id } = await params;
    const decodedId = decodeURIComponent(task_id);

    const result = await getTaskByTaskIdFromSupabase(decodedId);
    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const response: { data: ReviewQueueRow } = { data: result.data };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/content/[task_id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load content" },
      { status: 500 }
    );
  }
}
