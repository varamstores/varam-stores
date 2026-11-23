-- 0025 Admin: catalogue (Phase 8). Products (edit, price history, food information, images,
--      archive), categories, brands, homepage shelves (collections), lookups for dropdowns, and
--      product CSV export / import (all-or-nothing, with a dry run that lists every problem).
-- Permissions: inventory (catalogue), pricing (prices). Every change is written to the audit log.

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────────
-- Splits CSV text into rows of fields (RFC 4180: quotes, doubled quotes, CRLF/LF, commas in quotes).
create or replace function app.parse_csv(p_text text)
returns setof text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  c      text[] := string_to_array(coalesce(p_text, ''), null);
  n      integer := coalesce(array_length(string_to_array(coalesce(p_text, ''), null), 1), 0);
  i      integer := 1;
  ch     text;
  fld    text := '';
  r      text[] := '{}';
  in_q   boolean := false;
begin
  while i <= n loop
    ch := c[i];
    if in_q then
      if ch = '"' then
        if i < n and c[i + 1] = '"' then fld := fld || '"'; i := i + 1; else in_q := false; end if;
      else
        fld := fld || ch;
      end if;
    elsif ch = '"' then
      in_q := true;
    elsif ch = ',' then
      r := r || fld; fld := '';
    elsif ch = E'\n' or ch = E'\r' then
      if ch = E'\r' and i < n and c[i + 1] = E'\n' then i := i + 1; end if;
      r := r || fld; fld := '';
      if not (cardinality(r) = 1 and r[1] = '') then return next r; end if;
      r := '{}';
    else
      fld := fld || ch;
    end if;
    i := i + 1;
  end loop;
  if fld <> '' or cardinality(r) > 0 then
    r := r || fld;
    if not (cardinality(r) = 1 and r[1] = '') then return next r; end if;
  end if;
end;
$$;

create or replace function app.csv_field(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then ''
              when p ~ '[",\r\n]' or p <> trim(p) then '"' || replace(p, '"', '""') || '"'
              else p end
$$;

-- A slug not used by another row of the table (adds -2, -3 …).
create or replace function app.unique_product_slug(p_base text, p_except uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base text := coalesce(nullif(app.slugify(p_base), ''), 'product');
  v_try  text := v_base;
  k      integer := 1;
begin
  while exists (select 1 from app.products p where p.slug = v_try and p.id is distinct from p_except) loop
    k := k + 1;
    v_try := v_base || '-' || k;
  end loop;
  return v_try;
end;
$$;

create or replace function app.admin_product_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'sku', p.sku, 'legacyRef', p.legacy_ref, 'status', p.status, 'publishedAt', p.published_at,
    'name', t.name, 'description', t.description, 'origin', t.origin_text, 'storage', t.storage_text, 'sourcing', t.sourcing_text, 'ingredients', t.ingredients_text,
    'brandId', p.brand_id, 'primaryCategoryId', p.primary_category_id,
    'categoryIds', (select coalesce(jsonb_agg(pc.category_id), '[]'::jsonb) from app.product_categories pc where pc.product_id = p.id and pc.category_id <> p.primary_category_id),
    'taxCategoryCode', p.tax_category_code, 'taxCategoryReviewed', p.tax_category_reviewed_at is not null,
    'saleUnit', p.sale_unit, 'packSize', p.pack_size_label, 'netQuantity', p.net_quantity, 'netQuantityUnit', p.net_quantity_unit,
    'estimatedWeightGrams', p.estimated_weight_grams, 'minWeightGrams', p.min_weight_grams, 'weightStepGrams', p.weight_step_grams,
    'maxPerOrder', p.max_per_order, 'rrpMinor', p.rrp_minor, 'isOrganic', p.is_organic, 'isFood', p.is_food, 'isPerishable', p.is_perishable,
    'isReturnable', p.is_returnable, 'ageRestrictionCode', p.age_restriction_code, 'depositSchemeCode', p.deposit_scheme_code,
    'badge', p.badge, 'featuredRank', p.featured_rank, 'isSample', p.is_sample,
    'priceMinor', app.current_price_minor(p.id),
    'priceHistory', (select coalesce(jsonb_agg(jsonb_build_object('amountMinor', pp.amount_minor, 'from', pp.valid_from, 'to', pp.valid_to, 'reason', pp.reason,
                       'setBy', (select s.full_name from app.staff s where s.id = pp.set_by)) order by pp.valid_from desc), '[]'::jsonb)
                     from (select * from app.product_prices x where x.product_id = p.id and x.price_list = 'base' order by x.valid_from desc limit 20) pp),
    'images', (select coalesce(jsonb_agg(jsonb_build_object('path', pi.url, 'url', app.media_url(pi.url), 'alt', pi.alt, 'position', pi.position) order by pi.position), '[]'::jsonb)
                 from app.product_images pi where pi.product_id = p.id),
    'foodInfo', (select jsonb_build_object('basis', f.nutrition_basis, 'energyKj', f.energy_kj, 'energyKcal', f.energy_kcal, 'fat', f.fat_g, 'saturates', f.saturates_g,
                   'carbohydrate', f.carbohydrate_g, 'sugars', f.sugars_g, 'fibre', f.fibre_g, 'protein', f.protein_g, 'salt', f.salt_g,
                   'fboName', f.fbo_name, 'fboAddress', f.fbo_address, 'countryOfOrigin', f.country_of_origin,
                   'allergensReviewed', f.allergens_reviewed, 'reviewedBy', f.reviewed_by, 'reviewedAt', f.reviewed_at)
                 from app.product_food_info f where f.product_id = p.id),
    'contains', (select coalesce(jsonb_agg(a.allergen_code order by a.allergen_code), '[]'::jsonb) from app.product_allergens a where a.product_id = p.id and a.presence = 'contains'),
    'mayContain', (select coalesce(jsonb_agg(a.allergen_code order by a.allergen_code), '[]'::jsonb) from app.product_allergens a where a.product_id = p.id and a.presence = 'may_contain'),
    'foodInfoComplete', app.food_info_complete(p.id),
    'stock', (select coalesce(jsonb_agg(jsonb_build_object('locationId', fl.id, 'location', fl.name, 'onHand', sl.on_hand, 'reserved', sl.reserved,
                 'available', sl.on_hand - sl.reserved, 'reorderPoint', sl.reorder_point, 'optimalStock', sl.optimal_stock, 'unitCostMinor', sl.unit_cost_minor)), '[]'::jsonb)
               from app.stock_levels sl join app.fulfilment_locations fl on fl.id = sl.location_id where sl.product_id = p.id),
    'collections', (select coalesce(jsonb_agg(c.code), '[]'::jsonb) from app.collection_items ci join app.collections c on c.id = ci.collection_id where ci.product_id = p.id),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('supplierId', ps.supplier_id, 'name', s.name, 'supplierSku', ps.supplier_sku,
                    'unitCostMinor', ps.unit_cost_minor, 'isPrimary', ps.is_primary)), '[]'::jsonb)
                  from app.product_suppliers ps join app.suppliers s on s.id = ps.supplier_id where ps.product_id = p.id),
    'rating', jsonb_build_object('average', p.rating_avg, 'count', p.rating_count),
    'storefrontUrl', '/product/' || p.slug,
    'updatedAt', p.updated_at)
  from app.products p
  left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB'
  where p.id = p_id
