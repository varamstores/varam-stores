-- 0006 Delivery zones (postcode prefixes), fee rules, slot templates, slots with capacity,
--      slot reservations (holds/bookings), vans, drivers.

create table app.delivery_zones (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  name             text not null,
  display_label    text not null,
  location_id      uuid not null references app.fulfilment_locations (id),
  min_basket_minor integer check (min_basket_minor >= 0),
  currency         char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  is_popular       boolean not null default false,
  popular_position integer,
  is_active        boolean not null default true,
  is_sample        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (not is_popular or popular_position is not null)
);
create trigger delivery_zones_touch before update on app.delivery_zones
  for each row execute function app.touch_updated_at();

-- Longest matching prefix wins: outward code ('AL10') or sector ('AL10 9').
create table app.delivery_zone_postcodes (
  postcode_prefix text primary key check (postcode_prefix ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?( [0-9])?$'),
  zone_id         uuid not null references app.delivery_zones (id) on delete cascade
);
create index delivery_zone_postcodes_zone_idx on app.delivery_zone_postcodes (zone_id);

create or replace function app.zone_for_postcode(p_postcode text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select zp.zone_id
  from app.delivery_zone_postcodes zp
  join app.delivery_zones z on z.id = zp.zone_id and z.is_active
  where app.normalise_uk_postcode(p_postcode) is not null
    and (app.normalise_uk_postcode(p_postcode) = zp.postcode_prefix
         or app.normalise_uk_postcode(p_postcode) like zp.postcode_prefix || ' %'
         or app.normalise_uk_postcode(p_postcode) like zp.postcode_prefix || '%' and zp.postcode_prefix like '% %')
  order by length(zp.postcode_prefix) desc
  limit 1
$$;

create table app.delivery_fee_rules (
  id                uuid primary key default gen_random_uuid(),
  zone_id           uuid    not null references app.delivery_zones (id) on delete cascade,
  from_basket_minor integer not null check (from_basket_minor >= 0),
  fee_minor         integer not null check (fee_minor >= 0),
  valid_from        timestamptz not null default now(),
  valid_to          timestamptz,
  created_at        timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  constraint delivery_fee_rules_no_overlap exclude using gist (
    zone_id with =, from_basket_minor with =, tstzrange(valid_from, valid_to) with &&)
);

-- Weekly templates in local (London) wall-clock time; ISO weekday 1 = Monday … 7 = Sunday.
create table app.slot_templates (
  id                    uuid primary key default gen_random_uuid(),
  zone_id               uuid     not null references app.delivery_zones (id) on delete cascade,
  weekday               smallint not null check (weekday between 1 and 7),
  start_local           time     not null,
  end_local             time     not null,
  capacity              integer  not null check (capacity > 0),
  cutoff_minutes_before integer  not null check (cutoff_minutes_before >= 0),
  service_label         text,
  fee_minor             integer  check (fee_minor >= 0),
  is_active             boolean  not null default true,
  created_at            timestamptz not null default now(),
  check (end_local > start_local),
  unique (zone_id, weekday, start_local)
);

create table app.delivery_slots (
  id             uuid primary key default gen_random_uuid(),
  zone_id        uuid    not null references app.delivery_zones (id),
  template_id    uuid    references app.slot_templates (id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  cutoff_at      timestamptz not null,
  capacity       integer not null check (capacity >= 0),
  reserved_count integer not null default 0,
  service_label  text,
  fee_minor      integer check (fee_minor >= 0),
  status         text    not null default 'open' check (status in ('open', 'closed')),
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  check (cutoff_at <= starts_at),
  constraint slot_capacity_respected check (reserved_count >= 0 and reserved_count <= capacity),
  unique (zone_id, starts_at)
);
comment on column app.delivery_slots.reserved_count is 'Active holds + bookings. Changed only by atomic UPDATE … WHERE reserved_count < capacity.';
create index delivery_slots_zone_time_idx on app.delivery_slots (zone_id, starts_at);

create table app.slot_reservations (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null references app.delivery_slots (id),
  cart_id    uuid,
  order_id   uuid,
  status     text not null check (status in ('held', 'booked', 'released', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'held' or expires_at is not null)
);
create index slot_reservations_active_idx on app.slot_reservations (slot_id) where status in ('held', 'booked');
create index slot_reservations_expiry_idx on app.slot_reservations (expires_at) where status = 'held';
create trigger slot_reservations_touch before update on app.slot_reservations
  for each row execute function app.touch_updated_at();

create table app.vans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^#?[A-Z0-9-]{1,12}$'),
  name            text not null,
  is_refrigerated boolean,
  location_id     uuid references app.fulfilment_locations (id),
  is_active       boolean not null default true,
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now()
);

create table app.drivers (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  phone_e164   text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  staff_id     uuid references app.staff (id) on delete set null,
  is_active    boolean not null default true,
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now()
);

select app.harden();
