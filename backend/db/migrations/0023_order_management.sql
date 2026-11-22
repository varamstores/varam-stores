-- 0023 End-to-end order management (Phase 7): picking (weights, shortages, substitutes at the
--      lower of the two prices), final pricing, capture ≤ authorised, stock movements, loyalty
--      earning, invoices (once the legal entity is saved and invoices are switched on), dispatch,
--      delivery with ID check, refunds with credit notes and loyalty reversal, staff/admin order tools.
--
-- Final discounts: promotions given at order time are scaled by what was actually picked
-- (a line picked at half its estimate keeps half its discount). Delivery is charged as ordered.

insert into app.message_templates (code, channel, locale, name, is_marketing, subject, body) values
  ('order_picked', 'email', 'en-GB', 'Order: packed', false, 'Order {{order_number}} is packed',
   E'Hi {{first_name}},\n\nWe have packed your order {{order_number}}.\n\n{{changes}}\n\nFinal total: {{total}} (we have taken this amount from your card).\n\nDelivery: {{slot}}\n\nVaram Foods'),
  ('order_dispatched', 'email', 'en-GB', 'Order: on the way', false, 'Order {{order_number}} is on the way',
   E'Hi {{first_name}},\n\nYour order {{order_number}} is on its way{{eta}}.\n{{id_note}}\n\nTrack it: {{order_url}}\n\nVaram Foods'),
  ('order_delivered', 'email', 'en-GB', 'Order: delivered', false, 'Order {{order_number}} delivered',
   E'Hi {{first_name}},\n\nYour order {{order_number}} has been delivered. Enjoy!\n\nTell us how it was: {{order_url}}\n\nVaram Foods'),
  ('refund_issued', 'email', 'en-GB', 'Refund issued', false, 'Refund for order {{order_number}}',
   E'Hi {{first_name}},\n\nWe have refunded {{amount}} for order {{order_number}}. {{reason}}\nIt can take 5–10 working days to show on your statement.\n\nVaram Foods')
on conflict (code, channel, locale) do nothing;

-- ── staff order view ────────────────────────────────────────────────────────────────────────────
create or replace function app.staff_order_json(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select app.order_json(o.id) || jsonb_build_object(
    'customer', (select jsonb_build_object('id', c.id, 'name', concat_ws(' ', c.first_name, c.last_name), 'email', c.email,
                                           'phone', c.phone_e164, 'status', c.status, 'isSample', c.is_sample)
                   from app.customers c where c.id = o.customer_id),
    'contact', jsonb_build_object('email', o.contact_email, 'phone', o.contact_phone_e164),
    'isSample', o.is_sample,
    'minAge', o.min_age,
    'idCheckRequired', o.id_check_required_on_delivery,
    'idCheckedAt', o.id_checked_at,
    'van', (select jsonb_build_object('id', v.id, 'code', v.code, 'name', v.name) from app.vans v where v.id = o.van_id),
    'driver', (select jsonb_build_object('id', d.id, 'name', d.display_name) from app.drivers d where d.id = o.driver_id),
    'staffLines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'lineNo', l.line_no, 'type', l.line_type, 'productId', l.product_id, 'sku', l.sku_snapshot, 'name', l.name_snapshot,
        'packSize', l.pack_size_snapshot, 'saleUnit', l.sale_unit, 'quantityOrdered', l.quantity_ordered, 'weightOrderedGrams', l.weight_ordered_grams,
        'quantityPicked', l.quantity_picked, 'weightPickedGrams', l.weight_picked_grams, 'status', l.pick_status,
        'substitutionAllowed', l.substitution_allowed, 'substituteFor', l.substitute_for_line_id,
        'unitPrice', app.money(l.unit_price_minor, o.currency), 'estGross', app.money(l.est_gross_minor, o.currency),
        'estDiscount', app.money(l.est_discount_minor, o.currency),
        'finalGross', case when l.final_gross_minor is not null then app.money(l.final_gross_minor, o.currency) end,
        'vatRateBp', l.vat_rate_bp,
        'pickedBy', (select s.full_name from app.staff s where s.id = l.picked_by), 'pickedAt', l.picked_at) order by l.line_no), '[]'::jsonb)
      from app.order_lines l where l.order_id = o.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'provider', p.provider, 'status', p.status, 'intent', p.provider_intent_ref,
                   'authorised', app.money(p.amount_authorised_minor, p.currency), 'captured', case when p.amount_captured_minor is not null then app.money(p.amount_captured_minor, p.currency) end,
                   'authExpiresAt', p.auth_expires_at, 'createdAt', p.created_at) order by p.created_at), '[]'::jsonb) from app.payments p where p.order_id = o.id),
    'refunds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'amount', app.money(r.amount_minor, o.currency), 'status', r.status, 'createdAt', r.created_at) order by r.created_at), '[]'::jsonb)
                  from app.refunds r join app.payments p on p.id = r.payment_id where p.order_id = o.id),
    'refundRequests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'reason', q.reason, 'amount', case when q.amount_minor is not null then app.money(q.amount_minor, o.currency) end,
                         'lines', q.lines, 'requestedBy', (select s.full_name from app.staff s where s.id = q.requested_by), 'createdAt', q.created_at) order by q.created_at), '[]'::jsonb)
                         from app.refund_requests q where q.order_id = o.id),
    'invoice', (select jsonb_build_object('id', i.id, 'number', i.number, 'issuedAt', i.issued_at, 'gross', app.money(i.gross_minor, i.currency)) from app.invoices i where i.order_id = o.id),
    'creditNotes', (select coalesce(jsonb_agg(jsonb_build_object('number', cn.number, 'issuedAt', cn.issued_at, 'gross', app.money(cn.gross_minor, cn.currency)) order by cn.issued_at), '[]'::jsonb)
                      from app.credit_notes cn join app.invoices i on i.id = cn.invoice_id where i.order_id = o.id),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('channel', m.channel, 'template', m.template_code, 'subject', m.subject, 'status', m.status, 'createdAt', m.created_at) order by m.created_at), '[]'::jsonb)
                   from app.outbound_messages m where m.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'actorType', h.actor_type,
                   'actor', coalesce((select s.full_name from app.staff s where s.user_id = h.actor_id or s.id = h.actor_id limit 1), h.actor_type),
                   'reason', h.reason, 'at', h.created_at) order by h.created_at, h.id), '[]'::jsonb) from app.order_status_history h where h.order_id = o.id))
  from app.orders o where o.id = p_order_id
