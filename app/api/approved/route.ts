import { NextRequest, NextResponse } from "next/server";
import { getApprovedContent } from "@/lib/data/review-queue";
import type { ReviewQueueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/approved — list tasks that were approved (decision = APPROVED, submit = TRUE).
 * Stored in Supabase; used for the "Approved content" page.
 */
export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(500, Math.max(1, parseInt(limitParam, 10))) : 500;

    const { rows } = await getApprovedContent(limit);

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
