const { url, anonKey } = window.SUPABASE_CONFIG;
const REST = `${url.replace(/\/$/, '')}/rest/v1`;
const HEADERS = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };

const fmtPct = (n) => `${Number(n).toFixed(1)}%`;
const $ = (id) => document.getElementById(id);
const toastEl = $('toast'), rowsEl = $('rows'), notesEl = $('notes'), summaryEl = $('summary');

function toast(msg, isErr = false) {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (toastEl.className = 'toast'), 2400);
}

async function api(path, method = 'GET', body = null) {
  const opt = { method, headers: HEADERS };
  if (body) { opt.body = JSON.stringify(body); opt.headers.Prefer = 'return=representation'; }
  const r = await fetch(`${REST}/${path}`, opt);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  if (r.status === 204) return null;
  return r.json();
}

function catRow(c = { name: '', total: 0, occupied: 0, is_insurance: true }) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="f-name" value="${(c.name || '').replace(/"/g, '&quot;')}" placeholder="病房名稱" /></td>
    <td><input type="number" min="0" class="f-total" value="${c.total ?? 0}" /></td>
    <td><input type="number" min="0" class="f-occ" value="${c.occupied ?? 0}" /></td>
    <td class="calc f-empty">0</td>
    <td class="calc f-rate">0.0%</td>
    <td><input type="checkbox" class="f-ins" ${c.is_insurance ? 'checked' : ''} /></td>
    <td><button class="btn btn-danger btn-sm f-del">刪除</button></td>`;
  tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', recalc));
  tr.querySelector('.f-del').addEventListener('click', () => { tr.remove(); recalc(); });
  return tr;
}

function noteRow(text = '') {
  const div = document.createElement('div');
  div.className = 'note-row';
  div.innerHTML = `<textarea rows="1">${text.replace(/</g, '&lt;')}</textarea><button class="btn btn-danger btn-sm">刪除</button>`;
  div.querySelector('button').addEventListener('click', () => div.remove());
  return div;
}

function collect() {
  const categories = [...rowsEl.querySelectorAll('tr')].map((tr) => ({
    name: tr.querySelector('.f-name').value,
    total: +tr.querySelector('.f-total').value || 0,
    occupied: +tr.querySelector('.f-occ').value || 0,
    is_insurance: tr.querySelector('.f-ins').checked,
  }));
  const notes = [...notesEl.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean);
  return { categories, notes };
}

function recalc() {
  let tT = 0, tO = 0, iT = 0, iO = 0;
  [...rowsEl.querySelectorAll('tr')].forEach((tr) => {
    let total = +tr.querySelector('.f-total').value || 0;
    let occ = +tr.querySelector('.f-occ').value || 0;
    if (occ > total) { occ = total; tr.querySelector('.f-occ').value = total; }
    const rate = total > 0 ? (occ / total) * 100 : 0;
    tr.querySelector('.f-empty').textContent = total - occ;
    const rEl = tr.querySelector('.f-rate');
    rEl.textContent = fmtPct(rate);
    rEl.classList.toggle('hot', rate >= 90);
    tT += total; tO += occ;
    if (tr.querySelector('.f-ins').checked) { iT += total; iO += occ; }
  });
  const ratio = tT > 0 ? (iT / tT) * 100 : 0;
  summaryEl.innerHTML = `<strong>即時計算預覽</strong><br />
    總病床：${tT} 床，佔床 ${tO}，空床 ${tT - tO}，佔床率 ${fmtPct(tT > 0 ? (tO / tT) * 100 : 0)}<br />
    保險病床數：${iT} 床，佔床 ${iO}，空床 ${iT - iO}，佔床率 ${fmtPct(iT > 0 ? (iO / iT) * 100 : 0)}<br />
    急性保險病床比率：<strong>${fmtPct(ratio)}</strong>`;
}

async function load() {
  try {
    const [wards, notesRows] = await Promise.all([
      api('hospital_wards?select=*&order=sort_order.asc,id.asc'),
      api('hospital_notes?select=*&order=sort_order.asc,id.asc'),
    ]);
    rowsEl.innerHTML = '';
    wards.forEach((c) => rowsEl.appendChild(catRow({ name: c.name, total: c.total_beds, occupied: c.occupied_beds, is_insurance: c.is_insurance })));
    notesEl.innerHTML = '';
    notesRows.forEach((n) => notesEl.appendChild(noteRow(n.content)));
    recalc();
    toast('已載入');
  } catch (e) {
    toast('載入失敗: ' + e.message, true);
  }
}

$('addBtn').addEventListener('click', () => { rowsEl.appendChild(catRow()); recalc(); });
$('addNoteBtn').addEventListener('click', () => notesEl.appendChild(noteRow()));
$('reloadBtn').addEventListener('click', () => load());

$('saveBtn').addEventListener('click', async () => {
  const payload = collect();
  if (payload.categories.length === 0) return toast('至少需要一筆病房類別', true);

  try {
    // 1. 讀取現有資料
    const existingWards = await api('hospital_wards?select=id');
    const existingNotes = await api('hospital_notes?select=id');

    // 2. 更新或新增 wards
    for (let i = 0; i < payload.categories.length; i++) {
      const c = payload.categories[i];
      const data = { name: c.name, total_beds: c.total, occupied_beds: c.occupied, is_insurance: c.is_insurance, sort_order: i };
      if (i < existingWards.length) {
        await api(`hospital_wards?id=eq.${existingWards[i].id}`, 'PATCH', data);
      } else {
        await api('hospital_wards', 'POST', data);
      }
    }
    // 刪除多餘的 wards
    if (existingWards.length > payload.categories.length) {
      const ids = existingWards.slice(payload.categories.length).map((w) => w.id);
      await api(`hospital_wards?id=in.(${ids.join(',')})`, 'DELETE');
    }

    // 3. 重新建立 notes（全部刪除再新增）
    if (existingNotes.length > 0) {
      const noteIds = existingNotes.map((n) => n.id);
      await api(`hospital_notes?id=in.(${noteIds.join(',')})`, 'DELETE');
    }
    for (let i = 0; i < payload.notes.length; i++) {
      await api('hospital_notes', 'POST', { content: payload.notes[i], sort_order: i });
    }

    // 4. 更新 updated_at
    const now = new Date().toISOString();
    await api('hospital_meta?key=eq.updated_at', 'PATCH', { value: now });

    toast('✓ 已儲存，前台已更新');
    await load();
  } catch (e) {
    toast(String(e.message || e), true);
  }
});

load();
