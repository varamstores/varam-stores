-- 0012 Catalogue read API for the storefront: categories, brands, products (filters, sort,
--      facets, pagination, typo-tolerant search), product detail, shelves, reviews, config.

alter table app.categories add column image_mobile_url text;
comment on column app.categories.image_mobile_url is 'Optional mobile artwork; falls back to image_url.';

insert into app.app_settings (key, value, description) values
  ('shopper_low_stock_units', '0', 'Show "low stock" to shoppers when available units ≤ this (0 = never show low stock).')
on conflict (key) do nothing;

-- ── small helpers ───────────────────────────────────────────────────────────
create or replace function app.is_production()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((select s.value #>> '{}' from app.app_settings s where s.key = 'environment'), 'development') = 'production' $$;

create or replace function app.resolve_locale(p_locale text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select l.code from app.locales l where l.code = p_locale),
                  (select l.code from app.locales l where l.is_default), 'en-GB')
$$;

-- Lower-case + strip accents (used for search documents and queries).
create or replace function app.fold(p_text text)
returns text
language sql
stable
set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))) $$;

create or replace function app.image_json(p_url text, p_alt text, p_mobile_url text default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_url is null or p_url = '' then null else
    jsonb_build_object('url', app.media_url(p_url), 'mobileUrl', app.media_url(coalesce(nullif(p_mobile_url, ''), p_url)), 'alt', coalesce(p_alt, ''))
  end
$$;

create or replace function app.brand_group(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(left(p_name, 1)) between 'A' and 'B' then 'A-B'
    when upper(left(p_name, 1)) between 'C' and 'E' then 'C-E'
    when upper(left(p_name, 1)) between 'F' and 'H' then 'F-H'
    when upper(left(p_name, 1)) between 'I' and 'K' then 'I-K'
    when upper(left(p_name, 1)) between 'L' and 'O' then 'L-O'
    when upper(left(p_name, 1)) between 'P' and 'R' then 'P-R'
    when upper(left(p_name, 1)) between 'S' and 'U' then 'S-U'
    when upper(left(p_name, 1)) between 'V' and 'Z' then 'V-Z'
    else '0-9' end
$$;

-- Category and all its descendants.
create or replace function app.category_subtree(p_category_id uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with recursive t(id) as (
    select p_category_id
    union all
    select c.id from app.categories c join t on c.parent_id = t.id where c.is_active
  )
  select id from t
$$;

-- ── search document (trigger-maintained) ────────────────────────────────────
alter table app.products add column search_document tsvector;
create index products_search_idx on app.products using gin (search_document);

create or replace function app.refresh_product_search(p_product_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text; v_desc text; v_brand text; v_cats text;
begin
  select t.name, t.description into v_name, v_desc
  from app.product_translations t
  where t.product_id = p_product_id and t.locale = app.resolve_locale(null);
  select b.name into v_brand from app.products p join app.brands b on b.id = p.brand_id where p.id = p_product_id;
  select string_agg(ct.name, ' ') into v_cats
  from app.product_categories pc
  join app.category_translations ct on ct.category_id = pc.category_id
  where pc.product_id = p_product_id;
  update app.products p set search_document =
       setweight(to_tsvector('simple',  app.fold(v_name)),  'A')
    || setweight(to_tsvector('english', app.fold(v_name)),  'A')
    || setweight(to_tsvector('simple',  app.fold(v_brand)), 'A')
    || setweight(to_tsvector('simple',  app.fold(v_cats)),  'B')
    || setweight(to_tsvector('english', app.fold(v_desc)),  'D')
  where p.id = p_product_id;
end;
$$;

create or replace function app.trg_product_search_from_translation()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform app.refresh_product_search(coalesce(new.product_id, old.product_id));
  return null;
end; $$;
create trigger product_translations_search after insert or update or delete on app.product_translations
  for each row execute function app.trg_product_search_from_translation();

create or replace function app.trg_product_search_from_product()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform app.refresh_product_search(new.id);
  return null;
end; $$;
create trigger products_search after insert or update of brand_id, primary_category_id on app.products
  for each row execute function app.trg_product_search_from_product();

create or replace function app.trg_product_search_from_category_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform app.refresh_product_search(coalesce(new.product_id, old.product_id));
  return null;
end; $$;
create trigger product_categories_search after insert or delete on app.product_categories
  for each row execute function app.trg_product_search_from_category_link();

create or replace function app.trg_product_search_from_brand()
returns trigger language plpgsql set search_path = '' as $$
declare r record;
begin
  for r in select p.id from app.products p where p.brand_id = new.id loop
    perform app.refresh_product_search(r.id);
  end loop;
  return null;
end; $$;
create trigger brands_search after update of name on app.brands
  for each row execute function app.trg_product_search_from_brand();

create or replace function app.trg_product_search_from_category_name()
returns trigger language plpgsql set search_path = '' as $$
declare r record;
begin
  for r in select pc.product_id from app.product_categories pc where pc.category_id = new.category_id loop
    perform app.refresh_product_search(r.product_id);
  end loop;
  return null;
end; $$;
create trigger category_translations_search after update of name on app.category_translations
  for each row execute function app.trg_product_search_from_category_name();

-- Prefix query from free text: "bas rice" → 'bas':* & 'rice':*
create or replace function app.prefix_tsquery(p_q text)
returns tsquery
language sql
stable
set search_path = ''
as $$
  select case when count(*) = 0 then null
              else to_tsquery('simple', string_agg(quote_literal(tok) || ':*', ' & ')) end
  from (select tok from regexp_split_to_table(app.fold(p_q), '[^a-z0-9]+') tok where tok <> '' limit 8) s
$$;

-- ── product JSON ────────────────────────────────────────────────────────────
create or replace function app.product_location_for_postcode(p_postcode text)
returns uuid
language sql
stable
set search_path = ''
as $$ select z.location_id from app.delivery_zones z where z.id = app.zone_for_postcode(p_postcode) $$;

create or replace function app.product_availability(p_product_id uuid, p_location_id uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_avail bigint; v_rows integer; v_unit text; v_min integer; v_est integer;
  v_low integer := coalesce((app.setting('shopper_low_stock_units') #>> '{}')::int, 0);
begin
  select p.sale_unit, p.min_weight_grams, p.estimated_weight_grams into v_unit, v_min, v_est
  from app.products p where p.id = p_product_id;
  select coalesce(sum(sl.on_hand - sl.reserved), 0), count(*) into v_avail, v_rows
  from app.stock_levels sl
  join app.fulfilment_locations fl on fl.id = sl.location_id and fl.is_active
  where sl.product_id = p_product_id and (p_location_id is null or sl.location_id = p_location_id);
  if v_rows = 0 then return 'out_of_stock'; end if;
  if v_unit = 'weight' then
    if v_avail < coalesce(v_min, 1) then return 'out_of_stock'; end if;
    if v_low > 0 and v_avail <= v_low::bigint * coalesce(v_est, 1000) then return 'low_stock'; end if;
  else
    if v_avail <= 0 then return 'out_of_stock'; end if;
    if v_low > 0 and v_avail <= v_low then return 'low_stock'; end if;
  end if;
  return 'in_stock';
end;
$$;

create or replace function app.product_summary_json(p_product_id uuid, p_locale text default null, p_location_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_locale text := app.resolve_locale(p_locale);
  p        app.products%rowtype;
  v_name   text;
  v_price  integer;
  v_cur_from timestamptz;
  v_prev   integer;
  v_was    integer;
  v_unit   jsonb;
  v_age    smallint;
  v_promos jsonb;
begin
  select * into p from app.products where id = p_product_id;
  if not found then return null; end if;

  select coalesce(
    (select t.name from app.product_translations t where t.product_id = p.id and t.locale = v_locale),
    (select t.name from app.product_translations t where t.product_id = p.id order by (t.locale = 'en-GB') desc limit 1))
  into v_name;

  select pp.amount_minor, pp.valid_from into v_price, v_cur_from
  from app.product_prices pp
  where pp.product_id = p.id and pp.price_list = 'base' and tstzrange(pp.valid_from, pp.valid_to) @> now();

  -- genuine "was" price: the previous price, if higher and replaced within the last 30 days
  select pp.amount_minor into v_prev
  from app.product_prices pp
  where pp.product_id = p.id and pp.price_list = 'base' and pp.valid_to = v_cur_from;
  if v_prev is not null and v_prev > v_price and v_cur_from > now() - interval '30 days' then
    v_was := v_prev;
  end if;

  if v_price is not null then
    v_unit := case
      when p.sale_unit = 'weight' then jsonb_build_object('price', app.money(v_price), 'per', 'kg')
      when p.net_quantity_unit = 'g'  then jsonb_build_object('price', app.money(app.div_round_half_up(v_price * 1000, round(p.net_quantity)::bigint)), 'per', 'kg')
      when p.net_quantity_unit = 'kg' then jsonb_build_object('price', app.money(round(v_price / p.net_quantity)::bigint), 'per', 'kg')
      when p.net_quantity_unit = 'ml' then jsonb_build_object('price', app.money(app.div_round_half_up(v_price * 1000, round(p.net_quantity)::bigint)), 'per', 'l')
      when p.net_quantity_unit = 'l'  then jsonb_build_object('price', app.money(round(v_price / p.net_quantity)::bigint), 'per', 'l')
      when p.net_quantity_unit = 'piece' then jsonb_build_object('price', app.money(round(v_price / p.net_quantity)::bigint), 'per', 'each')
      else null end;
  end if;

  select r.min_age into v_age from app.age_restriction_rules r
  where r.restriction_code = p.age_restriction_code and r.country_code = (app.setting('default_country') #>> '{}');

  select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'label', pr.label) order by pr.priority, pr.id), '[]'::jsonb)
  into v_promos
  from app.promotions pr
  where pr.status = 'active' and not pr.requires_coupon and pr.scope = 'targets'
    and pr.starts_at <= now() and (pr.ends_at is null or pr.ends_at > now())
    and exists (select 1 from app.promotion_targets t where t.promotion_id = pr.id and (
          (t.target_type = 'product'  and t.target_id = p.id)
       or (t.target_type = 'brand'    and t.target_id = p.brand_id)
       or (t.target_type = 'category' and t.target_id in (select pc.category_id from app.product_categories pc where pc.product_id = p.id))));

  return jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'legacyRef', p.legacy_ref,
    'sku', p.sku,
    'name', v_name,
    'brand', (select jsonb_build_object('slug', b.slug, 'name', b.name) from app.brands b where b.id = p.brand_id),
    'category', (select jsonb_build_object('slug', c.slug, 'name', ct.name)
                 from app.categories c
                 left join app.category_translations ct on ct.category_id = c.id and ct.locale = v_locale
                 where c.id = p.primary_category_id),
    'image', (select app.image_json(i.url, coalesce(nullif(i.alt, ''), v_name)) from app.product_images i
              where i.product_id = p.id order by i.position limit 1),
    'price', app.money(v_price),
    'rrp', case when p.rrp_minor > v_price then app.money(p.rrp_minor) end,
    'wasPrice', app.money(v_was),
    'lowestPrice30d', app.money(app.lowest_price_30d_minor(p.id)),
    'unitPrice', v_unit,
    'saleUnit', p.sale_unit,
    'packSize', p.pack_size_label,
    'estimatedWeightGrams', p.estimated_weight_grams,
    'minWeightGrams', p.min_weight_grams,
    'weightStepGrams', p.weight_step_grams,
    'maxPerOrder', p.max_per_order,
    'badge', p.badge,
    'promotions', v_promos,
    'isOrganic', p.is_organic,
    'ageRestriction', case when v_age is not null then jsonb_build_object('minAge', v_age) end,
    'rating', jsonb_build_object('average', p.rating_avg, 'count', p.rating_count),
    'availability', app.product_availability(p.id, p_location_id)
  );
end;
$$;

create or replace function app.product_detail_json(p_product_id uuid, p_locale text default null, p_location_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_locale text := app.resolve_locale(p_locale);
  v_sum    jsonb := app.product_summary_json(p_product_id, p_locale, p_location_id);
  p        app.products%rowtype;
  t        app.product_translations%rowtype;
  f        app.product_food_info%rowtype;
  v_food   jsonb;
begin
  if v_sum is null then return null; end if;
  select * into p from app.products where id = p_product_id;
  select * into t from app.product_translations x where x.product_id = p_product_id
    order by (x.locale = v_locale) desc, (x.locale = 'en-GB') desc limit 1;
  select * into f from app.product_food_info x where x.product_id = p_product_id;

  if p.is_food then
    v_food := jsonb_build_object(
      'ingredients', t.ingredients_text,
      'allergensReviewed', coalesce(f.allergens_reviewed, false),
      'allergens', jsonb_build_object(
        'contains',   coalesce((select jsonb_agg(a.allergen_code order by al.position) from app.product_allergens a join app.allergens al on al.code = a.allergen_code
                                where a.product_id = p.id and a.presence = 'contains'), '[]'::jsonb),
        'mayContain', coalesce((select jsonb_agg(a.allergen_code order by al.position) from app.product_allergens a join app.allergens al on al.code = a.allergen_code
                                where a.product_id = p.id and a.presence = 'may_contain'), '[]'::jsonb)),
      'nutrition', case when f.nutrition_basis is null then null else jsonb_build_object(
        'basis', f.nutrition_basis, 'energyKj', f.energy_kj, 'energyKcal', f.energy_kcal, 'fat', f.fat_g, 'saturates', f.saturates_g,
        'carbohydrate', f.carbohydrate_g, 'sugars', f.sugars_g, 'fibre', f.fibre_g, 'protein', f.protein_g, 'salt', f.salt_g) end,
      'foodBusinessOperator', case when f.fbo_name is not null then jsonb_build_object('name', f.fbo_name, 'address', f.fbo_address) end,
      'countryOfOrigin', f.country_of_origin,
      'isComplete', app.food_info_complete(p.id));
  end if;

  return v_sum || jsonb_build_object(
    'description', coalesce(t.description, ''),
    'origin', t.origin_text,
    'storage', t.storage_text,
    'sourcing', t.sourcing_text,
    'gallery', coalesce((select jsonb_agg(app.image_json(i.url, coalesce(nullif(i.alt, ''), t.name)) order by i.position)
                         from app.product_images i where i.product_id = p.id), '[]'::jsonb),
    'isReturnable', p.is_returnable,
    'isPerishable', p.is_perishable,
    'isFood', p.is_food,
    'deposit', (select jsonb_build_object('label', d.name, 'amount', app.money(d.amount_minor, d.currency))
                from app.deposit_schemes d where d.code = p.deposit_scheme_code and d.is_active),
    'foodInfo', v_food);
end;
$$;

create or replace function app.category_json(p_category_id uuid, p_locale text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  return (select jsonb_build_object(
    'id', c.id, 'slug', c.slug,
    'name', coalesce(ct.name, c.slug), 'tagline', ct.tagline, 'badge', c.badge,
    'image', app.image_json(c.image_url, ct.name, c.image_mobile_url),
    'accentBg', c.accent_bg, 'accentColor', c.accent_color, 'cardBg', c.card_bg,
    'showOnHomepage', c.show_on_homepage, 'position', c.position,
    'productCount', (select count(distinct pc.product_id)::int
                     from app.product_categories pc join app.products p on p.id = pc.product_id and p.status = 'active'
                     where pc.category_id in (select app.category_subtree(c.id))),
    'children', coalesce((select jsonb_agg(app.category_json(ch.id, p_locale) order by ch.position, ch.slug)
                          from app.categories ch where ch.parent_id = c.id and ch.is_active), '[]'::jsonb))
  from app.categories c
  left join app.category_translations ct on ct.category_id = c.id and ct.locale = app.resolve_locale(p_locale)
  where c.id = p_category_id);
end;
$$;

-- ═════════════════════════ api: storefront reads ═══════════════════════════
create or replace function api.get_storefront_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', app.setting('currency') #>> '{}',
    'locale', app.resolve_locale(null),
    'timezone', app.setting('timezone') #>> '{}',
    'freeDeliveryThreshold', app.money((select min(f.from_basket_minor) from app.delivery_fee_rules f
                                        join app.delivery_zones z on z.id = f.zone_id and z.is_active
                                        where f.fee_minor = 0 and f.from_basket_minor > 0
                                          and tstzrange(f.valid_from, f.valid_to) @> now())),
    'supportEmail', app.setting('support_email') #>> '{}',
    'supportPhone', app.setting('support_phone') #>> '{}',
    'guestCheckout', coalesce((app.setting('guest_checkout_enabled'))::boolean, false),
    'loyaltyEnabled', coalesce((app.setting('loyalty_enabled'))::boolean, false),
    'environment', app.setting('environment') #>> '{}')
$$;
comment on function api.get_storefront_config() is '@access anon Store-wide display settings (currency, free-delivery threshold, support contacts).';

create or replace function api.list_categories(p_locale text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.category_json(c.id, p_locale) order by c.position, c.slug), '[]'::jsonb)
  from app.categories c where c.parent_id is null and c.is_active
$$;
comment on function api.list_categories(text) is '@access anon Category tree with live product counts.';

create or replace function api.get_category(p_slug text, p_locale text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  select app.category_json(c.id, p_locale) into v from app.categories c where c.slug = p_slug and c.is_active;
  if v is null then perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('slug', p_slug)); end if;
  return v;
end;
$$;
comment on function api.get_category(text, text) is '@access anon One category with its children.';

create or replace function api.list_brands(p_popular boolean default null, p_group text default null, p_q text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'group', app.brand_group(b.name),
      'isPopular', b.is_popular, 'logo', app.image_json(b.logo_url, b.name), 'tagline', b.tagline,
      'productCount', (select count(*)::int from app.products p where p.brand_id = b.id and p.status = 'active'))
    order by lower(b.name)), '[]'::jsonb)
  from app.brands b
  where b.is_active
    and (p_popular is null or b.is_popular = p_popular)
    and (p_group is null or app.brand_group(b.name) = p_group)
    and (p_q is null or app.fold(b.name) like '%' || app.fold(p_q) || '%')
$$;
comment on function api.list_brands(boolean, text, text) is '@access anon Brands A–Z with group, popularity and logo.';

create or replace function api.list_marquee_brands()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'tagline', b.tagline,
                                               'logo', app.image_json(b.logo_url, b.name)) order by b.marquee_position), '[]'::jsonb)
  from app.brands b where b.is_active and b.marquee_position is not null
$$;
comment on function api.list_marquee_brands() is '@access anon Brands shown in the homepage logo marquee, in order.';

create or replace function api.list_products(
  p_category   text    default null,
  p_brands     text[]  default null,
  p_q          text    default null,
  p_organic    boolean default null,
  p_on_sale    boolean default null,
  p_min_price  integer default null,
  p_max_price  integer default null,
  p_min_rating numeric default null,
  p_sort       text    default 'featured',
  p_postcode   text    default null,
  p_limit      integer default 24,
  p_cursor     text    default null,
  p_locale     text    default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit    integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset   integer := 0;
  v_cat_id   uuid;
  v_loc      uuid := case when p_postcode is not null then app.product_location_for_postcode(p_postcode) end;
  v_q        text := nullif(trim(coalesce(p_q, '')), '');
  v_tsq      tsquery;
  v_ids      uuid[];
  v_total    integer;
  v_items    jsonb;
  v_facets   jsonb;
begin
  if p_sort is not null and p_sort not in ('featured', 'price-asc', 'price-desc', 'rating', 'name-asc', 'name-desc', 'relevance') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('field', 'p_sort'));
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,6}$' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('field', 'p_cursor')); end if;
    v_offset := p_cursor::int;
  end if;
  if p_category is not null and p_category <> 'all' then
    select c.id into v_cat_id from app.categories c where c.slug = p_category and c.is_active;
    if v_cat_id is null then
      return jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null, 'total', 0, 'facets', '{}'::jsonb);
    end if;
  end if;
  if v_q is not null then
    v_tsq := app.prefix_tsquery(v_q);
  end if;

  with base as (
  select p.id as product_id, cp.amount_minor as price, t.name, p.rating_avg as rating,
         case when v_q is null then 0
              else coalesce(ts_rank(p.search_document, v_tsq), 0) + extensions.similarity(app.fold(t.name), app.fold(v_q)) end as rank,
         p.featured_rank as featured,
         (p.rrp_minor > cp.amount_minor
          or exists (select 1 from app.product_prices pp where pp.product_id = p.id and pp.price_list = 'base'
                     and pp.valid_to = cp.valid_from and pp.amount_minor > cp.amount_minor and cp.valid_from > now() - interval '30 days')
          or exists (select 1 from app.promotions pr join app.promotion_targets pt on pt.promotion_id = pr.id
                     where pr.status = 'active' and not pr.requires_coupon and pr.starts_at <= now() and (pr.ends_at is null or pr.ends_at > now())
                       and ((pt.target_type = 'product' and pt.target_id = p.id) or (pt.target_type = 'brand' and pt.target_id = p.brand_id)
                         or (pt.target_type = 'category' and pt.target_id in (select pc2.category_id from app.product_categories pc2 where pc2.product_id = p.id))))) as on_sale,
         p.brand_id, p.is_organic as organic
  from app.products p
  join app.product_prices cp on cp.product_id = p.id and cp.price_list = 'base' and tstzrange(cp.valid_from, cp.valid_to) @> now()
  join app.product_translations t on t.product_id = p.id and t.locale = app.resolve_locale(p_locale)
  where p.status = 'active'
    and (v_cat_id is null or exists (select 1 from app.product_categories pc where pc.product_id = p.id
                                     and pc.category_id in (select app.category_subtree(v_cat_id))))
    and (p_brands is null or cardinality(p_brands) = 0 or p.brand_id in (select b.id from app.brands b where b.slug = any (p_brands)))
    and (v_q is null
         or (v_tsq is not null and p.search_document @@ v_tsq)
         or extensions.similarity(app.fold(t.name), app.fold(v_q)) > 0.3
         or extensions.word_similarity(app.fold(v_q), app.fold(t.name)) > 0.5)
    and (p_organic is not true or p.is_organic)
    and (p_min_price is null or cp.amount_minor >= p_min_price)
    and (p_max_price is null or cp.amount_minor <= p_max_price)
    and (p_min_rating is null or p.rating_avg >= p_min_rating)
  ),
  pl as (select * from base where p_on_sale is not true or on_sale)
  select
    (select count(*)::int from pl),
    (select coalesce(array_agg(pl.product_id order by
        case when coalesce(p_sort, case when v_q is not null then 'relevance' else 'featured' end) = 'relevance' then -pl.rank end nulls last,
        case when p_sort = 'price-asc'  then pl.price end asc nulls last,
        case when p_sort = 'price-desc' then pl.price end desc nulls last,
        case when p_sort = 'rating'     then pl.rating end desc nulls last,
        case when p_sort = 'name-asc'   then lower(pl.name) end asc,
        case when p_sort = 'name-desc'  then lower(pl.name) end desc,
        pl.featured asc nulls last, lower(pl.name) asc, pl.product_id), '{}') from pl),
    jsonb_build_object(
      'brands', coalesce((select jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name, 'count', s.n) order by s.n desc, b.name)
                          from (select pl.brand_id, count(*)::int n from pl where pl.brand_id is not null group by pl.brand_id) s
                          join app.brands b on b.id = s.brand_id), '[]'::jsonb),
      'organicCount', (select count(*)::int from pl where pl.organic),
      'onSaleCount', (select count(*)::int from pl where pl.on_sale),
      'priceRange', jsonb_build_object('min', app.money((select min(pl.price) from pl)), 'max', app.money((select max(pl.price) from pl))))
  into v_total, v_ids, v_facets;

  select coalesce(jsonb_agg(app.product_summary_json(x.id, p_locale, v_loc) order by x.ord), '[]'::jsonb)
  into v_items
  from unnest(v_ids[v_offset + 1 : v_offset + v_limit]) with ordinality as x(id, ord);

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', case when v_offset + v_limit < v_total then (v_offset + v_limit)::text end,
    'total', v_total,
    'facets', v_facets);
