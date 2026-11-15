# MTAA Fix — Free-Tier Production Deployment Guide

**Target:** KSh 0 / month hosting, using genuinely free allowances.
**Audience:** Windows 11 + VS Code, beginner-friendly, step by step.
**Stack inspected:** this repository (`destrylord-code/Mtaa-Fix`), not assumptions.
**Status:** PLAN FOR APPROVAL. No code has been changed yet. Section 5 lists the exact
edits I will make after you approve. Nothing is deployed until you authorize it.

> Read Section 4 (Free-tier limitations) and Section 11 (Email) before you start.
> There is **one** feature that cannot fully work at zero cost without a domain
> name: public self-registration / password-reset emails. Everything else runs free.

---

## 1. What this project actually is (investigation results)

I inspected every manifest, the backend entry point, the database layer, the auth
flow, the upload/email code, and all three frontend configs. Findings:

| Area | Actual technology in this repo |
|---|---|
| Citizen frontend | Next.js **16.4.3** (App Router), React 19.3, Tailwind 4, Turbopack |
| Admin frontend | Next.js **16.4.3**, React 19.3, Leaflet maps |
| Government frontend | Next.js **16.4.3**, React 19.3, Leaflet maps, TypeScript |
| Backend | **Express 5.2** (ESM), Node.js, long-running HTTP server |
| ORM / DB | **Prisma 7.10** with `@prisma/adapter-pg` + `pg` → **PostgreSQL** |
| Auth | Custom **JWT** (access + refresh), bcryptjs, httpOnly cookies, cross-app one-time-code handoff. **No OAuth, no NextAuth.** |
| File uploads | `multer` (memory) → **Cloudinary** for images; local disk fallback for PDF/MP4. Magic-byte validation, 15 MB/file, 5 files. |
| Email | **Resend** SDK (verification + password reset). |
| Payments | **None.** No Stripe/PayPal/M-Pesa anywhere in the code. |
| WebSockets | **None.** No socket.io / ws. |
| Background jobs | One optional in-process scheduler (`setInterval`) for SLA auto-escalation, enabled by `ENABLE_ESCALATION_SCHEDULER=true`. No external queue. |
| PDF generation | `pdfkit` (server-side, pure JS). |
| Runtime | Node **>= 20.9** (CI uses Node 22). All backend deps are pure JS (`pg`, `bcryptjs`, `pdfkit`) — no native build step. |
| Frontend runtime needs | Each app has a Node-runtime `proxy.js` route guard, an `/api/session` route handler (government/admin), and `next.config.mjs` **rewrites** that proxy `/api/*`, `/uploads/*`, `/health` to the backend. These require a real Next.js server runtime — **not** a static export. |

### How the pieces talk (current design)

```
Browser ──same-origin /api/*──> Next.js frontend ──rewrite──> Express backend ──> PostgreSQL
                                   (proxy.js guard)              (Prisma)
                   
Each app has its OWN login page (citizen /sign-in, admin & government /login),
and all of them POST directly to /api/auth/login through the same-origin proxy.
So an admin signs in directly at the admin app; a citizen at the citizen app.

There is ALSO a cross-app handoff used during citizen account creation: the
citizen app asks the backend for a one-time code and redirects the browser to
   https://<admin-or-government-app>/auth/callback#code=...
which that app exchanges for its own tokens. This lets a privileged account move
between the 3 separate frontend origins without sharing cookies across domains.
```

**Services required to run in production:**
1. A Next.js-capable host for **3 frontend apps** (SSR + middleware + rewrites).
2. An always-on-capable **Node host** for the Express API.
3. A managed **PostgreSQL** database.
4. **Object storage** for report evidence (images, and ideally PDF/video).
5. An **email** sender for verification / password reset.

No payment gateway, no WebSocket server, no separate worker/queue service is needed.

---

## 2. Recommended architecture (simplest reliable $0 design)

