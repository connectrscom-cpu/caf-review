import { NextResponse } from "next/server";
import { readReviewQueue } from "@/lib/google/sheets";

export const dynamic = "force-dynamic";

const FACET_KEYS = ["project", "run_id", "platform", "flow_type", "recommended_route"] as const;

export async function GET() {
  try {
    const { rows } = await readReviewQueue();
    const facets: Record<string, string[]> = {};
    for (const key of FACET_KEYS) {
      const set = new Set<string>();
      for (const row of rows) {
        const v = (row[key] ?? "").trim();
        if (v) set.add(v);
      }
      facets[key] = Array.from(set).sort();
    }
    return NextResponse.json(facets);
  } catch (err) {
    console.error("GET /api/facets", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load facets" },
      { status: 500 }
    );
  }
}
