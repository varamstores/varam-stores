-- 0027 Admin: configuration (Phase 8). Settings with plain-English definitions (label, help, group,
--      type, limits) so the admin form needs no technical knowledge; promotions & coupons; delivery
--      (areas, postcodes, delivery charges, weekly time windows, single slots, vans, drivers);
--      loyalty tiers and rewards; staff (invite via Supabase Auth, roles, permissions); company &
--      VAT details, tax-rate confirmation; audit log. Plus a tidy-up from 0026.

-- ── settings with definitions ───────────────────────────────────────────────────────────────────
create table app.setting_definitions (
  key       text primary key references app.app_settings (key) on delete cascade,
  grp       text not null,
  label     text not null,
  help      text,
  kind      text not null check (kind in ('boolean', 'integer', 'money', 'percent', 'text', 'email', 'phone', 'url', 'select')),
  options   jsonb,
  min_value numeric,
  max_value numeric,
  editable  boolean not null default true,
  position  integer not null default 0
);
comment on table app.setting_definitions is 'How each setting is shown and checked in the admin Settings screen.';

insert into app.setting_definitions (key, grp, label, help, kind, options, min_value, max_value, editable, position) values
  ('support_email', 'Store details', 'Customer support email', 'Shown in the footer and on the Contact page; replies to customers come from here.', 'email', null, null, null, true, 10),
  ('support_phone', 'Store details', 'Customer support phone', 'Shown in the footer and on the Contact page.', 'phone', null, null, null, true, 20),
  ('site_url', 'Store details', 'Website address', 'Your live website address, e.g. https://www.varamfoods.co.uk. Used for links inside emails.', 'url', null, null, null, true, 30),
  ('email_from', 'Store details', 'Emails are sent from', 'e.g. Varam Foods <orders@varamfoods.co.uk>. Must be on the domain you verified with the email service.', 'text', null, null, null, true, 40),
  ('order_reply_to', 'Store details', 'Reply-to address for emails', 'Optional. Where customer replies to order emails go.', 'email', null, null, null, true, 50),
  ('payment_mode', 'Checkout & payments', 'How checkout takes payment', '"Stripe" takes real card payments. "Test mode" lets you try the whole order flow without charging anyone (never allowed on the live shop).', 'select',
     '[{"value": "stripe", "label": "Stripe (real card payments)"}, {"value": "simulated", "label": "Test mode (no card charged)"}]', null, null, true, 10),
  ('payment_pending_minutes', 'Checkout & payments', 'Minutes to finish paying', 'If payment is not completed in time the order is cancelled and its slot and stock are freed.', 'integer', null, 5, 120, true, 20),
  ('weighted_auth_buffer_bp', 'Checkout & payments', 'Extra hold for weighed items', 'Weighed items can come out a little heavier. This extra percentage is held on the card (never more than this is charged).', 'percent', null, 0, 5000, true, 30),
  ('max_line_quantity', 'Checkout & payments', 'Most of one item per order', 'Limit for any single product unless the product has its own lower limit.', 'integer', null, 1, 999, true, 40),
  ('coupon_attempts_per_10_min', 'Checkout & payments', 'Promo code tries per 10 minutes', 'Stops people guessing codes.', 'integer', null, 3, 100, true, 50),
  ('slot_days_ahead', 'Delivery', 'Days of delivery slots shown', 'How far ahead shoppers can book.', 'integer', null, 1, 21, true, 10),
  ('slot_hold_minutes', 'Delivery', 'Minutes a slot is held at checkout', 'A chosen slot is reserved for this long while the shopper checks out.', 'integer', null, 5, 60, true, 20),
  ('free_delivery_basis', 'Delivery', 'Free delivery is worked out on', 'Whether the free-delivery amount counts the basket before or after discounts.', 'select',
     '[{"value": "before_discounts", "label": "Basket total before discounts"}, {"value": "after_discounts", "label": "Basket total after discounts"}]', null, null, true, 30),
  ('substitution_pricing', 'Products & stock', 'Price of substitutes', 'What a customer pays when an item is replaced.', 'select',
     '[{"value": "lower_of_two", "label": "The lower of the two prices (recommended)"}, {"value": "original_price", "label": "The price of the item they ordered"}, {"value": "substitute_price", "label": "The substitute''s own price"}]', null, null, true, 10),
  ('shopper_low_stock_units', 'Products & stock', 'Show "only a few left" at', 'Shoppers see "only a few left" when this many or fewer are available. 0 turns it off.', 'integer', null, 0, 100, true, 20),
  ('auto_purchase_orders_enabled', 'Products & stock', 'Draft purchase orders for low stock', 'Each morning, draft purchase orders are created for items at or below their reorder level. You review and send them.', 'boolean', null, null, null, true, 30),
  ('loyalty_enabled', 'Loyalty', 'Loyalty points switched on', 'Customers earn and spend points.', 'boolean', null, null, null, true, 10),
  ('loyalty_points_per_pound', 'Loyalty', 'Points per £1 spent', 'Points earned for every £1 of products (after discounts) when the order is charged.', 'integer', null, 0, 100, true, 20),
  ('loyalty_point_value_pence', 'Loyalty', 'Value of one point (pence)', 'Used to show customers what their points are worth.', 'integer', null, 1, 100, true, 30),
  ('newsletter_welcome_code', 'Customer emails', 'Welcome code for newsletter sign-ups', 'Sent after someone confirms their newsletter sign-up. Leave empty to send none. The code must exist under Promotions.', 'text', null, null, null, true, 10),
  ('abandoned_cart_enabled', 'Customer emails', 'Basket reminder emails', 'Reminds signed-in shoppers who agreed to marketing emails about items left in their basket.', 'boolean', null, null, null, true, 20),
  ('abandoned_cart_hours', 'Customer emails', 'Send basket reminder after (hours)', 'Hours after the last basket change.', 'integer', null, 1, 168, true, 30),
  ('product_alerts_enabled', 'Customer emails', 'Back-in-stock and price-drop alerts', 'Lets shoppers ask to be emailed about an item.', 'boolean', null, null, null, true, 40),
  ('repeat_orders_enabled', 'Customer emails', 'Repeat orders', 'Lets shoppers refill their basket on a schedule with a reminder email.', 'boolean', null, null, null, true, 50),
  ('terms_version', 'Legal & invoices', 'Terms & Conditions version', 'Change this (e.g. to today''s date) whenever you change your terms; new sign-ups accept the new version.', 'text', null, null, null, true, 10),
  ('privacy_version', 'Legal & invoices', 'Privacy Policy version', 'Change this whenever you change your privacy policy.', 'text', null, null, null, true, 20),
  ('invoices_enabled', 'Legal & invoices', 'Issue VAT invoices', 'Turn on once your company and VAT details are saved (Settings → Company & VAT).', 'boolean', null, null, null, true, 30),
  ('currency', 'System (read only)', 'Currency', 'Fixed for this shop.', 'text', null, null, null, false, 10),
  ('default_country', 'System (read only)', 'Country', 'Fixed for this shop.', 'text', null, null, null, false, 20),
  ('timezone', 'System (read only)', 'Time zone', 'Fixed for this shop.', 'text', null, null, null, false, 30),
  ('environment', 'System (read only)', 'Environment', 'development or production.', 'text', null, null, null, false, 40),
  ('media_base_url', 'System (read only)', 'Image storage address', 'Set up by the developer.', 'url', null, null, null, false, 50),
  ('guest_checkout_enabled', 'System (read only)', 'Guest checkout', 'Checkout needs an account.', 'boolean', null, null, null, false, 60),
  ('email_provider', 'System (read only)', 'Email service', 'Resend.', 'text', null, null, null, false, 70),
  ('card_auth_validity_hours', 'System (read only)', 'Card hold valid for (hours)', 'Set by the card networks.', 'integer', null, null, null, false, 80),
  ('authorise_later_after_days', 'System (read only)', 'Authorise later after (days)', 'Technical.', 'integer', null, null, null, false, 90),
  ('delayed_auth_hours_before_slot', 'System (read only)', 'Delayed authorisation (hours before slot)', 'Technical.', 'integer', null, null, null, false, 100),
  ('loyalty_earn_basis', 'System (read only)', 'Points are earned on', 'Charged product spend.', 'text', null, null, null, false, 110),
  ('guest_cart_days', 'System (read only)', 'Guest baskets kept for (days)', 'Technical.', 'integer', null, null, null, false, 120)