```
                         ┌──────────────────────────────────────────┐
                         │            CLOUDFLARE (free)               │
   Browser ──HTTPS──────>│  3 Workers (OpenNext Next.js adapter)      │
                         │   • mtaa-citizen.<account>.workers.dev     │
                         │   • mtaa-admin.<account>.workers.dev       │
                         │   • mtaa-government.<account>.workers.dev  │
                         └───────────────┬────────────────────────────┘
                                         │ same-origin /api/* rewrite
                                         │ (server-side fetch)
                                         ▼
                         ┌──────────────────────────────────────────┐
                         │   RENDER free Web Service (Express API)    │
                         │   mtaa-fix-api.onrender.com                │
                         │   sleeps after 15 min idle (~1 min wake)   │
                         └───────────────┬────────────────────────────┘
                                         │ Prisma (pg, TLS)
                                         ▼
                         ┌──────────────────────────────────────────┐
                         │   NEON free PostgreSQL (1 GB / project)    │
                         │   scale-to-zero after 5 min, no expiry     │
                         └──────────────────────────────────────────┘

   Evidence images ──> CLOUDINARY free (25 credits/mo)
   Verification / reset email ──> RESEND free (100/day, 3,000/mo)
```

**Why this shape:**
- The browser only ever talks to its own frontend origin (same-origin proxy), so
  cookies and CORS stay simple and secure. This is already how the repo works.
- The backend `CLIENT_URL` must list the three frontend origins, because the
  browser's `Origin` header is forwarded through the proxy on write requests.
- Each frontend keeps its own httpOnly session cookie on its own origin; the
  cross-app handoff uses a URL-fragment one-time code, not cross-domain cookies.

---

## 3. Selected providers and why (compared against the real requirements)

You chose: **Cloudflare** frontends, **Render free** backend (accept cold start),
**no domain** (free subdomains), **guide first**.

### Frontend → Cloudflare Workers (via `@opennextjs/cloudflare`)

| Option | Organizational/commercial use on free? | Next.js 16 fit | Verdict |
|---|---|---|---|
| **Cloudflare Workers** | **Allowed** | Needs Next **>= 16.4.5** + OpenNext adapter; never sleeps; static assets free & unlimited | **Selected** |
| Vercel Hobby | **Prohibited** — "non-commercial personal use only" | Best-in-class Next support | Rejected: a county-government system is organizational use; would need Pro ($20/mo) |
| Netlify Free | Allowed | Next runtime works, but **300 credits/mo hard cap** (~15 GB bandwidth) pauses all sites mid-month | Rejected for a public app |

Cloudflare is the only major free frontend host that both **permits organizational
use** and **does not sleep**. The trade-off is a small adapter setup and a Next.js
patch bump (16.4.3 → 16.4.6), which also picks up security fixes.

### Backend → Render free Web Service

Express is a long-running Node server with Prisma holding persistent DB
connections. It is **not** a Cloudflare Worker fit (Workers free has a 10 ms CPU
cap and no long-lived TCP pool model for this app). Render runs a real Node
container. Free tier sleeps after 15 min idle — you accepted this.

> Do **not** use Render's free Postgres: it **expires 30 days after creation**.
> The database goes to Neon instead.

### Database → Neon free PostgreSQL

| Option | Free storage | Inactivity behavior | Expiry | Verdict |
|---|---|---|---|---|
| **Neon** | **1 GB/project** (20 GB account) | Scale-to-zero after 5 min, wakes on next query | **No expiry** | **Selected** |
| Supabase Free | 500 MB | **Pauses after 7 days** idle, manual restore | No expiry | Rejected: smaller + weekly pause |
| Render Postgres | 1 GB | — | **Deleted after 30 days** | Rejected |

Neon gives the most storage, never deletes your data, and wakes automatically.

### File storage → Cloudinary free

Already integrated in `backend/utils/cloudinary.js` and `uploadController.js`.
Free plan = **25 monthly credits**, where 1 credit = 1 GB storage **or** 1 GB image
bandwidth **or** 1,000 transformations (mix and match). No credit card. This is
required because Render's free filesystem is **ephemeral** — local uploads vanish
on every restart/spin-down. (See Section 5: I will route PDF/video to Cloudinary too
so no evidence is lost.)

### Email → Resend free

Already integrated in `backend/utils/notifier.js`. Free = **3,000/month, 100/day**,
no card. **Limitation with no domain:** the shared sender `onboarding@resend.dev`
delivers **only to your own Resend account email**; any other recipient returns
403. See Section 11 for exactly what works and the cheap-domain upgrade.

---

## 4. Free-tier limitations (completely honest)

