# Varam Foods — Gaps, Required Frontend Changes, Legal Flags

Found by reading the whole frontend (`src/`, 19k lines). Nothing in the frontend calls a
network API today. Every screen reads mocks or `localStorage`.

---

## 1. Screens and flows that don't exist yet (no UI = nothing to wire)

| # | Missing | Why it's needed | Blocks |
|---|---|---|---|
| 1.1 | **Sign in / Sign up / Forgot password / Verify email** | No auth UI anywhere. Account page shows a hard-coded profile | Account, wishlist sync, loyalty, checkout |
| 1.2 | **Staff login**, and auth on `?page=admin` | The admin portal opens for anyone; a dropdown lets anyone "switch role" | All admin |
| 1.3 | **Checkout steps**: address select/add, slot picker, per-line substitution toggle, age confirmation (if needed), T&C acceptance + separate marketing opt-in, payment element (Stripe/Adyen hosted fields, Apple/Google Pay) | `CheckoutModal` is one button that fakes success after 1.5 s; slot is hard-coded text; `LocationModal` slot choice isn't connected to anything | Milestone 1 |
| 1.4 | **Order confirmation + tracking page** | Footer "Track Order" is `#track`; confirmation shows a random `FM-xxxxx` | Milestone 1 |
| 1.5 | **Picker / packing screen** (queue → pick lines → record weights & substitutions → complete) | Statuses `picking → picked` and weighted-item capture need a place to enter actual weights | Weighted items, substitutions, capture |
| 1.6 | Admin: **stock CSV import** | Required by the brief; no UI | Store staff stock updates |
| 1.7 | Admin: **purchase-order receiving** | PO can be created, never received into stock | Inventory accuracy |
| 1.8 | Admin: **promotions & coupons manager** | Codes are hard-coded in 3 places | Marketing |
| 1.9 | Admin: **delivery zones, fee rules, slot templates/capacity** | Hard-coded in `LocationModal` / `CartContext` | Slots |
| 1.10 | Admin: **refunds / credit notes** | Only a `paymentStatus: 'refunded'` label | Partial refunds |
| 1.11 | Admin: **review moderation**, **brands**, **homepage shelves**, **category edit** (today a toast), **supplier CRUD**, **fleet (vans/drivers)**, **tax/legal entity settings**, **audit log** | "All admin functionalities" | Admin completeness |
| 1.12 | Admin: **food-information editor** (ingredients, 14 allergens, nutrition per 100 g/ml, producer/importer) | Legal fields (§2) | Selling food online |
| 1.13 | Customer: **data export** + **delete account**, **marketing consent toggles** | GDPR | Launch |
| 1.14 | **Write a review** form | Today a toast | Reviews |
| 1.15 | **Privacy policy, Terms, Cookie policy pages + cookie banner** | Footer links are `#privacy`, `#terms`, `#cookies` | Lawful data collection |
| 1.16 | **Returns & refunds request** (customer) | Footer `#returns` | Right to cancel |

## 2. Legally required data the frontend doesn't have (UK)

| Field | Frontend today | Needed |
|---|---|---|
| Ingredients list | none | per food product |
| 14 major allergens (contains / may contain) | none | structured, emphasised in ingredients |
| Nutrition declaration per 100 g/ml | 4 free-text strings (`'18 kcal / 100g'`); croissant is per portion | energy kJ + kcal, fat, saturates, carbohydrate, sugars, protein, salt |
| Food business operator (producer/importer) name + address | none | per product |
| Unit price (per kg / litre) | `£1.33 / kg` is the sale price, not a unit price; rice `5 kg` at £6.99 shows no `£1.40/kg` | computed from net quantity |
| Net quantity | mixed into `unit` (`'5 kg bag'`, `'2 portions (280g)'`) | numeric + unit |
| Returnable flag | none | `false` for perishables |
| Age restriction | none | per product, min age per country |
| VAT category | none (UI claims **everything** is 0 %) | per product, see §4.2 |
| Real reference price for "was/RRP" | `originalPrice` with no history | see §3.4 |

