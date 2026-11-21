-- 0004 Fulfilment locations, stock (never oversell), stock ledger, CSV imports,
--      suppliers, purchase orders.

create table app.fulfilment_locations (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  name       text not null,
  type       text not null check (type in ('store', 'warehouse', 'dark_store')),
  address    jsonb not null default '{}'::jsonb,
  postcode   text,
  timezone   text not null default 'Europe/London',
  is_active  boolean not null default true,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger fulfilment_locations_touch before update on app.fulfilment_locations
  for each row execute function app.touch_updated_at();

-- Quantities: pieces for sale_unit 'each', grams for sale_unit 'weight'.
create table app.stock_levels (
  location_id       uuid    not null references app.fulfilment_locations (id),
  product_id        uuid    not null references app.products (id),
  on_hand           integer not null default 0 check (on_hand >= 0),
  reserved          integer not null default 0 check (reserved >= 0),
  reorder_point     integer not null default 0 check (reorder_point >= 0),
  optimal_stock     integer check (optimal_stock >= 0),
  unit_cost_minor   integer check (unit_cost_minor >= 0),
  last_restocked_at timestamptz,
  is_sample         boolean not null default false,
  updated_at        timestamptz not null default now(),
  primary key (location_id, product_id),
  constraint stock_never_oversold check (reserved <= on_hand)
);
comment on constraint stock_never_oversold on app.stock_levels is 'Reservations can never exceed physical stock.';
create index stock_levels_product_idx on app.stock_levels (product_id);
create trigger stock_levels_touch before update on app.stock_levels
  for each row execute function app.touch_updated_at();

create table app.stock_movements (
  id            bigint generated always as identity primary key,
  location_id   uuid    not null references app.fulfilment_locations (id),
  product_id    uuid    not null references app.products (id),
  delta         integer not null check (delta <> 0),
  reason        text    not null check (reason in ('csv_import', 'adjustment', 'restock', 'po_receipt',
                                                   'order_reserve', 'order_release', 'pick', 'return',
                                                   'write_off', 'seed')),
  affects       text    not null default 'on_hand' check (affects in ('on_hand', 'reserved')),
  ref_type      text,
  ref_id        uuid,
  actor_user_id uuid,
  note          text,
  created_at    timestamptz not null default now()
);
create index stock_movements_product_idx on app.stock_movements (product_id, created_at desc);
create trigger stock_movements_append_only before update or delete on app.stock_movements
  for each row execute function app.forbid_ledger_change();

create table app.stock_imports (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references app.fulfilment_locations (id),
  file_name    text not null,
  uploaded_by  uuid,
  status       text not null check (status in ('applied', 'rejected')),
  rows_total   integer not null check (rows_total >= 0),
  rows_applied integer not null check (rows_applied >= 0),
  errors       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  check (rows_applied <= rows_total)
);

create table app.suppliers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^SUP-[0-9]{2,}$'),
  name           text not null,
  category       text,
  lead_time_days integer check (lead_time_days >= 0),
  contact_person text,
  email          text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone_e164     text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  rating         numeric(2, 1) check (rating between 0 and 5),
  contacts_verified boolean not null default false,
  is_active      boolean not null default true,
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on column app.suppliers.contacts_verified is 'false until a person confirms the email/phone; purchase orders are never emailed to unverified contacts.';
create trigger suppliers_touch before update on app.suppliers
  for each row execute function app.touch_updated_at();

create table app.product_suppliers (
  product_id      uuid not null references app.products (id) on delete cascade,
  supplier_id     uuid not null references app.suppliers (id) on delete cascade,
  supplier_sku    text,
  unit_cost_minor integer check (unit_cost_minor >= 0),
  is_primary      boolean not null default false,
  primary key (product_id, supplier_id)
);
create unique index product_suppliers_one_primary on app.product_suppliers (product_id) where is_primary;

create sequence app.purchase_order_number_seq start 1;

create table app.purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique default ('PO-' || lpad(nextval('app.purchase_order_number_seq')::text, 5, '0')),
  supplier_id  uuid not null references app.suppliers (id),
  location_id  uuid not null references app.fulfilment_locations (id),
  status       text not null default 'draft'
               check (status in ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  expected_at  timestamptz,
  notes        text,
  currency     char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  created_by   uuid,
  sent_at      timestamptz,
  received_at  timestamptz,
  cancelled_at timestamptz,
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger purchase_orders_touch before update on app.purchase_orders
  for each row execute function app.touch_updated_at();

create table app.purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid    not null references app.purchase_orders (id) on delete cascade,
  product_id        uuid    not null references app.products (id),
  quantity_ordered  integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost_minor   integer not null check (unit_cost_minor >= 0),
  unique (purchase_order_id, product_id),
  check (quantity_received <= quantity_ordered)
);

select app.harden();
