-- 0017 Accounts (Phase 4): sign-up completion, session context, profile, preferences, consents,
--      addresses, wishlist, newsletter (double opt-in), GDPR export/delete, review summary.
--
-- Sign-up, sign-in, password reset and email verification are Supabase Auth itself (called by the
-- browser). Right after a new user's first sign-in the browser calls api.complete_signup(), which
-- creates the customer profile and records Terms acceptance and marketing consent separately.

insert into app.app_settings (key, value, description) values
  ('site_url', '"http://localhost:5173"', 'Public address of the shop, used in links inside emails (confirm newsletter, order pages).'),
  ('terms_version', '"2026-11-22"', 'Version of the Terms & Conditions shoppers accept at sign-up. Change it when the terms change.'),
  ('privacy_version', '"2026-11-22"', 'Version of the Privacy Policy shown at sign-up.'),
  ('newsletter_welcome_code', '"FRESH20"', 'Promo code sent in the newsletter welcome email after the subscriber confirms. Leave empty to send none.')
on conflict (key) do nothing;

-- Email templates for this phase (editable in the admin under Messaging → Templates).
-- Placeholders: {{name}} style, filled by app.render_template().
insert into app.message_templates (code, channel, locale, name, is_marketing, subject, body) values
  ('newsletter_confirm', 'email', 'en-GB', 'Newsletter: confirm your email', false,
   'Please confirm your subscription',
   E'Hello,\n\nPlease confirm you would like Varam Foods offers and news by opening this link:\n{{confirm_url}}\n\nIf you did not ask for this, ignore this email and nothing will happen.\n\nVaram Foods'),
  ('newsletter_welcome', 'email', 'en-GB', 'Newsletter: welcome', true,
   'Welcome to Varam Foods',
   E'Thanks for confirming!\n\n{{code_line}}\n\nYou can unsubscribe at any time: {{unsubscribe_url}}\n\nVaram Foods')
on conflict (code, channel, locale) do nothing;

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────────
-- Fills {{placeholders}} in a template. Unknown placeholders are left as they are.
create or replace function app.render_template(p_code text, p_channel text, p_vars jsonb, p_locale text default null,
                                               out subject text, out body text, out is_marketing boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  t   app.message_templates;
  k   text;
  v   text;
begin
  select * into t from app.message_templates m
   where m.code = p_code and m.channel = p_channel
   order by (m.locale = coalesce(p_locale, 'en-GB')) desc, (m.locale = 'en-GB') desc
   limit 1;
  if t.code is null then
    perform app.raise_error('INTERNAL', 500, jsonb_build_object('template', p_code), 'Message template missing.');
  end if;
  subject := t.subject;
  body := t.body;
  is_marketing := t.is_marketing;
  for k, v in select * from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    subject := replace(subject, '{{' || k || '}}', coalesce(v, ''));
    body := replace(body, '{{' || k || '}}', coalesce(v, ''));
  end loop;
end;
$$;

-- Queues an email/SMS in the outbox (sent by the outbox job once a provider is configured).
create or replace function app.queue_message(p_code text, p_channel text, p_to text, p_vars jsonb,
                                             p_customer_id uuid default null, p_order_id uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  r    record;
  v_id uuid;
begin
  select * into r from app.render_template(p_code, p_channel, p_vars);
  insert into app.outbound_messages (customer_id, order_id, channel, template_code, to_address, subject, body, is_marketing)
  values (p_customer_id, p_order_id, p_channel, p_code, p_to, r.subject, r.body, r.is_marketing)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.new_token(out token text, out token_hash text)
language plpgsql
volatile
set search_path = ''
as $$
begin
  token := encode(extensions.gen_random_bytes(24), 'hex');
  token_hash := encode(sha256(convert_to(token, 'UTF8')), 'hex');
end;
$$;

create or replace function app.require_customer()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v uuid;
begin
  perform app.require_user();
  v := app.current_customer_id();
  if v is null then
    perform app.raise_error('PROFILE_REQUIRED', 409, null, 'Please finish setting up your account.');
  end if;
  return v;
end;
$$;

create or replace function app.address_json(a app.addresses)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'label', a.label, 'fullName', a.full_name, 'line1', a.line1, 'line2', a.line2, 'city', a.city,
    'postcode', a.postcode, 'countryCode', a.country_code, 'phone', a.phone_e164, 'deliveryNotes', a.delivery_notes,
    'isDefault', a.is_default,
    'zone', (select jsonb_build_object('code', z.code, 'name', z.name, 'label', z.display_label)
               from app.delivery_zones z where z.id = app.zone_for_postcode(a.postcode)),
    'deliverable', app.zone_for_postcode(a.postcode) is not null)
$$;

create or replace function app.customer_json(c app.customers)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'firstName', c.first_name, 'lastName', c.last_name, 'email', c.email,
    'phone', c.phone_e164, 'status', c.status, 'memberSince', c.member_since)
