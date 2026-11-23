# Varam Foods — Data Model (DRAFT for approval)

Target: the Supabase Postgres project in **eu-west-2 (London)**. I checked it read-only on
2026-11-21: **Postgres 17.12**, `public` schema empty. `pg_trgm`, `btree_gist`, `citext`,
`unaccent` and `pg_cron` are available but not installed; `pgcrypto` and `uuid-ossp` are installed.

## 0. Ground rules

| Rule | How the schema enforces it |
|---|---|
| Money | `*_minor integer` + `currency char(3)` (ISO 4217, `CHECK (currency ~ '^[A-Z]{3}$')`). No `numeric`/`float` money anywhere |
| VAT rates | `rate_bp integer` in basis points (`2000` = 20.00 %). Rates live in `tax_rates`, keyed by country + tax category, effective-dated. Never in code |
| Weights | `*_grams integer` |
| Time | `timestamptz` (UTC). Local wall-clock only in slot templates (`time` + zone timezone) |
| IDs | `uuid` PK (`gen_random_uuid()`); human numbers (`VF-11001`, invoice numbers) are separate columns |
| History | Price history, stock movements, order status history, consents, loyalty and audit are **append-only ledgers** |
| Immutability | Issued invoices / credit notes: `BEFORE UPDATE OR DELETE` trigger raises |
| Sample data | Seeded rows carry `is_sample boolean NOT NULL DEFAULT false`. One command purges them before launch |
| Personal data | Only where needed; never in logs. Anonymisation path for every personal column (§12) |

### Security: the browser talks to Postgres through PostgREST
**Source of truth is the SQL in `backend/db/migrations/`.** This document summarises it.
- Tables live in schema **`app`**, which is **not exposed**. `anon`/`authenticated` have no `USAGE` on it.
- The only exposed schema is **`api`**, and it holds **functions only** (`SECURITY DEFINER`, `search_path = ''`).
- RLS is on for every `app` table with no policies (deny-all). Functions run as the table owner, so they bypass it, and nothing else gets in.
- `EXECUTE` is granted only from each function's `@access` tag. `PUBLIC` never gets `EXECUTE`.
- Emails and codes are stored normalised (`lower()` / `upper()` + `CHECK`) instead of `citext`.
- `customers.user_id` and `staff.user_id` are **nullable** FKs to `auth.users`. Sample people have no login, and an anonymised customer keeps the row with `user_id = NULL`.
- Payment webhooks are replaced by `payment_sync_log` (each Stripe call and verification result, no personal data).

---

## 1. Reference & configuration

```text
countries        (code char(2) PK 'GB', name, currency char(3), timezone 'Europe/London', is_active)
legal_entities   (id, name, company_number, vat_number NULL, registered_address jsonb,
                  country_code FK, invoice_prefix 'VF-INV', credit_note_prefix 'VF-CN', is_active)
document_sequences (legal_entity_id FK, doc_type 'invoice'|'credit_note', next_number bigint,
                  PK(legal_entity_id, doc_type))          -- gapless: row-locked in the issuing txn
tax_categories   (code PK 'zero_food'|'standard'|'reduced'|…, name, description)
tax_rates        (id, country_code FK, tax_category_code FK, rate_bp int CHECK 0..10000,
                  valid_from timestamptz, valid_to timestamptz NULL,
                  confirmed_by text NULL, confirmed_at NULL, note,
                  EXCLUDE USING gist (country_code WITH =, tax_category_code WITH =,
                                      tstzrange(valid_from, valid_to) WITH &&))   -- no overlaps
deposit_schemes  (code PK, country_code FK, name, amount_minor, currency, tax_category_code FK,
                  is_active, valid_from, valid_to)       -- UK DRS modelled, inactive (GAPS §4)
age_restriction_rules (country_code FK, restriction_code 'alcohol'|'tobacco'|'knives'|…,
                  min_age smallint, id_check_on_delivery bool, PK(country_code, restriction_code))
app_settings     (key PK, value jsonb, description, updated_by, updated_at)
  -- slot_hold_minutes, weighted_auth_buffer_bp, card_auth_validity_hours,
  -- authorise_before_picking_hours, low_stock_threshold_default, review_auto_publish, …
locales          (code PK 'en-GB', is_default)
```

