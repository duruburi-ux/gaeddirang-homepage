drop policy if exists "누구나 읽기 가능" on public.reviews;
drop policy if exists reviews_admin_read on public.reviews;

create policy reviews_admin_read
on public.reviews
for select
to authenticated
using ((select public.is_admin()));

revoke all privileges on table public.reviews from anon;
revoke all privileges on table public.reviews from authenticated;
grant select on table public.reviews to authenticated;

alter function public.handle_new_user() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter function public.is_admin() set search_path = '';
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