end;
$$;
comment on function api.list_products(text, text[], text, boolean, boolean, integer, integer, numeric, text, text, integer, text, text)
  is '@access anon Shop listing: filters, sort, typo-tolerant search, facets, cursor pagination.';

create or replace function api.search_suggest(p_q text, p_limit integer default 6, p_locale text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_res jsonb;
begin
  if v_q is null or length(v_q) < 1 then
    return jsonb_build_object('products', '[]'::jsonb, 'categories', '[]'::jsonb, 'brands', '[]'::jsonb);
  end if;
  v_res := api.list_products(p_q => v_q, p_sort => 'relevance', p_limit => least(greatest(coalesce(p_limit, 6), 1), 20), p_locale => p_locale);
  return jsonb_build_object(
    'products', v_res -> 'items',
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', ct.name) order by ct.name)
                            from app.categories c join app.category_translations ct on ct.category_id = c.id and ct.locale = app.resolve_locale(p_locale)
                            where c.is_active and app.fold(ct.name) like '%' || app.fold(v_q) || '%' limit 5), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name) order by b.name)
                        from (select * from app.brands b where b.is_active and app.fold(b.name) like '%' || app.fold(v_q) || '%' order by b.name limit 5) b), '[]'::jsonb));
end;
$$;
comment on function api.search_suggest(text, integer, text) is '@access anon Header search dropdown: top products, matching categories and brands.';

