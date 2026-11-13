// Quotes, invoices and expenses for internal follow-up. Official tax invoices come from a
// ZATCA-compliant e-invoicing system; this page tracks the money and prints clean copies.
import { html, raw } from '../core/html.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { ctx, can, flag, canSee, members, memberName, settings } from '../core/ctx.js';
import { register } from '../core/nav.js';
import { onAct } from '../core/actions.js';
import { page, tabs, btn, pill, table, search, select, editRecord, hooks, empty, toast, drawer, closeDrawer, hbars, invoiceTotals } from '../core/ui.js';
import { today, diffDays, addDays, fmtDate, fmtShort, fmtMonth, money, num, sum, matches, groupBy, count, FORMS, iso } from '../core/util.js';
import { QUOTE_STATUS, INVOICE_STATUS, EXPENSE_CATS, label } from '../core/schema.js';

const clientName = id => store.get('clients', id)?.name || '';
const totalOf = d => invoiceTotals(d.items || [], d.vat ?? 15).total;
const isLate = i => i.kind === 'invoice' && i.status === 'issued' && i.dueDate && diffDays(i.dueDate, today()) < 0;
const docStatus = i => (isLate(i) ? html`<span class="pill t-bad">متأخرة</span>` : pill(i.kind === 'invoice' ? INVOICE_STATUS : QUOTE_STATUS, i.status));

function nextNumber(kind) {
  const n = settings.numbering();
  const year = today().slice(0, 4);
  const key = `${kind}-${year}`;
  const used = store.raw('invoices').filter(i => i.kind === kind && String(i.number || '').includes(`-${year}-`)).map(i => Number(String(i.number).split('-').pop()) || 0);
  const next = Math.max(Number(n.next?.[key] || 0), ...used, 0) + 1;
  store.saveSetting('numbering', { ...n, next: { ...(n.next || {}), [key]: next } });
  return `${kind === 'invoice' ? n.invoice : n.quote}-${year}-${String(next).padStart(3, '0')}`;
}

hooks.beforeSave.invoices = (d, old) => {
  if (!d.number) d.number = nextNumber(d.kind || 'quote');
  if (!d.issue) d.issue = today();
  if (d.kind === 'invoice' && d.status === 'paid' && old?.status !== 'paid') d.paidAt = today();
  return d;
};
hooks.title.invoices = d => `${d.kind === 'invoice' ? 'فاتورة' : 'عرض سعر'} ${d.number || ''}`.trim();
hooks.panelFoot.invoices = d => {
  if (!d.id) return '';
  const b = [btn('معاينة وطباعة', { act: 'doc-preview', icon: 'print', kind: 'quiet', data: { id: d.id } })];
  if (d.kind !== 'invoice' && d.status === 'draft') b.push(btn('أرسل للاعتماد', { act: 'doc-review', icon: 'approvals', kind: 'quiet', data: { id: d.id } }));
  if (d.kind !== 'invoice' && d.status === 'approved') b.push(btn('علمه كمرسل', { act: 'doc-status', kind: 'quiet', data: { id: d.id, status: 'sent' } }));
  if (d.kind !== 'invoice' && d.status === 'sent') b.push(btn('تم القبول', { act: 'doc-status', kind: 'quiet', icon: 'check', data: { id: d.id, status: 'accepted' } }));
  if (d.kind !== 'invoice' && d.status === 'accepted') b.push(btn('حوله لفاتورة', { act: 'doc-invoice', kind: 'quiet', icon: 'finance', data: { id: d.id } }));
  if (d.kind === 'invoice' && d.status === 'issued') b.push(btn('تم الدفع', { act: 'doc-status', kind: 'quiet', icon: 'check', data: { id: d.id, status: 'paid' } }));
  return html`${b}`;
};
hooks.title.expenses = e => e.title;

