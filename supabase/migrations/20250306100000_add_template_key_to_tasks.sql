-- Add template_key to tasks for rework (which template to use when re-rendering).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS template_key text;

COMMENT ON COLUMN public.tasks.template_key IS 'Template name for rework/re-render (e.g. carousel_ink_blossom)';
