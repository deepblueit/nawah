// Signals: reading channel messages, checking them against prices, channel statistics, the library.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSignal, isSignal, evaluateSignal, channelStats, formatSignal, stripPromo } from '../assets/js/trade/engine/signals.js';
import { ENTRIES, SCHOOLS, searchKb, searchSchools, figure } from '../assets/js/trade/kb/index.js';

const ts = s => Math.floor(Date.parse(s) / 1000);

test('forex signals in English', () => {
  const a = parseSignal('XAUUSD BUY NOW @ 2350\nSL 2340\nTP1 2355\nTP2 2360\nTP3 2370');
  assert.equal(a.kind, 'forex');
  assert.equal(a.symbol, 'XAUUSD');
  assert.equal(a.side, 'buy');
  assert.equal(a.order, 'market');
  assert.equal(a.entry, 2350);
  assert.equal(a.sl, 2340);
  assert.deepEqual(a.tps, [2355, 2360, 2370]);
  assert.ok(a.issues.length > 0, 'a first target at half the risk is flagged');

  const b = parseSignal('\uD83D\uDD34 SELL EURUSD 1.0850-1.0860\nSL: 1.0890\nTP: 1.0820 / 1.0800');
  assert.equal(b.side, 'sell');
  assert.equal(b.order, 'zone');
  assert.deepEqual(b.zone, [1.085, 1.086]);
  assert.deepEqual(b.tps, [1.082, 1.08]);

  const c = parseSignal('GOLD BUY LIMIT 2345\nSL2338\nTP2352\nTP2360');
  assert.equal(c.order, 'limit');
  assert.equal(c.sl, 2338);

  const d = parseSignal('EURUSD H1 BUY 1.0850 SL 1.0820 TP 1.0900');
  assert.equal(d.entry, 1.085, 'the 1 of H1 is not read as a price');

  const e = parseSignal('BTCUSDT LONG entry 68,250 - 67,900 SL 66,800 TP 69,500 TP 71,000');
  assert.deepEqual(e.zone, [67900, 68250]);
  assert.deepEqual(e.tps, [69500, 71000]);
});

test('forex signals in Arabic and Egyptian wording', () => {
  const a = parseSignal('توصية بيع الذهب من 2350 الهدف الاول 2340 الهدف الثاني 2330 وقف الخسارة 2360');
  assert.deepEqual([a.symbol, a.side, a.entry, a.sl], ['XAUUSD', 'sell', 2350, 2360]);
  assert.deepEqual(a.tps, [2340, 2330]);
  const b = parseSignal('بيع دهب من 2350 استوب 2360 تارجت 2340');
  assert.deepEqual([b.symbol, b.side, b.entry, b.sl, b.tps[0]], ['XAUUSD', 'sell', 2350, 2360, 2340]);
  const c = parseSignal('الذهب شراء الان 2351\nالهدف 2358\nالهدف 2365\nوقف 2344');
  assert.deepEqual([c.side, c.entry, c.sl], ['buy', 2351, 2344]);
  assert.deepEqual(c.tps, [2358, 2365]);
});

test('distances in pips become prices from the current price', () => {
  const s = parseSignal('GBPJPY sell now\nSL 30 pips\nTP 60 pips', { price: 195.2 });
  assert.equal(s.entry, 195.2);
  assert.ok(Math.abs(s.sl - 195.5) < 1e-9);
  assert.ok(Math.abs(s.tps[0] - 194.6) < 1e-9);
});

test('binary option signals', () => {
  const a = parseSignal('EUR/USD OTC \uD83D\uDD3C CALL 1 min');
  assert.deepEqual([a.kind, a.symbol, a.side, a.expiryMin, a.otc], ['binary', 'EURUSD', 'buy', 1, true]);
  const b = parseSignal('EURUSD \u2B07\uFE0F PUT 5M 14:05 UTC-3 martingale 2');
  assert.deepEqual([b.side, b.expiryMin, b.time, b.tz, b.mg], ['sell', 5, '14:05', -3, 2]);
  const c = parseSignal('صفقة صعود يورو دولار مدة 3 دقائق الساعة 14:30');
  assert.deepEqual([c.kind, c.symbol, c.side, c.expiryMin, c.time], ['binary', 'EURUSD', 'buy', 3, '14:30']);
});

