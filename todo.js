const { url, anonKey } = window.SUPABASE_CONFIG;
const REST = `${url.replace(/\/$/, '')}/rest/v1`;
const STORAGE_BUCKET = 'todo-photos';
const STORAGE_BASE = `${url.replace(/\/$/, '')}/storage/v1`;
const HEADERS = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };

const $ = (id) => document.getElementById(id);
const toastEl = $('toast'), listEl = $('list'), emptyMsg = $('emptyMsg');
const WEEKLY_DEADLINE_WEEKDAY = 1; // 1 = 星期一（ISO: 1=Mon...7=Sun）

function toast(msg, isErr = false) {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (toastEl.className = 'toast'), 2600);
}

async function api(path, method = 'GET', body = null) {
  const opt = { method, headers: HEADERS };
  if (body) { opt.body = JSON.stringify(body); opt.headers.Prefer = 'return=representation'; }
  const r = await fetch(`${REST}/${path}`, opt);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return null;
  return r.json();
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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

// 已移除登入密碼保護，直接載入
load();

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
    await api('todo_updates', 'POST', { todo_id: item.id, author: owner, action: '新增', note: '建立代辦事項' });
    toast('✓ 已新增');
    $('cancelNewBtn').click();
    load();
  } catch (err) {
    toast('新增失敗：' + err.message, true);
  }
});

$('reloadBtn').addEventListener('click', load);
$('showClosed').addEventListener('change', load);

// ---------- List ----------
let currentItems = [];

async function load() {
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

function photoThumbsHtml(urls) {
  if (!urls || !urls.length) return '';
  return `<div class="photo-thumbs">${urls.map((u) => `<a href="${esc(u)}" target="_blank"><img src="${esc(u)}" alt="照片" /></a>`).join('')}</div>`;
}

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
          <input type="text" class="upd-author" placeholder="你的姓名" style="max-width:140px; padding:7px 9px; border:1px solid #ccc; border-radius:7px; font-size:13px;" />
          <button class="btn btn-primary btn-sm act-submit-update" data-id="${item.id}">送出本週更新</button>
        </div>
      </div>`;
  } else if (item.status === '待審核') {
    actionHtml = `
      <div class="action-box">
        <textarea class="rej-note" placeholder="（退回時可填寫要求修改的原因，選填）" data-id="${item.id}"></textarea>
        <div class="action-buttons">
          <input type="text" class="rev-author" placeholder="主管姓名" style="max-width:140px; padding:7px 9px; border:1px solid #ccc; border-radius:7px; font-size:13px;" />
          <button class="btn btn-primary btn-sm act-approve" data-id="${item.id}">✓ 通過並結案</button>
          <button class="btn btn-danger btn-sm act-reject" data-id="${item.id}">↺ 退回，需要再更新</button>
        </div>
      </div>`;
  } else if (item.status === '已結案') {
    actionHtml = `
      <div class="action-box">
        <div class="closed-info">✓ 已於 ${fmtDateTime(item.closed_at)}${item.closed_by ? '　由 ' + esc(item.closed_by) : ''} 結案</div>
        <div class="action-buttons" style="margin-top:8px;">
          <button class="btn btn-ghost btn-sm act-reopen" data-id="${item.id}">重新開啟</button>
        </div>
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

// 上傳照片到 Supabase Storage，回傳公開網址陣列
async function uploadPhotos(files, itemId) {
  const urls = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${itemId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const r = await fetch(`${STORAGE_BASE}/object/${STORAGE_BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!r.ok) throw new Error(`照片上傳失敗：${r.status} ${await r.text()}`);
    urls.push(`${STORAGE_BASE}/object/public/${STORAGE_BUCKET}/${path}`);
  }
  return urls;
}

async function onSubmitUpdate(e) {
  const id = e.target.dataset.id;
  const box = e.target.closest('.item');
  const note = box.querySelector('.upd-note').value.trim();
  const author = box.querySelector('.upd-author').value.trim();
  const fileInput = box.querySelector('.upd-photos');
  const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
  if (!note) return toast('請填寫本週進度更新內容', true);

  const btn = e.target;
  const origLabel = btn.textContent;
  try {
    let photoUrls = [];
    if (files.length) {
      btn.disabled = true;
      btn.textContent = '上傳照片中…';
      photoUrls = await uploadPhotos(files, id);
    }
    await api(`todo_items?id=eq.${id}`, 'PATCH', {
      status: '待審核', last_update_at: new Date().toISOString(), last_update_note: note,
      last_update_photos: photoUrls.length ? photoUrls : null,
    });
    await api('todo_updates', 'POST', {
      todo_id: id, author: author || null, action: '更新', note,
      photo_urls: photoUrls.length ? photoUrls : null,
    });
    toast('✓ 已送出，等待主管審核');
    load();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = origLabel;
    toast('送出失敗：' + err.message, true);
  }
}

async function onApprove(e) {
  const id = e.target.dataset.id;
  const box = e.target.closest('.item');
  const author = box.querySelector('.rev-author').value.trim();
  try {
    await api(`todo_items?id=eq.${id}`, 'PATCH', {
      status: '已結案', closed_at: new Date().toISOString(), closed_by: author || null,
    });
    await api('todo_updates', 'POST', { todo_id: id, author: author || null, action: '通過結案', note: null });
    toast('✓ 已結案');
    load();
  } catch (err) {
    toast('操作失敗：' + err.message, true);
  }
}

async function onReject(e) {
  const id = e.target.dataset.id;
  const box = e.target.closest('.item');
  const note = box.querySelector('.rej-note').value.trim();
  const author = box.querySelector('.rev-author').value.trim();
  try {
    await api(`todo_items?id=eq.${id}`, 'PATCH', { status: '進行中' });
    await api('todo_updates', 'POST', { todo_id: id, author: author || null, action: '退回', note: note || null });
    toast('已退回，需要繼續追蹤');
    load();
  } catch (err) {
    toast('操作失敗：' + err.message, true);
  }
}

async function onReopen(e) {
  const id = e.target.dataset.id;
  if (!confirm('確定要重新開啟這筆已結案的事項嗎？')) return;
  try {
    await api(`todo_items?id=eq.${id}`, 'PATCH', { status: '進行中', closed_at: null, closed_by: null });
    await api('todo_updates', 'POST', { todo_id: id, action: '重新開啟', note: null });
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
  } catch (err) {
    toast('讀取歷史失敗：' + err.message, true);
  }
}
