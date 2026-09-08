-- ============================================================
-- 杏和醫院集團 — 網路暨電腦資源開通申請書
-- 資料表 + 權限設定。請在 Supabase 後台（amhorqegfaadfbgfhwrd 專案）
-- 左側選單 SQL Editor，貼上整段執行一次即可。
-- ============================================================

create table if not exists public.it_access_requests (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),

  hospital          text not null,          -- 醫院院別（下拉選單或自填）
  apply_date        date not null default current_date,
  name              text not null,          -- 姓名
  department        text,                   -- 部門／單位
  title             text,                   -- 職稱
  employee_id       text,                   -- 員工編號
  extension         text,                   -- 分機電話

  net_access        text check (net_access in ('是','否')),          -- 1. 對外網路開通
  folder_shinghou   boolean not null default false,                  -- 2. 杏和醫院共資夾
  folder_shingyong  boolean not null default false,                  --    杏永醫院共資夾
  folder_access     text check (folder_access in ('是','否')),       --    共用資料夾開通
  usb_access        text check (usb_access in ('是','否')),          -- 3. 電腦USB開通

  agree_declaration boolean not null default false check (agree_declaration = true), -- 資安切結聲明同意

  status            text not null default '待處理'
                      check (status in ('待處理','處理中','已完成','已拒絕')),
  handled_by        text,
  handled_at        timestamptz,
  handle_note       text
);

alter table public.it_access_requests enable row level security;

-- 允許任何人（用前台的 anon key）送出申請
drop policy if exists "public insert requests" on public.it_access_requests;
create policy "public insert requests" on public.it_access_requests
  for insert to anon, authenticated with check (true);

-- 允許查詢/後台頁讀取全部申請
drop policy if exists "public read requests" on public.it_access_requests;
create policy "public read requests" on public.it_access_requests
  for select to anon, authenticated using (true);

-- 允許後台頁更新處理狀態
drop policy if exists "public update requests" on public.it_access_requests;
create policy "public update requests" on public.it_access_requests
  for update to anon, authenticated using (true) with check (true);

-- ============================================================
-- 後台查詢頁的簡易密碼保護（沿用你原本 style.css 就有的 .gate 元件）
-- 如果 hospital_admin 這個表還沒建立，一併建立起來
-- ============================================================
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
