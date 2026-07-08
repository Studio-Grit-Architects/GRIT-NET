-- ============================================================================
-- RLS LOCKDOWN — run this entire file in the Supabase SQL Editor
-- (Project > SQL Editor > New query > paste > Run)
-- ============================================================================
--
-- WHY: supabase-schema.sql created policies `using (true)` with NO role
-- qualifier. A policy with no role clause applies to ALL roles, including the
-- public `anon` role whose key ships in the browser bundle. That means anyone
-- with the site's anon key + project URL could read/write these tables
-- directly via the PostgREST API — bypassing every auth check in the Next.js
-- routes. team_members in particular holds Google OAuth refresh tokens
-- (= full Gmail/Calendar takeover) and meeting transcripts.
--
-- FIX: this app talks to the DB ONLY through the service-role key, which
-- BYPASSES RLS entirely. So the correct posture is: RLS enabled on every
-- table, and NO permissive policies. anon/authenticated then get default-deny;
-- the server (service role) is unaffected and keeps working exactly as now.
--
-- This file is idempotent and safe to re-run.
-- ============================================================================

-- 1) Drop the dangerous permissive policies from supabase-schema.sql -----------
drop policy if exists "service role full access" on team_members;
drop policy if exists "service role full access" on projects;
drop policy if exists "service role full access" on stages;
drop policy if exists "service role full access" on time_entries;

-- 2) Enable RLS on every table (IF EXISTS guards tables that may not exist) -----
--    Core tables
alter table if exists team_members   enable row level security;
alter table if exists projects       enable row level security;
alter table if exists stages         enable row level security;
alter table if exists time_entries   enable row level security;

--    Tables from supabase-test-setup / later updates
alter table if exists clients        enable row level security;
alter table if exists project_members enable row level security;
alter table if exists tasks          enable row level security;
alter table if exists meetings       enable row level security;

--    Tables from update-7 / update-8 (had NO RLS before)
alter table if exists planning_applications      enable row level security;
alter table if exists stage_deliverables         enable row level security;
alter table if exists deliverable_templates      enable row level security;
alter table if exists deliverable_template_items enable row level security;

--    Tables created via the Supabase dashboard (not in any repo SQL file)
alter table if exists proposals          enable row level security;
alter table if exists contractors        enable row level security;
alter table if exists push_subscriptions enable row level security;

-- 3) Force RLS so even the table owner is subject to it (defence in depth).
--    Service role still bypasses (it is a BYPASSRLS role), so the app is fine.
alter table if exists team_members        force row level security;
alter table if exists projects            force row level security;
alter table if exists stages              force row level security;
alter table if exists time_entries        force row level security;
alter table if exists clients             force row level security;
alter table if exists project_members     force row level security;
alter table if exists tasks               force row level security;
alter table if exists meetings            force row level security;
alter table if exists planning_applications      force row level security;
alter table if exists stage_deliverables         force row level security;
alter table if exists deliverable_templates      force row level security;
alter table if exists deliverable_template_items force row level security;
alter table if exists proposals           force row level security;
alter table if exists contractors         force row level security;
alter table if exists push_subscriptions  force row level security;

-- ============================================================================
-- 4) VERIFY — run these after the above and read the output.
-- ============================================================================

-- (a) Every table should show rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- (b) This should return ZERO rows. Any row here is a policy that still grants
--     access to a non-service role (anon/authenticated/public) — investigate it.
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and (roles = '{public}' or 'anon' = any(roles) or 'authenticated' = any(roles));

-- ============================================================================
-- AFTER RUNNING:
--   * Confirm the app still works (it uses the service role, so it should be
--     unaffected). Smoke-test: sign in, load dashboard, save a time entry.
--   * The anon key is now harmless for direct table access, but since it was
--     exposed with the door open, rotating it is good hygiene:
--     Supabase > Project Settings > API > "Reset anon/public key", then update
--     NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel env vars and redeploy.
--   * Consider rotating Google OAuth tokens for all team members (sign-out /
--     re-consent) since refresh tokens were potentially exposed.
-- ============================================================================