| Service | Free limit | Sleeps? | Card? | Impact on this app |
|---|---|---|---|---|
| Cloudflare Workers | 100,000 requests/day (account-wide); **10 ms CPU per invocation**; 128 MB; static assets free & unlimited | **No** | No | Fine for a county MVP. Heavy server-side rendering could hit the 10 ms CPU cap; the $5/mo Paid plan removes it. Most pages here are client-rendered + static shells, so risk is low. |
| Render Web Service | 750 instance-hours/mo/workspace; 5 GB bandwidth/mo; 512 MB RAM | **Yes — 15 min idle, ~1 min wake** | No | First request after idle is slow. One always-on service fits 750 h. **Filesystem is ephemeral** → uploads must go to Cloudinary. |
| Neon Postgres | 1 GB/project; 100 CU-hours/mo; 5 GB egress | **Yes — 5 min idle (cannot disable)** | No | Wakes on next query (~cold start). 1 GB is ample for county report data. Hard cutoff if exceeded (no overage billing). |
| Cloudinary | 25 credits/mo (≈25 GB storage or bandwidth mix) | No | No | Plenty for evidence photos. Heavy video could exhaust credits. |
| Resend | 3,000/mo, **100/day**; testing sender only without a domain | No | No | **Public registration/reset emails need a verified domain.** 100/day cap can pause bursts. |

**Things that cannot run reliably at $0:**
- **Public self-service email** (registration verification + password reset to
  arbitrary citizens) requires a **verified domain** in Resend. Without one, only
  the account owner's inbox receives mail. Login itself does **not** require email
  verification, and admin-created officer accounts need **no** email — so the
  government/admin side fully works free; only citizen self-onboarding is limited.
- **Always-on API**: free Render sleeps. A pilot is fine; a 24/7 public service
  wants Render Starter (~$7/mo).
- **High traffic / heavy SSR**: Cloudflare 10 ms CPU and 100k req/day are the
  ceilings; $5/mo Workers Paid lifts them.

**Unexpected-charge risks:** all selected free tiers have **hard stops, not
overages** (no card on file = service pauses, never bills). The only way to incur a
charge is to voluntarily add a paid plan. A domain name is a separate ~KSh
1,000–2,000/year purchase, not a hosting fee.

---

## 5. Required code changes (I will make these AFTER your approval)

None of these are applied yet. They are deployment-only and keep local dev working.

1. **Next.js security + adapter bump (3 frontends).**
   `next` and `eslint-config-next` `16.4.3 → 16.4.6` in `citizen-frontend`,
   `admin-dashboard`, `government-frontend` (+ regenerate lockfiles). Required
   because the Cloudflare OpenNext adapter supports `>=16.4.5`; 16.4.6 is the
   current patch and includes security fixes.

2. **Cloudflare OpenNext adapter (3 frontends).** Add to each app:
   - `@opennextjs/cloudflare` + `wrangler` (devDependency)
   - `open-next.config.ts`, `wrangler.jsonc` (with `nodejs_compat` +
     `global_fetch_strictly_public`, `compatibility_date` ≥ 2024-12-30)
   - `output: "standalone"` in `next.config.mjs`
   - `public/_headers` (static-asset caching + security headers)
   - `preview` / `deploy` / `upload` npm scripts
   - **Verify** the OpenNext build with `cacheComponents` enabled; if the adapter
     chokes on it, disable `cacheComponents` for the Cloudflare build only (it is a
     performance flag, not core functionality) and re-verify. I will not claim
     success until `npm run deploy` builds cleanly.

3. **Route ALL evidence to Cloudinary when configured** (`uploadController.js`).
   Currently only images go to Cloudinary; PDF/MP4 go to local disk, which is
   ephemeral on Render. I will upload PDF/video to Cloudinary too (`resource_type`
   auto/video/raw) so no evidence is lost on restart. Local disk remains the
   dev fallback.

4. **Fix swapped cross-app URLs in `.env.example`.** `citizen-frontend/.env.example`
   currently has CITIZEN=3002 / ADMIN=3000 / GOVERNMENT=3001 (wrong); admin/gov
   examples point CITIZEN to 3002. Correct local mapping is CITIZEN=3000,
   ADMIN=3001, GOVERNMENT=3002, and I will add the production placeholders.

5. **Rewrite all four `.env.example` files** with the complete, described variable
   set for this architecture (Section 6). No secrets committed.

6. **Add `render.yaml`** (Infrastructure-as-Code) for the backend so Render reads
   build/start commands and env placeholders from the repo.

