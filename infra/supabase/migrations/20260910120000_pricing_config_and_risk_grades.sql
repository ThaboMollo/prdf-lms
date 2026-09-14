-- Phase 1 credit model — pricing configuration + risk grades.
--
-- Backs the pure pricing engine (packages/domain/pricing.ts and its synced
-- backend copy backend-node/src/common/pricing.ts) and the POST /api/pricing/
-- quote endpoint. Values here are the money-model tunables confirmed by the
-- PO/client on 2026-09-10 (see docs/credit-model-phase1-plan.md).
--
-- Additive only — never edits an already-applied migration.

-- ===========================================================================
-- 1. pricing_config — a single row of tunables.
--    The boolean primary key defaulting to true (with a check) enforces the
--    singleton: only one row can ever exist.
-- ===========================================================================
create table if not exists public.pricing_config (
  id                  boolean primary key default true check (id),
  prime_rate_pct      numeric(6,3)  not null default 10.5,
  initiation_fee      numeric(18,2) not null default 1000,
  management_fee_pct  numeric(6,3)  not null default 3,
  penalty_rate_pct    numeric(6,3)  not null default 2,
  penalty_period_days integer       not null default 30 check (penalty_period_days > 0),
  days_per_year       integer       not null default 365 check (days_per_year > 0),
  rounding_mode       text          not null default 'CEIL_2DP'
                        check (rounding_mode in ('CEIL_2DP', 'HALF_UP_2DP')),
  updated_at          timestamptz   not null default now()
);

insert into public.pricing_config (id) values (true)
on conflict (id) do nothing;

-- ===========================================================================
-- 2. risk_grades — the Prime margin added per grade. Annual rate =
--    prime_rate_pct + margin_pct. Set by the Risk Analyst at Due Diligence.
-- ===========================================================================
create table if not exists public.risk_grades (
  grade      text primary key check (grade in ('Low', 'Moderate', 'High', 'Worst')),
  margin_pct numeric(6,3) not null,
  sort_order integer      not null,
  is_active  boolean      not null default true
);

insert into public.risk_grades (grade, margin_pct, sort_order, is_active) values
  ('Low',       5.0,  1, true),
  ('Moderate',  6.5,  2, true),
  ('High',      8.5,  3, true),
  ('Worst',    10.5,  4, true)
on conflict (grade) do nothing;

-- ===========================================================================
-- 3. RLS — reference data. Any internal user may read; only Admin/SuperAdmin
--    may change the config. The backend runs as `authenticated` with RLS on
--    (see 20260729140000_secure_user_directory.sql header), so these policies
--    are the real gate.
-- ===========================================================================
alter table public.pricing_config enable row level security;
alter table public.risk_grades   enable row level security;

-- Shared predicate: is the caller an internal (staff/workflow) user?
create or replace function public.is_internal_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_in_role(p_user_id, 'SuperAdmin')
      or public.is_in_role(p_user_id, 'Admin')
      or public.is_in_role(p_user_id, 'IntakeClerk')
      or public.is_in_role(p_user_id, 'ProgramOfficer')
      or public.is_in_role(p_user_id, 'RiskAnalyst')
      or public.is_in_role(p_user_id, 'ReviewCommittee')
      or public.is_in_role(p_user_id, 'ProgramManager')
      or public.is_in_role(p_user_id, 'Board')
      or public.is_in_role(p_user_id, 'Legal')
      or public.is_in_role(p_user_id, 'FinanceOfficer');
$$;

grant execute on function public.is_internal_user(uuid) to anon, authenticated, service_role;

drop policy if exists "pricing config internal read" on public.pricing_config;
create policy "pricing config internal read"
on public.pricing_config
for select
using (public.is_internal_user(auth.uid()));

drop policy if exists "pricing config admin write" on public.pricing_config;
create policy "pricing config admin write"
on public.pricing_config
for update
using (public.is_in_role(auth.uid(), 'Admin') or public.is_in_role(auth.uid(), 'SuperAdmin'))
with check (public.is_in_role(auth.uid(), 'Admin') or public.is_in_role(auth.uid(), 'SuperAdmin'));

drop policy if exists "risk grades internal read" on public.risk_grades;
create policy "risk grades internal read"
on public.risk_grades
for select
using (public.is_internal_user(auth.uid()));

drop policy if exists "risk grades admin write" on public.risk_grades;
create policy "risk grades admin write"
on public.risk_grades
for all
using (public.is_in_role(auth.uid(), 'Admin') or public.is_in_role(auth.uid(), 'SuperAdmin'))
with check (public.is_in_role(auth.uid(), 'Admin') or public.is_in_role(auth.uid(), 'SuperAdmin'));
