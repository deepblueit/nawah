// The library: the schools of technical analysis and their patterns, searchable in Arabic,
// Egyptian and English terms, with a schematic drawing for each pattern.
import { A } from './a.js';
import { B } from './b.js';
import { C } from './c.js';
import { D } from './d.js';
import { normAr } from '../engine/symbols.js';

export const SCHOOLS = [
  { k: 'dow', n: 'نظرية داو وهيكل السوق', d: 'تعريف الاتجاه بالقمم والقيعان، وأساس كل ما بعده.', aka: ['داو', 'dow', 'هيكل السوق', 'market structure'] },
  { k: 'pa', n: 'حركة السعر', d: 'قراءة السعر نفسه: الخطوط والاختراقات والكسور الكاذبة وشموع الرفض.', aka: ['برايس اكشن', 'price action', 'حركة السعر'] },
  { k: 'candles', n: 'الشموع اليابانية', d: 'نماذج الشمعة والشمعتين والثلاث كما وصفها ستيف نيسون، في سياقها.', aka: ['الشموع', 'شموع يابانية', 'candlestick', 'candles', 'كاندل'] },
  { k: 'classic', n: 'النماذج الكلاسيكية', d: 'نماذج إدواردز وماجي وبولكوفسكي: القمم والقيعان والمثلثات والأعلام.', aka: ['نماذج كلاسيكية', 'chart patterns', 'النماذج الفنية', 'باترن', 'patterns'] },
  { k: 'sr', n: 'الدعم والمقاومة ونقاط الارتكاز', d: 'المستويات التي يتذكرها السوق، وحساباتها اليومية.', aka: ['دعوم ومقاومات', 'support resistance', 'بيفوت'] },
  { k: 'fib', n: 'فيبوناتشي', d: 'نسب التصحيح والامتداد، ومتى تفيد.', aka: ['فيبو', 'فيبوناتشي', 'fibonacci'] },
  { k: 'ma', n: 'المتوسطات المتحركة', d: 'الاتجاه المنعم وتقاطعاته.', aka: ['المتوسطات', 'moving averages', 'موفينج'] },
  { k: 'osc', n: 'المؤشرات والمذبذبات', d: 'الزخم وقوة الاتجاه ومؤشرات التتبع.', aka: ['المؤشرات', 'indicators', 'oscillators', 'مذبذبات', 'اندكيتور'] },
  { k: 'divergence', n: 'التباعدات', d: 'اختلاف السعر عن الزخم، العادي والمخفي.', aka: ['دايفرجنس', 'divergence', 'التباعد'] },
  { k: 'vol', n: 'التقلب', d: 'النطاقات ومتوسط المدى والانضغاط.', aka: ['التقلب', 'volatility', 'فولاتيليتي'] },
  { k: 'ichimoku', n: 'إيشيموكو', d: 'نظام هوسودا الكامل: الخطوط والسحابة.', aka: ['ايشيموكو', 'إيشيموكو', 'ichimoku'] },
  { k: 'volume', n: 'الحجم', d: 'تأكيد الحركة بالحجم، وحدوده في الفوركس.', aka: ['الحجم', 'volume', 'فوليوم'] },
  { k: 'elliott', n: 'موجات إليوت', d: 'الموجات الدافعة والتصحيحية وقواعدها.', aka: ['اليوت', 'إليوت', 'elliott', 'الموجات'] },
  { k: 'harmonic', n: 'النماذج التوافقية', d: 'نماذج XABCD بنسب فيبوناتشي الدقيقة.', aka: ['هارمونيك', 'هارمونيك باترن', 'harmonic', 'harmonics', 'توافقية', 'التوافقية'] },
  { k: 'wyckoff', n: 'وايكوف', d: 'التجميع والتصريف وقوانين العرض والطلب.', aka: ['وايكوف', 'wyckoff'] },
  { k: 'smc', n: 'المفاهيم الذكية (SMC وICT)', d: 'الهيكل والسيولة وكتل الأوامر والفجوات والتوقيت.', aka: ['سمارت موني', 'smart money', 'smc', 'ict', 'اي سي تي', 'المفاهيم الذكية', 'مفاهيم ذكية'] },
  { k: 'sd', n: 'العرض والطلب', d: 'القواعد التي ينطلق منها السعر بقوة.', aka: ['العرض والطلب', 'supply and demand', 'سبلاي ديماند'] },
  { k: 'mtf', n: 'الأطر الزمنية والجلسات والأخبار', d: 'من أين تبدأ التحليل، ومتى تتداول.', aka: ['الفريمات', 'الاطر الزمنية', 'timeframes', 'الجلسات'] },
  { k: 'risk', n: 'إدارة المخاطرة وعلم النفس', d: 'ما يبقي الحساب حيا: الحجم والعائد والانضباط.', aka: ['ادارة المخاطر', 'إدارة رأس المال', 'risk management', 'money management', 'ريسك'] },
  { k: 'binary', n: 'الخيارات الثنائية', d: 'حساباتها الحقيقية ومخاطرها.', aka: ['باينري', 'binary', 'خيارات ثنائية'] },
  { k: 'tricks', n: 'فحص القنوات والتوصيات', d: 'كيف تكشف القناة غير الصادقة بالأرقام.', aka: ['النصب', 'القنوات', 'فحص التوصيات', 'scam'] },
  { k: 'other', n: 'مدارس أخرى', d: 'جان وهايكن آشي ورينكو وغيرها، مع حدودها.', aka: ['مدارس اخرى', 'other'] },
];

