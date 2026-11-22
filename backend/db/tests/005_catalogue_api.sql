-- Storefront catalogue functions, called exactly as the browser does (role anon).
select plan(30);
set local role anon;

-- config
select is(api.get_storefront_config() -> 'freeDeliveryThreshold' ->> 'amount', '5000', 'free delivery from £50 (from fee rules)');
select is(api.get_storefront_config() ->> 'currency', 'GBP', 'currency GBP');

-- categories
select is(jsonb_array_length(api.list_categories()), 15, '15 top-level categories');
select is((select count(*)::int from jsonb_array_elements(api.list_categories()) c where (c ->> 'showOnHomepage')::boolean), 12, '12 shown on the homepage');
select is((select (c ->> 'productCount')::int from jsonb_array_elements(api.list_categories()) c where c ->> 'slug' = 'rice-millets'), 2, 'Rice has 2 products');
select is(jsonb_array_length(api.get_category('rice-millets') -> 'children'), 6, 'Rice has 6 subcategories');
select ok((api.list_categories() -> 0 -> 'image' ->> 'url') like 'https://%/storefront/%', 'category images come from Supabase Storage');
select throws_ok($$ select api.get_category('nope') $$, 'PT404', 'NOT_FOUND', 'unknown category → 404');

-- brands
select is(jsonb_array_length(api.list_brands()), 94, '94 brands');
select is(jsonb_array_length(api.list_marquee_brands()), 22, '22 marquee brands');
select is((select b ->> 'group' from jsonb_array_elements(api.list_brands(p_q => 'aachi')) b), 'A-B', 'brand grouping A-B');

-- product detail
select is(api.get_product('prod-1') ->> 'name', 'Organic Red Tomatoes', 'legacy id prod-1 still resolves');
select is(api.get_product('organic-red-tomatoes') -> 'price' ->> 'amount', '133', 'price in pence');
select is(api.get_product('organic-red-tomatoes') -> 'rrp' ->> 'amount', '166', 'RRP from originalPrice');
select is(api.get_product('organic-red-tomatoes') ->> 'saleUnit', 'weight', 'tomatoes sold by weight');
select is(api.get_product('basmati-rice-aged') -> 'unitPrice' -> 'price' ->> 'amount', '140', '5 kg rice at £6.99 → £1.40/kg');
select is(api.get_product('basmati-rice-aged') -> 'unitPrice' ->> 'per', 'kg', 'unit price per kg');
select is(api.get_product('basmati-rice-aged') ->> 'availability', 'in_stock', 'availability from stock levels');
select is(api.get_product('organic-red-tomatoes') -> 'foodInfo' -> 'nutrition' ->> 'energyKcal', '18.0', 'structured nutrition parsed from mock');
select is(api.get_product('organic-red-tomatoes') -> 'foodInfo' ->> 'isComplete', 'false', 'food info flagged incomplete until filled in');
select throws_ok($$ select api.get_product('pure-desi-cow-ghee-500ml') $$, 'PT404', 'PRODUCT_NOT_FOUND', 'draft products are hidden');

-- listing, filters, sort, search
select is((api.list_products() ->> 'total')::int, 42, 'all 42 active products listed');
select is((api.list_products(p_category => 'rice-millets') ->> 'total')::int, 2, 'category filter');
select is((api.list_products(p_brands => array['india-gate']) ->> 'total')::int, 1, 'brand filter');
select is(api.list_products(p_sort => 'price-asc', p_limit => 1) -> 'items' -> 0 -> 'price' ->> 'amount',
          (select min((x -> 'price' ->> 'amount')::int)::text from jsonb_array_elements(api.list_products(p_limit => 100) -> 'items') x), 'price-asc puts the cheapest first');
select is(api.list_products(p_limit => 24) ->> 'nextCursor', '24', 'cursor pagination');
select ok((api.list_products(p_q => 'basmati') ->> 'total')::int >= 2, 'search finds basmati rice');
select ok((api.list_products(p_q => 'basmatti') ->> 'total')::int >= 1, 'typo-tolerant search');
select is(jsonb_array_length(api.get_collection('fresh-picks') -> 'products'), 5, 'fresh picks shelf has 5 products');
select is(jsonb_array_length(api.list_featured_reviews()), 4, 'testimonials visible outside production');

reset role;
select * from finish();
