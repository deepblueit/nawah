// The analysis: every school reads the same candles on its own terms, gives a vote between
// -1 (sell) and +1 (buy) with a weight that depends on the market regime, and explains itself.
// The total is a degree of agreement between schools, not a probability of profit.
import * as I from './indicators.js';
import { pivots, zigzag, structure, breaks } from './swings.js';
import { supportResistance, roundNumbers, fairValueGaps, orderBlocks, liquidity, supplyDemand, dealingRange, fibonacci } from './levels.js';
import { candlePatterns, recentCandles } from './candles.js';
import { chartPatterns } from './patterns.js';
import { harmonics } from './harmonics.js';
import { elliott } from './elliott.js';
import { wyckoff } from './wyckoff.js';
import { divergences, DIV_NAMES } from './divergence.js';
import { marketClock, QUALITY_TEXT } from './time.js';
import { symbolInfo, tfInfo, higherTf, fmtPrice } from './symbols.js';
import { buildPlan, binaryView } from './plan.js';
import { count } from '../../core/util.js';

const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const TIMES = ['مرة واحدة', 'مرتين', 'مرات', 'مرة'];
const SCHOOLS_N = ['مدرسة واحدة', 'مدرستان', 'مدارس', 'مدرسة'];
const BARS = ['شمعة واحدة', 'شمعتين', 'شموع', 'شمعة'];

export const SCHOOL_NAMES = {
  dow: 'الاتجاه وهيكل السوق', ma: 'المتوسطات المتحركة', follow: 'مؤشرات تتبع الاتجاه', smc: 'المفاهيم الذكية',
  levels: 'الدعم والمقاومة', candles: 'الشموع اليابانية', classic: 'النماذج الكلاسيكية', harmonic: 'النماذج التوافقية',
  elliott: 'موجات إليوت', wyckoff: 'وايكوف', fib: 'فيبوناتشي', momentum: 'الزخم والمذبذبات', divergence: 'التباعدات',
  ichimoku: 'إيشيموكو', volume: 'الحجم', mtf: 'الإطار الأعلى',
};

// Weights per regime: trend-following schools lead in trends, levels and oscillators in ranges.
const WEIGHTS = {
  trend: { dow: 1.4, ma: 1.2, follow: 1.1, smc: 1.3, levels: 0.9, candles: 0.7, classic: 1, harmonic: 0.6, elliott: 0.5, wyckoff: 0.5, fib: 0.7, momentum: 0.9, divergence: 0.6, ichimoku: 1, volume: 0.6, mtf: 1.5 },
  range: { dow: 0.8, ma: 0.6, follow: 0.5, smc: 1.1, levels: 1.4, candles: 1, classic: 1, harmonic: 0.9, elliott: 0.4, wyckoff: 1, fib: 0.6, momentum: 1.1, divergence: 0.9, ichimoku: 0.6, volume: 0.6, mtf: 1.2 },
  normal: { dow: 1.2, ma: 1, follow: 0.9, smc: 1.2, levels: 1.1, candles: 0.8, classic: 1, harmonic: 0.7, elliott: 0.5, wyckoff: 0.7, fib: 0.7, momentum: 1, divergence: 0.7, ichimoku: 0.9, volume: 0.6, mtf: 1.4 },
};

// pattern status in the right gender: القمة المزدوجة مؤكدة، القاع المزدوج مؤكد
export const statusWord = p => (p.status === 'forming' ? 'قيد التكوين' : p.status === 'confirmed' ? (p.fem ? 'مؤكدة' : 'مؤكد') : p.fem ? 'فاشلة' : 'فاشل');

export const BIAS_TEXT = { buy: 'شراء', sell: 'بيع', neutral: 'محايد' };
export const TREND_TEXT = { up: 'صاعد', 'up-weak': 'صاعد ضعيف', down: 'هابط', 'down-weak': 'هابط ضعيف', range: 'عرضي', none: 'غير واضح' };

// A short reading of a higher timeframe, for multi-timeframe confirmation.
export function quickTrend(cs) {
  if (!cs || cs.length < 60) return null;
  const C = I.closes(cs);
  const a = I.atr(cs, 14);
  const lastI = cs.length - 1;
  const e50 = I.ema(C, 50);
  const e200 = I.ema(C, Math.min(200, Math.max(60, cs.length - 10)));
  const zz = zigzag(cs, { mult: 2.2, atrValues: a });
  const st = structure(zz, (a[lastI] || 0) * 0.15);
  const sp = I.supertrend(cs);
  const votes = [];
  votes.push({ up: 1, 'up-weak': 0.5, down: -1, 'down-weak': -0.5 }[st.trend] || 0);
  if (e50[lastI] != null) votes.push(sgn(C[lastI] - e50[lastI]));
  if (e50[lastI] != null && e200[lastI] != null) votes.push(sgn(e50[lastI] - e200[lastI]));
  if (sp.dir[lastI] != null) votes.push(sp.dir[lastI]);
  const score = votes.reduce((s, v) => s + v, 0) / (votes.length || 1);
  return { score, bias: score >= 0.35 ? 'up' : score <= -0.35 ? 'down' : 'range', structure: st.trend };
}

function guessInfo(price) {
  const digits = price >= 1000 ? 2 : price >= 50 ? 3 : price >= 1 ? 5 : 6;
  return { s: '', cls: 'other', digits, pip: 10 ** -(digits - 1), ar: '' };
}

