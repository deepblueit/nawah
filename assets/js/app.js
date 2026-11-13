// The shell of نواة: start-up, who is using it, the menu, the top bar, the router,
// the quick search, the bell, and the first-run screens.
import { store } from './core/store.js';
import { sync, syncSteps, TOKEN_URL } from './core/sync.js';
import { ctx, members, member, memberName, can, flag, settings } from './core/ctx.js';
import { useRoles, BUILTIN_ROLES } from './core/perms.js';
import { wire, onAct, onForm, onChange, onInput } from './core/actions.js';
import { html, raw } from './core/html.js';
import { icon, nawahMark } from './core/icons.js';
import { toast, drawer, closeDrawer, modal, closeModal, btn, editRecord, avatar, confirmBox } from './core/ui.js';
import { SECTIONS, NAV, BOTTOM, canOpen, navList } from './core/nav.js';
import { local, matches, normalize, ago, fmtDate, fmtHijri, today, readFile } from './core/util.js';
import { DEFAULT_SETTINGS, SETUP_TEMPLATE, NAWAH_SKILLS, ROLES } from './seed.js';
import { needsYou, approvalsWaiting } from './sections/shared.js';

import './sections/home.js';
import './sections/work.js';
import './sections/company.js';
import './sections/finance.js';
import './sections/marketing.js';
import './sections/nawah.js';
import './sections/system.js';

const $ = sel => document.querySelector(sel);
const root = () => document.getElementById('app');

useRoles(() => {
  const saved = store.all('roles');
  return saved.length ? saved : BUILTIN_ROLES;
});

// ---------- routing

function parseRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, qs = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const key = parts.shift() || 'home';
  return { key, parts, query: Object.fromEntries(new URLSearchParams(qs)) };
}

const routeHash = r => {
  const qs = new URLSearchParams(Object.entries(r.query).filter(([, v]) => v !== '' && v != null)).toString();
  return `#/${[r.key, ...r.parts].join('/')}${qs ? '?' + qs : ''}`;
};

export function setQuery(patch) {
  const r = { ...ctx.route, query: { ...ctx.route.query, ...patch } };
  history.replaceState(null, '', routeHash(r));
  ctx.route = r;
  renderMain();
}

ctx.go = hash => {
  if (location.hash === hash) renderMain(); else location.hash = hash;
};
ctx.toast = toast;
ctx.setQuery = setQuery;

// ---------- preferences (per person, kept on their record so they follow them)

const PREF_DEFAULTS = { theme: 'light', accent: 'mint', side: 'paper', size: 'normal', density: 'comfortable', motion: 'on', collapsed: false, hide: [] };
export const prefs = () => ({ ...PREF_DEFAULTS, ...(ctx.me?.prefs || {}) });

const media = window.matchMedia('(prefers-color-scheme: dark)');
function applyPrefs() {
  const p = prefs();
  const d = document.documentElement;
  const dark = p.theme === 'dark' || (p.theme === 'auto' && media.matches);
  d.dataset.theme = dark ? 'dark' : 'light';
  d.dataset.accent = p.accent;
  d.dataset.side = p.side;
  d.dataset.size = p.size;
  d.dataset.density = p.density;
  d.dataset.motion = p.motion;
  document.body.classList.toggle('collapsed', !!p.collapsed);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1F33' : '#F2F5F0');
}
media.addEventListener?.('change', applyPrefs);

export function savePrefs(patch) {
  if (!ctx.me) return;
  ctx.me = store.patch('members', ctx.me.id, { prefs: { ...prefs(), ...patch } }, { log: false });
  applyPrefs();
}

// ---------- start

async function boot() {
  wire(document);
  const space = local.get('nawah.space', 'real');
  await store.open(space);
  if (store.memory) document.body.classList.add('no-storage');
  window.addEventListener('hashchange', () => { ctx.route = parseRoute(); renderMain(); closeNavDrawer(); });
  window.addEventListener('pagehide', () => store.flushNow());
  document.addEventListener('keydown', keys);
  let t;
  store.on(ev => {
    if (ev.source === 'local') sync.soon();
    if (ev.col === 'members' && ctx.me) ctx.me = store.get('members', ctx.me.id) || ctx.me;
    clearTimeout(t);
    t = setTimeout(() => { if (ctx.me) { renderNav(); renderMain(); renderTop(); } }, 30);
  });
  sync.on(renderSync);
  start();
}

