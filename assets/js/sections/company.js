// تم: clients and deals, projects, the company setup, and the team with its capacity.
import { html, raw } from '../core/html.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { ctx, can, flag, canSee, canEdit, members, memberName, settings } from '../core/ctx.js';
import { register } from '../core/nav.js';
import { onAct, onChange } from '../core/actions.js';
import { page, tabs, btn, pill, board, table, due, avatar, avatars, search, select, viewSwitch, editRecord, hooks, empty, toast, progress, ring, segbar, drawer, closeDrawer } from '../core/ui.js';
import { today, diffDays, addDays, weekStart, fmtShort, relDay, matches, money, num, sum, count, local, FORMS } from '../core/util.js';
import { DEAL_STAGES, PROJECT_STAGES, SETUP_STATUS, SETUP_GROUPS, TASK_STATUS, QUOTE_STATUS, INVOICE_STATUS, CLIENT_SOURCES, label } from '../core/schema.js';
import { roleOf } from '../core/perms.js';
import { open, dealOpen, projectProgress } from './shared.js';

const hoursText = h => (Number.isInteger(Number(h)) ? count(Number(h), FORMS.hour, { zero: 'لا ساعات' }) : `${num(h)} ساعة`);

const HEALTH = [['ok', 'على المسار', 'good'], ['risk', 'يحتاج انتباه', 'warn'], ['late', 'متأخر', 'bad']];
const clientName = id => store.get('clients', id)?.name || '';

// ---------- clients and deals

function dealCard(d) {
  return html`<p class="card-title">${d.title}</p>
    <p class="card-sub">${clientName(d.client)}</p>
    <div class="card-meta">
      ${flag('money') && d.value ? html`<span class="mini money">${money(d.value, { short: true })}</span>` : ''}
      ${d.close ? due(d.close, !dealOpen(d)) : ''}
      ${d.owner ? avatar(d.owner, { size: 's' }) : ''}
    </div>
    ${d.next && dealOpen(d) ? html`<p class="card-next">${icon('chevL')}${d.next}</p>` : ''}`;
}

register('clients', {
  label: 'العملاء والفرص', short: 'العملاء', icon: 'clients', module: 'clients', aka: 'عميل فرصة صفقة مبيعات بيع',
  render(r) {
    const tab = r.parts[0] || 'deals';
    const q = r.query;
    const t = tabs([['#/clients/deals', 'الفرص', store.count('deals')], ['#/clients/list', 'العملاء', store.count('clients')]], tab);
    if (tab === 'list') {
      let list = store.all('clients').filter(c => canSee('clients', c));
      if (q.q) list = list.filter(c => matches(`${c.name} ${c.sector || ''} ${c.city || ''} ${c.contact || ''}`, q.q));
      list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      return page({
        title: 'العملاء والفرص', tabs: t,
        actions: btn('أضف عميلا', { act: 'new-client', icon: 'plus', kind: 'primary', data: { tour: 'add-client' } }),
        body: html`<div class="filters">${search('q', q.q, 'ابحث في العملاء')}</div>
          ${list.length || q.q ? table({ col: 'clients', rows: list, emptyText: 'لا نتائج.', columns: [
            { label: 'الجهة', cell: c => html`<b>${c.name}</b>${c.sector ? html`<span class="muted small"> ${c.sector}</span>` : ''}` },
            { label: 'المدينة', cell: c => c.city || '' },
            { label: 'الفرص المفتوحة', cell: c => String(store.all('deals').filter(d => d.client === c.id && dealOpen(d)).length), cls: 'num' },
            { label: 'المشاريع', cell: c => String(store.all('projects').filter(p => p.client === c.id).length), cls: 'num' },
            { label: 'وصلنا عن طريق', cell: c => label(CLIENT_SOURCES, c.source) },
            { label: 'المسؤول', cell: c => (c.owner ? avatar(c.owner, { size: 's' }) : '') },
          ] }) : empty({ title: 'لا عملاء بعد', text: 'كل عميل له ملف يجمع فرصه ومشاريعه وعروضه وما نعرفه عنه.', actions: btn('أضف عميلا', { act: 'new-client', icon: 'plus', kind: 'primary', data: { tour: 'add-client' } }), ic: 'clients' })}`,
      });
    }
    let deals = store.all('deals').filter(d => canSee('clients', d));
    if (q.q) deals = deals.filter(d => matches(`${d.title} ${clientName(d.client)} ${d.next || ''}`, q.q));
    if (q.owner) deals = deals.filter(d => d.owner === q.owner);
    const recent = d => dealOpen(d) || !d.closedAt || diffDays(today(), d.closedAt) <= 45;
    const showMoney = flag('money');
    return page({
      title: 'العملاء والفرص', tabs: t,
      sub: showMoney ? `قيمة الفرص المفتوحة ${money(sum(deals.filter(dealOpen), d => d.value))}` : '',
      actions: html`${btn('أضف عميلا', { act: 'new-client', icon: 'clients', kind: 'quiet', data: { tour: 'add-client' } })}${btn('أضف فرصة', { act: 'new-deal', icon: 'plus', kind: 'primary' })}`,
      body: html`<div class="filters">${search('q', q.q, 'ابحث في الفرص')}${select('owner', members().map(m => [m.id, m.name]), q.owner, { all: 'كل المسؤولين' })}</div>
        ${deals.length || q.q ? board({ col: 'deals', field: 'stage', card: dealCard, columns: DEAL_STAGES.map(([k, l, tn]) => {
          const items = deals.filter(d => (d.stage || 'lead') === k && recent(d));
          return { key: k, label: l, tone: tn, items, extra: showMoney && items.length ? html`<span class="lane-sum">${money(sum(items, d => d.value), { short: true })}</span>` : '' };
        }) }) : empty({ title: 'لا فرص بعد', text: 'كل فرصة تتحرك من التواصل إلى التعاقد، والقرار التالي مكتوب عليها دائما.', actions: btn('أضف فرصة', { act: 'new-deal', icon: 'plus', kind: 'primary' }), ic: 'trend' })}`,
    });
  },
});

