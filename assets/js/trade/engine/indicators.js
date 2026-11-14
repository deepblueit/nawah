// Technical indicators on plain arrays. A candle is { t, o, h, l, c, v } with t in UTC seconds.
// Every function returns an array aligned with its input; values that cannot be computed yet are null.
// Formulas follow the original authors and the common charting conventions:
// EMA and RMA seed with a simple average, RSI/ATR/ADX use Wilder smoothing, Bollinger uses the
// population deviation, Stochastic is the slow 14/3/3.

import { dayKey, weekKey } from './time.js';

const isNum = x => typeof x === 'number' && Number.isFinite(x);

export const closes = cs => cs.map(c => c.c);
export const highs = cs => cs.map(c => c.h);
export const lows = cs => cs.map(c => c.l);
export const hl2 = cs => cs.map(c => (c.h + c.l) / 2);
export const hlc3 = cs => cs.map(c => (c.h + c.l + c.c) / 3);

const firstIndex = src => { for (let i = 0; i < src.length; i++) if (isNum(src[i])) return i; return -1; };

export function sma(src, n) {
  const out = new Array(src.length).fill(null);
  const f = firstIndex(src);
  if (f < 0 || n < 1) return out;
  let sum = 0;
  let count = 0;
  for (let i = f; i < src.length; i++) {
    const v = src[i];
    if (!isNum(v)) { sum = 0; count = 0; continue; }
    sum += v; count++;
    if (count > n) { sum -= src[i - n]; count = n; }
    if (count === n) out[i] = sum / n;
  }
  return out;
}

function smoothed(src, n, alpha) {
  const out = new Array(src.length).fill(null);
  const f = firstIndex(src);
  if (f < 0 || src.length - f < n) return out;
  let seed = 0;
  for (let i = f; i < f + n; i++) seed += isNum(src[i]) ? src[i] : 0;
  let prev = seed / n;
  out[f + n - 1] = prev;
  for (let i = f + n; i < src.length; i++) {
    const v = isNum(src[i]) ? src[i] : prev;
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export const ema = (src, n) => smoothed(src, n, 2 / (n + 1));
export const rma = (src, n) => smoothed(src, n, 1 / n);

export function wma(src, n) {
  const out = new Array(src.length).fill(null);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < src.length; i++) {
    let s = 0;
    let ok = true;
    for (let k = 0; k < n; k++) { const v = src[i - k]; if (!isNum(v)) { ok = false; break; } s += v * (n - k); }
    if (ok) out[i] = s / denom;
  }
  return out;
}

export function hma(src, n) {
  const half = wma(src, Math.max(1, Math.round(n / 2)));
  const full = wma(src, n);
  const diff = src.map((_, i) => (isNum(half[i]) && isNum(full[i]) ? 2 * half[i] - full[i] : null));
  return wma(diff, Math.max(1, Math.round(Math.sqrt(n))));
}

export function stdev(src, n) {
  const out = new Array(src.length).fill(null);
  const mean = sma(src, n);
  for (let i = n - 1; i < src.length; i++) {
    if (!isNum(mean[i])) continue;
    let s = 0;
    for (let k = 0; k < n; k++) s += (src[i - k] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / n);
  }
  return out;
}

// Rolling extremes in linear time with monotonic queues.
export function highest(src, n) {
  const out = new Array(src.length).fill(null);
  const q = [];
  for (let i = 0; i < src.length; i++) {
    while (q.length && src[q[q.length - 1]] <= src[i]) q.pop();
    q.push(i);
    if (q[0] <= i - n) q.shift();
    if (i >= n - 1) out[i] = src[q[0]];
  }
  return out;
}

export function lowest(src, n) {
  const out = new Array(src.length).fill(null);
  const q = [];
  for (let i = 0; i < src.length; i++) {
    while (q.length && src[q[q.length - 1]] >= src[i]) q.pop();
    q.push(i);
    if (q[0] <= i - n) q.shift();
    if (i >= n - 1) out[i] = src[q[0]];
  }
  return out;
}

export function trueRange(cs) {
  return cs.map((c, i) => {
    if (i === 0) return c.h - c.l;
    const pc = cs[i - 1].c;
    return Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc));
  });
}

export const atr = (cs, n = 14) => rma(trueRange(cs), n);

