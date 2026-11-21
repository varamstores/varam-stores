# Varam Foods — Function Contract (v1)

There is no HTTP API server. Every handler is a **Postgres function in schema `api`**, called
from the frontend with `supabase-js`:

```ts
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { db: { schema: 'api' } });
const { data, error } = await db.rpc('list_products', { p_category: 'rice-millets', p_sort: 'price-asc' });
// error.message = stable code (e.g. 'SLOT_FULL'), error.details = JSON string, HTTP status from PTxxx
```

Derived from reading the whole frontend. **⚠ CHANGE** marks where the mock shape breaks a rule
(also listed in [GAPS.md](GAPS.md) §3, all approved).

## 0. Conventions

| Topic | Rule |
|---|---|
| Naming | `api.<verb>_<noun>`; arguments `p_<name>`; staff functions prefixed `admin_` or `staff_` |
| Access | Comment tag on each function: `@access anon` (anyone), `@access authenticated` (signed-in customer or staff), `@access staff` (staff; the function also checks a permission). Grants are generated from the tags |
| Money | `Money = { amount: integer /* pence */, currency: "GBP" }` ⚠ CHANGE from float pounds |
| Time | ISO-8601 UTC. Slots also carry `timezone: "Europe/London"` and `localLabel` |
| Pagination | `p_limit` (max 100) + `p_cursor` (opaque) → `{ items, nextCursor, total }` |
| Errors | `RAISE … ERRCODE 'PTxxx', MESSAGE '<CODE>', DETAIL '<json>'`. Codes in §12 |
| Idempotency | `p_idempotency_key uuid` **required** on place-order, capture, refund and payment-setup functions |
| Locale | `p_locale` optional, default `en-GB` |

### Shared types
```ts
type Money = { amount: number; currency: 'GBP' };
type Page<T> = { items: T[]; nextCursor: string | null; total: number };
type ImageRef = { url: string; alt: string };
type Allergen = 'celery'|'cereals_gluten'|'crustaceans'|'eggs'|'fish'|'lupin'|'milk'|'molluscs'|'mustard'|'tree_nuts'|'peanuts'|'sesame'|'soya'|'sulphites';
type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown_location';

type ProductSummary = {
  id: string; slug: string; legacyRef: string | null; name: string;
  brand: { slug: string; name: string } | null;
  category: { slug: string; name: string };
  image: ImageRef | null;
  price: Money;                 // VAT-inclusive, per sale unit (per kg for weight items)
  rrp: Money | null;            // ⚠ CHANGE: was originalPrice; label as "RRP"
  wasPrice: Money | null;       // only from real price history
  lowestPrice30d: Money | null;
  unitPrice: { price: Money; per: 'kg' | 'l' | 'each' } | null;
  saleUnit: 'each' | 'weight'; packSize: string; estimatedWeightGrams: number | null;
  badge: string | null; promotions: { id: string; label: string }[];
  isOrganic: boolean; ageRestriction: { minAge: number } | null;
  rating: { average: number | null; count: number };   // approved reviews only
  availability: Availability;   // ⚠ CHANGE: was inStock
};
type ProductDetail = ProductSummary & {
  description: string; gallery: ImageRef[]; origin: string | null; storage: string | null; sourcing: string | null;
  isReturnable: boolean; deposit: { label: string; amount: Money } | null;
  foodInfo: null | {
    ingredients: string | null; allergens: { contains: Allergen[]; mayContain: Allergen[] };
    nutrition: null | { basis: 'per_100g' | 'per_100ml'; energyKj: number | null; energyKcal: number | null;
      fat: number | null; saturates: number | null; carbohydrate: number | null; sugars: number | null;
      fibre: number | null; protein: number | null; salt: number | null };
    foodBusinessOperator: { name: string; address: string } | null; countryOfOrigin: string | null; isComplete: boolean;
  };
};
```

