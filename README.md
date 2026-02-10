# PRDF LMS Monorepo

React + TypeScript frontend, ASP.NET Core API, and Supabase-backed data/auth/storage.

## Prerequisites
- Node.js 22+
- npm 10+
- .NET SDK 9.0+
- Supabase project(s): dev and prod

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

## API Endpoints (Phase 1)
- `GET /health`
- `GET /me` (requires Supabase JWT)
