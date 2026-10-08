'use strict';
/* ============ Data ============ */
const KEY = 'lisy-hala-v1';
const VERSION = '21';
const H = 3600e3, M = 60e3;
const PRESS_COUNT = 20;
const SLOT_NAMES = ['Běží', 'Další 1', 'Další 2', 'Další 3', 'Další 4'];

function emptyState() {
  const presses = [];
  for (let i = 1; i <= PRESS_COUNT; i++) presses.push({ id: i, name: 'Lis ' + String(i).padStart(2, '0'), slots: [null, null, null, null, null] });
  return { v: 1, presses, catalog: [], log: [], notes: [], plan: [], fb: [], staff: {}, ops: { list: ['Nykodýmová', 'Sejkorová', 'Petříková', 'Hrachovcová', 'Zunová', 'Voslařová', 'Zrůstová', 'Tichá'], u: 0 }, who: '', updated: 0, from: null };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !Array.isArray(S.presses)) S = emptyState();
if (!Array.isArray(S.notes)) S.notes = [];
if (!Array.isArray(S.plan)) S.plan = [];
if (!Array.isArray(S.fb)) S.fb = [];
if (!S.staff || typeof S.staff !== 'object') S.staff = {};
if (!S.ops || !Array.isArray(S.ops.list)) S.ops = { list: ['Nykodýmová', 'Sejkorová', 'Petříková', 'Hrachovcová', 'Zunová', 'Voslařová', 'Zrůstová', 'Tichá'], u: 0 };
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
  if (r.state === 'prep') return { c: 'var(--prep)', t: 'Připraveno' };
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
  note: '<path d="M5 4h14v11l-5 5H5zM14 20v-5h5M8 9h8M8 13h4"/>',
  back: '<path d="M15 6l-6 6 6 6"/>', del: '<path d="M21 5H9l-6 7 6 7h12zM12 9l6 6M18 9l-6 6"/>', logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>', plan: '<path d="M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12l2 2 4-4M8 17h8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>', chev: '<path d="M9 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'
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
  $('ver').textContent = (S.who ? S.who + ' · ' : '') + 'verze ' + VERSION;
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
  const nPrep = S.presses.filter(p => p.slots[0] && p.slots[0].state === 'prep').length;
  $('cPrep').textContent = nPrep ? nPrep + ' přip.' : ''; $('cPrep').hidden = !nPrep;
  const FH = { run: 'Lisy, na kterých právě běží výroba.', shift: 'Lisy, kterým výroba skončí do konce této směny (do ' + pad(new Date(se).getHours()) + ':00).', idle: 'Lisy, které nevyrábí: prázdné, připravené, zastavené nebo s ukončenou výrobou.' };
  $('fhint').hidden = filter === 'all';
  if (filter !== 'all') $('fhint').innerHTML = `<span>${FH[filter]}</span><button data-f="all" class="stat-reset">Zobrazit vše</button>`;
  $('grid').innerHTML = list.map(p => {
    const st = status(p), r = p.slots[0], q = p.slots.slice(1).filter(Boolean);
    let body;
    if (!r) body = `<div class="prod">Prázdný</div><div class="t-meta"><span>čeká na nástroj</span>${p.idle ? `<b>${fmtSince(p.idle.since).replace('stojí ', '')}</b>` : ''}</div>`;
    else if (r.state === 'prep') body = `<div class="prod">${esc(r.p)}</div><div class="t-meta"><span>${r.runAt ? 'rozjet ' + shLabel(r.runAt.date, r.runAt.shift).replace(/^(Dnes|Zítra|Včera), /, (m, a) => a.toLowerCase() + ' ').replace(/ \d+\. \d+\./, '') : 'nerozjíždět'}</span></div>`;
    else if (r.state !== 'run') body = `<div class="prod">${esc(r.p)}</div><div class="t-meta"><span>${esc(r.note || 'stojí')}</span><b>${fmtSince(r.since || Date.now()).replace('stojí ', '')}</b></div>`;
    else if (!r.end) body = `<div class="prod">${esc(r.p)}</div><div class="t-meta"><span>konec nezadán</span></div>`;
    else {
      const pct = r.since && r.end > r.since ? Math.min(100, Math.max(2, (Date.now() - r.since) / (r.end - r.since) * 100)) : null;
      const left = r.end - Date.now(), a = Math.abs(left), hh = Math.floor(a / H), mm = Math.floor(a % H / M);
      body = `<div class="prod">${esc(r.p)}</div>${pct !== null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
        <div class="t-meta"><span class="mono">${fmtEnd(r.end).replace('dnes ', '')}</span><b class="mono">${left < 0 ? '+' : ''}${hh ? hh + ' h ' : ''}${mm} min</b></div>`;
    }
    return `<button class="tile ${r ? '' : 'empty'}" style="--st:${st.c}" data-open="${p.id}">
      <div class="t-top"><span class="no">${esc(p.name)}</span><span class="right">${openNotes(p.id).length ? `<span class="tnote" title="Poznámky">${ic('note')}${openNotes(p.id).length}</span>` : ''}<span class="pill">${st.t}</span></span></div>
      ${body}
      ${(() => { const pn = planNow(p.id), fin = finishFor(p.id), list = fin && !pn.includes(fin) ? [fin, ...pn] : pn.sort((a, b) => (b.type === 'finish') - (a.type === 'finish'));
        return list.length ? `<div class="tplan ${list[0].type === 'finish' ? 'fin' : ''}">${ic(list[0].type === 'finish' ? 'done' : 'plan')}<span>${list[0].type === 'finish' ? 'Ukončit ' + finishLabel(list[0]) : esc(planText(list[0]))}${list.length > 1 ? ' +' + (list.length - 1) : ''}</span></div>` : ''; })()}
      ${(() => { const o = opNow(p.id); return o ? `<div class="top">${ic('user')}<span>${o.cur ? esc(rowName(o.cur, staffRec(shiftKey().date, shiftKey().shift).rows.indexOf(o.cur))) : '—'}${o.next ? ' → ' + esc(rowName(o.next.row, staffRec(shiftKey().date, shiftKey().shift).rows.indexOf(o.next.row))) + (o.next.at ? ' ' + hhmm(o.next.at) : '') : ''}</span></div>` : ''; })()}
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
    const badge = !r ? 'prázdný' : r.state === 'prep' ? 'připraveno' : r.state === 'stop' ? 'zastaveno' : r.state === 'end' ? 'ukončeno' : !r.end ? 'konec ?' : r.end < now ? 'po termínu' : 'konec ' + fmtEnd(r.end).replace('dnes ', '');
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
  $('whoName').textContent = S.who || '—'; setAv($('whoAv'), S.who);
}
function renderCatalog() {
  $('catCount').textContent = S.catalog.length ? S.catalog.length + ' výrobků' : '';
  const q = ($('catSearch').value || '').toLowerCase();
  $('catalog').innerHTML = S.catalog.map((c, i) => ({ c, i })).filter(x => !q || x.c.toLowerCase().includes(q))
    .map(x => `<div class="row simple"><span>${esc(x.c)}</span><button class="sm del" data-catdel="${x.i}">Odebrat</button></div>`).join('')
    || '<p class="hint">Katalog je prázdný. Výrobky přidáš tady nebo při zadávání k lisu.</p>';
  $('products').innerHTML = S.catalog.map(c => `<option value="${esc(c)}">`).join('');
}
/* ============ Poznámky ============ */
let PIDN = 0;
const pid = () => Date.now().toString(36) + (PIDN++ % 1296).toString(36) + Math.random().toString(36).slice(2, 7);
const openNotes = id => S.notes.filter(n => !n.done && (id === undefined || n.lis === id));
const noteTag = n => n.lis ? esc((press(n.lis) || {}).name || 'Lis ' + n.lis) : 'Obecné';
function noteHtml(n) {
  return `<div class="note ${n.done ? 'done' : ''}">
    ${chk(n.done, `data-note="${n.done ? 'reopen' : 'done'}" data-id="${n.id}"`, n.done ? 'Vrátit mezi otevřené' : 'Označit jako vyřešené')}
    <div class="nbody">
      <div class="nhead"><span class="ntag">${noteTag(n)}</span><span class="nmeta">${esc(n.who || '?')} · ${fmtEnd(n.t)}</span></div>
      <div class="ntext">${esc(n.text)}</div>
      ${n.done ? `<div class="nmeta nok">${ic('done')}vyřešil ${esc(n.doneBy || '?')} · ${fmtEnd(n.doneT)}</div>
        <div class="acts"><button class="sm del" data-note="del" data-id="${n.id}">${ic('trash')}Smazat</button></div>` : ''}
    </div>
  </div>`;
}
function renderNotes() {
  const sel = $('noteLis'), cur = sel.value;
  sel.innerHTML = '<option value="0">Obecná poznámka (celá hala)</option>' + S.presses.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (cur) sel.value = cur;
  const open = S.notes.filter(n => !n.done).sort((a, b) => b.t - a.t), done = S.notes.filter(n => n.done).sort((a, b) => b.doneT - a.doneT).slice(0, 30);
  $('notesOpen').innerHTML = open.map(noteHtml).join('') || '<p class="hint">Žádné otevřené poznámky.</p>';
  $('notesDone').innerHTML = done.map(noteHtml).join('') || '<p class="hint">Zatím nic.</p>';
  $('noteCount').textContent = open.length || '';
  $('navNotes').textContent = open.length; $('navNotes').hidden = !open.length;
}
function addNote(lis, text) {
  S.notes.push({ id: pid(), lis: +lis || 0, text, who: S.who || '', t: Date.now(), done: false });
  log(+lis || 0, 'poznámka: ' + text.slice(0, 40));
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-note]'); if (!b) return;
  const n = S.notes.find(x => x.id === b.dataset.id); if (!n) return;
  const k = b.dataset.note;
  if (k === 'done') { n.done = true; n.doneBy = S.who || ''; n.doneT = Date.now(); log(n.lis, 'vyřešeno: ' + n.text.slice(0, 40)); save(); renderAll(); toast('Poznámka vyřešena', () => { n.done = false; save(); renderAll(); }); return; }
  if (k === 'reopen') { n.done = false; }
  if (k === 'del') { if (!b.dataset.sure) { b.dataset.sure = 1; b.lastChild.textContent = 'Opravdu?'; return; } S.notes = S.notes.filter(x => x !== n); }
  save(); renderAll();
});
$('noteForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('noteText').value.trim(); if (!t) { toast('Napiš text poznámky'); return; }
  addNote($('noteLis').value, t); $('noteText').value = ''; save(); renderAll(); toast('Poznámka přidána');
});
function openNoteDlg(p) {
  $('sheet2').onclick = null;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Poznámka · ${esc(p.name)}</h3><button class="x" data-n2="close" aria-label="Zavřít">${ic('x')}</button></div>
    <textarea id="n2Text" rows="4" placeholder="Např. dochází materiál, neuklizené hadice…"></textarea>
    <div class="acts end"><button class="secondary" data-n2="close">Zrušit</button><button class="primary" data-n2="ok">Přidat poznámku</button></div>`;
  $('dlg2').showModal(); setTimeout(() => $('n2Text').focus(), 50);
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-n2]'); if (!b) return;
    if (b.dataset.n2 === 'ok') { const t = $('n2Text').value.trim(); if (!t) { toast('Napiš text poznámky'); return; } addNote(p.id, t); save(); }
    closeDlg2(); renderAll();
  };
}

function renderAll() { if (typeof fbBadge === 'function' && USERS) try { fbBadge(); } catch (e) {} renderHeader(); renderGrid(); renderHandover(); renderCatalog(); renderNotes(); renderPlan(); if ($('dlg').open) drawSheet(); }

/* ============ Plán směn ============ */
const SH = { R: 'Ranní', O: 'Odpolední', N: 'Noční' }, SH_ORDER = ['R', 'O', 'N'], SH_START = { R: 6, O: 14, N: 22 };
const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dparse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = dparse(s); d.setDate(d.getDate() + n); return dstr(d); };
function shiftKey(ts = Date.now()) {
  const d = new Date(ts), h = d.getHours();
  if (h < 6) { d.setDate(d.getDate() - 1); return { date: dstr(d), shift: 'N' }; }
  return { date: dstr(d), shift: h < 14 ? 'R' : h < 22 ? 'O' : 'N' };
}
const skNum = (date, shift) => Number(date.replace(/-/g, '')) * 3 + SH_ORDER.indexOf(shift);
const curNum = () => { const c = shiftKey(); return skNum(c.date, c.shift); };
function nextShift(k, n = 1) { let i = SH_ORDER.indexOf(k.shift) + n, date = k.date; while (i > 2) { i -= 3; date = addDays(date, 1); } while (i < 0) { i += 3; date = addDays(date, -1); } return { date, shift: SH_ORDER[i] }; }
function dayLabel(date) {
  const today = shiftKey().date, d = dparse(date), lbl = DOW[d.getDay()] + ' ' + d.getDate() + '. ' + (d.getMonth() + 1) + '.';
  if (date === today) return 'Dnes, ' + lbl; if (date === addDays(today, 1)) return 'Zítra, ' + lbl; if (date === addDays(today, -1)) return 'Včera, ' + lbl;
  return lbl.charAt(0).toUpperCase() + lbl.slice(1);
}
const shLabel = (date, shift) => dayLabel(date) + ' · ' + SH[shift].toLowerCase();
function taskTs(it) {
  if (!it.time) return null;
  const [h, m] = it.time.split(':').map(Number), d = dparse(it.date);
  if (it.shift === 'N' && h < 12) d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0); return d.getTime();
}

