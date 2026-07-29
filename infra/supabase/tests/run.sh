#!/usr/bin/env bash
#
# Build a scratch Postgres database from the real migration chain and run the
# RLS assertion suite against it.
#
#   ./infra/supabase/tests/run.sh
#
# Requires a running local Postgres and a superuser connection (to create
# roles). Never touches a Supabase project — everything happens in a
# throwaway local database that is dropped and recreated on each run.
#
# Why the ownership dance below matters: PostgreSQL bypasses RLS for the table
# owner and for anyone holding the owner's privileges. If the migrations are
# applied as a superuser, `authenticated` can end up effectively owning the
# tables and every RLS assertion passes while testing nothing. So the objects
# are owned by a dedicated role that `authenticated` is not a member of, and
# the assertions connect as a separate non-superuser login role.

set -euo pipefail

DB_NAME="${PRDF_TEST_DB:-prdf_rls_test}"
OWNER_ROLE="prdf_test_owner"
APP_ROLE="prdf_test_app"
APP_PASSWORD="${PRDF_TEST_PASSWORD:-prdf_test_pw}"
OWNER_PASSWORD="${PRDF_TEST_OWNER_PASSWORD:-prdf_owner_pw}"
PGHOST_ARG="${PGHOST:-localhost}"

# Superuser connection. Locally this is peer auth; in CI, psql picks up
# PGHOST / PGUSER / PGPASSWORD from the environment automatically.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
SEED="$HERE/../seed/seed.sql"

echo "==> Ensuring roles exist"
psql -q -d postgres <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = '$OWNER_ROLE') then
    create role $OWNER_ROLE;
  end if;
  if not exists (select 1 from pg_roles where rolname = '$APP_ROLE') then
    create role $APP_ROLE;
  end if;
end
\$\$;

-- Database roles are cluster-wide and may already exist from an earlier run
-- or an unrelated project, so force the attributes this harness needs rather
-- than assuming a fresh CREATE. (A pre-existing NOLOGIN $OWNER_ROLE broke the
-- first run of this script.)
alter role $OWNER_ROLE login createdb password '$OWNER_PASSWORD';
alter role $APP_ROLE login noinherit password '$APP_PASSWORD';
grant authenticated to $APP_ROLE;
grant anon to $APP_ROLE;
SQL

echo "==> Recreating database '$DB_NAME' (owned by $OWNER_ROLE)"
dropdb --if-exists "$DB_NAME"
createdb -O "$OWNER_ROLE" "$DB_NAME"

# Needed so the owner can create the pgcrypto extension (trusted since PG13).
psql -q -d "$DB_NAME" -c "grant create on database \"$DB_NAME\" to $OWNER_ROLE;" >/dev/null 2>&1 || true

# pgcrypto is a trusted extension (PG13+), so the database owner can install it
# without superuser.
run_as_owner() {
  PGPASSWORD="$OWNER_PASSWORD" psql -q -v ON_ERROR_STOP=1 \
    -U "$OWNER_ROLE" -h "$PGHOST_ARG" -d "$DB_NAME" "$@"
}

echo "==> Applying Supabase shim"
run_as_owner -c "create extension if not exists pgcrypto;"
run_as_owner -f "$HERE/00_shim.sql"

echo "==> Applying migration chain"
for f in "$MIGRATIONS"/*.sql; do
  echo "    - $(basename "$f")"
  run_as_owner -f "$f" 2>&1 | grep -vE "^(NOTICE|psql:.*NOTICE)" || true
done

echo "==> Applying seed"
run_as_owner -f "$SEED" >/dev/null

echo "==> Applying test fixtures"
run_as_owner -f "$HERE/10_fixtures.sql" >/dev/null

echo "==> Verifying RLS can actually be enforced"
run_as_owner -c "select public.assert_rls_can_bite();" >/dev/null
echo "    ok — 'authenticated' does not hold owner privileges"

echo "==> Running assertions (as non-superuser '$APP_ROLE')"
echo ""
PGPASSWORD="$APP_PASSWORD" psql -v ON_ERROR_STOP=0 \
  -U "$APP_ROLE" -h "$PGHOST_ARG" -d "$DB_NAME" \
  -f "$HERE/20_assertions.sql"
