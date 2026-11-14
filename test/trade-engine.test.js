// Trading mode engine: symbols, market time, indicators, risk math, CSV import, analysis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findSymbol, symbolsIn, symbolInfo, normAr, findTimeframe, higherTf } from '../assets/js/trade/engine/symbols.js';
import { isUsDst, fxClosedAt, marketClock, dayKey } from '../assets/js/trade/engine/time.js';
import { sma, ema, rsi, atr } from '../assets/js/trade/engine/indicators.js';
import { positionSize, breakEven, martingale, kelly, recoveryNeeded, lossesAllowed, journalStats } from '../assets/js/trade/engine/risk.js';
import { parseCandlesCsv, tfFromStep } from '../assets/js/trade/engine/csv.js';
import { demoState } from '../assets/js/trade/engine/gen.js';
import { analyze } from '../assets/js/trade/engine/analyze.js';
import { understand } from '../assets/js/trade/engine/intent.js';

const ts = s => Math.floor(Date.parse(s) / 1000);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not close to ${b}`);

test('symbols from codes and Arabic names', () => {
  assert.equal(findSymbol('XAUUSD BUY 2350').s, 'XAUUSD');
  assert.equal(findSymbol('EUR/USD OTC').s, 'EURUSD');
  assert.equal(findSymbol('EUR/USD OTC').otc, true);
  assert.equal(findSymbol('xau/usd').s, 'XAUUSD');
  assert.equal(findSymbol('GOLD BUY LIMIT 2345').s, 'XAUUSD');
  assert.equal(findSymbol('حلل الذهب').s, 'XAUUSD');
  assert.equal(findSymbol('بيتكوين').s, 'BTCUSDT');
  assert.equal(findSymbol('الفضة').s, 'XAGUSD');
  assert.equal(findSymbol('الدولار'), null);
});

test('Arabic prefixes and currency pairs written as words', () => {
  for (const t of ['توصية بيع للذهب', 'والذهب', 'بالذهب', 'فالذهب']) assert.equal(findSymbol(t).s, 'XAUUSD', t);
  assert.equal(findSymbol('الباوند ين').s, 'GBPJPY');
  assert.equal(findSymbol('الباوند مقابل الين').s, 'GBPJPY');
  assert.equal(findSymbol('ين دولار').s, 'USDJPY');
  assert.equal(findSymbol('الدولار كندي').s, 'USDCAD');
  assert.equal(findSymbol('الدولار مقابل الجنيه').s, 'USDEGP');
  assert.equal(findSymbol('جنيه استرليني').s, 'GBPUSD');
  assert.deepEqual(symbolsIn('قارن اليورو دولار والباوند دولار').map(x => x.s), ['EURUSD', 'GBPUSD']);
  assert.deepEqual(symbolsIn('قارن الذهب والفضة والبيتكوين').map(x => x.s), ['XAUUSD', 'XAGUSD', 'BTCUSDT']);
});

test('symbol details', () => {
  assert.equal(symbolInfo('EURUSD').pip, 0.0001);
  assert.equal(symbolInfo('USDJPY').pip, 0.01);
  assert.equal(symbolInfo('XAUUSD').pip, 0.1);
  assert.equal(symbolInfo('XAUUSD').contract, 100);
  assert.equal(symbolInfo('EURUSD OTC').s, 'EURUSD');
});

test('Arabic normalisation and timeframes', () => {
  assert.equal(normAr('الإ\u0650دارة'), 'الاداره');
  assert.equal(normAr('\u0661\u0662\u0663\u066B\u0665'), '123.5');
  assert.equal(findTimeframe('على الساعة'), '1h');
  assert.equal(findTimeframe('4 ساعات'), '4h');
  assert.equal(findTimeframe('H4'), '4h');
  assert.equal(findTimeframe('15 دقيقة'), '15m');
  assert.equal(findTimeframe('دقيقة'), '1m');
  assert.equal(findTimeframe('على اليومي'), '1d');
  assert.equal(findTimeframe('ما توقعك للذهب اليوم'), null);
  assert.equal(higherTf('1h'), '4h');
  assert.equal(higherTf('15m'), '1h');
});

test('New York daylight saving and the forex week', () => {
  assert.equal(isUsDst(ts('2026-07-01T12:00:00Z')), true);
  assert.equal(isUsDst(ts('2026-01-15T12:00:00Z')), false);
  assert.equal(isUsDst(ts('2026-03-08T06:59:00Z')), false);
  assert.equal(isUsDst(ts('2026-03-08T07:01:00Z')), true);
  // Friday 17:00 New York (22:00 UTC in November) closes the week, Sunday 17:00 opens it
  assert.equal(fxClosedAt(ts('2026-11-13T21:59:00Z')), false);
  assert.equal(fxClosedAt(ts('2026-11-13T22:01:00Z')), true);
  assert.equal(fxClosedAt(ts('2026-11-14T12:00:00Z')), true);
  assert.equal(fxClosedAt(ts('2026-11-15T21:59:00Z')), true);
  assert.equal(fxClosedAt(ts('2026-11-15T22:01:00Z')), false);
  // the trading day changes at the New York close: 21:00 UTC in summer
  assert.equal(dayKey(ts('2026-07-11T21:00:00Z'), true) - dayKey(ts('2026-07-11T20:59:00Z'), true), 1);
});

test('market clock', () => {
  const mid = marketClock(ts('2026-11-11T14:00:00Z'));
  assert.equal(mid.quality, 'peak');
  assert.deepEqual(mid.active.map(s => s.key), ['london', 'newyork']);
  assert.equal(mid.killzone.key, 'nyOpen');
  assert.equal(marketClock(ts('2026-11-14T12:00:00Z')).quality, 'closed');
  assert.notEqual(marketClock(ts('2026-11-14T12:00:00Z'), 'crypto').quality, 'closed');
});

test('indicators on known series', () => {
  const up = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(sma(up, 5).at(-1), 28);
  assert.equal(sma(up, 5)[3], null);
  near(ema([1, 1, 1, 1, 1, 1], 3).at(-1), 1);
  assert.equal(rsi(up, 14).at(-1), 100);
  assert.equal(rsi(up.map(x => 31 - x), 14).at(-1), 0);
  const flat = Array.from({ length: 20 }, (_, i) => ({ t: i, o: 10, h: 11, l: 9, c: 10 }));
  near(atr(flat, 14).at(-1), 2);
});

test('position size and the risk actually taken', () => {
  const eu = positionSize({ symbol: 'EURUSD', balance: 1000, riskPct: 1, entry: 1.085, stop: 1.082 });
  assert.equal(eu.amount, 10);
  near(eu.pips, 30, 1e-6);
  assert.equal(eu.pipValue, 10);
  assert.equal(eu.lotsRounded, 0.03);
  near(eu.actualRisk, 9, 1e-6);
  const xau = positionSize({ symbol: 'XAUUSD', balance: 1000, riskPct: 1, entry: 2350, stop: 2340 });
  near(xau.pips, 100, 1e-9);
  assert.equal(xau.lotsRounded, 0.01);
  near(xau.actualRisk, 10, 1e-9);
  const jpy = positionSize({ symbol: 'USDJPY', balance: 1000, riskPct: 1, entry: 150, stop: 149.7 });
  near(jpy.pipValue, 1000 / 150, 1e-9);
  assert.equal(jpy.lotsRounded, 0.05);
  // a cross needs the rate of its quote currency first
  assert.deepEqual(positionSize({ symbol: 'EURGBP', balance: 1000, riskPct: 1, entry: 0.86, stop: 0.857 }).needsRate, { symbol: 'GBPUSD', invert: false });
});

test('binary break-even, martingale, Kelly, recovery', () => {
  near(breakEven(85), 1 / 1.85);
  near(breakEven(0.8), 1 / 1.8);
  const mg = martingale({ stake: 1, multiplier: 2.2, steps: 3, payout: 0.85, winRate: 0.55 });
  near(mg.totalRisk, 1 + 2.2 + 4.84 + 10.648, 1e-9);
  near(mg.lossAll, 0.45 ** 4, 1e-9);
  near(mg.minMultiplier, 1.85 / 0.85, 1e-9);
  near(kelly({ winRate: 0.5, rr: 2 }).full, 0.25);
  assert.equal(recoveryNeeded(50), 100);
  assert.equal(recoveryNeeded(100), Infinity);
  assert.equal(lossesAllowed({ balance: 1000, riskPct: 1, maxDailyLossPct: 3 }), 3);
});

test('journal statistics', () => {
  const day = ts('2026-11-10T10:00:00Z') * 1000;
  const s = journalStats([
    { at: day, r: 2, pnl: 20, result: 'win', setup: 'a' },
    { at: day + 1, r: -1, pnl: -10, result: 'loss', setup: 'a' },
    { at: day + 2, r: -1, pnl: -10, result: 'loss', setup: 'b' },
    { at: day + 3, r: 1.5, pnl: 15, result: 'win', setup: 'b' },
    { at: day + 4, result: 'open', setup: 'b' },
  ]);
  assert.equal(s.n, 4);
  near(s.winRate, 0.5);
  assert.equal(s.net, 15);
  assert.equal(s.maxDd, 20);
  assert.equal(s.maxLossStreak, 2);
  near(s.profitFactor, 35 / 20);
  near(s.avgR, 0.375);
  assert.deepEqual(s.bySetup.map(g => [g.k, g.n, g.wins]), [['a', 2, 1], ['b', 2, 1]]);
});

test('CSV import from a trading platform', () => {
  const csv = '\uFEFF2026.11.10,00:00,1.0850,1.0860,1.0840,1.0855,1200\n2026.11.10,01:00,1.0855,1.0870,1.0850,1.0866,900\n2026.11.10,02:00,1.0866,1.0871,1.0860,1.0862,800\nbad,line\n';
  const r = parseCandlesCsv(csv, { offsetHours: 2 });
  assert.equal(r.candles.length, 3);
  assert.equal(r.step, 3600);
  assert.equal(r.bad, 1);
  // platform time two hours ahead of UTC
  assert.equal(r.candles[0].t, ts('2026-11-09T22:00:00Z'));
  assert.deepEqual([r.candles[0].o, r.candles[0].h, r.candles[0].l, r.candles[0].c], [1.085, 1.086, 1.084, 1.0855]);
  assert.equal(tfFromStep(3600), '1h');
});

test('analysis runs end to end on generated prices', () => {
  const now = ts('2026-11-11T14:00:00Z');
  const st = demoState('EURUSD', '1h', { bars: 900, now });
  const htf = demoState('EURUSD', '4h', { bars: 400, now });
  assert.ok(st.candles.length > 300);
  for (let i = 1; i < st.candles.length; i++) assert.ok(st.candles[i].t > st.candles[i - 1].t, 'candles in order');
  const r = analyze(st.candles, { symbol: 'EURUSD', tf: '1h', htf: htf.candles, now });
  assert.equal(r.ok, true);
  assert.ok(r.score >= -100 && r.score <= 100);
  assert.ok(['buy', 'sell', 'neutral'].includes(r.bias), r.bias);
  assert.ok(r.schools.length >= 12);
  for (const sc of r.schools) assert.ok(typeof sc.name === 'string' && sc.name.length > 0);
  assert.ok(Array.isArray(r.narrative) && r.narrative.length >= 3);
  for (const part of r.narrative) assert.ok(JSON.stringify(part).length > 20);
  if (r.plan.side) {
    const dir = r.plan.side === 'buy' ? 1 : -1;
    assert.ok(dir * (r.plan.entry.price - r.plan.stop) > 0, 'stop on the far side of the entry');
    for (const tp of r.plan.targets) assert.ok(dir * (tp.price - r.plan.entry.price) > 0, 'targets ahead of the entry');
  }
});

test('the assistant reads the question', () => {
  const a = understand('حلل الذهب على الساعة');
  assert.equal(a.intent, 'analyze');
  assert.equal(a.symbol, 'XAUUSD');
  assert.equal(a.tf, '1h');
  const follow = understand('وعلى الأربع ساعات؟', { symbol: 'XAUUSD', tf: '1h' });
  assert.equal(follow.intent, 'analyze');
  assert.equal(follow.symbol, 'XAUUSD');
  assert.equal(follow.tf, '4h');
  assert.equal(understand('قارن اليورو دولار والباوند دولار').intent, 'compare');
  assert.equal(understand('ما هو نموذج الرأس والكتفين').intent, 'explain');
  const risk = understand('احسب اللوت لرصيد 1000 ووقف 30 نقطة');
  assert.equal(risk.intent, 'risk');
  assert.equal(risk.nums.balance, 1000);
  assert.equal(risk.nums.stopPips, 30);
  assert.equal(understand('XAUUSD BUY 2350 SL 2340 TP 2360').intent, 'signal');
  assert.equal(understand('مرحبا').intent, 'greet');
  assert.equal(understand('كيف أربط البوت').intent, 'connect');
  assert.equal(understand('ما أفضل وقت للتداول').intent, 'session');
  assert.equal(understand('مضاعفة 3 خطوات عائد 85').intent, 'martingale');
});
