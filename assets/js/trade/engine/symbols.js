// Symbols: one catalog for the chart, the parser and the calculators. Each entry knows its
// class, its pip, its names on each data source and the words traders use for it in Arabic.
// td: Twelve Data symbol. bn: Binance spot symbol (crypto only).

const FX = (s, ar, aliases = []) => {
  const base = s.slice(0, 3);
  const quote = s.slice(3);
  const jpy = quote === 'JPY';
  return { s, cls: 'fx', ar, base, quote, td: `${base}/${quote}`, pip: jpy ? 0.01 : 0.0001, digits: jpy ? 3 : 5, contract: 100000, aliases };
};

export const SYMBOLS = [
  FX('EURUSD', 'اليورو مقابل الدولار', ['يورو دولار', 'اليورو دولار', 'اليورو', 'يورو', 'fiber']),
  FX('GBPUSD', 'الباوند مقابل الدولار', ['باوند دولار', 'الباوند دولار', 'الباوند', 'باوند', 'الاسترليني', 'جنيه استرليني', 'cable', 'كيبل']),
  FX('USDJPY', 'الدولار مقابل الين', ['دولار ين', 'الدولار ين', 'الين', 'ين']),
  FX('USDCHF', 'الدولار مقابل الفرنك', ['دولار فرنك', 'الفرنك', 'فرنك', 'swissy']),
  FX('AUDUSD', 'الأسترالي مقابل الدولار', ['استرالي دولار', 'الاسترالي', 'أسترالي', 'aussie']),
  FX('NZDUSD', 'النيوزيلندي مقابل الدولار', ['نيوزلندي', 'النيوزلندي', 'النيوزيلندي', 'kiwi']),
  FX('USDCAD', 'الدولار مقابل الكندي', ['دولار كندي', 'الكندي', 'كندي', 'loonie']),
  FX('EURGBP', 'اليورو مقابل الباوند', ['يورو باوند']),
  FX('EURJPY', 'اليورو مقابل الين', ['يورو ين']),
  FX('GBPJPY', 'الباوند مقابل الين', ['باوند ين', 'الجيبي', 'جيبي', 'guppy']),
  FX('EURCHF', 'اليورو مقابل الفرنك', ['يورو فرنك']),
  FX('EURAUD', 'اليورو مقابل الأسترالي', ['يورو استرالي']),
  FX('EURCAD', 'اليورو مقابل الكندي', ['يورو كندي']),
  FX('EURNZD', 'اليورو مقابل النيوزيلندي', ['يورو نيوزلندي']),
  FX('GBPCHF', 'الباوند مقابل الفرنك', ['باوند فرنك']),
  FX('GBPAUD', 'الباوند مقابل الأسترالي', ['باوند استرالي']),
  FX('GBPCAD', 'الباوند مقابل الكندي', ['باوند كندي']),
  FX('GBPNZD', 'الباوند مقابل النيوزيلندي', ['باوند نيوزلندي']),
  FX('AUDJPY', 'الأسترالي مقابل الين', ['استرالي ين']),
  FX('AUDCAD', 'الأسترالي مقابل الكندي', ['استرالي كندي']),
  FX('AUDNZD', 'الأسترالي مقابل النيوزيلندي', ['استرالي نيوزلندي']),
  FX('CADJPY', 'الكندي مقابل الين', ['كندي ين']),
  FX('CHFJPY', 'الفرنك مقابل الين', ['فرنك ين']),
  FX('NZDJPY', 'النيوزيلندي مقابل الين', ['نيوزلندي ين']),
  FX('USDTRY', 'الدولار مقابل الليرة التركية', ['دولار ليرة', 'الليرة التركية']),
  FX('USDZAR', 'الدولار مقابل الراند', ['دولار راند']),
  FX('USDMXN', 'الدولار مقابل البيزو المكسيكي', ['دولار بيزو']),
  FX('USDEGP', 'الدولار مقابل الجنيه المصري', ['دولار جنيه', 'الجنيه المصري']),
  FX('USDSAR', 'الدولار مقابل الريال السعودي', ['دولار ريال', 'الريال السعودي']),
  { s: 'XAUUSD', cls: 'metal', ar: 'الذهب مقابل الدولار', base: 'XAU', quote: 'USD', td: 'XAU/USD', pip: 0.1, digits: 2, contract: 100, aliases: ['ذهب', 'الذهب', 'دهب', 'الدهب', 'جولد', 'gold', 'xau'] },
  { s: 'XAGUSD', cls: 'metal', ar: 'الفضة مقابل الدولار', base: 'XAG', quote: 'USD', td: 'XAG/USD', pip: 0.01, digits: 3, contract: 5000, aliases: ['فضة', 'الفضة', 'silver', 'xag'] },
  { s: 'BTCUSDT', cls: 'crypto', ar: 'بيتكوين', base: 'BTC', quote: 'USDT', bn: 'BTCUSDT', td: 'BTC/USD', pip: 1, digits: 2, contract: 1, aliases: ['بيتكوين', 'البيتكوين', 'بتكوين', 'btc', 'btcusd', 'bitcoin'] },
  { s: 'ETHUSDT', cls: 'crypto', ar: 'إيثيريوم', base: 'ETH', quote: 'USDT', bn: 'ETHUSDT', td: 'ETH/USD', pip: 0.1, digits: 2, contract: 1, aliases: ['ايثيريوم', 'إيثيريوم', 'الايثر', 'ايثر', 'eth', 'ethusd', 'ethereum'] },
  { s: 'SOLUSDT', cls: 'crypto', ar: 'سولانا', base: 'SOL', quote: 'USDT', bn: 'SOLUSDT', td: 'SOL/USD', pip: 0.01, digits: 2, contract: 1, aliases: ['سولانا', 'sol', 'solana'] },
  { s: 'BNBUSDT', cls: 'crypto', ar: 'بي إن بي', base: 'BNB', quote: 'USDT', bn: 'BNBUSDT', td: 'BNB/USD', pip: 0.01, digits: 2, contract: 1, aliases: ['bnb', 'بينانس كوين'] },
  { s: 'XRPUSDT', cls: 'crypto', ar: 'ريبل', base: 'XRP', quote: 'USDT', bn: 'XRPUSDT', td: 'XRP/USD', pip: 0.0001, digits: 4, contract: 1, aliases: ['ريبل', 'xrp', 'ripple'] },
  { s: 'DOGEUSDT', cls: 'crypto', ar: 'دوجكوين', base: 'DOGE', quote: 'USDT', bn: 'DOGEUSDT', td: 'DOGE/USD', pip: 0.00001, digits: 5, contract: 1, aliases: ['دوج', 'دوجكوين', 'doge'] },
  { s: 'ADAUSDT', cls: 'crypto', ar: 'كاردانو', base: 'ADA', quote: 'USDT', bn: 'ADAUSDT', td: 'ADA/USD', pip: 0.0001, digits: 4, contract: 1, aliases: ['كاردانو', 'ada', 'cardano'] },
  { s: 'TONUSDT', cls: 'crypto', ar: 'تون', base: 'TON', quote: 'USDT', bn: 'TONUSDT', td: 'TON/USD', pip: 0.001, digits: 3, contract: 1, aliases: ['تون', 'ton'] },
];