$$;

-- Latest decision per consent purpose.
create or replace function app.consent_state(p_customer_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.purpose, jsonb_build_object('granted', x.granted, 'at', x.created_at, 'version', x.document_version)), '{}'::jsonb)
  from (select distinct on (c.purpose) c.purpose, c.granted, c.created_at, c.document_version
          from app.consents c where c.customer_id = p_customer_id
         order by c.purpose, c.created_at desc, c.id desc) x
$$;

-- ── session ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.get_session_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := app.require_user();
  v_user  record;
  v_cust  app.customers;
  v_staff record;
begin
  select u.email, u.email_confirmed_at, u.raw_user_meta_data into v_user from auth.users u where u.id = v_uid;
  select * into v_cust from app.customers c where c.user_id = v_uid and c.anonymised_at is null;
  select s.id, s.full_name, s.email, s.status, s.role_code, r.name as role_name,
         case when exists (select 1 from app.role_permissions rp where rp.role_code = s.role_code and rp.permission_code = 'full_access')
              then (select coalesce(jsonb_agg(p.code order by p.code), '[]'::jsonb) from app.permissions p)
              else (select coalesce(jsonb_agg(rp.permission_code order by rp.permission_code), '[]'::jsonb)
                      from app.role_permissions rp where rp.role_code = s.role_code) end as permissions
    into v_staff
    from app.staff s join app.roles r on r.code = s.role_code
   where s.user_id = v_uid and s.status <> 'deactivated';
  return jsonb_build_object(
    'userId', v_uid,
    'email', v_user.email,
    'emailConfirmed', v_user.email_confirmed_at is not null,
    'kind', case when v_cust.id is not null and v_staff.id is not null then 'both'
                 when v_staff.id is not null then 'staff'
                 when v_cust.id is not null then 'customer' else 'new' end,
    'needsProfile', v_cust.id is null and v_staff.id is null,
    'signupMetadata', coalesce(v_user.raw_user_meta_data, '{}'::jsonb) - 'sub' - 'email' - 'email_verified' - 'phone_verified',
    'customer', case when v_cust.id is not null then app.customer_json(v_cust) end,
    'staff', case when v_staff.id is not null then jsonb_build_object(
      'id', v_staff.id, 'fullName', v_staff.full_name, 'email', v_staff.email, 'status', v_staff.status,
      'role', v_staff.role_code, 'roleName', v_staff.role_name, 'permissions', v_staff.permissions) end,
    'termsVersion', app.setting('terms_version') #>> '{}',
    'privacyVersion', app.setting('privacy_version') #>> '{}');
end;
$$;
comment on function api.get_session_context() is '@access authenticated Who is signed in: customer profile and/or staff role and permissions. Drives account and admin access.';

create or replace function api.complete_signup(p_first_name text, p_last_name text, p_accept_terms boolean, p_terms_version text,
                                               p_marketing_email boolean default false, p_marketing_sms boolean default false,
                                               p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := app.require_user();
  v_email text;
  v_phone text;
  v_cust  app.customers;
  v_terms text := app.setting('terms_version') #>> '{}';
begin
  if not coalesce(p_accept_terms, false) or p_terms_version is distinct from v_terms then
    perform app.raise_error('TERMS_NOT_ACCEPTED', 400, jsonb_build_object('termsVersion', v_terms), 'Please accept the current terms.');
  end if;
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('firstName', 'lastName')), 'Name required.');
  end if;
  if p_phone is not null and trim(p_phone) <> '' then
    v_phone := app.normalise_phone_e164(p_phone, 'GB');
    if v_phone is null then perform app.raise_error('PHONE_INVALID', 400, null, 'Invalid phone number.'); end if;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  select * into v_cust from app.customers c where c.user_id = v_uid;
  if v_cust.id is not null then
    return api.get_session_context();   -- already done (e.g. a second tab): nothing to change
  end if;
  -- An anonymised customer can never be reused; a live profile with the same email belongs to someone else.
  if exists (select 1 from app.customers c where c.email = v_email and c.anonymised_at is null) then
    perform app.raise_error('CONFLICT', 409, null, 'An account with this email already exists.');
  end if;
  insert into app.customers (user_id, email, first_name, last_name, phone_e164)
  values (v_uid, v_email, left(trim(p_first_name), 80), left(trim(p_last_name), 80), v_phone)
  returning * into v_cust;
  insert into app.customer_preferences (customer_id) values (v_cust.id);
  insert into app.loyalty_accounts (customer_id, tier_code)
  values (v_cust.id, (select t.code from app.loyalty_tiers t order by t.min_lifetime_points limit 1));
  insert into app.consents (customer_id, email, purpose, granted, document_version, source) values
    (v_cust.id, v_email, 'terms', true, v_terms, 'register'),
    (v_cust.id, v_email, 'privacy', true, app.setting('privacy_version') #>> '{}', 'register'),
    (v_cust.id, v_email, 'marketing_email', coalesce(p_marketing_email, false), null, 'register'),
    (v_cust.id, v_email, 'marketing_sms', coalesce(p_marketing_sms, false), null, 'register');
  perform app.audit('customer.signup', 'customer', v_cust.id::text, jsonb_build_object('marketingEmail', p_marketing_email, 'marketingSms', p_marketing_sms));
  return api.get_session_context();
end;
$$;
comment on function api.complete_signup(text, text, boolean, text, boolean, boolean, text) is '@access authenticated Create the customer profile after the first sign-in. Records Terms acceptance and marketing consent separately, timestamped.';

-- ── profile & preferences ───────────────────────────────────────────────────────────────────────
create or replace function api.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app.customer_json(c) || jsonb_build_object('consents', app.consent_state(c.id))
  from app.customers c where c.id = app.require_customer()
$$;
comment on function api.get_my_profile() is '@access authenticated The signed-in customer''s name, email, phone and consent choices.';

create or replace function api.update_my_profile(p_first_name text default null, p_last_name text default null, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := app.require_customer();
  v_phone text;
begin
  if p_phone is not null and trim(p_phone) <> '' then
    v_phone := app.normalise_phone_e164(p_phone, 'GB');
    if v_phone is null then perform app.raise_error('PHONE_INVALID', 400, null, 'Invalid phone number.'); end if;
  end if;
  if (p_first_name is not null and trim(p_first_name) = '') or (p_last_name is not null and trim(p_last_name) = '') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('firstName', 'lastName')), 'Name required.');
  end if;
  update app.customers set
    first_name = coalesce(left(trim(p_first_name), 80), first_name),
    last_name  = coalesce(left(trim(p_last_name), 80), last_name),
    phone_e164 = case when p_phone is null then phone_e164 when trim(p_phone) = '' then null else v_phone end
  where id = v_id;
  return api.get_my_profile();
