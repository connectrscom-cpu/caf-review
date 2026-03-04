import { NextRequest, NextResponse } from "next/server";
import { readReviewQueue } from "@/lib/google/sheets";
import type { TaskDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
) {
  try {
    const { task_id } = await params;
    const decodedId = decodeURIComponent(task_id);

    const { rows, keys } = await readReviewQueue();
    const taskIdKey = "task_id";
    const rowIndex = rows.findIndex(
      (row) => (row[taskIdKey] ?? "").trim() === decodedId.trim()
    );

    if (rowIndex === -1) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const data = rows[rowIndex];
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
      rowIndex: rowIndex + 2,
      data,
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
