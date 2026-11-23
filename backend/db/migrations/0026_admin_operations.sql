-- 0026 Admin: operations (Phase 8). Dashboard & analytics, inventory (adjust, reorder levels,
--      stock-count CSV, history), suppliers and purchase orders (draft → send → receive), automatic
--      low-stock draft purchase orders, customers (search, profile, status, notes, points, messages),
--      review moderation, message templates and the outbox. Plus tidy-ups from 0025.

insert into app.app_settings (key, value, description) values
  ('auto_purchase_orders_enabled', 'true', 'Each morning, create DRAFT purchase orders for products at or below their reorder level (you review and send them).')
on conflict (key) do nothing;

insert into app.message_templates (code, channel, locale, name, is_marketing, subject, body) values
  ('purchase_order', 'email', 'en-GB', 'Supplier: purchase order', false, 'Purchase order {{number}} from Varam Foods',
   E'Hello {{contact}},\n\nPlease supply the following for delivery to {{location}}{{expected}}:\n\n{{lines}}\n\n{{notes}}\n\nThank you,\nVaram Foods'),
  ('customer_message', 'email', 'en-GB', 'Customer: message from the team', false, '{{subject}}', E'{{body}}\n\nVaram Foods')
on conflict (code, channel, locale) do nothing;

-- ── tidy-ups from 0025 ──────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('app.parse_csv(text)'::regprocedure);
  v_def := replace(v_def, E'  r      text[] := ''{}'';', E'  r      text[] := ''{}''::text[];');
  v_def := replace(v_def, E'      r := ''{}'';', E'      r := ''{}''::text[];');
  execute v_def;

  v_def := pg_get_functiondef('api.admin_import_products_csv(text,boolean)'::regprocedure);
  v_def := replace(v_def, E'  r         text[];\n', '');
  v_def := replace(v_def, E'  k         integer;\n', '');
  v_def := replace(v_def, E'    ''errors'', v_errors);', E'    ''errors'', v_errors,\n    ''importedBy'', (select s.full_name from app.staff s where s.id = v_staff));');
  execute v_def;

  v_def := pg_get_functiondef('api.admin_save_product(jsonb)'::regprocedure);
  v_def := replace(v_def, E'  v_new     app.products;\n', '');
  v_def := replace(v_def, E'  where id = v_id\n  returning * into v_new;', E'  where id = v_id;');
  if v_def like '%v_new%' then raise exception 'admin_save_product tidy did not apply'; end if;
  execute v_def;
end;
$$;

-- ── dashboard ───────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_dashboard(p_range text default '7d')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff  uuid := app.current_staff_id();
  v_money  boolean := app.has_permission('financials');
  v_tz     text := 'Europe/London';
  v_today  date := (now() at time zone 'Europe/London')::date;
  v_from   date;
  v_days   integer;
