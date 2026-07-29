# RLS assertion suite

Applies the real migration chain to a throwaway Postgres database and asserts that the RLS policies enforce what they claim. Satisfies `platform-architecture-design.md` §6.6.

```bash
./infra/supabase/tests/run.sh
```

Needs a running local Postgres and a superuser connection (to create roles). It never touches a Supabase project — everything happens in a local database that is dropped and recreated on each run. Also runs in CI as the `rls-tests` job in `.github/workflows/ci-cd.yml`.

## Files

| File | Purpose |
|---|---|
| `00_shim.sql` | Minimal Supabase compatibility layer — `auth.users`, `auth.uid()`, `storage.objects`, the three database roles — so the real migration chain applies unmodified on vanilla Postgres. |
| `10_fixtures.sql` | Deterministic users, clients, applications and one document. Fixed UUIDs so failures name a specific actor. |
| `20_assertions.sql` | The assertions and a small harness. |
| `run.sh` | Builds the database and runs everything in order. |

## Why not pgTAP

The spec asks for "pgTAP **or equivalent**" (§2). pgTAP isn't available via Homebrew and isn't trivially installable inside a GitHub Actions Postgres service container. These assertions are plain SQL with a small harness: no extension, runs anywhere `psql` does, TAP-ish output, non-zero exit on failure.

## What it covers

The four assertions §6.6 requires:

1. A client cannot read another client's application.
2. An unassigned `Intern` cannot read or mutate an application.
3. A `LoanOfficer` can read all applications.
4. Only a `SuperAdmin` can grant `Admin`.

Plus regressions for authorization bugs actually found during implementation — a client deleting another client's draft, a plain Admin granting Admin — and coverage of the status-transition rules and document immutability (§6.9). 16 assertions total.

## Two things that make the results trustworthy

Both were added because the harness initially produced meaningless passes.

**The suite proves it can fail.** `assert_rls_can_bite()` (in `00_shim.sql`) refuses to run if `authenticated` holds the table owner's privileges, and assertion #1 is a canary that fails loudly if RLS isn't being enforced at all. This matters: PostgreSQL silently bypasses RLS for the table owner, and database roles are cluster-wide, so on a developer machine `authenticated` may already be a member of the owning superuser from an unrelated project. When this harness was first written that was exactly the case, and every assertion passed while testing nothing. `run.sh` therefore owns test objects with a dedicated role and connects as a separate non-superuser.

**An empty run is a failure, not a pass.** The suite asserts a minimum assertion count. A permissions error once swallowed every recorded result and the suite reported success with zero assertions — indistinguishable from a clean pass without this check.

To confirm the suite still bites, break a policy and re-run:

```sql
drop policy "applications client access" on public.loan_applications;
create policy "applications client access" on public.loan_applications
  for select to authenticated using (true);
```

Expect 4 failures, led by the canary, and a non-zero exit.

## Adding assertions

Use `check_that` (boolean), `check_blocked` (statement must be refused — an exception or zero rows affected), or `check_error_unlike` (if it fails, it must not be for this reason). Bump the minimum count in the final `DO` block.

Pick an actor the other rules would otherwise permit. A `check_blocked` that passes because RLS filtered the row out proves nothing about the trigger you meant to test — this is why the immutability assertions run as a `LoanOfficer`, whom the `documents update by staff` policy explicitly allows to update.
