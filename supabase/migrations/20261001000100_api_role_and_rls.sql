-- Security model: only the Finance Buddy API touches these tables.
-- * The browser/mobile app never talks to the database directly (no anon/authenticated access).
-- * The API connects as the dedicated `fb_api` role through the Supabase pooler.
-- * Row Level Security is on for every table; the only policy is for `fb_api`.
-- The fb_api password is set outside version control:
--   ALTER ROLE fb_api WITH LOGIN PASSWORD '<generated>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fb_api') THEN
    CREATE ROLE fb_api NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO fb_api;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS fb_api_all ON public.%I', t);
    EXECUTE format('CREATE POLICY fb_api_all ON public.%I FOR ALL TO fb_api USING (true) WITH CHECK (true)', t);
    IF t = 'schema_migrations' THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO fb_api', t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO fb_api', t);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fb_api;