begin
  if v_staff is null then perform app.require_permission('order_status'); end if;
  v_from := case p_range when 'today' then v_today when '30d' then v_today - 29 when 'year' then date_trunc('year', v_today)::date else v_today - 6 end;
  v_days := v_today - v_from + 1;
  return jsonb_build_object(
    'range', coalesce(p_range, '7d'), 'from', v_from, 'to', v_today, 'showsMoney', v_money,
    'kpis', (select jsonb_build_object(
        'orders', count(*) filter (where o.status not in ('pending_payment', 'cancelled')),
        'revenue', case when v_money then app.money(coalesce(sum(coalesce(o.captured_minor, 0) - o.refunded_minor) filter (where o.captured_minor is not null), 0), 'GBP') end,
        'expectedRevenue', case when v_money then app.money(coalesce(sum(o.est_total_minor) filter (where o.status in ('placed', 'picking', 'picked')), 0), 'GBP') end,
        'averageBasket', case when v_money then app.money(coalesce(round(avg(coalesce(o.final_total_minor, o.est_total_minor)) filter (where o.status not in ('pending_payment', 'cancelled'))), 0)::bigint, 'GBP') end,
        'cancelled', count(*) filter (where o.status = 'cancelled'),
        'refunded', case when v_money then app.money(coalesce(sum(o.refunded_minor), 0), 'GBP') end)
      from app.orders o where (o.created_at at time zone v_tz)::date between v_from and v_today and not o.is_sample),
    'newCustomers', (select count(*) from app.customers c where (c.created_at at time zone v_tz)::date between v_from and v_today and not c.is_sample),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('date', d.day,
                'orders', (select count(*) from app.orders o where (o.created_at at time zone v_tz)::date = d.day and o.status not in ('pending_payment', 'cancelled') and not o.is_sample),
                'revenue', case when v_money then (select coalesce(sum(coalesce(o.captured_minor, o.est_total_minor)), 0) from app.orders o
                                                   where (o.created_at at time zone v_tz)::date = d.day and o.status not in ('pending_payment', 'cancelled') and not o.is_sample) end)
                order by d.day), '[]'::jsonb)
              from generate_series(v_from, v_today, interval '1 day') g(x) cross join lateral (select g.x::date as day) d),
    'topProducts', (select coalesce(jsonb_agg(x.j order by x.units desc), '[]'::jsonb) from (
        select jsonb_build_object('name', l.name_snapshot, 'units', sum(coalesce(l.quantity_ordered, 1)),
                 'revenue', case when v_money then app.money(sum(coalesce(l.final_gross_minor, l.est_gross_minor) - coalesce(l.final_discount_minor, l.est_discount_minor)), 'GBP') end) as j,
               sum(coalesce(l.quantity_ordered, 1)) as units
          from app.order_lines l join app.orders o on o.id = l.order_id
         where l.line_type = 'product' and o.status not in ('pending_payment', 'cancelled') and not o.is_sample
           and (o.created_at at time zone v_tz)::date between v_from and v_today
         group by l.name_snapshot order by sum(coalesce(l.quantity_ordered, 1)) desc limit 8) x),
    'categoryShare', case when v_money then (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'revenue', app.money(x.rev, 'GBP')) order by x.rev desc), '[]'::jsonb) from (
        select coalesce(ct.name, 'Other') as name, sum(coalesce(l.final_gross_minor, l.est_gross_minor) - coalesce(l.final_discount_minor, l.est_discount_minor))::bigint as rev
          from app.order_lines l join app.orders o on o.id = l.order_id
          left join app.products p on p.id = l.product_id
          left join app.category_translations ct on ct.category_id = p.primary_category_id and ct.locale = 'en-GB'
         where l.line_type = 'product' and o.status not in ('pending_payment', 'cancelled') and not o.is_sample
           and (o.created_at at time zone v_tz)::date between v_from and v_today
         group by 1) x) end,
    'statusCounts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select o.status, count(*) as n from app.orders o where not o.is_sample group by o.status) x),
    'attention', jsonb_build_object(
      'toPickToday', (select count(*) from app.orders o join app.delivery_slots s on s.id = o.slot_id
                        where o.status in ('placed', 'picking') and (s.starts_at at time zone v_tz)::date <= v_today),
      'toDispatch', (select count(*) from app.orders o where o.status = 'paid'),
      'onTheRoad', (select count(*) from app.orders o where o.status = 'out_for_delivery'),
      'awaitingPayment', (select count(*) from app.orders o where o.status = 'pending_payment'),
      'pendingRefunds', (select count(*) from app.refund_requests q where q.status = 'pending'),
      'lowStock', (select count(*) from app.stock_levels sl join app.products p on p.id = sl.product_id and p.status = 'active'
                     where sl.on_hand - sl.reserved <= sl.reorder_point),
      'outOfStock', (select count(*) from app.stock_levels sl join app.products p on p.id = sl.product_id and p.status = 'active'
                       where sl.on_hand - sl.reserved <= 0),
      'foodInfoMissing', (select count(*) from app.products p where p.status = 'active' and p.is_food and not app.food_info_complete(p.id)),
      'reviewsToModerate', (select count(*) from app.reviews r where r.status = 'pending'),
      'draftPurchaseOrders', (select count(*) from app.purchase_orders po where po.status = 'draft'),
      'emailsWaiting', (select count(*) from app.outbound_messages m where m.status = 'queued'),
      'emailsFailed', (select count(*) from app.outbound_messages m where m.status = 'failed'),
      'paymentMode', coalesce(app.setting('payment_mode') #>> '{}', 'stripe'),
      'emailReady', app.vault_secret('resend_api_key') is not null and coalesce(app.setting('email_from') #>> '{}', '') <> '',
      'invoicesReady', coalesce((app.setting('invoices_enabled'))::boolean, false) and exists (select 1 from app.legal_entities le where le.is_active)));
end;
$$;
comment on function api.admin_dashboard(text) is '@access staff Home screen of the admin: sales figures (money only with the financials permission), trend, top products, category share and a "needs attention" list. Range: today, 7d, 30d, year.';

-- ── inventory ───────────────────────────────────────────────────────────────────────────────────
create or replace function app.default_location()
returns uuid
language sql
stable
set search_path = ''
as $$ select fl.id from app.fulfilment_locations fl where fl.is_active order by fl.created_at limit 1 $$;

create or replace function api.admin_list_inventory(p_filter text default 'all', p_q text default null, p_location_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_loc uuid := coalesce(p_location_id, app.default_location());
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read')) then perform app.require_permission('inventory_read'); end if;
  return (select coalesce(jsonb_agg(x.j order by x.sort, x.name), '[]'::jsonb) from (
    select t.name, case when coalesce(sl.on_hand - sl.reserved, 0) <= 0 then 0 when coalesce(sl.on_hand - sl.reserved, 0) <= coalesce(sl.reorder_point, 0) then 1 else 2 end as sort,
           jsonb_build_object(
             'productId', p.id, 'name', t.name, 'sku', p.sku, 'status', p.status, 'saleUnit', p.sale_unit, 'packSize', p.pack_size_label,
             'image', (select app.image_json(pi.url, pi.alt) from app.product_images pi where pi.product_id = p.id order by pi.position limit 1),
             'onHand', coalesce(sl.on_hand, 0), 'reserved', coalesce(sl.reserved, 0), 'available', coalesce(sl.on_hand - sl.reserved, 0),
             'reorderPoint', coalesce(sl.reorder_point, 0), 'optimalStock', sl.optimal_stock, 'unitCostMinor', sl.unit_cost_minor,
             'lastRestockedAt', sl.last_restocked_at,
             'state', case when coalesce(sl.on_hand - sl.reserved, 0) <= 0 then 'out' when coalesce(sl.on_hand - sl.reserved, 0) <= coalesce(sl.reorder_point, 0) then 'low' else 'ok' end,
             'supplier', (select jsonb_build_object('id', s.id, 'name', s.name) from app.product_suppliers ps join app.suppliers s on s.id = ps.supplier_id
                           where ps.product_id = p.id order by ps.is_primary desc limit 1),
             'onOrder', (select coalesce(sum(pol.quantity_ordered - pol.quantity_received), 0) from app.purchase_order_lines pol join app.purchase_orders po on po.id = pol.purchase_order_id
                          where pol.product_id = p.id and po.status in ('sent', 'partially_received'))) as j
      from app.products p
      left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB'
      left join app.stock_levels sl on sl.product_id = p.id and sl.location_id = v_loc
     where p.status <> 'archived'
       and (v_q is null or t.name ilike '%' || v_q || '%' or p.sku ilike '%' || v_q || '%')
       and (coalesce(p_filter, 'all') = 'all'
            or (p_filter = 'low' and coalesce(sl.on_hand - sl.reserved, 0) <= coalesce(sl.reorder_point, 0))
            or (p_filter = 'out' and coalesce(sl.on_hand - sl.reserved, 0) <= 0))) x);
end;
$$;
comment on function api.admin_list_inventory(text, text, uuid) is '@access staff Stock for every product at the hub: on hand, held for orders, available, reorder level, on order. Filter: all, low, out. Permission: inventory_read.';

create or replace function api.admin_adjust_stock(p_product_id uuid, p_delta integer, p_reason text, p_note text default null, p_location_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc uuid := coalesce(p_location_id, app.default_location());
  v_new integer;
begin
  perform app.require_permission('inventory');
  if p_reason not in ('restock', 'adjustment', 'write_off', 'return') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('reason')), 'Choose why the stock changed.');
  end if;
  if coalesce(p_delta, 0) = 0 then perform app.raise_error('QUANTITY_INVALID', 400, null, 'Enter how many to add or remove.'); end if;
  if not exists (select 1 from app.products p where p.id = p_product_id) then perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.'); end if;
  insert into app.stock_levels (location_id, product_id) values (v_loc, p_product_id) on conflict do nothing;
  update app.stock_levels set on_hand = on_hand + p_delta, updated_at = now(),
    last_restocked_at = case when p_delta > 0 and p_reason = 'restock' then now() else last_restocked_at end
   where location_id = v_loc and product_id = p_product_id and on_hand + p_delta >= reserved
  returning on_hand into v_new;
  if v_new is null then
    perform app.raise_error('NEGATIVE_STOCK', 409, jsonb_build_object('reserved', (select sl.reserved from app.stock_levels sl where sl.location_id = v_loc and sl.product_id = p_product_id)),
      'You cannot remove stock that is held for orders.');
  end if;
  insert into app.stock_movements (location_id, product_id, delta, reason, affects, actor_user_id, note)
  values (v_loc, p_product_id, p_delta, p_reason, 'on_hand', auth.uid(), nullif(trim(coalesce(p_note, '')), ''));
  perform app.audit('stock.adjusted', 'product', p_product_id::text, jsonb_build_object('delta', p_delta, 'reason', p_reason));
  return (select x from jsonb_array_elements(api.admin_list_inventory('all', null, v_loc)) x where x ->> 'productId' = p_product_id::text);
end;
$$;
comment on function api.admin_adjust_stock(uuid, integer, text, text, uuid) is '@access staff Add (+) or remove (−) stock with a reason: restock, adjustment, write_off, return. Permission: inventory.';

create or replace function api.admin_set_stock_levels(p_product_id uuid, p_reorder_point integer, p_optimal_stock integer default null, p_unit_cost_minor integer default null, p_location_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc uuid := coalesce(p_location_id, app.default_location());
begin
  perform app.require_permission('inventory');
  if coalesce(p_reorder_point, 0) < 0 or (p_optimal_stock is not null and p_optimal_stock < coalesce(p_reorder_point, 0)) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('reorderPoint', 'optimalStock')), 'The ideal level must be at least the reorder level.');
  end if;
  insert into app.stock_levels (location_id, product_id) values (v_loc, p_product_id) on conflict do nothing;
  update app.stock_levels set reorder_point = coalesce(p_reorder_point, 0), optimal_stock = p_optimal_stock,
    unit_cost_minor = coalesce(p_unit_cost_minor, unit_cost_minor), updated_at = now()
   where location_id = v_loc and product_id = p_product_id;
  perform app.audit('stock.levels_set', 'product', p_product_id::text, jsonb_build_object('reorderPoint', p_reorder_point, 'optimal', p_optimal_stock));
  return (select x from jsonb_array_elements(api.admin_list_inventory('all', null, v_loc)) x where x ->> 'productId' = p_product_id::text);
