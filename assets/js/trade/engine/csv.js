// Candles from files exported by MetaTrader 4 and 5, TradingView, or any table with a date and
// open, high, low and close columns. MetaTrader writes the broker's server time, so the caller
// passes that server's offset from UTC (commonly +2 in winter and +3 in summer).

const SPLIT = line => (line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(','));

function parseDate(d, t = '') {
  d = String(d).trim().replace(/^"|"$/g, '');
  t = String(t || '').trim();
  if (/^\d{10}$/.test(d)) return Number(d);
  if (/^\d{13}$/.test(d)) return Math.floor(Number(d) / 1000);
  if (/^\d{4}-\d{2}-\d{2}T/.test(d)) { const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? d : d + 'Z'); return Number.isNaN(ms) ? null : ms / 1000; }
  let y; let m; let dd;
  let mm = d.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mm) { [, y, m, dd] = mm; if (mm[4]) t = `${mm[4]}:${mm[5]}:${mm[6] || '00'}`; }
  else if ((mm = d.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) { [, dd, m, y] = mm; if (mm[4]) t = `${mm[4]}:${mm[5]}:${mm[6] || '00'}`; }
  else return null;
  const [hh = 0, mi = 0, ss = 0] = (t.match(/\d+/g) || []).map(Number);
  return Date.UTC(Number(y), Number(m) - 1, Number(dd), hh, mi, ss) / 1000;
}

export function parseCandlesCsv(text, { offsetHours = 0 } = {}) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { candles: [], error: 'الملف فارغ' };
  const head = SPLIT(lines[0]).map(h => h.trim().replace(/[<>"]/g, '').toLowerCase());
  const hasHeader = head.some(h => /[a-z]/.test(h) && !/^\d/.test(h));
  let col;
  if (hasHeader) {
    const find = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
    col = {
      date: find('date', 'datetime', 'time', 'timestamp', 'gmt time', 'local time'),
      time: head.findIndex((h, k) => (h === 'time') && k !== find('date', 'datetime', 'timestamp')),
      o: find('open', 'o'), h: find('high', 'h'), l: find('low', 'l'), c: find('close', 'c'),
      v: find('volume', 'vol', 'tickvol', 'tick volume', 'v'),
    };
    if (col.time === col.date) col.time = -1;
  } else {
    const n = SPLIT(lines[0]).length;
    const second = SPLIT(lines[0])[1] || '';
    // MetaTrader 4: date,time,open,high,low,close,volume
    if (/^\d{1,2}:\d{2}/.test(second)) col = { date: 0, time: 1, o: 2, h: 3, l: 4, c: 5, v: n > 6 ? 6 : -1 };
    else col = { date: 0, time: -1, o: 1, h: 2, l: 3, c: 4, v: n > 5 ? 5 : -1 };
  }
  if ([col.date, col.o, col.h, col.l, col.c].some(x => x < 0)) return { candles: [], error: 'لم أجد أعمدة التاريخ والافتتاح والأعلى والأدنى والإغلاق' };
  const out = [];
  let bad = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const f = SPLIT(line);
    const t = parseDate(f[col.date], col.time >= 0 ? f[col.time] : '');
    const o = Number(String(f[col.o]).replace(',', '.'));
    const h = Number(String(f[col.h]).replace(',', '.'));
    const l = Number(String(f[col.l]).replace(',', '.'));
    const c = Number(String(f[col.c]).replace(',', '.'));
    const v = col.v >= 0 ? Number(f[col.v]) || 0 : 0;
    if (t == null || ![o, h, l, c].every(Number.isFinite)) { bad++; continue; }
    out.push({ t: t - offsetHours * 3600, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v });
  }
  out.sort((a, b) => a.t - b.t);
  const uniq = out.filter((x, k) => k === 0 || x.t !== out[k - 1].t);
  // the step between candles tells the timeframe
  const steps = uniq.slice(1, 200).map((x, k) => x.t - uniq[k].t).filter(s => s > 0).sort((a, b) => a - b);
  const step = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
  return { candles: uniq, bad, step, error: uniq.length ? '' : 'لم أستطع قراءة أي شمعة من الملف' };
}

const TF_BY_STEP = { 60: '1m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d', 604800: '1w' };
export const tfFromStep = step => TF_BY_STEP[step] || null;
