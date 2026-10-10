begin;
select plan(30);

select has_table('public', 'royalty_payment_accounts', 'payment account metadata table exists');
select has_table('public', 'royalty_payment_account_events', 'payment account audit table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.royalty_payment_accounts'::regclass),
  'payment account metadata has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.royalty_payment_account_events'::regclass),
  'payment account audit has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.royalty_payment_accounts', 'select'), 'anon has no account metadata grant');
select ok(not has_table_privilege('anon', 'public.royalty_payment_account_events', 'select'), 'anon has no audit grant');
select ok(not has_function_privilege('anon', 'public.list_royalty_payment_accounts(text)', 'execute'), 'anon cannot call masked list RPC');
select ok(has_function_privilege('authenticated', 'public.list_royalty_payment_accounts(text)', 'execute'), 'authenticated role can reach RPC authorization check');
select ok(not has_function_privilege('anon', 'public.is_royalty_account_admin()', 'execute'), 'anon cannot call strict account admin predicate');
select ok(has_function_privilege('authenticated', 'public.is_royalty_account_admin()', 'execute'), 'authenticated users can be evaluated by the strict account admin predicate');
select hasnt_column('public', 'royalty_payment_accounts', 'account_number', 'metadata never stores a plaintext account number');
select hasnt_column('public', 'royalty_payment_accounts', 'holder_name', 'metadata never stores a plaintext holder name');
select hasnt_column('public', 'royalty_payment_account_events', 'account_number', 'audit never stores account numbers');
select hasnt_column('public', 'royalty_payment_account_events', 'details', 'audit has no free-form payload');

insert into public.admin_emails(email, name)
values ('vault-admin@example.test', 'Vault test admin');
insert into auth.users(id, email, email_confirmed_at, is_anonymous)
values ('22222222-2222-2222-2222-222222222222', 'vault-admin@example.test', now(), false);
insert into auth.users(id, email, email_confirmed_at, is_anonymous)
values ('11111111-1111-1111-1111-111111111111', 'ordinary@example.test', now(), false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"ordinary@example.test","role":"authenticated"}', true);

select results_eq(
  $$select count(*)::bigint from public.royalty_payment_accounts$$,
  $$values (0::bigint)$$,
  'non-admin direct table read returns no rows'
);
select throws_ok(
  $$select * from public.list_royalty_payment_accounts(null)$$,
  '42501', 'ADMIN_REQUIRED',
  'non-admin cannot list masked accounts'
);
select throws_ok(
  $$select * from public.save_royalty_payment_account(null, '가상작가', '가상은행', '0000-0000-0000', '가상예금주', 'original_image', date '2026-10-10', true, true, true)$$,
  '42501', 'ADMIN_REQUIRED',
  'non-admin cannot save an account'
);
select throws_ok(
  $$select * from public.reveal_royalty_payment_account('00000000-0000-0000-0000-000000000000', 'reveal')$$,
  '42501', 'ADMIN_REQUIRED',
  'non-admin cannot reveal an account'
);

reset role;
insert into public.admin_emails(email, name)
values
  ('anonymous-admin@example.test', 'Anonymous test user'),
  ('unconfirmed-admin@example.test', 'Unconfirmed test user');
insert into auth.users(id, email, email_confirmed_at, is_anonymous)
values
  ('33333333-3333-3333-3333-333333333333', 'anonymous-admin@example.test', now(), true),
  ('44444444-4444-4444-4444-444444444444', 'unconfirmed-admin@example.test', null, false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","email":"anonymous-admin@example.test","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select * from public.list_royalty_payment_accounts(null)$$,
  '42501', 'ADMIN_REQUIRED',
  'allowlisted anonymous auth user is still denied'
);
select results_eq(
  $$select count(*)::bigint from public.royalty_payment_accounts$$,
  $$values (0::bigint)$$,
  'allowlisted anonymous auth user sees no account rows through RLS'
);

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","email":"unconfirmed-admin@example.test","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.list_royalty_payment_accounts(null)$$,
  '42501', 'ADMIN_REQUIRED',
  'allowlisted unconfirmed auth user is still denied'
);
select results_eq(
  $$select count(*)::bigint from public.royalty_payment_accounts$$,
  $$values (0::bigint)$$,
  'allowlisted unconfirmed auth user sees no account rows through RLS'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"vault-admin@example.test","role":"authenticated"}', true);

select results_eq(
  $$select verification_status from public.save_royalty_payment_account(null, '가상작가', '가상은행', '0000-0000-0000', '', 'original_image', date '2026-10-10', false, false, false)$$,
  $$values ('needs_review'::text)$$,
  'admin can store a synthetic account as review required'
);
select results_eq(
  $$select masked_account from public.list_royalty_payment_accounts('가상작가')$$,
  $$values ('•••• 0000'::text)$$,
  'default list returns only the final four digits'
);
select ok(
  not exists(
    select 1 from public.list_royalty_payment_accounts('가상작가')
    where masked_account like '%000000000000%'
  ),
  'masked list does not contain the full number'
);
select throws_ok(
  $$select * from public.reveal_royalty_payment_account((select id from public.list_royalty_payment_accounts('가상작가')), 'copy')$$,
  '42501', 'ACCOUNT_NOT_VERIFIED',
  'review-required account cannot be copied'
);
select throws_ok(
  $$select * from public.save_royalty_payment_account((select id from public.list_royalty_payment_accounts('가상작가')), '가상작가', '가상은행', '0000-0000-0000', '', 'original_image', date '2026-10-10', false, true, true)$$,
  'P0001', 'ACCOUNT_VERIFICATION_INCOMPLETE',
  'missing holder confirmation cannot become verified'
);
select results_eq(
  $$select verification_status from public.save_royalty_payment_account((select id from public.list_royalty_payment_accounts('가상작가')), '가상작가', '가상은행', '0000-0000-0000', '가상예금주', 'original_image', date '2026-10-10', true, true, true)$$,
  $$values ('verified'::text)$$,
  'clear source and confirmed holder can become verified'
);
select results_eq(
  $$select account_number from public.reveal_royalty_payment_account((select id from public.list_royalty_payment_accounts('가상작가')), 'copy')$$,
  $$values ('000000000000'::text)$$,
  'verified account can be copied through the explicit RPC'
);
select results_eq(
  $$select count(*)::bigint from public.royalty_payment_account_events where account_id = (select id from public.list_royalty_payment_accounts('가상작가'))$$,
  $$values (3::bigint)$$,
  'create, verify and copy actions are audited without a payload'
);

select * from finish();
rollback;