## 1. Health & config
| Function | Access | Returns |
|---|---|---|
| `api.health()` | anon | `{ status: 'ok', database: 'ok', serverTime, schemaVersion }` |
| `api.get_storefront_config()` | anon | `{ currency, locale, timezone, freeDeliveryThreshold: Money \| null, supportEmail, supportPhone }` (replaces `CartContext` constants) |

## 2. Catalogue
| Function | Access | Replaces |
|---|---|---|
| `api.list_categories(p_locale?)` | anon | `src/data/categories.ts`. Tree: `{ id, slug, name, tagline, badge, image, accentBg, accentColor, cardBg, showOnHomepage, productCount, children[] }` ⚠ CHANGE: `itemCount` string → `productCount`; `subcategories` strings → `children` |
| `api.get_category(p_slug)` | anon | |
| `api.list_brands(p_popular?, p_group?, p_q?)` | anon | `allBrands`, `popularBrands`, `brandGroups` → `{ id, slug, name, group, isPopular, logo, tagline }[]` |
| `api.list_marquee_brands()` | anon | `marqueeBrands` |
| `api.list_products(p_category?, p_brands?, p_q?, p_organic?, p_on_sale?, p_min_price?, p_max_price?, p_min_rating?, p_sort?, p_postcode?, p_limit?, p_cursor?)` | anon | Shop filters, identical to `NavigationContext`. `p_sort`: `featured`\|`price-asc`\|`price-desc`\|`rating`\|`name-asc`\|`name-desc`. Returns `Page<ProductSummary> & { facets }`. ⚠ CHANGE: brand is a real filter |
| `api.search_suggest(p_q, p_limit = 6)` | anon | Header dropdown → `{ products, categories, brands }` |
| `api.get_product(p_slug_or_legacy_ref)` | anon | `ProductDetail`. Accepts `prod-1` so old links keep working |
| `api.list_related_products(p_product_id, p_limit = 8)` | anon | Same-category list on the product page |
| `api.get_collection(p_code, p_limit?)` | anon | Homepage shelves: `fresh-picks`, `bakery-dairy`, `most-selling`, `pantry-superfoods` |
| `api.list_product_reviews(p_product_id, p_cursor?)` | anon | Approved only |
| `api.list_featured_reviews(p_limit?)` | anon | `TrustSection` testimonials. Sample reviews hidden in production |
| `api.submit_review(p_product_id, p_rating, p_body)` | authenticated | `isVerified` only with a delivered order containing the product; goes to moderation |

## 3. Delivery
| Function | Access | Returns |
|---|---|---|
| `api.check_postcode(p_postcode)` | anon | `{ postcode, deliverable, zone, minimumBasket, feeRules[], nextAvailableSlot, sameDayCutoffAt }` |
| `api.list_popular_areas()` | anon | Replaces `LocationModal.popularLocations` |
| `api.list_delivery_slots(p_postcode, p_from?, p_days = 7)` | anon | `Slot[] = { id, startsAt, endsAt, timezone, localLabel, serviceLabel, fee, availability, cutoffAt }` |

## 4. Auth (Supabase Auth, called directly via `supabase.auth.*`)
Sign up / sign in / sign out / reset / verify go through Supabase Auth itself. Two functions sit beside it:
| Function | Access | Purpose |
|---|---|---|
| `api.complete_signup(p_first_name, p_last_name, p_terms_version, p_accept_terms, p_marketing_email, p_marketing_sms)` | authenticated | Creates the customer profile and records T&C acceptance and marketing consent **separately**, timestamped |
| `api.get_session_context()` | authenticated | `{ kind: 'customer' \| 'staff' \| 'both', customer?: {…}, staff?: { role, permissions[] } }`. Drives admin portal access ⚠ CHANGE: role switcher removed |

