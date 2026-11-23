-- 0029 CMS page outline for the admin: every section of a page in order, with who sees it, how many
--      fields it has, a short text preview and its first picture — so staff recognise sections at a
--      glance instead of reading internal names.

-- First words and first picture of a section (markdown marks and links stripped from the words).
create or replace function app.cms_section_preview(p_page text, p_section text, p_locale text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with e as (
    select x.kind, x.value, x.position, x.key from app.cms_entries x
     where x.page_key = p_page and x.section_key = p_section and x.locale = p_locale
  ),
  txt as (
    select coalesce(
      (select e.value #>> '{}' from e where e.kind in ('text', 'richtext') and jsonb_typeof(e.value) = 'string' and btrim(e.value #>> '{}') <> '' order by e.position, e.key limit 1),
      (select coalesce(jsonb_path_query_first(e.value, '$[*].title'), jsonb_path_query_first(e.value, '$[*].heading'), jsonb_path_query_first(e.value, '$[*].name'),
                       jsonb_path_query_first(e.value, '$[*].question'), jsonb_path_query_first(e.value, '$[*].text'), jsonb_path_query_first(e.value, '$[*].label'),
                       jsonb_path_query_first(e.value, '$[*].quote')) #>> '{}'
         from e where e.kind = 'list' order by e.position, e.key limit 1),
      (select e.value ->> 'label' from e where e.kind = 'link' order by e.position, e.key limit 1)
    ) as t
  ),
  img as (
    select coalesce(
      (select coalesce(nullif(e.value ->> 'desktop', ''), nullif(e.value ->> 'mobile', '')) from e where e.kind = 'image' order by e.position, e.key limit 1),
      (select jsonb_path_query_first(e.value, 'strict $.**.desktop ? (@.type() == "string")') #>> '{}' from e where e.kind = 'list' order by e.position, e.key limit 1)
    ) as p
  )
  select jsonb_build_object(
    'text', (select left(btrim(regexp_replace(regexp_replace(regexp_replace(t, '\[([^\]]*)\]\([^)]*\)', '\1', 'g'), '[#*_>`]+', '', 'g'), '\s+', ' ', 'g')), 110) from txt),
    'image', (select app.media_url(p) from img))
$$;

create or replace function api.admin_cms_page_outline(p_page text, p_locale text default null)
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
  if not exists (select 1 from app.cms_pages pg where pg.key = p_page) then
    perform app.raise_error('NOT_FOUND', 404, jsonb_build_object('page', p_page));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', s.key, 'label', s.label, 'help', s.help, 'position', s.position, 'reorderable', s.is_reorderable,
      'enabled', s.is_enabled, 'desktop', s.visible_desktop, 'mobile', s.visible_mobile,
      'fieldCount', (select count(*) from app.cms_entries e where e.page_key = s.page_key and e.section_key = s.key and e.locale = v_locale),
      'preview', app.cms_section_preview(s.page_key, s.key, v_locale),
      'updatedAt', greatest(s.updated_at, (select max(e.updated_at) from app.cms_entries e where e.page_key = s.page_key and e.section_key = s.key)))
    order by s.position, s.key)
    from app.cms_sections s where s.page_key = p_page), '[]'::jsonb);
end;
$$;
comment on function api.admin_cms_page_outline(text, text) is '@access staff The sections of one page in order: who sees each, a text preview and its first picture.';

update app.setting_definitions set help = 'Your live website address, e.g. https://www.varamfoods.co.uk. Links in emails, staff invitations and password resets use it.'
 where key = 'site_url';

select app.harden();
