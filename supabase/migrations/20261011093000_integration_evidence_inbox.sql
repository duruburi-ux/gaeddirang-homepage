-- Additive only. Do not deploy without the matching integration-ingest function
-- and an explicit review of the source scopes. This migration never writes SCM,
-- channel inventory, settlements, messages, or payment state.

create table if not exists public.integration_evidence_inbox (
  id uuid primary key default gen_random_uuid(),
  connector_code text not null check (connector_code in ('homepage','smartstore','payhere','naver_mail','google_chat','naver_settlement')),
  source_event_id text not null check (char_length(source_event_id) between 1 and 300),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null,
  evidence_type text not null check (char_length(evidence_type) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 180),
  source_ref text check (source_ref is null or char_length(source_ref) <= 300),
  attachment_hashes text[] not null default '{}',
  candidate_type text not null check (candidate_type in ('evidence','reservation','sale','reversal','settlement_candidate')),
  candidate_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(candidate_payload) = 'object'),
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  review_status text not null default 'pending' check (review_status in ('pending','reviewed','rejected','duplicate','conflict')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  ingest_run_id uuid not null,
  created_at timestamptz not null default now(),
  -- Keep the immutable actor UUID for audit without blocking account offboarding.
  created_by uuid not null,
  unique (connector_code, source_event_id, content_hash)
);

create index if not exists integration_evidence_inbox_review_idx
  on public.integration_evidence_inbox (review_status, occurred_at desc);
create index if not exists integration_evidence_inbox_source_idx
  on public.integration_evidence_inbox (connector_code, source_event_id, occurred_at desc);

alter table public.integration_evidence_inbox enable row level security;
revoke all on table public.integration_evidence_inbox from public, anon, authenticated;
grant select on table public.integration_evidence_inbox to authenticated;

drop policy if exists integration_evidence_admin_select on public.integration_evidence_inbox;
create policy integration_evidence_admin_select
  on public.integration_evidence_inbox for select to authenticated
  using ((select public.is_admin()));