const TYPES = { run: 'Nasadit a rozjet', prep: 'Jen připravit', start: 'Rozjet', task: 'Úkol', finish: 'Ukončit' };
function shiftEndTs(date, shift) { const d = dparse(date); if (shift === 'N') { d.setDate(d.getDate() + 1); d.setHours(6, 0, 0, 0); } else d.setHours(shift === 'R' ? 14 : 22, 0, 0, 0); return d.getTime(); }
const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const itemTs = it => it.type === 'finish' ? shiftEndTs(it.date, it.shift) : taskTs(it);
const finishFor = (lisId, name) => live().filter(x => x.status === 'todo' && x.type === 'finish' && x.lis === lisId && (!x.p || !name || same(x.p, name))).sort((a, b) => skNum(a.date, a.shift) - skNum(b.date, b.shift))[0];
function finishLabel(it) { const cur = shiftKey(); return 'na konci ' + (it.date === cur.date ? '' : dayLabel(it.date).split(',')[0].toLowerCase() + ' ') + SH[it.shift].toLowerCase() + ' (' + hhmm(shiftEndTs(it.date, it.shift)) + ')'; }
function planOnEnd(p, name) { live().filter(x => x.status === 'todo' && x.type === 'finish' && x.lis === p.id && (!x.p || same(x.p, name))).forEach(markDone); }
function applyFinishEnd(it) { // běžící výrobek dostane čas konce podle plánu, pokud žádný nemá
  const p = press(it.lis), r = p && p.slots[0];
  if (r && r.state === 'run' && !r.end && (!it.p || same(it.p, r.p))) r.end = shiftEndTs(it.date, it.shift);
}
const same = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
const live = () => S.plan.filter(x => x.status !== 'cancel');
const itemsFor = (date, shift) => live().filter(x => x.date === date && x.shift === shift);
const overdue = () => live().filter(x => x.status === 'todo' && skNum(x.date, x.shift) < curNum());
const planNow = id => live().filter(x => x.status === 'todo' && x.lis === id && skNum(x.date, x.shift) <= curNum());
const planText = it => it.type === 'task' ? it.text : it.type === 'finish' ? 'Ukončit ' + (it.p || 'výrobu') + ' ' + finishLabel(it) : TYPES[it.type] + ' ' + it.p;
function addPlan(o) { const it = Object.assign({ id: pid(), status: 'todo', by: S.who || '', t: Date.now(), u: Date.now(), lis: 0, p: '', text: '', time: '', note: '' }, o); S.plan.push(it); return it; }
function markDone(it) { it.status = 'done'; it.doneBy = S.who || ''; it.doneT = Date.now(); it.u = Date.now(); log(it.lis || 0, 'plán splněn: ' + planText(it)); }
function firstTodo(id, types, name) {
  return live().filter(x => x.status === 'todo' && x.lis === id && types.includes(x.type) && same(x.p, name))
    .sort((a, b) => skNum(a.date, a.shift) - skNum(b.date, b.shift))[0];
}
function planOnRun(p, name) { const it = firstTodo(p.id, ['run', 'start'], name); if (it) markDone(it); }
function planOnPrep(p, name, runAt) {
  const it = firstTodo(p.id, ['prep'], name);
  if (it) { markDone(it); if (!runAt && it.runDate) runAt = { date: it.runDate, shift: it.runShift }; }
  if (runAt) {
    p.slots[0].runAt = runAt;
    if (!firstTodo(p.id, ['start'], name)) addPlan({ type: 'start', date: runAt.date, shift: runAt.shift, lis: p.id, p: name });
  }
}
function makePrepared(p, name, runAt) { p.slots[0] = { p: name, end: null, state: 'prep', since: Date.now() }; delete p.idle; planOnPrep(p, name, runAt); }
function shiftOptions(sel) { // nejbližších 10 směn pro „rozjet kdy“
  let k = shiftKey(), o = '<option value="">Zatím neurčeno</option>';
  for (let i = 0; i < 10; i++) { const v = k.date + '|' + k.shift; o += `<option value="${v}" ${v === sel ? 'selected' : ''}>${shLabel(k.date, k.shift)}</option>`; k = nextShift(k); }
  return o;
}
const parseRunAt = v => v ? { date: v.split('|')[0], shift: v.split('|')[1] } : null;

/* --- zobrazení plánu --- */
let PV = shiftKey();
function piHtml(it, opts = {}) {
  const p = it.lis ? press(it.lis) : null, ts = itemTs(it), now = Date.now();
  let cls = it.status === 'done' ? 'done' : '';
  if (it.status === 'todo' && ts) cls += ts < now ? ' late' : ts - now < 30 * M ? ' soon' : '';
  const tag = `<span class="ptag t-${it.type}">${TYPES[it.type]}</span>`;
  const main = it.type === 'task' ? esc(it.text) : `<b>${p ? esc(p.name) : 'Lis ?'}</b> · ${esc(it.p || (it.type === 'finish' && p && p.slots[0] ? p.slots[0].p : 'výrobek na lise'))}`;
  const meta = [];
  if (it.type === 'task' && p) meta.push(esc(p.name));
  if (it.type === 'prep' && it.runDate) meta.push('rozjet: ' + shLabel(it.runDate, it.runShift));
  if (it.type === 'finish') meta.push('ukončit na konci směny');
  if (it.note) meta.push(esc(it.note));
  if (opts.showShift) meta.push(shLabel(it.date, it.shift));
  meta.push('zadal ' + esc(it.by || '?'));
  let acts = '';
  if (it.status === 'todo') {
    if (opts.takeOver) acts += `<button class="sm go" data-pl="take" data-id="${it.id}">${ic('down')}Převzít do mé směny</button>`;
    if (it.lis && it.type !== 'task') acts += `<button class="sm ${opts.takeOver ? '' : 'go'}" data-pl="open" data-id="${it.id}">${ic(it.type === 'prep' ? 'wrench' : it.type === 'finish' ? 'done' : 'play')}${it.type === 'run' ? 'Nasadit na lis' : it.type === 'prep' ? 'Připravit na lis' : it.type === 'finish' ? 'Ukončit na lise' : 'Rozjet na lise'}</button>`;
    if (ts) acts += `<button class="sm" data-pl="remind" data-id="${it.id}">${ic('bell')}Připomenout v telefonu</button>`;
    acts += `<button class="sm" data-pl="edit" data-id="${it.id}" aria-label="Upravit">${ic('edit')}</button>`;
  }
  return `<div class="pi ${cls}">
    ${chk(it.status === 'done', `data-pl="${it.status === 'done' ? 'reopen' : 'done'}" data-id="${it.id}"`, it.status === 'done' ? 'Vrátit mezi nesplněné' : 'Označit jako splněné')}
    <div class="pi-time">${it.type === 'finish' ? `<span class="pt-l">konec</span><b class="mono">${hhmm(ts)}</b>` : it.time ? `<b class="mono">${it.time}</b>` : ic(it.type === 'task' ? 'note' : 'wrench')}</div>
    <div class="pi-body">
      <div class="pi-top">${tag}${it.status === 'done' ? `<span class="pi-ok">${ic('done')}${esc(it.doneBy || '')} · ${fmtEnd(it.doneT).replace('dnes ', '')}</span>` : ts && ts > now && ts - now < 30 * M ? `<span class="pi-soon">za ${Math.ceil((ts - now) / M)} min</span>` : ''}</div>
      <div class="pi-main">${main}</div>
      <div class="pi-meta">${meta.join(' · ')}</div>
      ${acts ? `<div class="acts">${acts}</div>` : ''}
    </div></div>`;
}
function sortItems(a, b) {
  const ta = a.time ? a.time.replace(':', '') : '9999', tb = b.time ? b.time.replace(':', '') : '9999';
  const fix = (t, it) => it.shift === 'N' && t < '1200' ? '2' + t : '1' + t;
  return fix(ta, a).localeCompare(fix(tb, b)) || (a.lis || 99) - (b.lis || 99) || a.t - b.t;
}
function renderPlan() {
  if (!$('plList')) return;
  document.querySelectorAll('[data-pm]').forEach(x => x.setAttribute('aria-pressed', x.dataset.pm === PMODE));
  $('plTasks').hidden = PMODE !== 'tasks'; $('plTime').hidden = PMODE !== 'time'; $('plStaff').hidden = PMODE !== 'staff';
  if (PMODE === 'time') renderTimeline();
  if (PMODE === 'staff') renderStaff();
  const cur = shiftKey(), isCur = PV.date === cur.date && PV.shift === cur.shift;
  $('plDay').textContent = dayLabel(PV.date);
  $('plShifts').innerHTML = SH_ORDER.map(s => {
    const n = itemsFor(PV.date, s).filter(x => x.status === 'todo').length;
    return `<button data-plsh="${s}" aria-pressed="${s === PV.shift}">${SH[s]}${PV.date === cur.date && s === cur.shift ? ' <i>teď</i>' : ''}${n ? `<span class="cnt2">${n}</span>` : ''}</button>`;
  }).join('');
  const items = itemsFor(PV.date, PV.shift).sort(sortItems), done = items.filter(x => x.status === 'done').length;
  $('plProg').innerHTML = items.length ? `<div class="pl-bar"><i style="width:${done / items.length * 100}%"></i></div><span>Splněno <b>${done} z ${items.length}</b></span>` : '';
  const od = isCur ? overdue() : [];
  $('plOver').innerHTML = od.length ? `<div class="pl-over"><div class="pl-over-h"><span>${ic('clock')}Nesplněno z předchozích směn (${od.length})</span><button class="sm" data-pl="takeall">Převzít vše</button></div>
    ${od.sort(sortItems).map(it => piHtml(it, { takeOver: true, showShift: true })).join('')}</div>` : '';
  $('plList').innerHTML = items.filter(x => x.status === 'todo').map(it => piHtml(it)).join('')
    + (done ? `<div class="flbl" style="margin:8px 0 0">Splněno</div>` + items.filter(x => x.status === 'done').map(it => piHtml(it)).join('') : '')
    || `<p class="hint">Na ${SH[PV.shift].toLowerCase()} směnu zatím nic naplánováno.</p>`;
  const nowTodo = itemsFor(cur.date, cur.shift).filter(x => x.status === 'todo').length + overdue().length;
  $('navPlan').textContent = nowTodo; $('navPlan').hidden = !nowTodo;
}
document.addEventListener('click', e => {
  const sh = e.target.closest('[data-plsh]'); if (sh) { PV = { date: PV.date, shift: sh.dataset.plsh }; renderPlan(); return; }
  const b = e.target.closest('[data-pl]'); if (!b) return;
  const k = b.dataset.pl, it = S.plan.find(x => x.id === b.dataset.id);
  const cur = shiftKey();
  if (k === 'takeall') { overdue().forEach(x => { x.date = cur.date; x.shift = cur.shift; x.u = Date.now(); }); save(); renderAll(); toast('Převzato do této směny'); return; }
  if (!it) return;
  if (k === 'take') { it.date = cur.date; it.shift = cur.shift; it.u = Date.now(); }
  if (k === 'done') { if (it.type === 'task') doneWithUndo(it); else fulfil(it); return; }
  if (k === 'reopen') { it.status = 'todo'; it.u = Date.now(); }
  if (k === 'open') { fulfil(it); return; }
  if (k === 'edit') { openPlanEditor(it); return; }
  if (k === 'remind') { openRemind(it); return; }
  save(); renderAll();
});

