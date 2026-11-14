// Money management: the size of a position for a fixed risk, pip values, margin, binary option
// arithmetic, the martingale illusion in numbers, Kelly, and the statistics of a journal.
import { symbolInfo } from './symbols.js';

// Value of one pip for one standard lot, in USD. quoteToUsd converts the quote currency into USD
// (1 for pairs quoted in USD; for USDJPY it is 1/price; for crosses the caller supplies it).
export function pipValuePerLot(info, price, quoteToUsd = null) {
  if (!info) return null;
  const raw = info.contract * info.pip;
  if (info.quote === 'USD' || info.quote === 'USDT') return raw;
  if (info.base === 'USD') return raw / price;
  return quoteToUsd ? raw * quoteToUsd : null;
}

// What converts the quote currency into USD: USDJPY -> 1/price, crosses need a second rate.
export function conversionNeed(info) {
  if (!info || info.quote === 'USD' || info.quote === 'USDT' || info.base === 'USD') return null;
  const direct = symbolInfo(`${info.quote}USD`);
  if (direct) return { symbol: direct.s, invert: false };
  const inverse = symbolInfo(`USD${info.quote}`);
  if (inverse) return { symbol: inverse.s, invert: true };
  return { symbol: `${info.quote}USD`, invert: false };
}

export function positionSize({ symbol, balance, riskPct, riskAmount, entry, stop, price, quoteToUsd = null, leverage = 100 }) {
  const info = symbolInfo(symbol);
  const amount = riskAmount != null && riskAmount !== '' ? Number(riskAmount) : (Number(balance) * Number(riskPct)) / 100;
  const dist = Math.abs(Number(entry) - Number(stop));
  if (!info || !dist || !amount) return null;
  const px = Number(price || entry);
  if (info.cls === 'crypto') {
    const units = amount / dist;
    return { amount, units, notional: units * px, margin: (units * px) / (leverage || 1), distance: dist, distPct: (dist / px) * 100 };
  }
  const pips = dist / info.pip;
  const pv = pipValuePerLot(info, px, quoteToUsd);
  if (!pv) return { amount, pips, needsRate: conversionNeed(info) };
  const lots = amount / (pips * pv);
  // brokers trade in steps of 0.01 lot: the size is rounded down, so the real risk is a little lower
  const lotsRounded = Math.floor(lots * 100 + 1e-9) / 100;
  const units = lots * info.contract;
  const notionalQuote = units * px;
  const notionalUsd = info.quote === 'USD' ? notionalQuote : info.base === 'USD' ? units : quoteToUsd ? notionalQuote * quoteToUsd : null;
  return {
    amount, pips, pipValue: pv, lots, lotsRounded, units,
    notional: notionalUsd, margin: notionalUsd != null ? notionalUsd / (leverage || 1) : null,
    perPip: lotsRounded * pv, actualRisk: lotsRounded * pv * pips,
  };
}

// ---------- binary options
export const breakEven = payout => 1 / (1 + normPayout(payout));
const normPayout = p => (Number(p) > 1 ? Number(p) / 100 : Number(p));
export function binaryExpectancy({ payout, winRate, stake = 1 }) {
  const p = normPayout(payout);
  const w = Number(winRate) > 1 ? Number(winRate) / 100 : Number(winRate);
  const perTrade = w * p - (1 - w);
  return { perTrade: perTrade * stake, per100: perTrade * stake * 100, breakEven: breakEven(p), edge: w - breakEven(p) };
}

// The martingale: each loss multiplies the next stake. It recovers small losses often and loses
// everything rarely, and the rare loss is larger than all the small gains together.
export function martingale({ stake = 1, multiplier = 2.2, steps = 3, payout = 0.85, winRate = 0.55, sequences = 100 }) {
  const p = normPayout(payout);
  const w = Number(winRate) > 1 ? Number(winRate) / 100 : Number(winRate);
  const rows = [];
  let spent = 0;
  for (let k = 0; k <= steps; k++) {
    const s = stake * multiplier ** k;
    spent += s;
    rows.push({ k, stake: s, spent, profitIfWin: s * p - (spent - s), probReach: (1 - w) ** k });
  }
  const lossAll = (1 - w) ** (steps + 1);
  const ruinAtLeastOnce = 1 - (1 - lossAll) ** sequences;
  const evPerSeq = rows.reduce((acc, r) => acc + r.probReach * w * r.profitIfWin, 0) - lossAll * spent;
  const minMultiplier = (1 + p) / p;
  return { rows, totalRisk: spent, lossAll, ruinAtLeastOnce, evPerSeq, minMultiplier };
}

