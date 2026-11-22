-- 0021 Engagement & loyalty: loyalty read/redeem, reviews, back-in-stock & price-drop alerts,
--      repeat orders, abandoned-basket reminders. Plus: terms version / payment mode in the public
--      storefront config, and the exact card-hold amount in the checkout view.
--
-- Repeat orders never charge a card on their own (there are no stored cards): when one is due,
-- its items are put in the customer's basket and they get an email to pick a slot and check out.

insert into app.app_settings (key, value, description) values
  ('abandoned_cart_enabled', 'true', 'Email signed-in shoppers who left items in their basket (only those who agreed to marketing emails).'),
  ('abandoned_cart_hours', '24', 'Hours after the last basket change before the reminder is sent (one reminder per basket change).'),
  ('product_alerts_enabled', 'true', 'Let shoppers ask to be emailed when an item is back in stock or its price drops.'),
  ('repeat_orders_enabled', 'true', 'Let shoppers set up repeat orders (their basket is refilled on schedule with a reminder email).')
on conflict (key) do nothing;

insert into app.message_templates (code, channel, locale, name, is_marketing, subject, body) values
  ('product_back_in_stock', 'email', 'en-GB', 'Alert: back in stock', false, '{{product}} is back in stock',
   E'Hi {{first_name}},\n\nGood news: {{product}} is back in stock.\n\n{{product_url}}\n\nYou asked us to tell you. This alert is now finished.\n\nVaram Foods'),
  ('product_price_drop', 'email', 'en-GB', 'Alert: price drop', false, 'Price drop: {{product}}',
   E'Hi {{first_name}},\n\n{{product}} is now {{new_price}} (was {{old_price}} when you set the alert).\n\n{{product_url}}\n\nVaram Foods'),
  ('repeat_order_ready', 'email', 'en-GB', 'Repeat order: basket ready', false, 'Your {{name}} is in your basket',
   E'Hi {{first_name}},\n\nYour repeat order "{{name}}" is ready in your basket:\n\n{{items}}\n\nChoose a delivery slot and check out: {{checkout_url}}\n\nNext reminder: {{next_date}}. Skip or pause it any time in your account.\n\nVaram Foods'),
  ('abandoned_basket', 'email', 'en-GB', 'Basket reminder', true, 'You left something in your basket',
   E'Hi {{first_name}},\n\nYou still have {{count}} item(s) in your basket ({{total}}).\n\n{{basket_url}}\n\nTo stop these emails, turn off offers & news in your account.\n\nVaram Foods')
on conflict (code, channel, locale) do nothing;

