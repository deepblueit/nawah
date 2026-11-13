// The building blocks of every page, the record form, the side panel, dialogs and charts.
import { html, raw, attrs, esc } from './html.js';
import { icon, PLATFORMS, platformChip } from './icons.js';
import { store } from './store.js';
import { ctx, members, member, can, canEdit, settings } from './ctx.js';
import { SCHEMA, label as optLabel, tone as optTone, QUOTE_STATUS, INVOICE_STATUS } from './schema.js';
import { onAct, onForm, onChange, onInput } from './actions.js';
import { fmtShort, fmtDate, fmtWeekday, relDay, today, diffDays, num, money, parseDay, iso, addDays, monthStart, isWeekend, count } from './util.js';

// A counted phrase with the number in bold: qty(3, FORMS.task) -> <b>3</b> مهام
export const qty = (n, forms, opts) => {
  const s = count(n, forms, opts);
  const m = /^([\d,.]+)\s(.+)$/.exec(s);
  return m ? html`<b>${m[1]}</b> ${m[2]}` : html`${s}`;
};
import { roleOf } from './perms.js';

// ---------- small pieces

export const pill = (options, key, extra = '') => {
  if (!key && key !== 0) return '';
  return html`<span class="pill t-${optTone(options, key)}${extra ? ' ' + extra : ''}">${optLabel(options, key)}</span>`;
};

const AV = ['#2F8F74', '#3D6B8C', '#7A5C9E', '#9C6B3D', '#3F7F86', '#8C4B5E', '#5C7A3D', '#4D5C8C'];
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// First letters of the first and last name, without the article ال, kept apart so
// they do not join into a syllable: ريم الحربي -> ر ح
export const initials = name => {
  const parts = String(name || '؟').trim().split(/\s+/);
  const first = parts[0]?.[0] || '؟';
  let last = parts.length > 1 ? parts[parts.length - 1] : '';
  if (/^ال./.test(last) && last.length > 3) last = last.slice(2);
  return last ? `${first}\u200c${last[0]}` : first;
};
export function avatar(idOrMember, { size = 'm' } = {}) {
  const m = typeof idOrMember === 'string' ? member(idOrMember) : idOrMember;
  if (!m) return '';
  const color = m.color || AV[hash(m.id) % AV.length];
  return html`<span class="av av-${size}" style="--av:${color}" title="${m.name}">${initials(m.name)}</span>`;
}
export const avatars = (ids = []) => (ids?.length ? html`<span class="avs">${ids.slice(0, 4).map(id => avatar(id, { size: 's' }))}${ids.length > 4 ? html`<span class="av av-s av-more">+${ids.length - 4}</span>` : ''}</span>` : '');

export function btn(text, { act, href, icon: ic, kind = '', data = {}, title, disabled, type = 'button', cls = '', external = false } = {}) {
  const d = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]));
  const body = html`${ic ? icon(ic) : ''}${text ? html`<span>${text}</span>` : ''}`;
  const klass = `btn${kind ? ' btn-' + kind : ''}${!text ? ' btn-icon' : ''}${cls ? ' ' + cls : ''}`;
  if (href) return html`<a class="${klass}" href="${href}"${attrs({ title, ...d, target: external ? '_blank' : null, rel: external ? 'noopener noreferrer' : null })}>${body}</a>`;
  return html`<button type="${type}" class="${klass}"${attrs({ 'data-act': act, title, 'aria-label': !text ? title : null, disabled, ...d })}>${body}</button>`;
}

export function page({ title, sub, actions = '', tabs: t = '', body, cls = '' }) {
  return html`<section class="page ${cls}">
    <header class="page-head">
      <div class="page-titles"><h1>${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div>
      ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
    </header>
    ${t}
    <div class="page-body">${body}</div>
  </section>`;
}

export const tabs = (list, active) => html`<nav class="tabs" aria-label="أقسام الصفحة">${list.map(([href, text, n]) => html`<a href="${href}" class="${href.endsWith('/' + active) || active === href ? 'on' : ''}"${active === href || href.endsWith('/' + active) ? raw(' aria-current="page"') : ''}>${text}${n ? html`<span class="tab-n">${n}</span>` : ''}</a>`)}</nav>`;

export const empty = ({ title, text = '', actions = '', ic = 'nawah' }) => html`<div class="empty">
  <div class="empty-mark">${icon(ic)}</div>
  <h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${actions ? html`<div class="empty-actions">${actions}</div>` : ''}
</div>`;

