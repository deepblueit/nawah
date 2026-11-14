// Japanese candlestick patterns (after Steve Nison's definitions), each read in its trend context.
// A reversal pattern only counts when it appears after the move it reverses; the same shape in
// the wrong place is reported as a shape, not a signal.
import { sma, ema } from './indicators.js';

const body = c => Math.abs(c.c - c.o);
const range = c => c.h - c.l;
const upper = c => c.h - Math.max(c.o, c.c);
const lower = c => Math.min(c.o, c.c) - c.l;
const bull = c => c.c > c.o;
const bear = c => c.c < c.o;
const mid = c => (c.o + c.c) / 2;

// Trend before bar i: slope of a 10-period EMA over 5 bars, scaled by the average range.
function trendBefore(cs, i, e10, avgR) {
  const j = i - 1;
  if (j < 6 || e10[j] == null || e10[j - 5] == null) return 0;
  const slope = (e10[j] - e10[j - 5]) / (avgR[j] || 1);
  const pos = cs[j].c - e10[j];
  if (slope < -0.25 && pos <= (avgR[j] || 0) * 0.5) return -1;
  if (slope > 0.25 && pos >= -(avgR[j] || 0) * 0.5) return 1;
  return 0;
}

export const CANDLE_NAMES = {
  doji: 'دوجي', dragonfly: 'دوجي اليعسوب', gravestone: 'دوجي شاهد القبر', longLegged: 'دوجي طويل الأرجل',
  hammer: 'المطرقة', hangingMan: 'الرجل المشنوق', invertedHammer: 'المطرقة المقلوبة', shootingStar: 'الشهاب',
  spinningTop: 'القمة الدوارة', marubozuBull: 'ماروبوزو صاعد', marubozuBear: 'ماروبوزو هابط',
  bullEngulfing: 'الابتلاع الصاعد', bearEngulfing: 'الابتلاع الهابط', bullHarami: 'الهارامي الصاعد', bearHarami: 'الهارامي الهابط',
  piercing: 'الخط الثاقب', darkCloud: 'الغيمة السوداء', tweezerTop: 'قمة الملقط', tweezerBottom: 'قاع الملقط',
  morningStar: 'نجمة الصباح', eveningStar: 'نجمة المساء', threeSoldiers: 'الجنود الثلاثة البيض', threeCrows: 'الغربان الثلاثة السود',
  threeInsideUp: 'الثلاثة الداخلية الصاعدة', threeInsideDown: 'الثلاثة الداخلية الهابطة', threeOutsideUp: 'الثلاثة الخارجية الصاعدة', threeOutsideDown: 'الثلاثة الخارجية الهابطة',
  risingThree: 'الطرق الثلاثة الصاعدة', fallingThree: 'الطرق الثلاثة الهابطة', bullKicker: 'الركلة الصاعدة', bearKicker: 'الركلة الهابطة',
  insideBar: 'الشمعة الداخلية', outsideBar: 'الشمعة الخارجية', pinBull: 'الدبوس الصاعد', pinBear: 'الدبوس الهابط',
};

