-- ============================================================
-- 代辦事項每週更新 — 支援上傳照片
-- 請在 Supabase 後台（shinghou02 專案）SQL Editor 貼上整段執行一次。
-- ============================================================

-- 1. 建立存放照片的 Storage 儲存桶（公開讀取，單檔限制 5MB）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'todo-photos', 'todo-photos', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'];

-- 2. 允許任何人（用前台的 anon key）上傳與讀取這個桶子裡的照片
drop policy if exists "public upload todo photos" on storage.objects;
create policy "public upload todo photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'todo-photos');

drop policy if exists "public read todo photos" on storage.objects;
create policy "public read todo photos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'todo-photos');

-- 3. 資料表加上照片欄位
alter table public.todo_items   add column if not exists last_update_photos text[];
alter table public.todo_updates add column if not exists photo_urls text[];