$$;

create or replace function app.order_for_staff(p_order_id uuid, p_lock boolean default false)
returns app.orders
language plpgsql
set search_path = ''
as $$
declare
  o app.orders;
begin
  if p_lock then
    select * into o from app.orders where id = p_order_id for update;
  else
    select * into o from app.orders where id = p_order_id;
  end if;
  if o.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Order not found.'); end if;
  return o;
end;
$$;

create or replace function app.order_email_vars(o app.orders)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number', o.number,
    'first_name', coalesce((select c.first_name from app.customers c where c.id = o.customer_id), ''),
    'slot', (select to_char(s.starts_at at time zone 'Europe/London', 'Dy DD Mon, HH24:MI') || '–' || to_char(s.ends_at at time zone 'Europe/London', 'HH24:MI')
               from app.delivery_slots s where s.id = o.slot_id),
    'order_url', rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/') || '/account/orders/' || o.number)
$$;

-- ── picking ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.staff_picking_queue(p_date date default null, p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Europe/London')::date);
begin
  perform app.require_permission('packing_queue');
  return (select coalesce(jsonb_agg(x.j order by x.starts_at nulls last, x.created_at), '[]'::jsonb) from (
    select s.starts_at, o.created_at, jsonb_build_object(
      'id', o.id, 'orderNumber', o.number, 'status', o.status,
      'slot', app.slot_json(s),
      'customer', (select concat_ws(' ', c.first_name, left(c.last_name, 1) || '.') from app.customers c where c.id = o.customer_id),
      'zone', (select z.name from app.delivery_zones z where z.id = o.zone_id),
      'lineCount', (select count(*)::int from app.order_lines l where l.order_id = o.id and l.line_type = 'product'),
      'pickedCount', (select count(*)::int from app.order_lines l where l.order_id = o.id and l.line_type = 'product' and l.pick_status <> 'pending'),
      'hasWeighed', exists (select 1 from app.order_lines l where l.order_id = o.id and l.sale_unit = 'weight'),
      'ageCheck', o.age_check_required, 'notes', o.delivery_notes, 'substitutionDefault', o.substitution_default,
      'total', app.money(o.est_total_minor, o.currency)) as j
    from app.orders o left join app.delivery_slots s on s.id = o.slot_id
    where (p_status is null and o.status in ('placed', 'picking', 'picked') or o.status = p_status)
      and (s.id is null or (s.starts_at at time zone 'Europe/London')::date = v_date)) x);
end;
$$;
comment on function api.staff_picking_queue(date, text) is '@access staff Orders to pick for a delivery day (default today), in slot order. Permission: packing_queue.';

create or replace function api.staff_get_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('packing_queue') or app.has_permission('order_status') or app.has_permission('orders_dispatch') or app.has_permission('refund_requests')) then
    perform app.require_permission('order_status');
  end if;
  if not exists (select 1 from app.orders o where o.id = p_order_id) then
    perform app.raise_error('NOT_FOUND', 404, null, 'Order not found.');
  end if;
  return app.staff_order_json(p_order_id);
end;
$$;
comment on function api.staff_get_order(uuid) is '@access staff One order with everything staff need: lines and picks, customer contact, payments, refunds, messages, history.';

