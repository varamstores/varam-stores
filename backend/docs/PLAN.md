# Varam Foods — Backend Plan (approved 2026-11-21, Postgres-only revision)

## 1. What this is

The backend for **Varam Foods**, an online South-Asian grocery delivering in
**Hertfordshire / North London (UK)**. The React storefront and admin portal exist but run on
mocks. Goal: **every screen reads and writes the Supabase Postgres database, all mock data
lives in the DB, and the mock files are deleted.** That includes the full admin feature set.

**Architecture decision (yours): there is no API server to host.** All business logic is
Postgres functions. The browser reaches Postgres through Supabase's built-in gateway
(`supabase-js` → PostgREST / Auth / Storage). We write no server code: only SQL migrations,
plus small Node scripts that apply them from this machine.

First milestone: **browse → cart → slot → pay → order confirmed** in Stripe test mode.

## 2. Context (from Step 1)

- UK only, GBP, English. Supabase project `eu-west-2` (London), Postgres 17.12.
- Available extensions checked: `http` (synchronous HTTP from SQL), `pg_net`, `pg_cron`, `pgtap`, `plpgsql_check`, `pg_jsonschema`, `pg_trgm`, `unaccent`, `btree_gist`, `pgmq`.
- Role statement timeouts: `anon` 3 s, `authenticated` 8 s. Any function that calls Stripe must finish well inside that.
- Supabase Auth: email signup on, confirmation required, built-in mailer limited to **2 emails/hour** (testing only), min password length 6, site URL `http://localhost:3000` (to be set to the storefront URL).

## 3. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Payments | ✅ Stripe, test mode |
| D2 | Auth | ✅ Supabase Auth, used directly by the frontend (`supabase-js`). With no server, sessions live in the browser (Supabase default), not httpOnly cookies. Mitigations: 1 h JWT, refresh-token rotation (on), strict CSP |
| D3 | Backend form | ✅ **No API server.** Logic = Postgres functions in schema `api`, exposed via PostgREST |
| D4 | Search / jobs / holds | ✅ Postgres: FTS + trigram, `pg_cron` jobs, holds as rows |
| D5 | Hosting | ✅ None needed |
| D6 | Email provider | ❓ open. Until chosen, emails queue in an outbox table (visible in admin) and auth emails use Supabase's limited mailer |
| D7 | Guest checkout | ❓ open |
| D8 | SMS / WhatsApp provider | ❓ open. Messages queue in the outbox |
| D9 | UK / GBP / en-GB | ✅ |
| D10 | Supabase project = production or staging | ❓ open. Sample rows are flagged and purgeable either way |
| D11 | Newsletter double opt-in | ✅ yes |
| D12 | Stripe integration | ✅ **Postgres calls Stripe** via the `http` extension, with the secret key in Supabase Vault. **No webhooks**: after the customer pays, Postgres fetches the PaymentIntent from Stripe to verify it, and a `pg_cron` reconciliation job re-checks unfinished payments every minute |
| D13 | First Store Manager login | ✅ `test@gmail.com` (temporary). Created pre-confirmed so no email is sent. **Change before launch**: weak password, and a Gmail address that someone else may own |
| D14 | Categories | ✅ 12 shop categories + Bakery & Dairy, Health & Beauty, Kitchenwares; misfiled items refiled |
| D15 | Seed data | ✅ Catalogue, brands, suppliers, promotions, delivery areas = **live**. Customers, orders, staff, reviews, drivers, vans, stock counts = **sample** (`is_sample`, one-command purge, sample reviews hidden in production) |
| D16 | CMS | ✅ **Inside the admin portal, stored in Postgres.** Controls *everything*: every page and section, every image, navigation, header and footer, SEO and static pages, and all UI microcopy. Text is shared; every image slot has **desktop + mobile** versions; sections can be shown or hidden per device. **Edits go live immediately**; changes are written to the audit log |
| D17 | Nothing hard-coded | ✅ Every rule and value (loyalty, promotions, fees, slots, tax, templates, roles/permissions, settings, CMS) lives in the DB and has an admin editor |
| D18 | Images | ✅ All 181 images from `public/` are in Supabase Storage (bucket `storefront`); the DB stores object paths, and `app.media_url()` builds URLs. Favicons stay in `public/` too, because browsers request them from the site root |
| D19 | Delivery slots | ✅ 08–10 "Morning Fresh", 14–16 "Afternoon Standard", 18–20 "Evening Express", daily, every zone; 20 per window; cut-off 2 h; 7 days ahead (all editable) |
| D20 | Email | ✅ Resend (needs API key + verified sending domain) |
| D21 | Checkout | ✅ Account required (`guest_checkout_enabled = false`, editable) |
| D22 | Substitutes | ✅ Customer pays the lower of original and substitute price (`substitution_pricing`, editable) |
| D23 | VAT | ✅ Registered. Entity details to follow; invoices stay off (`invoices_enabled = false`) until saved |
| D24 | Promos | ✅ FRESH20 and VARAM10 active with no end date; VARAM20 draft |
| D25 | Loyalty | ✅ 10 pts per £1 of captured product spend; 1 pt = 1p; tiers Member 0 / Gold 1,000 / VIP 2,000 (all editable) |
| D26 | Git | ✅ Commit and push straight to `main` (PavanSuryaChintada) |