/* ============ Časová osa směny a rozdělení obsluhy ============ */
const DEFAULT_OPS = ['Nykodýmová', 'Sejkorová', 'Petříková', 'Hrachovcová', 'Zunová', 'Voslařová', 'Zrůstová', 'Tichá'];
const isMistr = () => (USERS.find(u => u.name === S.who) || {}).role === 'mistr';
const shiftStartTs = (date, shift) => { const d = dparse(date); d.setHours(SH_START[shift], 0, 0, 0); return d.getTime(); };
const skey = (date, shift) => date + '|' + shift;
let PMODE = 'tasks';
function lisTimeline(p, date, shift) {
  const S0 = shiftStartTs(date, shift), E = shiftEndTs(date, shift), r = p.slots[0], segs = [];
  const inShift = x => x.status === 'todo' && x.lis === p.id && x.date === date && x.shift === shift;
  const pl = live().filter(x => inShift(x) && ['run', 'prep', 'start'].includes(x.type));
  const fin = live().find(x => inShift(x) && x.type === 'finish');
  let t = null, cur = null;
  const goneBefore = r && r.state === 'run' && r.end && r.end <= S0;
  if (r && !goneBefore && r.state !== 'end') {
    let to = r.state === 'run' && r.end && r.end < E ? r.end : null;
    if (fin && (!fin.p || same(fin.p, r.p))) to = to || E;
    const startItem = r.state === 'prep' ? pl.find(x => x.type === 'start' && same(x.p, r.p)) : null;
    cur = { p: r.p, from: null, to: to && to < E ? to : null, kind: r.state, start: !!startItem };
    segs.push(cur);
    t = cur.to;
  } else t = S0;
  if (t !== null) {
    const nxt = pl.find(x => x.type !== 'start' && (!r || !same(x.p, r.p) || goneBefore || r.state === 'end'))
      || (cur && p.slots[1] ? { p: p.slots[1].p, src: 'queue' } : null);
    if (nxt) segs.push({ p: nxt.p, from: t, to: null, kind: nxt.type === 'prep' ? 'prep-next' : 'next', src: nxt.id ? 'plan' : 'queue', atStart: t <= S0, toolOn: r && r.state === 'end' });
  }
  return segs;
}
const segText = (s, i, segs) => {
  if (s.kind === 'next' || s.kind === 'prep-next') return (s.atStart ? 'nasadit na začátku směny: ' : 'od ' + hhmm(s.from) + ': ') + s.p + (s.kind === 'prep-next' ? ' (jen připravit)' : '');
  return s.p + (s.kind === 'prep' ? (s.start ? ' (rozjet)' : ' (připraveno)') : s.kind === 'stop' ? ' (zastaveno)' : '') + (s.to ? ' do ' + hhmm(s.to) : '');
};
function activeLisy(date, shift) {
  return S.presses.map(p => ({ p, segs: lisTimeline(p, date, shift) })).filter(x => x.segs.length);
}
/* --- data rozdělení --- */
const staffRec = (date, shift) => S.staff[skey(date, shift)];
function splitTs(rec, lisId, segs) {
  const t = rec && rec.splits && rec.splits[lisId];
  if (t) { const [h, m] = t.split(':').map(Number), d = dparse(PV.date); if (PV.shift === 'N' && h < 12) d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d.getTime(); }
  return segs[1] ? segs[1].from : null;
}
function opNow(lisId, ts = Date.now()) { // kdo má lis teď (pro halu)
  const k = shiftKey(ts), rec = staffRec(k.date, k.shift); if (!rec) return null;
  const p = press(lisId), segs = lisTimeline(p, k.date, k.shift), ch = rec.splits && rec.splits[lisId] ? (() => { const sv = PV; PV = k; const v = splitTs(rec, lisId, segs); PV = sv; return v; })() : segs[1] ? segs[1].from : null;
  let cur = null, next = null;
  rec.rows.forEach(row => row.items.filter(it => it.lis === lisId).forEach(it => {
    if (it.part === 'all') cur = row;
    if (it.part === 'a' && (!ch || ts < ch)) cur = row;
    if (it.part === 'b') { if (ch && ts >= ch) cur = row; else next = { row, at: ch }; }
  }));
  return cur || next ? { cur, next } : null;
}
const rowName = (row, i) => row.op || 'Řádek ' + (i + 1);
function staffGuard(desc, fn) { // vedoucí mění jen s potvrzením
  if (isMistr()) { fn(); return; }
  $('sheet2').onclick = null; ED = null;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Změnit rozdělení?</h3><button class="x" data-sg="no" aria-label="Zavřít">${ic('x')}</button></div>
    <div class="preview">${desc}</div>
    <p class="hint" style="margin:0">Rozdělení obsluhy připravuje mistr. Změnu potvrď, ať se nic nepřeklikne.</p>
    <div class="acts end"><button class="secondary" data-sg="no">Zrušit</button><button class="primary" data-sg="yes">Ano, změnit</button></div>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => { const b = e.target.closest('[data-sg]'); if (!b) return; closeDlg2(); if (b.dataset.sg === 'yes') fn(); };
}
function staffCommit(rec, msg) { rec.u = Date.now(); rec.by = S.who || ''; log(0, 'obsluha: ' + msg); save(); renderPlan(); renderGrid(); }
function ensureRec() {
  const k = skey(PV.date, PV.shift);
  if (!S.staff[k]) S.staff[k] = { rows: [], splits: {}, u: Date.now(), by: S.who || '' };
  return S.staff[k];
}
/* výrobky na směnu = úseky časové osy (při přestavbě dva výrobky na jednom lise) */
function shiftProducts(act) {
  const out = [];
  act.forEach(({ p, segs }) => {
    if (segs.length > 1) { out.push({ lis: p.id, part: 'a' }); out.push({ lis: p.id, part: 'b' }); }
    else out.push({ lis: p.id, part: 'all' });
  });
  return out;
}
const covers = (it, part) => it.part === part || it.part === 'all' || (part === 'all' && it.part === 'a');
function unassigned(rec, act) {
  const its = rec ? rec.rows.flatMap(r => r.items) : [];
  return shiftProducts(act).filter(x => !its.some(i => i.lis === x.lis && covers(i, x.part)));
}
const pkey = x => x.lis + ':' + x.part;
const fromKey = k => { const [l, part] = k.split(':'); return { lis: +l, part }; };
function prodName(it, act) {
  const a = act.find(x => x.p.id === it.lis); if (!a) return '—';
  const s = a.segs;
  if (it.part === 'b') return s[1] ? s[1].p : '—';
  if (it.part === 'a' || s.length === 1) return s[0].p;
  return s.map(x => x.p).join(' → ');
}
function prodSub(it, act) {
  const a = act.find(x => x.p.id === it.lis), p = press(it.lis), ln = p ? p.name : '?';
  if (!a) return ln + ' · teď nejede';
  const s = a.segs, seg = it.part === 'b' ? s[1] : s[0];
  let t;
  if (!seg) t = '';
  else if (it.part === 'all' && s.length > 1) t = 'přestavba ' + (s[1].atStart ? 'na začátku' : hhmm(s[1].from));
  else if (seg.kind === 'next' || seg.kind === 'prep-next') t = seg.atStart ? 'nasadit na začátku směny' : 'od ' + hhmm(seg.from) + (seg.kind === 'prep-next' ? ', jen připravit' : '');
  else if (seg.to) t = 'do ' + hhmm(seg.to);
  else if (seg.kind === 'prep') t = seg.start ? 'rozjet' : 'připraveno';
  else if (seg.kind === 'stop') t = 'zastaveno';
  else t = 'celou směnu';
  return ln + ' · ' + t;
}
const prodChip = (it, act, attrs, cls = '') => `<button class="pchip ${cls}" ${attrs}><b>${esc(prodName(it, act))}</b><small>${esc(prodSub(it, act))}</small></button>`;
const itemLabel = (it, act) => `<b>${esc(prodName(it, act))}</b> · ${esc(prodSub(it, act))}`;
const rowSummary = (row, act) => row.items.map(it => prodName(it, act)).join(' + ');
let SEL = new Set();
/* --- vykreslení --- */
function renderTimeline() {
  const act = activeLisy(PV.date, PV.shift);
  const flag = segs => segs.some(s => s.kind === 'next' && s.atStart) ? '<span class="tl-f st">nasadit hned</span>' : segs.length > 1 ? `<span class="tl-f ch">přestavba ${segs[1].atStart ? 'na začátku' : hhmm(segs[1].from)}</span>` : '';
  const rows = act.sort((a, b) => (a.segs[1] ? (a.segs[1].from || 0) : 9e15) - (b.segs[1] ? (b.segs[1].from || 0) : 9e15) || a.p.id - b.p.id);
  const now = shiftKey(), isCur = now.date === PV.date && now.shift === PV.shift;
  $('plTime').innerHTML = `<p class="hint">${isCur ? 'Aktuální směna.' : 'Odhad podle časů konce, pořadí a plánu.'} Co se na lisech děje během směny ${SH[PV.shift].toLowerCase()}.</p>
    <div class="list">${rows.map(({ p, segs }) => `<button class="tl" data-open="${p.id}">
      <div class="tl-h"><span class="no">${esc(p.name)}</span>${flag(segs)}</div>
      <div class="tl-segs">${segs.map((s, i) => `<span class="tl-s k-${s.kind}">${esc(segText(s, i, segs))}</span>`).join('<span class="tl-arr">→</span>')}</div>
      ${opLine(p.id, PV.date, PV.shift)}
    </button>`).join('') || '<p class="hint">V této směně na lisech nic neběží ani není naplánované.</p>'}</div>`;
}
function opLine(lisId, date, shift) {
  const rec = staffRec(date, shift); if (!rec) return '';
  const names = rec.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.items.some(it => it.lis === lisId)).map(({ r, i }) => {
    const it = r.items.find(x => x.lis === lisId); return esc(rowName(r, i)) + (it.part === 'a' ? ' (do přestavby)' : it.part === 'b' ? ' (po přestavbě)' : '');
  });
  return names.length ? `<div class="tl-op">${ic('user')}${names.join(' · ')}</div>` : '<div class="tl-op none">nerozděleno</div>';
}
function renderStaff() {
  const rec = staffRec(PV.date, PV.shift), act = activeLisy(PV.date, PV.shift), un = unassigned(rec, act), all = shiftProducts(act);
  const rows = rec ? rec.rows : [];
  SEL = new Set([...SEL].filter(k => un.some(u => pkey(u) === k)));
  let h = `<div class="st-who">${ic('user')}${isMistr() ? 'Jsi mistr, změny se ukládají hned.' : 'Změny potvrzuješ, rozdělení připravuje mistr.'}${rec ? ` <span class="hint">Naposledy upravil ${esc(rec.by || '?')} ${fmtEnd(rec.u)}</span>` : ''}</div>`;
  h += `<h2>1 · Výrobky na směnu <span class="cnt">${un.length ? 'nerozděleno ' + un.length + ' z ' + all.length : 'vše rozděleno'}</span></h2>
    <p class="hint">Co jede a co pojede. Klepnutím vyber výrobky a dej je do řádku.</p>
    <div class="pool">${un.map(u => prodChip(u, act, `data-st="sel" data-key="${pkey(u)}" aria-pressed="${SEL.has(pkey(u))}"`, SEL.has(pkey(u)) ? 'on' : '')).join('') || `<p class="hint">${all.length ? 'Všechny výrobky jsou rozdělené do řádků.' : 'V této směně nic nejede ani není naplánované.'}</p>`}</div>`;
  if (SEL.size) h += `<div class="selbar"><span>Vybráno <b>${SEL.size}</b></span>
      <button class="sm go" data-st="newrow">${ic('plus')}Nový řádek</button>
      ${rows.map((r, i) => `<button class="sm" data-st="torow" data-i="${i}">Do řádku ${i + 1}</button>`).join('')}
      <button class="sm" data-st="selclear">Zrušit výběr</button></div>`;
  h += `<h2>2 · Řádky a obsluha <span class="cnt">${rows.length}</span></h2>`;
  h += rows.length ? `<div class="list">${rows.map((row, i) => {
    const used = rows.filter((r, j) => j !== i).map(r => r.op);
    return `<div class="strow ${row.op ? '' : 'noop'}">
      <div class="strow-h"><span class="qn">${i + 1}</span><b class="strow-sum">${esc(rowSummary(row, act)) || '<span class="hint">prázdný řádek</span>'}</b>
        <button class="icb sm-x" data-st="rowdel" data-i="${i}" aria-label="Smazat řádek ${i + 1}">${ic('trash')}</button></div>
      <div class="pool in-row">${row.items.map((it, k) => prodChip(it, act, `data-st="item" data-i="${i}" data-k="${k}"`)).join('')}</div>
      <label class="strow-op"><span>${ic('user')}Obsluha</span><select data-st="op" data-i="${i}" aria-label="Obsluha řádku ${i + 1}"><option value="">— přiřadit obsluhu —</option>${S.ops.list.map(n => `<option value="${esc(n)}" ${n === row.op ? 'selected' : ''} ${used.includes(n) ? 'disabled' : ''}>${esc(n)}${used.includes(n) ? ' (má jiný řádek)' : ''}</option>`).join('')}<option value="__new">+ Napsat jiné jméno…</option></select></label>
    </div>`; }).join('')}</div>
    <button class="secondary" data-st="show" style="width:100%;margin-top:10px">${ic('grid')}Ukázat obsluze</button>`
    : '<p class="hint">Zatím žádné řádky. Nahoře vyber výrobky a dej <b>Nový řádek</b>.</p>';
  h += `<h2>Seznam obsluhy <span class="cnt">${S.ops.list.length}</span></h2>
    <div class="stitems ops">${S.ops.list.map((n, i) => `<span class="opchip">${esc(n)}<button data-st="opdel" data-i="${i}" aria-label="Odebrat ${esc(n)}">${ic('x')}</button></span>`).join('')}</div>
    <form class="cat-add" id="opForm"><input type="text" id="opNew" placeholder="Přidat jméno" aria-label="Nové jméno obsluhy"><button class="primary" type="submit">Přidat</button></form>`;
  $('plStaff').innerHTML = h;
}
function staffItemMenu(i, k) {
  const rec = staffRec(PV.date, PV.shift), act = activeLisy(PV.date, PV.shift), it = rec.rows[i].items[k], a = act.find(x => x.p.id === it.lis);
  const canSplit = it.part === 'all' && a && a.segs.length > 1;
  ED = null; $('sheet2').onclick = null;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${esc(prodName(it, act))}</h3><button class="x" data-sm="close" aria-label="Zavřít">${ic('x')}</button></div>
    <div class="preview">${esc(prodSub(it, act))}<br><span class="hint">V řádku ${i + 1}${rec.rows[i].op ? ' · ' + esc(rec.rows[i].op) : ''}</span></div>
    ${rec.rows.length > 1 ? `<span class="flbl">Přesunout do řádku</span>
    <div class="quick">${rec.rows.map((r, j) => j === i ? '' : `<button class="chip" data-sm="move" data-j="${j}">${j + 1}${r.op ? ' · ' + esc(r.op) : ''}</button>`).join('')}</div>` : ''}
    <button class="secondary" data-sm="new">${ic('plus')}Do nového řádku</button>
    ${canSplit ? `<button class="secondary" data-sm="split">${ic('swap')}Rozdělit na ${esc(a.segs[0].p)} a ${esc(a.segs[1].p)}</button>` : ''}
    <button class="secondary del-t" data-sm="del">${ic('back')}Vrátit mezi nerozdělené</button>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-sm]'); if (!b) return;
    const k2 = b.dataset.sm; if (k2 === 'close') return closeDlg2();
    const j = +b.dataset.j, nm = prodName(it, act);
    closeDlg2();
    if (k2 === 'move') staffGuard(`Přesunout <b>${esc(nm)}</b> z řádku ${i + 1} do řádku ${j + 1}`, () => { rec.rows[i].items.splice(k, 1); rec.rows[j].items.push(it); staffCommit(rec, nm + ': řádek ' + (i + 1) + ' → ' + (j + 1)); });
    if (k2 === 'new') staffGuard(`Dát <b>${esc(nm)}</b> do nového řádku`, () => { rec.rows[i].items.splice(k, 1); rec.rows.push({ id: pid(), op: '', items: [it] }); staffCommit(rec, nm + ' → nový řádek'); });
    if (k2 === 'split') staffGuard(`Rozdělit <b>${esc(nm)}</b> na dva výrobky (druhý se vrátí mezi nerozdělené)`, () => { it.part = 'a'; staffCommit(rec, nm + ' rozděleno'); });
    if (k2 === 'del') staffGuard(`Vrátit <b>${esc(nm)}</b> z řádku ${i + 1} mezi nerozdělené`, () => { rec.rows[i].items.splice(k, 1); staffCommit(rec, nm + ' vráceno'); });
  };
}
function staffShow() {
  const rec = staffRec(PV.date, PV.shift), act = activeLisy(PV.date, PV.shift);
  ED = null; $('sheet2').onclick = null;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${esc(shLabel(PV.date, PV.shift))}</h3><button class="x" data-ss="close" aria-label="Zavřít">${ic('x')}</button></div>
    <div class="bigview">${rec.rows.map((row, i) => `<div class="bv-row ${row.op ? '' : 'noop'}"><div class="bv-n">${row.op ? esc(row.op) : 'Řádek ' + (i + 1) + ' · bez obsluhy'}</div>
      <div class="bv-sum">${esc(rowSummary(row, act)) || '—'}</div>
      <div class="bv-it">${row.items.map(it => `<div>${esc(prodSub(it, act))}</div>`).join('')}</div></div>`).join('')}</div>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => { if (e.target.closest('[data-ss]')) closeDlg2(); };
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-pm]');
  if (m) { PMODE = m.dataset.pm; renderPlan(); return; }
  const b = e.target.closest('#plStaff [data-st]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'LABEL') return;
  const k = b.dataset.st, i = +b.dataset.i;
  let rec = staffRec(PV.date, PV.shift);
  const act = () => activeLisy(PV.date, PV.shift);
  const selItems = () => [...SEL].map(fromKey), selNames = () => selItems().map(x => prodName(x, act())).join(' + ');
  if (k === 'sel') { const key = b.dataset.key; SEL.has(key) ? SEL.delete(key) : SEL.add(key); renderStaff(); return; }
  if (k === 'selclear') { SEL.clear(); renderStaff(); return; }
  if (k === 'newrow') staffGuard(`Nový řádek: <b>${esc(selNames())}</b>`, () => { rec = ensureRec(); rec.rows.push({ id: pid(), op: '', items: selItems() }); const n = selNames(); SEL.clear(); staffCommit(rec, 'nový řádek ' + n); });
  if (k === 'torow') staffGuard(`Do řádku ${i + 1} přidat <b>${esc(selNames())}</b>`, () => { rec.rows[i].items.push(...selItems()); const n = selNames(); SEL.clear(); staffCommit(rec, 'řádek ' + (i + 1) + ' + ' + n); });
  if (k === 'rowdel') { const row = rec.rows[i]; staffGuard(`Smazat řádek ${i + 1}${row.op ? ' (' + esc(row.op) + ')' : ''}${row.items.length ? '. Výrobky <b>' + esc(rowSummary(row, act())) + '</b> se vrátí mezi nerozdělené' : ''}`, () => { rec.rows.splice(i, 1); staffCommit(rec, 'smazán řádek ' + (i + 1)); }); }
  if (k === 'item') staffItemMenu(i, +b.dataset.k);
  if (k === 'show') staffShow();
  if (k === 'opdel') { const n = S.ops.list[i]; staffGuard(`Odebrat <b>${esc(n)}</b> ze seznamu obsluhy`, () => { S.ops.list.splice(i, 1); S.ops.u = Date.now(); save(); renderPlan(); }); }
});
document.addEventListener('change', e => {
  const s = e.target.closest('#plStaff select[data-st="op"]'); if (!s) return;
  const rec = staffRec(PV.date, PV.shift), i = +s.dataset.i, old = rec.rows[i].op;
  let v = s.value;
  const apply = name => staffGuard(`Obsluha řádku ${i + 1} (${esc(rowSummary(rec.rows[i], activeLisy(PV.date, PV.shift)))}): <b>${esc(name || '—')}</b>${old ? ' místo ' + esc(old) : ''}`, () => { rec.rows[i].op = name; staffCommit(rec, 'řádek ' + (i + 1) + ' = ' + name); });
  if (v === '__new') {
    s.value = old;
    ED = null; $('sheet2').onclick = null;
    $('sheet2').innerHTML = `<div class="sh-head"><h3>Nové jméno</h3><button class="x" data-nn="close" aria-label="Zavřít">${ic('x')}</button></div>
      <input type="text" id="nnName" placeholder="Příjmení"><label class="savecat"><input type="checkbox" id="nnSave" checked> Uložit do seznamu obsluhy</label>
      <div class="acts end"><button class="secondary" data-nn="close">Zrušit</button><button class="primary" data-nn="ok">Použít</button></div>`;
    $('dlg2').showModal(); setTimeout(() => $('nnName').focus(), 50);
    $('sheet2').onclick = ev => {
      const b = ev.target.closest('[data-nn]'); if (!b) return;
      if (b.dataset.nn === 'close') return closeDlg2();
      const n = $('nnName').value.trim(); if (!n) return toast('Napiš jméno');
      if ($('nnSave').checked && !S.ops.list.includes(n)) { S.ops.list.push(n); S.ops.u = Date.now(); }
      closeDlg2(); apply(n);
    };
    return;
  }
  s.value = old; apply(v);
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'opForm') return; e.preventDefault();
  const n = $('opNew').value.trim(); if (!n) return;
  if (S.ops.list.includes(n)) return toast('Už v seznamu je');
  S.ops.list.push(n); S.ops.u = Date.now(); save(); renderPlan(); toast(n + ' přidána do seznamu');
});
/* --- přenos --- */
function packStaff() {
  const minK = skNum(addDays(shiftKey().date, -1), 'R'), st = {};
  Object.entries(S.staff).forEach(([k, v]) => { const [d, s] = k.split('|'); if (skNum(d, s) >= minK) st[k] = { r: v.rows.map(r => [r.op, r.items.map(i => i.lis + (i.part === 'all' ? '' : i.part))]), s: v.splits || {}, u: Math.round(v.u / 1000), b: v.by }; });
  return { st, ops: S.ops.list, ou: Math.round((S.ops.u || 0) / 1000) };
}
function unpackStaff(o) {
  if (!o) return null;
  const staff = {};
  Object.entries(o.st || {}).forEach(([k, v]) => { staff[k] = { rows: v.r.map(([op, its]) => ({ id: pid(), op, items: its.map(x => { const m = String(x).match(/^(\d+)([ab]?)$/); return { lis: +m[1], part: m[2] || 'all' }; }) })), splits: v.s || {}, u: v.u * 1000, by: v.b }; });
  return { staff, ops: { list: o.ops || [], u: (o.ou || 0) * 1000 } };
}
function mergeStaff(x) {
  if (!x) return;
  Object.entries(x.staff).forEach(([k, v]) => { if (!S.staff[k] || v.u > S.staff[k].u + 999) S.staff[k] = v; });
  if (x.ops && x.ops.u > (S.ops.u || 0) + 999) S.ops = x.ops;
}

