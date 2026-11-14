// يوميات التداول: every trade with its reason, its result and the state of mind behind it, and the
// statistics that show which setups actually pay. Saved analyses live here too.
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { ctx } from '../../core/ctx.js';
import { onAct, onForm } from '../../core/actions.js';
import { btn, modal, closeModal, toast, confirmBox } from '../../core/ui.js';
import { fmtStamp, num, count, download, csv } from '../../core/util.js';
import { tstore } from '../tstore.js';
import { journalStats } from '../engine/risk.js';
import { SYMBOLS, symbolInfo } from '../engine/symbols.js';
import { SCHOOL_NAMES } from '../engine/analyze.js';
import { P, pctPlain, quietQuery } from '../tui.js';

let S = null;
const TRADES = ['صفقة واحدة', 'صفقتان', 'صفقات', 'صفقة'];
const EMOTIONS = ['هادئ وملتزم', 'متردد', 'خائف من الخسارة', 'طامع', 'أعوض خسارة سابقة', 'ملل أو رغبة في الحركة'];
const SETUPS = ['تحليل إكس نواة', 'توصية قناة', ...Object.values(SCHOOL_NAMES), 'أخرى'];

export function mount(box, route) {
  S = { box, tab: route.query.tab === 'notes' ? 'notes' : 'trades', off: [] };
  S.off.push(tstore.on(ev => { if (S && ['trades', 'notes'].includes(ev.col)) draw(); }));
  draw();
  if (route.query.add) setTimeout(() => openTrade(null, route.query), 50);
}
export function unmount() { S?.off.forEach(f => f()); S = null; }

function draw() {
  const trades = tstore.all('trades').sort((a, b) => (b.at || 0) - (a.at || 0));
  const notes = tstore.all('notes').sort((a, b) => (b.at || 0) - (a.at || 0));
  S.box.innerHTML = String(html`
    <header class="page-head"><div class="page-titles"><h1>يوميات التداول</h1><p class="page-sub">ما لا تسجله لا تستطيع تحسينه. سجل كل صفقة بسببها وشعورك عند الدخول.</p></div>
      <div class="page-actions">${btn('نزل CSV', { act: 't-j-csv', icon: 'download', kind: 'quiet' })}${btn('سجل صفقة', { act: 't-j-add', icon: 'plus', kind: 'primary' })}</div></header>
    <nav class="tabs" aria-label="أقسام الصفحة"><a href="#/journal" class="${S.tab === 'trades' ? 'on' : ''}">الصفقات <span class="tab-n">${trades.length}</span></a><a href="#/journal?tab=notes" class="${S.tab === 'notes' ? 'on' : ''}">التحليلات المحفوظة <span class="tab-n">${notes.length}</span></a></nav>
    <div class="page-body">${S.tab === 'notes' ? notesView(notes) : tradesView(trades)}</div>`);
}

