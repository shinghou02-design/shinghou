-- =====================================================================
-- 代辦事項追蹤 V2.0.0（建議版本）— 第一階段：新增登入所需的結構與規則
-- 執行時機：部署新版前端「之前」
-- 影響：只「新增」東西，不會收回匿名權限，舊版網頁仍可正常使用
-- 可重複執行
-- =====================================================================

-- 1. 人員名冊（登入帳號 ↔ 姓名 ↔ 角色）
create table if not exists public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  role       text not null default 'staff' check (role in ('staff', 'supervisor')),
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
revoke all on public.staff from anon;

-- 2. 判斷身分的函式（security definer：讀 staff 時不受 RLS 影響，避免遞迴）
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

create or replace function public.is_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'supervisor');
$$;

create or replace function public.my_staff_name() returns text
language sql stable security definer set search_path = public as $$
  select name from public.staff where user_id = auth.uid();
$$;

revoke execute on function public.is_staff(), public.is_supervisor(), public.my_staff_name() from anon, public;
grant  execute on function public.is_staff(), public.is_supervisor(), public.my_staff_name() to authenticated;

-- 3. 歷程紀錄加上「操作人帳號」欄位（前端會自動帶入）
alter table public.todo_updates add column if not exists author_id uuid references auth.users (id);

-- 4. 給「已登入員工」的規則（RLS 未啟用前不會生效；啟用後才生效）
drop policy if exists "v2 staff read staff"     on public.staff;
drop policy if exists "v2 staff read items"     on public.todo_items;
drop policy if exists "v2 staff insert items"   on public.todo_items;
drop policy if exists "v2 staff update items"   on public.todo_items;
drop policy if exists "v2 staff read updates"   on public.todo_updates;
drop policy if exists "v2 staff insert updates" on public.todo_updates;

create policy "v2 staff read staff"     on public.staff        for select to authenticated using (public.is_staff());
create policy "v2 staff read items"     on public.todo_items   for select to authenticated using (public.is_staff());
create policy "v2 staff insert items"   on public.todo_items   for insert to authenticated with check (public.is_staff());
create policy "v2 staff update items"   on public.todo_items   for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "v2 staff read updates"   on public.todo_updates for select to authenticated using (public.is_staff());
create policy "v2 staff insert updates" on public.todo_updates for insert to authenticated
  with check (public.is_staff() and author_id = auth.uid());
-- 刻意不建立任何 DELETE 規則：前端無法刪除資料，保留稽核軌跡

-- 5. 照片：已登入員工可上傳、可讀取（bucket 仍維持原本的公開設定，第二階段才改）
drop policy if exists "v2 staff read todo photos"   on storage.objects;
drop policy if exists "v2 staff upload todo photos" on storage.objects;

create policy "v2 staff read todo photos" on storage.objects for select to authenticated
  using (bucket_id = 'todo-photos' and public.is_staff());
create policy "v2 staff upload todo photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'todo-photos' and public.is_staff());

-- =====================================================================
-- 6. 開通人員（請依實際人員修改後執行）
--    先到 Authentication → Users → Add user 建立帳號（勾選 Auto Confirm），
--    再用 Email 對應寫入 staff。
-- =====================================================================
-- insert into public.staff (user_id, name, role)
-- select id, '王小明', 'supervisor' from auth.users where email = 'supervisor@example.com'
-- on conflict (user_id) do update set name = excluded.name, role = excluded.role;
--
-- insert into public.staff (user_id, name, role)
-- select id, '陳小華', 'staff' from auth.users where email = 'staff1@example.com'
-- on conflict (user_id) do update set name = excluded.name, role = excluded.role;
