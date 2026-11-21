-- 0002 Reference data, money helpers, generic triggers.

-- require_user raises, so it must not be STABLE (plpgsql_check warning from 0001).
create or replace function app.require_user()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform app.raise_error('UNAUTHENTICATED', 401, null, 'Sign in required.');
  end if;
  return v_uid;
end;
$$;

-- ── Generic triggers ────────────────────────────────────────────────────────
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only ledgers: no UPDATE/DELETE, except inside app.purge_sample_data().
create or replace function app.forbid_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.purging_sample', true), '') = 'on' then
    return old;
  end if;
  raise exception using errcode = 'PT409', message = 'LEDGER_IMMUTABLE',
    hint = format('%s.%s is append-only', tg_table_schema, tg_table_name);
end;
$$;

-- Issued tax documents: never updated or deleted.
create or replace function app.forbid_document_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'PT409', message = 'DOCUMENT_IMMUTABLE',
    hint = format('%s.%s rows cannot be changed once issued; use a credit note', tg_table_schema, tg_table_name);
end;
$$;

-- ── Money (integers only) ───────────────────────────────────────────────────
-- Round-half-up integer division (away from zero on .5), valid for negative numerators.
create or replace function app.div_round_half_up(p_num bigint, p_den bigint)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_den <= 0 then
    raise exception using errcode = 'PT500', message = 'INTERNAL', hint = 'denominator must be positive';
  end if;
  if p_num >= 0 then
    return (2 * p_num + p_den) / (2 * p_den);
  end if;
  return -((2 * (-p_num) + p_den) / (2 * p_den));
end;
$$;

-- VAT contained in a VAT-inclusive gross amount: round_half_up(gross × rate / (10000 + rate)).
create or replace function app.vat_from_gross(p_gross_minor bigint, p_rate_bp integer)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_rate_bp < 0 or p_rate_bp > 10000 then
    raise exception using errcode = 'PT500', message = 'INTERNAL', hint = 'rate_bp out of range';
  end if;
  return app.div_round_half_up(p_gross_minor * p_rate_bp, 10000 + p_rate_bp);
end;
$$;

-- Price of a weighed quantity: round_half_up(price_per_kg × grams / 1000).
create or replace function app.weight_price(p_price_per_kg_minor bigint, p_grams bigint)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$ select app.div_round_half_up(p_price_per_kg_minor * p_grams, 1000) $$;

-- Split p_total across p_weights proportionally (largest remainder; ties → lower index).
-- Result sums exactly to p_total. All weights zero → everything on the first element.
create or replace function app.allocate_pro_rata(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  n         integer := coalesce(array_length(p_weights, 1), 0);
  v_sum     numeric := 0;
  v_out     bigint[] := '{}';
  v_rem     numeric[] := '{}';
  v_alloc   bigint := 0;
  v_left    bigint;
  i         integer;
  v_best    integer;
  v_share   numeric;
begin
  if n = 0 then
    return v_out;
  end if;
  for i in 1..n loop
    if p_weights[i] < 0 then
      raise exception using errcode = 'PT500', message = 'INTERNAL', hint = 'negative weight';
    end if;
    v_sum := v_sum + p_weights[i];
  end loop;
  if v_sum = 0 then
    v_out := array_fill(0::bigint, array[n]);
    v_out[1] := p_total;
    return v_out;
  end if;
  for i in 1..n loop
    v_share  := p_total::numeric * p_weights[i] / v_sum;
    v_out[i] := trunc(v_share)::bigint;
    v_rem[i] := abs(v_share - trunc(v_share));
    v_alloc  := v_alloc + v_out[i];
  end loop;
  v_left := p_total - v_alloc;          -- same sign as p_total, |v_left| < n
  while v_left <> 0 loop
    v_best := null;
    for i in 1..n loop
      if p_weights[i] > 0 and (v_best is null or v_rem[i] > v_rem[v_best]) then
        v_best := i;
      end if;
    end loop;
    v_out[v_best] := v_out[v_best] + sign(v_left)::bigint;
    v_rem[v_best] := -1;                 -- each element receives at most one extra unit
    v_left := v_left - sign(v_left)::bigint;
  end loop;
  return v_out;
end;
$$;

create or replace function app.money(p_amount_minor bigint, p_currency text default 'GBP')
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_amount_minor is null then null
              else jsonb_build_object('amount', p_amount_minor, 'currency', p_currency) end
$$;

-- ── Normalisers / validators ────────────────────────────────────────────────
-- UK postcode → "AL10 9AB" (uppercase, single space) or NULL if not a valid format.
create or replace function app.normalise_uk_postcode(p_input text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(regexp_replace(coalesce(p_input, ''), '\s+', '', 'g'));
begin
  if v !~ '^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$' then
    return null;
  end if;
  return left(v, length(v) - 3) || ' ' || right(v, 3);
end;
$$;

-- Phone → E.164. Accepts "+44 7700 900112", "07700 900112" (GB default). NULL if invalid.
create or replace function app.normalise_phone_e164(p_input text, p_default_country text default 'GB')
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_input, ''), '[\s().-]', '', 'g');
begin
  if v = '' then
    return null;
  end if;
  if v like '00%' then
    v := '+' || substr(v, 3);
  elsif v like '0%' and p_default_country = 'GB' then
    v := '+44' || substr(v, 2);
  end if;
  if v !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;
  return v;
end;
$$;

create or replace function app.slugify(p_input text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_input)), '[^a-z0-9]+', '-', 'g'))
$$;

-- ── Reference tables ────────────────────────────────────────────────────────
create table app.countries (
  code      char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name      text    not null,
  currency  char(3) not null check (currency ~ '^[A-Z]{3}$'),
  timezone  text    not null,
  is_active boolean not null default true
);

