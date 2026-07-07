-- Phase 9 — Resumable loan-application drafts (client UI).
-- Adds step-2 financials, wizard position, and an exact-UI-state blob so a client
-- can save an in-progress application and resume it later. Idempotent; safe to
-- re-run.

alter table public.loan_applications
  add column if not exists monthly_revenue     numeric,
  add column if not exists years_in_operation  integer,
  add column if not exists number_of_employees integer,
  add column if not exists bank_name           text,
  add column if not exists current_step        smallint not null default 1,
  add column if not exists last_saved_at        timestamptz,
  -- HYBRID storage: normalized columns above are the source of truth; draft_state
  -- carries the exact wizard UI state for pixel-perfect restoration. Cleared on
  -- submit.
  add column if not exists draft_state          jsonb;

-- One active draft per client.
create unique index if not exists uniq_active_draft_per_client
  on public.loan_applications (client_id)
  where status = 'Draft';

-- 30-day retention: purge drafts idle for more than 30 days. Child rows
-- (documents, consents, status history) cascade via their FKs.
create or replace function public.purge_stale_drafts() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.loan_applications
  where status = 'Draft'
    and coalesce(last_saved_at, created_at) < now() - interval '30 days';
$$;

NOTIFY pgrst, 'reload schema';

-- Schedule daily at 03:00. Requires pg_cron (Supabase → Database → Extensions).
-- Kept separate and exception-guarded so a cron issue can never roll back the
-- schema changes above. If pg_cron is unavailable, run purge_stale_drafts() from
-- a scheduled Edge Function instead.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purge-stale-drafts') then
      perform cron.unschedule('purge-stale-drafts');
    end if;
    perform cron.schedule('purge-stale-drafts', '0 3 * * *',
      $cron$select public.purge_stale_drafts()$cron$);
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
