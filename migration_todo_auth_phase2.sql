-- =====================================================================
-- 代辦事項追蹤 V2.0.0（建議版本）— 第二階段：收回匿名權限、鎖定流程
-- 執行時機：新版 todo.html 與 admin.html 上線，且主管與同仁「都已確認能登入、操作正常」之後
-- 範圍：代辦事項（todo_items／todo_updates／todo-photos）＋病床看板（hospital_wards／notes／meta／admin）＋資源申請（it_access_requests）
-- 前提：todo.html、admin.html、request.html、requests-admin.html 的 V2.0.0 皆已上線
-- 影響：⚠️ 舊版網頁與未登入的人將完全無法讀寫；舊照片的公開網址失效
--       （新版前端會自動改用簽章網址顯示舊照片）
-- =====================================================================

begin;

-- 1. 移除 todo_items / todo_updates 上所有「非 v2」的舊規則（例如允許 anon 的規則）
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('todo_items', 'todo_updates')
      and policyname not like 'v2 %'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. 啟用 RLS，並收回匿名的所有資料表權限
alter table public.todo_items   enable row level security;
alter table public.todo_updates enable row level security;
revoke all on public.todo_items, public.todo_updates, public.staff from anon;

-- 3. 照片 bucket 改為不公開，並移除針對 todo-photos 的舊 Storage 規則
update storage.buckets set public = false where id = 'todo-photos';

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname not like 'v2 %'
      and (coalesce(qual, '') ilike '%todo-photos%' or coalesce(with_check, '') ilike '%todo-photos%')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 4. 狀態流程控管：只有主管能結案／退回／重新開啟；結案人自動寫入主管姓名
create or replace function public.todo_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 後台（SQL Editor / service_role）沒有登入身分，不受限制
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status    := '進行中';
    new.closed_at := null;
    new.closed_by := null;
    return new;
  end if;

  -- 已結案的事項，只有主管能改
  if old.status = '已結案' and not public.is_supervisor() then
    raise exception '已結案的事項只有主管可以修改';
  end if;

  if new.status is distinct from old.status then
    if old.status = '進行中' and new.status = '待審核' then
      null; -- 同仁送出本週更新
    elsif old.status = '待審核' and new.status in ('已結案', '進行中') and public.is_supervisor() then
      null; -- 主管通過或退回
    elsif old.status = '已結案' and new.status = '進行中' and public.is_supervisor() then
      null; -- 主管重新開啟
    else
      raise exception '不允許的狀態變更：% → %', old.status, new.status;
    end if;
  end if;

  if new.status = '已結案' and old.status is distinct from '已結案' then
    new.closed_by := public.my_staff_name();
    new.closed_at := now();
  end if;

  return new;
end $$;

drop trigger if exists todo_items_guard on public.todo_items;
create trigger todo_items_guard
  before insert or update on public.todo_items
  for each row execute function public.todo_items_guard();

-- 5. 病床看板：前台照常公開讀取，只有已登入員工可以修改（admin.html V2.0.0 起需登入）
do $$
declare t text;
begin
  foreach t in array array['hospital_wards', 'hospital_notes', 'hospital_meta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon', t);
    execute format('drop policy if exists "v2 staff write" on public.%I', t);
    execute format('create policy "v2 staff write" on public.%I for all to authenticated
                      using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;
-- 原有的 "Allow public read"（SELECT）規則保留，前台 index.html 不受影響

-- 6. hospital_admin：舊的共用密碼表已無頁面使用，收回匿名讀取／修改
drop policy if exists "public read admin config"   on public.hospital_admin;
drop policy if exists "public update admin config" on public.hospital_admin;
revoke all on public.hospital_admin from anon;
-- （2026-11-20 已先行執行：hospital_admin 無頁面使用，提前收回）

-- 7. 資源開通申請：公開表單只能送出；檢視與審核限已登入員工（request.js／requests-admin V2.0.0）
drop policy if exists "public read requests"   on public.it_access_requests;
drop policy if exists "public update requests" on public.it_access_requests;
revoke select, update, delete, truncate on public.it_access_requests from anon;
drop policy if exists "v2 staff read requests"   on public.it_access_requests;
drop policy if exists "v2 staff update requests" on public.it_access_requests;
create policy "v2 staff read requests"   on public.it_access_requests for select to authenticated using (public.is_staff());
create policy "v2 staff update requests" on public.it_access_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- 保留 "public insert requests"：任何人仍可填寫並送出申請

commit;

-- =====================================================================
-- 驗證（執行完請跑一次，結果應如註解所示）
-- =====================================================================
-- select tablename, policyname, roles, cmd from pg_policies
-- where tablename in ('todo_items','todo_updates','staff','objects') order by 1, 2;
--   → 只剩 v2 開頭的規則，roles 都是 {authenticated}
--
-- select id, public from storage.buckets where id = 'todo-photos';
--   → public = false

-- =====================================================================
-- 緊急回復（新版出問題、需要暫時恢復舊版匿名存取時才用）
-- =====================================================================
-- begin;
-- drop trigger if exists todo_items_guard on public.todo_items;
-- update storage.buckets set public = true where id = 'todo-photos';
-- grant select, insert, update on public.todo_items, public.todo_updates to anon;
-- create policy "rollback anon all items"   on public.todo_items   for all to anon using (true) with check (true);
-- create policy "rollback anon all updates" on public.todo_updates for all to anon using (true) with check (true);
-- alter table public.hospital_wards disable row level security;
-- alter table public.hospital_notes disable row level security;
-- alter table public.hospital_meta  disable row level security;
-- grant insert, update, delete on public.hospital_wards, public.hospital_notes, public.hospital_meta to anon;
-- grant select, update on public.it_access_requests to anon;
-- create policy "rollback anon read requests"   on public.it_access_requests for select to anon using (true);
-- create policy "rollback anon update requests" on public.it_access_requests for update to anon using (true) with check (true);
-- commit;