7. **Add a safe admin bootstrap script** `backend/scripts/create-admin.mjs` that
   upserts a verified `SUPER_ADMIN` from `ADMIN_EMAIL` / `ADMIN_PASSWORD` /
   `ADMIN_NAME` env vars (bcrypt-hashed). This avoids the email chicken-and-egg for
   the first account. The existing `promote-super-admin.mjs` hardcodes an email; I
   will make it read `ADMIN_EMAIL` instead.

8. **Frontend security headers** via `public/_headers` (HSTS, X-Content-Type-Options,
   Referrer-Policy, Permissions-Policy). Backend already sends `helmet()`.

9. **Correct the stale SSL comment** in `backend/.env.example` (the adapter actually
   defaults `rejectUnauthorized: true`, not false).

**Verification before I hand back:** `npm run lint` + `npx tsc --noEmit` (gov) +
`npm run build` for all 3 frontends, `npx opennextjs-cloudflare build` for each,
backend `npm test`, and `npx prisma validate`. I will report exact results.

---

## 6. Environment variables checklist

### Backend (`backend/.env` locally / Render dashboard in prod)

| Variable | Value in production | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables secure cookies, strict JWT/email/DB guards |
| `PORT` | *(leave unset)* | Render injects `PORT`; code binds `0.0.0.0` |
| `DATABASE_URL` | Neon **direct** connection string | `postgresql://…-direct…/neondb?sslmode=require` |
| `JWT_SECRET` | random ≥32 chars | Generate (Section 7). Must NOT contain `change_in_production`/`super_secret` |
| `JWT_REFRESH_SECRET` | different random ≥32 chars | Must differ from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `CLIENT_URL` | `https://mtaa-citizen.<acct>.workers.dev,https://mtaa-admin.<acct>.workers.dev,https://mtaa-government.<acct>.workers.dev` | Comma-separated frontend origins (CORS) |
| `CITIZEN_APP_URL` | `https://mtaa-citizen.<acct>.workers.dev` | Base for links in emails |
| `TRUST_PROXY` | `1` | Render is behind one proxy; makes rate limits use real client IP |
| `RESEND_API_KEY` | `re_…` | From Resend |
| `EMAIL_FROM` | `Mtaa Fix <onboarding@resend.dev>` (no domain) or `<noreply@yourdomain>` | See Section 11 |
| `CLOUDINARY_CLOUD_NAME` | your cloud name | Required for persistent evidence |
| `CLOUDINARY_API_KEY` | your key | |
| `CLOUDINARY_API_SECRET` | your secret | |
| `ENABLE_ESCALATION_SCHEDULER` | `true` (optional) | In-process SLA auto-escalation |
| `ESCALATION_SCHEDULER_INTERVAL_MS` | `300000` | 5 min default |
| `DB_POOL_SIZE` | `5` | Keep modest for Neon free |
| `PGSSL_REJECT_UNAUTHORIZED` | `true` (default) | Keep true; Neon uses a public CA |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | your first admin | Used only by the bootstrap script, then remove |

### Each frontend (Cloudflare Worker vars + build-time)

| Variable | Citizen | Admin | Government |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | *(empty)* | *(empty)* | *(empty)* |
| `BACKEND_URL` | `https://mtaa-fix-api.onrender.com` | same | same |
| `NEXT_PUBLIC_CITIZEN_APP_URL` | its own URL | citizen URL | citizen URL |
| `NEXT_PUBLIC_ADMIN_APP_URL` | admin URL | — | — |
| `NEXT_PUBLIC_GOVERNMENT_APP_URL` | government URL | — | — |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | optional | — | — |

> `NEXT_PUBLIC_*` values are baked at **build time**. `BACKEND_URL` is the
> server-side rewrite target (the browser never sees it). Leave
> `NEXT_PUBLIC_API_URL` empty to keep the secure same-origin proxy.

---

## 7. Database setup (Neon) — exact steps

### 7.1 Create the free database
1. Go to **https://neon.tech** → sign up (GitHub login works, no card).
2. **Create project**: name `mtaa-fix`, region closest to you (e.g. AWS `eu-central-1`
   or `me-central-1`), Postgres version default.
