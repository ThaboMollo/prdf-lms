# Cost & Infrastructure Guide — Forking prdf-lms for a New Brand/Market

**Scope**: this document is for anyone recreating this app (same functionality, different design/branding, different — currently undecided — target market) as a separate product. It covers hosting architecture options and their monthly cost, not UI/brand design labor.

**Assumptions confirmed with the product owner (2026-07)**: combined admin + client daily active users will stay under ~10. This is a small/niche tool, not a growth-stage product. At that volume, **cost is nearly identical across every architecture option below** — the deciding factors are scalability, API performance, security, and adaptability, in that order of stated priority. Currency is USD throughout; figures are engineering estimates from published list pricing as of July 2026, not vendor quotes.

---

## 1. Executive summary

The current app is heavier than "Supabase + Vercel." It's a monorepo with two frontend SPAs, **two separate backend implementations of the same API** (one in .NET, one in NestJS), and two extra hosting vendors (Azure Container Apps, Railway) to run them. None of that weight is necessary at the confirmed traffic level, and most of it isn't necessary for the fork's functionality either — both frontends can already talk to Supabase directly.

**Recommendation: consolidate to one backend, and run it as serverless functions instead of an always-on container** (Option B below). This keeps a real API layer — which matters for the stated priorities of API performance, security, and adaptability — while getting the scale-to-zero cost profile and hands-off scaling that "scalability" implies. Baseline cost either way is roughly **$45–50/month** (Vercel Pro + Supabase Pro), because at <10 users/day the usage-based charges on any option round to single digits.

---

## 2. Current architecture as-built

| Component | Tech | Current host | Notes |
|---|---|---|---|
| `client-ui/` | React 19 + Vite (SPA) | Vercel/Netlify (per `docs/runbook.md`) | Static build, no SSR |
| `admin-ui/` | React 19 + Vite (SPA) | Vercel/Netlify | Static build, no SSR |
| `backend/` | ASP.NET Core 9, Clean Architecture | Azure Container Apps | Documented as the primary API in `docs/architecture.md`; kept per README "for fallback and future migration phases" |
| `backend-node/` | NestJS 10 | Railway (Dockerfile + `railway.toml`) | A parallel, functionally-equivalent reimplementation of the same API. Not mentioned in `docs/architecture.md` or the README — undocumented technical debt independent of the fork decision |
| Supabase | Postgres, Auth, Storage | Supabase Cloud | ~21 tables, ~51 RLS policies, one Storage bucket (`loan-documents`), email/password auth only, no Edge Functions, no Realtime, one `pg_cron` job (stale-draft purge) |

Both frontends default to talking **directly to Supabase** (`VITE_DATA_PROVIDER=supabase`), bypassing the custom backend entirely. The only things found that genuinely require a backend process today are:
- an **hourly reminder-sweep cron** (Quartz in .NET / `@nestjs/schedule` in Node) that scans for arrears/stale applications/due tasks and writes in-app notifications, and
- a few **service-role-privileged operations** (e.g. presigned upload URL generation) that must not run in the browser.