export const ENTRIES = [...A, ...B, ...C, ...D];
const BY = new Map(ENTRIES.map(e => [e.k, e]));
export const entry = k => BY.get(k) || null;
export const schoolName = k => SCHOOLS.find(s => s.k === k)?.n || '';

// words that carry no meaning for search
const STOP = new Set(['ما', 'هو', 'هي', 'يعني', 'ايه', 'ايش', 'شو', 'اشرح', 'شرح', 'لي', 'عن', 'في', 'من', 'الى', 'على', 'و', 'او', 'كيف', 'ازاي', 'ما هو', 'نموذج', 'the', 'what', 'is', 'a', 'of', 'explain', 'معنى', 'عرفني', 'علمني', 'الفرق', 'بين', 'مدرسه', 'هذه', 'هذا', 'المدرسه', 'اتعامل', 'مع', 'اعمل', 'استخدم']);

const norm = s => normAr(s).replace(/[^\p{L}\p{N}\s.=]/gu, ' ').replace(/\s+/g, ' ').trim();
const index = ENTRIES.map(e => ({ e, name: norm(e.n), en: norm(e.en), aka: e.aka.map(norm), school: norm(schoolName(e.s)), body: norm(`${e.d} ${(e.id || []).join(' ')}`) }));

const schoolIndex = SCHOOLS.map(x => ({ x, name: norm(x.n), aka: (x.aka || []).map(norm) }));

// The schools a question names, strongest first: «اشرح المفاهيم الذكية» opens the school, not one entry.
export function searchSchools(q) {
  const n = norm(q);
  if (!n) return [];
  return schoolIndex.map(({ x, name, aka }) => {
    let score = 0;
    if (n === name || aka.includes(n)) score += 40;
    if (name.length >= 4 && n.includes(name)) score += 26;
    for (const a of aka) if (a.length >= 3 && n.includes(a)) score += 18 + a.length / 4;
    return { school: x, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
}

export function searchKb(q, { limit = 6 } = {}) {
  const n = norm(q);
  if (!n) return [];
  const words = n.split(' ').filter(w => w.length > 1 && !STOP.has(w));
  const strip = w => w.replace(/^(ال|بال|وال|لل)/, '');
  const out = [];
  for (const x of index) {
    let score = 0;
    if (x.name === n || x.en === n || x.aka.includes(n)) score += 30;
    for (const a of x.aka) if (a.length >= 3 && n.includes(a)) score += 12 + a.length / 4;
    if (x.name.length >= 4 && n.includes(x.name)) score += 14;
    if (x.en.length >= 4 && n.includes(x.en)) score += 12;
    for (const w of words) {
      const b = strip(w);
      if (b.length < 2) continue;
      if (x.name.includes(b)) score += 4;
      if (x.en.includes(w)) score += 3;
      if (x.aka.some(a => a.includes(b))) score += 3;
      if (x.school.includes(b)) score += 1.5;
      if (x.body.includes(b)) score += 0.5;
    }
    if (score > 0) out.push({ e: x.e, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- the drawings: a line through swing points, or a row of candles
export function figure(fig, { w = 240, h = 140 } = {}) {
  if (!fig) return '';
  const pad = 8;
  if (fig.c) {
    const n = fig.c.length;
    const all = fig.c.flat();
    const min = Math.min(...all);
    const max = Math.max(...all);
    const Y = v => pad + ((max - v) / (max - min || 1)) * (h - pad * 2);
    const step = (w - pad * 2) / n;
    const bw = Math.min(18, step * 0.55);
    const parts = fig.c.map(([o, hi, lo, c], k) => {
      const x = pad + step * (k + 0.5);
      const up = c >= o;
      const top = Y(Math.max(o, c));
      const bot = Y(Math.min(o, c));
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(hi).toFixed(1)}" y2="${Y(lo).toFixed(1)}" class="f-wick"/><rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, bot - top).toFixed(1)}" rx="1.5" class="${up ? 'f-up' : 'f-down'}"/>`;
    });
    return `<svg class="t-fig" viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true">${parts.join('')}</svg>`;
  }
  const sx = (w - pad * 2) / 120;
  const sy = (h - pad * 2) / 70;
  const X = x => (pad + x * sx).toFixed(1);
  const Yp = y => (pad + y * sy).toFixed(1);
  const lines = (fig.g || []).map(([[x1, y1], [x2, y2]]) => `<line x1="${X(x1)}" y1="${Yp(y1)}" x2="${X(x2)}" y2="${Yp(y2)}" class="f-guide"/>`).join('');
  const path = fig.p ? `<polyline points="${fig.p.map(([x, y]) => `${X(x)},${Yp(y)}`).join(' ')}" class="f-line"/>` : '';
  const dots = (fig.p || []).map(([x, y]) => `<circle cx="${X(x)}" cy="${Yp(y)}" r="2.2" class="f-dot"/>`).join('');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const labels = (fig.l || []).map(([x, y, t]) => `<text x="${X(x)}" y="${Yp(y)}" class="f-label" text-anchor="middle">${esc(t)}</text>`).join('');
  return `<svg class="t-fig" viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true">${lines}${path}${dots}${labels}</svg>`;
}
