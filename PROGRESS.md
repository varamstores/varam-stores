# Varam Foods — Build Progress

**Overall: 74 % complete** `███████████████░░░░░` · last updated 2026-11-22

Everything runs inside the Supabase Postgres database (London, eu-west-2). There's no API
server: the website and admin portal call Postgres functions directly through Supabase.
Details: [backend/docs/PLAN.md](backend/docs/PLAN.md).

## Phases

| # | Phase | Weight | Done | Progress |
|---|---|---|---|---|
| 0 | Discovery & contract | 3 % | ✅ 100 % | `██████████` |
| 1 | Foundations (schemas, security, runner, tests) | 5 % | ✅ 100 % | `██████████` |
| 2 | Database schema + all mock data + all images → Supabase | 12 % | ✅ 100 % | `██████████` |
| 3 | CMS (every page/section/image/nav/footer/SEO/microcopy, desktop + mobile) + storefront from DB | 16 % | 🟨 90 % | `█████████░` |
| 4 | Customer accounts (sign-up/login, addresses, wishlist, newsletter, GDPR) | 10 % | 🟨 95 % | `█████████▌` |
| 5 | Cart & pricing engine (promotions, VAT, fees) | 10 % | 🟨 95 % | `█████████▌` |
| 6 | Slots, checkout, Stripe payments, emails — 🏁 first full order | 12 % | 🟨 85 % | `████████▌░` |
| 7 | End-to-end order management (picking → dispatch → delivery → refunds, loyalty) | 12 % | 🟨 80 % | `████████░░` |
| 8 | Admin portal fully functional (every tab, CMS editor, every setting editable) | 15 % | 🟨 5 % | `▌░░░░░░░░░` |
| 9 | Hardening & launch checklist | 5 % | ⬜ 0 % | `░░░░░░░░░░` |

## What's live in the database right now

| Area | Count | Notes |
|---|---|---|
| Migrations applied | 24 | `backend/db/migrations/0001…0024` |
| Tables | 89 | private schema `app`, RLS on, not reachable from the browser |
| Browser-callable functions | 83 | catalogue, CMS, basket, accounts, checkout, orders, loyalty, alerts, repeat orders |
| Automated tests | **304 passing, 0 failing** | security, money/VAT, constraints, seed, catalogue, basket, accounts, checkout, engagement, order management |
| CMS | 19 pages · 76 sections · 798 entries | every text, image, link and section on the site; edits go live within a minute |
| Delivery slots open | 115 | generated hourly from the slot templates |
| Scheduled jobs | 8 | slots, slot holds, payment reconciler, email outbox, guest baskets, alerts, repeat orders, basket reminders |
| Products | 42 live + 2 draft | |
| Images in Supabase Storage | 181 / 181 | bucket `storefront` |
| Store Manager login | test@gmail.com | |

## What works end to end today (website)
- Every storefront screen reads Postgres: home, shop (server-side filters, search, sort, paging), product page (with legal food info, real reviews), quick view, basket, delivery area, wishlist, content pages, checkout, account.
- Basket is priced by Postgres: promotions and promo codes (with clear "why not" reasons), delivery fees by area, free-delivery threshold, slot charges, VAT per line (delivery VAT split by rate).
- Sign up / sign in / password reset (Supabase Auth), profile, addresses, preferences, marketing consents, saved items synced to the account, newsletter double opt-in, download my data, delete my account.
- Checkout: real delivery windows with a live hold, age check, terms, **order placed and confirmed** (payments run in *test mode* until the Stripe keys arrive), cancel before cut-off, reorder, order history with timeline.
- Fabricated figures removed (fake ratings, "10,000+ items", "90+ brands", "99.4 % on time"); live counts used instead.

## Phase checklists

### 🟨 Phase 3 — CMS + storefront from the database (85 %)
- [x] Content model: pages, sections, typed entries, desktop + mobile images, per-device visibility, admin-set order
- [x] Navigation, header, mega-menus, footer, social, contact, announcement bar, mobile bottom bar, loading screen
- [x] SEO per page (title template, description, sharing image); 11 content pages (unpublished, empty — legal text must come from you)
- [x] Microcopy: buttons, labels, toasts, empty states, error messages, promo-code reasons
- [x] Homepage sections, shop, product, basket, delivery pop-up, quick view, wishlist, checkout, account → CMS
- [x] Catalogue functions; frontend reads everything from Postgres
- [x] "Our Story" page → CMS (sections reorderable, live counts)
- [ ] Catalogue mock files deleted (still read by the admin portal until Phase 8)

### 🟨 Phase 4 — Customer accounts (95 %)
- [x] Sign-up completion with separate, timestamped Terms + marketing consents; session context (customer / staff)
- [x] Profile, preferences, consent ledger, addresses, wishlist (+ merge of items saved while signed out)
- [x] Newsletter double opt-in, confirm/unsubscribe pages; GDPR export + erasure
- [x] Account screens: sign in/up, reset password, finish profile, overview, orders, addresses, preferences, profile, privacy
- [ ] Supabase Auth settings: site URL + branded auth emails (needs your sending domain)

