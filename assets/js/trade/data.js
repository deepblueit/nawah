// Market data: Binance for crypto (free, no key), Twelve Data for forex, metals and more (a free
// key, 8 requests a minute and 800 a day), files exported from MetaTrader or TradingView, and
// demonstration prices. Candles are cached on the device so a reload or a second look costs no
// request, and only the missing tail is fetched when the cache is a little old.
import { symbolInfo, tfInfo } from './engine/symbols.js';
import { demoState, demoTick } from './engine/gen.js';
import { marketClock, dayKey, weekKey, fxClosedAt } from './engine/time.js';
import { secret, tstore } from './tstore.js';
import { local } from '../core/util.js';

const BN = 'https://data-api.binance.vision/api/v3';
const BN_WS = 'wss://data-stream.binance.vision/ws';
const TD = 'https://api.twelvedata.com';
// the public demonstration key of Twelve Data answers for a few symbols only
const TD_DEMO = ['EURUSD', 'USDJPY', 'BTCUSDT'];

export const SOURCE_NAMES = { binance: 'Binance', twelvedata: 'Twelve Data', demo: 'بيانات تجريبية', csv: 'ملف مستورد' };

// ---------- a small IndexedDB cache
let dbp = null;
function cacheDb() {
  if (dbp) return dbp;
  dbp = new Promise(ok => {
    try {
      const req = indexedDB.open('nawah-trade-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ok(null);
    } catch (_) { ok(null); }
  });
  return dbp;
}
async function cget(key) {
  const db = await cacheDb();
  if (!db) return null;
  return new Promise(ok => {
    try { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); } catch (_) { ok(null); }
  });
}
async function cset(key, value) {
  const db = await cacheDb();
  if (!db) return;
  try { db.transaction('kv', 'readwrite').objectStore('kv').put(value, key); } catch (_) { /* full or closed */ }
}
export async function clearCache() {
  const db = await cacheDb();
  if (db) try { db.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (_) { /* ignore */ }
  mem.clear();
}

// ---------- which source serves a symbol
export function sourceFor(symbol, wanted = 'auto') {
  const info = symbolInfo(symbol);
  if (wanted && wanted !== 'auto') return wanted;
  if (local.get(csvKey(symbol, null), null)?.tfs) return 'csv';
  if (!info) return 'demo';
  if (info.cls === 'crypto') return 'binance';
  if (secret.get('td') || TD_DEMO.includes(info.s)) return 'twelvedata';
  return 'demo';
}
const csvKey = (symbol, tf) => `nawah.csv.${symbol}${tf ? '.' + tf : ''}`;

// ---------- Twelve Data credits: a minute window and a day count kept on the device
const credits = {
  get() {
    const today = new Date().toISOString().slice(0, 10);
    const c = local.get('nawah.td.credits', { day: today, n: 0, recent: [] });
    if (c.day !== today) { c.day = today; c.n = 0; }
    c.recent = (c.recent || []).filter(t => Date.now() - t < 61000);
    return c;
  },
  async take() {
    let c = this.get();
    if (c.n >= 790) throw new Error('استهلكت رصيد Twelve Data اليومي (800 طلب). يتجدد الرصيد بعد منتصف الليل بتوقيت UTC.');
    if (c.recent.length >= 7) {
      const wait = 61000 - (Date.now() - c.recent[0]);
      await new Promise(r => setTimeout(r, Math.max(500, wait)));
      c = this.get();
    }
    c.n++;
    c.recent.push(Date.now());
    local.set('nawah.td.credits', c);
  },
};
export const tdCredits = () => credits.get();

async function getJson(url) {
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); } catch (_) { throw new Error('لا يوجد اتصال بالإنترنت، أو أن المتصفح منع الطلب.'); }
  let j = null;
  try { j = await res.json(); } catch (_) { /* not json */ }
  if (!res.ok) {
    if (res.status === 451 || res.status === 403) throw new Error('مزود البيانات يمنع الطلب من منطقتك.');
    throw new Error(j?.msg || j?.message || `خطأ من مزود البيانات (${res.status})`);
  }
  return j;
}

