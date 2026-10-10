-- 작가 인세 지급계좌 전용 저장소.
-- 실제 계좌번호와 예금주는 Supabase Vault에 암호화해 두고 이 테이블에는
-- 관리자 목록에 필요한 마스킹 값과 확인 이력만 남긴다.

create table public.royalty_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 100),
  bank_name text not null check (char_length(btrim(bank_name)) between 1 and 50),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  holder_masked text not null default '',
  vault_secret_id uuid not null unique references vault.secrets(id) on delete restrict,
  verification_status text not null default 'needs_review'
    check (verification_status in ('needs_review', 'verified')),
  holder_confirmed boolean not null default false,
  source_clear boolean not null default false,
  source_type text not null
    check (source_type in ('original_image', 'bankbook_copy', 'author_message', 'manual_note')),
  source_checked_on date not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  verified_at timestamptz,
  verified_by text,
  constraint royalty_payment_accounts_verified_check check (
    verification_status <> 'verified'
    or (holder_confirmed and source_clear and holder_masked <> '')
  )
);

create unique index royalty_payment_accounts_author_name_key
  on public.royalty_payment_accounts (lower(btrim(author_name)));

create table public.royalty_payment_account_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.royalty_payment_accounts(id) on delete restrict,
  action text not null check (action in ('created', 'updated', 'verified', 'marked_review', 'revealed', 'copied')),
  actor_email text not null,
  happened_at timestamptz not null default now()
);

create index royalty_payment_account_events_account_time_idx
  on public.royalty_payment_account_events (account_id, happened_at desc);