async function start() {
  ctx.route = parseRoute();
  if (store.space === 'demo' && store.isEmpty()) {
    const { buildDemo } = await import('./demo.js');
    buildDemo(store);
    local.set('nawah.me.demo', members()[0]?.id);
  }
  if (store.space === 'real' && store.isEmpty() && !sync.enabled()) return welcome();
  const id = local.get(`nawah.me.${store.space}`);
  const me = id && store.get('members', id);
  if (!me) {
    if (store.isEmpty() && sync.enabled()) { sync.start(); return waitForData(); }
    return pickMember();
  }
  if (me.pin && sessionStorage.getItem('nawah.unlocked') !== me.id) return lock(me);
  enter(me);
}

function enter(me) {
  ctx.me = me;
  store.me = me;
  applyPrefs();
  ensureSeeds();
  shell();
  sync.start();
}

// Seeds use fixed ids, so two devices that both seed never create duplicates.
function ensureSeeds() {
  if (store.space !== 'real' && store.space !== 'demo') return;
  for (const r of ROLES) if (!store.raw('roles').some(x => x.id === r.id)) store.put('roles', structuredClone(r), { log: false, quiet: true });
  for (const [id, value] of Object.entries(DEFAULT_SETTINGS)) if (!store.raw('settings').some(x => x.id === id)) store.put('settings', { ...structuredClone(value), id }, { log: false, quiet: true });
  for (const s of SETUP_TEMPLATE) if (!store.raw('setup').some(x => x.id === s.id)) store.put('setup', { ...s }, { log: false, quiet: true });
  for (const s of NAWAH_SKILLS) if (!store.raw('skills').some(x => x.id === s.id)) store.put('skills', structuredClone(s), { log: false, quiet: true });
}

// ---------- the shell

function shell() {
  const demo = store.space === 'demo';
  root().innerHTML = String(html`
    <div class="layout">
      <aside class="side" id="side" aria-label="القائمة الرئيسية">
        <div class="brand">
          <a href="#/" class="brand-link" aria-label="نواة، الرئيسية">${nawahMark(34)}<span class="brand-text"><b>نواة</b><small>${settings.company().name}</small></span></a>
          <button type="button" class="btn btn-icon btn-quiet side-fold" data-act="toggle-collapse" title="تصغير القائمة" aria-label="تصغير القائمة">${icon('chevR')}</button>
        </div>
        <nav class="nav" id="nav"></nav>
        <nav class="nav nav-bottom" id="nav-bottom"></nav>
      </aside>
      <div class="scrim nav-scrim" data-act="close-nav"></div>
      <div class="main-col">
        ${demo ? html`<div class="demo-bar" role="status">${icon('eye')}<span>أنت في نسخة العرض<span class="hide-mobile"> ببيانات تجريبية، وبياناتك الحقيقية لم تتأثر</span>.</span><button type="button" class="btn btn-quiet btn-small" data-act="leave-demo"><span class="hide-mobile">ارجع للنسخة الحقيقية</span><span class="only-mobile">اخرج من العرض</span></button></div>` : ''}
        ${store.memory ? html`<div class="demo-bar warn" role="alert">${icon('alert')}<span>المتصفح يمنع الحفظ في هذه النافذة، فلن تبقى التعديلات بعد إغلاقها. افتح نواة في نافذة عادية.</span></div>` : ''}
        <header class="top" id="top"></header>
        <main id="main" class="main" tabindex="-1"></main>
      </div>
    </div>
    <nav class="bottom-bar" id="bottom-bar" aria-label="التنقل السريع"></nav>`);
  renderNav();
  renderTop();
  renderMain();
}

function navItem(key, active) {
  const s = SECTIONS[key];
  const n = s.badge ? Number(s.badge()) || 0 : 0;
  const on = active === key;
  return html`<li><a href="#/${key}" class="${on ? 'on' : ''}${s.soon ? ' soon' : ''}"${on ? raw(' aria-current="page"') : ''} title="${s.label}">${icon(s.icon)}<span class="lbl">${s.label}</span>${n ? html`<span class="count" aria-label="${n} بانتظارك">${n > 99 ? '99+' : n}</span>` : ''}${s.soon ? html`<span class="soon-tag">قريبا</span>` : ''}</a></li>`;
}

