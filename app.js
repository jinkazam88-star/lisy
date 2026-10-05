'use strict';
/* ============ Data ============ */
const KEY = 'lisy-hala-v1';
const VERSION = '8';
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
// převod dat ze starších verzí
S.presses.forEach(p => {
  p.slots = p.slots.map((x, k) => { if (!x) return null; if (k > 0) return { p: x.p }; if (!x.state) { x.state = x.stopped ? 'stop' : 'run'; delete x.stopped; } delete x.dur; return x; });
  if (p.idle) delete p.idle.reason;
});
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
function fmtSince(t) {
  const m = Math.max(0, Math.floor((Date.now() - t) / M)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
  return 'stojí ' + (d ? d + ' d ' + h + ' h' : h ? h + ' h ' + mm + ' min' : mm + ' min');
}

function status(p) {
  const r = p.slots[0];
  if (!r) return { c: 'var(--idle)', t: 'Prázdný' };
  if (r.state === 'stop') return { c: 'var(--stop)', t: 'Zastaveno' };
  if (r.state === 'end') return { c: 'var(--done)', t: 'Ukončeno' };
  if (!r.end) return { c: 'var(--warn)', t: 'Bez času' };
  const left = r.end - Date.now();
  if (left < 0) return { c: 'var(--crit)', t: 'Po termínu' };
  if (left < 2 * H) return { c: 'var(--crit)', t: 'Do 2 h' };
  if (r.end <= shiftInfo().end) return { c: 'var(--warn)', t: 'Končí směnu' };
  return { c: 'var(--ok)', t: 'Běží' };
}
const ICONS = {
  logo: '<path d="M4 4h16v3H4zM6 7v11M18 7v11M9 9h6v3H9zM12 7v2M8.5 15h7v2h-7zM3 18h18v2H3z"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>', pause: '<path d="M8 5v14M16 5v14"/>', done: '<path d="M20 6 9 17l-5-5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  move: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  swap: '<path d="M16 3l4 4-4 4M20 7H8M8 21l-4-4 4-4M4 17h12"/>', list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2M18 14h2"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>', save: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>', chev: '<path d="M9 6l6 6-6 6"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

/* ============ Main views ============ */
let filter = 'all';
function renderHeader() {
  const s = shiftInfo();
  const now = new Date();
  $('clock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
  $('shiftName').textContent = s.name + ' směna';
  $('shiftEnd').textContent = pad(new Date(s.end).getHours()) + ':00';
  $('ver').textContent = 'verze ' + VERSION;
  $('srcInfo').textContent = S.from ? 'Převzato od ' + (S.from.who || '?') + ', ' + fmtEnd(S.from.t) : (S.updated ? '' : 'Klepni na lis a zadej výrobek, nebo načti směnu od kolegy v Předání.');
}
function renderGrid() {
  const se = shiftInfo().end;
  const list = S.presses.filter(p => {
    const r = p.slots[0];
    if (filter === 'idle') return !r || r.state !== 'run';
    if (filter === 'run') return r && r.state === 'run';
    if (filter === 'shift') return r && r.state === 'run' && r.end && r.end <= se;
    return true;
  });
  const isRun = r => r && r.state === 'run';
  $('cAll').textContent = S.presses.length;
  $('cRun').textContent = S.presses.filter(p => isRun(p.slots[0])).length;
  $('cShift').textContent = S.presses.filter(p => isRun(p.slots[0]) && p.slots[0].end && p.slots[0].end <= se).length;
  $('cIdle').textContent = S.presses.filter(p => !isRun(p.slots[0])).length;
  $('grid').innerHTML = list.map(p => {
    const st = status(p), r = p.slots[0], q = p.slots.slice(1).filter(Boolean);
    let body;
    if (!r) body = `<div class="prod">Prázdný</div><div class="t-meta"><span>čeká na nástroj</span>${p.idle ? `<b>${fmtSince(p.idle.since).replace('stojí ', '')}</b>` : ''}</div>`;
    else if (r.state !== 'run') body = `<div class="prod">${esc(r.p)}</div><div class="t-meta"><span>${esc(r.note || 'stojí')}</span><b>${fmtSince(r.since || Date.now()).replace('stojí ', '')}</b></div>`;
    else if (!r.end) body = `<div class="prod">${esc(r.p)}</div><div class="t-meta"><span>konec nezadán</span></div>`;
    else {
      const pct = r.since && r.end > r.since ? Math.min(100, Math.max(2, (Date.now() - r.since) / (r.end - r.since) * 100)) : null;
      const left = r.end - Date.now(), a = Math.abs(left), hh = Math.floor(a / H), mm = Math.floor(a % H / M);
      body = `<div class="prod">${esc(r.p)}</div>${pct !== null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
        <div class="t-meta"><span class="mono">${fmtEnd(r.end).replace('dnes ', '')}</span><b class="mono">${left < 0 ? '+' : ''}${hh ? hh + ' h ' : ''}${mm} min</b></div>`;
    }
    return `<button class="tile ${r ? '' : 'empty'}" style="--st:${st.c}" data-open="${p.id}">
      <div class="t-top"><span class="no">${esc(p.name)}</span><span class="pill">${st.t}</span></div>
      ${body}
      <div class="q">${q.length ? 'Další: <b>' + esc(q[0].p) + '</b>' + (q.length > 1 ? ' +' + (q.length - 1) : '') : 'Pořadí prázdné'}</div>
    </button>`;
  }).join('') || '<p class="hint">Žádný lis neodpovídá filtru.</p>';
}
function renderHandover() {
  const now = Date.now(), next = shiftInfo(shiftInfo().end + M).end;
  const items = S.presses.filter(p => { const r = p.slots[0]; return !r || r.state !== 'run' || !r.end || r.end <= next; })
    .sort((a, b) => (a.slots[0] && a.slots[0].end || 0) - (b.slots[0] && b.slots[0].end || 0));
  $('handover').innerHTML = items.map(p => {
    const st = status(p), r = p.slots[0], n = p.slots[1];
    const badge = !r ? 'prázdný' : r.state === 'stop' ? 'zastaveno' : r.state === 'end' ? 'ukončeno' : !r.end ? 'konec ?' : r.end < now ? 'po termínu' : 'konec ' + fmtEnd(r.end).replace('dnes ', '');
    return `<button class="row" style="--st:${st.c}" data-open="${p.id}">
      <span class="no">${esc(p.name)}</span>
      <span>${r ? esc(r.p) : '<span style="color:var(--muted)">připraven na nástroj</span>'}</span>
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
  $('catCount').textContent = S.catalog.length ? S.catalog.length + ' výrobků' : '';
  const q = ($('catSearch').value || '').toLowerCase();
  $('catalog').innerHTML = S.catalog.map((c, i) => ({ c, i })).filter(x => !q || x.c.toLowerCase().includes(q))
    .map(x => `<div class="row simple"><span>${esc(x.c)}</span><button class="sm del" data-catdel="${x.i}">Odebrat</button></div>`).join('')
    || '<p class="hint">Katalog je prázdný. Výrobky přidáš tady nebo při zadávání k lisu.</p>';
  $('products').innerHTML = S.catalog.map(c => `<option value="${esc(c)}">`).join('');
}
function renderAll() { renderHeader(); renderGrid(); renderHandover(); renderCatalog(); if ($('dlg').open) drawSheet(); }

/* ============ Press detail sheet ============ */
let editId = null, moveIdx = null, selQ = null, confirmOff = false;
function openSheet(id) { editId = id; moveIdx = null; selQ = null; confirmOff = false; drawSheet(); $('dlg').showModal(); }
function compactQueue(p) { // Další 1-4 bez mezer
  const q = p.slots.slice(1).filter(Boolean);
  p.slots = [p.slots[0], ...q, null, null, null, null].slice(0, 5);
}
function commit(msg, id) { if (msg) log(id || editId, msg); save(); renderHeader(); renderGrid(); renderHandover(); renderCatalog(); if ($('dlg').open) drawSheet(); }
function makeRunning(p, name, end) { p.slots[0] = { p: name, end: end || null, state: 'run', since: Date.now() }; delete p.idle; }

function runHtml(p) {
  const r = p.slots[0];
  if (!r) return `<div class="slot run empty">
    <div class="slot-top"><span class="lbl">Na lise</span></div>
    <div class="prodname">Prázdný, připravený na další nástroj</div>
    <div class="slotinfo">${p.idle ? fmtSince(p.idle.since) + (p.idle.last ? ' · naposledy ' + esc(p.idle.last) : '') : ''}</div>
    <div class="acts"><button class="sm go" data-a="newrun">${ic('play')}Nasadit výrobek</button></div>
    ${p.slots[1] ? '<p class="hint" style="margin:0">Nebo klepni na výrobek v pořadí a dej Nasadit na lis.</p>' : ''}
  </div>`;
  const run = r.state === 'run', lbl = run ? 'Běží' : r.state === 'stop' ? 'Zastaveno' : 'Ukončeno';
  let acts;
  if (run) acts = `<button class="sm end" data-a="finish">${ic('done')}Ukončit výrobu</button><button class="sm stop" data-a="stop">${ic('pause')}Zastavit výrobu</button><button class="sm" data-a="time">${ic('clock')}Změnit čas</button>`;
  else acts = `<button class="sm go" data-a="resume">${ic('play')}Opět spustit</button>
    <button class="sm del" data-a="off">${ic('wrench')}${confirmOff ? 'Opravdu sundat?' : 'Sundat nástroj'}</button>
    <button class="sm" data-a="mv" data-i="0">${ic('move')}Na jiný lis</button>`;
  const pct = run && r.end && r.since && r.end > r.since ? Math.min(100, Math.max(2, (Date.now() - r.since) / (r.end - r.since) * 100)) : null;
  return `<div class="slot run st-${r.state}">
    <div class="slot-top"><span class="lbl">${lbl}</span></div>
    <div class="prodname">${esc(r.p)}</div>
    ${pct !== null ? `<div class="bar" style="--st:${status(p).c}"><i style="width:${pct}%"></i></div>` : ''}
    <div class="slotinfo">${run ? (r.end ? ic('clock') + 'konec ' + fmtEnd(r.end) + ' · ' + fmtLeft(r.end) : 'konec nezadán')
      : (r.note ? esc(r.note) + ' · ' : '') + fmtSince(r.since || Date.now()) + (r.since ? ' (od ' + fmtEnd(r.since) + ')' : '')}</div>
    <div class="acts">${acts}</div>
    ${moveIdx === 0 ? movePanel() : ''}
  </div>`;
}
function queueHtml(p, s, i) {
  const open = selQ === i, r = p.slots[0];
  let acts = '';
  if (open) {
    acts = `<div class="acts">
      ${!r ? `<button class="sm go" data-a="deploy" data-i="${i}">${ic('play')}Nasadit na lis</button>` : ''}
      <button class="sm" data-a="mv" data-i="${i}">${ic('move')}Na jiný lis</button>
      <button class="sm" data-a="qedit" data-i="${i}">${ic('edit')}Upravit</button>
      ${i > 1 ? `<button class="sm" data-a="up" data-i="${i}" aria-label="Výš">${ic('up')}</button>` : ''}
      ${i < 4 && p.slots[i + 1] ? `<button class="sm" data-a="down" data-i="${i}" aria-label="Níž">${ic('down')}</button>` : ''}
      <button class="sm del" data-a="del" data-i="${i}">${ic('trash')}Smazat</button>
      ${!S.catalog.includes(s.p) ? `<button class="sm cat" data-a="cat" data-i="${i}">${ic('save')}Do katalogu</button>` : ''}
    </div>
    ${r ? `<p class="hint" style="margin:0">Na lis jde nasadit, až bude prázdný (${r.state === 'run' ? 'nejdřív ukonči výrobu a sundej nástroj' : 'nejdřív sundej nástroj'}).</p>` : ''}`;
  }
  return `<div class="slot q ${open ? 'sel' : ''}" data-i="${i}">
    <div class="qrow" data-a="sel" data-i="${i}">
      <span class="grip" aria-label="Přetáhnout">${ic('grip')}</span>
      <span class="qn">${i}</span>
      <span class="prodname">${esc(s.p)}</span>
      <span class="chev">${ic(open ? 'down' : 'chev')}</span>
    </div>
    ${acts}
    ${moveIdx === i ? movePanel() : ''}
  </div>`;
}
function drawSheet() {
  const p = press(editId), sc = $('dlg').scrollTop, q = p.slots.slice(1);
  const st = status(p);
  $('sheet').innerHTML = `<div class="sh-head"><h3>${esc(p.name)} <span class="pill" style="--st:${st.c}">${st.t}</span></h3>
      <div class="tools"><button class="icb" data-a="rename" aria-label="Přejmenovat lis">${ic('edit')}</button><button class="x" data-a="close" aria-label="Zavřít">${ic('x')}</button></div></div>
    ${runHtml(p)}
    <div class="qhead"><span class="flbl">Další výrobky</span><span class="hint" style="margin:0">klepni pro možnosti · táhni za úchyt</span></div>
    ${q.map((s, k) => s ? queueHtml(p, s, k + 1) : '').join('')}
    ${q.some(x => !x) ? `<button class="addq" data-a="qadd">${ic('plus')}Přidat výrobek do pořadí</button>` : '<p class="hint" style="margin:0">Pořadí je plné (4 výrobky).</p>'}`;
  if (moveIdx !== null && $('mvLis')) { const first = $('mvLis').querySelector('option:not([disabled])'); if (first) $('mvLis').value = first.value; fillPosOptions(); }
  $('dlg').scrollTop = sc;
}
function movePanel() {
  const opts = S.presses.filter(p => p.id !== editId).map(p => {
    const r = p.slots[0], free = p.slots.slice(1).some(x => !x) || !r;
    return `<option value="${p.id}" ${free ? '' : 'disabled'}>${esc(p.name)} – ${r ? esc(r.p) + (r.state !== 'run' ? ' (' + (r.state === 'stop' ? 'zastaveno' : 'ukončeno') + ')' : '') : 'prázdný'}${free ? '' : ' (plné)'}</option>`;
  }).join('');
  return `<div class="mv"><span class="flbl">Přesunout na jiný lis</span>
    <select id="mvLis" aria-label="Cílový lis">${opts}</select>
    <select id="mvPos" aria-label="Pozice"></select>
    <div class="acts"><button class="sm go" data-a="mvgo">Přesunout</button><button class="sm" data-a="mvx">Zrušit</button></div></div>`;
}
function fillPosOptions() {
  const sel = $('mvPos'); if (!sel) return;
  const t = press(+$('mvLis').value); if (!t) { sel.innerHTML = ''; return; }
  let o = '';
  if (t.slots.slice(1).some(x => !x)) {
    o += '<option value="end" selected>Do pořadí na konec</option>';
    for (let k = 1; k <= 4; k++) o += `<option value="${k}">Do pořadí jako ${k}.</option>`;
  }
  if (!t.slots[0]) o += '<option value="0">Nasadit hned (běží)</option>';
  sel.innerHTML = o;
}
function doMove() {
  const src = press(editId), item = src.slots[moveIdx];
  const t = press(+$('mvLis').value), pv = $('mvPos').value;
  if (!item || !t || !pv) return;
  if (moveIdx === 0 && item.state === 'run') { toast('Běžící výrobek nejdřív zastav nebo ukonči'); return; }
  let where;
  if (pv === '0') { if (t.slots[0]) return toast(t.name + ' není prázdný'); makeRunning(t, item.p, null); where = 'běží'; }
  else {
    const q = t.slots.slice(1).filter(Boolean);
    if (q.length >= 4) return toast(t.name + ' má plné pořadí');
    const pos = pv === 'end' ? q.length + 1 : Math.min(+pv, q.length + 1);
    q.splice(pos - 1, 0, { p: item.p });
    t.slots = [t.slots[0], ...q, null, null, null, null].slice(0, 5);
    where = 'pořadí ' + pos + '.';
  }
  src.slots[moveIdx] = null;
  if (moveIdx > 0) compactQueue(src); else src.idle = { since: Date.now(), last: item.p };
  log(t.id, 'přijato ' + item.p + ' z ' + src.name + ' (' + where + ')');
  moveIdx = null; selQ = null;
  commit('přesunuto ' + item.p + ' → ' + t.name + ' (' + where + ')');
  toast(item.p + ' je na ' + t.name);
}

$('sheet').addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, i = +b.dataset.i, p = press(editId), s = p.slots[i];
  if (a !== 'off') confirmOff = false;
  switch (a) {
    case 'close': $('dlg').close(); return;
    case 'rename': openRename(p); return;
    case 'sel': selQ = selQ === i ? null : i; moveIdx = null; drawSheet(); return;
    case 'newrun': return openEditor({ mode: 'newrun' });
    case 'deploy': return openEditor({ mode: 'deploy', k: i });
    case 'time': return openEditor({ mode: 'time' });
    case 'resume': return openEditor({ mode: 'resume' });
    case 'qadd': return openEditor({ mode: 'qadd' });
    case 'qedit': return openEditor({ mode: 'qedit', k: i });
    case 'finish': return openStateDlg(p, 'end');
    case 'stop': return openStateDlg(p, 'stop');
    case 'off':
      if (!confirmOff) { confirmOff = true; drawSheet(); return; }
      confirmOff = false; p.idle = { since: Date.now(), last: p.slots[0].p }; p.slots[0] = null;
      return commit('sundán nástroj (' + p.idle.last + '), lis prázdný');
    case 'del': p.slots[i] = null; compactQueue(p); selQ = null; return commit('smazáno z pořadí: ' + s.p);
    case 'up': [p.slots[i - 1], p.slots[i]] = [p.slots[i], p.slots[i - 1]]; selQ = i - 1; return commit();
    case 'down': [p.slots[i + 1], p.slots[i]] = [p.slots[i], p.slots[i + 1]]; selQ = i + 1; return commit();
    case 'cat': addToCatalog(s.p); save(); toast('Uloženo do katalogu'); renderCatalog(); drawSheet(); return;
    case 'mv': moveIdx = moveIdx === i ? null : i; drawSheet(); return;
    case 'mvx': moveIdx = null; drawSheet(); return;
    case 'mvgo': return doMove();
  }
});
$('sheet').addEventListener('change', ev => { if (ev.target.id === 'mvLis') fillPosOptions(); });

/* ===== Editor (vše s potvrzením) ===== */
let ED = null;
const QUICK = [[30, '30 min'], [60, '1 h'], [120, '2 h'], [180, '3 h'], [240, '4 h'], [360, '6 h'], [480, '8 h'], [720, '12 h']];
function openEditor(o) {
  $('sheet2').onclick = null;
  const p = press(editId), r = p.slots[0];
  ED = o;
  const withName = ['newrun', 'qadd', 'qedit'].includes(o.mode);
  const withTime = ['newrun', 'deploy', 'time', 'resume'].includes(o.mode);
  const fixed = o.mode === 'deploy' ? p.slots[o.k].p : (o.mode === 'time' || o.mode === 'resume') ? r.p : '';
  const initName = o.mode === 'qedit' ? p.slots[o.k].p : '';
  let mins = '';
  if (o.mode === 'time' && r.end) { const left = Math.round((r.end - Date.now()) / M); if (left > 0) mins = left; }
  const h = mins === '' ? '' : Math.floor(mins / 60), m = mins === '' ? '' : mins % 60;
  const title = { newrun: 'Nasadit výrobek', deploy: 'Nasadit na lis', time: 'Změnit čas konce', resume: 'Opět spustit', qadd: 'Přidat do pořadí', qedit: 'Upravit výrobek' }[o.mode];
  const ok = withTime ? (o.mode === 'time' ? 'Uložit čas' : 'Potvrdit – běží') : (o.mode === 'qadd' ? 'Přidat do pořadí' : 'Uložit');
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${title}</h3><button class="x" data-e="close" aria-label="Zavřít">${ic('x')}</button></div>
    <p class="hint" style="margin:0">${esc(p.name)}</p>
    ${withName ? `<span class="flbl">Výrobek</span>
      <input type="text" id="edP" value="${esc(initName)}" placeholder="Hledej v katalogu nebo napiš nový" autocomplete="off" enterkeyhint="done">
      <div class="sug" id="edList"></div>
      <label class="savecat" id="edCatWrap" hidden><input type="checkbox" id="edCat" checked> Uložit nový výrobek do katalogu</label>`
      : `<div class="prodname">${esc(fixed)}</div>`}
    ${withTime ? `<span class="flbl">Skončí za</span>
      <div class="quick">${QUICK.map(([v, t]) => `<button type="button" class="chip" data-e="q" data-v="${v}">${t}</button>`).join('')}</div>
      <div class="hm">
        <label><input type="number" id="edH" inputmode="numeric" min="0" max="999" value="${h}" placeholder="0"> hod</label>
        <label><input type="number" id="edM" inputmode="numeric" min="0" max="59" value="${m}" placeholder="0"> min</label>
      </div>
      <span class="flbl">nebo přesný čas konce</span>
      <input type="datetime-local" id="edAt" value="${o.mode === 'time' && r.end && mins === '' ? toLocal(r.end) : ''}">
      <div class="preview" id="edPrev"></div>` : ''}
    <div class="acts end"><button type="button" class="secondary" data-e="close">Zrušit</button><button type="button" class="primary" data-e="ok">${ok}</button></div>`;
  if (withName) edFilter();
  if (withTime) edPreview();
  $('dlg2').showModal();
}
function edFilter() {
  const q = $('edP').value.trim().toLowerCase();
  const items = S.catalog.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 60);
  const exact = S.catalog.some(c => c.toLowerCase() === q);
  $('edList').innerHTML = items.length
    ? items.map(c => `<button type="button" data-e="pick" data-v="${esc(c)}" class="${c.toLowerCase() === q ? 'sel' : ''}">${esc(c)}</button>`).join('')
    : `<div class="sug-empty">${S.catalog.length ? 'V katalogu nic neodpovídá, bude to nový výrobek.' : 'Katalog je prázdný, napiš název výrobku.'}</div>`;
  $('edList').hidden = exact && items.length === 1;
  $('edCatWrap').hidden = !q || exact;
}
function edEnd() {
  if (!$('edAt')) return null;
  if ($('edAt').value) return fromLocal($('edAt').value);
  const mins = (+$('edH').value || 0) * 60 + (+$('edM').value || 0);
  return mins ? Date.now() + mins * M : null;
}
function edPreview() {
  const end = edEnd();
  $('edPrev').innerHTML = end ? `Konec: <b>${fmtEnd(end)}</b> (${fmtLeft(end)})` : '<span style="color:var(--muted)">Čas konce zatím nezadán, můžeš ho doplnit později.</span>';
}
$('sheet2').addEventListener('input', e => {
  if (!ED) return;
  const id = e.target.id;
  if (id === 'edP') edFilter();
  if ((id === 'edH' || id === 'edM') && $('edAt')) $('edAt').value = '';
  if (id === 'edAt' && e.target.value) { $('edH').value = ''; $('edM').value = ''; }
  if ($('edPrev')) edPreview();
});
$('sheet2').addEventListener('click', e => {
  if (!ED) return;
  const b = e.target.closest('[data-e]'); if (!b) return;
  const k = b.dataset.e;
  if (k === 'close') { ED = null; closeDlg2(); return; }
  if (k === 'pick') { $('edP').value = b.dataset.v; edFilter(); return; }
  if (k === 'q') { const v = +b.dataset.v; $('edH').value = Math.floor(v / 60); $('edM').value = v % 60; $('edAt').value = ''; edPreview(); return; }
  if (k !== 'ok') return;
  const p = press(editId), o = ED, end = edEnd();
  let name = '';
  if ($('edP')) {
    name = $('edP').value.trim();
    if (!name) { toast('Vyber nebo napiš výrobek'); $('edP').focus(); return; }
    if (!$('edCatWrap').hidden && $('edCat').checked) addToCatalog(name);
  }
  ED = null; closeDlg2(); selQ = null;
  const t = end ? ', konec ' + fmtEnd(end) : '';
  switch (o.mode) {
    case 'newrun': makeRunning(p, name, end); return commit('nasazeno ' + name + t);
    case 'deploy': { const it = p.slots[o.k]; p.slots[o.k] = null; compactQueue(p); makeRunning(p, it.p, end); return commit('nasazeno ' + it.p + t); }
    case 'time': p.slots[0].end = end; return commit('čas konce ' + p.slots[0].p + ': ' + (end ? fmtEnd(end) : 'nezadán'));
    case 'resume': Object.assign(p.slots[0], { state: 'run', end, since: Date.now() }); delete p.slots[0].note; return commit('opět spuštěno ' + p.slots[0].p + t);
    case 'qadd': { const q = p.slots.slice(1).filter(Boolean); q.push({ p: name }); p.slots = [p.slots[0], ...q, null, null, null, null].slice(0, 5); return commit('do pořadí: ' + name); }
    case 'qedit': { const old = p.slots[o.k].p; p.slots[o.k].p = name; return commit('upraveno v pořadí: ' + old + ' → ' + name); }
  }
});

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
    selQ = null;
    if (JSON.stringify(p.slots) !== before) commit('změněno pořadí'); else drawSheet();
  };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
})();
$('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').close(); });

