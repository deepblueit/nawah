// Trading signals as channels post them: read them from free text (Arabic, English, numbers,
// symbols), check that they make sense, follow them on real prices, and keep honest statistics
// that separate what a channel claims from what the prices show.
import { findSymbol, findTimeframe, normAr, symbolInfo, fmtPrice } from './symbols.js';

// ---------- reading numbers
// numbers glued to letters (H1, M5, MT4) are labels, not prices
const NUM = /(?<![\d.\p{L}])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|(?<![\d.\p{L}])\d+(?:[.,]\d+)?/gu;
function toNum(s) {
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
  return Number(s.replace(',', '.'));
}
const numbersIn = s => [...String(s).matchAll(NUM)].map(m => ({ v: toNum(m[0]), at: m.index, raw: m[0] })).filter(x => Number.isFinite(x.v));

// ---------- vocabulary (normalised Arabic and English)
const BUY = /\b(buy|long|bullish)\b|شراء|اشتري|اشترى|(?:^|\s)باي(?:\s|$)|\uD83D\uDFE2|\uD83D\uDCC8|\u2B06|\uD83D\uDD3C/i;
const SELL = /\b(sell|short|bearish)\b|بيع|(?:^|\s)سيل(?:\s|$)|\uD83D\uDD34|\uD83D\uDCC9|\u2B07|\uD83D\uDD3D/i;
const CALL = /\b(call|up|higher)\b|صعود|اعلي|اعلى|فوق|(?:^|\s)كول(?=$|\s)/i;
const PUT = /\b(put|down|lower)\b|هبوط|نزول|ادنى|ادني|تحت|(?:^|\s)بوت(?=$|\s)/i;
const BINARY_HINT = /\b(binary|otc|quotex|pocket\s*option|iq\s*option|olymp|expert\s*option|binomo|deriv|expiry|expiration|expire|martingale|gale|mg\d?)\b|باينري|خيارات ثنائيه|مضاعفه|انتهاء|مده الصفقه/i;
const LIMIT = /\b(buy|sell)\s*limit\b|\blimit\b|معلق|ليميت/i;
const STOP_ORDER = /\b(buy|sell)\s*stop\b(?!\s*loss)/i;
const MARKET = /\b(now|market|instant|cmp)\b|الان|فوري|من السعر الحالي|سعر السوق/i;

const RESULT_WIN = /\b(tp\s*\d?\s*(hit|done|reached|\u2705)|target\s*\d?\s*(hit|done|reached)|hit\s*tp\s*\d?|win|won|profit|in profit|\+\s*\d+\s*pips?)\b|\u2705|\uD83D\uDCB0|تحقق|تحقيق الهدف|محقق|ضرب الهدف|ضربت الاهداف|تم الهدف|ربح|رابحه|ناجحه|مبروك/i;
const RESULT_LOSS = /\b(sl\s*(hit|touched)|stop\s*loss\s*(hit|touched)|stopped\s*out|loss|lost|-\s*\d+\s*pips?)\b|\u274C|ضرب الستوب|ضرب الوقف|ضرب وقف الخساره|تفعل الستوب|خساره|خسرت|خاسره/i;
const RESULT_BE = /\b(break\s*even|breakeven|sl\s*(to|at)\s*(entry|be)|move\s*sl)\b|تامين|الوقف على الدخول|نقل الوقف/i;
const RESULT_CLOSE = /\b(close|closed|exit)\b(?!\s*(above|below))|اغلق|اقفل|اغلاق الصفقه|خروج/i;

const KEY = {
  entry: /\b(entry|enter|open|price|@|from|zone|between)\b|@|سعر الدخول|الدخول|دخول|ادخل|السعر|من سعر|من منطقه|منطقه/gi,
  sl: /\b(sl|s\/l|stop\s*loss|stoploss|stop)\b|\uD83D\uDED1|وقف الخساره|وقف خساره|الوقف|وقف|ستوب لوز|ستوب|استوب|الاستوب|الستوب/gi,
  tp: /\b(?:tp|t\/p|take\s*profit|targets?)(?:\s*\d(?![\d.,]))?|\uD83C\uDFAF|الهدف\s*(?:الاول|الثاني|الثالث|الرابع|\d(?![\d.,]))?|هدف\s*(?:اول|ثاني|ثالث|رابع|\d(?![\d.,]))?|الاهداف|اهداف|التارجت|تارجت|تارقت|تي بي/gi,
};

