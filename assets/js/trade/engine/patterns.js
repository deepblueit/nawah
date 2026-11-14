// Classical chart patterns (Edwards and Magee, Bulkowski) found on zigzag swings.
// Each pattern reports its geometry for the chart, its status (forming, confirmed by a close
// beyond the trigger, or failed), the measured-move target and the invalidation level.

const lineAt = (l, i) => l.p1 + ((l.p2 - l.p1) * (i - l.i1)) / ((l.i2 - l.i1) || 1);
const slopeOf = l => (l.p2 - l.p1) / ((l.i2 - l.i1) || 1);

function fitLine(pts) {
  // least squares through swing points (index, price)
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.i, 0) / n;
  const my = pts.reduce((s, p) => s + p.price, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) { num += (p.i - mx) * (p.price - my); den += (p.i - mx) ** 2; }
  const m = den ? num / den : 0;
  const b = my - m * mx;
  const i1 = pts[0].i;
  const i2 = pts[n - 1].i;
  const maxRes = Math.max(...pts.map(p => Math.abs(p.price - (m * p.i + b))));
  return { i1, i2, p1: m * i1 + b, p2: m * i2 + b, m, maxRes, t1: pts[0].t, t2: pts[n - 1].t };
}

const NAMES = {
  doubleTop: 'القمة المزدوجة', doubleBottom: 'القاع المزدوج', tripleTop: 'القمة الثلاثية', tripleBottom: 'القاع الثلاثي',
  headShoulders: 'الرأس والكتفين', inverseHeadShoulders: 'الرأس والكتفين المقلوب',
  ascTriangle: 'المثلث الصاعد', descTriangle: 'المثلث الهابط', symTriangle: 'المثلث المتماثل',
  risingWedge: 'الوتد الصاعد', fallingWedge: 'الوتد الهابط', rectangle: 'المستطيل',
  channelUp: 'القناة الصاعدة', channelDown: 'القناة الهابطة', broadening: 'النموذج المتسع',
  bullFlag: 'العلم الصاعد', bearFlag: 'العلم الهابط', bullPennant: 'الراية الصاعدة', bearPennant: 'الراية الهابطة',
  cupHandle: 'الكوب والعروة',
};
export const PATTERN_NAMES = NAMES;
// names that take feminine agreement in Arabic (القمة، القناة، الراية)
export const PATTERN_FEM = new Set(['doubleTop', 'tripleTop', 'channelUp', 'channelDown', 'bullPennant', 'bearPennant']);

function status(cs, fromI, triggerAt, dir, invalid) {
  // confirmed when a close passes the trigger after the pattern; failed when price closes past invalidation
  let st = 'forming';
  let at = null;
  for (let j = fromI + 1; j < cs.length; j++) {
    const trig = typeof triggerAt === 'function' ? triggerAt(j) : triggerAt;
    if (st === 'forming' && (dir === 1 ? cs[j].c > trig : cs[j].c < trig)) { st = 'confirmed'; at = j; }
    if (dir === 1 ? cs[j].c < invalid : cs[j].c > invalid) { st = st === 'confirmed' ? 'failed' : 'failed'; at = j; break; }
  }
  return { status: st, at };
}

