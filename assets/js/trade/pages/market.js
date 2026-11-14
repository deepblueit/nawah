// السوق والتحليل: the chart, the watch list, and the full reading of every school with a plan.
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { ctx } from '../../core/ctx.js';
import { onAct, onForm, onChange } from '../../core/actions.js';
import { btn, modal, closeModal, toast } from '../../core/ui.js';
import { copyText, local, readFile, count } from '../../core/util.js';
import { tstore, tsetting, saveTSetting } from '../tstore.js';
import { loadCandles, subscribe, quotes, sourceFor, SOURCE_NAMES, saveCsv, forgetCsv, tdCredits, watchList } from '../data.js';
import { createTradeChart } from '../chart.js';
import { analyze, TREND_TEXT } from '../engine/analyze.js';
import { symbolInfo, tfInfo, higherTf } from '../engine/symbols.js';
import { marketClock, QUALITY_TEXT, fmtTime, deviceTz } from '../engine/time.js';
import { parseCandlesCsv, tfFromStep } from '../engine/csv.js';
import { P, pct, biasChip, gauge, voteBar, quietQuery, symbolPicker, wirePicker, tfSeg, kvRow } from '../tui.js';

let S = null;

const LAYERS = [
  ['levels', 'المستويات'], ['zones', 'المناطق'], ['patterns', 'النماذج'], ['zigzag', 'الموجات'], ['plan', 'الخطة'], ['markers', 'إشارات الشموع'],
  ['ema', 'المتوسطات'], ['bb', 'بولينجر'], ['ichimoku', 'إيشيموكو'], ['supertrend', 'سوبرترند'], ['vwap', 'VWAP'], ['volume', 'الحجم'],
  ['rsi', 'RSI'], ['macd', 'MACD'], ['stoch', 'ستوكاستك'],
];
const DEFAULT_LAYERS = { levels: true, zones: true, patterns: true, zigzag: false, plan: true, markers: true, ema: true, bb: false, ichimoku: false, supertrend: false, vwap: false, volume: true, rsi: true, macd: false, stoch: false };

const tz = () => local.get('nawah.trade.tz', '') || deviceTz();
const srcOf = sym => (tsetting('sources', {})[sym]) || 'auto';

export function mount(box, route) {
  const last = tsetting('market', { sym: 'XAUUSD', tf: '1h', mode: 'spot' });
  const sym = symbolInfo(route.query.sym)?.s || last.sym || 'XAUUSD';
  const tf = tfInfo(route.query.tf || last.tf).k;
  S = { box, sym, tf, mode: route.query.mode || last.mode || 'spot', layers: { ...DEFAULT_LAYERS, ...tsetting('chart', {}).layers }, candles: [], htf: null, report: null, chart: null, unsub: null, timers: [], alive: true, lastRun: 0 };
  quietQuery({ sym, tf });
  box.innerHTML = String(shell());
  start();
}

export function unmount() {
  if (!S) return;
  S.alive = false;
  S.unsub?.();
  S.timers.forEach(clearInterval);
  S.chart?.destroy();
  S = null;
}