end;
$$;
comment on function api.update_my_profile(text, text, text) is '@access authenticated Change name or phone (an empty phone removes it). Email changes go through Supabase Auth.';

create or replace function api.get_my_preferences()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('substitutionDefault', p.substitution_default, 'ripeness', p.ripeness,
    'smsDeliveryAlerts', p.sms_delivery_alerts, 'emailInvoices', p.email_invoices,
    'doorstepBell', p.doorstep_bell, 'ecoPackaging', p.eco_packaging)
  from app.customer_preferences p where p.customer_id = app.require_customer()
$$;
comment on function api.get_my_preferences() is '@access authenticated Delivery and substitution preferences.';

create or replace function api.update_my_preferences(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.require_customer();
begin
  if jsonb_typeof(p) <> 'object' then perform app.raise_error('VALIDATION_FAILED', 400, null, 'Expected an object.'); end if;
  insert into app.customer_preferences (customer_id) values (v_id) on conflict do nothing;
  update app.customer_preferences set
    substitution_default = coalesce(p ->> 'substitutionDefault', substitution_default),
    ripeness             = coalesce(p ->> 'ripeness', ripeness),
    sms_delivery_alerts  = coalesce((p ->> 'smsDeliveryAlerts')::boolean, sms_delivery_alerts),
    email_invoices       = coalesce((p ->> 'emailInvoices')::boolean, email_invoices),
    doorstep_bell        = coalesce((p ->> 'doorstepBell')::boolean, doorstep_bell),
    eco_packaging        = coalesce((p ->> 'ecoPackaging')::boolean, eco_packaging)
  where customer_id = v_id;
  return api.get_my_preferences();
exception when check_violation or invalid_text_representation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Invalid preference value.');
end;
$$;
comment on function api.update_my_preferences(jsonb) is '@access authenticated Change any of the preferences returned by get_my_preferences.';

create or replace function api.set_my_consent(p_purpose text, p_granted boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := app.require_customer();
  v_email text := (select c.email from app.customers c where c.id = v_id);
begin
  if p_purpose not in ('marketing_email', 'marketing_sms', 'marketing_whatsapp') or p_granted is null then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('purpose', p_purpose), 'Unknown consent.');
  end if;
  insert into app.consents (customer_id, email, purpose, granted, source) values (v_id, v_email, p_purpose, p_granted, 'account');
  return app.consent_state(v_id);
end;
$$;
comment on function api.set_my_consent(text, boolean) is '@access authenticated Give or withdraw marketing consent (email / SMS / WhatsApp). Every change is kept in the consent ledger.';

-- ── addresses ───────────────────────────────────────────────────────────────────────────────────
create or replace function api.list_my_addresses()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.address_json(a) order by a.is_default desc, a.created_at), '[]'::jsonb)
  from app.addresses a where a.customer_id = app.require_customer() and a.deleted_at is null
