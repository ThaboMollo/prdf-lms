#!/usr/bin/env bash
#
# Apply the canonical migration chain across every configured tenant
# (docs/multi-tenant-spec.md §W6).
#
#   ./infra/scripts/migrate-all.sh              # status + drift report (default)
#   ./infra/scripts/migrate-all.sh --apply      # apply pending migrations
#   ./infra/scripts/migrate-all.sh --adopt      # record as applied WITHOUT running
#
# Tenants are read from the same environment variables the API uses:
#
#   TENANTS=prdf,kgolo
#   TENANT_PRDF_DB_URL=postgresql://...
#
# or, for a pre-multi-tenant deployment, SUPABASE_DB_CONNECTION_STRING.
#
# ── Why this exists ─────────────────────────────────────────────────────────
# The migration chain is the product: every tenant must run a byte-identical
# schema. Until now there was no record anywhere of which migrations a given
# database had — they were applied by hand. One tenant silently sitting a
# migration behind is the thing that ends "byte-identical", and it would be
# invisible.
#
# Safe by construction: the full chain is verified idempotent (it applies
# cleanly twice to the same database), so re-application cannot corrupt a
# tenant. Tracking is for efficiency and drift visibility, not correctness.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$HERE/../supabase/migrations"

MODE="status"
for arg in "$@"; do
  case "$arg" in
    --apply) MODE="apply" ;;
    --adopt) MODE="adopt" ;;
    --status) MODE="status" ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# --- Resolve tenants --------------------------------------------------------
declare -a SLUGS=()
declare -a URLS=()

if [[ -n "${TENANTS:-}" ]]; then
  IFS=',' read -ra raw <<< "$TENANTS"
  for slug in "${raw[@]}"; do
    slug="$(echo "$slug" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    [[ -z "$slug" ]] && continue
    # tr -c also converts the trailing newline, which silently produced
    # TENANT_A__DB_URL. Normalise with sed on the value itself instead.
    upper="$(printf '%s' "$slug" | tr '[:lower:]' '[:upper:]' | sed 's/[^A-Z0-9]/_/g')"
    var="TENANT_${upper}_DB_URL"
    url="${!var:-}"
    if [[ -z "$url" ]]; then
      echo "ERROR: $var is not set for tenant '$slug'." >&2
      echo "Refusing to run — migrating only some tenants is how a fleet diverges." >&2
      exit 1
    fi
    SLUGS+=("$slug"); URLS+=("$url")
  done
elif [[ -n "${SUPABASE_DB_CONNECTION_STRING:-}" ]]; then
  echo "TENANTS not set — using SUPABASE_DB_CONNECTION_STRING (legacy single-tenant)."
  SLUGS+=("default"); URLS+=("$SUPABASE_DB_CONNECTION_STRING")
else
  echo "ERROR: no tenants configured. Set TENANTS or SUPABASE_DB_CONNECTION_STRING." >&2
  exit 1
fi

echo "Tenants: ${SLUGS[*]}"
echo "Mode:    $MODE"
echo ""

# --- Migration tracking -----------------------------------------------------
# Deliberately NOT supabase_migrations.schema_migrations: that table belongs to
# the Supabase CLI, and writing our own records into it would confuse the CLI
# if this project ever adopts it.
ENSURE_TABLE_SQL="
create table if not exists public.app_migrations (
  version     text primary key,
  checksum    text not null,
  applied_at  timestamptz not null default now()
);
comment on table public.app_migrations is
  'Applied application migrations. Managed by infra/scripts/migrate-all.sh.';
"

checksum_of() { shasum -a 256 "$1" | cut -d' ' -f1; }