/* --- splnění položky plánu = skutečná akce na lise --- */
function fulfil(it) {
  const p = press(it.lis); if (!p) { doneWithUndo(it); return; }
  const r = p.slots[0];
  editId = p.id; moveIdx = null; selQ = null; confirmOff = false;
  if (it.type === 'run' && !r) return openEditor({ mode: 'newrun', preset: it.p });
  if (it.type === 'prep' && !r) return openEditor({ mode: 'prep', preset: it.p, run: it.runDate ? it.runDate + '|' + it.runShift : '' });
  if (it.type === 'start' && r && r.state === 'prep' && same(r.p, it.p)) return openEditor({ mode: 'resume' });
  if (it.type === 'finish' && r && (!it.p || same(r.p, it.p))) {
    if (r.state === 'end') { doneWithUndo(it); return; }
    if (r.state === 'run' || r.state === 'stop') return openStateDlg(p, 'end', 'Podle plánu');
  }
  if ((it.type === 'run' || it.type === 'start') && r && r.state === 'run' && same(r.p, it.p)) { doneWithUndo(it); return; }
  // lis není ve stavu, kdy jde akci rovnou udělat
  const why = it.type === 'finish' ? (!r ? 'Lis je prázdný, není co ukončit.' : `Na lise je teď <b>${esc(r.p)}</b>, ne ${esc(it.p)}.`)
    : !r ? 'Lis je prázdný, výrobek ' + esc(it.p) + ' na něm není připravený.'
    : `Na lise je teď <b>${esc(r.p)}</b> (${status(p).t.toLowerCase()}). ${r.state === 'run' ? 'Nejdřív ukonči výrobu a sundej nástroj.' : 'Nejdřív sundej nástroj.'}`;
  $('sheet2').onclick = null; ED = null;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${TYPES[it.type]} · ${esc(p.name)}</h3><button class="x" data-fu="close" aria-label="Zavřít">${ic('x')}</button></div>
    <div class="preview"><b>${esc(it.p || 'Výrobu')}</b> nejde teď na ${esc(p.name)} ${it.type === 'prep' ? 'připravit' : it.type === 'finish' ? 'ukončit' : 'nasadit'}.<br>${why}</div>
    <button class="primary" data-fu="open">${ic('grid')}Otevřít ${esc(p.name)}</button>
    ${r && it.type !== 'start' && it.type !== 'finish' ? `<button class="secondary" data-fu="queue">${ic('plus')}Dát ${esc(it.p)} do pořadí lisu</button>` : ''}
    <button class="secondary" data-fu="done">${ic('done')}Označit splněné bez změny na lise</button>
    <p class="hint" style="margin:0">Poslední možnost použij, jen když se to už udělalo mimo aplikaci.</p>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-fu]'); if (!b) return;
    const a = b.dataset.fu; closeDlg2();
    if (a === 'open') openSheet(p.id);
    if (a === 'done') doneWithUndo(it);
    if (a === 'queue') { const q = p.slots.slice(1).filter(Boolean); if (q.length >= 4) return toast('Pořadí je plné'); q.push({ p: it.p }); p.slots = [p.slots[0], ...q, null, null, null, null].slice(0, 5); commit('z plánu do pořadí: ' + it.p, p.id); toast(it.p + ' je v pořadí na ' + p.name); }
  };
}