on conflict (key) do nothing;

create or replace function api.admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('full_access') or app.has_permission('financials')) then perform app.require_permission('full_access'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('group', g.grp, 'settings', g.items) order by g.first_pos, g.grp), '[]'::jsonb) from (
    select d.grp, min(case d.grp when 'Store details' then 1 when 'Checkout & payments' then 2 when 'Delivery' then 3 when 'Products & stock' then 4
                                  when 'Loyalty' then 5 when 'Customer emails' then 6 when 'Legal & invoices' then 7 else 9 end) as first_pos,
           jsonb_agg(jsonb_build_object('key', d.key, 'label', d.label, 'help', d.help, 'kind', d.kind, 'options', d.options,
             'min', d.min_value, 'max', d.max_value, 'editable', d.editable, 'value', s.value, 'updatedAt', s.updated_at,
             'updatedBy', (select st.full_name from app.staff st where st.id = s.updated_by)) order by d.position) as items
      from app.setting_definitions d join app.app_settings s on s.key = d.key group by d.grp) g);
end;
$$;
comment on function api.admin_get_settings() is '@access staff All settings, grouped, each with a plain-English label, help, type and limits. Permission: full_access.';

create or replace function api.admin_update_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('full_access');
  d       app.setting_definitions;
  v_old   jsonb;
  v_text  text;
  v_num   numeric;
begin
  select * into d from app.setting_definitions where key = p_key;
  if d.key is null or not d.editable then
    perform app.raise_error('FORBIDDEN', 403, jsonb_build_object('key', p_key), 'This setting cannot be changed here.');
  end if;
  case d.kind
    when 'boolean' then
      if jsonb_typeof(p_value) <> 'boolean' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key), 'Choose on or off.'); end if;
    when 'integer', 'percent', 'money' then
      if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then
        perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key), 'Enter a whole number.');
      end if;
      v_num := (p_value #>> '{}')::numeric;
      if (d.min_value is not null and v_num < d.min_value) or (d.max_value is not null and v_num > d.max_value) then
        perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key, 'min', d.min_value, 'max', d.max_value), format('Enter a number from %s to %s.', d.min_value, d.max_value));
      end if;
    when 'select' then
      if not exists (select 1 from jsonb_array_elements(d.options) o where o -> 'value' = p_value) then
        perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key), 'Choose one of the options.');
      end if;
    else
      if jsonb_typeof(p_value) <> 'string' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key), 'Enter text.'); end if;
      v_text := trim(p_value #>> '{}');
      if d.kind = 'email' and v_text <> '' and v_text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key), 'Enter a valid email address.');
      end if;
      if d.kind = 'phone' and v_text <> '' then
        v_text := app.normalise_phone_e164(v_text, 'GB');
        if v_text is null then perform app.raise_error('PHONE_INVALID', 400, jsonb_build_object('key', p_key), 'Enter a valid phone number.'); end if;
      end if;
      if d.kind = 'url' and v_text <> '' and v_text !~ '^https?://[^\s]+$' then
        perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key), 'Enter a full address starting with https://');
      end if;
      if p_key = 'newsletter_welcome_code' and v_text <> '' then
        v_text := upper(regexp_replace(v_text, '\s', '', 'g'));
        if not exists (select 1 from app.coupons c where c.code = v_text and c.customer_id is null) then
          perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key, 'reason', 'COUPON_NOT_FOUND'), 'Create this code under Promotions first.');
        end if;
      end if;
      p_value := to_jsonb(v_text);
  end case;
  if p_key = 'payment_mode' and p_value = '"simulated"' and app.is_production() then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key), 'Test mode is not allowed on the live shop.');
  end if;
  if p_key = 'payment_mode' and p_value = '"stripe"' and app.vault_secret('stripe_secret_key') is null then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key, 'reason', 'STRIPE_NOT_CONFIGURED'), 'Add the Stripe keys first (ask your developer).');
  end if;
  if p_key = 'invoices_enabled' and p_value = 'true' and not exists (select 1 from app.legal_entities le where le.is_active and le.vat_number is not null) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('key', p_key, 'reason', 'COMPANY_DETAILS_MISSING'), 'Save your company and VAT details first.');
  end if;
  select value into v_old from app.app_settings where key = p_key;
  update app.app_settings set value = p_value, updated_by = v_staff, updated_at = now() where key = p_key;
  if p_key = 'slot_days_ahead' then perform app.generate_delivery_slots(); end if;
  perform app.audit('setting.updated', 'setting', p_key, jsonb_build_object('from', v_old, 'to', p_value));
  return api.admin_get_settings();
end;
$$;
comment on function api.admin_update_setting(text, jsonb) is '@access staff Change one setting; the value is checked against its definition. Permission: full_access.';

-- ── company & VAT, tax rates ────────────────────────────────────────────────────────────────────
create or replace function api.admin_get_company()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('financials');
  return jsonb_build_object(
    'company', (select jsonb_build_object('id', le.id, 'name', le.name, 'companyNumber', le.company_number, 'vatNumber', le.vat_number,
                  'address', le.registered_address, 'invoicePrefix', le.invoice_prefix, 'creditNotePrefix', le.credit_note_prefix, 'isActive', le.is_active)
                  from app.legal_entities le order by le.created_at limit 1),
    'taxRates', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'category', r.tax_category_code,
                   'categoryName', (select tc.name from app.tax_categories tc where tc.code = r.tax_category_code), 'rateBp', r.rate_bp,
                   'validFrom', r.valid_from, 'validTo', r.valid_to, 'confirmedBy', r.confirmed_by, 'confirmedAt', r.confirmed_at, 'note', r.note)
                   order by r.tax_category_code, r.valid_from desc), '[]'::jsonb) from app.tax_rates r),
    'invoicesEnabled', coalesce((app.setting('invoices_enabled'))::boolean, false));
end;
$$;
comment on function api.admin_get_company() is '@access staff Company and VAT details used on invoices, and the VAT rates. Permission: financials.';

create or replace function api.admin_save_company(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := (select le.id from app.legal_entities le order by le.created_at limit 1);
  v_missing jsonb := '[]'::jsonb;
begin
  perform app.require_permission('financials');
  if coalesce(trim(p ->> 'name'), '') = '' then v_missing := v_missing || '"name"'; end if;
  if coalesce(trim(p -> 'address' ->> 'line1'), '') = '' then v_missing := v_missing || '"address"'; end if;
  if jsonb_array_length(v_missing) > 0 then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', v_missing), 'Company name and registered address are required.');
  end if;
  if coalesce(p ->> 'vatNumber', '') <> '' and upper(replace(p ->> 'vatNumber', ' ', '')) !~ '^GB([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('vatNumber')), 'A UK VAT number looks like GB123456789.');
  end if;
  if coalesce(p ->> 'companyNumber', '') <> '' and upper(replace(p ->> 'companyNumber', ' ', '')) !~ '^([0-9]{8}|[A-Z]{2}[0-9]{6})$' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('companyNumber')), 'A Companies House number has 8 characters, e.g. 12345678.');
  end if;
  if v_id is null then
    insert into app.legal_entities (name, country_code, invoice_prefix, credit_note_prefix) values (trim(p ->> 'name'), 'GB', 'INV', 'CN') returning id into v_id;
  end if;
  update app.legal_entities set name = trim(p ->> 'name'),
    company_number = nullif(upper(replace(coalesce(p ->> 'companyNumber', ''), ' ', '')), ''),
    vat_number = nullif(upper(replace(coalesce(p ->> 'vatNumber', ''), ' ', '')), ''),
    registered_address = coalesce(p -> 'address', '{}'::jsonb),
    invoice_prefix = coalesce(nullif(upper(trim(p ->> 'invoicePrefix')), ''), invoice_prefix),
    credit_note_prefix = coalesce(nullif(upper(trim(p ->> 'creditNotePrefix')), ''), credit_note_prefix),
    is_active = true, updated_at = now()
  where id = v_id;
  perform app.audit('company.saved', 'legal_entity', v_id::text, p);
  return api.admin_get_company();