-- ── public config & checkout additions ─────────────────────────────────────────────────────────
create or replace function api.get_storefront_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', app.setting('currency') #>> '{}',
    'locale', app.resolve_locale(null),
    'timezone', app.setting('timezone') #>> '{}',
    'freeDeliveryThreshold', app.money((select min(f.from_basket_minor) from app.delivery_fee_rules f
                                        join app.delivery_zones z on z.id = f.zone_id and z.is_active
                                        where f.fee_minor = 0 and f.from_basket_minor > 0
                                          and tstzrange(f.valid_from, f.valid_to) @> now())),
    'supportEmail', app.setting('support_email') #>> '{}',
    'supportPhone', app.setting('support_phone') #>> '{}',
    'guestCheckout', coalesce((app.setting('guest_checkout_enabled'))::boolean, false),
    'loyaltyEnabled', coalesce((app.setting('loyalty_enabled'))::boolean, false),
    'productAlertsEnabled', coalesce((app.setting('product_alerts_enabled'))::boolean, false),
    'repeatOrdersEnabled', coalesce((app.setting('repeat_orders_enabled'))::boolean, false),
    'termsVersion', app.setting('terms_version') #>> '{}',
    'privacyVersion', app.setting('privacy_version') #>> '{}',
    'paymentMode', coalesce(app.setting('payment_mode') #>> '{}', 'stripe'),
    'environment', app.setting('environment') #>> '{}')
$$;
comment on function api.get_storefront_config() is '@access anon Shop-wide settings the website needs: currency, free-delivery threshold, contact details, feature switches, terms version, payment mode.';

do $$
declare
  v_def text := pg_get_functiondef('app.checkout_json(uuid)'::regprocedure);
begin
  v_def := replace(v_def, $q$'termsVersion', app.setting('terms_version') #>> '{}');$q$,
    $q$'termsVersion', app.setting('terms_version') #>> '{}',
    'authAmount', app.money((v_cart -> 'totals' -> 'total' ->> 'amount')::bigint + app.div_round_half_up(
        (select coalesce(sum((l -> 'lineTotal' ->> 'amount')::bigint), 0) from jsonb_array_elements(v_cart -> 'lines') l
          where (l ->> 'isEstimate')::boolean) * coalesce((app.setting('weighted_auth_buffer_bp') #>> '{}')::int, 1500), 10000), 'GBP'));$q$);
  if v_def not like '%authAmount%' then raise exception 'checkout_json patch did not apply'; end if;
  execute v_def;
end;
$$;

-- ── loyalty ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.get_my_loyalty()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
  a      app.loyalty_accounts;
  t      app.loyalty_tiers;
  n      app.loyalty_tiers;
begin
  select * into a from app.loyalty_accounts where customer_id = v_cust;
  select * into t from app.loyalty_tiers where min_lifetime_points <= coalesce(a.lifetime_points, 0) order by min_lifetime_points desc limit 1;
  select * into n from app.loyalty_tiers where min_lifetime_points > coalesce(a.lifetime_points, 0) order by min_lifetime_points limit 1;
  return jsonb_build_object(
    'enabled', coalesce((app.setting('loyalty_enabled'))::boolean, false),
    'balance', coalesce(a.points_balance, 0),
    'lifetime', coalesce(a.lifetime_points, 0),
    'tier', case when t.code is not null then jsonb_build_object('code', t.code, 'name', t.name) end,
    'nextTier', case when n.code is not null then jsonb_build_object('code', n.code, 'name', n.name, 'pointsNeeded', n.min_lifetime_points - coalesce(a.lifetime_points, 0)) end,
    'pointValue', app.money(coalesce((app.setting('loyalty_point_value_pence') #>> '{}')::int, 1), 'GBP'),
    'pointsPerPound', coalesce((app.setting('loyalty_points_per_pound') #>> '{}')::int, 10),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('points', x.points, 'reason', x.reason, 'at', x.created_at, 'note', x.note) order by x.created_at desc), '[]'::jsonb)
                  from (select * from app.loyalty_transactions lt where lt.customer_id = v_cust order by lt.created_at desc limit 20) x));
end;
$$;
comment on function api.get_my_loyalty() is '@access authenticated Points balance, tier, points to the next tier and recent points history.';

create or replace function api.list_loyalty_rewards()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'pointsCost', r.points_cost) order by r.points_cost), '[]'::jsonb)
  from app.loyalty_rewards r join app.promotions p on p.id = r.promotion_id and p.status = 'active'
  where r.is_active and coalesce((app.setting('loyalty_enabled'))::boolean, false)
$$;
comment on function api.list_loyalty_rewards() is '@access anon Rewards that can be bought with loyalty points.';

create or replace function api.redeem_loyalty_reward(p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
  r      app.loyalty_rewards;
  a      app.loyalty_accounts;
  v_code text;
begin
  if not coalesce((app.setting('loyalty_enabled'))::boolean, false) then
    perform app.raise_error('FORBIDDEN', 403, jsonb_build_object('reason', 'LOYALTY_DISABLED'), 'Rewards are switched off.');
  end if;
  select * into r from app.loyalty_rewards where id = p_reward_id and is_active;
  if r.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Reward not found.'); end if;
  select * into a from app.loyalty_accounts where customer_id = v_cust for update;
  if coalesce(a.points_balance, 0) < r.points_cost then
    perform app.raise_error('INSUFFICIENT_POINTS', 422, jsonb_build_object('balance', coalesce(a.points_balance, 0), 'cost', r.points_cost), 'Not enough points.');
  end if;
  v_code := 'RW' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
  insert into app.coupons (promotion_id, code, max_uses, customer_id) values (r.promotion_id, v_code, 1, v_cust);
  insert into app.loyalty_transactions (customer_id, points, reason, note) values (v_cust, -r.points_cost, 'redeem', r.title);
  update app.loyalty_accounts set points_balance = points_balance - r.points_cost, updated_at = now() where customer_id = v_cust;
  return jsonb_build_object('code', v_code, 'title', r.title, 'balance', a.points_balance - r.points_cost);
end;
$$;
comment on function api.redeem_loyalty_reward(uuid) is '@access authenticated Spend points on a reward: returns a personal single-use promo code.';

-- ── reviews ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.submit_review(p_product_id uuid, p_rating integer, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust  uuid := app.require_customer();
  c       app.customers;
  v_order uuid;
begin
  if p_rating not between 1 and 5 or coalesce(length(trim(p_body)), 0) < 3 or length(p_body) > 4000 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('rating', 'body')), 'Please add a rating and a few words.');
  end if;
  if not exists (select 1 from app.products p where p.id = p_product_id and p.status = 'active') then
    perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.');
  end if;
  perform app.rate_limit('review:' || v_cust, 10, interval '1 day');
  select * into c from app.customers where id = v_cust;
  -- verified only with a delivered order that contained the product
  select o.id into v_order from app.orders o join app.order_lines l on l.order_id = o.id and l.product_id = p_product_id
   where o.customer_id = v_cust and o.status in ('delivered', 'partially_refunded') order by o.delivered_at desc nulls last limit 1;
  insert into app.reviews (product_id, customer_id, order_id, display_name, rating, body, is_verified, status)
  values (p_product_id, v_cust, v_order, c.first_name || ' ' || left(c.last_name, 1) || '.', p_rating, trim(p_body), v_order is not null, 'pending');
  return jsonb_build_object('status', 'pending', 'verified', v_order is not null);
exception when unique_violation then
  perform app.raise_error('ALREADY_REVIEWED', 409, null, 'You have already reviewed this product.');
  return null;
end;
$$;
comment on function api.submit_review(uuid, integer, text) is '@access authenticated Write a review. It appears after moderation; it is marked verified only if the product was delivered to this customer.';

-- ── back-in-stock & price-drop alerts ───────────────────────────────────────────────────────────
create table app.product_alerts (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references app.customers (id) on delete cascade,
  product_id        uuid not null references app.products (id) on delete cascade,
  kind              text not null check (kind in ('back_in_stock', 'price_drop')),
  price_at_set_minor integer,
  status            text not null default 'active' check (status in ('active', 'notified', 'cancelled')),
  created_at        timestamptz not null default now(),
  notified_at       timestamptz,
  check (kind <> 'price_drop' or price_at_set_minor is not null)
);
create unique index product_alerts_one_active on app.product_alerts (customer_id, product_id, kind) where status = 'active';
create index product_alerts_active_idx on app.product_alerts (product_id) where status = 'active';
comment on table app.product_alerts is 'Shopper requests to be emailed when a product is back in stock or cheaper.';

create or replace function api.create_product_alert(p_product_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  if not coalesce((app.setting('product_alerts_enabled'))::boolean, false) then
    perform app.raise_error('FORBIDDEN', 403, jsonb_build_object('reason', 'ALERTS_DISABLED'), 'Alerts are switched off.');
  end if;
  if p_kind not in ('back_in_stock', 'price_drop') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('kind')), 'Unknown alert type.');
  end if;
  if not exists (select 1 from app.products p where p.id = p_product_id and p.status = 'active') then
    perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.');
  end if;
  if (select count(*) from app.product_alerts a where a.customer_id = v_cust and a.status = 'active') >= 100 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('max', 100), 'Too many alerts.');
  end if;
  insert into app.product_alerts (customer_id, product_id, kind, price_at_set_minor)
  values (v_cust, p_product_id, p_kind, case when p_kind = 'price_drop' then app.current_price_minor(p_product_id) end)
  on conflict (customer_id, product_id, kind) where status = 'active' do nothing;
  return api.list_my_alerts();
end;
$$;
comment on function api.create_product_alert(uuid, text) is '@access authenticated Email me when this product is back in stock ("back_in_stock") or cheaper than now ("price_drop").';

create or replace function api.delete_product_alert(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  update app.product_alerts set status = 'cancelled' where id = p_id and customer_id = v_cust and status = 'active';
  return api.list_my_alerts();
end;
$$;
comment on function api.delete_product_alert(uuid) is '@access authenticated Stop an alert.';

create or replace function api.list_my_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'kind', a.kind, 'status', a.status, 'createdAt', a.created_at, 'notifiedAt', a.notified_at,
      'priceAtSet', case when a.price_at_set_minor is not null then app.money(a.price_at_set_minor, 'GBP') end,
      'product', app.product_summary_json(a.product_id, null, null)) order by a.created_at desc), '[]'::jsonb)
    from app.product_alerts a where a.customer_id = v_cust and (a.status = 'active' or a.notified_at > now() - interval '30 days'));
end;
$$;
comment on function api.list_my_alerts() is '@access authenticated Active alerts, plus ones sent in the last 30 days.';

create or replace function app.process_product_alerts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  a      record;
  v_n    integer := 0;
  v_site text := rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/');
  v_now  integer;
begin
  if not coalesce((app.setting('product_alerts_enabled'))::boolean, false) then return 0; end if;
  for a in
    select pa.*, c.email, c.first_name, p.slug, (select t.name from app.product_translations t where t.product_id = p.id order by (t.locale = 'en-GB') desc limit 1) as product_name
      from app.product_alerts pa join app.customers c on c.id = pa.customer_id and c.anonymised_at is null
      join app.products p on p.id = pa.product_id and p.status = 'active'
     where pa.status = 'active' order by pa.created_at limit 500
  loop
    if a.kind = 'back_in_stock' and app.product_availability(a.product_id, null) <> 'out_of_stock' then
      perform app.queue_message('product_back_in_stock', 'email', a.email, jsonb_build_object(
        'first_name', coalesce(a.first_name, ''), 'product', a.product_name, 'product_url', v_site || '/product/' || a.slug), a.customer_id);
      update app.product_alerts set status = 'notified', notified_at = now() where id = a.id;
      v_n := v_n + 1;
    elsif a.kind = 'price_drop' then
      v_now := app.current_price_minor(a.product_id);
      if v_now is not null and v_now < a.price_at_set_minor then
        perform app.queue_message('product_price_drop', 'email', a.email, jsonb_build_object(
          'first_name', coalesce(a.first_name, ''), 'product', a.product_name, 'product_url', v_site || '/product/' || a.slug,
          'new_price', '£' || to_char(v_now / 100.0, 'FM999990.00'), 'old_price', '£' || to_char(a.price_at_set_minor / 100.0, 'FM999990.00')), a.customer_id);
        update app.product_alerts set status = 'notified', notified_at = now() where id = a.id;
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ── repeat orders ───────────────────────────────────────────────────────────────────────────────
create table app.repeat_orders (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references app.customers (id) on delete cascade,
  name            text not null check (length(name) between 1 and 60),
  frequency_days  integer not null check (frequency_days in (7, 14, 21, 28)),
  next_run_date   date not null,
  status          text not null default 'active' check (status in ('active', 'paused')),
  last_run_at     timestamptz,
  source_order_id uuid references app.orders (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create table app.repeat_order_items (
  repeat_order_id uuid not null references app.repeat_orders (id) on delete cascade,
  product_id      uuid not null references app.products (id) on delete cascade,
  quantity        integer check (quantity between 1 and 99),
  weight_grams    integer check (weight_grams > 0),
  primary key (repeat_order_id, product_id),
  check ((quantity is null) <> (weight_grams is null))
);
create index repeat_orders_due_idx on app.repeat_orders (next_run_date) where status = 'active';
create trigger repeat_orders_touch before update on app.repeat_orders for each row execute function app.touch_updated_at();

create or replace function app.repeat_order_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', r.id, 'name', r.name, 'frequencyDays', r.frequency_days, 'nextDate', r.next_run_date,
    'status', r.status, 'lastRunAt', r.last_run_at, 'createdAt', r.created_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('product', app.product_summary_json(i.product_id, null, null),
                                                           'quantity', i.quantity, 'weightGrams', i.weight_grams)), '[]'::jsonb)
                from app.repeat_order_items i where i.repeat_order_id = r.id))
  from app.repeat_orders r where r.id = p_id
