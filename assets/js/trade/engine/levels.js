// Price levels and zones: support and resistance, round numbers, order blocks, fair value gaps,
// liquidity pools, supply and demand bases, premium and discount, and Fibonacci levels.
// Tolerances are measured in ATR so the same rules work on EURUSD and on gold.
import { pivots } from './swings.js';

// ---------- support and resistance by clustering swing points
export function supportResistance(cs, atrV, { lookback = 400, near = 6, minTouches = 2 } = {}) {
  const start = Math.max(0, cs.length - lookback);
  const slice = cs.slice(start);
  if (slice.length < 30) return [];
  const a = atrV[cs.length - 1] || 0;
  if (!a) return [];
  const tol = a * 0.45;
  const pts = [...pivots(slice, 3, 3), ...pivots(slice, 8, 8).map(p => ({ ...p, major: true }))]
    .map(p => ({ ...p, i: p.i + start }));
  pts.sort((x, y) => x.price - y.price);
  const clusters = [];
  for (const p of pts) {
    const c = clusters[clusters.length - 1];
    if (c && p.price - c.top <= tol) {
      c.items.push(p); c.top = Math.max(c.top, p.price); c.bottom = Math.min(c.bottom, p.price);
    } else clusters.push({ items: [p], top: p.price, bottom: p.price });
  }
  const lastI = cs.length - 1;
  const price = cs[lastI].c;
  const out = [];
  for (const c of clusters) {
    const touches = c.items.length;
    if (touches < minTouches && !c.items.some(x => x.major)) continue;
    const mid = c.items.reduce((s, x) => s + x.price, 0) / touches;
    const recency = Math.max(...c.items.map(x => x.i));
    const age = lastI - recency;
    const strength = c.items.reduce((s, x) => s + (x.major ? 2 : 1) * (1 + Math.max(0, 1 - (lastI - x.i) / lookback)), 0);
    // a level price closed through several times recently is weaker
    let crosses = 0;
    for (let i = Math.max(start + 1, lastI - 120); i <= lastI; i++) {
      if ((cs[i - 1].c - mid) * (cs[i].c - mid) < 0) crosses++;
    }
    const kinds = new Set(c.items.map(x => x.type));
    out.push({
      price: mid, top: Math.max(c.top, mid + tol * 0.25), bottom: Math.min(c.bottom, mid - tol * 0.25),
      touches, strength: strength / (1 + crosses * 0.35), age, lastI: recency,
      role: mid >= price ? 'resistance' : 'support',
      flipped: kinds.size === 2,
      dist: (mid - price) / a,
    });
  }
  const above = out.filter(x => x.role === 'resistance').sort((x, y) => x.price - y.price).slice(0, near);
  const below = out.filter(x => x.role === 'support').sort((x, y) => y.price - x.price).slice(0, near);
  return [...below.reverse(), ...above];
}

// ---------- psychological round numbers around the price
export function roundNumbers(price, atrValue, count = 3) {
  if (!price || !atrValue) return [];
  // pick a step close to 4 ATR on a 1-2-5 scale
  const target = atrValue * 4;
  const pow = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= target) || pow * 10;
  const base = Math.floor(price / step) * step;
  const out = [];
  for (let k = -count + 1; k <= count; k++) out.push(+(base + k * step).toFixed(10));
  return out.filter(x => x > 0);
}

