-- Loyalty, reviews, stock/price alerts, repeat orders, abandoned-basket reminders, card hold amount.
select plan(27);

select set_config('t.rice', (select id::text from app.products where slug = 'basmati-rice-aged'), true);
select set_config('t.tom', (select id::text from app.products where slug = 'organic-red-tomatoes'), true);
select set_config('t.juice', (select id::text from app.products where slug = 'cold-pressed-citrus-juice'), true);
select set_config('t.reward', (select id::text from app.loyalty_rewards limit 1), true);
select set_config('t.uid', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, email, created_at, updated_at) values (current_setting('t.uid')::uuid, 'authenticated', 'authenticated', 'engage-test@example.com', now(), now());
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
set local role authenticated;
select api.complete_signup('Enga', 'Ge', true, (select api.get_session_context() ->> 'termsVersion'), true, false);
reset role;
select set_config('t.cust', (select id::text from app.customers where user_id = current_setting('t.uid')::uuid), true);

-- public config carries what sign-up and checkout need
select ok((api.get_storefront_config() ->> 'termsVersion') is not null and (api.get_storefront_config() ->> 'paymentMode') in ('stripe', 'simulated'), 'config has terms version and payment mode');

-- loyalty
update app.loyalty_accounts set points_balance = 600, lifetime_points = 1200 where customer_id = current_setting('t.cust')::uuid;
set local role authenticated;
select is(api.get_my_loyalty() -> 'tier' ->> 'name', 'Gold', 'tier from lifetime points');
select is(api.get_my_loyalty() -> 'nextTier' ->> 'pointsNeeded', '800', 'points to VIP');
select set_config('t.code', api.redeem_loyalty_reward(current_setting('t.reward')::uuid) ->> 'code', true);
select ok(current_setting('t.code') ~ '^RW[0-9A-F]{10}$', 'reward gives a personal code');
select is((api.get_my_loyalty() ->> 'balance')::int, 100, '500 points spent');
select throws_ok(format($$ select api.redeem_loyalty_reward(%L::uuid) $$, current_setting('t.reward')), 'PT422', 'INSUFFICIENT_POINTS', 'cannot overspend');
reset role;
select is((select customer_id::text from app.coupons where code = current_setting('t.code')), current_setting('t.cust'), 'code bound to this customer');

-- reviews
set local role authenticated;
select is(api.submit_review(current_setting('t.rice')::uuid, 5, 'Lovely fluffy rice') ->> 'verified', 'false', 'unverified without a delivered order');
select throws_ok(format($$ select api.submit_review(%L::uuid, 4, 'Again') $$, current_setting('t.rice')), 'PT409', 'ALREADY_REVIEWED', 'one review per product');
select throws_ok(format($$ select api.submit_review(%L::uuid, 9, 'x') $$, current_setting('t.tom')), 'PT400', 'VALIDATION_FAILED', 'rating 1–5');
reset role;
select is((select status from app.reviews where customer_id = current_setting('t.cust')::uuid), 'pending', 'waits for moderation');

-- alerts
update app.stock_levels set on_hand = reserved where product_id = current_setting('t.juice')::uuid;
set local role authenticated;
select is(jsonb_array_length(api.create_product_alert(current_setting('t.juice')::uuid, 'back_in_stock')), 1, 'back-in-stock alert set');
select is(jsonb_array_length(api.create_product_alert(current_setting('t.juice')::uuid, 'back_in_stock')), 1, 'setting it twice keeps one');
select ok((select bool_or(a ->> 'kind' = 'price_drop' and (a -> 'priceAtSet' ->> 'amount')::int = 699) from jsonb_array_elements(api.create_product_alert(current_setting('t.rice')::uuid, 'price_drop')) a), 'price-drop alert set at the current price');
reset role;
select is(app.process_product_alerts(), 0, 'nothing to send while sold out and price unchanged');
update app.stock_levels set on_hand = reserved + 10 where product_id = current_setting('t.juice')::uuid;
update app.product_alerts set price_at_set_minor = price_at_set_minor + 100 where customer_id = current_setting('t.cust')::uuid and kind = 'price_drop';
select is(app.process_product_alerts(), 2, 'back in stock + cheaper → two emails');
select is((select count(*)::int from app.outbound_messages where to_address = 'engage-test@example.com' and template_code in ('product_back_in_stock', 'product_price_drop')), 2, 'alert emails queued');

-- repeat orders (from a delivered order)
insert into app.orders (customer_id, status, contact_email, address_snapshot, est_items_minor, est_total_minor, est_vat_minor, authorised_minor, captured_minor, is_sample, number)
values (current_setting('t.cust')::uuid, 'delivered', 'engage-test@example.com', '{}', 699, 699, 0, 699, 699, true, 'VF-99901');
insert into app.order_lines (order_id, line_no, line_type, product_id, name_snapshot, sale_unit, quantity_ordered, unit_price_minor, est_gross_minor, tax_category_code, vat_rate_bp, est_vat_minor)
select id, 1, 'product', current_setting('t.rice')::uuid, 'Basmati Rice Aged', 'each', 2, 699, 1398, 'zero_rated', 0, 0 from app.orders where number = 'VF-99901';
set local role authenticated;
select set_config('t.rep', api.create_repeat_from_order('VF-99901', 14) ->> 'id', true);
select is((select jsonb_array_length(r -> 'items') from jsonb_array_elements(api.list_my_repeat_orders()) r), 1, 'repeat order copies the items');
select is((api.update_repeat_order(current_setting('t.rep')::uuid, '{"action": "skip"}') ->> 'nextDate')::date,
          (now() at time zone 'Europe/London')::date + 28, 'skip moves it on by one cycle');
select is(api.update_repeat_order(current_setting('t.rep')::uuid, '{"action": "pause"}') ->> 'status', 'paused', 'paused');
select is(api.update_repeat_order(current_setting('t.rep')::uuid, '{"action": "resume"}') ->> 'status', 'active', 'resumed');
select throws_ok(format($$ select api.update_repeat_order(%L::uuid, '{"frequencyDays": 3}') $$, current_setting('t.rep')), 'PT400', 'VALIDATION_FAILED', 'only 1–4 weekly');
select is(api.run_repeat_order_now(current_setting('t.rep')::uuid) -> 'lines' -> 0 ->> 'quantity', '2', 'run now fills the basket');
reset role;
update app.repeat_orders set next_run_date = (now() at time zone 'Europe/London')::date where id = current_setting('t.rep')::uuid;
select is(app.process_repeat_orders(), 1, 'due repeat order processed by the job');
select is((select count(*)::int from app.outbound_messages where to_address = 'engage-test@example.com' and template_code = 'repeat_order_ready'), 1, 'reminder email queued');

-- abandoned basket: needs marketing consent (given at sign-up above)
alter table app.carts disable trigger carts_touch;   -- (rolled back) so the basket can be backdated
update app.carts set updated_at = now() - interval '25 hours', reminder_sent_at = null where customer_id = current_setting('t.cust')::uuid;
alter table app.carts enable trigger carts_touch;
select ok(app.process_abandoned_carts() >= 1, 'stale basket of a consenting customer gets a reminder');
select is((select count(*)::int from app.outbound_messages where to_address = 'engage-test@example.com' and template_code = 'abandoned_basket'), 1, 'one reminder per basket change');

select * from finish();