$$;

-- ── lookups ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_catalogue_lookups()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read') or app.has_permission('pricing') or app.has_permission('content')) then
    perform app.require_permission('inventory_read');
  end if;
  return jsonb_build_object(
    'taxCategories', (select coalesce(jsonb_agg(jsonb_build_object('code', tc.code, 'name', tc.name, 'description', tc.description,
                        'rateBp', (select r.rate_bp from app.tax_rates r where r.tax_category_code = tc.code and r.country_code = 'GB' and tstzrange(r.valid_from, r.valid_to) @> now()))
                        order by tc.code), '[]'::jsonb) from app.tax_categories tc),
    'ageRestrictions', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name,
                          'minAge', (select r.min_age from app.age_restriction_rules r where r.restriction_code = a.code and r.country_code = 'GB'))), '[]'::jsonb) from app.age_restrictions a),
    'depositSchemes', (select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'amountMinor', d.amount_minor, 'isActive', d.is_active)), '[]'::jsonb) from app.deposit_schemes d),
    'allergens', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name) order by a.position), '[]'::jsonb) from app.allergens a),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', ct.name, 'parentId', c.parent_id, 'isActive', c.is_active,
                     'path', (select string_agg(pt.name, ' › ' order by d.depth desc) from (
                                 with recursive up(id, parent_id, depth) as (select c.id, c.parent_id, 0 union all
                                   select x.id, x.parent_id, up.depth + 1 from app.categories x join up on x.id = up.parent_id)
                                 select up.id, up.depth from up) d join app.category_translations pt on pt.category_id = d.id and pt.locale = 'en-GB'))
                     order by c.parent_id nulls first, c.position), '[]'::jsonb)
                   from app.categories c join app.category_translations ct on ct.category_id = c.id and ct.locale = 'en-GB'),
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'isActive', b.is_active) order by b.name), '[]'::jsonb) from app.brands b),
    'collections', (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'title', c.title) order by c.code), '[]'::jsonb) from app.collections c),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object('id', fl.id, 'code', fl.code, 'name', fl.name)), '[]'::jsonb) from app.fulfilment_locations fl where fl.is_active),
    'staticPages', (select coalesce(jsonb_agg(jsonb_build_object('key', pg.key, 'label', pg.label, 'route', pg.route, 'isPublished', pg.is_published) order by pg.position), '[]'::jsonb)
                      from app.cms_pages pg where pg.kind = 'static'));
end;
$$;
comment on function api.admin_catalogue_lookups() is '@access staff Everything the admin dropdowns need: tax categories, age limits, deposits, allergens, categories (with paths), brands, shelves, locations, content pages.';

-- ── products ────────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_list_products(p_q text default null, p_category text default null, p_status text default null,
                                                   p_issue text default null, p_limit integer default 50, p_cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := coalesce(nullif(p_cursor, '')::int, 0);
  v_q      text := nullif(trim(coalesce(p_q, '')), '');
  v_cat    uuid := (select c.id from app.categories c where c.slug = p_category);
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read') or app.has_permission('pricing')) then
    perform app.require_permission('inventory_read');
  end if;
  return (with base as (
      select p.*, t.name,
             app.current_price_minor(p.id) as price,
             (select coalesce(sum(sl.on_hand - sl.reserved), 0) from app.stock_levels sl where sl.product_id = p.id) as available,
             (select coalesce(max(sl.reorder_point), 0) from app.stock_levels sl where sl.product_id = p.id) as reorder_point,
             app.food_info_complete(p.id) as food_ok,
             exists (select 1 from app.product_images pi where pi.product_id = p.id) as has_image
        from app.products p left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB'
       where (p_status is null or p.status = p_status)
         and (v_cat is null or p.primary_category_id in (select app.category_subtree(v_cat))
              or exists (select 1 from app.product_categories pc where pc.product_id = p.id and pc.category_id in (select app.category_subtree(v_cat))))
         and (v_q is null or t.name ilike '%' || v_q || '%' or p.sku ilike '%' || v_q || '%' or p.slug ilike '%' || v_q || '%')
    ), f as (
      select b.* from base b
       where p_issue is null
          or (p_issue = 'food_info' and b.is_food and not b.food_ok)
          or (p_issue = 'no_price' and b.price is null)
          or (p_issue = 'no_image' and not b.has_image)
          or (p_issue = 'low_stock' and b.available <= greatest(b.reorder_point, 0))
          or (p_issue = 'out_of_stock' and b.available <= 0)
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'nextCursor', case when v_offset + v_limit < (select count(*) from f) then (v_offset + v_limit)::text end,
      'counts', jsonb_build_object(
         'active', (select count(*) from app.products where status = 'active'),
         'draft', (select count(*) from app.products where status = 'draft'),
         'archived', (select count(*) from app.products where status = 'archived'),
         'foodInfoMissing', (select count(*) from base where is_food and not food_ok and status = 'active'),
         'noPrice', (select count(*) from base where price is null and status <> 'archived'),
         'lowStock', (select count(*) from base where available <= greatest(reorder_point, 0) and status = 'active')),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'slug', x.slug, 'sku', x.sku, 'name', x.name, 'status', x.status, 'isSample', x.is_sample,
          'category', (select ct.name from app.category_translations ct where ct.category_id = x.primary_category_id and ct.locale = 'en-GB'),
          'brand', (select b.name from app.brands b where b.id = x.brand_id),
          'price', case when x.price is not null then app.money(x.price, x.currency) end,
          'image', (select app.image_json(pi.url, pi.alt) from app.product_images pi where pi.product_id = x.id order by pi.position limit 1),
          'available', x.available, 'saleUnit', x.sale_unit, 'packSize', x.pack_size_label,
          'issues', to_jsonb(array_remove(array[
             case when x.is_food and not x.food_ok then 'food_info' end,
             case when x.price is null then 'no_price' end,
             case when not x.has_image then 'no_image' end,
             case when x.available <= 0 then 'out_of_stock' when x.available <= x.reorder_point then 'low_stock' end], null))
        ) order by x.name), '[]'::jsonb)
        from (select * from f order by f.name limit v_limit offset v_offset) x)));
