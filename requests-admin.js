const { url, anonKey } = window.SUPABASE_CONFIG;
const REST = `${url.replace(/\/$/, '')}/rest/v1`;
const HEADERS = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };

const $ = (id) => document.getElementById(id);
const toastEl = $('toast'), rowsEl = $('rows'), emptyMsg = $('emptyMsg');
const SESSION_KEY = 'shinghou_requests_admin_ok';

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

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Gate ----------
try {
  if (sessionStorage.getItem(SESSION_KEY) === '1') showApp();
} catch (e) { /* storage unavailable, fall back to gate */ }

async function tryLogin() {
  const pwd = $('gatePwd').value;
  if (!pwd) return;
  try {
    const rows = await api('hospital_admin?key=eq.requests_admin_password&select=value');
    const expected = rows && rows[0] ? rows[0].value : null;
    if (expected !== null && pwd === expected) {
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
      showApp();
    } else {
      $('gateErr').textContent = '密碼錯誤';
    }
  } catch (err) {
    $('gateErr').textContent = '驗證失敗：' + err.message;
  }
}
$('gateBtn').addEventListener('click', tryLogin);
$('gatePwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });

function showApp() {
  $('gate').classList.add('hidden');
  $('app').classList.remove('hidden');
  try {
    const savedHandler = localStorage.getItem('shinghou_handler_name');
    if (savedHandler) $('handlerName').value = savedHandler;
  } catch (e) {}
  load();
}

// ---------- Change password ----------
$('pwdBtn').addEventListener('click', () => $('pwdBox').classList.remove('hidden'));
$('pwdCancelBtn').addEventListener('click', () => {
  $('pwdBox').classList.add('hidden');
  $('pwd-new').value = ''; $('pwd-confirm').value = '';
});
$('pwdSaveBtn').addEventListener('click', async () => {
  const p1 = $('pwd-new').value, p2 = $('pwd-confirm').value;
  if (!p1 || p1.length < 4) return toast('新密碼至少 4 個字元', true);
  if (p1 !== p2) return toast('兩次輸入的新密碼不一致', true);
  try {
    const rows = await api('hospital_admin?key=eq.requests_admin_password', 'PATCH', { value: p1 });
    if (!rows || rows.length === 0) {
      return toast('更新失敗：資料庫權限不足（請執行 migration_hospital_admin_policy.sql）', true);
    }
    toast('✓ 密碼已更新，下次登入請用新密碼');
    $('pwdCancelBtn').click();
  } catch (err) {
    toast('更新失敗：' + err.message, true);
  }
});

// ---------- Logout ----------
$('logoutBtn').addEventListener('click', () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  location.reload();
});

// ---------- List ----------
function rowHtml(r) {
  const folders = [r.folder_shinghou ? '杏和' : null, r.folder_shingyong ? '杏永' : null].filter(Boolean).join('／') || '—';
  const folderLine = folders === '—' ? '—' : `${folders}${r.folder_access ? `（${r.folder_access}）` : ''}`;
  const statuses = ['待處理', '處理中', '已完成', '已拒絕'];
  const statusOptions = statuses.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${s}</option>`).join('');
  return `
    <tr data-id="${r.id}">
      <td>${fmtDateTime(r.created_at)}</td>
      <td class="left">${esc(r.hospital)}</td>
      <td class="left">${esc(r.name)}</td>
      <td class="left">${esc(r.department || '')}${r.title ? ' / ' + esc(r.title) : ''}</td>
      <td>${esc(r.extension || '—')}</td>
      <td>${esc(r.net_access || '—')}</td>
      <td>${folderLine}</td>
      <td>${esc(r.usb_access || '—')}</td>
      <td><select class="f-status">${statusOptions}</select></td>
      <td><input type="text" class="f-note" value="${esc(r.handle_note || '').replace(/"/g, '&quot;')}" /></td>
      <td>
        <div style="display:flex; gap:6px; justify-content:center;">
          <button class="btn btn-primary btn-sm f-save">儲存</button>
          <a class="btn btn-ghost btn-sm" href="request.html?id=${r.id}" target="_blank">檢視</a>
          <a class="btn btn-ghost btn-sm" href="request.html?id=${r.id}&print=1" target="_blank">列印</a>
        </div>
      </td>
    </tr>`;
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function load() {
  const status = $('statusFilter').value;
  let path = 'it_access_requests?select=*&order=created_at.desc';
  if (status) path += `&status=eq.${encodeURIComponent(status)}`;
  try {
    const rows = await api(path);
    rowsEl.innerHTML = rows.map(rowHtml).join('');
    emptyMsg.classList.toggle('hidden', rows.length > 0);
    rowsEl.querySelectorAll('.f-save').forEach((btn) => btn.addEventListener('click', onSave));
  } catch (err) {
    toast('讀取失敗：' + err.message, true);
  }
}

async function onSave(e) {
  const tr = e.target.closest('tr');
  const id = tr.dataset.id;
  const status = tr.querySelector('.f-status').value;
  const note = tr.querySelector('.f-note').value;
  const handler = $('handlerName').value.trim();
  try { localStorage.setItem('shinghou_handler_name', handler); } catch (err) {}

  try {
    await api(`it_access_requests?id=eq.${id}`, 'PATCH', {
      status,
      handle_note: note || null,
      handled_by: handler || null,
      handled_at: new Date().toISOString(),
    });
    toast('✓ 已更新');
  } catch (err) {
    toast('更新失敗：' + err.message, true);
  }
}

$('reloadBtn').addEventListener('click', load);
$('statusFilter').addEventListener('change', load);
