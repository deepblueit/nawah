// Following signals on real prices. Signals of the same symbol share one download, and the
// timeframe is the finest one whose history still reaches back to the signal.
import { tstore } from './tstore.js';
import { loadCandles, sourceFor } from './data.js';
import { evaluateSignal, isLate } from './engine/signals.js';
import { tfInfo } from './engine/symbols.js';

function tfFor(sig, src) {
  const ageH = (Date.now() - sig.at) / 3600000;
  const bars = src === 'binance' ? 1000 : 1500;
  const fits = tf => (bars * tfInfo(tf).sec) / 3600 > ageH + 2;
  const list = sig.parsed.kind === 'binary' ? ['1m', '5m', '15m'] : ['5m', '15m', '1h', '4h', '1d'];
  return list.find(fits) || list[list.length - 1];
}

export async function verifySignals(signals, { onProgress } = {}) {
  const todo = signals.filter(s => s.parsed && s.parsed.kind !== 'update' && s.parsed.symbol);
  const groups = new Map();
  for (const s of todo) {
    if (s.parsed.otc) { tstore.patch('signals', s.id, { verified: { status: 'otc', note: 'أسعار OTC لا يمكن التحقق منها', at: Date.now() } }); continue; }
    const src = sourceFor(s.parsed.symbol);
    if (src === 'demo') { tstore.patch('signals', s.id, { verified: { status: 'no-data', note: 'لا مصدر أسعار حقيقي لهذا الرمز. أضف مفتاح Twelve Data.', at: Date.now() } }); continue; }
    const tf = tfFor(s, src);
    const k = `${s.parsed.symbol}|${tf}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  let done = 0;
  const errors = [];
  for (const [k, list] of groups) {
    const [symbol, tf] = k.split('|');
    try {
      const { candles } = await loadCandles(symbol, tf);
      const sec = tfInfo(tf).sec;
      for (const s of list) {
        const at = Math.floor(s.at / 1000);
        const v = evaluateSignal({ ...s.parsed, at, atTs: binaryStart(s, at) }, candles.filter(c => c.t + sec > at - sec), { tfSec: sec });
        const posted = candles.find(c => c.t <= at && c.t + sec > at);
        tstore.patch('signals', s.id, { verified: { ...v, tf, at: Date.now() }, late: isLate(s, posted?.c ?? null) });
        done++;
        onProgress?.(done, todo.length);
      }
    } catch (e) {
      errors.push(`${symbol}: ${e.message}`);
    }
  }
  return { done, errors };
}

// A binary signal names a clock time; its time zone is unknown, so take the reading of that time
// closest after the post (within the next hour) across all whole-hour offsets.
function binaryStart(s, postedAt) {
  const t = s.parsed.time;
  if (s.parsed.kind !== 'binary' || !t) return null;
  const [hh, mm] = t.split(':').map(Number);
  const d = new Date(postedAt * 1000);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm) / 1000;
  const offsets = s.parsed.tz != null ? [s.parsed.tz] : Array.from({ length: 27 }, (_, k) => k - 12);
  let best = null;
  for (const off of offsets) {
    for (const day of [-1, 0, 1]) {
      const cand = base - off * 3600 + day * 86400;
      const lead = cand - postedAt;
      if (lead >= -120 && lead <= 3600 && (best == null || Math.abs(lead) < Math.abs(best - postedAt))) best = cand;
    }
  }
  return best;
}
