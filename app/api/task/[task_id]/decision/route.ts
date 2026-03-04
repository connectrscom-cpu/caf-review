import { NextRequest, NextResponse } from "next/server";
import { writeDecisionRow, type DecisionCells } from "@/lib/google/sheets";
import type { DecisionValue } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_DECISIONS: DecisionValue[] = ["APPROVED", "NEEDS_EDIT", "REJECTED"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
) {
  const token = request.headers.get("x-review-token");
  const expected = process.env.REVIEW_WRITE_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { task_id } = await params;
    const decodedId = decodeURIComponent(task_id);

    let body: {
      decision?: string;
      notes?: string;
      rejection_tags?: string[];
      validator?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const decision = (body.decision ?? "").trim().toUpperCase();
    if (!decision || !VALID_DECISIONS.includes(decision as DecisionValue)) {
      return NextResponse.json(
        { error: "decision must be one of: APPROVED, NEEDS_EDIT, REJECTED" },
        { status: 400 }
      );
    }

    const payload: DecisionCells = {
      decision: decision as DecisionValue,
      notes: body.notes?.trim() ?? "",
      rejection_tags: Array.isArray(body.rejection_tags)
        ? JSON.stringify(body.rejection_tags)
        : "",
      validator: body.validator?.trim() ?? "",
      submit: "TRUE",
      submitted_at: new Date().toISOString(),
      review_status: "SUBMITTED",
    };

    const { updated, missing_columns } = await writeDecisionRow(decodedId, payload);

    return NextResponse.json({
      ok: true,
      updated,
      missing_columns: missing_columns.length ? missing_columns : undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Task not found") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    console.error("POST /api/task/[task_id]/decision", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save decision" },
      { status: 500 }
    );
  }
}