exception when foreign_key_violation then
  perform app.raise_error('PRODUCT_NOT_FOUND', 404, null, 'Product not found.');
  return null;
end;
$$;
comment on function api.admin_set_stock_levels(uuid, integer, integer, integer, uuid) is '@access staff Reorder level (when to buy more), ideal stock (how much to buy up to) and unit cost. Permission: inventory.';

create or replace function api.admin_list_stock_movements(p_product_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read')) then perform app.require_permission('inventory_read'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('at', m.created_at, 'delta', m.delta, 'reason', m.reason, 'affects', m.affects, 'note', m.note,
            'order', (select o.number from app.orders o where m.ref_type = 'order' and o.id = m.ref_id),
            'by', (select s.full_name from app.staff s where s.user_id = m.actor_user_id)) order by m.created_at desc, m.id desc), '[]'::jsonb)
    from (select * from app.stock_movements x where x.product_id = p_product_id order by x.created_at desc, x.id desc limit least(greatest(coalesce(p_limit, 50), 1), 500)) m);
end;
$$;
comment on function api.admin_list_stock_movements(uuid, integer) is '@access staff Every stock change for a product (orders, picks, restocks, counts). Permission: inventory_read.';

-- Stock count upload: "sku,on_hand" (counted quantity). All-or-nothing; dry run first.
create or replace function api.admin_import_stock_csv(p_csv text, p_dry_run boolean default true, p_file_name text default 'stock.csv', p_location_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc     uuid := coalesce(p_location_id, app.default_location());
  v_rows    jsonb;
  v_head    text[];
  v_isku    integer;
  v_iqty    integer;
  v_errors  jsonb := '[]'::jsonb;
  v_plan    jsonb := '[]'::jsonb;
  v_sku     text;
  v_qty     text;
  v_prod    uuid;
  v_cur     integer;
  v_res     integer;
  v_item    jsonb;
begin
  perform app.require_permission('inventory');
  select jsonb_agg(to_jsonb(x)) into v_rows from app.parse_csv(p_csv) x;
  if coalesce(jsonb_array_length(v_rows), 0) < 2 then
    perform app.raise_error('CSV_INVALID', 400, jsonb_build_object('reason', 'NO_ROWS'), 'The file needs a header row (sku,on_hand) and at least one line.');
  end if;
  select array_agg(lower(trim(h)) order by i) into v_head from jsonb_array_elements_text(v_rows -> 0) with ordinality e(h, i);
  v_isku := array_position(v_head, 'sku');
  v_iqty := array_position(v_head, 'on_hand');
  if v_isku is null or v_iqty is null then
    perform app.raise_error('CSV_INVALID', 400, jsonb_build_object('reason', 'COLUMNS'), 'The header must include "sku" and "on_hand".');
  end if;
  for i in 1..jsonb_array_length(v_rows) - 1 loop
    v_sku := upper(trim(coalesce(v_rows -> i ->> (v_isku - 1), '')));
    v_qty := trim(coalesce(v_rows -> i ->> (v_iqty - 1), ''));
    if v_sku = '' and v_qty = '' then continue; end if;
    select p.id into v_prod from app.products p where p.sku = v_sku;
    if v_prod is null then
      v_errors := v_errors || jsonb_build_object('row', i + 1, 'field', 'sku', 'message', 'Unknown SKU "' || v_sku || '"');
      continue;
    end if;
    if v_qty !~ '^[0-9]{1,9}$' then
      v_errors := v_errors || jsonb_build_object('row', i + 1, 'field', 'on_hand', 'message', 'Use a whole number (0 or more)');
      continue;
    end if;
    select coalesce(sl.on_hand, 0), coalesce(sl.reserved, 0) into v_cur, v_res from app.stock_levels sl where sl.location_id = v_loc and sl.product_id = v_prod;
    if v_qty::int < coalesce(v_res, 0) then
      v_errors := v_errors || jsonb_build_object('row', i + 1, 'field', 'on_hand', 'message', format('%s are held for orders; the count cannot be lower', v_res));
      continue;
    end if;
    v_plan := v_plan || jsonb_build_object('productId', v_prod, 'sku', v_sku, 'from', coalesce(v_cur, 0), 'to', v_qty::int);
  end loop;
  if jsonb_array_length(v_errors) = 0 and not coalesce(p_dry_run, true) then
    for v_item in select * from jsonb_array_elements(v_plan) loop
      insert into app.stock_levels (location_id, product_id) values (v_loc, (v_item ->> 'productId')::uuid) on conflict do nothing;
      update app.stock_levels set on_hand = (v_item ->> 'to')::int, updated_at = now() where location_id = v_loc and product_id = (v_item ->> 'productId')::uuid;
      if (v_item ->> 'to')::int <> (v_item ->> 'from')::int then
        insert into app.stock_movements (location_id, product_id, delta, reason, affects, actor_user_id, note)
        values (v_loc, (v_item ->> 'productId')::uuid, (v_item ->> 'to')::int - (v_item ->> 'from')::int, 'csv_import', 'on_hand', auth.uid(), p_file_name);
      end if;
    end loop;
  end if;
  if not coalesce(p_dry_run, true) then
    insert into app.stock_imports (location_id, file_name, uploaded_by, status, rows_total, rows_applied, errors)
    values (v_loc, left(coalesce(p_file_name, 'stock.csv'), 200), auth.uid(), case when jsonb_array_length(v_errors) = 0 then 'applied' else 'rejected' end,
            jsonb_array_length(v_plan) + jsonb_array_length(v_errors), case when jsonb_array_length(v_errors) = 0 then jsonb_array_length(v_plan) else 0 end, v_errors);
    perform app.audit('stock.csv_import', 'stock', coalesce(p_file_name, 'stock.csv'), jsonb_build_object('rows', jsonb_array_length(v_plan), 'errors', jsonb_array_length(v_errors)));
  end if;
  return jsonb_build_object('dryRun', coalesce(p_dry_run, true) or jsonb_array_length(v_errors) > 0, 'rows', jsonb_array_length(v_plan) + jsonb_array_length(v_errors),
    'changes', (select count(*) from jsonb_array_elements(v_plan) x where (x ->> 'to')::int <> (x ->> 'from')::int),
    'preview', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select * from jsonb_array_elements(v_plan) limit 200) y(x)),
    'errors', v_errors);
