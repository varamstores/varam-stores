-- 0005 Customers, addresses, preferences, payment-method tokens, wishlist, consent ledger,
--      newsletter, roles/permissions, staff, invitations, permission helpers.
-- Login identity = Supabase Auth (auth.users). user_id is nullable: sample people have no
-- login, and an anonymised customer keeps their row with user_id = NULL.

create table app.customers (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid unique references auth.users (id) on delete set null,
  email                text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name           text check (length(first_name) <= 80),
  last_name            text check (length(last_name) <= 80),
  phone_e164           text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status               text not null default 'active' check (status in ('active', 'vip', 'flagged')),
  internal_notes       text,
  payment_customer_ref text unique,
  member_since         timestamptz not null default now(),
  anonymised_at        timestamptz,
  is_sample            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (anonymised_at is not null or (email is not null and first_name is not null and last_name is not null))
);
create unique index customers_email_live on app.customers (email) where anonymised_at is null;
create trigger customers_touch before update on app.customers
  for each row execute function app.touch_updated_at();

create table app.customer_preferences (
  customer_id          uuid primary key references app.customers (id) on delete cascade,
  substitution_default text    not null default 'allow' check (substitution_default in ('allow', 'dont_allow')),
  ripeness             text    not null default 'ready' check (ripeness in ('ready', 'shelf_life')),
  sms_delivery_alerts  boolean not null default true,
  email_invoices       boolean not null default true,
  doorstep_bell        boolean not null default true,
  eco_packaging        boolean not null default true,
  updated_at           timestamptz not null default now()
);
create trigger customer_preferences_touch before update on app.customer_preferences
  for each row execute function app.touch_updated_at();

create table app.addresses (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references app.customers (id) on delete cascade,
  label          text not null default 'Home' check (length(label) between 1 and 40),
  full_name      text not null check (length(full_name) between 1 and 120),
  line1          text not null check (length(line1) between 1 and 120),
  line2          text check (length(line2) <= 120),
  city           text not null check (length(city) between 1 and 80),
  postcode       text not null,
  country_code   char(2) not null default 'GB' references app.countries (code),
  phone_e164     text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  delivery_notes text check (length(delivery_notes) <= 500),
  is_default     boolean not null default false,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (country_code <> 'GB' or postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$')
);
create unique index addresses_one_default on app.addresses (customer_id) where is_default and deleted_at is null;
create index addresses_customer_idx on app.addresses (customer_id) where deleted_at is null;
create trigger addresses_touch before update on app.addresses
  for each row execute function app.touch_updated_at();

-- Provider tokens only. Never card numbers.
create table app.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references app.customers (id) on delete cascade,
  provider     text not null check (provider in ('stripe')),
  provider_ref text not null unique,
  brand        text,
  last4        text check (last4 ~ '^[0-9]{4}$'),
  exp_month    smallint check (exp_month between 1 and 12),
  exp_year     smallint check (exp_year between 2000 and 2100),
  wallet       text check (wallet in ('apple_pay', 'google_pay')),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  detached_at  timestamptz
);
create unique index payment_methods_one_default on app.payment_methods (customer_id) where is_default and detached_at is null;

create table app.wishlist_items (
  customer_id uuid not null references app.customers (id) on delete cascade,
  product_id  uuid not null references app.products (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, product_id)
);

-- Consent ledger (append-only). Current state = latest row per (subject, purpose).
create table app.consents (
  id               bigint generated always as identity primary key,
  customer_id      uuid references app.customers (id) on delete cascade,
  email            text check (email = lower(email)),
  purpose          text not null check (purpose in ('terms', 'privacy', 'marketing_email', 'marketing_sms', 'marketing_whatsapp')),
  granted          boolean not null,
  document_version text,
  source           text not null check (source in ('register', 'checkout', 'account', 'newsletter_footer', 'newsletter_home', 'admin', 'seed')),
  created_at       timestamptz not null default now(),
  check (customer_id is not null or email is not null),
  check (purpose not in ('terms', 'privacy') or document_version is not null)
);
create index consents_customer_idx on app.consents (customer_id, purpose, created_at desc);
create trigger consents_append_only before update or delete on app.consents
  for each row execute function app.forbid_ledger_change();

create table app.newsletter_subscribers (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status                 text not null default 'pending' check (status in ('pending', 'subscribed', 'unsubscribed')),
  source                 text not null check (source in ('footer', 'home_section', 'account', 'checkout')),
  confirm_token_hash     text,
  unsubscribe_token_hash text,
  confirmed_at           timestamptz,
  unsubscribed_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (status <> 'subscribed' or confirmed_at is not null)
);
create trigger newsletter_subscribers_touch before update on app.newsletter_subscribers
  for each row execute function app.touch_updated_at();