function renderNav() {
  const nav = $('#nav');
  if (!nav) return;
  const active = ctx.route.key;
  const folded = new Set(local.get('nawah.folded', []));
  const list = navList();
  const out = [];
  let group = null;
  let items = [];
  const flush = () => {
    if (!items.length) return;
    if (group) {
      const k = group.group;
      const here = items.some(x => x === active);
      const isFolded = folded.has(k) && !here;
      out.push(html`<div class="nav-group t-${group.tone}${isFolded ? ' folded' : ''}">
        <button type="button" class="nav-group-head" data-act="fold" data-group="${k}" aria-expanded="${!isFolded}" title="${group.hint || ''}"><span class="g-dot"></span><span class="lbl">${k}</span>${icon('chevD', 'g-chev')}</button>
        <ul>${items.map(key => navItem(key, active))}</ul></div>`);
    } else out.push(html`<ul class="nav-top">${items.map(key => navItem(key, active))}</ul>`);
    items = [];
  };
  for (const x of list) {
    if (!x.key) { flush(); group = x.group; continue; }
    items.push(x.key);
  }
  flush();
  nav.innerHTML = String(html`${out}`);
  $('#nav-bottom').innerHTML = String(html`<ul>${BOTTOM.filter(canOpen).map(k => navItem(k, active))}</ul>`);
  const bb = $('#bottom-bar');
  if (bb) {
    // whoever approves gets the approvals in reach; everyone else gets the content
    const quick = ['home', 'tasks', canOpen('approvals') ? 'approvals' : 'content'].filter(canOpen);
    bb.innerHTML = String(html`${quick.map(k => {
      const n = SECTIONS[k].badge ? Number(SECTIONS[k].badge()) || 0 : 0;
      return html`<a href="#/${k}" class="${active === k ? 'on' : ''}"${active === k ? raw(' aria-current="page"') : ''}>${icon(SECTIONS[k].icon)}<span>${SECTIONS[k].short || SECTIONS[k].label}</span>${n ? html`<b class="bb-count" aria-label="${n} بانتظارك">${n > 99 ? '99+' : n}</b>` : ''}</a>`;
    })}
      <button type="button" data-act="quick-add" aria-label="إضافة سريعة">${icon('plus')}<span>إضافة</span></button>
      <button type="button" data-act="open-nav" aria-label="القائمة">${icon('menu')}<span>القائمة</span></button>`);
  }
}

function renderTop() {
  const top = $('#top');
  if (!top) return;
  const items = needsYou();
  const n = items.filter(i => i.urgent || i.fresh).length;
  top.innerHTML = String(html`
    <button type="button" class="btn btn-icon btn-quiet only-mobile" data-act="open-nav" aria-label="افتح القائمة">${icon('menu')}</button>
    <button type="button" class="search-trigger" data-act="palette" aria-label="ابحث أو انتقل">${icon('search')}<span>ابحث أو انتقل إلى أي مكان</span><kbd>/</kbd></button>
    <div class="top-actions">
      <span id="sync-slot"></span>
      <button type="button" class="btn btn-icon btn-quiet hide-mobile" data-act="quick-add" title="إضافة سريعة" aria-label="إضافة سريعة">${icon('plus')}</button>
      <button type="button" class="btn btn-icon btn-quiet bell" data-act="bell" aria-label="${n ? `التنبيهات، ${n} بانتظارك` : 'التنبيهات'}" title="التنبيهات">${icon('bell')}${n ? html`<span class="count">${n > 99 ? '99+' : n}</span>` : ''}</button>
      <button type="button" class="me-btn" data-act="me-menu" aria-label="حسابي: ${ctx.me?.name || ''}">${avatar(ctx.me)}</button>
    </div>`);
  renderSync();
}

function renderSync() {
  const slot = $('#sync-slot');
  if (!slot) return;
  const s = sync.status;
  const demo = store.space === 'demo';
  const map = {
    off: ['cloudOff', demo ? 'نسخة العرض' : 'على هذا الجهاز فقط', 'off'],
    idle: ['cloud', sync.lastSync ? `تمت المزامنة ${ago(sync.lastSync)}` : 'المزامنة مفعلة', 'ok'],
    syncing: ['sync', 'جار المزامنة', 'busy'],
    error: ['alert', 'تعذرت المزامنة', 'err'],
    offline: ['cloudOff', 'بلا اتصال، محفوظ هنا', 'off'],
  };
  const [ic, text, cls] = map[s] || map.off;
  slot.innerHTML = String(html`<button type="button" class="sync-pill s-${cls}" data-act="sync-info" title="${sync.error || text}">${icon(ic)}<span class="hide-mobile">${text}</span></button>`);
}

