const { url, anonKey } = window.SUPABASE_CONFIG;
const REST = `${url.replace(/\/$/, '')}/rest/v1`;
const HEADERS = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');

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

const form = $('reqForm');
const successBox = $('successBox');

function radioValue(name) {
  const el = form.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}
function setRadio(name, value) {
  const el = form.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function collect() {
  return {
    hospital: $('hospital').value.trim(),
    apply_date: $('apply_date').value,
    name: $('name').value.trim(),
    department: $('department').value.trim() || null,
    title: $('title').value.trim() || null,
    employee_id: $('employee_id').value.trim() || null,
    extension: $('extension').value.trim() || null,
    net_access: radioValue('net_access'),
    folder_shinghou: $('folder_shinghou').checked,
    folder_shingyong: $('folder_shingyong').checked,
    folder_access: radioValue('folder_access'),
    usb_access: radioValue('usb_access'),
    agree_declaration: $('agree_declaration').checked,
  };
}

function setDisabled(disabled) {
  form.querySelectorAll('input').forEach((i) => (i.disabled = disabled));
}

function fillForm(rec) {
  $('hospital').value = rec.hospital || '';
  $('apply_date').value = rec.apply_date || '';
  $('name').value = rec.name || '';
  $('department').value = rec.department || '';
  $('title').value = rec.title || '';
  $('employee_id').value = rec.employee_id || '';
  $('extension').value = rec.extension || '';
  if (rec.net_access) setRadio('net_access', rec.net_access);
  $('folder_shinghou').checked = !!rec.folder_shinghou;
  $('folder_shingyong').checked = !!rec.folder_shingyong;
  if (rec.folder_access) setRadio('folder_access', rec.folder_access);
  if (rec.usb_access) setRadio('usb_access', rec.usb_access);
  $('agree_declaration').checked = !!rec.agree_declaration;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = collect();
  if (!payload.hospital || !payload.name || !payload.apply_date) {
    return toast('請填寫必填欄位', true);
  }
  if (!payload.net_access || !payload.usb_access) {
    return toast('請完成所有申請項目的是／否選擇', true);
  }
  if ((payload.folder_shinghou || payload.folder_shingyong) && !payload.folder_access) {
    return toast('請選擇共用資料夾是否開通', true);
  }
  if (!payload.agree_declaration) {
    return toast('請詳閱並勾選同意資訊安全切結聲明', true);
  }

  $('submitBtn').disabled = true;
  try {
    await api('it_access_requests', 'POST', payload);
    setDisabled(true);
    form.querySelectorAll('.no-print').forEach((el) => (el.style.display = 'none'));
    successBox.classList.remove('hidden');
    toast('✓ 申請已送出');
  } catch (err) {
    toast('送出失敗：' + err.message, true);
    $('submitBtn').disabled = false;
  }
});

$('printBlankBtn').addEventListener('click', () => window.print());
$('printFilledBtn').addEventListener('click', () => window.print());
$('resetBtn').addEventListener('click', () => window.location.href = 'request.html');

async function initViewMode(id) {
  try {
    const rows = await api(`it_access_requests?id=eq.${id}&select=*`);
    if (!rows || !rows.length) return toast('找不到這筆申請', true);
    fillForm(rows[0]);
    setDisabled(true);
    form.querySelectorAll('.no-print').forEach((el) => (el.style.display = 'none'));
    successBox.classList.remove('hidden');
    successBox.querySelector('p').textContent = `申請單 #${rows[0].id}（狀態：${rows[0].status}）`;
    $('resetBtn').style.display = 'none';
    return true;
  } catch (err) {
    toast('讀取失敗：' + err.message, true);
    return false;
  }
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) {
    const ok = await initViewMode(id);
    if (ok && params.get('print') === '1') {
      setTimeout(() => window.print(), 400);
    }
  } else {
    $('apply_date').value = new Date().toISOString().slice(0, 10);
  }
})();