hooks.title.deals = d => d.title;
hooks.panelExtra.clients = c => {
  if (!c.id) return '';
  const deals = store.all('deals').filter(d => d.client === c.id);
  const projects = store.all('projects').filter(p => p.client === c.id);
  const docs = flag('money') ? store.all('invoices').filter(i => i.client === c.id) : [];
  const notes = store.all('knowledge').filter(k => k.client === c.id);
  return html`<div class="related">
    <h3>كل ما يخص ${c.name}</h3>
    <div class="related-actions">${btn('فرصة لهذا العميل', { act: 'new-deal', icon: 'plus', kind: 'quiet', cls: 'btn-small', data: { client: c.id } })}${btn('موجز عميل', { act: 'new-brief', icon: 'knowledge', kind: 'quiet', cls: 'btn-small', data: { client: c.id } })}${btn('مهمة', { act: 'new-task', icon: 'tasks', kind: 'quiet', cls: 'btn-small', data: { client: c.id } })}</div>
    ${deals.length ? html`<h4>الفرص</h4><ul class="mini-list">${deals.map(d => html`<li><button type="button" data-act="open" data-col="deals" data-id="${d.id}"><span>${d.title}</span>${pill(DEAL_STAGES, d.stage)}</button></li>`)}</ul>` : ''}
    ${projects.length ? html`<h4>المشاريع</h4><ul class="mini-list">${projects.map(p => html`<li><button type="button" data-act="open" data-col="projects" data-id="${p.id}"><span>${p.name}</span>${pill(PROJECT_STAGES, p.stage)}</button></li>`)}</ul>` : ''}
    ${docs.length ? html`<h4>العروض والفواتير</h4><ul class="mini-list">${docs.map(i => html`<li><button type="button" data-act="open" data-col="invoices" data-id="${i.id}"><span>${i.kind === 'invoice' ? 'فاتورة' : 'عرض سعر'} ${i.number || ''}</span>${pill(i.kind === 'invoice' ? INVOICE_STATUS : QUOTE_STATUS, i.status)}</button></li>`)}</ul>` : ''}
    ${notes.length ? html`<h4>ما نعرفه عنه</h4><ul class="mini-list">${notes.map(k => html`<li><button type="button" data-act="open" data-col="knowledge" data-id="${k.id}"><span>${k.title}</span></button></li>`)}</ul>` : ''}
  </div>`;
};
hooks.beforeSave.deals = (d, old) => {
  if (['won', 'lost'].includes(d.stage) && (!old || old.stage !== d.stage)) d.closedAt = today();
  return d;
};
hooks.afterSave.deals = (d, old) => {
  if (d.stage === 'won' && old?.stage !== 'won' && can('projects', 'own') && !store.all('projects').some(p => p.deal === d.id)) {
    toast(`تم التعاقد على «${d.title}».`, { action: { label: 'أنشئ المشروع', run: () => editRecord('projects', null, { defaults: { name: d.title, client: d.client, deal: d.id, budget: d.value, owner: d.owner, stage: 'kickoff', start: today() } }) }, ms: 9000 });
  }
};