export const progress = (value, { label: l = '', tone: t = '' } = {}) => {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return html`<div class="prog${t ? ' t-' + t : ''}" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100" aria-label="${l || 'التقدم'}"><span style="width:${v}%"></span></div>`;
};

export const due = (d, done) => {
  if (!d) return '';
  if (done) return html`<span class="due" title="${fmtShort(d)}">${icon('calendar')}${fmtShort(d)}</span>`;
  const late = !done && diffDays(d, today()) < 0;
  const soon = !done && diffDays(d, today()) <= 1 && !late;
  return html`<span class="due${late ? ' late' : soon ? ' soon' : ''}" title="${fmtShort(d)}">${icon(late ? 'alert' : 'clock')}${relDay(d)}</span>`;
};

export const platforms = list => (list?.length ? html`<span class="pfs">${list.map(platformChip)}</span>` : '');

export const kv = (k, v) => (v || v === 0 ? html`<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>` : '');

export function search(name, value = '', ph = 'ابحث') {
  return html`<label class="search-in">${icon('search')}<input type="search" name="${name}" value="${value}" placeholder="${ph}" data-input="filter" data-key="${name}" aria-label="${ph}"></label>`;
}

export function select(name, options, value, { all = 'الكل', change = 'filter', cls = '' } = {}) {
  return html`<select class="sel ${cls}" name="${name}" data-change="${change}" data-key="${name}" aria-label="${all}">
    ${all ? html`<option value="">${all}</option>` : ''}
    ${options.map(([k, l]) => html`<option value="${k}"${String(k) === String(value) ? raw(' selected') : ''}>${l}</option>`)}
  </select>`;
}

export const viewSwitch = (views, active) => html`<div class="seg" role="group" aria-label="طريقة العرض">${views.map(([k, l, ic]) => html`<button type="button" class="${k === active ? 'on' : ''}" data-act="view" data-view="${k}" aria-pressed="${k === active}" title="${l}">${icon(ic)}<span>${l}</span></button>`)}</div>`;

// ---------- lists

