# Varam Foods — Build Progress

**Overall: 91 % complete** `██████████████████░░` · last updated 2026-11-23

**Live:** https://varam-stores-alpha.vercel.app (shop) · https://varam-stores-alpha.vercel.app/admin (store portal — sign in with a staff login)

Everything runs inside the Supabase Postgres database (London, eu-west-2). There's no API
server: the website and admin portal call Postgres functions directly through Supabase.
Details: [backend/docs/PLAN.md](backend/docs/PLAN.md).

## Phases

| # | Phase | Weight | Done | Progress |
|---|---|---|---|---|
| 0 | Discovery & contract | 3 % | ✅ 100 % | `██████████` |
| 1 | Foundations (schemas, security, runner, tests) | 5 % | ✅ 100 % | `██████████` |
| 2 | Database schema + all mock data + all images → Supabase | 12 % | ✅ 100 % | `██████████` |
| 3 | CMS (every page/section/image/nav/footer/SEO/microcopy, desktop + mobile) + storefront from DB | 16 % | ✅ 100 % | `██████████` |
| 4 | Customer accounts (sign-up/login, addresses, wishlist, newsletter, GDPR) | 10 % | 🟨 95 % | `█████████▌` |
| 5 | Cart & pricing engine (promotions, VAT, fees) | 10 % | 🟨 95 % | `█████████▌` |
| 6 | Slots, checkout, Stripe payments, emails — 🏁 first full order | 12 % | 🟨 85 % | `████████▌░` |
| 7 | End-to-end order management (picking → dispatch → delivery → refunds, loyalty) | 12 % | 🟨 95 % | `█████████▌` |
| 8 | Admin portal fully functional (every tab, CMS editor, every setting editable) | 15 % | 🟨 95 % | `█████████▌` |
| 9 | Hardening & launch checklist | 5 % | ⬜ 0 % | `░░░░░░░░░░` |

## What's live in the database right now

| Area | Count | Notes |
|---|---|---|
| Migrations applied | 28 | `backend/db/migrations/0001…0028` |
| Tables | 90 | private schema `app`, RLS on, not reachable from the browser |
| Browser-callable functions | 169 | shop: catalogue, CMS, basket, accounts, checkout, orders, loyalty, alerts, repeat orders · admin: 86 (orders, picking, dispatch, refunds, products, CSV, stock, suppliers, purchase orders, customers, reviews, emails, offers, delivery, loyalty, staff, settings, audit) |
| Automated tests | **399 passing, 0 failing** | security, money/VAT, constraints, seed, catalogue, basket, accounts, checkout, engagement, order management, admin catalogue, admin operations, admin configuration |
| CMS | 19 pages · 76 sections · 798 entries | every text, image, link and section on the site; edits go live within a minute |
| Delivery slots open | 110 | generated hourly from the slot templates |
| Scheduled jobs | 9 | slots, slot holds, payment reconciler, email outbox, guest baskets, alerts, repeat orders, basket reminders, low-stock purchase-order drafts |
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

