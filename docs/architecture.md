# Architecture

## Module Boundaries

```text
frontend (React + TS)
  -> Supabase Auth (session)
  -> .NET API (business rules)

backend/src/PRDF.Lms.Api
  -> PRDF.Lms.Application (use cases/contracts)
  -> PRDF.Lms.Infrastructure (Dapper, Supabase integration)
  -> PRDF.Lms.Domain (enums/constants)

Supabase
  -> Postgres (tables/RLS/policies)
  -> Auth (JWT issuer)
  -> Storage (signed upload URLs)
```

## Clean Architecture Responsibilities

- `PRDF.Lms.Domain`: status enums, role constants, domain-level primitives.
- `PRDF.Lms.Application`: request/response DTOs, service interfaces, validators.
- `PRDF.Lms.Infrastructure`: DB reads/writes, audit logging, notification sweeps, invite integration.
- `PRDF.Lms.Api`: HTTP transport, JWT auth, role-gated controllers, Quartz scheduler registration.

## Runtime Flow

1. User authenticates via Supabase Auth (frontend client).
2. Frontend sends Supabase JWT to API.
3. API validates issuer/audience/signature against Supabase.
4. API enforces role rules (server-side), then executes use-case via infrastructure services.
5. Every critical mutation writes an `audit_log` record.
6. Quartz job runs hourly and creates reminder notifications (arrears/tasks/stale apps).

## Security Model

- Trust boundary: frontend is untrusted for authorization.
- RBAC enforced at API and reinforced by Supabase RLS.
- Signed upload URLs are generated server-side using service role key.
- Immutable fields on `loan_documents` are DB-trigger-protected.

## Observability

- Serilog console logs for API and request pipeline.
- `/health` endpoint for uptime checks.
- Notification sweep job logs through hosted service lifecycle + request logs.
