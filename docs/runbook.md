# Runbook

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set Supabase keys and DB connection string.
3. Apply SQL in order:
   1. `infra/supabase/migrations/20260723180000_baseline.sql`
   2. `infra/supabase/seed/seed.sql`
4. Run backend:
   - `cd backend-node && npm ci && npm run start:dev`
5. Run client UI:
   - `cd client-ui && npm ci && npm run dev`
6. Run admin UI:
   - `cd admin-ui && npm ci && npm run dev`

## Admin Access Management

- Bootstrap admin access with SQL only for initial recovery or first-admin setup.
- After the product feature is deployed, day-to-day Admin grants and revokes should be done in the admin UI under `User Access`.
- Admin access changes should flow through backend APIs and create audit log rows.

## Verification Checklist

- `GET /health` returns 200.
- login via Supabase succeeds.
- `GET /me` with JWT returns user profile.
- create + submit + status transition works.
- notification inbox endpoint returns rows.

## Deploy

- Client UI: Vercel/Netlify using `client-ui/`.
- Admin UI: Vercel/Netlify using `admin-ui/`.
- API: currently `backend-node/` via Railway (`backend-node/railway.toml`, `Dockerfile`) — temporary; Phase 3 of `platform-architecture-design.md` replaces this with Vercel Functions.
- Configure secrets in host secret manager (never commit prod keys).

## Rollback

- API: redeploy previous container image tag.
- Frontend: rollback to previous deployment in host dashboard.
- DB: apply a new forward-only migration under `infra/supabase/migrations/` (do not destructive-drop live tables; do not edit an already-applied migration file).

## Background Jobs

- NestJS scheduled job (`backend-node/src/jobs/notification-sweep.job.ts`) runs hourly.
- Confirms reminder generation for:
  - arrears
  - pending due tasks
  - stale applications
- Whether this job has actually been executing in production is unconfirmed — see `platform-architecture-design.md` §10, open decision 5.

## Environments and Operations

Moved out of the Administrator's Manual (2026-10-01): that document is written
for non-technical PRDF staff, and this material is for whoever owns and
operates the platform. Section 23 of the manual still tells administrators
*which* settings are changeable without a release; the mechanics live here.

### Where things run

| Component | Location |
|---|---|
| Admin Console | Vercel — `prdf-admin.vercel.app` |
| Client Portal | Vercel — `prdf-lms.vercel.app` |
| API | Vercel — `prdf-api.vercel.app` |
| Database, auth, storage | Supabase project `prdf` |

### Health checks

| Check | Where |
|---|---|
| API alive | `/health` |
| Audit trail | `/api/reports/audit` |
| Deployment status and build logs | Vercel project |
| Database, auth and storage | Supabase dashboard |

### Two checks after any deployment

- Open the client portal signed out. If the calculator is blank, the portal
  cannot reach the API — almost always the API base URL setting.
- Sign in to the console and open any case. If it fails to load, the problem is
  the API or the token, not the console.

### When something breaks

1. Capture the API logs around the time of the failure.
2. Capture the request ID and the failing endpoint.
3. Confirm row-level-security behaviour in the Supabase SQL editor.
4. Roll back to the previous deployment if production impact is high.

> **One production setting to verify.** The API's JWT audience setting must be
> `authenticated`. During handover it was found holding a secret value instead,
> which causes *every* authenticated request to fail with 401 while
> unauthenticated pages keep working — a confusing failure that looks like a
> login problem. It has been corrected locally; confirm the production
> environment matches.

### Configuration tables behind manual Section 23

| Setting | Where | Needs a release? |
|---|---|---|
| Loan amount and term band | `loan_products` table | No |
| Which documents are required | `document_requirements` table | No |
| Prime rate and fees | `pricing_config` table | No |
| Risk-grade margins | `risk_grades` table | No |
| Eligibility criteria wording | Tenant config | Yes |
| Consent wording | `packages/domain/consent.ts` | Yes |

A trigger validates applications against product limits on every write, so
narrowing a band makes an already-submitted case outside it fail on its *next*
update, not immediately. A brand-new document type also needs a label added in
code, or the raw type name is displayed. Changing consent wording requires
bumping `CONSENT_VERSION`.