$$;

create or replace function api.list_my_repeat_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  return (select coalesce(jsonb_agg(app.repeat_order_json(r.id) order by r.created_at), '[]'::jsonb) from app.repeat_orders r where r.customer_id = v_cust);
end;
$$;
comment on function api.list_my_repeat_orders() is '@access authenticated The customer''s repeat orders.';

create or replace function api.create_repeat_from_order(p_order_number text, p_frequency_days integer, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o    app.orders := app.my_order(p_order_number);
  v_id uuid;
begin
  if not coalesce((app.setting('repeat_orders_enabled'))::boolean, false) then
    perform app.raise_error('FORBIDDEN', 403, jsonb_build_object('reason', 'REPEAT_DISABLED'), 'Repeat orders are switched off.');
  end if;
  if p_frequency_days not in (7, 14, 21, 28) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('frequencyDays')), 'Choose every 1, 2, 3 or 4 weeks.');
  end if;
  if (select count(*) from app.repeat_orders r where r.customer_id = o.customer_id) >= 10 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('max', 10), 'You can have up to 10 repeat orders.');
  end if;
  insert into app.repeat_orders (customer_id, name, frequency_days, next_run_date, source_order_id)
  values (o.customer_id, coalesce(nullif(trim(p_name), ''), 'Repeat of ' || o.number), p_frequency_days,
          (now() at time zone 'Europe/London')::date + p_frequency_days, o.id)
  returning id into v_id;
  insert into app.repeat_order_items (repeat_order_id, product_id, quantity, weight_grams)
  select v_id, l.product_id, l.quantity_ordered, l.weight_ordered_grams
    from app.order_lines l join app.products p on p.id = l.product_id and p.status = 'active'
   where l.order_id = o.id and l.line_type = 'product' and l.substitute_for_line_id is null
  on conflict do nothing;
  return app.repeat_order_json(v_id);
