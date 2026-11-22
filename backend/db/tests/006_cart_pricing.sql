-- Basket + pricing engine, called exactly as the browser does. Expected money values are worked
-- out by hand in the comments (prices: basmati £6.99 zero-rated, tomatoes £1.33/kg zero-rated,
-- gulab jamun £4.49 standard-rated 20%; delivery £3.50 under £50, free from £50).
select plan(45);

-- product ids by slug, kept in settings for the rest of the file
select set_config('t.rice', (select id::text from app.products where slug = 'basmati-rice-aged'), true);
select set_config('t.tom', (select id::text from app.products where slug = 'organic-red-tomatoes'), true);
select set_config('t.jamun', (select id::text from app.products where slug = 'haldiram-s-traditional-gulab-jamun'), true);
select set_config('t.juice', (select id::text from app.products where slug = 'cold-pressed-citrus-juice'), true);
update app.stock_levels set on_hand = reserved where product_id = current_setting('t.juice')::uuid;   -- sold out

set local role anon;

-- empty basket without a token
select is(api.get_cart() ->> 'itemCount', '0', 'no token → empty basket');
select is(api.get_cart() ->> 'cartToken', null, 'no token issued on read');

-- first add creates a guest basket and issues a token
select set_config('t.v', api.add_cart_item(current_setting('t.rice')::uuid, 2)::text, true);
select set_config('t.tok', current_setting('t.v')::jsonb ->> 'cartToken', true);
select is(length(current_setting('t.tok')), 48, 'guest token issued (48 hex chars)');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'itemsSubtotal' ->> 'amount', '1398', '2 × £6.99 = £13.98');
select is(current_setting('t.v')::jsonb -> 'delivery' ->> 'isEstimate', 'true', 'no postcode → delivery is an estimate');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'total' ->> 'amount', '1748', '£13.98 + £3.50 delivery');

-- adding again adds up; weight item priced per kg
select is((api.add_cart_item(current_setting('t.rice')::uuid, 1, null, null, current_setting('t.tok')) -> 'lines' -> 0 ->> 'quantity'), '3', 'same product adds up (2 + 1)');
select set_config('t.v', api.add_cart_item(current_setting('t.tom')::uuid, 1, null, null, current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb -> 'lines' -> 1 ->> 'weightGrams', '1000', 'weight item: 1 step = 1000 g');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'itemsSubtotal' ->> 'amount', '2230', '£20.97 + £1.33');
select is(current_setting('t.v')::jsonb -> 'totals' ->> 'isEstimate', 'true', 'weight items make the total an estimate');
select throws_ok(format($$ select api.add_cart_item(%L::uuid, null, 1500, null, %L) $$, current_setting('t.tom'), current_setting('t.tok')),
  'PT400', 'QUANTITY_INVALID', 'weight must be min + whole steps');
select throws_ok(format($$ select api.add_cart_item(%L::uuid, 51, null, null, %L) $$, current_setting('t.jamun'), current_setting('t.tok')),
  'PT400', 'QUANTITY_INVALID', 'more than the per-line maximum is refused');
select throws_ok(format($$ select api.add_cart_item(%L::uuid, 1, null, null, %L) $$, current_setting('t.juice'), current_setting('t.tok')),
  'PT409', 'INSUFFICIENT_STOCK', 'sold-out product cannot be added');

