-- 0001 Foundation: extensions, schemas, privilege hardening, error + auth helpers, health.
-- Conventions for every later migration:
--   * Tables live in schema app (private). Functions callable by the browser live in schema api.
--   * api functions: SECURITY DEFINER, SET search_path = '', fully-qualified names,
--     and a COMMENT containing "@access anon | authenticated | staff".
--   * End every migration with: select app.harden();

-- ── Extensions (Supabase keeps them in schema "extensions") ──────────────────
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists unaccent      with schema extensions;
create extension if not exists btree_gist    with schema extensions;
create extension if not exists pgtap         with schema extensions;
create extension if not exists plpgsql_check with schema extensions;
create extension if not exists pg_jsonschema with schema extensions;
create extension if not exists http          with schema extensions;
create extension if not exists pg_net        with schema extensions;
create extension if not exists pg_cron;

-- ── Schemas ─────────────────────────────────────────────────────────────────
create schema if not exists app;
create schema if not exists api;

comment on schema app is 'Private application tables and internal functions. Never exposed.';
comment on schema api is 'Browser-callable functions only (exposed via PostgREST). No tables or views.';

revoke all on schema app from public, anon, authenticated;
revoke all on schema api from public;
grant usage on schema api to anon, authenticated;

-- New functions must not inherit the built-in PUBLIC EXECUTE grant.
alter default privileges in schema api revoke execute on functions from public;
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema app revoke all on tables    from public;
alter default privileges in schema app revoke all on sequences from public;

-- ── Errors ──────────────────────────────────────────────────────────────────
-- Raises an error PostgREST turns into HTTP p_http; MESSAGE is the stable code the
-- frontend translates; DETAIL carries JSON details; HINT an English fallback message.
create or replace function app.raise_error(
  p_code    text,
  p_http    integer default 400,
  p_details jsonb   default null,
  p_message text    default null
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_http is null or p_http < 400 or p_http > 599 then
    p_http := 500;
  end if;
  raise exception using
    errcode = 'PT' || p_http::text,
    message = p_code,
    detail  = coalesce(p_details::text, '{}'),
    hint    = coalesce(p_message, p_code);
end;
$$;

-- ── Identity helpers ────────────────────────────────────────────────────────
create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$ select auth.uid() $$;

create or replace function app.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform app.raise_error('UNAUTHENTICATED', 401, null, 'Sign in required.');
  end if;
  return v_uid;
end;
$$;

-- ── Settings (typed key/value; values confirmed by the business) ───────────
create table if not exists app.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value       jsonb not null,
  description text not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create or replace function app.setting(p_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$ select s.value from app.app_settings s where s.key = p_key $$;

insert into app.app_settings (key, value, description) values
  ('environment', '"development"', 'development | production. Production hides sample data and blocks unconfirmed tax rates on invoices.')
on conflict (key) do nothing;

-- ── Declarative, fail-closed grants ─────────────────────────────────────────
-- Reads "@access <level>" from each api function's comment and grants EXECUTE accordingly.
-- No tag → no access. app functions are never executable by client roles.
create or replace function app.apply_api_grants()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r        record;
  v_access text;
begin
  for r in
    select p.oid::regprocedure as sig, pg_catalog.obj_description(p.oid, 'pg_proc') as descr
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    v_access := substring(coalesce(r.descr, '') from '@access\s+(anon|authenticated|staff)');
    if v_access = 'anon' then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    elsif v_access in ('authenticated', 'staff') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$$;

-- Run at the end of every migration: RLS on, client roles locked out of app, api grants applied.
create or replace function app.harden()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as tbl
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', r.tbl);
  end loop;

  revoke all on all tables    in schema app from public, anon, authenticated;
  revoke all on all sequences in schema app from public, anon, authenticated;
  perform app.apply_api_grants();
end;
$$;

-- ── Health ──────────────────────────────────────────────────────────────────
create or replace function api.health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status',        'ok',
    'database',      'ok',
    'serverTime',    now(),
    'schemaVersion', (select max(m.version) from meta.schema_migrations m)
  );
$$;
comment on function api.health() is '@access anon Liveness check and applied schema version.';

select app.harden();
