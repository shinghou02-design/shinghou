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