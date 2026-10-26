CREATE TABLE public.funnel_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  event TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX funnel_events_event_created_idx ON public.funnel_events (event, created_at DESC);
CREATE INDEX funnel_events_session_idx ON public.funnel_events (session_id);

GRANT SELECT, INSERT ON public.funnel_events TO anon;
GRANT SELECT, INSERT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log funnel events"
ON public.funnel_events FOR INSERT TO anon, authenticated
WITH CHECK (char_length(session_id) BETWEEN 1 AND 64 AND char_length(event) BETWEEN 1 AND 64);

CREATE POLICY "Anyone can read funnel events"
ON public.funnel_events FOR SELECT TO anon, authenticated
USING (true);