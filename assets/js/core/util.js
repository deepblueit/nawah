// Small helpers shared by every page: ids, Arabic text, dates (Gregorian and Hijri), money, files.

export const uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Arabic search normalisation: no diacritics or tatweel, one alef, ة as ه, ى as ي.
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\s+/g, ' ')
    .trim();
}

export const matches = (text, query) => {
  const q = normalize(query);
  if (!q) return true;
  const t = normalize(text);
  return q.split(' ').every(w => t.includes(w));
};

// Arabic counting: count(3, ['مهمة', 'مهمتان', 'مهام']) -> "3 مهام"
// forms: [one, two, 3 to 10, 11 and more (defaults to one)]
// above 100 the last two digits decide: 103 مهام, 111 مهمة, 200 مهمة.
export function count(n, [one, two, many, eleven], { zero } = {}) {
  n = Number(n) || 0;
  if (n === 0) return zero ?? `0 ${many}`;
  if (n === 1) return one;
  if (n === 2) return two;
  const tail = n % 100;
  if (tail >= 3 && tail <= 10) return `${n} ${many}`;
  return `${n} ${eleven || one}`;
}

// Noun forms for count(): [one, two, 3 to 10, 11 and more].
export const FORMS = {
  task: ['مهمة واحدة', 'مهمتان', 'مهام', 'مهمة'],
  openTask: ['مهمة واحدة مفتوحة', 'مهمتان مفتوحتان', 'مهام مفتوحة', 'مهمة مفتوحة'],
  doneTask: ['مهمة واحدة أنجزت', 'مهمتان أنجزتا', 'مهام أنجزت', 'مهمة أنجزت'],
  post: ['منشور واحد', 'منشوران', 'منشورات', 'منشورا'],
  decision: ['قرار واحد', 'قراران', 'قرارات', 'قرارا'],
  step: ['خطوة واحدة', 'خطوتان', 'خطوات', 'خطوة'],
  info: ['معلومة واحدة', 'معلومتان', 'معلومات', 'معلومة'],
  account: ['حساب واحد', 'حسابان', 'حسابات', 'حسابا'],
  hour: ['ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة'],
  lateInvoice: ['فاتورة واحدة متأخرة', 'فاتورتان متأخرتان', 'فواتير متأخرة', 'فاتورة متأخرة'],
  setupStep: ['خطوة تأسيس واحدة', 'خطوتا تأسيس', 'خطوات تأسيس', 'خطوة تأسيس'],
  skill: ['مهارة واحدة', 'مهارتان', 'مهارات', 'مهارة'],
  client: ['عميل واحد', 'عميلان', 'عملاء', 'عميلا'],
  project: ['مشروع واحد', 'مشروعان', 'مشاريع', 'مشروعا'],
  deal: ['فرصة واحدة', 'فرصتان', 'فرص', 'فرصة'],
  contract: ['تعاقد واحد', 'تعاقدان', 'تعاقدات', 'تعاقدا'],
};

// The noun alone, for a number shown separately: 23 -> خطوة, 5 -> خطوات.
export const noun = (n, forms) => { const t = (Number(n) || 0) % 100; return t >= 3 && t <= 10 ? forms[2] : forms[3] || forms[0]; };

const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parseDay = s => {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return y ? new Date(y, (m || 1) - 1, d || 1) : null;
};
export const addDays = (s, n) => { const d = parseDay(s) || new Date(); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 86400000);

// The Saudi work week starts on Sunday.
export const weekStart = s => { const d = parseDay(s) || new Date(); d.setDate(d.getDate() - d.getDay()); return iso(d); };
export const monthStart = s => { const d = parseDay(s) || new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
export const isWeekend = s => { const g = (parseDay(s) || new Date()).getDay(); return g === 5 || g === 6; };

const greg = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const gregShort = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short' });
const gregDayMonth = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' });
const weekday = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long' });
const monthYear = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' });
let hijri;
try { hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (_) { hijri = null; }
const time = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' });

export const fmtDate = s => { const d = parseDay(s); return d ? greg.format(d) : ''; };
export const fmtShort = s => { const d = parseDay(s); return d ? gregShort.format(d) : ''; };
export const fmtDayMonth = s => { const d = parseDay(s); return d ? gregDayMonth.format(d) : ''; };
export const fmtWeekday = s => { const d = parseDay(s); return d ? weekday.format(d) : ''; };
export const fmtMonth = s => { const d = parseDay(s); return d ? monthYear.format(d) : ''; };
export const fmtHijri = s => { const d = parseDay(s) || new Date(); return hijri ? hijri.format(d).replace(/\s*هـ$/, '') + ' هـ' : ''; };
export const fmtTime = t => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
  return time.format(d);
};
export const fmtStamp = ms => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${gregShort.format(d)}، ${time.format(d)}`;
};

// "اليوم"، "غدا"، "متأخر 3 أيام"، "بعد أسبوع"
export function relDay(s) {
  if (!s) return '';
  const n = diffDays(s, today());
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غدا';
  if (n === -1) return 'أمس';
  if (n < 0) return `متأخر ${count(-n, ['يوما', 'يومين', 'أيام', 'يوما'])}`;
  if (n < 7) return `بعد ${count(n, ['يوم', 'يومين', 'أيام'])}`;
  if (n < 14) return 'بعد أسبوع';
  return fmtShort(s);
}

export function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${count(m, ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'])}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${count(h, ['ساعة', 'ساعتين', 'ساعات'])}`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${count(d, ['يوم', 'يومين', 'أيام', 'يوما'])}`;
  return fmtShort(iso(new Date(ms)));
}

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const num = n => numFmt.format(Number(n) || 0);
export const int = n => intFmt.format(Math.round(Number(n) || 0));
export const money = (n, { short } = {}) => {
  n = Number(n) || 0;
  if (short && Math.abs(n) >= 1e6) return `${num(n / 1e6)} مليون ر.س`;
  if (short && Math.abs(n) >= 1e4) return `${num(Math.round(n / 100) / 10)} ألف ر.س`;
  return `${num(n)} ر.س`;
};

export const sum = (list, f = x => x) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
export const groupBy = (list, f) => list.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
export const by = (f, dir = 1) => (a, b) => { const x = f(a), y = f(b); return x < y ? -dir : x > y ? dir : 0; };
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const readFile = file => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => fail(r.error);
  r.readAsText(file, 'utf-8');
});

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fall through */ }
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  t.remove();
  return ok;
}

// localStorage that never throws (private windows, full storage).
export const local = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } },
};

export const csv = rows => rows.map(r => r.map(c => {
  const s = String(c ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\n');
