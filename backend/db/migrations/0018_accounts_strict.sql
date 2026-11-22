-- 0018 Account reads check the caller first, explicitly. In 0017 some used
--      "where customer_id = app.require_customer()", which leaves it to the planner when (or whether,
--      on an empty table) the check runs. Now every one raises PROFILE_REQUIRED / UNAUTHENTICATED
--      up front. Also adds explicit returns after error handlers (plpgsql_check).

create or replace function api.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.require_customer();
begin
  return (select app.customer_json(c) || jsonb_build_object('consents', app.consent_state(c.id)) from app.customers c where c.id = v_id);
end;
$$;
comment on function api.get_my_profile() is '@access authenticated The signed-in customer''s name, email, phone and consent choices.';

create or replace function api.get_my_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.require_customer();
begin
  return coalesce((
    select jsonb_build_object('substitutionDefault', p.substitution_default, 'ripeness', p.ripeness,
      'smsDeliveryAlerts', p.sms_delivery_alerts, 'emailInvoices', p.email_invoices,
      'doorstepBell', p.doorstep_bell, 'ecoPackaging', p.eco_packaging)
    from app.customer_preferences p where p.customer_id = v_id),
    jsonb_build_object('substitutionDefault', 'allow', 'ripeness', 'ready', 'smsDeliveryAlerts', true,
      'emailInvoices', true, 'doorstepBell', true, 'ecoPackaging', true));
end;
$$;
comment on function api.get_my_preferences() is '@access authenticated Delivery and substitution preferences.';

create or replace function api.list_my_addresses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.require_customer();
begin
  return (select coalesce(jsonb_agg(app.address_json(a) order by a.is_default desc, a.created_at), '[]'::jsonb)
            from app.addresses a where a.customer_id = v_id and a.deleted_at is null);
end;
$$;
comment on function api.list_my_addresses() is '@access authenticated Saved delivery addresses, default first, each with whether it is in a delivery area.';

create or replace function api.list_my_wishlist()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.require_customer();
begin
  return (select coalesce(jsonb_agg(app.product_summary_json(w.product_id, null, null) order by w.created_at desc), '[]'::jsonb)
            from app.wishlist_items w join app.products p on p.id = w.product_id and p.status = 'active'
           where w.customer_id = v_id);
end;
$$;
comment on function api.list_my_wishlist() is '@access authenticated Saved items, newest first.';

create or replace function api.clear_my_wishlist()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.require_customer();
begin
  delete from app.wishlist_items where customer_id = v_id;
  return '[]'::jsonb;
end;
$$;
comment on function api.clear_my_wishlist() is '@access authenticated Remove every saved product.';

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
  return null;
end;
$$;
comment on function api.update_my_preferences(jsonb) is '@access authenticated Change any of the preferences returned by get_my_preferences.';

-- save_my_address: same body as 0017 plus an explicit return after the error handler.
do $$
declare
  v_def text := pg_get_functiondef('api.save_my_address(jsonb)'::regprocedure);
begin
  v_def := replace(v_def,
    E'  perform app.raise_error(''VALIDATION_FAILED'', 400, null, ''Some address details are too long or invalid.'');\nend;',
    E'  perform app.raise_error(''VALIDATION_FAILED'', 400, null, ''Some address details are too long or invalid.'');\n  return null;\nend;');
  if v_def not like '%return null;%' then raise exception 'save_my_address patch did not apply'; end if;
  execute v_def;
end;
$$;
comment on function api.save_my_address(jsonb) is '@access authenticated Add (no id) or update an address: { id?, label, fullName, line1, line2, city, postcode, phone, deliveryNotes, isDefault }. The first address becomes the default.';

select app.harden();