function tradesView(trades) {
  const st = journalStats(trades);
  if (!trades.length) return html`<div class="empty"><div class="empty-mark">${icon('journal')}</div><h3>لا صفقات بعد</h3><p>سجل صفقاتك الحقيقية أو التجريبية، وبعد 20 صفقة تبدأ الأرقام في إظهار ما ينجح معك وما لا ينجح.</p><div class="empty-actions">${btn('سجل أول صفقة', { act: 't-j-add', kind: 'primary' })}</div></div>`;
  return html`${st.n ? html`<div class="t-jstats">
      <div class="stat"><span>الصافي</span><b class="${st.net >= 0 ? 'up' : 'down'}">${num(Math.round(st.net * 100) / 100)}</b></div>
      <div class="stat"><span>نسبة النجاح</span><b>${pctPlain(st.winRate)}</b><small>${st.wins} من ${st.n}</small></div>
      <div class="stat"><span>متوسط العائد</span><b>${st.avgR != null ? `${st.avgR.toFixed(2)}R` : 'غير محسوب'}</b></div>
      <div class="stat"><span>معامل الربح</span><b>${st.profitFactor === Infinity ? 'بلا خسائر' : st.profitFactor != null ? st.profitFactor.toFixed(2) : ''}</b></div>
      <div class="stat"><span>أقصى تراجع</span><b class="down">${num(Math.round(st.maxDd * 100) / 100)}</b></div>
      <div class="stat"><span>أطول خسائر متتالية</span><b>${st.maxLossStreak}</b></div>
      <div class="stat"><span>التزمت بالخطة</span><b>${pctPlain(st.followedPlan)}</b></div>
    </div>
    ${curve(st.curve)}
    <div class="split t-jbreak">
      ${breakdown('حسب سبب الدخول', st.bySetup)}
      ${breakdown('حسب الشعور عند الدخول', st.byEmotion)}
      ${breakdown('حسب الرمز', st.bySymbol)}
      ${breakdown('حسب اليوم', st.byDay)}
    </div>
    ${st.n < 20 ? html`<p class="small muted">${count(st.n, TRADES)} لا تكفي لاستنتاج؛ الأرقام تصبح ذات معنى بعد 20 إلى 30 صفقة على الأقل.</p>` : ''}` : ''}
    <div class="table-wrap"><table class="tbl t-jtable"><thead><tr><th>الوقت</th><th>الرمز</th><th>الاتجاه</th><th>الدخول والخروج</th><th>النتيجة</th><th>السبب</th><th></th></tr></thead>
    <tbody>${trades.map(t => html`<tr data-act="t-j-edit" data-id="${t.id}" tabindex="0">
      <td data-label="الوقت">${fmtStamp(t.at)}</td>
      <td data-label="الرمز"><b>${t.symbol}</b></td>
      <td data-label="الاتجاه"><span class="${t.side === 'buy' ? 'up' : 'down'}">${t.kind === 'binary' ? (t.side === 'buy' ? 'صعود' : 'هبوط') : t.side === 'buy' ? 'شراء' : 'بيع'}</span></td>
      <td data-label="الدخول والخروج"><span class="mono">${t.entry ? P(Number(t.entry), t.symbol) : ''}</span>${t.exit ? html` إلى <span class="mono">${P(Number(t.exit), t.symbol)}</span>` : ''}</td>
      <td data-label="النتيجة"><span class="t-res t-${t.result === 'win' ? 'up' : t.result === 'loss' ? 'down' : 'flat'}">${{ win: 'ربح', loss: 'خسارة', be: 'تعادل', open: 'مفتوحة' }[t.result] || ''}</span>${t.pnl ? html` <span class="mono">${num(Number(t.pnl))}</span>` : ''}${t.r ? html` <small class="muted mono">${Number(t.r).toFixed(2)}R</small>` : ''}</td>
      <td data-label="السبب">${t.setup || ''}</td>
      <td>${icon('edit')}</td>
    </tr>`)}</tbody></table></div>`;
}

