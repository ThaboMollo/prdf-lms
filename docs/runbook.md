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
