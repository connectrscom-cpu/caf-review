import { NextRequest, NextResponse } from "next/server";
import { getReviewQueue } from "@/lib/data/review-queue";
import { filterRows, sortRows, paginateRows } from "@/lib/filters";
import type { TaskListParams } from "@/lib/types";
import type { QueueStatusTab } from "@/lib/cache";

export const dynamic = "force-dynamic";

const VALID_STATUS: QueueStatusTab[] = ["in_review", "approved", "rejected", "needs_edit"];

export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status") ?? "in_review";
  const status: QueueStatusTab = VALID_STATUS.includes(statusParam as QueueStatusTab)
    ? (statusParam as QueueStatusTab)
    : "in_review";

  const EXPECTED_COLUMNS = [
    "task_id",
    "run_id",
    "platform",
    "flow_type",
    "review_status",
    "decision",
    "recommended_route",
    "qc_status",
    "risk_score",
    "preview_url",
    "video_url",
    "generated_title",
    "generated_hook",
    "generated_caption",
    "generated_slides_json",
  ];

  try {
    const { keys, rows } = await getReviewQueue(status);
    const missing_columns = EXPECTED_COLUMNS.filter((k) => !keys.includes(k));

    const params: TaskListParams = {
      project: request.nextUrl.searchParams.get("project") ?? undefined,
      run_id: request.nextUrl.searchParams.get("run_id") ?? undefined,
      platform: request.nextUrl.searchParams.get("platform") ?? undefined,
      flow_type: request.nextUrl.searchParams.get("flow_type") ?? undefined,
      review_status: request.nextUrl.searchParams.get("review_status") ?? undefined,
      decision: request.nextUrl.searchParams.get("decision") ?? undefined,
      recommended_route: request.nextUrl.searchParams.get("recommended_route") ?? undefined,
      qc_status: request.nextUrl.searchParams.get("qc_status") ?? undefined,
      risk_score_min: request.nextUrl.searchParams.get("risk_score_min") ?? undefined,
      has_preview: request.nextUrl.searchParams.get("has_preview") ?? undefined,
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      sort: request.nextUrl.searchParams.get("sort") ?? "task_id",
      page: request.nextUrl.searchParams.get("page") ?? "1",
      limit: request.nextUrl.searchParams.get("limit") ?? "50",
    };

    const filtered = filterRows(rows, params);
    const sorted = sortRows(filtered, params.sort);
    const page = parseInt(params.page ?? "1", 10);
    const limit = parseInt(params.limit ?? "50", 10);
    const { items, total } = paginateRows(sorted, page, limit);

    const statusCounts: Record<string, number> = {};
    let missingPreviewCount = 0;
    for (const row of filtered) {
      const s = (row.review_status ?? "").trim() || "(empty)";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
      if (!(row.preview_url ?? "").trim() && !(row.video_url ?? "").trim()) missingPreviewCount++;
    }

    const response: {
      items: typeof items;
      total: number;
      page: number;
      limit: number;
      statusCounts?: Record<string, number>;
      missingPreviewCount?: number;
      missing_columns?: string[];
    } = {
      items,
      total,
      page,
      limit,
      statusCounts,
      missingPreviewCount,
    };
    if (missing_columns.length > 0) response.missing_columns = missing_columns;

    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/tasks", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tasks" },
      { status: 500 }
    );
  }
}
