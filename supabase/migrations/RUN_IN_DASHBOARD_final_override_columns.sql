-- Run in Supabase Dashboard → SQL Editor (adds final_*_override columns for review/rework).
-- Idempotent: safe to run again.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS final_title_override text,
  ADD COLUMN IF NOT EXISTS final_hook_override text,
  ADD COLUMN IF NOT EXISTS final_caption_override text,
  ADD COLUMN IF NOT EXISTS final_slides_json_override text;

COMMENT ON COLUMN public.tasks.final_title_override IS 'Human override for title (rework flow)';
COMMENT ON COLUMN public.tasks.final_hook_override IS 'Human override for hook (rework flow)';
COMMENT ON COLUMN public.tasks.final_caption_override IS 'Human override for caption (rework flow)';
COMMENT ON COLUMN public.tasks.final_slides_json_override IS 'Human override for carousel slides JSON (rework flow)';