onAct({
  'new-client': () => editRecord('clients', null, { defaults: { owner: ctx.me.id, source: 'direct' } }),
  'new-deal': el => editRecord('deals', null, { defaults: { owner: ctx.me.id, stage: 'lead', client: el?.dataset?.client || '' } }),
});

// ---------- projects

function projectCard(p) {
  const pr = projectProgress(p);
  return html`<p class="card-title">${p.name}</p>
    <p class="card-sub">${clientName(p.client)}</p>
    ${pr != null ? progress(pr, { label: `تقدم ${p.name}` }) : ''}
    <div class="card-meta">${p.health && p.health !== 'ok' ? pill(HEALTH, p.health) : ''}${due(p.due, p.stage === 'closed')}${avatars([p.owner, ...(p.team || [])].filter((v, i, a) => v && a.indexOf(v) === i))}</div>`;
}

register('projects', {
  label: 'المشاريع', icon: 'projects', module: 'projects', aka: 'مشروع تسليم تنفيذ',
  render(r) {
    const q = r.query;
    const view = q.view || local.get('nawah.view.projects', 'board');
    local.set('nawah.view.projects', view);
    let list = store.all('projects').filter(p => canSee('projects', p));
    if (q.q) list = list.filter(p => matches(`${p.name} ${clientName(p.client)}`, q.q));
    const body = !list.length && !q.q
      ? empty({ title: 'لا مشاريع بعد', text: 'المشروع يبدأ عادة من فرصة تم التعاقد عليها، وله مراحل وتسليمات بمواعيد.', actions: btn('أضف مشروعا', { act: 'new-project', icon: 'plus', kind: 'primary' }), ic: 'projects' })
      : view === 'list'
        ? table({ col: 'projects', rows: list.sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9'))), columns: [
          { label: 'المشروع', cell: p => html`<b>${p.name}</b><span class="muted small"> ${clientName(p.client)}</span>` },
          { label: 'المرحلة', cell: p => pill(PROJECT_STAGES, p.stage) },
          { label: 'الحالة', cell: p => pill(HEALTH, p.health || 'ok') },
          { label: 'التقدم', cell: p => { const pr = projectProgress(p); return pr == null ? html`<span class="muted">بلا تسليمات</span>` : progress(pr); } },
          { label: 'التسليم', cell: p => due(p.due, p.stage === 'closed') },
        ] })
        : board({ col: 'projects', field: 'stage', card: projectCard, columns: PROJECT_STAGES.map(([k, l, tn]) => ({ key: k, label: l, tone: tn, items: list.filter(p => (p.stage || 'kickoff') === k) })) });
    return page({
      title: 'المشاريع',
      actions: btn('أضف مشروعا', { act: 'new-project', icon: 'plus', kind: 'primary' }),
      body: html`<div class="filters">${search('q', q.q, 'ابحث في المشاريع')}${viewSwitch([['board', 'لوحة', 'board'], ['list', 'قائمة', 'list']], view)}</div>${body}`,
    });
  },
});

