// Demonstration prices: a seeded generator with trends, ranges, volatility clusters, the forex
// day rhythm and the weekend close. It is stable for a symbol and timeframe through the week, so
// the same history comes back on reload and new candles keep arriving. Never real prices.
import { symbolInfo, tfInfo } from './symbols.js';
import { marketClock } from './time.js';

const BASE = {
  EURUSD: [1.085, 0.0055], GBPUSD: [1.27, 0.0065], USDJPY: [151, 0.006], USDCHF: [0.88, 0.0055], AUDUSD: [0.66, 0.007],
  NZDUSD: [0.6, 0.0072], USDCAD: [1.36, 0.005], EURGBP: [0.855, 0.004], EURJPY: [163, 0.0065], GBPJPY: [192, 0.0075],
  XAUUSD: [2400, 0.011], XAGUSD: [29, 0.018], BTCUSDT: [68000, 0.03], ETHUSDT: [3500, 0.038], SOLUSDT: [160, 0.05],
};

function hash(s) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// mulberry32: small, fast and good enough for a demo
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

// hour of day activity for forex: quiet Asia, busy London and New York
const FX_HOUR = [0.55, 0.5, 0.5, 0.55, 0.6, 0.65, 0.75, 1.0, 1.25, 1.2, 1.1, 1.05, 1.15, 1.4, 1.45, 1.3, 1.15, 1.0, 0.85, 0.75, 0.65, 0.6, 0.55, 0.55];

export function demoState(symbol, tf, { bars = 900, now = Math.floor(Date.now() / 1000) } = {}) {
  const info = symbolInfo(symbol) || { s: symbol, cls: 'fx', digits: 5 };
  const tfi = tfInfo(tf);
  const [p0, dVol] = BASE[info.s] || [info.cls === 'crypto' ? 100 : 1.2, info.cls === 'crypto' ? 0.04 : 0.006];
  // anchor the series to the start of the week (or month for long frames) so history is stable
  const span = tfi.sec >= 86400 ? 86400 * 28 : 86400 * 7;
  const anchor = Math.floor((now - 4 * 86400) / span) * span + 4 * 86400;
  const start = Math.floor(anchor / tfi.sec) * tfi.sec - bars * tfi.sec;
  const st = {
    info, tfi, r: rng(hash(`${info.s}|${tf}|${anchor}`)), price: p0 * (0.9 + 0.2 * rng(hash(info.s))()),
    sigma: dVol * Math.sqrt(tfi.sec / 86400), var: 1, regime: 0, left: 0, t: start, candles: [],
    crypto: info.cls === 'crypto',
  };
  while (st.t + tfi.sec <= now) step(st);
  // the bar still forming
  if (st.t <= now) partial(st, now);
  if (st.candles.length > 3000) st.candles = st.candles.slice(-3000);
  return st;
}

function step(st) {
  const { tfi, r } = st;
  const t = st.t;
  st.t += tfi.sec;
  if (!st.crypto && tfi.sec < 86400 && marketClock(t, 'fx').fxClosed) return;
  if (!st.crypto && tfi.sec === 86400) { const d = new Date(t * 1000).getUTCDay(); if (d === 6) return; }
  if (st.left <= 0) {
    const x = r();
    st.regime = x < 0.36 ? 1 : x < 0.72 ? -1 : 0;
    st.left = 30 + Math.floor(r() * 140);
  }
  st.left--;
  const hourK = st.crypto || tfi.sec >= 86400 ? 1 : FX_HOUR[new Date(t * 1000).getUTCHours()];
  const shock = gauss(r);
  st.var = 0.04 + 0.12 * shock * shock + 0.84 * st.var;
  const vol = st.sigma * Math.sqrt(st.var) * hourK;
  const drift = st.regime * st.sigma * 0.18;
  // in a range, price is pulled back toward the middle of its recent bars
  const mean = st.candles.length > 30 ? st.candles.slice(-30).reduce((s, c) => s + c.c, 0) / 30 : st.price;
  const pull = st.regime === 0 ? ((mean - st.price) / st.price) * 0.08 : 0;
  const ret = drift + pull + vol * shock;
  const o = st.price;
  const c = o * Math.exp(ret);
  const wick = () => Math.abs(gauss(r)) * vol * 0.55 * o;
  const h = Math.max(o, c) + wick();
  const l = Math.min(o, c) - wick();
  const v = st.crypto ? Math.round((800 + 2400 * r()) * (1 + Math.abs(ret) / (st.sigma || 1)) * (tfi.sec / 3600) ** 0.8) : 0;
  st.candles.push({ t, o, h, l, c, v });
  st.price = c;
}

function partial(st, now) {
  const { tfi, r } = st;
  if (!st.crypto && marketClock(now, 'fx').fxClosed) return;
  const t = st.t;
  const frac = Math.max(0.05, (now - t) / tfi.sec);
  const vol = st.sigma * Math.sqrt(st.var) * Math.sqrt(frac);
  const o = st.price;
  const c = o * Math.exp(vol * gauss(r));
  st.candles.push({ t, o, h: Math.max(o, c) + Math.abs(gauss(r)) * vol * 0.4 * o, l: Math.min(o, c) - Math.abs(gauss(r)) * vol * 0.4 * o, c, v: st.crypto ? Math.round(500 * frac) : 0 });
  st.forming = true;
}

// Moves the forming candle a little, or closes it and opens the next one.
export function demoTick(st, now = Math.floor(Date.now() / 1000)) {
  const { tfi, r } = st;
  if (!st.crypto && marketClock(now, 'fx').fxClosed) return null;
  let last = st.candles[st.candles.length - 1];
  if (!last) return null;
  if (now >= last.t + tfi.sec) {
    st.price = last.c;
    st.t = last.t + tfi.sec;
    while (st.t + tfi.sec <= now) step(st);
    partial(st, now);
    last = st.candles[st.candles.length - 1];
    return { candle: last, closed: true };
  }
  const vol = st.sigma * Math.sqrt(st.var) * 0.12;
  const c = last.c * Math.exp(vol * gauss(r));
  last.c = c;
  last.h = Math.max(last.h, c);
  last.l = Math.min(last.l, c);
  if (st.crypto) last.v += Math.round(20 * r());
  return { candle: last, closed: false };
}
