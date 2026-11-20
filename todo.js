// 代辦事項追蹤｜杏和醫院
// V2.0.0（建議版本）：加入 Supabase Auth 登入、人員角色（staff / supervisor）、
// 只有主管可結案／退回／重新開啟、操作人自動帶入登入帳號、照片改為不公開（簽章網址）

const { url, anonKey } = window.SUPABASE_CONFIG;
const BASE = url.replace(/\/$/, '');
const REST = `${BASE}/rest/v1`;
const STORAGE_BUCKET = 'todo-photos';
const PUBLIC_PREFIX = `/object/public/${STORAGE_BUCKET}/`;
const SIGNED_URL_SECONDS = 60 * 60; // 照片簽章網址有效 1 小時

const sb = window.supabase.createClient(BASE, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const $ = (id) => document.getElementById(id);
const toastEl = $('toast'), listEl = $('list'), emptyMsg = $('emptyMsg');
const WEEKLY_DEADLINE_WEEKDAY = 1; // 1 = 星期一（ISO: 1=Mon...7=Sun）

let me = null; // { user_id, name, role }
const isSupervisor = () => !!me && me.role === 'supervisor';

function toast(msg, isErr = false) {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (toastEl.className = 'toast'), 2600);
}

// 所有資料庫請求都改用「登入者的 access token」，不再用 anon key 當身分
async function authHeaders(extra = {}) {
  const { data } = await sb.auth.getSession();
  const token = data.session && data.session.access_token;
  if (!token) throw new Error('登入已過期，請重新登入');
  return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function api(path, method = 'GET', body = null) {
  const opt = { method, headers: await authHeaders(body ? { Prefer: 'return=representation' } : {}) };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(`${REST}/${path}`, opt);
  if (r.status === 401) { await showLogin('登入已過期，請重新登入'); throw new Error('未登入'); }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return null;
  return r.json();
}

// 同時跳脫引號，避免內容被當成 HTML 屬性執行
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

// 本週的更新期限（最近一次到達 WEEKLY_DEADLINE_WEEKDAY 的那天 00:00）
function currentWeekDeadline(now = new Date()) {
  const isoDay = now.getDay() === 0 ? 7 : now.getDay(); // Sun(0) -> 7
  const diff = isoDay - WEEKLY_DEADLINE_WEEKDAY;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - (diff >= 0 ? diff : diff + 7));
  return d;
}

function isOverdue(item) {
  if (item.status === '已結案' || item.status === '待審核') return false;
  const ref = item.last_update_at ? new Date(item.last_update_at) : new Date(item.created_at);
  return ref < currentWeekDeadline();
}

// ---------- 登入 / 登出 ----------
async function showLogin(msg = '') {
  me = null;
  $('mainView').classList.add('hidden');
  $('loginBox').classList.remove('hidden');
  $('loginMsg').textContent = msg;
}

async function enterApp() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return showLogin();

  // 讀取自己的人員資料；沒有資料代表帳號尚未開通
  const rows = await api(`staff?user_id=eq.${user.id}&select=user_id,name,role`);
  if (!rows.length) {
    await sb.auth.signOut();
    return showLogin('此帳號尚未開通，請聯絡系統管理員');
  }
  me = rows[0];

  $('whoName').textContent = me.name;
  $('whoRole').textContent = isSupervisor() ? '主管' : '同仁';
  $('whoRole').classList.toggle('supervisor', isSupervisor());
  $('loginBox').classList.add('hidden');
  $('mainView').classList.remove('hidden');

  loadOwnerList();
  load();
}

$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  if (!email || !password) return ($('loginMsg').textContent = '請輸入 Email 與密碼');
  $('loginBtn').disabled = true;
  $('loginMsg').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $('loginBtn').disabled = false;
  if (error) return ($('loginMsg').textContent = '登入失敗：帳號或密碼錯誤');
  $('loginPassword').value = '';
  try { await enterApp(); } catch (err) { showLogin('登入後讀取資料失敗：' + err.message); }
});
$('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });

$('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  listEl.innerHTML = '';
  showLogin('已登出');
});

// 啟動：有保存的登入狀態就直接進入，否則顯示登入畫面
(async () => {
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) await enterApp(); else await showLogin();
  } catch (err) {
    showLogin('讀取失敗：' + err.message);
  }
})();

// 負責人下拉選單改從 staff 名單產生
async function loadOwnerList() {
  try {
    const rows = await api('staff?select=name&order=name');
    $('ownerList').innerHTML = rows.map((r) => `<option value="${esc(r.name)}"></option>`).join('');
  } catch (_) { /* 名單讀不到不影響主要功能 */ }
}

