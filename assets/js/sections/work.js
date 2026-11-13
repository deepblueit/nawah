// Daily work: tasks, the shared calendar and the approvals queue.
import { html, raw } from '../core/html.js';
import { icon, platformChip } from '../core/icons.js';
import { store } from '../core/store.js';
import { ctx, can, flag, canSee, canEdit, members, memberName } from '../core/ctx.js';
import { register } from '../core/nav.js';
import { onAct, onForm, onChange } from '../core/actions.js';
import { page, btn, pill, board, table, due, avatars, search, select, viewSwitch, editRecord, monthGrid, empty, toast, drawer, closeDrawer, platforms, captionLimits, invoiceTotals } from '../core/ui.js';
import { today, diffDays, addDays, monthStart, fmtMonth, fmtShort, fmtTime, relDay, matches, money, num, iso, parseDay, local } from '../core/util.js';
import { TASK_STATUS, PRIORITY, POST_STATUS, POST_FORMATS, DECISION_STATUS, QUOTE_STATUS, SETUP_STATUS, label } from '../core/schema.js';
import { richText } from '../core/html.js';
import { open, approvalsWaiting, pillarLabel } from './shared.js';

// ---------- tasks

function taskCard(t) {
  const cl = t.checklist || [];
  const project = t.project && store.get('projects', t.project);
  return html`<p class="card-title">${t.title}</p>
    <div class="card-meta">
      ${['high', 'urgent'].includes(t.priority) ? pill(PRIORITY, t.priority) : ''}
      ${due(t.due, t.status === 'done')}
      ${cl.length ? html`<span class="mini">${icon('tasks')}${cl.filter(c => c.done).length}/${cl.length}</span>` : ''}
      ${project ? html`<span class="mini">${icon('projects')}${project.name}</span>` : ''}
      ${avatars(t.assignees)}
    </div>`;
}

register('tasks', {
  label: 'المهام', short: 'المهام', icon: 'tasks', module: 'tasks', aka: 'مهمة شغل متابعة',
  badge: () => store.all('tasks').filter(t => open(t) && (t.assignees || []).includes(ctx.me.id) && t.due && diffDays(t.due, today()) <= 0).length,
  render(r) {
    const q = r.query;
    const view = q.view || local.get('nawah.view.tasks', 'board');
    local.set('nawah.view.tasks', view);
    const seeAll = can('tasks', 'view');
    const who = q.who || (seeAll ? 'all' : 'mine');
    let list = store.all('tasks').filter(t => canSee('tasks', t));
    if (who === 'mine') list = list.filter(t => (t.assignees || []).includes(ctx.me.id) || t.createdBy === ctx.me.id);
    else if (who !== 'all') list = list.filter(t => (t.assignees || []).includes(who));
    if (q.q) list = list.filter(t => matches(`${t.title} ${t.notes || ''}`, q.q));
    if (q.pri) list = list.filter(t => t.priority === q.pri);
    const sorted = list.sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || (a.createdAt - b.createdAt));
    const recentDone = t => t.status !== 'done' || !t.doneAt || Date.now() - t.doneAt < 14 * 86400000;
    const filters = html`<div class="filters">
      ${search('q', q.q, 'ابحث في المهام')}
      ${select('who', [['mine', 'مهامي'], ...(seeAll ? [['all', 'كل الفريق'], ...members().map(m => [m.id, m.name])] : [])], who, { all: '' })}
      ${select('pri', PRIORITY.map(([k, l]) => [k, l]), q.pri, { all: 'كل الأولويات' })}
      ${viewSwitch([['board', 'لوحة', 'board'], ['list', 'قائمة', 'list']], view)}
    </div>`;
    const body = !list.length && !q.q
      ? empty({ title: 'لا مهام هنا بعد', text: 'كل مهمة لها مسؤول وموعد، وتظهر في يومه على الرئيسية.', actions: btn('أضف مهمة', { act: 'new-task', icon: 'plus', kind: 'primary' }), ic: 'tasks' })
      : view === 'list'
        ? table({ col: 'tasks', rows: sorted, columns: [
          { label: 'المهمة', cell: t => html`<b>${t.title}</b>` },
          { label: 'الحالة', cell: t => pill(TASK_STATUS, t.status) },
          { label: 'المسؤول', cell: t => avatars(t.assignees) },
          { label: 'الموعد', cell: t => due(t.due, t.status === 'done') || html`<span class="muted">بلا موعد</span>` },
          { label: 'الأولوية', cell: t => pill(PRIORITY, t.priority) },
        ] })
        : board({ col: 'tasks', field: 'status', card: taskCard, columns: TASK_STATUS.map(([k, l, tn]) => ({ key: k, label: l, tone: tn, items: sorted.filter(t => (t.status || 'todo') === k && recentDone(t)) })) });
    return page({
      title: 'المهام',
      sub: who === 'mine' ? 'مهامك وما أنشأته' : 'مهام الفريق',
      actions: btn('أضف مهمة', { act: 'new-task', icon: 'plus', kind: 'primary' }),
      body: html`${filters}${body}`,
    });
  },
});