create or replace function api.get_product(p_slug_or_legacy_ref text, p_postcode text default null, p_locale text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select p.id into v_id from app.products p
  where (p.slug = p_slug_or_legacy_ref or p.legacy_ref = p_slug_or_legacy_ref or p.id::text = p_slug_or_legacy_ref)
    and p.status = 'active'
  limit 1;
  if v_id is null then
    perform app.raise_error('PRODUCT_NOT_FOUND', 404, jsonb_build_object('product', p_slug_or_legacy_ref));
  end if;
  return app.product_detail_json(v_id, p_locale, case when p_postcode is not null then app.product_location_for_postcode(p_postcode) end);
end;
$$;
comment on function api.get_product(text, text, text) is '@access anon Product detail by slug, legacy id (prod-1) or uuid.';

create or replace function api.list_related_products(p_product_id uuid, p_limit integer default 8, p_locale text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.product_summary_json(r.id, p_locale) order by r.featured_rank nulls last, r.id), '[]'::jsonb)
  from (
    select p.id, p.featured_rank from app.products p
    where p.status = 'active' and p.id <> p_product_id
      and p.primary_category_id = (select x.primary_category_id from app.products x where x.id = p_product_id)
    order by p.featured_rank nulls last, p.id
    limit least(greatest(coalesce(p_limit, 8), 1), 24)
  ) r