register('finance', {
  label: 'العروض والفواتير', short: 'المالية', icon: 'finance', module: 'finance', aka: 'فاتورة عرض سعر مصروفات مالية تحصيل',
  badge: () => (flag('money') ? store.all('invoices').filter(isLate).length : 0),
  render(r) {
    if (!flag('money')) return page({ title: 'العروض والفواتير', body: empty({ title: 'المبالغ مخفية عن صلاحياتك', text: 'اطلب من أحد الشركاء صلاحية «يرى المبالغ».', ic: 'lock' }) });
    const tab = r.parts[0] || 'quotes';
    const q = r.query;
    const docs = store.all('invoices').filter(d => canSee('finance', d));
    const quotes = docs.filter(d => d.kind !== 'invoice');
    const invoices = docs.filter(d => d.kind === 'invoice');
    const t = tabs([['#/finance/quotes', 'العروض', quotes.length], ['#/finance/invoices', 'الفواتير', invoices.length], ['#/finance/expenses', 'المصروفات'], ['#/finance/summary', 'الملخص']], tab);
    const filt = list => (q.q ? list.filter(d => matches(`${d.number} ${clientName(d.client)}`, q.q)) : list).sort((a, b) => String(b.issue || '').localeCompare(String(a.issue || '')));
    const docCols = [
      { label: 'الرقم', cell: d => html`<b class="mono">${d.number || ''}</b>` },
      { label: 'العميل', cell: d => clientName(d.client) },
      { label: 'الإجمالي', cell: d => money(totalOf(d)), cls: 'num' },
      { label: 'الحالة', cell: docStatus },
      { label: 'التاريخ', cell: d => fmtShort(d.issue) },
    ];
    if (tab === 'expenses') {
      const exp = store.all('expenses').filter(e => canSee('finance', e)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const month = today().slice(0, 7);
      const thisMonth = exp.filter(e => String(e.date || '').slice(0, 7) === month);
      return page({
        title: 'العروض والفواتير', tabs: t,
        sub: `مصروفات هذا الشهر ${money(sum(thisMonth, e => e.amount))}، والشهرية المتكررة ${money(sum(exp.filter(e => e.recurring), e => e.amount))}`,
        actions: btn('أضف مصروفا', { act: 'new-expense', icon: 'plus', kind: 'primary' }),
        body: exp.length ? html`<div class="split">
          ${table({ col: 'expenses', rows: exp, columns: [
            { label: 'البند', cell: e => html`<b>${e.title}</b>${e.recurring ? html`<span class="muted small"> شهري</span>` : ''}` },
            { label: 'التصنيف', cell: e => label(EXPENSE_CATS, e.category) },
            { label: 'المبلغ', cell: e => money(e.amount), cls: 'num' },
            { label: 'التاريخ', cell: e => fmtShort(e.date) },
          ] })}
          <section class="module"><header class="module-head"><h2>حسب التصنيف هذا الشهر</h2></header>${hbars(EXPENSE_CATS.map(([k, l]) => ({ label: l, value: sum(thisMonth.filter(e => e.category === k), e => e.amount) })).filter(x => x.value), { unit: v => money(v) })}</section>
        </div>` : empty({ title: 'لا مصروفات مسجلة', text: 'سجل الاشتراكات والرسوم والإعلانات لتعرف كلفة التشغيل الحقيقية.', actions: btn('أضف مصروفا', { act: 'new-expense', icon: 'plus', kind: 'primary' }), ic: 'wallet' }),
      });
    }
    if (tab === 'summary') {
      const now = new Date();
      const last6 = Array.from({ length: 6 }, (_, i) => iso(new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)).slice(0, 7));
      const paid = invoices.filter(i => i.status === 'paid');
      const exp = store.all('expenses');
      const income = m => sum(paid.filter(i => String(i.paidAt || i.issue || '').slice(0, 7) === m), totalOf);
      const spend = m => sum(exp.filter(e => String(e.date || '').slice(0, 7) === m), e => e.amount);
      const receivable = invoices.filter(i => i.status === 'issued');
      const quarterStart = iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
      // months before the first recorded money are left out
      const firstIdx = last6.findIndex(m => income(m) || spend(m));
      const months = firstIdx < 0 ? last6.slice(-1) : last6.slice(firstIdx);
      const vatQ = sum(paid.filter(i => (i.paidAt || i.issue || '') >= quarterStart), i => invoiceTotals(i.items || [], i.vat ?? 15).tax);
      return page({
        title: 'العروض والفواتير', tabs: t,
        body: html`<div class="stats">
            <div class="stat"><span>المحصل هذا الشهر</span><b>${money(income(last6[5]))}</b></div>
            <div class="stat"><span>مستحق لم يحصل</span><b>${money(sum(receivable, totalOf))}</b><small>${count(receivable.filter(isLate).length, FORMS.lateInvoice, { zero: 'لا فواتير متأخرة' })}</small></div>
            <div class="stat"><span>مصروفات هذا الشهر</span><b>${money(spend(last6[5]))}</b></div>
            <div class="stat"><span>ضريبة على المحصل هذا الربع</span><b>${money(vatQ)}</b><small>للمتابعة فقط</small></div>
          </div>
          <div class="split">
            <section class="module"><header class="module-head"><h2>المحصل شهريا</h2></header>${hbars(months.map(m => ({ label: fmtMonth(m + '-01'), value: income(m), tone: 'good' })), { unit: v => money(v) })}</section>
            <section class="module"><header class="module-head"><h2>المصروفات شهريا</h2></header>${hbars(months.map(m => ({ label: fmtMonth(m + '-01'), value: spend(m), tone: 'warn' })), { unit: v => money(v) })}</section>
          </div>
          <p class="muted small">الأرقام من الفواتير المدفوعة والمصروفات المسجلة هنا فقط. الحسابات الرسمية والإقرارات من المحاسب ونظام الفوترة المعتمد.</p>`,
      });
    }
    const isInv = tab === 'invoices';
    const list = filt(isInv ? invoices : quotes);
    return page({
      title: 'العروض والفواتير', tabs: t,
      sub: isInv ? 'الفاتورة الضريبية الرسمية تصدر من نظام فوترة متوافق مع هيئة الزكاة والضريبة. هنا نتابع الإصدار والتحصيل.' : 'كل عرض مسودة حتى يعتمده شريك، ثم يرسل.',
      actions: btn(isInv ? 'فاتورة جديدة' : 'عرض سعر جديد', { act: 'new-doc', icon: 'plus', kind: 'primary', data: { kind: isInv ? 'invoice' : 'quote' } }),
      body: html`<div class="filters">${search('q', q.q, 'ابحث بالرقم أو العميل')}</div>
        ${list.length || q.q ? table({ col: 'invoices', rows: list, columns: docCols, emptyText: 'لا نتائج.' }) : empty({ title: isInv ? 'لا فواتير بعد' : 'لا عروض أسعار بعد', text: isInv ? 'تتحول العروض المقبولة إلى فواتير بضغطة.' : 'العرض يبنى من موجز العميل، والأسعار من القائمة المعتمدة فقط.', actions: btn(isInv ? 'فاتورة جديدة' : 'عرض سعر جديد', { act: 'new-doc', icon: 'plus', kind: 'primary', data: { kind: isInv ? 'invoice' : 'quote' } }), ic: 'finance' })}`,
    });
  },
});

