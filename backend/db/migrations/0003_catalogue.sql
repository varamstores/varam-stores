-- 0003 Catalogue: categories, brands, products, translations, images, price history,
--      food information (14 allergens, nutrition per 100 g/ml), homepage shelves.

create table app.categories (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  parent_id        uuid references app.categories (id) on delete restrict,
  position         integer not null default 0,
  image_url        text,
  accent_bg        text,
  accent_color     text,
  card_bg          text,
  badge            text,
  show_on_homepage boolean not null default true,
  is_active        boolean not null default true,
  is_sample        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index categories_parent_idx on app.categories (parent_id, position);
create trigger categories_touch before update on app.categories
  for each row execute function app.touch_updated_at();

create table app.category_translations (
  category_id uuid not null references app.categories (id) on delete cascade,
  locale      text not null references app.locales (code),
  name        text not null check (length(name) between 1 and 120),
  tagline     text,
  primary key (category_id, locale)
);

create table app.brands (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legacy_ref       text unique,
  name             text not null check (length(name) between 1 and 120),
  logo_url         text,
  tagline          text,
  is_popular       boolean not null default false,
  marquee_position integer unique,
  is_active        boolean not null default true,
  is_sample        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger brands_touch before update on app.brands
  for each row execute function app.touch_updated_at();

create table app.products (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legacy_ref               text unique,
  sku                      text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  brand_id                 uuid references app.brands (id),
  primary_category_id      uuid not null references app.categories (id),
  status                   text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  featured_rank            integer,
  tax_category_code        text not null references app.tax_categories (code),
  tax_category_reviewed_by text,
  tax_category_reviewed_at timestamptz,
  sale_unit                text not null check (sale_unit in ('each', 'weight')),
  pack_size_label          text not null check (length(pack_size_label) between 1 and 60),
  net_quantity             numeric(12, 3) check (net_quantity > 0),
  net_quantity_unit        text check (net_quantity_unit in ('g', 'kg', 'ml', 'l', 'piece')),
  estimated_weight_grams   integer check (estimated_weight_grams > 0),
  min_weight_grams         integer check (min_weight_grams > 0),
  weight_step_grams        integer check (weight_step_grams > 0),
  max_per_order            integer check (max_per_order > 0),
  rrp_minor                integer check (rrp_minor > 0),
  currency                 char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  is_organic               boolean not null default false,
  organic_certifier_code   text,
  is_food                  boolean not null,
  is_perishable            boolean not null,
  is_returnable            boolean not null,
  age_restriction_code     text references app.age_restrictions (code),
  deposit_scheme_code      text references app.deposit_schemes (code),
  badge                    text check (length(badge) <= 40),
  rating_avg               numeric(3, 2) check (rating_avg between 1 and 5),
  rating_count             integer not null default 0 check (rating_count >= 0),
  published_at             timestamptz,
  is_sample                boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check ((net_quantity is null) = (net_quantity_unit is null)),
  check ((tax_category_reviewed_by is null) = (tax_category_reviewed_at is null)),
  check (not (is_perishable and is_returnable)),
  check (sale_unit = 'each'
         or (estimated_weight_grams is not null and min_weight_grams is not null and weight_step_grams is not null)),
  check (sale_unit = 'weight'
         or (estimated_weight_grams is null and min_weight_grams is null and weight_step_grams is null)),
  check ((rating_count = 0) = (rating_avg is null)),
  check (status <> 'active' or published_at is not null)
);
comment on column app.products.rrp_minor is 'Manufacturer recommended retail price (frontend "originalPrice"). Display as RRP, never as a "was" price.';
comment on column app.products.sale_unit is 'each = sold per piece/pack; weight = priced per kg, weighed at picking.';
create index products_category_idx on app.products (primary_category_id) where status = 'active';
create index products_brand_idx on app.products (brand_id) where status = 'active';
create trigger products_touch before update on app.products
  for each row execute function app.touch_updated_at();

create table app.product_translations (
  product_id       uuid not null references app.products (id) on delete cascade,
  locale           text not null references app.locales (code),
  name             text not null check (length(name) between 1 and 200),
  description      text not null default '',
  origin_text      text,
  storage_text     text,
  sourcing_text    text,
  ingredients_text text,
  primary key (product_id, locale)
);
create index product_translations_name_trgm on app.product_translations using gin (name extensions.gin_trgm_ops);

create table app.product_categories (
  product_id  uuid not null references app.products (id) on delete cascade,
  category_id uuid not null references app.categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_categories_category_idx on app.product_categories (category_id);

create table app.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references app.products (id) on delete cascade,
  url        text not null,
  alt        text not null default '',
  position   smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, position)
);

-- Price history: never overwritten. Current price = the row whose range contains now().
create table app.product_prices (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references app.products (id) on delete cascade,
  price_list   text not null default 'base' check (price_list in ('base', 'member')),
  amount_minor integer not null check (amount_minor > 0),
  currency     char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  valid_from   timestamptz not null default now(),
  valid_to     timestamptz,
  set_by       uuid,
  reason       text,
  created_at   timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  constraint product_prices_no_overlap exclude using gist (
    product_id with =, price_list with =, tstzrange(valid_from, valid_to) with &&)
);
comment on column app.product_prices.amount_minor is 'VAT-inclusive, per sale unit (per kg for weight items).';

create or replace function app.current_price_minor(p_product_id uuid, p_price_list text default 'base', p_at timestamptz default now())
returns integer
language sql
stable
set search_path = ''
as $$
  select pp.amount_minor from app.product_prices pp
  where pp.product_id = p_product_id and pp.price_list = p_price_list
    and tstzrange(pp.valid_from, pp.valid_to) @> p_at
$$;

-- Lowest base price over the 30 days before p_at (for genuine reference-price checks).
create or replace function app.lowest_price_30d_minor(p_product_id uuid, p_at timestamptz default now())
returns integer
language sql
stable
set search_path = ''
as $$
  select min(pp.amount_minor) from app.product_prices pp
  where pp.product_id = p_product_id and pp.price_list = 'base'
    and tstzrange(pp.valid_from, pp.valid_to) && tstzrange(p_at - interval '30 days', p_at)
$$;

create table app.allergens (
  code     text primary key,
  name     text not null,
  position smallint not null unique
);
insert into app.allergens (code, name, position) values
  ('celery',         'Celery', 1),
  ('cereals_gluten', 'Cereals containing gluten', 2),
  ('crustaceans',    'Crustaceans', 3),
  ('eggs',           'Eggs', 4),
  ('fish',           'Fish', 5),
  ('lupin',          'Lupin', 6),
  ('milk',           'Milk', 7),
  ('molluscs',       'Molluscs', 8),
  ('mustard',        'Mustard', 9),
  ('tree_nuts',      'Tree nuts', 10),
  ('peanuts',        'Peanuts', 11),
  ('sesame',         'Sesame', 12),
  ('soya',           'Soya', 13),
  ('sulphites',      'Sulphur dioxide and sulphites', 14);

create table app.product_food_info (
  product_id        uuid primary key references app.products (id) on delete cascade,
  nutrition_basis   text check (nutrition_basis in ('per_100g', 'per_100ml')),
  energy_kj         numeric(8, 1) check (energy_kj >= 0),
  energy_kcal       numeric(8, 1) check (energy_kcal >= 0),
  fat_g             numeric(7, 2) check (fat_g >= 0),
  saturates_g       numeric(7, 2) check (saturates_g >= 0),
  carbohydrate_g    numeric(7, 2) check (carbohydrate_g >= 0),
  sugars_g          numeric(7, 2) check (sugars_g >= 0),
  fibre_g           numeric(7, 2) check (fibre_g >= 0),
  protein_g         numeric(7, 2) check (protein_g >= 0),
  salt_g            numeric(7, 2) check (salt_g >= 0),
  fbo_name          text,
  fbo_address       text,
  country_of_origin text,
  allergens_reviewed boolean not null default false,
  reviewed_by       text,
  reviewed_at       timestamptz,
  updated_at        timestamptz not null default now(),
  check (nutrition_basis is not null
         or (energy_kj is null and energy_kcal is null and fat_g is null and saturates_g is null
             and carbohydrate_g is null and sugars_g is null and fibre_g is null and protein_g is null and salt_g is null)),
  check ((reviewed_by is null) = (reviewed_at is null))
);
comment on column app.product_food_info.allergens_reviewed is 'true once someone has checked the pack: product_allergens is then authoritative (including "no allergens").';
create trigger product_food_info_touch before update on app.product_food_info
  for each row execute function app.touch_updated_at();

create table app.product_allergens (
  product_id    uuid not null references app.products (id) on delete cascade,
  allergen_code text not null references app.allergens (code),
  presence      text not null check (presence in ('contains', 'may_contain')),
  primary key (product_id, allergen_code)
);

-- Mandatory food information present? (ingredients, reviewed allergens, full nutrition, FBO)
create or replace function app.food_info_complete(p_product_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select f.nutrition_basis is not null
       and f.energy_kj is not null and f.energy_kcal is not null and f.fat_g is not null
       and f.saturates_g is not null and f.carbohydrate_g is not null and f.sugars_g is not null
       and f.protein_g is not null and f.salt_g is not null
       and f.fbo_name is not null and f.fbo_address is not null
       and f.allergens_reviewed
       and exists (select 1 from app.product_translations t
                   where t.product_id = f.product_id and coalesce(t.ingredients_text, '') <> '')
    from app.product_food_info f where f.product_id = p_product_id), false)
$$;

create table app.collections (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title      text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table app.collection_items (
  collection_id uuid not null references app.collections (id) on delete cascade,
  product_id    uuid not null references app.products (id) on delete cascade,
  position      integer not null check (position >= 0),
  primary key (collection_id, product_id),
  unique (collection_id, position)
);

select app.harden();