end;
$$;
comment on function api.admin_list_products(text, text, text, text, integer, text) is '@access staff Products with search and filters, including "needs attention" filters: food_info, no_price, no_image, low_stock, out_of_stock. Permission: inventory_read.';

create or replace function api.admin_get_product(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read') or app.has_permission('pricing')) then
    perform app.require_permission('inventory_read');
  end if;
  if not exists (select 1 from app.products p where p.id = p_id) then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.'); end if;
  return app.admin_product_json(p_id);
end;
$$;
comment on function api.admin_get_product(uuid) is '@access staff Everything about one product for the editor. Permission: inventory_read.';

-- Inserts or updates a product (only the fields present in p are changed).
create or replace function api.admin_save_product(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff   uuid := app.require_permission('inventory');
  v_id      uuid := nullif(p ->> 'id', '')::uuid;
  v_old     app.products;
  v_new     app.products;
  v_name    text := nullif(trim(p ->> 'name'), '');
  v_unit    text;
  v_status  text;
  v_cat     uuid;
  v_missing jsonb := '[]'::jsonb;
  v_staffname text := (select s.full_name from app.staff s where s.id = v_staff);
  v_is_new  boolean := nullif(p ->> 'id', '') is null;
begin
  if v_id is not null then
    select * into v_old from app.products where id = v_id for update;
    if v_old.id is null then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.'); end if;
  else
    if v_name is null then v_missing := v_missing || '"name"'; end if;
    if coalesce(p ->> 'sku', '') = '' then v_missing := v_missing || '"sku"'; end if;
    if coalesce(p ->> 'primaryCategoryId', '') = '' then v_missing := v_missing || '"primaryCategoryId"'; end if;
    if coalesce(p ->> 'taxCategoryCode', '') = '' then v_missing := v_missing || '"taxCategoryCode"'; end if;
    if coalesce(p ->> 'packSize', '') = '' then v_missing := v_missing || '"packSize"'; end if;
    if jsonb_array_length(v_missing) > 0 then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', v_missing), 'Please fill in the required fields.');
    end if;
  end if;
  v_unit := coalesce(p ->> 'saleUnit', v_old.sale_unit, 'each');
  v_status := coalesce(p ->> 'status', v_old.status, 'draft');
  v_cat := coalesce(nullif(p ->> 'primaryCategoryId', '')::uuid, v_old.primary_category_id);

  if v_id is null then
    insert into app.products (slug, sku, brand_id, primary_category_id, status, tax_category_code, sale_unit, pack_size_label, is_food, is_perishable, is_returnable)
    values (app.unique_product_slug(coalesce(nullif(p ->> 'slug', ''), v_name), null), upper(trim(p ->> 'sku')),
            nullif(p ->> 'brandId', '')::uuid, v_cat, 'draft', p ->> 'taxCategoryCode', v_unit, trim(p ->> 'packSize'),
            coalesce((p ->> 'isFood')::boolean, true), coalesce((p ->> 'isPerishable')::boolean, false), coalesce((p ->> 'isReturnable')::boolean, true))
    returning id into v_id;
    select * into v_old from app.products where id = v_id;
    insert into app.product_translations (product_id, locale, name) values (v_id, 'en-GB', v_name);
  end if;

  update app.products set
    slug = case when p ? 'slug' and nullif(p ->> 'slug', '') is not null then app.unique_product_slug(p ->> 'slug', v_id) else slug end,
    sku = coalesce(upper(nullif(trim(p ->> 'sku'), '')), sku),
    brand_id = case when p ? 'brandId' then nullif(p ->> 'brandId', '')::uuid else brand_id end,
    primary_category_id = v_cat,
    tax_category_code = coalesce(nullif(p ->> 'taxCategoryCode', ''), tax_category_code),
    tax_category_reviewed_by = case when (p ->> 'taxCategoryReviewed')::boolean then v_staffname when p ? 'taxCategoryReviewed' then null else tax_category_reviewed_by end,
    tax_category_reviewed_at = case when (p ->> 'taxCategoryReviewed')::boolean then coalesce(tax_category_reviewed_at, now()) when p ? 'taxCategoryReviewed' then null else tax_category_reviewed_at end,
    sale_unit = v_unit,
    pack_size_label = coalesce(nullif(trim(p ->> 'packSize'), ''), pack_size_label),
    net_quantity = case when p ? 'netQuantity' then (p ->> 'netQuantity')::numeric else net_quantity end,
    net_quantity_unit = case when p ? 'netQuantityUnit' then nullif(p ->> 'netQuantityUnit', '') else net_quantity_unit end,
    estimated_weight_grams = case when v_unit = 'each' then null when p ? 'estimatedWeightGrams' then (p ->> 'estimatedWeightGrams')::int else estimated_weight_grams end,
    min_weight_grams = case when v_unit = 'each' then null when p ? 'minWeightGrams' then (p ->> 'minWeightGrams')::int else min_weight_grams end,
    weight_step_grams = case when v_unit = 'each' then null when p ? 'weightStepGrams' then (p ->> 'weightStepGrams')::int else weight_step_grams end,
    max_per_order = case when p ? 'maxPerOrder' then nullif(p ->> 'maxPerOrder', '')::int else max_per_order end,
    rrp_minor = case when p ? 'rrpMinor' then nullif(p ->> 'rrpMinor', '')::int else rrp_minor end,
    is_organic = coalesce((p ->> 'isOrganic')::boolean, is_organic),
    is_food = coalesce((p ->> 'isFood')::boolean, is_food),
    is_perishable = coalesce((p ->> 'isPerishable')::boolean, is_perishable),
    is_returnable = case when coalesce((p ->> 'isPerishable')::boolean, is_perishable) then false else coalesce((p ->> 'isReturnable')::boolean, is_returnable) end,
    age_restriction_code = case when p ? 'ageRestrictionCode' then nullif(p ->> 'ageRestrictionCode', '') else age_restriction_code end,
    deposit_scheme_code = case when p ? 'depositSchemeCode' then nullif(p ->> 'depositSchemeCode', '') else deposit_scheme_code end,
    badge = case when p ? 'badge' then nullif(trim(p ->> 'badge'), '') else badge end,
    featured_rank = case when p ? 'featuredRank' then nullif(p ->> 'featuredRank', '')::int else featured_rank end
  where id = v_id;

  update app.product_translations set
    name = coalesce(v_name, name),
    description = case when p ? 'description' then coalesce(p ->> 'description', '') else description end,
    origin_text = case when p ? 'origin' then nullif(trim(p ->> 'origin'), '') else origin_text end,
    storage_text = case when p ? 'storage' then nullif(trim(p ->> 'storage'), '') else storage_text end,
    sourcing_text = case when p ? 'sourcing' then nullif(trim(p ->> 'sourcing'), '') else sourcing_text end,
    ingredients_text = case when p ? 'ingredients' then nullif(trim(p ->> 'ingredients'), '') else ingredients_text end
  where product_id = v_id and locale = 'en-GB';

  insert into app.product_categories (product_id, category_id) values (v_id, v_cat) on conflict do nothing;
  if p ? 'categoryIds' then
    delete from app.product_categories where product_id = v_id and category_id <> v_cat;
    insert into app.product_categories (product_id, category_id)
    select v_id, x::uuid from jsonb_array_elements_text(p -> 'categoryIds') x where x::uuid <> v_cat on conflict do nothing;
  end if;

  -- an initial price can be given with the product
  if nullif(p ->> 'priceMinor', '') is not null and app.current_price_minor(v_id) is distinct from (p ->> 'priceMinor')::int then
    perform api.admin_set_price(v_id, (p ->> 'priceMinor')::int, null, coalesce(p ->> 'priceReason', 'Set in product editor'));
  end if;

  -- going live needs a price; published_at is stamped once
  if v_status = 'active' and app.current_price_minor(v_id) is null then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('priceMinor'), 'reason', 'PRICE_REQUIRED'), 'Set a price before making the product live.');
  end if;
  update app.products set status = v_status,
    published_at = case when v_status = 'active' then coalesce(published_at, now()) else published_at end
  where id = v_id
  returning * into v_new;

  perform app.audit(case when v_is_new then 'product.created' else 'product.updated' end,
                    'product', v_id::text, jsonb_build_object('changes', p - 'description' - 'ingredients'));
  return app.admin_product_json(v_id);
