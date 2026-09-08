-- ============================================================
-- 修正：後台「變更密碼」功能因為權限（RLS）沒開，實際上並沒有真的存進資料庫
-- 請在 Supabase 後台（shinghou02 專案）SQL Editor 貼上整段執行一次。
-- ============================================================

-- 1. 補上允許修改 hospital_admin 資料表的權限
alter table public.hospital_admin enable row level security;

drop policy if exists "public update admin config" on public.hospital_admin;
create policy "public update admin config" on public.hospital_admin
  for update to anon, authenticated
  using (true)
  with check (true);

-- 2. 立即把密碼重設回一個你知道的值，解除目前登不進去的狀況
--    請把下面的 'shinghou-it2026' 換成你要用的新密碼，再執行這一段
update public.hospital_admin
set value = 'shinghou-it2026'
where key = 'requests_admin_password';
