# Backup restore drill

Part of Phase 6 (`platform-architecture-design.md` §7): "Backup restore drill against a non-production project, documented." This is the procedure. **It has not been executed yet** — see the note at the bottom.

## Why this exists

Supabase takes automated daily backups (and point-in-time recovery on paid plans), but an untested backup is not a real disaster-recovery capability — the first time you actually need to restore one should not be the first time you've tried it. This drill proves the restore path works end-to-end, on a non-production copy, before it's ever needed for real.

## Procedure

1. **Create a non-production Supabase project** in the same organization as PRDF's real project (Project Settings → General, on the production project, will show which org). Use the same region as production (region is not changeable after creation — see `platform-architecture-design.md` §10, open decision #6).

2. **Restore into it**, either:
   - **From an automated backup**: Supabase Dashboard → Database → Backups (on the production project) → pick a recent backup → Restore. If Supabase's restore flow only supports restoring in-place (not to a new project) on the current plan, use the second method instead.
   - **From the migration chain** (always available regardless of plan): apply `infra/supabase/migrations/*.sql` in order (they're numbered/timestamped, apply oldest-first) to the new project via `supabase db push` or the SQL editor, then load `infra/supabase/seed/seed.sql` for reference data. This proves the *schema* restore path; it does not restore real production data, so pair it with a `pg_dump`/`pg_restore` of production data if you need a true data-inclusive drill.

3. **Verify the restore actually worked** — don't just check that the restore command exited 0:
   - **Row counts**: for a handful of the tables that matter most operationally — `loan_applications`, `loans`, `repayments`, `profiles`, `user_roles` — compare `select count(*) from <table>` between production and the restored copy. They should match (or be within the expected staleness window if restoring from an older backup, not a live migration-chain rebuild).
   - **RLS is actually enabled**, not just present in the migration file: `select tablename, rowsecurity from pg_tables where schemaname = 'public' and rowsecurity = false;` should return the expected short list of intentionally-RLS-free tables only (e.g. lookup/reference tables), not core tables like `loan_applications` or `profiles`. Supabase's own advisor tooling (`get_advisors` via the Supabase MCP tools, `type: 'security'`) is a faster way to spot anything obviously wrong.
   - **A real login + query works**: sign in as a test user against the restored project's own auth (not production's), confirm `select` against an RLS-protected table returns the expected own-row-only results — the same "real JWT against a real Postgres" methodology used throughout this project's implementation, not just a service-role bypass query.

4. **Record the outcome** — append a dated entry to the table below with: date, which method was used (backup restore vs. migration-chain rebuild), how long it took start-to-finish, and pass/fail on each verification step in (3). If anything failed, note what and whether it's a real gap or a drill-environment artifact (e.g. a missing env var that only matters for the drill project, not production).

## Drill log

| Date | Method | Duration | Row counts match | RLS enabled | Login+query verified | Notes |
|---|---|---|---|---|---|---|
| _(none yet)_ | | | | | | |

## Known account/plan constraints (found while attempting this)

Two attempts to actually run this drill hit real, org-level blockers worth knowing about before trying again:

1. **Creating a second free-tier project failed**: the org (`emfcbtgftgcbxgbewrco`) is at its 2-active-free-project cap. `applya` (project ref `rgqmuixhkmbaaoaguslr`) is the second project — it's already `INACTIVE` (Supabase's auto-pause for idle free projects), but a paused project still counts against the cap; only deleting it (or upgrading the org) frees a slot. Deleting `applya` wasn't something this session assumed authority to do without explicit confirmation, and wasn't confirmed.
2. **Supabase branching (the lighter-weight alternative — branch off `prdf` directly, no new top-level project, no quota impact) requires the Pro plan.** This org is on the free tier, so `create_branch` fails with a plan-upgrade requirement.

So: this drill needs either (a) `applya` deleted (confirm it's genuinely unused first) to free a project slot for a real non-prod project, or (b) the org upgraded to Pro to use branching, before it can actually run. Neither was authorized as of this writing.

## Status: not yet executed

This runbook was written but not run. It was initially blocked on having the correct Supabase account/organization connected — resolved: the correct account is connected and confirms the real project, `prdf` (ref `kjhibiawvvmzhdjbqhpq`, org `emfcbtgftgcbxgbewrco`, region `eu-west-1`, status `ACTIVE_HEALTHY`), matching the Supabase URL already used in both frontends' `.env.development.example`. Two live attempts to run the drill (new project, then branching) both hit the account/plan constraints logged above. Execution is deferred until one of those is resolved — see that section for exactly what's needed.
