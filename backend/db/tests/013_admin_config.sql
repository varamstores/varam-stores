-- Admin configuration: settings, company & VAT, promotions & codes (live in the shop), delivery areas,
-- charges, windows and slots (live in the postcode checker), vans & drivers, loyalty, staff & roles, audit log.
select plan(43);

select set_config('t.staff_uid', (select user_id::text from app.staff where email = 'test@gmail.com'), true);
select set_config('t.staff_id', (select id::text from app.staff where email = 'test@gmail.com'), true);
select set_config('t.rice', (select id::text from app.products where slug = 'basmati-rice-aged'), true);
select set_config('t.zone1', (select id::text from app.delivery_zones where code = 'HATFIELD'), true);
-- someone who already has a confirmed account (e.g. a shopper) and is then added to the staff
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values (gen_random_uuid(), 'authenticated', 'authenticated', 'staff-link-test@example.com', now(), now(), now());
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff_uid'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- settings
select is(api.admin_get_settings() -> 0 ->> 'group', 'Store details', 'settings are grouped, store details first');
select ok((select bool_and(s ? 'label' and s ? 'help' and s ? 'kind') from jsonb_array_elements(api.admin_get_settings()) g, jsonb_array_elements(g -> 'settings') s), 'every setting has a label, help and type');
select throws_ok($$ select api.admin_update_setting('max_line_quantity', '0') $$, 'PT400', 'VALIDATION_FAILED', 'number below its minimum refused');
select is((select s -> 'value' from jsonb_array_elements(api.admin_update_setting('max_line_quantity', '40')) g, jsonb_array_elements(g -> 'settings') s where s ->> 'key' = 'max_line_quantity'),
  '40'::jsonb, 'number saved');
select throws_ok($$ select api.admin_update_setting('max_line_quantity', '"forty"') $$, 'PT400', 'VALIDATION_FAILED', 'text refused for a number');
select throws_ok($$ select api.admin_update_setting('currency', '"EUR"') $$, 'PT403', 'FORBIDDEN', 'read-only settings cannot be changed');
select throws_ok($$ select api.admin_update_setting('support_email', '"not-an-email"') $$, 'PT400', 'VALIDATION_FAILED', 'email checked');
select throws_ok($$ select api.admin_update_setting('payment_mode', '"cash"') $$, 'PT400', 'VALIDATION_FAILED', 'only listed options allowed');
select throws_ok($$ select api.admin_update_setting('newsletter_welcome_code', '"NOSUCHCODE"') $$, 'PT400', 'VALIDATION_FAILED', 'welcome code must exist under Promotions');
select throws_ok($$ select api.admin_update_setting('invoices_enabled', 'true') $$, 'PT400', 'VALIDATION_FAILED', 'invoices need company and VAT details first');
select is((select s ->> 'value' from jsonb_array_elements(api.admin_update_setting('support_phone', '"01707 123456"')) g, jsonb_array_elements(g -> 'settings') s where s ->> 'key' = 'support_phone'),
  '+441707123456', 'phone stored in international format');

-- company & VAT
select throws_ok($$ select api.admin_save_company('{"name": "Varam Foods Ltd", "vatNumber": "123", "address": {"line1": "1 High St"}}') $$, 'PT400', 'VALIDATION_FAILED', 'VAT number format checked');
select is(api.admin_save_company('{"name": "Varam Foods Ltd", "vatNumber": "GB 123 4567 89", "companyNumber": "12345678", "address": {"line1": "1 High St", "city": "Hatfield", "postcode": "AL10 0AA"}}')
  -> 'company' ->> 'vatNumber', 'GB123456789', 'company saved, VAT number tidied');
select is((select s -> 'value' from jsonb_array_elements(api.admin_update_setting('invoices_enabled', 'true')) g, jsonb_array_elements(g -> 'settings') s where s ->> 'key' = 'invoices_enabled'),
  'true'::jsonb, 'invoices can be switched on once details are saved');

-- promotions & codes
select set_config('t.promo', api.admin_save_promotion('{"label": "Test 10% off", "type": "percent_off", "percent": 10, "code": "testten"}') ->> 'id', true);
select is((select api.admin_list_promotions('draft') @> jsonb_build_array(jsonb_build_object('id', current_setting('t.promo')))), true, 'new offers start as drafts');
select is(api.admin_save_promotion(jsonb_build_object('id', current_setting('t.promo'), 'status', 'active')) -> 'coupons' -> 0 ->> 'code', 'TESTTEN', 'code saved in capitals; offer live');
select throws_ok($$ select api.admin_save_promotion('{"label": "Copy", "type": "percent_off", "percent": 5, "code": "TESTTEN"}') $$, 'PT409', 'CONFLICT', 'a code can only belong to one offer');
select throws_ok($$ select api.admin_save_promotion('{"label": "3 for 2", "type": "multibuy_x_for_y", "buyQty": 3, "payQty": 2, "status": "active"}') $$, 'PT400', 'VALIDATION_FAILED', 'multi-buy needs products chosen before going live');
select throws_ok($$ select api.admin_save_promotion('{"label": "Bad", "type": "multibuy_x_for_y", "buyQty": 2, "payQty": 3}') $$, 'PT400', 'VALIDATION_FAILED', 'pay quantity must be less than buy quantity');
select is(jsonb_array_length(api.admin_create_coupons(current_setting('t.promo')::uuid, null, 3, 'tst') -> 'coupons'), 4, 'three single-use codes generated');
select is(api.admin_save_promotion(jsonb_build_object('label', 'Member rice', 'type', 'member_price', 'percent', 5,
  'targets', jsonb_build_array(jsonb_build_object('type', 'product', 'id', current_setting('t.rice'))))) -> 'targets' -> 0 ->> 'name', 'Basmati Rice Aged', 'targets shown by name');