onAct({
  'new-task': el => editRecord('tasks', null, { defaults: { assignees: [ctx.me.id], status: 'todo', priority: 'normal', due: el?.dataset?.date || '', project: el?.dataset?.project || '', client: el?.dataset?.client || '' } }),
});

// ---------- drag and drop: cards between lanes, items between days

let dragged = null;
document.addEventListener('dragstart', ev => {
  const card = ev.target.closest('[draggable="true"][data-col][data-id]');
  if (!card) return;
  dragged = { col: card.dataset.col, id: card.dataset.id };
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', card.dataset.id); } catch (_) { /* old browsers */ }
  card.classList.add('dragging');
});
document.addEventListener('dragend', ev => { ev.target.closest?.('.dragging')?.classList.remove('dragging'); document.querySelectorAll('.drop-on').forEach(e => e.classList.remove('drop-on')); dragged = null; });
document.addEventListener('dragover', ev => {
  const zone = ev.target.closest('[data-drop]');
  if (!zone || !dragged) return;
  ev.preventDefault();
  document.querySelectorAll('.drop-on').forEach(e => e !== zone && e.classList.remove('drop-on'));
  zone.classList.add('drop-on');
});
document.addEventListener('drop', ev => {
  const zone = ev.target.closest('[data-drop]');
  if (!zone || !dragged) return;
  ev.preventDefault();
  zone.classList.remove('drop-on');
  const rec = store.get(dragged.col, dragged.id);
  if (!rec) return;
  const mod = { tasks: 'tasks', posts: 'content', deals: 'clients', projects: 'projects', setup: 'setup', meetings: 'meetings' }[dragged.col];
  if (!canEdit(mod, rec)) { toast('لا تملك صلاحية تعديل هذا العنصر'); return; }
  if (zone.dataset.lane) {
    const field = zone.closest('[data-board]').dataset.field;
    if (rec[field] === zone.dataset.lane) return;
    if (dragged.col === 'posts' && zone.dataset.lane === 'scheduled' && rec.needsApproval !== false && !flag('approve') && rec.status !== 'scheduled') {
      store.patch('posts', rec.id, { status: 'review' });
      toast('المنشور يحتاج اعتمادا قبل الجدولة، فأرسل للمراجعة');
      return;
    }
    const patch = { [field]: zone.dataset.lane };
    if (field === 'status' && zone.dataset.lane === 'done') patch.doneAt = Date.now();
    if (field === 'stage' && ['won', 'lost'].includes(zone.dataset.lane)) patch.closedAt = today();
    store.patch(dragged.col, rec.id, patch);
  } else if (zone.dataset.day) {
    const field = { tasks: 'due', posts: 'date', meetings: 'date', setup: 'due', deals: 'close' }[dragged.col];
    if (field) store.patch(dragged.col, rec.id, { [field]: zone.dataset.day });
  }
});

// ---------- calendar

const CAL_TYPES = [['tasks', 'المهام'], ['posts', 'المنشورات'], ['meetings', 'الاجتماعات'], ['setup', 'التأسيس'], ['deals', 'الفرص'], ['milestones', 'تسليمات المشاريع'], ['occasions', 'المناسبات']];