function shell() {
  const info = symbolInfo(S.sym);
  const inWatch = !!tstore.get('watch', S.sym);
  return html`<div class="t-market">
    <header class="t-head">
      <button type="button" class="t-sym-btn" data-act="t-pick-sym" aria-label="اختر رمزا">
        <span class="t-sym-code">${S.sym}</span><span class="t-sym-name">${info?.ar || ''}</span>${icon('chevD')}
      </button>
      <div class="t-quote" id="t-quote" aria-live="polite"></div>
      ${tfSeg(S.tf)}
      <div class="t-head-tools">
        <button type="button" class="btn btn-icon btn-quiet${inWatch ? ' is-on' : ''}" data-act="t-watch-toggle" title="${inWatch ? 'أزل من قائمة المتابعة' : 'أضف إلى قائمة المتابعة'}" aria-label="قائمة المتابعة" aria-pressed="${inWatch}">${icon('star')}</button>
        <button type="button" class="btn btn-quiet btn-small t-src-btn" data-act="t-src" id="t-src" title="مصدر البيانات">${icon('cloud')}<span>المصدر</span></button>
        <button type="button" class="btn btn-icon btn-quiet" data-act="t-refresh" title="حدث البيانات والتحليل" aria-label="حدث">${icon('sync')}</button>
      </div>
    </header>
    <div class="t-watch" id="t-watch" aria-label="قائمة المتابعة"></div>
    <div class="t-grid">
      <div class="t-chart-col">
        <div class="t-chart-wrap">
          <div class="t-legend mono" id="t-legend" aria-hidden="true"></div>
          <div class="t-chart" id="t-chart" dir="ltr"></div>
          <div class="t-chart-msg" id="t-chart-msg" hidden></div>
        </div>
        <div class="t-clock small" id="t-clock"></div>
        <div class="t-layers" role="group" aria-label="طبقات الشارت">${LAYERS.map(([k, l]) => html`<button type="button" class="chip-toggle${S.layers[k] ? ' on' : ''}" data-act="t-layer" data-k="${k}" aria-pressed="${!!S.layers[k]}">${l}</button>`)}</div>
      </div>
      <aside class="t-side" id="t-side" aria-live="polite"><div class="t-card t-skel"><span></span><span></span><span></span></div></aside>
    </div>
  </div>`;
}

async function start() {
  const s = S;
  const info = symbolInfo(s.sym);
  try {
    s.chart = await createTradeChart(s.box.querySelector('#t-chart'), { digits: info?.digits ?? 5, tz: tz(), onCrosshair: legend });
  } catch (e) {
    showMsg(e.message);
    return;
  }
  if (!S || S !== s) { s.chart?.destroy(); return; }
  s.chart.setLayers(s.layers);
  await load(false);
  drawWatch();
  s.timers.push(setInterval(() => { if (S === s && !document.hidden) drawWatch(); }, 60000));
  s.timers.push(setInterval(() => { if (S === s) drawClock(); }, 30000));
}

async function load(force) {
  const s = S;
  if (!s) return;
  hideMsg();
  s.unsub?.();
  s.unsub = null;
  drawSource('loading');
  let res;
  try {
    res = await loadCandles(s.sym, s.tf, { src: srcOf(s.sym), force });
  } catch (e) {
    if (S !== s) return;
    drawSource('error');
    showMsg(e.message, true);
    s.box.querySelector('#t-side').innerHTML = String(html`<div class="t-card"><p class="muted">لا توجد بيانات لعرض التحليل.</p></div>`);
    return;
  }
  if (S !== s) return;
  s.candles = res.candles;
  s.source = res.source;
  s.note = res.note || '';
  s.chart.setData(s.candles, { fit: true });
  drawSource();
  drawQuote();
  drawClock();
  // the higher timeframe for confirmation, without blocking the first reading
  s.htf = null;
  const h = higherTf(s.tf);
  run();
  if (h) loadCandles(s.sym, h, { src: srcOf(s.sym) }).then(r => { if (S === s) { s.htf = r.candles; run(); } }).catch(() => {});
  s.unsub = subscribe(s.sym, s.tf, (c, closed, all) => {
    if (S !== s) return;
    if (all) { s.candles = all; s.chart.setData(all); } else {
      const last = s.candles[s.candles.length - 1];
      if (last && c.t === last.t) s.candles[s.candles.length - 1] = c; else if (!last || c.t > last.t) s.candles.push(c);
      s.chart.update(c);
    }
    drawQuote();
    // re-read on every closed candle, and every 20 seconds while one forms
    if (closed || Date.now() - s.lastRun > 20000) run();
  }, { src: srcOf(s.sym) });
}

function run() {
  const s = S;
  if (!s || s.candles.length < 2) return;
  s.lastRun = Date.now();
  setTimeout(() => {
    if (S !== s) return;
    const r = analyze(s.candles, { symbol: s.sym, tf: s.tf, htf: s.htf, payout: (tsetting('risk', {}).payout || 85) / 100 });
    s.report = r;
    if (r.ok) s.chart.setOverlays(r.overlays); else s.chart.setOverlays(null);
    drawSide();
  }, 20);
}