exception
  when unique_violation then
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('fields', jsonb_build_array('sku')), 'Another product already uses that SKU.');
    return null;
  when check_violation or invalid_text_representation or foreign_key_violation or numeric_value_out_of_range then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', sqlerrm), 'Some product details are not valid. Check weights for items sold by weight, and that perishable items are not returnable.');
    return null;
end;
$$;
comment on function api.admin_save_product(jsonb) is '@access staff Create (no id) or update a product. Only fields sent are changed. A product needs a price before it can go live. Permission: inventory.';

create or replace function api.admin_set_price(p_product_id uuid, p_price_minor integer, p_effective_from timestamptz default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('pricing');
  v_from  timestamptz := greatest(coalesce(p_effective_from, now()), now());
  v_old   integer := app.current_price_minor(p_product_id);
begin
  if not exists (select 1 from app.products p where p.id = p_product_id) then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.'); end if;
  if p_price_minor is null or p_price_minor <= 0 or p_price_minor > 10000000 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('priceMinor')), 'Enter a price above zero.');
  end if;
  -- end whatever price is in force at v_from, drop any later scheduled ones, then add the new one
  delete from app.product_prices where product_id = p_product_id and price_list = 'base' and valid_from >= v_from;
  update app.product_prices set valid_to = v_from
   where product_id = p_product_id and price_list = 'base' and tstzrange(valid_from, valid_to) @> v_from;
  insert into app.product_prices (product_id, price_list, amount_minor, valid_from, set_by, reason)
  values (p_product_id, 'base', p_price_minor, v_from, v_staff, nullif(trim(coalesce(p_reason, '')), ''));
  perform app.audit('product.price_set', 'product', p_product_id::text, jsonb_build_object('from', v_old, 'to', p_price_minor, 'effectiveFrom', v_from, 'reason', p_reason));
  return app.admin_product_json(p_product_id);
end;
$$;
comment on function api.admin_set_price(uuid, integer, timestamptz, text) is '@access staff Change a product''s price now or from a future date. Old prices are kept (needed for "was" prices and the 30-day lowest price). Permission: pricing.';