/* Ukončit / Zastavit s potvrzením */
const REASONS = { end: ['Zakázka hotová', 'Čeká na zakázku', 'Přestavba nástroje', 'Čeká na materiál'], stop: ['Vada nástroje', 'Porucha lisu', 'Kvalita', 'Čeká na materiál'] };
function openStateDlg(p, state) {
  const r = p.slots[0];
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${state === 'end' ? 'Ukončit výrobu' : 'Zastavit výrobu'}</h3><button class="x" data-f2="close" aria-label="Zavřít">${ic('x')}</button></div>
    <p style="margin:0">${esc(p.name)}: <b>${esc(r.p)}</b></p>
    <span class="flbl">Důvod (nepovinné)</span>
    <div class="quick">${REASONS[state].map(t => `<button type="button" class="chip" data-f2="r" aria-pressed="false">${t}</button>`).join('')}</div>
    <input type="text" id="finR" placeholder="Nebo napiš vlastní důvod">
    <div class="acts end"><button class="secondary" data-f2="close">Zrušit</button><button class="primary" data-f2="ok">${state === 'end' ? 'Ukončit výrobu' : 'Zastavit výrobu'}</button></div>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-f2]'); if (!b) return;
    const k = b.dataset.f2;
    if (k === 'close') return closeDlg2();
    if (k === 'r') { $('finR').value = b.textContent; $('sheet2').querySelectorAll('[data-f2="r"]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    if (k === 'ok') {
      const note = $('finR').value.trim();
      closeDlg2();
      Object.assign(r, { state, since: Date.now(), note });
      commit((state === 'end' ? 'ukončeno ' : 'zastaveno ') + r.p + (note ? ' (' + note + ')' : ''));
    }
  };
}