-- ── Staff, roles, permissions ───────────────────────────────────────────────
create table app.roles (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text not null,
  position    smallint not null unique
);

create table app.permissions (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  description text not null
);

create table app.role_permissions (
  role_code       text not null references app.roles (code) on delete cascade,
  permission_code text not null references app.permissions (code) on delete cascade,
  primary key (role_code, permission_code)
);

insert into app.roles (code, name, description, position) values
  ('store_manager',    'Store Manager',    'Super administrator: everything, including finance and staff.', 1),
  ('dispatch_lead',    'Dispatch Lead',    'Fleet, van routing, dispatch and order status.', 2),
  ('warehouse_picker', 'Warehouse Picker', 'Packing queue, picking, stock look-up.', 3),
  ('customer_support', 'Customer Support', 'Customer messaging, order status, refund requests.', 4);

insert into app.permissions (code, description) values
  ('full_access',        'Implies every permission.'),
  ('financials',         'Analytics, refunds approval, tax rates, invoices, loyalty adjustments.'),
  ('user_management',    'Invite, change and deactivate staff.'),
  ('pricing',            'Prices and promotions.'),
  ('inventory',          'Catalogue, stock, suppliers, purchase orders (implies inventory_read).'),
  ('inventory_read',     'View catalogue and stock.'),
  ('orders_dispatch',    'Dispatch orders and record delivery.'),
  ('fleet_management',   'Vans, drivers, delivery zones and slots; assign orders.'),
  ('courier_routing',    'Route planning.'),
  ('driver_chat',        'Driver messaging.'),
  ('barcode_picking',    'Record picked quantities, weights and substitutions.'),
  ('packing_queue',      'Picking queue, start/complete picking, packing slips.'),
  ('customer_messaging', 'Customer list, messages, review moderation, newsletter list.'),
  ('order_status',       'View orders and move them through allowed status changes.'),
  ('refund_requests',    'Raise refund requests (approval needs financials).');

insert into app.role_permissions (role_code, permission_code) values
  ('store_manager', 'full_access'), ('store_manager', 'financials'), ('store_manager', 'user_management'),
  ('store_manager', 'pricing'), ('store_manager', 'inventory'),
  ('dispatch_lead', 'orders_dispatch'), ('dispatch_lead', 'fleet_management'), ('dispatch_lead', 'courier_routing'),
  ('dispatch_lead', 'driver_chat'), ('dispatch_lead', 'order_status'),
  ('warehouse_picker', 'inventory_read'), ('warehouse_picker', 'barcode_picking'), ('warehouse_picker', 'packing_queue'),
  ('customer_support', 'customer_messaging'), ('customer_support', 'order_status'), ('customer_support', 'refund_requests');

create table app.staff (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users (id) on delete set null,
  email          text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name      text not null check (length(full_name) between 1 and 120),
  role_code      text not null references app.roles (code),
  status         text not null default 'active' check (status in ('active', 'on_break', 'offline', 'deactivated')),
  last_active_at timestamptz,
  invited_by     uuid references app.staff (id),
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index staff_email_unique on app.staff (email);
create trigger staff_touch before update on app.staff
  for each row execute function app.touch_updated_at();

create table app.staff_invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email)),
  full_name    text not null,
  role_code    text not null references app.roles (code),
  invited_by   uuid references app.staff (id),
  auth_user_id uuid,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
create unique index staff_invitations_one_pending on app.staff_invitations (email) where status = 'pending';

-- ── Permission helpers ──────────────────────────────────────────────────────
create or replace function app.current_staff_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.id from app.staff s
  where s.user_id = auth.uid() and s.user_id is not null and s.status <> 'deactivated'
$$;

create or replace function app.has_permission(p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from app.staff s
    join app.role_permissions rp on rp.role_code = s.role_code
    where s.user_id = auth.uid()
      and s.user_id is not null
      and s.status <> 'deactivated'
      and (rp.permission_code = p_permission
           or rp.permission_code = 'full_access'
           or (p_permission = 'inventory_read' and rp.permission_code = 'inventory'))
  )
$$;

-- Returns the caller's staff id, or raises 401 (not signed in) / 403 (not allowed).
create or replace function app.require_permission(p_permission text)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_staff uuid;
begin
  perform app.require_user();
  v_staff := app.current_staff_id();
  if v_staff is null or not app.has_permission(p_permission) then
    perform app.raise_error('FORBIDDEN', 403, jsonb_build_object('permission', p_permission), 'You do not have permission to do this.');
  end if;
  return v_staff;
end;
$$;

create or replace function app.current_customer_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select c.id from app.customers c
  where c.user_id = auth.uid() and c.user_id is not null and c.anonymised_at is null
$$;

select app.harden();