create or replace function api.admin_save_food_info(p_product_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('inventory');
  v_name  text := (select s.full_name from app.staff s where s.id = v_staff);
begin
  if not exists (select 1 from app.products x where x.id = p_product_id) then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.'); end if;
  insert into app.product_food_info (product_id) values (p_product_id) on conflict do nothing;
  update app.product_food_info set
    nutrition_basis = case when p ? 'basis' then nullif(p ->> 'basis', '') else nutrition_basis end,
    energy_kj = case when p ? 'energyKj' then (p ->> 'energyKj')::numeric else energy_kj end,
    energy_kcal = case when p ? 'energyKcal' then (p ->> 'energyKcal')::numeric else energy_kcal end,
    fat_g = case when p ? 'fat' then (p ->> 'fat')::numeric else fat_g end,
    saturates_g = case when p ? 'saturates' then (p ->> 'saturates')::numeric else saturates_g end,
    carbohydrate_g = case when p ? 'carbohydrate' then (p ->> 'carbohydrate')::numeric else carbohydrate_g end,
    sugars_g = case when p ? 'sugars' then (p ->> 'sugars')::numeric else sugars_g end,
    fibre_g = case when p ? 'fibre' then (p ->> 'fibre')::numeric else fibre_g end,
    protein_g = case when p ? 'protein' then (p ->> 'protein')::numeric else protein_g end,
    salt_g = case when p ? 'salt' then (p ->> 'salt')::numeric else salt_g end,
    fbo_name = case when p ? 'fboName' then nullif(trim(p ->> 'fboName'), '') else fbo_name end,
    fbo_address = case when p ? 'fboAddress' then nullif(trim(p ->> 'fboAddress'), '') else fbo_address end,
    country_of_origin = case when p ? 'countryOfOrigin' then nullif(trim(p ->> 'countryOfOrigin'), '') else country_of_origin end,
    allergens_reviewed = coalesce((p ->> 'allergensReviewed')::boolean, allergens_reviewed),
    reviewed_by = case when (p ->> 'allergensReviewed')::boolean then v_name when p ? 'allergensReviewed' then null else reviewed_by end,
    reviewed_at = case when (p ->> 'allergensReviewed')::boolean then now() when p ? 'allergensReviewed' then null else reviewed_at end,
    updated_at = now()
  where product_id = p_product_id;
  if p ? 'ingredients' then
    update app.product_translations set ingredients_text = nullif(trim(p ->> 'ingredients'), '') where product_id = p_product_id and locale = 'en-GB';
  end if;
  if p ? 'contains' or p ? 'mayContain' then
    delete from app.product_allergens where product_id = p_product_id;
    insert into app.product_allergens (product_id, allergen_code, presence)
    select p_product_id, x, 'contains' from jsonb_array_elements_text(coalesce(p -> 'contains', '[]'::jsonb)) x
    union
    select p_product_id, x, 'may_contain' from jsonb_array_elements_text(coalesce(p -> 'mayContain', '[]'::jsonb)) x
     where x not in (select jsonb_array_elements_text(coalesce(p -> 'contains', '[]'::jsonb)));
  end if;
  perform app.audit('product.food_info_saved', 'product', p_product_id::text, jsonb_build_object('allergensReviewed', p -> 'allergensReviewed'));
  return app.admin_product_json(p_product_id);
exception when check_violation or invalid_text_representation or foreign_key_violation or numeric_value_out_of_range then
  perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', sqlerrm), 'Check the nutrition numbers (choose per 100 g or per 100 ml first) and the allergen list.');
  return null;
end;
$$;
comment on function api.admin_save_food_info(uuid, jsonb) is '@access staff Ingredients, allergens (contains / may contain), nutrition per 100 g/ml, food business operator, country of origin. Ticking "allergens reviewed" records who checked. Permission: inventory.';

create or replace function api.admin_set_product_images(p_product_id uuid, p_images jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('inventory');
  if not exists (select 1 from app.products x where x.id = p_product_id) then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.'); end if;
  if jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) > 12 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('max', 12), 'Up to 12 photos.');
  end if;
  delete from app.product_images where product_id = p_product_id;
  insert into app.product_images (product_id, url, alt, position)
  select p_product_id, ltrim(x ->> 'path', '/'), coalesce(x ->> 'alt', ''), (i - 1)::smallint
    from jsonb_array_elements(p_images) with ordinality e(x, i) where coalesce(x ->> 'path', '') <> '';
  perform app.audit('product.images_set', 'product', p_product_id::text, jsonb_build_object('count', jsonb_array_length(p_images)));
  return app.admin_product_json(p_product_id);
end;
$$;
comment on function api.admin_set_product_images(uuid, jsonb) is '@access staff Replace a product''s photos (first one is the main photo): [{ path, alt }]. Upload files to Storage first. Permission: inventory.';

create or replace function api.admin_archive_product(p_id uuid, p_archive boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('inventory');
  update app.products set status = case when p_archive then 'archived' else 'draft' end where id = p_id;
  if not found then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.'); end if;
  perform app.audit(case when p_archive then 'product.archived' else 'product.restored' end, 'product', p_id::text, '{}'::jsonb);
  return app.admin_product_json(p_id);
end;
$$;
comment on function api.admin_archive_product(uuid, boolean) is '@access staff Hide a product from the shop for good (archive), or bring it back as a draft. Permission: inventory.';

-- ── categories ──────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_list_categories()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read') or app.has_permission('content')) then perform app.require_permission('inventory_read'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name', t.name, 'tagline', t.tagline, 'parentId', c.parent_id, 'position', c.position,
      'image', app.image_json(c.image_url, t.name, c.image_mobile_url), 'imagePath', c.image_url, 'mobileImagePath', c.image_mobile_url,
      'accentBg', c.accent_bg, 'accentColor', c.accent_color, 'cardBg', c.card_bg, 'badge', c.badge,
      'showOnHomepage', c.show_on_homepage, 'isActive', c.is_active,
      'productCount', (select count(*)::int from app.products p where p.primary_category_id = c.id and p.status = 'active'),
      'childCount', (select count(*)::int from app.categories x where x.parent_id = c.id)) order by c.parent_id nulls first, c.position), '[]'::jsonb)
    from app.categories c join app.category_translations t on t.category_id = c.id and t.locale = 'en-GB');
end;
$$;
comment on function api.admin_list_categories() is '@access staff Every category (incl. hidden ones) with product counts. Permission: inventory_read.';