### ✅ Phase 3 — CMS + storefront from the database (100 %)
- [x] Content model: pages, sections, typed entries, desktop + mobile images, per-device visibility, admin-set order
- [x] Navigation, header, mega-menus, footer, social, contact, announcement bar, mobile bottom bar, loading screen
- [x] SEO per page (title template, description, sharing image); 11 content pages (unpublished, empty — legal text must come from you)
- [x] Microcopy: buttons, labels, toasts, empty states, error messages, promo-code reasons
- [x] Homepage sections, shop, product, basket, delivery pop-up, quick view, wishlist, checkout, account → CMS
- [x] Catalogue functions; frontend reads everything from Postgres
- [x] "Our Story" page → CMS (sections reorderable, live counts)
- [x] Mock files deleted (src/data/*, old admin portal) — all data lives only in Postgres

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

### 🟨 Phase 7 — Order management (95 %)
- [x] Order state machine with full history; customer cancellation releases stock, slot, coupon and card hold
- [x] Loyalty: balance, tiers, rewards redeemed as personal codes
- [x] Picking queue, picks with weights / shortages / substitutes (customer pays the lower price)
- [x] Final pricing, capture ≤ authorised (idempotent), stock movements, loyalty earning, "packed" email
- [x] Dispatch (van, driver, arrival window, tracking code), delivery with ID check
- [x] Refund requests → manager approval → Stripe refund, credit note, points reversal, email
- [x] Staff cancel of unpaid orders; order search for staff
- [x] Invoices: switch on in Settings once company + VAT details are saved (Settings → Company & VAT)
- [x] Admin screens: Orders, Picking, Deliveries, Refunds
- [ ] Real card capture/refund with Stripe test keys (waiting for the keys)

### 🟨 Phase 8 — Admin portal (95 %)
- [x] CMS editor functions in the database (overview, edit entry/section/page, search, media library)
- [x] Admin catalogue functions: products, prices (now or scheduled, with history), food information, photos, categories, brands, shelves, CSV import (dry run first) / export
- [x] Admin operations functions: dashboard, stock, stock-count CSV, suppliers, purchase orders (+ automatic low-stock drafts), customers, loyalty adjustments, customer messages, reviews, email templates, email outbox
- [x] Admin configuration functions: every setting with a plain-English label and help, company & VAT, VAT-rate confirmation, offers & promo codes, delivery areas / postcodes / charges / weekly windows / single slots, vans, drivers, loyalty tiers & rewards, staff invitations (email via Supabase Auth), roles & permissions, audit log
- [x] New store portal live at /admin: 19 screens, each with a “How this works” guide, shown only to roles allowed to use them
- [x] Website content editor: pages → sections (on/off, computer/phone, order) → fields; buttons ask “What should it say?” + “Where should it take people?” (home, all products, category, brand, product, offers, organic, search, information page, Our Story, saved items, account, part of the homepage, video, website, email, phone); pictures for computer + phone from the picture library or upload; lists, icons, colours, rich text with toolbar and preview; find any text; Google/sharing preview
- [x] Staff invitations by email; invited staff choose a password on /admin
- [x] Every screen checked signed in as the Store Manager against the real database (all 126 database calls verified)
- [x] Mock admin data deleted
- [ ] Click-through of every save with you (we fix anything that feels unclear)

### ⬜ Phase 9 — Hardening

## Advanced features you chose (2026-11-22)
| Feature | Database | Website / admin |
|---|---|---|
| Buy it again + "often bought together" | ✅ | ✅ buy it again (account) · ⬜ "bought together" row |
| Back-in-stock & price-drop alerts | ✅ (+ email job) | ✅ product page buttons, account tab |
| Repeat orders (basket refilled + reminder, nothing charged automatically) | ✅ (+ daily job) | ✅ account tab, "Repeat this order" |
| Abandoned-basket reminders (only with marketing consent) | ✅ (+ hourly job) | ✅ on/off and timing in Settings |
| Low-stock automatic purchase orders | ✅ (+ daily 06:30 job, on/off in Settings) | ✅ Suppliers & buying |
| Product CSV import / export | ✅ (dry run lists every problem; all-or-nothing) | ✅ Products (+ stock-count CSV in Stock) |

## Mock removal tracker (goal: zero)
| Frontend source | Data in DB | Frontend reads DB | File deleted |
|---|---|---|---|
| `src/data/products.ts` | ✅ | ✅ | ✅ |
| `src/data/categories.ts` | ✅ | ✅ | ✅ |
| `src/data/brands.ts` | ✅ | ✅ | ✅ |
| `src/data/reviews.ts` | ✅ | ✅ | ✅ |
| `src/data/adminMockData.ts` | ✅ | ✅ | ✅ |
| Hard-coded copy and images in components | ✅ | ✅ | — |

## Waiting on you
1. **Stripe test keys** (`sk_test_…`, `pk_test_…`) — checkout runs in test mode until then
2. **Resend API key** + sending domain — emails are queued (visible in the database) until then
3. **VAT entity details**: legal name, company number, VAT number, registered address (needed for invoices)
4. **Hub address** for the fulfilment location
5. **Legal page wording** (Terms, Privacy, Cookies, Returns, Delivery): pages exist, hidden until you add the text
6. Marketing claims to confirm or edit in the CMS ("100% organic", "zero air-miles", "plastic-free", "100% money-back"): kept as written
7. Rotate the DB password and Supabase access token (they were pasted in chat); later change the test@gmail.com login

## Log
- **2026-11-24**: Search and filters everywhere (0033). Store portal: one search box in the header (Ctrl+K) finds orders, products, customers, categories, brands, suppliers, offers, staff, screens and guide topics; every list has the same filter bar (labelled filters, removable chips, "Clear all", result count); Categories and Brands now have search + filters; Products can filter by brand and sort. Shop page: searchable brand list with live counts, price from/to boxes, "In stock now", chips for each. 33 migrations, 403 tests green.
- **2026-11-24**: Store portal reworked for non-technical staff: one order board (New → Picking → Ready to send → On the road → Delivered) with one next-step button per order; numbered shop set-up (1 Categories → 2 Brands → 3 Products → 4 Stock → 5 Suppliers) with a Home checklist; add-product in six steps (several photos); grams/kilos everywhere; page numbers on every list; clean custom drop-downs; simpler Emails (wording only, Resend); a Guide covering every screen; muted professional palette. Fix: products sold by weight could not be created (0031). 32 migrations, 403 tests green.
- **2026-11-23 (later)**: Site live on Vercel (blank page fixed: public Supabase settings now ship with the build; clean URLs fixed). New store portal live at /admin with every screen wired to Postgres; mock portal and mock data deleted.
- **2026-11-23**: All admin functions in the database: catalogue + CSV, stock + suppliers + purchase orders (automatic low-stock drafts), customers, reviews, emails, offers & codes, delivery set-up, loyalty, staff invitations & roles, settings with plain-English help, company & VAT, audit log. 28 migrations, 399 tests green, lint clean.
- **2026-11-22 (later)**: Order management end to end (picking → capture → dispatch → delivery → refunds) + Our Story from the CMS. 24 migrations, 304 tests green.
- **2026-11-22**: Storefront fully on Postgres + CMS (798 entries). Basket & pricing engine, accounts, delivery slots, checkout and orders, loyalty, reviews, alerts, repeat orders, basket reminders. 22 migrations, 275 tests green.
- **2026-11-21**: Phases 0–2 complete. 11 migrations, 82 tables, 93 tests green, all mocks and images in Supabase, Store Manager login live.