test('result updates are not signals', () => {
  const win = parseSignal('TP1 hit \u2705 +40 pips');
  assert.deepEqual([win.kind, win.event, win.tp], ['update', 'win', 1]);
  assert.equal(parseSignal('تم ضرب الستوب').event, 'loss');
  assert.equal(parseSignal('Move SL to entry').event, 'be');
  assert.equal(parseSignal('الهدف الأول تحقق بنجاح').event, 'win');
  assert.equal(isSignal(win), false);
  // a stop loss inside a signal is not a loss report
  assert.equal(parseSignal('XAUUSD SELL 2350 Stop loss 2360').kind, 'forex');
});

test('a signal checked against the prices that followed', () => {
  const at = ts('2026-11-10T10:00:00Z');
  const bar = (i, o, h, l, c) => ({ t: at + i * 300, o, h, l, c });
  const sig = { ...parseSignal('XAUUSD BUY 2350 SL 2340 TP 2360 TP 2370'), at };
  const up = [bar(0, 2350, 2352, 2348, 2351), bar(1, 2351, 2356, 2349, 2355), bar(2, 2355, 2361, 2353, 2360), bar(3, 2360, 2363, 2357, 2362)];
  const r1 = evaluateSignal(sig, up, { tfSec: 300 });
  assert.equal(r1.status, 'tp1');
  assert.equal(r1.result, 1);
  const down = [bar(0, 2350, 2351, 2346, 2347), bar(1, 2347, 2348, 2339, 2341), bar(2, 2341, 2365, 2340, 2364)];
  const r2 = evaluateSignal(sig, down, { tfSec: 300 });
  assert.equal(r2.status, 'sl');
  assert.equal(r2.result, -1);
  // stop and target inside one candle count as a loss, to stay on the safe side
  const both = [bar(0, 2350, 2361, 2339, 2355)];
  const r3 = evaluateSignal(sig, both, { tfSec: 300 });
  assert.equal(r3.status, 'sl');
  assert.equal(r3.ambiguous, true);
});

test('channel statistics compare what was claimed with what happened', () => {
  const mk = (id, status, hit, claims = []) => ({ id, at: Number(id), parsed: { kind: 'forex' }, verified: { status, hit, result: status === 'sl' ? -1 : 1 }, claims });
  const st = channelStats([
    mk('1', 'tp1', 1, [{ event: 'win' }]),
    mk('2', 'sl', 0, [{ event: 'win' }]),
    mk('3', 'sl', 0),
    mk('4', 'tp2', 2, [{ event: 'win' }]),
    { id: '5', at: 5, parsed: { kind: 'update' } },
  ]);
  assert.equal(st.total, 4);
  assert.equal(st.verified, 4);
  assert.equal(st.wins, 2);
  assert.equal(st.winRate, 0.5);
  assert.equal(st.claimedWins, 3);
  assert.equal(st.maxLossStreak, 2);
});

test('rewriting for your own channel', () => {
  const out = formatSignal(parseSignal('XAUUSD BUY NOW @ 2350\nSL 2340\nTP1 2355\nTP2 2360'), { footer: 'قناتي' });
  assert.match(out, /^شراء XAUUSD/);
  assert.match(out, /وقف الخسارة: 2340\.00/);
  assert.match(out, /قناتي$/);
  const clean = stripPromo('XAUUSD BUY\nJoin VIP: t.me/abc\n@channelx best\nhttps://x.com/y TP 2355');
  assert.doesNotMatch(clean, /t\.me|@channelx|https?:/);
  assert.match(clean, /TP 2355/);
});

test('the library is complete and searchable', () => {
  assert.ok(ENTRIES.length >= 150);
  const keys = new Set();
  const schools = new Set(SCHOOLS.map(s => s.k));
  for (const e of ENTRIES) {
    assert.ok(!keys.has(e.k), `duplicate ${e.k}`);
    keys.add(e.k);
    assert.ok(schools.has(e.s), `${e.k} belongs to a known school`);
    assert.ok(e.n && e.d, `${e.k} has a name and a description`);
    if (e.fig) assert.match(String(figure(e.fig)), /^<svg /);
  }
  assert.equal(searchKb('رأس وكتفين')[0].e.k, 'p-hs');
  assert.equal(searchKb('head and shoulders')[0].e.k, 'p-hs');
  assert.equal(searchKb('الدوجي')[0].e.k, 'c-doji');
  assert.equal(searchKb('order block')[0].e.k, 's-ob');
  assert.equal(searchSchools('هارمونيك')[0].school.k, 'harmonic');
});