// ---------- New item form ----------
$('newBtn').addEventListener('click', () => $('newForm').classList.remove('hidden'));
$('cancelNewBtn').addEventListener('click', () => {
  $('newForm').classList.add('hidden');
  $('f-title').value = ''; $('f-desc').value = ''; $('f-owner').value = ''; $('f-target').value = '';
});

$('createBtn').addEventListener('click', async () => {
  const title = $('f-title').value.trim();
  const owner = $('f-owner').value.trim();
  const desc = $('f-desc').value.trim();
  const target = $('f-target').value;
  if (!title || !owner) return toast('請填寫標題與負責人', true);

  try {
    const rows = await api('todo_items', 'POST', {
      title, description: desc || null, owner, target_date: target || null,
    });
    const item = rows[0];
    await logUpdate(item.id, '新增', '建立代辦事項');
    toast('✓ 已新增');
    $('cancelNewBtn').click();
    load();
  } catch (err) {
    toast('新增失敗：' + err.message, true);
  }
});

$('reloadBtn').addEventListener('click', load);
$('showClosed').addEventListener('change', load);

// 歷程紀錄：操作人一律帶入登入者，不再自行輸入
function logUpdate(todoId, action, note = null, photoUrls = null) {
  return api('todo_updates', 'POST', {
    todo_id: todoId, author: me.name, author_id: me.user_id, action, note,
    photo_urls: photoUrls && photoUrls.length ? photoUrls : null,
  });
}

// ---------- List ----------
let currentItems = [];