## 2. Catalogue

```text
categories       (id, slug UNIQUE, parent_id FK NULL → categories, position int,
                  image_url, accent_bg, accent_color, card_bg, badge, is_active, is_sample)
category_translations (category_id FK, locale FK, name, tagline, PK(category_id, locale))

brands           (id, slug UNIQUE, name, logo_url NULL, tagline NULL, is_popular bool,
                  marquee_position int NULL, is_active, is_sample)

products         (id, slug UNIQUE, legacy_ref text UNIQUE NULL  -- 'prod-1' (old URLs)
                  sku text UNIQUE, brand_id FK NULL, primary_category_id FK,
                  status 'draft'|'active'|'archived',
                  tax_category_code FK,
                  sale_unit 'each'|'weight',
                  pack_size_label text           -- '5 kg bag'
                  net_quantity numeric(10,3) NULL, net_quantity_unit 'g'|'kg'|'ml'|'l'|'piece' NULL,
                  unit_price_basis 'kg'|'l'|'100g'|'100ml'|'each' NULL,
                  estimated_weight_grams int NULL      -- weight items: typical pick
                  min_weight_grams int NULL, weight_step_grams int NULL,
                  max_per_order int NULL,
                  rrp_minor int NULL, currency char(3)  -- manufacturer RRP (mock `originalPrice`)
                  is_organic bool, organic_certifier_code text NULL,
                  is_perishable bool, is_returnable bool,
                  age_restriction_code text NULL, deposit_scheme_code FK NULL,
                  is_food bool,
                  badge text NULL, origin_text text NULL,
                  rating_avg numeric(3,2) NULL, rating_count int DEFAULT 0  -- cache, from approved reviews only
                  search_vector tsvector GENERATED   -- name + brand + category + description, GIN index
                  created_at, updated_at, published_at, is_sample)
  CHECK (sale_unit <> 'weight' OR estimated_weight_grams IS NOT NULL)
  CHECK (is_perishable = false OR is_returnable = false)
product_translations (product_id FK, locale FK, name, description, storage_text, sourcing_text,
                  PK(product_id, locale))            -- trigram index on name
product_categories (product_id FK, category_id FK, PK(product_id, category_id))  -- incl. subcategories
product_images   (id, product_id FK, storage_path, alt, position, UNIQUE(product_id, position))

product_prices   (id, product_id FK, price_list 'base'|'member',
                  amount_minor int CHECK > 0, currency char(3),
                  valid_from timestamptz, valid_to timestamptz NULL,
                  set_by uuid NULL, reason text,
                  EXCLUDE USING gist (product_id WITH =, price_list WITH =,
                                      tstzrange(valid_from, valid_to) WITH &&))
  -- current price = row whose range contains now(); lowest-30-day = min over the window

allergens        (code PK — the 14: celery, cereals_gluten, crustaceans, eggs, fish, lupin, milk,
                  molluscs, mustard, tree_nuts, peanuts, sesame, soya, sulphites)
product_food_info (product_id PK FK, ingredients_text NULL (per locale via translations),
                  nutrition_basis 'per_100g'|'per_100ml' NULL,
                  energy_kj, energy_kcal, fat_g, saturates_g, carbohydrate_g, sugars_g,
                  fibre_g NULL, protein_g, salt_g          -- numeric(7,2) NULL each
                  fbo_name, fbo_address, country_of_origin,
                  is_complete bool GENERATED   -- all mandatory fields present
                  reviewed_by, reviewed_at)
product_allergens (product_id FK, allergen_code FK, presence 'contains'|'may_contain',
                  PK(product_id, allergen_code))

collections      (id, code UNIQUE 'fresh-picks'|'bakery-dairy'|'most-selling'|'pantry-superfoods',
                  title, is_active)
collection_items (collection_id FK, product_id FK, position, PK(collection_id, product_id))

reviews          (id, product_id FK NULL          -- NULL = store testimonial (TrustSection)
                  customer_id FK NULL, order_id FK NULL,
                  display_name, location_label, avatar_url NULL,
                  rating smallint CHECK 1..5, body,
                  is_verified bool               -- true only if order_id is a delivered order with the product
                  status 'pending'|'approved'|'rejected', moderated_by, moderated_at,
                  created_at, is_sample,
                  UNIQUE(product_id, customer_id))
```