export function table({ columns, rows, act = 'open', col, emptyText = 'لا توجد عناصر بعد.' }) {
  if (!rows.length) return html`<p class="muted pad">${emptyText}</p>`;
  return html`<div class="table-wrap stack"><table class="tbl">
    <thead><tr>${columns.map(c => html`<th class="${c.cls || ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map(r => html`<tr data-act="${act}" data-col="${col}" data-id="${r.id}" tabindex="0">${columns.map(c => html`<td class="${c.cls || ''}" data-label="${c.label}">${c.cell(r)}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

export function board({ columns, card, col, field = 'status', canMove = true }) {
  return html`<div class="board" data-board="${col}" data-field="${field}">
    ${columns.map(c => html`<section class="lane t-${c.tone || 'idle'}" data-lane="${c.key}"${canMove ? raw(' data-drop="1"') : ''}>
      <header class="lane-head"><span class="lane-dot"></span><h3>${c.label}</h3><span class="lane-n">${c.items.length}</span>${c.extra || ''}</header>
      <div class="lane-body">${c.items.length ? c.items.map(it => html`<article class="card" data-act="open" data-col="${col}" data-id="${it.id}" tabindex="0"${canMove ? raw(' draggable="true"') : ''}>${card(it)}</article>`) : html`<p class="lane-empty">لا شيء هنا</p>`}</div>
    </section>`)}
  </div>`;
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
// On phones the cells show coloured dots; tapping a day lists its items under the grid.
export function monthGrid(month, itemsFor, { addAct = '', addData = {}, agendaFor = itemsFor } = {}) {
  const first = parseDay(monthStart(month));
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    cells.push(iso(d));
  }
  const m = first.getMonth();
  const t = today();
  const focus = parseDay(t).getMonth() === m && parseDay(t).getFullYear() === first.getFullYear() ? t : monthStart(month);
  const addData_ = Object.fromEntries(Object.entries(addData).map(([k, v]) => ['data-' + k, v]));
  return html`<div class="month" role="grid" aria-label="التقويم">
    <div class="month-head" role="row">${DAYS.map(d => html`<div role="columnheader">${d}</div>`)}</div>
    <div class="month-body">${cells.map(c => {
      const d = parseDay(c);
      const items = itemsFor(c);
      return html`<div class="day${d.getMonth() !== m ? ' out' : ''}${c === t ? ' today' : ''}${isWeekend(c) ? ' wkend' : ''}${c === focus ? ' picked' : ''}" role="gridcell" data-day="${c}" data-act="pick-day"${raw(' data-drop="1"')}>
        <div class="day-top"><span class="day-n">${d.getDate()}</span>${addAct ? html`<button type="button" class="day-add" data-act="${addAct}" data-date="${c}"${attrs(addData_)} aria-label="أضف في ${fmtShort(c)}">${icon('plus')}</button>` : ''}</div>
        <div class="day-items">${items}</div>
        <template class="day-full">${agendaFor(c)}</template>
      </div>`;
    })}</div>
  </div>
  <section class="day-agenda" aria-live="polite">
    <header><h3 class="agenda-h">${agendaTitle(focus)}</h3>${addAct ? html`<button type="button" class="btn btn-small btn-quiet agenda-add" data-act="${addAct}" data-date="${focus}"${attrs(addData_)}>${icon('plus')}<span>أضف</span></button>` : ''}</header>
    <div class="agenda-items">${agendaFor(focus) || html`<p class="muted small">لا شيء في هذا اليوم.</p>`}</div>
  </section>`;
}

const agendaTitle = d => `${fmtWeekday(d)}، ${fmtDate(d)}`;
onAct({
  'pick-day': el => {
    if (!matchMedia('(max-width: 900px)').matches) return;
    const grid = el.closest('.month');
    const agenda = grid?.nextElementSibling;
    if (!agenda?.classList.contains('day-agenda')) return;
    grid.querySelectorAll('.day.picked').forEach(x => x.classList.remove('picked'));
    el.classList.add('picked');
    const day = el.dataset.day;
    const full = el.querySelector('template.day-full')?.innerHTML.trim();
    agenda.querySelector('.agenda-h').textContent = agendaTitle(day);
    agenda.querySelector('.agenda-items').innerHTML = full || '<p class="muted small">لا شيء في هذا اليوم.</p>';
    const add = agenda.querySelector('.agenda-add');
    if (add) add.dataset.date = day;
  },
});

// ---------- charts (thin marks, text in ink, values on hover and in labels)

export function hbars(rows, { max, unit = v => num(v) } = {}) {
  const top = max || Math.max(1, ...rows.map(r => r.value || 0));
  return html`<ul class="hbars">${rows.map(r => {
    const w = Math.max(r.value ? 2 : 0, Math.round((r.value / top) * 100));
    return html`<li title="${r.label}: ${unit(r.value)}"><span class="hb-l">${r.label}</span><span class="hb-track"><span class="hb-bar t-${r.tone || 'work'}" style="width:${w}%"></span></span><span class="hb-v">${r.display ?? unit(r.value)}</span></li>`;
  })}</ul>`;
}

export function segbar(parts, { labelled = true } = {}) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0) || 1;
  return html`<div class="segbar-wrap"><div class="segbar" role="img" aria-label="${parts.map(p => `${p.label}: ${p.value}`).join('، ')}">${parts.filter(p => p.value).map(p => html`<span class="t-${p.tone}" style="flex:${p.value}" title="${p.label}: ${p.value}"></span>`)}</div>
  ${labelled ? html`<ul class="legend">${parts.map(p => html`<li><span class="lg-dot t-${p.tone}"></span>${p.label}<b>${p.value}</b></li>`)}</ul>` : ''}</div>`;
}

export function ring(value, { size = 64, label: l = '' } = {}) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = 26; const c = 2 * Math.PI * r;
  return html`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${l} ${Math.round(v)}%">
    <circle cx="32" cy="32" r="${r}" class="ring-bg"/>
    <circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 32 32)"/>
    <text x="32" y="36" text-anchor="middle">${Math.round(v)}%</text>
  </svg>`;
}

// ---------- the record form, generated from the schema

const CAPTION_LIMITS = { x: 280, instagram: 2200, linkedin: 3000, tiktok: 4000 };
export const captionLimits = CAPTION_LIMITS;

const opt = (k, l, v) => html`<option value="${k}"${String(k) === String(v ?? '') ? raw(' selected') : ''}>${l}</option>`;