function curve(points) {
  if (!points || points.length < 2) return '';
  const w = 600;
  const h = 120;
  const ys = points.map(p => p.eq);
  const min = Math.min(0, ...ys);
  const max = Math.max(0, ...ys);
  const span = max - min || 1;
  const X = k => (k / (points.length - 1)) * w;
  const Y = v => h - ((v - min) / span) * (h - 10) - 5;
  const d = points.map((p, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(p.eq).toFixed(1)}`).join(' ');
  return html`<figure class="t-curve"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="منحنى رصيد الصفقات"><line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" class="t-curve-zero"/><path d="${d}" class="t-curve-line ${ys[ys.length - 1] >= 0 ? 'up' : 'down'}"/></svg><figcaption class="small muted">منحنى الصافي التراكمي بترتيب الصفقات</figcaption></figure>`;
}

function breakdown(title, rows) {
  if (!rows?.length) return '';
  return html`<section class="module"><header class="module-head"><h2>${title}</h2></header><ul class="t-break">${rows.slice(0, 6).map(r => html`<li><span>${r.k}</span><small>${count(r.n, TRADES)}</small><b>${pctPlain(r.winRate)}</b><span class="mono ${r.pnl >= 0 ? 'up' : 'down'}">${num(Math.round(r.pnl * 100) / 100)}</span></li>`)}</ul></section>`;
}

function notesView(notes) {
  if (!notes.length) return html`<p class="muted">احفظ أي تحليل من صفحة السوق بزر «احفظه في الملاحظات»، فيظهر هنا لتراجعه بعد أن تتضح النتيجة.</p>`;
  return html`<ul class="t-notes">${notes.map(n => html`<li class="module">
    <header class="module-head"><h2>${n.symbol} <small class="muted">${n.tf}</small></h2><span class="t-res t-${n.bias === 'buy' ? 'up' : n.bias === 'sell' ? 'down' : 'flat'}">${n.bias === 'buy' ? 'شراء' : n.bias === 'sell' ? 'بيع' : 'محايد'} ${Math.abs(n.score)}</span></header>
    <p class="small muted">${fmtStamp(n.at)}، السعر ${P(n.price, n.symbol)}</p>
    <details><summary class="small">نص التحليل</summary><pre class="t-sig-text">${n.text}</pre></details>
    <div class="row-btns">${btn('افتح الشارت', { href: `#/market?sym=${n.symbol}&tf=${n.tf}`, kind: 'quiet', cls: 'btn-small' })}${btn('', { act: 't-n-del', data: { id: n.id }, icon: 'trash', kind: 'quiet', cls: 'btn-small', title: 'احذف' })}</div>
  </li>`)}</ul>`;
}

function openTrade(id, pre = {}) {
  const t = id ? tstore.get('trades', id) : null;
  const v = { at: Date.now(), kind: symbolInfo(pre.sym)?.cls === 'crypto' ? 'crypto' : 'fx', side: pre.side || 'buy', symbol: pre.sym || 'EURUSD', entry: pre.entry || '', sl: pre.sl || '', tp: pre.tp || '', setup: pre.setup || '', result: 'open', plan: 'yes', ...(t || {}) };
  const dt = new Date(v.at - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const opt = (list, cur) => list.map(([k, l]) => html`<option value="${k}"${String(cur) === String(k) ? raw(' selected') : ''}>${l}</option>`);
  modal({
    title: t ? 'تعديل الصفقة' : 'سجل صفقة',
    body: html`<form data-form="t-j-save" data-id="${t?.id || ''}" class="rec-form"><div class="fields">
      <div class="field"><label for="j-at">الوقت</label><input id="j-at" name="at" type="datetime-local" value="${dt}" required></div>
      <div class="field"><label for="j-sym">الرمز</label><select id="j-sym" name="symbol" class="sel">${opt(SYMBOLS.map(x => [x.s, x.s]), v.symbol)}</select></div>
      <div class="field"><label for="j-kind">النوع</label><select id="j-kind" name="kind" class="sel">${opt([['fx', 'فوركس أو عقود'], ['crypto', 'عملات رقمية'], ['binary', 'خيارات ثنائية']], v.kind)}</select></div>
      <div class="field"><label for="j-side">الاتجاه</label><select id="j-side" name="side" class="sel">${opt([['buy', 'شراء أو صعود'], ['sell', 'بيع أو هبوط']], v.side)}</select></div>
      <div class="field"><label for="j-entry">سعر الدخول</label><input id="j-entry" name="entry" type="number" step="any" value="${v.entry}"></div>
      <div class="field"><label for="j-sl">وقف الخسارة</label><input id="j-sl" name="sl" type="number" step="any" value="${v.sl}"></div>
      <div class="field"><label for="j-tp">الهدف</label><input id="j-tp" name="tp" type="number" step="any" value="${v.tp}"></div>
      <div class="field"><label for="j-exit">سعر الخروج</label><input id="j-exit" name="exit" type="number" step="any" value="${v.exit || ''}"></div>
      <div class="field"><label for="j-size">الحجم (لوت أو مبلغ)</label><input id="j-size" name="size" type="number" step="any" value="${v.size || ''}"></div>
      <div class="field"><label for="j-result">النتيجة</label><select id="j-result" name="result" class="sel">${opt([['open', 'مفتوحة'], ['win', 'ربح'], ['loss', 'خسارة'], ['be', 'تعادل']], v.result)}</select></div>
      <div class="field"><label for="j-pnl">الربح أو الخسارة بالمبلغ</label><input id="j-pnl" name="pnl" type="number" step="any" value="${v.pnl ?? ''}" placeholder="بالسالب للخسارة"></div>
      <div class="field"><label for="j-setup">سبب الدخول</label><select id="j-setup" name="setup" class="sel"><option value=""></option>${opt(SETUPS.map(x => [x, x]), v.setup)}</select></div>
      <div class="field"><label for="j-emotion">شعورك عند الدخول</label><select id="j-emotion" name="emotion" class="sel"><option value=""></option>${opt(EMOTIONS.map(x => [x, x]), v.emotion)}</select></div>
      <div class="field"><label for="j-plan">هل التزمت بخطتك؟</label><select id="j-plan" name="plan" class="sel">${opt([['yes', 'نعم'], ['no', 'لا']], v.plan)}</select></div>
      <div class="field wide"><label for="j-notes">ملاحظات ودرس الصفقة</label><textarea id="j-notes" name="notes" rows="3">${v.notes || ''}</textarea></div>
    </div></form>`,
    actions: html`${btn('احفظ', { act: 't-j-submit', kind: 'primary' })}${t ? btn('احذف', { act: 't-j-del', data: { id: t.id }, kind: 'quiet danger-text' }) : ''}${btn('إلغاء', { act: 'close-modal', kind: 'quiet' })}`,
  });
}

onAct({
  't-j-add': () => openTrade(null),
  't-j-edit': el => openTrade(el.dataset.id),
  't-j-submit': () => document.querySelector('#modal form[data-form="t-j-save"]')?.requestSubmit(),
  't-j-del': async el => { closeModal(); if (await confirmBox('حذف الصفقة؟', { ok: 'احذف', danger: true })) tstore.remove('trades', el.dataset.id); },
  't-n-del': async el => { if (await confirmBox('حذف التحليل المحفوظ؟', { ok: 'احذف', danger: true })) tstore.remove('notes', el.dataset.id); },
  't-j-csv': () => {
    const rows = tstore.all('trades').sort((a, b) => a.at - b.at).map(t => [new Date(t.at).toISOString(), t.symbol, t.kind, t.side, t.entry, t.sl, t.tp, t.exit, t.size, t.result, t.pnl, t.r, t.setup, t.emotion, t.plan, t.notes]);
    download('nawah-trades.csv', '\uFEFF' + csv([['time', 'symbol', 'kind', 'side', 'entry', 'stop', 'target', 'exit', 'size', 'result', 'pnl', 'r', 'setup', 'emotion', 'followed_plan', 'notes'], ...rows]), 'text/csv');
  },
});

onForm({
  't-j-save': f => {
    const g = n => f[n].value.trim();
    const numOr = n => (g(n) === '' ? null : Number(g(n)));
    const entry = numOr('entry');
    const sl = numOr('sl');
    const exit = numOr('exit');
    const side = g('side');
    // R from the prices when they are there: the result in units of the planned risk
    const r = entry != null && sl != null && exit != null && entry !== sl ? ((side === 'buy' ? 1 : -1) * (exit - entry)) / Math.abs(entry - sl) : null;
    const rec = {
      at: new Date(g('at')).getTime() || Date.now(), symbol: g('symbol'), kind: g('kind'), side, entry, sl, tp: numOr('tp'), exit, size: numOr('size'),
      result: g('result'), pnl: numOr('pnl'), r: r != null ? Math.round(r * 100) / 100 : null, setup: g('setup'), emotion: g('emotion'), plan: g('plan'), notes: g('notes'),
    };
    if (f.dataset.id) tstore.patch('trades', f.dataset.id, rec); else tstore.put('trades', rec);
    closeModal();
    toast('حفظت الصفقة');
    if (ctx.route.query.add) quietQuery({ add: '', sym: '', side: '', entry: '', sl: '', tp: '', setup: '' });
  },
});
