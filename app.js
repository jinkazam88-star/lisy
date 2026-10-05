'use strict';
/* ============ Data ============ */
const KEY = 'lisy-hala-v1';
const H = 3600e3, M = 60e3;
const PRESS_COUNT = 20;
const SLOT_NAMES = ['Běží', 'Další 1', 'Další 2', 'Další 3', 'Další 4'];

function emptyState() {
  const presses = [];
  for (let i = 1; i <= PRESS_COUNT; i++) presses.push({ id: i, name: 'Lis ' + String(i).padStart(2, '0'), slots: [null, null, null, null, null] });
  return { v: 1, presses, catalog: [], log: [], who: '', updated: 0, from: null };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !Array.isArray(S.presses)) S = emptyState();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

function save() {
  S.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Nepodařilo se uložit do telefonu'); }
}
const press = id => S.presses.find(p => p.id === id);
function log(id, what) {
  S.log.unshift({ t: Date.now(), id, what, who: S.who || '' });
  S.log = S.log.slice(0, 150);
}
function addToCatalog(name) {
  if (name && !S.catalog.includes(name)) { S.catalog.push(name); S.catalog.sort((a, b) => a.localeCompare(b, 'cs')); return true; }
  return false;
}

/* ============ Time helpers ============ */
const pad = n => String(n).padStart(2, '0');
const DAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
function shiftInfo(ts = Date.now()) {
  const d = new Date(ts), h = d.getHours(), end = new Date(d);
  end.setMinutes(0, 0, 0);
  let name;
  if (h >= 6 && h < 14) { name = 'Ranní'; end.setHours(14); }
  else if (h >= 14 && h < 22) { name = 'Odpolední'; end.setHours(22); }
  else { name = 'Noční'; if (h >= 22) end.setDate(end.getDate() + 1); end.setHours(6); }
  return { name, end: end.getTime() };
}
function fmtEnd(t) {
  if (!t) return 'konec nezadán';
  const d = new Date(t), n = new Date();
  const tm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return d.toDateString() === n.toDateString() ? 'dnes ' + tm : DAYS[d.getDay()] + ' ' + d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + tm;
}
function fmtLeft(t) {
  const ms = t - Date.now(), a = Math.abs(ms), h = Math.floor(a / H), m = Math.floor(a % H / M);
  const s = (h ? h + ' h ' : '') + m + ' min';
  return ms < 0 ? 'po termínu ' + s : 'zbývá ' + s;
}
const toLocal = t => { if (!t) return ''; const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fromLocal = v => v ? new Date(v).getTime() : null;

function status(p) {
  const r = p.slots[0];
  if (!r) return { c: 'var(--idle)', t: 'Stojí' };
  if (r.stopped) return { c: 'var(--stop)', t: 'Zastaveno' };
  if (!r.end) return { c: 'var(--warn)', t: 'Konec nezadán' };
  const left = r.end - Date.now();
  if (left < 0) return { c: 'var(--crit)', t: 'Po termínu' };
  if (left < 2 * H) return { c: 'var(--crit)', t: 'Do 2 h' };
  if (r.end <= shiftInfo().end) return { c: 'var(--warn)', t: 'Tuto směnu' };
  return { c: 'var(--ok)', t: 'Jede' };
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

/* ============ Main views ============ */
let filter = 'all';
function renderHeader() {
  const s = shiftInfo();
  $('shiftName').textContent = s.name + ' směna';
  $('shiftEnd').textContent = pad(new Date(s.end).getHours()) + ':00';
  $('srcInfo').textContent = S.from ? 'Převzato od ' + (S.from.who || '?') + ', ' + fmtEnd(S.from.t) : (S.updated ? '' : 'Klepni na lis a zadej výrobek, nebo načti směnu od kolegy v Předání.');
}
function renderGrid() {
  const se = shiftInfo().end;
  const list = S.presses.filter(p => {
    const r = p.slots[0];
    if (filter === 'idle') return !r;
    if (filter === 'stop') return r && r.stopped;
    if (filter === 'shift') return r && !r.stopped && r.end && r.end <= se;
    return true;
  });
  $('grid').innerHTML = list.map(p => {
    const st = status(p), r = p.slots[0], q = p.slots.slice(1).filter(Boolean);
    let info;
    if (!r) info = `<span class="left">${st.t}</span>`;
    else if (r.stopped) info = `<span class="end">${esc(r.note || '')}</span><span class="left">Zastaveno</span>`;
    else if (!r.end) info = `<span class="left">Konec nezadán</span>`;
    else info = `<span class="end mono">${fmtEnd(r.end)}</span><span class="left">${fmtLeft(r.end)}</span>`;
    return `<button class="tile ${r ? '' : 'empty'}" style="--st:${st.c}" data-open="${p.id}">
      <span class="no">${esc(p.name)}</span>
      <span class="prod">${r ? esc(r.p) : 'Bez výrobku'}</span>${info}
      <span class="q">${q.length ? 'další: ' + esc(q[0].p) + (q.length > 1 ? ' +' + (q.length - 1) : '') : 'pořadí prázdné'}</span>
    </button>`;
  }).join('') || '<p class="hint">Žádný lis neodpovídá filtru.</p>';
}
function renderHandover() {
  const now = Date.now(), next = shiftInfo(shiftInfo().end + M).end;
  const items = S.presses.filter(p => { const r = p.slots[0]; return !r || r.stopped || !r.end || r.end <= next; })
    .sort((a, b) => (a.slots[0] && a.slots[0].end || 0) - (b.slots[0] && b.slots[0].end || 0));
  $('handover').innerHTML = items.map(p => {
    const st = status(p), r = p.slots[0], n = p.slots[1];
    const badge = !r ? 'stojí' : r.stopped ? 'zastaveno' : !r.end ? 'konec ?' : r.end < now ? 'po termínu' : 'konec ' + fmtEnd(r.end).replace('dnes ', '');
    return `<button class="row" style="--st:${st.c}" data-open="${p.id}">
      <span class="no">${esc(p.name)}</span>
      <span>${r ? esc(r.p) : '<span style="color:var(--muted)">—</span>'}</span>
      <span class="badge">${badge}</span>
      <span class="sub">Připravit: <b>${n ? esc(n.p) : 'nic zadáno'}</b></span>
    </button>`;
  }).join('') || '<p class="hint">Do konce příští směny nic nekončí.</p>';
  $('log').innerHTML = S.log.slice(0, 20).map(l =>
    `<div class="row simple"><span><b>${esc(l.who || '?')}</b> · ${esc((press(l.id) || {}).name || '')} · ${esc(l.what)}</span><span class="mono" style="font-size:.8rem;color:var(--muted)">${fmtEnd(l.t).replace('dnes ', '')}</span></div>`
  ).join('') || '<p class="hint">Zatím žádné změny.</p>';
  if (document.activeElement !== $('who')) $('who').value = S.who || '';
}
function renderCatalog() {
  const q = ($('catSearch').value || '').toLowerCase();
  $('catalog').innerHTML = S.catalog.map((c, i) => ({ c, i })).filter(x => !q || x.c.toLowerCase().includes(q))
    .map(x => `<div class="row simple"><span>${esc(x.c)}</span><button class="sm del" data-catdel="${x.i}">Odebrat</button></div>`).join('')
    || '<p class="hint">Katalog je prázdný. Výrobky přidáš tady nebo při zadávání k lisu.</p>';
  $('products').innerHTML = S.catalog.map(c => `<option value="${esc(c)}">`).join('');
}
function renderAll() { renderHeader(); renderGrid(); renderHandover(); renderCatalog(); if ($('dlg').open) drawSheet(); }

/* ============ Press detail sheet ============ */
let editId = null, moveIdx = null, confirmDel = null;
function openSheet(id) { editId = id; moveIdx = null; confirmDel = null; drawSheet(); $('dlg').showModal(); }
function slotHtml(p, s, i) {
  const run = i === 0, stopped = run && s && s.stopped, locked = run && s && !s.stopped;
  let acts = '';
  if (run && !s && p.slots[1]) acts += `<button class="sm go" data-a="start-next">Nasadit ${esc(p.slots[1].p)}</button>`;
  if (locked) acts += `<button class="sm go" data-a="done">Hotovo, nasadit další</button><button class="sm stop" data-a="stop">Zastavit</button>`;
  if (stopped) acts += `<button class="sm go" data-a="resume">Spustit znovu</button>`;
  if (s && !locked) acts += `<button class="sm" data-a="mv" data-i="${i}">Na jiný lis</button><button class="sm del" data-a="del" data-i="${i}">${confirmDel === i ? 'Opravdu smazat?' : 'Smazat'}</button>`;
  if (s && !S.catalog.includes(s.p)) acts += `<button class="sm cat" data-a="cat" data-i="${i}">Uložit do katalogu</button>`;
  return `<div class="slot ${run ? 'run' : 'q'} ${stopped ? 'stopped' : ''}" data-i="${i}">
    <div class="slot-top">
      ${!run && s ? '<span class="grip" aria-label="Přetáhnout">⠿</span>' : ''}
      <span class="lbl">${SLOT_NAMES[i]}${stopped ? ' · <span class="stopflag">zastaveno</span>' : ''}</span>
      ${!run && s ? `${i > 1 ? `<button class="sm" data-a="up" data-i="${i}" aria-label="Výš">↑</button>` : ''}${i < 4 ? `<button class="sm" data-a="down" data-i="${i}" aria-label="Níž">↓</button>` : ''}` : ''}
    </div>
    <div class="fields">
      ${locked ? `<div class="ro">${esc(s.p)}</div>` : `<input type="text" data-f="p" data-i="${i}" autocomplete="off" placeholder="Vyber z katalogu nebo napiš" value="${s ? esc(s.p) : ''}" aria-label="Výrobek – ${SLOT_NAMES[i]}" enterkeyhint="done">`}
      <input type="datetime-local" data-f="end" data-i="${i}" value="${s ? toLocal(s.end) : ''}" aria-label="Předpokládaný konec – ${SLOT_NAMES[i]}" ${s ? '' : 'disabled'}>
    </div>
    ${stopped ? `<input type="text" data-f="note" data-i="0" value="${esc(s.note || '')}" placeholder="Důvod zastavení (nepovinné)" aria-label="Důvod zastavení">` : ''}
    ${acts ? `<div class="acts">${acts}</div>` : ''}
    ${moveIdx === i ? movePanel() : ''}
  </div>`;
}
function movePanel() {
  const opts = S.presses.filter(p => p.id !== editId).map(p => {
    const r = p.slots[0], free = p.slots.slice(1).some(x => !x) || !r;
    return `<option value="${p.id}" ${free ? '' : 'disabled'}>${esc(p.name)} – ${r ? esc(r.p) + (r.stopped ? ' (zastaveno)' : '') : 'stojí'}${free ? '' : ' (plné)'}</option>`;
  }).join('');
  return `<div class="mv"><span class="lbl">Přesunout na jiný lis</span>
    <select id="mvLis" aria-label="Cílový lis">${opts}</select>
    <select id="mvPos" aria-label="Pozice"></select>
    <div class="acts"><button class="sm go" data-a="mvgo">Přesunout</button><button class="sm" data-a="mvx">Zrušit</button></div></div>`;
}
function fillPosOptions() {
  const sel = $('mvPos'); if (!sel) return;
  const t = press(+$('mvLis').value); if (!t) { sel.innerHTML = ''; return; }
  let o = '';
  if (!t.slots[0]) o += '<option value="0">Nasadit hned (běží)</option>';
  if (t.slots.slice(1).some(x => !x)) {
    o += '<option value="end" selected>Na konec pořadí</option>';
    for (let k = 1; k <= 4; k++) o += `<option value="${k}">Jako ${SLOT_NAMES[k]}</option>`;
  }
  sel.innerHTML = o;
}
function drawSheet() {
  hideSug();
  const p = press(editId);
  const sc = $('dlg').scrollTop;
  $('sheet').innerHTML = `<div class="sh-head"><h3>${esc(p.name)}</h3>
      <div><button class="sm" data-a="rename">Přejmenovat</button><button class="x" data-a="close" aria-label="Zavřít">×</button></div></div>
    <p class="hint" style="margin:0">Změny se ukládají hned. Pořadí změníš přetažením za ⠿ nebo šipkami. Běžící výrobek jde přesunout nebo smazat až po zastavení.</p>
    ${p.slots.map((s, i) => slotHtml(p, s, i)).join('')}`;
  if (moveIdx !== null) { const first = $('mvLis').querySelector('option:not([disabled])'); if (first) $('mvLis').value = first.value; fillPosOptions(); }
  $('dlg').scrollTop = sc;
}
function compactQueue(p) { // keep Další 1-4 without gaps
  const q = p.slots.slice(1).filter(Boolean);
  p.slots = [p.slots[0], ...q, null, null, null, null].slice(0, 5);
}
function commit(msg) { if (msg) log(editId, msg); save(); renderHeader(); renderGrid(); renderHandover(); renderCatalog(); drawSheet(); }

$('sheet').addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, i = +b.dataset.i, p = press(editId), s = p.slots[i];
  if (a !== 'del') confirmDel = null;
  switch (a) {
    case 'close': $('dlg').close(); return;
    case 'rename': openRename(p); return;
    case 'done': {
      const old = p.slots[0];
      p.slots = [...p.slots.slice(1), null];
      if (p.slots[0]) p.slots[0].stopped = false;
      return commit('dokončeno ' + old.p + (p.slots[0] ? ', nasazeno ' + p.slots[0].p : ', lis stojí'));
    }
    case 'start-next': {
      p.slots[0] = p.slots[1]; p.slots[1] = null; compactQueue(p);
      return commit('nasazeno ' + p.slots[0].p);
    }
    case 'stop': p.slots[0].stopped = true; return commit('zastaveno ' + p.slots[0].p);
    case 'resume': p.slots[0].stopped = false; delete p.slots[0].note; return commit('znovu spuštěno ' + p.slots[0].p);
    case 'del':
      if (confirmDel !== i) { confirmDel = i; drawSheet(); return; }
      confirmDel = null; p.slots[i] = null; if (i > 0) compactQueue(p);
      return commit('smazáno ' + s.p + ' (' + SLOT_NAMES[i] + ')');
    case 'up': [p.slots[i - 1], p.slots[i]] = [p.slots[i], p.slots[i - 1]]; compactQueue(p); return commit();
    case 'down': [p.slots[i + 1], p.slots[i]] = [p.slots[i], p.slots[i + 1]]; compactQueue(p); return commit();
    case 'cat': addToCatalog(s.p); save(); toast('Uloženo do katalogu'); renderCatalog(); drawSheet(); return;
    case 'mv': moveIdx = moveIdx === i ? null : i; drawSheet(); return;
    case 'mvx': moveIdx = null; drawSheet(); return;
    case 'mvgo': return doMove();
  }
});
function setProduct(i, v) {
  const p = press(editId);
  if (!v) return;
  if (p.slots[i]) { const old = p.slots[i].p; if (old === v) return; p.slots[i].p = v; commit('přejmenováno ' + old + ' → ' + v); }
  else {
    p.slots[i] = { p: v, end: null };
    if (i > 0) compactQueue(p);
    commit('zadáno ' + v + ' (' + SLOT_NAMES[i] + ')');
  }
}
/* vlastní výběr z katalogu (datalist v mobilech spolehlivě nefunguje) */
let sugEl = null;
function hideSug() { if (sugEl) { sugEl.remove(); sugEl = null; } }
function showSug(inp) {
  const q = inp.value.trim().toLowerCase();
  const items = S.catalog.filter(c => !q || c.toLowerCase().includes(q));
  if (!sugEl) { sugEl = document.createElement('div'); sugEl.className = 'sug'; sugEl.setAttribute('role', 'listbox'); }
  sugEl.innerHTML = items.length
    ? items.map(c => `<button type="button" role="option" data-pick="${esc(c)}">${esc(c)}</button>`).join('')
    : `<div class="sug-empty">${S.catalog.length ? 'V katalogu nic neodpovídá. Napiš název a potvrď.' : 'Katalog je prázdný. Napiš název a potvrď.'}</div>`;
  sugEl.dataset.i = inp.dataset.i;
  if (sugEl.previousElementSibling !== inp) inp.after(sugEl);
}
$('sheet').addEventListener('focusin', e => { const t = e.target; if (t.dataset && t.dataset.f === 'p') showSug(t); });
$('sheet').addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.f === 'p') showSug(t); });
let picking = false, pickedAt = 0, pickedIdx = -1; // prst je na položce seznamu – nepotvrzovat rozepsaný text
$('sheet').addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.f === 'p') setTimeout(() => { if (!picking && (!document.activeElement || document.activeElement.dataset.f !== 'p')) hideSug(); }, 150); });
$('sheet').addEventListener('pointerdown', e => { if (e.target.closest('.sug')) picking = true; });
$('sheet').addEventListener('mousedown', e => { if (e.target.closest('[data-pick]')) e.preventDefault(); });
$('sheet').addEventListener('pointercancel', () => { picking = false; });
$('sheet').addEventListener('click', e => {
  const b = e.target.closest('[data-pick]');
  if (!b) { picking = false; return; }
  const i = +sugEl.dataset.i, v = b.dataset.pick;
  picking = false; pickedAt = Date.now(); pickedIdx = i; hideSug(); setProduct(i, v);
});
$('sheet').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.f === 'p') { e.preventDefault(); hideSug(); e.target.blur(); } });
$('sheet').addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'mvLis') return fillPosOptions();
  const f = el.dataset.f; if (!f) return;
  const i = +el.dataset.i, p = press(editId);
  if (f === 'p') {
    if (picking || (i === pickedIdx && Date.now() - pickedAt < 800)) return;
    setProduct(i, el.value.trim());
  } else if (f === 'end' && p.slots[i]) {
    p.slots[i].end = fromLocal(el.value); commit('konec ' + p.slots[i].p + ': ' + fmtEnd(p.slots[i].end));
  } else if (f === 'note' && p.slots[0]) {
    p.slots[0].note = el.value.trim(); save(); renderGrid();
  }
});
function doMove() {
  const src = press(editId), item = src.slots[moveIdx];
  const t = press(+$('mvLis').value), pv = $('mvPos').value;
  if (!item || !t || !pv) return;
  if (moveIdx === 0 && !item.stopped) { toast('Běžící výrobek nejdřív zastav'); return; }
  const moved = { p: item.p, end: item.end || null };
  let pos;
  if (pv === '0') { if (t.slots[0]) return toast(t.name + ' už má běžící výrobek'); t.slots[0] = moved; pos = 0; }
  else {
    const q = t.slots.slice(1).filter(Boolean);
    if (q.length >= 4) return toast(t.name + ' má plné pořadí');
    pos = pv === 'end' ? q.length + 1 : Math.min(+pv, q.length + 1);
    q.splice(pos - 1, 0, moved);
    t.slots = [t.slots[0], ...q, null, null, null, null].slice(0, 5);
  }
  src.slots[moveIdx] = null; if (moveIdx > 0) compactQueue(src);
  log(t.id, 'přijato ' + moved.p + ' z ' + src.name + ' (' + SLOT_NAMES[pos] + ')');
  moveIdx = null;
  commit('přesunuto ' + moved.p + ' → ' + t.name + ' (' + SLOT_NAMES[pos] + ')');
  toast(moved.p + ' je na ' + t.name);
}
/* drag to reorder queue (touch + mouse) */
(function () {
  const sheet = $('sheet'); let drag = null;
  sheet.addEventListener('pointerdown', e => {
    const g = e.target.closest('.grip'); if (!g) return;
    e.preventDefault(); const el = g.closest('.slot');
    drag = { el }; el.classList.add('dragging'); g.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener('pointermove', e => {
    if (!drag) return;
    const slots = [...sheet.querySelectorAll('.slot.q')];
    for (const s of slots) {
      if (s === drag.el) continue;
      const r = s.getBoundingClientRect();
      if (e.clientY > r.top && e.clientY < r.bottom) {
        const before = e.clientY < r.top + r.height / 2, iS = slots.indexOf(s), iD = slots.indexOf(drag.el);
        if (iD > iS && before) s.before(drag.el); else if (iD < iS && !before) s.after(drag.el);
        break;
      }
    }
    const d = $('dlg'), r = d.getBoundingClientRect();
    if (e.clientY < r.top + 60) d.scrollTop -= 12; else if (e.clientY > r.bottom - 60) d.scrollTop += 12;
  });
  const end = () => {
    if (!drag) return;
    drag.el.classList.remove('dragging'); drag = null;
    const p = press(editId);
    const order = [...sheet.querySelectorAll('.slot.q')].map(el => p.slots[+el.dataset.i]).filter(Boolean);
    const before = JSON.stringify(p.slots);
    p.slots = [p.slots[0], ...order, null, null, null, null].slice(0, 5);
    if (JSON.stringify(p.slots) !== before) commit('změněno pořadí'); else drawSheet();
  };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
})();
$('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').close(); });

