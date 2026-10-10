-- DRAFT ONLY: 격리된 Supabase 환경에서 검증한 뒤 `supabase migration new`로
-- 정식 마이그레이션을 생성한다. 운영 프로젝트에는 직접 실행하지 않는다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'settlement-documents',
  'settlement-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.settlement_documents (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null default gen_random_uuid(),
  version_no integer not null check (version_no > 0),
  category text not null check (category in ('external_author', 'internal_team', 'company_report')),
  period_start date,
  period_end date,
  period_label text not null check (char_length(btrim(period_label)) between 1 and 80),
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  status text not null default 'review' check (status in ('review', 'confirmed', 'superseded')),
  file_name text not null check (char_length(file_name) between 1 and 180 and file_name !~ '[/\\]'),
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  supersedes_id uuid references public.settlement_documents(id) on delete restrict,
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  constraint settlement_documents_period_check check (
    period_start is null or period_end is null or period_start <= period_end
  ),
  unique (series_id, version_no)
);

create index settlement_documents_category_period_idx
  on public.settlement_documents (category, period_end desc nulls last, period_label, subject);

create unique index settlement_documents_sha256_key
  on public.settlement_documents (sha256);

create table public.settlement_document_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.settlement_documents(id) on delete restrict,
  action text not null check (action in ('uploaded', 'confirmed', 'returned_to_review', 'superseded', 'downloaded')),
  actor_email text not null,
  happened_at timestamptz not null default now()
);

create index settlement_document_events_document_time_idx
  on public.settlement_document_events (document_id, happened_at desc);

alter table public.settlement_documents enable row level security;
alter table public.settlement_document_events enable row level security;

revoke all privileges on table public.settlement_documents, public.settlement_document_events
  from public, anon, authenticated;

create or replace function private.require_settlement_document_admin()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_user_id is null
     or v_email = ''
     or not (select public.is_admin())
     or not exists (
       select 1
       from auth.users u
       where u.id = v_user_id
         and not coalesce(u.is_anonymous, false)
         and u.email_confirmed_at is not null
         and lower(coalesce(u.email, '')) = v_email
     ) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

revoke all on function private.require_settlement_document_admin() from public, anon, authenticated;

create or replace function public.list_settlement_documents()
returns table (
  id uuid,
  series_id uuid,
  version_no integer,
  category text,
  period_start date,
  period_end date,
  period_label text,
  subject text,
  title text,
  status text,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  supersedes_id uuid,
  notes text,
  created_at timestamptz,
  created_by text,
  updated_at timestamptz,
  updated_by text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_settlement_document_admin();
  return query
  select d.id, d.series_id, d.version_no, d.category, d.period_start, d.period_end,
         d.period_label, d.subject, d.title, d.status, d.file_name, d.storage_path,
         d.mime_type, d.size_bytes, d.sha256, d.supersedes_id, d.notes,
         d.created_at, d.created_by, d.updated_at, d.updated_by
  from public.settlement_documents d
  order by d.category, d.period_end desc nulls last, d.period_label desc, d.subject, d.version_no desc;
end;
$$;

create or replace function public.register_settlement_document(
  p_category text,
  p_subject text,
  p_title text,
  p_period_start date,
  p_period_end date,
  p_period_label text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_notes text default null,
  p_supersedes_id uuid default null
)
returns table (id uuid, series_id uuid, version_no integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_user_id uuid := auth.uid();
  v_series_id uuid;
  v_version integer;
  v_id uuid;
  v_previous public.settlement_documents%rowtype;
begin
  v_actor := private.require_settlement_document_admin();
  if p_category not in ('external_author', 'internal_team', 'company_report') then raise exception 'DOCUMENT_CATEGORY_INVALID'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 120 then raise exception 'DOCUMENT_SUBJECT_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 180 then raise exception 'DOCUMENT_TITLE_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_period_label, ''))) not between 1 and 80 then raise exception 'DOCUMENT_PERIOD_REQUIRED'; end if;
  if p_period_start is not null and p_period_end is not null and p_period_start > p_period_end then raise exception 'DOCUMENT_PERIOD_INVALID'; end if;
  if p_mime_type not in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) then raise exception 'DOCUMENT_MIME_INVALID'; end if;
  if p_size_bytes not between 1 and 20971520 then raise exception 'DOCUMENT_SIZE_INVALID'; end if;
  if lower(coalesce(p_sha256, '')) !~ '^[0-9a-f]{64}$' then raise exception 'DOCUMENT_HASH_INVALID'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'DOCUMENT_NOTES_TOO_LONG'; end if;
  if coalesce(p_file_name, '') = '' or p_file_name ~ '[/\\]' then raise exception 'DOCUMENT_FILE_NAME_INVALID'; end if;
  if p_storage_path !~ ('^' || v_user_id::text || '/[0-9a-f-]{36}/[^/]+$') or position('..' in p_storage_path) > 0 then
    raise exception 'DOCUMENT_PATH_INVALID' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'settlement-documents' and o.name = p_storage_path
  ) then raise exception 'DOCUMENT_FILE_NOT_FOUND'; end if;
  if exists (
    select 1 from public.settlement_documents d
    where d.sha256 = lower(p_sha256)
  ) then raise exception 'DOCUMENT_DUPLICATE_FILE'; end if;

  if p_supersedes_id is null then
    v_series_id := gen_random_uuid();
    v_version := 1;
  else
    select * into v_previous
    from public.settlement_documents d
    where d.id = p_supersedes_id
    for update;
    if not found then raise exception 'DOCUMENT_PREVIOUS_NOT_FOUND'; end if;
    if v_previous.status = 'superseded' then raise exception 'DOCUMENT_ALREADY_SUPERSEDED'; end if;
    if v_previous.category <> p_category
       or lower(btrim(v_previous.subject)) <> lower(btrim(p_subject))
       or btrim(v_previous.period_label) <> btrim(p_period_label)
       or btrim(v_previous.title) <> btrim(p_title) then
      raise exception 'DOCUMENT_REPLACEMENT_MISMATCH';
    end if;
    v_series_id := v_previous.series_id;
    select coalesce(max(d.version_no), 0) + 1 into v_version
    from public.settlement_documents d where d.series_id = v_series_id;
    update public.settlement_documents set
      status = 'superseded', updated_at = now(), updated_by = v_actor
    where settlement_documents.id = p_supersedes_id;
    insert into public.settlement_document_events(document_id, action, actor_email)
    values (p_supersedes_id, 'superseded', v_actor);
  end if;

  insert into public.settlement_documents (
    series_id, version_no, category, period_start, period_end, period_label,
    subject, title, status, file_name, storage_path, mime_type, size_bytes,
    sha256, supersedes_id, notes, created_by, updated_by
  ) values (
    v_series_id, v_version, p_category, p_period_start, p_period_end, btrim(p_period_label),
    btrim(p_subject), btrim(p_title), 'review', p_file_name, p_storage_path, p_mime_type,
    p_size_bytes, lower(p_sha256), p_supersedes_id, nullif(btrim(coalesce(p_notes, '')), ''),
    v_actor, v_actor
  ) returning settlement_documents.id into v_id;

  insert into public.settlement_document_events(document_id, action, actor_email)
  values (v_id, 'uploaded', v_actor);

  return query select d.id, d.series_id, d.version_no, d.status
  from public.settlement_documents d where d.id = v_id;
