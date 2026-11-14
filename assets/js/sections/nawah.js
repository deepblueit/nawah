// نواة: the company's memory and method. Knowledge with sources, the decision log, minutes
// that turn into tasks, the weekly ritual, the skills and agents, and the change log.
import { html, raw, richText } from '../core/html.js';
import { icon, nawahMark } from '../core/icons.js';
import { store } from '../core/store.js';
import { ctx, can, flag, canSee, canEdit, members, memberName, firstName, isAdmin } from '../core/ctx.js';
import { register } from '../core/nav.js';
import { onAct, onForm, onChange } from '../core/actions.js';
import { page, tabs, btn, pill, table, due, avatar, avatars, search, select, editRecord, hooks, empty, toast, drawer, closeDrawer, progress, qty } from '../core/ui.js';
import { today, diffDays, addDays, weekStart, fmtDate, fmtShort, fmtStamp, relDay, matches, ago, count, local, sum, FORMS, iso } from '../core/util.js';
import { KNOWLEDGE_KINDS, CLASSIFICATION, DECISION_STATUS, SKILL_STATUS, RISK, TASK_STATUS, label } from '../core/schema.js';
import { NAWAH, NAWAH_AGENTS } from '../seed.js';
import { logLine } from './home.js';
import { open } from './shared.js';

