-- Database-level guarantees (they hold even if application code is wrong).
select plan(16);

-- never oversell
select throws_ok($$ update app.stock_levels set reserved = on_hand + 1 where product_id = (select id from app.products where legacy_ref = 'prod-6') $$,
  '23514', null, 'reserved can never exceed on_hand');

-- never over-capture
select throws_ok($$ update app.orders set captured_minor = authorised_minor + 1 where number = 'VF-10945' $$,
  '23514', null, 'order capture can never exceed the authorised amount');
select throws_ok($$ update app.payments set amount_captured_minor = amount_authorised_minor + 1 where order_id = (select id from app.orders where number = 'VF-10945') $$,
  '23514', null, 'payment capture can never exceed the authorised amount');
select throws_ok($$ update app.orders set refunded_minor = coalesce(captured_minor, 0) + 1 where number = 'VF-10945' $$,
  '23514', null, 'refunds can never exceed the captured amount');

-- VAT rates cannot overlap for the same country + category
select throws_ok($$ insert into app.tax_rates (country_code, tax_category_code, rate_bp, valid_from) values ('GB', 'standard', 2100, '2026-01-01') $$,
  '23P01', null, 'overlapping VAT rate rejected');

-- price history cannot overlap
select throws_ok($$ insert into app.product_prices (product_id, amount_minor, valid_from) select id, 999, now() from app.products where legacy_ref = 'prod-1' $$,
  '23P01', null, 'overlapping current price rejected (close the old one first)');

-- slots: capacity respected
select throws_ok($$
  insert into app.delivery_slots (zone_id, starts_at, ends_at, cutoff_at, capacity, reserved_count)
  select id, '2030-01-01 08:00Z', '2030-01-01 10:00Z', '2030-01-01 06:00Z', 1, 2 from app.delivery_zones where code = 'HATFIELD' $$,
  '23514', null, 'slot reservations can never exceed capacity');

-- deposits are never discounted
select throws_ok($$
  insert into app.order_lines (order_id, line_no, line_type, name_snapshot, unit_price_minor, est_gross_minor, est_discount_minor, tax_category_code, vat_rate_bp, est_vat_minor)
  select id, 99, 'deposit', 'Deposit', 20, 20, 5, 'zero_rated', 0, 0 from app.orders where number = 'VF-10948' $$,
  '23514', null, 'deposit lines cannot carry a discount');

-- cart line: quantity XOR weight
select throws_ok($$
  insert into app.carts (id, guest_token_hash) values ('00000000-0000-0000-0000-0000000000c1', 'test-token');
  insert into app.cart_items (cart_id, product_id, quantity, weight_grams)
  select '00000000-0000-0000-0000-0000000000c1', id, 1, 500 from app.products where legacy_ref = 'prod-1' $$,
  '23514', null, 'cart line cannot have both quantity and weight');

-- append-only ledgers
select throws_ok($$ update app.order_status_history set reason = 'x' where id = (select min(id) from app.order_status_history) $$,
  'PT409', 'LEDGER_IMMUTABLE', 'order status history is append-only');
select throws_ok($$ delete from app.stock_movements where id = (select min(id) from app.stock_movements) $$,
  'PT409', 'LEDGER_IMMUTABLE', 'stock ledger is append-only');

-- invoices are immutable once issued; numbers are gapless per legal entity
insert into app.legal_entities (id, name, country_code, invoice_prefix, credit_note_prefix)
values ('00000000-0000-0000-0000-00000000e001', 'Test Entity Ltd', 'GB', 'TINV', 'TCN');
select is(app.next_document_number('00000000-0000-0000-0000-00000000e001', 'invoice'), 'TINV-000001', 'first invoice number');
select is(app.next_document_number('00000000-0000-0000-0000-00000000e001', 'invoice'), 'TINV-000002', 'next invoice number is consecutive');
insert into app.invoices (id, legal_entity_id, number, order_id, currency, seller_snapshot, buyer_snapshot, net_minor, vat_minor, gross_minor, vat_breakdown)
select '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'TINV-000001', id, 'GBP', '{}', '{}', 100, 0, 100, '[]'
from app.orders where number = 'VF-10945';
select throws_ok($$ update app.invoices set gross_minor = 1 where id = '00000000-0000-0000-0000-00000000f001' $$,
  'PT409', 'DOCUMENT_IMMUTABLE', 'issued invoice cannot be edited');
select throws_ok($$ delete from app.invoices where id = '00000000-0000-0000-0000-00000000f001' $$,
  'PT409', 'DOCUMENT_IMMUTABLE', 'issued invoice cannot be deleted');

-- promotion value columns must match the type
select throws_ok($$ insert into app.promotions (name, label, type, scope, amount_minor) values ('x', 'x', 'percent_off', 'basket', 100) $$,
  '23514', null, 'percent_off needs percent_bp, not amount_minor');

select * from finish();