## 4. Architecture

```
React storefront + admin ──supabase-js──▶ Supabase gateway ──▶ PostgREST ──▶ schema api (functions only)
                                   │                                              │ SECURITY DEFINER
                                   ├─▶ Supabase Auth (login, sessions)            ▼
                                   └─▶ Supabase Storage (images, exports)     schema app (tables, private, RLS deny-all)
                                                                                  │
                         pg_cron jobs (holds, payment reconciliation, slots,     │ http extension
                         delayed auth, outbox) ─────────────────────────────────▶ Stripe / email / SMS
```

### 4.1 Rules for every function (the "handlers")
- Live in schema **`api`**, which is the only schema exposed to PostgREST. Tables live in **`app`**, which isn't exposed.
- `SECURITY DEFINER`, `SET search_path = ''`, every object schema-qualified. No dynamic SQL built from input.
- Authorisation inside the function: `app.require_customer()` / `app.require_permission('pricing')`, from `auth.uid()` + the `staff` table.
- **Access is declared and fail-closed.** Every `api` function carries a comment `@access anon | authenticated | staff`. One migration step grants `EXECUTE` from those comments. No comment means no access, and a test fails if any function is missing one. `PUBLIC` never gets `EXECUTE`.
- Errors: `RAISE … USING ERRCODE = 'PT409', MESSAGE = 'SLOT_FULL', DETAIL = <json>`. PostgREST turns `PTxxx` into HTTP status `xxx`, and the frontend translates the `MESSAGE` code.
- Return `jsonb` in the shapes defined in [API_CONTRACT.md](API_CONTRACT.md). The frontend gets a hand-written TS type for each shape; the SQL tests check outputs against JSON Schemas (`pg_jsonschema`).

### 4.2 Repository layout
```
backend/
  db/migrations/   0001_… .sql  (applied in order, checksummed, never edited after applying)
  db/seed/         generated SQL (catalogue live + sample)
  db/tests/        pgTAP tests, each run inside BEGIN … ROLLBACK
  scripts/         migrate · seed · test · lint (plpgsql_check) · bootstrap-admin · vault-sync · configure
  docs/            this folder
  PROGRESS.md
```
Commands (from `backend/`): `npm run db:migrate`, `npm run db:seed`, `npm run db:test`, `npm run db:lint`.

