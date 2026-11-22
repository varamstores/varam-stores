-- Order management end to end: picking (substitute at the lower price, weighed item), capture
-- (never above authorised), stock, loyalty, dispatch, delivery, refund + points reversal,
-- staff cancel, permissions. Prices: basmati £6.99, India Gate £13.99, tomatoes £1.33/kg.
select plan(29);

update app.app_settings set value = '"simulated"' where key = 'payment_mode';
select set_config('t.rice', (select id::text from app.products where slug = 'basmati-rice-aged'), true);
select set_config('t.ig', (select id::text from app.products where slug = 'india-gate-classic-aged-basmati-rice'), true);
select set_config('t.tom', (select id::text from app.products where slug = 'organic-red-tomatoes'), true);
select set_config('t.hub', (select id::text from app.fulfilment_locations where code = 'HUB-1'), true);
select set_config('t.ig_onhand', (select on_hand::text from app.stock_levels where product_id = current_setting('t.ig')::uuid and location_id = current_setting('t.hub')::uuid), true);
select set_config('t.rice_res', (select reserved::text from app.stock_levels where product_id = current_setting('t.rice')::uuid and location_id = current_setting('t.hub')::uuid), true);
select set_config('t.slot', (select s.id::text from app.delivery_slots s join app.delivery_zones z on z.id = s.zone_id
  where z.code = 'HATFIELD' and s.cutoff_at > now() + interval '1 hour' and s.reserved_count < s.capacity order by s.starts_at limit 1), true);
select set_config('t.slotday', (select (s.starts_at at time zone 'Europe/London')::date::text from app.delivery_slots s where s.id = current_setting('t.slot')::uuid), true);
select set_config('t.van', (select id::text from app.vans where is_active limit 1), true);
select set_config('t.driver', (select id::text from app.drivers where is_active limit 1), true);
select set_config('t.staff_uid', (select user_id::text from app.staff where email = 'test@gmail.com'), true);

-- customer places an order: 2 × rice (£13.98) + 1 kg tomatoes (£1.33) + £3.50 delivery = £18.81
select set_config('t.uid', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, email, created_at, updated_at) values (current_setting('t.uid')::uuid, 'authenticated', 'authenticated', 'om-test@example.com', now(), now());
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
set local role authenticated;
select api.complete_signup('Omar', 'Test', true, (api.get_storefront_config() ->> 'termsVersion'));
select api.save_my_address('{"fullName": "Omar Test", "line1": "1 College Lane", "city": "Hatfield", "postcode": "AL10 9AB"}');
select api.add_cart_item(current_setting('t.rice')::uuid, 2);
select api.add_cart_item(current_setting('t.tom')::uuid, null, 1000);
select set_config('t.k', api.start_checkout(current_setting('t.slot')::uuid) ->> 'id', true);
select set_config('t.no', api.place_order(current_setting('t.k')::uuid, gen_random_uuid(), true, (api.get_storefront_config() ->> 'termsVersion')) ->> 'orderNumber', true);
select is(api.confirm_order_payment(current_setting('t.no')) ->> 'status', 'placed', 'order placed');
reset role;
select set_config('t.oid', (select id::text from app.orders where number = current_setting('t.no')), true);
-- authorised = £18.81 + 15 % of the weighed £1.33 (19.95 → 20p) = £19.01
select is((select authorised_minor from app.orders where id = current_setting('t.oid')::uuid), 1901, 'estimate + buffer on weighed items authorised');

-- permissions
set local role authenticated;
select throws_ok($$ select api.staff_picking_queue() $$, 'PT403', 'FORBIDDEN', 'customers cannot see the picking queue');
reset role;

-- staff picks
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff_uid'), 'role', 'authenticated')::text, true);
set local role authenticated;
select ok((select bool_or(o ->> 'orderNumber' = current_setting('t.no')) from jsonb_array_elements(api.staff_picking_queue(current_setting('t.slotday')::date)) o), 'order in the picking queue for its day');
select set_config('t.l_rice', (select l ->> 'id' from jsonb_array_elements(api.staff_get_order(current_setting('t.oid')::uuid) -> 'staffLines') l where l ->> 'productId' = current_setting('t.rice')), true);
select set_config('t.l_tom', (select l ->> 'id' from jsonb_array_elements(api.staff_get_order(current_setting('t.oid')::uuid) -> 'staffLines') l where l ->> 'productId' = current_setting('t.tom')), true);
select throws_ok(format($$ select api.staff_record_pick(%L::uuid, %L::uuid, '{"status": "picked"}') $$, current_setting('t.oid'), current_setting('t.l_rice')),
  'PT409', 'INVALID_STATUS_TRANSITION', 'cannot pick before starting');
select is(api.staff_start_picking(current_setting('t.oid')::uuid) ->> 'status', 'picking', 'picking started');
select throws_ok(format($$ select api.staff_complete_picking(%L::uuid, gen_random_uuid()) $$, current_setting('t.oid')), 'PT400', 'VALIDATION_FAILED', 'every line needs a result first');
-- rice out: substitute India Gate (£13.99) × 2, customer pays the lower price £6.99 each
select set_config('t.v', api.staff_record_pick(current_setting('t.oid')::uuid, current_setting('t.l_rice')::uuid,
  jsonb_build_object('status', 'substituted', 'substituteProductId', current_setting('t.ig'), 'substituteQuantity', 2))::text, true);
