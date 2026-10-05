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
function fmtSince(t) {
  const m = Math.max(0, Math.floor((Date.now() - t) / M)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
  return 'stojí ' + (d ? d + ' d ' + h + ' h' : h ? h + ' h ' + mm + ' min' : mm + ' min');
}
function idleText(p) { // popis stojícího lisu
  const i = p.idle;
  if (!i) return { title: 'Bez výrobku', sub: '' };
  return { title: 'Ukončeno, čeká', sub: [i.reason, i.since ? fmtSince(i.since) : ''].filter(Boolean).join(' · ') };
}
const IDLE_REASONS = ['Čeká na zakázku', 'Oprava nástroje', 'Přestavba nástroje', 'Oprava lisu', 'Čeká na materiál'];

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
    if (!r) { const it = idleText(p); info = (it.sub ? `<span class="end">${esc(it.sub)}</span>` : '') + `<span class="left">${p.idle ? 'Ukončeno' : 'Stojí'}</span>`; }
    else if (r.stopped) info = `<span class="end">${esc(r.note || '')}</span><span class="left">Zastaveno</span>`;
    else if (!r.end) info = `<span class="left">Konec nezadán</span>`;
    else info = `<span class="end mono">${fmtEnd(r.end)}</span><span class="left">${fmtLeft(r.end)}</span>`;
    return `<button class="tile ${r ? '' : 'empty'}" style="--st:${st.c}" data-open="${p.id}">
      <span class="no">${esc(p.name)}</span>
      <span class="prod">${r ? esc(r.p) : esc(p.idle && p.idle.last ? 'po: ' + p.idle.last : idleText(p).title)}</span>${info}
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
    const badge = !r ? (p.idle ? 'ukončeno' : 'stojí') : r.stopped ? 'zastaveno' : !r.end ? 'konec ?' : r.end < now ? 'po termínu' : 'konec ' + fmtEnd(r.end).replace('dnes ', '');
    return `<button class="row" style="--st:${st.c}" data-open="${p.id}">
      <span class="no">${esc(p.name)}</span>
      <span>${r ? esc(r.p) : `<span style="color:var(--muted)">${esc(idleText(p).sub || '—')}</span>`}</span>
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
let editId = null, moveIdx = null, confirmDel = null;
function openSheet(id) { editId = id; moveIdx = null; confirmDel = null; drawSheet(); $('dlg').showModal(); }
function fmtDur(ms) { const m = Math.round(ms / M), h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r || !h ? r + ' min' : ''); }
function slotInfo(s, i) {
  if (i > 0) return '';
  if (s.stopped) return s.end ? 'plánovaný konec ' + fmtEnd(s.end) : 'konec nezadán';
  return s.end ? 'konec ' + fmtEnd(s.end) + ' · ' + fmtLeft(s.end) : 'konec nezadán';
}
function slotHtml(p, s, i) {
  const run = i === 0, stopped = run && s && s.stopped, locked = run && s && !s.stopped;
  let acts = '';
  if (locked) acts += `${p.slots[1] ? `<button class="sm go" data-a="done">Hotovo, nasadit ${esc(p.slots[1].p)}</button>` : ''}<button class="sm end" data-a="finish">Ukončit</button><button class="sm stop" data-a="stop">Zastavit</button><button class="sm" data-a="edit" data-i="0">Změnit čas</button>`;
  if (stopped) acts += `<button class="sm go" data-a="resume">Spustit znovu</button><button class="sm end" data-a="finish">Ukončit</button>`;
  if (s && !locked) acts += `<button class="sm" data-a="edit" data-i="${i}">Upravit</button><button class="sm" data-a="mv" data-i="${i}">Na jiný lis</button><button class="sm del" data-a="del" data-i="${i}">${confirmDel === i ? 'Opravdu smazat?' : 'Smazat'}</button>`;
  if (s && !S.catalog.includes(s.p)) acts += `<button class="sm cat" data-a="cat" data-i="${i}">Uložit do katalogu</button>`;
  return `<div class="slot ${run ? 'run' : 'q'} ${stopped ? 'stopped' : ''}" data-i="${i}">
    <div class="slot-top">
      ${!run ? '<span class="grip" aria-label="Přetáhnout">⠿</span>' : ''}
      <span class="lbl">${SLOT_NAMES[i]}${stopped ? ' · <span class="stopflag">zastaveno</span>' : ''}</span>
      ${!run ? `${i > 1 ? `<button class="sm" data-a="up" data-i="${i}" aria-label="Výš">↑</button>` : ''}${i < 4 && p.slots[i + 1] ? `<button class="sm" data-a="down" data-i="${i}" aria-label="Níž">↓</button>` : ''}` : ''}
    </div>
    <div class="prodname">${esc(s.p)}</div>
    ${run ? `<div class="slotinfo">${slotInfo(s, i)}</div>` : ''}
    ${stopped ? `<input type="text" data-f="note" data-i="0" value="${esc(s.note || '')}" placeholder="Důvod zastavení (nepovinné)" aria-label="Důvod zastavení">` : ''}
    <div class="acts">${acts}</div>
    ${moveIdx === i ? movePanel() : ''}
  </div>`;
}
function emptyRunHtml(p) {
  const it = idleText(p);
  return `<div class="slot run empty"><div class="slot-top"><span class="lbl">Stav lisu</span></div>
    <div class="prodname">${p.idle ? 'Výroba ukončena, čeká na nasazení' : 'Lis stojí'}</div>
    ${p.idle ? `<div class="slotinfo">${p.idle.last ? 'Naposledy: ' + esc(p.idle.last) + ' · ' : ''}${esc(it.sub)}${p.idle.since ? ' (od ' + fmtEnd(p.idle.since) + ')' : ''}</div>` : ''}
    <div class="acts">${p.slots[1] ? `<button class="sm go" data-a="start-next">Nasadit ${esc(p.slots[1].p)}</button>` : ''}
    <button class="sm add" data-a="add" data-i="0">+ Nasadit jiný výrobek</button>
    ${p.idle ? '<button class="sm" data-a="reason">Změnit důvod</button>' : ''}</div></div>`;
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
  const p = press(editId);
  const sc = $('dlg').scrollTop;
  $('sheet').innerHTML = `<div class="sh-head"><h3>${esc(p.name)}</h3>
      <div><button class="sm" data-a="rename">Přejmenovat</button><button class="x" data-a="close" aria-label="Zavřít">×</button></div></div>
    <p class="hint" style="margin:0">Pořadí změníš přetažením za ⠿ nebo šipkami. Běžící výrobek jde přesunout nebo smazat až po zastavení. Čas konce se zadává při nasazení.</p>
    ${p.slots[0] ? slotHtml(p, p.slots[0], 0) : emptyRunHtml(p)}
    ${p.slots.slice(1).map((s, k) => s ? slotHtml(p, s, k + 1) : '').join('')}
    ${p.slots.slice(1).some(x => !x) ? '<button class="addq" data-a="add" data-i="q">+ Přidat výrobek do pořadí</button>' : '<p class="hint" style="margin:0">Pořadí je plné (4 výrobky).</p>'}`;
  if (moveIdx !== null) { const first = $('mvLis').querySelector('option:not([disabled])'); if (first) $('mvLis').value = first.value; fillPosOptions(); }
  $('dlg').scrollTop = sc;
}
function setRunning(p, x) { // výrobek se stává běžícím
  if (x) { x.stopped = false; delete x.note; delete x.dur; x.end = null; }
  delete p.idle;
}
function goIdle(p, last, reason) { p.idle = { since: Date.now(), last: last || '', reason: reason || '' }; }
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
      setRunning(p, p.slots[0]);
      commit('dokončeno ' + old.p + ', nasazeno ' + p.slots[0].p);
      return openEditor(0);
    }
    case 'start-next': {
      p.slots[0] = p.slots[1]; p.slots[1] = null; compactQueue(p); setRunning(p, p.slots[0]);
      commit('nasazeno ' + p.slots[0].p);
      return openEditor(0);
    }
    case 'stop': p.slots[0].stopped = true; return commit('zastaveno ' + p.slots[0].p);
    case 'resume': p.slots[0].stopped = false; delete p.slots[0].note; return commit('znovu spuštěno ' + p.slots[0].p);
    case 'del':
      if (confirmDel !== i) { confirmDel = i; drawSheet(); return; }
      confirmDel = null; p.slots[i] = null; if (i > 0) compactQueue(p); else goIdle(p, s.p, '');
      return commit('smazáno ' + s.p + ' (' + SLOT_NAMES[i] + ')');
    case 'up': [p.slots[i - 1], p.slots[i]] = [p.slots[i], p.slots[i - 1]]; compactQueue(p); return commit();
    case 'down': [p.slots[i + 1], p.slots[i]] = [p.slots[i], p.slots[i + 1]]; compactQueue(p); return commit();
    case 'cat': addToCatalog(s.p); save(); toast('Uloženo do katalogu'); renderCatalog(); drawSheet(); return;
    case 'mv': moveIdx = moveIdx === i ? null : i; drawSheet(); return;
    case 'mvx': moveIdx = null; drawSheet(); return;
    case 'mvgo': return doMove();
    case 'add': return openEditor(b.dataset.i === 'q' ? p.slots.findIndex((x, k) => k > 0 && !x) : 0);
    case 'edit': return openEditor(i);
    case 'finish': return openFinish(p);
    case 'reason': return openFinish(p, true);
  }
});
/* ===== Editor výrobku (s potvrzením) ===== */
let edIdx = null;
const QUICK = [[30, '30 min'], [60, '1 h'], [120, '2 h'], [180, '3 h'], [240, '4 h'], [360, '6 h'], [480, '8 h'], [720, '12 h']];
function openEditor(i) {
  const p = press(editId), s = p.slots[i], run = i === 0, lockedName = run && s && !s.stopped;
  edIdx = i;
  let mins = '', at = '';
  if (s) {
    if (run && s.end) { const left = Math.round((s.end - Date.now()) / M); if (left > 0) mins = left; else at = toLocal(s.end); }
  }
  const h = mins === '' ? '' : Math.floor(mins / 60), m = mins === '' ? '' : mins % 60;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${esc(p.name)} · ${lockedName ? 'kdy skončí?' : SLOT_NAMES[i]}</h3><button class="x" data-e="close" aria-label="Zavřít">×</button></div>
    <label class="flbl" for="edP">Výrobek</label>
    ${lockedName ? `<div class="ro">${esc(s.p)}</div><input type="hidden" id="edP" value="${esc(s.p)}">`
      : `<input type="text" id="edP" value="${s ? esc(s.p) : ''}" placeholder="Hledej v katalogu nebo napiš nový" autocomplete="off" enterkeyhint="done">
         <div class="sug" id="edList"></div>
         <label class="savecat" id="edCatWrap" hidden><input type="checkbox" id="edCat" checked> Uložit nový výrobek do katalogu</label>`}
    ${run ? `<span class="flbl">Skončí za</span>
    <div class="quick">${QUICK.map(([v, t]) => `<button type="button" class="chip" data-e="q" data-v="${v}">${t}</button>`).join('')}</div>
    <div class="hm">
      <label><input type="number" id="edH" inputmode="numeric" min="0" max="999" value="${h}" placeholder="0"> hod</label>
      <label><input type="number" id="edM" inputmode="numeric" min="0" max="59" value="${m}" placeholder="0"> min</label>
    </div>
    <label class="flbl" for="edAt">nebo přesný čas konce</label>
    <input type="datetime-local" id="edAt" value="${at}">
    <div class="preview" id="edPrev"></div>` : '<p class="hint" style="margin:0">Čas konce zadáš až při nasazení výrobku.</p>'}
    <div class="acts end"><button type="button" class="secondary" data-e="close">Zrušit</button><button type="button" class="primary" data-e="ok">Potvrdit</button></div>`;
  if (!lockedName) edFilter();
  if (run) edPreview();
  $('dlg2').showModal();
  if (!lockedName && !s) setTimeout(() => $('edP').focus(), 50);
}
function edFilter() {
  const q = $('edP').value.trim().toLowerCase();
  const items = S.catalog.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 50);
  const exact = S.catalog.some(c => c.toLowerCase() === q);
  $('edList').innerHTML = items.length
    ? items.map(c => `<button type="button" data-e="pick" data-v="${esc(c)}" class="${c.toLowerCase() === q ? 'sel' : ''}">${esc(c)}</button>`).join('')
    : `<div class="sug-empty">${S.catalog.length ? 'V katalogu nic neodpovídá, bude to nový výrobek.' : 'Katalog je prázdný, napiš název výrobku.'}</div>`;
  $('edList').hidden = exact && items.length === 1;
  $('edCatWrap').hidden = !q || exact;
}
function edEnd() {
  if (edIdx !== 0) return { end: null };
  const at = $('edAt').value;
  if (at) return { end: fromLocal(at) };
  const mins = (+$('edH').value || 0) * 60 + (+$('edM').value || 0);
  return { end: mins ? Date.now() + mins * M : null };
}
function edPreview() {
  const { end } = edEnd();
  $('edPrev').innerHTML = end ? `Konec: <b>${fmtEnd(end)}</b> (${fmtLeft(end)})` : '<span style="color:var(--muted)">Čas konce není zadaný.</span>';
}
$('sheet2').addEventListener('input', e => {
  if (!edIdx && edIdx !== 0) return;
  if (e.target.id === 'edP') edFilter();
  if (e.target.id === 'edH' || e.target.id === 'edM') { if ($('edAt')) $('edAt').value = ''; }
  if (e.target.id === 'edAt' && e.target.value) { $('edH').value = ''; $('edM').value = ''; }
  if (!$('edPrev')) return;
  if ($('edPrev')) edPreview();
});
$('sheet2').addEventListener('click', e => {
  const b = e.target.closest('[data-e]'); if (!b) return;
  const k = b.dataset.e;
  if (k === 'close') { edIdx = null; closeDlg2(); return; }
  if (k === 'pick') { $('edP').value = b.dataset.v; edFilter(); return; }
  if (k === 'q') { const v = +b.dataset.v; $('edH').value = Math.floor(v / 60); $('edM').value = v % 60; $('edAt').value = ''; edPreview(); return; }
  if (k === 'ok') {
    const v = $('edP').value.trim();
    if (!v) { toast('Vyber nebo napiš výrobek'); $('edP').focus(); return; }
    const p = press(editId), i = edIdx, old = p.slots[i], { end } = edEnd();
    if ($('edCat') && !$('edCatWrap').hidden && $('edCat').checked) addToCatalog(v);
    const x = old ? old : {};
    const wasNew = !old;
    x.p = v; x.end = end; delete x.dur;
    if (i === 0 && wasNew) setRunning(p, x), x.end = end;
    p.slots[i] = x;
    edIdx = null; closeDlg2();
    commit((wasNew ? 'zadáno ' : 'upraveno ') + v + ' (' + SLOT_NAMES[i] + ')' + (x.end ? ', konec ' + fmtEnd(x.end) : ''));
    toast(wasNew ? v + ' zadáno na ' + p.name : 'Uloženo');
  }
});
$('sheet').addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'mvLis') return fillPosOptions();
  const f = el.dataset.f; if (!f) return;
  const i = +el.dataset.i, p = press(editId);
  if (f === 'note' && p.slots[0]) {
    p.slots[0].note = el.value.trim(); save(); renderGrid();
  }
});
function doMove() {
  const src = press(editId), item = src.slots[moveIdx];
  const t = press(+$('mvLis').value), pv = $('mvPos').value;
  if (!item || !t || !pv) return;
  if (moveIdx === 0 && !item.stopped) { toast('Běžící výrobek nejdřív zastav'); return; }
  const moved = { p: item.p, end: null };
  let pos;
  if (pv === '0') { if (t.slots[0]) return toast(t.name + ' už má běžící výrobek'); setRunning(t, moved); t.slots[0] = moved; pos = 0; }
  else {
    const q = t.slots.slice(1).filter(Boolean);
    if (q.length >= 4) return toast(t.name + ' má plné pořadí');
    pos = pv === 'end' ? q.length + 1 : Math.min(+pv, q.length + 1);
    q.splice(pos - 1, 0, moved);
    t.slots = [t.slots[0], ...q, null, null, null, null].slice(0, 5);
  }
  src.slots[moveIdx] = null; if (moveIdx > 0) compactQueue(src); else goIdle(src, moved.p, 'Přesunuto na ' + t.name);
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

/* ukončení výroby */
function openFinish(p, reasonOnly) {
  const r = p.slots[0], cur = (p.idle && p.idle.reason) || '';
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${reasonOnly ? 'Důvod stání' : 'Ukončit výrobu'}</h3><button class="x" data-f2="close" aria-label="Zavřít">×</button></div>
    ${reasonOnly ? '' : `<p style="margin:0">${esc(p.name)}: <b>${esc(r.p)}</b>. Lis bude stát a čekat na nasazení dalšího výrobku.</p>`}
    <span class="flbl">Proč lis stojí (nepovinné)</span>
    <div class="quick">${IDLE_REASONS.map(t => `<button type="button" class="chip" data-f2="r" aria-pressed="${t === cur}">${t}</button>`).join('')}</div>
    <input type="text" id="finR" value="${esc(cur)}" placeholder="Nebo napiš vlastní důvod">
    <div class="acts end"><button class="secondary" data-f2="close">Zrušit</button><button class="primary" data-f2="ok">${reasonOnly ? 'Uložit' : 'Ukončit výrobu'}</button></div>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-f2]'); if (!b) return;
    const k = b.dataset.f2;
    if (k === 'close') return closeDlg2();
    if (k === 'r') { $('finR').value = b.textContent; $('sheet2').querySelectorAll('[data-f2="r"]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    if (k === 'ok') {
      const reason = $('finR').value.trim();
      closeDlg2();
      if (reasonOnly) { p.idle.reason = reason; return commit('důvod stání: ' + (reason || '—')); }
      p.slots[0] = null; goIdle(p, r.p, reason);
      commit('ukončeno ' + r.p + (reason ? ' (' + reason + ')' : ''));
      toast(p.name + ': výroba ukončena');
    }
  };
}
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
  const l = S.presses.map(p => [p.id, p.name, ...p.slots.map(s => s ? [idx(s.p), s.end ? Math.round(s.end / M) - t0 : null, s.stopped ? 1 : 0, s.note || ''] : 0), p.idle ? [Math.round(p.idle.since / M) - t0, p.idle.last, p.idle.reason] : 0]);
  const o = { t: t0, w: S.who || '', n: names, l };
  if (withCatalog) o.c = S.catalog;
  return o;
}
const catPack = () => ({ k: S.catalog, w: S.who || '', t: Math.floor(Date.now() / M) });
const catUnpack = o => ({ kind: 'cat', catalog: o.k || [], who: o.w, t: o.t * M });
function unpack(o) {
  const presses = o.l.map(([id, name, ...rest]) => ({
    id, name,
    ...(rest[5] ? { idle: { since: (o.t + rest[5][0]) * M, last: rest[5][1], reason: rest[5][2] } } : {}),
    slots: rest.slice(0, 5).map(s => s ? Object.assign({ p: o.n[s[0]], end: s[1] === null ? null : (o.t + s[1]) * M }, s[2] ? { stopped: true } : {}, s[3] ? { note: s[3] } : {}) : null)
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
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${kind === 'cat' ? 'Sdílet katalog' : 'Předat směnu'}</h3><button class="x" data-b="close" aria-label="Zavřít">×</button></div>
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
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${kind === 'cat' ? 'Načíst katalog' : 'Načíst směnu'}</h3><button class="x" data-b="close" aria-label="Zavřít">×</button></div>
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
$('btnGive').addEventListener('click', () => openGive('shift'));
$('btnTake').addEventListener('click', () => openTake('shift'));
$('btnCatGive').addEventListener('click', () => openGive('cat'));
$('btnCatTake').addEventListener('click', () => openTake('cat'));

renderAll();
setInterval(() => { if (!$('dlg').open && !$('dlg2').open) { renderHeader(); renderGrid(); renderHandover(); } }, 30000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