export function rsi(src, n = 14) {
  const out = new Array(src.length).fill(null);
  if (src.length <= n) return out;
  const up = new Array(src.length).fill(null);
  const dn = new Array(src.length).fill(null);
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1];
    up[i] = Math.max(ch, 0);
    dn[i] = Math.max(-ch, 0);
  }
  const au = rma(up, n);
  const ad = rma(dn, n);
  for (let i = 0; i < src.length; i++) {
    if (!isNum(au[i]) || !isNum(ad[i])) continue;
    if (ad[i] === 0) out[i] = au[i] === 0 ? 50 : 100;
    else out[i] = 100 - 100 / (1 + au[i] / ad[i]);
  }
  return out;
}

export function macd(src, fast = 12, slow = 26, signal = 9) {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const line = src.map((_, i) => (isNum(f[i]) && isNum(s[i]) ? f[i] - s[i] : null));
  const sig = ema(line, signal);
  const hist = line.map((v, i) => (isNum(v) && isNum(sig[i]) ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export function bollinger(src, n = 20, mult = 2) {
  const mid = sma(src, n);
  const sd = stdev(src, n);
  const upper = mid.map((m, i) => (isNum(m) ? m + mult * sd[i] : null));
  const lower = mid.map((m, i) => (isNum(m) ? m - mult * sd[i] : null));
  const width = mid.map((m, i) => (isNum(m) && m !== 0 ? (upper[i] - lower[i]) / m : null));
  const pctB = src.map((v, i) => (isNum(upper[i]) && upper[i] !== lower[i] ? (v - lower[i]) / (upper[i] - lower[i]) : null));
  return { mid, upper, lower, width, pctB };
}

export function stochastic(cs, n = 14, smoothK = 3, smoothD = 3) {
  const hh = highest(highs(cs), n);
  const ll = lowest(lows(cs), n);
  const raw = cs.map((c, i) => (isNum(hh[i]) ? (hh[i] === ll[i] ? 50 : (100 * (c.c - ll[i])) / (hh[i] - ll[i])) : null));
  const k = sma(raw, smoothK);
  const d = sma(k, smoothD);
  return { k, d };
}

export function adx(cs, n = 14) {
  const len = cs.length;
  const pdm = new Array(len).fill(null);
  const mdm = new Array(len).fill(null);
  const tr = trueRange(cs);
  tr[0] = null;
  for (let i = 1; i < len; i++) {
    const up = cs[i].h - cs[i - 1].h;
    const down = cs[i - 1].l - cs[i].l;
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
  }
  const str = rma(tr, n);
  const spdm = rma(pdm, n);
  const smdm = rma(mdm, n);
  const plus = new Array(len).fill(null);
  const minus = new Array(len).fill(null);
  const dx = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (!isNum(str[i]) || str[i] === 0) continue;
    plus[i] = (100 * spdm[i]) / str[i];
    minus[i] = (100 * smdm[i]) / str[i];
    const sum = plus[i] + minus[i];
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plus[i] - minus[i])) / sum;
  }
  return { adx: rma(dx, n), plus, minus };
}

export function cci(cs, n = 20) {
  const tp = hlc3(cs);
  const mean = sma(tp, n);
  return tp.map((v, i) => {
    if (!isNum(mean[i])) return null;
    let md = 0;
    for (let k = 0; k < n; k++) md += Math.abs(tp[i - k] - mean[i]);
    md /= n;
    return md === 0 ? 0 : (v - mean[i]) / (0.015 * md);
  });
}

export function williamsR(cs, n = 14) {
  const hh = highest(highs(cs), n);
  const ll = lowest(lows(cs), n);
  return cs.map((c, i) => (isNum(hh[i]) ? (hh[i] === ll[i] ? -50 : (-100 * (hh[i] - c.c)) / (hh[i] - ll[i])) : null));
}

export function obv(cs) {
  const out = new Array(cs.length).fill(null);
  if (!cs.length) return out;
  let acc = 0;
  out[0] = 0;
  for (let i = 1; i < cs.length; i++) {
    const v = cs[i].v || 0;
    if (cs[i].c > cs[i - 1].c) acc += v; else if (cs[i].c < cs[i - 1].c) acc -= v;
    out[i] = acc;
  }
  return out;
}

