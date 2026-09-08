const { url, anonKey } = window.SUPABASE_CONFIG;
const REST = `${url.replace(/\/$/, '')}/rest/v1`;
const HEADERS = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };

const $ = (id) => document.getElementById(id);
const toastEl = $('toast'), rowsEl = $('rows'), emptyMsg = $('emptyMsg');

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

// 已移除登入密碼保護，直接載入
try {
  const savedHandler = localStorage.getItem('shinghou_handler_name');
  if (savedHandler) $('handlerName').value = savedHandler;
} catch (e) {}
load();

// ---------- Export XLSX ----------
let currentRows = [];

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

$('exportBtn').addEventListener('click', exportRequestsXlsx);

async function exportRequestsXlsx() {
  if (!currentRows.length) return toast('目前沒有資料可以匯出', true);
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = '杏和醫院集團';
    wb.created = new Date();

    const cols = [
      { header: '提交時間', key: 'created_at', width: 17 },
      { header: '院別', key: 'hospital', width: 14 },
      { header: '姓名', key: 'name', width: 10 },
      { header: '部門／職稱', key: 'dept', width: 18 },
      { header: '員工編號', key: 'employee_id', width: 10 },
      { header: '分機', key: 'extension', width: 8 },
      { header: '對外網路', key: 'net_access', width: 9 },
      { header: '共用資料夾', key: 'folder', width: 20 },
      { header: 'USB開通', key: 'usb_access', width: 9 },
      { header: '狀態', key: 'status', width: 10 },
      { header: '備註', key: 'handle_note', width: 28 },
      { header: '處理人', key: 'handled_by', width: 10 },
      { header: '處理時間', key: 'handled_at', width: 17 },
    ];

    const ws = wb.addWorksheet('網路資源申請記錄', {
      views: [{ state: 'frozen', ySplit: 2 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));

    ws.mergeCells(1, 1, 1, cols.length);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `杏和／杏永醫院集團 — 網路暨電腦資源開通申請記錄（匯出時間：${fmtDateTime(new Date().toISOString())}）`;
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

    const statusColors = { 待處理: 'FFFFE3E3', 處理中: 'FFFFF4D6', 已完成: 'FFD9E8B0', 已拒絕: 'FFEEEEEE' };
    const statusColIdx = cols.findIndex((c) => c.key === 'status') + 1;

    currentRows.forEach((r, idx) => {
      const folders = [r.folder_shinghou ? '杏和' : null, r.folder_shingyong ? '杏永' : null].filter(Boolean).join('／') || '—';
      const folderLine = folders === '—' ? '—' : `${folders}${r.folder_access ? `（${r.folder_access}）` : ''}`;
      const row = ws.addRow({
        created_at: fmtDateTime(r.created_at),
        hospital: r.hospital,
        name: r.name,
        dept: [r.department, r.title].filter(Boolean).join(' / '),
        employee_id: r.employee_id || '',
        extension: r.extension || '',
        net_access: r.net_access || '',
        folder: folderLine,
        usb_access: r.usb_access || '',
        status: r.status,
        handle_note: r.handle_note || '',
        handled_by: r.handled_by || '',
        handled_at: fmtDateTime(r.handled_at),
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
      const sc = statusColors[r.status];
      if (sc) row.getCell(statusColIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc } };
    });

    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `網路資源申請記錄_${todayStr()}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast('✓ 已匯出 XLSX');
  } catch (err) {
    toast('匯出失敗：' + err.message, true);
  }
}

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
    currentRows = rows;
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
