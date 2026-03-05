import { NextRequest, NextResponse } from "next/server";
import { getAssetsForTask } from "@/lib/data/assets";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
) {
  try {
    const { task_id } = await params;
    const decodedId = decodeURIComponent(task_id);
    const assets = await getAssetsForTask(decodedId);
    return NextResponse.json({ assets });
  } catch (err) {
    console.error("GET /api/task/[task_id]/assets", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load assets" },
      { status: 500 }
    );
  }
}