3. Open **Dashboard → Connection Details**. Choose the **Direct connection**
   (NOT "Pooled"). Copy the string; it looks like:
   `postgresql://neondb_owner:****@ep-xxxx-direct.eu-central-1.aws.neon.tech/neondb?sslmode=require`

### 7.2 Generate strong secrets (Windows PowerShell)
```powershell
# Two DIFFERENT 64-char hex secrets:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 7.3 Configure locally for migrations
```powershell
cd $HOME\source\repos\Mtaa-Fix\backend   # adjust to your clone path
Copy-Item .env.example .env             # then edit .env (never commit it)
# Set DATABASE_URL to the Neon DIRECT string, NODE_ENV=development for local migrate
```

### 7.4 Run migrations (non-destructive)
```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
```
> On a **fresh** Neon database `migrate deploy` applies all 7 migrations cleanly.
> The historical checksum concern only affects the old dev database, not a new one.
> **Never** run `prisma migrate reset` or `db push --force-reset` on production.

### 7.5 Seed reference data (safe, idempotent)
```powershell
npm run db:seed
```
This upserts counties, 9 Kisii sub-counties, 45 wards, 7 departments, 7 categories,
130 subcategories, routing rules, and SLA policies. It creates **no users**.

> **Never** run `npm run db:seed:dev` in production — it creates test accounts and
> is hard-blocked when `NODE_ENV=production`, but do not rely on that. Keep it dev-only.

### 7.6 Create the first administrator (after code change #7 is approved)
```powershell
$env:ADMIN_EMAIL="you@yourdomain.com"
$env:ADMIN_PASSWORD="a-strong-password-10plus"
$env:ADMIN_NAME="Platform Admin"
$env:NODE_ENV="production"
node scripts/create-admin.mjs
Remove-Item Env:ADMIN_PASSWORD
```
This creates a verified `SUPER_ADMIN` directly (no email needed). Then sign in at
the **admin app's own** `/login` page (`https://mtaa-admin.<acct>.workers.dev/login`)
with those credentials — no citizen handoff is required for staff login.

### 7.7 Verify connectivity
```powershell
npx prisma migrate status   # should say "Database schema is up to date"
```
After the backend is deployed: `curl https://mtaa-fix-api.onrender.com/health`
should return `"database":"postgresql"`.

### 7.8 Backups
- Neon free keeps **6 hours** of instant restore + **1 manual snapshot**. Take a
  manual snapshot before any migration (Console → Branches → Snapshot).
- For durable backups, schedule a weekly `pg_dump` (Section 16).

---

## 8. Frontend deployment (Cloudflare Workers) — exact steps

> Do this AFTER I apply the adapter code changes (Section 5). Commands assume the
> changes are present. Repeat for **each** of the three apps.

### 8.1 Create a Cloudflare account
1. **https://dash.cloudflare.com/sign-up** → sign up (no card for Workers Free).
2. Note your **Workers subdomain** (Workers & Pages → onboarding sets
   `<your-account>.workers.dev`).

### 8.2 Install Wrangler and log in (PowerShell)
```powershell
cd $HOME\source\repos\Mtaa-Fix\citizen-frontend
npm ci
npx wrangler login   # opens browser; authorize
```

### 8.3 Set build-time variables
Create `citizen-frontend/.env` (gitignored) for the build:
```
NEXT_PUBLIC_API_URL=
BACKEND_URL=https://mtaa-fix-api.onrender.com
NEXT_PUBLIC_CITIZEN_APP_URL=https://mtaa-citizen.<your-account>.workers.dev
NEXT_PUBLIC_ADMIN_APP_URL=https://mtaa-admin.<your-account>.workers.dev
NEXT_PUBLIC_GOVERNMENT_APP_URL=https://mtaa-government.<your-account>.workers.dev
```
Set the Worker name in `wrangler.jsonc` to `mtaa-citizen` (admin → `mtaa-admin`,
government → `mtaa-government`).

### 8.4 Build and deploy
```powershell
npm run deploy
```
This runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. On success
Wrangler prints `https://mtaa-citizen.<your-account>.workers.dev`.

### 8.5 Repeat for admin and government
```powershell
cd ..\admin-dashboard      ; npm ci ; # set .env + wrangler name ; npm run deploy
cd ..\government-frontend  ; npm ci ; # set .env + wrangler name ; npm run deploy
```