/* rename press */
function openRename(p) {
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Přejmenovat</h3><button class="x" data-b="close" aria-label="Zavřít">×</button></div>
    <input type="text" id="renameIn" value="${esc(p.name)}" aria-label="Název lisu">
    <button class="primary" data-b="ok">Uložit</button>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === 'ok') { const v = $('renameIn').value.trim(); if (v) { p.name = v; save(); renderAll(); } }
    closeDlg2();
  };
}

/* ============ Handover: QR + file ============ */
const PREFIX = 'LISY1:';
function packState(withCatalog) {
  const names = [], idx = n => { let k = names.indexOf(n); if (k < 0) { k = names.length; names.push(n); } return k; };
  const t0 = Math.floor(Date.now() / M);
  const l = S.presses.map(p => [p.id, p.name, ...p.slots.map(s => s ? [idx(s.p), s.end ? Math.round(s.end / M) - t0 : null, s.stopped ? 1 : 0, s.note || ''] : 0)]);
  const o = { t: t0, w: S.who || '', n: names, l };
  if (withCatalog) o.c = S.catalog;
  return o;
}
function unpack(o) {
  const presses = o.l.map(([id, name, ...sl]) => ({
    id, name,
    slots: sl.map(s => s ? Object.assign({ p: o.n[s[0]], end: s[1] === null ? null : (o.t + s[1]) * M }, s[2] ? { stopped: true } : {}, s[3] ? { note: s[3] } : {}) : null)
  }));
  return { presses, catalog: o.c || [], who: o.w, t: o.t * M };
}
function decodeText(txt) {
  txt = (txt || '').trim();
  if (txt.startsWith(PREFIX)) return unpack(JSON.parse(LZString.decompressFromBase64(txt.slice(PREFIX.length))));
  const o = JSON.parse(txt);
  if (o.app === 'lisy-hala') return unpack(o.data);
  throw new Error('neznámý formát');
}
function closeDlg2() { stopCam(); $('dlg2').close(); }
$('dlg2').addEventListener('close', stopCam);

