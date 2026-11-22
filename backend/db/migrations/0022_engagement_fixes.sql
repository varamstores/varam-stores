-- 0022 Fixes found by plpgsql_check in 0021:
--   * checkout_json: sum() returns numeric; the card-hold buffer needs bigint for div_round_half_up
--   * process_repeat_orders: drop an unused variable

do $$
declare
  v_def text := pg_get_functiondef('app.checkout_json(uuid)'::regprocedure);
begin
  v_def := replace(v_def, $q$where (l ->> 'isEstimate')::boolean) * coalesce($q$, $q$where (l ->> 'isEstimate')::boolean)::bigint * coalesce($q$);
  if v_def not like '%isEstimate'')::boolean)::bigint * coalesce%' then raise exception 'checkout_json patch did not apply'; end if;
  execute v_def;

  v_def := pg_get_functiondef('app.process_repeat_orders()'::regprocedure);
  v_def := replace(v_def, E'  v      jsonb;\n', '');
  v_def := replace(v_def, 'v := app.fill_cart_from_repeat(r.id);', 'perform app.fill_cart_from_repeat(r.id);');
  if v_def like '%v := app.fill_cart_from_repeat%' then raise exception 'process_repeat_orders patch did not apply'; end if;
  execute v_def;
end;
$$;

select app.harden();
