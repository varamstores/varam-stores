-- 0033 Search & filters.
--   · api.admin_global_search: one search box for the whole store portal (orders, products, customers,
--     categories, brands, suppliers, offers, staff), only showing what the person's role may see.
--   · api.admin_list_products: + brand filter and sort order.
--   · api.list_products (shop page): + "in stock only" filter, in-stock and per-category counts.

-- ── admin product list: brand + sort ────────────────────────────────────────────────────────────
do $$
declare
  v_def  text := pg_get_functiondef('api.admin_list_products(text,text,text,text,integer,text)'::regprocedure);
  v_note text := obj_description('api.admin_list_products(text,text,text,text,integer,text)'::regprocedure, 'pg_proc');
  r      text[] := array[
    'p_cursor text DEFAULT NULL::text)', 'p_cursor text DEFAULT NULL::text, p_brand text DEFAULT NULL::text, p_sort text DEFAULT NULL::text)',
    E'       where (p_status is null or p.status = p_status)\n', E'       where (p_status is null or p.status = p_status)\n         and (p_brand is null or p.brand_id = (select b.id from app.brands b where b.slug = p_brand))\n',
    E'        ) order by x.name), ''[]''::jsonb)\n        from (select * from f order by f.name limit v_limit offset v_offset) x)));',
    E'        ) order by x.ord), ''[]''::jsonb)\n        from (select f.*, row_number() over (order by\n            case when p_sort = ''price-asc'' then f.price end asc nulls last,\n            case when p_sort = ''price-desc'' then f.price end desc nulls last,\n            case when p_sort = ''stock-asc'' then f.available end asc nulls last,\n            case when p_sort = ''newest'' then f.created_at end desc nulls last,\n            case when p_sort = ''updated'' then f.updated_at end desc nulls last,\n            f.name) as ord\n          from f order by ord limit v_limit offset v_offset) x)));'];
  i integer;
begin
  for i in 1 .. array_length(r, 1) by 2 loop
    if position(r[i] in v_def) = 0 then raise exception 'admin_list_products: % not found', left(r[i], 60); end if;
    v_def := replace(v_def, r[i], r[i + 1]);
  end loop;
  if v_def !~ 'order by ord limit v_limit' then raise exception 'admin_list_products: sort not applied'; end if;
  drop function api.admin_list_products(text, text, text, text, integer, text);
  execute v_def;
  execute format('comment on function api.admin_list_products(text,text,text,text,integer,text,text,text) is %L',
    v_note || ' Filter by brand (slug); sort: name (default), price-asc, price-desc, stock-asc, newest, updated.');
end;
$$;

