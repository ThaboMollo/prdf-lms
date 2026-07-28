# Access review & RLS audit checklist

Part of Phase 6 (`platform-architecture-design.md` §7): "Quarterly access review and annual RLS audit added to a maintenance calendar." Recurring calendar reminders point here — this is what to actually do when one fires.

## Quarterly access review

Goal: confirm every elevated role grant is still legitimate. Elevated = `Admin`, `SuperAdmin`, and worth a lighter pass on `LoanOfficer`/`Originator`/`Intern` too.

1. **Pull the current staff role list.** Via `admin-ui`'s User Access page, or directly: `GET /api/admin/users/access?filter=admins` (requires an Admin/SuperAdmin JWT). Cross-check against `?filter=internal` for the full staff roster.
2. **For every `Admin`/`SuperAdmin` entry**: confirm the person is still an active staff member (not departed, not moved to a role that shouldn't carry admin access). Revoke via the User Access page if not.
3. **Check the "SuperAdmin implies Admin" invariant still holds**: every `SuperAdmin` in the list should also show as `isAdmin: true` in the response (`admin-ui/src/App.tsx` and `backend-node/src/admin/admin.service.ts` enforce this at grant-time, but a review should confirm no manual DB edit has bypassed it).
4. **For `Intern`/`Originator`/`LoanOfficer`**: look for anyone who's had the role for an unusually long time without a corresponding active caseload, or anyone whose role doesn't match their actual current job function. This list is longer and lower-stakes than the Admin check — a quick skim, not a line-by-line audit, unless something looks wrong.
5. **Log the outcome** (date, who reviewed, any revocations made) somewhere durable — this doc doesn't currently have a log table; add one, or track it wherever the org already tracks compliance activities, whichever this doesn't duplicate.

## Annual RLS audit

Goal: confirm every RLS policy in the migration chain still does what it claims, and that nothing references a function that no longer exists (the exact class of defect already found once — see `infra/supabase/migrations/20260723180000_baseline.sql:14-16`, which documents fixing a policy that referenced `current_user_has_role()`, a function that was never defined anywhere, in favor of the real `is_in_role()` function every other policy already used).

1. **Read every `create policy` statement** in `infra/supabase/migrations/*.sql` (they're all in the baseline migration plus any later additions — grep `create policy` across the directory to find them all). For each one, confirm:
   - Any function it calls (`is_in_role`, etc.) is actually defined somewhere earlier in the chain — grep for `create or replace function public.<name>` to confirm.
   - The policy's `using`/`with check` clause still matches the access rule it's meant to enforce (cross-reference against `docs/rbac.md` if it exists, or the role semantics documented in `packages/domain` and `backend-node/src/auth/roles.helper.ts`).
2. **Confirm RLS is actually enabled**, not just policies present: `select tablename, rowsecurity from pg_tables where schemaname = 'public' and rowsecurity = false;` against a real (non-production ideally — see `docs/backup-restore-drill.md`) copy of the database. Anything unexpected in that list is worth investigating.
3. **Spot-check with real JWTs**, not just reading SQL: this project's established verification method throughout implementation was a scratch Postgres seeded with the real migration chain, a mock JWKS server generating real signed test JWTs, and `backend-node` booted locally against both — then real HTTP requests via `curl` to prove a Client-role JWT can't read another client's data, a LoanOfficer JWT can't grant Admin, etc. Re-run a few of these for the highest-stakes policies (cross-client data isolation, role-grant authorization) rather than trusting the SQL reads correctly.
4. **Use `get_advisors`** (Supabase's own security advisor, via the Supabase MCP tools once connected to the right account) as a fast first pass before the manual read — it'll catch some of the same class of issue automatically.
5. **Log the outcome** — date, what was checked, anything found and whether it was fixed or logged as a new open decision (`platform-architecture-design.md` §10 is the existing home for "needs a human answer" items).