export function analyze(candles, { symbol = '', tf = '1h', htf = null, now = Math.floor(Date.now() / 1000), payout = 0.85 } = {}) {
  const cs = candles.length > 1500 ? candles.slice(-1500) : candles;
  if (!cs || cs.length < 120) return { ok: false, reason: `تحتاج القراءة 120 شمعة على الأقل، والمتاح ${cs?.length || 0}.` };
  const info = symbolInfo(symbol) || guessInfo(cs[cs.length - 1].c);
  const tfi = tfInfo(tf);
  const n = cs.length;
  const lastI = n - 1;
  const last = cs[lastI];
  const price = last.c;
  const forming = now && last.t + tfi.sec > now;
  const closedI = forming ? lastI - 1 : lastI;
  const P = p => fmtPrice(p, info);

  // ---------- base series
  const C = I.closes(cs);
  const atr = I.atr(cs, 14);
  const a = atr[lastI] || atr[lastI - 1];
  if (!a) return { ok: false, reason: 'تعذر حساب متوسط المدى الحقيقي لهذه البيانات.' };
  const ema20 = I.ema(C, 20);
  const ema50 = I.ema(C, 50);
  const ema200 = I.ema(C, Math.min(200, n - 20));
  const rsi = I.rsi(C, 14);
  const macd = I.macd(C);
  const stoch = I.stochastic(cs);
  const adx = I.adx(cs);
  const cci = I.cci(cs);
  const bb = I.bollinger(C);
  const kc = I.keltner(cs);
  const ich = I.ichimoku(cs);
  const st = I.supertrend(cs);
  const sar = I.psar(cs);
  const volBars = cs.slice(-120).filter(c => c.v > 0).length;
  const hasVol = volBars >= 100;
  const fxDay = info.cls === 'fx' || info.cls === 'metal';

  // ---------- swings and structure
  const zzMinor = zigzag(cs, { mult: 1.3, atrValues: atr });
  const zzMain = zigzag(cs, { mult: 2.2, atrValues: atr });
  const zzMajor = zigzag(cs, { mult: 4, atrValues: atr });
  const struct = structure(zzMain, a * 0.15);
  const swingPiv = pivots(cs, 5, 5);
  const brk = breaks(cs, swingPiv);
  const internal = breaks(cs, pivots(cs, 2, 2));

  // ---------- regime
  const adxNow = adx.adx[lastI];
  const bbwPct = I.percentile(bb.width, 200);
  const atrPct = I.percentile(atr, 200);
  const squeeze = bb.upper[lastI] != null && kc.upper[lastI] != null && bb.upper[lastI] < kc.upper[lastI] && bb.lower[lastI] > kc.lower[lastI];
  let regime = 'normal';
  if (adxNow >= 25) regime = 'trend';
  else if (adxNow < 18 || (bbwPct != null && bbwPct < 0.2)) regime = 'range';
  const W = WEIGHTS[regime];

  // ---------- levels and zones
  const sr = supportResistance(cs, atr);
  const support = sr.filter(x => x.role === 'support').sort((x, y) => y.price - x.price);
  const resistance = sr.filter(x => x.role === 'resistance').sort((x, y) => x.price - y.price);
  const s1 = support[0] || null;
  const r1 = resistance[0] || null;
  const fvg = fairValueGaps(cs, atr).filter(g => g.active).slice(-8);
  const obs = orderBlocks(cs, atr, brk.events).filter(o => !o.broken).slice(-6);
  const liq = liquidity(cs, atr);
  const sd = supplyDemand(cs, atr);
  const prevDay = I.previousPeriod(cs, 'day', { ny: fxDay });
  const prevWeek = I.previousPeriod(cs, 'week', { ny: fxDay });
  const piv = prevDay ? I.pivotPoints(prevDay, 'classic') : null;
  const rounds = roundNumbers(price, a, 2);
  const lastH = [...zzMain].reverse().find(p => p.type === 'H' && !p.open) || null;
  const lastL = [...zzMain].reverse().find(p => p.type === 'L' && !p.open) || null;
  const trendUp = struct.trend.startsWith('up') || (struct.trend === 'range' && brk.trend === 'up');
  const dr = lastH && lastL ? dealingRange(lastH, lastL, price, trendUp) : null;

  const schools = [];
  const add = (key, s) => schools.push({ key, name: SCHOOL_NAMES[key], weight: W[key] ?? 1, has: true, vote: 0, details: [], ...s, vote: clamp(s.vote ?? 0) });

  // ---------- 1. Dow: swing structure
  {
    const tv = { up: 1, 'up-weak': 0.5, down: -1, 'down-weak': -0.5, range: 0 }[struct.trend] ?? 0;
    const lbl = struct.points.filter(p => !p.open).slice(-4).map(p => p.label);
    const text = { up: 'قمم أعلى وقيعان أعلى: الاتجاه صاعد', 'up-weak': 'قيعان أعلى دون قمة أعلى بعد: صعود يحتاج تأكيدا', down: 'قمم أدنى وقيعان أدنى: الاتجاه هابط', 'down-weak': 'قمم أدنى دون قاع أدنى بعد: هبوط يحتاج تأكيدا', range: 'لا تتابع واضح للقمم والقيعان: حركة عرضية' }[struct.trend];
    add('dow', { vote: tv, line: text, details: lbl.length ? [`آخر النقاط: ${lbl.join('، ')}`] : [] });
  }

  // ---------- 2. moving averages
  {
    const e20 = ema20[lastI];
    const e50 = ema50[lastI];
    const e200 = ema200[lastI];
    const slope50 = ema50[lastI - 10] != null ? (e50 - ema50[lastI - 10]) / a : 0;
    let v = 0;
    const d = [];
    if (e200 != null) { v += 0.3 * sgn(price - e200); d.push(price > e200 ? 'السعر فوق المتوسط 200' : 'السعر تحت المتوسط 200'); }
    if (e50 != null && e200 != null) { v += 0.3 * sgn(e50 - e200); d.push(e50 > e200 ? 'المتوسط 50 فوق 200' : 'المتوسط 50 تحت 200'); }
    if (e20 != null && e50 != null) { v += 0.2 * sgn(e20 - e50); d.push(e20 > e50 ? 'المتوسط 20 فوق 50' : 'المتوسط 20 تحت 50'); }
    v += 0.2 * clamp(slope50 / 0.8);
    // a recent golden or death cross
    for (let i = lastI; i > lastI - 30 && i > 1; i--) {
      if (ema50[i - 1] == null || ema200[i - 1] == null) break;
      const before = ema50[i - 1] - ema200[i - 1];
      const after = ema50[i] - ema200[i];
      if (before <= 0 && after > 0) { d.push(`تقاطع ذهبي قبل ${count(lastI - i, BARS, { zero: 'أقل من شمعة' })}`); break; }
      if (before >= 0 && after < 0) { d.push(`تقاطع الموت قبل ${count(lastI - i, BARS, { zero: 'أقل من شمعة' })}`); break; }
    }
    const stretch = e20 != null ? (price - e20) / a : 0;
    if (Math.abs(stretch) > 3) d.push(`السعر ابتعد ${Math.abs(stretch).toFixed(1)} من متوسط المدى عن المتوسط 20، والارتداد إليه وارد`);
    const line = v > 0.35 ? 'المتوسطات مرتبة صعودا' : v < -0.35 ? 'المتوسطات مرتبة هبوطا' : 'المتوسطات متداخلة بلا ترتيب واضح';
    add('ma', { vote: v, line, details: d, stretch });
  }

  // ---------- 3. trend followers: SuperTrend, Parabolic SAR, ADX
  {
    const sd_ = st.dir[lastI] || 0;
    const ps = sar[lastI] != null ? sgn(price - sar[lastI]) : 0;
    const di = sgn((adx.plus[lastI] || 0) - (adx.minus[lastI] || 0));
    let v = 0.4 * sd_ + 0.3 * ps + 0.3 * di;
    const strength = adxNow == null ? 'غير محسوبة' : adxNow >= 40 ? 'قوية جدا' : adxNow >= 25 ? 'قوية' : adxNow >= 18 ? 'متوسطة' : 'ضعيفة';
    if (adxNow != null && adxNow < 18) v *= 0.5;
    add('follow', {
      vote: v,
      line: `قوة الاتجاه (ADX ${adxNow != null ? adxNow.toFixed(0) : '?'}) ${strength}، ${sd_ === 1 ? 'وسوبرترند صاعد' : 'وسوبرترند هابط'}`,
      details: [ps === 1 ? 'البارابوليك سار تحت السعر' : 'البارابوليك سار فوق السعر', di === 1 ? 'المؤشر الموجب +DI أعلى من السالب' : 'المؤشر السالب -DI أعلى من الموجب'],
    });
  }

  // ---------- 4. smart money concepts
  const smcMarks = { zones: [], labels: [] };
  {
    let v = 0;
    const d = [];
    const lastEv = brk.events[brk.events.length - 1];
    if (lastEv) {
      const ago = lastI - lastEv.i;
      const dir = lastEv.dir === 'up' ? 1 : -1;
      const w = lastEv.type === 'CHoCH' ? (ago <= 20 ? 0.6 : 0.35) : ago <= 30 ? 0.45 : 0.3;
      v += dir * w;
      d.push(`${lastEv.type === 'CHoCH' ? 'تغير في الطابع' : 'كسر للهيكل'} ${dir === 1 ? 'صاعد' : 'هابط'} عند ${P(lastEv.level)} قبل ${count(ago, BARS, { zero: 'أقل من شمعة' })}`);
    }
    const iev = internal.events[internal.events.length - 1];
    if (iev && lastI - iev.i <= 8) {
      const dir = iev.dir === 'up' ? 1 : -1;
      v += dir * 0.15;
      d.push(`الهيكل الداخلي: ${iev.type === 'CHoCH' ? 'تغير طابع' : 'كسر'} ${dir === 1 ? 'صاعد' : 'هابط'} حديث`);
    }
    if (dr) {
      const pos = Math.round(dr.position * 100);
      if (trendUp && dr.zone === 'discount') { v += 0.25; d.push(`السعر في منطقة الخصم (${pos}% من النطاق)، وهي منطقة الشراء في اتجاه صاعد`); }
      else if (!trendUp && dr.zone === 'premium') { v -= 0.25; d.push(`السعر في منطقة العلاوة (${pos}% من النطاق)، وهي منطقة البيع في اتجاه هابط`); }
      else d.push(`السعر في منطقة ${dr.zone === 'premium' ? 'العلاوة' : 'الخصم'} (${pos}% من النطاق)، والأفضل انتظار عودة السعر إلى ${trendUp ? 'الخصم' : 'العلاوة'}`);
      smcMarks.zones.push({ t1: cs[Math.min(lastH.i, lastL.i)].t, top: dr.ote.top, bottom: dr.ote.bottom, kind: 'ote', label: 'منطقة الدخول المثلى' });
    }
    const inZone = z => price <= z.top && price >= z.bottom;
    for (const o of obs) {
      const dist = o.dir === 'bull' ? (price - o.top) / a : (o.bottom - price) / a;
      if (inZone(o)) { v += o.dir === 'bull' ? 0.3 : -0.3; d.push(`السعر داخل كتلة أوامر ${o.dir === 'bull' ? 'شرائية' : 'بيعية'} (${P(o.bottom)} إلى ${P(o.top)})`); }
      else if (dist >= 0 && dist <= 2) { v += o.dir === 'bull' ? 0.12 : -0.12; d.push(`كتلة أوامر ${o.dir === 'bull' ? 'شرائية تحت' : 'بيعية فوق'} السعر عند ${P(o.dir === 'bull' ? o.top : o.bottom)}`); }
      smcMarks.zones.push({ t1: o.t, top: o.top, bottom: o.bottom, kind: o.dir === 'bull' ? 'ob-bull' : 'ob-bear', label: o.dir === 'bull' ? 'كتلة أوامر شرائية' : 'كتلة أوامر بيعية' });
    }
    for (const g of fvg) {
      if (inZone(g)) { v += g.dir === 'bull' ? 0.15 : -0.15; d.push(`السعر يملأ فجوة قيمة عادلة ${g.dir === 'bull' ? 'صاعدة' : 'هابطة'}`); }
      smcMarks.zones.push({ t1: g.t, top: g.top, bottom: g.bottom, kind: g.dir === 'bull' ? 'fvg-bull' : 'fvg-bear', label: 'فجوة قيمة عادلة' });
    }
    // a liquidity grab: equal lows swept and reclaimed is a buy signal, equal highs a sell signal
    for (const p of liq) {
      if (!p.swept) continue;
      let sweepI = -1;
      for (let j = Math.max(p.i + 1, lastI - 12); j <= lastI; j++) {
        if (p.side === 'sell' ? cs[j].l < p.price : cs[j].h > p.price) { sweepI = j; break; }
      }
      if (sweepI < 0) continue;
      const back = p.side === 'sell' ? price > p.price : price < p.price;
      if (back) {
        v += p.side === 'sell' ? 0.35 : -0.35;
        d.push(`سحب سيولة ${p.side === 'sell' ? 'تحت القيعان المتساوية' : 'فوق القمم المتساوية'} عند ${P(p.price)} ثم عودة السعر`);
        smcMarks.labels.push({ t: cs[sweepI].t, price: p.side === 'sell' ? cs[sweepI].l : cs[sweepI].h, text: 'سحب سيولة', pos: p.side === 'sell' ? 'below' : 'above', kind: 'sweep' });
      }
    }
    const pools = liq.filter(p => !p.swept);
    const above = pools.filter(p => p.side === 'buy' && p.price > price).sort((x, y) => x.price - y.price)[0];
    const below = pools.filter(p => p.side === 'sell' && p.price < price).sort((x, y) => y.price - x.price)[0];
    if (above) d.push(`سيولة شرائية متجمعة فوق القمم المتساوية عند ${P(above.price)}`);
    if (below) d.push(`سيولة بيعية متجمعة تحت القيعان المتساوية عند ${P(below.price)}`);
    for (const e of brk.events.slice(-4)) smcMarks.labels.push({ t: e.from?.t || e.t, price: e.level, text: e.type, pos: e.dir === 'up' ? 'above' : 'below', kind: 'bos', toT: e.t });
    const line = v > 0.3 ? 'الهيكل والسيولة يرجحان الشراء' : v < -0.3 ? 'الهيكل والسيولة يرجحان البيع' : 'قراءة المفاهيم الذكية متوازنة';
    add('smc', { vote: v, line, details: d, pools: { above, below } });
  }

  // ---------- 5. support and resistance, pivots, round numbers
  {
    let v = 0;
    const d = [];
    const lc = cs[closedI];
    const lowerWick = Math.min(lc.o, lc.c) - lc.l;
    const upperWick = lc.h - Math.max(lc.o, lc.c);
    const body = Math.abs(lc.c - lc.o);
    const dS = s1 ? (price - s1.price) / a : Infinity;
    const dR = r1 ? (r1.price - price) / a : Infinity;
    if (s1) d.push(`أقرب دعم ${P(s1.price)}، لمسه السعر ${count(s1.touches, TIMES)}${s1.flipped ? '، وكان مقاومة من قبل' : ''}`);
    if (r1) d.push(`أقرب مقاومة ${P(r1.price)}، لمسها السعر ${count(r1.touches, TIMES)}${r1.flipped ? '، وكانت دعما من قبل' : ''}`);
    if (dS <= 0.7) { const rej = lowerWick > body * 1.2 || lc.c > lc.o; v += rej ? 0.5 : 0.3; d.push(rej ? 'السعر يرتد من الدعم' : 'السعر على الدعم ولم يظهر ارتداد واضح بعد'); }
    if (dR <= 0.7) { const rej = upperWick > body * 1.2 || lc.c < lc.o; v -= rej ? 0.5 : 0.3; d.push(rej ? 'السعر يرتد من المقاومة' : 'السعر عند المقاومة ولم يظهر رفض واضح بعد'); }
    // fresh breakout through the nearest level of the last few bars
    for (const lv of sr) {
      const crossedUp = cs[lastI - 3] && cs[lastI - 3].c < lv.price && price > lv.price + a * 0.2;
      const crossedDn = cs[lastI - 3] && cs[lastI - 3].c > lv.price && price < lv.price - a * 0.2;
      if (crossedUp && lv.touches >= 2) { v += 0.35; d.push(`اختراق حديث لمستوى ${P(lv.price)}`); break; }
      if (crossedDn && lv.touches >= 2) { v -= 0.35; d.push(`كسر حديث لمستوى ${P(lv.price)}`); break; }
    }
    if (piv) {
      v += 0.15 * sgn(price - piv.p);
      d.push(`نقطة الارتكاز اليومية ${P(piv.p)}، والسعر ${price > piv.p ? 'فوقها' : 'تحتها'}. المقاومة الأولى ${P(piv.r1)} والدعم الأول ${P(piv.s1)}`);
    }
    if (prevDay) d.push(`قمة أمس ${P(prevDay.h)} وقاعه ${P(prevDay.l)}`);
    const room = Math.min(dS, dR);
    const line = dS <= 0.7 ? 'السعر عند دعم' : dR <= 0.7 ? 'السعر عند مقاومة' : room > 2 ? 'السعر في منتصف المسافة بين الدعم والمقاومة' : 'السعر بين مستويين قريبين';
    add('levels', { vote: v, line, details: d, dS, dR });
  }

  // ---------- 6. candlesticks (closed candles only, read in their place)
  const candleList = candlePatterns(cs.slice(0, closedI + 1));
  {
    const recent = recentCandles(candleList, closedI, 3).filter(p => p.context && p.bias !== 0);
    if (recent.length) {
      let v = 0;
      const d = [];
      for (const p of recent.slice(0, 3)) {
        const rec = p.i === closedI ? 1 : p.i === closedI - 1 ? 0.7 : 0.5;
        const nearS = s1 && Math.abs(cs[p.i].l - s1.price) <= a * 0.8;
        const nearR = r1 && Math.abs(cs[p.i].h - r1.price) <= a * 0.8;
        const loc = (p.bias > 0 && nearS) || (p.bias < 0 && nearR) ? 1.5 : 1;
        v += p.bias * (p.strength / 3) * rec * loc * 0.6;
        d.push(`${p.name} ${p.i === closedI ? 'على آخر شمعة مغلقة' : `قبل ${count(closedI - p.i, BARS)}`}${loc > 1 ? ' عند مستوى' : ''}`);
      }
      add('candles', { vote: v, line: recent[0].bias > 0 ? `نموذج شموع صاعد: ${recent[0].name}` : `نموذج شموع هابط: ${recent[0].name}`, details: d, list: recent });
    } else add('candles', { has: false, line: 'لا نموذج شموع ذا دلالة على آخر الشموع' });
  }

  // ---------- 7. classical chart patterns
  // the same pattern seen on two swing scales is one pattern: keep the more confident reading
  const chart = [];
  for (const p of [...chartPatterns(cs, zzMain, atr), ...chartPatterns(cs, zzMajor, atr).map(x => ({ ...x, major: true }))]) {
    const twin = chart.find(q => q.key === p.key && Math.abs(q.endI - p.endI) <= 6);
    if (!twin) chart.push(p);
    else if ((p.conf || 0) > (twin.conf || 0)) chart[chart.indexOf(twin)] = p;
  }
  {
    const live = chart.filter(p => p.status === 'forming' || (p.status === 'confirmed' && lastI - (p.at ?? p.endI) <= 25) || (p.status === 'failed' && p.at != null && lastI - p.at <= 10));
    if (live.length) {
      let v = 0;
      const d = [];
      for (const p of live.slice(0, 3)) {
        const conf = p.conf || 0.5;
        if (p.status === 'confirmed') v += p.dir * conf;
        else if (p.status === 'forming') v += (p.expected ?? p.dir) * conf * 0.45;
        else v -= p.dir * 0.35;
        const st_ = statusWord(p);
        d.push(`${p.name} ${st_}${p.target ? `، الهدف المقاس ${P(p.target)}` : ''}${p.invalid ? `، ويبطل عند ${P(p.invalid)}` : ''}`);
      }
      add('classic', { vote: v, line: live.slice(0, 2).map(p => `${p.name} ${statusWord(p)}`).join('، و'), details: d, list: live });
    } else add('classic', { has: false, line: 'لا نموذج كلاسيكي واضح الآن' });
  }

  // ---------- 8. harmonics
  const harm = harmonics(cs, [zzMinor, zzMain, zzMajor], atr);
  {
    const done = harm.filter(h => !h.potential && h.barsAgo <= 10 && (h.dir === 1 ? price > h.stop : price < h.stop));
    const pot = harm.filter(h => h.potential).slice(0, 2);
    if (done.length) {
      const h = done[0];
      const reached = h.dir === 1 ? price >= h.targets[1] : price <= h.targets[1];
      const v = reached ? 0 : h.dir * h.score * 0.8;
      add('harmonic', { vote: v, line: `نموذج ${h.name} ${h.dir === 1 ? 'صاعد' : 'هابط'} اكتمل عند النقطة D`, details: [`D عند ${P(h.points[h.points.length - 1].price)}، الهدفان ${P(h.targets[0])} و${P(h.targets[1])}، والإبطال عند ${P(h.stop)}`, ...pot.map(p => `منطقة انعكاس محتملة لنموذج ${p.name} بين ${P(p.prz.bottom)} و${P(p.prz.top)}`)], list: done, potential: pot });
    } else if (pot.length) {
      add('harmonic', { has: false, line: `نموذج ${pot[0].name} محتمل ينتظر وصول السعر إلى منطقة الانعكاس`, details: pot.map(p => `منطقة الانعكاس المحتملة بين ${P(p.prz.bottom)} و${P(p.prz.top)}`), potential: pot });
    } else add('harmonic', { has: false, line: 'لا نموذج توافقي مكتمل أو قريب' });
  }

  // ---------- 9. Elliott waves
  const waves = elliott(cs, zzMain);
  {
    const live = waves.filter(w => (w.next.dir === 1 ? price > w.next.invalid : price < w.next.invalid));
    const KIND = { impulse: 'موجة دافعة مكتملة من خمس موجات', wave5: 'الموجة الخامسة قيد التكوين', wave3: 'بداية موجة ثالثة محتملة', abc: 'تصحيح من ثلاث موجات A B C' };
    if (live.length) {
      const w = live[0];
      add('elliott', { vote: w.next.dir * w.score * 0.8, line: KIND[w.kind], details: [...w.notes, `الأهداف ${w.next.targets.map(P).join(' ثم ')}، والعد يبطل عند ${P(w.next.invalid)}`], list: live });
    } else add('elliott', { has: false, line: 'لا عد موجي يحقق القواعد الثلاث بوضوح' });
  }

  // ---------- 10. Wyckoff
  const wy = wyckoff(cs, atr);
  {
    if (wy.range) {
      const kindT = { accumulation: 'نطاق تجميع محتمل بعد هبوط', distribution: 'نطاق تصريف محتمل بعد صعود', range: 'نطاق تداول' }[wy.range.kind];
      let v = wy.range.kind === 'accumulation' ? 0.1 : wy.range.kind === 'distribution' ? -0.1 : 0;
      const d = [`النطاق بين ${P(wy.range.bottom)} و${P(wy.range.top)}`];
      for (const e of wy.events) {
        const ago = lastI - e.i;
        if (ago > 15) continue;
        v += e.bias * (e.key === 'spring' || e.key === 'upthrust' ? 0.6 : 0.45);
        d.push(`${e.name} قبل ${count(ago, BARS, { zero: 'أقل من شمعة' })}${e.vol ? ' بحجم مرتفع' : ''}`);
      }
      add('wyckoff', { vote: v, line: kindT, details: d });
    } else add('wyckoff', { has: false, line: 'لا نطاق تداول واضح بالمعنى الوايكوفي' });
  }

  // ---------- 11. Fibonacci retracement of the last swing
  let fib = null;
  {
    const conf = zzMain.filter(p => !p.open);
    const open = zzMain[zzMain.length - 1]?.open ? zzMain[zzMain.length - 1] : null;
    let A = conf[conf.length - 2];
    let B = conf[conf.length - 1];
    // once price runs past the start of the last leg, the leg in progress is the one to measure
    if (A && B && open && (B.price - A.price) * (A.price - price) > 0) { A = B; B = open; }
    if (A && B && A.price !== B.price) {
      fib = fibonacci(A.price, B.price);
      const span = B.price - A.price;
      const retr = (B.price - price) / span;
      const legUp = span > 0;
      let v = 0;
      let line;
      const pct = Math.round(retr * 100);
      if (retr >= 0.382 && retr <= 0.786) {
        const golden = retr >= 0.6 && retr <= 0.66;
        const withTrend = legUp === trendUp;
        v = (legUp ? 1 : -1) * (withTrend ? (golden ? 0.5 : 0.35) : 0.15);
        line = `السعر صحح ${pct}% من آخر موجة ${legUp ? 'صاعدة' : 'هابطة'}${golden ? '، في الجيب الذهبي' : ''}`;
      } else if (retr > 0.886) {
        v = (legUp ? -1 : 1) * 0.3;
        line = `تصحيح عميق ${pct}% يهدد الموجة ${legUp ? 'الصاعدة' : 'الهابطة'} السابقة`;
      } else if (retr < 0.236) line = `السعر قرب نهاية آخر موجة ${legUp ? 'صاعدة' : 'هابطة'}، ولم يبدأ تصحيح يذكر`;
      else line = `السعر صحح ${pct}% من آخر موجة ${legUp ? 'صاعدة' : 'هابطة'}`;
      add('fib', { vote: v, line, details: [`الموجة من ${P(A.price)} إلى ${P(B.price)}`, `61.8% عند ${P(B.price - span * 0.618)}، و50% عند ${P(B.price - span * 0.5)}`], retr, legUp, from: A, to: B });
    } else add('fib', { has: false, line: 'لا موجة مكتملة لقياسها' });
  }

  // ---------- 12. momentum and oscillators
  {
    const r = rsi[lastI];
    const h = macd.hist[lastI];
    const hp = macd.hist[lastI - 1];
    const k = stoch.k[lastI];
    const dd = stoch.d[lastI];
    const c_ = cci[lastI];
    let v = 0;
    const d = [];
    if (r != null) {
      if (r > 55) v += 0.3; else if (r < 45) v -= 0.3;
      if (r >= 70) { if (!(adxNow >= 25 && trendUp)) v -= 0.25; d.push(`مؤشر القوة النسبية ${r.toFixed(0)}: تشبع شرائي`); }
      else if (r <= 30) { if (!(adxNow >= 25 && !trendUp)) v += 0.25; d.push(`مؤشر القوة النسبية ${r.toFixed(0)}: تشبع بيعي`); }
      else d.push(`مؤشر القوة النسبية ${r.toFixed(0)}`);
    }
    if (h != null && hp != null) {
      v += 0.2 * sgn(h) + 0.15 * sgn(h - hp);
      d.push(`الماكد ${h > 0 ? 'فوق' : 'تحت'} خط الإشارة، والزخم ${h > hp ? 'يتزايد' : 'يتناقص'}`);
    }
    if (k != null && dd != null) {
      const crossUp = stoch.k[lastI - 1] != null && stoch.k[lastI - 1] <= stoch.d[lastI - 1] && k > dd;
      const crossDn = stoch.k[lastI - 1] != null && stoch.k[lastI - 1] >= stoch.d[lastI - 1] && k < dd;
      if (crossUp && k < 25) { v += 0.3; d.push('تقاطع صاعد للستوكاستك في منطقة التشبع البيعي'); }
      else if (crossDn && k > 75) { v -= 0.3; d.push('تقاطع هابط للستوكاستك في منطقة التشبع الشرائي'); }
      else v += 0.1 * sgn(k - dd);
    }
    if (c_ != null) { if (c_ > 100) v += 0.1; else if (c_ < -100) v -= 0.1; }
    add('momentum', { vote: v, line: v > 0.3 ? 'الزخم إيجابي' : v < -0.3 ? 'الزخم سلبي' : 'الزخم محايد', details: d, rsi: r });
  }

  // ---------- 13. divergences on RSI and the MACD histogram
  const divs = [...divergences(cs, rsi, { name: 'RSI' }), ...divergences(cs, macd.hist, { name: 'MACD' })];
  {
    const recent = divs.filter(x => x.recent);
    if (recent.length) {
      let v = 0;
      for (const x of recent.slice(0, 3)) v += x.bias * (x.hidden ? 0.4 : 0.6);
      add('divergence', { vote: v, line: `${DIV_NAMES[recent[0].kind]} على ${recent[0].name}`, details: recent.slice(0, 3).map(x => `${DIV_NAMES[x.kind]} على ${x.name} بين ${P(x.from.price)} و${P(x.to.price)}`), list: recent });
    } else add('divergence', { has: false, line: 'لا تباعد حديث بين السعر والمؤشرات' });
  }

  // ---------- 14. Ichimoku
  {
    const sa = ich.senkouA[lastI];
    const sb = ich.senkouB[lastI];
    if (sa != null && sb != null) {
      let v = 0;
      const d = [];
      const top = Math.max(sa, sb);
      const bot = Math.min(sa, sb);
      if (price > top) { v += 0.4; d.push('السعر فوق السحابة'); } else if (price < bot) { v -= 0.4; d.push('السعر تحت السحابة'); } else d.push('السعر داخل السحابة: منطقة حيرة');
      const tk = ich.tenkan[lastI];
      const kj = ich.kijun[lastI];
      if (tk != null && kj != null) { v += 0.2 * sgn(tk - kj); d.push(tk > kj ? 'التنكن فوق الكيجون' : 'التنكن تحت الكيجون'); }
      if (lastI >= ich.shift) { const ch = sgn(price - C[lastI - ich.shift]); v += 0.2 * ch; d.push(ch > 0 ? 'خط التأخر فوق السعر قبل 26 شمعة' : 'خط التأخر تحت السعر قبل 26 شمعة'); }
      const fa = ich.senkouA[lastI + ich.shift];
      const fb = ich.senkouB[lastI + ich.shift];
      if (fa != null && fb != null) { v += 0.2 * sgn(fa - fb); d.push(fa > fb ? 'السحابة القادمة صاعدة' : 'السحابة القادمة هابطة'); }
      add('ichimoku', { vote: v, line: d[0], details: d.slice(1) });
    } else add('ichimoku', { has: false, line: 'البيانات أقصر من أن تكتمل السحابة' });
  }

  // ---------- 15. volume (only when the feed carries real volume)
  if (hasVol) {
    const ob = I.obv(cs);
    const mf = I.mfi(cs);
    const vw = I.vwap(cs, { ny: fxDay });
    const avgV = I.sma(cs.map(c => c.v), 20);
    let v = 0;
    const d = [];
    const obvSlope = sgn(ob[lastI] - ob[lastI - 20]);
    const priceSlope = sgn(price - C[lastI - 20]);
    if (obvSlope === priceSlope) { v += 0.3 * obvSlope; d.push('حجم التوازن يؤكد حركة السعر'); } else { v += 0.2 * obvSlope; d.push('حجم التوازن يخالف حركة السعر'); }
    const lc = cs[closedI];
    if (avgV[closedI] && lc.v > avgV[closedI] * 2) { v += 0.3 * sgn(lc.c - lc.o); d.push(`حجم استثنائي على آخر شمعة ${lc.c > lc.o ? 'صاعدة' : 'هابطة'}`); }
    if (mf[lastI] != null) { if (mf[lastI] > 80) { v -= 0.15; d.push('مؤشر تدفق المال فوق 80'); } else if (mf[lastI] < 20) { v += 0.15; d.push('مؤشر تدفق المال تحت 20'); } }
    if (vw[lastI] != null) { v += 0.2 * sgn(price - vw[lastI]); d.push(`السعر ${price > vw[lastI] ? 'فوق' : 'تحت'} متوسط السعر المرجح بالحجم لليوم (${P(vw[lastI])})`); }
    add('volume', { vote: v, line: v > 0.25 ? 'الحجم يدعم الصعود' : v < -0.25 ? 'الحجم يدعم الهبوط' : 'الحجم محايد', details: d });
  } else add('volume', { has: false, line: 'بيانات هذا الرمز بلا حجم تداول حقيقي، فلا قراءة للحجم' });

  // ---------- 16. higher timeframe
  const htfTf = higherTf(tf);
  const mtf = htf ? quickTrend(htf) : null;
  if (mtf) {
    add('mtf', { vote: mtf.score, line: `الإطار الأعلى (${tfInfo(htfTf).ar}) ${TREND_TEXT[mtf.bias] || mtf.bias}`, details: [`هيكل الإطار الأعلى ${TREND_TEXT[mtf.structure]}`], tf: htfTf });
  } else add('mtf', { has: false, line: htfTf ? 'لم يحمل الإطار الأعلى بعد' : 'لا إطار أعلى لهذا الإطار' });

  // ---------- the total
  const reading = schools.filter(s => s.has);
  const wsum = reading.reduce((s, x) => s + x.weight, 0) || 1;
  const raw = reading.reduce((s, x) => s + x.vote * x.weight, 0) / wsum;
  // a soft curve: agreement grows fast at first, then saturates well before 100
  const score = Math.round(Math.tanh(raw * 1.8) * 100);
  const sideSign = sgn(score);
  const voting = reading.filter(s => Math.abs(s.vote) >= 0.15);
  const agreeW = voting.filter(s => sgn(s.vote) === sideSign).reduce((s, x) => s + x.weight, 0);
  const voteW = voting.reduce((s, x) => s + x.weight, 0) || 1;
  const agreement = sideSign ? agreeW / voteW : 0;
  const bias = score >= 15 ? 'buy' : score <= -15 ? 'sell' : 'neutral';
  const forSide = voting.filter(s => sgn(s.vote) === sideSign).length;
  const againstSide = voting.filter(s => sgn(s.vote) === -sideSign).length;
  const againstHtf = mtf && bias !== 'neutral' && ((bias === 'buy' && mtf.bias === 'down') || (bias === 'sell' && mtf.bias === 'up'));
  let level = Math.abs(score) >= 45 && agreement >= 0.7 ? 3 : Math.abs(score) >= 25 && agreement >= 0.6 ? 2 : 1;
  if (againstHtf) level = Math.max(1, level - 1);
  if (bias === 'neutral') level = 0;
  const confidence = ['لا ترجيح', 'ضعيف', 'متوسط', 'قوي'][level];

  const clock = marketClock(now, info.cls);
  const volatility = {
    atr: a, atrPct: (a / price) * 100, atrRank: atrPct, bbRank: bbwPct, squeeze, regime, adx: adxNow,
    text: squeeze ? 'انضغاط: نطاقات بولينجر داخل قنوات كيلتنر، وعادة يتبعه اندفاع قوي باتجاه لم يحدد بعد' : atrPct != null && atrPct > 0.9 ? 'تقلب أعلى من المعتاد بكثير: وسع الوقف أو قلل الحجم' : atrPct != null && atrPct < 0.1 ? 'تقلب أقل من المعتاد: حركة بطيئة واحتمال اندفاع قريب' : 'تقلب في حدوده المعتادة',
  };

  const ctxPlan = { cs, price, a, info, tf: tfi, support, resistance, obs, fvg, sd, liq, chart, harm, waves, dr, trendUp, fib, prevDay, piv, struct, zzMain, schools };
  const plan = buildPlan(bias, ctxPlan);
  const binary = binaryView({ ...ctxPlan, rsi, stoch, bb, ema9: I.ema(C, 9), ema21: I.ema(C, 21), candleList, closedI, clock, atrRank: atrPct, payout, score });

  const warnings = [];
  if (againstHtf) warnings.push(`الترجيح عكس اتجاه الإطار الأعلى (${tfInfo(htfTf).ar})، والصفقات عكس الاتجاه الأكبر أضعف.`);
  if (clock.fxClosed) warnings.push(QUALITY_TEXT.closed);
  else if (clock.quality === 'thin' && info.cls !== 'crypto') warnings.push(QUALITY_TEXT.thin);
  if (squeeze) warnings.push('السوق في انضغاط، فانتظر إغلاقا خارج النطاق قبل الالتزام باتجاه.');
  if (forming) warnings.push('الشمعة الحالية لم تغلق بعد، وقراءة الشموع على المغلقة فقط.');
  if (n < 300) warnings.push(`القراءة على ${n} شمعة فقط؛ كلما زادت البيانات صارت المستويات والنماذج أدق.`);

  const overlays = buildOverlays({ cs, sr, piv, smcMarks, chart, harm, waves, divs, wy, plan, zzMain, candleList, closedI, struct, info, sd });

  const result = {
    ok: true, symbol: info.s || symbol, info, tf, tfName: tfi.ar, frame: tfi.frame, time: last.t, price, forming, bars: n,
    bias, biasText: BIAS_TEXT[bias], score, agreement, confidence, confidenceText: level ? `الترجيح ${confidence}` : 'لا ترجيح واضح', level, forSide, againstSide, readingCount: reading.length,
    trend: struct.trend, trendText: TREND_TEXT[struct.trend], regime, volatility, clock, mtf: mtf ? { ...mtf, tf: htfTf } : null,
    schools, levels: { support: support.slice(0, 4), resistance: resistance.slice(0, 4), pivots: piv, prevDay, prevWeek, rounds },
    zones: { obs, fvg, sd, liq, dr }, patterns: { candles: candleList.slice(-12), chart, harmonics: harm, elliott: waves, wyckoff: wy, divergences: divs.slice(0, 6) },
    plan, binary, warnings, overlays,
    indicators: { rsi: rsi[lastI], macd: macd.hist[lastI], adx: adxNow, atr: a, ema20: ema20[lastI], ema50: ema50[lastI], ema200: ema200[lastI], stochK: stoch.k[lastI] },
  };
  result.narrative = narrate(result);
  return result;
}