/* rename press */
function openRename(p) {
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Přejmenovat</h3><button class="x" data-b="close" aria-label="Zavřít">${ic('x')}</button></div>
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
  const rel = t => t ? Math.round(t / M) - t0 : null;
  const l = S.presses.map(p => [p.id, p.name, ...p.slots.map((s, k) => !s ? 0 : k > 0 ? [idx(s.p)] : [idx(s.p), rel(s.end), { run: 0, stop: 1, end: 2 }[s.state] || 0, s.note || '', rel(s.since)]), p.idle ? [rel(p.idle.since), p.idle.last || ''] : 0]);
  const o = { t: t0, w: S.who || '', n: names, l };
  if (withCatalog) o.c = S.catalog;
  return o;
}
const catPack = () => ({ k: S.catalog, w: S.who || '', t: Math.floor(Date.now() / M) });
const catUnpack = o => ({ kind: 'cat', catalog: o.k || [], who: o.w, t: o.t * M });
function unpack(o) {
  const abs = v => v === null || v === undefined ? null : (o.t + v) * M;
  const presses = o.l.map(([id, name, ...rest]) => ({
    id, name,
    ...(rest[5] ? { idle: { since: abs(rest[5][0]), last: rest[5][1] } } : {}),
    slots: rest.slice(0, 5).map((s, k) => !s ? null : k > 0 ? { p: o.n[s[0]] }
      : { p: o.n[s[0]], end: abs(s[1]), state: ['run', 'stop', 'end'][s[2]] || 'run', note: s[3] || '', since: abs(s[4]) })
  }));
  return { kind: 'shift', presses, catalog: o.c || [], who: o.w, t: o.t * M };
}
function decodeText(txt) {
  txt = (txt || '').trim();
  if (txt.startsWith(PREFIX)) {
    const o = JSON.parse(LZString.decompressFromBase64(txt.slice(PREFIX.length)));
    return o.k ? catUnpack(o) : unpack(o);
  }
  const o = JSON.parse(txt);
  if (o.app === 'lisy-hala') return unpack(o.data);
  if (o.app === 'lisy-katalog') return catUnpack(o.data);
  throw new Error('neznámý formát');
}
function closeDlg2() { stopCam(); $('dlg2').close(); }
$('dlg2').addEventListener('close', stopCam);