exception when check_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('invoicePrefix', 'creditNotePrefix')), 'Number prefixes: 2–12 capital letters/numbers, and different from each other.');
  return null;
end;
$$;
comment on function api.admin_save_company(jsonb) is '@access staff Save the company name, number, VAT number and registered address shown on invoices. Permission: financials.';

create or replace function api.admin_confirm_tax_rate(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('financials');
begin
  update app.tax_rates set confirmed_by = (select s.full_name from app.staff s where s.id = v_staff), confirmed_at = now() where id = p_id and confirmed_at is null;
  if not found then perform app.raise_error('CONFLICT', 409, null, 'Already confirmed or not found.'); end if;
  perform app.audit('tax_rate.confirmed', 'tax_rate', p_id::text, '{}'::jsonb);
  return api.admin_get_company();
end;
$$;
comment on function api.admin_confirm_tax_rate(uuid) is '@access staff Confirm a VAT rate has been checked (ideally with your accountant). Permission: financials.';

-- ── promotions & coupons ────────────────────────────────────────────────────────────────────────
create or replace function app.promotion_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'label', p.label, 'type', p.type, 'scope', p.scope, 'status', p.status,
    'percent', case when p.percent_bp is not null then p.percent_bp / 100.0 end, 'amountMinor', p.amount_minor, 'buyQty', p.buy_qty, 'payQty', p.pay_qty,
    'bundlePriceMinor', p.bundle_price_minor, 'minBasketMinor', p.min_basket_minor, 'maxDiscountMinor', p.max_discount_minor,
    'requiresCoupon', p.requires_coupon, 'firstOrderOnly', p.first_order_only, 'membersOnly', p.members_only, 'stackable', p.stackable, 'priority', p.priority,
    'startsAt', p.starts_at, 'endsAt', p.ends_at, 'usageLimitTotal', p.usage_limit_total, 'usageLimitPerCustomer', p.usage_limit_per_customer, 'description', p.description,
    'targets', (select coalesce(jsonb_agg(jsonb_build_object('type', t.target_type, 'id', t.target_id,
                  'name', case t.target_type
                    when 'product' then (select pt.name from app.product_translations pt where pt.product_id = t.target_id and pt.locale = 'en-GB')
                    when 'category' then (select ct.name from app.category_translations ct where ct.category_id = t.target_id and ct.locale = 'en-GB')
                    else (select b.name from app.brands b where b.id = t.target_id) end)), '[]'::jsonb) from app.promotion_targets t where t.promotion_id = p.id),
    'zoneIds', (select coalesce(jsonb_agg(z.zone_id), '[]'::jsonb) from app.promotion_zones z where z.promotion_id = p.id),
    'coupons', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'isActive', c.is_active, 'usedCount', c.used_count, 'maxUses', c.max_uses,
                   'personal', c.customer_id is not null) order by c.created_at), '[]'::jsonb) from app.coupons c where c.promotion_id = p.id and c.customer_id is null),
    'personalCodes', (select count(*)::int from app.coupons c where c.promotion_id = p.id and c.customer_id is not null),
    'timesUsed', (select count(*)::int from app.promotion_redemptions r join app.orders o on o.id = r.order_id where r.promotion_id = p.id and o.status <> 'cancelled'),
    'discountGiven', app.money((select coalesce(sum(r.discount_minor), 0) from app.promotion_redemptions r join app.orders o on o.id = r.order_id
                                 where r.promotion_id = p.id and o.status <> 'cancelled'), 'GBP'),
    'isLoyaltyReward', exists (select 1 from app.loyalty_rewards lr where lr.promotion_id = p.id))
  from app.promotions p where p.id = p_id
$$;

create or replace function api.admin_list_promotions(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('pricing');
  return (select coalesce(jsonb_agg(app.promotion_json(p.id) order by p.status = 'active' desc, p.created_at desc), '[]'::jsonb)
    from app.promotions p where p_status is null or p.status = p_status);
end;
$$;
comment on function api.admin_list_promotions(text) is '@access staff Every offer with its codes, how often it was used and how much discount it gave. Permission: pricing.';

create or replace function api.admin_save_promotion(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('pricing');
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_type  text := p ->> 'type';
  v_scope text;
  t       jsonb;
begin
  if v_id is null and (coalesce(trim(p ->> 'label'), '') = '' or v_type is null) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('label', 'type')), 'Give the offer a name shoppers will see and choose its type.');
  end if;
  v_scope := case when v_type in ('multibuy_x_for_y', 'multibuy_x_for_price', 'member_price') then 'targets'
                  when v_type = 'free_delivery' then 'basket'
                  else coalesce(p ->> 'scope', 'basket') end;
  if v_id is null then
    insert into app.promotions (name, label, type, scope, percent_bp, amount_minor, buy_qty, pay_qty, bundle_price_minor, members_only, created_by, status)
    values (coalesce(nullif(trim(p ->> 'name'), ''), trim(p ->> 'label')), trim(p ->> 'label'), v_type, v_scope,
            case when v_type in ('percent_off', 'member_price') and p ? 'percent' then round((p ->> 'percent')::numeric * 100)::int end,
            case when v_type in ('fixed_off', 'member_price') and not p ? 'percent' then (p ->> 'amountMinor')::int end,
            case when v_type like 'multibuy%' then (p ->> 'buyQty')::int end,
            case when v_type = 'multibuy_x_for_y' then (p ->> 'payQty')::int end,
            case when v_type = 'multibuy_x_for_price' then (p ->> 'bundlePriceMinor')::int end,
            v_type = 'member_price' or coalesce((p ->> 'membersOnly')::boolean, false), v_staff, 'draft')
    returning id into v_id;
  else
    -- a member price is either a % or an amount off: setting one clears the other
    update app.promotions set
      percent_bp = case when type in ('percent_off', 'member_price') and p ? 'percent' then round((p ->> 'percent')::numeric * 100)::int
                        when type = 'member_price' and p ? 'amountMinor' then null else percent_bp end,
      amount_minor = case when type in ('fixed_off', 'member_price') and p ? 'amountMinor' and not (type = 'member_price' and p ? 'percent') then (p ->> 'amountMinor')::int
                          when type = 'member_price' and p ? 'percent' then null else amount_minor end,
      buy_qty = case when type like 'multibuy%' and p ? 'buyQty' then (p ->> 'buyQty')::int else buy_qty end,
      pay_qty = case when type = 'multibuy_x_for_y' and p ? 'payQty' then (p ->> 'payQty')::int else pay_qty end,
      bundle_price_minor = case when type = 'multibuy_x_for_price' and p ? 'bundlePriceMinor' then (p ->> 'bundlePriceMinor')::int else bundle_price_minor end,
      scope = case when type in ('percent_off', 'fixed_off') and p ? 'scope' then p ->> 'scope' else scope end
    where id = v_id;
    if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Offer not found.'); end if;
  end if;
  update app.promotions set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    label = coalesce(nullif(trim(p ->> 'label'), ''), label),
    description = case when p ? 'description' then nullif(trim(p ->> 'description'), '') else description end,
    min_basket_minor = case when p ? 'minBasketMinor' then nullif(p ->> 'minBasketMinor', '')::int else min_basket_minor end,
    max_discount_minor = case when p ? 'maxDiscountMinor' then nullif(p ->> 'maxDiscountMinor', '')::int else max_discount_minor end,
    requires_coupon = coalesce((p ->> 'requiresCoupon')::boolean, requires_coupon),
    first_order_only = coalesce((p ->> 'firstOrderOnly')::boolean, first_order_only),
    stackable = coalesce((p ->> 'stackable')::boolean, stackable),
    priority = coalesce((p ->> 'priority')::int, priority),
    starts_at = coalesce(nullif(p ->> 'startsAt', '')::timestamptz, starts_at),
    ends_at = case when p ? 'endsAt' then nullif(p ->> 'endsAt', '')::timestamptz else ends_at end,
    usage_limit_total = case when p ? 'usageLimitTotal' then nullif(p ->> 'usageLimitTotal', '')::int else usage_limit_total end,
    usage_limit_per_customer = case when p ? 'usageLimitPerCustomer' then nullif(p ->> 'usageLimitPerCustomer', '')::int else usage_limit_per_customer end,
    status = coalesce(nullif(p ->> 'status', ''), status)
  where id = v_id;
  if p ? 'targets' then
    delete from app.promotion_targets where promotion_id = v_id;
    for t in select * from jsonb_array_elements(p -> 'targets') loop
      insert into app.promotion_targets (promotion_id, target_type, target_id) values (v_id, t ->> 'type', (t ->> 'id')::uuid) on conflict do nothing;
    end loop;
  end if;
  if (select scope from app.promotions where id = v_id) = 'targets' and not exists (select 1 from app.promotion_targets pt where pt.promotion_id = v_id)
     and (select status from app.promotions where id = v_id) = 'active' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('targets')), 'Choose which products, categories or brands this offer is for.');
  end if;
  if p ? 'zoneIds' then
    delete from app.promotion_zones where promotion_id = v_id;
    insert into app.promotion_zones (promotion_id, zone_id) select v_id, x::uuid from jsonb_array_elements_text(p -> 'zoneIds') x on conflict do nothing;
  end if;
  if p ? 'code' and nullif(trim(p ->> 'code'), '') is not null then
    insert into app.coupons (promotion_id, code) values (v_id, upper(regexp_replace(p ->> 'code', '\s', '', 'g')));
    update app.promotions set requires_coupon = true where id = v_id;
  end if;
  perform app.audit('promotion.saved', 'promotion', v_id::text, p);
  return app.promotion_json(v_id);
