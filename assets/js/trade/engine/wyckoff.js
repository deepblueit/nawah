// Wyckoff: trading ranges after a trend, and the events that end them. A spring is a break below
// the range that closes back inside; an upthrust is the mirror at the top. A sign of strength
// (or weakness) is a decisive close out of the range. Volume confirms when the feed has real
// volume; forex feeds usually carry tick volume or none, so volume is treated as a bonus only.
import { sma } from './indicators.js';

export function wyckoff(cs, atrV, { minBars = 30, maxBars = 160 } = {}) {
  const out = { range: null, events: [] };
  const lastI = cs.length - 1;
  if (cs.length < minBars + 20) return out;
  const a = atrV[lastI] || 0;
  if (!a) return out;
  const vols = cs.map(c => c.v || 0);
  const hasVol = vols.slice(-50).some(v => v > 0);
  const avgV = sma(vols, 20);

  // the longest recent window that stays inside a band of at most 8 ATR, ignoring short pokes
  let best = null;
  for (let len = maxBars; len >= minBars; len -= 5) {
    const startI = lastI - len;
    if (startI < 10) continue;
    const win = cs.slice(startI, lastI + 1);
    const closesW = win.map(c => c.c).sort((x, y) => x - y);
    const hi = closesW[Math.floor(closesW.length * 0.95)];
    const lo = closesW[Math.floor(closesW.length * 0.05)];
    if (hi - lo > a * 8 || hi - lo < a * 2) continue;
    best = { startI, endI: lastI, top: hi, bottom: lo };
    break;
  }
  if (!best) return out;
  // prior trend into the range decides accumulation or distribution
  const before = cs.slice(Math.max(0, best.startI - 60), best.startI + 1);
  const move = before.length > 5 ? before[before.length - 1].c - before[0].c : 0;
  const kind = move < -a * 3 ? 'accumulation' : move > a * 3 ? 'distribution' : 'range';
  out.range = { ...best, kind, height: best.top - best.bottom };

  const tol = a * 0.2;
  for (let i = best.startI + 5; i <= lastI; i++) {
    const c = cs[i];
    const volUp = hasVol && avgV[i] ? c.v > avgV[i] * 1.5 : null;
    // spring: trades below the range, closes back inside within the same or next bar
    if (c.l < best.bottom - tol) {
      const back = c.c > best.bottom || (cs[i + 1] && cs[i + 1].c > best.bottom);
      if (back) out.events.push({ key: 'spring', name: 'سبرنج (كسر كاذب للقاع)', i, t: c.t, price: c.l, bias: 1, vol: volUp });
    }
    if (c.h > best.top + tol) {
      const back = c.c < best.top || (cs[i + 1] && cs[i + 1].c < best.top);
      if (back) out.events.push({ key: 'upthrust', name: 'أبثرست (كسر كاذب للقمة)', i, t: c.t, price: c.h, bias: -1, vol: volUp });
    }
    // decisive closes out of the range
    if (c.c > best.top + a * 0.5 && cs[i - 1].c <= best.top + a * 0.5) out.events.push({ key: 'sos', name: 'علامة قوة: إغلاق فوق النطاق', i, t: c.t, price: c.c, bias: 1, vol: volUp });
    if (c.c < best.bottom - a * 0.5 && cs[i - 1].c >= best.bottom - a * 0.5) out.events.push({ key: 'sow', name: 'علامة ضعف: إغلاق تحت النطاق', i, t: c.t, price: c.c, bias: -1, vol: volUp });
  }
  // only the latest event of each kind matters
  const latest = new Map();
  for (const e of out.events) latest.set(e.key, e);
  out.events = [...latest.values()].sort((x, y) => x.i - y.i);
  out.hasVolume = hasVol;
  return out;
}