/* --- editor položky plánu --- */
let PE = null;
function openPlanEditor(it) {
  $('sheet2').onclick = null;
  PE = it || null; ED = { mode: 'plan' };
  const v = it || { type: 'run', date: PV.date, shift: PV.shift, lis: 0, p: '', text: '', time: '', note: '' };
  const days = []; for (let i = -1; i <= 7; i++) days.push(addDays(shiftKey().date, i));
  if (!days.includes(v.date)) days.unshift(v.date);
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${it ? 'Upravit plán' : 'Přidat do plánu'}</h3><button class="x" data-e="close" aria-label="Zavřít">${ic('x')}</button></div>
    <div class="seg pe-type" id="peType">${['run', 'prep', 'finish', 'task'].concat(v.type === 'start' ? ['start'] : []).map(t => `<button type="button" data-pt="${t}" aria-pressed="${t === v.type}">${ic({ run: 'play', prep: 'wrench', task: 'note', start: 'play', finish: 'done' }[t])}${TYPES[t]}</button>`).join('')}</div>
    <div class="pe" id="peBox" data-type="${v.type}">
      <div class="pe-row">
        <label class="pe-f"><span class="flbl">Den</span><select id="peDate">${days.map(d => `<option value="${d}" ${d === v.date ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select></label>
        <label class="pe-f"><span class="flbl"><span class="l-norm">Směna</span><span class="l-fin">Ukončit na konci směny</span></span><select id="peShift">${SH_ORDER.map(s => `<option value="${s}" ${s === v.shift ? 'selected' : ''}>${SH[s]}</option>`).join('')}</select></label>
      </div>
      <label class="pe-f"><span class="flbl">Lis <span class="opt opt-task">(nepovinné)</span></span><select id="peLis"><option value="0">— bez lisu —</option>${S.presses.map(p => `<option value="${p.id}" ${p.id === v.lis ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="pe-prod"><span class="flbl">Výrobek<span class="opt l-fin"> (nepovinné, jinak co zrovna jede)</span></span>
        <input type="text" id="edP" value="${esc(v.p)}" placeholder="Hledej v katalogu nebo napiš nový" autocomplete="off">
        <div class="sug" id="edList"></div>
        <label class="savecat" id="edCatWrap" hidden><input type="checkbox" id="edCat" checked> Uložit nový výrobek do katalogu</label></div>
      <label class="pe-f pe-prep"><span class="flbl">Kdy rozjet <span class="opt">(nepovinné)</span></span><select id="peRun">${shiftOptions(v.runDate ? v.runDate + '|' + v.runShift : '')}</select></label>
      <label class="pe-f pe-task"><span class="flbl">Co udělat</span><textarea id="peText" rows="3" placeholder="Např. zapnout sušičku, černý Beyblend">${esc(v.text)}</textarea></label>
      <label class="pe-f pe-task"><span class="flbl">Čas <span class="opt">(nepovinné)</span></span><input type="time" id="peTime" value="${esc(v.time)}"></label>
      <label class="pe-f pe-nottask"><span class="flbl">Poznámka <span class="opt">(nepovinné)</span></span><input type="text" id="peNote" value="${esc(v.note)}" placeholder="Např. nástroj je u nástrojárny"></label>
    </div>
    ${it ? `<button class="sm del" data-e="pdel" style="align-self:flex-start">${ic('trash')}Zrušit tuto položku plánu</button>` : ''}
    <div class="acts end">${it ? '' : '<button type="button" class="secondary" data-e="pnext">Uložit a další</button>'}<button type="button" class="primary" data-e="psave">Uložit</button></div>`;
  edFilter();
  $('dlg2').showModal();
}
$('sheet2').addEventListener('click', e => {
  const t = e.target.closest('[data-pt]'); if (!t || !$('peBox')) return;
  $('peBox').dataset.type = t.dataset.pt;
  $('peType').querySelectorAll('[data-pt]').forEach(x => x.setAttribute('aria-pressed', x === t));
});
$('sheet2').addEventListener('change', e => {
  if (e.target.id !== 'peLis' || !$('peBox') || $('peBox').dataset.type !== 'finish' || $('edP').value) return;
  const p = press(+e.target.value), r = p && p.slots[0]; if (r) { $('edP').value = r.p; edFilter(); }
});
function savePlan(next) {
  const type = $('peBox').dataset.type, lis = +$('peLis').value, name = $('edP').value.trim(), text = $('peText').value.trim();
  if ((type === 'run' || type === 'prep' || type === 'start' || type === 'finish') && !lis) { toast('Vyber lis'); return false; }
  if ((type === 'run' || type === 'prep' || type === 'start') && !name) { toast('Vyber nebo napiš výrobek'); return false; }
  if (type === 'task' && !text) { toast('Napiš, co se má udělat'); return false; }
  if (type !== 'task' && !$('edCatWrap').hidden && $('edCat').checked) addToCatalog(name);
  const run = parseRunAt($('peRun').value);
  const data = { type, date: $('peDate').value, shift: $('peShift').value, lis, p: type === 'task' ? '' : name, text: type === 'task' ? text : '',
    time: type === 'task' ? $('peTime').value : '', note: type === 'task' ? '' : $('peNote').value.trim(),
    runDate: type === 'prep' && run ? run.date : '', runShift: type === 'prep' && run ? run.shift : '' };
  if (PE) { Object.assign(PE, data, { u: Date.now() }); log(lis, 'plán upraven: ' + planText(PE)); if (type === 'finish') applyFinishEnd(PE); }
  else { const it = addPlan(data); log(lis, 'do plánu: ' + planText(it) + ' (' + shLabel(it.date, it.shift) + ')'); if (type === 'finish') applyFinishEnd(it); }
  PV = { date: data.date, shift: data.shift };
  save(); renderAll();
  if (next) { const keep = { date: data.date, shift: data.shift, type }; openPlanEditor(null); $('peDate').value = keep.date; $('peShift').value = keep.shift; $('peBox').dataset.type = keep.type; $('peType').querySelectorAll('[data-pt]').forEach(x => x.setAttribute('aria-pressed', x.dataset.pt === keep.type)); toast('Uloženo, zadej další'); }
  else { ED = null; PE = null; closeDlg2(); toast('Uloženo do plánu'); }
  return true;
}

/* --- vložení textu od mistra --- */
function parsePlanText(txt) {
  const out = [];
  txt.split(/\n|[,;](?=\s*(?:lis|l\.)\s*\d)/i).map(s => s.trim()).filter(Boolean).forEach(line => {
    let m = line.match(/^(?:lis|l\.?)\s*(\d{1,3})\s*[-–:.,]?\s*(.+)$/i);
    if (m) {
      let name = m[2].trim(), type = 'run', shift = '';
      const sm = name.match(/(?:^|\s)(ran+n[íi]|odpoledn[íi]|no[cč]n[íi])(?=\s|$|[,.;])/i);
      if (sm) shift = /^r/i.test(sm[1]) ? 'R' : /^o/i.test(sm[1]) ? 'O' : 'N';
      if (/ukon[cč]/i.test(name)) {
        type = 'finish';
        name = (' ' + name + ' ').replace(/ukon[cč]it|ukon[cč]en[íi]/ig, ' ').replace(/\s(na|po|do)\s+kon(ci|ec)(?=\s)/ig, ' ').replace(/\skon(ci|ec)(?=\s)/ig, ' ').replace(/\s(ran+n[íi]|odpoledn[íi]|no[cč]n[íi])(?=[\s,.;])/ig, ' ').replace(/\ssm[ěe]n[yau]?(?=[\s,.;])/ig, ' ').replace(/\s+/g, ' ').trim();
        const lisId = (S.presses.find(p => p.id === +m[1]) || S.presses.find(p => (p.name.match(/\d+/) || [])[0] == +m[1]) || {}).id || 0;
        out.push({ type, lis: lisId, p: name.replace(/^[-–:,\s]+|[-–:,\s]+$/g, ''), text: '', time: '', shift, raw: line });
        return;
      }
      if (/(jen\s+)?(připrav|pripravit|nerozj|nerozjíž|nerozjiz|jen\s+nasad)/i.test(name)) {
        type = 'prep'; name = name.replace(/\(?\s*[-–,]?\s*(jen\s+)?(připravit|pripravit|připravit pro .*|nerozjíždět|nerozjizdet|nerozjíždět|jen\s+nasadit)\s*\)?/ig, '').trim();
      }
      const lisId = (S.presses.find(p => p.id === +m[1]) || S.presses.find(p => (p.name.match(/\d+/) || [])[0] == +m[1]) || {}).id || 0;
      out.push({ type, lis: lisId, p: name.replace(/^[-–:,\s]+|[-–:,\s]+$/g, ''), text: '', time: '', raw: line });
      return;
    }
    const t = line.match(/(\d{1,2})[:.](\d{2})/);
    const lm = line.match(/lis[u]?\s*(\d{1,3})/i);
    out.push({ type: 'task', lis: lm ? (S.presses.find(p => p.id === +lm[1]) || {}).id || 0 : 0, p: '', time: t ? pad(+t[1]) + ':' + t[2] : '',
      text: line.replace(/^\s*(v|ve|od)?\s*\d{1,2}[:.]\d{2}\s*(hod\.?)?\s*[-–:,]?\s*/i, '').trim() || line, raw: line });
  });
  return out;
}
function openPaste() {
  $('sheet2').onclick = null; ED = null;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Vložit plán z textu</h3><button class="x" data-ps="close" aria-label="Zavřít">${ic('x')}</button></div>
    <p class="hint" style="margin:0">Vlož soupis od mistra (třeba zkopírovaný z WhatsAppu). Každý lis nebo úkol na nový řádek, nebo oddělené čárkou. Položky se přidají do: <b>${shLabel(PV.date, PV.shift)}</b>.</p>
    <textarea id="psText" rows="6" placeholder="lis 10 - MNZ&#10;lis 12 KPL 64&#10;lis 15 KKD 120 jen připravit&#10;v 19:00 zapnout sušičku černý Beyblend&#10;připravit materiál na lis 6"></textarea>
    <button class="secondary" data-ps="parse">${ic('scan')}Rozpoznat</button>
    <div id="psOut"></div>`;
  $('dlg2').showModal();
  let parsed = [];
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-ps]'); if (!b) return;
    const k = b.dataset.ps;
    if (k === 'close') return closeDlg2();
    if (k === 'parse') {
      parsed = parsePlanText($('psText').value);
      $('psOut').innerHTML = parsed.length ? `<div class="list">${parsed.map((x, i) => `<label class="ps-row"><input type="checkbox" data-psi="${i}" checked>
        <span><span class="ptag t-${x.type}">${TYPES[x.type]}</span> ${x.type === 'task' ? (x.time ? '<b>' + x.time + '</b> ' : '') + esc(x.text) : '<b>' + esc((press(x.lis) || { name: 'Lis ?' }).name) + '</b> · ' + esc(x.p || 'co jede') + (x.type === 'finish' ? ' · na konci ' + SH[x.shift || PV.shift].toLowerCase() : '')}
        ${x.type !== 'task' && !x.lis ? '<em class="bad">lis nenalezen</em>' : ''}</span></label>`).join('')}</div>
        <p class="hint">Typ jde po přidání změnit tlačítkem upravit u položky.</p>
        <button class="primary" data-ps="add">${ic('plus')}Přidat do plánu</button>` : '<p class="hint">Nic jsem nerozpoznal.</p>';
    }
    if (k === 'add') {
      let n = 0;
      parsed.forEach((x, i) => { const cb = $('psOut').querySelector(`[data-psi="${i}"]`); if (!cb || !cb.checked) return; if (x.type !== 'task' && !x.lis) return;
        if (x.p) addToCatalog(x.p); const it2 = addPlan({ type: x.type, date: PV.date, shift: x.shift || PV.shift, lis: x.lis, p: x.p, text: x.text, time: x.time }); if (x.type === 'finish') applyFinishEnd(it2); n++; });
      log(0, 'plán vložen z textu: ' + n + ' položek'); save(); renderAll(); closeDlg2(); toast('Přidáno ' + n + ' položek');
    }
  };
}

/* --- připomínka v kalendáři telefonu --- */
function icsDate(ts) { const d = new Date(ts); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; }
const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
function openRemind(it) {
  const ts = itemTs(it); if (!ts) return;
  const title = planText(it), lis = it.lis && press(it.lis) ? press(it.lis).name : '';
  const desc = (lis ? lis + ' · ' : '') + 'Lisy na hale – ' + shLabel(it.date, it.shift);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lisy na hale//CZ', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:' + it.id + '@lisy', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
    'DTSTART:' + icsDate(ts), 'DTEND:' + icsDate(ts + 15 * M), 'SUMMARY:' + icsEsc(title), 'DESCRIPTION:' + icsEsc(desc),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), 'TRIGGER:-PT5M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const g = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) + '&dates=' + icsDate(ts) + '/' + icsDate(ts + 15 * M) + '&ctz=Europe/Prague&details=' + encodeURIComponent(desc);
  $('sheet2').onclick = null; ED = null;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Připomenout v telefonu</h3><button class="x" data-rm="close" aria-label="Zavřít">${ic('x')}</button></div>
    <div class="preview"><b>${esc(title)}</b><br>${fmtEnd(ts)} · upozornění 5 minut předem</div>
    <button class="primary" data-rm="ics">${ic('bell')}Přidat do kalendáře telefonu</button>
    <a class="secondary" href="${g}" target="_blank" rel="noopener">${ic('clock')}Otevřít v Google Kalendáři</a>
    <p class="hint" style="margin:0">Kalendář telefonu pak upozorní, i když je aplikace zavřená. U Google Kalendáře se použije jeho výchozí čas upozornění, který jde v události změnit na 5 minut.</p>`;
  $('dlg2').showModal();
  $('sheet2').onclick = async e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    if (b.dataset.rm === 'close') return closeDlg2();
    if (b.dataset.rm === 'ics') {
      const file = new File([ics], 'pripominka-' + it.time.replace(':', '') + '.ics', { type: 'text/calendar' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; } } catch (err) { if (err.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
      toast('Otevři stažený soubor, přidá se do kalendáře');
    }
  };
}

/* --- upozornění v otevřené aplikaci --- */
let ALERTED = {}; try { ALERTED = JSON.parse(localStorage.getItem('lisy-alerted')) || {}; } catch (e) {}
function checkAlarms() {
  const now = Date.now();
  live().filter(x => x.status === 'todo' && ((x.type === 'task' && x.time) || x.type === 'finish')).forEach(it => {
    const ts = itemTs(it), lead = it.type === 'finish' ? 30 : 5; if (!ts || ALERTED[it.id + ts] || now < ts - lead * M || now > ts + 60 * M) return;
    ALERTED[it.id + ts] = 1; try { localStorage.setItem('lisy-alerted', JSON.stringify(ALERTED)); } catch (e) {}
    showAlarm(it, ts);
  });
}
function showAlarm(it, ts) {
  const el = document.createElement('div'); el.className = 'alarm';
  const left = Math.round((ts - Date.now()) / M);
  el.innerHTML = `<div class="alarm-h">${ic('bell')}<b>${hhmm(ts)}</b><span>${left > 0 ? 'za ' + left + ' min' : 'teď'}</span></div>
    <div class="alarm-t">${esc(planText(it))}</div>${it.lis && press(it.lis) ? `<div class="alarm-m">${esc(press(it.lis).name)}</div>` : ''}
    <div class="acts"><button class="sm" data-al="done">${ic('done')}Označit splněné</button><button class="sm" data-al="later">${ic('clock')}Později (10 min)</button><button class="sm" data-al="close">Zavřít</button></div>`;
  el.onclick = e => {
    const b = e.target.closest('[data-al]'); if (!b) return;
    if (b.dataset.al === 'done') { if (it.type === 'task') doneWithUndo(it); else { el.remove(); fulfil(it); return; } }
    if (b.dataset.al === 'later') setTimeout(() => { if (it.status === 'todo') showAlarm(it, ts); }, 10 * M);
    el.remove();
  };
  document.body.append(el);
  try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
}

/* ============ Press detail sheet ============ */
let editId = null, moveIdx = null, selQ = null, confirmOff = false;
function openSheet(id) { editId = id; moveIdx = null; selQ = null; confirmOff = false; drawSheet(); $('dlg').showModal(); }
function compactQueue(p) { // Další 1-4 bez mezer
  const q = p.slots.slice(1).filter(Boolean);
  p.slots = [p.slots[0], ...q, null, null, null, null].slice(0, 5);
}
function commit(msg, id) { if (msg) log(id || editId, msg); save(); renderHeader(); renderGrid(); renderHandover(); renderCatalog(); renderPlan(); if ($('dlg').open) drawSheet(); }
function makeRunning(p, name, end) { p.slots[0] = { p: name, end: end || null, state: 'run', since: Date.now() }; delete p.idle; planOnRun(p, name); }

function runHtml(p) {
  const r = p.slots[0];
  if (!r) return `<div class="slot run empty">
    <div class="slot-top"><span class="lbl">Na lise</span></div>
    <div class="prodname">Prázdný, připravený na další nástroj</div>
    <div class="slotinfo">${p.idle ? fmtSince(p.idle.since) + (p.idle.last ? ' · naposledy ' + esc(p.idle.last) : '') : ''}</div>
    <div class="acts"><button class="sm go" data-a="newrun">${ic('play')}Nasadit a rozjet</button><button class="sm prep" data-a="newprep">${ic('wrench')}Jen připravit</button></div>
    ${p.slots[1] ? '<p class="hint" style="margin:0">Nebo klepni na výrobek v pořadí.</p>' : ''}
  </div>`;
  const run = r.state === 'run', lbl = run ? 'Běží' : r.state === 'prep' ? 'Připraveno · nástroj nasazen' : r.state === 'stop' ? 'Zastaveno' : 'Ukončeno';
  let acts;
  if (run) acts = `<button class="sm end" data-a="finish">${ic('done')}Ukončit výrobu</button><button class="sm stop" data-a="stop">${ic('pause')}Zastavit výrobu</button><button class="sm" data-a="time">${ic('clock')}Změnit čas</button>`;
  else acts = `<button class="sm go" data-a="resume">${ic('play')}${r.state === 'prep' ? 'Rozjet' : 'Opět spustit'}</button>
    <button class="sm del" data-a="off">${ic('wrench')}${confirmOff ? 'Opravdu sundat?' : 'Sundat nástroj'}</button>
    <button class="sm" data-a="mv" data-i="0">${ic('move')}Na jiný lis</button>`;
  const pct = run && r.end && r.since && r.end > r.since ? Math.min(100, Math.max(2, (Date.now() - r.since) / (r.end - r.since) * 100)) : null;
  return `<div class="slot run st-${r.state}">
    <div class="slot-top"><span class="lbl">${lbl}</span></div>
    <div class="prodname">${esc(r.p)}</div>
    ${pct !== null ? `<div class="bar" style="--st:${status(p).c}"><i style="width:${pct}%"></i></div>` : ''}
    <div class="slotinfo">${run ? (r.end ? ic('clock') + 'konec ' + fmtEnd(r.end) + ' · ' + fmtLeft(r.end) : 'konec nezadán')
      : r.state === 'prep' ? ic('clock') + (r.runAt ? 'rozjet: <b>' + shLabel(r.runAt.date, r.runAt.shift) + '</b>' : 'kdy rozjet: neurčeno') + ' · připraveno ' + fmtEnd(r.since)
      : (r.note ? esc(r.note) + ' · ' : '') + fmtSince(r.since || Date.now()) + (r.since ? ' (od ' + fmtEnd(r.since) + ')' : '')}</div>
    <div class="acts">${acts}</div>
    ${moveIdx === 0 ? movePanel() : ''}
  </div>`;
}
function planCards(p) {
  const items = planNow(p.id); if (!items.length) return '';
  const r = p.slots[0];
  return `<div class="plcard"><div class="flbl">${ic('plan')}Plán pro tento lis</div>${items.sort(sortItems).map(it => {
    let a = '';
    if (it.type === 'run') a = !r ? `<button class="sm go" data-a="newrun" data-p="${esc(it.p)}">${ic('play')}Nasadit a rozjet</button>` : `<button class="sm" data-a="plq" data-p="${esc(it.p)}">${ic('plus')}Do pořadí</button>`;
    if (it.type === 'prep') a = !r ? `<button class="sm prep" data-a="newprep" data-p="${esc(it.p)}" data-run="${it.runDate ? it.runDate + '|' + it.runShift : ''}">${ic('wrench')}Připravit</button>` : `<button class="sm" data-a="plq" data-p="${esc(it.p)}">${ic('plus')}Do pořadí</button>`;
    if (it.type === 'start') a = r && r.state === 'prep' && same(r.p, it.p) ? `<button class="sm go" data-a="resume">${ic('play')}Rozjet</button>` : '';
    const late = skNum(it.date, it.shift) < curNum();
    return `<div class="plrow">${chk(false, `data-a="pldone" data-id="${it.id}"`, 'Označit jako splněné')}<div class="plmain"><div><span class="ptag t-${it.type}">${TYPES[it.type]}</span> <b>${esc(it.type === 'task' ? (it.time ? it.time + ' ' : '') + it.text : it.p)}</b>${late ? ' <em class="bad">z ' + shLabel(it.date, it.shift).toLowerCase() + '</em>' : ''}${it.note ? `<div class="pi-meta">${esc(it.note)}</div>` : ''}</div>${a ? `<div class="acts">${a}</div>` : ''}</div></div>`;
  }).join('')}</div>`;
}
function queueHtml(p, s, i) {
  const open = selQ === i, r = p.slots[0];
  let acts = '';
  if (open) {
    acts = `<div class="acts">
      ${!r ? `<button class="sm go" data-a="deploy" data-i="${i}">${ic('play')}Nasadit a rozjet</button><button class="sm prep" data-a="deployprep" data-i="${i}">${ic('wrench')}Jen připravit</button>` : ''}
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
    ${planCards(p)}
    ${runHtml(p)}
    ${openNotes(p.id).map(noteHtml).join('')}
    <div class="qhead"><span class="flbl">Další výrobky</span><span class="hint" style="margin:0">klepni pro možnosti · táhni za úchyt</span></div>
    ${q.map((s, k) => s ? queueHtml(p, s, k + 1) : '').join('')}
    ${q.some(x => !x) ? `<button class="addq" data-a="qadd">${ic('plus')}Přidat výrobek do pořadí</button>` : '<p class="hint" style="margin:0">Pořadí je plné (4 výrobky).</p>'}
    <button class="addq" data-a="note">${ic('note')}Přidat poznámku k lisu</button>`;
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
  if (!t.slots[0]) o += '<option value="0">Nasadit hned (běží)</option><option value="P">Nasadit, jen připravit</option>';
  sel.innerHTML = o;
}
function doMove() {
  const src = press(editId), item = src.slots[moveIdx];
  const t = press(+$('mvLis').value), pv = $('mvPos').value;
  if (!item || !t || !pv) return;
  if (moveIdx === 0 && item.state === 'run') { toast('Běžící výrobek nejdřív zastav nebo ukonči'); return; }
  let where;
  if (pv === '0' || pv === 'P') { if (t.slots[0]) return toast(t.name + ' není prázdný'); if (pv === '0') { makeRunning(t, item.p, null); where = 'běží'; } else { makePrepared(t, item.p, item.runAt || null); where = 'připraveno'; } }
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
    case 'note': return openNoteDlg(p);
    case 'sel': selQ = selQ === i ? null : i; moveIdx = null; drawSheet(); return;
    case 'newrun': return openEditor({ mode: 'newrun', preset: b.dataset.p });
    case 'newprep': return openEditor({ mode: 'prep', preset: b.dataset.p, run: b.dataset.run });
    case 'deployprep': return openEditor({ mode: 'deployprep', k: i });
    case 'plq': { const q = p.slots.slice(1).filter(Boolean); if (q.length >= 4) return toast('Pořadí je plné'); q.push({ p: b.dataset.p }); p.slots = [p.slots[0], ...q, null, null, null, null].slice(0, 5); return commit('z plánu do pořadí: ' + b.dataset.p); }
    case 'pldone': { const it = S.plan.find(x => x.id === b.dataset.id); if (it) { if (it.type === 'task') doneWithUndo(it); else fulfil(it); } return; }
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
  const withName = ['newrun', 'qadd', 'qedit', 'prep'].includes(o.mode);
  const withRun = ['prep', 'deployprep'].includes(o.mode);
  const withTime = ['newrun', 'deploy', 'time', 'resume'].includes(o.mode);
  const fixed = (o.mode === 'deploy' || o.mode === 'deployprep') ? p.slots[o.k].p : (o.mode === 'time' || o.mode === 'resume') ? r.p : '';
  const initName = o.mode === 'qedit' ? p.slots[o.k].p : (o.preset || '');
  const fin = ['newrun', 'deploy', 'resume'].includes(o.mode) ? finishFor(p.id, fixed || initName) : null, finAt = fin ? shiftEndTs(fin.date, fin.shift) : null;
  let mins = '';
  if (o.mode === 'time' && r.end) { const left = Math.round((r.end - Date.now()) / M); if (left > 0) mins = left; }
  const h = mins === '' ? '' : Math.floor(mins / 60), m = mins === '' ? '' : mins % 60;
  const title = { newrun: 'Nasadit a rozjet', deploy: 'Nasadit a rozjet', prep: 'Jen připravit', deployprep: 'Jen připravit', time: 'Změnit čas konce', resume: r && r.state === 'prep' ? 'Rozjet' : 'Opět spustit', qadd: 'Přidat do pořadí', qedit: 'Upravit výrobek' }[o.mode];
  const ok = withTime ? (o.mode === 'time' ? 'Uložit čas' : 'Potvrdit – běží') : withRun ? 'Potvrdit – připraveno' : (o.mode === 'qadd' ? 'Přidat do pořadí' : 'Uložit');
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
      <input type="datetime-local" id="edAt" value="${finAt ? toLocal(finAt) : o.mode === 'time' && r.end && mins === '' ? toLocal(r.end) : ''}">
      ${finAt ? `<p class="hint" style="margin:0">${ic('plan')} Podle plánu ukončit ${esc(finishLabel(fin))}, čas je předvyplněný.</p>` : ''}
      <div class="preview" id="edPrev"></div>` : ''}
    ${withRun ? `<p class="hint" style="margin:0">Nástroj se nasadí, ale výroba se nerozjede. Lis bude ve stavu <b>Připraveno</b>.</p>
      <span class="flbl">Kdy rozjet</span><select id="edRun">${shiftOptions(o.run || '')}</select>
      <p class="hint" style="margin:0">Když vybereš směnu, objeví se jí v plánu úkol „Rozjet“.</p>` : ''}
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
  if (k === 'psave') return savePlan(false);
  if (k === 'pnext') return savePlan(true);
  if (k === 'pdel') { PE.status = 'cancel'; PE.u = Date.now(); log(PE.lis, 'z plánu zrušeno: ' + planText(PE)); ED = null; PE = null; closeDlg2(); save(); renderAll(); return; }
  if (k === 'q') { const v = +b.dataset.v; $('edH').value = Math.floor(v / 60); $('edM').value = v % 60; $('edAt').value = ''; edPreview(); return; }
  if (k !== 'ok') return;
  const p = press(editId), o = ED, end = edEnd(), runAt = $('edRun') ? parseRunAt($('edRun').value) : null;
  let name = '';
  if ($('edP')) {
    name = $('edP').value.trim();
    if (!name) { toast('Vyber nebo napiš výrobek'); $('edP').focus(); return; }
    if (!$('edCatWrap').hidden && $('edCat').checked) addToCatalog(name);
  }
  ED = null; closeDlg2(); selQ = null;
  const t = end ? ', konec ' + fmtEnd(end) : '';
  switch (o.mode) {
    case 'newrun': makeRunning(p, name, end); commit('nasazeno ' + name + t); return toast(p.name + ': ' + name + ' běží');
    case 'prep': makePrepared(p, name, runAt); toast(p.name + ': ' + name + ' připraveno'); return commit('připraveno ' + name + (runAt ? ', rozjet ' + shLabel(runAt.date, runAt.shift) : ''));
    case 'deployprep': { const it = p.slots[o.k]; p.slots[o.k] = null; compactQueue(p); makePrepared(p, it.p, runAt); return commit('připraveno ' + it.p + (runAt ? ', rozjet ' + shLabel(runAt.date, runAt.shift) : '')); }
    case 'deploy': { const it = p.slots[o.k]; p.slots[o.k] = null; compactQueue(p); makeRunning(p, it.p, end); return commit('nasazeno ' + it.p + t); }
    case 'time': p.slots[0].end = end; return commit('čas konce ' + p.slots[0].p + ': ' + (end ? fmtEnd(end) : 'nezadán'));
    case 'resume': { const wasPrep = p.slots[0].state === 'prep'; Object.assign(p.slots[0], { state: 'run', end, since: Date.now() }); delete p.slots[0].note; delete p.slots[0].runAt; planOnRun(p, p.slots[0].p); commit((wasPrep ? 'rozjeto ' : 'opět spuštěno ') + p.slots[0].p + t); return toast(p.name + ': ' + p.slots[0].p + ' běží'); }
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
function openStateDlg(p, state, preset) {
  const r = p.slots[0];
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${state === 'end' ? 'Ukončit výrobu' : 'Zastavit výrobu'}</h3><button class="x" data-f2="close" aria-label="Zavřít">${ic('x')}</button></div>
    <p style="margin:0">${esc(p.name)}: <b>${esc(r.p)}</b></p>
    <span class="flbl">Důvod (nepovinné)</span>
    <div class="quick">${REASONS[state].map(t => `<button type="button" class="chip" data-f2="r" aria-pressed="false">${t}</button>`).join('')}</div>
    <input type="text" id="finR" value="${esc(preset || '')}" placeholder="Nebo napiš vlastní důvod">
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
      if (state === 'end') planOnEnd(p, r.p);
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
  const l = S.presses.map(p => [p.id, p.name, ...p.slots.map((s, k) => !s ? 0 : k > 0 ? [idx(s.p)] : [idx(s.p), rel(s.end), { run: 0, stop: 1, end: 2, prep: 3 }[s.state] || 0, s.note || '', rel(s.since), s.runAt ? s.runAt.date + '|' + s.runAt.shift : '']), p.idle ? [rel(p.idle.since), p.idle.last || ''] : 0]);
  const o = { t: t0, w: S.who || '', n: names, l };
  if (withCatalog) o.c = S.catalog;
  o.pl = packPlan(rel);
  o.fb = packFb(rel);
  o.sf = packStaff();
  o.nt = S.notes.filter(n => !n.done || Date.now() - n.doneT < 48 * H).slice(-60).map(n => [n.id, n.lis, n.text, n.who, rel(n.t), n.done ? 1 : 0, n.doneBy || '', rel(n.doneT)]);
  return o;
}
const PST = ['todo', 'done', 'cancel'];
function packPlan(rel) {
  return S.plan.filter(x => x.status === 'todo' || Date.now() - (x.u || 0) < 3 * 24 * H).map(x => [x.id, x.date, x.shift, x.type, x.lis, x.p, x.text, x.time, x.runDate || '', x.runShift || '', PST.indexOf(x.status), x.doneBy || '', rel(x.doneT), x.by || '', Math.round((x.u || 0) / 1000), x.note || '', rel(x.t)]);
}
function unpackPlan(a, abs) {
  return (a || []).map(x => ({ id: x[0], date: x[1], shift: x[2], type: x[3], lis: x[4], p: x[5], text: x[6], time: x[7], runDate: x[8], runShift: x[9], status: PST[x[10]] || 'todo', doneBy: x[11], doneT: abs(x[12]), by: x[13], u: x[14] > 1e9 ? x[14] * 1000 : abs(x[14]), note: x[15] || '', t: abs(x[16]) }));
}
function mergePlan(items) {
  let n = 0;
  (items || []).forEach(it => { const i = S.plan.findIndex(x => x.id === it.id); if (i < 0) { S.plan.push(it); n++; } else if ((it.u || 0) > (S.plan[i].u || 0) + 999) S.plan[i] = it; });
  return n;
}
const planPack = () => { const t0 = Math.floor(Date.now() / M); return { pp: 1, w: S.who || '', t: t0, pl: packPlan(t => t ? Math.round(t / M) - t0 : null), sf: packStaff() }; };
const planUnpack = o => ({ kind: 'plan', plan: unpackPlan(o.pl, v => v === null || v === undefined ? null : (o.t + v) * M), sf: unpackStaff(o.sf), who: o.w, t: o.t * M });
const catPack = () => ({ k: S.catalog, w: S.who || '', t: Math.floor(Date.now() / M) });
const catUnpack = o => ({ kind: 'cat', catalog: o.k || [], who: o.w, t: o.t * M });
function unpack(o) {
  const abs = v => v === null || v === undefined ? null : (o.t + v) * M;
  const presses = o.l.map(([id, name, ...rest]) => ({
    id, name,
    ...(rest[5] ? { idle: { since: abs(rest[5][0]), last: rest[5][1] } } : {}),
    slots: rest.slice(0, 5).map((s, k) => !s ? null : k > 0 ? { p: o.n[s[0]] }
      : Object.assign({ p: o.n[s[0]], end: abs(s[1]), state: ['run', 'stop', 'end', 'prep'][s[2]] || 'run', note: s[3] || '', since: abs(s[4]) }, s[5] ? { runAt: parseRunAt(s[5]) } : {}))
  }));
  const notes = (o.nt || []).map(a => ({ id: a[0], lis: a[1], text: a[2], who: a[3], t: abs(a[4]), done: !!a[5], doneBy: a[6], doneT: abs(a[7]) }));
  return { kind: 'shift', presses, catalog: o.c || [], notes, plan: unpackPlan(o.pl, abs), fb: unpackFb(o.fb, abs), sf: unpackStaff(o.sf), who: o.w, t: o.t * M };
}
async function decodeText(txt) {
  txt = (txt || '').trim();
  if (txt.startsWith('L2:')) {
    const o = JSON.parse(await inflate(b45dec(txt.slice(3))));
    return o.k ? catUnpack(o) : o.pp ? planUnpack(o) : o.fbo ? fbUnpack(o) : unpack(o);
  }
  if (txt.startsWith(PREFIX)) {
    const o = JSON.parse(LZString.decompressFromBase64(txt.slice(PREFIX.length)));
    return o.k ? catUnpack(o) : o.pp ? planUnpack(o) : unpack(o);
  }
  const o = JSON.parse(txt);
  if (o.app === 'lisy-hala') return unpack(o.data);
  if (o.app === 'lisy-katalog') return catUnpack(o.data);
  if (o.app === 'lisy-plan') return planUnpack(o.data);
  if (o.app === 'lisy-fb') return fbUnpack(o.data);
  throw new Error('neznámý formát');
}
function closeDlg2() { stopCam(); $('dlg2').close(); }
$('dlg2').addEventListener('close', stopCam);

const CHUNK = 420; // starý formát (LISY1): znaků na jeden QR kód
/* Úsporný formát L2 – BEZE ZTRÁTY: stejná data, jen komprese deflate a kódování base45,
   které přesně sedí do alfanumerického režimu QR kódu (místo base64 v bajtovém režimu). */
const CHUNK2 = 640; // znaků base45 na jeden kód – kód má stejnou hustotu jako dřív
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const HAS_CS = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
function b45enc(u8) {
  let o = '';
  for (let i = 0; i < u8.length; i += 2) {
    if (i + 1 < u8.length) { let x = u8[i] * 256 + u8[i + 1]; const a = x % 45; x = (x - a) / 45; const b = x % 45; o += B45[a] + B45[b] + B45[(x - b) / 45]; }
    else { const x = u8[i]; o += B45[x % 45] + B45[Math.floor(x / 45)]; }
  }
  return o;
}
function b45dec(s) {
  const out = [];
  for (let i = 0; i < s.length; i += 3) {
    const v = [...s.slice(i, i + 3)].map(c => { const k = B45.indexOf(c); if (k < 0) throw new Error('vadný znak'); return k; });
    if (v.length === 3) { const x = v[0] + v[1] * 45 + v[2] * 2025; if (x > 65535) throw new Error('vadná data'); out.push(x >> 8, x & 255); }
    else if (v.length === 2) { const x = v[0] + v[1] * 45; if (x > 255) throw new Error('vadná data'); out.push(x); }
    else throw new Error('vadná délka');
  }
  return new Uint8Array(out);
}
const deflate = async str => new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
const inflate = async u8 => await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
const payloadFor = kind => kind === 'cat' ? catPack() : kind === 'plan' ? planPack() : kind === 'fb' ? fbPack() : packState(false);
async function qrParts(kind) {
  const json = JSON.stringify(payloadFor(kind));
  if (!HAS_CS) { // starší telefon: původní formát
    const data = LZString.compressToBase64(json), id = Math.random().toString(36).slice(2, 6), n = Math.ceil(data.length / CHUNK), parts = [];
    for (let k = 0; k < n; k++) parts.push({ t: `${PREFIX}${id}:${k + 1}/${n}:${data.slice(k * CHUNK, (k + 1) * CHUNK)}`, mode: 'Byte' });
    return parts;
  }
  const data = b45enc(await deflate(json)), id = Math.random().toString(36).slice(2, 6).toUpperCase(), n = Math.ceil(data.length / CHUNK2), parts = [];
  for (let k = 0; k < n; k++) parts.push({ t: `L2:${id}:${k + 1}/${n}:${data.slice(k * CHUNK2, (k + 1) * CHUNK2)}`, mode: 'Alphanumeric' });
  return parts;
}
let qrTimer = null;
async function openGive(kind) {
  kind = kind === 'cat' || kind === 'plan' ? kind : 'shift';
  if (kind === 'shift' && !S.who) { showLogin(); return; }
  if (kind === 'cat' && !S.catalog.length) { toast('Katalog je prázdný'); return; }
  const svgs = (await qrParts(kind)).map(x => { const q = qrcode(0, 'M'); q.addData(x.t, x.mode); q.make(); return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); });
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${kind === 'cat' ? 'Sdílet katalog' : kind === 'plan' ? 'Sdílet plán' : 'Předat směnu'}</h3><button class="x" data-b="close" aria-label="Zavřít">${ic('x')}</button></div>
    <p class="hint" style="margin:0">${kind === 'cat' ? `Katalog má ${S.catalog.length} výrobků. Kolega v aplikaci dá <b>Katalog → Načíst katalog</b>` : kind === 'plan' ? 'Kolega v aplikaci dá <b>Plán → Načíst plán</b>' : 'Nástupce v aplikaci dá <b>Předání → Načíst od předchozí směny</b>'} a namíří telefon na kód.${svgs.length > 1 ? ' Kódy se samy střídají dokola. Když to nejde načíst, dej Pozastavit a přepínej ručně.' : ''} Jas displeje dej na maximum.</p>
    <div class="qrbox" id="qrbox"></div>
    ${svgs.length > 1 ? `<div class="qctl">
      <button class="icb" data-b="prev" aria-label="Předchozí kód">${ic('back')}</button>
      <div class="qno"><b id="qrno"></b><div class="qprog" id="qrdots"></div></div>
      <button class="icb" data-b="next" aria-label="Další kód">${ic('chev')}</button>
    </div>
    <button class="secondary" data-b="pause" id="qrPause">${ic('pause')}Pozastavit střídání</button>` : ''}
    <button class="secondary" data-b="file">Poslat jako soubor (WhatsApp, e-mail…)</button>`;
  let k = 0;
  const n = svgs.length;
  const show = () => {
    $('qrbox').innerHTML = svgs[k];
    if ($('qrno')) { $('qrno').textContent = 'Kód ' + (k + 1) + ' z ' + n; $('qrdots').innerHTML = svgs.map((_, i) => `<i class="${i === k ? 'cur' : ''}"></i>`).join(''); }
  };
  const auto = on => {
    if (qrTimer) clearInterval(qrTimer); qrTimer = null;
    if (on && n > 1) qrTimer = setInterval(() => { k = (k + 1) % n; show(); }, 1200);
    if ($('qrPause')) $('qrPause').innerHTML = on ? ic('pause') + 'Pozastavit střídání' : ic('play') + 'Spustit střídání';
  };
  show(); auto(true);
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    const a = b.dataset.b;
    if (a === 'close') closeDlg2();
    if (a === 'file') shareFile(kind);
    if (a === 'pause') auto(!qrTimer);
    if (a === 'prev' || a === 'next') { auto(false); k = (k + (a === 'next' ? 1 : n - 1)) % n; show(); }
  };
}
async function shareFile(kind) {
  const d = new Date(), name = `${kind === 'cat' ? 'katalog' : kind === 'plan' ? 'plan' : kind === 'fb' ? 'hlaseni' : 'predani'}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const body = JSON.stringify(kind === 'fb' ? { app: 'lisy-fb', v: 1, data: fbPack() } : kind === 'cat' ? { app: 'lisy-katalog', v: 1, data: catPack() } : kind === 'plan' ? { app: 'lisy-plan', v: 1, data: planPack() } : { app: 'lisy-hala', v: 1, data: packState(true) });
  const file = new File([body], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: kind === 'fb' ? 'Hlášení problémů' : kind === 'cat' ? 'Katalog výrobků' : kind === 'plan' ? 'Plán směn' : 'Předání směny' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove();
  toast('Soubor uložen do Stažených');
}

let camStream = null, camTimer = null;
function stopCam() { if (qrTimer) clearInterval(qrTimer); qrTimer = null; if (camTimer) clearInterval(camTimer); camTimer = null; if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; }
function openTake(kind) {
  $('sheet2').innerHTML = `<div class="sh-head"><h3>${kind === 'fb' ? 'Načíst hlášení' : kind === 'cat' ? 'Načíst katalog' : kind === 'plan' ? 'Načíst plán' : 'Načíst směnu'}</h3><button class="x" data-b="close" aria-label="Zavřít">${ic('x')}</button></div>
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
      const m = txt && txt.match(/^(LISY1|L2):(\w+):(\d+)\/(\d+):(.*)$/s);
      if (m) {
        if (got.id !== m[1] + m[2]) { got.id = m[1] + m[2]; got.parts = {}; }
        got.parts[m[3]] = m[5];
        const n = +m[4], have = Object.keys(got.parts).length;
        if (have >= n) {
          stopCam(); v.hidden = true;
          let data = ''; for (let k = 1; k <= n; k++) data += got.parts[k];
          previewImport(m[1] + ':' + data);
        } else $('takeMsg').innerHTML = `<div class="qprog big">${Array.from({ length: n }, (_, i) => `<i class="${got.parts[i + 1] ? 'on' : ''}">${i + 1}</i>`).join('')}</div>
          <p class="hint" style="text-align:center">Načteno <b>${have} z ${n}</b> kódů, drž telefon namířený…</p>`;
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
async function previewImport(txt) {
  try { pending = await decodeText(txt); } catch (e) { $('takeMsg').innerHTML = '<p class="hint">Tohle není předání ani katalog z aplikace Lisy.</p>'; return; }
  if (pending.kind === 'fb') {
    const nw = pending.fb.filter(x => !S.fb.some(y => y.id === x.id)).length;
    $('takeMsg').innerHTML = `<div class="preview">Hlášení od: <b>${esc(pending.who || '?')}</b>, ${fmtEnd(pending.t)}<br>Hlášení: <b>${pending.fb.length}</b>, nových: <b>${nw}</b></div><button class="primary" data-b="apply">Načíst hlášení</button>`;
    return;
  }
  if (pending.kind === 'plan') {
    const nw = pending.plan.filter(x => !S.plan.some(y => y.id === x.id)).length, todo = pending.plan.filter(x => x.status === 'todo').length;
    $('takeMsg').innerHTML = `<div class="preview">Plán od: <b>${esc(pending.who || '?')}</b>, ${fmtEnd(pending.t)}<br>Položek: <b>${pending.plan.length}</b> (nesplněných ${todo}), nových pro tebe: <b>${nw}</b></div>
      <p class="hint">Plán se spojí s tvým. Nic se nesmaže.</p><button class="primary" data-b="apply">Načíst plán</button>`;
    return;
  }
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
    Obsazených lisů: <b>${used}</b> z ${pending.presses.length}${pending.plan && pending.plan.filter(x => x.status === 'todo').length ? `<br>Nesplněné položky plánu: <b>${pending.plan.filter(x => x.status === 'todo').length}</b>` : ''}${pending.notes && pending.notes.filter(n => !n.done).length ? `<br>Otevřené poznámky: <b>${pending.notes.filter(n => !n.done).length}</b>` : ''}${pending.catalog.length ? `<br>Katalog: ${pending.catalog.length} výrobků (doplní se k tvému)` : ''}${pending.fb && pending.fb.length ? `<br>Hlášení problémů: <b>${pending.fb.length}</b>` : ''}
    ${older ? '<br><b style="color:var(--crit)">Pozor: tvoje data v telefonu jsou novější než tohle předání.</b>' : ''}</div>
    <p class="hint">Stav lisů v tomto telefonu se nahradí předaným stavem.</p>
    <button class="primary" data-b="apply">Převzít směnu</button>`;
}
function applyImport() {
  if (!pending) return;
  if (pending.kind === 'fb') { const n = mergeFb(pending.fb); pending = null; save(); fbBadge(); closeDlg2(); toast('Načteno, nových hlášení: ' + n); return; }
  if (pending.kind === 'plan') { mergeStaff(pending.sf); const n = mergePlan(pending.plan); pending.plan.forEach(x => x.p && addToCatalog(x.p)); pending = null; save(); renderAll(); closeDlg2(); toast('Plán načten, nových položek: ' + n); return; }
  if (pending.kind === 'cat') {
    const before = S.catalog.length; pending.catalog.forEach(addToCatalog);
    const n = S.catalog.length - before;
    pending = null; save(); renderAll(); closeDlg2(); toast('Přidáno ' + n + ' výrobků do katalogu'); return;
  }
  S.presses = pending.presses;
  mergePlan(pending.plan);
  mergeFb(pending.fb);
  mergeStaff(pending.sf);
  (pending.notes || []).forEach(n => { const i = S.notes.findIndex(x => x.id === n.id); if (i < 0) S.notes.push(n); else S.notes[i] = n; });
  pending.catalog.forEach(addToCatalog);
  pending.presses.forEach(p => p.slots.forEach(s => s && addToCatalog(s.p)));
  S.from = { who: pending.who, t: pending.t };
  log(pending.presses[0].id, 'převzata směna od ' + (pending.who || '?'));
  pending = null; save(); renderAll(); closeDlg2(); toast('Směna převzata');
}

/* ============ Global UI ============ */
function toast(t, undo) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const e = document.createElement('div'); e.className = 'toast' + (undo ? ' undo' : '');
  e.innerHTML = `<span>${esc(t)}</span>` + (undo ? '<button>Vrátit</button>' : '');
  if (undo) e.querySelector('button').onclick = () => { undo(); e.remove(); };
  const host = [...document.querySelectorAll('dialog')].reverse().find(d => d.open) || document.body;
  host.append(e); setTimeout(() => e.remove(), undo ? 5000 : 2200);
}
const chk = (on, attrs, label) => `<button class="chk ${on ? 'on' : ''}" ${attrs} aria-label="${label}" title="${label}">${on ? ic('done') : ''}</button>`;
function doneWithUndo(it) {
  markDone(it); save(); renderAll();
  toast('Označeno jako splněné', () => { it.status = 'todo'; delete it.doneBy; delete it.doneT; it.u = Date.now(); save(); renderAll(); });
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) return openSheet(+o.dataset.open);
  const f = e.target.closest('[data-f]');
  if (f && (f.classList.contains('stat') || f.classList.contains('stat-reset'))) {
    filter = f.dataset.f; document.querySelectorAll('.stat').forEach(x => x.setAttribute('aria-pressed', x.dataset.f === filter)); renderGrid();
    if ($('v-hala').hidden) document.querySelector('nav [data-v="hala"]').click();
    return;
  }
  const v = e.target.closest('nav [data-v]');
  if (v) {
    document.querySelectorAll('nav [data-v]').forEach(x => x === v ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
    if (v.dataset.v === 'plan') { PV = shiftKey(); renderPlan(); }
    ['hala', 'plan', 'predani', 'poznamky', 'katalog'].forEach(n => $('v-' + n).hidden = n !== v.dataset.v);
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
$('btnGive').addEventListener('click', () => openGive('shift'));
$('btnTake').addEventListener('click', () => openTake('shift'));
$('btnCatGive').addEventListener('click', () => openGive('cat'));
$('plAdd').addEventListener('click', () => openPlanEditor(null));
$('plPaste').addEventListener('click', openPaste);
$('plShare').addEventListener('click', () => openGive('plan'));
$('plLoad').addEventListener('click', () => openTake('plan'));
$('plPrev').addEventListener('click', () => { PV = { date: addDays(PV.date, -1), shift: PV.shift }; renderPlan(); });
$('plNext').addEventListener('click', () => { PV = { date: addDays(PV.date, 1), shift: PV.shift }; renderPlan(); });
$('plToday').addEventListener('click', () => { PV = shiftKey(); renderPlan(); });
setInterval(() => { if ($('login').hidden) checkAlarms(); }, 20000);
setTimeout(() => { if ($('login').hidden) checkAlarms(); }, 3000);
$('btnCatTake').addEventListener('click', () => openTake('cat'));

/* vzhled: auto (podle telefonu) / světlý / tmavý */
const THEMES = { auto: ['auto', 'Vzhled podle telefonu'], light: ['sun', 'Světlý vzhled'], dark: ['moon', 'Tmavý vzhled'] };
function applyTheme(t, announce) {
  if (!THEMES[t]) t = 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0a0e12' : '#121820';
  try { localStorage.setItem('lisy-theme', t); } catch (e) {}
  if (announce) toast(THEMES[t][1]);
}
let theme = 'auto'; try { theme = localStorage.getItem('lisy-theme') || 'auto'; } catch (e) {}
applyTheme(theme);

/* ============ Zpětná vazba (hlášení problémů a nápadů) ============ */
const FBT = { bug: 'Chyba', idea: 'Nápad', ux: 'Nepřehledné' };
const FBS = { new: 'Nové', ack: 'Převzato', fixed: 'Opraveno' };
const isAdmin = () => !!(USERS.find(u => u.name === S.who) || {}).admin;
const adminName = () => (USERS.find(u => u.admin) || { name: 'správce' }).name;
function curScreen() {
  const v = document.querySelector('nav [aria-current="page"]'), d = [...document.querySelectorAll('dialog')].reverse().find(x => x.open);
  const h = d && d.querySelector('h3'); return (v ? v.textContent.replace(/\d+/g, '').trim() : '') + (h ? ' › ' + h.textContent.trim() : '');
}
function phoneInfo() {
  const ua = navigator.userAgent, m = ua.match(/Android [\d.]+[^;)]*;\s*([^;)]+)/) || ua.match(/(iPhone|iPad)[^;)]*/);
  const os = (ua.match(/Android [\d.]+|iPhone OS [\d_]+|CPU OS [\d_]+/) || [''])[0].replace(/_/g, '.');
  return [m ? m[1] || m[0] : '', os, (ua.match(/(Chrome|Firefox|Safari|SamsungBrowser)\/[\d.]+/) || [''])[0]].filter(Boolean).join(' · ') + ' · ' + innerWidth + '×' + innerHeight;
}
const fbOpen = () => S.fb.filter(x => x.status !== 'fixed');
function fbBadge() {
  const n = S.fb.filter(x => x.status === 'new').length;
  $('userBtn').classList.toggle('has-fb', isAdmin() && n > 0); $('userBtn').dataset.n = n;
}
function openReport(screen) {
  ED = null; $('sheet2').onclick = null;
  const where = screen || curScreen();
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Nahlásit problém</h3><button class="x" data-fb="close" aria-label="Zavřít">${ic('x')}</button></div>
    <p class="hint" style="margin:0">Hlášení se předává se směnou, dokud nedojde k ${esc(adminName())}. Uvidí ho všichni.</p>
    <div class="seg" id="fbType">${Object.entries(FBT).map(([k, v], i) => `<button type="button" data-fbt="${k}" aria-pressed="${i === 0}">${ic({ bug: 'bell', idea: 'plus', ux: 'grid' }[k])}${v}</button>`).join('')}</div>
    <span class="flbl">Co se stalo nebo co by pomohlo</span>
    <textarea id="fbText" rows="5" placeholder="Např. po klepnutí na Rozjet se nic nestalo, nebo: chtělo by to…"></textarea>
    <div class="preview fb-auto">${ic('note')}<span>Automaticky se připojí: ${esc(S.who || '?')}, čas, verze ${VERSION}, telefon a obrazovka „${esc(where || '—')}“.</span></div>
    <div class="acts end"><button class="secondary" data-fb="close">Zrušit</button><button class="primary" data-fb="send">Odeslat hlášení</button></div>`;
  $('dlg2').showModal(); setTimeout(() => $('fbText').focus(), 60);
  $('sheet2').onclick = e => {
    const t = e.target.closest('[data-fbt]');
    if (t) { $('fbType').querySelectorAll('[data-fbt]').forEach(x => x.setAttribute('aria-pressed', x === t)); return; }
    const b = e.target.closest('[data-fb]'); if (!b) return;
    if (b.dataset.fb === 'close') return closeDlg2();
    const text = $('fbText').value.trim(); if (!text) { toast('Napiš, co se stalo'); return; }
    const type = $('fbType').querySelector('[aria-pressed="true"]').dataset.fbt;
    S.fb.push({ id: pid(), type, text, who: S.who || '', t: Date.now(), u: Date.now(), ver: VERSION, phone: phoneInfo(), screen: where, status: 'new' });
    save(); fbBadge(); closeDlg2(); toast('Díky, hlášení uloženo. Předá se se směnou.');
  };
}
function fbHtml(x) {
  const admin = isAdmin();
  return `<div class="fbi st-${x.status}">
    <div class="fb-top"><span class="ptag t-fb-${x.type}">${FBT[x.type]}</span><span class="fb-st">${FBS[x.status]}${x.status === 'fixed' && x.fixedVer ? ' ve verzi ' + esc(x.fixedVer) : ''}</span></div>
    <div class="fb-text">${esc(x.text)}</div>
    <div class="pi-meta">${esc(x.who || '?')} · ${fmtEnd(x.t)} · verze ${esc(x.ver)}${x.screen ? ' · ' + esc(x.screen) : ''}</div>
    ${admin ? `<div class="pi-meta">${esc(x.phone || '')}</div>` : ''}
    ${x.reply ? `<div class="fb-reply">${ic('swap')}<span><b>${esc(x.by || adminName())}:</b> ${esc(x.reply)}</span></div>` : ''}
    ${admin ? `<div class="acts">
      ${x.status === 'new' ? `<button class="sm" data-fba="ack" data-id="${x.id}">${ic('done')}Převzato</button>` : ''}
      ${x.status !== 'fixed' ? `<button class="sm go" data-fba="fixed" data-id="${x.id}">${ic('done')}Opraveno ve verzi ${VERSION}</button>` : `<button class="sm" data-fba="reopen" data-id="${x.id}">Znovu otevřít</button>`}
      <button class="sm" data-fba="reply" data-id="${x.id}">${ic('note')}Odpovědět</button>
    </div>` : ''}
  </div>`;
}
function openFeedback() {
  ED = null; $('sheet2').onclick = null;
  const admin = isAdmin(), list = S.fb.slice().sort((a, b) => (a.status === 'fixed') - (b.status === 'fixed') || b.t - a.t);
  const nNew = S.fb.filter(x => x.status === 'new').length;
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Zpětná vazba</h3><button class="x" data-fbm="close" aria-label="Zavřít">${ic('x')}</button></div>
    <button class="primary" data-fbm="new">${ic('plus')}Nahlásit problém nebo nápad</button>
    ${admin ? `<div class="bigbtns two" style="margin:0">
      <button class="secondary" data-fbm="copy">${ic('list')}Zkopírovat</button>
      <button class="secondary" data-fbm="load">${ic('scan')}Načíst soubor</button></div>
      <p class="hint" style="margin:0">Jsi správce. Nových hlášení: <b>${nNew}</b>. „Zkopírovat“ zkopíruje všechna nevyřešená jako text pro úpravu aplikace.</p>`
      : `<button class="secondary" data-fbm="send">${ic('share')}Poslat hlášení ${esc(adminName())} hned (WhatsApp…)</button>`}
    <div class="list" style="margin:0">${list.map(fbHtml).join('') || '<p class="hint">Zatím žádná hlášení.</p>'}</div>`;
  $('dlg2').showModal();
  $('sheet2').onclick = async e => {
    const a = e.target.closest('[data-fba]');
    if (a) {
      const x = S.fb.find(y => y.id === a.dataset.id); if (!x) return;
      const k = a.dataset.fba;
      if (k === 'ack') x.status = 'ack';
      if (k === 'fixed') { x.status = 'fixed'; x.fixedVer = VERSION; }
      if (k === 'reopen') x.status = 'ack';
      if (k === 'reply') {
        const box = a.closest('.fbi'); if (box.querySelector('.fb-rin')) return;
        box.insertAdjacentHTML('beforeend', `<div class="fb-rin"><input type="text" placeholder="Odpověď pro všechny" value="${esc(x.reply || '')}"><button class="sm go" data-fba="rsave" data-id="${x.id}">Uložit</button></div>`);
        box.querySelector('.fb-rin input').focus(); return;
      }
      if (k === 'rsave') { x.reply = a.closest('.fb-rin').querySelector('input').value.trim(); }
      x.by = S.who; x.u = Date.now(); save(); fbBadge(); openFeedback(); return;
    }
    const b = e.target.closest('[data-fbm]'); if (!b) return;
    const k = b.dataset.fbm;
    if (k === 'close') return closeDlg2();
    if (k === 'new') return openReport('Zpětná vazba');
    if (k === 'send') return shareFile('fb');
    if (k === 'load') { closeDlg2(); openTake('fb'); $('fileIn').click(); return; }
    if (k === 'copy') {
      const txt = fbOpen().map((x, i) => `${i + 1}. [${FBT[x.type]}] ${x.text}\n   (${x.who}, ${fmtEnd(x.t)}, verze ${x.ver}, obrazovka: ${x.screen || '—'}, telefon: ${x.phone || '—'})`).join('\n\n') || 'Žádná nevyřešená hlášení.';
      try { await navigator.clipboard.writeText(txt); toast('Zkopírováno, vlož to do chatu'); }
      catch (err) { const t = document.createElement('textarea'); t.value = txt; t.className = 'fb-copy'; b.after(t); t.select(); toast('Označ text a zkopíruj ho'); }
    }
  };
}
const FBF = ['bug', 'idea', 'ux'], FBSF = ['new', 'ack', 'fixed'];
function packFb(rel) {
  return S.fb.filter(x => x.status !== 'fixed' || Date.now() - (x.u || 0) < 5 * 24 * H)
    .map(x => [x.id, FBF.indexOf(x.type), x.text, x.who, rel(x.t), Math.round((x.u || 0) / 1000), x.ver, x.phone || '', x.screen || '', FBSF.indexOf(x.status), x.fixedVer || '', x.by || '', x.reply || '']);
}
function unpackFb(a, abs) {
  return (a || []).map(x => ({ id: x[0], type: FBF[x[1]] || 'bug', text: x[2], who: x[3], t: abs(x[4]), u: (x[5] || 0) * 1000, ver: x[6], phone: x[7], screen: x[8], status: FBSF[x[9]] || 'new', fixedVer: x[10], by: x[11], reply: x[12] }));
}
function mergeFb(items) {
  let n = 0;
  const rk = s => FBSF.indexOf(s);
  (items || []).forEach(it => { const i = S.fb.findIndex(x => x.id === it.id); if (i < 0) { S.fb.push(it); n++; } else if ((it.u || 0) > (S.fb[i].u || 0) + 999 || rk(it.status) > rk(S.fb[i].status) || (it.reply && !S.fb[i].reply)) S.fb[i] = it; });
  return n;
}
const fbPack = () => { const t0 = Math.floor(Date.now() / M); return { fbo: 1, w: S.who || '', t: t0, fb: packFb(t => t ? Math.round(t / M) - t0 : null) }; };
const fbUnpack = o => ({ kind: 'fb', fb: unpackFb(o.fb, v => v === null || v === undefined ? null : (o.t + v) * M), who: o.w, t: o.t * M });