let lastKey = '';
export function renderMain() {
  const main = $('#main');
  if (!main || !ctx.me) return;
  const r = ctx.route;
  let s = SECTIONS[r.key];
  if (!s || !canOpen(r.key)) {
    if (s) toast('هذا القسم غير متاح لصلاحياتك');
    ctx.route = { key: 'home', parts: [], query: {} };
    history.replaceState(null, '', '#/');
    s = SECTIONS.home;
  }
  const active = document.activeElement;
  const keep = active && main.contains(active) && active.dataset?.key ? { key: active.dataset.key, start: active.selectionStart, end: active.selectionEnd } : null;
  const scroll = lastKey === r.key ? window.scrollY : 0;
  // boards keep their sideways position when the same page re-renders
  const sideways = lastKey === r.key ? [...main.querySelectorAll('[data-board]')].map(b => [b.dataset.board, b.scrollLeft]) : [];
  try {
    main.innerHTML = String(s.render(ctx.route));
    s.mount?.(main, ctx.route);
    for (const [k, x] of sideways) { const b = main.querySelector(`[data-board="${k}"]`); if (b) b.scrollLeft = x; }
  } catch (e) {
    console.error(e);
    main.innerHTML = String(html`<div class="page"><div class="empty"><h3>حدث خطأ في عرض هذه الصفحة</h3><p class="mono">${e.message}</p>${btn('ارجع للرئيسية', { href: '#/', kind: 'primary' })}</div></div>`);
  }
  document.title = `${s.label} | نواة`;
  if (keep) {
    const el = main.querySelector(`[data-key="${keep.key}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(keep.start, keep.end); } catch (_) { /* not a text field */ } }
  }
  if (lastKey !== r.key) { window.scrollTo(0, 0); } else window.scrollTo(0, scroll);
  lastKey = r.key;
  renderNav();
  markScrollers(main);
  runTour();
}
ctx.refresh = renderMain;

// A sideways scroller that hides content gets a fade on that edge (RTL: start is the right).
function markScroll(el) {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 2) { el.removeAttribute('data-more'); return; }
  const pos = Math.abs(el.scrollLeft);
  el.dataset.more = [pos > 2 ? 'start' : '', pos < max - 2 ? 'end' : ''].filter(Boolean).join(' ');
}
function markScrollers(root = document) {
  root.querySelectorAll('.board, .table-wrap, .tabs').forEach(el => {
    markScroll(el);
    if (!el.dataset.cue) { el.dataset.cue = '1'; el.addEventListener('scroll', () => markScroll(el), { passive: true }); }
  });
}
let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { const m = $('#main'); if (m) markScrollers(m); }, 150); });

// ---------- first run: welcome, join, demo, restore

function welcome() {
  document.documentElement.dataset.theme = 'light';
  root().innerHTML = String(html`<div class="gate">
    <section class="gate-hero">
      ${nawahMark(64, { ring: '#E6EBEF' })}
      <h1>نواة</h1>
      <p class="gate-lead">نظام تشغيل ${DEFAULT_SETTINGS.company.name} وذاكرتها: المهام والعملاء والمشاريع والمحتوى والقرارات في مكان واحد.</p>
      <p class="gate-note">البيانات تحفظ على هذا الجهاز أولا، ويمكن مشاركتها بين الشركاء عبر مستودع GitHub خاص. هذا الرابط عام، لذلك لا يحتوي على أي بيانات للشركة.</p>
    </section>
    <section class="gate-options">
      <form class="gate-card" data-form="create-first">
        <h2>ابدأ الآن</h2>
        <p>أول عضو يحصل على صلاحيات الشريك كاملة، ويضيف الباقين لاحقا.</p>
        <p class="gate-warn">${icon('alert')}<span>إذا سبقك شريكك إلى إعداد نواة، فاختر «انضم لبيانات فريقك» بدلا من البدء من جديد، حتى لا تنشأ بيانات منفصلة.</span></p>
        <label class="lbl-block" for="w-name">اسمك</label>
        <input id="w-name" name="name" required autocomplete="name" placeholder="اسمك كما يظهر لفريقك">
        <label class="lbl-block" for="w-title">دورك في الشركة</label>
        <input id="w-title" name="title" placeholder="مثال: الشريك المسؤول عن الإبداع">
        <button class="btn btn-primary" type="submit">${icon('check')}<span>ابدأ</span></button>
      </form>
      <div class="gate-side">
        <button type="button" class="gate-link" data-act="join">${icon('git')}<span><b>انضم لبيانات فريقك</b><small>لمن أعد شريكه نواة من قبل، بمفتاح وصول من GitHub</small></span></button>
        <button type="button" class="gate-link" data-act="enter-demo">${icon('eye')}<span><b>شاهد نسخة العرض</b><small>بيانات تجريبية منفصلة، لا تمس شيئا</small></span></button>
        <label class="gate-link" for="restore-file">${icon('upload')}<span><b>استرجع نسخة احتياطية</b><small>ملف نسخة احتياطية من نواة</small></span><input type="file" id="restore-file" accept=".json,application/json" data-change="restore-first" hidden></label>
      </div>
    </section>
  </div>`);
  setTimeout(() => $('#w-name')?.focus(), 50);
}

function pickMember() {
  applyPrefs();
  const list = members();
  root().innerHTML = String(html`<div class="gate gate-narrow">
    <section class="gate-card">
      <div class="gate-mark">${nawahMark(44)}</div>
      <h2>من يستخدم نواة على هذا الجهاز؟</h2>
      <ul class="pick">${list.map(m => html`<li><button type="button" data-act="pick" data-id="${m.id}">${avatar(m)}<span><b>${m.name}</b><small>${m.title || ''}</small></span>${m.pin ? icon('lock') : ''}</button></li>`)}</ul>
      ${list.length ? '' : html`<p class="muted">لا يوجد أعضاء بعد.</p>`}
      <details class="pick-new"><summary>لست في القائمة</summary>
        <form data-form="create-member-self"><label class="lbl-block" for="p-name">اسمك</label><input id="p-name" name="name" required><button class="btn" type="submit">أضفني</button><p class="muted small">ستحصل على صلاحيات «مطلع» حتى يغيرها أحد الشركاء.</p></form>
      </details>
      ${store.space === 'demo' ? btn('ارجع للنسخة الحقيقية', { act: 'leave-demo', kind: 'quiet' }) : ''}
    </section>
  </div>`);
}

function lock(me) {
  applyPrefs();
  root().innerHTML = String(html`<div class="gate gate-narrow"><form class="gate-card" data-form="unlock" data-id="${me.id}">
    <div class="gate-mark">${avatar(me, { size: 'l' })}</div>
    <h2>مرحبا ${me.name.split(' ')[0]}</h2>
    <label class="lbl-block" for="pin">الرمز السري</label>
    <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required>
    <p class="field-err" role="alert"></p>
    <button class="btn btn-primary" type="submit">دخول</button>
    ${btn('مستخدم آخر', { act: 'switch-user', kind: 'quiet' })}
  </form></div>`);
  setTimeout(() => $('#pin')?.focus(), 50);
}

function waitForData() {
  root().innerHTML = String(html`<div class="gate gate-narrow"><section class="gate-card"><div class="gate-mark spin">${nawahMark(44)}</div><h2>جار جلب بيانات الفريق</h2><p class="muted" id="wait-msg">لحظات.</p></section></div>`);
  const off = sync.on(s => {
    if (s.status === 'idle') { off(); if (store.isEmpty()) welcome(); else pickMember(); }
    if (s.status === 'error') { off(); $('#wait-msg').textContent = s.error; }
  });
}

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

onForm({
  'create-first': f => {
    const name = f.name.value.trim();
    if (!name) return;
    const m = store.put('members', { name, title: f.title.value.trim(), role: 'role-partner', hours: 40 }, { log: false });
    store.me = m;
    local.set(`nawah.me.${store.space}`, m.id);
    store.log('create', 'members', m);
    enter(m);
    toast(`أهلا ${name.split(' ')[0]}. ابدأ من «ابدأ هنا» في الرئيسية.`);
  },
  'create-member-self': f => {
    const name = f.name.value.trim();
    if (!name) return;
    const m = store.put('members', { name, role: 'role-viewer', hours: 40 });
    local.set(`nawah.me.${store.space}`, m.id);
    enter(m);
  },
  unlock: async f => {
    const me = store.get('members', f.dataset.id);
    const ok = me && (await hashPin(f.pin.value, me.id)) === me.pin;
    if (!ok) { f.querySelector('.field-err').textContent = 'الرمز غير صحيح'; f.pin.select(); return; }
    sessionStorage.setItem('nawah.unlocked', me.id);
    enter(me);
  },
  join: async f => {
    const cfg = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: 'main', dir: 'data' };
    const key = f.key.value.trim();
    const out = f.querySelector('.field-err');
    out.textContent = 'جار التحقق';
    const res = await sync.check(cfg, key);
    if (!res.ok) { out.textContent = res.message; return; }
    cfg.branch = res.branch || 'main';
    sync.save(cfg, key);
    closeModal();
    waitForData();
  },
});

onChange({
  'restore-first': async el => {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const n = store.importBackup(JSON.parse(await readFile(file)));
      toast(`تم استرجاع ${n} من أقسام البيانات`);
      start();
    } catch (e) { toast(e.message || 'تعذر قراءة الملف'); }
  },
  filter: el => setQuery({ [el.dataset.key]: el.value }),
});
onInput({ filter: el => setQuery({ [el.dataset.key]: el.value }) });

const joinForm = () => html`<form data-form="join" class="stack">
  <p>اكتب بيانات مستودع البيانات الخاص الذي أنشأه شريكك. المفتاح يبقى على هذا الجهاز فقط.</p>
  <label class="lbl-block" for="j-owner">حساب GitHub المالك للمستودع</label><input id="j-owner" name="owner" dir="ltr" value="${sync.config().owner || ''}" placeholder="اسم حساب المنظمة" required>
  <label class="lbl-block" for="j-repo">اسم المستودع</label><input id="j-repo" name="repo" dir="ltr" value="nawah-data" required>
  <label class="lbl-block" for="j-key">مفتاح الوصول (Fine-grained token)</label><input id="j-key" name="key" dir="ltr" type="password" required autocomplete="off">
  <p class="field-err" role="alert"></p>
  <details class="join-steps"><summary>كيف أنشئ مفتاح الوصول؟</summary>
    <p>${btn('افتح صفحة إنشاء المفتاح', { href: TOKEN_URL, kind: 'quiet', icon: 'shield', cls: 'btn-small', external: true })}</p>
    <ol class="steps">${syncSteps(sync.config().owner)[1][1].map(t => html`<li>${t}</li>`)}</ol>
  </details>
</form>`;

onAct({
  join: () => modal({ title: 'انضم لبيانات فريقك', body: joinForm(), actions: html`${btn('تحقق وانضم', { act: 'submit-join', kind: 'primary' })}${btn('إلغاء', { act: 'close-modal', kind: 'quiet' })}` }),
  'submit-join': () => document.querySelector('#modal form[data-form="join"]')?.requestSubmit(),
  'enter-demo': async () => {
    local.set('nawah.space', 'demo');
    await store.open('demo');
    if (store.isEmpty()) {
      const { buildDemo } = await import('./demo.js');
      buildDemo(store);
    }
    const first = members()[0];
    local.set('nawah.me.demo', first.id);
    sync.set('off');
    enter(first);
    location.hash = '#/';
  },
  'leave-demo': async () => {
    local.set('nawah.space', 'real');
    await store.open('real');
    ctx.me = null;
    location.hash = '#/';
    start();
  },
  pick: el => {
    const m = store.get('members', el.dataset.id);
    local.set(`nawah.me.${store.space}`, m.id);
    if (m.pin && sessionStorage.getItem('nawah.unlocked') !== m.id) return lock(m);
    enter(m);
  },
  'switch-user': () => {
    local.del(`nawah.me.${store.space}`);
    sessionStorage.removeItem('nawah.unlocked');
    ctx.me = null;
    closeDrawer();
    pickMember();
  },
  'open-nav': () => { document.body.classList.add('nav-open'); $('#side a.on, #side a')?.focus(); },
  'close-nav': () => closeNavDrawer(),
  fold: el => {
    const set = new Set(local.get('nawah.folded', []));
    const k = el.dataset.group;
    if (set.has(k)) set.delete(k); else set.add(k);
    local.set('nawah.folded', [...set]);
    renderNav();
  },
  'toggle-collapse': () => savePrefs({ collapsed: !prefs().collapsed }),
  view: el => setQuery({ view: el.dataset.view }),
  go: el => ctx.go(el.dataset.href),
  palette: () => openPalette(),
  bell: () => openBell(),
  'quick-add': el => openQuickAdd(el),
  'me-menu': () => openMeMenu(),
  'theme-toggle': () => savePrefs({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }),
  'sync-info': () => {
    if (store.space === 'demo') { toast('المزامنة متوقفة في نسخة العرض'); return; }
    if (!sync.enabled()) { ctx.go('#/settings/sync'); return; }
    if (sync.status === 'error') toast(sync.error, { ms: 8000 });
    sync.run();
  },
});

function closeNavDrawer() { document.body.classList.remove('nav-open'); }

// ---------- quick search and navigation (/ or Ctrl+K)

const QUICK = [
  { label: 'أضف مهمة', ic: 'tasks', run: () => editRecord('tasks', null, { defaults: { assignees: [ctx.me.id] } }), module: 'tasks' },
  { label: 'أضف منشورا', ic: 'content', run: () => editRecord('posts', null, { defaults: { owner: ctx.me.id, status: 'idea' } }), module: 'content' },
  { label: 'أضف عميلا', ic: 'clients', run: () => editRecord('clients', null, { defaults: { owner: ctx.me.id } }), module: 'clients' },
  { label: 'أضف فرصة', ic: 'trend', run: () => editRecord('deals', null, { defaults: { owner: ctx.me.id } }), module: 'clients' },
  { label: 'سجل قرارا', ic: 'decisions', run: () => editRecord('decisions', null, { defaults: { owner: ctx.me.id, date: today() } }), module: 'decisions' },
  { label: 'التقط معلومة', ic: 'zap', run: () => editRecord('knowledge', null, { defaults: { kind: 'note' } }), module: 'knowledge' },
  { label: 'اجتماع جديد', ic: 'meetings', run: () => editRecord('meetings', null, { defaults: { date: today(), attendees: [ctx.me.id] } }), module: 'meetings' },
];

const SEARCHABLE = [
  ['tasks', 'tasks', r => r.title, 'مهمة'], ['clients', 'clients', r => r.name, 'عميل'], ['deals', 'clients', r => r.title, 'فرصة'],
  ['projects', 'projects', r => r.name, 'مشروع'], ['posts', 'content', r => r.title, 'منشور'], ['knowledge', 'knowledge', r => r.title, 'معرفة'],
  ['decisions', 'decisions', r => r.title, 'قرار'], ['meetings', 'meetings', r => r.title, 'اجتماع'], ['setup', 'setup', r => r.title, 'تأسيس'],
  ['invoices', 'finance', r => `${r.number || ''} ${r.kind === 'invoice' ? 'فاتورة' : 'عرض سعر'}`, 'مستند'], ['skills', 'skills', r => r.name, 'مهارة'],
];

function paletteResults(q) {
  const out = [];
  for (const k of [...NAV.filter(n => n.key).map(n => n.key), ...BOTTOM]) {
    if (!canOpen(k)) continue;
    const s = SECTIONS[k];
    if (matches(`${s.label} ${s.aka || ''}`, q)) out.push({ kind: 'قسم', label: s.label, ic: s.icon, run: () => ctx.go(`#/${k}`) });
  }
  for (const a of QUICK) if (can(a.module, 'own') && matches(a.label, q)) out.push({ kind: 'إجراء', label: a.label, ic: a.ic, run: a.run });
  if (normalize(q).length >= 2) {
    for (const [col, mod, title, kind] of SEARCHABLE) {
      if (!can(mod, 'own')) continue;
      for (const r of store.all(col)) {
        if (out.length > 40) break;
        if (matches(`${title(r)} ${r.notes || ''} ${r.caption || ''} ${r.body || ''}`, q)) out.push({ kind, label: title(r), ic: SECTIONS[col === 'deals' ? 'clients' : col === 'invoices' ? 'finance' : col === 'posts' ? 'content' : col]?.icon || 'file', run: () => editRecord(col, r.id) });
      }
    }
  }
  return out.slice(0, 40);
}

let palItems = [];
let palIndex = 0;
function openPalette() {
  const pal = $('#palette');
  pal.hidden = false;
  pal.innerHTML = String(html`<div class="scrim" data-act="close-palette"></div><div class="pal" role="dialog" aria-modal="true" aria-label="البحث السريع">
    <label class="pal-in">${icon('search')}<input id="pal-q" type="search" placeholder="ابحث عن قسم أو مهمة أو عميل أو منشور" autocomplete="off" aria-controls="pal-list"></label>
    <ul class="pal-list" id="pal-list" role="listbox"></ul>
    <p class="pal-hint hide-mobile"><kbd>Enter</kbd> للفتح، <kbd>Esc</kbd> للإغلاق</p></div>`);
  const input = $('#pal-q');
  const draw = () => {
    palItems = paletteResults(input.value);
    palIndex = Math.min(palIndex, Math.max(0, palItems.length - 1));
    $('#pal-list').innerHTML = String(html`${palItems.length ? palItems.map((it, i) => html`<li role="option" aria-selected="${i === palIndex}" class="${i === palIndex ? 'on' : ''}" data-act="pal-run" data-i="${i}">${icon(it.ic)}<span>${it.label}</span><small>${it.kind}</small></li>`) : html`<li class="pal-none">لا نتائج. جرب كلمة أخرى.</li>`}`);
    $('#pal-list li.on')?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { palIndex = 0; draw(); });
  input.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { palIndex = Math.min(palItems.length - 1, palIndex + 1); draw(); ev.preventDefault(); }
    if (ev.key === 'ArrowUp') { palIndex = Math.max(0, palIndex - 1); draw(); ev.preventDefault(); }
    if (ev.key === 'Enter') { ev.preventDefault(); runPal(palIndex); }
  });
  draw();
  input.focus();
}
function closePalette() { const p = $('#palette'); p.hidden = true; p.innerHTML = ''; }
function runPal(i) { const it = palItems[i]; if (!it) return; closePalette(); it.run(); }
onAct({ 'close-palette': closePalette, 'pal-run': el => runPal(Number(el.dataset.i)) });

