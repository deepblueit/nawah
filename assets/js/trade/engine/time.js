// Market time: the New York close that ends the forex day, the trading sessions with their
// daylight saving shifts, and the ICT kill zones. Everything is computed from UTC seconds.

const dstCache = new Map();
const nthSunday = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - d) % 7) + (n - 1) * 7; };
const lastSunday = (y, m) => { const last = new Date(Date.UTC(y, m + 1, 0)); return last.getUTCDate() - last.getUTCDay(); };

// United States: second Sunday of March 02:00 local to first Sunday of November 02:00 local.
function usDst(y) {
  const k = `us${y}`;
  if (!dstCache.has(k)) dstCache.set(k, [Date.UTC(y, 2, nthSunday(y, 2, 2), 7) / 1000, Date.UTC(y, 10, nthSunday(y, 10, 1), 6) / 1000]);
  return dstCache.get(k);
}
// European Union and United Kingdom: last Sunday of March to last Sunday of October, 01:00 UTC.
function euDst(y) {
  const k = `eu${y}`;
  if (!dstCache.has(k)) dstCache.set(k, [Date.UTC(y, 2, lastSunday(y, 2), 1) / 1000, Date.UTC(y, 9, lastSunday(y, 9), 1) / 1000]);
  return dstCache.get(k);
}
// Australia (Sydney): first Sunday of October to first Sunday of April, 16:00 UTC the day before.
function auDst(t) {
  const y = new Date(t * 1000).getUTCFullYear();
  const end = Date.UTC(y, 3, nthSunday(y, 3, 1), 16) / 1000 - 86400;
  const start = Date.UTC(y, 9, nthSunday(y, 9, 1), 16) / 1000 - 86400;
  return t < end || t >= start;
}

const yearOf = t => new Date(t * 1000).getUTCFullYear();
export const isUsDst = t => { const [s, e] = usDst(yearOf(t)); return t >= s && t < e; };
export const isEuDst = t => { const [s, e] = euDst(yearOf(t)); return t >= s && t < e; };

// Seconds to add so that 17:00 New York becomes midnight: 3 hours in summer, 2 in winter.
export const nyCloseShift = t => (isUsDst(t) ? 3 : 2) * 3600;
// New York local time offset from UTC in hours (-4 or -5).
export const nyOffset = t => (isUsDst(t) ? -4 : -5);

// Day and week keys. With ny=true the day ends at the New York close, the forex convention,
// so Sunday evening belongs to Monday and there is no short Sunday candle.
export const dayKey = (t, ny = false) => Math.floor((t + (ny ? nyCloseShift(t) : 0)) / 86400);
// weeks start on Monday (UTC) or at the Sunday New York open (forex)
export const weekKey = (t, ny = false) => Math.floor((dayKey(t, ny) + 3) / 7);

// Forex is closed from Friday 17:00 to Sunday 17:00 New York time.
export function fxClosedAt(t) {
  const d = new Date((t + nyOffset(t) * 3600) * 1000);
  const dow = d.getUTCDay();
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return (dow === 5 && h >= 17) || dow === 6 || (dow === 0 && h < 17);
}

// Sessions in UTC hours [open, close), for the date of t.
export function sessionsAt(t) {
  const eu = isEuDst(t);
  const us = isUsDst(t);
  const au = auDst(t);
  return [
    { key: 'sydney', name: 'سيدني', open: au ? 21 : 22, close: au ? 6 : 7 },
    { key: 'tokyo', name: 'طوكيو', open: 0, close: 9 },
    { key: 'london', name: 'لندن', open: eu ? 7 : 8, close: eu ? 16 : 17 },
    { key: 'newyork', name: 'نيويورك', open: us ? 12 : 13, close: us ? 21 : 22 },
  ];
}

const inHours = (h, open, close) => (open < close ? h >= open && h < close : h >= open || h < close);

