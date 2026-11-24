-- 0032 "Set up your shop" checklist for the admin home screen: the steps in the order they should be
--      done (categories → brands → products → stock → suppliers → delivery → company & VAT →
--      payments → emails → legal pages), each with a count and whether it is done.
create or replace function api.admin_setup_checklist()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cats     integer := (select count(*) from app.categories c where c.is_active);
  v_brands   integer := (select count(*) from app.brands b where b.is_active);
  v_live     integer := (select count(*) from app.products p where p.status = 'active');
  v_drafts   integer := (select count(*) from app.products p where p.status = 'draft');
  v_stocked  integer := (select count(distinct sl.product_id) from app.stock_levels sl join app.products p on p.id = sl.product_id where p.status = 'active' and sl.on_hand > 0);
  v_sups     integer := (select count(*) from app.suppliers s where s.is_active);
  v_zones    integer := (select count(*) from app.delivery_zones z where z.is_active and exists (select 1 from app.delivery_zone_postcodes zp where zp.zone_id = z.id));
  v_company  boolean := exists (select 1 from app.legal_entities le where le.is_active and le.vat_number is not null);
  v_stripe   boolean := (app.setting('payment_mode') #>> '{}') = 'stripe' and app.vault_secret('stripe_secret_key') is not null;
  v_email    boolean := app.vault_secret('resend_api_key') is not null and coalesce(app.setting('email_from') #>> '{}', '') <> '';
  v_legal    integer := (select count(*) from app.cms_pages pg where pg.key in ('terms', 'privacy', 'cookies', 'returns') and pg.is_published);
begin
  if app.current_staff_id() is null then perform app.require_permission('order_status'); end if;
  return jsonb_build_array(
    jsonb_build_object('key', 'categories', 'done', v_cats > 0, 'count', v_cats, 'screen', 'categories'),
    jsonb_build_object('key', 'brands', 'done', v_brands > 0, 'count', v_brands, 'screen', 'brands'),
    jsonb_build_object('key', 'products', 'done', v_live > 0, 'count', v_live, 'drafts', v_drafts, 'screen', 'products'),
    jsonb_build_object('key', 'stock', 'done', v_live > 0 and v_stocked >= v_live, 'count', v_stocked, 'of', v_live, 'screen', 'stock'),
    jsonb_build_object('key', 'suppliers', 'done', v_sups > 0, 'count', v_sups, 'screen', 'buying'),
    jsonb_build_object('key', 'delivery', 'done', v_zones > 0, 'count', v_zones, 'screen', 'delivery'),
    jsonb_build_object('key', 'company', 'done', v_company, 'screen', 'settings'),
    jsonb_build_object('key', 'payments', 'done', v_stripe, 'screen', 'settings'),
    jsonb_build_object('key', 'emails', 'done', v_email, 'screen', 'emails'),
    jsonb_build_object('key', 'legal', 'done', v_legal = 4, 'count', v_legal, 'of', 4, 'screen', 'content'));
end;
$$;
comment on function api.admin_setup_checklist() is '@access staff The shop set-up steps in order, each with whether it is done.';

select app.harden();
