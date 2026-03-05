import { getSupabase } from "@/lib/supabase/server";

export interface TaskAsset {
  position: number;
  public_url: string;
  asset_type: string | null;
}

/**
 * Fetch all assets for a single task (ordered by position), e.g. for carousel slider.
 * Derives public_url from bucket + object_path when not set.
 */
export async function getAssetsForTask(taskId: string): Promise<TaskAsset[]> {
  const supabase = getSupabase();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

  const { data, error } = await supabase
    .from("assets")
    .select("position, public_url, asset_type, bucket, object_path")
    .eq("task_id", taskId)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    position: number;
    public_url: string | null;
    asset_type: string | null;
    bucket: string | null;
    object_path: string | null;
  }[];

  return rows.map((r) => {
    let url = r.public_url ?? null;
    if (!url && r.bucket && r.object_path && supabaseUrl) {
      const path = r.object_path.startsWith("/") ? r.object_path.slice(1) : r.object_path;
      url = `${supabaseUrl}/storage/v1/object/public/${r.bucket}/${path}`;
    }
    return {
      position: r.position ?? 0,
      public_url: url ?? "",
      asset_type: r.asset_type ?? null,
    };
  });
}