end;
$$;
comment on function api.admin_import_stock_csv(text, boolean, text, uuid) is '@access staff Upload a stock count ("sku,on_hand"). Check first (dry run), then apply. All-or-nothing. Permission: inventory.';

-- ── suppliers & purchase orders ─────────────────────────────────────────────────────────────────
create or replace function api.admin_list_suppliers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read')) then perform app.require_permission('inventory_read'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'category', s.category, 'leadTimeDays', s.lead_time_days,
            'contactPerson', s.contact_person, 'email', s.email, 'phone', s.phone_e164, 'rating', s.rating, 'contactsVerified', s.contacts_verified,
            'isActive', s.is_active, 'isSample', s.is_sample,
            'productCount', (select count(*)::int from app.product_suppliers ps where ps.supplier_id = s.id),
            'openOrders', (select count(*)::int from app.purchase_orders po where po.supplier_id = s.id and po.status in ('draft', 'sent', 'partially_received'))) order by s.name), '[]'::jsonb)
    from app.suppliers s);
end;
$$;
comment on function api.admin_list_suppliers() is '@access staff Suppliers with product counts and open orders. Permission: inventory_read.';

create or replace function api.admin_save_supplier(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_phone text;
begin
  perform app.require_permission('inventory');
  if coalesce(trim(p ->> 'phone'), '') <> '' then
    v_phone := app.normalise_phone_e164(p ->> 'phone', 'GB');
    if v_phone is null then perform app.raise_error('PHONE_INVALID', 400, null, 'Invalid phone number.'); end if;
  end if;
  if v_id is null then
    if coalesce(trim(p ->> 'name'), '') = '' then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('name')), 'Give the supplier a name.'); end if;
    insert into app.suppliers (code, name)
    values ('SUP-' || lpad(((select coalesce(max(substring(s.code from 5)::int), 0) from app.suppliers s) + 1)::text, 2, '0'), trim(p ->> 'name'))
    returning id into v_id;
  end if;
  update app.suppliers set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    category = case when p ? 'category' then nullif(trim(p ->> 'category'), '') else category end,
    lead_time_days = case when p ? 'leadTimeDays' then nullif(p ->> 'leadTimeDays', '')::int else lead_time_days end,
    contact_person = case when p ? 'contactPerson' then nullif(trim(p ->> 'contactPerson'), '') else contact_person end,
    email = case when p ? 'email' then nullif(lower(trim(p ->> 'email')), '') else email end,
    phone_e164 = case when p ? 'phone' then v_phone else phone_e164 end,
    contacts_verified = coalesce((p ->> 'contactsVerified')::boolean, contacts_verified),
    is_active = coalesce((p ->> 'isActive')::boolean, is_active)
  where id = v_id;
  if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Supplier not found.'); end if;
  perform app.audit('supplier.saved', 'supplier', v_id::text, p);
  return (select x from jsonb_array_elements(api.admin_list_suppliers()) x where x ->> 'id' = v_id::text);
exception when check_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('email')), 'Check the email address.');
  return null;
end;
$$;
comment on function api.admin_save_supplier(jsonb) is '@access staff Add or change a supplier. Tick "contacts verified" only after checking the email/phone. Permission: inventory.';

create or replace function api.admin_set_product_supplier(p_product_id uuid, p_supplier_id uuid, p_supplier_sku text default null, p_unit_cost_minor integer default null,
                                                         p_is_primary boolean default true, p_remove boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('inventory');
  if p_remove then
    delete from app.product_suppliers where product_id = p_product_id and supplier_id = p_supplier_id;
  else
    if p_is_primary then update app.product_suppliers set is_primary = false where product_id = p_product_id; end if;
    insert into app.product_suppliers (product_id, supplier_id, supplier_sku, unit_cost_minor, is_primary)
    values (p_product_id, p_supplier_id, nullif(trim(coalesce(p_supplier_sku, '')), ''), p_unit_cost_minor, coalesce(p_is_primary, true))
    on conflict (product_id, supplier_id) do update set supplier_sku = excluded.supplier_sku, unit_cost_minor = excluded.unit_cost_minor, is_primary = excluded.is_primary;
  end if;
  perform app.audit('product.supplier_set', 'product', p_product_id::text, jsonb_build_object('supplier', p_supplier_id, 'remove', p_remove));
  return app.admin_product_json(p_product_id);
exception when foreign_key_violation then
  perform app.raise_error('NOT_FOUND', 404, null, 'Product or supplier not found.');
  return null;
end;
$$;
comment on function api.admin_set_product_supplier(uuid, uuid, text, integer, boolean, boolean) is '@access staff Link a product to a supplier (their code, cost, main supplier) or remove the link. Permission: inventory.';

create or replace function app.purchase_order_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', po.id, 'number', po.number, 'status', po.status, 'supplier', jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email, 'contactsVerified', s.contacts_verified),
    'location', (select fl.name from app.fulfilment_locations fl where fl.id = po.location_id), 'locationId', po.location_id,
    'expectedAt', po.expected_at, 'notes', po.notes, 'currency', po.currency, 'isSample', po.is_sample,
    'createdBy', (select st.full_name from app.staff st where st.id = po.created_by), 'createdAt', po.created_at, 'sentAt', po.sent_at, 'receivedAt', po.received_at,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('productId', l.product_id, 'name', t.name, 'sku', p.sku, 'quantityOrdered', l.quantity_ordered,
                'quantityReceived', l.quantity_received, 'unitCostMinor', l.unit_cost_minor) order by t.name), '[]'::jsonb)
              from app.purchase_order_lines l join app.products p on p.id = l.product_id
              left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB' where l.purchase_order_id = po.id),
    'total', app.money((select coalesce(sum(l.quantity_ordered * l.unit_cost_minor), 0) from app.purchase_order_lines l where l.purchase_order_id = po.id), po.currency))
  from app.purchase_orders po join app.suppliers s on s.id = po.supplier_id where po.id = p_id