$$;
comment on function api.list_my_addresses() is '@access authenticated Saved delivery addresses, default first, each with whether it is in a delivery area.';

create or replace function api.save_my_address(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust     uuid := app.require_customer();
  v_id       uuid := nullif(p ->> 'id', '')::uuid;
  v_postcode text := app.normalise_uk_postcode(p ->> 'postcode');
  v_phone    text;
  v_default  boolean;
  v_missing  jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p) <> 'object' then perform app.raise_error('VALIDATION_FAILED', 400, null, 'Expected an object.'); end if;
  if coalesce(trim(p ->> 'fullName'), '') = '' then v_missing := v_missing || '"fullName"'; end if;
  if coalesce(trim(p ->> 'line1'), '') = '' then v_missing := v_missing || '"line1"'; end if;
  if coalesce(trim(p ->> 'city'), '') = '' then v_missing := v_missing || '"city"'; end if;
  if jsonb_array_length(v_missing) > 0 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', v_missing), 'Please fill in the required fields.');
  end if;
  if v_postcode is null then perform app.raise_error('POSTCODE_INVALID', 400, null, 'Please enter a full UK postcode.'); end if;
  if coalesce(trim(p ->> 'phone'), '') <> '' then
    v_phone := app.normalise_phone_e164(p ->> 'phone', 'GB');
    if v_phone is null then perform app.raise_error('PHONE_INVALID', 400, null, 'Invalid phone number.'); end if;
  end if;
  v_default := coalesce((p ->> 'isDefault')::boolean, false)
               or not exists (select 1 from app.addresses a where a.customer_id = v_cust and a.deleted_at is null and a.id is distinct from v_id);
  if v_default then
    update app.addresses set is_default = false where customer_id = v_cust and is_default and id is distinct from v_id;
  end if;
  if v_id is null then
    if (select count(*) from app.addresses a where a.customer_id = v_cust and a.deleted_at is null) >= 20 then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('max', 20), 'You can save up to 20 addresses.');
    end if;
    insert into app.addresses (customer_id, label, full_name, line1, line2, city, postcode, phone_e164, delivery_notes, is_default)
    values (v_cust, coalesce(nullif(trim(p ->> 'label'), ''), 'Home'), trim(p ->> 'fullName'), trim(p ->> 'line1'),
            nullif(trim(p ->> 'line2'), ''), trim(p ->> 'city'), v_postcode, v_phone, nullif(trim(p ->> 'deliveryNotes'), ''), v_default)
    returning id into v_id;
  else
    update app.addresses set
      label = coalesce(nullif(trim(p ->> 'label'), ''), label), full_name = trim(p ->> 'fullName'), line1 = trim(p ->> 'line1'),
      line2 = nullif(trim(p ->> 'line2'), ''), city = trim(p ->> 'city'), postcode = v_postcode, phone_e164 = v_phone,
      delivery_notes = nullif(trim(p ->> 'deliveryNotes'), ''), is_default = v_default or is_default
    where id = v_id and customer_id = v_cust and deleted_at is null;
    if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Address not found.'); end if;
  end if;
  return (select app.address_json(a) from app.addresses a where a.id = v_id);