create or replace function api.staff_start_picking(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('packing_queue');
  perform app.transition_order(p_order_id, 'picking', 'staff', null);
  perform app.audit('order.picking_started', 'order', p_order_id::text, '{}'::jsonb);
  return app.staff_order_json(p_order_id);
end;
$$;
comment on function api.staff_start_picking(uuid) is '@access staff Start picking an order (placed → picking). Permission: packing_queue.';

create or replace function api.staff_record_pick(p_order_id uuid, p_line_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff  uuid := app.require_permission('barcode_picking');
  o        app.orders := app.order_for_staff(p_order_id, true);
  l        app.order_lines;
  sp       app.products;
  v_status text := p ->> 'status';
  v_qty    integer;
  v_wt     integer;
  v_price  integer;
  v_subst  integer;
  v_no     smallint;
  v_rule   text := coalesce(app.setting('substitution_pricing') #>> '{}', 'lower_of_two');
begin
  if o.status <> 'picking' then
    perform app.raise_error('INVALID_STATUS_TRANSITION', 409, jsonb_build_object('status', o.status), 'Start picking first.');
  end if;
  select * into l from app.order_lines where id = p_line_id and order_id = o.id and line_type = 'product' for update;
  if l.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Line not found.'); end if;
  if l.substitute_for_line_id is not null then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'SUBSTITUTE_LINE'), 'Change the original line instead.');
  end if;
  -- undo an earlier substitute for this line, if any
  delete from app.order_lines where substitute_for_line_id = l.id;

  if v_status = 'picked' or v_status = 'short' then
    if l.sale_unit = 'weight' then
      v_wt := (p ->> 'weightGrams')::int;
      if v_wt is null or v_wt <= 0 then perform app.raise_error('QUANTITY_INVALID', 400, jsonb_build_object('field', 'weightGrams'), 'Enter the weight picked.'); end if;
      update app.order_lines set pick_status = 'picked', weight_picked_grams = v_wt, quantity_picked = null,
        final_gross_minor = app.weight_price(unit_price_minor, v_wt), picked_by = v_staff, picked_at = now() where id = l.id;
    else
      v_qty := coalesce((p ->> 'quantity')::int, l.quantity_ordered);
      if v_qty < 0 or v_qty > l.quantity_ordered then
        perform app.raise_error('QUANTITY_INVALID', 400, jsonb_build_object('max', l.quantity_ordered), 'Picked quantity must be between 0 and the ordered quantity.');
      end if;
      update app.order_lines set pick_status = case when v_qty = 0 then 'missing' when v_qty < l.quantity_ordered then 'short' else 'picked' end,
        quantity_picked = v_qty, final_gross_minor = unit_price_minor * v_qty, picked_by = v_staff, picked_at = now() where id = l.id;
    end if;
  elsif v_status = 'missing' then
    update app.order_lines set pick_status = 'missing', quantity_picked = case when sale_unit = 'each' then 0 end,
      weight_picked_grams = case when sale_unit = 'weight' then 0 end, final_gross_minor = 0, picked_by = v_staff, picked_at = now() where id = l.id;
  elsif v_status = 'substituted' then
    if not l.substitution_allowed then
      perform app.raise_error('SUBSTITUTION_NOT_ALLOWED', 422, jsonb_build_object('lineId', l.id), 'The customer did not allow a substitute for this item.');
    end if;
    select * into sp from app.products where id = (p ->> 'substituteProductId')::uuid and status = 'active';
    if sp.id is null then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Substitute product not found.'); end if;
    v_subst := app.current_price_minor(sp.id);
    if v_subst is null then perform app.raise_error('PRODUCT_UNAVAILABLE', 422, null, 'Substitute has no price.'); end if;
    -- the customer pays the lower of the two (per unit / per kg), unless settings say otherwise
    v_price := case when v_rule = 'lower_of_two' then least(v_subst, l.unit_price_minor) else v_subst end;
    if sp.sale_unit = 'weight' then
      v_wt := coalesce((p ->> 'substituteWeightGrams')::int, l.weight_ordered_grams, sp.estimated_weight_grams);
      if v_wt is null or v_wt <= 0 then perform app.raise_error('QUANTITY_INVALID', 400, jsonb_build_object('field', 'substituteWeightGrams'), 'Enter the substitute weight.'); end if;
    else
      v_qty := coalesce((p ->> 'substituteQuantity')::int, l.quantity_ordered, 1);
      if v_qty <= 0 then perform app.raise_error('QUANTITY_INVALID', 400, jsonb_build_object('field', 'substituteQuantity'), 'Enter the substitute quantity.'); end if;
    end if;
    update app.order_lines set pick_status = 'substituted', quantity_picked = case when sale_unit = 'each' then 0 end,
      weight_picked_grams = case when sale_unit = 'weight' then 0 end, final_gross_minor = 0, picked_by = v_staff, picked_at = now() where id = l.id;
    select max(line_no) + 1 into v_no from app.order_lines where order_id = o.id;
    insert into app.order_lines (order_id, line_no, line_type, substitute_for_line_id, product_id, name_snapshot, sku_snapshot, pack_size_snapshot,
                                 sale_unit, quantity_ordered, weight_ordered_grams, quantity_picked, weight_picked_grams, unit_price_minor,
                                 est_gross_minor, est_discount_minor, final_gross_minor, tax_category_code, vat_rate_bp, est_vat_minor,
                                 substitution_allowed, pick_status, picked_by, picked_at)
    values (o.id, v_no, 'product', l.id, sp.id,
            coalesce((select t.name from app.product_translations t where t.product_id = sp.id order by (t.locale = 'en-GB') desc limit 1), sp.sku),
            sp.sku, sp.pack_size_label, sp.sale_unit,
            case when sp.sale_unit = 'each' then v_qty end, case when sp.sale_unit = 'weight' then v_wt end,
            case when sp.sale_unit = 'each' then v_qty end, case when sp.sale_unit = 'weight' then v_wt end,
            v_price, 0, 0,
            case when sp.sale_unit = 'weight' then app.weight_price(v_price, v_wt) else v_price::bigint * v_qty end,
            sp.tax_category_code, app.tax_rate_bp(coalesce(app.setting('default_country') #>> '{}', 'GB')::char(2), sp.tax_category_code, now()), 0,
            false, 'picked', v_staff, now());
  else
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('status')), 'Status must be picked, short, missing or substituted.');
  end if;
  return app.staff_order_json(o.id);
exception when invalid_text_representation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Invalid pick details.');
  return null;
end;
$$;
comment on function api.staff_record_pick(uuid, uuid, jsonb) is '@access staff Record a line: { status: picked|short|missing|substituted, quantity | weightGrams, substituteProductId, substituteQuantity | substituteWeightGrams }. Permission: barcode_picking.';

-- Issues the VAT invoice for an order (only when invoices are on and a legal entity is set up).
create or replace function app.issue_invoice(p_order_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  o    app.orders;
  le   app.legal_entities;
  v_id uuid;
  v_no text;
begin
  if not coalesce((app.setting('invoices_enabled'))::boolean, false) then return null; end if;
  select * into o from app.orders where id = p_order_id;
  if o.final_total_minor is null or exists (select 1 from app.invoices i where i.order_id = o.id) then return null; end if;
  select * into le from app.legal_entities where is_active order by created_at limit 1;
  if le.id is null then return null; end if;
  v_no := app.next_document_number(le.id, 'invoice');
  insert into app.invoices (legal_entity_id, number, order_id, currency, seller_snapshot, buyer_snapshot, net_minor, vat_minor, gross_minor, vat_breakdown)
  select le.id, v_no, o.id, o.currency,
         jsonb_build_object('name', le.name, 'companyNumber', le.company_number, 'vatNumber', le.vat_number, 'address', le.registered_address),
         jsonb_build_object('name', o.address_snapshot ->> 'fullName', 'address', o.address_snapshot, 'email', o.contact_email),
         sum(x.gross - x.vat), sum(x.vat), sum(x.gross),
         (select jsonb_agg(jsonb_build_object('rateBp', y.rate, 'net', y.gross - y.vat, 'vat', y.vat, 'gross', y.gross) order by y.rate) from (
            select l.vat_rate_bp as rate, sum(coalesce(l.final_gross_minor, l.est_gross_minor) - coalesce(l.final_discount_minor, l.est_discount_minor))::int as gross,
                   sum(coalesce(l.final_vat_minor, l.est_vat_minor))::int as vat
              from app.order_lines l where l.order_id = o.id and coalesce(l.final_gross_minor, l.est_gross_minor) > 0 group by l.vat_rate_bp) y)
    from (select coalesce(l.final_gross_minor, l.est_gross_minor) - coalesce(l.final_discount_minor, l.est_discount_minor) as gross,
                 coalesce(l.final_vat_minor, l.est_vat_minor) as vat
            from app.order_lines l where l.order_id = o.id and coalesce(l.final_gross_minor, l.est_gross_minor) > 0) x
  returning id into v_id;
  insert into app.invoice_lines (invoice_id, line_no, description, quantity, unit_price_minor, vat_rate_bp, net_minor, vat_minor, gross_minor)
  select v_id, row_number() over (order by l.line_no), l.name_snapshot,
         case when l.sale_unit = 'weight' then round(coalesce(l.weight_picked_grams, l.weight_ordered_grams) / 1000.0, 3) else coalesce(l.quantity_picked, l.quantity_ordered, 1) end,
         l.unit_price_minor, l.vat_rate_bp,
         (coalesce(l.final_gross_minor, l.est_gross_minor) - coalesce(l.final_discount_minor, l.est_discount_minor)) - coalesce(l.final_vat_minor, l.est_vat_minor),
         coalesce(l.final_vat_minor, l.est_vat_minor),
         coalesce(l.final_gross_minor, l.est_gross_minor) - coalesce(l.final_discount_minor, l.est_discount_minor)
    from app.order_lines l where l.order_id = o.id and coalesce(l.final_gross_minor, l.est_gross_minor) > 0;
  return v_id;
end;
$$;

-- Awards loyalty points on captured product spend (D25), with the tier's multiplier.
create or replace function app.award_loyalty(p_order_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  o        app.orders;
  a        app.loyalty_accounts;
  v_spend  bigint;
  v_points integer;
  v_mult   integer;
begin
  if not coalesce((app.setting('loyalty_enabled'))::boolean, false) then return 0; end if;
  select * into o from app.orders where id = p_order_id;
  if o.customer_id is null or exists (select 1 from app.loyalty_transactions t where t.order_id = o.id and t.reason = 'order_earn') then return 0; end if;
  select least(coalesce(sum(l.final_gross_minor - coalesce(l.final_discount_minor, 0)), 0), coalesce(o.captured_minor, 0)) into v_spend
    from app.order_lines l where l.order_id = o.id and l.line_type = 'product';
  select * into a from app.loyalty_accounts where customer_id = o.customer_id for update;
  if a.customer_id is null then
    insert into app.loyalty_accounts (customer_id) values (o.customer_id) returning * into a;
  end if;
  select coalesce(t.earn_multiplier_bp, 10000) into v_mult from app.loyalty_tiers t where t.code = a.tier_code;
  v_points := floor((v_spend / 100.0) * coalesce((app.setting('loyalty_points_per_pound') #>> '{}')::int, 10) * coalesce(v_mult, 10000) / 10000.0)::int;
  if v_points <= 0 then return 0; end if;
  insert into app.loyalty_transactions (customer_id, points, reason, order_id) values (o.customer_id, v_points, 'order_earn', o.id);
  update app.loyalty_accounts set points_balance = points_balance + v_points, lifetime_points = lifetime_points + v_points,
    tier_code = (select t.code from app.loyalty_tiers t where t.min_lifetime_points <= a.lifetime_points + v_points order by t.min_lifetime_points desc limit 1),
    updated_at = now() where customer_id = o.customer_id;
  return v_points;
end;
$$;

create or replace function api.staff_complete_picking(p_order_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff   uuid := app.require_permission('packing_queue');
  o         app.orders := app.order_for_staff(p_order_id, true);
  pm        app.payments;
  l         record;
  v_scope   text := 'complete_picking:' || p_order_id;
  v_idem    app.idempotency_keys;
  v_items   bigint;
  v_disc    bigint;
  v_dep     bigint;
  v_vat     bigint;
  v_total   bigint;
  v_capture bigint;
  v_stripe  record;
  v_changes text;
  v_result  jsonb;
begin
  insert into app.idempotency_keys (scope, key, request_hash, status) values (v_scope, p_idempotency_key, md5(p_order_id::text), 'in_progress')
  on conflict (scope, key) do nothing;
  if not found then
    select * into v_idem from app.idempotency_keys where scope = v_scope and key = p_idempotency_key;
    if v_idem.status = 'completed' then return v_idem.response; end if;
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'IN_PROGRESS'), 'Already being completed.');
  end if;
  if o.status <> 'picking' then
    perform app.raise_error('INVALID_STATUS_TRANSITION', 409, jsonb_build_object('status', o.status), 'Only orders being picked can be completed.');
  end if;
  if exists (select 1 from app.order_lines x where x.order_id = o.id and x.line_type = 'product' and x.pick_status = 'pending') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'LINES_NOT_PICKED'), 'Every line needs a pick result first.');
  end if;

  -- final money per line
  update app.order_lines x set
    final_discount_minor = case when x.est_gross_minor > 0 then least(app.div_round_half_up(x.est_discount_minor::bigint * x.final_gross_minor, x.est_gross_minor), x.final_gross_minor) else 0 end
   where x.order_id = o.id and x.line_type = 'product';
  update app.order_lines x set final_vat_minor = app.vat_from_gross(x.final_gross_minor - x.final_discount_minor, x.vat_rate_bp)
   where x.order_id = o.id and x.line_type = 'product';
  update app.order_lines d set
    final_gross_minor = case when p.quantity_ordered is not null and p.quantity_ordered > 0
                             then app.div_round_half_up(d.est_gross_minor::bigint * coalesce(p.quantity_picked, 0), p.quantity_ordered) else d.est_gross_minor end,
    final_discount_minor = 0
    from app.order_lines p where d.order_id = o.id and d.line_type = 'deposit' and p.id = d.parent_line_id;
  update app.order_lines d set final_vat_minor = app.vat_from_gross(d.final_gross_minor, d.vat_rate_bp) where d.order_id = o.id and d.line_type = 'deposit';
  update app.order_lines d set final_gross_minor = d.est_gross_minor, final_discount_minor = 0, final_vat_minor = d.est_vat_minor
   where d.order_id = o.id and d.line_type = 'delivery';

  select coalesce(sum(x.final_gross_minor) filter (where x.line_type = 'product'), 0),
         coalesce(sum(x.final_discount_minor) filter (where x.line_type = 'product'), 0),
         coalesce(sum(x.final_gross_minor) filter (where x.line_type = 'deposit'), 0),
         coalesce(sum(x.final_vat_minor), 0)
    into v_items, v_disc, v_dep, v_vat
    from app.order_lines x where x.order_id = o.id;
  v_total := v_items - v_disc + v_dep + o.delivery_fee_minor;
  update app.orders set final_items_minor = v_items, final_discount_minor = v_disc, final_deposit_minor = v_dep,
    final_total_minor = v_total, final_vat_minor = v_vat where id = o.id;

  -- stock: release the reservation, take what was picked off the shelf
  for l in
    select x.product_id, x.substitute_for_line_id, coalesce(x.quantity_ordered, x.weight_ordered_grams) as ordered,
           coalesce(x.quantity_picked, x.weight_picked_grams, 0) as picked
      from app.order_lines x where x.order_id = o.id and x.line_type = 'product' order by x.product_id
  loop
    if l.substitute_for_line_id is null then
      update app.stock_levels set reserved = greatest(reserved - l.ordered, 0), updated_at = now() where location_id = o.location_id and product_id = l.product_id;
      insert into app.stock_movements (location_id, product_id, delta, reason, affects, ref_type, ref_id, actor_user_id, note)
      values (o.location_id, l.product_id, -l.ordered, 'order_release', 'reserved', 'order', o.id, auth.uid(), 'picking completed');
    end if;
    if l.picked > 0 then
      update app.stock_levels set on_hand = greatest(on_hand - l.picked, reserved), updated_at = now() where location_id = o.location_id and product_id = l.product_id;
      insert into app.stock_movements (location_id, product_id, delta, reason, affects, ref_type, ref_id, actor_user_id)
      values (o.location_id, l.product_id, -l.picked, 'pick', 'on_hand', 'order', o.id, auth.uid());
    end if;
  end loop;

  perform app.transition_order(o.id, 'picked', 'staff', null);
  select * into pm from app.payments where order_id = o.id and status = 'authorised' order by created_at desc limit 1 for update;

  if v_total = 0 then
    -- nothing could be supplied: release the card hold and cancel
    if pm.provider = 'stripe' then
      perform app.stripe_request('POST', 'payment_intents/' || pm.provider_intent_ref || '/cancel', null, 'cancel-' || o.id::text);
    end if;
    update app.payments set status = 'voided', updated_at = now() where id = pm.id;
    perform app.transition_order(o.id, 'cancelled', 'staff', 'nothing_available');
    v_result := app.staff_order_json(o.id);
  else
    v_capture := least(v_total, o.authorised_minor);
    if v_total > o.authorised_minor then
      insert into app.payment_sync_log (order_id, payment_id, operation, outcome, error_code)
      values (o.id, pm.id, 'capture', 'mismatch', 'CAPTURE_EXCEEDS_AUTHORISATION');
      perform app.audit('order.capture_shortfall', 'order', o.id::text, jsonb_build_object('final', v_total, 'authorised', o.authorised_minor));
    end if;
    if pm.provider = 'stripe' then
      select * into v_stripe from app.stripe_request('POST', 'payment_intents/' || pm.provider_intent_ref || '/capture',
        jsonb_build_object('amount_to_capture', v_capture), 'capture-' || o.id::text);
      insert into app.payment_sync_log (order_id, payment_id, operation, http_status, stripe_object_id, outcome, error_code)
      values (o.id, pm.id, 'capture', v_stripe.status, pm.provider_intent_ref, case when v_stripe.status between 200 and 299 then 'ok' else 'error' end, v_stripe.body -> 'error' ->> 'code');
      if v_stripe.status not between 200 and 299 then
        perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('service', 'stripe', 'code', v_stripe.body -> 'error' ->> 'code'), 'The card could not be charged. Try again or contact the customer.');
      end if;
    elsif pm.id is null then
      perform app.raise_error('PAYMENT_FAILED', 402, jsonb_build_object('reason', 'NO_AUTHORISATION'), 'There is no card authorisation for this order.');
    end if;
    update app.payments set status = case when v_capture < amount_authorised_minor then 'partially_captured' else 'captured' end,
      amount_captured_minor = v_capture, captured_at = now(), updated_at = now() where id = pm.id;
    update app.orders set captured_minor = v_capture where id = o.id;
    perform app.transition_order(o.id, 'paid', 'payment', null);
    perform app.issue_invoice(o.id);
    perform app.award_loyalty(o.id);
    select string_agg(case x.pick_status
        when 'missing' then '• ' || x.name_snapshot || ': not available, not charged'
        when 'short' then '• ' || x.name_snapshot || ': ' || x.quantity_picked || ' of ' || x.quantity_ordered
        when 'substituted' then '• ' || x.name_snapshot || ': replaced with ' || coalesce((select s.name_snapshot from app.order_lines s where s.substitute_for_line_id = x.id limit 1), 'a similar item')
        end, E'\n') filter (where x.pick_status in ('missing', 'short', 'substituted'))
      into v_changes from app.order_lines x where x.order_id = o.id and x.line_type = 'product';
    perform app.queue_message('order_picked', 'email', o.contact_email, app.order_email_vars(o) || jsonb_build_object(
      'changes', coalesce('Changes to your order:' || E'\n' || v_changes, 'Everything you ordered is packed.'),
      'total', '£' || to_char(v_capture / 100.0, 'FM999990.00')), o.customer_id, o.id);
    v_result := app.staff_order_json(o.id);
  end if;
  perform app.audit('order.picked', 'order', o.id::text, jsonb_build_object('final', v_total, 'captured', v_capture));
  update app.idempotency_keys set status = 'completed', response = v_result where scope = v_scope and key = p_idempotency_key;
  return v_result;
end;
$$;
comment on function api.staff_complete_picking(uuid, uuid) is '@access staff Finish picking: final prices (weights, shortages, substitutes), take the payment (never more than authorised), update stock, issue the invoice, award points, email the customer. Idempotent. Permission: packing_queue.';

create or replace function api.staff_dispatch_order(p_order_id uuid, p_van_id uuid, p_driver_id uuid, p_eta_start timestamptz default null, p_eta_end timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o app.orders;
begin
  perform app.require_permission('orders_dispatch');
  o := app.order_for_staff(p_order_id, true);
  if not exists (select 1 from app.vans v where v.id = p_van_id and v.is_active) or not exists (select 1 from app.drivers d where d.id = p_driver_id and d.is_active) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('vanId', 'driverId')), 'Choose an active van and driver.');
  end if;
  if p_eta_start is not null and p_eta_end is not null and p_eta_end <= p_eta_start then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('etaEnd')), 'The arrival window must end after it starts.');
  end if;
  update app.orders set van_id = p_van_id, driver_id = p_driver_id,
    eta_start = coalesce(p_eta_start, (select s.starts_at from app.delivery_slots s where s.id = o.slot_id)),
    eta_end = coalesce(p_eta_end, (select s.ends_at from app.delivery_slots s where s.id = o.slot_id)),
    tracking_code = coalesce(tracking_code, upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8)))
  where id = o.id returning * into o;
  perform app.transition_order(o.id, 'out_for_delivery', 'staff', null);
  perform app.queue_message('order_dispatched', 'email', o.contact_email, app.order_email_vars(o) || jsonb_build_object(
    'eta', case when o.eta_start is not null then ', arriving ' || to_char(o.eta_start at time zone 'Europe/London', 'HH24:MI') || '–' || to_char(o.eta_end at time zone 'Europe/London', 'HH24:MI') else '' end,
    'id_note', case when o.id_check_required_on_delivery then 'Your order has age-restricted items: please have photo ID ready.' else '' end), o.customer_id, o.id);
  perform app.audit('order.dispatched', 'order', o.id::text, jsonb_build_object('van', p_van_id, 'driver', p_driver_id));
  return app.staff_order_json(o.id);