// Returns every pattern found from bar `from` to the end: { i, t, key, name, bias, strength, context }.
// bias: 1 bullish, -1 bearish, 0 indecision. strength 1 to 3. context: whether the trend before fits.
export function candlePatterns(cs, { from = Math.max(0, cs.length - 200) } = {}) {
  const out = [];
  if (cs.length < 12) return out;
  const ranges = cs.map(range);
  const bodies = cs.map(body);
  const avgR = sma(ranges, 14);
  const avgB = sma(bodies, 14);
  const e10 = ema(cs.map(c => c.c), 10);
  const push = (i, key, bias, strength, needTrend) => {
    const tr = trendBefore(cs, i, e10, avgR);
    const fits = needTrend === 0 ? true : tr === needTrend;
    out.push({ i, t: cs[i].t, key, name: CANDLE_NAMES[key], bias, strength: fits ? strength : Math.max(1, strength - 1), context: fits, trendBefore: tr });
  };
  for (let i = Math.max(from, 3); i < cs.length; i++) {
    const c = cs[i];
    const p = cs[i - 1];
    const pp = cs[i - 2];
    const r = range(c);
    if (r <= 0) continue;
    const aB = avgB[i] || bodies[i];
    const aR = avgR[i] || r;
    const tr = trendBefore(cs, i, e10, avgR);
    const b = body(c);
    const isLong = x => body(x) >= (avgB[i] || body(x)) * 1.2;
    const isSmall = x => body(x) <= (avgB[i] || body(x)) * 0.5;

    // ----- single candles
    if (b <= r * 0.1) {
      if (upper(c) <= r * 0.1 && lower(c) >= r * 0.6) push(i, 'dragonfly', tr === -1 ? 1 : 0, 2, -1);
      else if (lower(c) <= r * 0.1 && upper(c) >= r * 0.6) push(i, 'gravestone', tr === 1 ? -1 : 0, 2, 1);
      else if (upper(c) >= r * 0.3 && lower(c) >= r * 0.3 && r >= aR * 1.2) push(i, 'longLegged', 0, 1, 0);
      else push(i, 'doji', 0, 1, 0);
    } else if (lower(c) >= b * 2 && upper(c) <= Math.max(b * 0.35, r * 0.1) && r >= aR * 0.8) {
      if (tr === -1) push(i, 'hammer', 1, 2, -1);
      else if (tr === 1) push(i, 'hangingMan', -1, 1, 1);
      else push(i, 'pinBull', 1, 1, 0);
    } else if (upper(c) >= b * 2 && lower(c) <= Math.max(b * 0.35, r * 0.1) && r >= aR * 0.8) {
      if (tr === 1) push(i, 'shootingStar', -1, 2, 1);
      else if (tr === -1) push(i, 'invertedHammer', 1, 1, -1);
      else push(i, 'pinBear', -1, 1, 0);
    } else if (b <= r * 0.3 && upper(c) > b && lower(c) > b) {
      push(i, 'spinningTop', 0, 1, 0);
    } else if (b >= r * 0.9 && b >= aB * 1.3) {
      push(i, bull(c) ? 'marubozuBull' : 'marubozuBear', bull(c) ? 1 : -1, 1, 0);
    }

    // ----- two candles
    const pb = body(p);
    if (bear(p) && bull(c) && c.c >= p.o && c.o <= p.c && b > pb && pb > 0) push(i, 'bullEngulfing', 1, 3, -1);
    else if (bull(p) && bear(c) && c.o >= p.c && c.c <= p.o && b > pb && pb > 0) push(i, 'bearEngulfing', -1, 3, 1);
    if (isLong(p) && b < pb * 0.6 && Math.max(c.o, c.c) <= Math.max(p.o, p.c) && Math.min(c.o, c.c) >= Math.min(p.o, p.c)) {
      if (bear(p)) push(i, 'bullHarami', 1, 2, -1);
      else if (bull(p)) push(i, 'bearHarami', -1, 2, 1);
    }
    if (bear(p) && isLong(p) && bull(c) && c.o <= p.c && c.c > mid(p) && c.c < p.o) push(i, 'piercing', 1, 2, -1);
    if (bull(p) && isLong(p) && bear(c) && c.o >= p.c && c.c < mid(p) && c.c > p.o) push(i, 'darkCloud', -1, 2, 1);
    const twTol = aR * 0.06;
    if (Math.abs(c.h - p.h) <= twTol && bull(p) && bear(c) && tr === 1) push(i, 'tweezerTop', -1, 2, 1);
    if (Math.abs(c.l - p.l) <= twTol && bear(p) && bull(c) && tr === -1) push(i, 'tweezerBottom', 1, 2, -1);
    if (bear(p) && bull(c) && c.o > p.o && isLong(c)) push(i, 'bullKicker', 1, 3, 0);
    if (bull(p) && bear(c) && c.o < p.o && isLong(c)) push(i, 'bearKicker', -1, 3, 0);
    if (c.h < p.h && c.l > p.l) push(i, 'insideBar', 0, 1, 0);
    else if (c.h > p.h && c.l < p.l && b > pb) push(i, 'outsideBar', bull(c) ? 1 : -1, 1, 0);

    // ----- three candles
    if (isLong(pp) && bear(pp) && isSmall(p) && Math.max(p.o, p.c) <= pp.c + aR * 0.1 && bull(c) && c.c > mid(pp)) push(i, 'morningStar', 1, 3, -1);
    if (isLong(pp) && bull(pp) && isSmall(p) && Math.min(p.o, p.c) >= pp.c - aR * 0.1 && bear(c) && c.c < mid(pp)) push(i, 'eveningStar', -1, 3, 1);
    const soldier = (x, prev) => bull(x) && isLong(x) && x.c > prev.c && x.o >= Math.min(prev.o, prev.c) && x.o <= prev.c && upper(x) <= body(x) * 0.35;
    const crow = (x, prev) => bear(x) && isLong(x) && x.c < prev.c && x.o <= Math.max(prev.o, prev.c) && x.o >= prev.c && lower(x) <= body(x) * 0.35;
    if (bull(pp) && isLong(pp) && soldier(p, pp) && soldier(c, p)) push(i, 'threeSoldiers', 1, 3, 0);
    if (bear(pp) && isLong(pp) && crow(p, pp) && crow(c, p)) push(i, 'threeCrows', -1, 3, 0);
    const harami = (a1, b1) => body(b1) < body(a1) * 0.6 && Math.max(b1.o, b1.c) <= Math.max(a1.o, a1.c) && Math.min(b1.o, b1.c) >= Math.min(a1.o, a1.c);
    if (bear(pp) && isLong(pp) && harami(pp, p) && bull(c) && c.c > pp.o) push(i, 'threeInsideUp', 1, 3, -1);
    if (bull(pp) && isLong(pp) && harami(pp, p) && bear(c) && c.c < pp.o) push(i, 'threeInsideDown', -1, 3, 1);
    if (bear(pp) && bull(p) && p.c >= pp.o && p.o <= pp.c && body(p) > body(pp) && bull(c) && c.c > p.c) push(i, 'threeOutsideUp', 1, 3, -1);
    if (bull(pp) && bear(p) && p.o >= pp.c && p.c <= pp.o && body(p) > body(pp) && bear(c) && c.c < p.c) push(i, 'threeOutsideDown', -1, 3, 1);
  }
  // five-candle continuation: rising and falling three methods
  for (let i = Math.max(from, 5); i < cs.length; i++) {
    const [a1, b1, c1, d1, e1] = cs.slice(i - 4, i + 1);
    const inside = x => x.h <= a1.h && x.l >= a1.l;
    const aB = avgB[i] || body(a1);
    if (bull(a1) && body(a1) >= aB * 1.2 && [b1, c1, d1].every(x => inside(x) && body(x) <= body(a1) * 0.6) && bull(e1) && e1.c > a1.c) push(i, 'risingThree', 1, 2, 0);
    if (bear(a1) && body(a1) >= aB * 1.2 && [b1, c1, d1].every(x => inside(x) && body(x) <= body(a1) * 0.6) && bear(e1) && e1.c < a1.c) push(i, 'fallingThree', -1, 2, 0);
  }
  return out.sort((x, y) => x.i - y.i || y.strength - x.strength);
}

// The patterns that matter now: on the last `bars` candles, strongest first.
export function recentCandles(list, lastIndex, bars = 3) {
  return list.filter(p => p.i >= lastIndex - bars + 1).sort((a, b) => b.strength - a.strength || b.i - a.i);
}
