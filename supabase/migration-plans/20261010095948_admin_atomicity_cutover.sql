-- APPROVAL-HELD PLAN: move this file into migrations only after the public and
-- admin clients have moved to the v1 order RPCs and preview observation passes.
-- This migration removes the old split-write API surface; it does not delete rows.

drop policy if exists "누구나 주문 제출 가능" on public.orders;
drop policy if exists "public insert order_items" on public.order_items;

revoke insert, delete on table public.orders from anon, authenticated;
revoke insert, update, delete on table public.order_items from anon, authenticated;
revoke select, update, delete on table public.orders from anon;
revoke select, update, delete on table public.order_items from anon;

drop policy if exists "누구나 신청 제출 가능" on public.applications;
create policy applications_public_insert
on public.applications for insert
to anon, authenticated
with check (
  status = '신규'
  and photo_consent = true
  and refund_confirmed = true
  and attended = false
  and attended_at is null
  and review_requested = false
  and channel = '홈페이지'
  and char_length(btrim(program_name)) between 1 and 200
  and char_length(btrim(applicant_name)) between 1 and 100
  and char_length(btrim(contact)) between 1 and 50
  and char_length(btrim(email)) between 3 and 254
  and lower(btrim(email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  and char_length(coalesce(participant_count, '')) between 1 and 30
  and char_length(coalesce(message, '')) <= 2000
  and char_length(coalesce(motivation, '')) <= 4000
  and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
);

drop policy if exists applications_admin_insert on public.applications;
create policy applications_admin_insert
on public.applications for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists inquiries_public_insert on public.inquiries;
create policy inquiries_public_insert
on public.inquiries for insert
to anon, authenticated
with check (
  status = '신규'
  and char_length(btrim(manager_name)) between 1 and 100
  and char_length(btrim(contact)) between 1 and 50
  and (email is null or (
    char_length(btrim(email)) between 3 and 254
    and lower(btrim(email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ))
  and char_length(coalesce(org_name, '')) <= 200
  and char_length(coalesce(inquiry_type, '')) <= 100
  and char_length(coalesce(desired_time, '')) <= 200
  and char_length(coalesce(headcount, '')) <= 50
  and char_length(coalesce(program_wanted, '')) <= 200
  and char_length(coalesce(message, '')) <= 4000
  and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
);

drop policy if exists inquiries_admin_insert on public.inquiries;
create policy inquiries_admin_insert
on public.inquiries for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists "public can insert book_alerts" on public.book_alerts;
create policy book_alerts_public_insert
on public.book_alerts for insert
to anon, authenticated
with check (
  char_length(btrim(email)) between 3 and 254
  and lower(btrim(email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  and char_length(btrim(book_title)) between 1 and 180
  and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
);

revoke delete on table public.applications, public.book_alerts, public.inquiries
  from anon, authenticated;
revoke select, update on table public.applications, public.book_alerts, public.inquiries
  from anon;