create or replace function private.ingest_integration_evidence_internal(
  p_connector_code text,
  p_run_id uuid,
  p_rows jsonb
)
returns table(evidence_id uuid, source_event_id text, result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_current_admin();
  v_row jsonb;
  v_id uuid;
  v_source_id text;
  v_hash text;
  v_candidate_type text;
  v_status text;
begin
  if p_connector_code not in ('homepage','smartstore','payhere','naver_mail','google_chat','naver_settlement') then
    raise exception 'CONNECTOR_NOT_SUPPORTED';
  end if;
  if p_run_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception 'EVIDENCE_ROWS_INVALID';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_source_id := btrim(coalesce(v_row ->> 'source_event_id',''));
    v_hash := lower(btrim(coalesce(v_row ->> 'content_hash','')));
    v_candidate_type := btrim(coalesce(v_row ->> 'candidate_type','evidence'));
    if char_length(v_source_id) not between 1 and 300 or v_hash !~ '^[a-f0-9]{64}$'
       or v_candidate_type not in ('evidence','reservation','sale','reversal','settlement_candidate') then
      raise exception 'EVIDENCE_ROW_INVALID';
    end if;
    if jsonb_typeof(coalesce(v_row -> 'attachment_hashes','[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_row -> 'attachment_hashes','[]'::jsonb)) > 20
       or exists (
         select 1 from jsonb_array_elements_text(coalesce(v_row -> 'attachment_hashes','[]'::jsonb)) h(value)
          where h.value !~ '^[a-f0-9]{64}$'
       )
       or jsonb_typeof(coalesce(v_row -> 'candidate_payload','{}'::jsonb)) <> 'object'
       or coalesce(v_row -> 'candidate_payload','{}'::jsonb)
            - array['canonical_sku','quantity','unit_amount','reverses_event_id'] <> '{}'::jsonb
       or (coalesce(v_row -> 'candidate_payload','{}'::jsonb) ? 'canonical_sku'
           and coalesce(v_row #> '{candidate_payload,canonical_sku}','null'::jsonb) <> 'null'::jsonb
           and jsonb_typeof(v_row #> '{candidate_payload,canonical_sku}') <> 'string')
       or (coalesce(v_row -> 'candidate_payload','{}'::jsonb) ? 'quantity'
           and coalesce(v_row #> '{candidate_payload,quantity}','null'::jsonb) <> 'null'::jsonb
           and jsonb_typeof(v_row #> '{candidate_payload,quantity}') <> 'number')
       or (coalesce(v_row -> 'candidate_payload','{}'::jsonb) ? 'unit_amount'
           and coalesce(v_row #> '{candidate_payload,unit_amount}','null'::jsonb) <> 'null'::jsonb
           and jsonb_typeof(v_row #> '{candidate_payload,unit_amount}') <> 'number')
       or (coalesce(v_row -> 'candidate_payload','{}'::jsonb) ? 'reverses_event_id'
           and coalesce(v_row #> '{candidate_payload,reverses_event_id}','null'::jsonb) <> 'null'::jsonb
           and jsonb_typeof(v_row #> '{candidate_payload,reverses_event_id}') <> 'string')
       or char_length(coalesce(v_row #>> '{candidate_payload,canonical_sku}','')) > 80
       or char_length(coalesce(v_row #>> '{candidate_payload,reverses_event_id}','')) > 300
       or pg_column_size(coalesce(v_row -> 'candidate_payload','{}'::jsonb)) > 4096 then
      raise exception 'EVIDENCE_ROW_INVALID';
    end if;
    if p_connector_code in ('naver_mail','google_chat') and v_candidate_type <> 'evidence' then
      raise exception 'MESSAGE_IS_EVIDENCE_ONLY';
    end if;

    -- Serialize the same upstream event across admins and retries so the exact
    -- duplicate/conflict decision is made after any earlier transaction commits.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_connector_code || ':' || v_source_id, 0)
    );

    select e.id into v_id
      from public.integration_evidence_inbox e
     where e.connector_code=p_connector_code and e.source_event_id=v_source_id and e.content_hash=v_hash
     limit 1;
    if v_id is not null then
      evidence_id:=v_id;source_event_id:=v_source_id;result:='duplicate';return next;continue;
    end if;

    v_status := case when exists (
      select 1 from public.integration_evidence_inbox e
       where e.connector_code=p_connector_code and e.source_event_id=v_source_id
    ) then 'conflict' else 'pending' end;

    insert into public.integration_evidence_inbox (
      connector_code,source_event_id,content_hash,occurred_at,evidence_type,summary,source_ref,
      attachment_hashes,candidate_type,candidate_payload,review_reason,review_status,ingest_run_id,created_by
    ) values (
      p_connector_code,v_source_id,v_hash,(v_row ->> 'occurred_at')::timestamptz,
      left(btrim(coalesce(v_row ->> 'evidence_type','')),80),left(btrim(coalesce(v_row ->> 'summary','')),180),
      nullif(left(btrim(coalesce(v_row ->> 'source_ref','')),300),''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_row -> 'attachment_hashes','[]'::jsonb)) limit 20),'{}'),
      v_candidate_type,coalesce(v_row -> 'candidate_payload','{}'::jsonb),
      nullif(left(btrim(coalesce(v_row ->> 'review_reason','')),500),''),v_status,p_run_id,v_user_id
    ) returning id into v_id;
    evidence_id:=v_id;source_event_id:=v_source_id;result:=case when v_status='conflict' then 'conflict' else 'inserted' end;return next;
  end loop;
end;
$$;

create or replace function private.review_integration_evidence_internal(
  p_evidence_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_current_admin();
  v_row public.integration_evidence_inbox%rowtype;
begin
  if p_evidence_id is null or p_decision not in ('pending','reviewed','rejected')
     or char_length(coalesce(p_note,'')) > 500 then
    raise exception 'REVIEW_INVALID';
  end if;
  update public.integration_evidence_inbox
     set review_status=p_decision,
         review_note=nullif(btrim(coalesce(p_note,'')),''),
         reviewed_at=case when p_decision='pending' then null else now() end,
         reviewed_by=case when p_decision='pending' then null else v_user_id end
   where id=p_evidence_id
   returning * into v_row;
  if not found then raise exception 'EVIDENCE_NOT_FOUND'; end if;
  return jsonb_build_object('id',v_row.id,'review_status',v_row.review_status,'ledger_changed',false);
end;
$$;

-- Keep the privileged implementations outside the exposed schema. These
-- public wrappers run as the caller and only forward to internals that perform
-- a fresh require_current_admin() check.
create or replace function public.ingest_integration_evidence(
  p_connector_code text,
  p_run_id uuid,
  p_rows jsonb
)
returns table(evidence_id uuid, source_event_id text, result text)
language sql
security invoker
set search_path = ''
as $$
  select *
    from private.ingest_integration_evidence_internal(p_connector_code, p_run_id, p_rows);
$$;

create or replace function public.review_integration_evidence(
  p_evidence_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.review_integration_evidence_internal(p_evidence_id, p_decision, p_note);
$$;

revoke all on function private.ingest_integration_evidence_internal(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function private.review_integration_evidence_internal(uuid,text,text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.ingest_integration_evidence_internal(text,uuid,jsonb) to authenticated;
grant execute on function private.review_integration_evidence_internal(uuid,text,text) to authenticated;
revoke all on function public.ingest_integration_evidence(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.review_integration_evidence(uuid,text,text) from public, anon, authenticated;
grant execute on function public.ingest_integration_evidence(text,uuid,jsonb) to authenticated;
grant execute on function public.review_integration_evidence(uuid,text,text) to authenticated;

comment on table public.integration_evidence_inbox is
  'Private admin evidence metadata only. Message bodies, attachments, bank data, tokens, and credentials are not stored.';
