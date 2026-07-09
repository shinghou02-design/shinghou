const { url, anonKey } = window.SUPABASE_CONFIG;
const REST = `${url.replace(/\/$/, '')}/rest/v1`;
const HEADERS = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (num, den) => (den > 0 ? round1((num / den) * 100) : 0);
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function toROC(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const roc = d.getFullYear() - 1911;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${roc}.${d.getMonth() + 1}.${d.getDate()}  ${hh}:${mm}`;
}

async function sbGet(path) {
  const res = await fetch(`${REST}/${path}`, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function getReport() {
  const [wards, notesRows, metaRows] = await Promise.all([
    sbGet('hospital_wards?select=id,name,total_beds,occupied_beds,is_insurance&order=sort_order.asc,id.asc'),
    sbGet('hospital_notes?select=content&order=sort_order.asc,id.asc'),
    sbGet('hospital_meta?select=key,value'),
  ]);

  const cats = wards.map((c) => ({
    name: c.name,
    total: c.total_beds,
    occupied: c.occupied_beds,
    empty: c.total_beds - c.occupied_beds,
    rate: pct(c.occupied_beds, c.total_beds),
    is_insurance: !!c.is_insurance,
  }));

  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
  const total = { name: '總病床', total: sum(cats, 'total'), occupied: sum(cats, 'occupied') };
  total.empty = total.total - total.occupied;
  total.rate = pct(total.occupied, total.total);

  const insCats = cats.filter((c) => c.is_insurance);
  const insurance = { name: '保險病床數', total: sum(insCats, 'total'), occupied: sum(insCats, 'occupied') };
  insurance.empty = insurance.total - insurance.occupied;
  insurance.rate = pct(insurance.occupied, insurance.total);

  const meta = Object.fromEntries(metaRows.map((m) => [m.key, m.value]));

  return {
    title: (meta.report_title || '杏和醫院病床利用情形統計日報表').replace('杏永', '杏和'),
    categories: cats,
    total,
    insurance,
    acuteInsuranceRatio: pct(insurance.total, total.total),
    notes: notesRows.map((n) => n.content),
    updated_at: meta.updated_at,
  };
}

const tbody = document.getElementById('tbody');

function rateCell(rate) {
  return `<td class="${rate >= 90 ? 'rate-hot' : ''}">${fmtPct(rate)}</td>`;
}
function dataRow(r, cls = '') {
  return `<tr class="${cls}">
    <td class="name">${esc(r.name)}</td>
    <td>${r.total}</td>
    <td>${r.occupied}</td>
    <td>${r.empty}</td>
    ${rateCell(r.rate)}
  </tr>`;
}

function render(rep) {
  document.getElementById('title').textContent = rep.title;
  document.title = rep.title;

  let html = rep.categories.map((c) => dataRow(c)).join('');
  html += dataRow(rep.total, 'row-total');
  html += dataRow(rep.insurance, 'row-insurance');
  html += `<tr class="row-ratio">
    <td class="name">急性保險病床比率</td>
    <td colspan="4">${fmtPct(rep.acuteInsuranceRatio)}</td>
  </tr>`;
  tbody.innerHTML = html;

  document.getElementById('notes').innerHTML = rep.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  document.getElementById('updated').textContent = '更新時間：' + toROC(rep.updated_at);
}

async function refresh() {
  try {
    render(await getReport());
    document.getElementById('warn').style.display = 'none';
  } catch {
    document.getElementById('warn').style.display = 'block';
  }
}

refresh();
setInterval(refresh, 30000);