function docPreview(d) {
  const c = settings.company();
  const client = store.get('clients', d.client);
  const t = invoiceTotals(d.items || [], d.vat ?? 15);
  const inv = d.kind === 'invoice';
  return html`<article class="doc-print" id="print-area">
    <header class="doc-head">
      <div><h2>${c.name}</h2><p>${c.nameEn || ''}</p>${c.cr ? html`<p>السجل التجاري: <span class="mono">${c.cr}</span></p>` : ''}${c.vat ? html`<p>الرقم الضريبي: <span class="mono">${c.vat}</span></p>` : ''}${c.address || c.city ? html`<p>${[c.address, c.city].filter(Boolean).join('، ')}</p>` : ''}</div>
      <div class="doc-id"><h3>${inv ? 'فاتورة' : 'عرض سعر'}</h3><p class="mono">${d.number || ''}</p><p>${fmtDate(d.issue || today())}</p>${d.dueDate ? html`<p>${inv ? 'تستحق في' : 'صالح حتى'} ${fmtDate(d.dueDate)}</p>` : ''}</div>
    </header>
    <section class="doc-to"><span>إلى</span><b>${client?.name || ''}</b>${client?.contact ? html`<span>${client.contact}</span>` : ''}</section>
    <table class="doc-lines"><thead><tr><th>البند</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${(d.items || []).map(it => html`<tr><td>${it.desc}</td><td class="num">${num(it.qty)}</td><td class="num">${money(it.price)}</td><td class="num">${money((it.qty || 0) * (it.price || 0))}</td></tr>`)}</tbody></table>
    <dl class="doc-sum"><div><dt>المجموع قبل الضريبة</dt><dd>${money(t.sub)}</dd></div><div><dt>ضريبة القيمة المضافة ${num(t.vat)}%</dt><dd>${money(t.tax)}</dd></div><div class="grand"><dt>الإجمالي</dt><dd>${money(t.total)}</dd></div></dl>
    ${d.terms ? html`<section class="doc-terms"><h4>الشروط والملاحظات</h4><p>${d.terms}</p></section>` : ''}
    ${inv ? html`<p class="doc-note">نسخة للمتابعة الداخلية. الفاتورة الضريبية الرسمية تصدر من نظام الفوترة الإلكترونية المعتمد.</p>` : ''}
  </article>`;
}