## 3. Locations, stock, suppliers

```text
fulfilment_locations (id, code UNIQUE, name, type 'store'|'warehouse'|'dark_store',
                  address jsonb, postcode, timezone, is_active, is_sample)

stock_levels     (location_id FK, product_id FK,
                  on_hand int CHECK >= 0, reserved int CHECK >= 0,
                  reorder_point int, optimal_stock int, unit_cost_minor int NULL,
                  last_restocked_at, updated_at,
                  PK(location_id, product_id),
                  CHECK (reserved <= on_hand))          -- NEVER OVERSELL, enforced by the DB
  -- unit: pieces for 'each'; grams for 'weight'
stock_movements  (id, location_id, product_id, delta int,
                  reason 'csv_import'|'adjustment'|'restock'|'po_receipt'|'order_reserve'|
                         'order_release'|'pick'|'return'|'write_off',
                  ref_type, ref_id, actor_id NULL, note, created_at)   -- append-only
stock_imports    (id, location_id, file_name, uploaded_by, status 'pending'|'applied'|'failed',
                  rows_total, rows_applied, errors jsonb, created_at, applied_at)

suppliers        (id, code UNIQUE 'SUP-01', name, category, lead_time_days, contact_person,
                  email, phone_e164, rating numeric(2,1), is_active, is_sample)
product_suppliers (product_id, supplier_id, supplier_sku, unit_cost_minor, is_primary,
                  PK(product_id, supplier_id))
purchase_orders  (id, number UNIQUE 'PO-00001', supplier_id, location_id,
                  status 'draft'|'sent'|'partially_received'|'received'|'cancelled',
                  expected_at, notes, total_minor, currency, created_by, created_at)
purchase_order_lines (id, purchase_order_id, product_id, quantity_ordered, quantity_received,
                  unit_cost_minor)
```

## 4. Identity, customers, staff

`user_id` below is the identity id. If decision D2 = Supabase Auth, that's `auth.users.id` and
passwords never touch our tables. If D2 = own auth, a `credentials(user_id, password_hash argon2id,
…)` + `sessions` pair is added.