### 8.6 (Optional) GitHub auto-deploys
Cloudflare → Workers & Pages → your Worker → **Settings → Builds → Connect Git**.
- Root directory: `citizen-frontend` (etc.)
- Build command: `npm install && npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`
- Add the same variables under **Settings → Variables & Secrets**.
For a beginner, the manual `npm run deploy` path above is simpler and more reliable.

### 8.7 Verify
Open each `*.workers.dev` URL. The citizen homepage should load; visiting
`/dashboard` logged-out should redirect to `/sign-in` (the `proxy.js` guard works).

---

## 9. Backend deployment (Render free) — exact steps

### 9.1 Create the service
1. **https://dashboard.render.com** → sign up with GitHub (no card).
2. **New → Web Service** → connect `destrylord-code/Mtaa-Fix`.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm ci && npx prisma generate`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Add every backend variable from Section 6 (Environment tab). Set
   `DATABASE_URL` to the Neon **direct** string, `NODE_ENV=production`,
   `TRUST_PROXY=1`, and `CLIENT_URL` to the three deployed Workers URLs.
5. **Create Web Service**. Render builds and gives you
   `https://mtaa-fix-api.onrender.com` (or your chosen name).

> If `render.yaml` (code change #6) is present, you can instead use
> **New → Blueprint** and Render reads these settings from the repo.

### 9.2 Run migrations against Neon from your machine
Render free has no shell/one-off jobs, so run migrations locally (Section 7.4)
pointing `DATABASE_URL` at Neon. The deployed API then connects to the migrated DB.

### 9.3 Verify
```powershell
curl https://mtaa-fix-api.onrender.com/health
```
Expect HTTP 200 with `"database":"postgresql"`. The first call after idle takes
~1 minute (cold start) — this is the accepted free-tier behavior.

### 9.4 Keep-warm (optional, still free)
To reduce cold starts during a demo, ping `/health` every 10 minutes from an free
external cron (e.g. cron-job.org). Note this consumes Render instance-hours; one
service stays within 750 h/mo. Do not exceed one always-warm service.

---

## 10. File storage setup (Cloudinary)

1. **https://cloudinary.com** → sign up free (no card).
2. Dashboard → **Product Environment Settings** → copy **Cloud Name**, **API Key**,
   **API Secret** into the backend env (Render).
3. With these set, `uploadController.saveUpload` stores evidence in Cloudinary
   (`mtaa-fix/reports` folder) and returns a durable HTTPS URL. After code change
   #3, PDF/video are stored there too.
4. **Verify:** submit a report with a photo while logged in; the image URL should be
   `https://res.cloudinary.com/...` and survive a backend restart.

> Without Cloudinary, uploads write to Render's ephemeral disk and are **lost** on
> restart. Cloudinary is therefore required for production evidence integrity.

---

## 11. Email configuration (Resend) — and the no-domain reality

### What works free with NO domain
- `EMAIL_FROM="Mtaa Fix <onboarding@resend.dev>"` + your `RESEND_API_KEY`.
- Resend delivers **only to the email address that owns the Resend account**.
- So: you can test the full registration/reset flow on **your own** inbox.
- **Login does not require email verification**, and **admin-created officers need
  no email** — the entire government/admin workflow runs free.

### What does NOT work without a domain
- A random citizen registering with their own email will **not** receive the
  verification mail (Resend returns 403 for non-owner recipients). The backend
  `register` endpoint requires email to be configured and will fail the send.

### Steps (no domain)
1. **https://resend.com** → sign up. Confirm the signup email (this is the only
   inbox the testing sender reaches).
2. **API Keys → Create** (Sending access). Copy `re_…` to backend `RESEND_API_KEY`.
3. Set `EMAIL_FROM="Mtaa Fix <onboarding@resend.dev>"`.
4. Test by registering with the **same email you signed up to Resend with**.

### Upgrade path for real public email (recommended before launch)
1. Buy a cheap domain (~KSh 1,000–2,000/year; e.g. Namecheap/Cloudflare Registrar).
2. Resend → **Domains → Add Domain** → add the DNS records Resend lists (SPF/DKIM/
   DMARC) at your DNS provider → wait for **Verified**.
3. Set `EMAIL_FROM="Mtaa Fix <noreply@yourdomain.com>"`.
4. Now any citizen can receive verification/reset mail. Still free up to 100/day.

> This domain is the **one unavoidable cost** for full public self-onboarding. It
> is a yearly domain fee, not a monthly hosting charge.