export function chartPatterns(cs, zz, atrV, { maxAgeBars = 120 } = {}) {
  const out = [];
  if (zz.length < 4) return out;
  const lastI = cs.length - 1;
  const A = i => atrV[i] || atrV[lastI] || 0;
  const pts = zz;
  const add = p => { if (lastI - p.endI <= maxAgeBars || p.status === 'forming') out.push({ name: NAMES[p.key], fem: PATTERN_FEM.has(p.key), ...p }); };

  // ---------- double / triple tops and bottoms, head and shoulders (on the latest swings)
  for (let k = pts.length - 1; k >= 3 && k >= pts.length - 4; k--) {
    const p = pts.slice(Math.max(0, k - 5), k + 1);
    const n = p.length;
    if (n >= 4) {
      const [pre, x1, y, x2] = p.slice(-4);
      const tol = A(x2.i) * 0.6;
      if (x1.type === 'H' && x2.type === 'H' && y.type === 'L' && pre.type === 'L') {
        const depth = Math.min(x1.price, x2.price) - y.price;
        if (Math.abs(x1.price - x2.price) <= tol && depth >= A(y.i) * 1.5 && x2.i - x1.i >= 5 && x1.price - pre.price >= depth * 0.8) {
          const top = Math.max(x1.price, x2.price);
          const neck = y.price;
          const st = status(cs, x2.i, neck, -1, top + tol * 0.5);
          add({ key: 'doubleTop', dir: -1, ...st, startI: x1.i, endI: x2.i, points: [x1, y, x2].map(q => ({ t: q.t, price: q.price })), neckline: neck, target: neck - (top - neck), invalid: top + tol * 0.5, conf: 0.55 + (st.status === 'confirmed' ? 0.2 : 0) });
        }
      }
      if (x1.type === 'L' && x2.type === 'L' && y.type === 'H' && pre.type === 'H') {
        const height = y.price - Math.max(x1.price, x2.price);
        if (Math.abs(x1.price - x2.price) <= tol && height >= A(y.i) * 1.5 && x2.i - x1.i >= 5 && pre.price - x1.price >= height * 0.8) {
          const bottom = Math.min(x1.price, x2.price);
          const neck = y.price;
          const st = status(cs, x2.i, neck, 1, bottom - tol * 0.5);
          add({ key: 'doubleBottom', dir: 1, ...st, startI: x1.i, endI: x2.i, points: [x1, y, x2].map(q => ({ t: q.t, price: q.price })), neckline: neck, target: neck + (neck - bottom), invalid: bottom - tol * 0.5, conf: 0.55 + (st.status === 'confirmed' ? 0.2 : 0) });
        }
      }
    }
    if (n >= 6) {
      const [pre, s1, n1, h, n2, s2] = p.slice(-6);
      const tol = A(h.i) * 0.8;
      // head and shoulders top: shoulders lower than the head, roughly level with each other
      if (s1.type === 'H' && h.type === 'H' && s2.type === 'H' && pre.type === 'L') {
        const okHead = h.price > s1.price + tol * 0.5 && h.price > s2.price + tol * 0.5;
        const okShoulders = Math.abs(s1.price - s2.price) <= Math.max(tol * 1.5, (h.price - Math.min(n1.price, n2.price)) * 0.35);
        const okTrend = s1.price - pre.price >= (h.price - n1.price) * 0.5;
        if (okHead && okShoulders && okTrend) {
          const neck = { i1: n1.i, p1: n1.price, i2: n2.i, p2: n2.price };
          const headH = h.price - lineAt(neck, h.i);
          const st = status(cs, s2.i, j => lineAt(neck, j), -1, s2.price + tol * 0.25);
          const neckNow = lineAt(neck, st.at ?? lastI);
          add({ key: 'headShoulders', dir: -1, ...st, startI: s1.i, endI: s2.i, points: [s1, n1, h, n2, s2].map(q => ({ t: q.t, price: q.price })), lines: [{ t1: n1.t, p1: n1.price, t2: cs[lastI].t, p2: lineAt(neck, lastI) }], neckline: neckNow, target: neckNow - headH, invalid: s2.price + tol * 0.25, conf: 0.6 + (st.status === 'confirmed' ? 0.2 : 0) });
        }
      }
      if (s1.type === 'L' && h.type === 'L' && s2.type === 'L' && pre.type === 'H') {
        const okHead = h.price < s1.price - tol * 0.5 && h.price < s2.price - tol * 0.5;
        const okShoulders = Math.abs(s1.price - s2.price) <= Math.max(tol * 1.5, (Math.max(n1.price, n2.price) - h.price) * 0.35);
        const okTrend = pre.price - s1.price >= (n1.price - h.price) * 0.5;
        if (okHead && okShoulders && okTrend) {
          const neck = { i1: n1.i, p1: n1.price, i2: n2.i, p2: n2.price };
          const headH = lineAt(neck, h.i) - h.price;
          const st = status(cs, s2.i, j => lineAt(neck, j), 1, s2.price - tol * 0.25);
          const neckNow = lineAt(neck, st.at ?? lastI);
          add({ key: 'inverseHeadShoulders', dir: 1, ...st, startI: s1.i, endI: s2.i, points: [s1, n1, h, n2, s2].map(q => ({ t: q.t, price: q.price })), lines: [{ t1: n1.t, p1: n1.price, t2: cs[lastI].t, p2: lineAt(neck, lastI) }], neckline: neckNow, target: neckNow + headH, invalid: s2.price - tol * 0.25, conf: 0.6 + (st.status === 'confirmed' ? 0.2 : 0) });
        }
      }
      // triple top and bottom
      const [, a1, b1, a2, b2, a3] = p.slice(-6);
      const t3 = A(a3.i) * 0.7;
      if (a1.type === 'H' && a2.type === 'H' && a3.type === 'H' && Math.max(a1.price, a2.price, a3.price) - Math.min(a1.price, a2.price, a3.price) <= t3) {
        const neck = Math.min(b1.price, b2.price);
        const top = Math.max(a1.price, a2.price, a3.price);
        if (top - neck >= A(a3.i) * 1.5) {
          const st = status(cs, a3.i, neck, -1, top + t3 * 0.4);
          add({ key: 'tripleTop', dir: -1, ...st, startI: a1.i, endI: a3.i, points: [a1, b1, a2, b2, a3].map(q => ({ t: q.t, price: q.price })), neckline: neck, target: neck - (top - neck), invalid: top + t3 * 0.4, conf: 0.6 });
        }
      }
      if (a1.type === 'L' && a2.type === 'L' && a3.type === 'L' && Math.max(a1.price, a2.price, a3.price) - Math.min(a1.price, a2.price, a3.price) <= t3) {
        const neck = Math.max(b1.price, b2.price);
        const bottom = Math.min(a1.price, a2.price, a3.price);
        if (neck - bottom >= A(a3.i) * 1.5) {
          const st = status(cs, a3.i, neck, 1, bottom - t3 * 0.4);
          add({ key: 'tripleBottom', dir: 1, ...st, startI: a1.i, endI: a3.i, points: [a1, b1, a2, b2, a3].map(q => ({ t: q.t, price: q.price })), neckline: neck, target: neck + (neck - bottom), invalid: bottom - t3 * 0.4, conf: 0.6 });
        }
      }
    }
  }

  // ---------- converging and parallel structures from the last 5 to 7 swings
  for (const n of [7, 6, 5]) {
    if (pts.length < n) continue;
    const seg = pts.slice(-n - 1, -1).length >= n ? pts.slice(-n - 1, -1) : pts.slice(-n);
    const hs = seg.filter(q => q.type === 'H');
    const ls = seg.filter(q => q.type === 'L');
    if (hs.length < 2 || ls.length < 2) continue;
    const up = fitLine(hs);
    const dn = fitLine(ls);
    const startI = seg[0].i;
    const endI = seg[seg.length - 1].i;
    const a = A(endI);
    if (!a || endI - startI < 15) continue;
    const height0 = lineAt(up, startI) - lineAt(dn, startI);
    const height1 = lineAt(up, endI) - lineAt(dn, endI);
    if (height0 <= 0 || height1 <= 0) continue;
    const fitTol = Math.max(a * 0.6, Math.max(height0, height1) * 0.18);
    if (up.maxRes > fitTol || dn.maxRes > fitTol) continue;
    const su = up.m / a;
    const sd = dn.m / a;
    const flat = 0.012;
    let key = null;
    const converging = height1 < height0 * 0.8;
    const parallel = Math.abs(height1 - height0) <= height0 * 0.2;
    if (converging && Math.abs(su) <= flat && sd > flat) key = 'ascTriangle';
    else if (converging && Math.abs(sd) <= flat && su < -flat) key = 'descTriangle';
    else if (converging && su < -flat && sd > flat) key = 'symTriangle';
    else if (converging && su > flat && sd > su) key = 'risingWedge';
    else if (converging && sd < -flat && su < sd) key = 'fallingWedge';
    else if (parallel && Math.abs(su) <= flat && Math.abs(sd) <= flat) key = 'rectangle';
    else if (parallel && su > flat && sd > flat) key = 'channelUp';
    else if (parallel && su < -flat && sd < -flat) key = 'channelDown';
    else if (height1 > height0 * 1.25 && su > flat && sd < -flat) key = 'broadening';
    if (!key) continue;
    const dirOf = { ascTriangle: 1, descTriangle: -1, symTriangle: 0, risingWedge: -1, fallingWedge: 1, rectangle: 0, channelUp: 1, channelDown: -1, broadening: 0 };
    // breakout: the first close outside either line after the structure
    let breakDir = 0;
    let breakI = null;
    for (let j = endI + 1; j <= lastI; j++) {
      if (cs[j].c > lineAt(up, j) + a * 0.1) { breakDir = 1; breakI = j; break; }
      if (cs[j].c < lineAt(dn, j) - a * 0.1) { breakDir = -1; breakI = j; break; }
    }
    const expected = dirOf[key];
    const height = Math.max(height0, height1);
    const bp = breakI != null ? cs[breakI].c : null;
    let target = null;
    if (breakDir) target = key.includes('Wedge') ? (breakDir === 1 ? Math.max(...hs.map(h => h.price)) : Math.min(...ls.map(l => l.price))) : bp + breakDir * height;
    const st = breakDir === 0 ? 'forming' : expected === 0 || breakDir === expected ? 'confirmed' : 'failed';
    add({
      key, dir: breakDir || expected, expected, status: st, at: breakI, startI, endI,
      points: seg.map(q => ({ t: q.t, price: q.price })),
      lines: [
        { t1: up.t1, p1: lineAt(up, up.i1), t2: cs[lastI].t, p2: lineAt(up, lastI) },
        { t1: dn.t1, p1: lineAt(dn, dn.i1), t2: cs[lastI].t, p2: lineAt(dn, lastI) },
      ],
      upper: lineAt(up, lastI), lower: lineAt(dn, lastI), target,
      invalid: breakDir === 1 ? lineAt(dn, lastI) : breakDir === -1 ? lineAt(up, lastI) : null,
      conf: 0.5 + Math.min(0.2, (hs.length + ls.length - 4) * 0.05) + (st === 'confirmed' ? 0.15 : 0),
    });
    break; // keep the widest fitting structure only
  }

  // ---------- flags and pennants: a sharp pole, then a short shallow pause against it
  if (pts.length >= 4) {
    for (let k = pts.length - 3; k >= Math.max(1, pts.length - 4); k--) {
      const p0 = pts[k - 1];
      const p1 = pts[k];
      const pole = p1.price - p0.price;
      const bars = p1.i - p0.i;
      const a = A(p1.i);
      if (!a || Math.abs(pole) < a * 3 || bars > 15 || bars < 2) continue;
      const after = pts.slice(k + 1);
      const pause = cs.slice(p1.i + 1);
      if (pause.length < 3 || pause.length > Math.max(6, bars * 3)) continue;
      const dir = pole > 0 ? 1 : -1;
      const retr = dir === 1 ? (p1.price - Math.min(...pause.map(c => c.l))) / pole : (Math.max(...pause.map(c => c.h)) - p1.price) / -pole;
      if (retr > 0.5 || retr < 0.05) continue;
      const hi = Math.max(p1.price, ...pause.map(c => c.h));
      const lo = Math.min(p1.price, ...pause.map(c => c.l));
      const firstHalf = pause.slice(0, Math.ceil(pause.length / 2));
      const secondHalf = pause.slice(Math.ceil(pause.length / 2));
      const rangeA = Math.max(...firstHalf.map(c => c.h)) - Math.min(...firstHalf.map(c => c.l));
      const rangeB = secondHalf.length ? Math.max(...secondHalf.map(c => c.h)) - Math.min(...secondHalf.map(c => c.l)) : rangeA;
      const pennant = rangeB < rangeA * 0.7;
      const key = dir === 1 ? (pennant ? 'bullPennant' : 'bullFlag') : pennant ? 'bearPennant' : 'bearFlag';
      const trigger = dir === 1 ? hi : lo;
      let st = 'forming';
      let at = null;
      for (let j = p1.i + 1; j <= lastI; j++) {
        if (dir === 1 ? cs[j].c > trigger : cs[j].c < trigger) { st = 'confirmed'; at = j; break; }
        if (dir === 1 ? cs[j].c < p1.price - pole * 0.62 : cs[j].c > p1.price - pole * 0.62) { st = 'failed'; at = j; break; }
      }
      add({ key, dir, status: st, at, startI: p0.i, endI: lastI, points: [p0, p1].map(q => ({ t: q.t, price: q.price })), lines: [{ t1: cs[p1.i].t, p1: hi, t2: cs[lastI].t, p2: hi }, { t1: cs[p1.i].t, p1: lo, t2: cs[lastI].t, p2: lo }], trigger, target: trigger + pole, invalid: p1.price - pole * 0.62, conf: 0.55 + (after.length <= 2 ? 0.05 : 0) + (st === 'confirmed' ? 0.15 : 0) });
      break;
    }
  }

  // ---------- cup and handle: rounded base between two similar rims, then a shallow handle
  if (pts.length >= 4) {
    const [r1, bottom, r2] = pts.slice(-4, -1);
    if (r1.type === 'H' && bottom.type === 'L' && r2.type === 'H') {
      const a = A(r2.i);
      const depth = Math.min(r1.price, r2.price) - bottom.price;
      const dur = r2.i - r1.i;
      if (a && depth >= a * 3 && dur >= 20 && Math.abs(r1.price - r2.price) <= Math.max(a, depth * 0.12)) {
        // U shape: the lowest third of the cup lasts a good part of its width
        const floor = bottom.price + depth / 3;
        const lowBars = cs.slice(r1.i, r2.i + 1).filter(c => c.l <= floor).length;
        const handle = cs.slice(r2.i + 1);
        const handleLow = handle.length ? Math.min(...handle.map(c => c.l)) : r2.price;
        const handleOk = r2.price - handleLow <= depth * 0.5;
        if (lowBars >= dur * 0.25 && handleOk) {
          const rim = Math.max(r1.price, r2.price);
          const st = status(cs, r2.i, rim, 1, handleLow - a * 0.3);
          add({ key: 'cupHandle', dir: 1, ...st, startI: r1.i, endI: r2.i, points: [r1, bottom, r2].map(q => ({ t: q.t, price: q.price })), neckline: rim, target: rim + depth, invalid: handleLow - a * 0.3, conf: 0.55 + (st.status === 'confirmed' ? 0.2 : 0) });
        }
      }
    }
  }

  // newest first, then by confidence
  return out.sort((x, y) => y.endI - x.endI || y.conf - x.conf);
}