create or replace function api.admin_save_category(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_name   text := nullif(trim(p ->> 'name'), '');
  v_parent uuid;
begin
  perform app.require_permission('inventory');
  if v_id is null and v_name is null then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('name')), 'Give the category a name.'); end if;
  v_parent := case when p ? 'parentId' then nullif(p ->> 'parentId', '')::uuid end;
  if v_id is not null and v_parent is not null and v_parent in (select app.category_subtree(v_id)) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('parentId')), 'A category cannot sit inside itself.');
  end if;
  if v_id is null then
    insert into app.categories (slug, parent_id, position, is_active, show_on_homepage)
    values (app.slugify(coalesce(nullif(p ->> 'slug', ''), v_name)), v_parent,
            coalesce((p ->> 'position')::int, (select coalesce(max(x.position), 0) + 1 from app.categories x where x.parent_id is not distinct from v_parent)),
            coalesce((p ->> 'isActive')::boolean, true), coalesce((p ->> 'showOnHomepage')::boolean, false))
    returning id into v_id;
    insert into app.category_translations (category_id, locale, name, tagline) values (v_id, 'en-GB', v_name, nullif(trim(p ->> 'tagline'), ''));
  else
    update app.categories set
      slug = coalesce(app.slugify(nullif(p ->> 'slug', '')), slug),
      parent_id = case when p ? 'parentId' then v_parent else parent_id end,
      position = coalesce((p ->> 'position')::int, position),
      is_active = coalesce((p ->> 'isActive')::boolean, is_active),
      show_on_homepage = coalesce((p ->> 'showOnHomepage')::boolean, show_on_homepage)
    where id = v_id;
    if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Category not found.'); end if;
    update app.category_translations set name = coalesce(v_name, name),
      tagline = case when p ? 'tagline' then nullif(trim(p ->> 'tagline'), '') else tagline end
    where category_id = v_id and locale = 'en-GB';
  end if;
  update app.categories set
    image_url = case when p ? 'imagePath' then nullif(ltrim(p ->> 'imagePath', '/'), '') else image_url end,
    image_mobile_url = case when p ? 'mobileImagePath' then nullif(ltrim(p ->> 'mobileImagePath', '/'), '') else image_mobile_url end,
    accent_bg = case when p ? 'accentBg' then nullif(p ->> 'accentBg', '') else accent_bg end,
    accent_color = case when p ? 'accentColor' then nullif(p ->> 'accentColor', '') else accent_color end,
    card_bg = case when p ? 'cardBg' then nullif(p ->> 'cardBg', '') else card_bg end,
    badge = case when p ? 'badge' then nullif(trim(p ->> 'badge'), '') else badge end
  where id = v_id;
  perform app.audit('category.saved', 'category', v_id::text, p);
  return (select x from jsonb_array_elements(api.admin_list_categories()) x where x ->> 'id' = v_id::text);
exception when unique_violation then
  perform app.raise_error('CONFLICT', 409, jsonb_build_object('fields', jsonb_build_array('slug')), 'Another category already uses that web address.');
  return null;
end;
$$;
comment on function api.admin_save_category(jsonb) is '@access staff Add or change a category: name, tagline, parent, picture (desktop/mobile), colours, badge, show on homepage, visible. Permission: inventory.';

create or replace function api.admin_reorder_categories(p_parent_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('inventory');
  update app.categories c set position = x.i from unnest(p_ids) with ordinality x(id, i)
   where c.id = x.id and c.parent_id is not distinct from p_parent_id;
  perform app.audit('category.reordered', 'category', coalesce(p_parent_id::text, 'top'), jsonb_build_object('order', p_ids));
  return api.admin_list_categories();
end;
$$;
comment on function api.admin_reorder_categories(uuid, uuid[]) is '@access staff Set the order of categories under one parent (null = top level). Permission: inventory.';

create or replace function api.admin_delete_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('inventory');
  if exists (select 1 from app.categories c where c.parent_id = p_id)
     or exists (select 1 from app.products p where p.primary_category_id = p_id)
     or exists (select 1 from app.product_categories pc where pc.category_id = p_id) then
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'IN_USE'), 'Move its products and sub-categories first, or just hide it.');
  end if;
  delete from app.categories where id = p_id;
  if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Category not found.'); end if;
  perform app.audit('category.deleted', 'category', p_id::text, '{}'::jsonb);
  return api.admin_list_categories();
end;
$$;
comment on function api.admin_delete_category(uuid) is '@access staff Delete an empty category (otherwise hide it). Permission: inventory.';

-- ── brands ──────────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_list_brands(p_q text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read') or app.has_permission('content')) then perform app.require_permission('inventory_read'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'tagline', b.tagline,
            'logo', app.image_json(b.logo_url, b.name), 'logoPath', b.logo_url, 'isPopular', b.is_popular, 'marqueePosition', b.marquee_position,
            'isActive', b.is_active, 'productCount', (select count(*)::int from app.products p where p.brand_id = b.id and p.status = 'active')) order by b.name), '[]'::jsonb)
    from app.brands b where p_q is null or b.name ilike '%' || p_q || '%');
end;
$$;
comment on function api.admin_list_brands(text) is '@access staff Every brand with product counts. Permission: inventory_read.';

create or replace function api.admin_save_brand(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := nullif(trim(p ->> 'name'), '');
begin
  perform app.require_permission('inventory');
  if v_id is null then
    if v_name is null then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('name')), 'Give the brand a name.'); end if;
    insert into app.brands (slug, name) values (app.slugify(coalesce(nullif(p ->> 'slug', ''), v_name)), v_name) returning id into v_id;
  end if;
  update app.brands set
    name = coalesce(v_name, name),
    slug = coalesce(app.slugify(nullif(p ->> 'slug', '')), slug),
    tagline = case when p ? 'tagline' then nullif(trim(p ->> 'tagline'), '') else tagline end,
    logo_url = case when p ? 'logoPath' then nullif(ltrim(p ->> 'logoPath', '/'), '') else logo_url end,
    is_popular = coalesce((p ->> 'isPopular')::boolean, is_popular),
    is_active = coalesce((p ->> 'isActive')::boolean, is_active)
  where id = v_id;
  if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Brand not found.'); end if;
  perform app.audit('brand.saved', 'brand', v_id::text, p);
  return (select x from jsonb_array_elements(api.admin_list_brands(null)) x where x ->> 'id' = v_id::text);
exception when unique_violation then
  perform app.raise_error('CONFLICT', 409, jsonb_build_object('fields', jsonb_build_array('slug')), 'Another brand already uses that web address.');
  return null;
end;
$$;
comment on function api.admin_save_brand(jsonb) is '@access staff Add or change a brand: name, logo, tagline, popular (shown in filters), visible. Permission: inventory.';

create or replace function api.admin_set_marquee(p_brand_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('content');
  update app.brands set marquee_position = null where marquee_position is not null;
  update app.brands b set marquee_position = x.i from unnest(p_brand_ids) with ordinality x(id, i) where b.id = x.id;
  perform app.audit('brand.marquee_set', 'brand', 'marquee', jsonb_build_object('order', p_brand_ids));
  return api.admin_list_brands(null);
end;
$$;
comment on function api.admin_set_marquee(uuid[]) is '@access staff Choose and order the brands in the homepage logo strip. Permission: content.';

-- ── homepage shelves (collections) ──────────────────────────────────────────────────────────────
create or replace function api.admin_list_collections()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('content') or app.has_permission('inventory')) then perform app.require_permission('content'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'title', c.title, 'isActive', c.is_active,
            'products', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', t.name, 'status', p.status,
                            'image', (select app.image_json(pi.url, pi.alt) from app.product_images pi where pi.product_id = p.id order by pi.position limit 1)) order by ci.position), '[]'::jsonb)
                         from app.collection_items ci join app.products p on p.id = ci.product_id
                         left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB' where ci.collection_id = c.id)) order by c.code), '[]'::jsonb)
    from app.collections c);