// ---------- drawing
function legend(bar) {
  const el = S?.box.querySelector('#t-legend');
  if (!el) return;
  const info = symbolInfo(S.sym);
  if (!bar) { el.textContent = ''; return; }
  const ch = bar.o ? ((bar.c - bar.o) / bar.o) * 100 : 0;
  el.innerHTML = String(html`<span>O ${P(bar.o, info)}</span><span>H ${P(bar.h, info)}</span><span>L ${P(bar.l, info)}</span><span>C ${P(bar.c, info)}</span><span class="${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</span>`);
}

function drawQuote() {
  const el = S?.box.querySelector('#t-quote');
  if (!el || !S.candles.length) return;
  const cs = S.candles;
  const last = cs[cs.length - 1];
  const back = cs[Math.max(0, cs.length - 1 - Math.round(86400 / tfInfo(S.tf).sec))];
  const ch = ((last.c - back.c) / back.c) * 100;
  el.innerHTML = String(html`<b class="mono">${P(last.c, S.sym)}</b><span class="mono ${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</span><small class="muted">24 ساعة</small>`);
  document.title = `${S.sym} ${P(last.c, S.sym)} | نواة`;
}

function drawSource(state) {
  const el = S?.box.querySelector('#t-src');
  if (!el) return;
  const name = SOURCE_NAMES[S.source || sourceFor(S.sym, srcOf(S.sym))] || '';
  el.classList.toggle('is-demo', S.source === 'demo');
  el.innerHTML = String(html`${icon(state === 'loading' ? 'sync' : state === 'error' ? 'alert' : S.source === 'demo' ? 'eye' : 'cloud')}<span>${state === 'loading' ? 'جار التحميل' : name}</span>`);
  el.title = S.note || name;
}

function drawClock() {
  const el = S?.box.querySelector('#t-clock');
  if (!el) return;
  const info = symbolInfo(S.sym);
  const c = marketClock(Math.floor(Date.now() / 1000), info?.cls);
  const act = c.active.map(x => x.name).join(' و');
  const kz = c.killzone ? `، وقت ${c.killzone.name}` : '';
  el.innerHTML = String(html`${icon('clock')}<span>${info?.cls === 'crypto' ? 'السوق يعمل على مدار الساعة.' : c.fxClosed ? QUALITY_TEXT.closed : `الجلسات المفتوحة: ${act || 'لا جلسة رئيسية'}${kz}. ${QUALITY_TEXT[c.quality]}`}</span>${S.note ? html`<span class="t-note">${S.note}</span>` : ''}`);
}

async function drawWatch() {
  const el = S?.box.querySelector('#t-watch');
  if (!el) return;
  const list = watchList();
  const q = await quotes(list.map(w => w.s)).catch(() => ({}));
  if (!S || !S.box.isConnected) return;
  el.innerHTML = String(html`${list.map(w => {
    const x = q[w.s];
    return html`<button type="button" class="t-wchip${w.s === S.sym ? ' on' : ''}" data-act="t-set-sym" data-sym="${w.s}"><b>${w.s}</b>${x ? html`<span class="mono">${P(x.price, w.s)}</span><span class="mono ${x.change >= 0 ? 'up' : 'down'}">${pct(x.change, 2)}</span>` : html`<span class="muted small">بلا سعر بعد</span>`}</button>`;
  })}<button type="button" class="t-wchip t-wadd" data-act="t-pick-sym" aria-label="أضف رمزا">${icon('plus')}</button>`);
}

