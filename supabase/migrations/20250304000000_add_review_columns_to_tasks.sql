-- Add review/decision columns to tasks for CAF Review Console.
-- Run this in Supabase SQL Editor if you don't use Supabase CLI migrations.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS rejection_tags text,
  ADD COLUMN IF NOT EXISTS validator text,
  ADD COLUMN IF NOT EXISTS submit text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

COMMENT ON COLUMN public.tasks.decision IS 'APPROVED | NEEDS_EDIT | REJECTED';
COMMENT ON COLUMN public.tasks.submitted_at IS 'When the reviewer submitted the decision';