Products missing any mandatory food field are seeded with `is_complete = false` and flagged in
admin. Someone with the physical packs needs to fill them in, and I won't invent them.

## 3. Frontend contract changes I need (please approve)

| # | Change | Reason |
|---|---|---|
| 3.1 | Money becomes `{ amount: pence, currency }` everywhere | No floats for money |
| 3.2 | `Product` → `ProductSummary` / `ProductDetail` (API_CONTRACT §0, §2.4): `image` object, `category` object, `packSize`, `availability`, `rating {average,count}`, `foodInfo` | Legal fields + real stock |
| 3.3 | Category `itemCount: "180+ Items"` → `productCount: number`; `subcategories: string[]` → `children: Category[]` | Real counts; with 42 products the tiles will show small numbers, not "180+" |
| 3.4 | `originalPrice` → **`rrp`**, shown labelled "RRP". `wasPrice` only appears when a real, recorded price reduction exists | Seeding a fake "was" history would create false reference prices |
| 3.5 | `rating` / `reviewsCount` (e.g. 4.8 from 1,200 reviews) and the 4 "verified" testimonials are **mock, not real reviews**. Ratings are computed from approved reviews, and sample reviews are hidden in production | Showing invented reviews or ratings is a banned practice under the UK DMCC Act 2024 |
| 3.6 | Order statuses → backend state machine (API_CONTRACT §7.2); the admin "set any status" dropdown becomes "allowed next actions" | Brief's state machine + audit |
| 3.7 | Order reference: one format `VF-xxxxx` (checkout uses `FM-`) | Consistency |
| 3.8 | Brand filter becomes `brand=<slug>` (today the brand name goes into `search`) | Correct filtering |
| 3.9 | Shop `maxPrice` defaults to £25, which hides items over £25 (pressure cooker £64.99, idly pot £28.99) on first load | Frontend bug; API applies no price cap unless the client sends one |
| 3.10 | "Add card" form collects the raw card number → replace with the provider's hosted card field | We must never see card data |
| 3.11 | Receipt modal "Zero-Rated Food VAT (0%)" → real VAT breakdown from the invoice | Many products are standard-rated (§4.2) |
| 3.12 | Coupon logic leaves the client (`FRESH20` hard-coded with no minimum, while the voucher list says "min spend £40") | Server is the source of truth |
| 3.13 | Newsletter: the code is emailed after double opt-in instead of shown instantly | Consent proof (PECR) |
| 3.14 | `substitutePolicy: 'smart' \| 'strict'` → `'allow' \| 'dont_allow'` default + per-line toggle | Brief: per-line preference |
| 3.15 | Address `street` → `line1`/`line2`; `country` name → `countryCode` | Validation |
| 3.16 | Admin "switch role" dropdown removed | Permissions come from the logged-in staff member |
| 3.17 | Admin product form: image URL text field → file upload | Storage in the London region |

### Mock data inconsistencies (need your decision, Q5)
- **Three different category lists**: `categories.ts` (12 ids), product `category` values (6 ids not in that list: `dairy`, `meat`, `fruits`, `health-beauty`, `vegetables`, `kitchenwares`), and the admin form's departments (`vegetables`, `oils`, `rice`, `bakery`, `pantry`).
- Misfiled products: croissants, sourdough and focaccia under **Atta & Flours**; butter and eggs under **Vegetables & Fruits**.
- Admin inventory ids (`prod-basmati-rice`, …) don't match catalogue ids (`prod-6`, …).
- Brand names: "FreshMart" (localStorage keys, bakery/juicery origin, "Why FreshMart") vs "Varam Foods".
- Products have no `brand` field. Brands are only inferable from names, and some (MDH, Shana, Prestige, Himalaya, Parachute, Grand Sweets) aren't in the brand list.