// ---------- Kelly, expectancy, drawdown
export function kelly({ winRate, rr }) {
  const w = Number(winRate) > 1 ? Number(winRate) / 100 : Number(winRate);
  const b = Number(rr);
  if (!b) return null;
  const f = w - (1 - w) / b;
  return { full: f, half: f / 2, quarter: f / 4 };
}

export const recoveryNeeded = ddPct => (ddPct >= 100 ? Infinity : (ddPct / (100 - ddPct)) * 100);

export function lossesAllowed({ balance, riskPct, maxDailyLossPct }) {
  if (!riskPct) return null;
  return Math.floor(Number(maxDailyLossPct) / Number(riskPct));
}

// Chance of a losing streak of at least n in m trades at win rate w (simulation, deterministic seed).
export function streakOdds({ winRate, n = 5, trades = 100, runs = 4000 }) {
  const w = Number(winRate) > 1 ? Number(winRate) / 100 : Number(winRate);
  let seed = 42;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let hits = 0;
  for (let r = 0; r < runs; r++) {
    let s = 0;
    let got = false;
    for (let t = 0; t < trades; t++) {
      if (rnd() < w) s = 0; else { s++; if (s >= n) { got = true; break; } }
    }
    if (got) hits++;
  }
  return hits / runs;
}

// ---------- journal statistics
export function journalStats(trades) {
  const done = trades.filter(t => t.result && t.result !== 'open').sort((a, b) => (a.at || 0) - (b.at || 0));
  const n = done.length;
  if (!n) return { n: 0 };
  const wins = done.filter(t => t.result === 'win');
  const losses = done.filter(t => t.result === 'loss');
  const pnl = done.map(t => Number(t.pnl) || 0);
  const rs = done.map(t => Number(t.r)).filter(Number.isFinite);
  const gross = pnl.filter(x => x > 0).reduce((a, b) => a + b, 0);
  const lossSum = -pnl.filter(x => x < 0).reduce((a, b) => a + b, 0);
  let eq = 0;
  let peak = 0;
  let maxDd = 0;
  const curve = [];
  for (const t of done) {
    eq += Number(t.pnl) || 0;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
    curve.push({ at: t.at, eq });
  }
  let streak = 0;
  let maxLossStreak = 0;
  let wStreak = 0;
  let maxWinStreak = 0;
  for (const t of done) {
    if (t.result === 'loss') { streak++; wStreak = 0; } else if (t.result === 'win') { wStreak++; streak = 0; } else { streak = 0; wStreak = 0; }
    maxLossStreak = Math.max(maxLossStreak, streak);
    maxWinStreak = Math.max(maxWinStreak, wStreak);
  }
  const group = key => {
    const m = {};
    for (const t of done) {
      const k = typeof key === 'function' ? key(t) : t[key] || 'غير محدد';
      (m[k] ||= { n: 0, wins: 0, pnl: 0, r: 0 });
      m[k].n++; if (t.result === 'win') m[k].wins++; m[k].pnl += Number(t.pnl) || 0; m[k].r += Number(t.r) || 0;
    }
    return Object.entries(m).map(([k, v]) => ({ k, ...v, winRate: v.wins / v.n })).sort((a, b) => b.n - a.n);
  };
  const wd = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return {
    n, wins: wins.length, losses: losses.length, be: n - wins.length - losses.length,
    winRate: wins.length / n,
    net: pnl.reduce((a, b) => a + b, 0),
    avgWin: wins.length ? wins.reduce((a, t) => a + (Number(t.pnl) || 0), 0) / wins.length : 0,
    avgLoss: losses.length ? losses.reduce((a, t) => a + (Number(t.pnl) || 0), 0) / losses.length : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    profitFactor: lossSum ? gross / lossSum : gross ? Infinity : null,
    maxDd, curve, maxLossStreak, maxWinStreak,
    bySetup: group('setup'), bySymbol: group('symbol'), byKind: group('kind'),
    byDay: group(t => wd[new Date(t.at).getDay()]),
    byEmotion: group('emotion'),
    followedPlan: done.filter(t => t.plan === 'yes').length / n,
  };
}