const BY = new Map(SYMBOLS.map(x => [x.s, x]));
export const symbolInfo = s => BY.get(String(s || '').toUpperCase().replace(/[^A-Z]/g, '').replace(/OTC$/, '')) || null;

// Timeframes in seconds, with each source's own name.
export const TIMEFRAMES = [
  { k: '1m', sec: 60, ar: 'دقيقة', frame: 'إطار الدقيقة', bn: '1m', td: '1min' },
  { k: '5m', sec: 300, ar: '5 دقائق', frame: 'إطار 5 دقائق', bn: '5m', td: '5min' },
  { k: '15m', sec: 900, ar: '15 دقيقة', frame: 'إطار 15 دقيقة', bn: '15m', td: '15min' },
  { k: '30m', sec: 1800, ar: '30 دقيقة', frame: 'إطار 30 دقيقة', bn: '30m', td: '30min' },
  { k: '1h', sec: 3600, ar: 'ساعة', frame: 'إطار الساعة', bn: '1h', td: '1h' },
  { k: '4h', sec: 14400, ar: '4 ساعات', frame: 'إطار 4 ساعات', bn: '4h', td: '4h' },
  { k: '1d', sec: 86400, ar: 'يومي', frame: 'الإطار اليومي', bn: '1d', td: '1day' },
  { k: '1w', sec: 604800, ar: 'أسبوعي', frame: 'الإطار الأسبوعي', bn: '1w', td: '1week' },
];
export const tfInfo = k => TIMEFRAMES.find(t => t.k === k) || TIMEFRAMES[4];
// the timeframe one or two steps above, for multi-timeframe confirmation
export const higherTf = k => {
  const map = { '1m': '15m', '5m': '1h', '15m': '1h', '30m': '4h', '1h': '4h', '4h': '1d', '1d': '1w', '1w': null };
  return map[k] || null;
};