function buildOverlays({ cs, sr, piv, smcMarks, chart, harm, waves, divs, wy, plan, zzMain, candleList, closedI, info }) {
  const lastT = cs[cs.length - 1].t;
  const price = cs[cs.length - 1].c;
  // a readable chart: the three nearest levels on each side, the two nearest zones of each kind
  const near = list => list.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  const levels = [
    ...near(sr.filter(x => x.role === 'support')).slice(0, 3),
    ...near(sr.filter(x => x.role === 'resistance')).slice(0, 3),
  ].map(x => ({ price: x.price, kind: x.role, label: x.role === 'support' ? 'دعم' : 'مقاومة', strength: x.strength }));
  if (piv) levels.push({ price: piv.p, kind: 'pivot', label: 'الارتكاز' });
  const mid = z => (z.top + z.bottom) / 2;
  const zones = [];
  const byKind = {};
  for (const z of smcMarks.zones) (byKind[z.kind] ||= []).push(z);
  for (const [kind, list] of Object.entries(byKind)) zones.push(...list.sort((a, b) => Math.abs(mid(a) - price) - Math.abs(mid(b) - price)).slice(0, kind === 'ote' ? 1 : 2));
  for (const h of harm.filter(x => x.potential).slice(0, 1)) zones.push({ t1: h.points[h.points.length - 1].t, top: h.prz.top, bottom: h.prz.bottom, kind: h.dir === 1 ? 'prz-bull' : 'prz-bear', label: `منطقة انعكاس ${h.name}` });
  if (wy.range) zones.push({ t1: cs[wy.range.startI].t, t2: lastT, top: wy.range.top, bottom: wy.range.bottom, kind: 'range', label: 'نطاق وايكوف' });
  const paths = [];
  paths.push({ kind: 'zigzag', points: zzMain.slice(-14).map(p => ({ t: p.t, price: p.price })) });
  for (const p of chart.filter(x => x.status !== 'failed').slice(0, 2)) {
    if (p.lines) for (const l of p.lines) paths.push({ kind: 'pattern', dir: p.dir, label: p.name, points: [{ t: l.t1, price: l.p1 }, { t: l.t2, price: l.p2 }] });
    else paths.push({ kind: 'pattern', dir: p.dir, label: p.name, points: p.points });
    if (p.neckline && !p.lines) paths.push({ kind: 'neck', dir: p.dir, points: [{ t: p.points[0].t, price: p.neckline }, { t: lastT, price: p.neckline }] });
  }
  const labels = [...smcMarks.labels];
  const hDone = harm.find(x => !x.potential && x.barsAgo <= 10);
  if (hDone) {
    paths.push({ kind: 'harmonic', dir: hDone.dir, label: hDone.name, points: hDone.points.map(q => ({ t: q.t, price: q.price })) });
    const names = hDone.points.length === 5 ? ['X', 'A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D'];
    hDone.points.forEach((q, k) => labels.push({ t: q.t, price: q.price, text: names[k], pos: (k % 2 === 0) === (hDone.dir === 1) ? 'below' : 'above', kind: 'harmonic' }));
  }
  const w = waves[0];
  if (w) w.points.forEach((q, k) => { if (w.labels[k]) labels.push({ t: q.t, price: q.price, text: w.labels[k], pos: k % 2 === 0 ? (w.dir === 1 ? 'below' : 'above') : w.dir === 1 ? 'above' : 'below', kind: 'wave' }); });
  for (const dv of divs.filter(x => x.recent).slice(0, 2)) paths.push({ kind: 'div', dir: dv.bias, label: DIV_NAMES[dv.kind], points: [{ t: dv.from.t, price: dv.from.price }, { t: dv.to.t, price: dv.to.price }] });
  const markers = candleList.filter(p => p.context && p.bias !== 0 && p.i >= closedI - 40 && p.strength >= 2).slice(-8).map(p => ({ t: p.t, pos: p.bias > 0 ? 'belowBar' : 'aboveBar', shape: p.bias > 0 ? 'arrowUp' : 'arrowDown', text: p.name, kind: p.bias > 0 ? 'bull' : 'bear' }));
  for (const e of wy.events.slice(-2)) markers.push({ t: e.t, pos: e.bias > 0 ? 'belowBar' : 'aboveBar', shape: 'circle', text: e.key === 'spring' ? 'سبرنج' : e.key === 'upthrust' ? 'أبثرست' : e.key === 'sos' ? 'قوة' : 'ضعف', kind: e.bias > 0 ? 'bull' : 'bear' });
  markers.sort((x, y) => x.t - y.t);
  return { levels, zones, paths, labels, markers, plan: plan.side ? { side: plan.side, entry: plan.entry.price, stop: plan.stop, targets: plan.targets.map(t => t.price), t: lastT } : null, digits: info.digits };
}