## 5. Account
| Function | Access | Notes |
|---|---|---|
| `api.get_my_profile()` / `api.update_my_profile(p_first_name?, p_last_name?, p_phone?)` | authenticated | Phone stored E.164 |
| `api.get_my_preferences()` / `api.update_my_preferences(p jsonb)` | authenticated | `{ substitutionDefault: 'allow'\|'dont_allow', ripeness, smsDeliveryAlerts, emailInvoices, doorstepBell, ecoPackaging }` ⚠ CHANGE from smart/strict |
| `api.get_my_consents()` / `api.set_my_consent(p_purpose, p_granted)` | authenticated | Appends to the consent ledger |
| `api.list_my_addresses()` / `api.save_my_address(p jsonb)` / `api.delete_my_address(p_id)` / `api.set_default_address(p_id)` | authenticated | `{ label, fullName, line1, line2, city, postcode, countryCode, phone, deliveryNotes }` ⚠ CHANGE from `street`/`country` |
| `api.list_my_payment_methods()` / `api.create_card_setup(p_idempotency_key)` → `{ clientSecret }` / `api.remove_payment_method(p_id)` / `api.set_default_payment_method(p_id)` | authenticated | Stripe SetupIntent from Postgres. ⚠ CHANGE: no raw card form |
| `api.list_my_orders(p_state 'active'\|'past', p_cursor?)` / `api.get_my_order(p_order_number)` | authenticated | `OrderView` (§7) |
| `api.cancel_my_order(p_order_number)` | authenticated | Before cut-off and before `picking` |
| `api.reorder(p_order_number)` | authenticated | → `{ cart: CartView, skipped[] }` |
| `api.get_my_invoice(p_order_number)` / `api.list_my_credit_notes(p_order_number)` | authenticated | Invoice data; the browser renders the printable PDF ⚠ CHANGE: real VAT breakdown |
| `api.list_my_vouchers()` | authenticated | Replaces hard-coded vouchers |
| `api.get_my_loyalty()` / `api.list_loyalty_rewards()` (anon) / `api.redeem_loyalty_reward(p_reward_id)` | authenticated | |
| `api.list_my_wishlist()` / `api.add_to_wishlist(p_product_id)` / `api.remove_from_wishlist(p_product_id)` / `api.clear_my_wishlist()` / `api.merge_wishlist(p_product_ids uuid[] \| text[])` | authenticated | Replaces `WishlistContext` localStorage |
| `api.export_my_data()` | authenticated | Full JSON of the customer's personal data (the browser downloads it) |
| `api.delete_my_account(p_confirm text)` | authenticated | Anonymises the customer and deletes the auth user; orders/invoices kept for retention |

## 6. Cart & pricing
Guest carts are keyed by an opaque `p_cart_token` the browser keeps; signed-in carts by user.
| Function | Access |
|---|---|
| `api.get_cart(p_cart_token?)` | anon |
| `api.add_cart_item(p_cart_token?, p_product_id, p_quantity?, p_weight_grams?, p_substitution_allowed?)` | anon |
| `api.update_cart_item(p_cart_token?, p_line_id, p_quantity?, p_weight_grams?, p_substitution_allowed?)` | anon |
| `api.remove_cart_item(p_cart_token?, p_line_id)` / `api.clear_cart(p_cart_token?)` | anon |
| `api.apply_coupon(p_cart_token?, p_code)` / `api.remove_coupon(p_cart_token?)` | anon (rate-limited) |
| `api.set_cart_postcode(p_cart_token?, p_postcode)` | anon |
| `api.import_cart(p_cart_token?, p_items jsonb)` / `api.merge_guest_cart(p_cart_token)` | anon / authenticated |

