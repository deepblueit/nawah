// Elliott wave candidates (Frost and Prechter's rules). Automatic counting is subjective, so the
// engine only proposes counts that pass the three hard rules and scores them with the guidelines.
// Hard rules for an impulse: wave 2 never retraces beyond the start of wave 1, wave 3 is never the
// shortest of 1, 3 and 5, and wave 4 does not enter the price territory of wave 1.

const len = (a, b) => Math.abs(b.price - a.price);
const near = (v, target, tol) => Math.abs(v - target) <= tol;

export function elliott(cs, zz) {
  const out = [];
  const n = zz.length;
  if (n < 4) return out;
  const lastI = cs.length - 1;
  const price = cs[lastI].c;

  // complete impulse on the last six swings: 0 1 2 3 4 5
  for (let end = n - 1; end >= Math.max(5, n - 2); end--) {
    const w = zz.slice(end - 5, end + 1);
    if (w.length < 6) continue;
    const up = w[0].type === 'L';
    const s = up ? 1 : -1;
    const [p0, p1, p2, p3, p4, p5] = w;
    const L1 = len(p0, p1);
    const L3 = len(p2, p3);
    const L5 = len(p4, p5);
    const rule1 = s * (p2.price - p0.price) > 0;
    const rule2 = !(L3 < L1 && L3 < L5);
    const rule3 = s * (p4.price - p1.price) > 0;
    const progress = s * (p3.price - p1.price) > 0 && s * (p5.price - p3.price) > -L3 * 0.05;
    if (!(rule1 && rule2 && rule3 && progress)) continue;
    let score = 0.45;
    const notes = [];
    const r2 = len(p1, p2) / L1;
    const r4 = len(p3, p4) / L3;
    if (r2 >= 0.5 && r2 <= 0.786) { score += 0.1; notes.push('الموجة الثانية تصحح بين 50 و78.6 بالمئة من الأولى'); }
    if (r4 >= 0.236 && r4 <= 0.5) { score += 0.1; notes.push('الموجة الرابعة تصحح بين 23.6 و50 بالمئة من الثالثة'); }
    if (near(L3 / L1, 1.618, 0.35) || L3 / L1 > 1.618) { score += 0.1; notes.push('الموجة الثالثة ممتدة قرب 1.618 من الأولى أو أكثر'); }
    if (near(L5 / L1, 1, 0.25) || near(L5 / L1, 0.618, 0.15)) { score += 0.05; notes.push('الموجة الخامسة تقارب طول الأولى أو 0.618 منها'); }
    if (Math.abs(r2 - r4) > 0.2) { score += 0.05; notes.push('تناوب بين عمق الموجتين الثانية والرابعة'); }
    out.push({
      kind: 'impulse', dir: s, complete: !p5.open, labels: ['0', '1', '2', '3', '4', '5'], points: w.map(p => ({ t: p.t, price: p.price, i: p.i })),
      score: Math.min(0.9, score), notes,
      // after a finished impulse a correction is expected; the 38.2% and 50% retracements of 0-5 are the usual targets
      next: { dir: -s, targets: [p5.price - s * len(p0, p5) * 0.382, p5.price - s * len(p0, p5) * 0.5], invalid: p5.price + s * L5 * 0.1 },
      endI: p5.i,
    });
    break;
  }

  // impulse in progress: 0 1 2 3 4 confirmed, wave 5 forming
  if (n >= 5) {
    const w = zz.slice(-5);
    const up = w[0].type === 'L';
    const s = up ? 1 : -1;
    const [p0, p1, p2, p3, p4] = w;
    const L1 = len(p0, p1);
    const L3 = len(p2, p3);
    const ok = s * (p2.price - p0.price) > 0 && s * (p3.price - p1.price) > 0 && s * (p4.price - p1.price) > 0 && L3 > L1 * 0.9;
    if (ok && s * (price - p4.price) >= 0) {
      const t1 = p4.price + s * L1;
      const t2 = p4.price + s * len(p0, p3) * 0.618;
      out.push({
        kind: 'wave5', dir: s, complete: false, labels: ['0', '1', '2', '3', '4'], points: w.map(p => ({ t: p.t, price: p.price, i: p.i })),
        score: 0.5, notes: ['الموجات من الأولى إلى الرابعة تحقق القواعد، والخامسة قيد التكوين'],
        next: { dir: s, targets: [t1, t2].sort((a, b) => s * (a - b)), invalid: p1.price }, endI: p4.i,
      });
    }
  }

  // wave 3 setup: 0 1 2 with wave 2 retracing 50-78.6% of wave 1
  if (n >= 3) {
    const w = zz.slice(-3);
    const up = w[0].type === 'L';
    const s = up ? 1 : -1;
    const [p0, p1, p2] = w;
    const L1 = len(p0, p1);
    const r2 = len(p1, p2) / (L1 || 1);
    if (L1 && s * (p2.price - p0.price) > 0 && r2 >= 0.382 && r2 <= 0.886) {
      out.push({
        kind: 'wave3', dir: s, complete: false, labels: ['0', '1', '2'], points: w.map(p => ({ t: p.t, price: p.price, i: p.i })),
        score: r2 >= 0.5 && r2 <= 0.786 ? 0.5 : 0.4, notes: [`الموجة الثانية صححت ${Math.round(r2 * 100)} بالمئة من الأولى ولم تكسر بدايتها`],
        next: { dir: s, targets: [p2.price + s * L1 * 1.618, p2.price + s * L1 * 2.618], invalid: p0.price }, endI: p2.i,
      });
    }
  }

  // ABC zigzag correction against the prior move
  if (n >= 4) {
    const [pre, A, B, C] = zz.slice(-4);
    const s = A.type === 'L' ? -1 : 1; // direction of wave A
    const La = len(pre, A);
    const Lb = len(A, B);
    const Lc = len(B, C);
    const rb = Lb / (La || 1);
    if (La && rb >= 0.382 && rb <= 0.886 && (near(Lc / La, 1, 0.25) || near(Lc / La, 1.618, 0.3)) && s * (C.price - A.price) > 0) {
      out.push({
        kind: 'abc', dir: s, complete: !C.open, labels: ['', 'A', 'B', 'C'], points: [pre, A, B, C].map(p => ({ t: p.t, price: p.price, i: p.i })),
        score: 0.45, notes: [`الموجة B صححت ${Math.round(rb * 100)} بالمئة من A، والموجة C تساوي A تقريبا أو 1.618 منها`],
        next: { dir: -s, targets: [C.price - s * (La + Lc) * 0.382], invalid: C.price + s * Lc * 0.15 }, endI: C.i,
      });
    }
  }
  return out.sort((x, y) => y.endI - x.endI || y.score - x.score);
}
