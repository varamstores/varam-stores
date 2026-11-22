-- Delivery slots, checkout, order placement (simulated payments), confirmation, cancellation,
-- reorder and buy-it-again, called as the browser would.
select plan(38);

select set_config('t.rice', (select id::text from app.products where slug = 'basmati-rice-aged'), true);
select set_config('t.hub', (select id::text from app.fulfilment_locations where code = 'HUB-1'), true);
select set_config('t.stock0', (select reserved::text from app.stock_levels where product_id = current_setting('t.rice')::uuid and location_id = current_setting('t.hub')::uuid), true);
update app.app_settings set value = '"simulated"' where key = 'payment_mode';
-- two open Hatfield slots to work with
select set_config('t.s1', (select s.id::text from app.delivery_slots s join app.delivery_zones z on z.id = s.zone_id
  where z.code = 'HATFIELD' and s.cutoff_at > now() + interval '1 hour' and s.reserved_count < s.capacity order by s.starts_at limit 1), true);
select set_config('t.s2', (select s.id::text from app.delivery_slots s join app.delivery_zones z on z.id = s.zone_id
  where z.code = 'HATFIELD' and s.cutoff_at > now() + interval '1 hour' and s.reserved_count < s.capacity order by s.starts_at offset 1 limit 1), true);
select set_config('t.s1count', (select reserved_count::text from app.delivery_slots where id = current_setting('t.s1')::uuid), true);

-- a signed-in customer with an address and a £55.92 basket (8 × £6.99)
select set_config('t.uid', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, email, created_at, updated_at) values (current_setting('t.uid')::uuid, 'authenticated', 'authenticated', 'checkout-test@example.com', now(), now());
insert into app.customers (user_id, email, first_name, last_name) values (current_setting('t.uid')::uuid, 'checkout-test@example.com', 'Chet', 'Kout');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
set local role authenticated;
select api.save_my_address('{"fullName": "Chet Kout", "line1": "1 College Lane", "city": "Hatfield", "postcode": "AL10 9AB"}');
select api.add_cart_item(current_setting('t.rice')::uuid, 8);

-- slots & postcodes
select ok(jsonb_array_length(api.list_delivery_slots('al10 9ab')) > 0, 'slots listed for a Hatfield postcode');
select ok((select bool_and(s ? 'availability' and s ? 'localDate' and s ? 'startLocal') from jsonb_array_elements(api.list_delivery_slots('AL10 9AB')) s), 'slots carry London date/time and availability');
select is(api.check_postcode('N10 1AA') ->> 'deliverable', 'true', 'North London is deliverable');
select is(api.check_postcode('ZZ1 1ZZ') ->> 'deliverable', 'false', 'outside the zones');
select throws_ok($$ select api.list_delivery_slots('ZZ1 1ZZ') $$, 'PT422', 'POSTCODE_NOT_SERVED', 'no slots outside the zones');

-- checkout & holds
select set_config('t.k', api.start_checkout(current_setting('t.s1')::uuid) ->> 'id', true);
select is(api.get_checkout(current_setting('t.k')::uuid) ->> 'holdActive', 'true', 'slot held');
select is(api.start_checkout(current_setting('t.s1')::uuid) ->> 'id', current_setting('t.k'), 'starting again on the same slot reuses the hold');
reset role;
select is((select reserved_count from app.delivery_slots where id = current_setting('t.s1')::uuid), current_setting('t.s1count')::int + 1, 'exactly one place taken');
set local role authenticated;
select is(api.update_checkout(current_setting('t.k')::uuid, jsonb_build_object('slotId', current_setting('t.s2'))) -> 'slot' ->> 'id', current_setting('t.s2'), 'slot changed');
reset role;
select is((select reserved_count from app.delivery_slots where id = current_setting('t.s1')::uuid), current_setting('t.s1count')::int, 'old slot place given back');
set local role authenticated;
select is(api.update_checkout(current_setting('t.k')::uuid, '{"deliveryNotes": "Ring the bell", "substitutionDefault": "dont_allow"}') ->> 'deliveryNotes', 'Ring the bell', 'notes saved');
select is(api.get_checkout(current_setting('t.k')::uuid) -> 'cart' -> 'totals' -> 'deliveryFee' ->> 'amount', '0', 'free delivery over £50');

-- placing
select throws_ok(format($$ select api.place_order(%L::uuid, gen_random_uuid(), false, 'x') $$, current_setting('t.k')), 'PT400', 'TERMS_NOT_ACCEPTED', 'terms must be accepted');
select throws_ok(format($$ select api.place_order(%L::uuid, gen_random_uuid(), true, %L, 100) $$, current_setting('t.k'), (select api.get_checkout(current_setting('t.k')::uuid) ->> 'termsVersion')),
  'PT409', 'PRICE_CHANGED', 'a different expected total is refused');