end;
$$;
comment on function api.staff_dispatch_order(uuid, uuid, uuid, timestamptz, timestamptz) is '@access staff Send a paid order out: van, driver and arrival window (default: the slot). Permission: orders_dispatch.';

create or replace function api.staff_mark_delivered(p_order_id uuid, p_id_checked boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('orders_dispatch');
  o       app.orders := app.order_for_staff(p_order_id, true);
begin
  if o.id_check_required_on_delivery then
    if not coalesce(p_id_checked, false) then
      perform app.raise_error('ID_CHECK_REQUIRED', 422, jsonb_build_object('minAge', o.min_age), 'Check the customer''s photo ID before handing over.');
    end if;
    update app.orders set id_checked_at = now(), id_checked_by = v_staff where id = o.id;
  end if;
  perform app.transition_order(o.id, 'delivered', 'staff', null);
  perform app.queue_message('order_delivered', 'email', o.contact_email, app.order_email_vars(o), o.customer_id, o.id);
  perform app.audit('order.delivered', 'order', o.id::text, jsonb_build_object('idChecked', p_id_checked));
  return app.staff_order_json(o.id);
end;
$$;
comment on function api.staff_mark_delivered(uuid, boolean) is '@access staff Mark an order delivered (records the ID check for age-restricted items). Permission: orders_dispatch.';

-- ── refunds ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_request_refund(p_order_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff  uuid := app.require_permission('refund_requests');
  o        app.orders := app.order_for_staff(p_order_id);
  v_amount integer := (p ->> 'amountMinor')::int;
  v_lines  jsonb := p -> 'lines';
  v_left   integer := coalesce(o.captured_minor, 0) - o.refunded_minor;
  v_req    uuid;
begin
  if coalesce(trim(p ->> 'reason'), '') = '' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('reason')), 'Give a reason.');
  end if;
  if o.status not in ('paid', 'delivered', 'partially_refunded') then
    perform app.raise_error('INVALID_STATUS_TRANSITION', 409, jsonb_build_object('status', o.status), 'Refunds are for charged orders that are not on the road. Cancel unpaid orders instead; wait for delivery if it is out.');
  end if;
  if v_lines is not null and jsonb_typeof(v_lines) = 'array' and jsonb_array_length(v_lines) > 0 then
    -- whole lines: their final net-of-discount value
    select coalesce(sum(l.final_gross_minor - coalesce(l.final_discount_minor, 0)), 0)::int into v_amount
      from app.order_lines l where l.order_id = o.id and l.id in (select (x ->> 'lineId')::uuid from jsonb_array_elements(v_lines) x);
    v_amount := nullif(v_amount, 0);
  else
    v_lines := null;
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > v_left then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('maxRefund', app.money(v_left, o.currency)), 'The refund must be more than zero and no more than what was paid.');
  end if;
  insert into app.refund_requests (order_id, requested_by, lines, amount_minor, reason)
  values (o.id, v_staff, v_lines, case when v_lines is null then v_amount end, left(trim(p ->> 'reason'), 500))
  returning id into v_req;
  perform app.audit('refund.requested', 'order', o.id::text, jsonb_build_object('request', v_req, 'amount', v_amount));
  return app.staff_order_json(o.id) || jsonb_build_object('requestId', v_req, 'requestedAmount', app.money(v_amount, o.currency));