hooks.title.projects = p => p.name;
hooks.panelExtra.projects = p => {
  if (!p.id) return '';
  const tasks = store.all('tasks').filter(t => t.project === p.id).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  return html`<div class="related">
    <h3>مهام المشروع</h3>
    <div class="related-actions">${btn('مهمة للمشروع', { act: 'new-task', icon: 'plus', kind: 'quiet', cls: 'btn-small', data: { project: p.id } })}${btn('تقرير حالة', { act: 'status-report', icon: 'file', kind: 'quiet', cls: 'btn-small', data: { id: p.id } })}${btn('قائمة إطلاق موقع', { act: 'launch-list', icon: 'flag', kind: 'quiet', cls: 'btn-small', data: { id: p.id } })}</div>
    ${tasks.length ? html`<ul class="mini-list">${tasks.map(t => html`<li><button type="button" data-act="open" data-col="tasks" data-id="${t.id}"><span>${t.title}</span>${pill(TASK_STATUS, t.status)}</button></li>`)}</ul>` : html`<p class="muted small">لا مهام مرتبطة بعد.</p>`}
  </div>`;
};

onAct({
  'new-project': () => editRecord('projects', null, { defaults: { owner: ctx.me.id, stage: 'kickoff', start: today(), health: 'ok' } }),
  'status-report': el => {
    const p = store.get('projects', el.dataset.id);
    const pr = projectProgress(p);
    const done = (p.milestones || []).filter(m => m.done);
    const next = (p.milestones || []).filter(m => !m.done).slice(0, 3);
    const tasks = store.all('tasks').filter(t => t.project === p.id);
    const lateTasks = tasks.filter(t => open(t) && t.due && diffDays(t.due, today()) < 0);
    drawer({
      title: `تقرير حالة: ${p.name}`,
      sub: `داخلي، ${fmtShort(today())}`,
      wide: true,
      body: html`<article class="report-doc" id="status-doc">
        <p><b>الحالة:</b> ${label(HEALTH, p.health || 'ok')}. <b>المرحلة:</b> ${label(PROJECT_STAGES, p.stage)}. <b>التقدم:</b> ${pr == null ? 'لا قياس بعد (لا تسليمات مسجلة)' : `${pr}% من التسليمات`}.${p.due ? ` <b>التسليم:</b> ${fmtShort(p.due)} (${relDay(p.due)}).` : ''}</p>
        <h4>ما اكتمل</h4>${done.length ? html`<ul>${done.map(m => html`<li>${m.t}</li>`)}</ul>` : html`<p class="muted">لا تسليمات مكتملة مسجلة.</p>`}
        <h4>التالي</h4>${next.length ? html`<ul>${next.map(m => html`<li>${m.t}${m.due ? `، ${fmtShort(m.due)}` : ''}</li>`)}</ul>` : html`<p class="muted">لا تسليمات قادمة مسجلة.</p>`}
        <h4>ما يعطلنا</h4><p>${p.blocker || 'لا شيء مسجل.'}</p>
        ${lateTasks.length ? html`<h4>مهام متأخرة</h4><ul>${lateTasks.map(t => html`<li>${t.title}، ${relDay(t.due)}${t.assignees?.length ? `، ${t.assignees.map(memberName).join(' و')}` : ''}</li>`)}</ul>` : ''}
        <p class="muted small">النسبة الداخلية هي نسبة العميل. ما لا نعرفه يكتب «يحتاج تحديثا» ولا يخمن.</p>
      </article>`,
      foot: html`${btn('اطبع', { act: 'print', icon: 'print', kind: 'primary' })}${btn('إغلاق', { act: 'close-drawer', kind: 'quiet' })}`,
    });
  },
  'launch-list': el => {
    const p = store.get('projects', el.dataset.id);
    const steps = [
      'الأساس: النطاق والشهادة تعمل، ونسخة التجربة محجوبة عن البحث، وملف robots.txt وملف sitemap.xml',
      'الوظائف: كل نموذج يرسل فعلا، والروابط سليمة، واللغتان، والتجربة على جوال حقيقي',
      'الأداء: مؤشرات سرعة الصفحة مقبولة على الجوال',
      'الوصولية: التباين والتنقل بلوحة المفاتيح والنصوص البديلة',
      'القياس: أدوات التحليل تعمل وتسجل الأحداث المهمة',
      'المحتوى: لا أخطاء لغوية ظاهرة، ولا نصوص مؤقتة',
      'التشغيل: نسخ احتياطي ومراقبة توفر، وتسليم بيانات الدخول بقناة آمنة',
    ];
    const t = store.put('tasks', { title: `قائمة إطلاق: ${p.name}`, project: p.id, assignees: [p.owner || ctx.me.id].filter(Boolean), status: 'todo', priority: 'high', checklist: steps.map(s => ({ t: s, done: false })), notes: 'لا تعلم على فحص لم يحدث. البنود القاطعة: النماذج، الشهادة، حجب نسخة التجربة، الأخطاء اللغوية الظاهرة.' });
    closeDrawer();
    toast('أضيفت قائمة الإطلاق كمهمة للمشروع');
    setTimeout(() => editRecord('tasks', t.id), 250);
  },
  print: () => window.print(),
});

