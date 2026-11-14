// المخاطرة والحسابات: position size, pip value, binary option arithmetic, the martingale in
// numbers, expectancy and Kelly, drawdown. Every card recalculates as you type.
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { onInput, onChange, onAct } from '../../core/actions.js';
import { btn, toast } from '../../core/ui.js';
import { num } from '../../core/util.js';
import { tsetting, saveTSetting } from '../tstore.js';
import { SYMBOLS, symbolInfo } from '../engine/symbols.js';
import { positionSize, conversionNeed, binaryExpectancy, martingale, kelly, recoveryNeeded, lossesAllowed, streakOdds, breakEven } from '../engine/risk.js';
import { quotes } from '../data.js';

let S = null;

export function mount(box, route) {
  const r = tsetting('risk', { balance: 1000, riskPct: 1, payout: 85, leverage: 100, maxDailyLossPct: 3 });
  S = { box, q: route.query, r };
  box.innerHTML = String(view());
  calcAll();
}
export function unmount() { S = null; }

const symOptions = cur => SYMBOLS.map(x => html`<option value="${x.s}"${x.s === cur ? raw(' selected') : ''}>${x.s}، ${x.ar}</option>`);
const field = (id, label, value, opts = {}) => html`<div class="field${opts.wide ? ' wide' : ''}"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="number" step="any" inputmode="decimal" value="${value ?? ''}" data-input="t-risk" data-delay="80"${opts.ph ? raw(` placeholder="${opts.ph}"`) : ''}></div>`;

function view() {
  const q = S.q;
  const r = S.r;
  const sym = symbolInfo(q.sym)?.s || 'EURUSD';
  return html`<header class="page-head"><div class="page-titles"><h1>المخاطرة والحسابات</h1><p class="page-sub">الحجم الصحيح يحمي الحساب قبل أي تحليل. الأرقام تتحدث مع كل تعديل.</p></div></header>
  <div class="t-risk-grid">
    <section class="module t-calc" data-calc="size">
      <header class="module-head"><h2>${icon('calc')}حجم الصفقة</h2></header>
      <div class="fields">
        <div class="field wide"><label for="rs-sym">الرمز</label><select id="rs-sym" name="rs-sym" class="sel" data-change="t-risk">${symOptions(sym)}</select></div>
        ${field('rs-bal', 'رصيد الحساب بالدولار', r.balance)}
        ${field('rs-pct', 'نسبة المخاطرة من الرصيد %', r.riskPct)}
        ${field('rs-entry', 'سعر الدخول', q.entry)}
        ${field('rs-sl', 'وقف الخسارة', q.sl)}
        ${field('rs-pips', 'أو مسافة الوقف بالنقاط', '', { ph: 'بدل سعر الوقف' })}
        ${field('rs-lev', 'الرافعة المالية', r.leverage)}
        ${field('rs-conv', 'سعر تحويل عملة التسعير إلى الدولار', '', { ph: 'يملأ تلقائيا عند الحاجة' })}
      </div>
      <div class="t-out" id="out-size" aria-live="polite"></div>
      ${btn('احفظ الرصيد والنسبة افتراضيا', { act: 't-risk-save', kind: 'quiet', cls: 'btn-small' })}
    </section>
    <section class="module t-calc" data-calc="bin">
      <header class="module-head"><h2>${icon('clock')}الخيارات الثنائية</h2></header>
      <div class="fields">
        ${field('rb-pay', 'العائد عند الربح %', r.payout)}
        ${field('rb-wr', 'نسبة نجاحك الفعلية %', 55)}
        ${field('rb-stake', 'مبلغ الصفقة', 10)}
      </div>
      <div class="t-out" id="out-bin" aria-live="polite"></div>
    </section>
    <section class="module t-calc" data-calc="mg">
      <header class="module-head"><h2>${icon('alert')}المضاعفة (مارتينجال)</h2></header>
      <div class="fields">
        ${field('rm-stake', 'مبلغ الصفقة الأولى', 10)}
        ${field('rm-mult', 'المضاعف بعد كل خسارة', 2.2)}
        ${field('rm-steps', 'عدد المضاعفات', 3)}
        ${field('rm-pay', 'العائد %', r.payout)}
        ${field('rm-wr', 'نسبة النجاح %', 55)}
        ${field('rm-seq', 'عدد السلاسل في الشهر', 100)}
      </div>
      <div class="t-out" id="out-mg" aria-live="polite"></div>
    </section>
    <section class="module t-calc" data-calc="edge">
      <header class="module-head"><h2>${icon('gauge')}التوقع وكيلي</h2></header>
      <div class="fields">
        ${field('re-wr', 'نسبة النجاح %', 45)}
        ${field('re-rr', 'متوسط العائد إلى المخاطرة', 2)}
        ${field('re-n', 'خسائر متتالية تريد معرفة احتمالها', 6)}
      </div>
      <div class="t-out" id="out-edge" aria-live="polite"></div>
    </section>
    <section class="module t-calc" data-calc="dd">
      <header class="module-head"><h2>${icon('trend')}التراجع والحد اليومي</h2></header>
      <div class="fields">
        ${field('rd-dd', 'نسبة التراجع من الحساب %', 20)}
        ${field('rd-max', 'أقصى خسارة يومية %', r.maxDailyLossPct)}
      </div>
      <div class="t-out" id="out-dd" aria-live="polite"></div>
    </section>
  </div>`;
}

