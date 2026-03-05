import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET: list template names stored in CAF backend (Supabase) */
export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("templates")
      .select("name")
      .order("name");
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, names: [] },
        { status: 500 }
      );
    }
    const names = (data ?? []).map((r: { name: string }) => r.name);
    return NextResponse.json({ ok: true, names });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to list templates", names: [] },
      { status: 500 }
    );
  }
}

/** POST: save or overwrite a template by name (live in CAF backend) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const source = typeof body?.source === "string" ? body.source : "";
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const finalName = safeName.endsWith(".hbs") ? safeName : `${safeName}.hbs`;
    if (!finalName || finalName === ".hbs") {
      return NextResponse.json(
        { ok: false, error: "Template name is required" },
        { status: 400 }
      );
    }
    if (!source) {
      return NextResponse.json(
        { ok: false, error: "Template source is required" },
        { status: 400 }
      );
    }
    const supabase = getSupabase();
    const { error } = await supabase
      .from("templates")
      .upsert(
        { name: finalName, source, updated_at: new Date().toISOString() },
        { onConflict: "name" }
      );
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, name: finalName });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save template" },
      { status: 500 }
    );
  }
}
