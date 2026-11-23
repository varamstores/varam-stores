-- Admin catalogue: products, prices, food info, images, categories, brands, shelves, CSV.
select plan(26);

select set_config('t.staff_uid', (select user_id::text from app.staff where email = 'test@gmail.com'), true);
select set_config('t.cat', (select id::text from app.categories where slug = 'rice-millets'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff_uid'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- create → draft; going live needs a price
select set_config('t.p', api.admin_save_product(jsonb_build_object('name', 'Test Ponni Rice', 'sku', 'TST-PONNI-5', 'primaryCategoryId', current_setting('t.cat'),
  'taxCategoryCode', 'zero_rated', 'packSize', '5 kg')) ->> 'id', true);
select is(api.admin_get_product(current_setting('t.p')::uuid) ->> 'status', 'draft', 'new products start as drafts');
select is(api.admin_get_product(current_setting('t.p')::uuid) ->> 'slug', 'test-ponni-rice', 'web address made from the name');
select throws_ok(format($$ select api.admin_save_product('{"id": "%s", "status": "active"}') $$, current_setting('t.p')), 'PT400', 'VALIDATION_FAILED', 'cannot go live without a price');
select is((api.admin_set_price(current_setting('t.p')::uuid, 899, null, 'launch') ->> 'priceMinor')::int, 899, 'price set');
select is(api.admin_save_product(jsonb_build_object('id', current_setting('t.p'), 'status', 'active')) ->> 'status', 'active', 'now live');
reset role;
update app.product_prices set valid_from = valid_from - interval '1 day' where product_id = current_setting('t.p')::uuid;  -- (rolled back) an earlier price
set local role authenticated;
select is((api.admin_set_price(current_setting('t.p')::uuid, 849) ->> 'priceMinor')::int, 849, 'price changed');
select is(jsonb_array_length(api.admin_get_product(current_setting('t.p')::uuid) -> 'priceHistory'), 2, 'old price kept in history');
select throws_ok(format($$ select api.admin_save_product('{"name": "Dup", "sku": "TST-PONNI-5", "primaryCategoryId": "%s", "taxCategoryCode": "zero_rated", "packSize": "1 kg"}') $$, current_setting('t.cat')),
  'PT409', 'CONFLICT', 'SKU must be unique');
select throws_ok($$ select api.admin_set_price(gen_random_uuid(), 100) $$, 'PT404', 'PRODUCT_NOT_FOUND', 'unknown product');
select is(api.get_product('test-ponni-rice') -> 'price' ->> 'amount', '849', 'shop shows the new price');

-- food information
select set_config('t.v', api.admin_save_food_info(current_setting('t.p')::uuid, '{"basis": "per_100g", "energyKj": 1460, "energyKcal": 350, "fat": 0.6, "saturates": 0.1,
  "carbohydrate": 78, "sugars": 0.1, "protein": 7.5, "salt": 0, "fboName": "Test Mills Ltd", "fboAddress": "1 Mill Road, Hatfield", "ingredients": "Rice",
  "contains": [], "mayContain": ["cereals_gluten"], "allergensReviewed": true}')::text, true);
select is(current_setting('t.v')::jsonb ->> 'foodInfoComplete', 'true', 'complete food information recognised');
select is(current_setting('t.v')::jsonb -> 'foodInfo' ->> 'reviewedBy', 'Test Store Manager', 'who reviewed allergens is recorded');
select is(current_setting('t.v')::jsonb -> 'mayContain' ->> 0, 'cereals_gluten', 'may-contain allergen saved');
select throws_ok(format($$ select api.admin_save_food_info(%L::uuid, '{"fat": -1}') $$, current_setting('t.p')), 'PT400', 'VALIDATION_FAILED', 'negative nutrition refused');

-- photos
select is(jsonb_array_length(api.admin_set_product_images(current_setting('t.p')::uuid, '[{"path": "/product-rice.jpg", "alt": "Rice"}]') -> 'images'), 1, 'photo saved (leading slash removed)');

-- lists & filters
select ok((api.admin_list_products('TST-PONNI') ->> 'total')::int = 1, 'search by SKU');
select ok((select bool_and(x -> 'issues' ? 'food_info') from jsonb_array_elements(api.admin_list_products(null, null, 'active', 'food_info', 200) -> 'items') x), 'filter: products missing food information');

-- categories & brands & shelves
select set_config('t.c', api.admin_save_category('{"name": "Test Millets", "parentId": null}') ->> 'id', true);
select is((select x ->> 'slug' from jsonb_array_elements(api.admin_list_categories()) x where x ->> 'id' = current_setting('t.c')), 'test-millets', 'category added');
select ok(jsonb_array_length(api.admin_delete_category(current_setting('t.c')::uuid)) > 0, 'empty category deleted');
select throws_ok(format($$ select api.admin_delete_category(%L::uuid) $$, current_setting('t.cat')), 'PT409', 'CONFLICT', 'categories with products cannot be deleted');
select is(api.admin_save_brand('{"name": "Test Brand Co"}') ->> 'slug', 'test-brand-co', 'brand added');
select is((select jsonb_array_length(x -> 'products') from jsonb_array_elements(api.admin_save_collection('fresh-picks', 'Fresh picks', array[current_setting('t.p')::uuid])) x where x ->> 'code' = 'fresh-picks'), 1, 'shelf products replaced in order');

-- CSV
select ok(api.admin_export_products_csv() like 'sku,name,status,price%' and api.admin_export_products_csv() like '%TST-PONNI-5%', 'export has a header and the products');
select is(jsonb_array_length(api.admin_import_products_csv(E'sku,price,colour\nTST-PONNI-5,abc,red\n', true) -> 'errors'), 2, 'dry run lists every problem (bad price, unknown column)');
select is((api.admin_import_products_csv(E'sku,price,badge\n"TST-PONNI-5",7.99,"New, improved"\n', false) ->> 'priceChanges')::int, 1, 'import applies price changes');
select is(api.admin_get_product(current_setting('t.p')::uuid) ->> 'badge', 'New, improved', 'quoted CSV value with a comma imported intact');
reset role;

select * from finish();