Every function returns `CartView`:
```ts
type CartView = {
  id: string; cartToken: string | null; itemCount: number; currency: 'GBP';
  postcode: string | null; zone: { code: string; name: string } | null;
  lines: { id: string; product: ProductSummary; quantity: number; weightGrams: number | null;
    unitPrice: Money; lineSubtotal: Money; discount: Money; lineTotal: Money; deposit: Money | null;
    vatRateBp: number; substitutionAllowed: boolean; isEstimate: boolean }[];
  totals: { itemsSubtotal: Money; discountTotal: Money; depositTotal: Money; deliveryFee: Money; total: Money;
    isEstimate: boolean; vatBreakdown: { rateBp: number; net: Money; vat: Money; gross: Money }[] };
  appliedPromotions: { promotionId: string; label: string; code: string | null;
    type: 'percent_off'|'fixed_off'|'multibuy_x_for_y'|'multibuy_x_for_price'|'member_price'|'free_delivery';
    discount: Money; lineIds: string[] }[];
  coupon: { code: string; status: 'applied' | 'not_eligible'; reasonCode: string | null } | null;
  delivery: { freeDeliveryThreshold: Money | null; amountNeededForFreeDelivery: Money; minimumBasket: Money | null; minimumBasketMet: boolean };
  warnings: { code: 'PRICE_CHANGED' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NOT_DELIVERABLE'; lineId?: string }[];
};
```
Mapping from `CartContext`: `subtotal → totals.itemsSubtotal`, `discountAmount → totals.discountTotal`, `deliveryFee`, `total`, `freeDeliveryThreshold`, `amountNeededForFreeDelivery`, `appliedCoupon → coupon.code`.

## 7. Checkout & orders
```
api.start_checkout          → holds slot (slot_hold_minutes), re-prices, returns Checkout
api.update_checkout         → slot / address / notes / substitution default / date of birth
api.place_order             → [p_idempotency_key] reserve stock, create order (pending_payment),
                              Postgres → Stripe PaymentIntent (manual capture) → { orderNumber, clientSecret, mode }
  browser: stripe.confirmPayment(clientSecret)   (3DS, Apple Pay, Google Pay)
api.confirm_order_payment   → Postgres GETs the intent from Stripe, verifies it → order 'placed', slot booked,
                              confirmation queued in the outbox
pg_cron reconciler          → same check every minute for unfinished payments; expires stale ones
```
| Function | Access |
|---|---|
| `api.start_checkout(p_cart_token?, p_slot_id, p_address_id?, p_address jsonb?)` | authenticated (guest: D7) |
| `api.get_checkout(p_checkout_id)` / `api.update_checkout(p_checkout_id, p jsonb)` | owner |
| `api.place_order(p_checkout_id, p_idempotency_key, p_accept_terms, p_terms_version, p_save_payment_method?)` | owner |
| `api.confirm_order_payment(p_order_number)` | owner |
| `api.get_order_confirmation(p_order_number)` | owner |

Order statuses ⚠ CHANGE: `pending_payment → placed → picking → picked → paid → out_for_delivery → delivered`, plus `cancelled`, `partially_refunded`, `refunded`. Mapping from the admin mock: `pending→placed`, `packing→picking/picked/paid`, `in_transit→out_for_delivery`. Order numbers are always `VF-xxxxx` ⚠ CHANGE (checkout used `FM-`).

```ts
type OrderView = {
  orderNumber: string; status: string; placedAt: string; slot: Slot | null; address: Address;
  lines: { id: string; productId: string | null; name: string; image: ImageRef | null; packSize: string;
    quantityOrdered: number | null; weightOrderedGrams: number | null; quantityPicked: number | null; weightPickedGrams: number | null;
    status: 'pending'|'picked'|'short'|'substituted'|'missing'; substitutionAllowed: boolean; substituteFor: string | null;
    unitPrice: Money; estimatedTotal: Money; finalTotal: Money | null; vatRateBp: number }[];
  totals: { estimated: CartView['totals']; final: CartView['totals'] | null; authorised: Money; captured: Money | null; refunded: Money };
  payment: { method: 'card'|'apple_pay'|'google_pay'|null; brand: string | null; last4: string | null; status: string } | null;
  tracking: { vanLabel: string | null; driverFirstName: string | null; trackingCode: string | null; etaStart: string | null; etaEnd: string | null } | null;
  timeline: { status: string; at: string }[]; invoice: { number: string; issuedAt: string } | null;
  canCancel: boolean; canReorder: boolean;
};
```