exception
  when unique_violation then
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('fields', jsonb_build_array('code')), 'That promo code is already used by another offer.');
    return null;
  when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or foreign_key_violation then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', sqlerrm), 'Some offer details do not fit its type (e.g. "buy 3 pay 2" needs both numbers; the end date must be after the start). Codes: 3–32 letters/numbers.');
    return null;
end;
$$;
comment on function api.admin_save_promotion(jsonb) is '@access staff Create or edit an offer: { label, type: percent_off|fixed_off|multibuy_x_for_y|multibuy_x_for_price|member_price|free_delivery, percent | amountMinor | buyQty+payQty | buyQty+bundlePriceMinor, scope: basket|targets, targets[{type,id}], zoneIds[], minBasketMinor, maxDiscountMinor, code, firstOrderOnly, stackable, startsAt, endsAt, usage limits, status }. Permission: pricing.';

create or replace function api.admin_create_coupons(p_promotion_id uuid, p_codes text[] default null, p_count integer default null, p_prefix text default 'VF')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k integer;
begin
  perform app.require_permission('pricing');
  if not exists (select 1 from app.promotions p where p.id = p_promotion_id) then perform app.raise_error('NOT_FOUND', 404, null, 'Offer not found.'); end if;
  if p_codes is not null then
    insert into app.coupons (promotion_id, code) select p_promotion_id, upper(regexp_replace(c, '\s', '', 'g')) from unnest(p_codes) c where trim(c) <> '';
  elsif coalesce(p_count, 0) between 1 and 1000 then
    for k in 1..p_count loop
      insert into app.coupons (promotion_id, code, max_uses)
      values (p_promotion_id, upper(regexp_replace(coalesce(p_prefix, 'VF'), '[^A-Za-z0-9]', '', 'g')) || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8)), 1);
    end loop;
  else
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('codes', 'count')), 'Enter codes, or how many single-use codes to generate (1–1000).');
  end if;
  update app.promotions set requires_coupon = true where id = p_promotion_id;
  perform app.audit('coupon.created', 'promotion', p_promotion_id::text, jsonb_build_object('codes', p_codes, 'count', p_count));
  return app.promotion_json(p_promotion_id);
exception
  when unique_violation then perform app.raise_error('CONFLICT', 409, null, 'One of those codes already exists.'); return null;
  when check_violation then perform app.raise_error('VALIDATION_FAILED', 400, null, 'Codes: 3–32 letters and numbers.'); return null;
end;
$$;
comment on function api.admin_create_coupons(uuid, text[], integer, text) is '@access staff Add your own codes, or generate single-use codes, for an offer. Permission: pricing.';

create or replace function api.admin_set_coupon_active(p_coupon_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo uuid;
begin
  perform app.require_permission('pricing');
  update app.coupons set is_active = p_active where id = p_coupon_id returning promotion_id into v_promo;
  if v_promo is null then perform app.raise_error('NOT_FOUND', 404, null, 'Code not found.'); end if;
  perform app.audit('coupon.' || case when p_active then 'enabled' else 'disabled' end, 'coupon', p_coupon_id::text, '{}'::jsonb);
  return app.promotion_json(v_promo);
end;
$$;
comment on function api.admin_set_coupon_active(uuid, boolean) is '@access staff Switch a promo code on or off. Permission: pricing.';

-- ── delivery ────────────────────────────────────────────────────────────────────────────────────
create or replace function app.zone_admin_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', z.id, 'code', z.code, 'name', z.name, 'label', z.display_label, 'minBasketMinor', z.min_basket_minor,
    'isActive', z.is_active, 'isPopular', z.is_popular, 'popularPosition', z.popular_position,
    'postcodes', (select coalesce(jsonb_agg(zp.postcode_prefix order by zp.postcode_prefix), '[]'::jsonb) from app.delivery_zone_postcodes zp where zp.zone_id = z.id),
    'fees', (select coalesce(jsonb_agg(jsonb_build_object('fromMinor', r.from_basket_minor, 'feeMinor', r.fee_minor) order by r.from_basket_minor), '[]'::jsonb)
               from app.delivery_fee_rules r where r.zone_id = z.id and tstzrange(r.valid_from, r.valid_to) @> now()),
    'windows', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'weekday', t.weekday, 'start', to_char(t.start_local, 'HH24:MI'), 'end', to_char(t.end_local, 'HH24:MI'),
                  'capacity', t.capacity, 'cutoffMinutes', t.cutoff_minutes_before, 'label', t.service_label, 'feeMinor', t.fee_minor, 'isActive', t.is_active)
                  order by t.weekday, t.start_local), '[]'::jsonb) from app.slot_templates t where t.zone_id = z.id),
    'ordersThisWeek', (select count(*)::int from app.orders o join app.delivery_slots s on s.id = o.slot_id where o.zone_id = z.id and s.starts_at between now() and now() + interval '7 days'
                         and o.status not in ('cancelled', 'pending_payment')))
  from app.delivery_zones z where z.id = p_id