/* ============ Přihlášení ============ */
const SESSION_H = 12; // po kolika hodinách se znovu ptá na PIN
let USERS = [];
function avHue(n) { let h = 0; for (const ch of n || '') h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
function setAv(el, n) { if (!el) return; el.textContent = (n || '?').slice(0, 1); el.style.setProperty('--h', avHue(n)); }
async function sha256(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function loadUsers() {
  try { const r = await fetch('users.json', { cache: 'no-cache' }); const j = await r.json(); USERS = j.users || []; localStorage.setItem('lisy-users', JSON.stringify(USERS)); }
  catch (e) { try { USERS = JSON.parse(localStorage.getItem('lisy-users')) || []; } catch (e2) { USERS = []; } }
}
function getSession() { try { const s = JSON.parse(localStorage.getItem('lisy-session')); if (s && Date.now() - s.t < SESSION_H * H) return s; } catch (e) {} return null; }
let lgUser = null, lgPin = '';
function showLogin(step) {
  $('login').hidden = false; $('lgFoot').textContent = 'verze ' + VERSION;
  let last = ''; try { last = localStorage.getItem('lisy-last-user') || ''; } catch (e) {}
  $('lgNames').innerHTML = USERS.length ? USERS.map(u => `<button data-user="${esc(u.name)}" class="${u.name === last ? 'last' : ''}"><span class="av" style="--h:${avHue(u.name)}">${esc(u.name.slice(0, 1))}</span><span>${esc(u.name)}${u.role === 'mistr' ? '<small class="lg-role">mistr</small>' : ''}</span></button>`).join('')
    : '<p class="lg-sub">Seznam uživatelů se nepodařilo načíst. Připoj se k internetu a otevři aplikaci znovu.</p>';
  if (step === 'pin' && lgUser) return pinStep(lgUser);
  $('lgStep1').hidden = false; $('lgStep2').hidden = true;
}
function pinStep(name) {
  lgUser = name; lgPin = ''; $('lgName').textContent = name; setAv($('lgAv'), name);
  $('lgStep1').hidden = true; $('lgStep2').hidden = false; $('lgErr').textContent = ''; drawDots();
}
function drawDots() { [...$('lgDots').children].forEach((d, i) => d.classList.toggle('on', i < lgPin.length)); }
async function pinKey(k) {
  if (k === 'del') lgPin = lgPin.slice(0, -1);
  else if (lgPin.length < 4) lgPin += k;
  $('lgErr').textContent = ''; drawDots();
  if (lgPin.length < 4) return;
  const u = USERS.find(x => x.name === lgUser), ok = u && u.pin === await sha256('lisy:' + lgUser + ':' + lgPin);
  if (!ok) {
    $('lgDots').classList.remove('bad'); void $('lgDots').offsetWidth; $('lgDots').classList.add('bad');
    $('lgErr').textContent = 'Špatný PIN, zkus to znovu.'; lgPin = ''; setTimeout(drawDots, 350); return;
  }
  try { localStorage.setItem('lisy-session', JSON.stringify({ name: lgUser, t: Date.now() })); localStorage.setItem('lisy-last-user', lgUser); } catch (e) {}
  S.who = lgUser; save(); $('login').hidden = true; setAv($('userAv'), S.who); fbBadge(); renderAll(); toast('Přihlášen: ' + S.who);
}
$('lgPad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k => k === '' ? '<span></span>'
  : k === 'del' ? `<button class="fn" data-k="del" aria-label="Smazat číslici">${ic('del')}</button>` : `<button data-k="${k}">${k}</button>`).join('');
$('lgPad').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) pinKey(b.dataset.k); });
$('lgNames').addEventListener('click', e => { const b = e.target.closest('[data-user]'); if (b) pinStep(b.dataset.user); });
$('lgBack').addEventListener('click', () => { lgUser = null; showLogin(); });
document.addEventListener('keydown', e => { if ($('login').hidden || $('lgStep2').hidden) return; if (/^[0-9]$/.test(e.key)) pinKey(e.key); if (e.key === 'Backspace') pinKey('del'); });
function logout() {
  try { localStorage.removeItem('lisy-session'); } catch (e) {}
  if ($('dlg2').open) closeDlg2(); if ($('dlg').open) $('dlg').close();
  S.who = ''; save(); lgUser = null; showLogin();
}
/* velikost písma (každý telefon zvlášť) */
const FS = ['Normální', 'Větší', 'Největší'];
let fsLevel = 1; try { fsLevel = +localStorage.getItem('lisy-fs') || 1; } catch (e) {}
function setFs(n) {
  fsLevel = n;
  if (n > 1) document.documentElement.setAttribute('data-fs', n); else document.documentElement.removeAttribute('data-fs');
  try { if (n > 1) localStorage.setItem('lisy-fs', n); else localStorage.removeItem('lisy-fs'); } catch (e) {}
  $('lgFsT').textContent = n === 3 ? 'Normální písmo' : n === 2 ? 'Ještě větší písmo' : 'Větší písmo';
}
setFs(fsLevel);
$('lgFs').addEventListener('click', () => setFs(fsLevel % 3 + 1));
let MENU_FROM = '';
function openUserMenu() {
  MENU_FROM = curScreen();
  $('sheet2').onclick = null;
  const s = getSession();
  $('sheet2').innerHTML = `<div class="sh-head"><h3>Uživatel</h3><button class="x" data-u="close" aria-label="Zavřít">${ic('x')}</button></div>
    <div class="me"><span class="av av-lg" style="--h:${avHue(S.who)}">${esc((S.who || '?').slice(0, 1))}</span><div><b>${esc(S.who || '—')}</b><div class="hint" style="margin:0">přihlášen ${s ? fmtEnd(s.t) : ''} · znovu PIN za ${SESSION_H} h</div></div></div>
    <span class="flbl">Vzhled</span>
    <div class="seg">${Object.entries(THEMES).map(([k, v]) => `<button data-u="theme" data-t="${k}" aria-pressed="${k === theme}">${ic(v[0])}${{ auto: 'Podle telefonu', light: 'Světlý', dark: 'Tmavý' }[k]}</button>`).join('')}</div>
    <span class="flbl">Velikost písma</span>
    <div class="seg fsseg">${FS.map((x, i) => `<button data-u="fs" data-fs="${i + 1}" class="s${i + 1}" aria-pressed="${i + 1 === fsLevel}">Aa<span style="font-weight:600;font-size:.8rem">${x}</span></button>`).join('')}</div>
    <span class="flbl">Zpětná vazba</span>
    <div class="bigbtns two" style="margin:0">
      <button class="secondary" data-u="report">${ic('bell')}Nahlásit problém</button>
      <button class="secondary" data-u="fb">${ic('list')}Hlášení${S.fb.length ? ` <span class="cnt2 ${isAdmin() && S.fb.some(x => x.status === 'new') ? 'red' : ''}">${isAdmin() ? S.fb.filter(x => x.status === 'new').length || S.fb.length : fbOpen().length || S.fb.length}</span>` : ''}</button>
    </div>
    <button class="secondary" data-u="logout">${ic('logout')}Odhlásit</button>
    <button class="secondary" data-u="update">${ic('swap')}Načíst nejnovější verzi</button>
    <p class="hint" style="margin:0;text-align:center">Lisy na hale · verze ${VERSION}</p>`;
  $('dlg2').showModal();
  $('sheet2').onclick = e => {
    const b = e.target.closest('[data-u]'); if (!b) return;
    if (b.dataset.u === 'close') closeDlg2();
    if (b.dataset.u === 'logout') logout();
    if (b.dataset.u === 'report') openReport(MENU_FROM);
    if (b.dataset.u === 'fb') openFeedback();
    if (b.dataset.u === 'update') { closeDlg2(); $('bootBtn').click(); }
    if (b.dataset.u === 'fs') { setFs(+b.dataset.fs); $('sheet2').querySelectorAll('[data-u="fs"]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.fs === fsLevel)); }
    if (b.dataset.u === 'theme') { theme = b.dataset.t; applyTheme(theme); $('sheet2').querySelectorAll('[data-u="theme"]').forEach(x => x.setAttribute('aria-pressed', x.dataset.t === theme)); }
  };
}
$('userBtn').addEventListener('click', openUserMenu);
document.querySelectorAll('[data-ic]').forEach(el => el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic)));
renderAll();
const s0 = getSession();
if (s0) { S.who = s0.name; $('login').hidden = true; setAv($('userAv'), S.who); renderAll(); }
(async () => {
  await loadUsers();
  const s = getSession();
  if (s && (USERS.some(u => u.name === s.name) || !USERS.length)) { S.who = s.name; $('login').hidden = true; setAv($('userAv'), S.who); fbBadge(); renderAll(); }
  else { try { lgUser = localStorage.getItem('lisy-last-user'); } catch (e) {} showLogin(lgUser && USERS.some(u => u.name === lgUser) ? 'pin' : undefined); }
})();
setInterval(() => { if (!$('login').hidden) return; const s = getSession(); if (!s) { lgUser = S.who; showLogin('pin'); } }, 60000);
setInterval(() => { if (!$('dlg').open && !$('dlg2').open) { renderHeader(); renderGrid(); renderHandover(); } }, 30000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
