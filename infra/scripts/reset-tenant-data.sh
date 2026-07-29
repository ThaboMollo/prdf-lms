#!/usr/bin/env bash
#
# Guarded runner for reset-tenant-data.sql.
#
#   DRY RUN (default — shows what would be deleted, changes nothing):
#     DATABASE_URL='postgresql://...' ./infra/scripts/reset-tenant-data.sh
#
#   FOR REAL:
#     DATABASE_URL='postgresql://...' ./infra/scripts/reset-tenant-data.sh --execute
#
# This deletes every application, loan, document, repayment and user account.
# It is intended to be run ONCE, before go-live, to clear demo/test data.
#
# The guards below exist because this is the kind of script that gets pasted
# into the wrong terminal. Dry run is the default; --execute requires typing
# the database's own identifier back, and confirming a backup exists.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$HERE/reset-tenant-data.sql"
SEED_FILE="$HERE/../supabase/seed/seed.sql"

EXECUTE=false
for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE=true ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  cat >&2 <<'MSG'
ERROR: DATABASE_URL is not set.

Set it explicitly — this script deliberately has no default connection, so it
can never fall back to "whatever database happens to be nearby".

  export DATABASE_URL='postgresql://postgres.<ref>:<password>@<host>:6543/postgres'
MSG
  exit 1
fi

# Identify the target so the operator is confirming a specific database rather
# than an abstraction. Never print the password.
DB_IDENT="$(psql "$DATABASE_URL" -tAc \
  "select current_database() || ' @ ' || coalesce(inet_server_addr()::text, 'local')" 2>/dev/null || true)"

if [[ -z "$DB_IDENT" ]]; then
  echo "ERROR: could not connect using DATABASE_URL." >&2
  exit 1
fi

HOST_PART="$(printf '%s' "$DATABASE_URL" | sed -E 's|.*@([^/:]+).*|\1|')"

echo ""
echo "  Target database : $DB_IDENT"
echo "  Host            : $HOST_PART"
echo ""

echo "--- Current contents ---"
psql "$DATABASE_URL" -c "
select 'auth.users' as table_name, count(*) as rows from auth.users
union all select 'clients', count(*) from public.clients
union all select 'loan_applications', count(*) from public.loan_applications
union all select 'loan_documents', count(*) from public.loan_documents
union all select 'loans', count(*) from public.loans
union all select 'repayments', count(*) from public.repayments
union all select 'audit_log', count(*) from public.audit_log
order by 1;"

if [[ "$EXECUTE" != true ]]; then
  cat <<'MSG'

DRY RUN — nothing was changed.

The counts above are what would be permanently deleted, along with every
user account. Re-run with --execute to actually do it.

MSG
  exit 0
fi

# --- Confirmation ----------------------------------------------------------
cat <<MSG

================================================================================
  THIS WILL PERMANENTLY DELETE ALL DATA IN THE DATABASE SHOWN ABOVE
================================================================================

  Every loan application, loan, document record, repayment, note, task,
  notification and audit-log entry will be destroyed, and every user account
  will be deleted. This cannot be undone from within the application.

  Two things this does NOT do:

    - It does not delete the uploaded files in the 'loan-documents' storage
      bucket. Those must be removed separately.

    - It does not leave you with an admin account. Every SuperAdmin is
      deleted, new signups only get 'Client', and granting Admin requires an
      existing SuperAdmin. Bootstrap SQL is printed at the end — you will
      need it.

MSG

read -r -p "  Have you taken a verified backup you can restore from? (yes/no): " HAS_BACKUP
if [[ "$HAS_BACKUP" != "yes" ]]; then
  echo ""
  echo "  Aborted. Take a backup first — Supabase Dashboard > Database > Backups."
  echo "  See docs/backup-restore-drill.md for verifying a backup is actually restorable."
  exit 1
fi

echo ""
read -r -p "  Type the target database identifier exactly to proceed: " TYPED
if [[ "$TYPED" != "$DB_IDENT" ]]; then
  echo ""
  echo "  Aborted — what you typed does not match the target."
  echo "    expected: $DB_IDENT"
  echo "    got     : $TYPED"
  exit 1
fi

# --- Run -------------------------------------------------------------------
echo ""
echo "==> Resetting. The whole thing runs in one transaction; any failure rolls back."
echo ""

psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v seed_path="$SEED_FILE" \
  -f "$SQL_FILE"

# --- What to do next -------------------------------------------------------
cat <<'MSG'

================================================================================
  RESET COMPLETE — two things still need doing
================================================================================

1. BOOTSTRAP AN ADMIN ACCOUNT

   There is currently no account with any staff role, and no in-app way to
   create one: signups get 'Client', and granting Admin needs an existing
   SuperAdmin.

   Have the first person register through the app, then run this once,
   substituting their email:

     insert into public.user_roles (user_id, role_id)
     select u.id, r.id
       from auth.users u
       cross join public.roles r
      where u.email = 'you@example.com'
        and r.name in ('SuperAdmin', 'Admin');

   Both roles are granted together deliberately: SuperAdmin implies Admin
   throughout this system, and the app's guards assume it.

   Verify:
     select u.email, array_agg(r.name order by r.name)
       from auth.users u
       join public.user_roles ur on ur.user_id = u.id
       join public.roles r on r.id = ur.role_id
      group by u.email;

2. CLEAR THE STORAGE BUCKET

   Document rows are gone but the uploaded files are not. Empty the
   'loan-documents' bucket via the Supabase Dashboard (Storage) or the
   Storage API, or every pre-reset document is still sitting there.

MSG
