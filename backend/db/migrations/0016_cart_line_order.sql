-- 0016 Basket line order: lines added in one transaction (imports, merges) kept now() as
--      added_at, so their order fell back to random ids. New lines use clock_timestamp(); merged
--      lines keep the time they were first added. Also tidies loop counters in app.price_cart.

create or replace function app.price_cart(p_cart_id uuid, p_slot_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c            app.carts;
  v_customer   uuid;
  v_currency   text := coalesce(app.setting('currency') #>> '{}', 'GBP');
  v_country    text := coalesce(app.setting('default_country') #>> '{}', 'GB');
  v_basis      text := coalesce(app.setting('free_delivery_basis') #>> '{}', 'before_discounts');
  z            app.delivery_zones;
  v_location   uuid;
  n            integer := 0;
  -- per-line arrays, 1-based in display order
  l_id uuid[]; l_pid uuid[]; l_unit text[]; l_qty integer[]; l_wt integer[]; l_units integer[];
  l_price integer[]; l_sub bigint[]; l_idisc bigint[]; l_bdisc bigint[]; l_dep bigint[]; l_dep_bp integer[];
  l_vatbp integer[]; l_subst boolean[]; l_ok boolean[]; l_nonstack boolean[]; l_promos jsonb[];
  l_avail text[]; l_stock bigint[]; l_max integer[];
  j            integer;   -- foreach target (FOR loops declare their own counters)
  pr           app.promotions;
  v_idx        integer[];
  v_disc       bigint[];
  v_units      integer[];
  v_weights    bigint[];
  v_alloc      bigint[];
  v_total      bigint;
  v_groups     integer;
  v_take       integer;
  v_reason     text;
  v_applied    jsonb := '[]'::jsonb;
  v_warnings   jsonb := '[]'::jsonb;
  v_coupon     app.coupons;
  v_coupon_pr  app.promotions;
  v_coupon_status text;
  v_coupon_reason text;
  v_coupon_details jsonb;
  v_basket_nonstack boolean := false;
  v_free_delivery uuid;
  v_pre        bigint := 0;   -- items subtotal before discounts (purchasable lines)
  v_after_item bigint := 0;   -- after product promotions
  v_net        bigint := 0;   -- after all discounts
  v_value      bigint;        -- basket value for fees/thresholds/minimums
  v_fee        bigint := 0;
  v_fee_waived bigint := 0;
  v_surcharge  bigint := 0;
  v_threshold  bigint;
  v_min_basket bigint;
  v_rates      integer[];
  v_rate_gross bigint[];
  v_del_alloc  bigint[];
  v_breakdown  jsonb := '[]'::jsonb;
  v_del_lines  jsonb := '[]'::jsonb;
  v_vat_total  bigint := 0;
  v_lines      jsonb := '[]'::jsonb;
  v_item_count integer := 0;
  v_dep_total  bigint := 0;
  v_is_est     boolean := false;
  v_line_vat   bigint;
  v_gross      bigint;
begin
  if p_cart_id is not null then
    select * into c from app.carts where id = p_cart_id;
  end if;
  v_customer := c.customer_id;
  if c.zone_id is not null then
    select * into z from app.delivery_zones where id = c.zone_id and is_active;
    v_location := z.location_id;
  end if;

  -- 1. lines ----------------------------------------------------------------------------------
  select count(*)::int,
         array_agg(ci.id order by ci.added_at, ci.id),
         array_agg(ci.product_id order by ci.added_at, ci.id),
         array_agg(p.sale_unit order by ci.added_at, ci.id),
         array_agg(ci.quantity order by ci.added_at, ci.id),
         array_agg(ci.weight_grams order by ci.added_at, ci.id),
         array_agg(case when p.sale_unit = 'weight' then 1 else coalesce(ci.quantity, 0) end order by ci.added_at, ci.id),
         array_agg(coalesce(app.current_price_minor(p.id), 0) order by ci.added_at, ci.id),
         array_agg(ci.substitution_allowed order by ci.added_at, ci.id),
         array_agg(p.status = 'active' and app.current_price_minor(p.id) is not null order by ci.added_at, ci.id),
         array_agg(coalesce(ds.amount_minor, 0) order by ci.added_at, ci.id),
         array_agg(case when ds.code is not null then app.tax_rate_bp(v_country::char(2), ds.tax_category_code, now()) else 0 end order by ci.added_at, ci.id),
         array_agg(app.tax_rate_bp(v_country::char(2), p.tax_category_code, now()) order by ci.added_at, ci.id),
         array_agg(app.product_availability(p.id, v_location) order by ci.added_at, ci.id),
         array_agg((select coalesce(sum(sl.on_hand - sl.reserved), 0) from app.stock_levels sl
                     join app.fulfilment_locations fl on fl.id = sl.location_id and fl.is_active
                    where sl.product_id = p.id and (v_location is null or sl.location_id = v_location)) order by ci.added_at, ci.id),
         array_agg(least(coalesce(p.max_per_order, 2147483647), coalesce((app.setting('max_line_quantity') #>> '{}')::int, 50)) order by ci.added_at, ci.id)
    into n, l_id, l_pid, l_unit, l_qty, l_wt, l_units, l_price, l_subst, l_ok, l_dep, l_dep_bp, l_vatbp, l_avail, l_stock, l_max
    from app.cart_items ci
    join app.products p on p.id = ci.product_id
    left join app.deposit_schemes ds on ds.code = p.deposit_scheme_code and ds.is_active
   where p_cart_id is not null and ci.cart_id = p_cart_id;

  l_sub := array_fill(0::bigint, array[greatest(n, 1)]);
  l_idisc := l_sub; l_bdisc := l_sub;
  l_nonstack := array_fill(false, array[greatest(n, 1)]);
  l_promos := array_fill('{}'::jsonb, array[greatest(n, 1)]);

  for i in 1..n loop
    v_item_count := v_item_count + case when l_unit[i] = 'weight' then 1 else l_qty[i] end;
    if l_avail[i] = 'out_of_stock' then l_ok[i] := false; end if;
    if not l_ok[i] then
      v_warnings := v_warnings || jsonb_build_object('code', case when l_avail[i] = 'out_of_stock' then 'OUT_OF_STOCK' else 'PRODUCT_UNAVAILABLE' end, 'lineId', l_id[i]);
      l_dep[i] := 0;
      continue;
    end if;
    l_sub[i] := case when l_unit[i] = 'weight' then app.weight_price(l_price[i], l_wt[i]) else l_price[i]::bigint * l_qty[i] end;
    l_dep[i] := l_dep[i]::bigint * l_units[i];
    if l_unit[i] = 'weight' then v_is_est := true; end if;
    v_pre := v_pre + l_sub[i];
    if l_unit[i] = 'each' and l_qty[i] > l_stock[i] then
      v_warnings := v_warnings || jsonb_build_object('code', 'INSUFFICIENT_STOCK', 'lineId', l_id[i], 'details', jsonb_build_object('available', l_stock[i]));
    elsif l_unit[i] = 'weight' and l_wt[i] > l_stock[i] then
      v_warnings := v_warnings || jsonb_build_object('code', 'INSUFFICIENT_STOCK', 'lineId', l_id[i], 'details', jsonb_build_object('availableGrams', l_stock[i]));
    elsif l_avail[i] = 'low_stock' then
      v_warnings := v_warnings || jsonb_build_object('code', 'LOW_STOCK', 'lineId', l_id[i]);
    end if;
    if l_unit[i] = 'each' and l_qty[i] > l_max[i] then
      v_warnings := v_warnings || jsonb_build_object('code', 'MAX_PER_ORDER', 'lineId', l_id[i], 'details', jsonb_build_object('max', l_max[i]));
    end if;
  end loop;

  -- coupon on the cart
  if c.coupon_code is not null then
    select * into v_coupon from app.coupons where code = c.coupon_code;
    if v_coupon.id is null then
      v_coupon_status := 'not_eligible'; v_coupon_reason := 'INVALID';
    else
      select * into v_coupon_pr from app.promotions where id = v_coupon.promotion_id;
      v_coupon_reason := case
        when not v_coupon.is_active then 'INACTIVE'
        when v_coupon.starts_at is not null and v_coupon.starts_at > now() then 'NOT_STARTED'
        when v_coupon.ends_at is not null and v_coupon.ends_at <= now() then 'EXPIRED'
        when v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then 'USAGE_LIMIT'
        when v_coupon.customer_id is not null and v_customer is null then 'SIGN_IN_REQUIRED'
        when v_coupon.customer_id is not null and v_coupon.customer_id <> v_customer then 'NOT_YOURS'
        else app.promotion_ineligible_reason(v_coupon_pr, v_customer, z.id) end;
      if v_coupon_reason is not null then
        v_coupon_status := 'not_eligible';
        v_coupon_pr := null;  -- its promotion is not offered below
      end if;
    end if;
  end if;

  -- 2. product promotions -----------------------------------------------------------------------
  for pr in
    select p.* from app.promotions p
     where p.scope = 'targets' and p.status = 'active'
       and (not p.requires_coupon or p.id = v_coupon_pr.id)
     order by p.priority, p.id
  loop
    if n = 0 then exit; end if;
    v_reason := app.promotion_ineligible_reason(pr, v_customer, z.id);
    if v_reason is null and pr.min_basket_minor is not null and v_pre < pr.min_basket_minor then v_reason := 'MIN_BASKET'; end if;
    if v_reason is not null then
      if pr.id = v_coupon_pr.id then
        v_coupon_status := 'not_eligible'; v_coupon_reason := v_reason;
        if v_reason = 'MIN_BASKET' then v_coupon_details := jsonb_build_object('amountNeeded', app.money(pr.min_basket_minor - v_pre, v_currency)); end if;
      end if;
      continue;
    end if;

    select coalesce(array_agg(x order by x), '{}') into v_idx
      from generate_series(1, n) x
     where l_ok[x] and (pr.stackable or not l_nonstack[x]) and app.promotion_matches_product(pr.id, l_pid[x]);
    if cardinality(v_idx) = 0 then
      if pr.id = v_coupon_pr.id then v_coupon_status := 'not_eligible'; v_coupon_reason := 'NO_MATCHING_ITEMS'; end if;
      continue;
    end if;

    v_disc := array_fill(0::bigint, array[n]);
    if pr.type in ('percent_off', 'member_price') and pr.percent_bp is not null then
      foreach j in array v_idx loop
        v_disc[j] := app.div_round_half_up((l_sub[j] - l_idisc[j]) * pr.percent_bp, 10000);
      end loop;
    elsif pr.type in ('fixed_off', 'member_price') then
      foreach j in array v_idx loop
        v_disc[j] := least(pr.amount_minor::bigint * l_units[j], l_sub[j] - l_idisc[j]);
      end loop;
    elsif pr.type in ('multibuy_x_for_y', 'multibuy_x_for_price') then
      -- one entry per unit (each-items only); cheapest units go free / most expensive go in bundles
      select coalesce(array_agg(x order by l_price[x] * (case when pr.type = 'multibuy_x_for_y' then 1 else -1 end), x), '{}')
        into v_units
        from unnest(v_idx) x, generate_series(1, l_units[x]) u
       where l_unit[x] = 'each';
      v_groups := cardinality(v_units) / pr.buy_qty;
      if v_groups > 0 then
        if pr.type = 'multibuy_x_for_y' then
          v_take := v_groups * (pr.buy_qty - pr.pay_qty);
          for k in 1..v_take loop
            v_disc[v_units[k]] := v_disc[v_units[k]] + l_price[v_units[k]];
          end loop;
        else
          v_take := v_groups * pr.buy_qty;
          v_total := 0;
          v_weights := '{}';
          for k in 1..v_take loop
            v_total := v_total + l_price[v_units[k]];
            v_weights := v_weights || l_price[v_units[k]]::bigint;
          end loop;
          v_total := v_total - v_groups::bigint * pr.bundle_price_minor;
          if v_total > 0 then
            v_alloc := app.allocate_pro_rata(v_total, v_weights);
            for k in 1..v_take loop
              v_disc[v_units[k]] := v_disc[v_units[k]] + v_alloc[k];
            end loop;
          end if;
        end if;
      end if;
    end if;

    -- never more than what is left on a line; optional cap across the whole promotion
    for k in 1..n loop
      v_disc[k] := greatest(0, least(v_disc[k], l_sub[k] - l_idisc[k]));
    end loop;
    v_total := (select coalesce(sum(d), 0) from unnest(v_disc) d);
    if pr.max_discount_minor is not null and v_total > pr.max_discount_minor then
      v_disc := app.allocate_pro_rata(pr.max_discount_minor, v_disc);
      v_total := pr.max_discount_minor;
    end if;
    if v_total = 0 then
      if pr.id = v_coupon_pr.id then v_coupon_status := 'not_eligible'; v_coupon_reason := 'NO_MATCHING_ITEMS'; end if;
      continue;
    end if;

    for k in 1..n loop
      if v_disc[k] > 0 then
        l_idisc[k] := l_idisc[k] + v_disc[k];
        if not pr.stackable then l_nonstack[k] := true; end if;
        l_promos[k] := l_promos[k] || jsonb_build_object(pr.id::text, coalesce((l_promos[k] ->> pr.id::text)::bigint, 0) + v_disc[k]);
      end if;
    end loop;
    v_applied := v_applied || jsonb_build_object(
      'promotionId', pr.id, 'label', pr.label, 'type', pr.type,
      'code', case when pr.id = v_coupon_pr.id then v_coupon.code end,
      'discount', app.money(v_total, v_currency),
      'lineIds', (select coalesce(jsonb_agg(l_id[x] order by x), '[]') from generate_series(1, n) x where v_disc[x] > 0));
    if pr.id = v_coupon_pr.id then v_coupon_status := 'applied'; end if;
  end loop;

  for i in 1..n loop v_after_item := v_after_item + l_sub[i] - l_idisc[i]; end loop;

  -- 3. basket promotions ------------------------------------------------------------------------
  for pr in
    select p.* from app.promotions p
     where p.scope = 'basket' and p.status = 'active'
       and (not p.requires_coupon or p.id = v_coupon_pr.id)
     order by p.priority, p.id
  loop
    if v_after_item = 0 then
      if pr.id = v_coupon_pr.id then v_coupon_status := 'not_eligible'; v_coupon_reason := 'CART_EMPTY'; end if;
      continue;
    end if;
    v_reason := app.promotion_ineligible_reason(pr, v_customer, z.id);
    if v_reason is null and pr.min_basket_minor is not null and v_after_item < pr.min_basket_minor then v_reason := 'MIN_BASKET'; end if;
    if v_reason is null and not pr.stackable and v_basket_nonstack then v_reason := 'NOT_STACKABLE'; end if;
    if v_reason is not null then
      if pr.id = v_coupon_pr.id then
        v_coupon_status := 'not_eligible'; v_coupon_reason := v_reason;
        if v_reason = 'MIN_BASKET' then v_coupon_details := jsonb_build_object('amountNeeded', app.money(pr.min_basket_minor - v_after_item, v_currency)); end if;
      end if;
      continue;
    end if;

    if pr.type = 'free_delivery' then
      v_free_delivery := pr.id;
      v_total := 0;  -- the waived fee is filled in once the fee is known
    else
      v_weights := '{}';
      v_total := 0;
      for k in 1..n loop
        v_weights := v_weights || greatest(0, l_sub[k] - l_idisc[k] - l_bdisc[k]);
        v_total := v_total + greatest(0, l_sub[k] - l_idisc[k] - l_bdisc[k]);
      end loop;
      v_total := case when pr.type = 'percent_off' then app.div_round_half_up(v_total * pr.percent_bp, 10000)
                      else least(pr.amount_minor::bigint, v_total) end;
      if pr.max_discount_minor is not null then v_total := least(v_total, pr.max_discount_minor); end if;
      if v_total <= 0 then continue; end if;
      v_alloc := app.allocate_pro_rata(v_total, v_weights);
      for k in 1..n loop
        if v_alloc[k] > 0 then
          l_bdisc[k] := l_bdisc[k] + v_alloc[k];
          l_promos[k] := l_promos[k] || jsonb_build_object(pr.id::text, coalesce((l_promos[k] ->> pr.id::text)::bigint, 0) + v_alloc[k]);
        end if;
      end loop;
    end if;
    if not pr.stackable then v_basket_nonstack := true; end if;
    v_applied := v_applied || jsonb_build_object(
      'promotionId', pr.id, 'label', pr.label, 'type', pr.type,
      'code', case when pr.id = v_coupon_pr.id then v_coupon.code end,
      'discount', app.money(v_total, v_currency),
      'lineIds', case when pr.type = 'free_delivery' then '[]'::jsonb
                      else (select coalesce(jsonb_agg(l_id[x] order by x), '[]') from generate_series(1, n) x where v_alloc[x] > 0) end);
    if pr.id = v_coupon_pr.id then v_coupon_status := 'applied'; end if;
  end loop;

  for i in 1..n loop v_net := v_net + l_sub[i] - l_idisc[i] - l_bdisc[i]; v_dep_total := v_dep_total + l_dep[i]; end loop;

  -- 4. delivery ---------------------------------------------------------------------------------
  v_value := case when v_basis = 'after_discounts' then v_net else v_pre end;
  if z.id is not null then
    select r.fee_minor into v_fee from app.delivery_fee_rules r
     where r.zone_id = z.id and tstzrange(r.valid_from, r.valid_to) @> now() and r.from_basket_minor <= v_value
     order by r.from_basket_minor desc limit 1;
    select min(r.from_basket_minor) into v_threshold from app.delivery_fee_rules r
     where r.zone_id = z.id and r.fee_minor = 0 and r.from_basket_minor > 0 and tstzrange(r.valid_from, r.valid_to) @> now();
    v_min_basket := z.min_basket_minor;
  else
    -- No postcode yet: the most a shopper could pay in any active zone (an estimate).
    select max(f.fee) into v_fee from (
      select (select r.fee_minor from app.delivery_fee_rules r
               where r.zone_id = dz.id and tstzrange(r.valid_from, r.valid_to) @> now() and r.from_basket_minor <= v_value
               order by r.from_basket_minor desc limit 1) as fee
        from app.delivery_zones dz where dz.is_active) f;
    select max(t.th) into v_threshold from (
      select min(r.from_basket_minor) as th from app.delivery_fee_rules r
        join app.delivery_zones dz on dz.id = r.zone_id and dz.is_active
       where r.fee_minor = 0 and r.from_basket_minor > 0 and tstzrange(r.valid_from, r.valid_to) @> now()
       group by r.zone_id) t;
  end if;
  v_fee := coalesce(v_fee, 0);
  if p_slot_id is not null then
    select coalesce(s.fee_minor, 0) into v_surcharge from app.delivery_slots s where s.id = p_slot_id;
    v_surcharge := coalesce(v_surcharge, 0);
  end if;
  if v_pre = 0 then v_fee := 0; v_surcharge := 0; end if;
  if v_free_delivery is not null then
    v_fee_waived := v_fee;
    v_fee := 0;
    v_applied := (select jsonb_agg(case when a ->> 'promotionId' = v_free_delivery::text
                                        then jsonb_set(a, '{discount}', app.money(v_fee_waived, v_currency)) else a end)
                    from jsonb_array_elements(v_applied) a);
  end if;

  -- 5. VAT --------------------------------------------------------------------------------------
  -- goods (net of discounts) + deposits per rate; delivery apportioned over the goods' rates
  select coalesce(array_agg(r order by r), '{}'), coalesce(array_agg(g order by r), '{}')
    into v_rates, v_rate_gross
    from (select l_vatbp[x] as r, sum(l_sub[x] - l_idisc[x] - l_bdisc[x])::bigint as g
            from generate_series(1, n) x where l_ok[x] group by l_vatbp[x]) s;
  if v_fee + v_surcharge > 0 and cardinality(v_rates) > 0 then
    v_del_alloc := app.allocate_pro_rata(v_fee + v_surcharge, v_rate_gross);
  else
    v_del_alloc := array_fill(0::bigint, array[greatest(cardinality(v_rates), 1)]);
  end if;
  for k in 1..cardinality(v_rates) loop
    if v_del_alloc[k] > 0 then
      v_del_lines := v_del_lines || jsonb_build_object('rateBp', v_rates[k], 'gross', app.money(v_del_alloc[k], v_currency),
                                                       'vat', app.money(app.vat_from_gross(v_del_alloc[k], v_rates[k]), v_currency));
    end if;
  end loop;

  for i in 1..n loop
    v_gross := l_sub[i] - l_idisc[i] - l_bdisc[i];
    v_line_vat := case when l_ok[i] then app.vat_from_gross(v_gross, l_vatbp[i]) else 0 end;
    v_lines := v_lines || jsonb_build_object(
      'id', l_id[i],
      'product', app.product_summary_json(l_pid[i], null, v_location),
      'quantity', case when l_unit[i] = 'each' then l_qty[i] end,
      'weightGrams', l_wt[i],
      'unitPrice', app.money(l_price[i], v_currency),
      'lineSubtotal', app.money(l_sub[i], v_currency),
      'discount', app.money(l_idisc[i] + l_bdisc[i], v_currency),
      'lineTotal', app.money(v_gross, v_currency),
      'deposit', case when l_dep[i] > 0 then app.money(l_dep[i], v_currency) end,
      'vatRateBp', l_vatbp[i],
      'vat', app.money(v_line_vat, v_currency),
      'substitutionAllowed', l_subst[i],
      'isEstimate', l_unit[i] = 'weight',
      'purchasable', l_ok[i],
      'promotions', (select coalesce(jsonb_agg(jsonb_build_object('promotionId', e.key, 'discount', e.value::bigint)), '[]')
                       from jsonb_each_text(l_promos[i]) e));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('rateBp', b.rate, 'net', app.money(b.gross - b.vat, v_currency),
                                               'vat', app.money(b.vat, v_currency), 'gross', app.money(b.gross, v_currency)) order by b.rate), '[]'),
         coalesce(sum(b.vat), 0)
    into v_breakdown, v_vat_total
    from (
      select x.rate, sum(x.gross)::bigint as gross, sum(x.vat)::bigint as vat from (
        select l_vatbp[q] as rate, l_sub[q] - l_idisc[q] - l_bdisc[q] as gross,
               app.vat_from_gross(l_sub[q] - l_idisc[q] - l_bdisc[q], l_vatbp[q]) as vat
          from generate_series(1, n) q where l_ok[q]
        union all
        select l_dep_bp[q], l_dep[q], app.vat_from_gross(l_dep[q], l_dep_bp[q])
          from generate_series(1, n) q where l_ok[q] and l_dep[q] > 0
        union all
        select (d ->> 'rateBp')::int, (d -> 'gross' ->> 'amount')::bigint, (d -> 'vat' ->> 'amount')::bigint
          from jsonb_array_elements(v_del_lines) d
      ) x group by x.rate) b;

  if c.postcode is not null and z.id is null then
    v_warnings := v_warnings || jsonb_build_object('code', 'NOT_DELIVERABLE');
  end if;
  if c.coupon_code is not null and v_coupon_status is null then
    -- the coupon's promotion was offered but never reached (e.g. a basket promotion on an empty basket)
    v_coupon_status := 'not_eligible'; v_coupon_reason := coalesce(v_coupon_reason, 'CART_EMPTY');
  end if;

  return jsonb_build_object(
    'id', c.id,
    'itemCount', v_item_count,
    'lineCount', n,
    'currency', v_currency,
    'postcode', c.postcode,
    'zone', case when z.id is not null then jsonb_build_object('code', z.code, 'name', z.name, 'label', z.display_label) end,
    'lines', v_lines,
    'totals', jsonb_build_object(
      'itemsSubtotal', app.money(v_pre, v_currency),
      'discountTotal', app.money(v_pre - v_net, v_currency),
      'depositTotal', app.money(v_dep_total, v_currency),
      'deliveryFee', app.money(v_fee + v_surcharge, v_currency),
      'slotSurcharge', app.money(v_surcharge, v_currency),
      'total', app.money(v_net + v_dep_total + v_fee + v_surcharge, v_currency),
      'vatTotal', app.money(v_vat_total, v_currency),
      'isEstimate', v_is_est,
      'vatBreakdown', v_breakdown),
    'deliveryLines', v_del_lines,
    'appliedPromotions', v_applied,
    'coupon', case when c.coupon_code is not null then jsonb_build_object(
      'code', c.coupon_code, 'status', v_coupon_status, 'reasonCode', v_coupon_reason, 'details', v_coupon_details) end,
    'delivery', jsonb_build_object(
      'fee', app.money(v_fee + v_surcharge, v_currency),
      'isEstimate', z.id is null,
      'freeDeliveryThreshold', case when v_threshold is not null then app.money(v_threshold, v_currency) end,
      'amountNeededForFreeDelivery', app.money(case when v_threshold is null or v_free_delivery is not null then 0
                                                    else greatest(0, v_threshold - v_value) end, v_currency),
      'freeDeliveryApplied', v_fee = 0 and v_pre > 0,
      'minimumBasket', case when v_min_basket is not null then app.money(v_min_basket, v_currency) end,
      'minimumBasketMet', v_min_basket is null or v_value >= v_min_basket),
    'warnings', v_warnings);
end;
$$;


create or replace function app.merge_cart_into(p_from uuid, p_into uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cap integer := coalesce((app.setting('max_line_quantity') #>> '{}')::int, 50);
begin
  insert into app.cart_items as ci (cart_id, product_id, quantity, weight_grams, substitution_allowed, added_at)
  select p_into, g.product_id, g.quantity, g.weight_grams, g.substitution_allowed, g.added_at
    from app.cart_items g where g.cart_id = p_from
  on conflict (cart_id, product_id) do update set
    quantity = case when ci.quantity is not null and excluded.quantity is not null
                    then least(ci.quantity + excluded.quantity,
                               coalesce((select p.max_per_order from app.products p where p.id = ci.product_id), v_cap), v_cap)
                    else ci.quantity end,
    weight_grams = case when ci.weight_grams is not null and excluded.weight_grams is not null
                        then ci.weight_grams + excluded.weight_grams else ci.weight_grams end,
    updated_at = now();
  update app.carts t set
    coupon_code = coalesce(t.coupon_code, f.coupon_code),
    postcode    = coalesce(t.postcode, f.postcode),
    zone_id     = case when t.postcode is null then f.zone_id else t.zone_id end,
    updated_at  = now()
  from app.carts f where t.id = p_into and f.id = p_from;
  delete from app.carts where id = p_from;
end;
$$;


create or replace function api.add_cart_item(p_product_id uuid, p_quantity integer default 1, p_weight_grams integer default null,
                                             p_substitution_allowed boolean default null, p_cart_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart   record;
  v_prod   app.products;
  v_amount record;
  v_line   app.cart_items;
begin
  select * into v_prod from app.products where id = p_product_id;
  if v_prod.id is null or v_prod.status <> 'active' then
    perform app.raise_error('PRODUCT_NOT_FOUND', 404, jsonb_build_object('productId', p_product_id), 'Product not found.');
  end if;
  select * into v_cart from app.cart_for_write(p_cart_token);
  select * into v_line from app.cart_items where cart_id = v_cart.cart_id and product_id = p_product_id for update;
  -- the new total for this product = existing + requested
  select * into v_amount from app.validate_line_amount(v_prod,
    case when v_prod.sale_unit = 'each' then coalesce(v_line.quantity, 0) + coalesce(p_quantity, 1) end,
    case when v_prod.sale_unit = 'weight' then coalesce(v_line.weight_grams, 0)
                                             + coalesce(p_weight_grams, coalesce(p_quantity, 1) * v_prod.weight_step_grams) end);
  perform app.check_line_stock(v_prod, v_cart.cart_id, v_amount.quantity, v_amount.weight_grams);
  insert into app.cart_items as ci (cart_id, product_id, quantity, weight_grams, substitution_allowed, added_at)
  values (v_cart.cart_id, p_product_id, v_amount.quantity, v_amount.weight_grams, coalesce(p_substitution_allowed, true), clock_timestamp())
  on conflict (cart_id, product_id) do update set
    quantity = excluded.quantity, weight_grams = excluded.weight_grams,
    substitution_allowed = coalesce(p_substitution_allowed, ci.substitution_allowed), updated_at = now();
  update app.carts set updated_at = now() where id = v_cart.cart_id;
  return app.cart_view(v_cart.cart_id, v_cart.cart_token);
end;
$$;

comment on function api.add_cart_item(uuid, integer, integer, boolean, text) is '@access anon Add a product to the basket (adds to any amount already there). Weight items take grams. Returns the priced basket and, for a new guest basket, its token.';

select app.harden();
