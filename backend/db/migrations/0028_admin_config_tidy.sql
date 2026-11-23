-- 0028 Tidy-up of 0027: the coupon generator's loop counter was declared twice (lint warning).
do $$
declare
  v_def text := pg_get_functiondef('api.admin_create_coupons(uuid,text[],integer,text)'::regprocedure);
begin
  if position(E'declare\n  k integer;\n' in v_def) = 0 then raise exception 'admin_create_coupons declaration not found'; end if;
  execute replace(v_def, E'declare\n  k integer;\n', '');
end;
$$;

select app.harden();
