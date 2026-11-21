-- 0011 Seed support + business settings confirmed on 2026-11-21. Every value here is editable
--      from the admin portal (app_settings / loyalty_tiers / slot_templates …); nothing is hard-coded.

-- Lint clean-up of app.allocate_pro_rata (typed array literals, no shadowed loop variable).
create or replace function app.allocate_pro_rata(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  n       integer := coalesce(array_length(p_weights, 1), 0);
  v_sum   numeric := 0;
  v_out   bigint[] := array[]::bigint[];
  v_rem   numeric[] := array[]::numeric[];
  v_alloc bigint := 0;
  v_left  bigint;
  v_best  integer;
  v_share numeric;
begin
  if n = 0 then
    return v_out;
  end if;
  for k in 1..n loop
    if p_weights[k] < 0 then
      raise exception using errcode = 'PT500', message = 'INTERNAL', hint = 'negative weight';
    end if;
    v_sum := v_sum + p_weights[k];
  end loop;
  if v_sum = 0 then
    v_out := array_fill(0::bigint, array[n]);
    v_out[1] := p_total;
    return v_out;
  end if;
  for k in 1..n loop
    v_share  := p_total::numeric * p_weights[k] / v_sum;
    v_out[k] := trunc(v_share)::bigint;
    v_rem[k] := abs(v_share - trunc(v_share));
    v_alloc  := v_alloc + v_out[k];
  end loop;
  v_left := p_total - v_alloc;
  while v_left <> 0 loop
    v_best := null;
    for k in 1..n loop
      if p_weights[k] > 0 and (v_best is null or v_rem[k] > v_rem[v_best]) then
        v_best := k;
      end if;
    end loop;
    v_out[v_best] := v_out[v_best] + sign(v_left)::bigint;
    v_rem[v_best] := -1;
    v_left := v_left - sign(v_left)::bigint;
  end loop;
  return v_out;
end;
$$;

-- Original free-text nutrition from the frontend mock, kept so nothing is lost while staff
-- complete the structured per-100 g fields.
alter table app.product_food_info add column legacy_nutrition jsonb;
comment on column app.product_food_info.legacy_nutrition is 'Frontend mock nutrition strings (e.g. {"calories":"280 kcal / croissant"}). Reference only; not shown to shoppers.';

insert into app.app_settings (key, value, description) values
  ('slot_days_ahead',             '7',      'How many days ahead delivery slots can be booked.'),
  ('loyalty_enabled',             'true',   'Turn the loyalty programme on/off.'),
  ('loyalty_points_per_pound',    '10',     'Points earned per £1 of captured product spend (excludes delivery and deposits).'),
  ('loyalty_point_value_pence',   '1',      'Value of one point when redeemed, in pence (1 = 100 points per £1).'),
  ('loyalty_earn_basis',          '"captured_product_spend"', 'What earns points: captured_product_spend.'),
  ('substitution_pricing',        '"lower_of_two"', 'lower_of_two | substitute_price | original_price — what the customer pays for a substitute.'),
  ('guest_checkout_enabled',      'false',  'false = an account is required to check out.'),
  ('email_provider',              '"resend"', 'Transactional email provider. API key lives in Supabase Vault, not here.'),
  ('invoices_enabled',            'false',  'Issue VAT invoices. Switch on once the legal entity (VAT number etc.) is saved.')
on conflict (key) do nothing;

select app.harden();