export function mfi(cs, n = 14) {
  const tp = hlc3(cs);
  const out = new Array(cs.length).fill(null);
  for (let i = n; i < cs.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const flow = tp[k] * (cs[k].v || 0);
      if (tp[k] > tp[k - 1]) pos += flow; else if (tp[k] < tp[k - 1]) neg += flow;
    }
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

// VWAP anchored to each UTC day (or each session start passed in as a function).
export function vwap(cs, { ny = false } = {}) {
  const out = new Array(cs.length).fill(null);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < cs.length; i++) {
    if (i === 0 || dayKey(cs[i].t, ny) !== dayKey(cs[i - 1].t, ny)) { pv = 0; vol = 0; }
    const v = cs[i].v || 0;
    pv += ((cs[i].h + cs[i].l + cs[i].c) / 3) * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

// Ichimoku Kinko Hyo (Hosoda): 9, 26, 52 with spans plotted 26 periods ahead.
export function ichimoku(cs, conv = 9, base = 26, spanB = 52, shift = 26) {
  const H = highs(cs);
  const L = lows(cs);
  const mid = (n) => { const hh = highest(H, n); const ll = lowest(L, n); return hh.map((h, i) => (isNum(h) ? (h + ll[i]) / 2 : null)); };
  const tenkan = mid(conv);
  const kijun = mid(base);
  const b = mid(spanB);
  const a = tenkan.map((t, i) => (isNum(t) && isNum(kijun[i]) ? (t + kijun[i]) / 2 : null));
  // spans at index i are the values that apply to bar i (computed shift bars earlier)
  const senkouA = new Array(cs.length + shift).fill(null);
  const senkouB = new Array(cs.length + shift).fill(null);
  for (let i = 0; i < cs.length; i++) { senkouA[i + shift] = a[i]; senkouB[i + shift] = b[i]; }
  const chikou = cs.map((_, i) => (i + shift < cs.length ? cs[i + shift].c : null));
  return { tenkan, kijun, senkouA, senkouB, chikou, shift };
}

// Parabolic SAR (Wilder): step 0.02, maximum 0.2.
export function psar(cs, step = 0.02, max = 0.2) {
  const out = new Array(cs.length).fill(null);
  if (cs.length < 3) return out;
  let up = cs[1].c >= cs[0].c;
  let af = step;
  let ep = up ? Math.max(cs[0].h, cs[1].h) : Math.min(cs[0].l, cs[1].l);
  let sar = up ? Math.min(cs[0].l, cs[1].l) : Math.max(cs[0].h, cs[1].h);
  out[1] = sar;
  for (let i = 2; i < cs.length; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, cs[i - 1].l, cs[i - 2].l);
      if (cs[i].l < sar) { up = false; sar = ep; ep = cs[i].l; af = step; }
      else if (cs[i].h > ep) { ep = cs[i].h; af = Math.min(af + step, max); }
    } else {
      sar = Math.max(sar, cs[i - 1].h, cs[i - 2].h);
      if (cs[i].h > sar) { up = true; sar = ep; ep = cs[i].h; af = step; }
      else if (cs[i].l < ep) { ep = cs[i].l; af = Math.min(af + step, max); }
    }
    out[i] = sar;
  }
  return out;
}

// SuperTrend on hl2 with ATR bands. dir is 1 for up, -1 for down.
export function supertrend(cs, n = 10, mult = 3) {
  const a = atr(cs, n);
  const line = new Array(cs.length).fill(null);
  const dir = new Array(cs.length).fill(null);
  let upper = null;
  let lower = null;
  let d = 1;
  for (let i = 0; i < cs.length; i++) {
    if (!isNum(a[i])) continue;
    const mid = (cs[i].h + cs[i].l) / 2;
    const bu = mid + mult * a[i];
    const bl = mid - mult * a[i];
    const pc = i > 0 ? cs[i - 1].c : cs[i].c;
    upper = upper === null || bu < upper || pc > upper ? bu : upper;
    lower = lower === null || bl > lower || pc < lower ? bl : lower;
    if (d === 1 && cs[i].c < lower) d = -1;
    else if (d === -1 && cs[i].c > upper) d = 1;
    dir[i] = d;
    line[i] = d === 1 ? lower : upper;
  }
  return { line, dir };
}