const ORD = { 'الاول': 1, 'اول': 1, 'الثاني': 2, 'ثاني': 2, 'الثالث': 3, 'ثالث': 3, 'الرابع': 4, 'رابع': 4 };

// ---------- the parser
export function parseSignal(text, { price = null } = {}) {
  const original = String(text || '');
  const t = normAr(original).replace(/[\u200f\u200e\u202a-\u202e]/g, ' ').replace(/\b(sl|s\/l|tp|t\/p)(?=\d{3,})/gi, '$1 ');
  const out = { text: original, kind: null, symbol: null, side: null, order: 'market', entry: null, zone: null, sl: null, tps: [], expiryMin: null, time: null, tz: null, otc: false, mg: 0, tf: null, issues: [], missing: [], quality: 0 };
  const sym = findSymbol(original);
  if (sym) { out.symbol = sym.s; out.otc = !!sym.otc; }
  if (/\botc\b/i.test(t)) out.otc = true;

  // results and management updates are short messages without a full set of levels
  const nums = numbersIn(t);
  const hasLevels = new RegExp(KEY.sl.source, 'i').test(t) || /\btp\s*\d|take\s*profit|الهدف|هدف|تارجت/i.test(t);
  if (!hasLevels || original.length < 90) {
    // "stop loss" and "وقف الخسارة" name a level, not a lost trade
    const rt = t.replace(/stop\s*loss|stoploss|وقف\s*(ال)?خساره/g, ' sl ');
    const res = RESULT_LOSS.test(rt) ? 'loss' : RESULT_WIN.test(rt) ? 'win' : RESULT_BE.test(rt) ? 'be' : RESULT_CLOSE.test(rt) ? 'close' : null;
    const tpN = (t.match(/\btp\s*(\d)|الهدف\s*(الاول|الثاني|الثالث|الرابع|\d)/i) || []).slice(1).find(Boolean);
    if (res && !(sideOf(t) && nums.length >= 3)) {
      const level = tpN ? ORD[tpN] || Number(tpN) || 1 : null;
      return { ...out, kind: 'update', event: res, tp: res === 'win' ? level || 1 : null, pips: (t.match(/([+-]?\s*\d+(?:\.\d+)?)\s*(pips?|نقطه|نقاط)/i) || [])[1]?.replace(/\s/g, '') || null };
    }
  }

  const side = sideOf(t);
  const binary = BINARY_HINT.test(t) || out.otc || (!BUY.test(t) && !SELL.test(t) && (CALL.test(t) || PUT.test(t)));
  out.kind = binary ? 'binary' : 'forex';
  out.side = side;
  out.tf = findTimeframe(t);

  if (binary) {
    const m = t.match(/(\d+)\s*(min|mins|minute|minutes|m\b|دقيقه|دقائق|دقايق|د\b)/i) || t.match(/\bm(\d+)\b/i) || t.match(/(?:expiry|expiration|انتهاء|مده)\D{0,12}(\d+)/i);
    if (m) out.expiryMin = Number(m[1]);
    else if (/دقيقه|\b1\s*min/i.test(t)) out.expiryMin = 1;
    const hm = t.match(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
    if (hm) out.time = `${hm[1].padStart(2, '0')}:${hm[2]}`;
    const tz = t.match(/\b(utc|gmt)\s*([+-]\s*\d{1,2})?/i);
    if (tz) out.tz = tz[2] ? Number(tz[2].replace(/\s/g, '')) : 0;
    const mg = t.match(/(?:martingale|gale|mg|مضاعفه|مضاعفات)\D{0,6}(\d)/i) || t.match(/(\d)\s*(?:martingale|gale|steps?|مضاعف|مضاعفات)/i);
    if (mg) out.mg = Number(mg[1]);
    if (!out.side) out.missing.push('الاتجاه');
    if (!out.symbol) out.missing.push('الرمز');
    if (!out.expiryMin) out.missing.push('مدة الانتهاء');
    out.quality = (out.side ? 0.4 : 0) + (out.symbol ? 0.3 : 0) + (out.expiryMin ? 0.3 : 0);
    if (out.mg >= 2) out.issues.push(`التوصية تطلب ${out.mg} مضاعفات؛ المضاعفة ترفع الخسارة المحتملة أضعافا ولا تغير احتمال النجاح.`);
    if (out.otc) out.issues.push('رمز OTC: سعر يولده الوسيط ولا يمكن التحقق من نتيجته بأسعار السوق.');
    return out;
  }

  if (LIMIT.test(t)) out.order = 'limit';
  else if (STOP_ORDER.test(t)) out.order = 'stop';
  else if (MARKET.test(t)) out.order = 'market';

  // label each number by the nearest keyword before it on the same line
  const lines = t.split(/\n|\|/);
  const levels = { entry: [], sl: [], tp: [] };
  for (const line of lines) {
    const marks = [];
    for (const [k, re] of Object.entries(KEY)) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        if (k === 'sl' && /^stop$/i.test(m[0]) && /(buy|sell)\s*$/i.test(line.slice(Math.max(0, m.index - 8), m.index))) continue;
        marks.push({ k, at: m.index, end: m.index + m[0].length, raw: m[0] });
      }
    }
    marks.sort((x, y) => x.at - y.at);
    const ns = numbersIn(line);
    for (const n of ns) {
      const before = marks.filter(mk => mk.end <= n.at + 1);
      const mk = before[before.length - 1];
      const tail = line.slice(n.at + n.raw.length, n.at + n.raw.length + 8);
      const isPips = /^\s*(pips?|نقطه|نقاط|بيب)/i.test(tail);
      const isPct = /^\s*%/.test(tail);
      if (isPct) continue;
      // the digit inside "TP1" is a label, not a level
      if (mk && mk.k === 'tp' && n.at < mk.end && /\d\s*$/.test(mk.raw)) continue;
      const clock = /^:\d\d/.test(tail) || /\d:\s*$/.test(line.slice(Math.max(0, n.at - 3), n.at));
      if (!mk) { levels.entry.push({ ...n, loose: true, isPips, clock }); continue; }
      levels[mk.k].push({ ...n, isPips });
    }
  }
  // a symbol code like XAUUSD carries no digits; time stamps and timeframes do, so drop small loose numbers
  const ref = levels.sl.find(x => !x.isPips)?.v || levels.tp.find(x => !x.isPips)?.v || price || null;
  const plausible = v => !ref || (v > ref * 0.5 && v < ref * 1.5);
  const nearRef = x => !x.loose || !ref || Math.abs(x.v - ref) / ref < 0.05;
  let entries = levels.entry.filter(x => !x.isPips && !x.clock && plausible(x.v) && nearRef(x));
  if (entries.length > 2) entries = entries.slice(0, 2);
  if (entries.length === 2) { out.zone = [Math.min(entries[0].v, entries[1].v), Math.max(entries[0].v, entries[1].v)]; out.entry = side === 'sell' ? out.zone[0] : out.zone[1]; if (out.order === 'market' && !MARKET.test(t)) out.order = 'zone'; }
  else if (entries.length === 1) out.entry = entries[0].v;
  const info = symbolInfo(out.symbol);
  const dir = side === 'buy' ? 1 : side === 'sell' ? -1 : 0;
  const fromPips = (x, sign) => (out.entry != null && info?.pip ? out.entry + sign * x.v * info.pip : null);
  if (out.entry == null && out.order === 'market' && price) { out.entry = price; out.entryAssumed = true; }
  const slv = levels.sl[0];
  if (slv) out.sl = slv.isPips ? fromPips(slv, -dir) : plausible(slv.v) ? slv.v : null;
  out.tps = levels.tp.map(x => (x.isPips ? fromPips(x, dir) : plausible(x.v) ? x.v : null)).filter(v => v != null);
  // "TP 2355 / 2360 / 2370" puts several numbers after one keyword: keep them all
  if (dir && out.tps.length > 1) out.tps = [...new Set(out.tps)].sort((x, y) => dir * (x - y));

  // ---------- sanity
  if (!out.symbol) out.missing.push('الرمز');
  if (!out.side) out.missing.push('الاتجاه');
  if (out.entry == null) out.missing.push('سعر الدخول');
  if (out.sl == null) out.missing.push('وقف الخسارة');
  if (!out.tps.length) out.missing.push('الأهداف');
  if (dir && out.entry != null) {
    if (out.sl != null && dir * (out.entry - out.sl) <= 0) out.issues.push('وقف الخسارة في الجهة الخطأ من سعر الدخول.');
    const wrong = out.tps.filter(tp => dir * (tp - out.entry) <= 0);
    if (wrong.length) out.issues.push('هدف أو أكثر في الجهة الخطأ من سعر الدخول.');
    if (out.sl != null && out.tps.length) {
      const risk = Math.abs(out.entry - out.sl);
      const rr = Math.abs(out.tps[0] - out.entry) / (risk || 1);
      out.rr = rr;
      if (info?.pip) { out.riskPips = risk / info.pip; out.tpPips = out.tps.map(tp => Math.abs(tp - out.entry) / info.pip); }
      if (rr < 0.7) out.issues.push(`العائد للهدف الأول ${rr.toFixed(2)} من المخاطرة فقط: تحتاج نسبة نجاح عالية جدا لتربح.`);
    }
    if (price && Math.abs(out.entry - price) / price > 0.02 && info?.cls !== 'crypto') out.issues.push('سعر الدخول بعيد عن السعر الحالي.');
  }
  if (out.sl == null && out.side) out.issues.push('توصية بلا وقف خسارة؛ لا تدخلها قبل أن تحدد وقفك بنفسك.');
  out.quality = (out.symbol ? 0.2 : 0) + (out.side ? 0.2 : 0) + (out.entry != null ? 0.2 : 0) + (out.sl != null ? 0.25 : 0) + (out.tps.length ? 0.15 : 0) - Math.min(0.3, out.issues.length * 0.1);
  out.quality = Math.max(0, Math.round(out.quality * 100) / 100);
  return out;
}

