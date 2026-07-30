-- public.roles had row level security enabled (outside this migration chain
-- — no "alter table public.roles enable row level security" statement exists
-- anywhere in infra/supabase/migrations/, so this was flipped on manually,
-- likely via the Supabase dashboard in response to the linter's
-- rls_enabled_no_policy warning) but never got a policy.
--
-- Postgres RLS defaults to deny-all once enabled with zero policies. Every
-- join from user_roles to roles run inside an RLS-scoped "authenticated"
-- transaction (which backend-node/src/auth/roles.helper.ts's
-- fetchUserRoles() hits whenever it's called from inside the RLS-behind-API
-- path) silently lost every row from roles — for every account, not just
-- SuperAdmin. That is what made ApplicationsService.list() return an empty
-- array and every ReportsService method 403 with "Only staff or the
-- applicant..." regardless of the caller's actual role.
--
-- roles is a small static lookup table of role names (Admin, LoanOfficer,
-- ...) — not sensitive, safe to expose to any authenticated user.
create policy "roles readable by authenticated"
on public.roles
for select
to authenticated
using (true);
