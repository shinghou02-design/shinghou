# Handoff & Progress Tracking

## Current Status
- **Current Date**: 2026-09-08
- **Last Active**: 2026-09-08
- **Current Task**: System status check

## Progress Log
- [x] Gathered initial requirements.
- [x] Created `agents.md`.
- [x] Create `handoff.md`.
- [ ] L2 (GitHub) Integration.
- [ ] L3 (Obsidian) Integration.

## System Status Check — 2026-09-08
- Repo: shinghou02-design/shinghou (GitHub), deployed via GitHub Pages from `gh-pages`.
- Live pages all reachable and render correctly:
  - https://shinghou02-design.github.io/shinghou/ (前台日報表)
  - https://shinghou02-design.github.io/shinghou/admin.html (後台)
  - https://shinghou02-design.github.io/shinghou/qr.html (QR 標籤列印)
- `style.css`, `config.js`, `app.js` all load (200 OK) on the live front page.
- Could NOT verify live Supabase DB connectivity (`amhorqegfaadfbgfhwrd.supabase.co`) — this session's sandboxed browser/network tools block that domain outright (ERR_BLOCKED_BY_CLIENT / navigation denied), so the "⚠ 無法連線至資料庫" warning seen during this check may just be a sandbox artifact, not a real outage. **Needs verification from a normal browser** — open the front-page link above and confirm the bed table actually populates with numbers.
- Code review of `app.js`/`admin.js`: fetch logic, PATCH/POST/DELETE sync logic, and rate calculations all look sound; no bugs spotted.
- Note: `.git/config` has a GitHub PAT embedded in the `origin` remote URL in plain text — fine for local use, but worth being aware of if this repo folder is ever shared/synced elsewhere.