// A card preview in plain sentences: no list markers or emphasis, lines joined with commas.
const preview = (text, n = 170) => {
  const lines = String(text || '').split(/\n+/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/[#*]/g, '').trim()).filter(Boolean);
  const out = lines.reduce((acc, l) => (acc ? acc + (/[.،؛:؟!]$/.test(acc) ? ' ' : '، ') + l : l), '');
  return out.length > n ? out.slice(0, n).replace(/\s+\S*$/, '') + '…' : out;
};

// ---------- overview

register('nawah', {
  label: 'عن نواة', icon: 'nawah', aka: 'نواة العقل الثاني المبادئ الطبقات',
  render() {
    const month = today().slice(0, 7);
    const stats = [
      [store.count('knowledge'), 'المعرفة المحفوظة بمصادرها', '#/knowledge', 'knowledge'],
      [store.all('decisions').filter(d => String(d.date || '').slice(0, 7) === month).length, 'قرارات الشهر', '#/decisions', 'decisions'],
      [store.count('meetings'), 'محاضر الاجتماعات', '#/meetings', 'meetings'],
      [store.all('skills').filter(s => s.status === 'active').length, 'المهارات العاملة', '#/skills', 'skills'],
    ];
    return html`<section class="page nawah-page">
      <div class="nawah-hero">
        <div class="nawah-mark-big">${nawahMark(120, { ring: 'currentColor' })}</div>
        <div><h1>نواة<span>${NAWAH.tagline}</span></h1><p>${NAWAH.intro}</p></div>
      </div>
      <ul class="nawah-stats">${stats.filter(([, , , mod]) => can(mod === 'skills' ? 'skills' : mod, 'own')).map(([n, l, href]) => html`<li><a href="${href}"><b>${n}</b><span>${l}</span></a></li>`)}</ul>
      <section class="nawah-block">
        <h2>خمس طبقات تعمل معا</h2>
        <ul class="layers">${NAWAH.layers.map(l => html`<li><h3>${l.title}</h3><p>${l.text}</p><p class="layer-here">${l.here.map(([href, t]) => html`<a href="#/${href}">${t}</a>`)}</p></li>`)}</ul>
      </section>
      <section class="nawah-block two">
        <div><h2>القواعد الحاكمة</h2><dl class="rules">${NAWAH.rules.map(r => html`<div><dt>${r.title}</dt><dd>${r.text}</dd></div>`)}</dl></div>
        <div>
          <h2>الإيقاع</h2><dl class="rituals">${NAWAH.rituals.map(r => html`<div><dt>${r.title}<span>${r.time}</span></dt><dd>${r.text}</dd></div>`)}</dl>
          <h2>درجات الخطورة</h2>
          <ol class="ladder">${NAWAH.risk.map(([k, t, rule], i) => html`<li style="--step:${i}"><b class="mono">${k}</b><span>${t}</span><small>${rule}</small></li>`)}</ol>
        </div>
      </section>
      <section class="nawah-block"><h2>ما لا نعد به</h2><ul class="ticks">${NAWAH.limits.map(l => html`<li>${l}</li>`)}</ul></section>
    </section>`;
  },
});

// ---------- the weekly ritual: Sunday plans, Thursday closes

const weekId = start => `wk-${start}`;
function weekRec(start) { return store.get('weeks', weekId(start)) || { id: weekId(start), start, plans: {}, close: {} }; }

register('weekly', {
  label: 'الوقفة الأسبوعية', short: 'الوقفة', icon: 'weekly', module: 'weekly', aka: 'وقفة الأحد الخميس أولويات الأسبوع تقرير أسبوعي',
  render(r) {
    const start = r.query.w || weekStart(today());
    const wk = weekRec(start);
    const prevStart = addDays(start, -7);
    const prev = store.get('weeks', weekId(prevStart));
    const mine = wk.plans?.[ctx.me.id] || { priorities: [{}, {}, {}], notThis: '' };
    const carry = (prev?.plans?.[ctx.me.id]?.priorities || []).filter(p => p.t && !p.done && !(mine.priorities || []).some(x => x.t === p.t));
    const editable = can('weekly', 'own');
    const people = members();
    const day = new Date().getDay();
    const isThisWeek = start === weekStart(today());
    const tasksDone = store.all('tasks').filter(t => t.status === 'done' && t.doneAt && t.doneAt >= new Date(start + 'T00:00').getTime() && t.doneAt < new Date(addDays(start, 7) + 'T00:00').getTime()).length;
    const postsOut = store.all('posts').filter(p => p.status === 'published' && p.date >= start && p.date <= addDays(start, 6)).length;
    const decisionsMade = store.all('decisions').filter(d => d.date >= start && d.date <= addDays(start, 6)).length;
    return page({
      title: 'الوقفة الأسبوعية',
      sub: `أسبوع ${fmtShort(start)} إلى ${fmtShort(addDays(start, 4))}${isThisWeek ? (day === 0 ? '، اليوم وقفة الأحد' : day === 4 ? '، اليوم وقفة الخميس' : '') : ''}`,
      actions: html`<div class="seg">${btn('', { act: 'go', icon: 'chevR', title: 'الأسبوع السابق', data: { href: `#/weekly?w=${prevStart}` } })}${btn('هذا الأسبوع', { act: 'go', data: { href: '#/weekly' } })}${btn('', { act: 'go', icon: 'chevL', title: 'الأسبوع التالي', data: { href: `#/weekly?w=${addDays(start, 7)}` } })}</div>${btn('التقرير', { act: 'weekly-report', icon: 'file', kind: 'quiet', data: { start } })}`,
      body: html`<div class="week-cols">
        <section class="module">
          <header class="module-head"><h2>الأحد: أولوياتك الثلاث</h2></header>
          <p class="muted small">لكل أولوية مخرج ملموس نهاية الأسبوع، والرابعة ممنوعة.</p>
          ${carry.length ? html`<div class="carry"><p>ما تبقى من الأسبوع الماضي، احمله أو أسقطه بوعي:</p><ul>${carry.map(c => html`<li><span>${c.t}</span>${btn('احمله', { act: 'carry', kind: 'quiet', cls: 'btn-small', data: { t: c.t, start } })}</li>`)}</ul></div>` : ''}
          <form data-form="week-plan" data-start="${start}" class="stack" data-tour="plan-week">
            <div class="prio-head" aria-hidden="true"><span></span><span>الأولوية</span><span>المخرج الملموس نهاية الأسبوع</span><span></span></div>
            ${[0, 1, 2].map(i => { const p = (mine.priorities || [])[i] || {}; return html`<div class="prio-in"><span class="prio-n">${i + 1}</span><input name="t${i}" value="${p.t || ''}" placeholder="الأولوية ${i + 1}" aria-label="الأولوية ${i + 1}"${editable ? '' : raw(' disabled')}><input name="o${i}" value="${p.output || ''}" placeholder="المخرج الملموس" aria-label="المخرج الملموس للأولوية ${i + 1}"${editable ? '' : raw(' disabled')}><label class="chk-done"><input type="checkbox" name="d${i}"${p.done ? raw(' checked') : ''}${editable ? '' : raw(' disabled')}><span>أنجزت</span></label></div>`; })}
            <label class="lbl-block" for="not-this">ليس هذا الأسبوع</label>
            <textarea id="not-this" name="notThis" rows="2" placeholder="ما نؤجله عمدا"${editable ? '' : raw(' disabled')}>${mine.notThis || ''}</textarea>
            ${editable ? btn('احفظ خطتي', { type: 'submit', kind: 'primary', icon: 'check' }) : ''}
          </form>
        </section>
        <section class="module">
          <header class="module-head"><h2>الخميس: إغلاق الأسبوع</h2>${wk.closed ? html`<span class="pill t-good">أغلق</span>` : ''}</header>
          <p class="figure-row"><span>${qty(tasksDone, FORMS.doneTask, { zero: 'لم تنجز مهام بعد' })}</span><span>${qty(postsOut, FORMS.post, { zero: 'لا منشورات' })}</span><span>${qty(decisionsMade, FORMS.decision, { zero: 'لا قرارات' })}</span></p>
          <form data-form="week-close" data-start="${start}" class="stack">
            <label class="lbl-block" for="ach">أبرز ثلاثة إنجازات بالأسماء</label><textarea id="ach" name="achievements" rows="3" placeholder="سطر لكل إنجاز"${editable ? '' : raw(' disabled')}>${(wk.close?.achievements || []).join('\n')}</textarea>
            <label class="lbl-block" for="lesson">درس واحد بصيغة قاعدة</label><input id="lesson" name="lesson" value="${wk.close?.lesson || ''}" placeholder="مثال: لا نرسل عرضا قبل موجز معتمد"${editable ? '' : raw(' disabled')}>
            <label class="switch"><input type="checkbox" name="toKnowledge"${editable ? '' : raw(' disabled')}><span>أضف الدرس إلى المعرفة</span></label>
            <label class="lbl-block" for="blk">عوائق بطلب محدد</label><textarea id="blk" name="blockers" rows="2" placeholder="متوقف بسبب كذا، ونحتاج كذا من فلان"${editable ? '' : raw(' disabled')}>${wk.close?.blockers || ''}</textarea>
            <label class="lbl-block" for="nxt">أولوية الأسبوع القادم في جملة</label><input id="nxt" name="next" value="${wk.close?.next || ''}"${editable ? '' : raw(' disabled')}>
            ${editable ? btn('أغلق الأسبوع', { type: 'submit', kind: 'primary', icon: 'check' }) : ''}
          </form>
        </section>
      </div>
      <section class="module wide">
        <header class="module-head"><h2>أولويات الفريق هذا الأسبوع</h2></header>
        <div class="team-prio">${people.map(m => {
          const pl = wk.plans?.[m.id];
          const ps = (pl?.priorities || []).filter(p => p.t);
          return html`<div class="tp">${avatar(m)}<div><b>${m.name}</b>${ps.length ? html`<ol>${ps.map(p => html`<li class="${p.done ? 'done' : ''}">${p.t}${p.output ? html`<small> ${p.output}</small>` : ''}</li>`)}</ol>` : html`<p class="muted small">لم يخطط بعد</p>`}${pl?.notThis ? html`<p class="small muted">ليس هذا الأسبوع: ${pl.notThis}</p>` : ''}</div></div>`;
        })}</div>
      </section>`,
    });
  },
});

onForm({
  'week-plan': f => {
    const wk = weekRec(f.dataset.start);
    const priorities = [0, 1, 2].map(i => ({ t: f[`t${i}`].value.trim(), output: f[`o${i}`].value.trim(), done: f[`d${i}`].checked })).filter(p => p.t);
    store.put('weeks', { ...wk, plans: { ...(wk.plans || {}), [ctx.me.id]: { priorities, notThis: f.notThis.value.trim(), at: Date.now() } } });
    toast('حفظت خطة أسبوعك');
  },
  'week-close': f => {
    const wk = weekRec(f.dataset.start);
    const close = { achievements: f.achievements.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3), lesson: f.lesson.value.trim(), blockers: f.blockers.value.trim(), next: f.next.value.trim(), by: ctx.me.id, at: Date.now() };
    store.put('weeks', { ...wk, close, closed: true });
    if (f.toKnowledge.checked && close.lesson) store.put('knowledge', { title: close.lesson, kind: 'lesson', class: 'c1', body: `درس من وقفة أسبوع ${fmtShort(f.dataset.start)}.`, source: `الوقفة الأسبوعية، ${ctx.me.name}` });
    toast('أغلق الأسبوع');
  },
});
onAct({
  carry: el => {
    const wk = weekRec(el.dataset.start);
    const mine = wk.plans?.[ctx.me.id] || { priorities: [], notThis: '' };
    const list = (mine.priorities || []).filter(p => p.t);
    if (list.length >= 3) { toast('ثلاث أولويات بالفعل. أسقط واحدة أولا'); return; }
    list.push({ t: el.dataset.t, output: '', done: false });
    store.put('weeks', { ...wk, plans: { ...(wk.plans || {}), [ctx.me.id]: { ...mine, priorities: list } } });
  },
  'weekly-report': el => {
    const start = el.dataset.start;
    const wk = weekRec(start);
    const prevWk = addDays(start, -7);
    const range = (s, f) => store.all('tasks').filter(t => t.status === 'done' && t.doneAt >= new Date(s + 'T00:00').getTime() && t.doneAt < new Date(addDays(s, 7) + 'T00:00').getTime()).length;
    const posts = s => store.all('posts').filter(p => p.status === 'published' && p.date >= s && p.date <= addDays(s, 6)).length;
    const won = s => store.all('deals').filter(d => d.stage === 'won' && d.closedAt >= s && d.closedAt <= addDays(s, 6)).length;
    const row = (l, a, b) => html`<li><span>${l}</span><b>${a}</b><small>${b === a ? 'مثل الأسبوع الماضي' : `الأسبوع الماضي ${b}`}</small></li>`;
    drawer({
      title: `التقرير الأسبوعي، ${fmtShort(start)}`,
      wide: true,
      body: html`<article class="report-doc" id="print-area">
        <h3>أبرز الإنجازات</h3>${wk.close?.achievements?.length ? html`<ol>${wk.close.achievements.map(a => html`<li>${a}</li>`)}</ol>` : html`<p class="muted">لم تكتب بعد. تكتب في وقفة الخميس.</p>`}
        <h3>الأرقام مقابل الأسبوع الماضي</h3><ul class="nums">${row('مهام أنجزت', range(start), range(prevWk))}${row('منشورات نشرت', posts(start), posts(prevWk))}${row('فرص تم التعاقد عليها', won(start), won(prevWk))}</ul>
        <h3>درس الأسبوع</h3><p>${wk.close?.lesson || 'لا قياس بعد'}</p>
        <h3>عوائق تحتاج قرارا</h3><p>${wk.close?.blockers || 'لا شيء مسجل'}</p>
        <h3>أولوية الأسبوع القادم</h3><p>${wk.close?.next || 'لم تحدد'}</p>
        <p class="muted small">صفحة واحدة صادقة: الأحمر يكتب أحمر، والرقم الغائب يكتب «لا قياس بعد».</p>
      </article>`,
      foot: html`${btn('اطبع', { act: 'print', icon: 'print', kind: 'primary' })}${btn('إغلاق', { act: 'close-drawer', kind: 'quiet' })}`,
    });
  },
});

// ---------- knowledge

const BRIEF_TEMPLATE = `## قبل المكالمة
- ما نعرفه من المصادر العامة، برابط وتاريخ لكل معلومة
- ثلاث نقاط ضعف ملموسة في حضورهم الرقمي أو تشغيلهم
- أسئلة الاستكشاف الخاصة بقطاعهم

## بعد المكالمة
- ما قاله العميل عن احتياجه بكلماته
- الميزانية بلفظه كما قالها
- اقتباسات حرفية

## الفجوات

## افتراضاتنا

## الأعلام الحمراء`;

function readKnowledge(k) {
  const client = k.client && store.get('clients', k.client);
  drawer({
    title: k.title,
    sub: `${label(KNOWLEDGE_KINDS, k.kind)}${client ? `، ${client.name}` : ''}، تحديث ${ago(k.updatedAt)}`,
    wide: true,
    body: html`<article class="read">
      ${k.class === 'c2' ? html`<p class="note">${icon('lock')}سري: لا يلصق في أدوات غير معتمدة.</p>` : ''}
      <div class="read-body">${richText(k.body || '')}</div>
      <dl class="kvs">${k.source ? html`<div><dt>المصدر</dt><dd>${richText(k.source)}</dd></div>` : html`<div><dt>المصدر</dt><dd class="warn-text">بلا مصدر. أضف من قالها أو الملف أو الرابط.</dd></div>`}${k.related ? html`<div><dt>مرتبط بـ</dt><dd>${k.related}</dd></div>` : ''}</dl>
      ${k.tags?.length ? html`<p class="tags">${k.tags.map(t => html`<span>${t}</span>`)}</p>` : ''}
    </article>`,
    foot: canEdit('knowledge', k) ? html`${btn('عدل', { act: 'edit-knowledge', icon: 'edit', kind: 'primary', data: { id: k.id } })}${btn('إغلاق', { act: 'close-drawer', kind: 'quiet' })}` : btn('إغلاق', { act: 'close-drawer', kind: 'quiet' }),
  });
}

register('knowledge', {
  label: 'المعرفة', icon: 'knowledge', module: 'knowledge', aka: 'معرفة معلومة درس موجز ملاحظة مرجع',
  render(r) {
    const q = r.query;
    let list = store.all('knowledge').filter(k => canSee('knowledge', k));
    if (q.q) list = list.filter(k => matches(`${k.title} ${k.body || ''} ${(k.tags || []).join(' ')} ${k.source || ''}`, q.q));
    if (q.kind) list = list.filter(k => k.kind === q.kind);
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return page({
      title: 'المعرفة',
      sub: 'كل معلومة بمصدرها، وعنوانها هو السؤال الذي سيبحث عنه أحد لاحقا.',
      actions: html`${btn('موجز عميل', { act: 'new-brief', icon: 'clients', kind: 'quiet' })}${btn('التقط معلومة', { act: 'capture', icon: 'zap', kind: 'primary' })}`,
      body: html`<div class="filters">${search('q', q.q, 'ابحث في المعرفة')}${select('kind', KNOWLEDGE_KINDS, q.kind, { all: 'كل الأنواع' })}</div>
        ${list.length ? html`<div class="kgrid">${list.map(k => html`<article class="kcard" data-act="read-knowledge" data-id="${k.id}" tabindex="0">
          <header>${pill(KNOWLEDGE_KINDS.map(([a, b]) => [a, b, 'info']), k.kind)}${k.class === 'c2' ? html`<span class="pill t-warn">${icon('lock')}سري</span>` : ''}</header>
          <h3>${k.title}</h3>
          <p class="kbody">${preview(k.body)}</p>
          <footer>${k.source ? html`<span class="ok-mark">${icon('link')}له مصدر</span>` : html`<span class="warn-mark">${icon('alert')}بلا مصدر</span>`}<span class="muted small">${ago(k.updatedAt)}</span></footer>
        </article>`)}</div>` : empty({ title: q.q ? 'لا نتائج' : 'لا معرفة محفوظة بعد', text: 'التقط أي معلومة مهمة قبل أن تتبخر: تفضيل عميل، درس، إجراء.', actions: btn('التقط معلومة', { act: 'capture', icon: 'zap', kind: 'primary' }), ic: 'knowledge' })}`,
    });
  },
});
onAct({
  capture: () => editRecord('knowledge', null, { defaults: { kind: 'note', class: 'c1' } }),
  'new-brief': el => editRecord('knowledge', null, { defaults: { kind: 'brief', class: 'c2', client: el?.dataset?.client || '', title: 'موجز عميل: ', body: BRIEF_TEMPLATE } }),
  'read-knowledge': el => readKnowledge(store.get('knowledge', el.dataset.id)),
  'edit-knowledge': el => editRecord('knowledge', el.dataset.id),
});

// ---------- decisions

hooks.beforeSave.decisions = (d, old) => {
  if (!d.date) d.date = today();
  if (!d.number) {
    const day = d.date.replace(/-/g, '');
    const n = store.raw('decisions').filter(x => String(x.number || '').startsWith(`D-${day}-`)).length + 1;
    d.number = `D-${day}-${n}`;
  }
  if (!old && d.status === 'approved' && !flag('approve')) d.status = 'proposed';
  if (old && old.status !== 'approved' && d.status === 'approved' && !flag('approve')) d.status = old.status;
  return d;
};
hooks.title.decisions = d => d.title;

register('decisions', {
  label: 'القرارات', icon: 'decisions', module: 'decisions', aka: 'قرار سجل القرارات اعتمدنا',
  render(r) {
    const q = r.query;
    let list = store.all('decisions').filter(d => canSee('decisions', d));
    if (q.q) list = list.filter(d => matches(`${d.title} ${d.decision} ${d.context || ''}`, q.q));
    if (q.status) list = list.filter(d => d.status === q.status);
    list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.createdAt - a.createdAt);
    return page({
      title: 'القرارات',
      sub: 'أي قرار في أي نقاش يسجل خلال 24 ساعة، بصياغة قابلة للتنفيذ ومالك واحد.',
      actions: btn('سجل قرارا', { act: 'new-decision', icon: 'plus', kind: 'primary' }),
      body: html`<div class="filters">${search('q', q.q, 'ابحث في القرارات')}${select('status', DECISION_STATUS.map(([k, l]) => [k, l]), q.status, { all: 'كل الحالات' })}</div>
        ${list.length ? html`<ol class="dlog">${list.map(d => html`<li data-act="open" data-col="decisions" data-id="${d.id}" tabindex="0">
          <header><span class="mono muted">${d.number || ''}</span>${pill(DECISION_STATUS, d.status)}</header>
          <h3>${d.title}</h3><p>${d.decision}</p>
          <footer>${d.owner ? html`${avatar(d.owner, { size: 's' })}<span>${memberName(d.owner)}</span>` : html`<span class="warn-text">بلا مالك</span>`}<span class="muted small">${fmtShort(d.date)}</span>${d.review ? html`<span class="muted small">يراجع: ${d.review}</span>` : ''}</footer>
        </li>`)}</ol>` : empty({ title: 'سجل القرارات فارغ', text: 'نهاية سؤال «ماذا اتفقنا؟»: كل قرار هنا بسياقه وبدائله ومالكه.', actions: btn('سجل قرارا', { act: 'new-decision', icon: 'plus', kind: 'primary' }), ic: 'decisions' })}`,
    });
  },
});
onAct({ 'new-decision': () => editRecord('decisions', null, { defaults: { owner: ctx.me.id, date: today(), status: flag('approve') ? 'approved' : 'proposed', review: 'نهائي' } }) });