$$;

create or replace function api.admin_list_zones()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('fleet_management') or app.has_permission('orders_dispatch')) then perform app.require_permission('fleet_management'); end if;
  return (select coalesce(jsonb_agg(app.zone_admin_json(z.id) order by z.popular_position nulls last, z.name), '[]'::jsonb) from app.delivery_zones z);
end;
$$;
comment on function api.admin_list_zones() is '@access staff Delivery areas with their postcodes, delivery charges and weekly time windows. Permission: fleet_management.';

create or replace function api.admin_save_zone(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid := nullif(p ->> 'id', '')::uuid;
  v_pc   text;
  v_bad  jsonb := '[]'::jsonb;
  v_taken jsonb := '[]'::jsonb;
begin
  perform app.require_permission('fleet_management');
  if v_id is null then
    if coalesce(trim(p ->> 'name'), '') = '' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('name')), 'Give the area a name.'); end if;
    insert into app.delivery_zones (code, name, display_label, location_id)
    values (upper(left(regexp_replace(coalesce(nullif(p ->> 'code', ''), p ->> 'name'), '[^A-Za-z0-9]+', '-', 'g'), 20)), trim(p ->> 'name'),
            coalesce(nullif(trim(p ->> 'label'), ''), trim(p ->> 'name')), app.default_location())
    returning id into v_id;
    -- new areas start with the same delivery charges and windows as the first area, so they work straight away
    insert into app.delivery_fee_rules (zone_id, from_basket_minor, fee_minor)
    select v_id, r.from_basket_minor, r.fee_minor from app.delivery_fee_rules r
     where r.zone_id = (select z.id from app.delivery_zones z where z.id <> v_id order by z.created_at limit 1) and tstzrange(r.valid_from, r.valid_to) @> now();
    insert into app.slot_templates (zone_id, weekday, start_local, end_local, capacity, cutoff_minutes_before, service_label, fee_minor)
    select v_id, t.weekday, t.start_local, t.end_local, t.capacity, t.cutoff_minutes_before, t.service_label, t.fee_minor from app.slot_templates t
     where t.zone_id = (select z.id from app.delivery_zones z where z.id <> v_id order by z.created_at limit 1);
  end if;
  update app.delivery_zones set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    display_label = coalesce(nullif(trim(p ->> 'label'), ''), display_label),
    min_basket_minor = case when p ? 'minBasketMinor' then nullif(p ->> 'minBasketMinor', '')::int else min_basket_minor end,
    is_active = coalesce((p ->> 'isActive')::boolean, is_active),
    is_popular = coalesce((p ->> 'isPopular')::boolean, is_popular),
    popular_position = case when coalesce((p ->> 'isPopular')::boolean, is_popular) then coalesce((p ->> 'popularPosition')::int, popular_position, 99) end
  where id = v_id;
  if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Area not found.'); end if;
  if p ? 'postcodes' then
    for v_pc in select upper(trim(x)) from jsonb_array_elements_text(p -> 'postcodes') x where trim(x) <> '' loop
      if v_pc !~ '^[A-Z]{1,2}[0-9][A-Z0-9]?( [0-9])?$' then v_bad := v_bad || to_jsonb(v_pc);
      elsif exists (select 1 from app.delivery_zone_postcodes zp where zp.postcode_prefix = v_pc and zp.zone_id <> v_id) then v_taken := v_taken || to_jsonb(v_pc);
      end if;
    end loop;
    if jsonb_array_length(v_bad) > 0 then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('invalidPostcodes', v_bad), 'Use postcode areas like AL10 or AL10 9.');
    end if;
    if jsonb_array_length(v_taken) > 0 then
      perform app.raise_error('CONFLICT', 409, jsonb_build_object('takenPostcodes', v_taken), 'Some postcode areas already belong to another delivery area.');
    end if;
    delete from app.delivery_zone_postcodes where zone_id = v_id;
    insert into app.delivery_zone_postcodes (postcode_prefix, zone_id)
    select distinct upper(trim(x)), v_id from jsonb_array_elements_text(p -> 'postcodes') x where trim(x) <> '';
  end if;
  perform app.generate_delivery_slots();
  perform app.audit('zone.saved', 'zone', v_id::text, p);
  return app.zone_admin_json(v_id);
exception
  when unique_violation then
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('fields', jsonb_build_array('code')), 'Another area already uses that short code.');
    return null;
  when check_violation or invalid_text_representation then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('name', 'minBasketMinor')), 'Use a name of at least 2 letters and a minimum order of £0 or more.');
    return null;
end;
$$;
comment on function api.admin_save_zone(jsonb) is '@access staff Add or change a delivery area: name, label, postcode areas (e.g. AL10), minimum order, shown as a popular area, active. Permission: fleet_management.';

-- Replaces the delivery charges of an area from now on (old charges stay in history).
create or replace function api.admin_set_zone_fees(p_zone_id uuid, p_fees jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  perform app.require_permission('fleet_management');
  if not exists (select 1 from app.delivery_zones z where z.id = p_zone_id) then perform app.raise_error('NOT_FOUND', 404, null, 'Area not found.'); end if;
  if jsonb_typeof(p_fees) <> 'array' or not exists (select 1 from jsonb_array_elements(p_fees) x where (x ->> 'fromMinor')::int = 0) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'NEED_FROM_ZERO'), 'Start with the charge for baskets from £0.');
  end if;
  -- charges that have not started yet (or started this very moment) are replaced; the rest are closed and kept as history
  delete from app.delivery_fee_rules where zone_id = p_zone_id and valid_from >= v_now;
  update app.delivery_fee_rules set valid_to = v_now where zone_id = p_zone_id and (valid_to is null or valid_to > v_now);
  insert into app.delivery_fee_rules (zone_id, from_basket_minor, fee_minor, valid_from)
  select p_zone_id, (x ->> 'fromMinor')::int, (x ->> 'feeMinor')::int, v_now from jsonb_array_elements(p_fees) x;
  perform app.audit('zone.fees_set', 'zone', p_zone_id::text, jsonb_build_object('fees', p_fees));
  return app.zone_admin_json(p_zone_id);
exception when unique_violation or check_violation or invalid_text_representation or exclusion_violation or not_null_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Each "from" amount once, with charges of £0 or more.');
  return null;
end;
$$;
comment on function api.admin_set_zone_fees(uuid, jsonb) is '@access staff Delivery charges for an area: [{ fromMinor: 0, feeMinor: 350 }, { fromMinor: 5000, feeMinor: 0 }] = £3.50, free from £50. Permission: fleet_management.';