```text
customers        (id uuid PK (= user_id), email citext UNIQUE, first_name, last_name,
                  phone_e164 NULL, status 'active'|'vip'|'flagged', internal_notes NULL,
                  payment_customer_ref NULL      -- provider customer id
                  member_since, email_verified_at,
                  anonymised_at NULL, created_at, updated_at, is_sample)
customer_preferences (customer_id PK, substitution_default 'allow'|'dont_allow',
                  ripeness 'ready'|'shelf_life', sms_delivery_alerts, email_invoices,
                  doorstep_bell, eco_packaging)
addresses        (id, customer_id, label, full_name, line1, line2, city, postcode, country_code,
                  phone_e164 NULL, delivery_notes, is_default, deleted_at, created_at)
                  UNIQUE (customer_id) WHERE is_default AND deleted_at IS NULL
payment_methods  (id, customer_id, provider, provider_ref UNIQUE, brand, last4, exp_month,
                  exp_year, wallet NULL, is_default, created_at, detached_at)   -- tokens only
wishlist_items   (customer_id, product_id, created_at, PK(customer_id, product_id))

consents         (id, customer_id NULL, email citext NULL,
                  purpose 'terms'|'privacy'|'marketing_email'|'marketing_sms'|'marketing_whatsapp',
                  granted bool, document_version text NULL,
                  source 'register'|'checkout'|'account'|'newsletter_footer'|'newsletter_home',
                  created_at)                      -- append-only; current = latest per purpose
newsletter_subscribers (id, email citext UNIQUE, status 'pending'|'subscribed'|'unsubscribed',
                  confirm_token_hash, unsubscribe_token_hash, confirmed_at, unsubscribed_at, source)
data_export_requests (id, customer_id, status, storage_path, requested_at, completed_at, expires_at)

roles            (code PK 'store_manager'|'dispatch_lead'|'warehouse_picker'|'customer_support', name)
permissions      (code PK, description)
role_permissions (role_code FK, permission_code FK, PK both)
staff            (id uuid PK (= user_id), email citext UNIQUE, full_name, role_code FK,
                  status 'active'|'on_break'|'offline'|'deactivated',
                  last_active_at, invited_by, created_at, is_sample)
staff_invitations (id, email, full_name, role_code, token_hash, invited_by, expires_at, accepted_at)
```

## 5. Loyalty

```text
loyalty_tiers    (code PK, name 'Gold'|'VIP'…, min_lifetime_points, earn_multiplier_bp)
loyalty_accounts (customer_id PK, points_balance int CHECK >= 0, lifetime_points, tier_code FK)
loyalty_transactions (id, customer_id, points int, reason 'order_earn'|'redeem'|'reversal'|
                  'adjustment'|'expiry', order_id NULL, created_by NULL, created_at)  -- append-only
loyalty_rewards  (id, title, points_cost, promotion_id FK, is_active)   -- issues a coupon
```
All earn/burn rules (points per £, eligible categories, point value) live in `app_settings`
and need your confirmation (PLAN.md Q9).

## 6. Promotions

```text
promotions       (id, name, label (customer-facing),
                  type 'percent_off'|'fixed_off'|'multibuy_x_for_y'|'multibuy_x_for_price'|
                       'member_price'|'free_delivery',
                  scope 'basket'|'targets',
                  percent_bp NULL, amount_minor NULL, buy_qty NULL, pay_qty NULL, bundle_price_minor NULL,
                  min_basket_minor NULL, max_discount_minor NULL,
                  requires_coupon bool, first_order_only bool, members_only bool,
                  stackable bool, priority int,          -- deterministic order: (priority, id)
                  starts_at, ends_at NULL, usage_limit_total NULL, usage_limit_per_customer NULL,
                  status 'draft'|'active'|'paused'|'ended', created_by, created_at, is_sample)
promotion_targets (promotion_id, target_type 'product'|'category'|'brand', target_id,
                  PK all three)
coupons          (id, promotion_id FK, code citext UNIQUE, max_uses NULL, used_count,
                  customer_id NULL (single-customer codes), starts_at, ends_at, is_active)
promotion_redemptions (id, promotion_id, coupon_id NULL, order_id, customer_id NULL,
                  discount_minor, created_at)
```
Promotions **never** apply to deposit lines (enforced in the pricing engine, and checked again on
`order_lines`: `CHECK (line_type <> 'deposit' OR discount_minor = 0)`).

## 7. Delivery & fleet

