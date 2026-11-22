-- 0019 Delivery slots, checkout, orders, payments, outbox (Phase 6).
--
-- Flow: start_checkout (holds a slot) → update_checkout (slot / address / notes / age) →
-- place_order (idempotent: re-prices, reserves stock, writes the order + VAT lines, opens the
-- payment) → browser confirms the card with Stripe.js → confirm_order_payment (Postgres asks
-- Stripe, never trusts the browser) → order "placed". A pg_cron reconciler finishes or cancels
-- anything left unpaid.
--
-- payment_mode: 'stripe' (real; needs the secret key in Vault as "stripe_secret_key") or
-- 'simulated' (development only, refused in production: no card, payment treated as authorised).

insert into app.app_settings (key, value, description) values
  ('payment_mode', '"simulated"', 'How checkout takes payment: "stripe" (real card payments, needs the Stripe key) or "simulated" (testing only, never allowed in production).'),
  ('payment_pending_minutes', '30', 'Minutes a shopper has to finish paying before the order is cancelled and its slot and stock released.'),
  ('email_from', '""', 'Sender for emails, e.g. "Varam Foods <orders@varamfoods.co.uk>". Emails stay queued until this and the Resend key are set.'),
  ('order_reply_to', '""', 'Optional reply-to address for order emails.')
on conflict (key) do nothing;

insert into app.message_templates (code, channel, locale, name, is_marketing, subject, body) values
  ('order_confirmation', 'email', 'en-GB', 'Order: confirmation', false, 'Your Varam Foods order {{order_number}}',
   E'Hi {{first_name}},\n\nThank you for your order {{order_number}}.\n\nDelivery: {{slot}}\nTo: {{address}}\n\n{{items}}\n\nEstimated total: {{total}}\n{{weight_note}}\n\nTrack or change your order: {{order_url}}\n\nVaram Foods'),
  ('order_cancelled', 'email', 'en-GB', 'Order: cancelled', false, 'Order {{order_number}} cancelled',
   E'Hi {{first_name}},\n\nYour order {{order_number}} has been cancelled. {{reason}}\nAny payment hold on your card has been released.\n\nVaram Foods')
on conflict (code, channel, locale) do nothing;

