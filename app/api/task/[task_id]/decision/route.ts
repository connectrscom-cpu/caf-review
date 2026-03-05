import { NextRequest, NextResponse } from "next/server";
import { updateTaskDecision } from "@/lib/data/review-queue";
import { sendDecisionToWebhook } from "@/lib/webhook";
import type { DecisionValue } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_DECISIONS: DecisionValue[] = ["APPROVED", "NEEDS_EDIT", "REJECTED"];
const WEBHOOK_URL = process.env.DECISION_WEBHOOK_URL;

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
      final_title_override?: string | null;
      final_hook_override?: string | null;
      final_caption_override?: string | null;
      final_slides_json_override?: string | null;
      template_key?: string | null;
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

    const submittedAt = new Date().toISOString();
    const payload = {
      decision: decision as DecisionValue,
      notes: body.notes?.trim() ?? "",
      rejection_tags: Array.isArray(body.rejection_tags)
        ? JSON.stringify(body.rejection_tags)
        : "",
      validator: body.validator?.trim() ?? "",
      submit: "TRUE",
      submitted_at: submittedAt,
      review_status: "SUBMITTED",
      final_title_override:
        body.final_title_override != null ? String(body.final_title_override).trim() || null : null,
      final_hook_override:
        body.final_hook_override != null ? String(body.final_hook_override).trim() || null : null,
      final_caption_override:
        body.final_caption_override != null ? String(body.final_caption_override).trim() || null : null,
      final_slides_json_override:
        body.final_slides_json_override != null ? String(body.final_slides_json_override) : null,
      template_key: body.template_key != null ? String(body.template_key).trim() || null : null,
    };

    await updateTaskDecision(decodedId, payload);

    if (WEBHOOK_URL?.trim()) {
      await sendDecisionToWebhook(WEBHOOK_URL.trim(), {
        task_id: decodedId,
        ...payload,
        rejection_tags: Array.isArray(body.rejection_tags) ? body.rejection_tags : [],
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Task not found")) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    console.error("POST /api/task/[task_id]/decision", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save decision" },
      { status: 500 }
    );
  }
}