// ---------- providers
async function binanceCandles(info, tfi, limit = 1000) {
  const rows = await getJson(`${BN}/klines?symbol=${info.bn || info.s}&interval=${tfi.bn}&limit=${limit}`);
  return rows.map(r => ({ t: Math.floor(r[0] / 1000), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
}

function tdKey(info) {
  const own = secret.get('td');
  if (own) return own;
  if (TD_DEMO.includes(info.s)) return 'demo';
  throw new Error('هذا الرمز يحتاج مفتاح Twelve Data المجاني. أضفه من إعدادات التداول.');
}

async function twelveCandles(info, tfi, outputsize) {
  const key = tdKey(info);
  await credits.take();
  const url = `${TD}/time_series?symbol=${encodeURIComponent(info.td || info.s)}&interval=${tfi.td}&outputsize=${outputsize}&timezone=UTC&order=asc&apikey=${encodeURIComponent(key)}`;
  const j = await getJson(url);
  if (j.status === 'error') {
    if (j.code === 429) throw new Error('وصلت حد Twelve Data في الدقيقة. أعد المحاولة بعد دقيقة.');
    if (j.code === 401 || j.code === 403) throw new Error(key === 'demo' ? 'مفتاح العرض لا يخدم هذا الرمز. أضف مفتاحك المجاني من إعدادات التداول.' : 'مفتاح Twelve Data غير صالح أو لا يشمل هذا الرمز.');
    throw new Error(j.message || 'رفض Twelve Data الطلب.');
  }
  const rows = (j.values || []).map(v => {
    const s = v.datetime.length > 10 ? v.datetime.replace(' ', 'T') + 'Z' : v.datetime + 'T00:00:00Z';
    return { t: Math.floor(Date.parse(s) / 1000), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +(v.volume || 0) };
  });
  // the feed carries weekend quotes for currencies and metals; the forex market itself is closed
  // then, and those bars would distort ranges and patterns, so they are left out
  if (info.cls === 'fx' || info.cls === 'metal') {
    return rows.filter(c => !(fxClosedAt(c.t) && fxClosedAt(c.t + tfi.sec - 60)) && !(tfi.sec >= 86400 && new Date(c.t * 1000).getUTCDay() === 6));
  }
  return rows;
}

function merge(old, fresh) {
  if (!old?.length) return fresh;
  const from = fresh[0]?.t ?? Infinity;
  return [...old.filter(c => c.t < from), ...fresh];
}

// ---------- the public entry: candles for a symbol and timeframe
const mem = new Map();
const demos = new Map();

export async function loadCandles(symbol, tf, { src = 'auto', force = false } = {}) {
  const info = symbolInfo(symbol);
  const tfi = tfInfo(tf);
  const source = sourceFor(symbol, src);
  const key = `${source}:${symbol}:${tf}`;
  const now = Math.floor(Date.now() / 1000);
  if (source === 'demo') {
    let st = demos.get(key);
    if (!st || force) { st = demoState(symbol, tf, { now }); demos.set(key, st); }
    return { candles: st.candles, source, info, note: 'أسعار تجريبية مولدة للعرض والتجربة، وليست أسعار السوق.' };
  }
  if (source === 'csv') {
    const meta = local.get(csvKey(symbol, null), null) || {};
    let saved = await cget(`csv:${symbol}:${tf}`);
    let note = '';
    if (!saved) {
      // build a higher timeframe from the finest imported one that divides it
      const lower = (meta.tfs || []).map(k => tfInfo(k)).filter(x => x.sec < tfi.sec && tfi.sec % x.sec === 0).sort((a, b) => b.sec - a.sec)[0];
      if (!lower) throw new Error(`الملف المستورد لهذا الرمز على ${(meta.tfs || []).map(k => tfInfo(k).ar).join(' و') || 'إطار آخر'} فقط.`);
      const base = await cget(`csv:${symbol}:${lower.k}`);
      saved = { ...base, candles: resample(base.candles, tfi.sec, info && info.cls !== 'crypto') };
      note = ` مجمعة من إطار ${lower.ar}.`;
    }
    return { candles: saved.candles, source, info, note: `من ملف مستورد (${saved.name || 'ملف'})، ولا يتحدث تلقائيا.${note}` };
  }
  if (!info) throw new Error('رمز غير معروف.');
  let cached = mem.get(key) || (await cget(key));
  const age = cached ? now - cached.fetchedAt : Infinity;
  const fresh = Math.min(tfi.sec / 2, 300);
  const closed = info.cls !== 'crypto' && marketClock(now, info.cls).fxClosed;
  if (cached && !force && (age < fresh || (closed && age < 6 * 3600))) return { candles: cached.candles, source, info, cachedAt: cached.fetchedAt };
  let candles;
  if (source === 'binance') candles = await binanceCandles(info, tfi, 1000);
  else {
    const lastT = cached?.candles?.at(-1)?.t;
    const need = lastT ? Math.ceil((now - lastT) / tfi.sec) + 3 : 1500;
    candles = cached && need <= 1500 && !force ? merge(cached.candles, await twelveCandles(info, tfi, Math.max(3, need))) : await twelveCandles(info, tfi, 1500);
  }
  if (candles.length > 3000) candles = candles.slice(-3000);
  cached = { candles, fetchedAt: now };
  mem.set(key, cached);
  cset(key, cached);
  return { candles, source, info, note: source === 'twelvedata' && tdKey(info) === 'demo' ? 'من Twelve Data بمفتاح العرض العام.' : '' };
}

export async function saveCsv(symbol, tf, candles, name) {
  await cset(`csv:${symbol}:${tf}`, { candles, name, at: Date.now() });
  const meta = local.get(csvKey(symbol, null), null) || {};
  local.set(csvKey(symbol, null), { tfs: [...new Set([...(meta.tfs || []), tf])], name });
}

// Candles of a higher timeframe built from lower ones. Daily bars of forex end at the New York close.
export function resample(cs, sec, ny = false) {
  const out = [];
  let cur = null;
  for (const c of cs) {
    const k = sec >= 86400 ? (sec === 604800 ? weekKey(c.t, ny) : dayKey(c.t, ny)) : Math.floor(c.t / sec);
    if (!cur || cur.k !== k) {
      if (cur) out.push(cur.c);
      cur = { k, c: { t: sec >= 86400 ? c.t : k * sec, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v || 0 } };
    } else {
      cur.c.h = Math.max(cur.c.h, c.h);
      cur.c.l = Math.min(cur.c.l, c.l);
      cur.c.c = c.c;
      cur.c.v += c.v || 0;
    }
  }
  if (cur) out.push(cur.c);
  return out;
}
export function forgetCsv(symbol) { local.del(csvKey(symbol, null)); }

// ---------- live updates
// onUpdate(candle, closed) is called on each change; returns a function that stops the feed.
export function subscribe(symbol, tf, onUpdate, { src = 'auto' } = {}) {
  const info = symbolInfo(symbol);
  const tfi = tfInfo(tf);
  const source = sourceFor(symbol, src);
  let stopped = false;
  if (source === 'demo') {
    const key = `${source}:${symbol}:${tf}`;
    const id = setInterval(() => {
      const st = demos.get(key);
      if (!st || document.hidden) return;
      const res = demoTick(st);
      if (res) onUpdate(res.candle, res.closed);
    }, 1500);
    return () => clearInterval(id);
  }
  if (source === 'binance' && 'WebSocket' in window) {
    let ws;
    let retry = 0;
    const open = () => {
      if (stopped) return;
      ws = new WebSocket(`${BN_WS}/${(info.bn || info.s).toLowerCase()}@kline_${tfi.bn}`);
      ws.onmessage = ev => {
        try {
          const k = JSON.parse(ev.data).k;
          retry = 0;
          onUpdate({ t: Math.floor(k.t / 1000), o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }, !!k.x);
        } catch (_) { /* ignore malformed frames */ }
      };
      ws.onclose = () => { if (!stopped) setTimeout(open, Math.min(30000, 2000 * 2 ** retry++)); };
    };
    open();
    return () => { stopped = true; try { ws?.close(); } catch (_) { /* closed */ } };
  }
  if (source === 'twelvedata') {
    const every = Math.max(60, Math.min(600, tfi.sec / 4)) * 1000;
    const id = setInterval(async () => {
      if (document.hidden || stopped) return;
      if (info.cls !== 'crypto' && marketClock(Math.floor(Date.now() / 1000), info.cls).fxClosed) return;
      try {
        const res = await loadCandles(symbol, tf, { src });
        const last = res.candles.at(-1);
        if (last) onUpdate(last, false, res.candles);
      } catch (_) { /* the next round retries */ }
    }, every);
    return () => { stopped = true; clearInterval(id); };
  }
  return () => {};
}

// ---------- prices for the watch list, cheap: one Binance request for all crypto, cached
// candles for the rest, and the generator for demonstration symbols
export async function quotes(symbols) {
  const out = {};
  const crypto = symbols.filter(s => symbolInfo(s)?.cls === 'crypto' && sourceFor(s) === 'binance');
  if (crypto.length) {
    try {
      const list = await getJson(`${BN}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(crypto.map(s => symbolInfo(s).bn || s)))}`);
      for (const q of list) out[q.symbol] = { price: +q.lastPrice, change: +q.priceChangePercent };
    } catch (_) { /* offline: fall back to the cache */ }
  }
  for (const s of symbols) {
    if (out[s]) continue;
    const src = sourceFor(s);
    if (src === 'demo') {
      const st = demos.get(`demo:${s}:1h`) || demoState(s, '1h');
      demos.set(`demo:${s}:1h`, st);
      const cs = st.candles;
      const last = cs.at(-1);
      const dayAgo = cs[Math.max(0, cs.length - 25)];
      out[s] = { price: last.c, change: ((last.c - dayAgo.c) / dayAgo.c) * 100, demo: true };
      continue;
    }
    for (const tf of ['1h', '15m', '4h', '5m', '1d']) {
      const c = mem.get(`${src}:${s}:${tf}`) || (await cget(`${src}:${s}:${tf}`));
      if (c?.candles?.length) {
        const cs = c.candles;
        const last = cs.at(-1);
        const back = Math.max(0, cs.length - 1 - Math.round(86400 / tfInfo(tf).sec));
        out[s] = { price: last.c, change: ((last.c - cs[back].c) / cs[back].c) * 100, stale: Math.floor(Date.now() / 1000) - c.fetchedAt > 3600 };
        break;
      }
    }
  }
  return out;
}

export const watchList = () => tstore.all('watch').sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
