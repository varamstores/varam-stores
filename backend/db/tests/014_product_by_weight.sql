-- Adding a product sold by weight (regression for 0031), and the "add a product" steps' payload.
select plan(4);

select set_config('t.staff_uid', (select user_id::text from app.staff where email = 'test@gmail.com'), true);
select set_config('t.cat', (select id::text from app.categories where slug = 'vegetables-fruits'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff_uid'), 'role', 'authenticated')::text, true);
set local role authenticated;

select set_config('t.p', api.admin_save_product(jsonb_build_object('name', 'Test Loose Okra', 'sku', 'VRM-VEG-TEST-OKRA', 'primaryCategoryId', current_setting('t.cat'),
  'brandId', null, 'packSize', 'Loose, per kg', 'saleUnit', 'weight', 'estimatedWeightGrams', 500, 'minWeightGrams', 250, 'weightStepGrams', 250,
  'isFood', true, 'isPerishable', true, 'isReturnable', false, 'taxCategoryCode', 'zero_rated', 'ageRestrictionCode', null, 'description', null, 'rrpMinor', null)) ->> 'id', true);
select is(api.admin_get_product(current_setting('t.p')::uuid) ->> 'saleUnit', 'weight', 'product sold by weight can be created');
select is((api.admin_get_product(current_setting('t.p')::uuid) ->> 'minWeightGrams')::int, 250, 'its weights are saved');
select throws_ok(format($$ select api.admin_save_product('{"name": "Bad", "sku": "VRM-VEG-TEST-BAD", "primaryCategoryId": "%s", "packSize": "Loose", "saleUnit": "weight", "taxCategoryCode": "zero_rated"}') $$, current_setting('t.cat')),
  'PT400', 'VALIDATION_FAILED', 'weights are still required for items sold by weight');
select is(api.admin_save_product(jsonb_build_object('name', 'Test Jar', 'sku', 'VRM-PKL-TEST-JAR', 'primaryCategoryId', current_setting('t.cat'), 'packSize', '300 g',
  'saleUnit', 'each', 'taxCategoryCode', 'zero_rated')) ->> 'saleUnit', 'each', 'products sold in packs still work');
reset role;

select * from finish();
