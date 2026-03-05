import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET: return template source by name from CAF backend (Supabase). Used by renderer when CAF_TEMPLATE_API_URL is set. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const raw = name ?? "";
    const safeName = raw.replace(/\.\./g, "").replace(/\//g, "");
    if (!safeName) {
      return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 });
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("templates")
      .select("source")
      .eq("name", safeName)
      .single();
    if (error || !data?.source) {
      return NextResponse.json(
        { ok: false, error: "Template not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, name: safeName, source: data.source });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load template" },
      { status: 500 }
    );
  }
}
