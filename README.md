# PRDF LMS Monorepo

Client UI + Admin UI (React + TypeScript), NestJS API, and Supabase-backed data/auth/storage. See `platform-architecture-design.md` for the target-state platform spec and `docs/architecture.md` for current implementation status.

## Prerequisites
- Node.js 22+
- npm 10+
- Supabase project(s): dev and prod

## 30-Minute Quickstart
1. Copy `.env.example` to `.env` and fill Supabase values.
2. Apply the baseline migration and seed, in order, in the Supabase SQL editor:
   1. `infra/supabase/migrations/20260723180000_baseline.sql`
   2. `infra/supabase/seed/seed.sql`
3. Run backend:
   - `cd backend-node && npm ci && npm run start:dev`
4. Run client UI:
   - `cd client-ui && npm ci && npm run dev`
5. Run admin UI:
   - `cd admin-ui && npm ci && npm run dev`
6. Verify:
   - `GET /health`
   - login page works
   - `/me` returns authenticated profile

## Structure
- `client-ui/`: React + TypeScript + Vite (client-facing)
- `admin-ui/`: React + TypeScript + Vite (internal/admin)
- `backend-node/`: NestJS API
- `infra/supabase/`: Supabase-CLI-managed migrations, seed, storage setup
- `docs/`: handover-oriented docs

## Product Documentation
- `docs/brd-summary.md`: executive summary of the business requirements
- `docs/architecture.md`: current implementation architecture
- `platform-architecture-design.md`: target-state platform spec and phased implementation roadmap

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
- `SUPABASE_DB_CONNECTION_STRING`

## Run Backend
```bash
cd backend-node
npm install
npm run start:dev
```
API defaults to `http://localhost:3000`.

## Run Client UI
```bash
cd client-ui
npm install
npm run dev
```
Client UI defaults to `http://localhost:5173`.

## Run Admin UI
```bash
cd admin-ui
npm install
npm run dev
```
Admin UI defaults to `http://localhost:5174`.

## Apply Supabase SQL
Run in this order in Supabase SQL editor (dev first):
1. `infra/supabase/migrations/20260723180000_baseline.sql`
2. `infra/supabase/seed/seed.sql`

## API Endpoints (Core)
- `GET /health`
- `GET /me` (requires Supabase JWT)
- `GET /api/notifications`
- `GET /api/reports/*`

## Data Provider Switch
- UI data provider is controlled by `VITE_DATA_PROVIDER`.
- `supabase`: use Supabase adapters as primary data layer (current default).
- `api`: use the NestJS API adapters. Becomes the only path once Phase 3 of `platform-architecture-design.md` lands.

## Deployment
- CI/CD workflow: `.github/workflows/ci-cd.yml`
- Uptime monitoring workflow: `.github/workflows/uptime-check.yml`
- Detailed ops docs:
  - `docs/runbook.md`
  - `docs/support.md`

## Cost/Operations Notes
- Keep Supabase storage lifecycle policies enabled (project settings).
- Use low/minimum API instances or scale-to-zero where supported.
- Use secret manager for production API keys and DB credentials.