```text
delivery_zones   (id, code UNIQUE, name, display_label 'Hatfield, AL10', location_id FK,
                  min_basket_minor NULL, currency, is_popular bool, is_active, is_sample)
delivery_zone_postcodes (zone_id FK, postcode_prefix text UNIQUE  -- 'AL10' or sector 'AL10 9'
                  )                                -- longest-prefix match wins
delivery_fee_rules (id, zone_id, from_basket_minor, fee_minor, valid_from, valid_to)
                  -- [0 → £3.50], [£50 → £0] from CartContext constants
slot_templates   (id, zone_id, weekday smallint 0..6, start_local time, end_local time,
                  capacity int, cutoff_minutes_before int, service_label 'Evening Express',
                  fee_minor NULL, is_active)
delivery_slots   (id, zone_id, starts_at, ends_at, cutoff_at, capacity int,
                  reserved_count int DEFAULT 0, service_label, fee_minor NULL,
                  status 'open'|'closed',
                  UNIQUE(zone_id, starts_at),
                  CHECK (reserved_count >= 0 AND reserved_count <= capacity))  -- holds + bookings
slot_reservations (id, slot_id, cart_id NULL, order_id NULL,
                  status 'held'|'booked'|'released'|'expired', expires_at NULL, created_at)
  -- hold:  UPDATE delivery_slots SET reserved_count = reserved_count + 1
  --        WHERE id = $1 AND reserved_count < capacity AND now() < cutoff_at RETURNING …
  -- expiry worker releases 'held' rows past expires_at and decrements in the same txn

vans             (id, code '#04', name 'Hatfield Express', is_refrigerated, location_id, is_active, is_sample)
drivers          (id, display_name 'David M.', phone_e164 NULL, staff_id NULL, is_active, is_sample)
```

## 8. Carts

```text
carts            (id, customer_id NULL, guest_token_hash NULL, currency, postcode NULL,
                  zone_id NULL, coupon_code citext NULL,
                  status 'active'|'converted'|'abandoned', created_at, updated_at, expires_at,
                  UNIQUE (customer_id) WHERE status = 'active')
cart_items       (id, cart_id, product_id, quantity int NULL, weight_grams int NULL,
                  substitution_allowed bool, added_at,
                  UNIQUE(cart_id, product_id),
                  CHECK ((quantity IS NOT NULL) <> (weight_grams IS NOT NULL)))
checkouts        (id, cart_id, customer_id NULL, guest_email NULL, slot_reservation_id,
                  address_snapshot jsonb, dob_confirmed_at NULL,
                  status 'open'|'placed'|'expired', expires_at, created_at)
```
Cart totals are **not stored**; they're computed on read by the pricing engine. The order
snapshots them.

## 9. Orders

```text
orders           (id, number text UNIQUE 'VF-11001'   -- sequence starts above the mock max (VF-10948)
                  customer_id NULL, legal_entity_id, location_id, zone_id, slot_id,
                  status order_status, currency,
                  contact_email, contact_phone_e164, address_snapshot jsonb, delivery_notes,
                  substitution_default,
                  age_check_required bool, min_age smallint NULL,
                  id_check_required_on_delivery bool, id_checked_at NULL, id_checked_by NULL,
                  -- estimate at placement
                  est_items_minor, est_discount_minor, est_deposit_minor, delivery_fee_minor,
                  est_total_minor, est_vat_minor,
                  -- after picking
                  final_items_minor NULL, final_discount_minor NULL, final_deposit_minor NULL,
                  final_total_minor NULL, final_vat_minor NULL,
                  authorised_minor int, captured_minor int NULL, refunded_minor int DEFAULT 0,
                  van_id NULL, driver_id NULL, tracking_code NULL, eta_start NULL, eta_end NULL,
                  placed_at, picked_at, paid_at, dispatched_at, delivered_at, cancelled_at,
                  cancel_reason, created_at, updated_at, is_sample,
                  CHECK (captured_minor IS NULL OR captured_minor <= authorised_minor),  -- never over-capture
                  CHECK (refunded_minor <= COALESCE(captured_minor, 0)))
  order_status = pending_payment | placed | picking | picked | paid | out_for_delivery |
                 delivered | cancelled | partially_refunded | refunded

order_lines      (id, order_id, line_no, line_type 'product'|'deposit'|'delivery',
                  parent_line_id NULL          -- deposit → its product line
                  substitute_for_line_id NULL  -- substitution → original line
                  product_id NULL, name_snapshot, sku_snapshot, pack_size_snapshot,
                  sale_unit, quantity_ordered NULL, weight_ordered_grams NULL,
                  quantity_picked NULL, weight_picked_grams NULL,
                  unit_price_minor            -- per piece, or per kg for weight items
                  est_gross_minor, final_gross_minor NULL,
                  discount_minor int DEFAULT 0,
                  tax_category_code, vat_rate_bp,          -- COPIED at order time
                  est_vat_minor, final_vat_minor NULL,     -- per line, see PLAN §5.1
                  substitution_allowed bool,
                  pick_status 'pending'|'picked'|'short'|'substituted'|'missing',
                  picked_by NULL, picked_at NULL,
                  UNIQUE(order_id, line_no))
order_line_promotions (order_line_id, promotion_id, discount_minor, PK both)
order_status_history (id, order_id, from_status NULL, to_status,
                  actor_type 'customer'|'staff'|'system'|'payment_webhook', actor_id NULL,
                  reason NULL, created_at)                  -- append-only
idempotency_keys (key uuid, scope text  -- route + principal
                  request_hash, status 'in_progress'|'completed', response_code, response_body jsonb,
                  created_at, expires_at, PK(scope, key))
```