const CHUNK = 420; // znaků na jeden QR kód – menší kód se lépe skenuje
function qrParts() {
  const data = LZString.compressToBase64(JSON.stringify(packState(false)));
  const id = Math.random().toString(36).slice(2, 6), n = Math.ceil(data.length / CHUNK), parts = [];
  for (let k = 0; k < n; k++) parts.push(`${PREFIX}${id}:${k + 1}/${n}:${data.slice(k * CHUNK, (k + 1) * CHUNK)}`);
  return parts;
}
let qrTimer = null;
function openGive() {
  if (!S.who) { $('who').focus(); toast('Nejdřív napiš své jméno'); return; }
  const svgs = qrParts().map(t => { const q = qrcode(0, 'M'); q.addData(t); q.make(); return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); });
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Předat směnu</h3><button class="x" data-b="close" aria-label="Zavřít">×</button></div>
    <p class="hint" style="margin:0">Nástupce v aplikaci dá <b>Předání → Načíst od předchozí směny</b> a namíří telefon na kód.${svgs.length > 1 ? ' Kódy se samy střídají, drž telefon namířený, dokud nenačte všechny.' : ''} Jas displeje dej na maximum.</p>
    <div class="qrbox" id="qrbox"></div>
    ${svgs.length > 1 ? '<p class="hint" style="margin:0;text-align:center" id="qrno"></p>' : ''}
    <button class="secondary" data-b="file">Poslat jako soubor (WhatsApp, e-mail…)</button>`;
  let k = 0;
  const show = () => { $('qrbox').innerHTML = svgs[k]; if ($('qrno')) $('qrno').textContent = 'Kód ' + (k + 1) + ' z ' + svgs.length; k = (k + 1) % svgs.length; };
  show(); if (svgs.length > 1) qrTimer = setInterval(show, 1200);
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === 'close') closeDlg2();
    if (b.dataset.b === 'file') shareFile();
  };
}
async function shareFile() {
  const d = new Date(), name = `predani-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const body = JSON.stringify({ app: 'lisy-hala', v: 1, data: packState(true) });
  const file = new File([body], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Předání směny' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove();
  toast('Soubor uložen do Stažených');
}