onAct({
  'new-doc': el => editRecord('invoices', null, { defaults: { kind: el.dataset.kind || 'quote', status: 'draft', vat: 15, issue: today(), dueDate: addDays(today(), el.dataset.kind === 'invoice' ? 14 : 30), client: el.dataset.client || '' } }),
  'new-quote': () => editRecord('invoices', null, { defaults: { kind: 'quote', status: 'draft', vat: 15, issue: today(), dueDate: addDays(today(), 30) } }),
  'new-expense': () => editRecord('expenses', null, { defaults: { date: today(), category: 'tools', paidBy: ctx.me.id } }),
  'doc-preview': el => {
    const d = store.get('invoices', el.dataset.id);
    drawer({ title: hooks.title.invoices(d), wide: true, cls: 'print-panel', body: docPreview(d), foot: html`${btn('اطبع أو احفظ PDF', { act: 'print', icon: 'print', kind: 'primary' })}${btn('رجوع', { act: 'open', kind: 'quiet', data: { col: 'invoices', id: d.id } })}` });
  },
  'doc-review': el => { store.patch('invoices', el.dataset.id, { status: 'review' }); closeDrawer(); toast('أرسل للاعتماد، ويظهر للشركاء في الموافقات'); },
  'doc-status': el => { const patch = { status: el.dataset.status }; if (el.dataset.status === 'paid') patch.paidAt = today(); store.patch('invoices', el.dataset.id, patch); closeDrawer(); toast('تم'); },
  'doc-invoice': el => {
    const qd = store.get('invoices', el.dataset.id);
    const inv = store.put('invoices', { kind: 'invoice', client: qd.client, project: qd.project, items: structuredClone(qd.items || []), vat: qd.vat ?? 15, status: 'draft', issue: today(), dueDate: addDays(today(), 14), terms: qd.terms, fromQuote: qd.id, number: nextNumber('invoice') });
    closeDrawer();
    toast(`أنشئت الفاتورة ${inv.number}`);
    setTimeout(() => editRecord('invoices', inv.id), 220);
  },
});