## 10. Payments, refunds, documents

```text
payments         (id, order_id, provider, provider_intent_ref UNIQUE,
                  kind 'authorise_now'|'authorise_later',
                  status 'requires_action'|'authorised'|'captured'|'partially_captured'|
                         'voided'|'failed'|'expired',
                  amount_authorised_minor, amount_captured_minor NULL, currency,
                  payment_method_snapshot jsonb     -- brand, last4, wallet
                  authorised_at, auth_expires_at, captured_at, failure_code, created_at)
refund_requests  (id, order_id, requested_by, lines jsonb | amount_minor, reason,
                  status 'pending'|'approved'|'rejected'|'processed', approved_by, created_at)
refunds          (id, payment_id, refund_request_id, provider_refund_ref UNIQUE, amount_minor,
                  status, credit_note_id, created_at)
payment_webhook_events (provider, event_id, type, payload jsonb, received_at, processed_at,
                  status 'received'|'processed'|'failed', error, PK(provider, event_id))  -- dedupe

invoices         (id, legal_entity_id, number UNIQUE per entity, order_id UNIQUE, issued_at,
                  currency, seller_snapshot jsonb, buyer_snapshot jsonb,
                  net_minor, vat_minor, gross_minor, vat_breakdown jsonb, storage_path)
invoice_lines    (invoice_id, line_no, description, quantity, unit_price_minor, vat_rate_bp,
                  net_minor, vat_minor, gross_minor, PK(invoice_id, line_no))
credit_notes     (id, legal_entity_id, number UNIQUE per entity, invoice_id FK, refund_id,
                  issued_at, reason, net_minor, vat_minor, gross_minor, vat_breakdown jsonb)
credit_note_lines (credit_note_id, line_no, invoice_line_no NULL, …same money columns…)
  -- invoices, invoice_lines, credit_notes, credit_note_lines: UPDATE/DELETE blocked by trigger
```

## 11. Messaging, jobs, audit

```text
message_templates (code, channel 'email'|'sms'|'whatsapp', locale, is_marketing bool,
                  subject NULL, body, PK(code, channel, locale))
                  -- eta_update, sub_query, vip_offer (marketing), order_confirmation,
                  --    order_dispatched, password_reset, staff_invite, newsletter_confirm, …
outbound_messages (id, customer_id NULL, order_id NULL, channel, template_code, to_address,
                  subject, body, status 'queued'|'sent'|'failed', provider_ref, sent_by NULL,
                  created_at, sent_at, error)
audit_log        (id, actor_type, actor_id, action, entity_type, entity_id,
                  changes jsonb  -- field names + old/new for non-personal fields only
                  created_at)                                  -- append-only
-- background jobs: queue tables are created by the job library (decision D4)
```