exception when check_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Some address details are too long or invalid.');
end;
$$;
comment on function api.save_my_address(jsonb) is '@access authenticated Add (no id) or update an address: { id?, label, fullName, line1, line2, city, postcode, phone, deliveryNotes, isDefault }. The first address becomes the default.';

create or replace function api.delete_my_address(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
  v_was_default boolean;
begin
  update app.addresses set deleted_at = now(), is_default = false
   where id = p_id and customer_id = v_cust and deleted_at is null
  returning true into v_was_default;
  if v_was_default is null then perform app.raise_error('NOT_FOUND', 404, null, 'Address not found.'); end if;
  -- keep one default if any address is left
  if not exists (select 1 from app.addresses a where a.customer_id = v_cust and a.deleted_at is null and a.is_default) then
    update app.addresses set is_default = true
     where id = (select a.id from app.addresses a where a.customer_id = v_cust and a.deleted_at is null order by a.created_at limit 1);
  end if;
  return api.list_my_addresses();
end;
$$;
comment on function api.delete_my_address(uuid) is '@access authenticated Remove a saved address (past orders keep their own copy).';

create or replace function api.set_default_address(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  if not exists (select 1 from app.addresses a where a.id = p_id and a.customer_id = v_cust and a.deleted_at is null) then
    perform app.raise_error('NOT_FOUND', 404, null, 'Address not found.');
  end if;
  update app.addresses set is_default = false where customer_id = v_cust and is_default and id <> p_id;
  update app.addresses set is_default = true where id = p_id;
  return api.list_my_addresses();
end;
$$;
comment on function api.set_default_address(uuid) is '@access authenticated Make an address the default for checkout.';

-- ── wishlist ────────────────────────────────────────────────────────────────────────────────────
create or replace function app.product_ids_for_refs(p_refs text[])
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select distinct p.id from app.products p, unnest(coalesce(p_refs, '{}')) r
   where p.status = 'active'
     and (p.slug = r or p.legacy_ref = r or (r ~ '^[0-9a-f-]{36}$' and p.id = r::uuid))
$$;

create or replace function api.list_products_by_refs(p_refs text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.product_summary_json(x.id, null, null)), '[]'::jsonb)
  from (select id from app.product_ids_for_refs(p_refs[1:100]) id) x
$$;
comment on function api.list_products_by_refs(text[]) is '@access anon Product cards for a list of product ids, slugs or old ids (up to 100), e.g. a guest''s saved items.';

create or replace function api.list_my_wishlist()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.product_summary_json(w.product_id, null, null) order by w.created_at desc), '[]'::jsonb)
  from app.wishlist_items w join app.products p on p.id = w.product_id and p.status = 'active'
  where w.customer_id = app.require_customer()