function sideOf(t) {
  const b = t.search(BUY);
  const s = t.search(SELL);
  if (b >= 0 && (s < 0 || b < s)) return 'buy';
  if (s >= 0) return 'sell';
  const c = t.search(CALL);
  const p = t.search(PUT);
  if (c >= 0 && (p < 0 || c < p)) return 'buy';
  if (p >= 0) return 'sell';
  return null;
}

export const isSignal = p => p && p.kind !== 'update' && p.symbol && p.side && (p.kind === 'binary' ? true : p.entry != null || p.sl != null || p.tps.length > 0);

// ---------- following a signal on prices
// candles: ascending, covering the signal time to now. Returns what actually happened.
export function evaluateSignal(sig, candles, { tfSec = 300 } = {}) {
  if (!candles?.length) return { status: 'no-data' };
  const at = Math.floor((sig.at || sig.date || 0) / (sig.at > 1e12 ? 1000 : 1));
  if (sig.kind === 'binary') return evaluateBinary(sig, candles, at, tfSec);
  const dir = sig.side === 'buy' ? 1 : -1;
  const startI = candles.findIndex(c => c.t + tfSec > at);
  if (startI < 0) return { status: 'no-data' };
  let entry = sig.entry;
  let fillI = -1;
  const touch = (c, p) => c.l <= p && c.h >= p;
  if (sig.order === 'market' || sig.order === 'zone' || entry == null) {
    const c0 = candles[startI];
    if (entry != null && (touch(c0, entry) || (candles[startI + 1] && touch(candles[startI + 1], entry)) || sig.order === 'zone')) fillI = touch(c0, entry) ? startI : startI + 1;
    if (fillI < 0) { fillI = Math.min(startI + 1, candles.length - 1); entry = candles[fillI].o; }
  } else {
    for (let i = startI; i < candles.length; i++) {
      const c = candles[i];
      if (sig.tps[0] != null && dir * ((dir === 1 ? c.h : c.l) - sig.tps[0]) >= 0 && !touch(c, entry)) return { status: 'missed', note: 'وصل السعر إلى الهدف الأول قبل أن يتفعل أمر الدخول' };
      if (touch(c, entry) || (sig.order === 'stop' ? dir * (c.c - entry) > 0 : false)) { fillI = i; break; }
      if (i - startI > Math.max(48, Math.round((3 * 86400) / tfSec))) return { status: 'not-filled', note: 'لم يصل السعر إلى سعر الدخول خلال ثلاثة أيام' };
    }
    if (fillI < 0) return { status: 'pending' };
  }
  const sl = sig.sl;
  const tps = sig.tps || [];
  const risk = sl != null ? Math.abs(entry - sl) : null;
  let hit = 0;
  let stopped = false;
  let ambiguous = false;
  let mfe = 0;
  let mae = 0;
  let endI = candles.length - 1;
  for (let i = fillI; i < candles.length; i++) {
    const c = candles[i];
    const fav = dir === 1 ? c.h - entry : entry - c.l;
    const adv = dir === 1 ? entry - c.l : c.h - entry;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);
    const slHit = sl != null && (dir === 1 ? c.l <= sl : c.h >= sl);
    let tpHitHere = hit;
    for (let k = hit; k < tps.length; k++) if (dir === 1 ? c.h >= tps[k] : c.l <= tps[k]) tpHitHere = k + 1;
    if (slHit && tpHitHere > hit) { ambiguous = true; stopped = true; endI = i; break; }
    if (slHit) { stopped = true; endI = i; break; }
    hit = tpHitHere;
    if (hit === tps.length && tps.length) { endI = i; break; }
  }
  const last = candles[candles.length - 1];
  const R = p => (risk ? (dir * (p - entry)) / risk : null);
  const r1 = tps[0] != null && risk ? R(tps[0]) : null;
  let status;
  if (stopped && hit === 0) status = 'sl';
  else if (hit > 0) status = `tp${hit}`;
  else status = 'open';
  // the simple policy most channels use: take the first target, or lose the stop
  const result = status === 'sl' ? -1 : hit > 0 ? r1 : R(last.c);
  return {
    status, hit, stopped, ambiguous, entry, fillT: candles[fillI].t, endT: candles[endI].t,
    result, mfe: risk ? mfe / risk : null, mae: risk ? mae / risk : null, risk,
    note: ambiguous ? 'لمس السعر الوقف والهدف في الشمعة نفسها؛ احتسبت خسارة احتياطا.' : '',
  };
}