end;
$$;
comment on function api.create_repeat_from_order(text, integer, text) is '@access authenticated Make a past order repeat every 1–4 weeks (basket refilled + reminder email).';

create or replace function api.update_repeat_order(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
  r      app.repeat_orders;
  v_item jsonb;
begin
  select * into r from app.repeat_orders where id = p_id and customer_id = v_cust for update;
  if r.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Repeat order not found.'); end if;
  if p ? 'frequencyDays' and (p ->> 'frequencyDays')::int not in (7, 14, 21, 28) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('frequencyDays')), 'Choose every 1, 2, 3 or 4 weeks.');
  end if;
  if p ? 'nextDate' and (p ->> 'nextDate')::date < (now() at time zone 'Europe/London')::date then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('nextDate')), 'Choose a future date.');
  end if;
  update app.repeat_orders set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    frequency_days = coalesce((p ->> 'frequencyDays')::int, frequency_days),
    next_run_date = case when p ->> 'action' = 'skip' then next_run_date + frequency_days else coalesce((p ->> 'nextDate')::date, next_run_date) end,
    status = case when p ->> 'action' = 'pause' then 'paused' when p ->> 'action' = 'resume' then 'active' else status end
  where id = r.id;
  if p ? 'items' then
    delete from app.repeat_order_items where repeat_order_id = r.id;
    for v_item in select * from jsonb_array_elements(p -> 'items') loop
      insert into app.repeat_order_items (repeat_order_id, product_id, quantity, weight_grams)
      values (r.id, (v_item ->> 'productId')::uuid, (v_item ->> 'quantity')::int, (v_item ->> 'weightGrams')::int)
      on conflict do nothing;
    end loop;
  end if;
  -- a resumed repeat order never runs in the past
  update app.repeat_orders set next_run_date = greatest(next_run_date, (now() at time zone 'Europe/London')::date + 1)
   where id = r.id and p ->> 'action' = 'resume';
  return app.repeat_order_json(r.id);