declare -a ALL_VERSIONS=()
for file in "$MIGRATIONS_DIR"/*.sql; do
  ALL_VERSIONS+=("$(basename "$file" .sql)")
done

overall_failed=0
declare -a APPLIED_REPORT=()

for i in "${!SLUGS[@]}"; do
  slug="${SLUGS[$i]}"
  url="${URLS[$i]}"
  echo "── $slug ─────────────────────────────────────────────"

  if ! psql "$url" -v ON_ERROR_STOP=1 -q -c "$ENSURE_TABLE_SQL" >/dev/null 2>&1; then
    echo "  ERROR: cannot connect or create tracking table."
    overall_failed=1
    APPLIED_REPORT+=("$slug:UNREACHABLE")
    echo ""
    continue
  fi

  applied="$(psql "$url" -tAc "select version from public.app_migrations order by version" 2>/dev/null || true)"

  pending=()
  drifted=()
  for file in "$MIGRATIONS_DIR"/*.sql; do
    version="$(basename "$file" .sql)"
    sum="$(checksum_of "$file")"
    if echo "$applied" | grep -qx "$version"; then
      recorded="$(psql "$url" -tAc "select checksum from public.app_migrations where version = '$version'" 2>/dev/null || true)"
      [[ "$recorded" != "$sum" ]] && drifted+=("$version")
    else
      pending+=("$version")
    fi
  done

  for d in "${drifted[@]:-}"; do
    [[ -n "$d" ]] && echo "  ⚠ CHECKSUM CHANGED since it was applied: $d"
  done
  [[ ${#drifted[@]} -gt 0 ]] && overall_failed=1

  if [[ ${#pending[@]} -eq 0 ]]; then
    echo "  up to date (${#ALL_VERSIONS[@]} migrations)"
  else
    echo "  pending: ${#pending[@]}"
    for p in "${pending[@]}"; do echo "    - $p"; done
  fi

  case "$MODE" in
    apply)
      for version in "${pending[@]:-}"; do
        [[ -z "$version" ]] && continue
        file="$MIGRATIONS_DIR/$version.sql"
        printf "  applying %s ... " "$version"
        # Single transaction per migration: a failure leaves that tenant on the
        # previous migration rather than half-applied.
        if psql "$url" -v ON_ERROR_STOP=1 -q --single-transaction -f "$file" >/tmp/migrate-$slug.log 2>&1; then
          psql "$url" -q -c "insert into public.app_migrations (version, checksum) values ('$version', '$(checksum_of "$file")') on conflict (version) do update set checksum = excluded.checksum, applied_at = now()" >/dev/null
          echo "ok"
        else
          echo "FAILED"
          grep -m3 ERROR "/tmp/migrate-$slug.log" | sed 's/^/      /'
          overall_failed=1
          break
        fi
      done
      ;;
    adopt)
      for version in "${pending[@]:-}"; do
        [[ -z "$version" ]] && continue
        file="$MIGRATIONS_DIR/$version.sql"
        psql "$url" -q -c "insert into public.app_migrations (version, checksum) values ('$version', '$(checksum_of "$file")') on conflict (version) do update set checksum = excluded.checksum" >/dev/null
        echo "  adopted (not executed): $version"
      done
      ;;
  esac

  final="$(psql "$url" -tAc "select count(*) from public.app_migrations" 2>/dev/null || echo '?')"
  APPLIED_REPORT+=("$slug:$final")
  echo ""
done

# --- Fleet drift ------------------------------------------------------------
echo "── fleet ─────────────────────────────────────────────"
for entry in "${APPLIED_REPORT[@]}"; do
  echo "  ${entry%%:*}: ${entry##*:} applied"
done

counts="$(printf '%s\n' "${APPLIED_REPORT[@]}" | cut -d: -f2 | sort -u | tr '\n' ' ')"
distinct="$(printf '%s\n' "${APPLIED_REPORT[@]}" | cut -d: -f2 | sort -u | wc -l | tr -d ' ')"
if [[ "$distinct" -gt 1 ]]; then
  echo ""
  echo "  ⚠ DRIFT: tenants are on different migration counts ($counts)."
  echo "    Every tenant must run a byte-identical schema. Run --apply."
  overall_failed=1
fi

echo ""
if [[ "$overall_failed" -ne 0 ]]; then
  echo "FAILED — see above."
  exit 1
fi
echo "All tenants consistent."
