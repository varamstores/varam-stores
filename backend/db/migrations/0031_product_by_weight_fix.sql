-- 0031 Fix: creating a product sold by weight always failed. The first INSERT stored sale_unit =
--      'weight' before the three weights were filled in (by the UPDATE that follows), so the
--      products_check3 constraint rejected it. The row is now created as 'each' and switched to
--      'weight' together with its weights in that UPDATE.
do $$
declare
  v_def text := pg_get_functiondef('api.admin_save_product(jsonb)'::regprocedure);
  v_old text := $q$'draft', p ->> 'taxCategoryCode', v_unit, trim(p ->> 'packSize'),$q$;
begin
  if position(v_old in v_def) = 0 then raise exception 'admin_save_product insert not found'; end if;
  execute replace(v_def, v_old, $q$'draft', p ->> 'taxCategoryCode', 'each', trim(p ->> 'packSize'),$q$);
end;
$$;

select app.harden();