## New feature — 網路暨電腦資源開通申請書（web + DB）— 2026-09-08
- User originally asked for a printable A4 Word form (網路/共用資料夾/USB 開通申請), then pivoted mid-task to "要有資料庫可以存檔" → rebuilt as a Supabase-backed web form instead.
- New files added to this repo (not yet pushed to GitHub):
  - `request.html` + `request.js` — public submission form (院別／姓名／申請日期／部門／職稱／員編／分機 + 三項是否申請 + 資安切結聲明). Also doubles as a print view: blank form print button, and `request.html?id=<id>` loads a submitted record read-only (`&print=1` auto-triggers print). A4 print CSS included.
  - `requests-admin.html` + `requests-admin.js` — IT review page listing all submissions, inline status editor (待處理/處理中/已完成/已拒絕) + note + handler name, status filter. Protected by a simple password gate (reuses the `.gate` CSS class that was already in style.css but unused) backed by a `hospital_admin` table row.
  - `migration_it_access_requests.sql` — creates `it_access_requests` table + RLS policies (anon insert/select/update, matching the existing site's open-access model) + seeds `hospital_admin.requests_admin_password = 'shinghou-it2026'`.
- **IMPORTANT — not yet applied**: this session's connected Supabase MCP account only has access to two OTHER projects (`face-access-control`, `shingyong-hospital`), not the live `amhorqegfaadfbgfhwrd` project used by this site's `config.js`. So the SQL migration was written but NOT executed — user needs to paste `migration_it_access_requests.sql` into the Supabase SQL Editor for project `amhorqegfaadfbgfhwrd` themselves before `request.html`/`requests-admin.html` will work.
- Default admin password is `shinghou-it2026` (seeded by the migration) — user should change it via `update hospital_admin set value='...' where key='requests_admin_password';` once live.
- Could not browser-test these new pages in this session (same supabase.co network block as the status check above); reviewed by static code inspection + JS syntax check only. **Needs a real click-through test** after the SQL is applied and files are pushed live.
- Bonus/secondary deliverable: a standalone printable Word version of the same form (`網路暨電腦資源開通申請書.docx`) was also built earlier before the pivot — sitting in Claude's scratch output, not committed to this repo, offered as a fallback pure-paper option if ever needed.

## Context for Next Turn
- Confirm from a real browser whether the front page actually pulls live data from Supabase (this session couldn't test it due to sandbox network restrictions).
- User needs to: (1) run `migration_it_access_requests.sql` in Supabase SQL Editor, (2) git add/commit/push these new files to `master` + `gh-pages` (this session did not attempt git push — github.com may also be network-blocked in sandbox), (3) click-test `request.html` and `requests-admin.html` live, (4) change the default admin password.
- Two open roadmap items remain: L2 (GitHub) Integration, L3 (Obsidian) Integration — no detail yet on what these entail; ask user to define scope.

## New feature — 代辦事項追蹤 (todo.html/todo.js) — 2026-09-08
- Weekly-update todo tracker built and confirmed working live by user (login screenshot). `migration_todo.sql` run successfully.
- 負責人 dropdown (陳啟源/黃文正/黃祖明 + free text) added to the new-item form.
- Added to todo.html / requests-admin.html / request.js's request.html: a "🔑 變更密碼" button+form that lets the admin change the shared `hospital_admin.requests_admin_password` value directly from the browser (PATCH via Supabase REST) — same password is shared by requests-admin.html and todo.html gates.
- Added `@media (max-width: 600px)` mobile CSS to todo.html, requests-admin.html, and request.html so none of the pages overflow on a phone.
- Added collapse/accordion list UX to todo.html: every todo item shows only its title + status badges by default (`.item-head`, with a `▸` caret) on ALL screen sizes (not just mobile — changed after user feedback on desktop); clicking it toggles an `expanded` class that reveals the full detail (`.item-body`: meta, description, latest update, action box, history).
- Added photo upload for weekly updates: a file input (`accept="image/*" capture="environment" multiple`) appears in the 進行中 item's update box. `todo.js` now has `uploadPhotos()` (uploads to Supabase Storage bucket `todo-photos` via REST, returns public URLs) wired into `onSubmitUpdate`, which stores the URLs on both `todo_items.last_update_photos` and `todo_updates.photo_urls`. Thumbnails render (`photoThumbsHtml()`) in both the "latest update" box and the history list, each linking to the full-size image.
- New file `migration_todo_photos.sql` (NOT yet run by user) — creates the public `todo-photos` Storage bucket (5MB limit, image mime types only) + RLS policies for anon upload/read, and adds `last_update_photos`/`photo_urls` array columns to `todo_items`/`todo_updates`.
- All of the above (todo.html, todo.js, requests-admin.html, requests-admin.js, request.html, migration_todo_photos.sql) were written this session but **not yet pushed to git** — pending user's next "PUSH".
- Still open: user has not confirmed rotating the previously-exposed `sb_secret_...` key in Supabase; RLS-disabled Security Advisor findings on `hospital_meta`/`hospital_notes`/`hospital_wards` also still unaddressed (offered, no go-ahead yet).

## Bug fix — password change silently failed (locked user out) — 2026-09-08
- Root cause: `migration_it_access_requests.sql` only created a SELECT RLS policy on `hospital_admin`, never an UPDATE policy. So the "🔑 變更密碼" PATCH request was silently blocked by RLS (0 rows updated) but still returned HTTP 200, so the JS's `!r.ok` check didn't catch it and the UI showed a false "✓ 密碼已更新" success toast. The DB value never actually changed, so the user got locked out trying to log in with the "new" password that was never saved.
- Fix: added `migration_hospital_admin_policy.sql` — adds the missing UPDATE policy on `hospital_admin`, and resets the password value back to a known default (`shinghou-it2026`) to unlock the user immediately. User needs to run this in SQL Editor.
- Also hardened `todo.js` and `requests-admin.js`: the password-change handler now checks that the PATCH actually returned an updated row (`rows.length`), and shows an explicit RLS-permission error instead of a false success if it didn't.
- Added a "🚪 登出" (logout) button to both todo.html and requests-admin.html topbars — clears the sessionStorage flag and reloads to the gate screen.