select set_config('t.key', gen_random_uuid()::text, true);
select set_config('t.r', api.place_order(current_setting('t.k')::uuid, current_setting('t.key')::uuid, true, (api.get_checkout(current_setting('t.k')::uuid) ->> 'termsVersion'), 5592)::text, true);
select is(current_setting('t.r')::jsonb ->> 'mode', 'simulated', 'simulated payment in development');
select ok(current_setting('t.r')::jsonb ->> 'orderNumber' ~ '^VF-[0-9]{5,}$', 'order number VF-xxxxx');
select is(api.place_order(current_setting('t.k')::uuid, current_setting('t.key')::uuid, true, (api.get_checkout(current_setting('t.k')::uuid) ->> 'termsVersion'), 5592) ->> 'orderNumber',
          current_setting('t.r')::jsonb ->> 'orderNumber', 'same key → same order (idempotent)');
select set_config('t.no', current_setting('t.r')::jsonb ->> 'orderNumber', true);
reset role;
select is((select status from app.orders where number = current_setting('t.no')), 'pending_payment', 'waiting for payment');
select is((select reserved from app.stock_levels where product_id = current_setting('t.rice')::uuid and location_id = current_setting('t.hub')::uuid),
          current_setting('t.stock0')::int + 8, 'stock reserved');
select is((select est_total_minor from app.orders where number = current_setting('t.no')), 5592, 'order total stored in pence');
select is((select substitution_default from app.orders where number = current_setting('t.no')), 'dont_allow', 'substitution choice carried to the order');
select is((select count(*)::int from app.order_lines l join app.orders o on o.id = l.order_id where o.number = current_setting('t.no') and l.line_type = 'product'), 1, 'one product line');

-- confirming
set local role authenticated;
select is(api.confirm_order_payment(current_setting('t.no')) ->> 'status', 'placed', 'payment confirmed → placed');
reset role;
select is((select status from app.slot_reservations where order_id = (select id from app.orders where number = current_setting('t.no'))), 'booked', 'slot booked');
select is((select count(*)::int from app.outbound_messages where template_code = 'order_confirmation' and to_address = 'checkout-test@example.com'), 1, 'confirmation email queued');
select ok((select authorised_minor >= est_total_minor from app.orders where number = current_setting('t.no')), 'authorised at least the estimate');
set local role authenticated;
select is((api.list_my_orders('active') ->> 'total')::int, 1, 'listed under active orders');
select is(api.get_my_order(current_setting('t.no')) ->> 'canCancel', 'true', 'can still cancel before the cut-off');
select is(api.get_cart() ->> 'itemCount', '0', 'basket emptied after ordering');

-- cancelling gives everything back
select is(api.cancel_my_order(current_setting('t.no')) ->> 'status', 'cancelled', 'cancelled by the customer');
reset role;
select is((select reserved from app.stock_levels where product_id = current_setting('t.rice')::uuid and location_id = current_setting('t.hub')::uuid),
          current_setting('t.stock0')::int, 'stock released');
select is((select reserved_count from app.delivery_slots where id = current_setting('t.s2')::uuid),
          (select count(*)::int from app.slot_reservations where slot_id = current_setting('t.s2')::uuid and status in ('held', 'booked')), 'slot count matches live reservations');
set local role authenticated;
select throws_ok(format($$ select api.cancel_my_order(%L) $$, current_setting('t.no')), 'PT422', 'ORDER_NOT_CANCELLABLE', 'cannot cancel twice');
select is((api.reorder(current_setting('t.no')) -> 'lines' -> 0 ->> 'quantity'), '8', 'reorder puts the items back in the basket');

-- full slot & expired hold
reset role;
update app.delivery_slots set capacity = reserved_count where id = current_setting('t.s1')::uuid;
set local role authenticated;
select throws_ok(format($$ select api.start_checkout(%L::uuid) $$, current_setting('t.s1')), 'PT409', 'SLOT_FULL', 'a full slot cannot be held');
select set_config('t.k2', api.start_checkout(current_setting('t.s2')::uuid) ->> 'id', true);
reset role;
update app.slot_reservations set expires_at = now() - interval '1 minute' where id = (select slot_reservation_id from app.checkouts where id = current_setting('t.k2')::uuid);
select ok(app.release_expired_holds() >= 1, 'expired holds released by the job');
set local role authenticated;
select throws_ok(format($$ select api.place_order(%L::uuid, gen_random_uuid(), true, %L) $$, current_setting('t.k2'), (select api.get_checkout(current_setting('t.k2')::uuid) ->> 'termsVersion')),
  'PT409', 'SLOT_HOLD_EXPIRED', 'an expired hold cannot be ordered');

-- buy it again (from a completed order)
reset role;
update app.orders set status = 'delivered', captured_minor = authorised_minor, delivered_at = now() where number = current_setting('t.no');
set local role authenticated;
select is(api.list_buy_again() -> 0 ->> 'slug', 'basmati-rice-aged', 'buy it again lists past purchases');
reset role;

select * from finish();
