-- Run in Supabase Dashboard → SQL Editor if you don't use "supabase db push".
-- Adds bucket and object_path to public.assets so n8n POST to /rest/v1/assets works.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS bucket text,
  ADD COLUMN IF NOT EXISTS object_path text;

COMMENT ON COLUMN public.assets.bucket IS 'Storage bucket name, e.g. assets';
COMMENT ON COLUMN public.assets.object_path IS 'Path within bucket, e.g. carousels/run_id/task_id/slide_001.png';