// ---------- meetings and minutes

hooks.title.meetings = m => m.title;
hooks.panelFoot.meetings = m => {
  if (!m.id) return '';
  const pendingTasks = (m.actions || []).filter(a => a.t && !a.taskId).length;
  const lines = String(m.decisionsText || '').split('\n').map(s => s.trim()).filter(Boolean);
  return html`${pendingTasks ? btn(`حول ${pendingTasks} إلى مهام`, { act: 'minutes-tasks', icon: 'tasks', kind: 'quiet', data: { id: m.id } }) : ''}${lines.length && !m.decisionsLogged ? btn('سجل القرارات', { act: 'minutes-decisions', icon: 'decisions', kind: 'quiet', data: { id: m.id } }) : ''}`;
};

register('meetings', {
  label: 'الاجتماعات والمحاضر', short: 'المحاضر', icon: 'meetings', module: 'meetings', aka: 'اجتماع محضر مكالمة',
  render(r) {
    const q = r.query;
    let list = store.all('meetings').filter(m => canSee('meetings', m));
    if (q.q) list = list.filter(m => matches(`${m.title} ${m.summary || ''} ${m.decisionsText || ''}`, q.q));
    list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return page({
      title: 'الاجتماعات والمحاضر',
      sub: 'كل اجتماع يتحول إلى قرارات ومهام بأصحابها. الدقة قبل الأناقة.',
      actions: btn('اجتماع جديد', { act: 'new-meeting', icon: 'plus', kind: 'primary' }),
      body: html`<div class="filters">${search('q', q.q, 'ابحث في المحاضر')}</div>
        ${list.length ? html`<ul class="mlist">${list.map(m => {
          const acts = (m.actions || []).filter(a => a.t);
          const decs = String(m.decisionsText || '').split('\n').filter(s => s.trim()).length;
          return html`<li data-act="open" data-col="meetings" data-id="${m.id}" tabindex="0">
            <div class="m-date"><b>${m.date ? Number(m.date.slice(8)) : ''}</b><span>${m.date ? fmtShort(m.date).split(' ')[1] || '' : ''}</span></div>
            <div class="m-main"><h3>${m.title}</h3>${m.summary ? html`<p>${String(m.summary).slice(0, 150)}</p>` : html`<p class="muted">لم يكتب المحضر بعد</p>`}</div>
            <div class="m-side">${avatars(m.attendees)}<span class="muted small">${count(decs, FORMS.decision, { zero: 'لا قرارات' })}، ${count(acts.length, FORMS.task, { zero: 'لا مهام' })}${acts.some(a => !a.taskId) ? '، لم تحول كلها' : ''}</span></div>
          </li>`;
        })}</ul>` : empty({ title: 'لا محاضر بعد', text: 'افرز أي اجتماع إلى أربع سلال: قرارات، مهام، معلومات مهمة، ومعلق يحتاج حسما.', actions: btn('اجتماع جديد', { act: 'new-meeting', icon: 'plus', kind: 'primary' }), ic: 'meetings' })}`,
    });
  },
});
onAct({
  'new-meeting': () => editRecord('meetings', null, { defaults: { date: today(), attendees: [ctx.me.id] } }),
  'minutes-tasks': el => {
    const m = store.get('meetings', el.dataset.id);
    let n = 0;
    const actions = (m.actions || []).map(a => {
      if (!a.t || a.taskId) return a;
      const t = store.put('tasks', { title: a.t, assignees: a.owner ? [a.owner] : [], due: a.due || '', status: 'todo', priority: 'normal', client: m.client || '', notes: `من محضر: ${m.title}، ${fmtShort(m.date)}` });
      n++;
      return { ...a, taskId: t.id };
    });
    store.patch('meetings', m.id, { actions });
    closeDrawer();
    toast(n ? `أنشئت من المحضر ${count(n, FORMS.task)}` : 'كل مهام المحضر محولة من قبل');
  },
  'minutes-decisions': el => {
    const m = store.get('meetings', el.dataset.id);
    const lines = String(m.decisionsText || '').split('\n').map(s => s.trim()).filter(Boolean);
    for (const l of lines) store.put('decisions', hooks.beforeSave.decisions({ title: l.slice(0, 80), decision: l, owner: ctx.me.id, date: m.date || today(), status: flag('approve') ? 'approved' : 'proposed', context: `من محضر: ${m.title}`, review: 'نهائي' }, null));
    store.patch('meetings', m.id, { decisionsLogged: true });
    closeDrawer();
    toast(lines.length ? `سجل ${count(lines.length, FORMS.decision)}` : 'لا قرارات في المحضر');
  },
});

