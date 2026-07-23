# Jarvis Comps

**Instant ARV. Real comps. No guesswork.**

Client-facing ARV comping tool. Paste a property address → Jarvis pulls the
subject property and recent sold comps from DealMachine and produces a
deterministic, comp-backed ARV opinion with a confidence grade.

Built as a white-label SaaS add-on, designed to be embedded inside a GHL
sub-account via iframe (`/embed`), with access provisioned manually per
client.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma 6 + Postgres
- Custom email/password session auth (users are provisioned, no self-signup)
- DealMachine API for property + sold comp data (server-side only)

## How the ARV is computed

The ARV is **deterministic code**, not a model output
(`src/lib/arv.ts`, fully unit-tested):

1. Sold comps are fetched wide (1 mi, 12 months) from DealMachine, then
   qualified in our code through tightening tiers:
   - Tier 1: sold ≤ 6 months, ≤ 0.5 mi
   - Tier 2: sold ≤ 12 months, ≤ 0.5 mi (if tier 1 is thin)
   - Tier 3: sold ≤ 12 months, ≤ 1.0 mi (if tier 2 is thin)
   - Always: ±20% of subject sqft, same property type, real sale
     price/date/sqft.
2. $/sqft outliers are IQR-trimmed (5+ comps only).
3. **ARV = median $/sqft × subject sqft**, with a p25–p75 range.
4. Confidence (high / medium / low) is scored from comp count, tier used,
   distance tightness, and $/sqft spread — the factors are shown in the UI.

DealMachine's `value_estimation` is displayed as a *secondary reference
only* and never used in the ARV math.

## Local setup

```bash
npm install
cp .env.example .env         # then fill in values (see below)
npx prisma db push           # syncs schema to your Postgres DB
npm run user:create -- you@example.com yourpassword --admin
npm run dev
```

`.env`:

| Var | What |
| --- | --- |
| `DEALMACHINE_API_KEY` | DealMachine secret key (`dm_sk_live_...`). Server-side only — never exposed to the client. |
| `DATABASE_URL` | Postgres connection URL (local Postgres in dev, Neon in production). |
| `SESSION_SECRET` | Random string (`openssl rand -hex 32`). Reserved for cookie/token signing. |

A demo admin exists in the dev DB: `demo@jarviscomps.com` / `jarvis-demo-2026`.

### Tests

```bash
npm test        # vitest — covers the comp qualification + ARV engine
```

## Pages

| Route | What |
| --- | --- |
| `/` | Marketing landing page |
| `/signin` | Email/password sign-in |
| `/signup` | Invite-code redemption → self-service account creation |
| `/app` | Auth-gated dashboard: address in → ARV + comps out, copy-summary button |
| `/account` | Email, access status, sign out |
| `/embed` | Same tool with chrome stripped, for iframe embedding (GHL) |
| `POST /api/comps` | `{ address }` → subject + qualified comps + ARV + confidence |
| `POST /api/auth/signup` | Redeems a code and creates the account in one transaction |

## Deploying to Vercel + Neon

1. Create a **Neon** Postgres database and copy its pooled connection string.
2. Import this repo into Vercel. No build config is needed — `npm run build`
   runs `prisma generate` before `next build`, and `postinstall` runs it
   again, so Vercel's dependency cache can't serve a stale Prisma client.
3. Set environment variables on the Vercel project:
   - `DATABASE_URL` — the Neon connection string
   - `DEALMACHINE_API_KEY`
   - `SESSION_SECRET`
4. Push the schema to Neon once, from your machine:
   `DATABASE_URL="<neon-url>" npx prisma db push`
5. Provision users the same way (see **Billing and access** below).

Note on migrations: there is no committed migration history — schema changes
go out with `prisma db push`. If you want real migrations later, run
`npx prisma migrate dev` against a Postgres URL to start a history.

## Billing and access

Billing is **manual**. There is no payment processor wired into the app, and
none is planned — access is granted and revoked by an admin.

The flow:

1. Client buys the add-on and is invoiced through GHL.
2. Once paid, mint an invite code and send it to them:
   `npm run invite:create` (or `-- 5` for a batch).
3. They redeem it at `/signup`, choosing their own email and password. The
   code is single-use and burns on redemption, so it can't be shared or
   replayed. Accounts are created with `entitlement = "active"`.
4. On churn or non-payment, revoke access by flipping their entitlement:
   `UPDATE "User" SET entitlement = 'inactive' WHERE email = 'client@email.com';`
   or delete the row outright. Either takes effect on their next request.

There is no open sign-up — without a valid unused code, no account can be
created. Unknown and already-used codes return the same message, so the form
never reveals which codes exist.

`npm run user:create -- <email> <password> [--admin]` remains the manual
fallback: it bypasses invite codes entirely, and is how you create staff/admin
accounts and reset a forgotten password (re-run it with the same email).

`User.entitlement` is the gate — `"active"` grants the product, anything else
revokes it — and `src/lib/entitlements.ts → hasActiveEntitlement()` is the
single checkpoint enforcing it. `/api/comps` already refuses any user whose
entitlement isn't active, so revoking is immediate and total.

Re-running `user:create` for an existing email resets that user's password
and admin flag, which is also how you handle a password reset.

## GHL embed

`/embed` is the integration point. In GHL, add a custom menu link / iframe
element pointing at:

```html
<iframe
  src="https://YOUR-DOMAIN/embed"
  style="width:100%;height:900px;border:0;"
  title="Jarvis Comps"
></iframe>
```

- The layout is fluid down to ~360px wide, so it sits cleanly in GHL panels.
- The session cookie is `SameSite=None; Secure` in production specifically so
  sign-in survives inside the cross-origin iframe. Users sign in once inside
  the frame (`/signin?embed=1` returns them to `/embed`).
- No `X-Frame-Options` header is set, so framing is allowed. If you want to
  lock framing to GHL domains later, add a
  `Content-Security-Policy: frame-ancestors` header in `next.config.ts`.

## DealMachine client notes (`src/lib/dealmachine.ts`)

- Base URL `https://api.v2.dealmachine.com/v1`, Bearer auth, browser-style
  `User-Agent` on every request.
- Flow: `POST /enrichment/address` (match address → `dm_property_id`, no
  people credits with `contact_audience: "none"`) → `POST /comps`
  (subject + sold comps: sale price/date, sqft, beds/baths, distance in
  miles, property type).
- Rate limits: 60 req/min, 5,000/day per org — surfaced to the user as a
  "try again in a minute" error.
- In non-disclosure states (e.g. TX) some comps carry
  `sale_type: "Estimated Sales Price"`; the UI flags those rows.

## Disclaimer

ARV opinions are estimates for research purposes and are not appraisals.