$$;
comment on function api.list_my_wishlist() is '@access authenticated Saved items, newest first.';

create or replace function api.add_to_wishlist(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  if not exists (select 1 from app.products p where p.id = p_product_id and p.status = 'active') then
    perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.');
  end if;
  if (select count(*) from app.wishlist_items w where w.customer_id = v_cust) >= 500 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('max', 500), 'Saved items are full.');
  end if;
  insert into app.wishlist_items (customer_id, product_id) values (v_cust, p_product_id) on conflict do nothing;
  return (select coalesce(jsonb_agg(w.product_id), '[]'::jsonb) from app.wishlist_items w where w.customer_id = v_cust);
end;
$$;
comment on function api.add_to_wishlist(uuid) is '@access authenticated Save a product. Returns all saved product ids.';

create or replace function api.remove_from_wishlist(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  delete from app.wishlist_items where customer_id = v_cust and product_id = p_product_id;
  return (select coalesce(jsonb_agg(w.product_id), '[]'::jsonb) from app.wishlist_items w where w.customer_id = v_cust);
end;
$$;
comment on function api.remove_from_wishlist(uuid) is '@access authenticated Remove a saved product. Returns all saved product ids.';

create or replace function api.clear_my_wishlist()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app.wishlist_items where customer_id = app.require_customer();
  return '[]'::jsonb;
end;
$$;
comment on function api.clear_my_wishlist() is '@access authenticated Remove every saved product.';

create or replace function api.merge_wishlist(p_refs text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  insert into app.wishlist_items (customer_id, product_id)
  select v_cust, x.id from app.product_ids_for_refs(p_refs[1:200]) x(id)
  on conflict do nothing;
  return (select coalesce(jsonb_agg(w.product_id), '[]'::jsonb) from app.wishlist_items w where w.customer_id = v_cust);
end;
$$;
comment on function api.merge_wishlist(text[]) is '@access authenticated Add items saved while signed out (ids, slugs or old ids). Returns all saved product ids.';

-- ── newsletter (double opt-in) ──────────────────────────────────────────────────────────────────
-- Always answers the same way, whether or not the email is already subscribed (no account probing).
create or replace function api.subscribe_newsletter(p_email text, p_source text default 'footer')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_source text := case when p_source in ('footer', 'home_section', 'account', 'checkout') then p_source else 'footer' end;
  v_sub    app.newsletter_subscribers;
  v_tok    record;
  v_site   text := rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/');
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('email')), 'Please enter a valid email address.');
  end if;
  perform app.rate_limit('newsletter:' || v_email, 3, interval '1 hour');
  select * into v_sub from app.newsletter_subscribers where email = v_email for update;
  if v_sub.status = 'subscribed' then
    return jsonb_build_object('status', 'check_inbox');
  end if;
  select * into v_tok from app.new_token();
  if v_sub.id is null then
    insert into app.newsletter_subscribers (email, source, confirm_token_hash) values (v_email, v_source, v_tok.token_hash);
  else
    update app.newsletter_subscribers set status = 'pending', confirm_token_hash = v_tok.token_hash, source = v_source,
      unsubscribed_at = null where id = v_sub.id;
  end if;
  perform app.queue_message('newsletter_confirm', 'email', v_email,
    jsonb_build_object('confirm_url', v_site || '/newsletter/confirm?token=' || v_tok.token));
  return jsonb_build_object('status', 'check_inbox');
end;
$$;
comment on function api.subscribe_newsletter(text, text) is '@access anon Start a newsletter sign-up: emails a confirmation link (double opt-in). Rate-limited; always answers "check_inbox".';