function relationOptions(type) {
  if (type === 'member') return members().map(m => [m.id, m.name]);
  if (type === 'client') return store.all('clients').sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(c => [c.id, c.name]);
  if (type === 'project') return store.all('projects').filter(p => p.stage !== 'closed').map(p => [p.id, p.name]);
  if (type === 'service') return settings.services().map(s => [s, s]);
  if (type === 'pillar') return (settings.content().pillars || []).map(p => [p.key, p.label]);
  if (type === 'platform') return Object.entries(PLATFORMS).map(([k, p]) => [k, p.label]);
  if (type === 'role') return store.all('roles').map(r => [r.id, r.name]);
  return [];
}

function checklistRows(f, list = []) {
  return (list.length ? list : [{}]).map(item => html`<div class="cl-row">
    <input type="checkbox" class="cl-done" aria-label="تم"${item.done ? raw(' checked') : ''}>
    <input type="text" class="cl-text" value="${item.t || ''}" placeholder="${f.k === 'milestones' ? 'تسليم أو مرحلة' : 'خطوة'}" aria-label="الخطوة">
    ${f.dated ? html`<input type="date" class="cl-due" value="${item.due || ''}" aria-label="الموعد">` : ''}
    <button type="button" class="btn btn-icon btn-quiet" data-act="cl-del" title="حذف الخطوة" aria-label="حذف الخطوة">${icon('x')}</button>
  </div>`);
}

function itemRows(list = []) {
  return (list.length ? list : [{}]).map(it => html`<div class="it-row">
    <input type="text" class="it-desc" value="${it.desc || ''}" placeholder="وصف البند" aria-label="وصف البند">
    <input type="number" class="it-qty" value="${it.qty ?? 1}" min="0" step="any" inputmode="decimal" aria-label="الكمية" data-input="items" data-delay="0">
    <input type="number" class="it-price" value="${it.price ?? ''}" min="0" step="any" inputmode="decimal" aria-label="السعر" data-input="items" data-delay="0">
    <output class="it-total">${num((Number(it.qty ?? 1) || 0) * (Number(it.price) || 0))}</output>
    <button type="button" class="btn btn-icon btn-quiet" data-act="it-del" title="حذف البند" aria-label="حذف البند">${icon('x')}</button>
  </div>`);
}

function actionRows(list = []) {
  const ms = members();
  return (list.length ? list : [{}]).map(a => html`<div class="ac-row"${a.taskId ? raw(` data-task="${esc(a.taskId)}"`) : ''}>
    <input type="text" class="ac-text" value="${a.t || ''}" placeholder="المهمة" aria-label="المهمة">
    <select class="ac-owner" aria-label="المسؤول"><option value="">بلا مسؤول</option>${ms.map(m => opt(m.id, m.name, a.owner))}</select>
    <input type="date" class="ac-due" value="${a.due || ''}" aria-label="الموعد">
    ${a.taskId ? html`<span class="ac-linked" title="تحولت إلى مهمة">${icon('check')}</span>` : html`<button type="button" class="btn btn-icon btn-quiet" data-act="ac-del" title="حذف" aria-label="حذف">${icon('x')}</button>`}
  </div>`);
}