$$;
comment on function api.list_related_products(uuid, integer, text) is '@access anon Same-category products for the product page.';

create or replace function api.get_collection(p_code text, p_limit integer default null, p_locale text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c app.collections%rowtype;
begin
  select * into c from app.collections x where x.code = p_code and x.is_active;
  if not found then perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('collection', p_code)); end if;
  return jsonb_build_object('code', c.code, 'title', c.title, 'products', coalesce((
    select jsonb_agg(app.product_summary_json(ci.product_id, p_locale) order by ci.position)
    from (select ci.* from app.collection_items ci join app.products p on p.id = ci.product_id and p.status = 'active'
          where ci.collection_id = c.id order by ci.position limit coalesce(p_limit, 100)) ci), '[]'::jsonb));
end;
$$;
comment on function api.get_collection(text, integer, text) is '@access anon Homepage product shelf by code.';

create or replace function app.review_json(r app.reviews)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', r.id, 'displayName', r.display_name, 'locationLabel', r.location_label,
    'avatarUrl', app.media_url(r.avatar_url), 'rating', r.rating, 'body', r.body, 'isVerified', r.is_verified, 'createdAt', r.created_at)
$$;

create or replace function api.list_featured_reviews(p_limit integer default 12)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.review_json(r) order by r.created_at desc), '[]'::jsonb)
  from app.reviews r
  where r.id in (select x.id from app.reviews x
                 where x.product_id is null and x.status = 'approved' and (not x.is_sample or not app.is_production())
                 order by x.created_at desc limit least(greatest(coalesce(p_limit, 12), 1), 50))