create or replace function public.is_royalty_account_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and lower(coalesce(auth.jwt() ->> 'email', '')) <> ''
    and public.is_admin()
    and exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and not coalesce(u.is_anonymous, false)
        and u.email_confirmed_at is not null
        and lower(coalesce(u.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

revoke all on function public.is_royalty_account_admin() from public, anon, authenticated;
grant execute on function public.is_royalty_account_admin() to authenticated;

create or replace function private.require_royalty_account_admin()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not (select public.is_royalty_account_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

revoke all on function private.require_royalty_account_admin() from public, anon, authenticated;

alter table public.royalty_payment_accounts enable row level security;
alter table public.royalty_payment_account_events enable row level security;

revoke all privileges on table public.royalty_payment_accounts, public.royalty_payment_account_events
  from anon, authenticated;
grant select on table public.royalty_payment_accounts, public.royalty_payment_account_events
  to authenticated;

create policy royalty_payment_accounts_admin_select
  on public.royalty_payment_accounts
  for select to authenticated
  using ((select public.is_royalty_account_admin()));

create policy royalty_payment_account_events_admin_select
  on public.royalty_payment_account_events
  for select to authenticated
  using ((select public.is_royalty_account_admin()));

create or replace function public.list_royalty_payment_accounts(p_author_name text default null)
returns table (
  id uuid,
  author_name text,
  bank_name text,
  masked_account text,
  masked_holder text,
  verification_status text,
  holder_confirmed boolean,
  source_clear boolean,
  source_type text,
  source_checked_on date,
  updated_at timestamptz,
  updated_by text,
  verified_at timestamptz,
  verified_by text,
  last_access_at timestamptz,
  last_access_action text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_royalty_account_admin();

  return query
  select a.id,
         a.author_name,
         a.bank_name,
         '•••• ' || a.account_last4,
         a.holder_masked,
         a.verification_status,
         a.holder_confirmed,
         a.source_clear,
         a.source_type,
         a.source_checked_on,
         a.updated_at,
         a.updated_by,
         a.verified_at,
         a.verified_by,
         last_event.happened_at,
         last_event.action
  from public.royalty_payment_accounts a
  left join lateral (
    select e.happened_at, e.action
    from public.royalty_payment_account_events e
    where e.account_id = a.id and e.action in ('revealed', 'copied')
    order by e.happened_at desc
    limit 1
  ) last_event on true
  where p_author_name is null or lower(btrim(a.author_name)) = lower(btrim(p_author_name))
  order by a.author_name;
end;
$$;

create or replace function public.save_royalty_payment_account(
  p_id uuid,
  p_author_name text,
  p_bank_name text,
  p_account_number text,
  p_holder_name text,
  p_source_type text,
  p_source_checked_on date,
  p_holder_confirmed boolean default false,
  p_source_clear boolean default false,
  p_mark_verified boolean default false
)
returns table (id uuid, verification_status text, masked_account text, masked_holder text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_number text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
  v_author text := btrim(coalesce(p_author_name, ''));
  v_bank text := btrim(coalesce(p_bank_name, ''));
  v_holder text := btrim(coalesce(p_holder_name, ''));
  v_holder_masked text;
  v_secret_id uuid;
  v_id uuid;
  v_status text;
  v_action text;
begin
  v_actor := private.require_royalty_account_admin();
  if char_length(v_author) not between 1 and 100 then raise exception 'AUTHOR_REQUIRED'; end if;
  if char_length(v_bank) not between 1 and 50 then raise exception 'BANK_REQUIRED'; end if;
  if char_length(v_number) not between 8 and 20 then raise exception 'ACCOUNT_NUMBER_INVALID'; end if;
  if p_source_type not in ('original_image', 'bankbook_copy', 'author_message', 'manual_note') then
    raise exception 'SOURCE_REQUIRED';
  end if;
  if p_source_checked_on is null then raise exception 'SOURCE_DATE_REQUIRED'; end if;
  if p_mark_verified and (v_holder = '' or not coalesce(p_holder_confirmed, false) or not coalesce(p_source_clear, false)) then
    raise exception 'ACCOUNT_VERIFICATION_INCOMPLETE';
  end if;

  v_holder_masked := case
    when v_holder = '' then ''
    when char_length(v_holder) = 1 then '*'
    when char_length(v_holder) = 2 then left(v_holder, 1) || '*'
    else left(v_holder, 1) || repeat('*', char_length(v_holder) - 2) || right(v_holder, 1)
  end;
  v_status := case when p_mark_verified then 'verified' else 'needs_review' end;

  if p_id is null then
    v_secret_id := vault.create_secret(
      jsonb_build_object('account_number', v_number, 'holder_name', v_holder)::text,
      null,
      'royalty payment account'
    );
    insert into public.royalty_payment_accounts (
      author_name, bank_name, account_last4, holder_masked, vault_secret_id,
      verification_status, holder_confirmed, source_clear, source_type, source_checked_on,
      created_by, updated_by, verified_at, verified_by
    ) values (
      v_author, v_bank, right(v_number, 4), v_holder_masked, v_secret_id,
      v_status, coalesce(p_holder_confirmed, false), coalesce(p_source_clear, false),
      p_source_type, p_source_checked_on, v_actor, v_actor,
      case when v_status = 'verified' then now() end,
      case when v_status = 'verified' then v_actor end
    ) returning royalty_payment_accounts.id into v_id;
    v_action := 'created';
  else
    select a.vault_secret_id into v_secret_id
    from public.royalty_payment_accounts a
    where a.id = p_id
    for update;
    if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

    perform vault.update_secret(
      v_secret_id,
      jsonb_build_object('account_number', v_number, 'holder_name', v_holder)::text
    );
    update public.royalty_payment_accounts a set
      author_name = v_author,
      bank_name = v_bank,
      account_last4 = right(v_number, 4),
      holder_masked = v_holder_masked,
      verification_status = v_status,
      holder_confirmed = coalesce(p_holder_confirmed, false),
      source_clear = coalesce(p_source_clear, false),
      source_type = p_source_type,
      source_checked_on = p_source_checked_on,
      updated_at = now(),
      updated_by = v_actor,
      verified_at = case when v_status = 'verified' then now() end,
      verified_by = case when v_status = 'verified' then v_actor end
    where a.id = p_id
    returning a.id into v_id;
    v_action := case when v_status = 'verified' then 'verified' else 'updated' end;
  end if;

  insert into public.royalty_payment_account_events(account_id, action, actor_email)
  values (v_id, v_action, v_actor);

  return query
  select a.id, a.verification_status, '•••• ' || a.account_last4, a.holder_masked
  from public.royalty_payment_accounts a
  where a.id = v_id;
end;
$$;

create or replace function public.reveal_royalty_payment_account(
  p_id uuid,
  p_action text default 'reveal'
)
returns table (
  id uuid,
  author_name text,
  bank_name text,
  account_number text,
  holder_name text,
  verification_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_status text;
  v_secret jsonb;
begin
  v_actor := private.require_royalty_account_admin();
  if p_action not in ('reveal', 'copy') then raise exception 'ACTION_INVALID'; end if;

  select a.verification_status, d.decrypted_secret::jsonb
  into v_status, v_secret
  from public.royalty_payment_accounts a
  join vault.decrypted_secrets d on d.id = a.vault_secret_id
  where a.id = p_id;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if p_action = 'copy' and v_status <> 'verified' then
    raise exception 'ACCOUNT_NOT_VERIFIED' using errcode = '42501';
  end if;

  insert into public.royalty_payment_account_events(account_id, action, actor_email)
  values (p_id, case when p_action = 'copy' then 'copied' else 'revealed' end, v_actor);

  return query
  select a.id,
         a.author_name,
         a.bank_name,
         v_secret ->> 'account_number',
         v_secret ->> 'holder_name',
         a.verification_status
  from public.royalty_payment_accounts a
  where a.id = p_id;
end;
$$;

revoke all on function public.list_royalty_payment_accounts(text) from public, anon, authenticated;
revoke all on function public.save_royalty_payment_account(uuid, text, text, text, text, text, date, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.reveal_royalty_payment_account(uuid, text) from public, anon, authenticated;

grant execute on function public.list_royalty_payment_accounts(text) to authenticated;
grant execute on function public.save_royalty_payment_account(uuid, text, text, text, text, text, date, boolean, boolean, boolean) to authenticated;
grant execute on function public.reveal_royalty_payment_account(uuid, text) to authenticated;