async function load() {
  if (!me) return;
  try {
    const showClosed = $('showClosed').checked;
    let path = 'todo_items?select=*&order=created_at.desc';
    if (!showClosed) path += '&status=neq.已結案';
    const items = await api(path);

    items.sort((a, b) => {
      const oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    currentItems = items;
    listEl.innerHTML = items.map(itemHtml).join('');
    emptyMsg.classList.toggle('hidden', items.length > 0);
    bindItemEvents();
    resolvePhotos(listEl);
  } catch (err) {
    toast('讀取失敗：' + err.message, true);
  }
}

// ---------- Export XLSX ----------
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

$('exportBtn').addEventListener('click', exportTodoXlsx);

async function exportTodoXlsx() {
  if (!currentItems.length) return toast('目前沒有資料可以匯出', true);
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = '杏和醫院集團';
    wb.created = new Date();

    const cols = [
      { header: '標題', key: 'title', width: 24 },
      { header: '負責人', key: 'owner', width: 10 },
      { header: '狀態', key: 'status', width: 10 },
      { header: '逾期', key: 'overdue', width: 8 },
      { header: '目標完成日', key: 'target_date', width: 13 },
      { header: '建立於', key: 'created_at', width: 13 },
      { header: '最近更新時間', key: 'last_update_at', width: 17 },
      { header: '最近更新內容', key: 'last_update_note', width: 34 },
      { header: '說明', key: 'description', width: 30 },
    ];

    const ws = wb.addWorksheet('代辦事項追蹤', {
      views: [{ state: 'frozen', ySplit: 2 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));

    ws.mergeCells(1, 1, 1, cols.length);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `杏和醫院 — 代辦事項追蹤（匯出時間：${fmtDateTime(new Date().toISOString())}）`;
    titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    ws.getRow(1).height = 26;

    const headerRow = ws.getRow(2);
    cols.forEach((c, i) => { headerRow.getCell(i + 1).value = c.header; });
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C7A3D' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    headerRow.height = 20;

    const statusColors = { 進行中: 'FFE3EDF7', 待審核: 'FFFFF4D6', 已結案: 'FFD9E8B0' };
    const statusColIdx = cols.findIndex((c) => c.key === 'status') + 1;
    const overdueColIdx = cols.findIndex((c) => c.key === 'overdue') + 1;

    currentItems.forEach((item, idx) => {
      const overdue = isOverdue(item);
      const row = ws.addRow({
        title: item.title,
        owner: item.owner,
        status: item.status,
        overdue: overdue ? '🔴 逾期' : '',
        target_date: fmtDate(item.target_date),
        created_at: fmtDate(item.created_at),
        last_update_at: fmtDateTime(item.last_update_at),
        last_update_note: item.last_update_note || '',
        description: item.description || '',
      });
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFDDDDDD' } }, left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }, right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      if (idx % 2 === 1) {
        row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7F1' } }; });
      }
      const sc = statusColors[item.status];
      if (sc) row.getCell(statusColIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc } };
      if (overdue) {
        row.getCell(overdueColIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFDADA' } };
        row.getCell(overdueColIdx).font = { color: { argb: 'FFC62828' }, bold: true };
      }
    });

    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `代辦事項追蹤_${todayStr()}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast('✓ 已匯出 XLSX');
  } catch (err) {
    toast('匯出失敗：' + err.message, true);
  }
}

// ---------- 照片：不公開 bucket + 簽章網址 ----------
// 舊資料存的是公開網址，新資料存的是 Storage 路徑；兩種都轉成路徑再產生簽章網址
function toPath(u) {
  if (!u) return '';
  const i = u.indexOf(PUBLIC_PREFIX);
  if (i >= 0) return decodeURIComponent(u.slice(i + PUBLIC_PREFIX.length));
  return u.startsWith('http') ? '' : u;
}

function photoThumbsHtml(urls) {
  if (!urls || !urls.length) return '';
  const paths = urls.map(toPath).filter(Boolean);
  if (!paths.length) return '';
  return `<div class="photo-thumbs">${paths.map((p) =>
    `<a data-path="${esc(p)}" target="_blank" rel="noopener"><img data-path="${esc(p)}" alt="照片" /></a>`).join('')}</div>`;
}

async function resolvePhotos(container) {
  const els = container.querySelectorAll('[data-path]');
  const paths = [...new Set([...els].map((el) => el.dataset.path))];
  if (!paths.length) return;
  const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return;
  const map = {};
  data.forEach((d) => { if (d.signedUrl) map[d.path] = d.signedUrl; });
  els.forEach((el) => {
    const signed = map[el.dataset.path];
    if (!signed) return;
    if (el.tagName === 'IMG') el.src = signed; else el.href = signed;
  });
}

// 上傳照片到 Supabase Storage，回傳「路徑」陣列（不再回傳公開網址）
async function uploadPhotos(files, itemId) {
  const paths = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${itemId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream', upsert: false,
    });
    if (error) throw new Error(`照片上傳失敗：${error.message}`);
    paths.push(path);
  }
  return paths;
}

// ---------- 項目卡片 ----------
function itemHtml(item) {
  const overdue = isOverdue(item);
  const badge = overdue
    ? `<span class="badge badge-overdue">逾期未更新</span><span class="badge badge-${esc(item.status)}">${esc(item.status)}</span>`
    : `<span class="badge badge-${esc(item.status)}">${esc(item.status)}</span>`;

  let actionHtml = '';
  if (item.status === '進行中') {
    actionHtml = `
      <div class="action-box">
        <textarea class="upd-note" placeholder="填寫本週進度更新…" data-id="${item.id}"></textarea>
        <input type="file" class="upd-photos" accept="image/*" capture="environment" multiple data-id="${item.id}" />
        <div class="upload-hint">可拍照或選擇圖片上傳（選填）</div>
        <div class="action-buttons">
          <button class="btn btn-primary btn-sm act-submit-update" data-id="${item.id}">送出本週更新（${esc(me.name)}）</button>
        </div>
      </div>`;
  } else if (item.status === '待審核') {
    actionHtml = isSupervisor()
      ? `
      <div class="action-box">
        <textarea class="rej-note" placeholder="（退回時可填寫要求修改的原因，選填）" data-id="${item.id}"></textarea>
        <div class="action-buttons">
          <button class="btn btn-primary btn-sm act-approve" data-id="${item.id}">✓ 通過並結案</button>
          <button class="btn btn-danger btn-sm act-reject" data-id="${item.id}">↺ 退回，需要再更新</button>
        </div>
      </div>`
      : `<div class="action-box"><div class="upload-hint">⏳ 已送出，等待主管審核</div></div>`;
  } else if (item.status === '已結案') {
    actionHtml = `
      <div class="action-box">
        <div class="closed-info">✓ 已於 ${fmtDateTime(item.closed_at)}${item.closed_by ? '　由 ' + esc(item.closed_by) : ''} 結案</div>
        ${isSupervisor() ? `<div class="action-buttons" style="margin-top:8px;">
          <button class="btn btn-ghost btn-sm act-reopen" data-id="${item.id}">重新開啟</button>
        </div>` : ''}
      </div>`;
  }

  return `
    <div class="item ${overdue ? 'overdue' : ''}" data-id="${item.id}">
      <div class="item-head">
        <span class="item-caret">▸</span>
        <div class="item-title">${esc(item.title)}</div>
        ${badge}
      </div>
      <div class="item-body">
        <div class="item-meta">負責人：${esc(item.owner)}${item.target_date ? '　｜　目標完成日：' + fmtDate(item.target_date) : ''}　｜　建立於：${fmtDate(item.created_at)}</div>
        ${item.description ? `<div class="item-desc">${esc(item.description)}</div>` : ''}
        ${item.last_update_note ? `<div class="latest-update"><div class="lu-meta">最近更新　${fmtDateTime(item.last_update_at)}</div>${esc(item.last_update_note)}${photoThumbsHtml(item.last_update_photos)}</div>` : ''}
        ${actionHtml}
        <span class="history-toggle" data-id="${item.id}">查看歷史紀錄 ▾</span>
        <div class="history-list" id="hist-${item.id}"></div>
      </div>
    </div>`;
}

function bindItemEvents() {
  listEl.querySelectorAll('.act-submit-update').forEach((btn) => btn.addEventListener('click', onSubmitUpdate));
  listEl.querySelectorAll('.act-approve').forEach((btn) => btn.addEventListener('click', onApprove));
  listEl.querySelectorAll('.act-reject').forEach((btn) => btn.addEventListener('click', onReject));
  listEl.querySelectorAll('.act-reopen').forEach((btn) => btn.addEventListener('click', onReopen));
  listEl.querySelectorAll('.history-toggle').forEach((el) => el.addEventListener('click', onToggleHistory));
  listEl.querySelectorAll('.item-head').forEach((el) => el.addEventListener('click', onToggleExpand));
}

// 手機板：點標題列展開/收合詳細內容（桌面版寬螢幕下 CSS 會讓 .item-body 一直顯示）
function onToggleExpand(e) {
  const item = e.currentTarget.closest('.item');
  if (!item) return;
  item.classList.toggle('expanded');
}

// ---------- 動作 ----------
async function onSubmitUpdate(e) {
  const id = e.target.dataset.id;
  const box = e.target.closest('.item');
  const note = box.querySelector('.upd-note').value.trim();
  const fileInput = box.querySelector('.upd-photos');
  const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
  if (!note) return toast('請填寫本週進度更新內容', true);

  const btn = e.target;
  const origLabel = btn.textContent;
  try {
    btn.disabled = true;
    let photoPaths = [];
    if (files.length) {
      btn.textContent = '上傳照片中…';
      photoPaths = await uploadPhotos(files, id);
    }
    await api(`todo_items?id=eq.${id}`, 'PATCH', {
      status: '待審核', last_update_at: new Date().toISOString(), last_update_note: note,
      last_update_photos: photoPaths.length ? photoPaths : null,
    });
    await logUpdate(id, '更新', note, photoPaths);
    toast('✓ 已送出，等待主管審核');
    load();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = origLabel;
    toast('送出失敗：' + err.message, true);
  }
}

async function onApprove(e) {
  if (!isSupervisor()) return toast('只有主管可以結案', true);
  const id = e.target.dataset.id;
  try {
    await api(`todo_items?id=eq.${id}`, 'PATCH', {
      status: '已結案', closed_at: new Date().toISOString(), closed_by: me.name,
    });
    await logUpdate(id, '通過結案');
    toast('✓ 已結案');
    load();
  } catch (err) {
    toast('操作失敗：' + err.message, true);
  }
}

async function onReject(e) {
  if (!isSupervisor()) return toast('只有主管可以退回', true);
  const id = e.target.dataset.id;
  const box = e.target.closest('.item');
  const note = box.querySelector('.rej-note').value.trim();
  try {
    await api(`todo_items?id=eq.${id}`, 'PATCH', { status: '進行中' });
    await logUpdate(id, '退回', note || null);
    toast('已退回，需要繼續追蹤');
    load();
  } catch (err) {
    toast('操作失敗：' + err.message, true);
  }
}

async function onReopen(e) {
  if (!isSupervisor()) return toast('只有主管可以重新開啟', true);
  const id = e.target.dataset.id;
  if (!confirm('確定要重新開啟這筆已結案的事項嗎？')) return;
  try {
    await api(`todo_items?id=eq.${id}`, 'PATCH', { status: '進行中', closed_at: null, closed_by: null });
    await logUpdate(id, '重新開啟');
    toast('已重新開啟');
    load();
  } catch (err) {
    toast('操作失敗：' + err.message, true);
  }
}

async function onToggleHistory(e) {
  const id = e.target.dataset.id;
  const box = $(`hist-${id}`);
  const showing = box.classList.contains('show');
  if (showing) { box.classList.remove('show'); e.target.textContent = '查看歷史紀錄 ▾'; return; }

  try {
    const rows = await api(`todo_updates?todo_id=eq.${id}&select=*&order=created_at.desc`);
    box.innerHTML = rows.map((r) => `
      <div class="history-row">
        <span class="h-meta">${fmtDateTime(r.created_at)}${r.author ? '　' + esc(r.author) : ''}　［${esc(r.action)}］</span>
        ${r.note ? '　' + esc(r.note) : ''}
        ${photoThumbsHtml(r.photo_urls)}
      </div>`).join('') || '<div class="history-row">（無紀錄）</div>';
    box.classList.add('show');
    e.target.textContent = '收合歷史紀錄 ▴';
    resolvePhotos(box);
  } catch (err) {
    toast('讀取歷史失敗：' + err.message, true);
  }
}