## 8. Newsletter (double opt-in)
`api.subscribe_newsletter(p_email, p_source)` (anon, rate-limited, always succeeds) ·
`api.confirm_newsletter(p_token)` · `api.unsubscribe_newsletter(p_token)`.
⚠ CHANGE: the welcome code is emailed after confirmation instead of being shown instantly.

## 9. Staff operations (`@access staff`, permission checked inside)
| Function | Permission |
|---|---|
| `api.staff_picking_queue(p_location_id?, p_date?)` | `packing_queue` |
| `api.staff_start_picking(p_order_id)` | `packing_queue` |
| `api.staff_record_pick(p_order_id, p_line_id, p jsonb)` (qty/weight/status/substitute) | `barcode_picking` |
| `api.staff_complete_picking(p_order_id, p_idempotency_key)`: final total + Stripe capture ≤ authorised → `paid` + invoice | `packing_queue` |
| `api.staff_get_packing_slip(p_order_id)` | `packing_queue` |
| `api.staff_dispatch_order(p_order_id, p_van_id, p_driver_id)` | `orders_dispatch` |
| `api.staff_mark_delivered(p_order_id, p_id_checked)` | `orders_dispatch` |
| `api.staff_set_my_status(p_status)` | any staff |

## 10. Admin (`@access staff`, permission checked inside)
| Area | Functions | Permission |
|---|---|---|
| Analytics | `admin_analytics_summary(p_range)`, `admin_revenue_trend(p_range)`, `admin_category_share(p_range)`, `admin_top_products(p_range, p_limit)`. Computed, never stored | `financials` |
| Orders | `admin_list_orders(p_q, p_status, p_from, p_to, p_cursor)`, `admin_get_order(p_id)`, `admin_order_history(p_id)`, `admin_transition_order(p_id, p_to, p_reason)`, `admin_assign_order(p_id, p_van_id, p_driver_id)`, `admin_cancel_order(p_id, p_reason)` | `order_status` / `fleet_management` |
| Refunds | `admin_request_refund(p_order_id, p jsonb)`, `admin_list_refund_requests(p_status)`, `admin_approve_refund(p_request_id, p_idempotency_key)` | `refund_requests` / `financials` |
| Products | `admin_list_products(p_q, p_category, p_status, p_compliance, p_cursor)`, `admin_get_product`, `admin_save_product(p jsonb)`, `admin_archive_product`, `admin_set_price(p_product_id, p_price_minor, p_effective_from)`, `admin_price_history`, `admin_save_food_info(p_product_id, p jsonb)`, `admin_add_product_image` / `admin_remove_product_image` (file goes to Supabase Storage first) | `inventory` / `pricing` |
| Taxonomy | `admin_save_category`, `admin_delete_category`, `admin_reorder_categories`, `admin_save_brand`, `admin_save_collection(p_code, p_product_ids)` | `inventory` |
| Inventory | `admin_list_inventory(p_location_id, p_filter, p_q)`, `admin_adjust_stock(p_location_id, p_product_id, p_delta, p_reason)`, `admin_import_stock_csv(p_location_id, p_file_name, p_csv text)` (all-or-nothing, returns row errors), `admin_list_stock_movements` | `inventory` / `inventory_read` |
| Purchasing | `admin_save_supplier`, `admin_list_suppliers`, `admin_create_purchase_order(p jsonb)`, `admin_send_purchase_order`, `admin_receive_purchase_order(p_id, p_lines)`, `admin_cancel_purchase_order` | `inventory` |
| Customers | `admin_list_customers(p_q, p_status, p_cursor)`, `admin_get_customer`, `admin_update_customer(p_id, p_status, p_internal_notes)`, `admin_adjust_loyalty(p_customer_id, p_points, p_reason)` | `customer_messaging` / `financials` |
| Messaging | `admin_list_message_templates()`, `admin_send_customer_message(p_customer_id, p_channel, p_template_code, p_subject, p_body, p_order_id)` (marketing templates need consent → `CONSENT_MISSING`), `admin_list_customer_messages` | `customer_messaging` |
| Staff | `admin_list_staff()`, `admin_invite_staff(p_full_name, p_email, p_role)` (Postgres → Supabase Auth invite), `admin_update_staff(p_id, p_role, p_status)` (can't remove the last Store Manager), `admin_deactivate_staff`, `admin_list_roles()` | `user_management` |
| Promotions | `admin_list_promotions`, `admin_save_promotion(p jsonb)`, `admin_create_coupons(p_promotion_id, p_codes / p_count)`, `admin_preview_promotions(p_lines jsonb)` | `pricing` |
| Reviews | `admin_list_reviews(p_status)`, `admin_moderate_review(p_id, p_status)` | `customer_messaging` |
| Delivery | `admin_save_zone`, `admin_save_slot_template`, `admin_list_slots(p_zone_id, p_date)`, `admin_update_slot(p_id, p_capacity, p_status)`, `admin_save_van`, `admin_save_driver` | `fleet_management` |
| Finance | `admin_list_tax_rates`, `admin_add_tax_rate(…, p_confirmed_by)`, `admin_get_legal_entity` / `admin_save_legal_entity`, `admin_list_invoices`, `admin_list_credit_notes` | `financials` |
| System | `admin_get_settings` / `admin_update_setting(p_key, p_value)`, `admin_list_audit_log(p_entity, p_actor, p_cursor)`, `admin_list_newsletter_subscribers(p_status)`, `admin_list_outbox(p_status)` | `full_access` / `customer_messaging` |

## 11. Roles & permissions
| Role | Code | Permissions |
|---|---|---|
| Store Manager | `store_manager` | `full_access` (implies all) + `financials`, `user_management`, `pricing`, `inventory` |
| Dispatch Lead | `dispatch_lead` | `orders_dispatch`, `fleet_management`, `courier_routing`, `driver_chat`, `order_status` |
| Warehouse Picker | `warehouse_picker` | `inventory_read`, `barcode_picking`, `packing_queue` |
| Customer Support | `customer_support` | `customer_messaging`, `order_status`, `refund_requests` |

## 12. Error codes (`MESSAGE`; HTTP status via `PTxxx`)
| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_FAILED`, `QUANTITY_INVALID`, `POSTCODE_INVALID`, `PHONE_INVALID`, `CSV_INVALID`, `TERMS_NOT_ACCEPTED`, `TOKEN_INVALID`, `CART_EMPTY` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN`, `CONSENT_MISSING`, `UNDERAGE` |
| 404 | `NOT_FOUND`, `PRODUCT_NOT_FOUND` |
| 409 | `CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_STATUS_TRANSITION`, `SLOT_FULL`, `SLOT_HOLD_EXPIRED`, `INSUFFICIENT_STOCK`, `PRICE_CHANGED`, `ALREADY_REVIEWED`, `COUPON_USAGE_EXCEEDED`, `NEGATIVE_STOCK`, `LAST_STORE_MANAGER` |
| 422 | `PRODUCT_UNAVAILABLE`, `POSTCODE_NOT_SERVED`, `MINIMUM_BASKET_NOT_MET`, `SLOT_CUTOFF_PASSED`, `COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_NOT_ELIGIBLE`, `AGE_VERIFICATION_REQUIRED`, `ID_CHECK_REQUIRED`, `SUBSTITUTION_NOT_ALLOWED`, `NOT_PURCHASED`, `INSUFFICIENT_POINTS`, `UNKNOWN_SKU`, `ORDER_NOT_CANCELLABLE` |
| 402 | `PAYMENT_FAILED`, `PAYMENT_REQUIRES_ACTION` |
| 429 | `RATE_LIMITED` |
| 500 / 503 | `INTERNAL`, `DEPENDENCY_UNAVAILABLE` (Stripe/email unreachable), `CAPTURE_EXCEEDS_AUTHORISATION` |