function showMsg(text, actions = false) {
  const el = S?.box.querySelector('#t-chart-msg');
  if (!el) return;
  el.hidden = false;
  const needsKey = /مفتاح/.test(text);
  el.innerHTML = String(html`<div class="t-msg-in">${icon('alert')}<p>${text}</p>${actions ? html`<div class="row-btns">${needsKey ? btn('أضف مفتاح Twelve Data', { href: '#/tsettings', kind: 'primary', cls: 'btn-small' }) : ''}${btn('استخدم بيانات تجريبية', { act: 't-use-demo', kind: 'quiet', cls: 'btn-small' })}${btn('أعد المحاولة', { act: 't-refresh', kind: 'quiet', cls: 'btn-small' })}</div>` : ''}</div>`);
}
function hideMsg() { const el = S?.box.querySelector('#t-chart-msg'); if (el) el.hidden = true; }

// each school of the reading and its chapter in the library
const KB_OF = { dow: 'dow', ma: 'ma', follow: 'osc', smc: 'smc', levels: 'sr', candles: 'candles', classic: 'classic', harmonic: 'harmonic', elliott: 'elliott', wyckoff: 'wyckoff', fib: 'fib', momentum: 'osc', divergence: 'divergence', ichimoku: 'ichimoku', volume: 'volume', mtf: 'mtf' };
const TOUCH = ['لمسة واحدة', 'لمستان', 'لمسات', 'لمسة'];
const SCHOOLS_N = ['مدرسة واحدة', 'مدرستان', 'مدارس', 'مدرسة'];
const STATUS_TONE = v => (v > 0.15 ? 'up' : v < -0.15 ? 'down' : 'flat');