end;
$$;

create or replace function public.set_settlement_document_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_before text;
begin
  v_actor := private.require_settlement_document_admin();
  if p_status not in ('review', 'confirmed', 'superseded') then raise exception 'DOCUMENT_STATUS_INVALID'; end if;
  select d.status into v_before from public.settlement_documents d where d.id = p_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_before = 'superseded' then raise exception 'DOCUMENT_ALREADY_SUPERSEDED'; end if;
  if v_before = p_status then return; end if;
  update public.settlement_documents set status=p_status, updated_at=now(), updated_by=v_actor where id=p_id;
  insert into public.settlement_document_events(document_id, action, actor_email)
  values (p_id, case when p_status='confirmed' then 'confirmed' when p_status='superseded' then 'superseded' else 'returned_to_review' end, v_actor);
end;
$$;

create or replace function public.record_settlement_document_access(p_id uuid, p_action text default 'download')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_path text;
begin
  v_actor := private.require_settlement_document_admin();
  if p_action <> 'download' then raise exception 'DOCUMENT_ACTION_INVALID'; end if;
  select d.storage_path into v_path from public.settlement_documents d where d.id=p_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  insert into public.settlement_document_events(document_id, action, actor_email)
  values (p_id, 'downloaded', v_actor);
  return v_path;
end;
$$;

create or replace function public.can_remove_unregistered_settlement_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_settlement_document_admin();
  return p_name like auth.uid()::text || '/%'
     and not exists (select 1 from public.settlement_documents d where d.storage_path=p_name);
end;
$$;

revoke all on function public.list_settlement_documents() from public, anon, authenticated;
revoke all on function public.register_settlement_document(text, text, text, date, date, text, text, text, text, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.set_settlement_document_status(uuid, text) from public, anon, authenticated;
revoke all on function public.record_settlement_document_access(uuid, text) from public, anon, authenticated;
revoke all on function public.can_remove_unregistered_settlement_object(text) from public, anon, authenticated;

grant execute on function public.list_settlement_documents() to authenticated;
grant execute on function public.register_settlement_document(text, text, text, date, date, text, text, text, text, bigint, text, text, uuid) to authenticated;
grant execute on function public.set_settlement_document_status(uuid, text) to authenticated;
grant execute on function public.record_settlement_document_access(uuid, text) to authenticated;
grant execute on function public.can_remove_unregistered_settlement_object(text) to authenticated;

create policy settlement_documents_admin_read
on storage.objects for select to authenticated
using (bucket_id = 'settlement-documents' and (select public.is_admin()));

create policy settlement_documents_admin_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'settlement-documents'
  and (select public.is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy settlement_documents_admin_cleanup
on storage.objects for delete to authenticated
using (
  bucket_id = 'settlement-documents'
  and (select public.can_remove_unregistered_settlement_object(name))
);