exception when invalid_text_representation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Invalid refund details.');
  return null;
end;
$$;
comment on function api.admin_request_refund(uuid, jsonb) is '@access staff Ask for a refund: { reason, amountMinor } or { reason, lines: [{lineId}] }. A manager approves it. Permission: refund_requests.';

create or replace function api.admin_decide_refund(p_request_id uuid, p_approve boolean, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff  uuid := app.require_permission('financials');
  q        app.refund_requests;
  o        app.orders;
  pm       app.payments;
  v_amount integer;
  v_stripe record;
  v_ref    uuid;
  v_inv    app.invoices;
  v_cn     uuid;
  v_points integer;
  v_scope  text := 'refund:' || p_request_id;
  v_idem   app.idempotency_keys;
  v_result jsonb;
begin
  insert into app.idempotency_keys (scope, key, request_hash, status) values (v_scope, p_idempotency_key, md5(p_request_id::text || p_approve::text), 'in_progress')
  on conflict (scope, key) do nothing;
  if not found then
    select * into v_idem from app.idempotency_keys where scope = v_scope and key = p_idempotency_key;
    if v_idem.status = 'completed' then return v_idem.response; end if;
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'IN_PROGRESS'), 'Already being processed.');
  end if;
  select * into q from app.refund_requests where id = p_request_id for update;
  if q.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Refund request not found.'); end if;
  if q.status <> 'pending' then perform app.raise_error('CONFLICT', 409, jsonb_build_object('status', q.status), 'This request was already decided.'); end if;
  o := app.order_for_staff(q.order_id, true);

  if not coalesce(p_approve, false) then
    update app.refund_requests set status = 'rejected', approved_by = v_staff, decided_at = now() where id = q.id;
    v_result := app.staff_order_json(o.id);
  else
    v_amount := coalesce(q.amount_minor, (select coalesce(sum(l.final_gross_minor - coalesce(l.final_discount_minor, 0)), 0)::int
                  from app.order_lines l where l.order_id = o.id and l.id in (select (x ->> 'lineId')::uuid from jsonb_array_elements(q.lines) x)));
    if v_amount <= 0 or v_amount > coalesce(o.captured_minor, 0) - o.refunded_minor then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('maxRefund', app.money(coalesce(o.captured_minor, 0) - o.refunded_minor, o.currency)), 'Refund exceeds what is left to refund.');
    end if;
    select * into pm from app.payments where order_id = o.id and status in ('captured', 'partially_captured') order by created_at desc limit 1;
    if pm.id is null then perform app.raise_error('PAYMENT_FAILED', 402, jsonb_build_object('reason', 'NO_CAPTURE'), 'Nothing was charged on this order.'); end if;
    if pm.provider = 'stripe' then
      select * into v_stripe from app.stripe_request('POST', 'refunds',
        jsonb_build_object('payment_intent', pm.provider_intent_ref, 'amount', v_amount, 'metadata[order_id]', o.id, 'metadata[refund_request]', q.id), 'refund-' || q.id::text);
      insert into app.payment_sync_log (order_id, payment_id, operation, http_status, stripe_object_id, outcome, error_code)
      values (o.id, pm.id, 'refund', v_stripe.status, v_stripe.body ->> 'id', case when v_stripe.status between 200 and 299 then 'ok' else 'error' end, v_stripe.body -> 'error' ->> 'code');
      if v_stripe.status not between 200 and 299 then
        perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('service', 'stripe', 'code', v_stripe.body -> 'error' ->> 'code'), 'The refund could not be sent. Try again.');
      end if;
    end if;
    insert into app.refunds (payment_id, refund_request_id, provider_refund_ref, amount_minor, status)
    values (pm.id, q.id, case when pm.provider = 'stripe' then v_stripe.body ->> 'id' end, v_amount,
            case when pm.provider = 'stripe' and v_stripe.body ->> 'status' = 'pending' then 'pending' else 'succeeded' end)
    returning id into v_ref;
    update app.orders set refunded_minor = refunded_minor + v_amount where id = o.id returning * into o;
    perform app.transition_order(o.id, case when o.refunded_minor >= o.captured_minor then 'refunded' else 'partially_refunded' end, 'staff', left(q.reason, 200));
    update app.refund_requests set status = 'processed', approved_by = v_staff, decided_at = now() where id = q.id;

    -- credit note against the invoice (VAT split in proportion to the invoice)
    select * into v_inv from app.invoices where order_id = o.id;
    if v_inv.id is not null then
      insert into app.credit_notes (legal_entity_id, number, invoice_id, refund_id, reason, currency, net_minor, vat_minor, gross_minor, vat_breakdown)
      values (v_inv.legal_entity_id, app.next_document_number(v_inv.legal_entity_id, 'credit_note'), v_inv.id, v_ref, left(q.reason, 500), o.currency,
              v_amount - app.div_round_half_up(v_inv.vat_minor::bigint * v_amount, greatest(v_inv.gross_minor, 1)),
              app.div_round_half_up(v_inv.vat_minor::bigint * v_amount, greatest(v_inv.gross_minor, 1)), v_amount,
              jsonb_build_array(jsonb_build_object('proportionOfInvoice', round(v_amount::numeric / greatest(v_inv.gross_minor, 1), 6))))
      returning id into v_cn;
      insert into app.credit_note_lines (credit_note_id, line_no, description, quantity, unit_price_minor, vat_rate_bp, net_minor, vat_minor, gross_minor)
      select v_cn, 1, 'Refund: ' || left(q.reason, 200), 1, v_amount, 0, cn.net_minor, cn.vat_minor, cn.gross_minor from app.credit_notes cn where cn.id = v_cn;
    end if;

    -- take back the points earned on the refunded part
    select coalesce(sum(t.points), 0) into v_points from app.loyalty_transactions t where t.order_id = o.id and t.reason = 'order_earn';
    v_points := floor(v_points * v_amount::numeric / greatest(o.captured_minor, 1))::int;
    if v_points > 0 then
      insert into app.loyalty_transactions (customer_id, points, reason, order_id, created_by, note)
      values (o.customer_id, -least(v_points, greatest(coalesce((select a.points_balance from app.loyalty_accounts a where a.customer_id = o.customer_id), 0), 1)), 'reversal', o.id, v_staff, 'refund');
      update app.loyalty_accounts set points_balance = greatest(points_balance - v_points, 0), updated_at = now() where customer_id = o.customer_id;
    end if;
    perform app.queue_message('refund_issued', 'email', o.contact_email, app.order_email_vars(o) || jsonb_build_object(
      'amount', '£' || to_char(v_amount / 100.0, 'FM999990.00'), 'reason', ''), o.customer_id, o.id);
    v_result := app.staff_order_json(o.id);
  end if;
  perform app.audit(case when p_approve then 'refund.approved' else 'refund.rejected' end, 'order', o.id::text, jsonb_build_object('request', q.id, 'amount', v_amount));
  update app.idempotency_keys set status = 'completed', response = v_result where scope = v_scope and key = p_idempotency_key;
  return v_result;