export function fieldControl(f, value, rec = {}) {
  const id = `f-${f.k}`;
  const common = { id, name: f.k, required: f.req && !['members', 'platforms', 'checklist', 'items', 'actions'].includes(f.type), dir: f.dir, placeholder: f.ph };
  switch (f.type) {
    case 'textarea':
      return html`<textarea${attrs({ ...common, rows: f.rows || 3 })}>${value || ''}</textarea>`;
    case 'caption': {
      const pfs = rec.platforms || [];
      return html`<textarea${attrs({ ...common, rows: 8, 'data-input': 'caption', 'data-delay': 0 })}>${value || ''}</textarea>
        <div class="counters" data-counters>${captionCounters(value || '', pfs)}</div>`;
    }
    case 'select':
      return html`<select${attrs(common)}>${f.req ? '' : html`<option value=""></option>`}${f.options.map(([k, l]) => opt(k, l, value ?? f.def))}</select>`;
    case 'docstatus': {
      const list = (rec.kind || 'quote') === 'invoice' ? INVOICE_STATUS : QUOTE_STATUS;
      return html`<select${attrs(common)}>${list.map(([k, l]) => opt(k, l, value ?? 'draft'))}</select>`;
    }
    case 'member': case 'client': case 'project': case 'service': case 'pillar': case 'platform': case 'role': {
      const list = relationOptions(f.type);
      return html`<select${attrs(common)}><option value="">${f.type === 'member' ? 'بلا مسؤول' : 'غير محدد'}</option>${list.map(([k, l]) => opt(k, l, value ?? f.def))}</select>`;
    }
    case 'members': {
      const list = members();
      const set = new Set(value || []);
      if (!list.length) return html`<p class="muted">أضف أعضاء الفريق من صفحة الفريق.</p>`;
      return html`<div class="chips" role="group" aria-label="${f.label}">${list.map(m => html`<label class="chip-check"><input type="checkbox" name="${f.k}" value="${m.id}"${set.has(m.id) ? raw(' checked') : ''}><span>${m.name}</span></label>`)}</div>`;
    }
    case 'platforms': {
      const set = new Set(value || []);
      return html`<div class="chips" role="group" aria-label="${f.label}">${Object.entries(PLATFORMS).map(([k, p]) => html`<label class="chip-check"><input type="checkbox" name="${f.k}" value="${k}" data-change="caption-pf"${set.has(k) ? raw(' checked') : ''}><span>${p.label}</span></label>`)}</div>`;
    }
    case 'date': return html`<input type="date"${attrs({ ...common, value: value || '' })}>`;
    case 'time': return html`<input type="time"${attrs({ ...common, value: value || '' })}>`;
    case 'number': case 'money':
      return html`<input type="number" step="any" inputmode="decimal"${attrs({ ...common, value: value ?? (f.def ?? '') })}>`;
    case 'bool': return html`<label class="switch"><input type="checkbox" name="${f.k}" id="${id}"${(value ?? f.def) ? raw(' checked') : ''}><span>${f.label}</span></label>`;
    case 'url': return html`<input type="url"${attrs({ ...common, dir: 'ltr', value: value || '', placeholder: f.ph || 'https://' })}>`;
    case 'tags': return html`<input type="text"${attrs({ ...common, value: (value || []).join('، '), placeholder: f.ph || 'افصل بفاصلة' })}>`;
    case 'checklist': return html`<div class="cl" data-cl="${f.k}"${f.dated ? raw(' data-dated="1"') : ''}>${checklistRows(f, value || [])}<button type="button" class="btn btn-quiet btn-small" data-act="cl-add">${icon('plus')}<span>أضف</span></button></div>`;
    case 'items': {
      const totals = invoiceTotals(value || [], rec.vat ?? 15);
      return html`<div class="items" data-items="${f.k}">
        <div class="it-head" aria-hidden="true"><span>البند</span><span>الكمية</span><span>السعر</span><span>المجموع</span><span></span></div>
        ${itemRows(value || [])}
        <button type="button" class="btn btn-quiet btn-small" data-act="it-add">${icon('plus')}<span>أضف بندا</span></button>
        <dl class="it-sum" data-sum>${sumRows(totals)}</dl>
      </div>`;
    }
    case 'actions': return html`<div class="acl" data-acl="${f.k}">${actionRows(value || [])}<button type="button" class="btn btn-quiet btn-small" data-act="ac-add">${icon('plus')}<span>أضف مهمة</span></button></div>`;
    default: return html`<input type="text"${attrs({ ...common, value: value ?? '' })}>`;
  }
}

export function invoiceTotals(items = [], vat = 15) {
  const sub = items.reduce((s, it) => s + (Number(it.qty ?? 1) || 0) * (Number(it.price) || 0), 0);
  const tax = sub * (Number(vat) || 0) / 100;
  return { sub, tax, total: sub + tax, vat: Number(vat) || 0 };
}
const sumRows = t => html`<div><dt>المجموع قبل الضريبة</dt><dd>${money(t.sub)}</dd></div><div><dt>الضريبة ${num(t.vat)}%</dt><dd>${money(t.tax)}</dd></div><div class="grand"><dt>الإجمالي</dt><dd>${money(t.total)}</dd></div>`;

export function captionCounters(text, pfs) {
  const len = [...(text || '')].length;
  const list = (pfs || []).filter(p => CAPTION_LIMITS[p]);
  if (!list.length) return html`<span class="muted">${num(len)} حرف</span>`;
  return list.map(p => html`<span class="${len > CAPTION_LIMITS[p] ? 'over' : ''}">${PLATFORMS[p].label}: ${num(len)} من ${num(CAPTION_LIMITS[p])}</span>`);
}