let camStream = null, camTimer = null;
function stopCam() { if (qrTimer) clearInterval(qrTimer); qrTimer = null; if (camTimer) clearInterval(camTimer); camTimer = null; if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; }
function openTake() {
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Načíst směnu</h3><button class="x" data-b="close" aria-label="Zavřít">×</button></div>
    <button class="primary" data-b="scan">Naskenovat QR kód</button>
    <video class="cam" id="cam" playsinline muted hidden></video>
    <button class="secondary" data-b="file">Otevřít soubor</button>
    <div id="takeMsg"></div>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    const k = b.dataset.b;
    if (k === 'close') closeDlg2();
    if (k === 'scan') startScan();
    if (k === 'file') $('fileIn').click();
    if (k === 'apply') applyImport();
  };
}
async function startScan() {
  stopCam();
  const v = $('cam');
  try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch (e) { $('takeMsg').innerHTML = '<p class="hint">Kamera není dostupná. Povol ji v nastavení prohlížeče, nebo použij soubor.</p>'; return; }
  v.hidden = false; v.srcObject = camStream; await v.play();
  const det = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
  let busy = false; const got = { id: null, parts: {} };
  camTimer = setInterval(async () => {
    if (busy || !v.videoWidth) return; busy = true;
    try {
      let txt = null;
      if (det) { const r = await det.detect(v); if (r[0]) txt = r[0].rawValue; }
      else {
        c.width = v.videoWidth; c.height = v.videoHeight; ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, c.width, c.height), r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (r) txt = r.data;
      }
      const m = txt && txt.match(/^LISY1:(\w+):(\d+)\/(\d+):(.*)$/s);
      if (m) {
        if (got.id !== m[1]) { got.id = m[1]; got.parts = {}; }
        got.parts[m[2]] = m[4];
        const n = +m[3], have = Object.keys(got.parts).length;
        if (have >= n) {
          stopCam(); v.hidden = true;
          let data = ''; for (let k = 1; k <= n; k++) data += got.parts[k];
          previewImport(PREFIX + data);
        } else $('takeMsg').innerHTML = `<p class="hint">Načteno ${have} z ${n} kódů, drž telefon namířený…</p>`;
      }
    } catch (e) { /* keep scanning */ }
    busy = false;
  }, 250);
}
$('fileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!$('dlg2').open) openTake();
  previewImport(await f.text());
});
let pending = null;
function previewImport(txt) {
  try { pending = decodeText(txt); } catch (e) { $('takeMsg').innerHTML = '<p class="hint">Tohle není předání z aplikace Lisy.</p>'; return; }
  const used = pending.presses.filter(p => p.slots[0]).length;
  const older = S.updated && pending.t < S.updated;
  $('takeMsg').innerHTML = `<div class="preview">Od: <b>${esc(pending.who || '?')}</b>, ${fmtEnd(pending.t)}<br>
    Obsazených lisů: <b>${used}</b> z ${pending.presses.length}${pending.catalog.length ? `<br>Katalog: ${pending.catalog.length} výrobků (doplní se k tvému)` : ''}
    ${older ? '<br><b style="color:var(--crit)">Pozor: tvoje data v telefonu jsou novější než tohle předání.</b>' : ''}</div>
    <p class="hint">Stav lisů v tomto telefonu se nahradí předaným stavem.</p>
    <button class="primary" data-b="apply">Převzít směnu</button>`;
}
function applyImport() {
  if (!pending) return;
  S.presses = pending.presses;
  pending.catalog.forEach(addToCatalog);
  pending.presses.forEach(p => p.slots.forEach(s => s && addToCatalog(s.p)));
  S.from = { who: pending.who, t: pending.t };
  log(pending.presses[0].id, 'převzata směna od ' + (pending.who || '?'));
  pending = null; save(); renderAll(); closeDlg2(); toast('Směna převzata');
}