end;
$$;
comment on function api.admin_decide_refund(uuid, boolean, uuid) is '@access staff Approve (sends the money back via Stripe, issues a credit note, reverses points) or reject a refund request. Idempotent. Permission: financials.';

create or replace function api.admin_list_refund_requests(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('financials') or app.has_permission('refund_requests')) then perform app.require_permission('financials'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'orderId', o.id, 'orderNumber', o.number, 'status', q.status, 'reason', q.reason,
            'amount', app.money(coalesce(q.amount_minor, (select coalesce(sum(l.final_gross_minor - coalesce(l.final_discount_minor, 0)), 0)::int from app.order_lines l
                                                          where l.id in (select (x ->> 'lineId')::uuid from jsonb_array_elements(q.lines) x))), o.currency),
            'requestedBy', (select s.full_name from app.staff s where s.id = q.requested_by), 'createdAt', q.created_at,
            'customer', (select concat_ws(' ', c.first_name, c.last_name) from app.customers c where c.id = o.customer_id)) order by q.created_at desc), '[]'::jsonb)
    from app.refund_requests q join app.orders o on o.id = q.order_id where p_status is null or q.status = p_status);
end;
$$;
comment on function api.admin_list_refund_requests(text) is '@access staff Refund requests by status (default pending). Permission: financials or refund_requests.';