// ---------- the written reading, in plain sentences
function narrate(r) {
  const P = p => fmtPrice(p, r.info);
  const out = [];
  const name = r.info.ar || r.symbol;
  const sideWord = r.bias === 'buy' ? 'الصعود' : r.bias === 'sell' ? 'الهبوط' : null;
  const agreeTxt = r.bias === 'neutral' ? '' : `، وتتفق معه ${count(r.forSide, SCHOOLS_N)} وتخالفه ${count(r.againstSide, SCHOOLS_N, { zero: 'لا مدرسة' })}`;
  out.push({
    title: 'الخلاصة',
    text: sideWord
      ? `على ${r.frame} يميل ${name} إلى ${sideWord} بدرجة توافق ${Math.abs(r.score)} من 100${agreeTxt}. ${r.confidenceText}.${r.mtf ? ` الإطار الأعلى ${TREND_TEXT[r.mtf.bias]}.` : ''}`
      : `على ${r.frame} لا ترجيح واضح في ${name}: المدارس منقسمة ودرجة التوافق ${Math.abs(r.score)} من 100. الأفضل انتظار اختراق أحد المستويين المذكورين في الخطة.`,
  });
  const get = k => r.schools.find(s => s.key === k);
  out.push({ title: 'الاتجاه', text: [get('dow')?.line, get('ma')?.line, get('follow')?.line].filter(Boolean).join('. ') + '.' });
  const lv = [];
  if (r.levels.resistance[0]) lv.push(`أقرب مقاومة ${P(r.levels.resistance[0].price)}`);
  if (r.levels.support[0]) lv.push(`أقرب دعم ${P(r.levels.support[0].price)}`);
  if (r.zones.dr) lv.push(`والسعر في منطقة ${r.zones.dr.zone === 'premium' ? 'العلاوة' : 'الخصم'} من النطاق الحالي`);
  if (lv.length) out.push({ title: 'المستويات', text: lv.join('، ') + '.' });
  const sig = r.schools.filter(s => s.has && ['smc', 'candles', 'classic', 'harmonic', 'elliott', 'wyckoff', 'divergence'].includes(s.key)).map(s => s.line);
  if (sig.length) out.push({ title: 'النماذج والإشارات', text: sig.join('. ') + '.' });
  out.push({ title: 'التقلب', text: r.volatility.text + '.' });
  if (r.plan?.summary) out.push({ title: 'الخطة', text: r.plan.summary });
  return out;
}