// ---------- skills and agents

const RUN = {
  me: () => ctx.go('#/me'),
  'new-decision': () => editRecord('decisions', null, { defaults: { owner: ctx.me.id, date: today(), status: flag('approve') ? 'approved' : 'proposed' } }),
  'new-meeting': () => editRecord('meetings', null, { defaults: { date: today(), attendees: [ctx.me.id] } }),
  'new-brief': () => editRecord('knowledge', null, { defaults: { kind: 'brief', class: 'c2', title: 'موجز عميل: ', body: BRIEF_TEMPLATE } }),
  'new-quote': () => (can('finance', 'own') && flag('money') ? editRecord('invoices', null, { defaults: { kind: 'quote', status: 'draft', vat: 15, issue: today() } }) : toast('عروض الأسعار تحتاج صلاحية المالية')),
  capacity: () => ctx.go('#/team/capacity'),
  status: () => { ctx.go('#/projects'); toast('افتح المشروع واضغط «تقرير حالة»'); },
  weekly: () => ctx.go('#/weekly'),
  capture: () => editRecord('knowledge', null, { defaults: { kind: 'note', class: 'c1' } }),
  approvals: () => (flag('approve') ? ctx.go('#/approvals') : toast('الفحص يتم عند الاعتماد في صفحة الموافقات')),
  launch: () => { ctx.go('#/projects'); toast('افتح المشروع واضغط «قائمة إطلاق موقع»'); },
  'new-skill': () => editRecord('skills', null, { defaults: { status: 'draft', risk: 't1', owner: ctx.me.id } }),
};