$$;

create or replace function api.admin_list_purchase_orders(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('inventory') or app.has_permission('inventory_read')) then perform app.require_permission('inventory_read'); end if;
  return (select coalesce(jsonb_agg(app.purchase_order_json(po.id) order by po.created_at desc), '[]'::jsonb)
    from app.purchase_orders po where p_status is null or po.status = p_status);
end;
$$;
comment on function api.admin_list_purchase_orders(text) is '@access staff Purchase orders by status: draft, sent, partially_received, received, cancelled. Permission: inventory_read.';

create or replace function api.admin_save_purchase_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('inventory');
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_po    app.purchase_orders;
begin
  if v_id is not null then
    select * into v_po from app.purchase_orders where id = v_id for update;
    if v_po.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Purchase order not found.'); end if;
    if v_po.status <> 'draft' then perform app.raise_error('CONFLICT', 409, jsonb_build_object('status', v_po.status), 'Only draft orders can be changed.'); end if;
  else
    insert into app.purchase_orders (supplier_id, location_id, created_by)
    values ((p ->> 'supplierId')::uuid, coalesce(nullif(p ->> 'locationId', '')::uuid, app.default_location()), v_staff)
    returning id into v_id;
  end if;
  update app.purchase_orders set
    supplier_id = coalesce(nullif(p ->> 'supplierId', '')::uuid, supplier_id),
    expected_at = case when p ? 'expectedAt' then nullif(p ->> 'expectedAt', '')::timestamptz else expected_at end,
    notes = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else notes end
  where id = v_id;
  if p ? 'lines' then
    delete from app.purchase_order_lines where purchase_order_id = v_id;
    insert into app.purchase_order_lines (purchase_order_id, product_id, quantity_ordered, unit_cost_minor)
    select v_id, (x ->> 'productId')::uuid, (x ->> 'quantity')::int, coalesce((x ->> 'unitCostMinor')::int, 0)
      from jsonb_array_elements(p -> 'lines') x where coalesce((x ->> 'quantity')::int, 0) > 0;
  end if;
  perform app.audit('purchase_order.saved', 'purchase_order', v_id::text, p);
  return app.purchase_order_json(v_id);
exception when foreign_key_violation or not_null_violation or invalid_text_representation or check_violation or unique_violation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Choose a supplier and add each product once with a quantity above zero.');
  return null;
end;
$$;
comment on function api.admin_save_purchase_order(jsonb) is '@access staff Create or edit a draft purchase order: { supplierId, expectedAt, notes, lines: [{ productId, quantity, unitCostMinor }] }. Permission: inventory.';

create or replace function api.admin_send_purchase_order(p_id uuid, p_email_supplier boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  po app.purchase_orders;
  s  app.suppliers;
begin
  perform app.require_permission('inventory');
  select * into po from app.purchase_orders where id = p_id for update;
  if po.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Purchase order not found.'); end if;
  if po.status <> 'draft' then perform app.raise_error('CONFLICT', 409, jsonb_build_object('status', po.status), 'This order was already sent.'); end if;
  if not exists (select 1 from app.purchase_order_lines l where l.purchase_order_id = po.id) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'NO_LINES'), 'Add at least one product.');
  end if;
  select * into s from app.suppliers where id = po.supplier_id;
  if p_email_supplier then
    if s.email is null or not s.contacts_verified then
      perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'SUPPLIER_CONTACT_NOT_VERIFIED'), 'Verify the supplier''s email first (Suppliers), or mark it sent without emailing.');
    end if;
    perform app.queue_message('purchase_order', 'email', s.email, jsonb_build_object(
      'number', po.number, 'contact', coalesce(s.contact_person, s.name),
      'location', (select fl.name from app.fulfilment_locations fl where fl.id = po.location_id),
      'expected', case when po.expected_at is not null then ' by ' || to_char(po.expected_at at time zone 'Europe/London', 'Dy DD Mon') else '' end,
      'lines', (select string_agg(l.quantity_ordered || ' × ' || coalesce(ps.supplier_sku, p.sku) || ' ' || coalesce(t.name, ''), E'\n' order by t.name)
                  from app.purchase_order_lines l join app.products p on p.id = l.product_id
                  left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB'
                  left join app.product_suppliers ps on ps.product_id = p.id and ps.supplier_id = po.supplier_id
                 where l.purchase_order_id = po.id),
      'notes', coalesce(po.notes, '')));
  end if;
  update app.purchase_orders set status = 'sent', sent_at = now() where id = po.id;
  perform app.audit('purchase_order.sent', 'purchase_order', po.id::text, jsonb_build_object('emailed', p_email_supplier));
  return app.purchase_order_json(po.id);
end;
$$;
comment on function api.admin_send_purchase_order(uuid, boolean) is '@access staff Send a draft purchase order (emails the supplier when their contact is verified). Permission: inventory.';