export function keltner(cs, n = 20, atrN = 10, mult = 2) {
  const mid = ema(closes(cs), n);
  const a = atr(cs, atrN);
  return {
    mid,
    upper: mid.map((m, i) => (isNum(m) && isNum(a[i]) ? m + mult * a[i] : null)),
    lower: mid.map((m, i) => (isNum(m) && isNum(a[i]) ? m - mult * a[i] : null)),
  };
}

export function donchian(cs, n = 20) {
  const upper = highest(highs(cs), n);
  const lower = lowest(lows(cs), n);
  return { upper, lower, mid: upper.map((u, i) => (isNum(u) ? (u + lower[i]) / 2 : null)) };
}

export const roc = (src, n = 10) => src.map((v, i) => (i >= n && src[i - n] ? ((v - src[i - n]) / src[i - n]) * 100 : null));

export function heikinAshi(cs) {
  const out = [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const hc = (c.o + c.h + c.l + c.c) / 4;
    const ho = i === 0 ? (c.o + c.c) / 2 : (out[i - 1].o + out[i - 1].c) / 2;
    out.push({ t: c.t, o: ho, h: Math.max(c.h, ho, hc), l: Math.min(c.l, ho, hc), c: hc, v: c.v });
  }
  return out;
}

// Pivot points from one completed period (high, low, close and its open for DeMark).
export function pivotPoints({ h, l, c, o }, method = 'classic') {
  const r = h - l;
  if (method === 'fibonacci') {
    const p = (h + l + c) / 3;
    return { p, r1: p + 0.382 * r, r2: p + 0.618 * r, r3: p + r, s1: p - 0.382 * r, s2: p - 0.618 * r, s3: p - r };
  }
  if (method === 'camarilla') {
    return {
      p: (h + l + c) / 3,
      r1: c + (r * 1.1) / 12, r2: c + (r * 1.1) / 6, r3: c + (r * 1.1) / 4, r4: c + (r * 1.1) / 2,
      s1: c - (r * 1.1) / 12, s2: c - (r * 1.1) / 6, s3: c - (r * 1.1) / 4, s4: c - (r * 1.1) / 2,
    };
  }
  if (method === 'woodie') {
    const p = (h + l + 2 * c) / 4;
    return { p, r1: 2 * p - l, r2: p + r, s1: 2 * p - h, s2: p - r };
  }
  if (method === 'demark') {
    const x = c < o ? h + 2 * l + c : c > o ? 2 * h + l + c : h + l + 2 * c;
    return { p: x / 4, r1: x / 2 - l, s1: x / 2 - h };
  }
  const p = (h + l + c) / 3;
  return { p, r1: 2 * p - l, r2: p + r, r3: h + 2 * (p - l), s1: 2 * p - h, s2: p - r, s3: l - 2 * (h - p) };
}

// The high, low, close and open of the previous day or week. With ny=true the day ends at the
// New York close (the forex convention), so pivots never come from a short Sunday candle.
export function previousPeriod(cs, period = 'day', { ny = false } = {}) {
  if (!cs.length) return null;
  const key = c => (period === 'week' ? weekKey(c.t, ny) : dayKey(c.t, ny));
  const lastKey = key(cs[cs.length - 1]);
  let h = -Infinity;
  let l = Infinity;
  let c = null;
  let o = null;
  let found = null;
  for (let i = cs.length - 1; i >= 0; i--) {
    const k = key(cs[i]);
    if (k === lastKey) continue;
    if (found === null) { found = k; c = cs[i].c; }
    if (k !== found) break;
    h = Math.max(h, cs[i].h);
    l = Math.min(l, cs[i].l);
    o = cs[i].o;
  }
  return found === null ? null : { h, l, c, o };
}

// Where the last value sits among the previous n values, from 0 to 1.
export function percentile(src, n = 200) {
  const vals = src.slice(-n).filter(isNum);
  if (vals.length < 10) return null;
  const last = vals[vals.length - 1];
  return vals.filter(v => v <= last).length / vals.length;
}

export const last = arr => { for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return arr[i]; return null; };
export const at = (arr, i) => (i >= 0 && i < arr.length && isNum(arr[i]) ? arr[i] : null);