// ---------- company setup

register('setup', {
  label: 'تأسيس الشركة', short: 'التأسيس', icon: 'setup', module: 'setup', aka: 'سجل تجاري ضريبة تأمينات بنك مقر رخصة',
  badge: () => store.all('setup').filter(s => s.status !== 'done' && s.due && diffDays(s.due, today()) < 0).length,
  render() {
    const all = store.all('setup');
    const done = all.filter(s => s.status === 'done').length;
    const editable = can('setup', 'edit');
    const groups = SETUP_GROUPS.map(([k, l]) => ({ k, l, items: all.filter(s => (s.group || 'legal') === k) })).filter(g => g.items.length);
    return page({
      title: 'تأسيس الشركة',
      sub: 'قائمة أولية من الإجراءات المعلنة للجهات الرسمية. راجعها مع المحاسب أو المستشار قبل التنفيذ، وأضف ما يخص وضع تم.',
      actions: editable ? btn('أضف خطوة', { act: 'new-setup', icon: 'plus', kind: 'primary' }) : '',
      body: html`<div class="setup-head">
          ${ring(all.length ? (done / all.length) * 100 : 0, { size: 84, label: 'اكتمال التأسيس' })}
          ${segbar(SETUP_STATUS.map(([k, l, tn]) => ({ label: l, value: all.filter(s => s.status === k).length, tone: tn })))}
        </div>
        ${groups.map(g => {
          const gd = g.items.filter(s => s.status === 'done').length;
          return html`<section class="setup-group">
            <header><h2>${g.l}</h2><span class="muted small">${gd} من ${g.items.length}</span>${progress((gd / g.items.length) * 100, { label: g.l })}</header>
            <ul class="setup-list">${g.items.map(s => html`<li class="${s.status === 'done' ? 'done' : ''}">
              <button type="button" class="setup-main" data-act="open" data-col="setup" data-id="${s.id}"><b>${s.title}</b><small>${s.why || ''}</small></button>
              <div class="setup-side">
                ${s.url ? html`<a class="link small" href="${s.url}" target="_blank" rel="noopener noreferrer">${s.portal || 'المنصة'}${icon('external')}</a>` : s.portal ? html`<span class="muted small">${s.portal}</span>` : ''}
                ${s.owner ? avatar(s.owner, { size: 's' }) : ''}
                ${s.due ? due(s.due, s.status === 'done') : ''}
                ${editable ? html`<select class="sel sel-small" data-change="set-field" data-col="setup" data-id="${s.id}" data-field="status" aria-label="حالة ${s.title}">${SETUP_STATUS.map(([k, l]) => html`<option value="${k}"${s.status === k ? raw(' selected') : ''}>${l}</option>`)}</select>` : pill(SETUP_STATUS, s.status)}
              </div>
            </li>`)}</ul>
          </section>`;
        })}`,
    });
  },
});
onAct({ 'new-setup': () => editRecord('setup', null, { defaults: { status: 'todo', group: 'legal', owner: ctx.me.id } }) });

// ---------- team and capacity