function drawSide() {
  const el = S?.box.querySelector('#t-side');
  if (!el) return;
  const r = S.report;
  if (!r?.ok) { el.innerHTML = String(html`<div class="t-card"><p class="muted">${r?.reason || 'لا قراءة بعد.'}</p></div>`); return; }
  const info = r.info;
  const F = p => P(p, info);
  const reading = r.schools.filter(x => x.has);
  const silent = r.schools.filter(x => !x.has);
  el.innerHTML = String(html`
    <section class="t-card t-verdict t-${r.bias === 'buy' ? 'up' : r.bias === 'sell' ? 'down' : 'flat'}">
      <div class="t-verdict-top">
        ${gauge(r.score)}
        <div class="t-verdict-txt">
          ${biasChip(r.bias)}
          <p class="t-score"><b>${Math.abs(r.score)}</b><span>من 100 توافق</span></p>
          <p class="small muted">${r.confidenceText}${r.bias !== 'neutral' ? `، ${count(r.forSide, SCHOOLS_N)} معه و${count(r.againstSide, SCHOOLS_N, { zero: 'لا مدرسة' })} ضده` : ''}</p>
        </div>
      </div>
      <div class="t-verdict-meta small">
        <span>${r.frame}</span>
        <span>الاتجاه ${r.trendText}</span>
        ${r.mtf ? html`<span>الإطار الأعلى ${TREND_TEXT[r.mtf.bias]}</span>` : ''}
        <span>${{ trend: 'سوق اتجاهي', range: 'سوق عرضي', normal: 'سوق متوسط الاتجاه' }[r.regime]}</span>
      </div>
      <div class="seg t-mode" role="group" aria-label="نوع التداول">
        <button type="button" class="${S.mode === 'spot' ? 'on' : ''}" data-act="t-mode" data-mode="spot" aria-pressed="${S.mode === 'spot'}">فوركس وعقود</button>
        <button type="button" class="${S.mode === 'binary' ? 'on' : ''}" data-act="t-mode" data-mode="binary" aria-pressed="${S.mode === 'binary'}">خيارات ثنائية</button>
      </div>
    </section>
    ${S.mode === 'binary' ? binaryCard(r) : planCard(r, F)}
    ${r.warnings.length ? html`<section class="t-card t-warns"><h3>${icon('alert')}تنبيهات</h3><ul>${r.warnings.map(w => html`<li>${w}</li>`)}</ul></section>` : ''}
    <section class="t-card">
      <h3>${icon('layers')}قراءة المدارس</h3>
      <ul class="t-schools">${reading.map(sc => html`<li>
        <details>
          <summary><span class="t-sc-name">${sc.name}</span>${voteBar(sc.vote)}<span class="t-sc-line t-${STATUS_TONE(sc.vote)}">${sc.line}</span></summary>
          ${sc.details?.length ? html`<ul class="t-sc-details">${sc.details.map(d => html`<li>${d}</li>`)}</ul>` : html`<p class="small muted">لا تفاصيل إضافية.</p>`}
          ${btn('اشرح هذه المدرسة', { href: `#/library?s=${KB_OF[sc.key] || ''}`, kind: 'quiet', cls: 'btn-small' })}
        </details>
      </li>`)}</ul>
      ${silent.length ? html`<details class="t-silent"><summary class="small muted">مدارس بلا قراءة الآن (${silent.length})</summary><ul class="small">${silent.map(sc => html`<li><b>${sc.name}:</b> ${sc.line}</li>`)}</ul></details>` : ''}
    </section>
    <section class="t-card">
      <h3>${icon('target')}المستويات</h3>
      <div class="t-levels">
        <div><h4 class="down">المقاومات</h4><ul>${r.levels.resistance.slice(0, 4).map(x => html`<li><span class="mono">${F(x.price)}</span><small>${count(x.touches, TOUCH)}</small></li>`)}${r.levels.resistance.length ? '' : html`<li class="muted">لا مقاومة قريبة</li>`}</ul></div>
        <div><h4 class="up">الدعوم</h4><ul>${r.levels.support.slice(0, 4).map(x => html`<li><span class="mono">${F(x.price)}</span><small>${count(x.touches, TOUCH)}</small></li>`)}${r.levels.support.length ? '' : html`<li class="muted">لا دعم قريب</li>`}</ul></div>
      </div>
      <dl class="kvs t-kvs">
        ${r.levels.pivots ? kvRow('الارتكاز اليومي', html`<span class="mono">${F(r.levels.pivots.p)}</span>`) : ''}
        ${r.levels.prevDay ? kvRow('قمة وقاع أمس', html`<span class="mono">${F(r.levels.prevDay.h)} / ${F(r.levels.prevDay.l)}</span>`) : ''}
        ${r.zones.dr ? kvRow('موقع السعر', `${r.zones.dr.zone === 'premium' ? 'منطقة العلاوة' : 'منطقة الخصم'} (${Math.round(r.zones.dr.position * 100)}% من النطاق)`) : ''}
        ${kvRow('متوسط المدى الحقيقي', html`<span class="mono">${F(r.volatility.atr)}</span> <small class="muted">(${r.volatility.atrPct.toFixed(2)}% من السعر)</small>`)}
      </dl>
      <p class="small muted">${r.volatility.text}.</p>
    </section>
    <section class="t-card t-story">
      <h3>${icon('file')}القراءة مكتوبة</h3>
      ${r.narrative.map(n => html`<p><b>${n.title}:</b> ${n.text}</p>`)}
      <div class="row-btns">
        ${btn('انسخ التحليل', { act: 't-copy', icon: 'copy', kind: 'quiet', cls: 'btn-small' })}
        ${btn('احفظه في الملاحظات', { act: 't-save-note', icon: 'download', kind: 'quiet', cls: 'btn-small' })}
        ${btn('اسأل إكس نواة', { href: `#/xnawah?q=${encodeURIComponent(`حلل ${r.symbol} على ${r.tf}`)}`, icon: 'orbit', kind: 'quiet', cls: 'btn-small' })}
      </div>
    </section>
    <p class="t-disclaimer small muted">قراءة فنية آلية لتوافق المدارس على البيانات المعروضة، وليست نصيحة استثمارية ولا احتمال ربح. القرار وإدارة المخاطرة عليك.</p>`);
}

function planCard(r, F) {
  const p = r.plan;
  if (!p.side) {
    return html`<section class="t-card t-plan"><h3>${icon('crosshair')}لا صفقة الآن</h3><p>${p.summary}</p>
      ${p.scenarios?.up || p.scenarios?.down ? html`<dl class="kvs t-kvs">
        ${p.scenarios.up ? kvRow('شراء فوق', html`<span class="mono up">${F(p.scenarios.up.trigger)}</span> <small>الهدف ${F(p.scenarios.up.target)}</small>`) : ''}
        ${p.scenarios.down ? kvRow('بيع تحت', html`<span class="mono down">${F(p.scenarios.down.trigger)}</span> <small>الهدف ${F(p.scenarios.down.target)}</small>`) : ''}
      </dl>` : ''}</section>`;
  }
  const dirCls = p.side === 'buy' ? 'up' : 'down';
  return html`<section class="t-card t-plan t-${dirCls}">
    <h3>${icon('crosshair')}خطة ${p.side === 'buy' ? 'الشراء' : 'البيع'}</h3>
    <div class="t-plan-grid">
      <div class="t-pl-row"><span>الدخول</span><b class="mono">${F(p.entry.price)}</b><small>${p.entry.type === 'market' ? 'من السعر الحالي' : 'أمر معلق'}${p.entry.zone ? `، ${p.entry.zone.label}` : ''}</small></div>
      <div class="t-pl-row t-pl-stop"><span>وقف الخسارة</span><b class="mono">${F(p.stop)}</b><small>${p.riskText}</small></div>
      ${p.targets.map((t, k) => html`<div class="t-pl-row t-pl-tp"><span>الهدف ${k + 1}</span><b class="mono">${F(t.price)}</b><small>العائد ${t.rr.toFixed(1)} من المخاطرة، ${t.label}</small></div>`)}
    </div>
    ${p.breakout ? html`<p class="small">بديل الاختراق: ${p.side === 'buy' ? 'شراء' : 'بيع'} عند <b class="mono">${F(p.breakout.price)}</b> إذا ${p.breakout.fem ? 'اكتملت' : 'اكتمل'} ${p.breakout.pattern}.</p>` : ''}
    ${p.warnings.length ? html`<ul class="t-mini-warn small">${p.warnings.map(w => html`<li>${w}</li>`)}</ul>` : ''}
    <p class="small muted">تلغى الفكرة إذا أغلقت شمعة على ${r.frame} ${p.side === 'buy' ? 'تحت' : 'فوق'} ${F(p.invalid)}.</p>
    <div class="row-btns">
      ${btn('احسب حجم الصفقة', { href: `#/risk?sym=${r.symbol}&entry=${p.entry.price}&sl=${p.stop}`, icon: 'calc', kind: 'primary', cls: 'btn-small' })}
      ${btn('سجلها في اليوميات', { act: 't-to-journal', icon: 'journal', kind: 'quiet', cls: 'btn-small' })}
    </div>
  </section>`;
}

function binaryCard(r) {
  const b = r.binary;
  const t0 = b.entryAt;
  const tfs = tfInfo(r.tf).sec;
  const tzName = tz();
  const cls = b.direction === 'call' ? 'up' : b.direction === 'put' ? 'down' : 'flat';
  return html`<section class="t-card t-binary t-${cls}">
    <h3>${icon('clock')}الخيارات الثنائية</h3>
    <div class="t-bin-dir"><b>${b.label}</b><span class="small muted">قوة الإشارة القصيرة ${Math.abs(b.score)} من 100</span></div>
    ${b.direction ? html`<dl class="kvs t-kvs">
      ${kvRow('الدخول', html`مع افتتاح الشمعة التالية <b class="mono">${fmtTime(t0, tzName)}</b>`)}
      ${kvRow('الانتهاء المقترح', html`${b.expiryCandles.map(n => html`<span class="t-exp">${n} شموع حتى <b class="mono">${fmtTime(t0 + n * tfs, tzName)}</b></span>`)}`)}
    </dl>` : ''}
    ${b.reasons.length ? html`<ul class="small t-reasons">${b.reasons.map(x => html`<li>${x}</li>`)}</ul>` : ''}
    ${b.noTrade.length ? html`<div class="t-notrade"><h4>${icon('alert')}لا تدخل إذا</h4><ul class="small">${b.noTrade.map(x => html`<li>${x}</li>`)}</ul></div>` : ''}
    <p class="small muted">${b.note} اجعل الانتهاء مع إغلاق شمعة، وتجنب الدقائق المحيطة بالأخبار القوية.</p>
  </section>`;
}

// ---------- the text copy of a reading, plain and complete
export function reportText(r) {
  const F = p => P(p, r.info);
  const lines = [`${r.symbol} على ${r.frame}: ${r.biasText}، درجة التوافق ${Math.abs(r.score)} من 100، ${r.confidenceText}.`];
  for (const n of r.narrative) lines.push(`${n.title}: ${n.text}`);
  lines.push('', 'قراءة المدارس:');
  for (const s of r.schools.filter(x => x.has)) lines.push(`${s.name}: ${s.line} (${s.vote > 0 ? '+' : ''}${s.vote.toFixed(2)})`);
  if (r.levels.resistance.length) lines.push('', `المقاومات: ${r.levels.resistance.slice(0, 3).map(x => F(x.price)).join('، ')}`);
  if (r.levels.support.length) lines.push(`الدعوم: ${r.levels.support.slice(0, 3).map(x => F(x.price)).join('، ')}`);
  if (r.warnings.length) lines.push('', 'تنبيهات:', ...r.warnings);
  return lines.join('\n');
}

// ---------- actions
function setSym(sym, tf) {
  if (!S) return;
  const info = symbolInfo(sym);
  if (!info) return;
  closeModal();
  const keep = { box: S.box };
  const newTf = tf || S.tf;
  unmount();
  saveTSetting('market', { ...tsetting('market', {}), sym: info.s, tf: newTf });
  mount(keep.box, { query: { sym: info.s, tf: newTf } });
}

onAct({
  't-pick-sym': () => {
    if (!S) return;
    modal({ title: 'اختر رمزا', body: symbolPicker(S.sym), actions: btn('إغلاق', { act: 'close-modal', kind: 'quiet' }) });
    wirePicker(document.getElementById('modal'));
  },
  't-set-sym': el => setSym(el.dataset.sym, el.dataset.tf || null),
  't-set-tf': el => {
    if (!S || el.dataset.tf === S.tf) return;
    setSym(S.sym, el.dataset.tf);
  },
  't-refresh': () => load(true),
  't-use-demo': () => { if (!S) return; saveTSetting('sources', { ...tsetting('sources', {}), [S.sym]: 'demo' }); load(true); },
  't-layer': el => {
    if (!S) return;
    const k = el.dataset.k;
    S.layers[k] = !S.layers[k];
    el.classList.toggle('on', S.layers[k]);
    el.setAttribute('aria-pressed', String(S.layers[k]));
    saveTSetting('chart', { layers: S.layers });
    S.chart?.setLayers(S.layers);
    if (k === 'volume') S.chart?.setData(S.candles);
  },
  't-mode': el => {
    if (!S) return;
    S.mode = el.dataset.mode;
    saveTSetting('market', { ...tsetting('market', {}), mode: S.mode });
    drawSide();
  },
  't-watch-toggle': el => {
    if (!S) return;
    const on = !!tstore.get('watch', S.sym);
    if (on) tstore.remove('watch', S.sym);
    else tstore.put('watch', { id: S.sym, s: S.sym, tf: S.tf, order: watchList().length });
    el.classList.toggle('is-on', !on);
    el.setAttribute('aria-pressed', String(!on));
    toast(on ? 'أزيل من قائمة المتابعة' : 'أضيف إلى قائمة المتابعة');
    drawWatch();
  },
  't-copy': async () => { if (!S?.report?.ok) return; toast((await copyText(reportText(S.report))) ? 'نسخ التحليل' : 'تعذر النسخ'); },
  't-save-note': () => {
    const r = S?.report;
    if (!r?.ok) return;
    tstore.put('notes', { symbol: r.symbol, tf: r.tf, bias: r.bias, score: r.score, price: r.price, at: Date.now(), text: reportText(r), plan: r.plan.side ? { side: r.plan.side, entry: r.plan.entry.price, stop: r.plan.stop, targets: r.plan.targets.map(t => t.price) } : null });
    toast('حفظ التحليل في الملاحظات، وتجده في اليوميات');
  },
  't-to-journal': () => {
    const r = S?.report;
    if (!r?.ok || !r.plan.side) return;
    const q = new URLSearchParams({ add: '1', sym: r.symbol, side: r.plan.side, entry: r.plan.entry.price, sl: r.plan.stop, tp: r.plan.targets[0]?.price ?? '', setup: 'تحليل إكس نواة' });
    ctx.go(`#/journal?${q}`);
  },
  't-src': () => openSource(),
  't-set-src': el => {
    if (!S) return;
    saveTSetting('sources', { ...tsetting('sources', {}), [S.sym]: el.dataset.src });
    if (el.dataset.src !== 'csv') forgetCsv(S.sym);
    closeModal();
    load(true);
  },
});

