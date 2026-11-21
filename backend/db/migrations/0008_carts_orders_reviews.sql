-- 0008 Carts, checkouts, orders + lines (VAT copied per line), status history,
--      idempotency keys, promotion redemptions, reviews.

create table app.carts (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid references app.customers (id) on delete cascade,
  guest_token_hash text unique,
  currency         char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  postcode         text,
  zone_id          uuid references app.delivery_zones (id),
  coupon_code      text check (coupon_code = upper(coupon_code)),
  status           text not null default 'active' check (status in ('active', 'converted', 'abandoned')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz,
  check (customer_id is not null or guest_token_hash is not null)
);
create unique index carts_one_active_per_customer on app.carts (customer_id) where status = 'active' and customer_id is not null;
create trigger carts_touch before update on app.carts
  for each row execute function app.touch_updated_at();

create table app.cart_items (
  id                   uuid primary key default gen_random_uuid(),
  cart_id              uuid not null references app.carts (id) on delete cascade,
  product_id           uuid not null references app.products (id),
  quantity             integer check (quantity > 0),
  weight_grams         integer check (weight_grams > 0),
  substitution_allowed boolean not null default true,
  added_at             timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (cart_id, product_id),
  check ((quantity is null) <> (weight_grams is null))
);
create trigger cart_items_touch before update on app.cart_items
  for each row execute function app.touch_updated_at();

create table app.checkouts (
  id                   uuid primary key default gen_random_uuid(),
  cart_id              uuid not null references app.carts (id) on delete cascade,
  customer_id          uuid references app.customers (id) on delete cascade,
  slot_reservation_id  uuid references app.slot_reservations (id),
  address_snapshot     jsonb,
  delivery_notes       text check (length(delivery_notes) <= 500),
  substitution_default text check (substitution_default in ('allow', 'dont_allow')),
  dob_confirmed_at     timestamptz,
  status               text not null default 'open' check (status in ('open', 'placed', 'expired', 'abandoned')),
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger checkouts_touch before update on app.checkouts
  for each row execute function app.touch_updated_at();

create sequence app.order_number_seq start 11001;

create table app.orders (
  id                            uuid primary key default gen_random_uuid(),
  number                        text not null unique default ('VF-' || nextval('app.order_number_seq')::text)
                                check (number ~ '^VF-[0-9]{5,}$'),
  customer_id                   uuid references app.customers (id),
  legal_entity_id               uuid references app.legal_entities (id),
  location_id                   uuid references app.fulfilment_locations (id),
  zone_id                       uuid references app.delivery_zones (id),
  slot_id                       uuid references app.delivery_slots (id),
  checkout_id                   uuid references app.checkouts (id),
  status                        text not null default 'pending_payment' check (status in (
                                  'pending_payment', 'placed', 'picking', 'picked', 'paid',
                                  'out_for_delivery', 'delivered', 'cancelled', 'partially_refunded', 'refunded')),
  currency                      char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  contact_email                 text check (contact_email = lower(contact_email)),
  contact_phone_e164            text check (contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  address_snapshot              jsonb not null,
  delivery_notes                text,
  substitution_default          text not null default 'allow' check (substitution_default in ('allow', 'dont_allow')),
  age_check_required            boolean not null default false,
  min_age                       smallint check (min_age between 1 and 99),
  id_check_required_on_delivery boolean not null default false,
  id_checked_at                 timestamptz,
  id_checked_by                 uuid references app.staff (id),
  est_items_minor               integer not null check (est_items_minor >= 0),
  est_discount_minor            integer not null default 0 check (est_discount_minor >= 0),
  est_deposit_minor             integer not null default 0 check (est_deposit_minor >= 0),
  delivery_fee_minor            integer not null default 0 check (delivery_fee_minor >= 0),
  est_total_minor               integer not null check (est_total_minor >= 0),
  est_vat_minor                 integer not null check (est_vat_minor >= 0),
  final_items_minor             integer check (final_items_minor >= 0),
  final_discount_minor          integer check (final_discount_minor >= 0),
  final_deposit_minor           integer check (final_deposit_minor >= 0),
  final_total_minor             integer check (final_total_minor >= 0),
  final_vat_minor               integer check (final_vat_minor >= 0),
  authorised_minor              integer not null default 0 check (authorised_minor >= 0),
  captured_minor                integer check (captured_minor >= 0),
  refunded_minor                integer not null default 0 check (refunded_minor >= 0),
  van_id                        uuid references app.vans (id),
  driver_id                     uuid references app.drivers (id),
  tracking_code                 text,
  eta_start                     timestamptz,
  eta_end                       timestamptz,
  placed_at                     timestamptz,
  picked_at                     timestamptz,
  paid_at                       timestamptz,
  dispatched_at                 timestamptz,
  delivered_at                  timestamptz,
  cancelled_at                  timestamptz,
  cancel_reason                 text,
  is_sample                     boolean not null default false,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint orders_never_overcapture check (captured_minor is null or captured_minor <= authorised_minor),
  constraint orders_refund_within_capture check (refunded_minor <= coalesce(captured_minor, 0)),
  check (est_discount_minor <= est_items_minor),
  check (est_total_minor = est_items_minor - est_discount_minor + est_deposit_minor + delivery_fee_minor),
  check (final_total_minor is null
         or final_total_minor = final_items_minor - coalesce(final_discount_minor, 0) + coalesce(final_deposit_minor, 0) + delivery_fee_minor),
  check (is_sample or (slot_id is not null and zone_id is not null and location_id is not null)),
  check (is_sample or contact_email is not null),
  check (not age_check_required or min_age is not null),
  check (status not in ('out_for_delivery', 'delivered') or captured_minor is not null),
  check (status <> 'delivered' or not id_check_required_on_delivery or id_checked_at is not null)
);
comment on constraint orders_never_overcapture on app.orders is 'Never capture more than was authorised.';
create index orders_customer_idx on app.orders (customer_id, created_at desc);
create index orders_status_idx on app.orders (status, created_at desc);
create index orders_slot_idx on app.orders (slot_id);
create trigger orders_touch before update on app.orders
  for each row execute function app.touch_updated_at();

create table app.order_lines (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid     not null references app.orders (id) on delete cascade,
  line_no                smallint not null check (line_no >= 1),
  line_type              text     not null check (line_type in ('product', 'deposit', 'delivery')),
  parent_line_id         uuid references app.order_lines (id),
  substitute_for_line_id uuid references app.order_lines (id),
  product_id             uuid references app.products (id),
  name_snapshot          text     not null,
  sku_snapshot           text,
  pack_size_snapshot     text,
  sale_unit              text check (sale_unit in ('each', 'weight')),
  quantity_ordered       integer check (quantity_ordered > 0),
  weight_ordered_grams   integer check (weight_ordered_grams > 0),
  quantity_picked        integer check (quantity_picked >= 0),
  weight_picked_grams    integer check (weight_picked_grams >= 0),
  unit_price_minor       integer  not null check (unit_price_minor >= 0),
  est_gross_minor        integer  not null check (est_gross_minor >= 0),
  est_discount_minor     integer  not null default 0 check (est_discount_minor >= 0),
  final_gross_minor      integer check (final_gross_minor >= 0),
  final_discount_minor   integer check (final_discount_minor >= 0),
  tax_category_code      text     not null references app.tax_categories (code),
  vat_rate_bp            integer  not null check (vat_rate_bp between 0 and 10000),
  est_vat_minor          integer  not null check (est_vat_minor >= 0),
  final_vat_minor        integer check (final_vat_minor >= 0),
  substitution_allowed   boolean  not null default false,
  pick_status            text     not null default 'pending' check (pick_status in ('pending', 'picked', 'short', 'substituted', 'missing')),
  picked_by              uuid references app.staff (id),
  picked_at              timestamptz,
  unique (order_id, line_no),
  check (est_discount_minor <= est_gross_minor),
  check (final_discount_minor is null or final_discount_minor <= final_gross_minor),
  check (line_type <> 'product' or (product_id is not null and sale_unit is not null
                                    and (quantity_ordered is not null) <> (weight_ordered_grams is not null))),
  constraint deposit_lines_never_discounted check (line_type <> 'deposit' or (est_discount_minor = 0 and coalesce(final_discount_minor, 0) = 0)),
  check (line_type = 'deposit' or parent_line_id is null),
  check (substitute_for_line_id is null or line_type = 'product'),
  check (pick_status <> 'substituted' or substitution_allowed)
);
comment on column app.order_lines.vat_rate_bp is 'Copied at order time; later rate changes never alter this order.';
create index order_lines_order_idx on app.order_lines (order_id);
create index order_lines_product_idx on app.order_lines (product_id);

create table app.order_line_promotions (
  order_line_id        uuid    not null references app.order_lines (id) on delete cascade,
  promotion_id         uuid    not null references app.promotions (id),
  est_discount_minor   integer not null check (est_discount_minor >= 0),
  final_discount_minor integer check (final_discount_minor >= 0),
  primary key (order_line_id, promotion_id)
);

create table app.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references app.orders (id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_type  text not null check (actor_type in ('customer', 'staff', 'system', 'payment', 'seed')),
  actor_id    uuid,
  reason      text,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on app.order_status_history (order_id, created_at);
create trigger order_status_history_append_only before update or delete on app.order_status_history
  for each row execute function app.forbid_ledger_change();

alter table app.slot_reservations
  add constraint slot_reservations_cart_fk  foreign key (cart_id)  references app.carts (id) on delete set null,
  add constraint slot_reservations_order_fk foreign key (order_id) references app.orders (id) on delete cascade;
alter table app.loyalty_transactions
  add constraint loyalty_transactions_order_fk foreign key (order_id) references app.orders (id) on delete set null;

create table app.promotion_redemptions (
  id             uuid primary key default gen_random_uuid(),
  promotion_id   uuid not null references app.promotions (id),
  coupon_id      uuid references app.coupons (id),
  order_id       uuid not null references app.orders (id) on delete cascade,
  customer_id    uuid references app.customers (id) on delete set null,
  discount_minor integer not null check (discount_minor >= 0),
  created_at     timestamptz not null default now(),
  unique (promotion_id, order_id)
);

create table app.idempotency_keys (
  scope         text not null,
  key           uuid not null,
  request_hash  text not null,
  status        text not null check (status in ('in_progress', 'completed')),
  response      jsonb,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',
  primary key (scope, key)
);

create table app.reviews (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid references app.products (id) on delete cascade,
  customer_id    uuid references app.customers (id) on delete set null,
  order_id       uuid references app.orders (id) on delete set null,
  display_name   text not null check (length(display_name) between 1 and 80),
  location_label text,
  avatar_url     text,
  rating         smallint not null check (rating between 1 and 5),
  body           text not null check (length(body) between 1 and 4000),
  is_verified    boolean not null default false,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderated_by   uuid references app.staff (id),
  moderated_at   timestamptz,
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now(),
  check (not is_verified or order_id is not null or is_sample)
);
comment on column app.reviews.product_id is 'NULL = store testimonial (homepage).';
create unique index reviews_one_per_customer_product on app.reviews (product_id, customer_id) where customer_id is not null and product_id is not null;
create index reviews_product_idx on app.reviews (product_id, created_at desc) where status = 'approved';

-- Keep products.rating_avg / rating_count in step with approved, non-sample reviews.
create or replace function app.refresh_product_rating(p_product_id uuid)
returns void
language sql
set search_path = ''
as $$
  update app.products p
  set rating_count = s.n,
      rating_avg   = case when s.n = 0 then null else round(s.avg_rating, 2) end
  from (
    select count(*)::int as n, avg(r.rating)::numeric as avg_rating
    from app.reviews r
    where r.product_id = p_product_id and r.status = 'approved' and not r.is_sample
  ) s
  where p.id = p_product_id
$$;

create or replace function app.reviews_after_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.product_id is not null then
    perform app.refresh_product_rating(old.product_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.product_id is not null then
    perform app.refresh_product_rating(new.product_id);
  end if;
  return null;
end;
$$;
create trigger reviews_refresh_rating after insert or update or delete on app.reviews
  for each row execute function app.reviews_after_change();

select app.harden();