register('skills', {
  label: 'المهارات والوكلاء', short: 'المهارات', icon: 'skills', module: 'skills', aka: 'مهارة إجراء وكيل قائمة فحص',
  render(r) {
    const tab = r.parts[0] || 'skills';
    const t = tabs([['#/skills/skills', 'المهارات', store.count('skills')], ['#/skills/agents', 'الوكلاء', NAWAH_AGENTS.length]], tab);
    if (tab === 'agents') {
      return page({
        title: 'المهارات والوكلاء', tabs: t,
        sub: 'لكل وكيل بطاقة تعريف ملزمة: مهمته، وحدوده، ومخرجه. الوكيل يجهز ويتوقف، والإنسان يعتمد.',
        body: html`<p class="note">${icon('clock')}الوكلاء يعملون اليوم من خلال إضافة نواة، ونتائجهم تحفظ هنا في المعرفة والعروض. تشغيلهم من داخل هذه الصفحة يأتي مع الخادم.</p>
          <div class="agents">${NAWAH_AGENTS.map(a => html`<article class="agent"><header>${icon('agents')}<h3>${a.name}</h3><span class="soon-tag">قريبا هنا</span></header><p>${a.role}</p><dl class="kvs"><div><dt>حدوده</dt><dd>${a.limits}</dd></div><div><dt>مخرجه</dt><dd>${a.output}</dd></div></dl></article>`)}</div>`,
      });
    }
    const list = store.all('skills').sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || String(a.key || '').localeCompare(String(b.key || '')));
    return page({
      title: 'المهارات والوكلاء', tabs: t,
      sub: 'إجراءات موثقة نستخدمها كل أسبوع. أي عمل يتكرر ثلاث مرات يتحول إلى مهارة.',
      actions: can('skills', 'edit') ? btn('مهارة جديدة', { act: 'skill-run', icon: 'plus', kind: 'primary', data: { run: 'new-skill' } }) : '',
      body: html`<div class="skills">${list.map(s => html`<article class="skill">
        <header><h3>${s.name}</h3>${s.status !== 'active' ? pill(SKILL_STATUS, s.status) : ''}</header>
        <p class="skill-meta"><span class="mono">${s.key || ''}</span>${s.risk ? html`<span>${label(RISK, s.risk)}</span>` : ''}</p>
        <p>${s.does || ''}</p>
        ${s.trigger ? html`<p class="small"><span class="muted">تنادى بـ</span> ${s.trigger}</p>` : ''}
        <footer>${s.run && RUN[s.run] ? btn('ابدأ', { act: 'skill-run', kind: 'primary', cls: 'btn-small', icon: 'play', data: { run: s.run } }) : ''}${btn('التفاصيل', { act: 'open', kind: 'quiet', cls: 'btn-small', data: { col: 'skills', id: s.id } })}</footer>
      </article>`)}</div>`,
    });
  },
});
hooks.title.skills = s => s.name;
onAct({ 'skill-run': el => RUN[el.dataset.run]?.() });

