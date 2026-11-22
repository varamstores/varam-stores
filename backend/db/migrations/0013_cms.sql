-- 0013 CMS: every page, section, text, image (desktop + mobile), link, list, SEO field and UI
--      string of the storefront lives here and is edited live from the admin portal.
--      Edits go live immediately (decision D16); every change is audit-logged.

insert into app.permissions (code, description) values
  ('content', 'Edit website content in the CMS: pages, sections, images, navigation, SEO and all texts.')
on conflict (code) do nothing;

create table app.cms_pages (
  key             text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label           text not null,
  route           text,
  kind            text not null default 'system' check (kind in ('global', 'system', 'static')),
  help            text,
  seo_title       text check (length(seo_title) <= 70),
  seo_description text check (length(seo_description) <= 170),
  seo_image       jsonb,
  is_published    boolean not null default true,
  position        integer not null default 0,
  updated_by      uuid,
  updated_at      timestamptz not null default now()
);
comment on table app.cms_pages is 'Every storefront page (plus "global" for header/footer/navigation and "ui" for microcopy).';

create table app.cms_sections (
  page_key        text not null references app.cms_pages (key) on delete cascade,
  key             text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label           text not null,
  help            text,
  position        integer not null default 0,
  is_enabled      boolean not null default true,
  visible_desktop boolean not null default true,
  visible_mobile  boolean not null default true,
  is_reorderable  boolean not null default true,
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  primary key (page_key, key)
);

