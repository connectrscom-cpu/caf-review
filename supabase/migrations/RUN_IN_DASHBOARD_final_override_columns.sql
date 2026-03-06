-- Run in Supabase Dashboard → SQL Editor if you see:
--   "Could not find the 'final_caption_override' column of 'tasks' in the schema cache"
-- Idempotent: safe to run more than once.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS final_title_override text,
  ADD COLUMN IF NOT EXISTS final_hook_override text,
  ADD COLUMN IF NOT EXISTS final_caption_override text,
  ADD COLUMN IF NOT EXISTS final_slides_json_override text,
  ADD COLUMN IF NOT EXISTS template_key text;

COMMENT ON COLUMN public.tasks.final_title_override IS 'Human override for title (rework flow)';
COMMENT ON COLUMN public.tasks.final_hook_override IS 'Human override for hook (rework flow)';
COMMENT ON COLUMN public.tasks.final_caption_override IS 'Human override for caption (rework flow)';
COMMENT ON COLUMN public.tasks.final_slides_json_override IS 'Human override for carousel slides JSON (rework flow)';
COMMENT ON COLUMN public.tasks.template_key IS 'Template name for rework/re-render';
