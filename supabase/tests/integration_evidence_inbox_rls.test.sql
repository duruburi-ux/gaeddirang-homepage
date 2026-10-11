begin;

select plan(12);

select has_table('public', 'integration_evidence_inbox', 'evidence inbox exists');
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='integration_evidence_inbox'),
  'evidence inbox has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.integration_evidence_inbox', 'SELECT'),
  'anonymous users cannot read evidence'
);
select ok(
  has_table_privilege('authenticated', 'public.integration_evidence_inbox', 'SELECT'),
  'authenticated role has the minimum select grant'
);
select ok(
  not has_table_privilege('authenticated', 'public.integration_evidence_inbox', 'INSERT,UPDATE,DELETE'),
  'authenticated role has no direct write grant'
);
select ok(
  not has_function_privilege('anon', 'public.ingest_integration_evidence(text,uuid,jsonb)', 'EXECUTE'),
  'anonymous users cannot ingest evidence'
);
select ok(
  has_function_privilege('authenticated', 'public.ingest_integration_evidence(text,uuid,jsonb)', 'EXECUTE'),
  'authenticated role can reach the admin-checking ingest wrapper'
);
select ok(
  not has_function_privilege('anon', 'public.review_integration_evidence(uuid,text,text)', 'EXECUTE'),
  'anonymous users cannot review evidence'
);
select ok(
  has_function_privilege('authenticated', 'public.review_integration_evidence(uuid,text,text)', 'EXECUTE'),
  'authenticated role can reach the admin-checking review wrapper'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('ingest_integration_evidence','review_integration_evidence')
      and p.prosecdef
  ),
  'public RPC wrappers are security invoker'
);
select ok(
  (select count(*)=2 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname in ('ingest_integration_evidence_internal','review_integration_evidence_internal')
      and p.prosecdef),
  'only the two private implementations are security definer'
);
select ok(
  not has_function_privilege('anon', 'private.ingest_integration_evidence_internal(text,uuid,jsonb)', 'EXECUTE'),
  'anonymous users cannot execute private ingestion'
);

select * from finish();
rollback;