function keys(ev) {
  const typing = ev.target.closest('input, textarea, select, [contenteditable]');
  if (ev.key === 'Escape') {
    if (!$('#palette').hidden) return closePalette();
    if (!$('#modal').hidden) { closeModal(); return; }
    if (!$('#drawer').hidden) return closeDrawer();
    if (document.body.classList.contains('nav-open')) return closeNavDrawer();
  }
  if (!ctx.me) return;
  if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !typing)) { ev.preventDefault(); openPalette(); }
  if (ev.key === 'Enter' && !typing && ev.target.matches('[data-act][tabindex]')) ev.target.click();
}

// ---------- bell, quick add, my menu

function openBell() {
  const items = needsYou();
  local.set(`nawah.seen.${ctx.me.id}`, Date.now());
  drawer({
    title: 'بانتظارك',
    sub: items.length ? '' : 'لا شيء بانتظارك الآن.',
    body: items.length ? html`<ul class="bell-list">${items.map(it => html`<li class="${it.urgent ? 'urgent' : ''}"><button type="button" data-act="bell-go" data-href="${it.href || ''}" data-col="${it.col || ''}" data-id="${it.id || ''}">${icon(it.ic || 'clock')}<span><b>${it.title}</b><small>${it.note || ''}</small></span></button></li>`)}</ul>` : html`<div class="empty">${icon('checkCircle')}<h3>تم.</h3><p>كل ما يخصك منجز أو في موعده.</p></div>`,
  });
  renderTop();
}
onAct({
  'bell-go': el => {
    closeDrawer();
    if (el.dataset.col && el.dataset.id) setTimeout(() => editRecord(el.dataset.col, el.dataset.id), 200);
    else if (el.dataset.href) ctx.go(el.dataset.href);
  },
});