function evaluateBinary(sig, candles, at, tfSec) {
  if (sig.otc) return { status: 'otc', note: 'أسعار OTC لا يمكن التحقق منها' };
  if (!sig.expiryMin) return { status: 'no-expiry' };
  const exp = sig.expiryMin * 60;
  // a signal names a time; otherwise it starts at the next candle open after posting
  let start = Math.ceil(at / 60) * 60;
  if (sig.atTs) start = sig.atTs;
  const dir = sig.side === 'buy' ? 1 : -1;
  const steps = [];
  for (let k = 0; k <= (sig.mg || 0); k++) {
    const s = start + k * exp;
    const e = s + exp;
    const cOpen = candles.find(c => c.t <= s && c.t + tfSec > s);
    const cClose = candles.find(c => c.t < e && c.t + tfSec >= e);
    if (!cOpen || !cClose) { steps.push({ k, status: 'pending' }); break; }
    const pOpen = cOpen.t === s ? cOpen.o : cOpen.c;
    const pClose = cClose.c;
    const st = pClose === pOpen ? 'draw' : dir * (pClose - pOpen) > 0 ? 'win' : 'loss';
    steps.push({ k, status: st, open: pOpen, close: pClose });
    if (st !== 'loss') break;
  }
  const lastStep = steps[steps.length - 1];
  const status = lastStep.status === 'pending' ? 'pending' : lastStep.status === 'win' ? (lastStep.k ? `win-mg${lastStep.k}` : 'win') : lastStep.status;
  return { status, steps, approx: tfSec > 60, note: tfSec > 60 ? 'النتيجة تقريبية لأن البيانات ليست بالدقيقة' : '' };
}

