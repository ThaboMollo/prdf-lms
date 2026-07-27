-- Phase 3 (backend completeness pass) — general status-transition graph
-- enforcement at the database layer. Decided in platform-architecture-design.md
-- section 10.4 ("does status transition validation move into the database?
-- Recommended: enforce it in the API and add a DB trigger.") but not built
-- during Phase 3a, which scoped to backend-internal hardening only.
--
-- Today the only transition-graph enforcement anywhere is backend-node's
-- in-memory LOAN_STATUS_TRANSITIONS map (applications.service.ts) — never
-- exercised by the Supabase-direct frontend path at all, so a client calling
-- PostgREST directly could currently jump straight from Draft to Approved.
-- This trigger is the second, independent layer: the same graph, enforced
-- regardless of which code path performs the update, matching how the
-- required-document and product-limit triggers already work.
--
-- Additive only — earlier migrations are already applied to production and
-- are never edited again, only built upon.

create or replace function public.enforce_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'Draft' then array['Submitted']
    when 'Submitted' then array['UnderReview', 'InfoRequested', 'Approved', 'Rejected']
    when 'UnderReview' then array['InfoRequested', 'Approved', 'Rejected']
    when 'InfoRequested' then array['Submitted', 'UnderReview']
    when 'Approved' then array['Disbursed']
    when 'Disbursed' then array['InRepayment']
    when 'InRepayment' then array['Closed']
    else array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'Invalid status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_status_transition on public.loan_applications;
create trigger trg_enforce_status_transition
  before update of status on public.loan_applications
  for each row
  execute function public.enforce_status_transition();