-- delivery areas
select throws_ok(format($$ select api.admin_save_zone('{"id": "%s", "postcodes": ["AL10", "HELLO"]}') $$, current_setting('t.zone1')), 'PT400', 'VALIDATION_FAILED', 'postcode areas checked');
select throws_ok($$ select api.admin_save_zone('{"name": "Test Area", "postcodes": ["AL10"]}') $$, 'PT409', 'CONFLICT', 'a postcode area belongs to one delivery area');
select set_config('t.zone', api.admin_save_zone('{"name": "Test Area", "postcodes": ["zz1"], "minBasketMinor": 2000}') ->> 'id', true);
select is(jsonb_array_length((select x -> 'windows' from jsonb_array_elements(api.admin_list_zones()) x where x ->> 'id' = current_setting('t.zone'))), 21, 'new area starts with the usual delivery windows');
select is(api.check_postcode('ZZ1 1AA') -> 'zone' ->> 'code', 'TEST-AREA', 'postcode checker finds the new area');
select throws_ok(format($$ select api.admin_set_zone_fees(%L::uuid, '[{"fromMinor": 1000, "feeMinor": 300}]') $$, current_setting('t.zone')), 'PT400', 'VALIDATION_FAILED', 'charges must start from £0');
select is(api.admin_set_zone_fees(current_setting('t.zone')::uuid, '[{"fromMinor": 0, "feeMinor": 399}, {"fromMinor": 4000, "feeMinor": 0}]') -> 'fees' -> 0 ->> 'feeMinor', '399', 'delivery charges replaced');
select is(api.admin_set_zone_fees(current_setting('t.zone')::uuid, '[{"fromMinor": 0, "feeMinor": 450}]') -> 'fees', '[{"feeMinor": 450, "fromMinor": 0}]'::jsonb, 'charges can be changed again straight away');
select is(jsonb_array_length(api.admin_set_zone_windows(current_setting('t.zone')::uuid, '[{"weekday": 1, "start": "09:00", "end": "11:00", "capacity": 10}, {"weekday": 2, "start": "09:00", "end": "11:00", "capacity": 10}, {"weekday": 3, "start": "09:00", "end": "11:00", "capacity": 10}, {"weekday": 4, "start": "09:00", "end": "11:00", "capacity": 10}, {"weekday": 5, "start": "09:00", "end": "11:00", "capacity": 10}, {"weekday": 6, "start": "09:00", "end": "11:00", "capacity": 10}, {"weekday": 7, "start": "09:00", "end": "11:00", "capacity": 10}]') -> 'windows'), 7, 'weekly windows replaced');
select ok((select bool_and(((x ->> 'startsAt')::timestamptz at time zone 'Europe/London')::time = '09:00') from jsonb_array_elements(api.admin_list_slots(current_setting('t.zone')::uuid, null, 14)) x), 'slots follow the new windows');
select set_config('t.slot', api.admin_list_slots(current_setting('t.zone')::uuid, null, 14) -> 0 ->> 'id', true);
select is(api.admin_update_slot(current_setting('t.slot')::uuid, 5, 'closed') ->> 'status', 'closed', 'one slot closed');
select throws_ok($$ select api.admin_save_driver('{"name": "Test Driver", "phone": "12"}') $$, 'PT400', 'PHONE_INVALID', 'driver phone checked');
select ok(api.admin_save_van('{"code": "#t9", "name": "Test van"}') -> 'vans' @> '[{"code": "#T9"}]', 'van added');

-- loyalty
select ok(api.admin_save_loyalty_tier(null, 'Test Platinum', 50000, 2) -> 'tiers' @> '[{"code": "test_platinum", "multiplier": 2}]', 'tier added');
select throws_ok($$ select api.admin_save_loyalty_tier('member', 'Member', 0, 1, true) $$, 'PT409', 'CONFLICT', 'starting tier cannot be deleted');
select ok(api.admin_save_loyalty_reward('{"title": "£3 off", "pointsCost": 300, "amountMinor": 300}') -> 'rewards' @> '[{"title": "£3 off", "pointsCost": 300}]', 'reward added (offer created behind the scenes)');

-- staff & roles
select throws_ok(format($$ select api.admin_update_staff(%L::uuid, 'dispatch_lead') $$, current_setting('t.staff_id')), 'PT409', 'LAST_STORE_MANAGER', 'last Store Manager protected');
select is(api.admin_invite_staff('Link Test', 'Staff-Link-Test@example.com', 'customer_support') -> 'invited' ->> 'emailSent', 'false', 'existing account linked without an email');
select throws_ok($$ select api.admin_set_role_permissions('store_manager', array['pricing']) $$, 'PT400', 'VALIDATION_FAILED', 'Store Manager keeps full access');
select is(api.admin_list_audit_log(null, 'staff.') -> 0 ->> 'action', 'staff.invited', 'changes are in the audit log');
reset role;

-- the linked person now has staff permissions
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from auth.users where email = 'staff-link-test@example.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select is(api.get_session_context() -> 'staff' ->> 'role', 'customer_support', 'linked person signs in as staff');
select throws_ok($$ select api.admin_get_settings() $$, 'PT403', 'FORBIDDEN', 'support staff cannot open settings');
reset role;

-- the offer made in the admin works in the shop
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select set_config('t.tok', api.add_cart_item(current_setting('t.rice')::uuid, 2) ->> 'cartToken', true);
select is(api.apply_coupon('TESTTEN', current_setting('t.tok')) -> 'coupon' ->> 'status', 'applied', 'admin-made code applies at checkout');
reset role;

select * from finish();
