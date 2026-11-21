-- 0007 Loyalty (ledger) and promotions (percent, fixed, multi-buy, member price,
--      free delivery, coupons). Deterministic evaluation order: (priority, id).

create table app.loyalty_tiers (
  code                text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name                text    not null,
  min_lifetime_points integer not null unique check (min_lifetime_points >= 0),
  earn_multiplier_bp  integer not null default 10000 check (earn_multiplier_bp > 0)
);

create table app.loyalty_accounts (
  customer_id     uuid primary key references app.customers (id) on delete cascade,
  points_balance  integer not null default 0 check (points_balance >= 0),
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  tier_code       text references app.loyalty_tiers (code),
  updated_at      timestamptz not null default now()
);
create trigger loyalty_accounts_touch before update on app.loyalty_accounts
  for each row execute function app.touch_updated_at();

create table app.loyalty_transactions (
  id          bigint generated always as identity primary key,
  customer_id uuid    not null references app.customers (id) on delete cascade,
  points      integer not null check (points <> 0),
  reason      text    not null check (reason in ('order_earn', 'redeem', 'reversal', 'adjustment', 'expiry', 'opening_balance')),
  order_id    uuid,
  created_by  uuid,
  note        text,
  created_at  timestamptz not null default now()
);
create index loyalty_transactions_customer_idx on app.loyalty_transactions (customer_id, created_at desc);
create trigger loyalty_transactions_append_only before update or delete on app.loyalty_transactions
  for each row execute function app.forbid_ledger_change();

create table app.promotions (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  label                    text not null,
  type                     text not null check (type in ('percent_off', 'fixed_off', 'multibuy_x_for_y',
                                                         'multibuy_x_for_price', 'member_price', 'free_delivery')),
  scope                    text not null check (scope in ('basket', 'targets')),
  percent_bp               integer check (percent_bp between 1 and 10000),
  amount_minor             integer check (amount_minor > 0),
  buy_qty                  integer check (buy_qty >= 2),
  pay_qty                  integer check (pay_qty >= 1),
  bundle_price_minor       integer check (bundle_price_minor > 0),
  min_basket_minor         integer check (min_basket_minor >= 0),
  max_discount_minor       integer check (max_discount_minor > 0),
  requires_coupon          boolean not null default false,
  first_order_only         boolean not null default false,
  members_only             boolean not null default false,
  stackable                boolean not null default false,
  priority                 integer not null default 100,
  starts_at                timestamptz not null default now(),
  ends_at                  timestamptz,
  usage_limit_total        integer check (usage_limit_total > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer > 0),
  status                   text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  description              text,
  created_by               uuid,
  is_sample                boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  -- exactly the value columns each type needs
  check (case type
    when 'percent_off'          then percent_bp is not null and amount_minor is null and buy_qty is null and pay_qty is null and bundle_price_minor is null
    when 'fixed_off'            then amount_minor is not null and percent_bp is null and buy_qty is null and pay_qty is null and bundle_price_minor is null
    when 'multibuy_x_for_y'     then buy_qty is not null and pay_qty is not null and pay_qty < buy_qty and percent_bp is null and amount_minor is null and bundle_price_minor is null and scope = 'targets'
    when 'multibuy_x_for_price' then buy_qty is not null and bundle_price_minor is not null and percent_bp is null and amount_minor is null and pay_qty is null and scope = 'targets'
    when 'member_price'         then members_only and scope = 'targets' and (percent_bp is null) <> (amount_minor is null) and buy_qty is null and pay_qty is null and bundle_price_minor is null
    when 'free_delivery'        then scope = 'basket' and percent_bp is null and amount_minor is null and buy_qty is null and pay_qty is null and bundle_price_minor is null
  end)
);
create trigger promotions_touch before update on app.promotions
  for each row execute function app.touch_updated_at();

create table app.promotion_targets (
  promotion_id uuid not null references app.promotions (id) on delete cascade,
  target_type  text not null check (target_type in ('product', 'category', 'brand')),
  target_id    uuid not null,
  primary key (promotion_id, target_type, target_id)
);

-- Polymorphic target must exist.
create or replace function app.check_promotion_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  v_exists := case new.target_type
       when 'product'  then exists (select 1 from app.products   p where p.id = new.target_id)
       when 'category' then exists (select 1 from app.categories c where c.id = new.target_id)
       when 'brand'    then exists (select 1 from app.brands     b where b.id = new.target_id)
       else false
     end;
  if not v_exists then
    raise exception using errcode = 'PT422', message = 'VALIDATION_FAILED',
      detail = jsonb_build_object('field', 'target_id', 'target_type', new.target_type)::text;
  end if;
  return new;
end;
$$;
create trigger promotion_targets_exist before insert or update on app.promotion_targets
  for each row execute function app.check_promotion_target();

create table app.promotion_zones (
  promotion_id uuid not null references app.promotions (id) on delete cascade,
  zone_id      uuid not null references app.delivery_zones (id) on delete cascade,
  primary key (promotion_id, zone_id)
);

create table app.coupons (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references app.promotions (id) on delete cascade,
  code         text not null unique check (code = upper(code) and code ~ '^[A-Z0-9]{3,32}$'),
  max_uses     integer check (max_uses > 0),
  used_count   integer not null default 0 check (used_count >= 0),
  customer_id  uuid references app.customers (id) on delete cascade,
  starts_at    timestamptz,
  ends_at      timestamptz,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  check (max_uses is null or used_count <= max_uses),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table app.loyalty_rewards (
  id           uuid primary key default gen_random_uuid(),
  title        text    not null,
  points_cost  integer not null check (points_cost > 0),
  promotion_id uuid    not null references app.promotions (id),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

select app.harden();