-- ── admin order tools ───────────────────────────────────────────────────────────────────────────
create or replace function api.admin_list_orders(p_q text default null, p_status text default null, p_from date default null, p_to date default null,
                                                 p_limit integer default 50, p_cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := coalesce(nullif(p_cursor, '')::int, 0);
  v_q      text := nullif(trim(coalesce(p_q, '')), '');
  v_total  integer;
begin
  if not (app.has_permission('order_status') or app.has_permission('orders_dispatch') or app.has_permission('packing_queue')) then
    perform app.require_permission('order_status');
  end if;
  return (with f as (
      select o.* from app.orders o left join app.customers c on c.id = o.customer_id
       where (p_status is null or o.status = p_status)
         and (p_from is null or o.created_at >= p_from::timestamptz)
         and (p_to is null or o.created_at < (p_to + 1)::timestamptz)
         and (v_q is null or o.number ilike '%' || v_q || '%' or c.email ilike '%' || v_q || '%'
              or concat_ws(' ', c.first_name, c.last_name) ilike '%' || v_q || '%' or (o.address_snapshot ->> 'postcode') ilike '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'nextCursor', case when v_offset + v_limit < (select count(*) from f) then (v_offset + v_limit)::text end,
      'statusCounts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select o2.status, count(*) as n from app.orders o2 group by o2.status) x),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', f.id, 'orderNumber', f.number, 'status', f.status, 'createdAt', f.created_at, 'placedAt', f.placed_at, 'isSample', f.is_sample,
          'customer', (select concat_ws(' ', c.first_name, c.last_name) from app.customers c where c.id = f.customer_id),
          'postcode', f.address_snapshot ->> 'postcode',
          'zone', (select z.name from app.delivery_zones z where z.id = f.zone_id),
          'slot', (select app.slot_json(s) from app.delivery_slots s where s.id = f.slot_id),
          'total', app.money(coalesce(f.final_total_minor, f.est_total_minor), f.currency),
          'itemCount', (select count(*)::int from app.order_lines l where l.order_id = f.id and l.line_type = 'product'),
          'van', (select v.code from app.vans v where v.id = f.van_id)) order by f.created_at desc), '[]'::jsonb)
        from (select * from f order by f.created_at desc limit v_limit offset v_offset) f)));
