// Divergences between price swings and an oscillator (RSI or the MACD histogram).
// Regular: price makes a new extreme the oscillator does not confirm, a warning of reversal.
// Hidden: the oscillator makes the new extreme while price does not, a sign of trend continuation.
import { pivots } from './swings.js';

export function divergences(cs, osc, { name = 'RSI', left = 3, right = 3, maxGap = 60, minGap = 5, recentBars = 12 } = {}) {
  const out = [];
  const piv = pivots(cs, left, right);
  const lastI = cs.length - 1;
  for (const type of ['H', 'L']) {
    const list = piv.filter(p => p.type === type && osc[p.i] != null);
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1];
      const b = list[k];
      const gap = b.i - a.i;
      if (gap < minGap || gap > maxGap) continue;
      const oa = osc[a.i];
      const ob = osc[b.i];
      let kind = null;
      if (type === 'H') {
        if (b.price > a.price && ob < oa) kind = 'regularBear';
        else if (b.price < a.price && ob > oa) kind = 'hiddenBear';
      } else if (b.price < a.price && ob > oa) kind = 'regularBull';
      else if (b.price > a.price && ob < oa) kind = 'hiddenBull';
      if (!kind) continue;
      out.push({
        kind, name, bias: kind.endsWith('Bull') ? 1 : -1, hidden: kind.startsWith('hidden'),
        from: { t: a.t, price: a.price, osc: oa, i: a.i }, to: { t: b.t, price: b.price, osc: ob, i: b.i },
        recent: lastI - b.i <= recentBars,
      });
    }
  }
  return out.sort((x, y) => y.to.i - x.to.i);
}

export const DIV_NAMES = {
  regularBull: 'تباعد إيجابي عادي', regularBear: 'تباعد سلبي عادي', hiddenBull: 'تباعد إيجابي مخفي', hiddenBear: 'تباعد سلبي مخفي',
};