export function formHTML(col, rec = {}, { fields, readonly = false, formName = 'record' } = {}) {
  const list = (fields || SCHEMA[col].fields).filter(f => !f.when || f.when(rec)).filter(f => !f.money || canMoney());
  return html`<form class="rec-form" data-form="${formName}" data-col="${col}" data-id="${rec.id || ''}" novalidate>
    <fieldset${readonly ? raw(' disabled') : ''}>
      <div class="fields">${list.map(f => html`<div class="field${f.wide || ['textarea', 'checklist', 'items', 'actions', 'caption', 'members', 'platforms'].includes(f.type) ? ' wide' : ''}${f.type === 'bool' ? ' boolf' : ''}" data-field="${f.k}">
        ${f.type === 'bool' ? '' : html`<label for="f-${f.k}">${f.label}${f.req ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</label>`}
        ${fieldControl(f, rec[f.k], rec)}
        <p class="field-err" role="alert"></p>
      </div>`)}</div>
    </fieldset>
  </form>`;
}

const canMoney = () => {
  const m = ctx.me;
  const r = roleOf(m);
  return !!(r?.perms?.admin || r?.perms?.flags?.money);
};

export function readForm(form, col, { fields } = {}) {
  const values = {};
  const errors = {};
  const id = form.dataset.id;
  const old = id ? store.get(col, id) || {} : {};
  const list = (fields || SCHEMA[col].fields).filter(f => form.querySelector(`[data-field="${f.k}"]`));
  for (const f of list) {
    const box = form.querySelector(`[data-field="${f.k}"]`);
    const el = box.querySelector(`[name="${f.k}"]`);
    let v;
    switch (f.type) {
      case 'members': case 'platforms':
        v = [...box.querySelectorAll(`input[name="${f.k}"]:checked`)].map(i => i.value); break;
      case 'bool': v = !!el?.checked; break;
      case 'number': case 'money': v = el?.value === '' ? null : Number(el.value); break;
      case 'tags': v = String(el?.value || '').split(/[,،\n]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean); break;
      case 'checklist':
        v = [...box.querySelectorAll('.cl-row')].map(r => ({
          t: r.querySelector('.cl-text').value.trim(),
          done: r.querySelector('.cl-done').checked,
          ...(r.querySelector('.cl-due') ? { due: r.querySelector('.cl-due').value } : {}),
        })).filter(x => x.t); break;
      case 'items':
        v = [...box.querySelectorAll('.it-row')].map(r => ({
          desc: r.querySelector('.it-desc').value.trim(),
          qty: Number(r.querySelector('.it-qty').value) || 0,
          price: Number(r.querySelector('.it-price').value) || 0,
        })).filter(x => x.desc); break;
      case 'actions':
        v = [...box.querySelectorAll('.ac-row')].map(r => ({
          t: r.querySelector('.ac-text').value.trim(),
          owner: r.querySelector('.ac-owner').value,
          due: r.querySelector('.ac-due').value,
          ...(r.dataset.task ? { taskId: r.dataset.task } : {}),
        })).filter(x => x.t); break;
      default: v = el ? String(el.value).trim() : old[f.k];
    }
    values[f.k] = v;
    const emptyVal = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (f.req && emptyVal) errors[f.k] = 'هذه الخانة مطلوبة';
    if (f.type === 'url' && v && !/^https?:\/\//i.test(v)) errors[f.k] = 'اكتب الرابط كاملا ويبدأ بـ https://';
  }
  return { values, errors };
}

export function showErrors(form, errors) {
  form.querySelectorAll('.field').forEach(b => b.classList.remove('has-err'));
  form.querySelectorAll('.field-err').forEach(p => { p.textContent = ''; });
  let first = null;
  for (const [k, msg] of Object.entries(errors)) {
    const box = form.querySelector(`[data-field="${k}"]`);
    if (!box) continue;
    box.classList.add('has-err');
    box.querySelector('.field-err').textContent = msg;
    first ||= box.querySelector('input, select, textarea');
  }
  first?.focus();
  return !first;
}

// ---------- side panel

let lastFocus = null;
export function drawer({ title, sub = '', body, foot = '', wide = false, cls = '' }) {
  const root = document.getElementById('drawer');
  lastFocus = document.activeElement;
  root.innerHTML = String(html`<div class="scrim" data-act="close-drawer"></div>
    <aside class="panel${wide ? ' wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-labelledby="panel-title">
      <header class="panel-head"><div><h2 id="panel-title">${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>${btn('', { act: 'close-drawer', icon: 'x', kind: 'quiet', title: 'إغلاق' })}</header>
      <div class="panel-body">${body}</div>
      ${foot ? html`<footer class="panel-foot">${foot}</footer>` : ''}
    </aside>`);
  root.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => {
    root.classList.add('open');
    const first = root.querySelector('.panel-body input:not([type=checkbox]):not([disabled]), .panel-body select, .panel-body textarea');
    (first || root.querySelector('.panel-head button')).focus({ preventScroll: true });
  });
  return root;
}