select is((select l ->> 'status' from jsonb_array_elements(current_setting('t.v')::jsonb -> 'staffLines') l where l ->> 'id' = current_setting('t.l_rice')), 'substituted', 'original line marked substituted');
select is((select l -> 'unitPrice' ->> 'amount' from jsonb_array_elements(current_setting('t.v')::jsonb -> 'staffLines') l where l ->> 'substituteFor' = current_setting('t.l_rice')), '699', 'substitute charged at the lower of the two prices');
-- tomatoes weighed at 1.1 kg → £1.4630 → 146p
select is((select l -> 'finalGross' ->> 'amount' from jsonb_array_elements(api.staff_record_pick(current_setting('t.oid')::uuid, current_setting('t.l_tom')::uuid, '{"status": "picked", "weightGrams": 1100}') -> 'staffLines') l where l ->> 'id' = current_setting('t.l_tom')),
  '146', 'weighed item priced on the picked weight');

-- complete: £13.98 + £1.46 + £3.50 = £18.94 ≤ £19.01 authorised → captured £18.94
select set_config('t.key', gen_random_uuid()::text, true);
select set_config('t.v', api.staff_complete_picking(current_setting('t.oid')::uuid, current_setting('t.key')::uuid)::text, true);
select is(current_setting('t.v')::jsonb ->> 'status', 'paid', 'picked and charged');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'final' -> 'total' ->> 'amount', '1894', 'final total from what was picked');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'captured' ->> 'amount', '1894', 'captured the final amount');
select is(api.staff_complete_picking(current_setting('t.oid')::uuid, current_setting('t.key')::uuid) ->> 'status', 'paid', 'repeating the same key is safe (idempotent)');
reset role;
select is((select status from app.payments where order_id = current_setting('t.oid')::uuid order by created_at desc limit 1), 'partially_captured', 'less than authorised was captured');
select is((select on_hand from app.stock_levels where product_id = current_setting('t.ig')::uuid and location_id = current_setting('t.hub')::uuid),
          current_setting('t.ig_onhand')::int - 2, 'substitute taken off the shelf');
select is((select reserved from app.stock_levels where product_id = current_setting('t.rice')::uuid and location_id = current_setting('t.hub')::uuid),
          current_setting('t.rice_res')::int, 'original reservation released');
-- points: £15.44 product spend × 10 = 154
select is((select points_balance from app.loyalty_accounts a join app.customers c on c.id = a.customer_id where c.user_id = current_setting('t.uid')::uuid), 154, 'loyalty points earned on captured product spend');
select is((select count(*)::int from app.outbound_messages where order_id = current_setting('t.oid')::uuid and template_code = 'order_picked'), 1, 'packed email with the changes queued');

-- dispatch & deliver
set local role authenticated;
select is(api.staff_dispatch_order(current_setting('t.oid')::uuid, current_setting('t.van')::uuid, current_setting('t.driver')::uuid) ->> 'status', 'out_for_delivery', 'dispatched');
select throws_ok(format($$ select api.admin_request_refund(%L::uuid, '{"reason": "x", "amountMinor": 100}') $$, current_setting('t.oid')), 'PT409', 'INVALID_STATUS_TRANSITION', 'no refunds while on the road');
select is(api.staff_mark_delivered(current_setting('t.oid')::uuid) ->> 'status', 'delivered', 'delivered');

-- refund £5 → points reversed in proportion (154 × 500 / 1894 = 40.6 → 40)
select set_config('t.req', api.admin_request_refund(current_setting('t.oid')::uuid, '{"reason": "Bruised tomatoes", "amountMinor": 500}') ->> 'requestId', true);
select is(api.admin_decide_refund(current_setting('t.req')::uuid, true, gen_random_uuid()) ->> 'status', 'partially_refunded', 'refund approved and sent');
select throws_ok(format($$ select api.admin_request_refund(%L::uuid, '{"reason": "x", "amountMinor": 999999}') $$, current_setting('t.oid')), 'PT400', 'VALIDATION_FAILED', 'cannot refund more than was paid');
select throws_ok(format($$ select api.admin_issue_invoice(%L::uuid) $$, current_setting('t.oid')), 'PT400', 'VALIDATION_FAILED', 'invoices wait for company + VAT details');
select is((api.admin_list_orders(current_setting('t.no')) ->> 'total')::int, 1, 'order search by number');
reset role;
select is((select points_balance from app.loyalty_accounts a join app.customers c on c.id = a.customer_id where c.user_id = current_setting('t.uid')::uuid), 114, 'points reversed for the refunded part');
select is((select refunded_minor from app.orders where id = current_setting('t.oid')::uuid), 500, 'refund recorded on the order');

-- staff cancels a second, unpaid order
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
set local role authenticated;
select api.add_cart_item(current_setting('t.rice')::uuid, 1);
select set_config('t.k2', api.start_checkout(current_setting('t.slot')::uuid) ->> 'id', true);
select set_config('t.no2', api.place_order(current_setting('t.k2')::uuid, gen_random_uuid(), true, (api.get_storefront_config() ->> 'termsVersion')) ->> 'orderNumber', true);
select api.confirm_order_payment(current_setting('t.no2'));
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff_uid'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is(api.admin_cancel_order((select id from jsonb_to_record(api.admin_list_orders(current_setting('t.no2')) -> 'items' -> 0) as x(id uuid)), 'Customer phoned to cancel') ->> 'status', 'cancelled', 'staff can cancel an unpaid order');
reset role;

select * from finish();
