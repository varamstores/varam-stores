-- Admin operations: dashboard, inventory, stock CSV, suppliers, purchase orders (+auto drafts),
-- customers, loyalty adjustments, messages, reviews, templates, outbox.
select plan(26);

select set_config('t.staff_uid', (select user_id::text from app.staff where email = 'test@gmail.com'), true);
select set_config('t.rice', (select id::text from app.products where slug = 'basmati-rice-aged'), true);
select set_config('t.onhand', (select on_hand::text from app.stock_levels where product_id = current_setting('t.rice')::uuid), true);
select set_config('t.cust', (select id::text from app.customers where is_sample order by created_at limit 1), true);
select set_config('t.review', (select id::text from app.reviews limit 1), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff_uid'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- dashboard
select ok(api.admin_dashboard('7d') ?& array['kpis', 'trend', 'topProducts', 'attention', 'statusCounts'], 'dashboard has figures, trend and attention list');
select is(jsonb_array_length(api.admin_dashboard('7d') -> 'trend'), 7, 'seven days in the trend');
select is(api.admin_dashboard('today') ->> 'showsMoney', 'true', 'Store Manager sees money');

-- inventory
select is((api.admin_adjust_stock(current_setting('t.rice')::uuid, 5, 'restock', 'delivery') ->> 'onHand')::int, current_setting('t.onhand')::int + 5, 'restock adds stock');
select throws_ok(format($$ select api.admin_adjust_stock(%L::uuid, -100000, 'write_off') $$, current_setting('t.rice')), 'PT409', 'NEGATIVE_STOCK', 'cannot go below what is held for orders');
select throws_ok(format($$ select api.admin_adjust_stock(%L::uuid, 1, 'magic') $$, current_setting('t.rice')), 'PT400', 'VALIDATION_FAILED', 'a reason is required');
select throws_ok(format($$ select api.admin_set_stock_levels(%L::uuid, 10, 5) $$, current_setting('t.rice')), 'PT400', 'VALIDATION_FAILED', 'ideal level must be at least the reorder level');
select is((api.admin_set_stock_levels(current_setting('t.rice')::uuid, 10, 40) ->> 'reorderPoint')::int, 10, 'reorder level saved');
select is(api.admin_list_stock_movements(current_setting('t.rice')::uuid, 5) -> 0 ->> 'reason', 'restock', 'history shows the restock');
select is(jsonb_array_length(api.admin_import_stock_csv(E'sku,on_hand\nNOPE-1,5\nVRM-RCE-05K,x\n', true) -> 'errors'), 2, 'stock count checks every row');
select is((api.admin_import_stock_csv(E'sku,on_hand\nVRM-RCE-05K,60\n', false) ->> 'changes')::int, 1, 'stock count applied');

-- suppliers & purchase orders
select throws_ok($$ select api.admin_save_supplier('{"name": "Test Supplier", "phone": "12"}') $$, 'PT400', 'PHONE_INVALID', 'supplier phone checked');
select set_config('t.sup', api.admin_save_supplier('{"name": "Test Supplier", "email": "orders@test-supplier.example"}') ->> 'id', true);
select set_config('t.po', api.admin_save_purchase_order(jsonb_build_object('supplierId', current_setting('t.sup'), 'lines',
  jsonb_build_array(jsonb_build_object('productId', current_setting('t.rice'), 'quantity', 10, 'unitCostMinor', 400)))) ->> 'id', true);
select throws_ok(format($$ select api.admin_send_purchase_order(%L::uuid) $$, current_setting('t.po')), 'PT400', 'VALIDATION_FAILED', 'emailing needs a verified supplier contact');
select is(api.admin_send_purchase_order(current_setting('t.po')::uuid, false) ->> 'status', 'sent', 'sent without emailing');
select throws_ok(format($$ select api.admin_receive_purchase_order(%L::uuid, '[{"productId": "%s", "quantityReceived": 11}]') $$, current_setting('t.po'), current_setting('t.rice')),
  'PT400', 'QUANTITY_INVALID', 'cannot receive more than ordered');
select is(api.admin_receive_purchase_order(current_setting('t.po')::uuid, format('[{"productId": "%s", "quantityReceived": 4}]', current_setting('t.rice'))::jsonb) ->> 'status', 'partially_received', 'part delivery');
select is(api.admin_receive_purchase_order(current_setting('t.po')::uuid, format('[{"productId": "%s", "quantityReceived": 6}]', current_setting('t.rice'))::jsonb) ->> 'status', 'received', 'rest delivered');
select is((select (x ->> 'onHand')::int from jsonb_array_elements(api.admin_list_inventory('all', 'VRM-RCE-05K')) x), 70, 'received stock added (60 counted + 10)');
-- auto drafts: put rice at its reorder level with a main supplier
select api.admin_set_product_supplier(current_setting('t.rice')::uuid, current_setting('t.sup')::uuid, 'TS-RICE', 400, true);
select api.admin_adjust_stock(current_setting('t.rice')::uuid, -60, 'adjustment', 'test');
select ok((api.admin_generate_reorder_drafts() ->> 'created')::int >= 1, 'low stock creates draft purchase orders');

-- customers
select ok((api.admin_list_customers() ->> 'total')::int >= 1, 'customer list');
select is(api.admin_update_customer(current_setting('t.cust')::uuid, 'vip', 'Prefers morning slots') ->> 'status', 'vip', 'status and notes saved');
select throws_ok(format($$ select api.admin_adjust_loyalty(%L::uuid, -999999, 'test') $$, current_setting('t.cust')), 'PT422', 'INSUFFICIENT_POINTS', 'points cannot go negative');
select ok((api.admin_adjust_loyalty(current_setting('t.cust')::uuid, 50, 'Goodwill') -> 'loyalty' ->> 'balance')::int >= 50, 'goodwill points added');
select is(api.admin_send_customer_message(current_setting('t.cust')::uuid, 'email', 'Your order', 'Hello') ->> 'status', 'queued', 'service message queued');
select is(api.admin_moderate_review(current_setting('t.review')::uuid, 'rejected') -> 0, null, 'review moderated');
select throws_ok($$ select api.admin_save_message_template('newsletter_confirm', 'email', 'Confirm', 'Please confirm') $$, 'PT400', 'VALIDATION_FAILED', 'required link placeholder must stay');
reset role;

select * from finish();