---

## 12. Domain configuration (optional)

You chose free subdomains, so this is optional. If you later buy a domain:

- **Frontends (Cloudflare):** Worker → Settings → Domains & Routes → add
  `citizen.yourdomain.com` etc. Cloudflare issues HTTPS automatically. If the domain
  uses Cloudflare DNS, records are added for you; otherwise add the CNAME shown.
- **Backend (Render):** Service → Settings → Custom Domains → add
  `api.yourdomain.com`; add the CNAME Render shows at your DNS provider.
- **Update env:** set `CLIENT_URL`, `CITIZEN_APP_URL`, and the three
  `NEXT_PUBLIC_*_APP_URL` to the new domains, then redeploy.
- **DNS:** use your registrar's DNS or Cloudflare DNS. CNAME `citizen`/`admin`/
  `government`/`api` to the targets each provider shows. Do not proxy the API
  through Cloudflare's orange cloud unless you intend to (Render needs direct TLS).

---

## 13. HTTPS configuration

- **Cloudflare Workers:** automatic TLS on `*.workers.dev` and any custom domain.
- **Render:** automatic managed TLS on `*.onrender.com` and custom domains.
- **Neon:** TLS enforced via `sslmode=require`; the adapter verifies the certificate
  (`rejectUnauthorized: true`).
- **Cookies:** in production the backend sets `secure: true`, `httpOnly: true`,
  `SameSite=strict`; the frontend session cookies are `secure` + `httpOnly`. These
  only transmit over HTTPS, which all three hosts provide by default. No manual
  certificate setup is needed.

---

## 14. Post-deployment testing checklist

Run against the **deployed** URLs (not localhost). Use a browser + the Network tab.

- [ ] **Homepage:** citizen `*.workers.dev` loads, no console errors.
- [ ] **Registration:** register with the Resend-owner email (no domain) → verify →
      account created. (Other emails need a domain — Section 11.)
- [ ] **Login / Logout:** sign in; refresh persists session; logout clears it.
- [ ] **Password recovery:** request reset for the owner email; link works.
- [ ] **Staff login:** sign in at the admin app's `/login` and the government app's
      `/login` directly → respective dashboards load.
- [ ] **Cross-app handoff:** complete a privileged account via the citizen
      create-account flow → redirected to `/auth/callback#code=…` → dashboard loads.
- [ ] **Role-based permissions:** a CITIZEN cannot open `/government/*` (redirect);
      a WARD_ADMIN cannot see another ward's reports (403).
- [ ] **Navigation:** every sidebar tab renders content (the workspace views).
- [ ] **Database ops:** create a report; it persists after a backend restart.
- [ ] **File upload:** attach a photo; URL is `res.cloudinary.com`; survives restart.
- [ ] **Email:** verification/reset reaches the owner inbox (or domain recipients).
- [ ] **API endpoints:** `GET /health` 200; `GET /api/categories` returns seeded data.
- [ ] **Forms:** report submission, user creation (admin) succeed.
- [ ] **Search/filter:** reports filter by status/ward/category.
- [ ] **Responsive:** check 390 px mobile + desktop; no horizontal overflow.
- [ ] **Cold start:** first request after 15 min idle wakes within ~1 min.
- [ ] **Independence:** stop all local dev servers; the deployed app still works.

---

## 15. Troubleshooting common deployment errors

