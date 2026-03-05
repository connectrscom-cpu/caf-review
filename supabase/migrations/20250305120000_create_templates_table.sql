-- Carousel templates saved from Template Playground (Design tab).
-- name must end with .hbs; source is full HTML + Handlebars.

CREATE TABLE IF NOT EXISTS public.templates (
  name text PRIMARY KEY,
  source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.templates IS 'Custom carousel templates saved from CAF Template Playground';
