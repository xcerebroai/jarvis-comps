# Jarvis Comps

**Instant ARV. Real comps. No guesswork.**

Client-facing ARV comping tool. Paste a property address → Jarvis pulls the
subject property and recent sold comps from DealMachine and produces a
deterministic, comp-backed ARV opinion with a confidence grade.

Built as a white-label SaaS add-on, designed to be embedded inside a GHL
sub-account via iframe (`/embed`) and later gated behind Stripe.

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
| `DATABASE_URL` | Postgres connection URL (local Postgres in dev, Railway Postgres in production). |
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
| `/app` | Auth-gated dashboard: address in → ARV + comps out, copy-summary button |
| `/account` | Email, access status, sign out |
| `/embed` | Same tool with chrome stripped, for iframe embedding (GHL) |
| `POST /api/comps` | `{ address }` → subject + qualified comps + ARV + confidence |

## Deploying to Railway

1. Create a Railway project from this repo — `railway.json` handles build
   (`npm run build`) and start (`prisma db push` + `next start`; Railway
   injects `PORT`).
2. Add a **Postgres** service to the project.
3. Set service variables:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`
   - `DEALMACHINE_API_KEY`, `SESSION_SECRET`
4. Deploy, then provision users from a shell on the service (or locally
   against the prod `DATABASE_URL`):
   `npm run user:create -- client@email.com theirpassword`

Note on migrations: there is no committed migration history — both deploy
and local dev use `prisma db push` (schema sync). If you want real
migrations later, run `npx prisma migrate dev` against a Postgres URL to
start a history.

## Integration seams

### Stripe (not built yet — the seam is ready)

- `User.entitlement` (`"active" | "past_due" | "canceled"`) is the gate, and
  `src/lib/entitlements.ts → hasActiveEntitlement()` is the **single
  checkpoint** — `/api/comps` already refuses users whose entitlement isn't
  active.
- When Stripe lands: add Stripe customer/subscription IDs to `User`, and a
  webhook route that flips `entitlement` on
  `customer.subscription.updated/deleted`. Nothing else needs to change.
- User provisioning on purchase = create the User row (see
  `scripts/create-user.ts` for the shape) and email credentials.

### GHL embed

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