-- Replaces the weekly delivery windows of an area; future slots that nobody booked follow the change.
create or replace function api.admin_set_zone_windows(p_zone_id uuid, p_windows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('fleet_management');
  if not exists (select 1 from app.delivery_zones z where z.id = p_zone_id) then perform app.raise_error('NOT_FOUND', 404, null, 'Area not found.'); end if;
  delete from app.slot_templates where zone_id = p_zone_id;
  insert into app.slot_templates (zone_id, weekday, start_local, end_local, capacity, cutoff_minutes_before, service_label, fee_minor, is_active)
  select p_zone_id, (x ->> 'weekday')::smallint, (x ->> 'start')::time, (x ->> 'end')::time, (x ->> 'capacity')::int,
         coalesce((x ->> 'cutoffMinutes')::int, 120), nullif(trim(x ->> 'label'), ''), nullif(x ->> 'feeMinor', '')::int, coalesce((x ->> 'isActive')::boolean, true)
    from jsonb_array_elements(p_windows) x;
  -- drop future slots nobody has booked; they are recreated from the new windows
  delete from app.delivery_slots s where s.zone_id = p_zone_id and s.starts_at > now() and s.reserved_count = 0
     and not exists (select 1 from app.slot_reservations r where r.slot_id = s.id)
     and not exists (select 1 from app.orders o where o.slot_id = s.id);
  perform app.generate_delivery_slots();
  perform app.audit('zone.windows_set', 'zone', p_zone_id::text, jsonb_build_object('windows', p_windows));
  return app.zone_admin_json(p_zone_id);
exception when unique_violation or check_violation or invalid_text_representation or invalid_datetime_format or not_null_violation or datetime_field_overflow then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Each window needs a day (1 = Monday … 7 = Sunday), start and end times (end after start), and how many orders fit. No two windows can start at the same time on the same day.');
  return null;
end;
$$;
comment on function api.admin_set_zone_windows(uuid, jsonb) is '@access staff Weekly delivery windows for an area: [{ weekday 1–7, start "08:00", end "10:00", capacity 20, cutoffMinutes 120, label, feeMinor }]. Permission: fleet_management.';

create or replace function api.admin_list_slots(p_zone_id uuid, p_from date default null, p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'Europe/London')::date);
begin
  if not (app.has_permission('fleet_management') or app.has_permission('orders_dispatch')) then perform app.require_permission('fleet_management'); end if;
  return (select coalesce(jsonb_agg(app.slot_json(s) || jsonb_build_object('status', s.status, 'booked', s.reserved_count,
            'orders', (select count(*)::int from app.orders o where o.slot_id = s.id and o.status not in ('cancelled', 'pending_payment'))) order by s.starts_at), '[]'::jsonb)
    from app.delivery_slots s where s.zone_id = p_zone_id
      and (s.starts_at at time zone 'Europe/London')::date between v_from and v_from + least(greatest(coalesce(p_days, 7), 1), 31) - 1);
end;
$$;
comment on function api.admin_list_slots(uuid, date, integer) is '@access staff Delivery slots for an area and dates, with bookings. Permission: fleet_management.';

create or replace function api.admin_update_slot(p_slot_id uuid, p_capacity integer default null, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.delivery_slots;
begin
  perform app.require_permission('fleet_management');
  select * into s from app.delivery_slots where id = p_slot_id for update;
  if s.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Slot not found.'); end if;
  if p_capacity is not null and p_capacity < s.reserved_count then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('booked', s.reserved_count), format('%s orders are already booked in this slot.', s.reserved_count));
  end if;
  if p_status is not null and p_status not in ('open', 'closed') then perform app.raise_error('VALIDATION_FAILED', 400, null, 'Open or closed.'); end if;
  update app.delivery_slots set capacity = coalesce(p_capacity, capacity), status = coalesce(p_status, status) where id = s.id returning * into s;
  perform app.audit('slot.updated', 'slot', s.id::text, jsonb_build_object('capacity', p_capacity, 'status', p_status));
  return app.slot_json(s) || jsonb_build_object('status', s.status, 'booked', s.reserved_count);
end;
$$;
comment on function api.admin_update_slot(uuid, integer, text) is '@access staff Change how many orders one slot takes, or close it (existing bookings stay). Permission: fleet_management.';

create or replace function api.admin_list_fleet()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('fleet_management') or app.has_permission('orders_dispatch')) then perform app.require_permission('fleet_management'); end if;
  return jsonb_build_object(
    'vans', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'code', v.code, 'name', v.name, 'isRefrigerated', v.is_refrigerated, 'isActive', v.is_active, 'isSample', v.is_sample) order by v.code), '[]'::jsonb) from app.vans v),
    'drivers', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.display_name, 'phone', d.phone_e164, 'isActive', d.is_active, 'isSample', d.is_sample,
                  'staffId', d.staff_id) order by d.display_name), '[]'::jsonb) from app.drivers d));
end;
$$;
comment on function api.admin_list_fleet() is '@access staff Vans and drivers. Permission: fleet_management.';

create or replace function api.admin_save_van(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform app.require_permission('fleet_management');
  if v_id is null then
    insert into app.vans (code, name, location_id) values (upper(trim(p ->> 'code')), trim(p ->> 'name'), app.default_location()) returning id into v_id;
  end if;
  update app.vans set code = coalesce(upper(nullif(trim(p ->> 'code'), '')), code), name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    is_refrigerated = coalesce((p ->> 'isRefrigerated')::boolean, is_refrigerated), is_active = coalesce((p ->> 'isActive')::boolean, is_active) where id = v_id;
  perform app.audit('van.saved', 'van', v_id::text, p);
  return api.admin_list_fleet();
exception when unique_violation or check_violation or not_null_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('code', 'name')), 'A van needs a name and a unique short code (e.g. #05).');
  return null;
end;
$$;
comment on function api.admin_save_van(jsonb) is '@access staff Add or change a van. Permission: fleet_management.';

create or replace function api.admin_save_driver(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_phone text;
begin
  perform app.require_permission('fleet_management');
  if coalesce(trim(p ->> 'phone'), '') <> '' then
    v_phone := app.normalise_phone_e164(p ->> 'phone', 'GB');
    if v_phone is null then perform app.raise_error('PHONE_INVALID', 400, null, 'Invalid phone number.'); end if;
  end if;
  if v_id is null then
    if coalesce(trim(p ->> 'name'), '') = '' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('name')), 'Enter the driver''s name.'); end if;
    insert into app.drivers (display_name) values (trim(p ->> 'name')) returning id into v_id;
  end if;
  update app.drivers set display_name = coalesce(nullif(trim(p ->> 'name'), ''), display_name),
    phone_e164 = case when p ? 'phone' then v_phone else phone_e164 end, is_active = coalesce((p ->> 'isActive')::boolean, is_active) where id = v_id;
  perform app.audit('driver.saved', 'driver', v_id::text, p - 'phone');
  return api.admin_list_fleet();
end;
$$;
comment on function api.admin_save_driver(jsonb) is '@access staff Add or change a driver. Permission: fleet_management.';

-- ── loyalty ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_get_loyalty()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('pricing');
  return jsonb_build_object(
    'enabled', coalesce((app.setting('loyalty_enabled'))::boolean, false),
    'pointsPerPound', coalesce((app.setting('loyalty_points_per_pound') #>> '{}')::int, 10),
    'pointValuePence', coalesce((app.setting('loyalty_point_value_pence') #>> '{}')::int, 1),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'minLifetimePoints', t.min_lifetime_points,
                'multiplier', t.earn_multiplier_bp / 10000.0, 'members', (select count(*)::int from app.loyalty_accounts a where a.tier_code = t.code)) order by t.min_lifetime_points), '[]'::jsonb) from app.loyalty_tiers t),
    'rewards', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'pointsCost', r.points_cost, 'isActive', r.is_active,
                  'amountMinor', p.amount_minor, 'minBasketMinor', p.min_basket_minor,
                  'redeemed', (select count(*)::int from app.coupons c where c.promotion_id = p.id and c.customer_id is not null)) order by r.points_cost), '[]'::jsonb)
                from app.loyalty_rewards r join app.promotions p on p.id = r.promotion_id),
    'totals', (select jsonb_build_object('members', count(*), 'pointsOutstanding', coalesce(sum(a.points_balance), 0)) from app.loyalty_accounts a));
end;
$$;
comment on function api.admin_get_loyalty() is '@access staff Loyalty set-up: earn rate, tiers, rewards and points outstanding. Permission: pricing.';

