CREATE TABLE IF NOT EXISTS public.funnel_events_archive (
  id uuid PRIMARY KEY,
  session_id text NOT NULL,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.funnel_events_archive TO service_role;
ALTER TABLE public.funnel_events_archive ENABLE ROW LEVEL SECURITY;