// ---------- the change log

const COLS = [['tasks', 'المهام'], ['clients', 'العملاء'], ['deals', 'الفرص'], ['projects', 'المشاريع'], ['invoices', 'المالية'], ['posts', 'المحتوى'], ['knowledge', 'المعرفة'], ['decisions', 'القرارات'], ['meetings', 'المحاضر'], ['setup', 'التأسيس'], ['members', 'الفريق']];

register('log', {
  label: 'سجل التغييرات', short: 'السجل', icon: 'log', module: 'log', aka: 'سجل نشاط تدقيق من عدل',
  render(r) {
    const q = r.query;
    let list = store.all('log').sort((a, b) => b.at - a.at);
    if (q.by) list = list.filter(e => e.by === q.by);
    if (q.col) list = list.filter(e => e.col === q.col);
    const shown = list.slice(0, Number(q.n) || 150);
    const byDay = {};
    for (const e of shown) (byDay[new Date(e.at).toDateString()] ||= []).push(e);
    return page({
      title: 'سجل التغييرات',
      sub: 'كل إضافة وتعديل وحذف واعتماد، بمن فعله ومتى. الحذف يمكن التراجع عنه من هنا.',
      body: html`<div class="filters">${select('by', members().map(m => [m.id, m.name]), q.by, { all: 'كل الأعضاء' })}${select('col', COLS, q.col, { all: 'كل الأقسام' })}</div>
        ${shown.length ? Object.values(byDay).map(day => html`<section class="log-day"><h2>${fmtDate(iso(new Date(day[0].at)))}</h2><ul class="feed">${day.map(e => {
          const gone = e.action === 'delete' && store.raw(e.col).some(x => x.id === e.ref && x.deleted);
          return html`<li>${avatar(e.by, { size: 's' })}<span>${logLine(e)}</span><time>${fmtStamp(e.at).split('، ')[1] || ''}</time>${gone && can(e.col === 'deals' ? 'clients' : e.col === 'invoices' ? 'finance' : e.col === 'posts' ? 'content' : e.col, 'edit') ? btn('استرجع', { act: 'restore', kind: 'quiet', cls: 'btn-small', data: { col: e.col, id: e.ref } }) : ''}</li>`;
        })}</ul></section>`) : empty({ title: 'لا نشاط', text: 'كل تغيير في نواة يسجل هنا تلقائيا.', ic: 'log' })}
        ${list.length > shown.length ? btn('أظهر المزيد', { act: 'go', kind: 'quiet', data: { href: `#/log?n=${shown.length + 150}${q.by ? '&by=' + q.by : ''}${q.col ? '&col=' + q.col : ''}` } }) : ''}`,
    });
  },
});
onAct({ restore: el => { store.restore(el.dataset.col, el.dataset.id); toast('تم الاسترجاع'); } });