const val = id => { const el = S?.box.querySelector(`#${id}`); const v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN; return Number.isFinite(v) ? v : null; };
const out = (id, content) => { const el = S?.box.querySelector(`#${id}`); if (el) el.innerHTML = String(content); };
const row = (k, v, cls = '') => html`<div class="t-out-row ${cls}"><span>${k}</span><b>${v}</b></div>`;
const money = v => (v == null || !Number.isFinite(v) ? '' : `${num(Math.round(v * 100) / 100)} $`);

async function calcSize() {
  const sym = S.box.querySelector('#rs-sym')?.value;
  const info = symbolInfo(sym);
  const entry = val('rs-entry');
  let stop = val('rs-sl');
  const pips = val('rs-pips');
  if (entry != null && pips != null && info) stop = entry - pips * info.pip;
  const need = conversionNeed(info);
  const convEl = S.box.querySelector('#rs-conv');
  if (need && convEl && !convEl.value && !S.convTried) {
    S.convTried = true;
    const q = await quotes([need.symbol]).catch(() => ({}));
    const p = q[need.symbol]?.price;
    if (p && S) { convEl.value = String(need.invert ? (1 / p).toFixed(6) : p); }
  }
  const conv = val('rs-conv');
  const res = entry != null && stop != null ? positionSize({ symbol: sym, balance: val('rs-bal'), riskPct: val('rs-pct'), entry, stop, price: entry, quoteToUsd: conv, leverage: val('rs-lev') || 100 }) : null;
  if (!res) { out('out-size', html`<p class="muted small">أدخل سعر الدخول والوقف، أو الدخول ومسافة الوقف بالنقاط.</p>`); return; }
  if (res.needsRate) { out('out-size', html`<p class="small">هذا زوج تقاطعي، وقيمة نقطته تحتاج سعر ${res.needsRate.symbol}. اكتبه في الحقل الأخير.</p>`); return; }
  if (info.cls === 'crypto') {
    out('out-size', html`${row('المبلغ المعرض للخسارة', money(res.amount))}${row('الكمية', `${num(res.units)} ${info.base}`, 'big')}${row('قيمة المركز', money(res.notional))}${row('الهامش المطلوب', money(res.margin))}${row('مسافة الوقف', `${res.distPct.toFixed(2)}%`)}`);
    return;
  }
  out('out-size', html`${row('المبلغ المعرض للخسارة', money(res.amount))}${row('حجم الصفقة', `${res.lotsRounded.toFixed(2)} لوت`, 'big')}${row('مسافة الوقف', `${num(Math.round(res.pips * 10) / 10)} نقطة`)}${row('قيمة النقطة للوت', money(res.pipValue))}${row('قيمة النقطة لحجمك', money(res.perPip))}${row('الخسارة الفعلية عند الوقف', money(res.actualRisk))}${res.margin != null ? row('الهامش المطلوب', money(res.margin)) : ''}
    <p class="small muted">الحجم مقرب للأسفل إلى أقرب 0.01 لوت. ${res.lots < 0.01 ? 'الحجم المطلوب أقل من أصغر حجم عند أغلب الوسطاء (0.01)، فوسع الحساب أو قلل مسافة الوقف أو زد المخاطرة بحذر.' : ''}</p>`);
}

function calcBin() {
  const pay = val('rb-pay');
  const wr = val('rb-wr');
  const stake = val('rb-stake') || 1;
  if (pay == null || wr == null) return;
  const e = binaryExpectancy({ payout: pay, winRate: wr, stake });
  const pays = [70, 75, 80, 85, 90, 92];
  out('out-bin', html`${row('نسبة النجاح اللازمة للتعادل', `${(e.breakEven * 100).toFixed(1)}%`, 'big')}${row('ربحك المتوقع لكل صفقة', money(e.perTrade), e.perTrade >= 0 ? 'up' : 'down')}${row('على 100 صفقة', money(e.per100), e.per100 >= 0 ? 'up' : 'down')}
    <p class="small ${e.edge >= 0 ? '' : 'down'}">${e.edge >= 0 ? `تتفوق على نقطة التعادل بـ ${(e.edge * 100).toFixed(1)} نقطة مئوية، بشرط أن تكون نسبتك موثقة على 100 صفقة على الأقل.` : 'نسبتك أقل من نقطة التعادل: الاستمرار يعني خسارة مؤكدة على المدى الطويل مهما كانت الإشارات.'}</p>
    <ul class="t-mini-table small">${pays.map(p => html`<li><span>عائد ${p}%</span><b>${(breakEven(p) * 100).toFixed(1)}%</b></li>`)}</ul>`);
}