exception when invalid_text_representation or invalid_datetime_format or check_violation or foreign_key_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Some details are not valid.');
  return null;
end;
$$;
comment on function api.update_repeat_order(uuid, jsonb) is '@access authenticated Change a repeat order: { name, frequencyDays, nextDate, items[{productId, quantity|weightGrams}], action: "skip"|"pause"|"resume" }.';

create or replace function api.delete_repeat_order(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  delete from app.repeat_orders where id = p_id and customer_id = v_cust;
  return api.list_my_repeat_orders();
end;
$$;
comment on function api.delete_repeat_order(uuid) is '@access authenticated Delete a repeat order.';

-- Puts a repeat order's items in the customer's basket (customer cart; quantities add up).
create or replace function app.fill_cart_from_repeat(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r       app.repeat_orders;
  i       app.repeat_order_items;
  v_cart  uuid;
  v_skip  jsonb := '[]'::jsonb;
  v_prod  app.products;
  v_amt   record;
begin
  select * into r from app.repeat_orders where id = p_id;
  select c.id into v_cart from app.carts c where c.customer_id = r.customer_id and c.status = 'active';
  if v_cart is null then
    insert into app.carts (customer_id) values (r.customer_id) returning id into v_cart;
  end if;
  for i in select * from app.repeat_order_items where repeat_order_id = r.id loop
    select * into v_prod from app.products where id = i.product_id;
    begin
      if v_prod.status <> 'active' or app.current_price_minor(v_prod.id) is null then
        raise exception using errcode = 'PT422', message = 'PRODUCT_UNAVAILABLE';
      end if;
      select * into v_amt from app.validate_line_amount(v_prod,
        case when v_prod.sale_unit = 'each' then coalesce((select ci.quantity from app.cart_items ci where ci.cart_id = v_cart and ci.product_id = v_prod.id), 0) + i.quantity end,
        case when v_prod.sale_unit = 'weight' then coalesce((select ci.weight_grams from app.cart_items ci where ci.cart_id = v_cart and ci.product_id = v_prod.id), 0) + i.weight_grams end);
      insert into app.cart_items (cart_id, product_id, quantity, weight_grams, added_at)
      values (v_cart, v_prod.id, v_amt.quantity, v_amt.weight_grams, clock_timestamp())
      on conflict (cart_id, product_id) do update set quantity = excluded.quantity, weight_grams = excluded.weight_grams, updated_at = now();
    exception when sqlstate 'PT400' or sqlstate 'PT422' then
      v_skip := v_skip || jsonb_build_object('product', v_prod.slug, 'reason', sqlerrm);
    end;
  end loop;
  update app.carts set updated_at = now() where id = v_cart;
  return jsonb_build_object('cartId', v_cart, 'skipped', v_skip);
end;
$$;

create or replace function api.run_repeat_order_now(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
  v      jsonb;
begin
  if not exists (select 1 from app.repeat_orders r where r.id = p_id and r.customer_id = v_cust) then
    perform app.raise_error('NOT_FOUND', 404, null, 'Repeat order not found.');
  end if;
  v := app.fill_cart_from_repeat(p_id);
  return app.cart_view((v ->> 'cartId')::uuid, null) || jsonb_build_object('skipped', v -> 'skipped');
end;
$$;
comment on function api.run_repeat_order_now(uuid) is '@access authenticated Put a repeat order''s items in the basket now (does not change its schedule).';

create or replace function app.process_repeat_orders()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r      record;
  v      jsonb;
  v_n    integer := 0;
  v_site text := rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/');
begin
  if not coalesce((app.setting('repeat_orders_enabled'))::boolean, false) then return 0; end if;
  for r in
    select ro.*, c.email, c.first_name from app.repeat_orders ro join app.customers c on c.id = ro.customer_id and c.anonymised_at is null
     where ro.status = 'active' and ro.next_run_date <= (now() at time zone 'Europe/London')::date
     order by ro.next_run_date limit 200 for update of ro skip locked
  loop
    v := app.fill_cart_from_repeat(r.id);
    update app.repeat_orders set last_run_at = now(),
      next_run_date = greatest(next_run_date + frequency_days, (now() at time zone 'Europe/London')::date + 1) where id = r.id;
    perform app.queue_message('repeat_order_ready', 'email', r.email, jsonb_build_object(
      'first_name', coalesce(r.first_name, ''), 'name', r.name,
      'items', (select string_agg(coalesce(i.quantity::text || ' × ', round(i.weight_grams / 1000.0, 2)::text || ' kg ')
                                  || (select t.name from app.product_translations t where t.product_id = i.product_id order by (t.locale = 'en-GB') desc limit 1), E'\n')
                  from app.repeat_order_items i where i.repeat_order_id = r.id),
      'checkout_url', v_site || '/checkout',
      'next_date', to_char((select ro2.next_run_date from app.repeat_orders ro2 where ro2.id = r.id), 'Dy DD Mon')), r.customer_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ── abandoned basket reminders (marketing: only with email-marketing consent) ──────────────────
alter table app.carts add column reminder_sent_at timestamptz;

create or replace function app.process_abandoned_carts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  c      record;
  v      jsonb;
  v_n    integer := 0;
  v_hrs  integer := coalesce((app.setting('abandoned_cart_hours') #>> '{}')::int, 24);
  v_site text := rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/');
begin
  if not coalesce((app.setting('abandoned_cart_enabled'))::boolean, false) then return 0; end if;
  for c in
    select k.id, k.customer_id, cu.email, cu.first_name
      from app.carts k join app.customers cu on cu.id = k.customer_id and cu.anonymised_at is null
     where k.status = 'active' and k.customer_id is not null
       and k.updated_at < now() - make_interval(hours => v_hrs)
       and k.updated_at > now() - make_interval(hours => v_hrs + 72)          -- not for baskets left for days
       and (k.reminder_sent_at is null or k.reminder_sent_at < k.updated_at)  -- one per basket change
       and exists (select 1 from app.cart_items ci where ci.cart_id = k.id)
       and coalesce((app.consent_state(k.customer_id) -> 'marketing_email' ->> 'granted')::boolean, false)
     limit 200
  loop
    v := app.price_cart(c.id);
    perform app.queue_message('abandoned_basket', 'email', c.email, jsonb_build_object(
      'first_name', coalesce(c.first_name, ''), 'count', v ->> 'itemCount',
      'total', '£' || to_char((v -> 'totals' -> 'total' ->> 'amount')::int / 100.0, 'FM999990.00'),
      'basket_url', v_site || '/checkout'), c.customer_id);
    update app.carts set reminder_sent_at = now() where id = c.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

select cron.schedule('process-product-alerts', '*/15 * * * *', $$ select app.process_product_alerts() $$);
select cron.schedule('process-repeat-orders', '0 7 * * *', $$ select app.process_repeat_orders() $$);
select cron.schedule('process-abandoned-carts', '20 * * * *', $$ select app.process_abandoned_carts() $$);

select app.harden();