-- ── shop page product list: in stock only + counts ──────────────────────────────────────────────
do $$
declare
  v_def  text := pg_get_functiondef('api.list_products(text,text[],text,boolean,boolean,integer,integer,numeric,text,text,integer,text,text)'::regprocedure);
  v_note text := obj_description('api.list_products(text,text[],text,boolean,boolean,integer,integer,numeric,text,text,integer,text,text)'::regprocedure, 'pg_proc');
  r      text[] := array[
    E'p_locale text DEFAULT NULL::text)\n RETURNS jsonb', E'p_locale text DEFAULT NULL::text, p_in_stock boolean DEFAULT NULL::boolean)\n RETURNS jsonb',
    E'p.brand_id, p.is_organic as organic\n  from app.products p', E'p.brand_id, p.is_organic as organic, app.product_availability(p.id, v_loc) <> ''out_of_stock'' as in_stock\n  from app.products p',
    'pl as (select * from base where p_on_sale is not true or on_sale)', 'pl as (select * from base where (p_on_sale is not true or on_sale) and (p_in_stock is not true or in_stock))',
    E'''onSaleCount'', (select count(*)::int from pl where pl.on_sale),',
    E'''onSaleCount'', (select count(*)::int from pl where pl.on_sale),\n      ''inStockCount'', (select count(*)::int from pl where pl.in_stock),\n      ''categories'', coalesce((select jsonb_agg(jsonb_build_object(''slug'', c.slug, ''name'', ct.name, ''count'', s.n) order by s.n desc, ct.name)\n                          from (select pc.category_id, count(distinct pl.product_id)::int n from pl join app.product_categories pc on pc.product_id = pl.product_id group by pc.category_id) s\n                          join app.categories c on c.id = s.category_id and c.is_active\n                          join app.category_translations ct on ct.category_id = c.id and ct.locale = app.resolve_locale(p_locale)), ''[]''::jsonb),'];
  i integer;
begin
  for i in 1 .. array_length(r, 1) by 2 loop
    if position(r[i] in v_def) = 0 then raise exception 'list_products: % not found', left(r[i], 60); end if;
    v_def := replace(v_def, r[i], r[i + 1]);
  end loop;
  drop function api.list_products(text, text[], text, boolean, boolean, integer, integer, numeric, text, text, integer, text, text);
  execute v_def;
  execute format('comment on function api.list_products(text,text[],text,boolean,boolean,integer,integer,numeric,text,text,integer,text,text,boolean) is %L',
    v_note || ' p_in_stock = only products that can be bought now.');
end;
$$;

-- ── one search box for the store portal ─────────────────────────────────────────────────────────
create or replace function api.admin_global_search(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v_pat text;
begin
  if app.current_staff_id() is null then perform app.require_permission('order_status'); end if;
  if v_q is null or length(v_q) < 2 then return '{}'::jsonb; end if;
  v_pat := '%' || replace(replace(v_q, '%', ''), '_', '') || '%';
  return jsonb_build_object(
    'orders', case when app.has_permission('order_status') then api.admin_list_orders(v_q, null, null, null, 5, null) -> 'items' else '[]'::jsonb end,
    'products', case when app.has_permission('inventory_read') or app.has_permission('pricing') then api.admin_list_products(v_q, null, null, null, 5, null) -> 'items' else '[]'::jsonb end,
    'customers', case when app.has_permission('customer_messaging') then api.admin_list_customers(v_q, null, 5, null) -> 'items' else '[]'::jsonb end,
    'categories', case when app.has_permission('inventory_read') then coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', c.id, 'name', ct.name, 'slug', c.slug, 'isActive', c.is_active) x
          from app.categories c join app.category_translations ct on ct.category_id = c.id and ct.locale = 'en-GB'
         where ct.name ilike v_pat or c.slug ilike v_pat order by ct.name limit 5) s), '[]'::jsonb) else '[]'::jsonb end,
    'brands', case when app.has_permission('inventory_read') then coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug) x from app.brands b where b.name ilike v_pat order by b.name limit 5) s), '[]'::jsonb) else '[]'::jsonb end,
    'suppliers', case when app.has_permission('inventory_read') then coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email) x from app.suppliers s
         where s.name ilike v_pat or s.email ilike v_pat or s.contact_person ilike v_pat order by s.name limit 5) q), '[]'::jsonb) else '[]'::jsonb end,
    'offers', case when app.has_permission('pricing') then coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', p.id, 'label', p.label, 'status', p.status) x from app.promotions p
         where p.label ilike v_pat or p.name ilike v_pat or exists (select 1 from app.coupons c where c.promotion_id = p.id and c.customer_id is null and c.code ilike v_pat)
         order by p.created_at desc limit 5) q), '[]'::jsonb) else '[]'::jsonb end,
    'staff', case when app.has_permission('user_management') then coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', s.id, 'name', s.full_name, 'email', s.email) x from app.staff s
         where s.full_name ilike v_pat or s.email ilike v_pat order by s.full_name limit 5) q), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;
comment on function api.admin_global_search(text) is '@access staff Search the whole store portal: orders, products, customers, categories, brands, suppliers, offers, staff — only what the role may see.';

select app.harden();