create or replace function api.confirm_newsletter(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub   app.newsletter_subscribers;
  v_unsub record;
  v_site  text := rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/');
  v_code  text := nullif(app.setting('newsletter_welcome_code') #>> '{}', '');
begin
  select * into v_sub from app.newsletter_subscribers
   where confirm_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if v_sub.id is null then
    perform app.raise_error('TOKEN_INVALID', 400, null, 'That link has expired or was already used.');
  end if;
  select * into v_unsub from app.new_token();
  update app.newsletter_subscribers set status = 'subscribed', confirmed_at = now(), confirm_token_hash = null,
    unsubscribe_token_hash = v_unsub.token_hash where id = v_sub.id;
  insert into app.consents (customer_id, email, purpose, granted, source)
  values ((select c.id from app.customers c where c.email = v_sub.email and c.anonymised_at is null), v_sub.email, 'marketing_email', true,
          case v_sub.source when 'home_section' then 'newsletter_home' else 'newsletter_footer' end);
  perform app.queue_message('newsletter_welcome', 'email', v_sub.email, jsonb_build_object(
    'code', coalesce(v_code, ''),
    'code_line', case when v_code is not null then 'Use code ' || v_code || ' on your next order.' else '' end,
    'unsubscribe_url', v_site || '/newsletter/unsubscribe?token=' || v_unsub.token));
  return jsonb_build_object('status', 'subscribed');
end;
$$;
comment on function api.confirm_newsletter(text) is '@access anon Confirm a newsletter sign-up from the emailed link; records marketing consent and sends the welcome email.';

create or replace function api.unsubscribe_newsletter(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub app.newsletter_subscribers;
begin
  select * into v_sub from app.newsletter_subscribers
   where unsubscribe_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if v_sub.id is null then
    perform app.raise_error('TOKEN_INVALID', 400, null, 'That link has expired or was already used.');
  end if;
  update app.newsletter_subscribers set status = 'unsubscribed', unsubscribed_at = now() where id = v_sub.id;
  insert into app.consents (customer_id, email, purpose, granted, source)
  values ((select c.id from app.customers c where c.email = v_sub.email and c.anonymised_at is null), v_sub.email, 'marketing_email', false, 'newsletter_footer');
  return jsonb_build_object('status', 'unsubscribed');
end;
$$;
comment on function api.unsubscribe_newsletter(text) is '@access anon Unsubscribe with the link from any newsletter email; withdraws marketing consent.';

-- ── GDPR ────────────────────────────────────────────────────────────────────────────────────────
create or replace function api.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.require_customer();
  c    app.customers;
begin
  select * into c from app.customers where id = v_id;
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', app.customer_json(c),
    'preferences', (select to_jsonb(p) - 'customer_id' from app.customer_preferences p where p.customer_id = v_id),
    'addresses', (select coalesce(jsonb_agg(to_jsonb(a) - 'customer_id' order by a.created_at), '[]') from app.addresses a where a.customer_id = v_id),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('purpose', x.purpose, 'granted', x.granted, 'version', x.document_version,
                                  'source', x.source, 'at', x.created_at) order by x.created_at), '[]') from app.consents x where x.customer_id = v_id),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('number', o.number, 'status', o.status, 'placedAt', o.placed_at,
                                  'total', coalesce(o.final_total_minor, o.est_total_minor), 'currency', o.currency, 'address', o.address_snapshot,
                                  'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name_snapshot, 'quantity', l.quantity_ordered,
                                             'weightGrams', l.weight_ordered_grams, 'unitPrice', l.unit_price_minor) order by l.line_no), '[]')
                                             from app.order_lines l where l.order_id = o.id and l.line_type = 'product'))
                                  order by o.created_at), '[]') from app.orders o where o.customer_id = v_id),
    'wishlist', (select coalesce(jsonb_agg(jsonb_build_object('product', p.slug, 'savedAt', w.created_at)), '[]')
                   from app.wishlist_items w join app.products p on p.id = w.product_id where w.customer_id = v_id),
    'loyalty', (select to_jsonb(l) - 'customer_id' from app.loyalty_accounts l where l.customer_id = v_id),
    'loyaltyHistory', (select coalesce(jsonb_agg(jsonb_build_object('points', t.points, 'reason', t.reason, 'at', t.created_at) order by t.created_at), '[]')
                         from app.loyalty_transactions t where t.customer_id = v_id),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'text', r.body, 'status', r.status, 'at', r.created_at)), '[]')
                  from app.reviews r where r.customer_id = v_id),
    'newsletter', (select jsonb_build_object('status', n.status, 'confirmedAt', n.confirmed_at) from app.newsletter_subscribers n where n.email = c.email),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('channel', m.channel, 'subject', m.subject, 'status', m.status, 'at', m.created_at) order by m.created_at), '[]')
                   from app.outbound_messages m where m.customer_id = v_id));
