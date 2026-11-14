// Harmonic patterns on zigzag swings (Gartley 1935, Pesavento and Gilmore, Scott Carney's
// Harmonic Trading volumes). Ratios: B against XA, C against AB, the CD leg against BC, and D
// against XA. The Cypher measures C against XA and D against XC; the Shark uses points 0-X-A-B-C.

export const HARMONICS = {
  gartley: { name: 'جارتلي', b: [0.585, 0.65], c: [0.382, 0.886], cd: [1.13, 1.618], d: [0.75, 0.82], ideal: { b: 0.618, d: 0.786 } },
  bat: { name: 'الخفاش', b: [0.382, 0.5], c: [0.382, 0.886], cd: [1.618, 2.618], d: [0.85, 0.92], ideal: { b: 0.45, d: 0.886 } },
  altBat: { name: 'الخفاش البديل', b: [0.3, 0.382], c: [0.382, 0.886], cd: [2.0, 3.618], d: [1.09, 1.17], ideal: { b: 0.35, d: 1.13 } },
  butterfly: { name: 'الفراشة', b: [0.75, 0.82], c: [0.382, 0.886], cd: [1.618, 2.618], d: [1.272, 1.618], ideal: { b: 0.786, d: 1.272 } },
  crab: { name: 'السرطان', b: [0.382, 0.618], c: [0.382, 0.886], cd: [2.24, 3.618], d: [1.56, 1.68], ideal: { b: 0.5, d: 1.618 } },
  deepCrab: { name: 'السرطان العميق', b: [0.85, 0.92], c: [0.382, 0.886], cd: [2.0, 3.618], d: [1.56, 1.68], ideal: { b: 0.886, d: 1.618 } },
};
export const HARMONIC_NAMES = { ...Object.fromEntries(Object.entries(HARMONICS).map(([k, v]) => [k, v.name])), cypher: 'السايفر', shark: 'القرش', abcd: 'AB=CD' };

const inR = (v, [lo, hi], slack = 0) => v >= lo * (1 - slack) && v <= hi * (1 + slack);
const closeness = (v, ideal) => Math.max(0, 1 - Math.abs(v - ideal) / ideal);

// Five swings X A B C D; bullish when X is a low (D is a buy zone), bearish when X is a high.
function testXabcd(X, A, B, C, D) {
  const xa = Math.abs(A.price - X.price);
  const ab = Math.abs(A.price - B.price);
  const bc = Math.abs(C.price - B.price);
  const cd = Math.abs(D.price - C.price);
  if (!xa || !ab || !bc) return [];
  const rb = ab / xa;
  const rc = bc / ab;
  const rcd = cd / bc;
  const rd = Math.abs(A.price - D.price) / xa;
  const found = [];
  for (const [key, h] of Object.entries(HARMONICS)) {
    if (inR(rb, h.b) && inR(rc, h.c) && inR(rcd, h.cd, 0.04) && inR(rd, h.d)) {
      const score = 0.5 + 0.25 * closeness(rb, h.ideal.b) + 0.25 * closeness(rd, h.ideal.d);
      found.push({ key, ratios: { b: rb, c: rc, cd: rcd, d: rd }, score });
    }
  }
  return found;
}

function testCypher(X, A, B, C, D) {
  const xa = Math.abs(A.price - X.price);
  const ab = Math.abs(A.price - B.price);
  if (!xa || !ab) return null;
  const rb = ab / xa;
  const xc = Math.abs(C.price - X.price);
  const rcx = xc / xa; // C beyond A: 1.13 to 1.414 of XA
  const rd = Math.abs(C.price - D.price) / xc; // D retraces 0.786 of XC
  const beyondA = X.type === 'L' ? C.price > A.price : C.price < A.price;
  if (beyondA && inR(rb, [0.382, 0.618]) && inR(rcx, [1.13, 1.414]) && inR(rd, [0.75, 0.82])) {
    return { key: 'cypher', ratios: { b: rb, c: rcx, d: rd }, score: 0.5 + 0.5 * closeness(rd, 0.786) };
  }
  return null;
}

// Shark on 0 X A B C: B extends 1.13-1.618 of XA beyond X, C retraces 0.886-1.13 of 0X, BC is 1.618-2.24 of AB.
function testShark(O, X, A, B, C) {
  const xa = Math.abs(A.price - X.price);
  const ox = Math.abs(X.price - O.price);
  const ab = Math.abs(B.price - A.price);
  if (!xa || !ox || !ab) return null;
  const rb = ab / xa;
  const rc = Math.abs(X.price - C.price) / ox;
  const rbc = Math.abs(C.price - B.price) / ab;
  if (inR(rb, [1.13, 1.618]) && inR(rc, [0.886, 1.13]) && inR(rbc, [1.618, 2.24], 0.04)) {
    return { key: 'shark', ratios: { b: rb, c: rc, bc: rbc }, score: 0.5 + 0.5 * closeness(rc, 0.886) };
  }
  return null;
}