end;
$$;
comment on function api.admin_list_collections() is '@access staff Product shelves used on the homepage, with their products in order. Permission: content.';

create or replace function api.admin_save_collection(p_code text, p_title text, p_product_ids uuid[], p_is_active boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_permission('content');
  if coalesce(trim(p_title), '') = '' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('title')), 'Give the shelf a name.'); end if;
  insert into app.collections (code, title, is_active) values (app.slugify(coalesce(nullif(p_code, ''), p_title)), trim(p_title), coalesce(p_is_active, true))
  on conflict (code) do update set title = excluded.title, is_active = excluded.is_active
  returning id into v_id;
  delete from app.collection_items where collection_id = v_id;
  insert into app.collection_items (collection_id, product_id, position)
  select v_id, x.id, (x.i - 1)::int from unnest(p_product_ids) with ordinality x(id, i) on conflict do nothing;
  perform app.audit('collection.saved', 'collection', v_id::text, jsonb_build_object('code', p_code, 'products', p_product_ids));
  return api.admin_list_collections();
end;
$$;
comment on function api.admin_save_collection(text, text, uuid[], boolean) is '@access staff Create or change a product shelf and its products (in order). Permission: content.';

-- ── CSV export / import ─────────────────────────────────────────────────────────────────────────
create or replace function api.admin_export_products_csv()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read')) then perform app.require_permission('inventory_read'); end if;
  return 'sku,name,status,price,rrp,category,brand,pack_size,sale_unit,tax_category,is_organic,is_food,is_perishable,max_per_order,badge,description' || E'\n' ||
    coalesce((select string_agg(concat_ws(',',
        app.csv_field(p.sku), app.csv_field(t.name), p.status,
        coalesce(to_char(app.current_price_minor(p.id) / 100.0, 'FM999990.00'), ''),
        coalesce(to_char(p.rrp_minor / 100.0, 'FM999990.00'), ''),
        app.csv_field((select c.slug from app.categories c where c.id = p.primary_category_id)),
        app.csv_field((select b.slug from app.brands b where b.id = p.brand_id)),
        app.csv_field(p.pack_size_label), p.sale_unit, p.tax_category_code,
        p.is_organic::text, p.is_food::text, p.is_perishable::text, coalesce(p.max_per_order::text, ''),
        app.csv_field(p.badge), app.csv_field(t.description)), E'\n' order by p.sku)
      from app.products p left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB'), '');
end;
$$;
comment on function api.admin_export_products_csv() is '@access staff Download every product as a spreadsheet (CSV). Edit it and upload it back with the import. Permission: inventory_read.';

-- Columns recognised (header row, any order, unknown columns rejected): sku (required), name, status,
-- price, rrp, category, brand, pack_size, sale_unit, tax_category, is_organic, is_food, is_perishable,
-- max_per_order, badge, description. Prices in pounds (6.99). Blank cells leave values unchanged.
create or replace function api.admin_import_products_csv(p_csv text, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff   uuid := app.require_permission('inventory');
  v_rows    jsonb;
  v_msg     text;
  v_header  text[];
  v_allowed text[] := array['sku','name','status','price','rrp','category','brand','pack_size','sale_unit','tax_category','is_organic','is_food','is_perishable','max_per_order','badge','description'];
  r         text[];
  v_errors  jsonb := '[]'::jsonb;
  v_plan    jsonb := '[]'::jsonb;
  v_row     jsonb;
  v_n       integer := 0;
  v_rowno   integer := 1;
  v_sku     text;
  v_prod    uuid;
  v_cat     uuid;
  v_brand   uuid;
  k         integer;
  v_val     text;
  v_created integer := 0;
  v_updated integer := 0;
  v_prices  integer := 0;
  v_item    jsonb;
  v_p       jsonb;
  v_price   integer;
  v_has_price boolean;
begin
  if p_csv is null or length(p_csv) > 2000000 then
    perform app.raise_error('CSV_INVALID', 400, jsonb_build_object('maxBytes', 2000000), 'The file is empty or too large (2 MB max).');
  end if;
  select jsonb_agg(to_jsonb(x)) into v_rows from app.parse_csv(p_csv) x;
  if coalesce(jsonb_array_length(v_rows), 0) < 2 then
    perform app.raise_error('CSV_INVALID', 400, jsonb_build_object('reason', 'NO_ROWS'), 'The file needs a header row and at least one product.');
  end if;
  select array_agg(lower(trim(h)) order by i) into v_header from jsonb_array_elements_text(v_rows -> 0) with ordinality e(h, i);
  if not 'sku' = any (v_header) then
    perform app.raise_error('CSV_INVALID', 400, jsonb_build_object('reason', 'SKU_COLUMN_MISSING'), 'The first row must contain a "sku" column.');
  end if;
  for k in 1..array_length(v_header, 1) loop
    if not v_header[k] = any (v_allowed) then
      v_errors := v_errors || jsonb_build_object('row', 1, 'field', v_header[k], 'message', 'Unknown column');
    end if;
  end loop;

  for i in 1..jsonb_array_length(v_rows) - 1 loop
    v_rowno := i + 1;
    v_row := '{}'::jsonb;
    for k in 1..array_length(v_header, 1) loop
      v_val := trim(coalesce(v_rows -> i ->> (k - 1), ''));
      if v_val <> '' then v_row := v_row || jsonb_build_object(v_header[k], v_val); end if;
    end loop;
    if v_row = '{}'::jsonb then continue; end if;
    v_n := v_n + 1;
    v_sku := upper(v_row ->> 'sku');
    if v_sku is null or v_sku !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' then
      v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'sku', 'message', 'SKU missing or invalid (letters, numbers, dashes; 3–32)');
      continue;
    end if;
    select p.id into v_prod from app.products p where p.sku = v_sku;
    v_cat := null; v_brand := null;
    if v_row ? 'category' then
      select c.id into v_cat from app.categories c where c.slug = v_row ->> 'category';
      if v_cat is null then v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'category', 'message', 'Unknown category "' || (v_row ->> 'category') || '"'); end if;
    end if;
    if v_row ? 'brand' then
      select b.id into v_brand from app.brands b where b.slug = v_row ->> 'brand';
      if v_brand is null then v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'brand', 'message', 'Unknown brand "' || (v_row ->> 'brand') || '"'); end if;
    end if;
    if v_row ? 'status' and v_row ->> 'status' not in ('draft', 'active', 'archived') then
      v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'status', 'message', 'Status must be draft, active or archived');
    end if;
    if v_row ? 'sale_unit' and v_row ->> 'sale_unit' not in ('each', 'weight') then
      v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'sale_unit', 'message', 'Sale unit must be each or weight');
    end if;
    if v_row ? 'tax_category' and not exists (select 1 from app.tax_categories tc where tc.code = v_row ->> 'tax_category') then
      v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'tax_category', 'message', 'Unknown tax category');
    end if;
    foreach v_val in array array['price', 'rrp'] loop
      if v_row ? v_val and (v_row ->> v_val) !~ '^[0-9]+(\.[0-9]{1,2})?$' then
        v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', v_val, 'message', 'Use a price like 6.99');
      end if;
    end loop;
    foreach v_val in array array['is_organic', 'is_food', 'is_perishable'] loop
      if v_row ? v_val and lower(v_row ->> v_val) not in ('true', 'false', 'yes', 'no', '1', '0') then
        v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', v_val, 'message', 'Use true or false');
      end if;
    end loop;
    if v_row ? 'max_per_order' and (v_row ->> 'max_per_order') !~ '^[1-9][0-9]{0,3}$' then
      v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'max_per_order', 'message', 'Use a whole number');
    end if;
    if v_prod is null then
      if not (v_row ? 'name' and v_row ? 'category' and v_row ? 'tax_category' and v_row ? 'pack_size') then
        v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'sku', 'message', 'New products need name, category, tax_category and pack_size');
      end if;
      if coalesce(v_row ->> 'sale_unit', 'each') = 'weight' then
        v_errors := v_errors || jsonb_build_object('row', v_rowno, 'field', 'sale_unit', 'message', 'Create items sold by weight in the product editor (they need weight steps)');
      end if;
    end if;
    v_plan := v_plan || jsonb_build_object('row', v_rowno, 'sku', v_sku, 'productId', v_prod, 'categoryId', v_cat, 'brandId', v_brand, 'data', v_row);
  end loop;

  if jsonb_array_length(v_errors) = 0 and not coalesce(p_dry_run, true) then
    for v_item in select * from jsonb_array_elements(v_plan) loop
      v_row := v_item -> 'data';
      v_p := jsonb_strip_nulls(jsonb_build_object(
        'id', v_item ->> 'productId', 'sku', v_item ->> 'sku', 'name', v_row ->> 'name',
        'primaryCategoryId', v_item ->> 'categoryId', 'brandId', v_item ->> 'brandId',
        'packSize', v_row ->> 'pack_size', 'saleUnit', v_row ->> 'sale_unit', 'taxCategoryCode', v_row ->> 'tax_category',
        'isOrganic', case when v_row ? 'is_organic' then lower(v_row ->> 'is_organic') in ('true', 'yes', '1') end,
        'isFood', case when v_row ? 'is_food' then lower(v_row ->> 'is_food') in ('true', 'yes', '1') end,
        'isPerishable', case when v_row ? 'is_perishable' then lower(v_row ->> 'is_perishable') in ('true', 'yes', '1') end,
        'maxPerOrder', (v_row ->> 'max_per_order')::int, 'badge', v_row ->> 'badge', 'description', v_row ->> 'description',
        'rrpMinor', round((v_row ->> 'rrp')::numeric * 100)::int));
      v_has_price := v_row ? 'price';
      v_price := case when v_has_price then round((v_row ->> 'price')::numeric * 100)::int end;
      if v_has_price and v_price is distinct from (case when v_item ->> 'productId' is not null then app.current_price_minor((v_item ->> 'productId')::uuid) end) then
        v_p := v_p || jsonb_build_object('priceMinor', v_price, 'priceReason', 'CSV import');
        v_prices := v_prices + 1;
      end if;
      if v_row ? 'status' then v_p := v_p || jsonb_build_object('status', v_row ->> 'status'); end if;
      begin
        perform api.admin_save_product(v_p);
      exception when sqlstate 'PT400' or sqlstate 'PT403' or sqlstate 'PT404' or sqlstate 'PT409' then
        get stacked diagnostics v_msg = pg_exception_hint;
        v_errors := v_errors || jsonb_build_object('row', (v_item ->> 'row')::int, 'field', 'row', 'message', coalesce(nullif(v_msg, ''), sqlerrm));
      end;
      if v_item ->> 'productId' is null then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    end loop;
    if jsonb_array_length(v_errors) > 0 then
      -- all-or-nothing: any row failing while saving undoes the whole import
      raise exception using errcode = 'PT400', message = 'CSV_INVALID', detail = jsonb_build_object('errors', v_errors)::text,
        hint = 'Nothing was imported. Fix the rows listed and try again.';
    end if;
    perform app.audit('product.csv_import', 'product', 'csv', jsonb_build_object('rows', v_n, 'created', v_created, 'updated', v_updated, 'prices', v_prices));
  end if;

  return jsonb_build_object(
    'dryRun', coalesce(p_dry_run, true) or jsonb_array_length(v_errors) > 0,
    'rows', v_n,
    'willCreate', (select count(*) from jsonb_array_elements(v_plan) x where x ->> 'productId' is null),
    'willUpdate', (select count(*) from jsonb_array_elements(v_plan) x where x ->> 'productId' is not null),
    'created', v_created, 'updated', v_updated, 'priceChanges', v_prices,
    'errors', v_errors);
end;
$$;
comment on function api.admin_import_products_csv(text, boolean) is '@access staff Upload products from a CSV. First run as a check (dry run) to see what will change and any problems; then import. All-or-nothing. Permission: inventory.';

select app.harden();