export function closeDrawer() {
  const root = document.getElementById('drawer');
  if (root.hidden) return;
  root.classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => { root.hidden = true; root.innerHTML = ''; }, 180);
  lastFocus?.focus?.({ preventScroll: true });
}

// ---------- dialogs and toasts

export function modal({ title, body, actions }) {
  const root = document.getElementById('modal');
  root.innerHTML = String(html`<div class="scrim" data-act="close-modal"></div><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title"><h2 id="dlg-title">${title}</h2><div class="dialog-body">${body}</div><div class="dialog-actions">${actions}</div></div>`);
  root.hidden = false;
  requestAnimationFrame(() => (root.querySelector('.dialog input, .dialog select, .dialog .btn-primary, .dialog .btn-danger') || root.querySelector('.dialog .btn'))?.focus());
  return root;
}
export function closeModal() { const r = document.getElementById('modal'); r.hidden = true; r.innerHTML = ''; }

let confirmResolve = null;
export function confirmBox(text, { ok = 'تأكيد', danger = false, detail = '' } = {}) {
  return new Promise(resolve => {
    confirmResolve = resolve;
    modal({
      title: text,
      body: detail ? html`<p>${detail}</p>` : '',
      actions: html`${btn(ok, { act: 'confirm-yes', kind: danger ? 'danger' : 'primary' })}${btn('إلغاء', { act: 'confirm-no', kind: 'quiet' })}`,
    });
  });
}