function weekLoad(memberId, start) {
  const end = addDays(start, 6);
  const tasks = store.all('tasks').filter(t => open(t) && (t.assignees || []).includes(memberId) && t.due && t.due >= start && t.due <= end);
  const hours = sum(tasks, t => (Number(t.estimate) || 2) / Math.max(1, (t.assignees || []).length));
  return { tasks: tasks.length, hours };
}

register('team', {
  label: 'الفريق', icon: 'team', module: 'team', aka: 'أعضاء شركاء صلاحيات سعة حمل',
  render(r) {
    const tab = r.parts[0] || 'people';
    const t = tabs([['#/team/people', 'الأعضاء'], ['#/team/capacity', 'السعة']], tab);
    const list = members();
    const edit = can('team', 'edit');
    if (tab === 'capacity') {
      const starts = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today()), i * 7));
      return page({
        title: 'الفريق', tabs: t,
        sub: 'هل نستطيع قبول المزيد؟ الحمل من المهام المفتوحة بمواعيدها، والمتاح هو ساعات العضو ناقص 30% للتشغيل والاجتماعات. المهمة بلا تقدير تحسب ساعتين (افتراض معلن).',
        body: html`<div class="table-wrap"><table class="tbl cap">
          <thead><tr><th>العضو</th>${starts.map(s => html`<th>أسبوع ${fmtShort(s)}</th>`)}</tr></thead>
          <tbody>${list.map(m => {
            const avail = (Number(m.hours) || 40) * 0.7;
            return html`<tr><td>${avatar(m, { size: 's' })} ${m.name}</td>${starts.map(s => {
              const l = weekLoad(m.id, s);
              const pct = Math.round((l.hours / avail) * 100);
              return html`<td class="cap-cell ${pct > 85 ? 'over' : pct > 60 ? 'mid' : l.tasks ? 'low' : ''}" title="${count(l.tasks, FORMS.task, { zero: 'لا مهام' })}، ${hoursText(l.hours)} من ${hoursText(avail)}"><b>${pct}%</b><small>${count(l.tasks, FORMS.task, { zero: 'لا مهام' })}</small></td>`;
            })}</tr>`;
          })}</tbody></table></div>
          <p class="muted small">أي عضو فوق 85% لأسابيع متتالية يحتاج قرارا: نؤجل أو نوزع أو نعتذر. الجدول يعرض الصورة، والقرار للشريكين.</p>`,
      });
    }
    return page({
      title: 'الفريق', tabs: t,
      actions: edit ? btn('أضف عضوا', { act: 'new-member', icon: 'userPlus', kind: 'primary', data: { tour: 'add-member' } }) : '',
      body: html`<div class="people">${list.map(m => {
        const role = roleOf(m);
        const openTasks = store.all('tasks').filter(tk => open(tk) && (tk.assignees || []).includes(m.id)).length;
        return html`<article class="person" data-act="${edit || m.id === ctx.me.id ? 'open' : ''}" data-col="members" data-id="${m.id}" tabindex="0">
          ${avatar(m, { size: 'l' })}
          <div><h3>${m.name}${m.id === ctx.me.id ? html` <span class="muted small">(أنت)</span>` : ''}</h3><p>${m.title || ''}</p>
          <p class="person-meta"><span class="pill t-info">${role?.name || 'بلا صلاحيات'}</span><span class="muted small">${count(openTasks, FORMS.openTask, { zero: 'لا مهام مفتوحة' })}</span>${m.github ? html`<span class="muted small mono">@${m.github}</span>` : ''}</p></div>
        </article>`;
      })}</div>
      <p class="muted small">الصلاحيات من «الإعدادات»، «الصلاحيات». في هذه النسخة تنظم الصلاحيات ما يظهر لكل عضو، والحماية الكاملة تأتي مع الخادم.</p>`,
    });
  },
});
hooks.title.members = m => m.name;
hooks.afterSave.members = m => { if (m.id === ctx.me?.id) { ctx.me = m; store.me = m; } };
onAct({ 'new-member': () => editRecord('members', null, { defaults: { role: 'role-viewer', hours: 40 } }) });