end;
$$;
comment on function api.admin_list_orders(text, text, date, date, integer, text) is '@access staff Search orders by number, customer, email or postcode; filter by status and dates. Permission: order_status.';

create or replace function api.admin_cancel_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o  app.orders;
  pm app.payments;
begin
  perform app.require_permission('order_status');
  o := app.order_for_staff(p_order_id, true);
  if coalesce(trim(p_reason), '') = '' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('reason')), 'Give a reason.');
  end if;
  if o.status not in ('pending_payment', 'placed', 'picking') then
    perform app.raise_error('ORDER_NOT_CANCELLABLE', 422, jsonb_build_object('status', o.status), 'Paid orders are refunded, not cancelled.');
  end if;
  select * into pm from app.payments where order_id = o.id order by created_at desc limit 1;
  if pm.provider = 'stripe' and pm.provider_intent_ref is not null and pm.status in ('requires_action', 'authorised') then
    perform app.stripe_request('POST', 'payment_intents/' || pm.provider_intent_ref || '/cancel', null, 'cancel-' || o.id::text);
  end if;
  update app.payments set status = 'voided', updated_at = now() where id = pm.id and status in ('requires_action', 'authorised');
  -- picks recorded so far are undone (nothing has left the shelf yet)
  update app.order_lines set pick_status = 'pending', quantity_picked = null, weight_picked_grams = null, final_gross_minor = null
   where order_id = o.id and line_type = 'product' and substitute_for_line_id is null;
  delete from app.order_lines where order_id = o.id and substitute_for_line_id is not null;
  perform app.release_order_holds(o.id);
  perform app.transition_order(o.id, 'cancelled', 'staff', left(trim(p_reason), 200));
  perform app.queue_message('order_cancelled', 'email', o.contact_email, app.order_email_vars(o) || jsonb_build_object('reason', left(trim(p_reason), 200)), o.customer_id, o.id);
  perform app.audit('order.cancelled_by_staff', 'order', o.id::text, jsonb_build_object('reason', p_reason));
  return app.staff_order_json(o.id);
end;
$$;
comment on function api.admin_cancel_order(uuid, text) is '@access staff Cancel an order that has not been charged yet (releases card hold, stock, slot, coupon; emails the customer). Permission: order_status.';

create or replace function api.admin_issue_invoice(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_permission('financials');
  perform app.order_for_staff(p_order_id);
  if not coalesce((app.setting('invoices_enabled'))::boolean, false) or not exists (select 1 from app.legal_entities le where le.is_active) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'INVOICES_NOT_SET_UP'), 'Save your company and VAT details and switch invoices on first.');
  end if;
  v_id := app.issue_invoice(p_order_id);
  if v_id is null then perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'ALREADY_ISSUED_OR_NOT_FINAL'), 'Invoice already issued, or the order is not final yet.'); end if;
  return app.staff_order_json(p_order_id);
end;
$$;
comment on function api.admin_issue_invoice(uuid) is '@access staff Issue the VAT invoice for a charged order (for orders charged before invoices were switched on). Permission: financials.';

-- the customer sees their invoice number once issued
do $$
declare
  v_def text := pg_get_functiondef('app.order_json(uuid)'::regprocedure);
begin
  v_def := replace(v_def, $q$'invoice', null,$q$,
    $q$'invoice', (select jsonb_build_object('number', i.number, 'issuedAt', i.issued_at) from app.invoices i where i.order_id = o.id),$q$);
  if v_def not like '%from app.invoices i where i.order_id = o.id%' then raise exception 'order_json patch did not apply'; end if;
  execute v_def;
end;
$$;

select app.harden();
