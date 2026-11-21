-- Security invariants. Must hold after every migration.
select plan(13);

select has_schema('app', 'schema app exists');
select has_schema('api', 'schema api exists');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api' and c.relkind in ('r','v','m','p','f')),
  0, 'api schema contains no tables or views (functions only)');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')),
  0, 'public schema contains no tables or views');

select ok(not has_schema_privilege('anon', 'app', 'USAGE'), 'anon has no USAGE on app');
select ok(not has_schema_privilege('authenticated', 'app', 'USAGE'), 'authenticated has no USAGE on app');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relkind in ('r','p') and not c.relrowsecurity),
  0, 'every app table has RLS enabled');

select is(
  (select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and not p.prosecdef),
  null, 'every api function is SECURITY DEFINER');

select is(
  (select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and not coalesce(p.proconfig @> array['search_path=""'], false)),
  null, 'every api function pins search_path to empty');

select is(
  (select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and coalesce(obj_description(p.oid, 'pg_proc'), '') !~ '@access\s+(anon|authenticated|staff)'),
  null, 'every api function declares @access');

select is(
  (select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('api','app')
      and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  null, 'no api/app function is executable by PUBLIC');

select is(
  (select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  null, 'no app function is executable by anon or authenticated');

set local role anon;
select is(api.health() ->> 'status', 'ok', 'anon can call api.health()');
reset role;

select * from finish();
