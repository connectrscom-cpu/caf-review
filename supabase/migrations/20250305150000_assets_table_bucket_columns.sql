-- Add bucket and object_path to assets so n8n can POST rows after uploading to Storage.
-- Safe if table was created elsewhere with task_id, public_url, asset_type, position etc.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS bucket text,
  ADD COLUMN IF NOT EXISTS object_path text;

COMMENT ON COLUMN public.assets.bucket IS 'Storage bucket name, e.g. assets';
COMMENT ON COLUMN public.assets.object_path IS 'Path within bucket, e.g. carousels/run_id/task_id/slide_001.png';
