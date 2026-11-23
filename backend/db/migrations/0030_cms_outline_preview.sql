-- 0030 Better section previews: a heading or the first list item's title wins over small labels
--      (e.g. the hero shows "Good Food", not the "Previous slide" button label).
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
      (select e.value #>> '{}' from e where e.kind in ('text', 'richtext') and jsonb_typeof(e.value) = 'string' and btrim(e.value #>> '{}') <> ''
          and e.key ~ '(title|heading|headline|title_line_1|name)$' order by e.position, e.key limit 1),
      (select coalesce(jsonb_path_query_first(e.value, '$[*].title'), jsonb_path_query_first(e.value, '$[*].heading'), jsonb_path_query_first(e.value, '$[*].name'),
                       jsonb_path_query_first(e.value, '$[*].question'), jsonb_path_query_first(e.value, '$[*].text'), jsonb_path_query_first(e.value, '$[*].label'),
                       jsonb_path_query_first(e.value, '$[*].quote')) #>> '{}'
         from e where e.kind = 'list' and jsonb_typeof(e.value) = 'array' and jsonb_array_length(e.value) > 0 order by e.position, e.key limit 1),
      (select e.value #>> '{}' from e where e.kind in ('text', 'richtext') and jsonb_typeof(e.value) = 'string' and btrim(e.value #>> '{}') <> '' order by e.position, e.key limit 1),
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

select app.harden();