create table app.locales (
  code       text primary key check (code ~ '^[a-z]{2}-[A-Z]{2}$'),
  name       text    not null,
  is_default boolean not null default false
);
create unique index locales_single_default on app.locales ((true)) where is_default;

create table app.legal_entities (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  company_number     text,
  vat_number         text,
  registered_address jsonb not null default '{}'::jsonb,
  country_code       char(2) not null references app.countries (code),
  invoice_prefix     text not null check (invoice_prefix ~ '^[A-Z0-9-]{2,12}$'),
  credit_note_prefix text not null check (credit_note_prefix ~ '^[A-Z0-9-]{2,12}$'),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (invoice_prefix <> credit_note_prefix)
);
create trigger legal_entities_touch before update on app.legal_entities
  for each row execute function app.touch_updated_at();

-- Gapless numbering: the issuing transaction locks the row (SELECT … FOR UPDATE).
create table app.document_sequences (
  legal_entity_id uuid   not null references app.legal_entities (id),
  doc_type        text   not null check (doc_type in ('invoice', 'credit_note')),
  next_number     bigint not null default 1 check (next_number >= 1),
  primary key (legal_entity_id, doc_type)
);

create table app.tax_categories (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text not null
);

create table app.tax_rates (
  id                uuid primary key default gen_random_uuid(),
  country_code      char(2) not null references app.countries (code),
  tax_category_code text    not null references app.tax_categories (code),
  rate_bp           integer not null check (rate_bp between 0 and 10000),
  valid_from        timestamptz not null,
  valid_to          timestamptz,
  confirmed_by      text,
  confirmed_at      timestamptz,
  note              text,
  created_at        timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  check ((confirmed_by is null) = (confirmed_at is null)),
  constraint tax_rates_no_overlap exclude using gist (
    country_code with =, tax_category_code with =, tstzrange(valid_from, valid_to) with &&)
);
comment on table app.tax_rates is 'Effective-dated VAT rates per country + tax category. Rows with confirmed_by NULL are unconfirmed proposals.';

create or replace function app.tax_rate_bp(p_country char(2), p_category text, p_at timestamptz default now())
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v integer;
begin
  select r.rate_bp into v
  from app.tax_rates r
  where r.country_code = p_country and r.tax_category_code = p_category
    and tstzrange(r.valid_from, r.valid_to) @> p_at;
  if v is null then
    raise exception using errcode = 'PT500', message = 'TAX_RATE_MISSING',
      detail = jsonb_build_object('country', p_country, 'category', p_category)::text;
  end if;
  return v;
end;
$$;

create table app.deposit_schemes (
  code              text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  country_code      char(2) not null references app.countries (code),
  name              text    not null,
  amount_minor      integer not null check (amount_minor > 0),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  tax_category_code text    not null references app.tax_categories (code),
  is_active         boolean not null default false,
  valid_from        timestamptz,
  valid_to          timestamptz,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);

create table app.age_restrictions (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null
);

create table app.age_restriction_rules (
  country_code         char(2)  not null references app.countries (code),
  restriction_code     text     not null references app.age_restrictions (code),
  min_age              smallint not null check (min_age between 1 and 99),
  id_check_on_delivery boolean  not null default true,
  primary key (country_code, restriction_code)
);

-- Stable reference rows (codes the application logic depends on).
insert into app.countries (code, name, currency, timezone) values
  ('GB', 'United Kingdom', 'GBP', 'Europe/London');

insert into app.locales (code, name, is_default) values
  ('en-GB', 'English (United Kingdom)', true);

insert into app.tax_categories (code, name, description) values
  ('zero_rated', 'Zero-rated',    'Most food for human consumption (UK VAT 0 %). Exceptions such as confectionery, crisps/savoury snacks and many drinks are standard-rated.'),
  ('reduced',    'Reduced rate',  'Reduced-rate supplies (UK VAT 5 %).'),
  ('standard',   'Standard rate', 'Non-food and standard-rated food: confectionery, savoury snacks, soft drinks and juices, kitchenware, toiletries, household goods (UK VAT 20 %).');

insert into app.age_restrictions (code, name) values
  ('alcohol', 'Alcohol'),
  ('tobacco', 'Tobacco and nicotine products'),
  ('knives',  'Knives and bladed articles'),
  ('lighter_fuel', 'Lighter refills containing butane'),
  ('solvents', 'Solvents and volatile substances');

insert into app.app_settings (key, value, description) values
  ('currency',                    '"GBP"',              'Store currency (ISO 4217).'),
  ('default_country',             '"GB"',               'Delivery/tax country used when none is given.'),
  ('timezone',                    '"Europe/London"',    'Store timezone for slot display.'),
  ('slot_hold_minutes',           '15',                 'Minutes a delivery slot is held after checkout starts.'),
  ('weighted_auth_buffer_bp',     '1500',               'Extra authorised on weighed items, in basis points (1500 = 15 %).'),
  ('card_auth_validity_hours',    '168',                'How long a card authorisation stays valid (Stripe: ~7 days).'),
  ('authorise_later_after_days',  '6',                  'Slots further ahead than this use save-card-then-authorise-later.'),
  ('delayed_auth_hours_before_slot', '24',              'When to create the off-session authorisation for authorise-later orders.'),
  ('free_delivery_basis',         '"before_discounts"', 'before_discounts | after_discounts — basket value compared with the free-delivery threshold.'),
  ('support_email',               '"support@varamfoods.co.uk"', 'Shown in the storefront footer.'),
  ('support_phone',               '"+441234567890"',    'Shown in the storefront footer (value from the frontend; confirm).')
on conflict (key) do nothing;

select app.harden();