create or replace function api.admin_receive_purchase_order(p_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  po   app.purchase_orders;
  x    jsonb;
  l    app.purchase_order_lines;
  v_q  integer;
begin
  perform app.require_permission('inventory');
  select * into po from app.purchase_orders where id = p_id for update;
  if po.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Purchase order not found.'); end if;
  if po.status not in ('sent', 'partially_received') then
    perform app.raise_error('CONFLICT', 409, jsonb_build_object('status', po.status), 'Only sent orders can be received.');
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select * into l from app.purchase_order_lines where purchase_order_id = po.id and product_id = (x ->> 'productId')::uuid for update;
    v_q := coalesce((x ->> 'quantityReceived')::int, 0);
    if l.id is null or v_q < 0 or l.quantity_received + v_q > l.quantity_ordered then
      perform app.raise_error('QUANTITY_INVALID', 400, jsonb_build_object('productId', x ->> 'productId'), 'Received quantity cannot be more than ordered.');
    end if;
    if v_q = 0 then continue; end if;
    update app.purchase_order_lines set quantity_received = quantity_received + v_q where id = l.id;
    insert into app.stock_levels (location_id, product_id) values (po.location_id, l.product_id) on conflict do nothing;
    update app.stock_levels set on_hand = on_hand + v_q, last_restocked_at = now(), updated_at = now(),
      unit_cost_minor = coalesce(nullif(l.unit_cost_minor, 0), unit_cost_minor)
     where location_id = po.location_id and product_id = l.product_id;
    insert into app.stock_movements (location_id, product_id, delta, reason, affects, ref_type, ref_id, actor_user_id)
    values (po.location_id, l.product_id, v_q, 'po_receipt', 'on_hand', 'purchase_order', po.id, auth.uid());
  end loop;
  update app.purchase_orders set
    status = case when not exists (select 1 from app.purchase_order_lines pl where pl.purchase_order_id = po.id and pl.quantity_received < pl.quantity_ordered)
                  then 'received' else 'partially_received' end,
    received_at = case when not exists (select 1 from app.purchase_order_lines pl where pl.purchase_order_id = po.id and pl.quantity_received < pl.quantity_ordered)
                       then now() else received_at end
  where id = po.id;
  perform app.audit('purchase_order.received', 'purchase_order', po.id::text, jsonb_build_object('lines', p_lines));
  return app.purchase_order_json(po.id);
exception when invalid_text_representation then
  perform app.raise_error('VALIDATION_FAILED', 400, null, 'Invalid quantities.');
  return null;
end;
$$;
comment on function api.admin_receive_purchase_order(uuid, jsonb) is '@access staff Book in a delivery: [{ productId, quantityReceived }]. Stock goes up straight away. Permission: inventory.';

create or replace function api.admin_cancel_purchase_order(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('inventory');
  update app.purchase_orders set status = 'cancelled', cancelled_at = now() where id = p_id and status in ('draft', 'sent');
  if not found then perform app.raise_error('CONFLICT', 409, null, 'Only draft or sent orders that have not been received can be cancelled.'); end if;
  perform app.audit('purchase_order.cancelled', 'purchase_order', p_id::text, '{}'::jsonb);
  return app.purchase_order_json(p_id);
end;
$$;
comment on function api.admin_cancel_purchase_order(uuid) is '@access staff Cancel a purchase order that has not been received. Permission: inventory.';

-- Low-stock drafts: one draft per supplier for products at/below reorder level and not already on order.
create or replace function app.generate_reorder_drafts(p_actor uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_loc  uuid := app.default_location();
  r      record;
  v_po   uuid;
  v_n    integer := 0;
begin
  for r in
    select ps.supplier_id, jsonb_agg(jsonb_build_object('productId', sl.product_id,
             'quantity', greatest(coalesce(sl.optimal_stock, sl.reorder_point * 2) - (sl.on_hand - sl.reserved), 1),
             'unitCostMinor', coalesce(ps.unit_cost_minor, sl.unit_cost_minor, 0))) as lines
      from app.stock_levels sl
      join app.products p on p.id = sl.product_id and p.status = 'active'
      join lateral (select x.* from app.product_suppliers x join app.suppliers s on s.id = x.supplier_id and s.is_active
                     where x.product_id = sl.product_id order by x.is_primary desc limit 1) ps on true
     where sl.location_id = v_loc and sl.reorder_point > 0 and sl.on_hand - sl.reserved <= sl.reorder_point
       and not exists (select 1 from app.purchase_order_lines pol join app.purchase_orders po on po.id = pol.purchase_order_id
                        where pol.product_id = sl.product_id and po.status in ('draft', 'sent', 'partially_received'))
     group by ps.supplier_id
  loop
    insert into app.purchase_orders (supplier_id, location_id, created_by, notes)
    values (r.supplier_id, v_loc, p_actor, 'Created automatically for low stock. Check quantities before sending.')
    returning id into v_po;
    insert into app.purchase_order_lines (purchase_order_id, product_id, quantity_ordered, unit_cost_minor)
    select v_po, (x ->> 'productId')::uuid, (x ->> 'quantity')::int, (x ->> 'unitCostMinor')::int from jsonb_array_elements(r.lines) x;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function api.admin_generate_reorder_drafts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('inventory');
  v_n     integer;
begin
  v_n := app.generate_reorder_drafts(v_staff);
  perform app.audit('purchase_order.auto_drafts', 'purchase_order', 'auto', jsonb_build_object('created', v_n));
  return jsonb_build_object('created', v_n, 'drafts', api.admin_list_purchase_orders('draft'));
end;
$$;
comment on function api.admin_generate_reorder_drafts() is '@access staff Create draft purchase orders now for everything at or below its reorder level (grouped by main supplier). Permission: inventory.';

select cron.schedule('auto-reorder-drafts', '30 6 * * *',
  $$ select app.generate_reorder_drafts() where coalesce((app.setting('auto_purchase_orders_enabled'))::boolean, false) $$);

-- ── customers ───────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_list_customers(p_q text default null, p_status text default null, p_limit integer default 50, p_cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := coalesce(nullif(p_cursor, '')::int, 0);
  v_q      text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not (app.has_permission('customer_messaging') or app.has_permission('order_status') or app.has_permission('financials')) then
    perform app.require_permission('customer_messaging');
  end if;
  return (with f as (
      select c.* from app.customers c
       where c.anonymised_at is null and (p_status is null or c.status = p_status)
         and (v_q is null or concat_ws(' ', c.first_name, c.last_name) ilike '%' || v_q || '%' or c.email ilike '%' || v_q || '%' or c.phone_e164 ilike '%' || v_q || '%')
    )
    select jsonb_build_object('total', (select count(*) from f),
      'nextCursor', case when v_offset + v_limit < (select count(*) from f) then (v_offset + v_limit)::text end,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', concat_ws(' ', c.first_name, c.last_name), 'email', c.email, 'phone', c.phone_e164, 'status', c.status,
          'memberSince', c.member_since, 'isSample', c.is_sample, 'hasLogin', c.user_id is not null,
          'orderCount', (select count(*)::int from app.orders o where o.customer_id = c.id and o.status not in ('pending_payment', 'cancelled')),
          'totalSpent', app.money((select coalesce(sum(coalesce(o.captured_minor, 0) - o.refunded_minor), 0) from app.orders o where o.customer_id = c.id), 'GBP'),
          'lastOrderAt', (select max(o.created_at) from app.orders o where o.customer_id = c.id),
          'points', (select a.points_balance from app.loyalty_accounts a where a.customer_id = c.id),
          'tier', (select t.name from app.loyalty_accounts a join app.loyalty_tiers t on t.code = a.tier_code where a.customer_id = c.id),
          'marketingEmail', coalesce((app.consent_state(c.id) -> 'marketing_email' ->> 'granted')::boolean, false)) order by c.created_at desc), '[]'::jsonb)
        from (select * from f order by f.created_at desc limit v_limit offset v_offset) c)));