## 12. Account deletion (anonymisation)

`DELETE /v1/me` runs in one transaction:
- `customers`: email → `deleted+<id>@invalid`, names → `Deleted`, phone/notes → NULL, `anonymised_at = now()`.
- `addresses`, `payment_methods` (detached at the provider), `wishlist_items`, `carts`, `consents` (marketing), `newsletter_subscribers`: deleted.
- `orders`, `order_lines`, `invoices`, `credit_notes`: **kept** (tax retention). Personal fields on `orders` (`contact_*`, `address_snapshot`) are scrubbed to the postcode district once the retention rule allows. The invoice buyer snapshot stays as legally required; your accountant confirms the period (GAPS §4).
- `reviews`: `display_name` → "Former customer", `customer_id` → NULL.
- An audit entry is written with no personal data.

---

## 13. Frontend mock → database (everything moves to Postgres)

| Frontend source | Records | Target tables | Notes |
|---|---|---|---|
| `src/data/products.ts` (removed 2026-11-23 — the data lives only in Postgres now) | 42 products | `products`, `product_translations`, `product_images`, `product_prices`, `product_food_info`, `product_categories`, `collection_items` | `price` → current base price; `originalPrice` → `rrp_minor` (not fake history); `unit` → `pack_size_label`; `nutrition` strings parsed to numbers (incomplete → `is_complete=false`); `id` → `legacy_ref` |
| homepage arrays in `products.ts` | 4 shelves | `collections`, `collection_items` | `freshPicks`, `bakeryDairy`, `mostSelling`, `pantrySuperfood` |
| `src/data/categories.ts` | 12 + 55 subcategories | `categories` (parent/child), `category_translations` | `itemCount` dropped (computed) |
| `src/data/brands.ts` | 94 unique brands, 22 with logos | `brands` | Product → brand link inferred from names where the brand exists |
| `src/data/reviews.ts` | 4 | `reviews` (`is_sample`, `product_id NULL`) | Not shown publicly in production (GAPS §3.5) |
| `adminMockData.initialOrders` | 6 orders | `orders`, `order_lines`, `order_status_history`, `payments` | Sample; no real provider refs; numbers kept (`VF-10943…10948`) |
| `adminMockData.initialCustomers` | 6 | `customers`, `addresses`, `loyalty_accounts` | Sample; emails rewritten to `@example.com`, phones to the Ofcom drama range |
| `adminMockData.initialStaff` | 5 | `staff`, `roles`, `role_permissions` | Sample staff have no login; real staff are invited |
| `adminMockData.initialInventory` | 7 | `stock_levels`, `product_suppliers` | Mock product ids don't match the catalogue; matched by name |
| `adminMockData.initialSuppliers` | 4 | `suppliers` | |
| `weeklyRevenueData`, `categorySalesDistribution` | — | **not seeded** | Computed from orders (views) |
| `UserAccountPage` vouchers + `CartContext` `FRESH20` + admin template `VARAM20` + loyalty reward | 5 | `promotions`, `coupons`, `loyalty_rewards` | Rules need confirming (PLAN Q10) |
| `LocationModal` hubs + slots, `CartContext` fee/threshold | 5 areas, 3 slot types | `delivery_zones`, `delivery_zone_postcodes`, `slot_templates`, `delivery_fee_rules` | Capacities/cut-offs need confirming (PLAN Q4) |
| Admin van list, drivers in orders | 3 vans, drivers | `vans`, `drivers` | |
| Admin message templates | 3 | `message_templates` | |
| `UserAccountPage` profile / addresses / cards / orders | — | **not seeded** | Comes from the signed-in account; cards only via the payment provider |
| `Product.rating`, `Product.reviewsCount` | — | **not seeded** | Computed from approved reviews (GAPS §3.5) |
