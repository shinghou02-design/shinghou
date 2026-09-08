-- ============================================================
-- 杏和醫院集團 — 代辦事項追蹤（每週更新 + 主管審核 + 逾期紅燈）
-- 請在 Supabase 後台（amhorqegfaadfbgfhwrd 專案）SQL Editor 貼上整段執行一次。
-- ============================================================

create table if not exists public.todo_items (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),

  title            text not null,           -- 標題
  description      text,                    -- 說明
  owner            text not null,           -- 負責人（自由填寫姓名，不做帳號登入）
  target_date      date,                    -- 整體到期日／目標完成日（選填）

  status           text not null default '進行中'
                     check (status in ('進行中','待審核','已結案')),

  last_update_at   timestamptz,             -- 最近一次每週更新的時間
  last_update_note text,                    -- 最近一次每週更新的內容

  closed_at        timestamptz,
  closed_by        text
);

alter table public.todo_items enable row level security;

drop policy if exists "public insert todo_items" on public.todo_items;
create policy "public insert todo_items" on public.todo_items
  for insert to anon, authenticated with check (true);

drop policy if exists "public read todo_items" on public.todo_items;
create policy "public read todo_items" on public.todo_items
  for select to anon, authenticated using (true);

drop policy if exists "public update todo_items" on public.todo_items;
create policy "public update todo_items" on public.todo_items
  for update to anon, authenticated using (true) with check (true);

-- 每一筆代辦事項的歷史紀錄（每次「送出更新」「通過結案」「退回」都留一筆）
create table if not exists public.todo_updates (
  id          bigint generated always as identity primary key,
  todo_id     bigint not null references public.todo_items(id) on delete cascade,
  created_at  timestamptz not null default now(),
  author      text,
  action      text not null check (action in ('新增','更新','通過結案','退回','重新開啟')),
  note        text
);

alter table public.todo_updates enable row level security;

drop policy if exists "public insert todo_updates" on public.todo_updates;
create policy "public insert todo_updates" on public.todo_updates
  for insert to anon, authenticated with check (true);

drop policy if exists "public read todo_updates" on public.todo_updates;
create policy "public read todo_updates" on public.todo_updates
  for select to anon, authenticated using (true);

-- 沿用網路申請書後台已經建立的 hospital_admin 密碼保護，兩個後台共用同一組密碼
-- （如果 hospital_admin 這個表還沒建立，一併建立起來，跟 migration_it_access_requests.sql 裡的邏輯相同）
create table if not exists public.hospital_admin (
  key   text primary key,
  value text not null
);

alter table public.hospital_admin enable row level security;

drop policy if exists "public read admin config" on public.hospital_admin;
create policy "public read admin config" on public.hospital_admin
  for select to anon, authenticated using (true);

insert into public.hospital_admin (key, value)
values ('requests_admin_password', 'shinghou-it2026')
on conflict (key) do nothing;