// ---------- statistics for one channel
export function channelStats(signals) {
  const list = signals.filter(s => s.parsed && s.parsed.kind !== 'update');
  const ev = list.filter(s => s.verified && !['no-data', 'pending', 'otc', 'no-expiry'].includes(s.verified.status));
  const fx = ev.filter(s => s.parsed.kind === 'forex' && !['not-filled', 'missed', 'open'].includes(s.verified.status));
  const bin = ev.filter(s => s.parsed.kind === 'binary' && !String(s.verified.status).startsWith('pending'));
  const wins = fx.filter(s => s.verified.hit > 0).length + bin.filter(s => String(s.verified.status).startsWith('win')).length;
  const losses = fx.filter(s => s.verified.status === 'sl').length + bin.filter(s => s.verified.status === 'loss').length;
  const decided = wins + losses;
  const rs = fx.map(s => s.verified.result).filter(Number.isFinite);
  const gross = rs.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const loss = -rs.filter(r => r < 0).reduce((a, b) => a + b, 0);
  let streak = 0;
  let maxStreak = 0;
  for (const s of [...fx, ...bin].sort((a, b) => (a.at || 0) - (b.at || 0))) {
    const lost = s.verified.status === 'sl' || s.verified.status === 'loss';
    streak = lost ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  const claimedW = list.filter(s => (s.claims || []).some(c => c.event === 'win')).length;
  const claimedL = list.filter(s => (s.claims || []).some(c => c.event === 'loss')).length;
  return {
    total: list.length,
    verified: decided,
    wins, losses,
    winRate: decided ? wins / decided : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    profitFactor: loss ? gross / loss : gross ? Infinity : null,
    maxLossStreak: maxStreak,
    open: ev.filter(s => s.verified.status === 'open').length,
    notFilled: ev.filter(s => ['not-filled', 'missed'].includes(s.verified.status)).length,
    claimedWins: claimedW, claimedLosses: claimedL,
    claimedWinRate: claimedW + claimedL ? claimedW / (claimedW + claimedL) : null,
    edited: list.filter(s => s.edited).length,
    deleted: list.filter(s => s.deletedBySource).length,
    noStop: list.filter(s => s.parsed.kind === 'forex' && s.parsed.sl == null).length,
    late: list.filter(s => s.late).length,
    sample: decided < 30 ? 'small' : decided < 100 ? 'medium' : 'large',
  };
}

// A signal posted after the move already happened: price had passed the first target.
export function isLate(sig, priceAtPost) {
  const p = sig.parsed || sig;
  if (!p || p.kind !== 'forex' || priceAtPost == null || !p.tps?.length || p.entry == null) return false;
  const dir = p.side === 'buy' ? 1 : -1;
  return dir * (priceAtPost - p.tps[0]) >= 0;
}

// ---------- writing a signal for forwarding
const SIDE_AR = { buy: 'شراء', sell: 'بيع' };
export const DEFAULT_TEMPLATE = '{side} {symbol}\nالدخول: {entry}\nوقف الخسارة: {sl}\n{tps}\n{note}';
export const DEFAULT_BINARY_TEMPLATE = '{symbol} {direction}\nالانتهاء: {expiry}\n{time}\n{note}';

export function formatSignal(p, { template, footer = '', source = '', note = '' } = {}) {
  const info = symbolInfo(p.symbol);
  const F = v => (v == null ? 'غير محدد' : fmtPrice(v, info));
  const vars = {
    symbol: p.symbol || '',
    side: SIDE_AR[p.side] || '',
    direction: p.side === 'buy' ? 'صعود (Call)' : p.side === 'sell' ? 'هبوط (Put)' : '',
    entry: p.zone ? `${F(p.zone[0])} إلى ${F(p.zone[1])}` : F(p.entry),
    sl: F(p.sl),
    tp1: F(p.tps?.[0]), tp2: F(p.tps?.[1]), tp3: F(p.tps?.[2]),
    tps: (p.tps || []).map((tp, k) => `الهدف ${k + 1}: ${F(tp)}`).join('\n'),
    expiry: p.expiryMin ? `${p.expiryMin} ${p.expiryMin === 1 ? 'دقيقة' : p.expiryMin === 2 ? 'دقيقتان' : p.expiryMin <= 10 ? 'دقائق' : 'دقيقة'}` : 'غير محدد',
    time: p.time ? `وقت الدخول: ${p.time}` : '',
    source, note,
  };
  const tpl = template || (p.kind === 'binary' ? DEFAULT_BINARY_TEMPLATE : DEFAULT_TEMPLATE);
  let out = tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  out = out.split('\n').map(l => l.trimEnd()).filter((l, i, arr) => l || (arr[i - 1] && arr[i - 1].trim())).join('\n').trim();
  if (footer) out += `\n\n${footer}`;
  return out;
}

// Removes links, @mentions and invitation lines, for re-posting a source text cleanly.
export function stripPromo(text) {
  return String(text || '')
    .split('\n')
    .filter(l => !/(t\.me\/|telegram\.me\/|join|اشترك|انضم|للاشتراك|vip|wa\.me|whatsapp)/i.test(l))
    .map(l => l.replace(/https?:\/\/\S+/g, '').replace(/(^|\s)@[\w\d_]{3,}/g, '$1').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