create table app.cms_entries (
  key         text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  locale      text not null default 'en-GB' references app.locales (code),
  page_key    text not null,
  section_key text not null,
  kind        text not null check (kind in ('text', 'richtext', 'image', 'link', 'list', 'number', 'boolean', 'color', 'json')),
  value       jsonb not null,
  label       text not null,
  help        text,
  item_schema jsonb,
  max_length  integer check (max_length > 0),
  position    integer not null default 0,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (key, locale),
  foreign key (page_key, section_key) references app.cms_sections (page_key, key) on delete cascade,
  check (key like page_key || '.' || section_key || '.%')
);
create index cms_entries_section_idx on app.cms_entries (page_key, section_key, position);
create index cms_entries_text_trgm on app.cms_entries using gin ((value #>> '{}') extensions.gin_trgm_ops) where kind in ('text', 'richtext');
comment on column app.cms_entries.value is 'text/richtext: string · image: {"desktop": path, "mobile": path|null, "alt": text} · link: {"label", "href"} · list/json: validated by item_schema.';

-- Single counter: browsers poll api.get_cms_version() and refetch when it changes.
create table app.cms_state (
  id      boolean primary key default true check (id),
  version bigint not null default 1,
  changed_at timestamptz not null default now()
);
insert into app.cms_state default values;

create or replace function app.cms_bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.cms_state set version = version + 1, changed_at = now() where id;
  return null;
end;
$$;
create trigger cms_pages_bump    after insert or update or delete on app.cms_pages    for each statement execute function app.cms_bump_version();
create trigger cms_sections_bump after insert or update or delete on app.cms_sections for each statement execute function app.cms_bump_version();
create trigger cms_entries_bump  after insert or update or delete on app.cms_entries  for each statement execute function app.cms_bump_version();

-- ── value validation ────────────────────────────────────────────────────────
create or replace function app.cms_is_image(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and (p -> 'desktop' is null or jsonb_typeof(p -> 'desktop') in ('string', 'null'))
     and (p -> 'mobile'  is null or jsonb_typeof(p -> 'mobile')  in ('string', 'null'))
     and (p -> 'alt'     is null or jsonb_typeof(p -> 'alt') = 'string')
     and (p ? 'desktop' or p ? 'mobile')
$$;

create or replace function app.cms_validate_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  ok := case new.kind
    when 'text'     then jsonb_typeof(new.value) = 'string' and (new.max_length is null or length(new.value #>> '{}') <= new.max_length)
    when 'richtext' then jsonb_typeof(new.value) = 'string' and (new.max_length is null or length(new.value #>> '{}') <= new.max_length)
    when 'image'    then app.cms_is_image(new.value)
    when 'link'     then jsonb_typeof(new.value) = 'object' and jsonb_typeof(new.value -> 'label') = 'string'
                         and jsonb_typeof(new.value -> 'href') = 'string'
    when 'number'   then jsonb_typeof(new.value) = 'number'
    when 'boolean'  then jsonb_typeof(new.value) = 'boolean'
    when 'color'    then jsonb_typeof(new.value) = 'string' and (new.value #>> '{}') ~ '^#[0-9A-Fa-f]{3,8}$'
    when 'list'     then jsonb_typeof(new.value) = 'array'
                         and (new.item_schema is null or extensions.jsonb_matches_schema(new.item_schema::json, new.value))
    when 'json'     then new.item_schema is null or extensions.jsonb_matches_schema(new.item_schema::json, new.value)
  end;
  if not coalesce(ok, false) then
    raise exception using errcode = 'PT422', message = 'VALIDATION_FAILED',
      detail = jsonb_build_object('key', new.key, 'kind', new.kind, 'maxLength', new.max_length)::text,
      hint = format('Value for %s does not match its type (%s)', new.key, new.kind);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger cms_entries_validate before insert or update on app.cms_entries
  for each row execute function app.cms_validate_entry();

-- Resolve storage paths inside any value: every object that looks like an image gets URLs.
create or replace function app.cms_resolve_media(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  k text; v jsonb; out jsonb;
begin
  if p is null then return null; end if;
  case jsonb_typeof(p)
    when 'object' then
      if app.cms_is_image(p) then
        return jsonb_build_object(
          'desktop', app.media_url(coalesce(nullif(p ->> 'desktop', ''), p ->> 'mobile')),
          'mobile',  app.media_url(coalesce(nullif(p ->> 'mobile', ''), p ->> 'desktop')),
          'alt',     coalesce(p ->> 'alt', ''));
      end if;
      out := '{}'::jsonb;
      for k, v in select * from jsonb_each(p) loop
        out := out || jsonb_build_object(k, app.cms_resolve_media(v));
      end loop;
      return out;
    when 'array' then
      return coalesce((select jsonb_agg(app.cms_resolve_media(e) order by i) from jsonb_array_elements(p) with ordinality x(e, i)), '[]'::jsonb);
    else
      return p;
  end case;
end;
$$;

-- ── storefront reads ────────────────────────────────────────────────────────
create or replace function api.get_cms_version()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$ select s.version from app.cms_state s where s.id $$;
comment on function api.get_cms_version() is '@access anon Current CMS version; the browser refetches the bundle when it changes.';

create or replace function api.get_cms_bundle(p_locale text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with loc as (select app.resolve_locale(p_locale) as l)
  select jsonb_build_object(
    'version', (select s.version from app.cms_state s where s.id),
    'locale', (select l from loc),
    'pages', coalesce((select jsonb_object_agg(pg.key, jsonb_build_object(
        'label', pg.label, 'route', pg.route, 'kind', pg.kind, 'isPublished', pg.is_published,
        'seo', jsonb_build_object('title', pg.seo_title, 'description', pg.seo_description, 'image', app.cms_resolve_media(pg.seo_image)),
        'sections', coalesce((select jsonb_object_agg(sc.key, jsonb_build_object(
            'position', sc.position, 'enabled', sc.is_enabled, 'desktop', sc.visible_desktop, 'mobile', sc.visible_mobile))
          from app.cms_sections sc where sc.page_key = pg.key), '{}'::jsonb)))
      from app.cms_pages pg), '{}'::jsonb),
    'entries', coalesce((select jsonb_object_agg(e.key, app.cms_resolve_media(e.value))
      from (select distinct on (x.key) x.key, x.value from app.cms_entries x
            order by x.key, (x.locale = (select l from loc)) desc, (x.locale = 'en-GB') desc) e), '{}'::jsonb))
$$;
comment on function api.get_cms_bundle(text) is '@access anon All website content in one cached payload: pages, SEO, section visibility, every text/image/link.';

-- ── admin (permission: content) ─────────────────────────────────────────────
create or replace function api.admin_cms_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('content');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', pg.key, 'label', pg.label, 'route', pg.route, 'kind', pg.kind, 'help', pg.help,
      'isPublished', pg.is_published, 'seoTitle', pg.seo_title, 'seoDescription', pg.seo_description,
      'seoImage', pg.seo_image, 'seoImagePreview', app.cms_resolve_media(pg.seo_image), 'updatedAt', pg.updated_at,
      'sections', coalesce((select jsonb_agg(jsonb_build_object(
          'key', sc.key, 'label', sc.label, 'help', sc.help, 'position', sc.position, 'enabled', sc.is_enabled,
          'desktop', sc.visible_desktop, 'mobile', sc.visible_mobile, 'reorderable', sc.is_reorderable,
          'entryCount', (select count(*)::int from app.cms_entries e where e.page_key = sc.page_key and e.section_key = sc.key))
        order by sc.position, sc.key) from app.cms_sections sc where sc.page_key = pg.key), '[]'::jsonb))
    order by pg.position, pg.key) from app.cms_pages pg), '[]'::jsonb);
end;
$$;
comment on function api.admin_cms_overview() is '@access staff CMS map: every page with its sections, visibility and entry counts.';

create or replace function api.admin_cms_get_section(p_page text, p_section text, p_locale text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_locale text := app.resolve_locale(p_locale);
begin
  perform app.require_permission('content');
  if not exists (select 1 from app.cms_sections s where s.page_key = p_page and s.key = p_section) then
    perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('page', p_page, 'section', p_section));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', e.key, 'kind', e.kind, 'label', e.label, 'help', e.help, 'itemSchema', e.item_schema,
      'maxLength', e.max_length, 'value', e.value, 'preview', app.cms_resolve_media(e.value),
      'locale', e.locale, 'updatedAt', e.updated_at,
      'updatedBy', (select s.full_name from app.staff s where s.id = e.updated_by))
    order by e.position, e.key)
    from app.cms_entries e where e.page_key = p_page and e.section_key = p_section and e.locale = v_locale), '[]'::jsonb);
end;
$$;
comment on function api.admin_cms_get_section(text, text, text) is '@access staff Every editable field of one section, with labels, help text and current values.';

create or replace function api.admin_cms_update_entry(p_key text, p_value jsonb, p_locale text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('content');
  v_locale text := app.resolve_locale(p_locale);
  v_old jsonb;
  e app.cms_entries%rowtype;
begin
  select x.value into v_old from app.cms_entries x where x.key = p_key and x.locale = v_locale;
  if not found then
    -- a translation of an existing entry
    select * into e from app.cms_entries x where x.key = p_key order by (x.locale = 'en-GB') desc limit 1;
    if not found then perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('key', p_key)); end if;
    insert into app.cms_entries (key, locale, page_key, section_key, kind, value, label, help, item_schema, max_length, position, updated_by)
    values (e.key, v_locale, e.page_key, e.section_key, e.kind, p_value, e.label, e.help, e.item_schema, e.max_length, e.position, v_staff);
  else
    update app.cms_entries x set value = p_value, updated_by = v_staff where x.key = p_key and x.locale = v_locale;
  end if;
  perform app.audit('cms.update_entry', 'cms_entry', p_key, jsonb_build_object('locale', v_locale, 'before', v_old, 'after', p_value));
  return (select jsonb_build_object('key', x.key, 'value', x.value, 'preview', app.cms_resolve_media(x.value), 'updatedAt', x.updated_at)
          from app.cms_entries x where x.key = p_key and x.locale = v_locale);
end;
$$;
comment on function api.admin_cms_update_entry(text, jsonb, text) is '@access staff Save one CMS field (validated against its type); live immediately.';

create or replace function api.admin_cms_update_section(p_page text, p_section text, p_enabled boolean default null,
                                                        p_visible_desktop boolean default null, p_visible_mobile boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('content');
  s app.cms_sections%rowtype;
begin
  update app.cms_sections x set
    is_enabled      = coalesce(p_enabled, x.is_enabled),
    visible_desktop = coalesce(p_visible_desktop, x.visible_desktop),
    visible_mobile  = coalesce(p_visible_mobile, x.visible_mobile),
    updated_by = v_staff, updated_at = now()
  where x.page_key = p_page and x.key = p_section
  returning * into s;
  if not found then perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('page', p_page, 'section', p_section)); end if;
  perform app.audit('cms.update_section', 'cms_section', p_page || '.' || p_section,
    jsonb_build_object('enabled', s.is_enabled, 'desktop', s.visible_desktop, 'mobile', s.visible_mobile));
  return jsonb_build_object('key', s.key, 'enabled', s.is_enabled, 'desktop', s.visible_desktop, 'mobile', s.visible_mobile);
end;
$$;
comment on function api.admin_cms_update_section(text, text, boolean, boolean, boolean) is '@access staff Show/hide a section on desktop and/or mobile, or switch it off.';

create or replace function api.admin_cms_reorder_sections(p_page text, p_section_keys text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('content');
  v_expected text[];
begin
  select array_agg(s.key order by s.key) into v_expected from app.cms_sections s where s.page_key = p_page and s.is_reorderable;
  if v_expected is null or v_expected <> (select array_agg(k order by k) from unnest(p_section_keys) k) then
    perform app.raise_error('VALIDATION_FAILED', 400, jsonb_build_object('expected', v_expected), 'Send every reorderable section of the page exactly once.');
  end if;
  update app.cms_sections s set position = x.ord * 10, updated_by = v_staff, updated_at = now()
  from unnest(p_section_keys) with ordinality x(k, ord)
  where s.page_key = p_page and s.key = x.k;
  perform app.audit('cms.reorder_sections', 'cms_page', p_page, jsonb_build_object('order', to_jsonb(p_section_keys)));
  return to_jsonb(p_section_keys);
end;
$$;
comment on function api.admin_cms_reorder_sections(text, text[]) is '@access staff Change the order of sections on a page.';

create or replace function api.admin_cms_update_page(p_page text, p_seo_title text default null, p_seo_description text default null,
                                                     p_seo_image jsonb default null, p_is_published boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := app.require_permission('content');
  pg app.cms_pages%rowtype;
begin
  if p_seo_image is not null and jsonb_typeof(p_seo_image) <> 'null' and not app.cms_is_image(p_seo_image) then
    perform app.raise_error('VALIDATION_FAILED', 422, jsonb_build_object('field', 'p_seo_image'));
  end if;
  update app.cms_pages x set
    seo_title       = coalesce(p_seo_title, x.seo_title),
    seo_description = coalesce(p_seo_description, x.seo_description),
    seo_image       = case when p_seo_image is null then x.seo_image when jsonb_typeof(p_seo_image) = 'null' then null else p_seo_image end,
    is_published    = coalesce(p_is_published, x.is_published),
    updated_by = v_staff, updated_at = now()
  where x.key = p_page
  returning * into pg;
  if not found then perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('page', p_page)); end if;
  perform app.audit('cms.update_page', 'cms_page', p_page, jsonb_build_object('seoTitle', pg.seo_title, 'published', pg.is_published));
  return jsonb_build_object('key', pg.key, 'seoTitle', pg.seo_title, 'seoDescription', pg.seo_description,
                            'seoImage', pg.seo_image, 'isPublished', pg.is_published);
end;
$$;
comment on function api.admin_cms_update_page(text, text, text, jsonb, boolean) is '@access staff Page SEO (title, description, share image) and publish switch.';

-- "Where is this text on the site?" — find any field by its words.
create or replace function api.admin_cms_search(p_q text, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_permission('content');
  if coalesce(trim(p_q), '') = '' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(r order by r ->> 'score' desc) from (
    select jsonb_build_object('key', e.key, 'page', e.page_key, 'section', e.section_key, 'label', e.label, 'kind', e.kind,
             'value', e.value,
             'score', greatest(extensions.similarity(app.fold(e.value #>> '{}'), app.fold(p_q)),
                               case when app.fold(e.label) like '%' || app.fold(p_q) || '%' then 0.9 else 0 end)) r
    from app.cms_entries e
    where app.fold(coalesce(e.value::text, '')) like '%' || app.fold(p_q) || '%'
       or app.fold(e.label) like '%' || app.fold(p_q) || '%'
       or app.fold(e.key) like '%' || app.fold(p_q) || '%'
    limit least(greatest(coalesce(p_limit, 30), 1), 100)) x), '[]'::jsonb);
end;
$$;
comment on function api.admin_cms_search(text, integer) is '@access staff Find which CMS field holds a given text.';

-- ── media library (files are uploaded to Storage by the browser, then registered) ──
create or replace function api.admin_list_media(p_q text default null, p_limit integer default 60, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('content') or app.has_permission('inventory')) then
    perform app.require_permission('content');
  end if;
  return jsonb_build_object(
    'total', (select count(*)::int from app.media_assets m where p_q is null or m.object_path ilike '%' || p_q || '%'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('path', m.object_path, 'url', app.media_url(m.object_path),
                        'contentType', m.content_type, 'bytes', m.bytes, 'uploadedAt', m.uploaded_at) order by m.uploaded_at desc, m.object_path)
                       from (select * from app.media_assets m where p_q is null or m.object_path ilike '%' || p_q || '%'
                             order by m.uploaded_at desc, m.object_path
                             offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 60), 1), 200)) m), '[]'::jsonb));