create or replace function api.admin_save_loyalty_tier(p_code text, p_name text, p_min_lifetime_points integer, p_multiplier numeric default 1, p_delete boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := app.slugify(coalesce(nullif(p_code, ''), p_name));
begin
  perform app.require_permission('pricing');
  if p_delete then
    if (select min(t.min_lifetime_points) from app.loyalty_tiers t) = (select t.min_lifetime_points from app.loyalty_tiers t where t.code = p_code) then
      perform app.raise_error('CONFLICT', 409, null, 'The starting tier cannot be deleted.');
    end if;
    update app.loyalty_accounts set tier_code = null where tier_code = p_code;
    delete from app.loyalty_tiers where code = p_code;
  else
    if coalesce(trim(p_name), '') = '' or p_min_lifetime_points < 0 or coalesce(p_multiplier, 1) <= 0 then
      perform app.raise_error('VALIDATION_FAILED', 400, null, 'A tier needs a name, points from 0, and a multiplier above 0 (1 = normal).');
    end if;
    insert into app.loyalty_tiers (code, name, min_lifetime_points, earn_multiplier_bp) values (replace(v_code, '-', '_'), trim(p_name), p_min_lifetime_points, round(coalesce(p_multiplier, 1) * 10000))
    on conflict (code) do update set name = excluded.name, min_lifetime_points = excluded.min_lifetime_points, earn_multiplier_bp = excluded.earn_multiplier_bp;
  end if;
  -- everyone's tier follows the new thresholds
  update app.loyalty_accounts a set tier_code = (select t.code from app.loyalty_tiers t where t.min_lifetime_points <= a.lifetime_points order by t.min_lifetime_points desc limit 1);
  perform app.audit('loyalty.tier_saved', 'loyalty_tier', coalesce(p_code, v_code), jsonb_build_object('name', p_name, 'min', p_min_lifetime_points, 'delete', p_delete));
  return api.admin_get_loyalty();
exception
  when unique_violation then
    perform app.raise_error('CONFLICT', 409, null, 'Two tiers cannot start at the same number of points.');
    return null;
  when check_violation then
    perform app.raise_error('VALIDATION_FAILED', 400, null, 'Start the tier name with a letter.');
    return null;
end;
$$;
comment on function api.admin_save_loyalty_tier(text, text, integer, numeric, boolean) is '@access staff Add, change or delete a loyalty tier (name, lifetime points to reach it, points multiplier). Permission: pricing.';

-- A reward is simply "£X off orders over £Y for N points"; its offer is created behind the scenes.
create or replace function api.admin_save_loyalty_reward(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('pricing');
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_promo uuid;
  v_title text := nullif(trim(p ->> 'title'), '');
begin
  if v_id is null then
    if v_title is null or coalesce((p ->> 'pointsCost')::int, 0) <= 0 or coalesce((p ->> 'amountMinor')::int, 0) <= 0 then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('title', 'pointsCost', 'amountMinor')), 'Enter a name, the points it costs and the money off.');
    end if;
    insert into app.promotions (name, label, type, scope, amount_minor, min_basket_minor, requires_coupon, status, created_by)
    values ('Loyalty reward — ' || v_title, v_title, 'fixed_off', 'basket', (p ->> 'amountMinor')::int, nullif(p ->> 'minBasketMinor', '')::int, true, 'active', v_staff)
    returning id into v_promo;
    insert into app.loyalty_rewards (title, points_cost, promotion_id) values (v_title, (p ->> 'pointsCost')::int, v_promo) returning id into v_id;
  else
    select r.promotion_id into v_promo from app.loyalty_rewards r where r.id = v_id;
    if v_promo is null then perform app.raise_error('NOT_FOUND', 404, null, 'Reward not found.'); end if;
    update app.loyalty_rewards set title = coalesce(v_title, title), points_cost = coalesce((p ->> 'pointsCost')::int, points_cost),
      is_active = coalesce((p ->> 'isActive')::boolean, is_active) where id = v_id;
    update app.promotions set label = coalesce(v_title, label), amount_minor = coalesce((p ->> 'amountMinor')::int, amount_minor),
      min_basket_minor = case when p ? 'minBasketMinor' then nullif(p ->> 'minBasketMinor', '')::int else min_basket_minor end,
      status = case when (p ->> 'isActive')::boolean is false then 'paused' when (p ->> 'isActive')::boolean then 'active' else status end
    where id = v_promo;
  end if;
  perform app.audit('loyalty.reward_saved', 'loyalty_reward', v_id::text, p);
  return api.admin_get_loyalty();
exception when check_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Points and amounts must be above zero.');
  return null;
end;
$$;
comment on function api.admin_save_loyalty_reward(jsonb) is '@access staff A reward: { title, pointsCost, amountMinor (money off), minBasketMinor, isActive }. Permission: pricing.';

-- ── staff, roles, permissions ───────────────────────────────────────────────────────────────────
create or replace function api.admin_list_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('user_management');
  return jsonb_build_object(
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'fullName', s.full_name, 'email', s.email, 'role', s.role_code,
                'roleName', (select r.name from app.roles r where r.code = s.role_code), 'status', s.status, 'hasLogin', s.user_id is not null,
                'invitePending', s.user_id is not null and exists (select 1 from auth.users u where u.id = s.user_id and u.email_confirmed_at is null),
                'lastSignInAt', (select u.last_sign_in_at from auth.users u where u.id = s.user_id),
                'lastActiveAt', s.last_active_at, 'isSample', s.is_sample, 'isMe', s.id = app.current_staff_id()) order by s.status = 'deactivated', s.full_name), '[]'::jsonb) from app.staff s),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name, 'description', r.description,
                'permissions', (select coalesce(jsonb_agg(rp.permission_code order by rp.permission_code), '[]'::jsonb) from app.role_permissions rp where rp.role_code = r.code)) order by r.position), '[]'::jsonb) from app.roles r),
    'permissions', (select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'description', p.description) order by p.code), '[]'::jsonb) from app.permissions p));
end;
$$;
comment on function api.admin_list_staff() is '@access staff Staff (with whether their invitation is still waiting), roles and what each role may do. Permission: user_management.';

create or replace function app.store_manager_guard(p_staff_id uuid, p_new_role text, p_new_status text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (select 1 from app.staff s where s.id = p_staff_id and s.role_code = 'store_manager' and s.status <> 'deactivated')
     and (p_new_role is distinct from 'store_manager' or p_new_status = 'deactivated')
     and (select count(*) from app.staff s where s.role_code = 'store_manager' and s.status <> 'deactivated' and s.user_id is not null) <= 1 then
    perform app.raise_error('LAST_STORE_MANAGER', 409, null, 'There must always be at least one active Store Manager.');
  end if;
end;
$$;

create or replace function api.admin_update_staff(p_id uuid, p_role text default null, p_status text default null, p_full_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.staff;
begin
  perform app.require_permission('user_management');
  select * into s from app.staff where id = p_id for update;
  if s.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Staff member not found.'); end if;
  if p_status is not null and p_status not in ('active', 'on_break', 'offline', 'deactivated') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('status')), 'Unknown status.');
  end if;
  perform app.store_manager_guard(s.id, coalesce(p_role, s.role_code), coalesce(p_status, s.status));
  update app.staff set role_code = coalesce(p_role, role_code), status = coalesce(p_status, status),
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name) where id = s.id;
  perform app.audit('staff.updated', 'staff', s.id::text, jsonb_build_object('role', p_role, 'status', p_status));
  return api.admin_list_staff();
exception when foreign_key_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('role')), 'Unknown role.');
  return null;
end;
$$;
comment on function api.admin_update_staff(uuid, text, text, text) is '@access staff Change someone''s role or status, or deactivate them (they can no longer use the portal). The last Store Manager is protected. Permission: user_management.';