-- postcode
select set_config('t.v', api.set_cart_postcode('al10 9ab', current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb ->> 'postcode', 'AL10 9AB', 'postcode normalised');
select is(current_setting('t.v')::jsonb -> 'zone' ->> 'code', 'HATFIELD', 'zone found');
select is(current_setting('t.v')::jsonb -> 'delivery' ->> 'isEstimate', 'false', 'delivery priced for the zone');
select throws_ok($$ select api.set_cart_postcode('ZZ1 1ZZ') $$, 'PT422', 'POSTCODE_NOT_SERVED', 'postcode outside the zones');
select throws_ok($$ select api.set_cart_postcode('hello') $$, 'PT400', 'POSTCODE_INVALID', 'not a postcode');

-- coupons
select set_config('t.v', api.apply_coupon('fresh20', current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb -> 'coupon' ->> 'reasonCode', 'SIGN_IN_REQUIRED', 'first-order code needs an account');
select set_config('t.v', api.apply_coupon('VARAM10', current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb -> 'coupon' ->> 'reasonCode', 'MIN_BASKET', 'below the £50 minimum');
select is(current_setting('t.v')::jsonb -> 'coupon' -> 'details' -> 'amountNeeded' ->> 'amount', '2770', '£50 − £22.30 still needed');
select set_config('t.line', current_setting('t.v')::jsonb -> 'lines' -> 0 ->> 'id', true);
-- 7 × £6.99 + £1.33 = £50.26 → £10 off, free delivery (threshold uses the pre-discount value)
select set_config('t.v', api.update_cart_item(current_setting('t.line')::uuid, 7, null, null, current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb -> 'coupon' ->> 'status', 'applied', 'VARAM10 applies at £50.26');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'discountTotal' ->> 'amount', '1000', '£10 off');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'deliveryFee' ->> 'amount', '0', 'free delivery from £50');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'total' ->> 'amount', '4026', '£50.26 − £10');
-- £10 allocated pro rata by largest remainder: 4893/5026 → 974, 133/5026 → 26
select is(current_setting('t.v')::jsonb -> 'lines' -> 0 -> 'discount' ->> 'amount', '974', 'rice gets 974p of the discount');
select is(current_setting('t.v')::jsonb -> 'lines' -> 1 -> 'discount' ->> 'amount', '26', 'tomatoes get 26p');
select throws_ok(format($$ select api.apply_coupon('NOPE', %L) $$, current_setting('t.tok')), 'PT422', 'COUPON_INVALID', 'unknown code');
select throws_ok(format($$ select api.apply_coupon('VARAM20', %L) $$, current_setting('t.tok')), 'PT422', 'COUPON_INVALID', 'draft promotion code');
select is(api.remove_coupon(current_setting('t.tok')) ->> 'coupon', null, 'coupon removed');

-- free-delivery code limited to Hertfordshire zones: 5 × £6.99 + £1.33 = £36.28
select set_config('t.v', api.update_cart_item(current_setting('t.line')::uuid, 5, null, null, current_setting('t.tok'))::text, true);
select set_config('t.v', api.apply_coupon('HERTSFREE', current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb -> 'totals' -> 'deliveryFee' ->> 'amount', '0', 'HERTSFREE waives delivery in Hatfield');
select is(current_setting('t.v')::jsonb -> 'appliedPromotions' -> 0 -> 'discount' ->> 'amount', '350', 'waived fee reported as the discount');
select set_config('t.v', api.set_cart_postcode('N10 1AA', current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb -> 'coupon' ->> 'reasonCode', 'ZONE', 'HERTSFREE not valid in North London');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'total' ->> 'amount', '3978', '£36.28 + £3.50');

-- VAT: standard-rated line + delivery VAT apportioned over the goods' rates
select set_config('t.v', api.add_cart_item(current_setting('t.jamun')::uuid, 1, null, null, current_setting('t.tok'))::text, true);
select is(current_setting('t.v')::jsonb -> 'lines' -> 2 -> 'vat' ->> 'amount', '75', '20% VAT inside £4.49 = 75p');
-- £3.50 split 3628 : 449 → 311 + 39; VAT on 39p at 20% = 6.5 → 7p (half up)
select is((select jsonb_agg(d -> 'gross' ->> 'amount' order by (d ->> 'rateBp')::int) from jsonb_array_elements(current_setting('t.v')::jsonb -> 'deliveryLines') d),
          '["311", "39"]'::jsonb, 'delivery apportioned by goods value per VAT rate');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'vatTotal' ->> 'amount', '82', 'VAT total 75p + 7p');
select is((current_setting('t.v')::jsonb -> 'totals' -> 'total' ->> 'amount')::int,
          (current_setting('t.v')::jsonb -> 'totals' -> 'itemsSubtotal' ->> 'amount')::int
          - (current_setting('t.v')::jsonb -> 'totals' -> 'discountTotal' ->> 'amount')::int
          + (current_setting('t.v')::jsonb -> 'totals' -> 'depositTotal' ->> 'amount')::int
          + (current_setting('t.v')::jsonb -> 'totals' -> 'deliveryFee' ->> 'amount')::int, 'total = items − discounts + deposits + delivery');

-- remove and clear
select is((api.remove_cart_item((current_setting('t.v')::jsonb -> 'lines' -> 1 ->> 'id')::uuid, current_setting('t.tok')) ->> 'lineCount'), '2', 'line removed');
select is((api.clear_cart(current_setting('t.tok')) ->> 'itemCount'), '0', 'basket cleared');

-- guest → customer: the guest basket is adopted on the first call after signing in
reset role;
select set_config('t.uid', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, email, created_at, updated_at)
values (current_setting('t.uid')::uuid, 'authenticated', 'authenticated', 'cart-test@example.com', now(), now());
insert into app.customers (user_id, email, first_name, last_name) values (current_setting('t.uid')::uuid, 'cart-test@example.com', 'Test', 'Shopper');
set local role anon;
select set_config('t.tok2', api.add_cart_item(current_setting('t.rice')::uuid, 6) ->> 'cartToken', true);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is(api.get_cart(current_setting('t.tok2')) ->> 'itemCount', '6', 'signed-in shopper sees their guest basket');
-- 6 × £6.99 = £41.94 → FRESH20 (first order, min £40): 20% = 838.8 → 839; delivery estimate £3.50
select set_config('t.v', api.apply_coupon('FRESH20', current_setting('t.tok2'))::text, true);
select is(current_setting('t.v')::jsonb -> 'coupon' ->> 'status', 'applied', 'FRESH20 applies for a first order');
select is(current_setting('t.v')::jsonb -> 'totals' -> 'discountTotal' ->> 'amount', '839', '20% of £41.94, rounded half up');
select is(current_setting('t.v')::jsonb ->> 'cartToken', null, 'customer baskets need no token');
reset role;
select is((select count(*)::int from app.carts c join app.customers cu on cu.id = c.customer_id where cu.user_id = current_setting('t.uid')::uuid), 1,
          'guest basket now belongs to the customer');

select * from finish();
