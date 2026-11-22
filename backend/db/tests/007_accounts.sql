-- Accounts: sign-up completion, session context, profile, preferences, consents, addresses,
-- wishlist, newsletter double opt-in, GDPR export/delete. Called as the browser would.
select plan(42);

select set_config('t.rice', (select id::text from app.products where slug = 'basmati-rice-aged'), true);
select set_config('t.tom', (select id::text from app.products where slug = 'organic-red-tomatoes'), true);

-- a brand-new Supabase Auth user (as if they just signed up and confirmed their email)
select set_config('t.uid', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values (current_setting('t.uid')::uuid, 'authenticated', 'authenticated', 'acct-test@example.com', now(),
        '{"first_name": "Asha", "last_name": "Patel"}', now(), now());
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
set local role authenticated;

select is(api.get_session_context() ->> 'kind', 'new', 'new user has no profile yet');
select is(api.get_session_context() -> 'signupMetadata' ->> 'first_name', 'Asha', 'sign-up form data is available to finish the profile');
select throws_ok($$ select api.get_my_profile() $$, 'PT409', 'PROFILE_REQUIRED', 'profile functions need a finished sign-up');
select throws_ok($$ select api.list_my_addresses() $$, 'PT409', 'PROFILE_REQUIRED', 'addresses need a finished sign-up (checked up front)');
select throws_ok($$ select api.complete_signup('Asha', 'Patel', true, 'old-version') $$, 'PT400', 'TERMS_NOT_ACCEPTED', 'old terms version refused');
select throws_ok($$ select api.complete_signup('Asha', 'Patel', false, (select api.get_session_context() ->> 'termsVersion')) $$, 'PT400', 'TERMS_NOT_ACCEPTED', 'terms must be ticked');

select set_config('t.v', api.complete_signup('Asha', 'Patel', true, (api.get_session_context() ->> 'termsVersion'), true, false)::text, true);
select is(current_setting('t.v')::jsonb ->> 'kind', 'customer', 'profile created');
select is(api.get_my_profile() -> 'consents' -> 'terms' ->> 'granted', 'true', 'terms acceptance recorded');
select is(api.get_my_profile() -> 'consents' -> 'marketing_email' ->> 'granted', 'true', 'email marketing consent recorded separately');
select is(api.get_my_profile() -> 'consents' -> 'marketing_sms' ->> 'granted', 'false', 'SMS consent recorded separately (declined)');
select is(api.complete_signup('Asha', 'Patel', true, (api.get_session_context() ->> 'termsVersion')) ->> 'kind', 'customer', 'calling again changes nothing');

-- profile
select is(api.update_my_profile(p_phone => '07700 900123') ->> 'phone', '+447700900123', 'phone stored in E.164');
select throws_ok($$ select api.update_my_profile(p_phone => '12') $$, 'PT400', 'PHONE_INVALID', 'bad phone refused');
select throws_ok($$ select api.update_my_profile(p_first_name => '  ') $$, 'PT400', 'VALIDATION_FAILED', 'name cannot be blanked');

-- preferences & consent
select is(api.update_my_preferences('{"substitutionDefault": "dont_allow", "ecoPackaging": false}') ->> 'substitutionDefault', 'dont_allow', 'preference saved');
select throws_ok($$ select api.update_my_preferences('{"ripeness": "rotten"}') $$, 'PT400', 'VALIDATION_FAILED', 'invalid preference refused');
select is(api.set_my_consent('marketing_sms', true) -> 'marketing_sms' ->> 'granted', 'true', 'consent changed');
select throws_ok($$ select api.set_my_consent('terms', false) $$, 'PT400', 'VALIDATION_FAILED', 'terms cannot be withdrawn this way');

-- addresses
select set_config('t.a1', api.save_my_address('{"fullName": "Asha Patel", "line1": "1 College Lane", "city": "Hatfield", "postcode": "al10 9ab"}') ->> 'id', true);
select is((select a ->> 'postcode' from jsonb_array_elements(api.list_my_addresses()) a limit 1), 'AL10 9AB', 'postcode normalised');
select is((select a ->> 'isDefault' from jsonb_array_elements(api.list_my_addresses()) a limit 1), 'true', 'first address is the default');
select is((select a ->> 'deliverable' from jsonb_array_elements(api.list_my_addresses()) a limit 1), 'true', 'address is in a delivery zone');
select set_config('t.a2', api.save_my_address('{"label": "Work", "fullName": "Asha Patel", "line1": "2 High St", "city": "London", "postcode": "N10 1AA"}') ->> 'id', true);
select is((select count(*)::int from jsonb_array_elements(api.list_my_addresses()) a where (a ->> 'isDefault')::boolean), 1, 'still exactly one default');
select is(api.set_default_address(current_setting('t.a2')::uuid) -> 0 ->> 'id', current_setting('t.a2'), 'default changed (listed first)');
select is(api.delete_my_address(current_setting('t.a2')::uuid) -> 0 ->> 'isDefault', 'true', 'deleting the default promotes another');
select throws_ok($$ select api.save_my_address('{"fullName": "A", "line1": "x", "city": "y", "postcode": "nope"}') $$, 'PT400', 'POSTCODE_INVALID', 'bad postcode refused');
select throws_ok($$ select api.save_my_address('{"fullName": "A", "city": "y", "postcode": "AL10 9AB"}') $$, 'PT400', 'VALIDATION_FAILED', 'missing street refused');

-- wishlist
select is(jsonb_array_length(api.add_to_wishlist(current_setting('t.rice')::uuid)), 1, 'saved an item');
select is(jsonb_array_length(api.merge_wishlist(array['prod-1', 'basmati-rice-aged', 'no-such-thing'])), 2, 'guest items merged (old id + slug), unknown skipped');
select is(api.list_my_wishlist() -> 0 ->> 'slug', 'organic-red-tomatoes', 'newest saved first, full product cards');
select is(jsonb_array_length(api.remove_from_wishlist(current_setting('t.tom')::uuid)), 1, 'removed an item');
select is(api.clear_my_wishlist(), '[]'::jsonb, 'cleared');

-- GDPR
select is(api.export_my_data() -> 'profile' ->> 'email', 'acct-test@example.com', 'export contains the profile');
select is(jsonb_array_length(api.export_my_data() -> 'consents'), 5, 'export contains the consent history');
select throws_ok($$ select api.delete_my_account('yes') $$, 'PT400', 'VALIDATION_FAILED', 'deletion needs the word DELETE');
select is(api.delete_my_account('DELETE') ->> 'status', 'deleted', 'account deleted');
reset role;
select ok((select anonymised_at is not null and email is null and user_id is null from app.customers where first_name is null and member_since > now() - interval '1 minute' order by created_at desc limit 1), 'profile anonymised');
select is((select count(*)::int from auth.users where id = current_setting('t.uid')::uuid), 0, 'login removed');

-- newsletter double opt-in (as a visitor)
set local role anon;
select is(api.subscribe_newsletter('News.Test@Example.com') ->> 'status', 'check_inbox', 'sign-up answers "check your inbox"');
reset role;
select set_config('t.tok', substring((select body from app.outbound_messages where to_address = 'news.test@example.com' and template_code = 'newsletter_confirm' order by created_at desc limit 1) from 'token=([0-9a-f]+)'), true);
set local role anon;
select is(api.confirm_newsletter(current_setting('t.tok')) ->> 'status', 'subscribed', 'confirmation link subscribes');
select throws_ok(format($$ select api.confirm_newsletter(%L) $$, current_setting('t.tok')), 'PT400', 'TOKEN_INVALID', 'a link works only once');
reset role;
select ok((select body like '%FRESH20%' from app.outbound_messages where to_address = 'news.test@example.com' and template_code = 'newsletter_welcome'), 'welcome email carries the code from settings');

-- staff session context (the Store Manager login)
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from app.staff where email = 'test@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select ok((api.get_session_context() -> 'staff' -> 'permissions') ? 'content', 'Store Manager has every permission, including content');
reset role;

select * from finish();
