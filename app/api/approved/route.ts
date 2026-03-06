import { NextRequest, NextResponse } from "next/server";
import { getReviewQueue } from "@/lib/data/review-queue";
import type { ReviewQueueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/approved — list tasks from Review Queue sheet with status Approved.
 * Same as GET /api/tasks?status=approved; kept for backward compatibility.
 */
export async function GET(request: NextRequest) {
  try {
    const { rows } = await getReviewQueue("approved");

    const response: {
      items: ReviewQueueRow[];
      total: number;
    } = {
      items: rows,
      total: rows.length,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/approved", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load approved content" },
      { status: 500 }
    );
  }
}