end;
$$;
comment on function api.admin_list_customers(text, text, integer, text) is '@access staff Customers with order count, spend, points and marketing consent. Search name/email/phone; filter active, vip, flagged. Permission: customer_messaging.';

create or replace function api.admin_get_customer(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('customer_messaging') or app.has_permission('order_status') or app.has_permission('financials')) then
    perform app.require_permission('customer_messaging');
  end if;
  if not exists (select 1 from app.customers c where c.id = p_id) then perform app.raise_error('NOT_FOUND', 404, null, 'Customer not found.'); end if;
  return (select (select x from jsonb_array_elements(api.admin_list_customers(c.email, null, 1) -> 'items') x where x ->> 'id' = c.id::text)
    || jsonb_build_object(
      'internalNotes', c.internal_notes,
      'consents', app.consent_state(c.id),
      'addresses', (select coalesce(jsonb_agg(app.address_json(a) order by a.is_default desc), '[]'::jsonb) from app.addresses a where a.customer_id = c.id and a.deleted_at is null),
      'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'orderNumber', o.number, 'status', o.status, 'createdAt', o.created_at,
                    'total', app.money(coalesce(o.final_total_minor, o.est_total_minor), o.currency)) order by o.created_at desc), '[]'::jsonb) from app.orders o where o.customer_id = c.id),
      'loyalty', (select jsonb_build_object('balance', a.points_balance, 'lifetime', a.lifetime_points, 'tier', a.tier_code,
                    'history', (select coalesce(jsonb_agg(jsonb_build_object('points', t.points, 'reason', t.reason, 'note', t.note, 'at', t.created_at) order by t.created_at desc), '[]'::jsonb)
                                  from (select * from app.loyalty_transactions lt where lt.customer_id = c.id order by lt.created_at desc limit 30) t))
                  from app.loyalty_accounts a where a.customer_id = c.id),
      'messages', (select coalesce(jsonb_agg(jsonb_build_object('channel', m.channel, 'subject', m.subject, 'status', m.status, 'template', m.template_code,
                    'sentBy', (select s.full_name from app.staff s where s.id = m.sent_by), 'at', m.created_at) order by m.created_at desc), '[]'::jsonb)
                   from app.outbound_messages m where m.customer_id = c.id),
      'reviews', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'body', r.body, 'status', r.status, 'at', r.created_at)), '[]'::jsonb)
                    from app.reviews r where r.customer_id = c.id))
    from app.customers c where c.id = p_id);
end;
$$;
comment on function api.admin_get_customer(uuid) is '@access staff One customer: profile, consents, addresses, orders, points history, messages, reviews. Permission: customer_messaging.';

create or replace function api.admin_update_customer(p_id uuid, p_status text default null, p_internal_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('customer_messaging');
  if p_status is not null and p_status not in ('active', 'vip', 'flagged') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('status')), 'Status must be active, vip or flagged.');
  end if;
  update app.customers set status = coalesce(p_status, status),
    internal_notes = case when p_internal_notes is null then internal_notes else nullif(trim(p_internal_notes), '') end
  where id = p_id and anonymised_at is null;
  if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Customer not found.'); end if;
  perform app.audit('customer.updated', 'customer', p_id::text, jsonb_build_object('status', p_status, 'notesChanged', p_internal_notes is not null));
  return api.admin_get_customer(p_id);
end;
$$;
comment on function api.admin_update_customer(uuid, text, text) is '@access staff Set a customer''s status (active, vip, flagged) and private notes (never shown to the customer). Permission: customer_messaging.';

create or replace function api.admin_adjust_loyalty(p_customer_id uuid, p_points integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('financials');
  a       app.loyalty_accounts;
begin
  if coalesce(p_points, 0) = 0 or coalesce(trim(p_reason), '') = '' then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('points', 'reason')), 'Enter points (+ or −) and a reason.');
  end if;
  insert into app.loyalty_accounts (customer_id) values (p_customer_id) on conflict do nothing;
  select * into a from app.loyalty_accounts where customer_id = p_customer_id for update;
  if a.points_balance + p_points < 0 then
    perform app.raise_error('INSUFFICIENT_POINTS', 422, jsonb_build_object('balance', a.points_balance), 'That would make the balance negative.');
  end if;
  insert into app.loyalty_transactions (customer_id, points, reason, created_by, note) values (p_customer_id, p_points, 'adjustment', v_staff, left(trim(p_reason), 200));
  update app.loyalty_accounts set points_balance = points_balance + p_points,
    lifetime_points = lifetime_points + greatest(p_points, 0),
    tier_code = (select t.code from app.loyalty_tiers t where t.min_lifetime_points <= a.lifetime_points + greatest(p_points, 0) order by t.min_lifetime_points desc limit 1),
    updated_at = now() where customer_id = p_customer_id;
  perform app.audit('loyalty.adjusted', 'customer', p_customer_id::text, jsonb_build_object('points', p_points, 'reason', p_reason));
  return api.admin_get_customer(p_customer_id);
exception when foreign_key_violation then
  perform app.raise_error('NOT_FOUND', 404, null, 'Customer not found.');
  return null;
end;
$$;
comment on function api.admin_adjust_loyalty(uuid, integer, text) is '@access staff Give or take loyalty points with a reason (e.g. goodwill). Permission: financials.';

create or replace function api.admin_send_customer_message(p_customer_id uuid, p_channel text, p_subject text, p_body text, p_order_id uuid default null, p_is_marketing boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('customer_messaging');
  c       app.customers;
  v_to    text;
  v_id    uuid;
begin
  select * into c from app.customers where id = p_customer_id and anonymised_at is null;
  if c.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Customer not found.'); end if;
  if p_channel not in ('email', 'sms', 'whatsapp') or coalesce(trim(p_body), '') = '' or (p_channel = 'email' and coalesce(trim(p_subject), '') = '') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('channel', 'subject', 'body')), 'Choose how to send it and write the message (emails need a subject).');
  end if;
  if p_is_marketing and not coalesce((app.consent_state(c.id) -> ('marketing_' || p_channel) ->> 'granted')::boolean, false) then
    perform app.raise_error('CONSENT_MISSING', 403, jsonb_build_object('channel', p_channel), 'This customer has not agreed to marketing by ' || p_channel || '.');
  end if;
  v_to := case when p_channel = 'email' then c.email else c.phone_e164 end;
  if v_to is null then perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('reason', 'NO_' || upper(p_channel) || '_ADDRESS'), 'No contact details for that channel.'); end if;
  insert into app.outbound_messages (customer_id, order_id, channel, template_code, to_address, subject, body, is_marketing, sent_by)
  values (c.id, p_order_id, p_channel, 'customer_message', v_to, nullif(trim(coalesce(p_subject, '')), ''), trim(p_body), coalesce(p_is_marketing, false), v_staff)
  returning id into v_id;
  perform app.audit('customer.messaged', 'customer', c.id::text, jsonb_build_object('channel', p_channel, 'marketing', p_is_marketing));
  return jsonb_build_object('id', v_id, 'status', 'queued');