function calendarItems(month, show) {
  const first = monthStart(month);
  const from = addDays(first, -7);
  const to = addDays(first, 45);
  const inRange = d => d && d >= from && d <= to;
  const items = [];
  if (show.has('tasks') && can('tasks', 'own')) for (const t of store.all('tasks')) if (inRange(t.due) && canSee('tasks', t)) items.push({ d: t.due, col: 'tasks', id: t.id, title: t.title, cls: `ty-task${t.status === 'done' ? ' done' : ''}`, drag: true });
  if (show.has('posts') && can('content', 'own')) for (const p of store.all('posts')) if (inRange(p.date) && canSee('content', p)) items.push({ d: p.date, col: 'posts', id: p.id, title: p.title, cls: `ty-post s-${p.status}`, drag: true, pre: p.time });
  if (show.has('meetings') && can('meetings', 'own')) for (const m of store.all('meetings')) if (inRange(m.date) && canSee('meetings', m)) items.push({ d: m.date, col: 'meetings', id: m.id, title: m.title, cls: 'ty-meet', drag: true, pre: m.time });
  if (show.has('setup') && can('setup', 'own')) for (const s of store.all('setup')) if (inRange(s.due) && s.status !== 'done') items.push({ d: s.due, col: 'setup', id: s.id, title: s.title, cls: 'ty-setup', drag: true });
  if (show.has('deals') && can('clients', 'own')) for (const d of store.all('deals')) if (inRange(d.close) && !['won', 'lost'].includes(d.stage) && canSee('clients', d)) items.push({ d: d.close, col: 'deals', id: d.id, title: d.title, cls: 'ty-deal', drag: true });
  if (show.has('milestones') && can('projects', 'own')) for (const p of store.all('projects')) for (const m of p.milestones || []) if (inRange(m.due) && !m.done) items.push({ d: m.due, col: 'projects', id: p.id, title: `${m.t} (${p.name})`, cls: 'ty-ms' });
  if (show.has('occasions')) for (const o of store.setting('content', {}).occasions || []) if (inRange(o.date)) items.push({ d: o.date, title: o.label + (o.expected ? ' (متوقع)' : ''), cls: 'ty-occ', note: o.idea });
  return items;
}

register('calendar', {
  label: 'التقويم', icon: 'calendar', module: 'tasks', aka: 'مواعيد جدول شهر',
  render(r) {
    const month = r.query.m ? `${r.query.m}-01` : monthStart(today());
    const hidden = new Set((r.query.hide || '').split(',').filter(Boolean));
    const show = new Set(CAL_TYPES.map(([k]) => k).filter(k => !hidden.has(k)));
    const items = calendarItems(month, show);
    const byDay = {};
    for (const it of items) (byDay[it.d] ||= []).push(it);
    const prev = addDays(month, -1).slice(0, 7);
    const next = addDays(addDays(month, 32), 0).slice(0, 7);
    const chip = it => it.col
      ? html`<button type="button" class="cal-it ${it.cls}" data-act="open" data-col="${it.col}" data-id="${it.id}"${it.drag ? raw(' draggable="true"') : ''} title="${it.title}">${it.pre ? html`<span class="cal-time">${fmtTime(it.pre)}</span>` : ''}${it.title}</button>`
      : html`<span class="cal-it ${it.cls}" title="${it.note || it.title}">${it.title}</span>`;
    return page({
      title: 'التقويم',
      sub: fmtMonth(month),
      actions: html`<div class="seg">${btn('', { act: 'go', icon: 'chevR', title: 'الشهر السابق', data: { href: `#/calendar?m=${prev}` } })}${btn('اليوم', { act: 'go', data: { href: '#/calendar' } })}${btn('', { act: 'go', icon: 'chevL', title: 'الشهر التالي', data: { href: `#/calendar?m=${next}` } })}</div>`,
      body: html`<div class="filters cal-types" role="group" aria-label="ما يظهر في التقويم">${CAL_TYPES.map(([k, l]) => html`<button type="button" class="chip-toggle ${show.has(k) ? 'on' : ''} k-${k}" data-act="cal-type" data-type="${k}" aria-pressed="${show.has(k)}">${l}</button>`)}</div>
        <p class="muted small hint-line hide-mobile">اسحب أي عنصر إلى يوم آخر لتغيير موعده، أو اضغط + لإضافة مهمة في ذلك اليوم.</p><p class="muted small hint-line only-mobile">اضغط أي يوم لعرض ما فيه أسفل التقويم.</p>
        ${monthGrid(month, d => html`${(byDay[d] || []).slice(0, 4).map(chip)}${(byDay[d] || []).length > 4 ? html`<span class="cal-more">و${byDay[d].length - 4} أخرى</span>` : ''}`, { addAct: 'new-task', agendaFor: d => html`${(byDay[d] || []).map(chip)}` })}`,
    });
  },
});