| Symptom | Cause | Fix |
|---|---|---|
| `Origin not allowed by CORS` (403) on login | `CLIENT_URL` missing a frontend origin | Add all three exact `*.workers.dev` origins (no trailing slash), redeploy backend |
| Backend won't start: "Production requires DATABASE_URL … and CLIENT_URL" | Missing env | Set both in Render |
| "JWT_SECRET must be a strong random secret" | Weak/placeholder secret | Generate fresh ≥32-char secrets (Section 7.2) |
| `/health` shows `development-memory` | DB unreachable / `NODE_ENV` not production | Check Neon string, `sslmode=require`, `NODE_ENV=production` |
| Prisma `P1001 can't reach database` | Neon asleep / wrong endpoint | Use the **direct** endpoint; first query wakes it; retry |
| Images 404 after a while | Cloudinary not configured → ephemeral disk | Set the 3 Cloudinary vars; re-upload |
| Resend 403 "only send testing emails to your own address" | No verified domain | Use owner email for tests, or verify a domain (Section 11) |
| Cloudflare build fails on `cacheComponents` | Adapter edge case | Disable `cacheComponents` for the CF build (code change #2 fallback) |
| Worker error 1027/1102 | Exceeded 100k/day or 10 ms CPU | Reduce SSR or upgrade to Workers Paid ($5) |
| Frontend redirect loop to /login | Session cookie not set / wrong `NEXT_PUBLIC_*_APP_URL` | Check handoff URLs match deployed origins; rebuild |
| 429 on login | Rate limiter (10/15 min) | Wait 15 min; ensure `TRUST_PROXY=1` so IPs aren't shared |
| Slow first request | Render/Neon cold start | Expected on free; keep-warm ping (Section 9.4) |

---

## 16. Backup and recovery

**Database (Neon):**
- Before migrations: Console → create a **manual snapshot** (free includes 1).
- Weekly logical backup (PowerShell, needs PostgreSQL client tools):
```powershell
$env:PGPASSWORD="<neon-password>"
pg_dump "host=ep-xxxx-direct.eu-central-1.aws.neon.tech dbname=neondb user=neondb_owner sslmode=require" `
  --format=custom --file="mtaa-fix-$(Get-Date -Format yyyyMMdd).dump"
Remove-Item Env:PGPASSWORD
```
- Restore to a NEW database (never overwrite live without a snapshot):
```powershell
pg_restore --dbname="postgresql://…/neondb_restore?sslmode=require" --no-owner mtaa-fix-YYYYMMDD.dump
```
- Store dumps off-platform (external drive/private cloud). Never commit them.

**Evidence (Cloudinary):** enable auto-backup (free feature) to your own storage,
or periodically export the asset list via the Cloudinary dashboard.

**Code/config:** everything is in Git. Frontend rollbacks: Cloudflare → Deployments
→ roll back. Backend: Render → roll back to a previous deploy.

**Credential rotation:** the original repo history (`fe6e12f`) once contained a
database password. Treat any such historical secret as compromised: rotate it in
Neon and never reuse it. No `.env` is tracked in the current tree (verified).

---

## 17. Estimated monthly hosting cost

| Item | Provider/plan | Monthly cost |
|---|---|---|
| 3 frontends | Cloudflare Workers Free | **KSh 0** |
| Backend API | Render Free Web Service | **KSh 0** |
| Database | Neon Free (1 GB) | **KSh 0** |
| Evidence storage | Cloudinary Free (25 credits) | **KSh 0** |
| Email (≤100/day) | Resend Free | **KSh 0** |
| **Hosting total** | | **KSh 0 / month** |

**Unavoidable / optional costs (clearly separated):**
- **Domain name** for public registration email: ~**KSh 1,000–2,000 / year**
  (one-time yearly, not hosting). Required only for citizen self-onboarding email.
- Always-on API (no cold start): Render Starter ~**$7/mo** (~KSh 900) — optional.
- Heavy SSR/traffic: Cloudflare Workers Paid **$5/mo** — optional.
- More email volume: Resend Pro **$20/mo** — optional.

**Bottom line:** the application runs at **KSh 0/month hosting** for a pilot/MVP.
The only thing that genuinely needs money for a full public launch is a cheap
domain for email; everything else has a free, honest upgrade path.

---

## Sources (official documentation, verified 2026-11-14)

- Render free tier (sleep, ephemeral disk, 30-day Postgres, 750 h): https://render.com/docs/free
- Neon plans (1 GB/project, 100 CU-hours, 5-min scale-to-zero, no expiry): https://neon.com/docs/introduction/plans
- Vercel fair use (Hobby non-commercial): https://vercel.com/docs/limits/fair-use-guidelines
- Cloudflare Workers pricing (100k/day, 10 ms CPU, static free): https://developers.cloudflare.com/workers/platform/pricing/
- OpenNext Cloudflare adapter (Next >=16.4.5, setup): https://opennext.js.org/cloudflare/get-started
- Cloudinary pricing (25 credits free): https://cloudinary.com/pricing
- Resend domains (verified domain required for non-owner recipients): https://resend.com/docs/dashboard/domains/introduction
- Resend free plan (3,000/mo, 100/day): https://resend.com/pricing

> Provider terms change. Re-check these pages before a public launch.
