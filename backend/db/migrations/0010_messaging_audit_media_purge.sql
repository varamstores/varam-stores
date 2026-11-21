-- 0010 Message templates + outbox, audit log, rate limits, media (Supabase Storage),
--      sample-data purge.

create table app.message_templates (
  code         text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  channel      text not null check (channel in ('email', 'sms', 'whatsapp')),
  locale       text not null references app.locales (code),
  name         text not null,
  is_marketing boolean not null default false,
  subject      text,
  body         text not null,
  updated_at   timestamptz not null default now(),
  primary key (code, channel, locale),
  check (channel <> 'email' or subject is not null)
);
create trigger message_templates_touch before update on app.message_templates
  for each row execute function app.touch_updated_at();

-- Outbox: every outbound email/SMS/WhatsApp is queued here; a job delivers it once a
-- provider is configured. Until then rows stay 'queued' and are visible in admin.
create table app.outbound_messages (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references app.customers (id) on delete set null,
  order_id      uuid references app.orders (id) on delete cascade,
  channel       text not null check (channel in ('email', 'sms', 'whatsapp')),
  template_code text,
  to_address    text not null,
  subject       text,
  body          text not null,
  is_marketing  boolean not null default false,
  status        text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'suppressed')),
  attempts      integer not null default 0 check (attempts >= 0),
  provider_ref  text,
  sent_by       uuid references app.staff (id),
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index outbound_messages_queue_idx on app.outbound_messages (created_at) where status = 'queued';

create table app.audit_log (
  id          bigint generated always as identity primary key,
  actor_type  text not null check (actor_type in ('customer', 'staff', 'system', 'seed')),
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  changes     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on app.audit_log (entity_type, entity_id, created_at desc);
create trigger audit_log_append_only before update or delete on app.audit_log
  for each row execute function app.forbid_ledger_change();

-- Record an action by the current caller. p_changes must not contain personal data.
create or replace function app.audit(p_action text, p_entity_type text, p_entity_id text, p_changes jsonb default '{}'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_staff uuid := app.current_staff_id();
begin
  insert into app.audit_log (actor_type, actor_id, action, entity_type, entity_id, changes)
  values (case when v_staff is not null then 'staff' when auth.uid() is not null then 'customer' else 'system' end,
          coalesce(v_staff, auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_changes, '{}'::jsonb));
end;
$$;

create table app.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

-- Raises RATE_LIMITED (429) once p_bucket exceeds p_limit hits in the current window.
create or replace function app.rate_limit(p_bucket text, p_limit integer, p_window interval)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  v_hits  integer;
begin
  insert into app.rate_limits as rl (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;
  if v_hits > p_limit then
    perform app.raise_error('RATE_LIMITED', 429,
      jsonb_build_object('retryAfterSeconds', ceil(extract(epoch from (v_start + p_window - now())))::int),
      'Too many attempts. Please wait and try again.');
  end if;
end;
$$;

-- ── Media in Supabase Storage ───────────────────────────────────────────────
-- Public-read bucket for storefront images (uploads only via the service key / staff policies).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storefront', 'storefront', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif', 'image/avif',
              'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- One row per uploaded file; source_path = original frontend path ('/product-tomatoes.jpg').
create table app.media_assets (
  object_path  text primary key check (object_path !~ '^/' and object_path !~ '\.\.'),
  bucket       text not null default 'storefront',
  source_path  text not null unique check (source_path ~ '^/'),
  content_type text not null,
  bytes        integer not null check (bytes > 0),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_at  timestamptz not null default now()
);

-- Catalogue columns store storage object paths ('product-tomatoes.jpg'); this builds the URL.
-- Absolute http(s) URLs pass through unchanged.
create or replace function app.media_url(p_ref text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_ref is null or p_ref = '' then null
    when p_ref ~ '^https?://' then p_ref
    else (select s.value #>> '{}' from app.app_settings s where s.key = 'media_base_url') || ltrim(p_ref, '/')
  end
$$;

-- ── Sample data purge ───────────────────────────────────────────────────────
-- Removes every row seeded as sample (people, orders, reviews, fleet, sample stock).
-- Fails (and changes nothing) if live data references a sample row.
create or replace function app.purge_sample_data()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  n integer;
begin
  perform set_config('app.purging_sample', 'on', true);

  delete from app.reviews where is_sample;                                   get diagnostics n = row_count; v := v || jsonb_build_object('reviews', n);
  delete from app.loyalty_transactions lt
   where lt.customer_id in (select id from app.customers where is_sample)
      or lt.order_id in (select id from app.orders where is_sample);         get diagnostics n = row_count; v := v || jsonb_build_object('loyalty_transactions', n);
  delete from app.orders where is_sample;                                    get diagnostics n = row_count; v := v || jsonb_build_object('orders', n);
  delete from app.delivery_slots where is_sample;                            get diagnostics n = row_count; v := v || jsonb_build_object('delivery_slots', n);
  delete from app.customers where is_sample;                                 get diagnostics n = row_count; v := v || jsonb_build_object('customers', n);
  delete from app.drivers where is_sample;                                   get diagnostics n = row_count; v := v || jsonb_build_object('drivers', n);
  delete from app.vans where is_sample;                                      get diagnostics n = row_count; v := v || jsonb_build_object('vans', n);
  delete from app.staff where is_sample;                                     get diagnostics n = row_count; v := v || jsonb_build_object('staff', n);
  delete from app.stock_movements sm using app.stock_levels sl
   where sl.is_sample and sm.location_id = sl.location_id and sm.product_id = sl.product_id
     and sm.reason = 'seed';                                                 get diagnostics n = row_count; v := v || jsonb_build_object('stock_movements', n);
  delete from app.stock_levels where is_sample;                              get diagnostics n = row_count; v := v || jsonb_build_object('stock_levels', n);
  delete from app.purchase_orders where is_sample;                           get diagnostics n = row_count; v := v || jsonb_build_object('purchase_orders', n);

  perform set_config('app.purging_sample', 'off', true);
  return v;
end;
$$;

select app.harden();