export function toast(text, { undo, action, ms = 4200, kind = '' } = {}) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast${kind ? ' ' + kind : ''}`;
  el.setAttribute('role', 'status');
  const act = action || (undo ? { label: 'تراجع', run: undo } : null);
  el.innerHTML = String(html`<span>${text}</span>${act ? html`<button type="button" class="toast-undo">${act.label}</button>` : ''}`);
  root.append(el);
  if (act) el.querySelector('.toast-undo').addEventListener('click', () => { act.run(); el.remove(); });
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- the generic record panel

export const hooks = { beforeSave: {}, afterSave: {}, panelExtra: {}, panelFoot: {}, title: {} };

export function editRecord(col, id = null, { defaults = {}, title, after } = {}) {
  const schema = SCHEMA[col];
  const rec = id ? store.get(col, id) : { ...defaults };
  if (id && !rec) { toast('هذا العنصر لم يعد موجودا'); return; }
  const editable = id ? canEdit(schema.module, rec) : can(schema.module, 'own');
  const heading = title || (id ? (hooks.title[col]?.(rec) || rec.title || rec.name || schema.one) : schema.fresh);
  const extra = hooks.panelExtra[col]?.(rec) || '';
  const foot = editable ? html`${btn(id ? 'احفظ' : 'أضف', { act: 'submit-panel', kind: 'primary', icon: 'check' })}
    ${hooks.panelFoot[col]?.(rec) || ''}
    ${id ? btn('حذف', { act: 'delete-record', kind: 'quiet danger-text', icon: 'trash', data: { col, id } }) : ''}` : html`<p class="muted">لا تملك صلاحية التعديل على هذا العنصر.</p>`;
  drawer({ title: heading, sub: id ? `${schema.one}، آخر تعديل ${fmtShort(iso(new Date(rec.updatedAt || Date.now())))}` : '', body: html`${formHTML(col, rec, { readonly: !editable })}${extra}`, foot, wide: ['invoices', 'posts', 'meetings', 'projects', 'knowledge'].includes(col) });
  editRecord.after = after;
}

onAct({
  'close-drawer': () => closeDrawer(),
  'close-modal': () => closeModal(),
  'confirm-yes': () => { closeModal(); confirmResolve?.(true); confirmResolve = null; },
  'confirm-no': () => { closeModal(); confirmResolve?.(false); confirmResolve = null; },
  'submit-panel': () => document.querySelector('#drawer form.rec-form')?.requestSubmit(),
  open: el => editRecord(el.dataset.col, el.dataset.id),
  'delete-record': async el => {
    const { col, id } = el.dataset;
    const rec = store.get(col, id);
    const ok = await confirmBox(`حذف «${rec?.title || rec?.name || rec?.number || SCHEMA[col].one}»؟`, { ok: 'احذف', danger: true, detail: 'يمكنك التراجع فورا من الرسالة التي تظهر بعد الحذف، وتبقى نسخة في سجل التغييرات.' });
    if (!ok) return;
    store.remove(col, id);
    closeDrawer();
    toast('تم الحذف', { undo: () => store.restore(col, id) });
  },
  'cl-add': el => {
    const box = el.closest('.cl');
    const f = { k: box.dataset.cl, dated: box.dataset.dated === '1' };
    el.insertAdjacentHTML('beforebegin', String(checklistRows(f, [{}])[0]));
    el.previousElementSibling.querySelector('.cl-text').focus();
  },
  'cl-del': el => { const row = el.closest('.cl-row'); const box = row.parentElement; row.remove(); if (!box.querySelector('.cl-row')) box.querySelector('[data-act="cl-add"]').click(); },
  'it-add': el => { el.insertAdjacentHTML('beforebegin', String(itemRows([{}])[0])); el.previousElementSibling.querySelector('.it-desc').focus(); },
  'it-del': el => { const box = el.closest('.items'); el.closest('.it-row').remove(); recalcItems(box); },
  'ac-add': el => { el.insertAdjacentHTML('beforebegin', String(actionRows([{}])[0])); el.previousElementSibling.querySelector('.ac-text').focus(); },
  'ac-del': el => el.closest('.ac-row').remove(),
});

function recalcItems(box) {
  if (!box) return;
  const rows = [...box.querySelectorAll('.it-row')].map(r => {
    const qty = Number(r.querySelector('.it-qty').value) || 0;
    const price = Number(r.querySelector('.it-price').value) || 0;
    r.querySelector('.it-total').textContent = num(qty * price);
    return { qty, price };
  });
  const vat = box.closest('form')?.querySelector('[name="vat"]')?.value ?? 15;
  box.querySelector('[data-sum]').innerHTML = String(sumRows(invoiceTotals(rows, vat)));
}

onInput({
  items: el => recalcItems(el.closest('.items')),
  caption: el => {
    const form = el.closest('form');
    const pfs = [...form.querySelectorAll('input[name="platforms"]:checked')].map(i => i.value);
    form.querySelector('[data-counters]').innerHTML = String(captionCounters(el.value, pfs));
  },
});

onChange({
  'caption-pf': el => {
    const form = el.closest('form');
    const ta = form.querySelector('textarea[name="caption"]');
    if (ta) form.querySelector('[data-counters]').innerHTML = String(captionCounters(ta.value, [...form.querySelectorAll('input[name="platforms"]:checked')].map(i => i.value)));
  },
  'set-field': el => {
    const { col, id, field } = el.dataset;
    store.patch(col, id, { [field]: el.value });
  },
});

document.addEventListener('change', ev => {
  if (ev.target.matches('#drawer [name="vat"]')) recalcItems(ev.target.closest('form').querySelector('.items'));
  if (ev.target.matches('#drawer [name="kind"]')) {
    const form = ev.target.closest('form');
    const box = form.querySelector('[data-field="status"]');
    if (box) {
      const list = ev.target.value === 'invoice' ? INVOICE_STATUS : QUOTE_STATUS;
      box.querySelector('select').innerHTML = String(html`${list.map(([k, l]) => opt(k, l, 'draft'))}`);
    }
  }
});

onForm({
  record: form => {
    const col = form.dataset.col;
    const id = form.dataset.id || null;
    const { values, errors } = readForm(form, col);
    if (!showErrors(form, errors)) return;
    const old = id ? store.get(col, id) : null;
    let next = { ...(old || {}), ...values, ...(id ? { id } : {}) };
    if (hooks.beforeSave[col]) next = hooks.beforeSave[col](next, old) || next;
    const saved = store.put(col, next);
    hooks.afterSave[col]?.(saved, old);
    closeDrawer();
    toast(old ? 'تم الحفظ' : 'تمت الإضافة');
    editRecord.after?.(saved);
    editRecord.after = null;
  },
});

export const today_ = today;
export { addDays };
