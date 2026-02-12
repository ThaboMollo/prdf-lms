# PRDF LMS Monorepo

React + TypeScript frontend, ASP.NET Core API, and Supabase-backed data/auth/storage.

## Prerequisites
- Node.js 22+
- npm 10+
- .NET SDK 9.0+
- Supabase project(s): dev and prod

## 30-Minute Quickstart
1. Copy `.env.example` to `.env` and fill Supabase values.
2. Apply SQL in Supabase SQL editor:
   1. `infra/supabase/schema.sql`
   2. `infra/supabase/rls.sql`
   3. `infra/supabase/seed.sql`
   4. `infra/supabase/phase4_2_patch.sql`
   5. `infra/supabase/phase5_6_patch.sql`
3. Run backend:
   - `dotnet restore backend/PRDF.Lms.sln --configfile backend/NuGet.Config`
   - `dotnet run --project backend/src/PRDF.Lms.Api/PRDF.Lms.Api.csproj`
4. Run frontend:
   - `cd frontend && npm ci && npm run dev`
5. Verify:
   - `GET /health`
   - login page works
   - `/me` returns authenticated profile

## Structure
- `frontend/`: React + TypeScript + Vite
- `backend/`: Clean Architecture solution
- `infra/supabase/`: schema, RLS, seed, storage setup
- `docs/`: handover-oriented docs

## Environment Variables
Copy `.env.example` to `.env` and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_AUDIENCE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- `VITE_DATA_PROVIDER` (`supabase` or `api`, default: `supabase`)
- `SUPABASE_DB_CONNECTION_STRING` (Npgsql format)
- Optional notification providers:
  - `SENDGRID_API_KEY`
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`

## Run Backend
```bash
cd backend/src/PRDF.Lms.Api
dotnet restore
dotnet run
```
API defaults to `http://localhost:5080` when `ASPNETCORE_URLS` is set.

## Run Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend defaults to `http://localhost:5173`.

## Apply Supabase SQL
Run in this order in Supabase SQL editor (dev first):
1. `infra/supabase/schema.sql`
2. `infra/supabase/rls.sql`
3. `infra/supabase/seed.sql`
4. `infra/supabase/phase4_2_patch.sql`
5. `infra/supabase/phase5_6_patch.sql`

## API Endpoints (Core)
- `GET /health`
- `GET /me` (requires Supabase JWT)
- `GET /api/notifications`
- `GET /api/reports/*`

## Data Provider Switch
- Frontend data provider is controlled by `VITE_DATA_PROVIDER`.
- `supabase`: use Supabase adapters as primary data layer.
- `api`: use .NET API adapters.
- The .NET API remains retained and buildable for fallback and future migration phases.

## Deployment
- CI/CD workflow: `.github/workflows/ci-cd.yml`
- Uptime monitoring workflow: `.github/workflows/uptime-check.yml`
- Deployment helper script: `scripts/deploy.ps1`
- Detailed ops docs:
  - `docs/runbook.md`
  - `docs/support.md`

## Cost/Operations Notes
- Keep Supabase storage lifecycle policies enabled (project settings).
- Use low/minimum API instances or scale-to-zero where supported.
- Use secret manager for production API keys and DB credentials.