// ---------- fair value gaps: three-candle imbalances that price often revisits
export function fairValueGaps(cs, atrV, { lookback = 300, minAtr = 0.15 } = {}) {
  const out = [];
  const start = Math.max(2, cs.length - lookback);
  for (let i = start; i < cs.length; i++) {
    const a = atrV[i] || atrV[cs.length - 1] || 0;
    const c0 = cs[i - 2];
    const c2 = cs[i];
    if (c2.l > c0.h && c2.l - c0.h >= a * minAtr) out.push({ dir: 'bull', i: i - 1, t: cs[i - 1].t, top: c2.l, bottom: c0.h });
    if (c2.h < c0.l && c0.l - c2.h >= a * minAtr) out.push({ dir: 'bear', i: i - 1, t: cs[i - 1].t, top: c0.l, bottom: c2.h });
  }
  // fill state: how much of the gap later price traded back into
  for (const g of out) {
    let filled = 0;
    for (let j = g.i + 2; j < cs.length; j++) {
      const size = g.top - g.bottom;
      if (g.dir === 'bull') filled = Math.max(filled, Math.min(1, (g.top - cs[j].l) / size));
      else filled = Math.max(filled, Math.min(1, (cs[j].h - g.bottom) / size));
      if (filled >= 1) break;
    }
    g.filled = Math.max(0, filled);
    g.active = g.filled < 1;
  }
  return out;
}

