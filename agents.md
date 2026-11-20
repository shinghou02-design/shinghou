# 杏和醫院行政與資訊管理系統（專案藍圖）

> 本檔為跨 Agent 通用的專案藍圖（AGENTS.md 開放標準）。任何 Agent 的每個 session 都應先讀本檔＋[`handoff.md`](handoff.md)。
>
> 最後更新：2026-11-20｜目前版本：V1.x（線上）／V2.0.0（建議版本，PR #1 待合併）

## 專案簡介
杏和醫院內部行政與資訊管理平台，採純前端靜態網頁（HTML/CSS/JS）搭配 Supabase 後端與 GitHub Pages 自動部署。系統包含三大模組：
1. **每日住院／病床日報表與後台管理**（`index.html`、`admin.html`、`qr.html`）
2. **網路暨電腦資源開通申請書與審核後台**（`request.html`、`requests-admin.html`，支援 A4 列印與 XLSX 匯出）
3. **跨部門代辦事項追蹤系統**（`todo.html`，每週進度更新、照片上傳至 `todo-photos` Bucket、XLSX 匯出）

## 帳號與環境（正式版以此為準）

| 項目 | 位置 |
|---|---|
| 正式 repo | GitHub `shinghou02-design/shinghou`（GitHub Pages 由 **`main`** 分支根目錄部署） |
| 資料庫 | Supabase 專案 `shinghou02`（ref `amhorqegfaadfbgfhwrd`，ap-southeast-2），帳號 `shinghou02@gmail.com` |
| 本機資料夾 | `G:\我的雲端硬碟\AI\shinghou` |
| 前端金鑰 | `config.js` 只放 publishable key（可公開）；**secret key 不得放進任何前端或 repo** |
| 其他副本（非正式） | `shingyong02-sudo/shinghou`（2026-11-15 清理歷史副本）、`jnfakimo/shinghou`（2026-07 舊版）— 不再開發 |

## 關鍵時程
- **2026-07-09**：完成住院病床日報表前台（`index.html`）與後台（`admin.html`）基礎版本。
- **2026-09-08**：新增資源開通申請書與代辦事項追蹤系統，完成照片上傳、ExcelJS 匯出；依使用者指示移除管理頁密碼門檻。
- **2026-11-20**：完成資安 CIA 評估（16 項風險：高 8、中 6、低 2）；執行登入改版第一階段 SQL；收回 `hospital_admin` 匿名讀寫；刪除曾外洩的 secret key；V2.0.0 登入版開成 PR #1。

## 目標與路線圖
- [x] 階段一：住院病床日報表前台、後台與 QR 標籤列印
- [x] 階段二：網路暨電腦資源開通申請書（線上填單、A4 套印、IT 審核後台）
- [x] 階段三：代辦事項追蹤系統（手風琴明細、負責人選單、每週進度與照片上傳）
- [x] 階段四：代辦事項與資源申請後台 ExcelJS 專業排版 XLSX 匯出
- [x] 階段五：移除 `todo.html` 與 `requests-admin.html` 密碼門檻（已由階段八取代）
- [x] 階段六：Supabase 確認執行 `migration_it_access_requests.sql`、`migration_todo_photos.sql`
- [ ] 階段七：資料庫安全性強化
    - [x] 輪替／刪除曾暴露之 secret key（2026-11-20 刪除 `sb_secret_a3gvN…`）
    - [x] `hospital_admin` 收回匿名讀取與修改（2026-11-20）
    - [ ] `hospital_meta`／`hospital_notes`／`hospital_wards` 啟用 RLS、僅員工可寫（在 phase2 SQL）
    - [ ] 確認舊版 service_role 金鑰是否仍需保留