/* ============ Global UI ============ */
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 2200); }
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) return openSheet(+o.dataset.open);
  const f = e.target.closest('[data-f]');
  if (f && f.classList.contains('chip')) { filter = f.dataset.f; document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === f)); renderGrid(); return; }
  const v = e.target.closest('nav [data-v]');
  if (v) {
    document.querySelectorAll('nav [data-v]').forEach(x => x === v ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
    ['hala', 'predani', 'katalog'].forEach(n => $('v-' + n).hidden = n !== v.dataset.v);
    $('filters').hidden = v.dataset.v !== 'hala';
    window.scrollTo(0, 0); return;
  }
  const d = e.target.closest('[data-catdel]');
  if (d) { const i = +d.dataset.catdel; if (d.dataset.sure) { S.catalog.splice(i, 1); save(); renderCatalog(); } else { d.dataset.sure = 1; d.textContent = 'Opravdu?'; } }
});
$('catForm').addEventListener('submit', e => {
  e.preventDefault(); const v = $('catNew').value.trim();
  if (v) { toast(addToCatalog(v) ? 'Přidáno do katalogu' : 'Už v katalogu je'); save(); renderCatalog(); }
  $('catNew').value = '';
});
$('catSearch').addEventListener('input', renderCatalog);
$('who').addEventListener('change', e => { S.who = e.target.value.trim(); save(); });
$('btnGive').addEventListener('click', openGive);
$('btnTake').addEventListener('click', openTake);

renderAll();
setInterval(() => { if (!$('dlg').open && !$('dlg2').open) { renderHeader(); renderGrid(); renderHandover(); } }, 30000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
