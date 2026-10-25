# Talkzi — local setup on Windows

This guide takes a fresh **Windows 10/11** machine to a running Talkzi with a real database,
working sign-in and a demo workspace. Later sections add WhatsApp (Meta), AI, payments, and a
production deploy on Vercel.

- **No Docker, WSL or Linux tools needed.** Every script works in PowerShell.
- **Time:** ~30 minutes for the core setup, plus ~30 minutes for the Meta developer app.
- Commands are for **PowerShell** (Windows Terminal recommended). macOS/Linux users can run the same commands; just replace `Copy-Item` with `cp`.

---

## Contents

1. [Install the prerequisites](#1-install-the-prerequisites)
2. [Clone and install](#2-clone-and-install)
3. [Create your environment files](#3-create-your-environment-files)
4. [Create the Supabase project](#4-create-the-supabase-project)
5. [Create Upstash Redis (optional for local)](#5-create-upstash-redis-optional-for-local)
6. [Run Talkzi](#6-run-talkzi)
7. [Create the Meta developer app (WhatsApp)](#7-create-the-meta-developer-app-whatsapp)
8. [Optional services: AI, Stripe, local wallets, email](#8-optional-services)
9. [Tests and checks](#9-tests-and-checks)
10. [Deploy to Vercel](#10-deploy-to-vercel)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Install the prerequisites

| Tool | Version | Install |
| --- | --- | --- |
| **Node.js** | 20.9 or newer (22 LTS recommended; see `.nvmrc`) | https://nodejs.org → LTS installer, or `winget install OpenJS.NodeJS.LTS` |
| **pnpm** | 10.x (pinned in `package.json`) | `corepack enable` then `corepack prepare pnpm@10.28.0 --activate` |
| **Git** | any recent | `winget install Git.Git` |
| VS Code (optional) | — | `winget install Microsoft.VisualStudioCode` |

Open a **new** PowerShell window after installing, then check:

```powershell
node -v      # v22.x (or v20.9+)
pnpm -v      # 10.28.0
git --version
```

> If PowerShell refuses to run `pnpm` ("running scripts is disabled"), run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then open a new window.

Recommended Git settings on Windows (long paths in `node_modules`, LF line endings come from `.gitattributes`):

```powershell
git config --global core.longpaths true
```

---

## 2. Clone and install

```powershell
git clone https://github.com/muqniturrehman/talkzii.git
cd talkzii
pnpm install
```

`pnpm install` installs every workspace package (`apps/web`, `packages/*`). It takes 1–3 minutes on the first run.

---

## 3. Create your environment files

The Next.js app reads `apps/web/.env.local`. The database scripts read `.env.local` at the repo
root (and fall back to the app's file). The simplest setup is the same file in both places:

```powershell
Copy-Item .env.example apps/web/.env.local
Copy-Item .env.example .env.local
```

Generate the four secrets and paste them into **both** files:

```powershell
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('INTERNAL_API_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(24).toString('hex'))"
node -e "console.log('META_WEBHOOK_VERIFY_TOKEN=' + require('crypto').randomBytes(16).toString('hex'))"
```

> `ENCRYPTION_KEY` encrypts WhatsApp access tokens and integration secrets. Keep it safe. If you
> lose or change it, connected WhatsApp accounts must be reconnected.

Every other key is optional for a first run. Talkzi degrades gracefully: AI falls back to offline
heuristics, emails are printed to the console, payments are hidden, and WhatsApp uses a mock client
for the seeded demo number.

---

## 4. Create the Supabase project

Supabase provides Postgres, authentication, file storage and realtime.

1. Sign up at https://supabase.com and click **New project**.
   - **Region:** pick the one closest to your customers (for Pakistan, *Mumbai (ap-south-1)* or *Singapore*).
   - Save the **database password**.
2. **Project Settings → API**: copy into both `.env.local` files:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `anon` public key
   - `SUPABASE_SERVICE_ROLE_KEY` = `service_role` key (**server only**, never commit or expose it)
3. **Connect** (top bar) → **Session pooler** → copy the URI into `DATABASE_URL` and put your
   database password in it. Use the *pooler* string: the direct connection needs IPv6, which many
   home networks don't have.
4. Apply all migrations (schema, row-level security, functions, storage buckets, realtime):

   ```powershell
   pnpm db:migrate
   ```

   Run it again after pulling new code. Already-applied migrations are skipped.

5. **Enable the access-token hook.** This puts the active workspace and role into each user's JWT; RLS needs it.
   **Authentication → Hooks → Add hook → "Customize Access Token (JWT) Claims"** → type *Postgres*,
   schema `public`, function `custom_access_token_hook` → **Create**.
6. **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** add `http://localhost:3000/auth/callback` (and your production URL later, e.g. `https://app.talkzi.app/auth/callback`).
7. *(Optional)* **Google sign-in:** create an OAuth client (Web) in Google Cloud Console with the
   authorized redirect URI `https://<your-project-ref>.supabase.co/auth/v1/callback`. Then paste the
   client ID and secret in **Authentication → Providers → Google**.
8. Seed the demo data: 2 users, a workspace, a mock WhatsApp number, 50 contacts, conversations,
   templates, a draft broadcast and a sample chatbot:

   ```powershell
   pnpm db:seed
   ```

   It prints the logins: `owner@demo.talkzi.app` and `agent@demo.talkzi.app`. The password is
   `Talkzi@demo123`, or whatever you set in `SEED_PASSWORD`.

> Regenerating database types after you change SQL doesn't need Docker:
> `pnpm db:types:local` runs every migration in an in-process Postgres (PGlite) and rewrites
> `packages/db/types.ts`.

---

## 5. Create Upstash Redis (optional for local)

Upstash backs rate limiting (and, optionally, the BullMQ broadcast queue). Without it, local
development uses an in-memory rate limiter and a Postgres-based queue.

1. Sign up at https://upstash.com → **Create database** (Redis, region near your app).
2. From **REST API**, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. *(Optional, for BullMQ)* From **Connect → ioredis**, copy the `rediss://…` URL into `REDIS_URL`.

---

## 6. Run Talkzi

```powershell
pnpm dev
```

Open http://localhost:3000 and sign in with the demo owner. Try:

- **Inbox**: open a seeded conversation and reply. The mock WhatsApp client "sends" instantly.
- **Contacts → Import**: upload a CSV.
- **Templates**, **Broadcasts**, **Chatbots**, **Analytics**.

**Background jobs locally.** Vercel runs the cron routes in production. Locally you can trigger
them by hand (`curl.exe`, not PowerShell's `curl` alias):

```powershell
curl.exe -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/broadcasts
curl.exe -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/webhook-retry
```

Outside production, cron routes also run without a secret if none is configured.

---

## 7. Create the Meta developer app (WhatsApp)

You need this to send real WhatsApp messages. The full production checklist (App Review, Tech
Provider) is in [METASUBMISSION.md](METASUBMISSION.md). These are the development steps.

### 7.1 App and test number

1. Go to https://developers.facebook.com → **My Apps → Create app** → type **Business** → attach your Meta Business Portfolio.
2. Add the **WhatsApp** product. **WhatsApp → API Setup** gives you a free **test phone number**. Add your own phone as a recipient there.
3. **App settings → Basic**: copy **App ID** → `META_APP_ID` and `NEXT_PUBLIC_META_APP_ID`. Copy **App secret** → `META_APP_SECRET`.

### 7.2 Connect a number to Talkzi (developer shortcut)

Embedded Signup requires HTTPS and a configuration ID (see 7.4). For local work, connect with a system user token instead:

1. **business.facebook.com → Business settings → Users → System users → Add** (Admin).
2. **Assign assets**: your app (full control) and your WhatsApp account (full control).
3. **Generate new token** for your app with `whatsapp_business_management` and `whatsapp_business_messaging`.
4. In Talkzi (as the workspace owner) open **WhatsApp numbers → Connect WhatsApp → Advanced: connect with a System User token**.
   Paste your WABA ID (from WhatsApp → API Setup) and the token. The form needs `META_APP_ID` and `META_APP_SECRET`.
   Optionally put the token in `META_SYSTEM_USER_TOKEN` too.

### 7.3 Receive webhooks on your PC

Meta must reach your machine over HTTPS. Use a tunnel:

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a URL like `https://random-words.trycloudflare.com`. Then:

1. **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://<tunnel>/api/webhooks/meta`
   - Verify token: your `META_WEBHOOK_VERIFY_TOKEN`
2. **Manage** webhook fields and subscribe to: `messages`, `message_template_status_update`,
   `message_template_quality_update`, `template_category_update`, `phone_number_quality_update`,
   `phone_number_name_update`, `account_review_update`, `account_update` and `business_capability_update`.
3. Send a WhatsApp message to your test number. It appears in **Inbox** in real time.

> The quick tunnel URL changes every time you restart `cloudflared`. Update the callback URL when it does, or create a named Cloudflare tunnel.

### 7.4 Embedded Signup (how your customers connect)

1. Add **Facebook Login for Business** → **Configurations → Create**. Choose the *WhatsApp Embedded Signup* variation and a **system-user** token, with permissions `whatsapp_business_management` and `whatsapp_business_messaging`.
2. Copy the configuration ID → `META_CONFIG_ID` and `NEXT_PUBLIC_META_CONFIG_ID`.
3. **Facebook Login for Business → Settings**: add your HTTPS origin (tunnel or production) to **Allowed domains for the JavaScript SDK**. Set `NEXT_PUBLIC_APP_URL` to the same origin.
4. In Talkzi, **WhatsApp numbers → Connect WhatsApp** → enter a 6-digit PIN → **Connect WhatsApp**.

---

## 8. Optional services

| Service | Keys | Notes |
| --- | --- | --- |
| **OpenAI** (default AI) | `OPENAI_API_KEY`, optional `OPENAI_MODEL` (default `gpt-5-mini`) and `OPENAI_EMBEDDING_MODEL` | Suggested replies, summaries, sentiment, intent, knowledge-base answers |
| **Anthropic Claude** | `ANTHROPIC_API_KEY`, `AI_PROVIDER=anthropic`, optional `ANTHROPIC_MODEL` | Swappable provider; embeddings still use OpenAI or the offline embedder |
| **Stripe** (cards) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Create 8 recurring prices with lookup keys `talkzi_{pro,agency}_{month,year}_{usd,pkr}` (yearly = 12 × the discounted monthly price). Enable the Customer Portal |
| **JazzCash / Easypaisa** | see `.env.example` | Prepaid PKR plans; sandbox URLs are the defaults. Easypaisa payments wait for manual verification (README → stubs) |
| **Resend** (email) | `RESEND_API_KEY`, `EMAIL_FROM` | Invitations and notifications; printed to the console when unset |
| **Vercel domains API** | `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` | Auto-attach agency custom domains after DNS verification |

**Stripe webhooks locally** with the Stripe CLI (`winget install Stripe.StripeCli`):

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/billing/stripe/webhook
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart `pnpm dev`.

---

## 9. Tests and checks

```powershell
pnpm test            # Vitest in every package (the db tests run real migrations in PGlite)
pnpm -r typecheck    # strict TypeScript
pnpm lint            # ESLint (incl. React Compiler rules)
pnpm -r build        # production build
```

All four should pass before you push. CI-style one-liner:

```powershell
pnpm install; pnpm -r build; pnpm -r typecheck; pnpm test
```

---

## 10. Deploy to Vercel

1. Push the repo to GitHub, then **vercel.com → Add New → Project → Import** it.
2. **Root Directory:** `apps/web`. The framework is detected as Next.js, and pnpm installs from the monorepo root automatically.
3. **Environment Variables:** paste everything from your `.env.local`. Then change:
   - `NEXT_PUBLIC_APP_URL` = your production URL (e.g. `https://app.talkzi.app`)
   - `CRON_SECRET` = a fresh random value (Vercel Cron sends it as a Bearer token)
4. **Deploy.** Then add your domain under **Project → Settings → Domains**.
5. **Crons** come from `apps/web/vercel.json`:

   | Route | Schedule |
   | --- | --- |
   | `/api/cron/broadcasts` | every minute |
   | `/api/cron/webhook-retry` | every 5 minutes |
   | `/api/cron/template-status` | every 15 minutes |
   | `/api/cron/usage-rollup` | hourly |
   | `/api/cron/retention` | daily 21:30 UTC (02:30 PKT) |

   Per-minute crons need a Vercel **Pro** plan (Hobby only allows daily jobs). On Hobby, use an
   external scheduler (e.g. cron-job.org) to call the URLs with
   `Authorization: Bearer <CRON_SECRET>`.
6. **Production settings elsewhere:**
   - Supabase → Authentication → URL Configuration: production Site URL + `/auth/callback` redirect.
   - Meta: webhook callback `https://<domain>/api/webhooks/meta`, JS SDK allowed domain, data deletion and deauthorize callbacks (METASUBMISSION.md §3).
   - Stripe: webhook endpoint `https://<domain>/api/billing/stripe/webhook` with the events listed in README.
7. Run `pnpm db:migrate` against the production `DATABASE_URL` whenever you deploy new migrations.

---

## 11. Troubleshooting

| Problem | Fix |
| --- | --- |
| `pnpm` is not recognized | Run `corepack enable` and open a new terminal, or `npm i -g pnpm` |
| "running scripts is disabled on this system" | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `pnpm db:migrate` → `ENOTFOUND` / `ETIMEDOUT` | Use the **Session pooler** connection string (IPv4), check the password and that the project isn't paused |
| Signed in but redirected to onboarding, or data missing | The access-token hook isn't enabled (step 4.5). Enable it, then sign out and in again |
| "Supabase isn’t configured" on the sign-in page | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing in `apps/web/.env.local`. Restart `pnpm dev` after editing env files |
| Webhook "verification failed" in Meta | Verify token mismatch, or the tunnel URL changed. The route must answer at `/api/webhooks/meta` |
| Embedded Signup popup closes / "URL blocked" | Add the exact HTTPS origin to Facebook Login for Business → Allowed domains, and match `NEXT_PUBLIC_APP_URL` |
| Port 3000 in use | `pnpm --filter @talkzi/web exec next dev -p 3001` and set `NEXT_PUBLIC_APP_URL=http://localhost:3001` |
| `pnpm install` very slow | Exclude the repo folder from Windows Defender real-time scanning |
| Line-ending warnings | `.gitattributes` enforces LF. Run `git add --renormalize .` once if your clone predates it |