function calcMg() {
  const m = martingale({ stake: val('rm-stake') || 1, multiplier: val('rm-mult') || 2, steps: Math.min(10, Math.max(0, Math.round(val('rm-steps') ?? 3))), payout: val('rm-pay') || 85, winRate: val('rm-wr') || 55, sequences: Math.max(1, Math.round(val('rm-seq') || 100)) });
  out('out-mg', html`<div class="table-wrap"><table class="tbl t-mini"><thead><tr><th>الخطوة</th><th>المبلغ</th><th>المدفوع حتى الآن</th><th>الربح إن ربحت هنا</th></tr></thead><tbody>${m.rows.map(x => html`<tr><td>${x.k === 0 ? 'الأولى' : `مضاعفة ${x.k}`}</td><td>${money(x.stake)}</td><td>${money(x.spent)}</td><td class="${x.profitIfWin >= 0 ? 'up' : 'down'}">${money(x.profitIfWin)}</td></tr>`)}</tbody></table></div>
    ${row('أقصى خسارة في سلسلة واحدة', money(m.totalRisk), 'down')}
    ${row('احتمال خسارة السلسلة كاملة', `${(m.lossAll * 100).toFixed(2)}%`)}
    ${row('احتمال حدوثها مرة على الأقل في الشهر', `${(m.ruinAtLeastOnce * 100).toFixed(0)}%`, 'big down')}
    ${row('الربح المتوقع لكل سلسلة', money(m.evPerSeq), m.evPerSeq >= 0 ? 'up' : 'down')}
    <p class="small muted">أقل مضاعف يعوض الخسائر بهذا العائد ${m.minMultiplier.toFixed(2)}. المضاعفة لا تغير احتمال الربح، بل تحول خسائر صغيرة متكررة إلى خسارة نادرة كبيرة.</p>`);
}

function calcEdge() {
  const wr = val('re-wr');
  const rr = val('re-rr');
  const n = Math.max(2, Math.round(val('re-n') || 6));
  if (wr == null || rr == null) return;
  const w = wr / 100;
  const ex = w * rr - (1 - w);
  const k = kelly({ winRate: w, rr });
  const odds = streakOdds({ winRate: w, n, trades: 100 });
  out('out-edge', html`${row('التوقع لكل صفقة', `${ex >= 0 ? '+' : ''}${ex.toFixed(2)}R`, `big ${ex >= 0 ? 'up' : 'down'}`)}${row('نسبة النجاح اللازمة للتعادل', `${((1 / (1 + rr)) * 100).toFixed(1)}%`)}
    ${k ? row('نسبة كيلي الكاملة', k.full > 0 ? `${(k.full * 100).toFixed(1)}% من الحساب` : 'لا ميزة: لا تتداول بهذه الأرقام') : ''}
    ${k && k.full > 0 ? row('الربع العملي من كيلي', `${(k.quarter * 100).toFixed(1)}%`) : ''}
    ${row(`احتمال ${n} خسائر متتالية خلال 100 صفقة`, `${Math.round(odds * 100)}%`)}
    <p class="small muted">كيلي يفترض أن نسبتك معروفة بدقة، وهي لا تكون كذلك أبدا؛ لذلك يستخدم المحترفون ربعه أو أقل، ولا يتجاوزون 1 إلى 2% للصفقة.</p>`);
}

function calcDd() {
  const dd = val('rd-dd');
  const max = val('rd-max');
  const pct = val('rs-pct') || S.r.riskPct || 1;
  out('out-dd', html`${dd != null ? row(`تحتاج للعودة من تراجع ${dd}%`, `${recoveryNeeded(dd).toFixed(1)}% ربحا`, 'big') : ''}
    ${max != null ? row('صفقات خاسرة مسموحة في اليوم', `${lossesAllowed({ riskPct: pct, maxDailyLossPct: max })} بمخاطرة ${pct}% للصفقة`) : ''}
    <ul class="t-mini-table small">${[10, 20, 30, 50, 70].map(d => html`<li><span>تراجع ${d}%</span><b>${recoveryNeeded(d).toFixed(0)}%</b></li>`)}</ul>`);
}

function calcAll() { calcSize(); calcBin(); calcMg(); calcEdge(); calcDd(); }

onInput({
  't-risk': el => {
    if (!S) return;
    const c = el.closest('[data-calc]')?.dataset.calc;
    ({ size: calcSize, bin: calcBin, mg: calcMg, edge: calcEdge, dd: calcDd })[c]?.();
    if (c === 'size') calcDd();
  },
});
onChange({
  't-risk': () => { if (!S) return; S.convTried = false; const c = S.box.querySelector('#rs-conv'); if (c) c.value = ''; calcSize(); },
});

onAct({
  't-risk-save': () => {
    if (!S) return;
    saveTSetting('risk', { balance: val('rs-bal') ?? S.r.balance, riskPct: val('rs-pct') ?? S.r.riskPct, leverage: val('rs-lev') ?? S.r.leverage });
    toast('حفظت القيم الافتراضية');
  },
});
