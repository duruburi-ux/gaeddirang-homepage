begin;
select plan(30);

select ok(exists(select 1 from storage.buckets where id='settlement-documents' and public=false), 'settlement bucket is private');
select has_table('public', 'settlement_documents', 'settlement document metadata table exists');
select has_table('public', 'settlement_document_events', 'settlement document audit table exists');
select has_index('public', 'settlement_documents', 'settlement_documents_sha256_key', 'identical files cannot be registered twice');
select ok((select relrowsecurity from pg_class where oid='public.settlement_documents'::regclass), 'document metadata has RLS');
select ok((select relrowsecurity from pg_class where oid='public.settlement_document_events'::regclass), 'document audit has RLS');
select ok(not has_table_privilege('anon','public.settlement_documents','select'), 'anon has no metadata grant');
select ok(not has_table_privilege('authenticated','public.settlement_documents','select'), 'authenticated has no direct metadata grant');
select ok(not has_table_privilege('anon','public.settlement_document_events','select'), 'anon has no audit grant');
select ok(not has_table_privilege('authenticated','public.settlement_document_events','select'), 'authenticated has no direct audit grant');
select ok(not has_function_privilege('anon','public.list_settlement_documents()','execute'), 'anon cannot list document metadata');
select ok(has_function_privilege('authenticated','public.list_settlement_documents()','execute'), 'authenticated reaches the strict list authorization check');
select ok(not has_function_privilege('anon','public.is_settlement_document_admin()','execute'), 'anon cannot call strict archive admin predicate');
select ok(has_function_privilege('authenticated','public.is_settlement_document_admin()','execute'), 'authenticated users can be evaluated by the strict archive admin predicate');
select ok(not has_function_privilege('anon','public.register_settlement_document(text,text,text,date,date,text,text,text,text,bigint,text,text,uuid)','execute'), 'anon cannot register documents');
select ok(has_function_privilege('authenticated','public.register_settlement_document(text,text,text,date,date,text,text,text,text,bigint,text,text,uuid)','execute'), 'authenticated reaches the strict register authorization check');
select ok(not has_function_privilege('anon','public.set_settlement_document_status(uuid,text)','execute'), 'anon cannot change document status');
select ok(has_function_privilege('authenticated','public.set_settlement_document_status(uuid,text)','execute'), 'authenticated reaches the strict status authorization check');
select ok(not has_function_privilege('anon','public.record_settlement_document_access(uuid,text)','execute'), 'anon cannot record or request access');
select ok(has_function_privilege('authenticated','public.record_settlement_document_access(uuid,text)','execute'), 'authenticated reaches the strict access authorization check');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='settlement_documents_admin_read' and roles='{authenticated}'), 'private object read policy targets authenticated admins');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='settlement_documents_admin_upload' and roles='{authenticated}'), 'private object upload policy targets authenticated admins');
select ok(not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'settlement_documents%' and cmd='UPDATE'), 'archive has no overwrite policy');
select hasnt_column('public','settlement_documents','file_contents','metadata never stores document contents');
select hasnt_column('public','settlement_document_events','details','audit has no free-form payload');

insert into public.admin_emails(email,name) values ('archive-admin@example.test','Archive test admin');
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
values ('33333333-3333-3333-3333-333333333333','archive-admin@example.test',now(),false);
insert into auth.sessions(id,user_id,created_at,updated_at)
values ('99999999-9999-4999-8999-999999999999','33333333-3333-3333-3333-333333333333',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","email":"ordinary@example.test","role":"authenticated"}',true);

select throws_ok(
  $$select * from public.list_settlement_documents()$$,
  '42501','ADMIN_REQUIRED',
  'non-admin cannot list archive metadata'
);
select throws_ok(
  $$select * from public.register_settlement_document('external_author','가상작가','가상정산서',date '2026-07-01',date '2026-09-30','2026년 3분기','가상정산서.pdf','44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/가상정산서.pdf','application/pdf',100,'0000000000000000000000000000000000000000000000000000000000000000',null,null)$$,
  '42501','ADMIN_REQUIRED',
  'non-admin cannot register a file'
);

select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","email":"archive-admin@example.test","role":"authenticated","session_id":"99999999-9999-4999-8999-999999999999"}',true);
select results_eq(
  $$select count(*)::bigint from public.list_settlement_documents()$$,
  $$values (0::bigint)$$,
  'approved admin can list an empty archive'
);
select throws_ok(
  $$select * from public.register_settlement_document('external_author','가상작가','가상정산서',date '2026-07-01',date '2026-09-30','2026년 3분기','가상정산서.pdf','33333333-3333-3333-3333-333333333333/55555555-5555-5555-5555-555555555555/가상정산서.pdf','application/pdf',100,'0000000000000000000000000000000000000000000000000000000000000000',null,null)$$,
  'P0001','DOCUMENT_FILE_NOT_FOUND',
  'metadata cannot be registered before the private object exists'
);
select throws_ok(
  $$select public.set_settlement_document_status('00000000-0000-0000-0000-000000000000','paid')$$,
  'P0001','DOCUMENT_STATUS_INVALID',
  'payment language cannot be used as a document status'
);

select * from finish();
rollback;
