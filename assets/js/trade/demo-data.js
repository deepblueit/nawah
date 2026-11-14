// Demonstration trading data for the demo space only: channels, signals and journal entries that
// show every state of the pages. None of it is real, and none of it reaches the real space.
import { parseSignal } from './engine/signals.js';

const H = 3600 * 1000;

export function seedTradeDemo(ts) {
  const now = Date.now();
  const q = { quiet: true };
  [['XAUUSD', '1h'], ['EURUSD', '1h'], ['GBPUSD', '1h'], ['USDJPY', '1h'], ['BTCUSDT', '4h'], ['ETHUSDT', '4h']].forEach(([s, tf], k) => ts.put('watch', { id: s, s, tf, order: k }, q));
  ts.put('channels', { id: 'demo-gold', title: 'قناة تجريبية للذهب', username: 'demo_gold', type: 'channel', role: 'source', mode: 'manual', style: 'rewrite', routeTo: ['demo-mine'], count: 6, firstAt: now - 120 * H, lastAt: now - 2 * H }, q);
  ts.put('channels', { id: 'demo-bin', title: 'قناة باينري تجريبية', username: 'demo_binary', type: 'channel', role: 'source', mode: 'manual', style: 'clean', routeTo: [], count: 4, firstAt: now - 60 * H, lastAt: now - 5 * H }, q);
  ts.put('channels', { id: 'demo-mine', title: 'قناتي التجريبية', username: 'my_demo_channel', type: 'channel', role: 'target', mode: 'manual', style: 'rewrite', routeTo: [], footer: 'قناتي للتحليل الفني', firstAt: now - 200 * H, lastAt: now - 200 * H }, q);

  const sig = (id, src, title, hoursAgo, text, extra = {}) => ts.put('signals', { id, src, srcTitle: title, msgId: Number(id.split(':')[1]), at: now - hoursAgo * H, text, parsed: parseSignal(text), claims: [], forwarded: [], status: 'new', ...extra }, q);
  sig('demo-gold:101', 'demo-gold', 'قناة تجريبية للذهب', 96, 'XAUUSD BUY NOW @ 2398\nSL 2388\nTP1 2405\nTP2 2412\nTP3 2425', { claims: [{ event: 'win', tp: 2, at: now - 90 * H, text: 'TP2 hit +140 pips' }], verified: { status: 'tp2', hit: 2, result: 0.7, tf: '5m', at: now - 80 * H } });
  sig('demo-gold:102', 'demo-gold', 'قناة تجريبية للذهب', 72, 'توصية بيع الذهب من 2422 الهدف الأول 2414 الهدف الثاني 2405 وقف الخسارة 2430', { claims: [{ event: 'win', tp: 1, at: now - 69 * H, text: 'الهدف الأول تحقق' }], verified: { status: 'sl', hit: 0, result: -1, tf: '5m', at: now - 60 * H }, late: false });
  sig('demo-gold:103', 'demo-gold', 'قناة تجريبية للذهب', 50, 'GOLD BUY LIMIT 2391\nSL2383\nTP2399\nTP2410', { edited: true, firstParsed: parseSignal('GOLD BUY LIMIT 2394\nSL2383\nTP2399\nTP2410'), claims: [{ event: 'win', tp: 1, at: now - 46 * H, text: 'TP1 hit' }], verified: { status: 'tp1', hit: 1, result: 1, tf: '5m', at: now - 40 * H } });
  sig('demo-gold:104', 'demo-gold', 'قناة تجريبية للذهب', 26, 'XAUUSD SELL 2412 Stop loss 2420', { verified: { status: 'open', hit: 0, result: 0.3, tf: '5m', at: now - 3 * H } });
  sig('demo-gold:105', 'demo-gold', 'قناة تجريبية للذهب', 2, 'الذهب شراء الان 2403\nالهدف 2410\nالهدف 2418\nوقف 2396');
  sig('demo-bin:201', 'demo-bin', 'قناة باينري تجريبية', 30, 'EURUSD UP CALL 5M 14:05 UTC+3 martingale 2', { claims: [{ event: 'win', at: now - 29 * H, text: 'WIN' }], verified: { status: 'loss', steps: [], tf: '1m', at: now - 28 * H } });
  sig('demo-bin:202', 'demo-bin', 'قناة باينري تجريبية', 20, 'EUR/USD OTC CALL 1 min', { verified: { status: 'otc', note: 'أسعار OTC لا يمكن التحقق منها', at: now - 19 * H } });
  sig('demo-bin:203', 'demo-bin', 'قناة باينري تجريبية', 6, 'صفقة هبوط باوند دولار مدة 3 دقائق الساعة 16:30', { claims: [{ event: 'win', at: now - 5.5 * H, text: 'ربح' }], verified: { status: 'win', steps: [], tf: '1m', at: now - 5 * H } });

  const T = (hoursAgo, symbol, kind, side, entry, sl, tp, exit, result, pnl, setup, emotion, plan, notes = '') => {
    const r = entry && sl && exit ? ((side === 'buy' ? 1 : -1) * (exit - entry)) / Math.abs(entry - sl) : null;
    ts.put('trades', { at: now - hoursAgo * H, symbol, kind, side, entry, sl, tp, exit, size: kind === 'binary' ? 20 : 0.1, result, pnl, r: r != null ? Math.round(r * 100) / 100 : null, setup, emotion, plan, notes }, q);
  };
  T(300, 'XAUUSD', 'fx', 'buy', 2380, 2372, 2396, 2396, 'win', 160, 'المفاهيم الذكية', 'هادئ وملتزم', 'yes', 'دخول من كتلة أوامر بعد سحب سيولة تحت قاع آسيا.');
  T(280, 'EURUSD', 'fx', 'sell', 1.0912, 1.0935, 1.0866, 1.0935, 'loss', -23, 'النماذج الكلاسيكية', 'متردد', 'yes');
  T(260, 'GBPUSD', 'fx', 'buy', 1.2705, 1.2680, 1.2755, 1.2755, 'win', 50, 'الدعم والمقاومة', 'هادئ وملتزم', 'yes');
  T(230, 'XAUUSD', 'fx', 'sell', 2410, 2418, 2394, 2418, 'loss', -80, 'توصية قناة', 'طامع', 'no', 'دخلت متأخرا بعد أن تحرك السعر.');
  T(200, 'USDJPY', 'fx', 'buy', 151.20, 150.90, 151.80, 151.80, 'win', 39, 'تحليل إكس نواة', 'هادئ وملتزم', 'yes');
  T(170, 'EURUSD', 'binary', 'buy', 1.0850, null, null, 1.0856, 'win', 17, 'الشموع اليابانية', 'هادئ وملتزم', 'yes');
  T(160, 'EURUSD', 'binary', 'sell', 1.0861, null, null, 1.0866, 'loss', -20, 'الشموع اليابانية', 'أعوض خسارة سابقة', 'no', 'مضاعفة بعد خسارة، خطأ.');
  T(140, 'BTCUSDT', 'crypto', 'buy', 66800, 66100, 68200, 68200, 'win', 200, 'المفاهيم الذكية', 'هادئ وملتزم', 'yes');
  T(120, 'XAUUSD', 'fx', 'buy', 2391, 2383, 2405, 2391, 'be', 0, 'تحليل إكس نواة', 'هادئ وملتزم', 'yes', 'نقلت الوقف إلى الدخول بعد الهدف الأول.');
  T(96, 'GBPUSD', 'fx', 'sell', 1.2788, 1.2810, 1.2744, 1.2810, 'loss', -22, 'الدعم والمقاومة', 'ملل أو رغبة في الحركة', 'no');
  T(72, 'XAUUSD', 'fx', 'sell', 2422, 2430, 2405, 2405, 'win', 170, 'المفاهيم الذكية', 'هادئ وملتزم', 'yes');
  T(48, 'ETHUSDT', 'crypto', 'sell', 3560, 3610, 3460, 3610, 'loss', -50, 'النماذج التوافقية', 'خائف من الخسارة', 'yes');
  T(24, 'EURUSD', 'fx', 'buy', 1.0840, 1.0822, 1.0876, 1.0876, 'win', 36, 'تحليل إكس نواة', 'هادئ وملتزم', 'yes');
  T(3, 'XAUUSD', 'fx', 'buy', 2403, 2396, 2418, null, 'open', null, 'توصية قناة', 'متردد', 'yes');
  ts.emit({ col: null, ids: null, source: 'seed' });
}