$$;
comment on function api.list_featured_reviews(integer) is '@access anon Homepage testimonials (sample reviews hidden in production).';

create or replace function api.list_product_reviews(p_product_id uuid, p_limit integer default 10, p_cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offset integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_total integer;
begin
  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,6}$' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('field', 'p_cursor')); end if;
    v_offset := p_cursor::int;
  end if;
  select count(*) into v_total from app.reviews r
  where r.product_id = p_product_id and r.status = 'approved' and (not r.is_sample or not app.is_production());
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(app.review_json(r) order by r.created_at desc) from app.reviews r
               where r.id in (select x.id from app.reviews x where x.product_id = p_product_id and x.status = 'approved'
                                and (not x.is_sample or not app.is_production())
                              order by x.created_at desc offset v_offset limit v_limit)), '[]'::jsonb),
    'nextCursor', case when v_offset + v_limit < v_total then (v_offset + v_limit)::text end,
    'total', v_total,
    'summary', (select jsonb_build_object('average', p.rating_avg, 'count', p.rating_count) from app.products p where p.id = p_product_id));
end;
$$;
comment on function api.list_product_reviews(uuid, integer, text) is '@access anon Approved reviews for a product.';

create or replace function api.list_popular_areas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', z.code, 'name', z.name, 'label', z.display_label) order by z.popular_position), '[]'::jsonb)
  from app.delivery_zones z where z.is_active and z.is_popular
$$;
comment on function api.list_popular_areas() is '@access anon "Frequent delivery hubs" shown in the location picker.';

-- backfill search documents
select app.refresh_product_search(p.id) from app.products p;

select app.harden();