- [ ] 階段八：V2.0.0 登入改版（PR #1）
    - [x] 第一階段 SQL：`migration_todo_auth_phase1.sql`（2026-11-20 13:06 已執行）
    - [x] 前端：`todo`、`admin`、`request`、`requests-admin` 加入 Supabase Auth 登入
    - [ ] 建立人員帳號、寫入 `staff` 名冊、關閉公開註冊（等待人員名單）
    - [ ] 合併 PR #1 並實測四個頁面
    - [ ] 第二階段 SQL：`migration_todo_auth_phase2.sql`（收回所有匿名寫入）
- [ ] 階段九：可用性（每週資料匯出備份、評估付費方案避免專案被自動暫停）

## 權限模型（V2.0.0）

| 角色 | 來源 | 權限 |
|---|---|---|
| 匿名 | publishable key | 讀病床看板；送出資源申請 |
| 同仁 `staff` | Supabase Auth＋`staff` 名冊 | 待辦新增與送出進度、病床後台修改、檢視與審核資源申請 |
| 主管 `supervisor` | 同上，`role = 'supervisor'` | 同仁權限＋待辦通過結案、退回、重新開啟 |

- 判斷函式：`is_staff()`、`is_supervisor()`、`my_staff_name()`（security definer）
- 待辦狀態流程由 trigger `todo_items_guard` 控管（phase2）；所有表都不開放 DELETE 給前端

## 資料夾結構
- `index.html` + `app.js`：前台每日病床日報表（公開）
- `admin.html` + `admin.js`：病床日報表後台（V2.0.0 起需登入）
- `qr.html`：QR Code 標籤列印頁
- `request.html` + `request.js`：資源開通申請書（公開送出；`?id=` 檢視需登入）
- `requests-admin.html` + `requests-admin.js`：資源申請審核後台（V2.0.0 起需登入）
- `todo.html` + `todo.js`：代辦事項追蹤系統（V2.0.0 起需登入）
- `config.js`：共用 Supabase URL 與 publishable key
- `style.css`：全站共用樣式與 A4 列印／手機響應式設定
- `migration_*.sql`：資料表與 RLS 設定；`migration_todo_auth_phase1.sql`／`phase2.sql` 為登入改版

## 已上線網址
- 前台日報表：https://shinghou02-design.github.io/shinghou/
- 日報表後台：https://shinghou02-design.github.io/shinghou/admin.html
- QR 標籤列印：https://shinghou02-design.github.io/shinghou/qr.html
- 資源開通申請單：https://shinghou02-design.github.io/shinghou/request.html
- 資源開通審核後台：https://shinghou02-design.github.io/shinghou/requests-admin.html
- 代辦事項追蹤：https://shinghou02-design.github.io/shinghou/todo.html
- 資安 CIA 評估報告：https://claude.ai/artifact/FDWezcDwAxHuzzwGNPRG6J

## 同步層級

| 層級 | 平台 | 位置 | 讀取時機 |
|------|------|------|---------|
| L1 | 本地（GDrive） | `G:\我的雲端硬碟\AI\shinghou` 的 `agents.md`＋`handoff.md` | 每個 session |
| L2 | GitHub | `shinghou02-design/shinghou`（GitHub Pages 部署自 `main`） | 指定時 |
| L3 | Obsidian | 尚未建立（可於 `secondbrain` 建立 `shinghou/專案工作流程.md`） | 有需要時 |

## 工作約定
- 任何 Agent、任何電腦：**開工先讀 `handoff.md`，收工必更新 `handoff.md`**
- 修改共用檔案前先讀最新內容，避免覆蓋其他 Agent 的變更
- 所有回應與文件使用繁體中文；版本號採 VMAJOR.MINOR.PATCH，未部署者標示「建議版本」
- 修改前先確認計畫，優先保留原有資料結構
- 資料庫變更分階段：先「只新增」→ 前端上線並實測 → 再「收回權限」；每份 SQL 附驗證與緊急回復語法
- 新功能不得再新增 `to anon ... using (true)` 的寫入規則；寫入一律限已登入員工