end;
$$;
comment on function api.admin_list_media(text, integer, integer) is '@access staff Media library (images in Supabase Storage).';

create or replace function api.admin_register_media(p_object_path text, p_content_type text, p_bytes integer, p_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('content') or app.has_permission('inventory')) then
    perform app.require_permission('content');
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'storefront' and o.name = p_object_path) then
    perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('path', p_object_path), 'Upload the file to Storage first.');
  end if;
  insert into app.media_assets (object_path, bucket, source_path, content_type, bytes, sha256)
  values (p_object_path, 'storefront', '/' || p_object_path, p_content_type, p_bytes, lower(p_sha256))
  on conflict (object_path) do update set content_type = excluded.content_type, bytes = excluded.bytes, sha256 = excluded.sha256, uploaded_at = now();
  perform app.audit('media.register', 'media_asset', p_object_path, jsonb_build_object('bytes', p_bytes));
  return jsonb_build_object('path', p_object_path, 'url', app.media_url(p_object_path));
end;
$$;
comment on function api.admin_register_media(text, text, integer, text) is '@access staff Record an image the browser uploaded to Storage so it appears in the media library.';

-- Storage policies: staff with content/inventory may upload/replace/delete in the storefront bucket.
-- Policies run as the caller, so they use a SECURITY DEFINER check in a non-exposed schema.
create schema if not exists policy;
revoke all on schema policy from public;
grant usage on schema policy to authenticated;
create or replace function policy.can_manage_media()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app.has_permission('content') or app.has_permission('inventory') $$;
revoke all on function policy.can_manage_media() from public, anon;
grant execute on function policy.can_manage_media() to authenticated;

drop policy if exists "staff upload storefront media" on storage.objects;
drop policy if exists "staff update storefront media" on storage.objects;
drop policy if exists "staff delete storefront media" on storage.objects;
create policy "staff upload storefront media" on storage.objects for insert to authenticated
  with check (bucket_id = 'storefront' and policy.can_manage_media());
create policy "staff update storefront media" on storage.objects for update to authenticated
  using (bucket_id = 'storefront' and policy.can_manage_media());
create policy "staff delete storefront media" on storage.objects for delete to authenticated
  using (bucket_id = 'storefront' and policy.can_manage_media());

select app.harden();
