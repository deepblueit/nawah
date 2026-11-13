// The home page: today in the nucleus. The orbit shows what is due (inner ring today,
// middle ring this week, outer ring this month); beside it, the person's list for today.
import { html, raw } from '../core/html.js';
import { icon, nawahMark } from '../core/icons.js';
import { store } from '../core/store.js';
import { sync } from '../core/sync.js';
import { ctx, can, flag, canSee, memberName, firstName, settings, isAdmin } from '../core/ctx.js';
import { register, canOpen } from '../core/nav.js';
import { onAct } from '../core/actions.js';
import { btn, pill, progress, hbars, ring, due, platforms, avatar, empty, toast } from '../core/ui.js';
import { today, fmtDate, fmtHijri, fmtWeekday, addDays, weekStart, diffDays, money, ago, count, relDay, sum, local, FORMS, noun } from '../core/util.js';
import { DEAL_STAGES, PROJECT_STAGES, SETUP_STATUS, POST_STATUS, DECISION_STATUS, label } from '../core/schema.js';
import { needsYou, open, dealOpen, projectProgress, pillarLabel } from './shared.js';

const TYPES = {
  tasks: { label: 'مهام', cls: 'ty-task' },
  posts: { label: 'منشورات', cls: 'ty-post' },
  setup: { label: 'تأسيس', cls: 'ty-setup' },
  meetings: { label: 'اجتماعات', cls: 'ty-meet' },
  deals: { label: 'فرص', cls: 'ty-deal' },
};

// Everything with a date in the next 30 days (and anything overdue) for this person.
function orbitItems() {
  const me = ctx.me.id;
  const t = today();
  const items = [];
  const push = (col, r, date, title) => {
    if (!date) return;
    const d = diffDays(date, t);
    if (d > 30) return;
    items.push({ col, id: r.id, date, d, title, late: d < 0 });
  };
  if (can('tasks', 'own')) for (const r of store.all('tasks')) if (open(r) && (r.assignees || []).includes(me)) push('tasks', r, r.due, r.title);
  if (can('content', 'own')) for (const r of store.all('posts')) if (r.status !== 'published' && (r.owner === me || !r.owner)) push('posts', r, r.date, r.title);
  if (can('setup', 'own')) for (const r of store.all('setup')) if (r.status !== 'done' && r.owner === me) push('setup', r, r.due, r.title);
  if (can('meetings', 'own')) for (const r of store.all('meetings')) if ((r.attendees || []).includes(me)) { const d = diffDays(r.date, t); if (d >= 0) push('meetings', r, r.date, r.title); }
  if (can('clients', 'own')) for (const r of store.all('deals')) if (dealOpen(r) && r.owner === me) push('deals', r, r.close, r.title);
  return items;
}

