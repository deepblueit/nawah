// The engine's results as plain data. إكس نواة builds its cards from them, and the outside
// writing service (when the person turns it on) receives them as the only source of numbers.
import { analyze, TREND_TEXT, statusWord } from './engine/analyze.js';
import { symbolInfo, findSymbol, tfInfo, higherTf } from './engine/symbols.js';
import { marketClock, QUALITY_TEXT, fmtTime, deviceTz } from './engine/time.js';
import { positionSize, conversionNeed, martingale, breakEven, journalStats } from './engine/risk.js';
import { parseSignal, isSignal, channelStats } from './engine/signals.js';
import { loadCandles, quotes, sourceFor, SOURCE_NAMES } from './data.js';
import { tstore, tsetting } from './tstore.js';
import { searchKb, searchSchools, schoolName, ENTRIES } from './kb/index.js';
import { local } from '../core/util.js';

export const userTz = () => local.get('nawah.trade.tz', '') || deviceTz();
const iso = t => (t ? `${new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);
const r1 = x => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const pct = x => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : null);
const priceOf = info => p => (p == null || !Number.isFinite(p) ? null : Number(p.toFixed(info?.digits ?? (p > 1000 ? 2 : p > 10 ? 3 : 5))));

export const resolveSymbol = text => symbolInfo(String(text || '').toUpperCase().replace(/[^A-Z]/g, '')) || findSymbol(text);

// ---------- one symbol on one timeframe, with the higher timeframe for context
export async function runAnalysis(symbol, tf) {
  const info = symbolInfo(symbol);
  const res = await loadCandles(info.s, tf);
  const h = higherTf(tf);
  const htf = h ? await loadCandles(info.s, h).catch(() => null) : null;
  const r = analyze(res.candles, { symbol: info.s, tf, htf: htf?.candles, payout: (tsetting('risk', {}).payout || 85) / 100 });
  return { info, tf, res, r };
}

export function analysisFacts({ info, tf, res, r }) {
  const P = priceOf(info);
  if (!r.ok) return { symbol: info.s, timeframe: tfInfo(tf).frame, error: r.reason };
  const near = (list, n) => [...list].sort((a, b) => Math.abs((a.top + a.bottom) / 2 - r.price) - Math.abs((b.top + b.bottom) / 2 - r.price)).slice(0, n);
  const z = r.zones || {};
  const pt = r.patterns || {};
  const ind = r.indicators || {};
  const last = arr => (Array.isArray(arr) ? arr.at(-1) : arr);
  return {
    symbol: info.s,
    name: info.ar,
    timeframe: r.frame,
    prices: res.source === 'demo' ? 'generated demo prices, not real market prices' : `real prices from ${SOURCE_NAMES[res.source] || res.source}`,
    last_candle: iso(r.time),
    last_candle_still_open: !!r.forming,
    price: P(r.price),
    verdict: {
      direction: r.bias,
      text: r.biasText,
      agreement_score: r.score,
      agreement_meaning: 'agreement between the schools on one direction, from -100 to 100; not a probability of winning',
      strength: r.confidenceText,
      schools_for: r.forSide,
      schools_against: r.againstSide,
    },
    trend: r.trendText,
    higher_timeframe: r.mtf ? { timeframe: tfInfo(r.mtf.tf).frame, trend: TREND_TEXT[r.mtf.bias] } : null,
    volatility: r.volatility ? { atr: P(r.volatility.atr), atr_percent: r.volatility.atrPct, adx: r1(r.volatility.adx), state: r.volatility.text, squeeze: !!r.volatility.squeeze, regime: r.regime } : null,
    indicators: { rsi: r1(last(ind.rsi)), stochastic_k: r1(last(ind.stochK)), ema20: P(last(ind.ema20)), ema50: P(last(ind.ema50)), ema200: P(last(ind.ema200)) },
    schools: r.schools.filter(s => s.has).map(s => ({ school: s.name, vote: r1(s.vote), reading: s.line })),
    levels: {
      resistance: r.levels.resistance.slice(0, 3).map(x => ({ price: P(x.price), touches: x.touches })),
      support: r.levels.support.slice(0, 3).map(x => ({ price: P(x.price), touches: x.touches })),
      daily_pivot: r.levels.pivots ? { pivot: P(r.levels.pivots.p), r1: P(r.levels.pivots.r1), s1: P(r.levels.pivots.s1), r2: P(r.levels.pivots.r2), s2: P(r.levels.pivots.s2) } : null,
      previous_day: r.levels.prevDay ? { high: P(r.levels.prevDay.h), low: P(r.levels.prevDay.l) } : null,
      previous_week: r.levels.prevWeek ? { high: P(r.levels.prevWeek.h), low: P(r.levels.prevWeek.l) } : null,
    },
    zones: {
      order_blocks: near((z.obs || []).filter(x => !x.broken), 2).map(x => ({ side: x.dir === 'bull' ? 'demand' : 'supply', top: P(x.top), bottom: P(x.bottom), touched: !!x.touched })),
      fair_value_gaps: near((z.fvg || []).filter(x => x.active), 2).map(x => ({ side: x.dir === 'bull' ? 'bullish' : 'bearish', top: P(x.top), bottom: P(x.bottom) })),
      supply_demand: near((z.sd || []).filter(x => !x.broken), 2).map(x => ({ side: x.dir, top: P(x.top), bottom: P(x.bottom), fresh: !!x.fresh })),
      liquidity: (z.liq || []).filter(x => !x.swept).slice(0, 3).map(x => ({ side: x.side === 'buy' ? 'below price' : 'above price', price: P(x.price), touches: x.count })),
      dealing_range: z.dr ? { position: z.dr.zone, equilibrium: P(z.dr.eq), optimal_entry: z.dr.ote ? { top: P(z.dr.ote.top), bottom: P(z.dr.ote.bottom) } : null } : null,
    },
    patterns: {
      candles: (pt.candles || []).filter(c => c.context).slice(-3).map(c => `${c.name}${c.bias > 0 ? ' (bullish)' : c.bias < 0 ? ' (bearish)' : ''}`),
      chart: (pt.chart || []).slice(0, 3).map(p => ({ name: p.name, status: statusWord(p), target: P(p.target), invalid: P(p.invalid) })),
      harmonic: (pt.harmonics || []).slice(0, 2).map(x => ({ name: x.name, direction: x.dir === 1 ? 'bullish' : 'bearish', forming: !!x.potential, zone: x.prz ? { top: P(x.prz.top), bottom: P(x.prz.bottom) } : null, targets: (x.targets || []).map(P), stop: P(x.stop) })),
      elliott: (pt.elliott || []).slice(0, 1).map(w => ({ count: w.kind, complete: !!w.complete, notes: w.notes || [], next: w.next ? { direction: w.next.dir === 1 ? 'up' : 'down', targets: (w.next.targets || []).map(P), invalid: P(w.next.invalid) } : null }))[0] || null,
      wyckoff: pt.wyckoff?.range ? { phase: pt.wyckoff.range.kind, top: P(pt.wyckoff.range.top), bottom: P(pt.wyckoff.range.bottom), events: (pt.wyckoff.events || []).map(e => e.name) } : null,
      divergences: (pt.divergences || []).filter(d => d.recent).slice(0, 2).map(d => `${d.hidden ? 'hidden' : 'regular'} ${d.bias > 0 ? 'bullish' : 'bearish'} on ${d.name}`),
    },
    plan: r.plan.side ? {
      side: r.plan.side,
      entry: P(r.plan.entry.price),
      entry_type: r.plan.entry.type,
      entry_note: r.plan.entry.text,
      stop: P(r.plan.stop),
      risk: r.plan.riskText,
      targets: r.plan.targets.map(t => ({ price: P(t.price), reward_to_risk: r2(t.rr), reason: t.label })),
      invalid_on_close_beyond: P(r.plan.invalid),
      summary: r.plan.summary,
    } : { side: null, summary: r.plan.summary },
    binary_options: r.binary ? {
      reading: r.binary.label,
      strength: Math.abs(r.binary.score),
      expiry_candles: r.binary.expiryCandles,
      enter_at: iso(r.binary.entryAt),
      reasons: r.binary.reasons,
      avoid_if: r.binary.noTrade,
      break_even_win_rate: pct(r.binary.breakEven),
    } : null,
    session: r.clock ? { forex_closed: !!r.clock.fxClosed, open_now: r.clock.active.map(s => s.name), overlap: r.clock.overlap || null, killzone: r.clock.killzone?.name || null, quality: QUALITY_TEXT[r.clock.quality] } : null,
    warnings: r.warnings,
  };
}

// ---------- the library
export function libraryFacts(query, n = 3) {
  const sc = searchSchools(query)[0];
  const hits = searchKb(query, { limit: n + 2 }).filter(h => h.score >= 3).slice(0, n);
  return {
    school: sc && sc.score >= 20 ? { name: sc.school.n, about: sc.school.d, entries: ENTRIES.filter(e => e.s === sc.school.k).slice(0, 24).map(e => e.n) } : null,
    entries: hits.map(h => ({
      name: h.e.n,
      english: h.e.en,
      school: schoolName(h.e.s),
      description: h.e.d,
      how_to_identify: h.e.id || [],
      how_to_trade: h.e.tr || [],
      common_mistakes: h.e.f || '',
      detected_on_chart_by_nawah: !!h.e.auto,
    })),
  };
}

// ---------- position size, shared by the cards and the service
// the latest price: the cheap quote first, then the last closed hour when nothing is cached yet
async function lastPrices(symbols) {
  const q = await quotes(symbols).catch(() => ({}));
  const out = {};
  for (const s of symbols) {
    out[s] = q[s]?.price ?? (await loadCandles(s, '1h').catch(() => null))?.candles?.at(-1)?.c ?? null;
  }
  return out;
}

export async function computeSize({ symbol, balance, riskPct, stopPips, entry, stop, mem = {} }) {
  const r = tsetting('risk', { balance: 1000, riskPct: 1 });
  const info = symbolInfo(symbol);
  if (!info) return { error: 'unknown symbol' };
  const need = conversionNeed(info);
  const q = await lastPrices([info.s, ...(need ? [need.symbol] : [])]);
  const price = q[info.s] || (mem.plan && mem.symbol === info.s ? mem.plan.entry : null);
  let e = entry ?? price;
  let s = stop ?? null;
  if (s == null && stopPips != null && e != null) s = e - stopPips * info.pip;
  else if (s == null && mem.plan && mem.symbol === info.s) { e = mem.plan.entry; s = mem.plan.stop; }
  const out = { info, need, balance: balance ?? r.balance, pct: riskPct ?? r.riskPct, entry: e, stop: s };
  if (e == null || s == null) return { ...out, missing: 'stop' };
  const conv = need ? (q[need.symbol] ? (need.invert ? 1 / q[need.symbol] : q[need.symbol]) : null) : null;
  return { ...out, res: positionSize({ symbol: info.s, balance: out.balance, riskPct: out.pct, entry: e, stop: s, price: e, quoteToUsd: conv, leverage: r.leverage || 100 }) };
}

export function sizeFacts(z) {
  if (z.error) return z;
  const P = priceOf(z.info);
  if (z.missing) return { symbol: z.info.s, missing: 'stop distance; ask for the stop in pips or the stop price' };
  if (!z.res || z.res.needsRate) return { symbol: z.info.s, missing: `the price of ${z.need?.symbol} to value one pip` };
  const x = z.res;
  const base = { symbol: z.info.s, balance_usd: z.balance, risk_percent: z.pct, risk_amount_usd: r2(x.amount), entry: P(z.entry), stop: P(z.stop) };
  if (z.info.cls === 'crypto') return { ...base, units: Number(x.units.toFixed(6)), position_value_usd: r2(x.notional) };
  return { ...base, stop_pips: r1(x.pips), lots: x.lotsRounded, pip_value_per_lot_usd: r2(x.pipValue), per_pip_for_this_size_usd: r2(x.perPip), actual_loss_at_stop_usd: r2(x.actualRisk), below_minimum_lot: x.lots < 0.01 };
}

// ---------- binary options arithmetic
export function binaryFacts({ payout, winRate, stake, steps } = {}) {
  const p = payout || tsetting('risk', {}).payout || 85;
  const out = { payout_percent: p, break_even_win_rate: pct(breakEven(p)) };
  if (steps) {
    const wr = winRate || 55;
    const m = martingale({ stake: stake || 10, multiplier: Math.max(2, Math.round(((1 + p / 100) / (p / 100)) * 100) / 100), steps, payout: p, winRate: wr, sequences: 100 });
    out.martingale = {
      win_rate_assumed_percent: wr,
      ladder: m.rows.map(x => ({ step: x.k, stake: r2(x.stake), spent: r2(x.spent), profit_if_win: r2(x.profitIfWin) })),
      worst_loss: r2(m.totalRisk),
      chance_to_lose_whole_ladder: pct(m.lossAll),
      chance_it_happens_in_100_ladders: pct(m.ruinAtLeastOnce),
      average_result_per_ladder: r2(m.evPerSeq),
    };
  }
  return out;
}

// ---------- the trading sessions now
export function sessionFacts(now = Math.floor(Date.now() / 1000)) {
  const c = marketClock(now, 'fx');
  const z = userTz();
  const d = new Date(now * 1000);
  const at = h => fmtTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h) / 1000, z);
  return {
    time_zone: z,
    forex_closed: !!c.fxClosed,
    sessions: c.sessions.map(s => ({ name: s.name, opens: at(s.open), closes: at(s.close), open_now: !!s.active })),
    overlap: c.overlap || null,
    killzone: c.killzone?.name || null,
    quality: QUALITY_TEXT[c.quality],
  };
}

// ---------- the person's own records
export function channelFacts() {
  const rows = tstore.all('channels').filter(c => c.role !== 'target')
    .map(c => ({ c, s: channelStats(tstore.all('signals').filter(x => x.src === c.id)) }))
    .filter(x => x.s.total).sort((a, b) => b.s.total - a.s.total).slice(0, 8);
  return {
    rule: 'a forex signal counts as a win when price touched the first target before the stop, on prices from the moment it was posted; fewer than 30 verified signals are not enough to judge',
    channels: rows.map(({ c, s }) => ({
      channel: c.title,
      signals: s.total,
      verified: s.verified,
      verified_win_rate: pct(s.winRate),
      claimed_win_rate: pct(s.claimedWinRate),
      average_r: r2(s.avgR),
      longest_losing_run: s.maxLossStreak,
      edited_after_posting: s.edited,
      deleted_by_source: s.deleted,
      posted_after_the_move: s.late,
      without_stop: s.noStop,
    })),
  };
}

export function journalFacts() {
  const st = journalStats(tstore.all('trades'));
  if (!st.n) return { trades: 0 };
  const top = list => (list || []).filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 5).map(x => ({ name: x.k, trades: x.n, win_rate: pct(x.winRate), average_r: r2(x.r / x.n), net: r2(x.pnl) }));
  return {
    trades: st.n,
    win_rate: pct(st.winRate),
    net: r2(st.net),
    average_r: r2(st.avgR),
    profit_factor: Number.isFinite(st.profitFactor) ? r2(st.profitFactor) : st.profitFactor === Infinity ? 'no losses' : null,
    max_drawdown: r2(st.maxDd),
    longest_losing_run: st.maxLossStreak,
    followed_plan: pct(st.followedPlan),
    by_setup: top(st.bySetup),
    by_symbol: top(st.bySymbol),
    by_emotion: top(st.byEmotion),
  };
}

// ---------- a pasted signal, read and checked against the market
export async function signalFacts(text) {
  const p = parseSignal(text, {});
  if (!isSignal(p)) return { readable: false, note: p.kind === 'update' ? 'this is a result update, not a new signal' : 'no clear signal in the text' };
  const info = symbolInfo(p.symbol);
  const P = priceOf(info);
  const out = {
    readable: true,
    kind: p.kind,
    symbol: p.symbol,
    side: p.side,
    otc: !!p.otc,
    entry: P(p.entry),
    entry_zone: p.zone ? p.zone.map(P) : null,
    stop: P(p.sl),
    targets: p.tps.map(P),
    reward_to_risk_first_target: r2(p.rr),
    expiry_minutes: p.expiryMin || null,
    time: p.time || null,
    missing: p.missing,
    issues: p.issues,
  };
  if (!info || p.otc || sourceFor(info.s) === 'demo') return out;
  try {
    const tf = p.kind === 'binary' ? (p.expiryMin && p.expiryMin <= 3 ? '1m' : '5m') : '1h';
    const run = await runAnalysis(info.s, tf);
    const r = run.r;
    if (!r.ok) return out;
    const a = r.volatility.atr;
    out.engine = {
      timeframe: r.frame,
      price_now: P(r.price),
      direction: r.bias,
      agreement_score: r.score,
      agrees_with_signal: r.bias === 'neutral' ? null : r.bias === p.side,
      entry_distance_in_atr: p.entry != null ? r2(Math.abs(r.price - p.entry) / a) : null,
      stop_distance_in_atr: p.entry != null && p.sl != null ? r2(Math.abs(p.entry - p.sl) / a) : null,
      binary_reading: p.kind === 'binary' ? r.binary.label : undefined,
    };
  } catch (e) { out.engine = { error: e.message }; }
  return out;
}
