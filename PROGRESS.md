# Varam Foods — Build Progress

**Overall: 20 % complete** `████░░░░░░░░░░░░░░░░` · last updated 2026-11-21

Everything runs inside the Supabase Postgres database (London, eu-west-2). There's no API
server: the website and admin portal call Postgres functions directly through Supabase.
Details: [backend/docs/PLAN.md](backend/docs/PLAN.md).

## Phases

| # | Phase | Weight | Done | Progress |
|---|---|---|---|---|
| 0 | Discovery & contract | 3 % | ✅ 100 % | `██████████` |
| 1 | Foundations (schemas, security, runner, tests) | 5 % | ✅ 100 % | `██████████` |
| 2 | Database schema + all mock data + all images → Supabase | 12 % | ✅ 100 % | `██████████` |
| 3 | CMS (every page/section/image/nav/footer/SEO/microcopy, desktop + mobile) + storefront from DB | 16 % | ⬜ 0 % | `░░░░░░░░░░` |
| 4 | Customer accounts (sign-up/login, addresses, wishlist, newsletter, GDPR) | 10 % | ⬜ 0 % | `░░░░░░░░░░` |
| 5 | Cart & pricing engine (promotions, VAT, fees) | 10 % | ⬜ 0 % | `░░░░░░░░░░` |
| 6 | Slots, checkout, Stripe payments, emails — 🏁 first full order | 12 % | ⬜ 0 % | `░░░░░░░░░░` |
| 7 | End-to-end order management (picking → dispatch → delivery → refunds, loyalty) | 12 % | ⬜ 0 % | `░░░░░░░░░░` |
| 8 | Admin portal fully functional (every tab, CMS editor, every setting editable) | 15 % | ⬜ 0 % | `░░░░░░░░░░` |
| 9 | Hardening & launch checklist | 5 % | ⬜ 0 % | `░░░░░░░░░░` |

## What's live in the database right now

| Area | Count | Notes |
|---|---|---|
| Migrations applied | 11 | `backend/db/migrations/0001…0011` |
| Tables | 82 | private schema `app`, RLS on, not reachable from the browser |
| Browser-callable functions | 1 | `api.health()`. More arrive with each phase |
| Automated tests | 93 passing, 0 failing | security, money/VAT, constraints, seed integrity |
| Products | 42 live + 2 draft | all from `src/data/products.ts` + admin inventory mock |
| Categories | 15 + 55 subcategories | your approved tree |
| Brands | 94 (22 with logos) | |
| Homepage shelves | 4 × 5 products | |
| Images in Supabase Storage | 181 / 181 | bucket `storefront`, public read |
| Delivery zones / slot templates | 5 / 105 | 3 windows a day, 20 each, 2 h cut-off |
| Promotions / coupons | 5 / 4 | FRESH20, VARAM10, HERTSFREE active; VARAM20 draft; £5 loyalty reward |
| Loyalty tiers | 3 | Member 0 · Gold 1,000 · VIP 2,000 |
| Sample data (purgeable) | 7 customers · 6 orders · 5 staff · 4 reviews · 3 vans · 3 drivers · 44 stock rows | `select app.purge_sample_data();` removes all of it |
| Store Manager login | test@gmail.com | works (verified via Supabase Auth) |

## Phase checklists

### ✅ Phase 0 — Discovery & contract
- [x] Read the whole frontend (zero API calls, no login UI, everything mocked)
- [x] Contract, data model, gaps, plan — `backend/docs/`
- [x] All architecture and business decisions recorded (PLAN.md §3, D1–D26)

### ✅ Phase 1 — Foundations
- [x] Extensions: pg_trgm, unaccent, btree_gist, pgtap, plpgsql_check, pg_jsonschema, http, pg_net, pg_cron
- [x] Schema `app` (private tables) + schema `api` (browser functions only); PostgREST exposes only `api`
- [x] Fail-closed grants from `@access` tags; PUBLIC never executes anything
- [x] Error contract (`PTxxx` → HTTP status, stable codes)
- [x] Migration runner (checksummed), test runner (rolled back), linter
- [x] Verified over HTTP: `api.health` → 200; direct table access → 404

### ✅ Phase 2 — Schema, data, images
- [x] 82 tables: catalogue, price history, 14 allergens, nutrition, stock + ledger, suppliers/POs, customers, consents, staff/roles/permissions, loyalty, promotions, zones/slots/holds, fleet, carts, checkouts, orders + lines, payments, refunds, invoices/credit notes, outbox, audit, rate limits, media
- [x] Guarantees built into the DB: no overselling, no over-capture, no overlapping VAT rates or prices, deposits never discounted, slots never over capacity, ledgers append-only, invoices immutable, gapless invoice numbers
- [x] All frontend mock data → Postgres (catalogue live, people/orders sample)
- [x] All 181 images → Supabase Storage
- [x] Store Manager login created
- [x] One-command sample purge (tested)

### ⬜ Phase 3 — CMS + storefront from the database
- [ ] Content model: pages, sections, fields, desktop + mobile images, per-device visibility, order
- [ ] Navigation, header, mega-menus, footer, social, contact, announcement bar, mobile bottom nav
- [ ] SEO per page; static pages (Our Story, Terms, Privacy, Cookies, FAQ, Shipping, Returns, Contact)
- [ ] Microcopy dictionary: every button, label, toast, empty state, message
- [ ] Extract every string and image from the frontend components into the CMS
- [ ] Catalogue functions (categories, brands, products, search, shelves, reviews)
- [ ] Frontend reads everything from Postgres; catalogue mock files deleted

### ⬜ Phase 4 — Customer accounts
### ⬜ Phase 5 — Cart & pricing
### ⬜ Phase 6 — Checkout & payment 🏁
### ⬜ Phase 7 — Order management end-to-end
### ⬜ Phase 8 — Admin portal fully functional
### ⬜ Phase 9 — Hardening

## Mock removal tracker (goal: zero)
| Frontend source | Data in DB | Frontend reads DB | File deleted |
|---|---|---|---|
| `src/data/products.ts` | ✅ | ⬜ | ⬜ |
| `src/data/categories.ts` | ✅ | ⬜ | ⬜ |
| `src/data/brands.ts` | ✅ | ⬜ | ⬜ |
| `src/data/reviews.ts` | ✅ | ⬜ | ⬜ |
| `src/data/adminMockData.ts` | ✅ | ⬜ | ⬜ |
| Hard-coded copy and images in components | ⬜ (Phase 3) | ⬜ | — |
| Images in `public/` | ✅ in Storage | ⬜ | ⬜ (favicons stay) |

## Waiting on you
1. **Stripe test keys** (`sk_test_…`, `pk_test_…`): needed for Phase 6
2. **Resend API key** + sending domain: needed for emails
3. **VAT entity details**: legal name, company number, VAT number, registered address
4. **Hub address** (and click & collect, yes or no?)
5. Any weighed items besides tomatoes, bananas and broccoli?
6. SMS / WhatsApp provider (optional; messages queue until then)
7. Rotate the DB password and Supabase access token (they were pasted in chat). Later, change the test@gmail.com login

## Log
- **2026-11-21**: Phases 0–2 complete. 11 migrations, 82 tables, 93 tests green, all mocks and images in Supabase, Store Manager login live.