onAct({
  'cal-type': el => {
    const hidden = new Set((ctx.route.query.hide || '').split(',').filter(Boolean));
    const k = el.dataset.type;
    if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
    ctx.setQuery({ hide: [...hidden].join(',') });
  },
});

// ---------- approvals: the payload exactly as it will go out, then a human decides

const QA = ['الشعار', 'الألوان', 'الخطوط', 'العربية والإملاء', 'التكوين', 'المضمون والأرقام'];

function payload(a) {
  if (a.kind === 'post') {
    const p = store.get('posts', a.id);
    const len = [...(p.caption || '')].length;
    const over = (p.platforms || []).filter(k => captionLimits[k] && len > captionLimits[k]);
    return html`<dl class="kvs">
        <div><dt>المنصات</dt><dd>${platforms(p.platforms) || 'لم تحدد'}</dd></div>
        <div><dt>الموعد</dt><dd>${p.date ? `${fmtShort(p.date)}${p.time ? '، ' + fmtTime(p.time) : ''}` : 'بلا تاريخ'}</dd></div>
        <div><dt>الشكل والمحور</dt><dd>${label(POST_FORMATS, p.format)}${p.pillar ? `، ${pillarLabel(p.pillar)}` : ''}</dd></div>
        ${p.design ? html`<div><dt>التصميم</dt><dd><a href="${p.design}" target="_blank" rel="noopener noreferrer">افتح التصميم</a></dd></div>` : ''}
      </dl>
      <div class="caption-box"><div class="caption-text">${richText(p.caption || 'لا يوجد نص بعد')}</div>${p.hashtags?.length ? html`<p class="tags">${p.hashtags.map(h => html`<span>#${h}</span>`)}</p>` : ''}</div>
      ${over.length ? html`<p class="warn-line">${icon('alert')}النص أطول من حد ${over.map(k => ({ x: 'إكس', instagram: 'إنستغرام', linkedin: 'لينكدإن', tiktok: 'تيك توك' }[k])).join(' و')}.</p>` : ''}
      ${p.visual ? html`<p class="muted small">توجيه التصميم: ${p.visual}</p>` : ''}
      <fieldset class="qa"><legend>فحص الالتزام بالهوية قبل الاعتماد</legend>${QA.map((q, i) => html`<label class="chip-check"><input type="checkbox" class="qa-c" data-i="${i}" data-change="qa-check"><span>${q}</span></label>`)}</fieldset>`;
  }
  if (a.kind === 'decision') {
    const d = store.get('decisions', a.id);
    return html`<div class="caption-box"><p class="lead">${d.decision}</p></div>
      <dl class="kvs"><div><dt>المالك</dt><dd>${memberName(d.owner) || 'غير محدد'}</dd></div>${d.context ? html`<div><dt>السياق</dt><dd>${d.context}</dd></div>` : ''}${d.rejected ? html`<div><dt>البدائل المرفوضة</dt><dd>${d.rejected}</dd></div>` : ''}</dl>`;
  }
  const q = store.get('invoices', a.id);
  const t = invoiceTotals(q.items || [], q.vat ?? 15);
  const client = store.get('clients', q.client);
  return html`<dl class="kvs"><div><dt>العميل</dt><dd>${client?.name || ''}</dd></div><div><dt>الإجمالي</dt><dd>${money(t.total)} شامل الضريبة</dd></div></dl>
    <ul class="lines">${(q.items || []).map(it => html`<li><span>${it.desc}</span><b>${money((it.qty || 0) * (it.price || 0))}</b></li>`)}</ul>
    ${q.terms ? html`<p class="muted small">${q.terms}</p>` : ''}`;
}