const CHUNK = 420; // znaků na jeden QR kód – menší kód se lépe skenuje
function qrParts(kind) {
  const data = LZString.compressToBase64(JSON.stringify(kind === 'cat' ? catPack() : packState(false)));
  const id = Math.random().toString(36).slice(2, 6), n = Math.ceil(data.length / CHUNK), parts = [];
  for (let k = 0; k < n; k++) parts.push(`${PREFIX}${id}:${k + 1}/${n}:${data.slice(k * CHUNK, (k + 1) * CHUNK)}`);
  return parts;
}
let qrTimer = null;
function openGive(kind) {
  kind = kind === 'cat' ? 'cat' : 'shift';
  if (kind === 'shift' && !S.who) { $('who').focus(); toast('Nejdřív napiš své jméno'); return; }
  if (kind === 'cat' && !S.catalog.length) { toast('Katalog je prázdný'); return; }
  const svgs = qrParts(kind).map(t => { const q = qrcode(0, 'M'); q.addData(t); q.make(); return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); });
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${kind === 'cat' ? 'Sdílet katalog' : 'Předat směnu'}</h3><button class="x" data-b="close" aria-label="Zavřít">${ic('x')}</button></div>
    <p class="hint" style="margin:0">${kind === 'cat' ? `Katalog má ${S.catalog.length} výrobků. Kolega v aplikaci dá <b>Katalog → Načíst katalog</b>` : 'Nástupce v aplikaci dá <b>Předání → Načíst od předchozí směny</b>'} a namíří telefon na kód.${svgs.length > 1 ? ' Kódy se samy střídají, drž telefon namířený, dokud nenačte všechny.' : ''} Jas displeje dej na maximum.</p>
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
    if (b.dataset.b === 'file') shareFile(kind);
  };
}
async function shareFile(kind) {
  const d = new Date(), name = `${kind === 'cat' ? 'katalog' : 'predani'}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const body = JSON.stringify(kind === 'cat' ? { app: 'lisy-katalog', v: 1, data: catPack() } : { app: 'lisy-hala', v: 1, data: packState(true) });
  const file = new File([body], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: kind === 'cat' ? 'Katalog výrobků' : 'Předání směny' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove();
  toast('Soubor uložen do Stažených');
}

let camStream = null, camTimer = null;
function stopCam() { if (qrTimer) clearInterval(qrTimer); qrTimer = null; if (camTimer) clearInterval(camTimer); camTimer = null; if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; }
function openTake(kind) {
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${kind === 'cat' ? 'Načíst katalog' : 'Načíst směnu'}</h3><button class="x" data-b="close" aria-label="Zavřít">${ic('x')}</button></div>
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
  if (!$('dlg2').open || !$('takeMsg')) openTake();
  previewImport(await f.text());
});
let pending = null;
function previewImport(txt) {
  try { pending = decodeText(txt); } catch (e) { $('takeMsg').innerHTML = '<p class="hint">Tohle není předání ani katalog z aplikace Lisy.</p>'; return; }
  if (pending.kind === 'cat') {
    const nw = pending.catalog.filter(c => !S.catalog.includes(c)).length;
    $('takeMsg').innerHTML = `<div class="preview">Katalog od: <b>${esc(pending.who || '?')}</b>, ${fmtEnd(pending.t)}<br>
      Výrobků: <b>${pending.catalog.length}</b>, z toho nových pro tebe: <b>${nw}</b></div>
      <p class="hint">Nové výrobky se přidají k tvému katalogu. Nic se nesmaže.</p>
      ${nw ? '<button class="primary" data-b="apply">Přidat do katalogu</button>' : '<p class="hint">Všechny výrobky už v katalogu máš.</p>'}`;
    return;
  }
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
  if (pending.kind === 'cat') {
    const before = S.catalog.length; pending.catalog.forEach(addToCatalog);
    const n = S.catalog.length - before;
    pending = null; save(); renderAll(); closeDlg2(); toast('Přidáno ' + n + ' výrobků do katalogu'); return;
  }
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
  if (f && f.classList.contains('stat')) {
    filter = f.dataset.f; document.querySelectorAll('.stat').forEach(x => x.setAttribute('aria-pressed', x === f)); renderGrid();
    if ($('v-hala').hidden) document.querySelector('nav [data-v="hala"]').click();
    return;
  }
  const v = e.target.closest('nav [data-v]');
  if (v) {
    document.querySelectorAll('nav [data-v]').forEach(x => x === v ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
    ['hala', 'predani', 'katalog'].forEach(n => $('v-' + n).hidden = n !== v.dataset.v);
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
$('btnGive').addEventListener('click', () => openGive('shift'));
$('btnTake').addEventListener('click', () => openTake('shift'));
$('btnCatGive').addEventListener('click', () => openGive('cat'));
$('btnCatTake').addEventListener('click', () => openTake('cat'));

document.querySelectorAll('[data-ic]').forEach(el => el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic)));
renderAll();
setInterval(() => { if (!$('dlg').open && !$('dlg2').open) { renderHeader(); renderGrid(); renderHandover(); } }, 30000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