// Arabic and English words for timeframes, longest first. \b does not work next to Arabic letters,
// so E marks the end of a word and S keeps «15» from matching inside a longer number.
const E = '(?=$|[^a-z0-9\\u0621-\\u064A\\u0660-\\u0669\\u0671-\\u06D3])';
const S = '(?:^|[^0-9.])';
const MIN = '(?:دقائق|دقايق|دقيقه|دقيقة|minutes?|mins?|m)';
const TF_WORDS = [
  [new RegExp(`${S}(?:4|اربع|أربع)\\s*(?:ساعات|ساعه|ساعة|h|hours?)${E}|\\bh4\\b|\\b4h\\b`, 'i'), '4h'],
  [new RegExp(`ربع ساعه|ربع ساعة|${S}15\\s*${MIN}${E}|\\bm15\\b|\\b15m\\b`, 'i'), '15m'],
  [new RegExp(`نص ساعه|نص ساعة|نصف ساعه|نصف ساعة|${S}30\\s*${MIN}${E}|\\bm30\\b|\\b30m\\b`, 'i'), '30m'],
  [new RegExp(`${S}(?:5|خمس|خمسه|خمسة)\\s*${MIN}${E}|\\bm5\\b|\\b5m\\b`, 'i'), '5m'],
  [new RegExp(`الدقيقة|الدقيقه|دقيقة واحدة|دقيقه واحده|(?:^|\\s)(?:دقيقه|دقيقة)${E}|\\bm1\\b|\\b1m\\b|${S}1\\s*min(?:ute)?${E}`, 'i'), '1m'],
  [/(?:اليومي|يومي|الديلي|ديلي|\bd1\b|\b1d\b|daily)/i, '1d'],
  [/(?:الأسبوعي|الاسبوعي|أسبوعي|اسبوعي|\bw1\b|\b1w\b|weekly)/i, '1w'],
  [/(?:الساعة|الساعه|ساعة|ساعه|\bh1\b|\b1h\b|hourly)/i, '1h'],
];
export function findTimeframe(text) {
  const n = normAr(text);
  for (const [re, k] of TF_WORDS) if (re.test(text) || re.test(n)) return k;
  return null;
}

// Normalise Arabic text for matching: digits, hamza forms, taa marbuta, diacritics, tatweel.
export function normAr(text) {
  return String(text || '')
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u066B/g, '.').replace(/\u066C/g, ',')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').replace(/\u0649/g, '\u064A').replace(/\u0629(?=\s|$|[^\u0600-\u06FF])/g, '\u0647')
    .toLowerCase();
}

// Words are compared without a leading conjunction or article, so «والذهب» «بالذهب» «للذهب»
// and «الذهب» all read as «ذهب». Aliases go through the same step, so both sides agree.
const bareWord = w => w
  .replace(/^[\u0648\u0641]?[\u0628\u0643]?\u0627\u0644(?=\p{L}{2,})/u, '')
  .replace(/^[\u0648\u0641]?\u0644\u0644(?=\p{L}{2,})/u, '')
  .replace(/^\u0648(?=\p{L}{3,})/u, '');
const words = text => normAr(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(bareWord);

// currency names, so «الباوند مقابل الين» or «ين دولار» become a pair without listing every pair
const CURRENCY = new Map([
  ['يورو', 'EUR'], ['باوند', 'GBP'], ['استرليني', 'GBP'], ['دولار', 'USD'], ['ين', 'JPY'], ['فرنك', 'CHF'],
  ['استرالي', 'AUD'], ['نيوزلندي', 'NZD'], ['نيوزيلندي', 'NZD'], ['كندي', 'CAD'], ['ذهب', 'XAU'], ['دهب', 'XAU'], ['فضه', 'XAG'],
  ['ليره', 'TRY'], ['راند', 'ZAR'], ['بيزو', 'MXN'], ['جنيه', 'EGP'], ['ريال', 'SAR'],
].map(([w, c]) => [bareWord(normAr(w)), c]));

const ALIASES = SYMBOLS.flatMap(x => x.aliases.map(a => ({ x, w: words(a) })))
  .filter(a => a.w.length > 1 || (a.w[0] || '').length >= 2)
  .sort((a, b) => b.w.length - a.w.length || b.w.join(' ').length - a.w.join(' ').length);

// every symbol named in the text, in the order they appear
export function symbolsIn(text) {
  const ws = words(text);
  const out = [];
  const add = x => { if (x && !out.includes(x)) out.push(x); };
  for (let i = 0; i < ws.length;) {
    const c1 = CURRENCY.get(ws[i]);
    const gap = ws[i + 1] === 'مقابل' ? 1 : 0;
    const c2 = c1 && CURRENCY.get(ws[i + 1 + gap]);
    const pair = c2 && c1 !== c2 ? BY.get(c1 + c2) || BY.get(c2 + c1) : null;
    if (pair) { add(pair); i += 2 + gap; continue; }
    const hit = ALIASES.find(a => a.w.every((w, k) => ws[i + k] === w));
    if (hit) { add(hit.x); i += hit.w.length; } else i++;
  }
  return out;
}

// Find a symbol in free text: codes like EURUSD, EUR/USD, EUR-USD, XAU/USD OTC, or Arabic names.
export function findSymbol(text) {
  const raw = String(text || '');
  const upper = raw.toUpperCase();
  const otc = /\bOTC\b|اوتي سي|أو تي سي/i.test(raw);
  const code = upper.match(/\b([A-Z]{3})\s?[/\-_. ]?\s?([A-Z]{3,4})\b/g) || [];
  for (const m of code) {
    const s = m.replace(/[^A-Z]/g, '');
    const hit = symbolInfo(s) || symbolInfo(s.replace(/USD$/, 'USDT'));
    if (hit) return { ...hit, otc };
  }
  const hit = symbolsIn(raw)[0];
  return hit ? { ...hit, otc } : null;
}

export const fmtPrice = (p, info) => (p == null || !Number.isFinite(p) ? '' : p.toFixed(info?.digits ?? (p > 1000 ? 2 : p > 10 ? 3 : 5)));
export const toPips = (diff, info) => (info?.pip ? diff / info.pip : null);