end;
$$;
comment on function api.admin_send_customer_message(uuid, text, text, text, uuid, boolean) is '@access staff Send a customer an email, SMS or WhatsApp (queued; SMS/WhatsApp go out once a provider is connected). Marketing needs their consent. Permission: customer_messaging.';

-- ── reviews ─────────────────────────────────────────────────────────────────────────────────────
create or replace function api.admin_list_reviews(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('customer_messaging');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'rating', r.rating, 'body', r.body, 'displayName', r.display_name,
            'isVerified', r.is_verified, 'isSample', r.is_sample, 'createdAt', r.created_at,
            'product', (select jsonb_build_object('id', p.id, 'name', t.name, 'slug', p.slug) from app.products p left join app.product_translations t on t.product_id = p.id and t.locale = 'en-GB' where p.id = r.product_id),
            'moderatedBy', (select s.full_name from app.staff s where s.id = r.moderated_by), 'moderatedAt', r.moderated_at) order by r.created_at desc), '[]'::jsonb)
    from app.reviews r where p_status is null or r.status = p_status);
end;
$$;
comment on function api.admin_list_reviews(text) is '@access staff Reviews waiting for a decision (or by status). Permission: customer_messaging.';

create or replace function api.admin_moderate_review(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('customer_messaging');
begin
  if p_status not in ('approved', 'rejected', 'pending') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('status')), 'Approve or reject.');
  end if;
  update app.reviews set status = p_status, moderated_by = v_staff, moderated_at = now() where id = p_id;
  if not found then perform app.raise_error('NOT_FOUND', 404, null, 'Review not found.'); end if;
  perform app.audit('review.' || p_status, 'review', p_id::text, '{}'::jsonb);
  return api.admin_list_reviews('pending');
end;
$$;
comment on function api.admin_moderate_review(uuid, text) is '@access staff Approve (shows on the site and counts in ratings) or reject a review. Permission: customer_messaging.';

-- ── message templates & outbox ──────────────────────────────────────────────────────────────────
create or replace function api.admin_list_message_templates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('customer_messaging') or app.has_permission('content')) then perform app.require_permission('customer_messaging'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('code', m.code, 'channel', m.channel, 'locale', m.locale, 'name', m.name, 'isMarketing', m.is_marketing,
            'subject', m.subject, 'body', m.body, 'updatedAt', m.updated_at,
            'placeholders', (select coalesce(jsonb_agg(distinct x[1]), '[]'::jsonb) from regexp_matches(coalesce(m.subject, '') || ' ' || m.body, '\{\{([a-z_]+)\}\}', 'g') x))
            order by m.code, m.channel), '[]'::jsonb) from app.message_templates m);
end;
$$;
comment on function api.admin_list_message_templates() is '@access staff Every email/SMS the shop sends, with the {{placeholders}} each one uses. Permission: customer_messaging.';

create or replace function api.admin_save_message_template(p_code text, p_channel text, p_subject text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old app.message_templates;
  v_missing text[];
begin
  if not (app.has_permission('customer_messaging') or app.has_permission('content')) then perform app.require_permission('customer_messaging'); end if;
  select * into v_old from app.message_templates where code = p_code and channel = p_channel and locale = 'en-GB' for update;
  if v_old.code is null then perform app.raise_error('NOT_FOUND', 404, null, 'Template not found.'); end if;
  if coalesce(trim(p_body), '') = '' or (p_channel = 'email' and coalesce(trim(p_subject), '') = '') then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('fields', jsonb_build_array('subject', 'body')), 'Emails need a subject and a message.');
  end if;
  -- keep every placeholder the system fills in (links, order numbers…), so nothing is lost
  select array_agg(distinct x[1]) into v_missing
    from regexp_matches(coalesce(v_old.subject, '') || ' ' || v_old.body, '\{\{([a-z_]+)\}\}', 'g') x
   where position('{{' || x[1] || '}}' in coalesce(p_subject, '') || ' ' || p_body) = 0
     and x[1] in ('confirm_url', 'unsubscribe_url', 'order_url', 'order_number', 'checkout_url', 'basket_url', 'product_url');
  if v_missing is not null then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('missingPlaceholders', to_jsonb(v_missing)), 'Keep these placeholders in the message: ' || array_to_string(v_missing, ', '));
  end if;
  update app.message_templates set subject = nullif(trim(coalesce(p_subject, '')), ''), body = p_body, updated_at = now()
   where code = p_code and channel = p_channel and locale = 'en-GB';
  perform app.audit('message_template.saved', 'message_template', p_code || ':' || p_channel, '{}'::jsonb);
  return api.admin_list_message_templates();
end;
$$;
comment on function api.admin_save_message_template(text, text, text, text) is '@access staff Edit the wording of an email/SMS. Required links and numbers ({{placeholders}}) must stay in. Permission: customer_messaging.';

create or replace function api.admin_list_outbox(p_status text default null, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('customer_messaging') or app.has_permission('full_access')) then perform app.require_permission('customer_messaging'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'channel', m.channel, 'template', m.template_code, 'to', m.to_address, 'subject', m.subject,
            'body', m.body, 'status', m.status, 'attempts', m.attempts, 'error', m.error, 'isMarketing', m.is_marketing,
            'order', (select o.number from app.orders o where o.id = m.order_id), 'createdAt', m.created_at, 'sentAt', m.sent_at) order by m.created_at desc), '[]'::jsonb)
    from (select * from app.outbound_messages x where p_status is null or x.status = p_status order by x.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) m);
end;
$$;
comment on function api.admin_list_outbox(text, integer) is '@access staff Every email/SMS queued or sent, with errors. Permission: customer_messaging.';

create or replace function api.admin_retry_message(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('customer_messaging');
  update app.outbound_messages set status = 'queued', attempts = 0, error = null where id = p_id and status in ('failed', 'suppressed');
  if not found then perform app.raise_error('CONFLICT', 409, null, 'Only failed messages can be retried.'); end if;
  return api.admin_list_outbox(null, 100);
end;
$$;
comment on function api.admin_retry_message(uuid) is '@access staff Send a failed message again. Permission: customer_messaging.';

select app.harden();
