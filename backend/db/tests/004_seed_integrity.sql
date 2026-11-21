-- Every frontend mock landed in Postgres correctly; config is consistent; purge works.
select plan(34);

-- catalogue (live)
select is((select count(*)::int from app.products where status = 'active'), 42, '42 active products (all of src/data/products.ts)');
select is((select count(*)::int from app.products where status = 'draft'), 2, '2 draft products from admin inventory mock');
select is((select count(*)::int from app.products where is_sample), 0, 'catalogue is live data, not sample');
select is((select count(*)::int from app.categories where parent_id is null), 15, '12 shop categories + 3 used by products');
select is((select count(*)::int from app.categories where parent_id is not null), 55, '55 subcategories');
select is((select count(*)::int from app.categories where parent_id is null and show_on_homepage), 12, 'homepage grid keeps the original 12');
select is((select count(*)::int from app.brands), 94, '94 brands');
select is((select count(*)::int from app.brands where marquee_position is not null and logo_url is not null), 22, '22 marquee brands with logos');
select is((select count(*)::int from app.collections), 4, '4 homepage shelves');
select is((select count(*)::int from app.collection_items), 20, '5 products on each shelf');

select is((select count(*)::int from app.products p where p.status = 'active'
  and app.current_price_minor(p.id) is null), 0, 'every active product has a current price');
select is((select count(*)::int from app.products p where p.status = 'active'
  and not exists (select 1 from app.product_images i where i.product_id = p.id)), 0, 'every active product has an image');
select is((select count(*)::int from app.products p
  where not exists (select 1 from app.product_translations t where t.product_id = p.id and t.locale = 'en-GB')), 0, 'every product has an en-GB name');
select is((select count(*)::int from app.product_images i where not exists (select 1 from app.media_assets m where m.object_path = i.url)), 0,
  'every product image exists in Supabase Storage');
select is((select count(*)::int from app.brands b where b.logo_url is not null and not exists (select 1 from app.media_assets m where m.object_path = b.logo_url)), 0,
  'every brand logo exists in Supabase Storage');
select is((select count(*)::int from app.categories c where c.image_url is not null and not exists (select 1 from app.media_assets m where m.object_path = c.image_url)), 0,
  'every category image exists in Supabase Storage');
select is((select count(*)::int from app.media_assets), 181, 'all 181 images from public/ are in Storage');
select ok(app.media_url('product-tomatoes.jpg') like 'https://%/storage/v1/object/public/storefront/product-tomatoes.jpg', 'media_url builds public Storage URLs');

select is(app.current_price_minor((select id from app.products where legacy_ref = 'prod-1')), 133, 'tomatoes £1.33 (float 1.33 → 133p)');
select is((select rrp_minor from app.products where legacy_ref = 'prod-1'), 166, 'originalPrice £1.66 stored as RRP 166p');
select is((select count(*)::int from app.products where sale_unit = 'weight'), 3, '3 products sold by weight');
select is((select string_agg(legacy_ref, ',' order by legacy_ref) from app.products where tax_category_code = 'standard'),
  'prod-20,prod-23,prod-beauty-1,prod-beauty-2,prod-kitchen-1,prod-kitchen-2,prod-pooja-1,prod-pooja-2,prod-sweets-1,prod-sweets-2', 'proposed standard-rated products');
select is((select count(*)::int from app.tax_rates where confirmed_by is not null), 0, 'tax rates are unconfirmed until the accountant signs off');

-- delivery
select is((select count(*)::int from app.slot_templates), 105, '5 zones × 7 days × 3 windows');
select is((select code from app.delivery_zones where id = app.zone_for_postcode('al10 9ab')), 'HATFIELD', 'AL10 → Hatfield');
select is((select code from app.delivery_zones where id = app.zone_for_postcode('AL1 3EG')), 'ST-ALBANS', 'AL1 → St Albans (not AL10)');
select is(app.zone_for_postcode('SG13 7AB'), null, 'SG13 is not served');

-- promotions
select is((select string_agg(code, ',' order by code) from app.coupons), 'FRESH20,HERTSFREE,VARAM10,VARAM20', 'coupon codes from the frontend');
select is((select count(*)::int from app.promotion_zones pz join app.promotions p on p.id = pz.promotion_id where p.name like 'HERTSFREE%'), 4, 'HERTSFREE limited to the 4 Hertfordshire zones');

-- sample data
select is((select count(*)::int from app.orders where is_sample), 6, '6 sample orders');
select is((select count(*)::int from app.orders where is_sample and est_total_minor <> est_items_minor - est_discount_minor + est_deposit_minor + delivery_fee_minor), 0, 'sample order totals are consistent');

-- Store Manager login works with permissions
select ok(exists (select 1 from app.staff s join auth.users u on u.id = s.user_id where s.email = 'test@gmail.com' and s.role_code = 'store_manager'), 'bootstrap Store Manager linked to an auth user');
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from app.staff where email = 'test@gmail.com'), 'role', 'authenticated')::text, true);
select ok(app.has_permission('financials') and app.has_permission('inventory_read'), 'Store Manager has every permission');

-- purge removes all sample rows and nothing live (rolled back with the test)
select app.purge_sample_data();
select is((select count(*)::int from app.orders) + (select count(*)::int from app.customers) + (select count(*)::int from app.reviews where is_sample)
        + (select count(*)::int from app.staff where is_sample), 0, 'purge removed sample orders, customers, reviews and staff');

select * from finish();
