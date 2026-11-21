-- Money, rounding, VAT, allocation, normalisers, error contract.
select plan(30);

-- round-half-up integer division
select is(app.div_round_half_up(5, 2), 3::bigint, '2.5 rounds up to 3');
select is(app.div_round_half_up(4, 2), 2::bigint, 'exact division');
select is(app.div_round_half_up(-5, 2), -3::bigint, '-2.5 rounds away from zero');
select is(app.div_round_half_up(1, 3), 0::bigint, '0.33 rounds down');

-- VAT contained in VAT-inclusive gross
select is(app.vat_from_gross(120, 2000), 20::bigint, '£1.20 at 20% contains 20p VAT');
select is(app.vat_from_gross(100, 2000), 17::bigint, '£1.00 at 20% contains 16.67p → 17p');
select is(app.vat_from_gross(1499, 0), 0::bigint, 'zero-rated line has no VAT');
select is(app.vat_from_gross(105, 500), 5::bigint, '£1.05 at 5% contains 5p');
select is(app.vat_from_gross(0, 2000), 0::bigint, 'zero gross, zero VAT');
select throws_ok($$ select app.vat_from_gross(100, 10001) $$, 'PT500', 'INTERNAL', 'rate above 100% rejected');

-- weighed items
select is(app.weight_price(133, 1000), 133::bigint, '1 kg at £1.33/kg');
select is(app.weight_price(133, 750), 100::bigint, '750 g at £1.33/kg = 99.75 → £1.00');
select is(app.weight_price(450, 1234), 555::bigint, '1.234 kg at £4.50/kg = 555.3 → £5.55');

-- pro-rata allocation (largest remainder) always sums exactly
select is(app.allocate_pro_rata(100, array[1,1,1]::bigint[]), array[34,33,33]::bigint[], '100 over 3 equal weights');
select is(app.allocate_pro_rata(1000, array[250,500,250]::bigint[]), array[250,500,250]::bigint[], 'exact proportional split');
select is(app.allocate_pro_rata(-100, array[1,1,1]::bigint[]), array[-34,-33,-33]::bigint[], 'negative totals allocate symmetrically');
select is(app.allocate_pro_rata(7, array[0,0]::bigint[]), array[7,0]::bigint[], 'all-zero weights put everything on the first line');
select is(app.allocate_pro_rata(5, array[0,3,0]::bigint[]), array[0,5,0]::bigint[], 'zero-weight lines get nothing');
select is((select sum(x) from unnest(app.allocate_pro_rata(9999, array[3,7,11,13,17]::bigint[])) x), 9999::numeric, 'allocation sums to the total');
select is(app.allocate_pro_rata(10, array[]::bigint[]), array[]::bigint[], 'no lines, no allocation');

-- money json
select is(app.money(150), '{"amount": 150, "currency": "GBP"}'::jsonb, 'money() shape');

-- normalisers
select is(app.normalise_uk_postcode(' al10 9ab '), 'AL10 9AB', 'postcode normalised');
select is(app.normalise_uk_postcode('N109AA'), 'N10 9AA', 'postcode without space');
select is(app.normalise_uk_postcode('NOT A POSTCODE'), null, 'invalid postcode → null');
select is(app.normalise_phone_e164('07700 900112'), '+447700900112', 'UK national → E.164');
select is(app.normalise_phone_e164('+44 (0)7700'), null, 'invalid phone → null');
select is(app.slugify('Aachi Madras Sambar Powder'), 'aachi-madras-sambar-powder', 'slugify');

-- error contract: PostgREST maps PTxxx to HTTP status; MESSAGE is the stable code
select throws_ok($$ select app.raise_error('SLOT_FULL', 409) $$, 'PT409', 'SLOT_FULL', 'raise_error uses PT<http> + code');
select throws_ok($$ select app.require_user() $$, 'PT401', 'UNAUTHENTICATED', 'anonymous caller is rejected');

-- rate limiting
select throws_ok($$ select app.rate_limit('test:bucket', 2, interval '1 minute'), app.rate_limit('test:bucket', 2, interval '1 minute'), app.rate_limit('test:bucket', 2, interval '1 minute') $$,
  'PT429', 'RATE_LIMITED', 'third hit within the window is rate-limited');

select * from finish();
