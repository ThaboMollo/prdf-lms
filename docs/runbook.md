# Runbook

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set Supabase keys and DB connection string.
3. Apply SQL in order:
   1. `infra/supabase/schema.sql`
   2. `infra/supabase/rls.sql`
   3. `infra/supabase/seed.sql`
4. Run backend:
   - `dotnet restore backend/PRDF.Lms.sln --configfile backend/NuGet.Config`
   - `dotnet run --project backend/src/PRDF.Lms.Api/PRDF.Lms.Api.csproj`
5. Run frontend:
   - `cd frontend && npm ci && npm run dev`

## Verification Checklist

- `GET /health` returns 200.
- login via Supabase succeeds.
- `GET /me` with JWT returns user profile.
- create + submit + status transition works.
- notification inbox endpoint returns rows.

## Deploy

- Frontend: Vercel/Netlify using `frontend/`.
- API: Azure Container Apps from `backend/src/PRDF.Lms.Api/Dockerfile`.
- Configure secrets in host secret manager (never commit prod keys).

## Rollback

- API: redeploy previous container image tag.
- Frontend: rollback to previous deployment in host dashboard.
- DB: apply backward-safe SQL patch (do not destructive-drop live tables).

## Background Jobs

- Quartz job: `NotificationSweepJob` runs hourly.
- Confirms reminder generation for:
  - arrears
  - pending due tasks
  - stale applications