No other third-party services are live. `SENDGRID_API_KEY` and `TWILIO_*` exist as unused placeholders in `.env.example` — there is no real email or SMS delivery today, no credit bureau API, no CSD (Central Supplier Database) API integration (it's a manually-uploaded document type, not a live check), no OCR/e-signature, no AI/LLM usage, no payment gateway, and no error tracking (no Sentry). The only live third-party add-on is Vercel Analytics on `client-ui`.

**Security flag, unrelated to which option you pick**: `client-ui/.env` and `admin-ui/.env` have a Supabase **service_role key committed to the repo**. A fork must not carry this forward — use the new hosting platform's secret manager, never a frontend `.env` file, for that key.

---

## 3. Architecture options for the fork

### Option A — Lean Supabase + Vercel

Retire both custom backends. Move the hourly cron to Supabase `pg_cron` + a Postgres function (or a Supabase Edge Function if it needs outbound HTTP, e.g. once real email is added). Move service-role-only operations into a small Supabase Edge Function, keeping the key server-side. Everything else already runs on RLS.

- **Vendors**: 2 (Vercel, Supabase)
- **Scalability**: Excellent — nothing to capacity-plan; Supabase compute and Vercel both scale automatically, and idle cost is near-zero.
- **API performance**: Frontend talks to Supabase in one hop instead of frontend→API→Supabase — actually *faster* than today's architecture for reads. Edge Functions add Deno cold-start latency (~50–150ms) only for the handful of privileged operations.
- **Security**: RLS becomes the *sole* authorization boundary — no backend-layer check to catch a bad policy. Postgres RLS is mature, but this removes defense-in-depth. The 51 existing policies would need an audit pass before being trusted as the only gate.
- **Adaptability**: Lowest of the three. This is a lending product; a new market will likely eventually want a credit-bureau call, a payment gateway, or e-signature — all of which mean writing Postgres functions or Deno Edge Functions instead of familiar application code. Fine for CRUD, more friction for complex integrations.

### Option B — Serverless hybrid (recommended)

Consolidate to **one** backend — NestJS is the practical pick, since ASP.NET Core doesn't run natively as a Vercel Function — and re-platform it from an always-on container onto Vercel serverless Functions (pay-per-invocation, scale to zero). Retire the .NET backend and the container hosts entirely.

- **Vendors**: 2 (Vercel, Supabase)
- **Scalability**: Excellent — same auto-scaling and scale-to-zero profile as Option A, because it's still serverless; no container capacity to plan.
- **API performance**: Keeps a real backend layer, so caching, batching, rate-limiting, and business-logic optimizations are possible in application code, not just SQL. Cost is one added network hop and a Node cold start (~100–300ms) versus Option A's direct path — at <10 requests/day, functions will almost always be cold, but that's a one-time-per-session delay, not a bottleneck at this volume.
- **Security**: Retains defense-in-depth — server-side validation and authorization in code, RLS as a second layer, service-role key usage centralized in one place instead of scattered across Edge Functions.
- **Adaptability**: Highest. The team keeps writing normal Node/NestJS application code for future integrations (credit bureau, payments, SMS/email, e-signature) instead of adopting Postgres-function or Deno-Edge-Function idioms for the first time.

**This is the recommended target.** "API performance" and "adaptability" — both explicitly named priorities — argue for keeping a real backend; "scalability" argues against an always-on container. Option B is the only option that satisfies both without compromise.

### Option C — Status quo replica

Fork as-is: 2 static sites + 1 backend container (pick Railway over Azure Container Apps for simplicity — fewer moving parts to configure) + Supabase.

- **Vendors**: 3 (Vercel, Supabase, Railway)
- **Scalability**: Weakest of the three — an always-on (or manually-scaled) container is either paying for idle capacity at <10 users/day, or needs explicit sleep/wake configuration to avoid it.
- **API performance**: Best *steady-state* latency (no cold starts if the container stays warm) — but irrelevant at this traffic level, since nothing is ever under sustained load.
- **Security**: Same defense-in-depth story as B — dedicated backend, familiar patterns.
- **Adaptability**: Same code-level adaptability as B, but carries forward the current two-backend redundancy unless one is retired anyway, and adds the most vendor/ops surface of the three options.

Recommend this **only** if time-to-launch matters more than everything else — it requires the least re-platforming work (mostly rebrand + repoint env vars). Migrating from C to B later doesn't touch the database schema, so choosing C now isn't a dead end, just deferred cleanup.

### Comparison at a glance

| Priority | A — Lean Supabase+Vercel | B — Serverless hybrid | C — Status quo replica |
|---|---|---|---|
| Scalability | Excellent | Excellent | Weak (manual container scaling) |
| API performance | Fast reads, Edge cold starts on writes | Good, one hop + Node cold start | Best steady-state, irrelevant at this scale |
| Security | RLS-only (less defense-in-depth) | RLS + backend (defense-in-depth) | RLS + backend (defense-in-depth) |
| Adaptability | Lowest (Postgres/Deno idioms) | Highest (familiar app code) | High, but most vendor/ops overhead |
| Vendors | 2 | 2 | 3 |
| Re-platforming effort | Highest | Medium | None |

---

## 4. Additional scenarios considered: Railway-heavy variants

Three more concrete scenarios were compared against Options A/B/C above, prompted by a preference for evaluating Railway as a consolidation point. The key finding: **only two of the three keep the app's current auth/storage model intact.** This app is deeply coupled to Supabase's *Auth* service (JWT issuance, the `auth.users` table, the `handle_new_user` trigger, the `get_my_roles()` RPC, `auth.uid()` used throughout every RLS policy) and its *Storage* service (signed upload URLs). Moving the database off Supabase doesn't just relocate a Postgres instance — it means replacing Auth and Storage with something else entirely.

| | **1. Frontends + .NET API on Railway, DB on Supabase** | **2. Frontends + backend-node on Vercel, DB on Supabase** (= Option B above) | **3. Everything on Railway, incl. Postgres** |
|---|---|---|---|
| **Vendors** | 2 (Railway, Supabase) | 2 (Vercel, Supabase) | 1 (Railway) — *if* Auth/Storage are also self-hosted there |
| **Auth/Storage** | Unchanged — still Supabase Auth + Storage | Unchanged — still Supabase Auth + Storage | **Must be rebuilt.** Railway's managed Postgres is vanilla Postgres — no Auth service, no Storage service. Either self-host Supabase's own open-source stack (Postgres + GoTrue + Storage-API + Kong, as separate Railway services) or roll a custom auth system. Touches nearly every file that calls `supabase.auth.*` or the Storage SDK. |
| **Re-architecture effort** | Low — repoint connection strings/env vars, deploy as Docker containers. Quartz's in-process hourly cron keeps working unchanged (Railway containers are long-running, unlike serverless functions). | Medium — NestJS needs a serverless adapter to run as Vercel Functions, and `@nestjs/schedule`'s in-process cron has to be replaced with a Vercel Cron Job hitting an HTTP endpoint. | High — new Auth server, new Storage service, all RLS policies need re-validating against a non-Supabase Postgres, every `auth.uid()`-dependent policy and every frontend auth call now points at infrastructure you own and maintain. |
| **Frontend hosting quality** | Downgrade — Railway has no native CDN-edge static hosting; static builds run in a container serving `dist/` via nginx/Caddy. Loses Vercel Analytics (already live on `client-ui`), preview-per-PR, image optimization. | Best fit — Vercel's core strength is exactly this (both UIs are already static Vite builds). | Same downgrade as Scenario 1. |
| **Est. monthly cost @ <10 users/day** | ~$54–69 (Railway plan $5–20 + ~$22 compute for 2 frontends + API + Supabase Pro $25) | ~$46–48 (Vercel Pro $20 + Supabase Pro $25) | ~$80–90+ (Railway plan + compute for frontends + API + Postgres + self-hosted Auth server + Storage-API + gateway) — **more expensive**, not less, because it replaces one bundled Supabase subscription with 5–6 separately-run services |
| **Security** | Unchanged — Supabase's managed Auth/backups/patching | Unchanged — Supabase's managed Auth/backups/patching | You now own patching, backup/PITR, and availability of the auth server yourself — a real downgrade unless there's dedicated ops/security capacity |
| **Scalability** | Fine, but capacity-planned (always-on container) | Best — true serverless auto-scale for the API layer too | Fine for DB/compute, but adds operational surface that doesn't scale itself |
| **Adaptability** | High — .NET codebase untouched | High — familiar Node code, but needs the serverless port first | High for app code, but low for infra — maintaining an auth/storage stack instead of building product features |

**Read on Scenario 3**: avoid it at this scale. The "single vendor" appeal is real, but running your own Auth/Storage stack costs *more* in dollars and substantially more in engineering/security burden than paying Supabase's $25/mo, which already bundles Auth, Storage, backups, and RLS with a managed team behind it. It only starts making economic sense at a scale well beyond anything in play here.

**Read on Scenario 1 vs. Option B (Scenario 2)**: Option B remains the stronger default — it puts the frontends on the platform actually built for static SPAs. Scenario 1's genuine advantage is *less rework*: .NET and Quartz keep running exactly as they do today, no NestJS-to-serverless port required. If minimizing engineering time to launch outweighs frontend hosting quality, Scenario 1 is a reasonable, honest tradeoff — just go in knowing it trades CDN-grade static hosting for a smaller migration lift.

---

## 5. Cost tables

At the confirmed <10-user scale, all three options land within a few dollars of each other — **the decision should be made from Section 3, not this table.** Tiers below exist so the numbers stay honest if the product ever grows past pilot scale.

**Baseline platform fees (all options)**
- Vercel Pro: **$20/month** (per seat; required for commercial use — Hobby's free tier forbids it) — includes 1TB bandwidth, 1M function invocations, 4 hours active CPU.
- Supabase Pro: **$25/month** — includes 8GB DB, 100GB storage, 250GB egress, 100k MAU, $10/mo compute credit (covers a Micro instance). Free tier ($0) is usable for pure dev but pauses projects after 1 week of inactivity — not worth the risk for a live product even at this scale.
- Domain registration: ~$1–2/month amortized.

### Pilot (<10 daily users — the confirmed current case)

| Option | Extra line items | Est. monthly total |
|---|---|---|
| A — Lean Supabase+Vercel | none (Edge Function invocations negligible) | **~$46–48** |
| B — Serverless hybrid | Vercel Function invocations negligible at this volume | **~$46–48** |
| C — Status quo replica | Railway Hobby plan $5 + ~$10–15 compute for a small always-on container (0.5 vCPU/512MB ≈ $10/mo CPU + $5/mo memory at Railway's $0.00000772/vCPU-sec, $0.00000386/GB-sec rates) — *or* $0 extra if hosted on Azure Container Apps instead, since its consumption free grant (180k vCPU-sec, 360k GiB-sec, 2M requests/month) likely covers an idle-mostly container entirely | **~$61–68 (Railway) / ~$46–48 (Azure, within free grant)** |

### Growth (~500 daily users, hypothetical)

| Option | Extra line items | Est. monthly total |
|---|---|---|
| A | Supabase compute bump (~+$15) if DB load grows past Micro; Resend Free/Pro if real email is added ($0–20); Sentry Team ($26) | **~$85–110** |
| B | Same additions as A, function invocation overage still negligible (well under 1M/mo) | **~$85–110** |
| C | Same additions as A + larger Railway container (~$25–35 compute) | **~$115–145** |

### Scale (~5,000 daily users, hypothetical — well beyond current plans)

| Option | Extra line items | Est. monthly total |
|---|---|---|
| A | Supabase storage/egress overage (~$10), larger compute tier (~$50–100), Resend Pro (~$20–35), Sentry (~$26–80) | **~$150–250** |
| B | Same as A + modest Vercel function overage (~$10–20) | **~$160–270** |
| C | Same as A + larger Railway container + egress (~$60–80) | **~$300–350** |

---

## 6. One-time / setup costs

- Domain registration for the new brand: typically $10–20/year depending on TLD.
- A **new, isolated Supabase project** for the fork — do not share the original app's project. Separate database, separate Storage bucket, separate Auth users, separate keys. This is a hard requirement, not just a cost-hygiene one: the original app's data must stay isolated from a differently-branded product.
- A **new Vercel project/team** (or at minimum new projects within the existing team) for the fork's frontends.
- Engineering effort (not priced here, since it's labor not infra spend):
  - **Option B**: port the NestJS handlers to Vercel Functions, retire the .NET backend, retire the Railway/Azure deployment config. Moderate — most business logic is portable as-is; the work is mostly in deployment plumbing (routing, cold-start-aware connection pooling to Postgres) rather than rewriting logic.
  - **Option C**: near-zero — rebrand, repoint environment variables to the new Supabase/Vercel/Railway projects, done.
- UI/brand design labor is explicitly **out of scope** for this document — it's a separate cost category (design + frontend theming), not infrastructure.

---

## 7. Fork-specific setup checklist

Do these regardless of which option is chosen:

- [ ] New Supabase project, own region choice (affects future compliance — see §8).
- [ ] Never commit the `service_role` key to any frontend `.env`; inject it only via the hosting platform's secret manager (Vercel/Supabase both support this natively).
- [ ] Set Storage bucket `file_size_limit` and `allowed_mime_types` on the `loan-documents`-equivalent bucket — currently unset in the source app, which is both a cost risk (unbounded upload size) and an abuse vector.
- [ ] RLS efficiency pass: the current 51 policies call a `SECURITY DEFINER` helper (`is_in_role`) directly rather than wrapped as `(select is_in_role(...))`. The `select`-wrapped form lets Postgres's planner cache the result per statement instead of re-evaluating per row — worth doing before scaling past pilot, more so under Option A where RLS carries the full authorization load.
- [ ] Decide whether to wire up real email/SMS (Resend/Twilio, or an alternative) — the placeholders exist in `.env.example` but nothing is connected today. A lending product's applicants will likely expect status-change notifications beyond an in-app inbox.
- [ ] Add error tracking (e.g. Sentry) — none exists in either backend today; Serilog logs to console only, which disappears once the container/function restarts.
- [ ] Retire the redundant backend (NestJS or .NET, whichever isn't chosen) rather than carrying both forward into the fork.

---

## 8. Compliance note

Target market/jurisdiction is not yet decided, so this document doesn't assume a specific privacy regime (the current app's `docs/` implicitly assumes South Africa/POPIA given its BEE and CSD-related fields). Whichever market is chosen will determine:
- Data residency requirements (Supabase lets you choose the project's hosting region — this is the main lever).
- Which privacy law applies (POPIA, GDPR, CCPA, or another regime) and what consent/retention language is needed.

Revisit this section once the target market is confirmed — it isn't a cost line item, but it can constrain *which* Supabase region and hosting jurisdiction are viable, which in turn can affect option choice.

---

## 9. Caveats

- All dollar figures are engineering estimates derived from each vendor's public list pricing (Supabase, Vercel, Railway, Azure Container Apps, Resend, Sentry — pulled July 2026), not negotiated quotes. Actual spend depends on real usage patterns and may differ.
- Enterprise-tier pricing (any vendor) is negotiated and not reflected here — irrelevant at the confirmed scale, but worth knowing if the product unexpectedly takes off.
- Railway and Azure Container Apps both bill by actual compute-seconds consumed, but their free-tier/minimum-spend shapes differ (Railway has a $5/mo plan floor; Azure Container Apps has a monthly free grant with no plan floor) — this is why Option C's estimate has two numbers depending on which container host is used.