register('approvals', {
  label: 'الموافقات', icon: 'approvals', aka: 'اعتماد مراجعة موافقة',
  when: () => flag('approve'),
  badge: () => approvalsWaiting().length,
  render() {
    const list = approvalsWaiting();
    const kinds = { post: 'منشور', decision: 'قرار', quote: 'عرض سعر' };
    return page({
      title: 'الموافقات',
      sub: 'لا شيء حساس يخرج دون موافقة. هذا ما سينفذ حرفيا، فراجعه ثم قرر.',
      body: list.length ? html`<div class="approvals">${list.map(a => html`<article class="appr" data-kind="${a.kind}" data-id="${a.id}">
        <header><span class="pill t-review">${kinds[a.kind]}</span><h3><button type="button" class="link-btn" data-act="open" data-col="${a.col}" data-id="${a.id}">${a.title}</button></h3><span class="muted small">${a.note}</span></header>
        ${payload(a)}
        <label class="lbl-block" for="note-${a.id}">${a.kind === 'decision' ? 'سبب الرفض (مطلوب عند الرفض)' : 'ملاحظة (مطلوبة عند الإعادة للتعديل)'}</label>
        <textarea id="note-${a.id}" class="appr-note" rows="2" placeholder="${a.kind === 'decision' ? 'لماذا يرفض هذا القرار' : 'ما الذي يحتاج تعديلا'}"></textarea>
        <footer>${btn(a.kind === 'post' ? 'اعتمد وجدول' : 'اعتمد', { act: 'approve', kind: 'primary', icon: 'check', disabled: a.kind === 'post', data: { kind: a.kind, id: a.id } })}${btn(a.kind === 'decision' ? 'ارفض' : 'أعد للتعديل', { act: 'send-back', kind: 'quiet', data: { kind: a.kind, id: a.id } })}${a.kind === 'post' ? html`<span class="muted small qa-hint">أكمل فحص الهوية لتفعيل الاعتماد</span>` : ''}</footer>
      </article>`)}</div>` : empty({ title: 'تم.', text: 'لا شيء بانتظار موافقتك الآن.', ic: 'checkCircle' }),
    });
  },
});

onAct({
  approve: el => {
    const { kind, id } = el.dataset;
    const card = el.closest('.appr');
    if (kind === 'post') {
      const unchecked = [...card.querySelectorAll('.qa-c')].filter(c => !c.checked);
      if (unchecked.length) { toast('أكمل فحص الهوية قبل الاعتماد، أو أعد المنشور للتعديل'); unchecked[0].focus(); return; }
      store.patch('posts', id, { status: 'scheduled', approvedBy: ctx.me.id, approvedAt: Date.now() }, { action: 'approve' });
    }
    if (kind === 'decision') store.patch('decisions', id, { status: 'approved', approvedBy: ctx.me.id, approvedAt: Date.now() }, { action: 'approve' });
    if (kind === 'quote') store.patch('invoices', id, { status: 'approved', approvedBy: ctx.me.id, approvedAt: Date.now() }, { action: 'approve' });
    toast('تم الاعتماد');
  },
  'send-back': el => {
    const { kind, id } = el.dataset;
    const note = el.closest('.appr').querySelector('.appr-note');
    if (!note.value.trim()) { note.focus(); toast(kind === 'decision' ? 'اكتب سبب الرفض' : 'اكتب ما يحتاج تعديلا'); return; }
    const stamp = `${fmtShort(today())}، ${ctx.me.name}: ${note.value.trim()}`;
    if (kind === 'post') { const p = store.get('posts', id); store.patch('posts', id, { status: 'writing', notes: [p.notes, `ملاحظة المراجعة ${stamp}`].filter(Boolean).join('\n') }); }
    if (kind === 'decision') store.patch('decisions', id, { status: 'rejected', context: [store.get('decisions', id).context, `سبب الرفض ${stamp}`].filter(Boolean).join('\n') });
    if (kind === 'quote') { const q = store.get('invoices', id); store.patch('invoices', id, { status: 'draft', terms: q.terms }); store.put('tasks', { title: `تعديل عرض السعر ${q.number || ''}`.trim(), assignees: [q.createdBy].filter(Boolean), status: 'todo', priority: 'high', notes: note.value.trim(), due: addDays(today(), 1) }); }
    toast(kind === 'decision' ? 'تم الرفض' : 'أعيد للتعديل مع ملاحظتك');
  },
});

onChange({
  'qa-check': el => {
    const card = el.closest('.appr');
    if (!card) return;
    const all = [...card.querySelectorAll('.qa-c')];
    const done = all.every(c => c.checked);
    const ok = card.querySelector('[data-act="approve"]');
    if (ok) ok.disabled = !done;
    card.querySelector('.qa-hint')?.toggleAttribute('hidden', done);
  },
});