-- ── slots ───────────────────────────────────────────────────────────────────────────────────────
create or replace function app.generate_delivery_slots(p_days integer default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_days integer := coalesce(p_days, (app.setting('slot_days_ahead') #>> '{}')::int, 7);
  v_tz   text := coalesce(app.setting('timezone') #>> '{}', 'Europe/London');
  v_n    integer;
begin
  insert into app.delivery_slots (zone_id, template_id, starts_at, ends_at, cutoff_at, capacity, service_label, fee_minor)
  select t.zone_id, t.id,
         (x.d + t.start_local) at time zone v_tz,
         (x.d + t.end_local) at time zone v_tz,
         ((x.d + t.start_local) at time zone v_tz) - make_interval(mins => t.cutoff_minutes_before),
         t.capacity, t.service_label, t.fee_minor
    from generate_series((now() at time zone v_tz)::date, (now() at time zone v_tz)::date + v_days, interval '1 day') g(day)
   cross join lateral (select g.day::date as d) x
    join app.slot_templates t on t.is_active and t.weekday = extract(isodow from x.d)
    join app.delivery_zones z on z.id = t.zone_id and z.is_active
   where (x.d + t.start_local) at time zone v_tz > now()
  on conflict (zone_id, starts_at) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function app.slot_json(s app.delivery_slots)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'startsAt', s.starts_at, 'endsAt', s.ends_at, 'cutoffAt', s.cutoff_at,
    'timezone', coalesce(app.setting('timezone') #>> '{}', 'Europe/London'),
    'localDate', (s.starts_at at time zone coalesce(app.setting('timezone') #>> '{}', 'Europe/London'))::date,
    'startLocal', to_char(s.starts_at at time zone coalesce(app.setting('timezone') #>> '{}', 'Europe/London'), 'HH24:MI'),
    'endLocal', to_char(s.ends_at at time zone coalesce(app.setting('timezone') #>> '{}', 'Europe/London'), 'HH24:MI'),
    'serviceLabel', s.service_label,
    'surcharge', case when coalesce(s.fee_minor, 0) > 0 then app.money(s.fee_minor, 'GBP') end,
    'capacity', s.capacity,
    'remaining', greatest(s.capacity - s.reserved_count, 0),
    'availability', case when s.status <> 'open' or s.reserved_count >= s.capacity or s.cutoff_at <= now() then 'full'
                         when s.capacity - s.reserved_count <= 3 then 'limited' else 'available' end)
$$;

create or replace function api.list_delivery_slots(p_postcode text, p_days integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pc   text := app.normalise_uk_postcode(p_postcode);
  v_zone uuid;
  v_days integer := least(greatest(coalesce(p_days, (app.setting('slot_days_ahead') #>> '{}')::int, 7), 1), 14);
begin
  if v_pc is null then perform app.raise_error('POSTCODE_INVALID', 400, null, 'Please enter a full UK postcode.'); end if;
  v_zone := app.zone_for_postcode(v_pc);
  if v_zone is null then perform app.raise_error('POSTCODE_NOT_SERVED', 422, jsonb_build_object('postcode', v_pc), 'We do not deliver there yet.'); end if;
  return (select coalesce(jsonb_agg(app.slot_json(s) order by s.starts_at), '[]'::jsonb)
            from app.delivery_slots s
           where s.zone_id = v_zone and s.status = 'open' and s.cutoff_at > now()
             and s.starts_at < now() + make_interval(days => v_days + 1));
end;
$$;
comment on function api.list_delivery_slots(text, integer) is '@access anon Delivery windows for a postcode over the next days, with how many places are left.';

create or replace function api.check_postcode(p_postcode text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pc   text := app.normalise_uk_postcode(p_postcode);
  z      app.delivery_zones;
  v_next app.delivery_slots;
begin
  if v_pc is null then perform app.raise_error('POSTCODE_INVALID', 400, null, 'Please enter a full UK postcode.'); end if;
  select * into z from app.delivery_zones where id = app.zone_for_postcode(v_pc);
  if z.id is not null then
    select * into v_next from app.delivery_slots s
     where s.zone_id = z.id and s.status = 'open' and s.cutoff_at > now() and s.reserved_count < s.capacity
     order by s.starts_at limit 1;
  end if;
  return jsonb_build_object(
    'postcode', v_pc,
    'deliverable', z.id is not null,
    'zone', case when z.id is not null then jsonb_build_object('code', z.code, 'name', z.name, 'label', z.display_label) end,
    'minimumBasket', case when z.min_basket_minor is not null then app.money(z.min_basket_minor, z.currency) end,
    'freeDeliveryThreshold', (select app.money(min(r.from_basket_minor), 'GBP') from app.delivery_fee_rules r
                               where r.zone_id = z.id and r.fee_minor = 0 and r.from_basket_minor > 0 and tstzrange(r.valid_from, r.valid_to) @> now()),
    'nextSlot', case when v_next.id is not null then app.slot_json(v_next) end);
end;
$$;
comment on function api.check_postcode(text) is '@access anon Is a postcode in a delivery area? Returns the zone, minimum order, free-delivery threshold and the next open slot.';

-- Releases holds that ran out (not ones attached to an order: the payment reconciler handles those).
create or replace function app.release_expired_holds()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  with gone as (
    update app.slot_reservations r set status = 'expired'
     where r.status = 'held' and r.expires_at < now() and r.order_id is null
    returning r.slot_id
  ), counts as (select slot_id, count(*)::int as n from gone group by slot_id)
  update app.delivery_slots s set reserved_count = greatest(s.reserved_count - c.n, 0)
    from counts c where s.id = c.slot_id;
  get diagnostics v_n = row_count;
  update app.checkouts k set status = 'expired', updated_at = now()
   where k.status = 'open' and k.expires_at < now();
  return v_n;
end;
$$;

-- ── order state machine ─────────────────────────────────────────────────────────────────────────
create or replace function app.transition_order(p_order_id uuid, p_to text, p_actor_type text, p_reason text default null)
returns app.orders
language plpgsql
set search_path = ''
as $$
declare
  o      app.orders;
  v_ok   boolean;
  v_actor uuid := coalesce(app.current_staff_id(), auth.uid());
begin
  select * into o from app.orders where id = p_order_id for update;
  if o.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Order not found.'); end if;
  v_ok := case o.status
    when 'pending_payment'    then p_to in ('placed', 'cancelled')
    when 'placed'             then p_to in ('picking', 'cancelled')
    when 'picking'            then p_to in ('picked', 'cancelled')
    when 'picked'             then p_to in ('paid', 'cancelled')
    when 'paid'               then p_to in ('out_for_delivery', 'refunded', 'partially_refunded')
    when 'out_for_delivery'   then p_to in ('delivered')
    when 'delivered'          then p_to in ('partially_refunded', 'refunded')
    when 'partially_refunded' then p_to in ('partially_refunded', 'refunded')
    else false end;
  if not coalesce(v_ok, false) then
    perform app.raise_error('INVALID_STATUS_TRANSITION', 409, jsonb_build_object('from', o.status, 'to', p_to), 'That status change is not allowed.');
  end if;
  update app.orders set status = p_to, updated_at = now(),
    placed_at = case when p_to = 'placed' then now() else placed_at end,
    picked_at = case when p_to = 'picked' then now() else picked_at end,
    paid_at = case when p_to = 'paid' then now() else paid_at end,
    dispatched_at = case when p_to = 'out_for_delivery' then now() else dispatched_at end,
    delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_to = 'cancelled' then p_reason else cancel_reason end
  where id = o.id
  returning * into o;
  insert into app.order_status_history (order_id, from_status, to_status, actor_type, actor_id, reason)
  values (o.id, (select h.to_status from app.order_status_history h where h.order_id = o.id order by h.created_at desc, h.id desc limit 1),
          p_to, p_actor_type, v_actor, p_reason);
  return o;
end;
$$;

-- Gives back everything an unfinished/cancelled order was holding: stock, slot place, coupon use.
create or replace function app.release_order_holds(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o app.orders;
  l record;
begin
  select * into o from app.orders where id = p_order_id;
  for l in
    select ol.product_id, coalesce(ol.quantity_ordered, ol.weight_ordered_grams) as amount
      from app.order_lines ol where ol.order_id = o.id and ol.line_type = 'product'
     order by ol.product_id
  loop
    if exists (select 1 from app.stock_movements m where m.ref_type = 'order' and m.ref_id = o.id
                and m.product_id = l.product_id and m.reason = 'order_reserve')
       and not exists (select 1 from app.stock_movements m where m.ref_type = 'order' and m.ref_id = o.id
                and m.product_id = l.product_id and m.reason = 'order_release') then
      update app.stock_levels set reserved = greatest(reserved - l.amount, 0), updated_at = now()
       where location_id = o.location_id and product_id = l.product_id;
      insert into app.stock_movements (location_id, product_id, delta, reason, affects, ref_type, ref_id, note)
      values (o.location_id, l.product_id, -l.amount, 'order_release', 'reserved', 'order', o.id, 'order not completed');
    end if;
  end loop;
  with r as (
    update app.slot_reservations set status = 'released'
     where order_id = o.id and status in ('held', 'booked') returning slot_id
  )
  update app.delivery_slots s set reserved_count = greatest(s.reserved_count - 1, 0) from r where s.id = r.slot_id;
  update app.coupons c set used_count = greatest(c.used_count - 1, 0)
   where c.id in (select pr.coupon_id from app.promotion_redemptions pr where pr.order_id = o.id and pr.coupon_id is not null);
end;
$$;

-- ── Stripe & email from Postgres ────────────────────────────────────────────────────────────────
create or replace function app.vault_secret(p_name text)
returns text
language sql
stable
set search_path = ''
as $$ select nullif(ds.decrypted_secret, '') from vault.decrypted_secrets ds where ds.name = p_name limit 1 $$;

create or replace function app.stripe_request(p_method text, p_path text, p_form jsonb default null, p_idempotency_key text default null,
                                              out status integer, out body jsonb)
language plpgsql
set search_path = ''
as $$
declare
  v_key     text := app.vault_secret('stripe_secret_key');
  v_headers extensions.http_header[];
  r         extensions.http_response;
begin
  if v_key is null then
    perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('service', 'stripe', 'reason', 'NOT_CONFIGURED'), 'Card payments are not set up yet.');
  end if;
  v_headers := array[extensions.http_header('Authorization', 'Bearer ' || v_key)];
  if p_idempotency_key is not null then
    v_headers := v_headers || extensions.http_header('Idempotency-Key', p_idempotency_key);
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '6000');
  begin
    r := extensions.http((p_method::extensions.http_method, 'https://api.stripe.com/v1/' || p_path, v_headers,
                          'application/x-www-form-urlencoded', case when p_form is null then null else extensions.urlencode(p_form) end)::extensions.http_request);
  exception when others then
    perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('service', 'stripe'), 'The payment service is not responding.');
  end;
  status := r.status;
  body := case when coalesce(r.content, '') <> '' then r.content::jsonb end;
end;
$$;

-- Sends queued emails through Resend once the key (Vault "resend_api_key") and sender are set.
create or replace function app.send_outbox(p_limit integer default 20)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_key  text := app.vault_secret('resend_api_key');
  v_from text := nullif(app.setting('email_from') #>> '{}', '');
  v_rt   text := nullif(app.setting('order_reply_to') #>> '{}', '');
  m      app.outbound_messages;
  r      extensions.http_response;
  v_sent integer := 0;
begin
  if v_key is null or v_from is null then return 0; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  for m in
    select * from app.outbound_messages where status = 'queued' and channel = 'email'
     order by created_at limit p_limit for update skip locked
  loop
    -- marketing only with current consent (newsletter subscribers have it by confirming)
    if m.is_marketing and not exists (select 1 from app.newsletter_subscribers n where n.email = m.to_address and n.status = 'subscribed')
       and not coalesce((app.consent_state(m.customer_id) -> 'marketing_email' ->> 'granted')::boolean, false) then
      update app.outbound_messages set status = 'suppressed', error = 'no marketing consent' where id = m.id;
      continue;
    end if;
    begin
      r := extensions.http(('POST', 'https://api.resend.com/emails',
            array[extensions.http_header('Authorization', 'Bearer ' || v_key)], 'application/json',
            jsonb_build_object('from', v_from, 'to', jsonb_build_array(m.to_address), 'subject', m.subject, 'text', m.body,
                               'reply_to', v_rt)::text)::extensions.http_request);
      if r.status between 200 and 299 then
        update app.outbound_messages set status = 'sent', sent_at = now(), attempts = attempts + 1,
          provider_ref = (r.content::jsonb ->> 'id'), error = null where id = m.id;
        v_sent := v_sent + 1;
      else
        update app.outbound_messages set attempts = attempts + 1, error = left('HTTP ' || r.status || ' ' || coalesce(r.content, ''), 500),
          status = case when attempts + 1 >= 5 then 'failed' else 'queued' end where id = m.id;
      end if;
    exception when others then
      update app.outbound_messages set attempts = attempts + 1, error = left(sqlerrm, 500),
        status = case when attempts + 1 >= 5 then 'failed' else 'queued' end where id = m.id;
    end;
  end loop;
  return v_sent;
end;
$$;

-- ── order view ──────────────────────────────────────────────────────────────────────────────────
create or replace function app.order_json(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'orderNumber', o.number,
    'status', o.status,
    'createdAt', o.created_at,
    'placedAt', o.placed_at,
    'currency', o.currency,
    'slot', (select app.slot_json(s) from app.delivery_slots s where s.id = o.slot_id),
    'address', o.address_snapshot,
    'deliveryNotes', o.delivery_notes,
    'substitutionDefault', o.substitution_default,
    'ageCheckRequired', o.age_check_required,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'productId', l.product_id, 'slug', p.slug, 'name', l.name_snapshot, 'packSize', l.pack_size_snapshot,
        'image', (select app.image_json(pi.url, pi.alt) from app.product_images pi
                   where pi.product_id = l.product_id order by pi.position limit 1),
        'saleUnit', l.sale_unit, 'quantityOrdered', l.quantity_ordered, 'weightOrderedGrams', l.weight_ordered_grams,
        'quantityPicked', l.quantity_picked, 'weightPickedGrams', l.weight_picked_grams, 'status', l.pick_status,
        'substitutionAllowed', l.substitution_allowed, 'substituteFor', l.substitute_for_line_id,
        'unitPrice', app.money(l.unit_price_minor, o.currency),
        'estimatedTotal', app.money(l.est_gross_minor - l.est_discount_minor, o.currency),
        'finalTotal', case when l.final_gross_minor is not null then app.money(l.final_gross_minor - coalesce(l.final_discount_minor, 0), o.currency) end,
        'vatRateBp', l.vat_rate_bp) order by l.line_no), '[]'::jsonb)
      from app.order_lines l left join app.products p on p.id = l.product_id
     where l.order_id = o.id and l.line_type = 'product'),
    'totals', jsonb_build_object(
      'estimated', jsonb_build_object('items', app.money(o.est_items_minor, o.currency), 'discount', app.money(o.est_discount_minor, o.currency),
                                      'deposit', app.money(o.est_deposit_minor, o.currency), 'delivery', app.money(o.delivery_fee_minor, o.currency),
                                      'vat', app.money(o.est_vat_minor, o.currency), 'total', app.money(o.est_total_minor, o.currency)),
      'final', case when o.final_total_minor is not null then jsonb_build_object(
                     'items', app.money(o.final_items_minor, o.currency), 'discount', app.money(coalesce(o.final_discount_minor, 0), o.currency),
                     'deposit', app.money(coalesce(o.final_deposit_minor, 0), o.currency), 'delivery', app.money(o.delivery_fee_minor, o.currency),
                     'vat', app.money(coalesce(o.final_vat_minor, 0), o.currency), 'total', app.money(o.final_total_minor, o.currency)) end,
      'authorised', app.money(o.authorised_minor, o.currency),
      'captured', case when o.captured_minor is not null then app.money(o.captured_minor, o.currency) end,
      'refunded', app.money(o.refunded_minor, o.currency)),
    'promotions', (select coalesce(jsonb_agg(jsonb_build_object('label', pr.label, 'discount', app.money(r.discount_minor, o.currency),
                                                                 'code', (select c.code from app.coupons c where c.id = r.coupon_id))), '[]'::jsonb)
                     from app.promotion_redemptions r join app.promotions pr on pr.id = r.promotion_id where r.order_id = o.id),
    'payment', (select jsonb_build_object('provider', pm.provider, 'status', pm.status, 'brand', pm.payment_method_snapshot ->> 'brand',
                                          'last4', pm.payment_method_snapshot ->> 'last4', 'wallet', pm.payment_method_snapshot ->> 'wallet')
                  from app.payments pm where pm.order_id = o.id order by pm.created_at desc limit 1),
    'tracking', case when o.status in ('out_for_delivery', 'delivered') then jsonb_build_object(
                  'vanLabel', (select v.name from app.vans v where v.id = o.van_id),
                  'driverFirstName', (select split_part(d.display_name, ' ', 1) from app.drivers d where d.id = o.driver_id),
                  'trackingCode', o.tracking_code, 'etaStart', o.eta_start, 'etaEnd', o.eta_end) end,
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.created_at, h.id), '[]'::jsonb)
                   from app.order_status_history h where h.order_id = o.id),
    'invoice', null,
    'cancelReason', o.cancel_reason,
    'canCancel', o.status in ('pending_payment', 'placed')
                 and coalesce((select s.cutoff_at > now() from app.delivery_slots s where s.id = o.slot_id), true),
    'canReorder', o.status not in ('pending_payment'))
  from app.orders o where o.id = p_order_id
$$;

create or replace function app.my_order(p_order_number text)
returns app.orders
language plpgsql
stable
set search_path = ''
as $$
declare
  o app.orders;
begin
  select * into o from app.orders where number = upper(trim(p_order_number)) and customer_id = app.require_customer();
  if o.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Order not found.'); end if;
  return o;
end;
$$;

-- ── checkout ────────────────────────────────────────────────────────────────────────────────────
create or replace function app.checkout_json(p_checkout_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  k app.checkouts;
  r app.slot_reservations;
  v_cart jsonb;
  v_min  smallint;
begin
  select * into k from app.checkouts where id = p_checkout_id;
  select * into r from app.slot_reservations where id = k.slot_reservation_id;
  v_cart := app.price_cart(k.cart_id, r.slot_id);
  select max(ar.min_age) into v_min
    from app.cart_items ci join app.products p on p.id = ci.product_id
    join app.age_restriction_rules ar on ar.restriction_code = p.age_restriction_code
      and ar.country_code = coalesce(app.setting('default_country') #>> '{}', 'GB')
   where ci.cart_id = k.cart_id;
  return jsonb_build_object(
    'id', k.id,
    'status', k.status,
    'expiresAt', k.expires_at,
    'holdActive', r.status = 'held' and r.expires_at > now(),
    'slot', (select app.slot_json(s) from app.delivery_slots s where s.id = r.slot_id),
    'address', k.address_snapshot,
    'deliveryNotes', k.delivery_notes,
    'substitutionDefault', k.substitution_default,
    'ageCheck', jsonb_build_object('required', v_min is not null, 'minAge', v_min, 'confirmed', k.dob_confirmed_at is not null),
    'cart', v_cart,
    'paymentMode', coalesce(app.setting('payment_mode') #>> '{}', 'stripe'),
    'termsVersion', app.setting('terms_version') #>> '{}');
end;
$$;

-- Holds a place in a slot for this checkout (or raises SLOT_FULL / SLOT_CUTOFF_PASSED).
create or replace function app.hold_slot(p_slot_id uuid, p_cart_id uuid, p_zone_id uuid)
returns app.slot_reservations
language plpgsql
set search_path = ''
as $$
declare
  s app.delivery_slots;
  r app.slot_reservations;
  v_minutes integer := coalesce((app.setting('slot_hold_minutes') #>> '{}')::int, 15);
begin
  select * into s from app.delivery_slots where id = p_slot_id;
  if s.id is null or s.zone_id is distinct from p_zone_id then
    perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('slotId', p_slot_id), 'That delivery slot is not available for your address.');
  end if;
  if s.cutoff_at <= now() or s.status <> 'open' then
    perform app.raise_error('SLOT_CUTOFF_PASSED', 422, jsonb_build_object('slotId', p_slot_id), 'It is too late to book that slot.');
  end if;
  update app.delivery_slots set reserved_count = reserved_count + 1
   where id = p_slot_id and reserved_count < capacity and status = 'open' and cutoff_at > now();
  if not found then
    perform app.raise_error('SLOT_FULL', 409, jsonb_build_object('slotId', p_slot_id), 'That slot has just filled up.');
  end if;
  insert into app.slot_reservations (slot_id, cart_id, status, expires_at)
  values (p_slot_id, p_cart_id, 'held', now() + make_interval(mins => v_minutes))
  returning * into r;
  return r;
end;
$$;

create or replace function app.release_hold(p_reservation_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  with r as (
    update app.slot_reservations set status = 'released'
     where id = p_reservation_id and status = 'held' and order_id is null returning slot_id
  )
  update app.delivery_slots s set reserved_count = greatest(s.reserved_count - 1, 0) from r where s.id = r.slot_id;
end;
$$;

create or replace function app.address_snapshot(a app.addresses)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', a.id, 'label', a.label, 'fullName', a.full_name, 'line1', a.line1, 'line2', a.line2,
    'city', a.city, 'postcode', a.postcode, 'countryCode', a.country_code, 'phone', a.phone_e164, 'deliveryNotes', a.delivery_notes)
$$;

create or replace function api.start_checkout(p_slot_id uuid, p_address_id uuid default null, p_cart_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust  uuid := app.require_customer();
  v_cart  record;
  a       app.addresses;
  v_zone  uuid;
  v_view  jsonb;
  k       app.checkouts;
  r       app.slot_reservations;
  v_pref  text;
begin
  select * into v_cart from app.cart_for_write(p_cart_token);
  if p_address_id is not null then
    select * into a from app.addresses where id = p_address_id and customer_id = v_cust and deleted_at is null;
  else
    select * into a from app.addresses where customer_id = v_cust and deleted_at is null order by is_default desc, created_at limit 1;
  end if;
  if a.id is null then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'ADDRESS_REQUIRED'), 'Please add a delivery address.');
  end if;
  v_zone := app.zone_for_postcode(a.postcode);
  if v_zone is null then
    perform app.raise_error('POSTCODE_NOT_SERVED', 422, jsonb_build_object('postcode', a.postcode), 'We do not deliver to that address yet.');
  end if;
  -- prices, delivery and stock follow the delivery address
  update app.carts set postcode = a.postcode, zone_id = v_zone, updated_at = now() where id = v_cart.cart_id;
  v_view := app.price_cart(v_cart.cart_id, p_slot_id);
  if (v_view ->> 'lineCount')::int = 0 then
    perform app.raise_error('CART_EMPTY', 400, null, 'Your basket is empty.');
  end if;
  if not (v_view -> 'delivery' ->> 'minimumBasketMet')::boolean then
    perform app.raise_error('MINIMUM_BASKET_NOT_MET', 422, jsonb_build_object('minimum', v_view -> 'delivery' -> 'minimumBasket'), 'Below the minimum order.');
  end if;

  -- reuse an open checkout on the same slot; otherwise give its hold back and start again
  select * into k from app.checkouts where cart_id = v_cart.cart_id and status = 'open' order by created_at desc limit 1 for update;
  if k.id is not null then
    select * into r from app.slot_reservations where id = k.slot_reservation_id;
    if r.slot_id = p_slot_id and r.status = 'held' and r.expires_at > now() then
      update app.checkouts set address_snapshot = app.address_snapshot(a),
        delivery_notes = coalesce(delivery_notes, a.delivery_notes), updated_at = now() where id = k.id;
      return app.checkout_json(k.id);
    end if;
    perform app.release_hold(k.slot_reservation_id);
    update app.checkouts set status = 'abandoned', updated_at = now() where id = k.id;
  end if;

  r := app.hold_slot(p_slot_id, v_cart.cart_id, v_zone);
  select p.substitution_default into v_pref from app.customer_preferences p where p.customer_id = v_cust;
  insert into app.checkouts (cart_id, customer_id, slot_reservation_id, address_snapshot, delivery_notes, substitution_default, expires_at)
  values (v_cart.cart_id, v_cust, r.id, app.address_snapshot(a), a.delivery_notes, coalesce(v_pref, 'allow'), r.expires_at)
  returning * into k;
  return app.checkout_json(k.id);
end;
$$;
comment on function api.start_checkout(uuid, uuid, text) is '@access authenticated Begin checkout: reserves a place in the chosen delivery slot for a few minutes and prices the basket for the delivery address.';

create or replace function api.get_checkout(p_checkout_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from app.checkouts k where k.id = p_checkout_id and k.customer_id = app.require_customer()) then
    perform app.raise_error('NOT_FOUND', 404, null, 'Checkout not found.');
  end if;
  return app.checkout_json(p_checkout_id);
end;
$$;
comment on function api.get_checkout(uuid) is '@access authenticated The current checkout: held slot, address, priced basket and what is still needed.';

create or replace function api.update_checkout(p_checkout_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
  k      app.checkouts;
  r      app.slot_reservations;
  a      app.addresses;
  v_zone uuid;
  v_dob  date;
  v_min  smallint;
begin
  select * into k from app.checkouts where id = p_checkout_id and customer_id = v_cust for update;
  if k.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Checkout not found.'); end if;
  if k.status <> 'open' then perform app.raise_error('SLOT_HOLD_EXPIRED', 409, null, 'Your checkout has expired. Please choose a slot again.'); end if;
  select * into r from app.slot_reservations where id = k.slot_reservation_id;

  if p ? 'addressId' then
    select * into a from app.addresses where id = (p ->> 'addressId')::uuid and customer_id = v_cust and deleted_at is null;
    if a.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Address not found.'); end if;
    v_zone := app.zone_for_postcode(a.postcode);
    if v_zone is null then perform app.raise_error('POSTCODE_NOT_SERVED', 422, jsonb_build_object('postcode', a.postcode), 'We do not deliver there.'); end if;
    if v_zone is distinct from (select s.zone_id from app.delivery_slots s where s.id = r.slot_id) and not p ? 'slotId' then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'SLOT_ZONE_MISMATCH'), 'Please choose a slot for the new address.');
    end if;
    update app.carts set postcode = a.postcode, zone_id = v_zone, updated_at = now() where id = k.cart_id;
    update app.checkouts set address_snapshot = app.address_snapshot(a) where id = k.id;
  end if;

  if p ? 'slotId' and (p ->> 'slotId')::uuid is distinct from r.slot_id then
    v_zone := coalesce(v_zone, (select c.zone_id from app.carts c where c.id = k.cart_id));
    perform app.release_hold(r.id);
    r := app.hold_slot((p ->> 'slotId')::uuid, k.cart_id, v_zone);
    update app.checkouts set slot_reservation_id = r.id, expires_at = r.expires_at where id = k.id;
  end if;

  if p ? 'deliveryNotes' then
    update app.checkouts set delivery_notes = left(nullif(trim(p ->> 'deliveryNotes'), ''), 500) where id = k.id;
  end if;
  if p ? 'substitutionDefault' then
    if p ->> 'substitutionDefault' not in ('allow', 'dont_allow') then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('substitutionDefault')), 'Invalid choice.');
    end if;
    update app.checkouts set substitution_default = p ->> 'substitutionDefault' where id = k.id;
  end if;
  if p ? 'dateOfBirth' then
    -- Only the fact that the age was confirmed is kept, never the date of birth itself.
    v_dob := (p ->> 'dateOfBirth')::date;
    select max(ar.min_age) into v_min
      from app.cart_items ci join app.products pr on pr.id = ci.product_id
      join app.age_restriction_rules ar on ar.restriction_code = pr.age_restriction_code
        and ar.country_code = coalesce(app.setting('default_country') #>> '{}', 'GB')
     where ci.cart_id = k.cart_id;
    if v_min is not null and extract(year from age(current_date, v_dob)) < v_min then
      perform app.raise_error('UNDERAGE', 403, jsonb_build_object('minAge', v_min), 'Too young for an item in the basket.');
    end if;
    update app.checkouts set dob_confirmed_at = now() where id = k.id;
  end if;
  update app.checkouts set updated_at = now() where id = k.id;
  return app.checkout_json(k.id);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Some details are not valid.');
  return null;
end;
$$;
comment on function api.update_checkout(uuid, jsonb) is '@access authenticated Change the checkout: { slotId, addressId, deliveryNotes, substitutionDefault, dateOfBirth }. Changing slot moves the reservation.';

create or replace function api.place_order(p_checkout_id uuid, p_idempotency_key uuid, p_accept_terms boolean, p_terms_version text,
                                           p_expected_total_minor integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust     uuid := app.require_customer();
  c          app.customers;
  k          app.checkouts;
  r          app.slot_reservations;
  s          app.delivery_slots;
  z          app.delivery_zones;
  v          jsonb;
  v_line     jsonb;
  v_promo    jsonb;
  v_scope    text := 'place_order:' || v_cust;
  v_hash     text := md5(p_checkout_id::text || coalesce(p_terms_version, ''));
  v_idem     app.idempotency_keys;
  o          app.orders;
  v_line_id  uuid;
  v_no       integer := 0;
  v_country  text := coalesce(app.setting('default_country') #>> '{}', 'GB');
  v_mode     text := coalesce(app.setting('payment_mode') #>> '{}', 'stripe');
  v_buffer   integer := coalesce((app.setting('weighted_auth_buffer_bp') #>> '{}')::int, 1500);
  v_pending  integer := coalesce((app.setting('payment_pending_minutes') #>> '{}')::int, 30);
  v_weight_gross bigint := 0;
  v_auth     bigint;
  v_min_age  smallint;
  v_id_check boolean;
  v_amount   integer;
  v_prod     app.products;
  v_stripe   record;
  v_result   jsonb;
  v_coupon   uuid;
begin
  insert into app.idempotency_keys (scope, key, request_hash, status) values (v_scope, p_idempotency_key, v_hash, 'in_progress')
  on conflict (scope, key) do nothing;
  if not found then
    select * into v_idem from app.idempotency_keys where scope = v_scope and key = p_idempotency_key;
    if v_idem.request_hash <> v_hash then perform app.raise_error('IDEMPOTENCY_KEY_REUSED', 409, null, 'Duplicate request key.'); end if;
    if v_idem.status = 'completed' then return v_idem.response; end if;
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'IN_PROGRESS'), 'Your order is already being placed.');
  end if;

  select * into c from app.customers where id = v_cust;
  select * into k from app.checkouts where id = p_checkout_id and customer_id = v_cust for update;
  if k.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Checkout not found.'); end if;
  select * into r from app.slot_reservations where id = k.slot_reservation_id for update;
  if k.status <> 'open' or r.status <> 'held' or r.expires_at <= now() then
    perform app.raise_error('SLOT_HOLD_EXPIRED', 409, null, 'Your slot reservation expired. Please choose a slot again.');
  end if;
  if not coalesce(p_accept_terms, false) or p_terms_version is distinct from (app.setting('terms_version') #>> '{}') then
    perform app.raise_error('TERMS_NOT_ACCEPTED', 400, jsonb_build_object('termsVersion', app.setting('terms_version') #>> '{}'), 'Please accept the terms.');
  end if;
  if v_mode = 'simulated' and app.is_production() then
    perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('reason', 'SIMULATED_PAYMENTS_IN_PRODUCTION'), 'Payments are not configured.');
  end if;

  select * into s from app.delivery_slots where id = r.slot_id;
  select * into z from app.delivery_zones where id = s.zone_id;
  v := app.price_cart(k.cart_id, s.id);
  if (v ->> 'lineCount')::int = 0 then perform app.raise_error('CART_EMPTY', 400, null, 'Your basket is empty.'); end if;
  if exists (select 1 from jsonb_array_elements(v -> 'lines') l where not (l ->> 'purchasable')::boolean) then
    perform app.raise_error('PRODUCT_UNAVAILABLE', 422, jsonb_build_object('reason', 'UNAVAILABLE_LINES'), 'Remove unavailable items first.');
  end if;
  if not (v -> 'delivery' ->> 'minimumBasketMet')::boolean then
    perform app.raise_error('MINIMUM_BASKET_NOT_MET', 422, jsonb_build_object('minimum', v -> 'delivery' -> 'minimumBasket'), 'Below the minimum order.');
  end if;
  if (select c2.zone_id from app.carts c2 where c2.id = k.cart_id) is distinct from z.id then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'SLOT_ZONE_MISMATCH'), 'Please choose a slot for your address.');
  end if;
  if p_expected_total_minor is not null and p_expected_total_minor <> (v -> 'totals' -> 'total' ->> 'amount')::int then
    perform app.raise_error('PRICE_CHANGED', 409, jsonb_build_object('total', v -> 'totals' -> 'total'), 'The total changed. Please review your order.');
  end if;
  select max(ar.min_age), bool_or(ar.id_check_on_delivery) into v_min_age, v_id_check
    from app.cart_items ci join app.products p on p.id = ci.product_id
    join app.age_restriction_rules ar on ar.restriction_code = p.age_restriction_code and ar.country_code = v_country
   where ci.cart_id = k.cart_id;
  if v_min_age is not null and k.dob_confirmed_at is null then
    perform app.raise_error('AGE_VERIFICATION_REQUIRED', 422, jsonb_build_object('minAge', v_min_age), 'Please confirm your date of birth.');
  end if;

  insert into app.orders (customer_id, location_id, zone_id, slot_id, checkout_id, status, currency, contact_email, contact_phone_e164,
                          address_snapshot, delivery_notes, substitution_default, age_check_required, min_age, id_check_required_on_delivery,
                          est_items_minor, est_discount_minor, est_deposit_minor, delivery_fee_minor, est_total_minor, est_vat_minor)
  values (v_cust, z.location_id, z.id, s.id, k.id, 'pending_payment', v ->> 'currency', c.email,
          coalesce(nullif(k.address_snapshot ->> 'phone', ''), c.phone_e164),
          k.address_snapshot, k.delivery_notes, coalesce(k.substitution_default, 'allow'),
          v_min_age is not null, v_min_age, coalesce(v_id_check, false),
          (v -> 'totals' -> 'itemsSubtotal' ->> 'amount')::int, (v -> 'totals' -> 'discountTotal' ->> 'amount')::int,
          (v -> 'totals' -> 'depositTotal' ->> 'amount')::int, (v -> 'totals' -> 'deliveryFee' ->> 'amount')::int,
          (v -> 'totals' -> 'total' ->> 'amount')::int, (v -> 'totals' -> 'vatTotal' ->> 'amount')::int)
  returning * into o;
  insert into app.order_status_history (order_id, from_status, to_status, actor_type, actor_id) values (o.id, null, 'pending_payment', 'customer', auth.uid());

  -- lines: products (+ their deposits), then delivery charges per VAT rate
  for v_line in select x from jsonb_array_elements(v -> 'lines') x order by (x -> 'product' ->> 'id') loop
    select * into v_prod from app.products where id = (v_line -> 'product' ->> 'id')::uuid;
    v_amount := coalesce((v_line ->> 'quantity')::int, (v_line ->> 'weightGrams')::int);
    -- reserve stock (never oversell: the CHECK reserved <= on_hand backs this up)
    update app.stock_levels set reserved = reserved + v_amount, updated_at = now()
     where location_id = z.location_id and product_id = v_prod.id and on_hand - reserved >= v_amount;
    if not found then
      perform app.raise_error('INSUFFICIENT_STOCK', 409, jsonb_build_object('productId', v_prod.id, 'name', v_line -> 'product' ->> 'name'), 'Not enough stock.');
    end if;
    insert into app.stock_movements (location_id, product_id, delta, reason, affects, ref_type, ref_id, actor_user_id)
    values (z.location_id, v_prod.id, v_amount, 'order_reserve', 'reserved', 'order', o.id, auth.uid());
    if v_prod.sale_unit = 'weight' then v_weight_gross := v_weight_gross + (v_line -> 'lineTotal' ->> 'amount')::bigint; end if;

    v_no := v_no + 1;
    insert into app.order_lines (order_id, line_no, line_type, product_id, name_snapshot, sku_snapshot, pack_size_snapshot, sale_unit,
                                 quantity_ordered, weight_ordered_grams, unit_price_minor, est_gross_minor, est_discount_minor,
                                 tax_category_code, vat_rate_bp, est_vat_minor, substitution_allowed)
    values (o.id, v_no, 'product', v_prod.id, v_line -> 'product' ->> 'name', v_prod.sku, v_prod.pack_size_label, v_prod.sale_unit,
            (v_line ->> 'quantity')::int, (v_line ->> 'weightGrams')::int, (v_line -> 'unitPrice' ->> 'amount')::int,
            (v_line -> 'lineSubtotal' ->> 'amount')::int, (v_line -> 'discount' ->> 'amount')::int,
            v_prod.tax_category_code, (v_line ->> 'vatRateBp')::int, (v_line -> 'vat' ->> 'amount')::int,
            (v_line ->> 'substitutionAllowed')::boolean and coalesce(k.substitution_default, 'allow') = 'allow')
    returning id into v_line_id;
    for v_promo in select * from jsonb_array_elements(v_line -> 'promotions') loop
      insert into app.order_line_promotions (order_line_id, promotion_id, est_discount_minor)
      values (v_line_id, (v_promo ->> 'promotionId')::uuid, (v_promo ->> 'discount')::int);
    end loop;
    if v_line -> 'deposit' is not null and jsonb_typeof(v_line -> 'deposit') = 'object' then
      v_no := v_no + 1;
      insert into app.order_lines (order_id, line_no, line_type, parent_line_id, product_id, name_snapshot, unit_price_minor, est_gross_minor,
                                   tax_category_code, vat_rate_bp, est_vat_minor)
      select o.id, v_no, 'deposit', v_line_id, v_prod.id, ds.name, (v_line -> 'deposit' ->> 'amount')::int, (v_line -> 'deposit' ->> 'amount')::int,
             ds.tax_category_code, app.tax_rate_bp(v_country::char(2), ds.tax_category_code, now()),
             app.vat_from_gross((v_line -> 'deposit' ->> 'amount')::int, app.tax_rate_bp(v_country::char(2), ds.tax_category_code, now()))
        from app.deposit_schemes ds where ds.code = v_prod.deposit_scheme_code;
    end if;
  end loop;
  for v_line in select * from jsonb_array_elements(v -> 'deliveryLines') loop
    v_no := v_no + 1;
    insert into app.order_lines (order_id, line_no, line_type, name_snapshot, unit_price_minor, est_gross_minor, tax_category_code, vat_rate_bp, est_vat_minor)
    values (o.id, v_no, 'delivery', 'Delivery', (v_line -> 'gross' ->> 'amount')::int, (v_line -> 'gross' ->> 'amount')::int,
            (select tr.tax_category_code from app.tax_rates tr where tr.country_code = v_country and tr.rate_bp = (v_line ->> 'rateBp')::int
               and tstzrange(tr.valid_from, tr.valid_to) @> now() order by tr.tax_category_code limit 1),
            (v_line ->> 'rateBp')::int, (v_line -> 'vat' ->> 'amount')::int);
  end loop;

  -- promotions used (coupon usage counted now; given back if the order is cancelled)
  for v_promo in select * from jsonb_array_elements(v -> 'appliedPromotions') loop
    v_coupon := (select co.id from app.coupons co where co.code = v_promo ->> 'code');
    insert into app.promotion_redemptions (promotion_id, coupon_id, order_id, customer_id, discount_minor)
    values ((v_promo ->> 'promotionId')::uuid, v_coupon, o.id, v_cust, (v_promo -> 'discount' ->> 'amount')::int);
    if v_coupon is not null then
      update app.coupons set used_count = used_count + 1 where id = v_coupon and (max_uses is null or used_count < max_uses);
      if not found then perform app.raise_error('COUPON_USAGE_EXCEEDED', 409, jsonb_build_object('code', v_promo ->> 'code'), 'That code has just been used up.'); end if;
    end if;
  end loop;

  -- the slot place now belongs to the order until payment finishes
  update app.slot_reservations set order_id = o.id, expires_at = now() + make_interval(mins => v_pending) where id = r.id;
  update app.checkouts set status = 'placed', updated_at = now() where id = k.id;

  -- authorise the estimate plus a buffer on weighed items (capture later is never more than this)
  v_auth := o.est_total_minor + app.div_round_half_up(v_weight_gross * v_buffer, 10000);
  if v_mode = 'stripe' then
    select * into v_stripe from app.stripe_request('POST', 'payment_intents', jsonb_build_object(
      'amount', v_auth, 'currency', lower(o.currency), 'capture_method', 'manual',
      'automatic_payment_methods[enabled]', 'true',
      'description', 'Varam Foods order ' || o.number,
      'receipt_email', o.contact_email,
      'metadata[order_id]', o.id, 'metadata[order_number]', o.number), 'order-' || o.id::text);
    if v_stripe.status not between 200 and 299 then
      insert into app.payment_sync_log (order_id, operation, http_status, outcome, error_code)
      values (o.id, 'create_intent', v_stripe.status, 'error', v_stripe.body -> 'error' ->> 'code');
      perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('service', 'stripe'), 'Payment could not be started.');
    end if;
    insert into app.payments (order_id, provider, provider_intent_ref, kind, status, currency)
    values (o.id, 'stripe', v_stripe.body ->> 'id', 'authorise_now', 'requires_action', o.currency);
    insert into app.payment_sync_log (order_id, operation, http_status, stripe_object_id, outcome)
    values (o.id, 'create_intent', v_stripe.status, v_stripe.body ->> 'id', 'ok');
    v_result := jsonb_build_object('orderNumber', o.number, 'mode', 'stripe', 'clientSecret', v_stripe.body ->> 'client_secret',
                                   'amount', app.money(v_auth, o.currency));
  else
    insert into app.payments (order_id, provider, kind, status, currency, amount_authorised_minor)
    values (o.id, 'sample', 'authorise_now', 'requires_action', o.currency, 0);
    v_result := jsonb_build_object('orderNumber', o.number, 'mode', 'simulated', 'clientSecret', null, 'amount', app.money(v_auth, o.currency));
  end if;

  update app.idempotency_keys set status = 'completed', response = v_result where scope = v_scope and key = p_idempotency_key;
  perform app.audit('order.placed', 'order', o.id::text, jsonb_build_object('number', o.number, 'total', o.est_total_minor, 'mode', v_mode));
  return v_result;
end;
$$;
comment on function api.place_order(uuid, uuid, boolean, text, integer) is '@access authenticated Place the order: re-prices, reserves stock, writes the order and opens the card payment (manual capture). Idempotent per key. Returns the Stripe client secret, or mode "simulated" in testing.';

-- Finishes the payment step for one order (called by the browser after Stripe.js, and by the reconciler).
create or replace function app.finalise_payment(p_order_id uuid, p_actor text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  o        app.orders;
  pm       app.payments;
  v_stripe record;
  v_status text;
  v_auth   bigint;
  v_card   jsonb;
  c        app.customers;
begin
  select * into o from app.orders where id = p_order_id for update;
  if o.status <> 'pending_payment' then return o.status; end if;
  select * into pm from app.payments where order_id = o.id order by created_at desc limit 1 for update;

  if pm.provider = 'sample' then
    v_auth := o.est_total_minor + app.div_round_half_up(
      (select coalesce(sum(l.est_gross_minor - l.est_discount_minor), 0) from app.order_lines l where l.order_id = o.id and l.sale_unit = 'weight')
      * coalesce((app.setting('weighted_auth_buffer_bp') #>> '{}')::int, 1500), 10000);
    v_status := 'requires_capture';
    v_card := jsonb_build_object('brand', 'test', 'last4', '0000');
  else
    select * into v_stripe from app.stripe_request('GET', 'payment_intents/' || pm.provider_intent_ref || '?expand[]=latest_charge');
    insert into app.payment_sync_log (order_id, payment_id, operation, http_status, stripe_object_id, outcome)
    values (o.id, pm.id, 'retrieve_intent', v_stripe.status, pm.provider_intent_ref,
            case when v_stripe.status between 200 and 299 then 'ok' else 'error' end);
    if v_stripe.status not between 200 and 299 then return 'pending_payment'; end if;
    v_status := v_stripe.body ->> 'status';
    -- verify it is really this order's payment, in our currency
    if v_stripe.body -> 'metadata' ->> 'order_id' is distinct from o.id::text or upper(v_stripe.body ->> 'currency') <> o.currency then
      insert into app.payment_sync_log (order_id, payment_id, operation, outcome, error_code) values (o.id, pm.id, 'verify', 'mismatch', 'ORDER_OR_CURRENCY');
      return 'pending_payment';
    end if;
    v_auth := (v_stripe.body ->> 'amount_capturable')::bigint;
    v_card := jsonb_build_object(
      'brand', v_stripe.body -> 'latest_charge' -> 'payment_method_details' -> 'card' ->> 'brand',
      'last4', v_stripe.body -> 'latest_charge' -> 'payment_method_details' -> 'card' ->> 'last4',
      'wallet', v_stripe.body -> 'latest_charge' -> 'payment_method_details' -> 'card' -> 'wallet' ->> 'type');
  end if;

  if v_status = 'requires_capture' and v_auth >= o.est_total_minor then
    update app.payments set status = 'authorised', amount_authorised_minor = v_auth, authorised_at = now(),
      auth_expires_at = now() + make_interval(hours => coalesce((app.setting('card_auth_validity_hours') #>> '{}')::int, 168)),
      payment_method_snapshot = v_card, updated_at = now() where id = pm.id;
    update app.orders set authorised_minor = v_auth where id = o.id;
    perform app.transition_order(o.id, 'placed', 'payment', null);
    update app.slot_reservations set status = 'booked' where order_id = o.id and status = 'held';
    update app.carts set status = 'converted', updated_at = now() where id = (select k.cart_id from app.checkouts k where k.id = o.checkout_id);
    select * into c from app.customers where id = o.customer_id;
    perform app.queue_message('order_confirmation', 'email', o.contact_email, jsonb_build_object(
      'order_number', o.number,
      'first_name', coalesce(c.first_name, ''),
      'slot', (select to_char(s.starts_at at time zone 'Europe/London', 'Dy DD Mon, HH24:MI') || '–' || to_char(s.ends_at at time zone 'Europe/London', 'HH24:MI')
                 from app.delivery_slots s where s.id = o.slot_id),
      'address', concat_ws(', ', o.address_snapshot ->> 'line1', o.address_snapshot ->> 'city', o.address_snapshot ->> 'postcode'),
      'items', (select string_agg(coalesce(l.quantity_ordered::text || ' × ', round(l.weight_ordered_grams / 1000.0, 2)::text || ' kg ') || l.name_snapshot, E'\n' order by l.line_no)
                  from app.order_lines l where l.order_id = o.id and l.line_type = 'product'),
      'total', '£' || to_char(o.est_total_minor / 100.0, 'FM999990.00'),
      'weight_note', case when exists (select 1 from app.order_lines l where l.order_id = o.id and l.sale_unit = 'weight')
                          then 'Weighed items are charged by their exact weight when we pick your order.' else '' end,
      'order_url', rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/') || '/account/orders/' || o.number), o.customer_id, o.id);
    return 'placed';
  elsif v_status in ('requires_payment_method', 'canceled') then
    update app.payments set status = 'failed', failure_code = v_status, updated_at = now() where id = pm.id;
    perform app.release_order_holds(o.id);
    perform app.transition_order(o.id, 'cancelled', 'payment', 'payment_failed');
    return 'payment_failed';
  end if;
  return 'pending_payment';
end;
$$;

create or replace function api.confirm_order_payment(p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o       app.orders := app.my_order(p_order_number);
  v_state text;
begin
  v_state := app.finalise_payment(o.id, 'customer');
  if v_state = 'payment_failed' then
    perform app.raise_error('PAYMENT_FAILED', 402, jsonb_build_object('orderNumber', o.number), 'The payment did not go through.');
  end if;
  return app.order_json(o.id) || jsonb_build_object('paymentState', v_state);
end;
$$;
comment on function api.confirm_order_payment(text) is '@access authenticated After the card step: Postgres checks the payment with Stripe itself and, if authorised, confirms the order and books the slot.';

create or replace function app.reconcile_pending_payments()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  o       app.orders;
  v_n     integer := 0;
  v_state text;
  v_mins  integer := coalesce((app.setting('payment_pending_minutes') #>> '{}')::int, 30);
begin
  for o in select * from app.orders where status = 'pending_payment' and created_at < now() - interval '2 minutes' order by created_at limit 50 loop
    begin
      v_state := app.finalise_payment(o.id, 'system');
      if v_state = 'pending_payment' and o.created_at < now() - make_interval(mins => v_mins) then
        -- give up: cancel the card hold at Stripe (if any), free stock and slot
        if exists (select 1 from app.payments p where p.order_id = o.id and p.provider = 'stripe' and p.provider_intent_ref is not null) then
          perform app.stripe_request('POST', 'payment_intents/' || (select p.provider_intent_ref from app.payments p where p.order_id = o.id order by p.created_at desc limit 1) || '/cancel', null, 'cancel-' || o.id::text);
        end if;
        update app.payments set status = 'expired', updated_at = now() where order_id = o.id and status = 'requires_action';
        perform app.release_order_holds(o.id);
        perform app.transition_order(o.id, 'cancelled', 'system', 'payment_not_completed');
      end if;
      v_n := v_n + 1;
    exception when others then
      insert into app.payment_sync_log (order_id, operation, outcome, error_code) values (o.id, 'reconcile', 'error', left(sqlerrm, 100));
    end;
  end loop;
  return v_n;
end;
$$;

create or replace function api.cancel_my_order(p_order_number text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o  app.orders := app.my_order(p_order_number);
  pm app.payments;
  c  app.customers;
begin
  select * into o from app.orders where id = o.id for update;
  if o.status not in ('pending_payment', 'placed')
     or coalesce((select s.cutoff_at <= now() from app.delivery_slots s where s.id = o.slot_id), false) then
    perform app.raise_error('ORDER_NOT_CANCELLABLE', 422, jsonb_build_object('status', o.status), 'This order can no longer be cancelled.');
  end if;
  select * into pm from app.payments where order_id = o.id order by created_at desc limit 1;
  if pm.provider = 'stripe' and pm.provider_intent_ref is not null and pm.status in ('requires_action', 'authorised') then
    perform app.stripe_request('POST', 'payment_intents/' || pm.provider_intent_ref || '/cancel', null, 'cancel-' || o.id::text);
  end if;
  update app.payments set status = 'voided', updated_at = now() where id = pm.id and status in ('requires_action', 'authorised');
  perform app.release_order_holds(o.id);
  perform app.transition_order(o.id, 'cancelled', 'customer', coalesce(left(p_reason, 200), 'cancelled_by_customer'));
  select * into c from app.customers where id = o.customer_id;
  perform app.queue_message('order_cancelled', 'email', o.contact_email,
    jsonb_build_object('order_number', o.number, 'first_name', coalesce(c.first_name, ''), 'reason', ''), o.customer_id, o.id);
  return app.order_json(o.id);
end;
$$;
comment on function api.cancel_my_order(text, text) is '@access authenticated Cancel an order before its slot cut-off and before picking starts. Releases the card hold, stock and slot.';

create or replace function api.list_my_orders(p_state text default 'active', p_limit integer default 20, p_cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cust   uuid := app.require_customer();
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := coalesce(nullif(p_cursor, '')::int, 0);
  v_states text[] := case when p_state = 'past' then array['delivered', 'cancelled', 'refunded', 'partially_refunded']
                          else array['pending_payment', 'placed', 'picking', 'picked', 'paid', 'out_for_delivery'] end;
  v_total  integer;
begin
  select count(*) into v_total from app.orders o where o.customer_id = v_cust and o.status = any (v_states);
  return jsonb_build_object(
    'total', v_total,
    'nextCursor', case when v_offset + v_limit < v_total then (v_offset + v_limit)::text end,
    'items', (select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
      select o.created_at, jsonb_build_object(
        'orderNumber', o.number, 'status', o.status, 'createdAt', o.created_at, 'placedAt', o.placed_at,
        'slot', (select app.slot_json(s) from app.delivery_slots s where s.id = o.slot_id),
        'total', app.money(coalesce(o.final_total_minor, o.est_total_minor), o.currency),
        'isFinal', o.final_total_minor is not null,
        'itemCount', (select count(*)::int from app.order_lines l where l.order_id = o.id and l.line_type = 'product'),
        'images', (select coalesce(jsonb_agg(img.j), '[]'::jsonb) from (
                     select (select app.image_json(pi.url, pi.alt) from app.product_images pi
                              where pi.product_id = l.product_id order by pi.position limit 1) as j
                       from app.order_lines l where l.order_id = o.id and l.line_type = 'product' order by l.line_no limit 4) img)) as j
      from app.orders o where o.customer_id = v_cust and o.status = any (v_states)
      order by o.created_at desc limit v_limit offset v_offset) x));
end;
$$;
comment on function api.list_my_orders(text, integer, text) is '@access authenticated The customer''s orders: "active" (not yet delivered) or "past".';

create or replace function api.get_my_order(p_order_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return app.order_json((app.my_order(p_order_number)).id);
end;
$$;
comment on function api.get_my_order(text) is '@access authenticated One order in full: lines, slot, totals, payment, delivery tracking and timeline.';

create or replace function api.reorder(p_order_number text, p_cart_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o         app.orders := app.my_order(p_order_number);
  l         app.order_lines;
  v_cart    record;
  v_skipped jsonb := '[]'::jsonb;
begin
  select * into v_cart from app.cart_for_write(p_cart_token);
  for l in select * from app.order_lines where order_id = o.id and line_type = 'product' and substitute_for_line_id is null order by line_no loop
    begin
      perform api.add_cart_item(l.product_id, l.quantity_ordered, l.weight_ordered_grams, l.substitution_allowed, v_cart.cart_token);
    exception when sqlstate 'PT400' or sqlstate 'PT404' or sqlstate 'PT409' or sqlstate 'PT422' then
      v_skipped := v_skipped || jsonb_build_object('name', l.name_snapshot, 'reason', sqlerrm);
    end;
  end loop;
  return app.cart_view(v_cart.cart_id, v_cart.cart_token) || jsonb_build_object('skipped', v_skipped);
end;
$$;
comment on function api.reorder(text, text) is '@access authenticated Put everything from a past order back in the basket (unavailable items are skipped and listed).';

-- ── advanced: buy it again, bought together ─────────────────────────────────────────────────────
create or replace function api.list_buy_again(p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  return (select coalesce(jsonb_agg(app.product_summary_json(x.product_id, null, null) order by x.times desc, x.last_at desc), '[]'::jsonb)
            from (select l.product_id, count(distinct o.id) as times, max(o.created_at) as last_at
                    from app.orders o join app.order_lines l on l.order_id = o.id and l.line_type = 'product'
                    join app.products p on p.id = l.product_id and p.status = 'active'
                   where o.customer_id = v_cust and o.status not in ('pending_payment', 'cancelled')
                   group by l.product_id
                   order by count(distinct o.id) desc, max(o.created_at) desc
                   limit least(greatest(coalesce(p_limit, 12), 1), 40)) x);
end;
$$;
comment on function api.list_buy_again(integer) is '@access authenticated Products the customer buys most often, for a "Buy it again" row.';

create or replace function api.list_bought_together(p_product_id uuid, p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.product_summary_json(x.product_id, null, null) order by x.n desc), '[]'::jsonb)
  from (select l2.product_id, count(*) as n
          from app.order_lines l1
          join app.orders o on o.id = l1.order_id and o.status not in ('pending_payment', 'cancelled')
          join app.order_lines l2 on l2.order_id = l1.order_id and l2.line_type = 'product' and l2.product_id <> l1.product_id
          join app.products p on p.id = l2.product_id and p.status = 'active'
         where l1.product_id = p_product_id and l1.line_type = 'product'
         group by l2.product_id
         order by count(*) desc
         limit least(greatest(coalesce(p_limit, 6), 1), 20)) x
$$;
comment on function api.list_bought_together(uuid, integer) is '@access anon Products often bought in the same order as this one.';

-- ── jobs ────────────────────────────────────────────────────────────────────────────────────────
select app.generate_delivery_slots();
select cron.schedule('generate-delivery-slots', '7 * * * *', $$ select app.generate_delivery_slots() $$);
select cron.schedule('release-expired-slot-holds', '* * * * *', $$ select app.release_expired_holds() $$);
select cron.schedule('reconcile-pending-payments', '* * * * *', $$ select app.reconcile_pending_payments() $$);
select cron.schedule('send-outbox', '* * * * *', $$ select app.send_outbox() $$);

select app.harden();
