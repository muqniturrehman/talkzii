# Meta App Review & Tech Provider guide for Talkzi

This is the working checklist for taking Talkzi from a local scaffold to a Meta-approved
**Tech Provider** that onboards businesses with **Embedded Signup** and messages through the
official **WhatsApp Business Cloud API**.

> Meta updates its review process, products and docs often. The steps below match the platform
> as of the scaffold date (October 2026). Before you submit, check every item against the current
> pages linked in [References](#references). If a link has moved, search for the page title.

**Contents**

1. [Submission checklist](#1-submission-checklist)
2. [Prerequisites](#2-prerequisites)
3. [Configure the Meta app](#3-configure-the-meta-app)
4. [Permissions and use-case text](#4-permissions-and-use-case-text)
5. [Screencasts](#5-screencasts)
6. [Reviewer instructions and test access](#6-reviewer-instructions-and-test-access)
7. [Data handling answers](#7-data-handling-answers)
8. [Policy compliance map](#8-policy-compliance-map)
9. [Going live](#9-going-live)
10. [Tech Provider program](#10-tech-provider-program)
11. [Common rejection reasons](#11-common-rejection-reasons)
12. [References](#references)

---

## 1. Submission checklist

Tick these off in order. Every item maps to a section below.

**Business and legal**

- [ ] Meta Business Portfolio created and **Business Verification** approved (§2)
- [ ] Production domain (e.g. `app.talkzi.app`) on HTTPS, verified in Business Settings → Brand Safety → Domains (§2)
- [ ] Public pages live and linked in the footer: `/privacy`, `/terms`, `/data-deletion`, `/security` (§2)
- [ ] Legal entity, address and contact emails replaced in `apps/web/src/config/site.ts` (`TODO(before launch)`)
- [ ] Support email monitored (e.g. `support@talkzi.app`)

**App configuration**

- [ ] App type **Business**, with the **WhatsApp**, **Facebook Login for Business** and **Webhooks** products added (§3.1)
- [ ] App icon (1024×1024), category, privacy policy URL, terms URL, data deletion callback and deauthorize callback set (§3.2)
- [ ] Embedded Signup configuration created and its `config_id` stored in `META_CONFIG_ID` / `NEXT_PUBLIC_META_CONFIG_ID` (§3.3)
- [ ] JavaScript SDK allowed domains and OAuth redirect URIs include the production domain (§3.3)
- [ ] WhatsApp webhook verified at `https://<domain>/api/webhooks/meta`, with every field in §3.4 subscribed
- [ ] Production env vars set in Vercel (§3.5) and `pnpm db:migrate` run against production Supabase

**App Review**

- [ ] Advanced access requested for `whatsapp_business_management` and `whatsapp_business_messaging`, using the use-case text in §4
- [ ] One screencast per permission, recorded as scripted in §5
- [ ] Reviewer instructions and a dedicated reviewer login on production (§6)
- [ ] Data Use Checkup / data protection questions answered (§7)
- [ ] Submitted; status watched in App Dashboard → App Review → Requests

**After approval**

- [ ] App switched to **Live** mode (§9)
- [ ] Tech Provider steps completed, including access verification if Meta asks for it (§10)
- [ ] First real client onboarded end to end and monitored for 48 hours (§9)

---

## 2. Prerequisites

| Item | Why Meta needs it | Where in Talkzi |
| --- | --- | --- |
| Meta Business Portfolio (business.facebook.com) | Owns the app, the system users and your own test WABA | — |
| Business Verification | Required for advanced access and Tech Provider status | Business Settings → Security Center |
| Domain on HTTPS | Embedded Signup only runs on allowed HTTPS domains; reviewers use the live site | Vercel project domain |
| Privacy Policy | Must cover data received from Meta, AI processing, sub-processors and retention | `/privacy` → `apps/web/src/app/(marketing)/privacy/page.tsx` |
| Terms of Service | Must require customers to follow WhatsApp's Business Messaging and Commerce policies | `/terms` |
| Data deletion | Callback URL **or** an instructions page (Talkzi has both) | `/api/meta/data-deletion`, `/data-deletion` |
| Test WhatsApp number | Lets you record screencasts without touching a client's number | WhatsApp → API Setup gives a free test number |

**Business Verification documents.** Have these ready: the legal business name exactly as registered,
the registered address, a business phone number, the website on your verified domain, and a
registration document (for example the SECP certificate of incorporation and NTN for Pakistani
companies). The name on the documents must match the name in Business Settings.

---

## 3. Configure the Meta app

### 3.1 Create the app

1. Go to developers.facebook.com → **My Apps → Create App**.
2. Choose the **Business** app type (or the "Other → Business" path, depending on the current wizard) and attach your verified Business Portfolio.
3. Add these products: **WhatsApp**, **Facebook Login for Business** and **Webhooks**.
4. Copy **App ID** → `META_APP_ID` and `NEXT_PUBLIC_META_APP_ID`. Copy **App Secret** → `META_APP_SECRET`.
   The secret signs webhooks and signed requests, so never expose it to the browser.

### 3.2 Basic and advanced settings

App Dashboard → **App settings → Basic**:

| Field | Value |
| --- | --- |
| Display name | Talkzi |
| App domains | `talkzi.app` (your production domain) |
| Contact email | `support@talkzi.app` |
| Privacy Policy URL | `https://<domain>/privacy` |
| Terms of Service URL | `https://<domain>/terms` |
| User data deletion | **Data deletion callback URL**: `https://<domain>/api/meta/data-deletion` |
| App icon | 1024×1024 PNG of the Talkzi mark, without text |
| Category | Business and pages (or the closest current option) |

App Dashboard → **App settings → Advanced**: set **Deauthorize callback URL** to `https://<domain>/api/meta/deauthorize`.

Both callbacks verify Meta's `signed_request` with the App Secret
(`parseSignedRequest` in `apps/web/src/lib/compliance/deletion.ts`). They revoke the WhatsApp
tokens of the Facebook user captured at Embedded Signup. The data deletion callback returns
`{ url, confirmation_code }`. The person can check that code at `/data-deletion`.

### 3.3 Embedded Signup (Facebook Login for Business)

1. **Facebook Login for Business → Configurations → Create configuration.**
2. Pick the **WhatsApp Embedded Signup** login variation and token type **System-user access token**.
3. Assets: **WhatsApp accounts**. Permissions: `whatsapp_business_management` and `whatsapp_business_messaging`.
   Add `business_management` only if you build features that read the client's business portfolio; Talkzi doesn't need it.
4. Save and copy the **Configuration ID** → `META_CONFIG_ID` and `NEXT_PUBLIC_META_CONFIG_ID`.
5. **Facebook Login for Business → Settings**:
   - **Allowed domains for the JavaScript SDK:** `https://<domain>`
   - **Valid OAuth redirect URIs:** `https://<domain>/app/sessions/connect`
   - Enable **Login with the JavaScript SDK**.

How Talkzi uses it (`/app/sessions/connect`):

1. `FB.login` runs with `config_id`, `response_type: 'code'`, `override_default_response_type: true` and
   `extras: { feature: 'whatsapp_embedded_signup', sessionInfoVersion: '2' }`. SDK `v21.0` is loaded from `connect.facebook.net`.
2. The `WA_EMBEDDED_SIGNUP` session-info message supplies the selected WABA ID and phone number ID.
3. `POST /api/meta/exchange-code` exchanges the code for a business token (`/oauth/access_token`) and stores it
   encrypted with AES-256-GCM. It then fetches the WABA and its numbers, registers the number with the
   customer's 6-digit PIN (`POST /{phone_number_id}/register`) and subscribes the app to the WABA
   (`POST /{waba_id}/subscribed_apps`).

### 3.4 Webhooks

WhatsApp → **Configuration** → Webhook:

- **Callback URL:** `https://<domain>/api/webhooks/meta`
- **Verify token:** the value of `META_WEBHOOK_VERIFY_TOKEN` (generate a long random string)
- Subscribe these `whatsapp_business_account` fields. Talkzi handles each one:

| Field | Talkzi behaviour |
| --- | --- |
| `messages` | Inbound messages and delivery/read statuses. Upserts contact and conversation, extends the 24h window, records the message once per `wamid`, handles opt-out keywords, runs chatbots, emits outgoing webhooks |
| `message_template_status_update` | Template approved / rejected / paused / disabled |
| `message_template_quality_update` | Template quality score |
| `template_category_update` | Category changes made by Meta |
| `phone_number_quality_update` | Quality rating and messaging-limit tier; RED quality pauses broadcasts |
| `phone_number_name_update` | Display name review result |
| `account_review_update` | WABA review decision |
| `account_update` | Restrictions, bans, ownership changes |
| `business_capability_update` | Messaging limit / capability changes |

Every POST is checked against `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the App Secret)
before parsing. The raw payload goes into `webhook_events`, and failures are retried by
`/api/cron/webhook-retry`.

### 3.5 Environment variables

| Variable | Source |
| --- | --- |
| `META_APP_ID`, `NEXT_PUBLIC_META_APP_ID` | App settings → Basic |
| `META_APP_SECRET` | App settings → Basic (server only) |
| `META_CONFIG_ID`, `NEXT_PUBLIC_META_CONFIG_ID` | Facebook Login for Business → Configurations |
| `META_WEBHOOK_VERIFY_TOKEN` | Any long random string, also entered in the webhook config |
| `META_SYSTEM_USER_TOKEN` | Optional. Your own system user token, for the developer "manual connect" fallback and testing |
| `META_GRAPH_API_VERSION` | `v21.0` (bump deliberately after testing) |
| `ENCRYPTION_KEY` | 64 hex characters. Encrypts every WABA token. Never rotate it without re-encrypting |

---

## 4. Permissions and use-case text

Request **advanced access** for the two WhatsApp permissions. Paste these descriptions (edit to taste)
into App Review → Permissions and Features.

### `whatsapp_business_management`

> Talkzi is a WhatsApp customer engagement platform for small and medium businesses. Businesses
> connect their own WhatsApp Business Account to Talkzi with Embedded Signup. We use
> whatsapp_business_management to: (1) read the WhatsApp Business Account and phone numbers the
> business selected during Embedded Signup, so we can show them in the business's dashboard; (2)
> register the phone number on the Cloud API with the PIN the business chooses; (3) subscribe our
> app to the account's webhooks so the business receives customer messages in its shared inbox; (4)
> create, list and delete the business's message templates and track their review status and
> quality; and (5) read phone number quality ratings and messaging limits, so that we
> automatically pause a business's broadcasts if quality drops. We only access accounts the
> business explicitly shared with us, and the business can disconnect at any time.

### `whatsapp_business_messaging`

> Talkzi uses whatsapp_business_messaging to send and receive WhatsApp messages on behalf of the
> businesses that connected their account. Agents reply to customers from a shared inbox. Free-form
> replies are only allowed inside the 24-hour customer service window, which Talkzi enforces;
> outside it, only templates approved by Meta can be sent. Businesses can also send approved
> template broadcasts to contacts who opted in, run chatbots that answer customers, and upload and
> download media (images, documents, voice notes) in conversations. Talkzi handles opt-out keywords
> automatically and never messages contacts who opted out of marketing.

### Not requested

- `business_management`: not needed for Talkzi's current features.
- `public_profile` / `email`: Talkzi accounts use their own email/password, magic link or Google sign-in. Facebook Login is only used for Embedded Signup.

---

## 5. Screencasts

Meta reviewers must **see** each permission used, end to end, in the production app. Record at
1080p, in English (UI and captions), 2–5 minutes each, with no cuts in the critical steps. Use a
clean browser profile and a real phone that shows WhatsApp, either on screen or in picture-in-picture.

### Video A — `whatsapp_business_management` (Embedded Signup and templates)

1. Show the Talkzi home page URL, then sign in as the reviewer account.
2. Open **WhatsApp numbers → Connect WhatsApp**. Caption: *"The business connects its own WhatsApp Business Account."*
3. Enter a 6-digit PIN and click **Connect WhatsApp** on the Embedded Signup card. In the Meta popup, pick the business portfolio, create or select the WABA, enter the display name and verify the number by SMS code.
4. Back in Talkzi, show the connected number with display name, quality rating and messaging tier. Caption: *"Talkzi reads the shared account and registers the number with the business's PIN."*
5. Open **Templates → New template**. Create a utility template (`order_update`, English, body with `{{1}}`), show the live preview and click **Submit to Meta**.
6. Show the template in the list with status **Pending**, then **Approved** after a refresh (use a template approved before recording if review takes long, and say so in a caption).
7. Optional: open the number in WhatsApp Manager to show the same account Talkzi lists.

### Video B — `whatsapp_business_messaging` (inbox and broadcasts)

1. From the phone, send "Hi, is my order ready?" to the connected number. Show it arriving in **Talkzi → Inbox** in real time.
2. Reply from Talkzi with text and an image. Show both arriving on the phone.
3. Caption: *"Free-form replies are only possible within 24 hours of the customer's last message."* Open an older conversation and show the **24-hour window closed** banner and template picker. Send the approved template and show it on the phone.
4. Open **Broadcasts → New broadcast**, choose the approved template, map `{{1}}` to the contact name, pick a label audience with the test phone, review and **Launch**. Show the progress page and the message on the phone.
5. On the phone, reply **STOP**. Show the automatic confirmation and the contact now marked **Opted out** in Talkzi.

### Tips

- Keep the URL bar visible, and record the production domain, not localhost.
- Blur personal phone numbers if you use a personal phone, but keep the WhatsApp UI recognisable.
- Explain what is happening with captions, not voice-over only.
- Upload each video to the matching permission.

---

## 6. Reviewer instructions and test access

Create a **dedicated reviewer user** on production (never reuse the seed password `Talkzi@demo123`).
Sign up as that user, create a workspace called "Meta Review", then put it on Pro with a manual
subscription. The billing trigger syncs the plan. Run this in the Supabase SQL editor:

```sql
insert into public.billing_subscriptions (workspace_id, provider, plan, status, current_period_end)
select id, 'manual', 'pro', 'active', now() + interval '90 days' from public.workspaces where name = 'Meta Review'
on conflict (workspace_id) do update set provider = 'manual', plan = 'pro', status = 'active', current_period_end = excluded.current_period_end;
```

Connect your own test WABA to it in advance, so reviewers can test without needing a phone number.

Paste and fill in this template:

```text
Login: https://<domain>/login
Email: reviewer@talkzi.app
Password: <unique strong password>

The account owns the workspace "Meta Review" with a test WhatsApp number already connected.

1. Embedded Signup (whatsapp_business_management):
   Open "WhatsApp numbers" → "Connect WhatsApp", then click "Connect WhatsApp" on the
   Embedded Signup card and complete the Meta popup with a WhatsApp Business Account you control. The connected number then appears
   in the list with its quality rating. "Templates" shows template management (create → Submit
   to Meta → status updates arrive by webhook).

2. Messaging (whatsapp_business_messaging):
   Send a WhatsApp message to +<test number>. It appears in "Inbox" within seconds. Reply
   from the composer. Outside the 24-hour window the composer only allows approved templates.
   "Broadcasts" sends an approved template to opted-in contacts.

Data deletion: https://<domain>/data-deletion (callback: /api/meta/data-deletion)
Privacy policy: https://<domain>/privacy
Contact: support@talkzi.app
```

---

## 7. Data handling answers

Use these facts for the Data Use Checkup and any data protection questionnaire. Each one is backed by code.

| Question | Answer | Evidence |
| --- | --- | --- |
| What Platform Data do you process? | WABA and phone number metadata, templates, message content and media, delivery statuses, pricing categories, and the business integration token | `packages/db/supabase/migrations/*` |
| Why? | Only to provide the messaging features the business uses | `/privacy` §"Data obtained through Meta Platforms" |
| Do you sell or share it for ads? | No | `/privacy` |
| Sub-processors | Supabase (database, auth, storage), Vercel (hosting), Upstash (queues), OpenAI/Anthropic (optional AI, workspace can disable), Stripe/JazzCash/Easypaisa (payments), Resend (email) | `/privacy` §Sharing |
| Where is data stored? | Supabase project region you choose (pick the one closest to your customers) and Vercel functions | Vercel / Supabase settings |
| Encryption | TLS in transit, encryption at rest (Supabase), WABA tokens AES-256-GCM with `ENCRYPTION_KEY`, API keys stored as SHA-256 hashes | `apps/web/src/lib/crypto.ts`, `lib/api-keys.ts` |
| Access control | Row-level security on every tenant table; roles owner/admin/agent/viewer; tokens readable only by the service role; column privileges stop admins editing plan or domain fields | `20261024000900_rls_policies.sql`, `20261024001600_agency.sql` |
| Retention | Messages and media deleted after the workspace's retention period (default 365 days) by a daily cron; webhook logs after 30 days | `lib/compliance/retention.ts` |
| Deletion | Owner deletes the workspace (all data and files); per-contact erasure; Meta callback revokes tokens; confirmation codes | `lib/compliance/deletion.ts` |
| Incident response | Audit log of sensitive actions; security contact `security@talkzi.app`; notify affected businesses without undue delay | `audit_log`, `/security` |
| Data subject requests | Per-contact export (JSON) and erasure in the contact profile; workspace export in Settings → Compliance | `/api/contacts/[id]/export`, `/api/compliance/export` |

---

## 8. Policy compliance map

How Talkzi supports WhatsApp Business Messaging Policy, Commerce Policy and Cloud API rules:

| Requirement | Implementation |
| --- | --- |
| Message only people who opted in | CSV import requires an explicit consent checkbox (`contactImportSchema.consent`); contacts carry `opted_out`; Terms forbid unsolicited messaging |
| Honour opt-outs | Opt-out keywords (STOP, UNSUBSCRIBE, BAND KARO, بند کرو…, editable) opt contacts out and confirm. Marketing templates and broadcasts skip opted-out contacts, and error 131050 (user stopped marketing) opts the contact out automatically |
| 24-hour customer service window | Server-side `SESSION_WINDOW_CLOSED` for free-form messages after 24h; composer switches to template picker (`lib/messaging/session-window.ts`) |
| Only approved templates outside the window | `TEMPLATE_NOT_APPROVED` guard; approved templates are locked from editing |
| Respect messaging limits | Broadcasts stay within the number's tier (`tierLimit`) over a rolling 24h and queue the rest |
| Protect quality rating | Broadcasts pause on RED quality and on errors 368, 131031, 131042, 131048, 130497; quality history in Analytics |
| Webhook security | `X-Hub-Signature-256` verification, idempotent by `wamid`, raw payloads in `webhook_events` |
| Token security | Business tokens encrypted at rest, never sent to the browser |
| Data deletion | Callback, instructions page, status lookup, workspace and contact erasure |
| Commerce Policy | Terms forbid prohibited goods and services; accounts can be suspended |
| Transparency | Privacy policy covers Meta data, AI and retention. Customers see the business's own WhatsApp display name; Talkzi never messages as itself |
| Pricing transparency | Talkzi plans exclude Meta fees; Analytics estimates Meta cost by category (`packages/shared/src/pricing.ts`, editable rate card) |

---

## 9. Going live

1. **App mode → Live** (top bar of the App Dashboard) once App Review approves advanced access.
2. Production env vars in Vercel (§3.5). Also set `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `ENCRYPTION_KEY`, Supabase keys and Upstash Redis.
3. Run the database migrations on production (`pnpm db:migrate` with the production `DATABASE_URL`).
4. Confirm the crons in `vercel.json` are scheduled. Broadcasts every minute and webhook retries are the critical ones.
5. Onboard your own business first, end to end: Embedded Signup → PIN registration → inbound message → reply → template approval → small broadcast.
6. Ask each client to add a **payment method** for their WABA (WhatsApp Manager → Payment settings, or during Embedded Signup). Without one, only free service conversations work.
7. Watch `webhook_events` (status `failed`), Analytics → quality history, and the logs for the first 48 hours.

---

## 10. Tech Provider program

### What it is

Meta's partner model for businesses that build on the WhatsApp Business Platform:

| Role | Builds software | Onboards clients with Embedded Signup | Shares a credit line with clients | Notes |
| --- | --- | --- | --- | --- |
| **Tech Provider** | Yes | Yes | **No**. Each client pays Meta directly with their own payment method | Talkzi's target role |
| **Tech Partner** | Yes | Yes | No | Recognition tier for established Tech Providers who meet Meta's criteria |
| **Solution Partner** (formerly BSP) | Yes | Yes | Yes. Can extend credit lines and bill clients for Meta fees | Requires a separate Meta partnership agreement |

Talkzi charges its own subscription (Stripe / JazzCash / Easypaisa). Meta bills each client for
WhatsApp messages. The pricing page and Billing settings say so, and the analytics cost estimate
uses the editable rate card in `packages/shared/src/pricing.ts`. Meta prices delivered template
messages per message by category. Service replies inside the customer service window are free, and
utility templates sent inside an open window are free. Verify the current rate card for Pakistan
before you publish prices.

### Steps to become a Tech Provider

1. **Business Verification** of your Business Portfolio (§2).
2. **App Review**: advanced access to `whatsapp_business_management` and `whatsapp_business_messaging` (§4–6).
3. **Access verification**: if Meta asks you to confirm you are a Tech Provider acting for other businesses, complete it in the App Dashboard. It typically asks for your business details and how you onboard clients.
4. **Embedded Signup live** on your production domain (§3.3), tested end to end with a business you don't own.
5. **Onboarding limits**: newly approved Tech Providers can onboard a limited number of new client businesses per rolling week. Higher limits follow good quality and verification. Plan your launch around this and check the current limits in the Tech Provider docs.
6. Optionally apply for **Tech Partner** recognition later (listing in Meta's partner directory) once you meet the published criteria.

### Client onboarding runbook (with Talkzi)

1. The client signs up at `https://<domain>/signup` and creates a workspace (or an agency creates a client workspace under **Settings → Clients**).
2. **WhatsApp numbers → Connect WhatsApp**: Embedded Signup creates or selects the client's own Business Portfolio and WABA, names the number and verifies it.
3. Talkzi registers the number with the client's PIN, subscribes webhooks and shows the quality rating and messaging tier.
4. The client adds a payment method for the WABA in WhatsApp Manager.
5. The client submits templates in **Templates**. Approval status arrives by webhook.
6. The client imports contacts **with consent**, sets opt-out replies in **Settings → Compliance** and starts messaging.

### Offboarding

- The client disconnects in **WhatsApp numbers** (status `DISCONNECTED`, token removed), or removes Talkzi in Facebook → Business integrations, which fires `/api/meta/deauthorize`.
- The owner can delete the workspace in **Settings → Compliance**. All data and files are removed and a confirmation code is issued.

### Ongoing obligations

- Keep App Review permissions in use. Unused permissions can be removed by Meta.
- Complete Meta's **annual Data Use Checkup** for the app.
- Keep the Graph API version current (`META_GRAPH_API_VERSION`). Meta deprecates versions about two years after release.
- Respond to client quality issues quickly. Talkzi's automatic broadcast pausing helps protect their numbers.

---

## 11. Common rejection reasons

| Rejection | Fix |
| --- | --- |
| "Screencast doesn't show the permission being used" | Show the full flow in the production app, including the message arriving on a phone (§5) |
| "Unable to log in / test credentials invalid" | Test the reviewer login from a private window the day you submit; don't require 2FA or email confirmation for that account |
| "Privacy policy doesn't mention Meta data" or "URL unreachable" | `/privacy` must load publicly without login and cover Platform Data use, deletion and sub-processors |
| "Business not verified" | Finish Business Verification before requesting advanced access |
| "Use case unclear / looks like a personal tool" | Explain the multi-business model (Tech Provider, Embedded Signup) in the use-case text (§4) |
| Embedded Signup popup blocked or "URL blocked" | Add the production domain to the JS SDK allowed domains and OAuth redirect URIs (§3.3) |
| Webhook verification fails | `META_WEBHOOK_VERIFY_TOKEN` must match exactly, and the route must be reachable at `/api/webhooks/meta` without auth |

---

## References

- WhatsApp Business Platform — Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
- Embedded Signup: https://developers.facebook.com/docs/whatsapp/embedded-signup
- Get started as a Tech Provider: https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers
- Webhooks for WhatsApp: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
- Pricing: https://developers.facebook.com/docs/whatsapp/pricing
- App Review: https://developers.facebook.com/docs/app-review
- Business Verification: https://developers.facebook.com/docs/development/release/business-verification
- Data deletion callback: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
- WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy
- WhatsApp Commerce Policy: https://www.whatsapp.com/legal/commerce-policy