### 🟨 Phase 5 — Basket & pricing (95 %)
- [x] Guest + customer baskets, automatic merge on sign-in, import of the old browser basket
- [x] Deterministic pricing engine: product + basket promotions, coupons, allocation, fees, slot charge, VAT
- [ ] Tests for multibuy and member-price promotion types (engine supports them; none are set up yet)

### 🟨 Phase 6 — Checkout & payment 🏁 (85 %)
- [x] Slots + holds, postcode check, checkout, idempotent order placement, stock reservation, VAT order lines
- [x] Stripe from Postgres (verified server-side, reconciler) — **waiting for your Stripe test keys**
- [x] Test-mode payments for development (refused in production)
- [x] Email outbox + Resend sender — **waiting for your Resend key and domain**
- [ ] Switch to Stripe and send a real test-card order once keys arrive

### 🟨 Phase 7 — Order management (80 %)
- [x] Order state machine with full history; customer cancellation releases stock, slot, coupon and card hold
- [x] Loyalty: balance, tiers, rewards redeemed as personal codes
- [x] Picking queue, picks with weights / shortages / substitutes (customer pays the lower price)
- [x] Final pricing, capture ≤ authorised (idempotent), stock movements, loyalty earning, "packed" email
- [x] Dispatch (van, driver, arrival window, tracking code), delivery with ID check
- [x] Refund requests → manager approval → Stripe refund, credit note, points reversal, email
- [x] Staff cancel of unpaid orders; order search for staff
- [ ] Invoices switch on once your company + VAT details are saved (built and tested to that point)
- [ ] Admin screens for all of the above (Phase 8)

### 🟨 Phase 8 — Admin portal (5 %)
- [x] CMS editor functions in the database (overview, edit entry/section/page, search, media library)
- [ ] Every admin tab wired; CMS editor screens with guidance; every setting editable; mock admin data deleted

### ⬜ Phase 9 — Hardening

## Advanced features you chose (2026-11-22)
| Feature | Database | Website / admin |
|---|---|---|
| Buy it again + "often bought together" | ✅ | ✅ buy it again (account) · ⬜ "bought together" row |
| Back-in-stock & price-drop alerts | ✅ (+ email job) | ✅ product page buttons, account tab |
| Repeat orders (basket refilled + reminder, nothing charged automatically) | ✅ (+ daily job) | ✅ account tab, "Repeat this order" |
| Abandoned-basket reminders (only with marketing consent) | ✅ (+ hourly job) | ✅ settings in admin later |
| Low-stock automatic purchase orders | ⬜ | ⬜ (Phase 8) |
| Product CSV import / export | ⬜ | ⬜ (Phase 8) |

## Mock removal tracker (goal: zero)
| Frontend source | Data in DB | Frontend reads DB | File deleted |
|---|---|---|---|
| `src/data/products.ts` | ✅ | ✅ storefront · ⬜ admin | ⬜ |
| `src/data/categories.ts` | ✅ | ✅ storefront · ⬜ admin | ⬜ |
| `src/data/brands.ts` | ✅ | ✅ | ⬜ |
| `src/data/reviews.ts` | ✅ | ✅ | ⬜ |
| `src/data/adminMockData.ts` | ✅ | ⬜ | ⬜ |
| Hard-coded copy and images in components | ✅ | ✅ (except Our Story, admin) | — |

## Waiting on you
1. **Stripe test keys** (`sk_test_…`, `pk_test_…`) — checkout runs in test mode until then
2. **Resend API key** + sending domain — emails are queued (visible in the database) until then
3. **VAT entity details**: legal name, company number, VAT number, registered address (needed for invoices)
4. **Hub address** for the fulfilment location
5. **Legal page wording** (Terms, Privacy, Cookies, Returns, Delivery): pages exist, hidden until you add the text
6. Marketing claims to confirm or edit in the CMS ("100% organic", "zero air-miles", "plastic-free", "100% money-back"): kept as written
7. Rotate the DB password and Supabase access token (they were pasted in chat); later change the test@gmail.com login

## Log
- **2026-11-22 (later)**: Order management end to end (picking → capture → dispatch → delivery → refunds) + Our Story from the CMS. 24 migrations, 304 tests green.
- **2026-11-22**: Storefront fully on Postgres + CMS (798 entries). Basket & pricing engine, accounts, delivery slots, checkout and orders, loyalty, reviews, alerts, repeat orders, basket reminders. 22 migrations, 275 tests green.
- **2026-11-21**: Phases 0–2 complete. 11 migrations, 82 tables, 93 tests green, all mocks and images in Supabase, Store Manager login live.