create or replace function api.staff_set_my_status(p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.current_staff_id();
begin
  if v_staff is null then perform app.require_permission('order_status'); end if;
  if p_status not in ('active', 'on_break', 'offline') then perform app.raise_error('VALIDATION_FAILED', 400, null, 'Active, on break or offline.'); end if;
  update app.staff set status = p_status, last_active_at = now() where id = v_staff;
  return jsonb_build_object('status', p_status);
end;
$$;
comment on function api.staff_set_my_status(text) is '@access staff Set your own status (active, on break, offline).';

-- Sends (or re-sends) a Supabase Auth invitation email; returns the auth user id.
create or replace function app.send_staff_invite(p_email text, p_full_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_key  text := app.vault_secret('supabase_secret_key');
  v_url  text := rtrim(app.setting('supabase_url') #>> '{}', '/');
  v_site text := rtrim(coalesce(app.setting('site_url') #>> '{}', ''), '/');
  r      extensions.http_response;
begin
  if v_key is null or v_url is null then
    perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('reason', 'AUTH_ADMIN_NOT_CONFIGURED'), 'Invitations are not set up yet (ask your developer to run vault:sync).');
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  r := extensions.http(('POST', v_url || '/auth/v1/invite?redirect_to=' || extensions.urlencode(v_site || '/admin'),
        array[extensions.http_header('apikey', v_key)], 'application/json',
        jsonb_build_object('email', p_email, 'data', jsonb_build_object('full_name', p_full_name))::text)::extensions.http_request);
  if r.status not between 200 and 299 then
    perform app.raise_error('DEPENDENCY_UNAVAILABLE', 503, jsonb_build_object('service', 'auth', 'status', r.status, 'message', left(coalesce(r.content, ''), 200)),
      'The invitation email could not be sent. Please try again in a few minutes.');
  end if;
  return (r.content::jsonb ->> 'id')::uuid;
end;
$$;

-- Adds someone to the store portal. If they already have a confirmed account (for example as a customer) they are
-- linked straight away and sign in with their usual password; otherwise Supabase emails them a link to set one.
create or replace function api.admin_invite_staff(p_full_name text, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff  uuid := app.require_permission('user_management');
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_name   text := trim(coalesce(p_full_name, ''));
  v_user   uuid;
  v_linked boolean := false;
begin
  if v_name = '' or length(v_name) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('fullName', 'email')), 'Enter their name and a valid email.');
  end if;
  if not exists (select 1 from app.roles ro where ro.code = p_role) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('role')), 'Choose a role.');
  end if;
  if exists (select 1 from app.staff s where s.email = v_email) then
    perform app.raise_error('CONFLICT', 409, null, 'This person is already on the staff list.');
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null limit 1;
  if v_user is not null then
    v_linked := true;
  else
    v_user := app.send_staff_invite(v_email, v_name);
  end if;
  insert into app.staff_invitations (email, full_name, role_code, invited_by, auth_user_id, status, accepted_at)
  values (v_email, v_name, p_role, v_staff, v_user, case when v_linked then 'accepted' else 'pending' end, case when v_linked then now() end);
  insert into app.staff (user_id, email, full_name, role_code, status, invited_by) values (v_user, v_email, v_name, p_role, 'offline', v_staff);
  perform app.audit('staff.invited', 'staff', v_email, jsonb_build_object('role', p_role, 'linkedExistingAccount', v_linked));
  return api.admin_list_staff() || jsonb_build_object('invited', jsonb_build_object('email', v_email, 'emailSent', not v_linked));
end;
$$;
comment on function api.admin_invite_staff(text, text, text) is '@access staff Add someone to the store portal with a role. New people get an email to set a password; people who already have an account can sign in straight away. Permission: user_management.';

create or replace function api.admin_resend_staff_invite(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s      app.staff;
  v_user uuid;
begin
  perform app.require_permission('user_management');
  select * into s from app.staff where id = p_staff_id for update;
  if s.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Staff member not found.'); end if;
  if s.status = 'deactivated' then perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'DEACTIVATED'), 'Reactivate them first.'); end if;
  if exists (select 1 from auth.users u where u.id = s.user_id and u.email_confirmed_at is not null) then
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('reason', 'ALREADY_ACCEPTED'), 'They have already set up their login.');
  end if;
  if s.user_id is null then
    select u.id into v_user from auth.users u where lower(u.email) = s.email and u.email_confirmed_at is not null limit 1;
  end if;
  if v_user is null then v_user := app.send_staff_invite(s.email, s.full_name); end if;
  update app.staff set user_id = coalesce(user_id, v_user) where id = s.id;
  perform app.audit('staff.invite_resent', 'staff', s.id::text, '{}'::jsonb);
  return api.admin_list_staff();
end;
$$;
comment on function api.admin_resend_staff_invite(uuid) is '@access staff Send the invitation email again. Permission: user_management.';

create or replace function api.admin_set_role_permissions(p_role text, p_permissions text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('full_access');
  if not exists (select 1 from app.roles r where r.code = p_role) then perform app.raise_error('NOT_FOUND', 404, null, 'Role not found.'); end if;
  if p_role = 'store_manager' and not 'full_access' = any (p_permissions) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'STORE_MANAGER_FULL_ACCESS'), 'The Store Manager role always keeps full access.');
  end if;
  delete from app.role_permissions where role_code = p_role;
  insert into app.role_permissions (role_code, permission_code) select p_role, x from unnest(p_permissions) x on conflict do nothing;
  perform app.audit('role.permissions_set', 'role', p_role, jsonb_build_object('permissions', p_permissions));
  return api.admin_list_staff();
exception when foreign_key_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Unknown permission.');
  return null;
end;
$$;
comment on function api.admin_set_role_permissions(text, text[]) is '@access staff Choose what a role is allowed to do. Store Manager always keeps full access. Permission: full_access.';

-- ── audit log ───────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_list_audit_log(p_entity_type text default null, p_q text default null, p_limit integer default 100, p_before bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('full_access');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'action', a.action, 'entityType', a.entity_type, 'entityId', a.entity_id,
            'actorType', a.actor_type, 'actor', case when a.actor_type = 'staff' then (select s.full_name from app.staff s where s.id = a.actor_id) else a.actor_type end,
            'changes', a.changes) order by a.id desc), '[]'::jsonb)
    from (select * from app.audit_log x
           where (p_entity_type is null or x.entity_type = p_entity_type)
             and (p_q is null or x.action ilike '%' || p_q || '%' or x.entity_id ilike '%' || p_q || '%')
             and (p_before is null or x.id < p_before)
           order by x.id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) a);
end;
$$;
comment on function api.admin_list_audit_log(text, text, integer, bigint) is '@access staff Who changed what and when. Permission: full_access.';

-- ── tidy from 0026 ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('api.admin_dashboard(text)'::regprocedure);
begin
  v_def := replace(v_def, E'  v_days   integer;\n', '');
  v_def := replace(v_def, E'  v_days := v_today - v_from + 1;\n', '');
  if v_def like '%v_days%' then raise exception 'admin_dashboard tidy did not apply'; end if;
  execute v_def;
end;
$$;

insert into app.app_settings (key, value, description) values
  ('supabase_url', 'null', 'Supabase project address, used to send staff invitations. Set by the developer (vault:sync).')
on conflict (key) do nothing;

-- substitution_pricing = original_price was documented but charged the substitute's price; make it charge the ordered item's price
do $$
declare
  v_def text := pg_get_functiondef('api.staff_record_pick(uuid,uuid,jsonb)'::regprocedure);
  v_old text := 'case when v_rule = ''lower_of_two'' then least(v_subst, l.unit_price_minor) else v_subst end';
begin
  if position(v_old in v_def) = 0 then raise exception 'staff_record_pick substitution rule not found'; end if;
  execute replace(v_def, v_old, 'case v_rule when ''lower_of_two'' then least(v_subst, l.unit_price_minor) when ''original_price'' then l.unit_price_minor else v_subst end');
end;
$$;

select app.harden();