### Found while migrating the mocks into Postgres (2026-11-21)
- Order VF-10944's customer "Kavita Nair" isn't in the customer list. She was created as a sample customer from the order's own details.
- Mock order totals don't match their own lines (VF-10948 says £48.75; its lines add up to £27.49). Sample orders were recomputed from their lines: items + £3.50 delivery under £50.
- Mock customer stats (`ordersCount`, `totalSpent`) are hard-coded. Admin now computes them from real orders, so sample customers show 1 order each.
- 3 inventory suppliers (Fortune Foods UK, GRB Dairy Products UK, ITC UK Imports) aren't in the supplier list, so those product↔supplier links weren't created. Add them in admin.
- Strawberries `unit: 'pack'` has no weight, so no unit price is possible until the net weight is entered.
- Croissant nutrition is per croissant, not per 100 g. It's kept as legacy text; the structured fields stay empty.
- Supplier contacts are flagged `contacts_verified = false`, and no PO email goes out until someone verifies them.
- The UK DMCC rule (§3.5) applies to the 4 testimonials. They're seeded as sample and hidden in production.

## 4. UK legal & tax points to confirm (flagged, not guessed)

The brief is written for the EU. The client is in the **UK**, which has its own regime since
Brexit. Each rule becomes config, and your accountant or lawyer confirms the values before launch.

| # | Topic | Brief (EU) | UK position to confirm |
|---|---|---|---|
| 4.1 | Food information | Reg. 1169/2011 | Retained in UK law + Food Information Regulations 2014. Same 14 allergens, info before purchase for distance selling. **In-house bakery and juicery items** (croissants, juices) may count as *prepacked for direct sale* (Natasha's Law: full ingredients + allergens on the label) |
| 4.2 | VAT | Reduced rate on food | Most food is **zero-rated (0 %)**, but **standard-rated (20 %)** applies to confectionery, crisps and savoury snacks, many drinks (juices, smoothies) and **all non-food** (kitchenware, pooja items, brass lamps, face wash, hair oil). The UI's "everything 0 %" is wrong for a big part of this catalogue. I'll seed a *proposed* category per product, marked unconfirmed. **Delivery-charge VAT** on mixed baskets needs the accountant |
| 4.3 | Invoices | Sequential per entity | HMRC VAT-invoice rules apply **if the business is VAT-registered** (Q8). Record retention is normally 6 years: confirm |
| 4.4 | Unit price | Price Indication Directive | **Price Marking Order 2004** (UK) applies |
| 4.5 | "Lowest price in last 30 days" | Omnibus Directive | **Not UK law.** UK uses CMA pricing guidance + DMCC Act 2024: reference prices must be genuine. Price history is kept either way. Whether to *display* the 30-day low is for your lawyer |
| 4.6 | Right of withdrawal | 14 days, perishables exempt | Consumer Contracts Regulations 2013: same structure |
| 4.7 | Deposits (Pfand) | Separate line | UK DRS for drinks containers is **planned, not live**. Modelled but switched off. Confirm the date and scope when relevant |
| 4.8 | Age-restricted goods | Alcohol / tobacco | UK adds **knives / bladed items** (Offensive Weapons Act 2019: special delivery rules), lighter refills, solvents, etc. **No age-restricted items in the current catalogue** (Q6) |
| 4.9 | GDPR | GDPR | **UK GDPR + DPA 2018**. Marketing messages: **PECR** (soft opt-in for existing customers may apply) |
| 4.10 | Strong Customer Authentication | PSD2 | UK FCA SCA rules. The payment provider handles 3DS2 |
| 4.11 | Reviews | (not in brief) | DMCC Act 2024 bans fake reviews and misleading review presentation (see §3.5) |
| 4.12 | Organic claims | — | Organic claims in GB need a control-body code (e.g. GB-ORG-xx). Field added, values needed |