end;
$$;
comment on function api.export_my_data() is '@access authenticated Everything we hold about the signed-in customer, as one JSON document (UK GDPR right of access).';

create or replace function api.delete_my_account(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := app.require_user();
  v_cust app.customers;
begin
  if p_confirm is distinct from 'DELETE' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('confirm', 'DELETE'), 'Type DELETE to confirm.');
  end if;
  select * into v_cust from app.customers where user_id = v_uid and anonymised_at is null for update;
  if v_cust.id is not null then
    if exists (select 1 from app.orders o where o.customer_id = v_cust.id
                and o.status in ('pending_payment', 'placed', 'picking', 'picked', 'paid', 'out_for_delivery')) then
      perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'ACTIVE_ORDERS'), 'Please wait until your open orders are delivered or cancelled.');
    end if;
    if exists (select 1 from app.staff s where s.user_id = v_uid and s.status <> 'deactivated') then
      perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'STAFF_ACCOUNT'), 'Staff accounts are closed by a Store Manager.');
    end if;
    -- Orders and invoices are kept for tax records; everything that identifies the person is removed.
    delete from app.newsletter_subscribers where email = v_cust.email;
    delete from app.wishlist_items where customer_id = v_cust.id;
    -- baskets: empty them all; delete the ones no order points to (orders → checkouts → carts)
    delete from app.cart_items where cart_id in (select c.id from app.carts c where c.customer_id = v_cust.id);
    update app.checkouts set address_snapshot = null, delivery_notes = null where customer_id = v_cust.id;
    delete from app.carts c where c.customer_id = v_cust.id
       and not exists (select 1 from app.checkouts k join app.orders o on o.checkout_id = k.id where k.cart_id = c.id);
    update app.carts set status = 'abandoned' where customer_id = v_cust.id and status = 'active';
    delete from app.customer_preferences where customer_id = v_cust.id;
    update app.addresses set deleted_at = coalesce(deleted_at, now()), full_name = 'Deleted', line1 = 'Deleted', line2 = null,
      city = 'Deleted', phone_e164 = null, delivery_notes = null where customer_id = v_cust.id;
    update app.payment_methods set detached_at = coalesce(detached_at, now()) where customer_id = v_cust.id;
    update app.reviews set display_name = 'Former customer', avatar_url = null, location_label = null where customer_id = v_cust.id;
    update app.customers set email = null, first_name = null, last_name = null, phone_e164 = null, internal_notes = null,
      anonymised_at = now(), user_id = null where id = v_cust.id;
    perform app.audit('customer.deleted', 'customer', v_cust.id::text, '{}'::jsonb);
  end if;
  delete from auth.users where id = v_uid;
  return jsonb_build_object('status', 'deleted');
end;
$$;
comment on function api.delete_my_account(text) is '@access authenticated Close the account (UK GDPR erasure): anonymises the profile and deletes the login. Order and invoice records are kept as the law requires. Pass ''DELETE''.';

-- ── storefront extras ───────────────────────────────────────────────────────────────────────────
create or replace function api.get_review_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('count', count(*)::int, 'average', round(avg(r.rating)::numeric, 1))
  from app.reviews r
  where r.product_id is null and r.status = 'approved' and (not r.is_sample or not app.is_production())
$$;
comment on function api.get_review_summary() is '@access anon Average rating and number of approved store reviews (the same reviews shown on the homepage).';

create or replace function api.claim_cart(p_cart_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart record;
begin
  perform app.require_customer();
  select * into v_cart from app.cart_for_write(p_cart_token);
  return app.cart_view(v_cart.cart_id, v_cart.cart_token);
end;
$$;
comment on function api.claim_cart(text) is '@access authenticated Move the guest basket into the signed-in customer''s basket right after sign-in.';

select app.harden();