const ARC = { start: 35, end: 325 }; // the opening faces east, like the mark
const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [200 + r * Math.cos(a), 200 - r * Math.sin(a)];
};
const arcPath = r => {
  const [x1, y1] = polar(r, ARC.start);
  const [x2, y2] = polar(r, ARC.end);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 1 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

function orbit(items) {
  const rings = [
    { r: 86, list: items.filter(i => i.d <= 0), name: 'اليوم والمتأخر' },
    { r: 132, list: items.filter(i => i.d > 0 && i.d <= 7), name: 'هذا الأسبوع' },
    { r: 178, list: items.filter(i => i.d > 7), name: 'خلال الشهر' },
  ];
  const span = ARC.end - ARC.start;
  const lo = ARC.start + 4, hi = ARC.end - 4;
  const dots = [];
  for (const [ri, ring_] of rings.entries()) {
    const list = ring_.list.sort((a, b) => a.d - b.d || String(a.title || '').localeCompare(String(b.title || ''), 'ar'));
    const n = list.length;
    // Dates place the dots; a minimum gap keeps same-day items from sitting on each other.
    const gap = (19 / ring_.r) * (180 / Math.PI);
    let degs = list.map((it, i) => {
      if (ri === 0) return ARC.start + span * ((i + 0.5) / Math.max(n, 1));
      if (ri === 1) return ARC.start + span * ((it.d - 0.5) / 7);
      return ARC.start + span * ((it.d - 7.5) / 23);
    }).map(d => Math.min(hi, Math.max(lo, d)));
    for (let i = 1; i < n; i++) degs[i] = Math.max(degs[i], degs[i - 1] + gap);
    for (let i = n - 1; i >= 0; i--) degs[i] = Math.min(degs[i], i === n - 1 ? hi : degs[i + 1] - gap);
    if (n && degs[0] < lo) degs = list.map((_, i) => lo + (hi - lo) * (n === 1 ? 0.5 : i / (n - 1)));
    list.forEach((it, i) => {
      const [x, y] = polar(ring_.r, degs[i]);
      dots.push(html`<g class="dot ${TYPES[it.col].cls}${it.late ? ' late' : ''}" style="--x:${(x - 200).toFixed(1)}px;--y:${(y - 200).toFixed(1)}px;--i:${dots.length}" data-act="open" data-col="${it.col}" data-id="${it.id}" tabindex="0" role="button" aria-label="${it.title}، ${relDay(it.date)}">
        <title>${it.title}، ${relDay(it.date)}</title><circle r="${it.late ? 7.5 : 6.5}" cx="200" cy="200"/></g>`);
    });
  }
  const counts = Object.entries(TYPES).map(([col, t]) => [t, items.filter(i => i.col === col).length]).filter(([, n]) => n);
  return html`<figure class="orbit">
    <svg viewBox="0 0 400 400" role="img" aria-label="ما يستحق عليك: ${rings.map(r => `${r.name} ${r.list.length}`).join('، ')}">
      ${rings.map(r => html`<path class="orbit-ring" d="${arcPath(r.r)}"/>`)}
      <circle class="nucleus-halo" cx="200" cy="200" r="30"/>
      <circle class="nucleus" cx="200" cy="200" r="13"/>
      ${dots}
    </svg>
    <figcaption>
      <ul class="orbit-legend">${counts.length ? counts.map(([t, n]) => html`<li><span class="lg-dot ${t.cls}"></span>${t.label}<b>${n}</b></li>`) : html`<li class="muted">لا مواعيد خلال 30 يوما</li>`}</ul>
      <p class="orbit-key">الحلقة الداخلية لليوم والمتأخر، ثم الأسبوع، ثم بقية الشهر.</p>
    </figcaption>
  </figure>`;
}

function todayList() {
  const items = needsYou().filter(i => i.urgent || !i.due || diffDays(i.due, today()) <= 0);
  if (!items.length) {
    return html`<div class="today-done"><p class="today-big">تم.</p><p>لا شيء مستحق عليك اليوم.${can('tasks', 'own') ? ' أضف ما يشغلك قبل أن يضيع.' : ''}</p>${can('tasks', 'own') ? btn('أضف مهمة', { act: 'new-task', icon: 'plus', kind: 'ghost-light' }) : ''}</div>`;
  }
  return html`<ol class="today-list">${items.slice(0, 7).map(it => html`<li class="${it.urgent ? 'late' : ''}">
    <button type="button" class="today-item" data-act="open" data-col="${it.col}" data-id="${it.id}">${icon(it.ic)}<span><b>${it.title}</b><small>${it.note}</small></span></button>
    ${it.col === 'tasks' || it.col === 'setup' ? html`<button type="button" class="done-btn" data-act="mark-done" data-col="${it.col}" data-id="${it.id}" aria-label="تم: ${it.title}">${icon('check')}<span>تم</span></button>` : ''}
  </li>`)}</ol>${items.length > 7 ? html`<p class="today-more">${btn(`و${items.length - 7} أخرى`, { act: 'bell', kind: 'ghost-light', cls: 'btn-small' })}</p>` : ''}`;
}

function greeting() {
  const h = new Date().getHours();
  return h >= 4 && h < 12 ? 'صباح الخير' : 'مساء الخير';
}

// ----- "ابدأ هنا": the first steps, each with a «أرني» that lights the button up
function startSteps() {
  const steps = [];
  const company = store.get('settings', 'company');
  if (can('settings', 'edit')) steps.push({ key: 'company', title: 'أكمل بيانات الشركة', text: 'الاسم الرسمي والمدينة والتواصل، وتظهر في العروض والتقارير.', done: !!company && company.updatedBy !== 'system', href: '#/settings/company' });
  if (can('team', 'edit')) steps.push({ key: 'add-member', title: 'أضف شريكك وحدد صلاحياته', text: 'كل عضو يرى ما يخصه ويعمل باسمه.', done: store.count('members') >= 2, href: '#/team' });
  if (can('settings', 'edit') && store.space === 'real') steps.push({ key: 'sync-form', title: 'فعل المزامنة الخاصة', text: 'لتصل بياناتكم لكل أجهزة الفريق عبر مستودع GitHub خاص.', done: sync.enabled(), href: '#/settings/sync' });
  if (can('settings', 'edit')) steps.push({ key: 'import', title: 'استورد حزمة البداية', text: 'ملف خاص فيه معرفة تم وخطة المحتوى وحسابات المنصات.', done: !!store.setting('content', {}).imported, href: '#/settings/data' });
  if (can('clients', 'own')) steps.push({ key: 'add-client', title: 'أضف أول عميل أو فرصة', text: 'المبيعات تبدأ من قائمة واضحة.', done: store.count('clients') > 0, href: '#/clients' });
  if (can('weekly', 'own')) steps.push({ key: 'plan-week', title: 'خطط أسبوعك', text: 'ثلاث أولويات لا أكثر، وما ليس هذا الأسبوع.', done: store.count('weeks') > 0, href: '#/weekly' });
  return steps;
}

function startHere() {
  const p = { hide: [], ...(ctx.me.prefs || {}) };
  if (p.hide.includes('start')) return '';
  const steps = startSteps();
  if (!steps.length || steps.every(s => s.done)) return '';
  const done = steps.filter(s => s.done).length;
  return html`<section class="module start">
    <header class="module-head"><h2>ابدأ هنا</h2><span class="muted">${done} من ${steps.length}</span>${btn('', { act: 'hide-block', icon: 'x', kind: 'quiet', title: 'إخفاء', data: { block: 'start' } })}</header>
    <ol class="start-steps">${steps.map(s => html`<li class="${s.done ? 'done' : ''}">
      <span class="step-mark">${s.done ? icon('check') : ''}</span>
      <div><b>${s.title}</b><p>${s.text}</p></div>
      ${s.done ? html`<span class="muted small">تم</span>` : html`<button type="button" class="btn btn-small" data-act="tour" data-tour-key="${s.key}" data-href="${s.href}">أرني</button>`}
    </li>`)}</ol>
  </section>`;
}

// ----- the modules below the hero
function contentWeek() {
  if (!can('content', 'own')) return '';
  const start = weekStart(today());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const posts = store.all('posts').filter(p => p.date && p.date >= days[0] && p.date <= days[6] && canSee('content', p));
  return html`<section class="module wide">
    <header class="module-head"><h2>هذا الأسبوع في المحتوى</h2><a class="link" href="#/content">التقويم كاملا</a></header>
    <div class="week-strip">${days.map(d => {
      const list = posts.filter(p => p.date === d);
      return html`<div class="wk-day${d === today() ? ' today' : ''}${[5, 6].includes(new Date(d + 'T12:00').getDay()) ? ' wkend' : ''}">
        <div class="wk-head"><span>${fmtWeekday(d)}</span><b>${Number(d.slice(8))}</b></div>
        ${list.length ? list.map(p => html`<button type="button" class="wk-post s-${p.status}" data-act="open" data-col="posts" data-id="${p.id}" title="${p.title}"><span class="wk-st">${label(POST_STATUS, p.status)}</span><span class="wk-t">${p.title}</span>${platforms(p.platforms)}</button>`) : html`<span class="wk-none"></span>`}
      </div>`;
    })}</div>
  </section>`;
}

function sales() {
  if (!can('clients', 'own')) return '';
  const deals = store.all('deals').filter(d => canSee('clients', d));
  const openDeals = deals.filter(dealOpen);
  const money_ = flag('money');
  const rows = DEAL_STAGES.filter(([k]) => !['won', 'lost'].includes(k)).map(([k, l, t]) => {
    const list = openDeals.filter(d => d.stage === k);
    return { label: `${l} (${list.length})`, value: money_ ? sum(list, d => d.value) : list.length, display: money_ ? money(sum(list, d => d.value), { short: true }) : String(list.length), tone: t };
  });
  const month = today().slice(0, 7);
  const won = deals.filter(d => d.stage === 'won' && String(d.closedAt || d.close || '').slice(0, 7) === month);
  return html`<section class="module">
    <header class="module-head"><h2>المبيعات</h2><a class="link" href="#/clients">الفرص</a></header>
    ${openDeals.length ? html`
      <p class="figure">${money_ ? html`<b>${money(sum(openDeals, d => d.value), { short: true })}</b><span>في ${count(openDeals.length, ['فرصة مفتوحة', 'فرصتين مفتوحتين', 'فرص مفتوحة', 'فرصة مفتوحة'])}</span>` : html`<b>${openDeals.length}</b><span>فرص مفتوحة</span>`}</p>
      ${hbars(rows, { unit: v => (money_ ? money(v, { short: true }) : String(v)) })}
      <p class="muted small">${won.length ? `${count(won.length, FORMS.contract)} هذا الشهر${money_ ? ` بقيمة ${money(sum(won, d => d.value), { short: true })}` : ''}` : 'لا تعاقدات هذا الشهر بعد'}</p>`
      : empty({ title: 'لا فرص مفتوحة', text: 'أضف أول فرصة وتابعها حتى التعاقد.', actions: btn('أضف فرصة', { act: 'new-deal', icon: 'plus', kind: 'primary' }), ic: 'trend' })}
  </section>`;
}

function projects() {
  if (!can('projects', 'own')) return '';
  const list = store.all('projects').filter(p => !['closed'].includes(p.stage) && canSee('projects', p)).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  return html`<section class="module">
    <header class="module-head"><h2>المشاريع الجارية</h2><a class="link" href="#/projects">كل المشاريع</a></header>
    ${list.length ? html`<ul class="proj-list">${list.slice(0, 5).map(p => {
      const pr = projectProgress(p);
      return html`<li><button type="button" data-act="open" data-col="projects" data-id="${p.id}">
        <span class="proj-top"><b>${p.name}</b>${pill([['ok', 'على المسار', 'good'], ['risk', 'يحتاج انتباه', 'warn'], ['late', 'متأخر', 'bad']], p.health || 'ok')}</span>
        <span class="proj-meta">${label(PROJECT_STAGES, p.stage)}${p.due ? html`، التسليم ${relDay(p.due)}` : ''}</span>
        ${pr != null ? progress(pr, { label: `تقدم ${p.name}` }) : ''}
      </button></li>`;
    })}</ul>` : html`<p class="muted">لا مشاريع جارية.</p>`}
  </section>`;
}

function setup() {
  if (!can('setup', 'own')) return '';
  const all = store.all('setup');
  if (!all.length) return '';
  const done = all.filter(s => s.status === 'done').length;
  const next = all.filter(s => s.status !== 'done').slice(0, 3);
  return html`<section class="module">
    <header class="module-head"><h2>تأسيس الشركة</h2><a class="link" href="#/setup">كل الخطوات</a></header>
    <div class="setup-sum">${ring((done / all.length) * 100, { label: 'اكتمال التأسيس' })}<p><b>${done} من ${all.length}</b><span>${noun(all.length, FORMS.step)} مكتملة</span></p></div>
    <ul class="mini-list">${next.map(s => html`<li><button type="button" data-act="open" data-col="setup" data-id="${s.id}"><span>${s.title}</span>${pill(SETUP_STATUS, s.status)}</button></li>`)}</ul>
  </section>`;
}

function weekly() {
  if (!can('weekly', 'own')) return '';
  const wk = store.get('weeks', `wk-${weekStart(today())}`);
  const day = new Date().getDay();
  const prio = (wk?.plans?.[ctx.me.id]?.priorities || []).filter(p => p.t);
  return html`<section class="module">
    <header class="module-head"><h2>أولويات الأسبوع</h2><a class="link" href="#/weekly">الوقفة الأسبوعية</a></header>
    ${prio.length ? html`<ol class="prio">${prio.map(p => html`<li class="${p.done ? 'done' : ''}">${p.done ? icon('check') : ''}<span>${p.t}</span></li>`)}</ol>`
      : html`<p class="muted">${day === 0 ? 'اليوم الأحد: وقت تحديد ثلاث أولويات لهذا الأسبوع.' : 'لم تحدد أولويات هذا الأسبوع بعد.'}</p>${btn('خطط الأسبوع', { href: '#/weekly', kind: 'quiet', icon: 'weekly' })}`}
    ${day === 4 && prio.length && !wk?.closed ? html`<p class="small">اليوم الخميس: ${btn('أغلق الأسبوع', { href: '#/weekly', kind: 'quiet', cls: 'btn-small' })}</p>` : ''}
  </section>`;
}

function decisions() {
  if (!can('decisions', 'own')) return '';
  const list = store.all('decisions').filter(d => canSee('decisions', d)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt).slice(0, 4);
  return html`<section class="module">
    <header class="module-head"><h2>آخر القرارات</h2><a class="link" href="#/decisions">السجل</a></header>
    ${list.length ? html`<ul class="mini-list">${list.map(d => html`<li><button type="button" data-act="open" data-col="decisions" data-id="${d.id}"><span>${d.title}</span>${pill(DECISION_STATUS, d.status)}</button></li>`)}</ul>` : html`<p class="muted">أي قرار في أي نقاش يسجل خلال 24 ساعة.</p>`}
  </section>`;
}

const VERBS = { create: 'أضاف', update: 'عدل', delete: 'حذف', restore: 'استرجع', approve: 'اعتمد', import: 'استورد', done: 'أنجز' };
const NOUNS = { tasks: 'مهمة', clients: 'عميلا', deals: 'فرصة', projects: 'مشروعا', invoices: 'مستندا', expenses: 'مصروفا', setup: 'خطوة تأسيس', posts: 'منشورا', accounts: 'حسابا', knowledge: 'معلومة', decisions: 'قرارا', meetings: 'اجتماعا', weeks: 'الوقفة الأسبوعية', skills: 'مهارة', members: 'عضوا', roles: 'صلاحيات' };
export const logLine = e => `${memberName(e.by) || 'النظام'} ${VERBS[e.action] || e.action} ${NOUNS[e.col] || ''}${e.label ? ` «${e.label}»` : ''}`;

function activity() {
  if (!can('log', 'own')) return '';
  const list = store.all('log').sort((a, b) => b.at - a.at).slice(0, 6);
  return html`<section class="module">
    <header class="module-head"><h2>آخر النشاط</h2><a class="link" href="#/log">السجل كاملا</a></header>
    ${list.length ? html`<ul class="feed">${list.map(e => html`<li>${avatar(e.by, { size: 's' })}<span>${logLine(e)}</span><time>${ago(e.at)}</time></li>`)}</ul>` : html`<p class="muted">لا نشاط بعد.</p>`}
  </section>`;
}

const BLOCKS = [['content', contentWeek], ['sales', sales], ['projects', projects], ['setup', setup], ['weekly', weekly], ['decisions', decisions], ['activity', activity]];
export const HOME_BLOCKS = [['content', 'هذا الأسبوع في المحتوى'], ['sales', 'المبيعات'], ['projects', 'المشاريع الجارية'], ['setup', 'تأسيس الشركة'], ['weekly', 'أولويات الأسبوع'], ['decisions', 'آخر القرارات'], ['activity', 'آخر النشاط'], ['start', 'ابدأ هنا']];

register('home', {
  label: 'الرئيسية',
  icon: 'home',
  render() {
    const me = ctx.me;
    const hide = new Set((me.prefs || {}).hide || []);
    const items = orbitItems();
    return html`<section class="page home">
      <div class="hero">
        <div class="hero-text">
          <p class="hero-date">${fmtWeekday(today())} ${fmtDate(today())}، ${fmtHijri(today())}</p>
          <h1>${greeting()}، ${firstName(me.id)}</h1>
          <h2 class="hero-sub">مسؤولياتك اليوم</h2>
          ${todayList()}
        </div>
        ${orbit(items)}
      </div>
      ${startHere()}
      <div class="modules">${BLOCKS.filter(([k]) => !hide.has(k)).map(([, fn]) => fn())}</div>
    </section>`;
  },
  mount(el) {
    const o = el.querySelector('.orbit');
    if (o) requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('go')));
  },
});

onAct({
  'mark-done': el => {
    const { col, id } = el.dataset;
    const rec = store.get(col, id);
    if (!rec) return;
    const prev = rec.status;
    store.patch(col, id, { status: 'done', doneAt: Date.now() }, { action: 'done' });
    toast(`تم: ${rec.title}`, { undo: () => store.patch(col, id, { status: prev, doneAt: null }) });
  },
  'hide-block': el => {
    const hide = new Set((ctx.me.prefs || {}).hide || []);
    hide.add(el.dataset.block);
    ctx.me = store.patch('members', ctx.me.id, { prefs: { ...(ctx.me.prefs || {}), hide: [...hide] } }, { log: false });
    toast('أخفيت البطاقة. تعيدها من صفحتي.');
  },
});