// ---------- order blocks: the last opposite candle before a displacement that broke structure
export function orderBlocks(cs, atrV, breakEvents, { maxAge = 300 } = {}) {
  const out = [];
  const lastI = cs.length - 1;
  for (const ev of breakEvents) {
    if (lastI - ev.i > maxAge) continue;
    const startI = ev.from ? ev.from.i : Math.max(0, ev.i - 20);
    // find the origin of the move: lowest low (bullish) or highest high (bearish) between swing and break
    let originI = startI;
    for (let j = startI; j <= ev.i; j++) {
      if (ev.dir === 'up' ? cs[j].l < cs[originI].l : cs[j].h > cs[originI].h) originI = j;
    }
    // last opposite-coloured candle at or before the origin
    let obI = -1;
    for (let j = originI; j >= Math.max(0, originI - 6); j--) {
      const bear = cs[j].c < cs[j].o;
      if (ev.dir === 'up' ? bear : !bear) { obI = j; break; }
    }
    if (obI < 0) continue;
    // displacement: the move from the block to the break must be large
    const a = atrV[ev.i] || atrV[lastI] || 0;
    const move = ev.dir === 'up' ? cs[ev.i].c - cs[obI].l : cs[obI].h - cs[ev.i].c;
    if (a && move < a * 1.5) continue;
    const ob = { dir: ev.dir === 'up' ? 'bull' : 'bear', i: obI, t: cs[obI].t, top: cs[obI].h, bottom: cs[obI].l, from: ev.type, breakI: ev.i };
    // mitigation and invalidation after the break
    ob.touched = false;
    ob.broken = false;
    for (let j = ev.i + 1; j <= lastI; j++) {
      if (ob.dir === 'bull') {
        if (cs[j].l <= ob.top) ob.touched = true;
        if (cs[j].c < ob.bottom) { ob.broken = true; break; }
      } else {
        if (cs[j].h >= ob.bottom) ob.touched = true;
        if (cs[j].c > ob.top) { ob.broken = true; break; }
      }
    }
    out.push(ob);
  }
  // one block per origin candle
  const seen = new Set();
  return out.filter(o => { const k = `${o.dir}${o.i}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------- liquidity: equal highs and lows where stops collect, plus previous day and week extremes
export function liquidity(cs, atrV) {
  const a = atrV[cs.length - 1] || 0;
  const tol = a * 0.12;
  const piv = pivots(cs.slice(-250), 3, 3);
  const offset = Math.max(0, cs.length - 250);
  const out = [];
  for (const type of ['H', 'L']) {
    const list = piv.filter(p => p.type === type).map(p => ({ ...p, i: p.i + offset }));
    for (let x = 0; x < list.length; x++) {
      const group = [list[x]];
      for (let y = x + 1; y < list.length; y++) if (Math.abs(list[y].price - list[x].price) <= tol) group.push(list[y]);
      if (group.length >= 2) {
        const price = type === 'H' ? Math.max(...group.map(g => g.price)) : Math.min(...group.map(g => g.price));
        const lastG = group[group.length - 1];
        // swept when price later traded beyond it
        let swept = false;
        for (let j = lastG.i + 1; j < cs.length; j++) if (type === 'H' ? cs[j].h > price + tol : cs[j].l < price - tol) { swept = true; break; }
        out.push({ side: type === 'H' ? 'buy' : 'sell', kind: 'equal', price, count: group.length, t: group[0].t, i: group[0].i, swept });
      }
    }
  }
  // de-duplicate overlapping pools
  const uniq = [];
  for (const p of out.sort((q, r) => r.count - q.count)) if (!uniq.some(u => u.side === p.side && Math.abs(u.price - p.price) <= tol)) uniq.push(p);
  return uniq;
}

// ---------- supply and demand bases: a tight base followed by an explosive candle
export function supplyDemand(cs, atrV, { lookback = 300 } = {}) {
  const out = [];
  const lastI = cs.length - 1;
  for (let i = Math.max(5, cs.length - lookback); i < cs.length; i++) {
    const a = atrV[i] || atrV[lastI] || 0;
    if (!a) continue;
    const c = cs[i];
    const body = Math.abs(c.c - c.o);
    if (body < a * 1.6) continue;
    // base: 1 to 4 small candles right before the explosive candle
    let b = i - 1;
    let n = 0;
    while (b >= 0 && n < 4 && Math.abs(cs[b].c - cs[b].o) <= (cs[b].h - cs[b].l) * 0.5 + 1e-12 && (cs[b].h - cs[b].l) <= a * 1.2) { b--; n++; }
    if (!n) continue;
    const base = cs.slice(b + 1, i);
    const top = Math.max(...base.map(x => x.h));
    const bottom = Math.min(...base.map(x => x.l));
    const dir = c.c > c.o ? 'demand' : 'supply';
    let tested = false;
    let broken = false;
    for (let j = i + 1; j <= lastI; j++) {
      if (dir === 'demand') { if (cs[j].l <= top) tested = true; if (cs[j].c < bottom) { broken = true; break; } }
      else { if (cs[j].h >= bottom) tested = true; if (cs[j].c > top) { broken = true; break; } }
    }
    out.push({ dir, i: b + 1, t: cs[b + 1].t, top, bottom, fresh: !tested, broken });
  }
  return out.filter(z => !z.broken).slice(-12);
}

// ---------- dealing range: premium above the middle, discount below, OTE between 62% and 79%
export function dealingRange(swingHigh, swingLow, price, trendUp) {
  if (!swingHigh || !swingLow) return null;
  const hi = swingHigh.price;
  const lo = swingLow.price;
  const eq = (hi + lo) / 2;
  const span = hi - lo;
  const oteTop = trendUp ? hi - span * 0.62 : lo + span * 0.79;
  const oteBottom = trendUp ? hi - span * 0.79 : lo + span * 0.62;
  return { hi, lo, eq, zone: price > eq ? 'premium' : 'discount', position: span ? (price - lo) / span : 0.5, ote: { top: Math.max(oteTop, oteBottom), bottom: Math.min(oteTop, oteBottom) } };
}

// ---------- Fibonacci levels for a swing from `from` to `to`
export const FIB_RET = [0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 0.886];
export const FIB_EXT = [1.272, 1.414, 1.618, 2, 2.618];
export function fibonacci(from, to) {
  const span = to - from;
  return {
    from, to,
    retracements: FIB_RET.map(r => ({ r, price: to - span * r })),
    extensions: FIB_EXT.map(r => ({ r, price: from + span * r })),
  };
}

// Nearest item of a list of {price} to a price, above or below.
export const nearestAbove = (list, price) => list.filter(x => x.price > price).sort((a, b) => a.price - b.price)[0] || null;
export const nearestBelow = (list, price) => list.filter(x => x.price < price).sort((a, b) => b.price - a.price)[0] || null;