### 4.3 Not available without a server (and what replaces it)
| Brief asks for | Postgres-only answer |
|---|---|
| OpenAPI from code | API_CONTRACT.md + JSON Schemas tested in SQL; PostgREST also publishes its own OpenAPI |
| Payment webhooks | Server-side verification (Postgres pulls from Stripe) + reconciliation job (D12) |
| httpOnly cookie sessions | Supabase browser session (D2) |
| Auth rate limits | Supabase Auth built-in limits; RPC limits via `app.rate_limits` |
| Structured logs | Postgres/Supabase logs; functions never put personal data in errors |
| Health endpoint | `api.health()` |
| docker-compose / CI | Not used (your call). Tests run against the live DB inside rolled-back transactions. CI can come later with a second Supabase project |

## 5. Core designs (unchanged in substance from Step 1)

### 5.1 Money & VAT
Integers only (pence, basis points, grams). Prices are VAT-inclusive. The rate comes from
`app.tax_rates` for (delivery country, product tax category) at order time. **VAT is calculated per
line** on net-of-discount gross: `round_half_up(gross × rate / (10000 + rate))`. It's copied onto the
line, along with the rate and category. Basket discounts are allocated to lines by largest
remainder. Deposits are separate lines and never discounted. In production, invoices are refused
while a rate is unconfirmed.

### 5.2 Pricing engine
`app.price_cart(cart_id)` is deterministic. Steps: base/member price → product promotions in
`(priority, id)` order, one non-stackable per line → min-spend check → coupon/basket promotions,
allocated → delivery fee (free-delivery threshold on the pre-discount subtotal, as the frontend does
today) → VAT per line → `appliedPromotions[]`.

### 5.3 Slots & holds
`UPDATE … SET reserved_count = reserved_count + 1 WHERE reserved_count < capacity AND now() < cutoff_at`,
backed by `CHECK (reserved_count <= capacity)`. Holds expire after `slot_hold_minutes`, and a `pg_cron`
job releases them every minute.

### 5.4 Stock
Reserve on order submission (`reserved = reserved + q WHERE on_hand - reserved >= q`, in
product order), backed by `CHECK (reserved <= on_hand)`. Release on payment failure or expiry.
Every change goes to the `stock_movements` ledger. CSV import is all-or-nothing.

### 5.5 Payments (Stripe from Postgres)
- `api.place_order` reserves stock, creates the order (`pending_payment`), calls Stripe
  `POST /v1/payment_intents` (`capture_method=manual`, Stripe idempotency key = order id), stores the
  intent id and returns `client_secret`. If Stripe fails, the whole transaction rolls back.
- The browser confirms with Stripe.js (3DS / Apple Pay / Google Pay). Then `api.confirm_order_payment`
  makes Postgres `GET` the intent from Stripe and checks status `requires_capture`, amount, currency
  and order metadata before marking the order `placed`. The client can't fake this.
- The `pg_cron` reconciler (every minute) does the same for tabs that were closed, and cancels stale
  `pending_payment` orders.
- Authorise-later (slot beyond the card-auth window): SetupIntent at checkout, then an off-session
  authorisation job before picking.
- Capture after picking = `min(final, authorised)`, backed by `CHECK (captured ≤ authorised)`.

### 5.6–5.11
Picking and substitutions, the order state machine, invoices and credit notes (gapless,
immutable), idempotency keys and GDPR all work as in Step 1 (see the DATA_MODEL comments). Staff
invitations call the Supabase Auth admin endpoint from Postgres, with the secret key in Vault.

