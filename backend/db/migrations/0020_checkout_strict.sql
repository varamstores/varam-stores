-- 0020 Check the caller first, explicitly (same reason as 0018), in my_order and get_checkout;
--      record who triggered a payment check (customer / system) in the payment sync log.

create or replace function app.my_order(p_order_number text)
returns app.orders
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
  o      app.orders;
begin
  select * into o from app.orders where number = upper(trim(p_order_number)) and customer_id = v_cust;
  if o.id is null then perform app.raise_error('NOT_FOUND', 404, null, 'Order not found.'); end if;
  return o;
end;
$$;

create or replace function api.get_checkout(p_checkout_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cust uuid := app.require_customer();
begin
  if not exists (select 1 from app.checkouts k where k.id = p_checkout_id and k.customer_id = v_cust) then
    perform app.raise_error('NOT_FOUND', 404, null, 'Checkout not found.');
  end if;
  return app.checkout_json(p_checkout_id);
end;
$$;
comment on function api.get_checkout(uuid) is '@access authenticated The current checkout: held slot, address, priced basket and what is still needed.';

do $$
declare
  v_def text := pg_get_functiondef('app.finalise_payment(uuid,text)'::regprocedure);
begin
  v_def := replace(v_def, $q$values (o.id, pm.id, 'retrieve_intent', v_stripe.status,$q$, $q$values (o.id, pm.id, 'retrieve_intent:' || p_actor, v_stripe.status,$q$);
  if v_def not like '%retrieve_intent:'' || p_actor%' then raise exception 'finalise_payment patch did not apply'; end if;
  execute v_def;
end;
$$;

select app.harden();
