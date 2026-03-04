import { NextRequest, NextResponse } from "next/server";
import { getTaskByTaskId } from "@/lib/data/review-queue";
import { getReviewQueue } from "@/lib/data/review-queue";
import type { TaskDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
) {
  try {
    const { task_id } = await params;
    const decodedId = decodeURIComponent(task_id);

    const result = await getTaskByTaskId(decodedId);
    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { keys } = await getReviewQueue();
    const expectedColumns = [
      "task_id",
      "preview_url",
      "video_url",
      "generated_slides_json",
      "decision",
      "notes",
      "rejection_tags",
      "validator",
    ];
    const missing_columns = expectedColumns.filter((k) => !keys.includes(k));
    const response: TaskDetailResponse = {
      ...result,
      ...(missing_columns.length > 0 ? { missing_columns } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/task/[task_id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load task" },
      { status: 500 }
    );
  }
}