## 6. Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Discovery & contract | ✅ |
| 1 | Foundations: Node runner scripts, extensions, `app` + `api` schemas, privilege hardening, error/auth helpers, declarative grants, `api.health`, PostgREST exposes `api`, pgTAP harness, plpgsql_check lint | ✅ |
| 2 | All tables, constraints, triggers; **every frontend mock migrated to Postgres**; **all 181 images to Supabase Storage**; Store Manager login; purge function | ✅ 93 tests passing |
| 3 | **CMS + storefront read path**: content model (pages, sections, slots, desktop/mobile images, navigation, header/footer, SEO, static pages, microcopy dictionary); extract every string/image from the frontend into it; catalogue functions; frontend `supabase-js` client; storefront renders 100 % from DB; delete catalogue mocks | No hard-coded copy or image left in storefront components |
| 4 | Auth & account (Supabase Auth screens), addresses, preferences, consents, wishlist, newsletter, GDPR | Sign-up → manage → export → delete works |
| 5 | Cart + pricing engine (all promotion types, VAT per line, fees) | Money/VAT/promotion tests pass |
| 6 | Zones, slots + holds, checkout, Stripe via `http`, reconciliation, Resend emails | 🏁 Milestone 1 E2E in Stripe test mode |
| 7 | **End-to-end order management**: picking (weights, substitutions), capture, invoices, dispatch (vans/drivers), delivery + ID check, cancellations, refunds/credit notes, loyalty earn/burn, tracking | Every order path tested |
| 8 | **Admin portal, fully functional**: every existing tab wired + missing screens + **CMS editor** + every config editor (settings, loyalty, promotions, zones/slots, tax, templates, roles/permissions); delete `adminMockData.ts` | Every admin action is permission-checked and audited; nothing hard-coded |
| 9 | Hardening: no mocks left, security review, contention tests, launch checklist | Sign-off |

Frontend packages (added in Phase 3/6): `@supabase/supabase-js`, `@tanstack/react-query`,
`@stripe/stripe-js`, `@stripe/react-stripe-js`.

## 7. Testing
pgTAP files run against the live DB, each inside `BEGIN … ROLLBACK`, so nothing persists. Coverage:
security (grants, RLS, exposed schemas), constraints, money/VAT, promotions, slot capacity, weighted
capture, the state machine, and JSON-Schema checks on function outputs. Concurrency tests (holds,
stock, invoice numbers) use multiple connections against rows created and removed by the test.
Milestone E2E: Playwright + Stripe test cards.

## 8. Still needed from you
| # | What | Needed by |
|---|---|---|
| N1 | **Stripe test keys** (`sk_test_…`, `pk_test_…`) | Phase 6 |
| N2 | **Resend API key** + the sending domain (e.g. `varamfoods.co.uk`) so DNS records can be verified | Phase 4/6 |
| N3 | **VAT entity details**: legal name, company number, VAT number, registered address | Phase 7 |
| N4 | **Fulfilment hub**: address (seeded as "Hertfordshire hub (address to confirm)"); click & collect too? | Phase 6 |
| N5 | Weighed items: seeded as the 3 products sold "per kg" (tomatoes, bananas, broccoli), 1 kg steps, as the UI does today. Any others? | Phase 5 |
| N6 | SMS / WhatsApp provider (admin messaging, "driver nearby" SMS); messages queue in the outbox until then | Phase 8 |
| N7 | Is this Supabase project production or staging? | Phase 9 |

## 9. My calls (correct any)
- No `citext`: emails are stored lowercased with a `CHECK` (avoids search-path pitfalls inside `SECURITY DEFINER` functions).
- `customers.user_id` / `staff.user_id` are nullable FKs to `auth.users`. Sample people have no login, and anonymised customers keep their row.
- Sample customer and staff emails become `@example.com`; phones move to the Ofcom drama range.
- Two mock inventory items with no catalogue product (GRB ghee 500 ml, Aashirvaad Shudh Chakki 10 kg) are seeded as **draft** products, so they're hidden from shoppers.
- Stock for catalogue items with no mock inventory row is seeded at 50 units (sample, purgeable) so checkout can be tested.
- The 3 new categories are hidden from the homepage category grid (`show_on_homepage = false`), because they have no artwork.
- Sample orders have no slot and no invoice, so the real invoice sequence stays gapless.
- Supplier contacts are seeded as given. **Verify them before any PO email is sent.** Nothing sends until D6.
- HERTSFREE is restricted to the Hertfordshire zones (not N10), as its title says.
- Order numbers continue at `VF-11001`.