function openQuickAdd() {
  const list = QUICK.filter(a => can(a.module, 'own'));
  modal({
    title: 'إضافة سريعة',
    body: html`<ul class="quick-list">${list.map((a, i) => html`<li><button type="button" class="btn btn-block" data-act="quick-run" data-i="${QUICK.indexOf(a)}">${icon(a.ic)}<span>${a.label}</span></button></li>`)}</ul>`,
    actions: btn('إغلاق', { act: 'close-modal', kind: 'quiet' }),
  });
}
onAct({ 'quick-run': el => { closeModal(); QUICK[Number(el.dataset.i)].run(); } });

function openMeMenu() {
  const dark = document.documentElement.dataset.theme === 'dark';
  drawer({
    title: ctx.me.name,
    sub: ctx.me.title || '',
    body: html`<ul class="menu-list">
      <li><a href="#/me" data-act="close-drawer-go" data-href="#/me">${icon('me')}<span>صفحتي وتفضيلاتي</span></a></li>
      <li><button type="button" data-act="theme-toggle">${icon(dark ? 'sun' : 'moon')}<span>${dark ? 'الوضع الفاتح' : 'الوضع الداكن'}</span></button></li>
      <li><button type="button" data-act="switch-user">${icon('logout')}<span>تبديل المستخدم</span></button></li>
      ${store.space === 'demo' ? html`<li><button type="button" data-act="leave-demo">${icon('arrowL')}<span>ارجع للنسخة الحقيقية</span></button></li>` : html`<li><button type="button" data-act="enter-demo">${icon('eye')}<span>نسخة العرض</span></button></li>`}
    </ul>`,
  });
}
onAct({ 'close-drawer-go': el => { closeDrawer(); ctx.go(el.dataset.href); } });

// ---------- "show me": highlight the button a guide step points at

export function tour(key, hash) {
  local.set('nawah.tour', key);
  ctx.go(hash);
}
function runTour() {
  const key = local.get('nawah.tour');
  if (!key) return;
  local.del('nawah.tour');
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-tour="${key}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('tour-glow');
    el.focus?.({ preventScroll: true });
    setTimeout(() => el.classList.remove('tour-glow'), 3200);
  });
}
onAct({ tour: el => tour(el.dataset.tourKey, el.dataset.href) });

boot();