function testAbcd(A, B, C, D) {
  const ab = Math.abs(B.price - A.price);
  const bc = Math.abs(C.price - B.price);
  const cd = Math.abs(D.price - C.price);
  if (!ab || !bc) return null;
  const rc = bc / ab;
  const rcd = cd / bc;
  const eq = cd / ab;
  if (inR(rc, [0.382, 0.886]) && inR(rcd, [1.13, 2.618]) && eq >= 0.85 && eq <= 1.18) {
    return { key: 'abcd', ratios: { c: rc, cd: rcd, eq }, score: 0.45 + 0.4 * closeness(eq, 1) + 0.15 * closeness(rc, 0.618) };
  }
  return null;
}

// Completed patterns whose D is one of the recent swings, plus the potential reversal zone
// (PRZ) for patterns still waiting for D.
export function harmonics(cs, zigs, atrV, { recent = 3 } = {}) {
  const out = [];
  const lastI = cs.length - 1;
  const a = atrV[lastI] || 0;
  for (const zz of zigs) {
    const n = zz.length;
    for (let end = n - 1; end >= Math.max(4, n - recent); end--) {
      const [X, A, B, C, D] = zz.slice(end - 4, end + 1);
      if (!D) continue;
      const bull = X.type === 'L';
      // the structure must alternate X low, A high, B low, C high, D low (or the mirror)
      if (bull ? !(A.type === 'H' && B.type === 'L' && C.type === 'H' && D.type === 'L') : !(A.type === 'L' && B.type === 'H' && C.type === 'L' && D.type === 'H')) continue;
      const pts = [X, A, B, C, D].map(q => ({ t: q.t, price: q.price, i: q.i }));
      const dir = bull ? 1 : -1;
      const cdLeg = Math.abs(D.price - C.price);
      const make = (f) => ({
        key: f.key, name: HARMONIC_NAMES[f.key], dir, points: pts, ratios: f.ratios, score: f.score,
        dIndex: D.i, provisional: !!D.open, endI: D.i,
        // targets: 38.2% and 61.8% of the CD leg back from D; stop beyond X or 1.13 of XA
        targets: [D.price + dir * cdLeg * 0.382, D.price + dir * cdLeg * 0.618],
        stop: f.key === 'gartley' || f.key === 'bat' || f.key === 'cypher' ? X.price - dir * a * 0.3 : D.price - dir * Math.max(a, cdLeg * 0.13),
        barsAgo: lastI - D.i,
      });
      for (const f of testXabcd(X, A, B, C, D)) out.push(make(f));
      const cy = testCypher(X, A, B, C, D);
      if (cy) out.push(make(cy));
      const sh = testShark(X, A, B, C, D);
      if (sh) out.push({ ...make(sh), points: pts });
      const ab = testAbcd(A, B, C, D);
      if (ab) out.push({ ...make(ab), points: pts.slice(1) });
    }
    // potential: X A B C confirmed and C is recent, D projected
    if (n >= 4) {
      const [X, A, B, C] = zz.slice(-4);
      const bull = X.type === 'L';
      if (bull ? A.type === 'H' && B.type === 'L' && C.type === 'H' : A.type === 'L' && B.type === 'H' && C.type === 'L') {
        const xa = Math.abs(A.price - X.price);
        const ab = Math.abs(A.price - B.price);
        const bc = Math.abs(C.price - B.price);
        const rb = xa ? ab / xa : 0;
        const rc = ab ? bc / ab : 0;
        const dir = bull ? 1 : -1;
        for (const [key, h] of Object.entries(HARMONICS)) {
          if (!inR(rb, h.b) || !inR(rc, h.c)) continue;
          const dXA = A.price - dir * xa * h.ideal.d;
          const dBC1 = C.price - dir * bc * h.cd[0];
          const dBC2 = C.price - dir * bc * h.cd[1];
          const lo = Math.min(dXA, dBC1);
          const hi = Math.max(dXA, dBC1);
          // only useful when the zone is ahead of price
          const price = cs[lastI].c;
          const ahead = bull ? price > hi - a * 0.2 : price < lo + a * 0.2;
          if (!ahead) continue;
          out.push({ key, name: HARMONICS[key].name, dir, potential: true, prz: { top: hi, bottom: lo, far: dBC2 }, points: [X, A, B, C].map(q => ({ t: q.t, price: q.price, i: q.i })), ratios: { b: rb, c: rc }, score: 0.4, endI: C.i, barsAgo: lastI - C.i });
        }
      }
    }
  }
  // keep the best match per D point
  const best = new Map();
  for (const h of out) {
    const k = `${h.potential ? 'p' : 'c'}${h.endI}${h.key}`;
    if (!best.has(k) || best.get(k).score < h.score) best.set(k, h);
  }
  return [...best.values()].sort((x, y) => (x.potential ? 1 : 0) - (y.potential ? 1 : 0) || x.barsAgo - y.barsAgo || y.score - x.score);
}
