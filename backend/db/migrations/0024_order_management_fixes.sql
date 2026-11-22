-- 0024 Fixes from testing 0023:
--   * admin_decide_refund read the Stripe response record in test-payment mode, where it is never
--     set ("record is not assigned yet"); the refund reference/status now live in plain variables
--   * tidy: unused variable in admin_list_orders; staff id recorded in the picking audit entry

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
  v_refund_ref    text;
  v_refund_status text := 'succeeded';
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
      v_refund_ref := v_stripe.body ->> 'id';
      if v_stripe.body ->> 'status' = 'pending' then v_refund_status := 'pending'; end if;
    end if;
    insert into app.refunds (payment_id, refund_request_id, provider_refund_ref, amount_minor, status)
    values (pm.id, q.id, v_refund_ref, v_amount, v_refund_status)
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
  perform app.audit('order.picked', 'order', o.id::text, jsonb_build_object('final', v_total, 'captured', v_capture, 'staff', v_staff));
  update app.idempotency_keys set status = 'completed', response = v_result where scope = v_scope and key = p_idempotency_key;
  return v_result;
end;
$$;

comment on function api.staff_complete_picking(uuid, uuid) is '@access staff Finish picking: final prices (weights, shortages, substitutes), take the payment (never more than authorised), update stock, issue the invoice, award points, email the customer. Idempotent. Permission: packing_queue.';

select app.harden();
