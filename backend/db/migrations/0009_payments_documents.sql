-- 0009 Payments (Stripe, called from Postgres), refund requests + refunds, payment sync log,
--      invoices and credit notes (gapless numbers, immutable).

create table app.payments (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references app.orders (id) on delete cascade,
  provider                text not null check (provider in ('stripe', 'sample')),
  provider_intent_ref     text unique,
  kind                    text not null check (kind in ('authorise_now', 'authorise_later')),
  status                  text not null check (status in ('requires_action', 'authorised', 'captured',
                                                          'partially_captured', 'voided', 'failed', 'expired')),
  amount_authorised_minor integer not null default 0 check (amount_authorised_minor >= 0),
  amount_captured_minor   integer check (amount_captured_minor >= 0),
  currency                char(3) not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  payment_method_snapshot jsonb not null default '{}'::jsonb,
  setup_intent_ref        text,
  authorised_at           timestamptz,
  auth_expires_at         timestamptz,
  captured_at             timestamptz,
  failure_code            text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint payments_never_overcapture check (amount_captured_minor is null or amount_captured_minor <= amount_authorised_minor),
  check (provider = 'sample' or provider_intent_ref is not null or setup_intent_ref is not null)
);
create index payments_order_idx on app.payments (order_id);
create trigger payments_touch before update on app.payments
  for each row execute function app.touch_updated_at();

-- Every Stripe call and verification from Postgres (no personal data, no secrets).
create table app.payment_sync_log (
  id               bigint generated always as identity primary key,
  order_id         uuid references app.orders (id) on delete cascade,
  payment_id       uuid references app.payments (id) on delete cascade,
  operation        text not null,
  http_status      integer,
  stripe_object_id text,
  outcome          text not null check (outcome in ('ok', 'mismatch', 'error', 'pending')),
  error_code       text,
  created_at       timestamptz not null default now()
);
create index payment_sync_log_order_idx on app.payment_sync_log (order_id, created_at desc);

create table app.refund_requests (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references app.orders (id) on delete cascade,
  requested_by uuid references app.staff (id),
  lines        jsonb,
  amount_minor integer check (amount_minor > 0),
  reason       text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'processed', 'failed')),
  approved_by  uuid references app.staff (id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  check ((lines is null) <> (amount_minor is null))
);

create table app.invoices (
  id              uuid primary key default gen_random_uuid(),
  legal_entity_id uuid    not null references app.legal_entities (id),
  number          text    not null,
  order_id        uuid    not null unique references app.orders (id),
  issued_at       timestamptz not null default now(),
  currency        char(3) not null check (currency ~ '^[A-Z]{3}$'),
  seller_snapshot jsonb   not null,
  buyer_snapshot  jsonb   not null,
  net_minor       integer not null check (net_minor >= 0),
  vat_minor       integer not null check (vat_minor >= 0),
  gross_minor     integer not null check (gross_minor >= 0),
  vat_breakdown   jsonb   not null,
  unique (legal_entity_id, number),
  check (net_minor + vat_minor = gross_minor)
);

create table app.invoice_lines (
  invoice_id       uuid     not null references app.invoices (id),
  line_no          smallint not null check (line_no >= 1),
  description      text     not null,
  quantity         numeric(12, 3) not null check (quantity > 0),
  unit_price_minor integer  not null check (unit_price_minor >= 0),
  vat_rate_bp      integer  not null check (vat_rate_bp between 0 and 10000),
  net_minor        integer  not null check (net_minor >= 0),
  vat_minor        integer  not null check (vat_minor >= 0),
  gross_minor      integer  not null check (gross_minor >= 0),
  primary key (invoice_id, line_no),
  check (net_minor + vat_minor = gross_minor)
);

create table app.refunds (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid    not null references app.payments (id),
  refund_request_id   uuid    references app.refund_requests (id),
  provider_refund_ref text    unique,
  amount_minor        integer not null check (amount_minor > 0),
  status              text    not null check (status in ('pending', 'succeeded', 'failed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger refunds_touch before update on app.refunds
  for each row execute function app.touch_updated_at();

create table app.credit_notes (
  id              uuid primary key default gen_random_uuid(),
  legal_entity_id uuid    not null references app.legal_entities (id),
  number          text    not null,
  invoice_id      uuid    not null references app.invoices (id),
  refund_id       uuid    references app.refunds (id),
  issued_at       timestamptz not null default now(),
  reason          text    not null,
  currency        char(3) not null check (currency ~ '^[A-Z]{3}$'),
  net_minor       integer not null check (net_minor >= 0),
  vat_minor       integer not null check (vat_minor >= 0),
  gross_minor     integer not null check (gross_minor > 0),
  vat_breakdown   jsonb   not null,
  unique (legal_entity_id, number),
  check (net_minor + vat_minor = gross_minor)
);

create table app.credit_note_lines (
  credit_note_id   uuid     not null references app.credit_notes (id),
  line_no          smallint not null check (line_no >= 1),
  invoice_line_no  smallint,
  description      text     not null,
  quantity         numeric(12, 3) not null check (quantity > 0),
  unit_price_minor integer  not null check (unit_price_minor >= 0),
  vat_rate_bp      integer  not null check (vat_rate_bp between 0 and 10000),
  net_minor        integer  not null check (net_minor >= 0),
  vat_minor        integer  not null check (vat_minor >= 0),
  gross_minor      integer  not null check (gross_minor >= 0),
  primary key (credit_note_id, line_no),
  check (net_minor + vat_minor = gross_minor)
);

create trigger invoices_immutable          before update or delete on app.invoices          for each row execute function app.forbid_document_change();
create trigger invoice_lines_immutable     before update or delete on app.invoice_lines     for each row execute function app.forbid_document_change();
create trigger credit_notes_immutable      before update or delete on app.credit_notes      for each row execute function app.forbid_document_change();
create trigger credit_note_lines_immutable before update or delete on app.credit_note_lines for each row execute function app.forbid_document_change();

-- Next gapless number for (entity, doc type). Must run inside the issuing transaction.
create or replace function app.next_document_number(p_legal_entity_id uuid, p_doc_type text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_next   bigint;
  v_prefix text;
begin
  select ds.next_number into v_next
  from app.document_sequences ds
  where ds.legal_entity_id = p_legal_entity_id and ds.doc_type = p_doc_type
  for update;
  if v_next is null then
    insert into app.document_sequences (legal_entity_id, doc_type, next_number)
    values (p_legal_entity_id, p_doc_type, 1)
    on conflict (legal_entity_id, doc_type) do nothing;
    select ds.next_number into v_next
    from app.document_sequences ds
    where ds.legal_entity_id = p_legal_entity_id and ds.doc_type = p_doc_type
    for update;
  end if;
  update app.document_sequences ds set next_number = v_next + 1
  where ds.legal_entity_id = p_legal_entity_id and ds.doc_type = p_doc_type;

  select case p_doc_type when 'invoice' then le.invoice_prefix else le.credit_note_prefix end
    into v_prefix
  from app.legal_entities le where le.id = p_legal_entity_id;
  if v_prefix is null then
    raise exception using errcode = 'PT500', message = 'INTERNAL', hint = 'unknown legal entity';
  end if;
  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

select app.harden();