function openSource() {
  if (!S) return;
  const cur = srcOf(S.sym);
  const info = symbolInfo(S.sym);
  const c = tdCredits();
  const opts = [['auto', 'تلقائي', 'Binance للعملات الرقمية، وTwelve Data لغيرها إذا وجد المفتاح، وإلا بيانات تجريبية'], ['binance', 'Binance', 'للعملات الرقمية فقط، مجاني وبلا مفتاح، ويتحدث لحظيا'], ['twelvedata', 'Twelve Data', 'للعملات والذهب والفضة وغيرها، بمفتاح مجاني: 8 طلبات في الدقيقة و800 في اليوم'], ['demo', 'بيانات تجريبية', 'أسعار مولدة للتجربة والتدريب، وليست أسعار السوق']];
  modal({
    title: `مصدر بيانات ${S.sym}`,
    body: html`<div class="stack">
      <ul class="t-src-list">${opts.filter(([k]) => k !== 'binance' || info?.cls === 'crypto').map(([k, l, d]) => html`<li><button type="button" class="${cur === k ? 'on' : ''}" data-act="t-set-src" data-src="${k}"><b>${l}</b><small>${d}</small></button></li>`)}</ul>
      <p class="small muted">استهلاك Twelve Data اليوم على هذا الجهاز: ${c.n} من 800.</p>
      <form data-form="t-csv" class="t-csv stack">
        <h3>استورد شموعا من ملف</h3>
        <p class="small muted">من MetaTrader 4 أو 5 (History Center أو Export Bars) أو TradingView أو أي ملف CSV فيه التاريخ والافتتاح والأعلى والأدنى والإغلاق.</p>
        <input type="file" name="file" accept=".csv,.txt,text/csv" required>
        <div class="fields">
          <div class="field"><label for="t-csv-off">فرق توقيت خادم الوسيط عن UTC بالساعات</label><input id="t-csv-off" name="off" type="number" step="1" min="-12" max="14" value="0"></div>
        </div>
        <p class="small muted">أغلب خوادم MetaTrader على +2 شتاء و+3 صيفا. ملفات TradingView بتوقيت UTC، فاتركه صفرا.</p>
        ${btn('استورد واعرض', { type: 'submit', kind: 'primary', icon: 'upload' })}
      </form>
    </div>`,
    actions: btn('إغلاق', { act: 'close-modal', kind: 'quiet' }),
  });
}

onForm({
  't-csv': async f => {
    if (!S) return;
    const file = f.file.files?.[0];
    if (!file) return;
    const res = parseCandlesCsv(await readFile(file), { offsetHours: Number(f.off.value) || 0 });
    if (res.error) { toast(res.error); return; }
    const tf = tfFromStep(res.step);
    if (!tf) { toast('لم أتعرف على الإطار الزمني للملف من المسافة بين الشموع.'); return; }
    await saveCsv(S.sym, tf, res.candles, file.name);
    saveTSetting('sources', { ...tsetting('sources', {}), [S.sym]: 'csv' });
    closeModal();
    toast(`استورد ${res.candles.length} شمعة على ${tfInfo(tf).frame}`);
    setSym(S.sym, tf);
  },
});