// ICT kill zones are defined in New York local time.
const KILLZONES = [
  { key: 'asia', name: 'نطاق آسيا', from: 20, to: 24 },
  { key: 'londonOpen', name: 'افتتاح لندن', from: 2, to: 5 },
  { key: 'nyOpen', name: 'افتتاح نيويورك', from: 7, to: 10 },
  { key: 'londonClose', name: 'إغلاق لندن', from: 10, to: 12 },
];
// Silver bullet windows (ICT), New York time.
const SILVER = [{ from: 3, to: 4, name: 'لندن' }, { from: 10, to: 11, name: 'صباح نيويورك' }, { from: 14, to: 15, name: 'مساء نيويورك' }];

export function marketClock(t = Math.floor(Date.now() / 1000), cls = 'fx') {
  const d = new Date(t * 1000);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  const dow = d.getUTCDay();
  const nyH = (h + nyOffset(t) + 24) % 24;
  const nyDow = new Date((t + nyOffset(t) * 3600) * 1000).getUTCDay();
  // forex is closed from Friday 17:00 to Sunday 17:00 New York time
  const fxClosed = cls !== 'crypto' && ((nyDow === 5 && nyH >= 17) || nyDow === 6 || (nyDow === 0 && nyH < 17));
  const sessions = sessionsAt(t).map(s => ({ ...s, active: !fxClosed && inHours(h, s.open, s.close) }));
  const active = sessions.filter(s => s.active);
  const overlap = active.length >= 2 ? active.map(s => s.name).join(' و') : '';
  const kz = KILLZONES.find(k => nyH >= k.from && nyH < k.to) || null;
  const silver = SILVER.find(k => nyH >= k.from && nyH < k.to) || null;
  let quality = 'normal';
  if (fxClosed) quality = 'closed';
  else if (active.some(s => s.key === 'london') && active.some(s => s.key === 'newyork')) quality = 'peak';
  else if (active.some(s => s.key === 'london' || s.key === 'newyork')) quality = 'good';
  else if (active.length === 1 && active[0].key === 'sydney') quality = 'thin';
  else if (!active.length) quality = 'thin';
  return { t, utcHour: h, nyHour: nyH, dow, fxClosed: cls === 'crypto' ? false : fxClosed, sessions, active, overlap, killzone: kz, silver, quality };
}

export const QUALITY_TEXT = {
  closed: 'السوق مغلق في عطلة نهاية الأسبوع، والأسعار المعروضة آخر ما سجل قبل الإغلاق.',
  peak: 'تداخل لندن ونيويورك: أعلى سيولة وحركة في اليوم، وأنسب وقت لأزواج اليورو والباوند والدولار والذهب.',
  good: 'جلسة رئيسية مفتوحة والسيولة جيدة.',
  normal: 'سيولة متوسطة.',
  thin: 'سيولة ضعيفة: الحركة أبطأ والفروقات أوسع، والكسور الكاذبة أكثر.',
};

// Local time text for a UTC second in a chosen time zone (the person's by default).
export function fmtTime(t, tz, { date = false, seconds = false } = {}) {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', {
      timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false,
      ...(date ? { day: 'numeric', month: 'short' } : {}),
    }).format(new Date(t * 1000));
  } catch (_) {
    return new Date(t * 1000).toISOString().slice(date ? 5 : 11, 16).replace('T', ' ');
  }
}

// Offset in seconds of a time zone at a moment, for shifting chart times to local time.
const offCache = new Map();
export function tzOffset(tz, t) {
  if (!tz || tz === 'UTC') return 0;
  const bucket = Math.floor(t / 3600);
  const k = `${tz}|${bucket}`;
  if (offCache.has(k)) return offCache.get(k);
  let off = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(bucket * 3600 * 1000));
    const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour % 24, +v.minute, +v.second) / 1000;
    off = asUtc - bucket * 3600;
  } catch (_) { off = 0; }
  if (offCache.size > 5000) offCache.clear();
  offCache.set(k, off);
  return off;
}

export const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; } };
