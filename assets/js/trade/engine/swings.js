// Swings: the turning points every school builds on.
// pivots()   fractal highs and lows confirmed by `right` bars after them.
// zigzag()   alternating swing points whose size beats a threshold in ATR, the base for
//            classical patterns, harmonics and Elliott counts.
// structure() labels each swing HH, HL, LH or LL (Dow theory) and reads the trend.
// breaks()   the smart-money reading: break of structure (BOS) and change of character (CHoCH).
import { atr } from './indicators.js';

export function pivots(cs, left = 3, right = 3) {
  const out = [];
  for (let i = left; i < cs.length - right; i++) {
    let isH = true;
    let isL = true;
    for (let k = i - left; k <= i + right; k++) {
      if (k === i) continue;
      if (k < i ? cs[k].h >= cs[i].h : cs[k].h > cs[i].h) isH = false;
      if (k < i ? cs[k].l <= cs[i].l : cs[k].l < cs[i].l) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) out.push({ i, t: cs[i].t, price: cs[i].h, type: 'H', right });
    if (isL) out.push({ i, t: cs[i].t, price: cs[i].l, type: 'L', right });
  }
  return out;
}

// Alternating swings. A swing ends when price reverses by at least `mult` x ATR (or `pct` of price,
// whichever is larger). The last point is provisional: it can still extend.
export function zigzag(cs, { mult = 2.5, pct = 0, atrLen = 14, atrValues = null } = {}) {
  if (cs.length < 3) return [];
  const a = atrValues || atr(cs, atrLen);
  const firstAtr = a.find(x => x) || 0;
  const thr = i => Math.max((a[i] || firstAtr) * mult, cs[i].c * pct);
  // the first meaningful move decides the starting direction
  let hiI = 0;
  let loI = 0;
  let found = false;
  for (let i = 1; i < cs.length; i++) {
    if (cs[i].h > cs[hiI].h) hiI = i;
    if (cs[i].l < cs[loI].l) loI = i;
    if (cs[hiI].h - cs[loI].l >= thr(i)) { found = true; break; }
  }
  if (!found) return [];
  const pts = [];
  let dir;
  let extI;
  if (hiI > loI) { pts.push({ i: loI, t: cs[loI].t, price: cs[loI].l, type: 'L' }); dir = 1; extI = hiI; }
  else { pts.push({ i: hiI, t: cs[hiI].t, price: cs[hiI].h, type: 'H' }); dir = -1; extI = loI; }
  for (let j = extI + 1; j < cs.length; j++) {
    if (dir === 1) {
      if (cs[j].h >= cs[extI].h) extI = j;
      else if (cs[extI].h - cs[j].l >= thr(j)) {
        pts.push({ i: extI, t: cs[extI].t, price: cs[extI].h, type: 'H' });
        dir = -1; extI = j;
      }
    } else if (cs[j].l <= cs[extI].l) extI = j;
    else if (cs[j].h - cs[extI].l >= thr(j)) {
      pts.push({ i: extI, t: cs[extI].t, price: cs[extI].l, type: 'L' });
      dir = 1; extI = j;
    }
  }
  // the running extreme is the provisional last swing
  if (dir === 1) pts.push({ i: extI, t: cs[extI].t, price: cs[extI].h, type: 'H', open: true });
  else pts.push({ i: extI, t: cs[extI].t, price: cs[extI].l, type: 'L', open: true });
  return dedupe(pts);
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && prev.i === p.i && prev.type === p.type) { out[out.length - 1] = p; continue; }
    if (prev && prev.type === p.type) {
      // two highs in a row: keep the more extreme one
      if ((p.type === 'H' && p.price >= prev.price) || (p.type === 'L' && p.price <= prev.price)) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

// Dow theory labels: each high against the previous high, each low against the previous low.
export function structure(points, tol = 0) {
  let lastH = null;
  let lastL = null;
  const labeled = points.map(p => {
    let label = p.type === 'H' ? 'H' : 'L';
    if (p.type === 'H') {
      if (lastH) label = p.price > lastH.price + tol ? 'HH' : p.price < lastH.price - tol ? 'LH' : 'EH';
      lastH = p;
    } else {
      if (lastL) label = p.price > lastL.price + tol ? 'HL' : p.price < lastL.price - tol ? 'LL' : 'EL';
      lastL = p;
    }
    return { ...p, label };
  });
  const confirmed = labeled.filter(p => !p.open);
  const hs = confirmed.filter(p => p.type === 'H').slice(-2);
  const ls = confirmed.filter(p => p.type === 'L').slice(-2);
  let trend = 'range';
  if (hs.length === 2 && ls.length === 2) {
    const upH = hs[1].price > hs[0].price + tol;
    const upL = ls[1].price > ls[0].price + tol;
    const dnH = hs[1].price < hs[0].price - tol;
    const dnL = ls[1].price < ls[0].price - tol;
    if (upH && upL) trend = 'up';
    else if (dnH && dnL) trend = 'down';
    else if (upL && !dnH) trend = 'up-weak';
    else if (dnH && !upL) trend = 'down-weak';
  }
  return { points: labeled, trend };
}

// Break of structure and change of character on closing prices. Swing points come from
// fractal pivots (internal structure uses a small window, swing structure a larger one).
export function breaks(cs, piv) {
  const events = [];
  let trend = 0;
  let lastHigh = null;
  let lastLow = null;
  let pi = 0;
  const sorted = [...piv].sort((a, b) => a.i - b.i);
  const confirmAt = p => p.i + (p.right || 3);
  for (let i = 0; i < cs.length; i++) {
    while (pi < sorted.length && confirmAt(sorted[pi]) <= i) {
      const p = sorted[pi++];
      if (p.type === 'H') lastHigh = { ...p, used: false };
      else lastLow = { ...p, used: false };
    }
    const c = cs[i].c;
    if (lastHigh && !lastHigh.used && c > lastHigh.price) {
      events.push({ i, t: cs[i].t, type: trend === -1 ? 'CHoCH' : 'BOS', dir: 'up', level: lastHigh.price, from: lastHigh });
      lastHigh.used = true;
      trend = 1;
    }
    if (lastLow && !lastLow.used && c < lastLow.price) {
      events.push({ i, t: cs[i].t, type: trend === 1 ? 'CHoCH' : 'BOS', dir: 'down', level: lastLow.price, from: lastLow });
      lastLow.used = true;
      trend = -1;
    }
  }
  return { events, trend: trend === 1 ? 'up' : trend === -1 ? 'down' : 'none', lastHigh, lastLow };
}

// Size of each zigzag leg, for patterns that compare legs.
export const legs = pts => pts.slice(1).map((p, k) => ({ from: pts[k], to: p, size: Math.abs(p.price - pts[k].price), bars: p.i - pts[k].i }));
