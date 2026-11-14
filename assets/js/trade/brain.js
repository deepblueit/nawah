// إكس نواة: answers built from the same engine that reads the chart, the library, the risk
// arithmetic and the person's own records. Replies are data blocks, rendered and escaped by the page.
import { understand } from './engine/intent.js';
import { analyze, TREND_TEXT, statusWord } from './engine/analyze.js';
import { symbolInfo, tfInfo, higherTf, fmtPrice } from './engine/symbols.js';
import { marketClock, QUALITY_TEXT, fmtTime, deviceTz } from './engine/time.js';
import { positionSize, conversionNeed, martingale, breakEven, journalStats } from './engine/risk.js';
import { channelStats } from './engine/signals.js';
import { loadCandles, quotes, sourceFor } from './data.js';
import { tstore, tsetting } from './tstore.js';
import { searchKb, searchSchools, schoolName, ENTRIES, figure } from './kb/index.js';
import { count, local } from '../core/util.js';

const SCHOOLS_N = ['مدرسة واحدة', 'مدرستان', 'مدارس', 'مدرسة'];
const tz = () => local.get('nawah.trade.tz', '') || deviceTz();
const pctTxt = x => `${(x * 100).toFixed(1)}%`;

export const SUGGESTIONS = [
  'حلل الذهب على الساعة', 'ما وضع اليورو دولار على 15 دقيقة؟', 'الدعوم والمقاومات للبيتكوين', 'ما معنى كتلة الأوامر؟',
  'كم لوتا أحتاج لحساب 1000 دولار ومخاطرة 1% ووقف 30 نقطة على اليورو؟', 'خيارات ثنائية على اليورو دولار 5 دقائق', 'نسبة النجاح المطلوبة إذا كان العائد 85%',
  'قارن الذهب والفضة', 'متى تفتح جلسة لندن؟', 'أداء قنواتي', 'كيف أربط قنوات تيليجرام؟',
];

const P = (p, info) => fmtPrice(p, info);

export async function respond(text, mem = {}) {
  const it = understand(text, mem);
  try {
    switch (it.intent) {
      case 'greet': return { blocks: [{ t: 'p', text: 'أهلا بك. اسألني عن أي رمز لأحلله بكل المدارس، أو عن أي نموذج لأشرحه، أو عن حجم صفقتك.' }, { t: 'ask', items: SUGGESTIONS.slice(0, 4) }], mem };
      case 'thanks': return { blocks: [{ t: 'p', text: 'في الخدمة. القرار وإدارة المخاطرة لك دائما.' }], mem };
      case 'help': return help(mem);
      case 'connect': return connect(mem);
      case 'need-symbol': return { blocks: [{ t: 'p', text: 'أي رمز تقصد؟ اكتب اسمه مثل الذهب أو EURUSD أو بيتكوين.' }, { t: 'ask', items: tstore.all('watch').slice(0, 6).map(w => `حلل ${w.s}`) }], mem };
      case 'analyze': case 'levels': case 'patterns': case 'binary': case 'plan': return await reading(it, mem);
      case 'compare': return await compare(it, mem);
      case 'explain': case 'differ': return explain(it, mem);
      case 'risk': return await risk(it, mem);
      case 'signal': return await signal(it, mem);
      case 'martingale': return mg(it, mem);
      case 'breakeven': return be(it, mem);
      case 'session': return session(mem);
      case 'channel': return channels(mem);
      case 'journal': return journal(mem);
      case 'news': return news(it, mem);
      default: return explain(it, mem);
    }
  } catch (e) {
    return { blocks: [{ t: 'warn', text: e.message || 'حدث خطأ أثناء تجهيز الرد.' }], mem };
  }
}

function help(mem) {
  return {
    blocks: [
      { t: 'title', text: 'ما أستطيع فعله' },
      { t: 'list', items: [
        'تحليل أي رمز على أي إطار بست عشرة مدرسة: الاتجاه والمتوسطات والمفاهيم الذكية والدعوم والشموع والنماذج الكلاسيكية والتوافقية وإليوت ووايكوف وفيبوناتشي والزخم والتباعدات وإيشيموكو والحجم والإطار الأعلى.',
        'خطة صفقة بدخول ووقف وأهداف ونسبة العائد إلى المخاطرة، وقراءة مستقلة للخيارات الثنائية.',
        'شرح أي نموذج أو مفهوم من المكتبة، بالعربية أو بالمصطلح الإنجليزي.',
        'حساب حجم الصفقة وقيمة النقطة ونقطة التعادل في الخيارات الثنائية وأرقام المضاعفة الحقيقية.',
        'فحص أي توصية تلصقها: هل ينقصها شيء، وهل وقفها منطقي، وهل يتفق المحرك معها.',
        'أداء قنواتك الموثق بالأسعار، وأداء يومياتك.',
      ] },
      { t: 'p', text: 'أعمل على جهازك بمحرك التحليل نفسه الذي يقرأ الشارت، فلا يخرج سؤالك من جهازك، وما يخرج هو طلبات الأسعار فقط.' },
      { t: 'ask', items: SUGGESTIONS.slice(0, 6) },
    ],
    mem,
  };
}

function connect(mem) {
  return {
    blocks: [
      { t: 'title', text: 'ربط تيليجرام ونقل التوصيات' },
      { t: 'list', items: [
        'أنشئ بوتا من @BotFather بالأمر /newbot، وانسخ الرمز الذي يرسله لك.',
        'الصق الرمز في «إعدادات التداول» ثم «بوت تيليجرام»، وفعل الاستقبال على جهاز واحد يبقى مفتوحا.',
        'أضف البوت مشرفا في كل قناة تملكها، فتصل منشوراتها هنا تلقائيا.',
        'لقناة لا تملكها: حول التوصية إلى البوت يدويا، أو شغل برنامج النسخ لينقلها على مدار الساعة باسم قناتها الأصلية.',
        'لنقل التوصيات إلى قنواتك: أضف القناة هدفا من تبويب «القنوات»، واختر النقل اليدوي أو التلقائي وصيغة الكتابة.',
      ] },
      { t: 'actions', items: [{ label: 'خطوات الربط', href: '#/signals?tab=setup' }, { label: 'إعدادات التداول', href: '#/tsettings' }] },
    ],
    mem,
  };
}

// ---------- readings of a symbol
async function reading(it, mem) {
  const info = symbolInfo(it.symbol);
  if (!info) return { blocks: [{ t: 'p', text: 'لم أتعرف على الرمز. جرب اسمه بالإنجليزية مثل XAUUSD أو EURUSD.' }], mem };
  if (it.otc) return { blocks: [{ t: 'warn', text: 'رموز OTC أسعار يولدها الوسيط نفسه ولا ترتبط بالسوق الحقيقي، فلا يصلح تحليلها ببيانات حقيقية. أستطيع تحليل الرمز الحقيقي في أوقات السوق.' }], mem: { ...mem, symbol: info.s } };
  const tf = tfInfo(it.tf || (mem.symbol === info.s && mem.tf) || tsetting('market', {}).tf || '1h').k;
  const res = await loadCandles(info.s, tf);
  const h = higherTf(tf);
  const htf = h ? await loadCandles(info.s, h).catch(() => null) : null;
  const r = analyze(res.candles, { symbol: info.s, tf, htf: htf?.candles, payout: (tsetting('risk', {}).payout || 85) / 100 });
  const nextMem = { ...mem, symbol: info.s, tf, plan: r.plan?.side ? { side: r.plan.side, entry: r.plan.entry.price, stop: r.plan.stop } : null };
  if (!r.ok) return { blocks: [{ t: 'warn', text: r.reason }], mem: nextMem };
  const F = p => P(p, info);
  const blocks = [{ t: 'verdict', symbol: info.s, name: info.ar, frame: r.frame, bias: r.bias, score: r.score, confidence: r.confidenceText, trend: r.trendText, mtf: r.mtf ? TREND_TEXT[r.mtf.bias] : null, price: F(r.price) }];
  if (res.source === 'demo') blocks.push({ t: 'note', text: 'التحليل على أسعار تجريبية مولدة لأن هذا الرمز بلا مصدر أسعار حقيقي على جهازك. أضف مفتاح Twelve Data المجاني من إعدادات التداول.' });
  if (it.intent === 'levels') {
    blocks.push({ t: 'kv', rows: [
      ...r.levels.resistance.slice(0, 3).map((x, k) => [`مقاومة ${k + 1}`, F(x.price)]),
      ...r.levels.support.slice(0, 3).map((x, k) => [`دعم ${k + 1}`, F(x.price)]),
      ...(r.levels.pivots ? [['الارتكاز اليومي', F(r.levels.pivots.p)], ['المقاومة الأولى للارتكاز', F(r.levels.pivots.r1)], ['الدعم الأول للارتكاز', F(r.levels.pivots.s1)]] : []),
      ...(r.levels.prevDay ? [['قمة أمس وقاعه', `${F(r.levels.prevDay.h)} / ${F(r.levels.prevDay.l)}`]] : []),
    ] });
  } else if (it.intent === 'patterns') {
    const items = [];
    for (const c of r.patterns.candles.filter(x => x.context && x.bias !== 0).slice(-4)) items.push(`شموع: ${c.name}`);
    for (const p of r.patterns.chart.slice(0, 4)) items.push(`كلاسيكي: ${p.name} ${statusWord(p)}${p.target ? `، الهدف ${F(p.target)}` : ''}`);
    for (const x of r.patterns.harmonics.slice(0, 3)) items.push(x.potential ? `توافقي محتمل: ${x.name} بين ${F(x.prz.bottom)} و${F(x.prz.top)}` : `توافقي: ${x.name} ${x.dir === 1 ? 'صاعد' : 'هابط'}`);
    for (const w of r.patterns.elliott.slice(0, 1)) items.push(`إليوت: ${r.schools.find(s => s.key === 'elliott')?.line || ''}`);
    if (r.patterns.wyckoff.range) items.push(`وايكوف: ${r.schools.find(s => s.key === 'wyckoff')?.line}`);
    for (const d of r.patterns.divergences.filter(x => x.recent).slice(0, 2)) items.push(`تباعد: ${r.schools.find(s => s.key === 'divergence')?.line}`);
    blocks.push(items.length ? { t: 'list', items } : { t: 'p', text: 'لا نماذج واضحة على هذا الإطار الآن.' });
  } else if (it.intent === 'binary') {
    const b = r.binary;
    const sec = tfInfo(tf).sec;
    blocks.push({ t: 'title', text: `الخيارات الثنائية: ${b.label}` });
    if (b.direction) blocks.push({ t: 'kv', rows: [['قوة الإشارة القصيرة', `${Math.abs(b.score)} من 100`], ['الدخول', `مع افتتاح الشمعة التالية ${fmtTime(b.entryAt, tz())}`], ['الانتهاء المقترح', b.expiryCandles.map(n => `${n} شموع حتى ${fmtTime(b.entryAt + n * sec, tz())}`).join('، أو ')]] });
    if (b.reasons.length) blocks.push({ t: 'list', items: b.reasons });
    if (b.noTrade.length) blocks.push({ t: 'warn', text: `لا تدخل إذا: ${b.noTrade.join(' ')}` });
    blocks.push({ t: 'p', text: b.note });
  } else {
    const keep = it.intent === 'plan' ? ['الخطة'] : ['الخلاصة', 'الاتجاه', 'المستويات', 'النماذج والإشارات'];
    for (const n of r.narrative.filter(x => keep.includes(x.title))) blocks.push({ t: 'p', title: n.title, text: n.text });
    if (r.plan.side) {
      blocks.push({ t: 'plan', side: r.plan.side, entry: F(r.plan.entry.price), entryType: r.plan.entry.type === 'market' ? 'من السعر الحالي' : 'أمر معلق', stop: F(r.plan.stop), risk: r.plan.riskText, targets: r.plan.targets.map(x => ({ price: F(x.price), rr: x.rr.toFixed(1) })), invalid: `تلغى الفكرة إذا أغلقت شمعة على ${r.frame} ${r.plan.side === 'buy' ? 'تحت' : 'فوق'} ${F(r.plan.invalid)}.` });
    } else blocks.push({ t: 'p', title: 'الخطة', text: r.plan.summary });
  }
  if (r.warnings.length && it.intent !== 'levels') blocks.push({ t: 'warn', text: r.warnings.slice(0, 2).join(' ') });
  const other = tf === '1h' ? '4 ساعات' : tf === '4h' ? 'اليومي' : 'الساعة';
  blocks.push({ t: 'actions', items: [{ label: 'افتح على الشارت', href: `#/market?sym=${info.s}&tf=${tf}` }, ...(r.plan.side ? [{ label: 'احسب الحجم', href: `#/risk?sym=${info.s}&entry=${r.plan.entry.price}&sl=${r.plan.stop}` }] : [])] });
  blocks.push({ t: 'ask', items: [`وعلى ${other}؟`, it.intent === 'binary' ? 'والخطة؟' : 'وللخيارات الثنائية؟', 'والنماذج؟', 'والدعوم؟'] });
  return { blocks, mem: nextMem };
}

async function compare(it, mem) {
  const list = it.symbols.slice(0, 4);
  const tf = tfInfo(it.tf || mem.tf || '1h').k;
  const rows = [];
  for (const s of list) {
    try {
      const res = await loadCandles(s, tf);
      const h = higherTf(tf);
      const htf = h ? await loadCandles(s, h).catch(() => null) : null;
      const r = analyze(res.candles, { symbol: s, tf, htf: htf?.candles });
      rows.push(r.ok ? [s, r.biasText, `${Math.abs(r.score)}`, r.trendText, r.mtf ? TREND_TEXT[r.mtf.bias] : 'غير محمل', res.source === 'demo' ? 'تجريبية' : 'حقيقية'] : [s, 'لا قراءة', '', '', '', '']);
    } catch (e) { rows.push([s, e.message, '', '', '', '']); }
  }
  return { blocks: [{ t: 'title', text: `مقارنة على ${tfInfo(tf).frame}` }, { t: 'table', head: ['الرمز', 'الترجيح', 'التوافق', 'الاتجاه', 'الإطار الأعلى', 'الأسعار'], rows }, { t: 'p', text: 'الأعلى توافقا ليس الأربح بالضرورة؛ قارن أيضا مسافة الوقف ونسبة العائد في خطة كل رمز.' }, { t: 'ask', items: list.map(s => `حلل ${s}`) }], mem: { ...mem, tf } };
}

// ---------- the library
function explain(it, mem) {
  const sc = searchSchools(it.raw)[0];
  const hits = searchKb(it.raw, { limit: 4 });
  if (sc && sc.score >= 20 && (!hits[0] || hits[0].score < sc.score + 10)) {
    const items = ENTRIES.filter(e => e.s === sc.school.k);
    return { blocks: [{ t: 'title', text: sc.school.n }, { t: 'p', text: sc.school.d }, { t: 'p', text: `فيها ${count(items.length, ['مدخل واحد', 'مدخلان', 'مداخل', 'مدخلا'])}. اختر واحدا:` }, { t: 'ask', items: items.slice(0, 10).map(e => `اشرح ${e.n}`) }, { t: 'actions', items: [{ label: 'افتح المدرسة في المكتبة', href: `#/library?s=${sc.school.k}` }] }], mem };
  }
  if (!hits.length || hits[0].score < 3) {
    return { blocks: [{ t: 'p', text: 'لم أفهم المطلوب بدقة. أستطيع تحليل رمز، أو شرح نموذج، أو حساب حجم صفقة.' }, { t: 'ask', items: SUGGESTIONS.slice(0, 6) }], mem };
  }
  if (it.intent === 'differ' && hits.length >= 2) {
    const [a, b] = hits;
    return { blocks: [{ t: 'title', text: `${a.e.n} و${b.e.n}` }, { t: 'p', title: a.e.n, text: a.e.d }, { t: 'p', title: b.e.n, text: b.e.d }, ...(a.e.f ? [{ t: 'p', title: `حذر في ${a.e.n}`, text: a.e.f }] : []), { t: 'ask', items: [`اشرح ${a.e.n}`, `اشرح ${b.e.n}`] }], mem };
  }
  const e = hits[0].e;
  const blocks = [{ t: 'title', text: e.n, sub: `${schoolName(e.s)}، ${e.en}` }];
  if (e.fig) blocks.push({ t: 'fig', svg: figure(e.fig, { w: 300, h: 160 }) });
  blocks.push({ t: 'p', text: e.d });
  if (e.id?.length) blocks.push({ t: 'list', title: 'كيف تتعرف عليه', items: e.id });
  if (e.tr?.length) blocks.push({ t: 'list', title: 'كيف يتداول', items: e.tr });
  if (e.f) blocks.push({ t: 'warn', text: e.f });
  blocks.push({ t: 'note', text: e.auto ? 'نواة تقرؤه تلقائيا على الشارت.' : 'لا تكتشفه نواة آليا؛ يقرأ بالعين.' });
  const rel = hits.slice(1, 4).filter(h => h.score >= 3).map(h => `اشرح ${h.e.n}`);
  if (rel.length) blocks.push({ t: 'ask', items: rel });
  blocks.push({ t: 'actions', items: [{ label: 'افتحه في المكتبة', href: `#/library?k=${e.k}` }] });
  return { blocks, mem: { ...mem, topic: e.k } };
}

// ---------- arithmetic
async function risk(it, mem) {
  const r = tsetting('risk', { balance: 1000, riskPct: 1 });
  const info = symbolInfo(it.symbol || mem.symbol);
  if (!info) return { blocks: [{ t: 'p', text: 'لأي رمز؟ مثال: كم لوتا أحتاج على اليورو دولار لحساب 1000 ومخاطرة 1% ووقف 30 نقطة؟' }], mem };
  const balance = it.nums.balance ?? r.balance;
  const pct = it.nums.pct ?? r.riskPct;
  const q = await quotes([info.s, ...(conversionNeed(info) ? [conversionNeed(info).symbol] : [])]).catch(() => ({}));
  const price = q[info.s]?.price || (mem.plan && mem.symbol === info.s ? mem.plan.entry : null);
  let entry = price;
  let stop = null;
  if (it.nums.stopPips != null && price) stop = price - it.nums.stopPips * info.pip;
  else if (mem.plan && mem.symbol === info.s) { entry = mem.plan.entry; stop = mem.plan.stop; }
  if (entry == null || stop == null) return { blocks: [{ t: 'p', text: `كم مسافة الوقف بالنقاط على ${info.s}؟ اكتب مثلا: الستوب 25 نقطة.` }], mem: { ...mem, symbol: info.s } };
  const need = conversionNeed(info);
  const conv = need ? (q[need.symbol]?.price ? (need.invert ? 1 / q[need.symbol].price : q[need.symbol].price) : null) : null;
  const res = positionSize({ symbol: info.s, balance, riskPct: pct, entry, stop, price: entry, quoteToUsd: conv, leverage: r.leverage || 100 });
  if (!res || res.needsRate) return { blocks: [{ t: 'p', text: `هذا زوج تقاطعي ويحتاج سعر ${need?.symbol} لحساب قيمة النقطة. افتح صفحة المخاطرة واكتبه هناك.` }, { t: 'actions', items: [{ label: 'صفحة المخاطرة', href: `#/risk?sym=${info.s}` }] }], mem };
  const rows = info.cls === 'crypto'
    ? [['المبلغ المعرض', `${res.amount.toFixed(2)} $`], ['الكمية', `${res.units.toFixed(4)} ${info.base}`], ['قيمة المركز', `${res.notional.toFixed(2)} $`]]
    : [['المبلغ المعرض', `${res.amount.toFixed(2)} $ (${pct}% من ${balance})`], ['حجم الصفقة', `${res.lotsRounded.toFixed(2)} لوت`], ['مسافة الوقف', `${res.pips.toFixed(1)} نقطة`], ['قيمة النقطة لحجمك', `${res.perPip.toFixed(2)} $`], ['الخسارة الفعلية عند الوقف', `${res.actualRisk.toFixed(2)} $`]];
  return { blocks: [{ t: 'title', text: `حجم الصفقة على ${info.s}` }, { t: 'kv', rows }, ...(res.lots < 0.01 && info.cls !== 'crypto' ? [{ t: 'warn', text: 'الحجم أقل من 0.01 لوت، وهو أصغر حجم عند أغلب الوسطاء. قلل مسافة الوقف أو تقبل مخاطرة أعلى قليلا.' }] : []), { t: 'actions', items: [{ label: 'افتح الحاسبة الكاملة', href: `#/risk?sym=${info.s}&entry=${entry}&sl=${stop}` }] }], mem: { ...mem, symbol: info.s } };
}

function mg(it, mem) {
  const stake = it.nums.balance || 10;
  const steps = it.nums.steps ?? 3;
  const payout = it.nums.payout || it.nums.pct || tsetting('risk', {}).payout || 85;
  const wr = it.nums.winRate || 55;
  const m = martingale({ stake, multiplier: Math.max(2, Math.round(((1 + payout / 100) / (payout / 100)) * 100) / 100), steps, payout, winRate: wr, sequences: 100 });
  return {
    blocks: [
      { t: 'title', text: `المضاعفة بـ${steps} خطوات وعائد ${payout}%` },
      { t: 'table', head: ['الخطوة', 'المبلغ', 'المدفوع', 'الربح إن ربحت'], rows: m.rows.map(x => [x.k === 0 ? 'الأولى' : `مضاعفة ${x.k}`, x.stake.toFixed(2), x.spent.toFixed(2), x.profitIfWin.toFixed(2)]) },
      { t: 'kv', rows: [['أقصى خسارة في سلسلة', m.totalRisk.toFixed(2)], ['احتمال خسارة السلسلة كلها', pctTxt(m.lossAll)], ['احتمال حدوثها مرة في 100 سلسلة', pctTxt(m.ruinAtLeastOnce)], ['متوسط الربح لكل سلسلة', m.evPerSeq.toFixed(2)]] },
      { t: 'warn', text: `بنسبة نجاح ${wr}% تبدو المضاعفة رابحة أغلب الوقت، ثم تأتي سلسلة واحدة تمحو أرباح عشرات السلاسل. المضاعفة لا تغير احتمال الربح.` },
      { t: 'actions', items: [{ label: 'جرب أرقامك في الحاسبة', href: '#/risk' }] },
    ],
    mem,
  };
}

function be(it, mem) {
  const payout = it.nums.payout || it.nums.pct || tsetting('risk', {}).payout || 85;
  const b = breakEven(payout);
  return { blocks: [{ t: 'kv', rows: [['العائد', `${payout}%`], ['نسبة النجاح اللازمة للتعادل', `${(b * 100).toFixed(1)}%`]] }, { t: 'p', text: `أي نسبة نجاح أقل من ${(b * 100).toFixed(1)}% على مئة صفقة أو أكثر تعني خسارة مؤكدة على المدى الطويل، مهما كانت جودة الإشارات.` }], mem };
}

function session(mem) {
  const now = Math.floor(Date.now() / 1000);
  const c = marketClock(now, 'fx');
  const z = tz();
  const d = new Date(now * 1000);
  const at = h => fmtTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h) / 1000, z);
  return {
    blocks: [
      { t: 'title', text: c.fxClosed ? 'سوق العملات مغلق الآن' : `الجلسات المفتوحة: ${c.active.map(s => s.name).join(' و') || 'لا جلسة رئيسية'}` },
      { t: 'table', head: ['الجلسة', 'تفتح', 'تغلق', 'الآن'], rows: c.sessions.map(s => [s.name, at(s.open), at(s.close), s.active ? 'مفتوحة' : 'مغلقة']) },
      { t: 'p', text: `${QUALITY_TEXT[c.quality]}${c.killzone && !c.fxClosed ? ` الوقت الحالي ضمن ${c.killzone.name} في توقيت مناطق القتل.` : ''}` },
      { t: 'note', text: `الأوقات بتوقيت ${z}، وتراعي التوقيت الصيفي في أوروبا وأمريكا وأستراليا.` },
    ],
    mem,
  };
}

function channels(mem) {
  const chans = tstore.all('channels').filter(c => c.role !== 'target');
  const rows = chans.map(c => ({ c, s: channelStats(tstore.all('signals').filter(x => x.src === c.id)) })).filter(x => x.s.total).sort((a, b) => b.s.total - a.s.total).slice(0, 6);
  if (!rows.length) return { blocks: [{ t: 'p', text: 'لا توصيات مسجلة بعد. اربط البوت من صفحة التوصيات، أو الصق توصية هنا لأفحصها.' }, { t: 'actions', items: [{ label: 'التوصيات والقنوات', href: '#/signals?tab=setup' }] }], mem };
  return { blocks: [{ t: 'table', head: ['القناة', 'التوصيات', 'نجاح موثق', 'نجاح معلن', 'أطول خسائر'], rows: rows.map(({ c, s }) => [c.title, String(s.total), s.winRate != null ? `${Math.round(s.winRate * 100)}% من ${s.verified}` : 'لم يتحقق', s.claimedWinRate != null ? `${Math.round(s.claimedWinRate * 100)}%` : 'لا إعلانات', String(s.maxLossStreak)]) }, { t: 'p', text: 'التحقق بقاعدة الهدف الأول قبل الوقف، على الأسعار من وقت نشر كل توصية. أقل من 30 توصية موثقة لا تكفي للحكم.' }, { t: 'actions', items: [{ label: 'تفاصيل الأداء', href: '#/signals?tab=stats' }] }], mem };
}

function journal(mem) {
  const st = journalStats(tstore.all('trades'));
  if (!st.n) return { blocks: [{ t: 'p', text: 'لا صفقات مغلقة في يومياتك بعد.' }, { t: 'actions', items: [{ label: 'سجل صفقة', href: '#/journal?add=1' }] }], mem };
  const best = st.bySetup.filter(x => x.n >= 3).sort((a, b) => b.r - a.r)[0];
  return { blocks: [{ t: 'kv', rows: [['عدد الصفقات', String(st.n)], ['نسبة النجاح', `${Math.round(st.winRate * 100)}%`], ['الصافي', st.net.toFixed(2)], ['متوسط العائد', st.avgR != null ? `${st.avgR.toFixed(2)}R` : 'غير محسوب'], ['أطول خسائر متتالية', String(st.maxLossStreak)], ['التزمت بالخطة', `${Math.round(st.followedPlan * 100)}%`]] }, ...(best ? [{ t: 'p', text: `أفضل سبب دخول عندك حتى الآن: ${best.k}، بنسبة نجاح ${Math.round(best.winRate * 100)}% في ${count(best.n, ['صفقة واحدة', 'صفقتين', 'صفقات', 'صفقة'])}.` }] : []), { t: 'actions', items: [{ label: 'افتح اليوميات', href: '#/journal' }] }], mem };
}

function news(it, mem) {
  return { blocks: [{ t: 'p', text: 'لا أملك مفكرة اقتصادية حية ولا أخبارا لحظية. راجع المفكرة قبل جلستك، وركز على قرارات الفائدة والتضخم والوظائف الأمريكية.' }, { t: 'list', items: ['تجنب الدخول قبل الخبر القوي بربع ساعة وبعده بربع ساعة.', 'إن دخلت قبل خبر فقلل الحجم ووسع الوقف، فالفروقات تتسع والانزلاق وارد.', 'في الخيارات الثنائية لا تدخل في دقائق الخبر إطلاقا.'] }, { t: 'actions', items: [{ label: 'المفكرة في Forex Factory', href: 'https://www.forexfactory.com/calendar', external: true }, { label: 'المفكرة في Investing', href: 'https://sa.investing.com/economic-calendar/', external: true }] }], mem };
}

// ---------- a pasted signal
async function signal(it, mem) {
  const p = it.signal;
  const info = symbolInfo(p.symbol);
  const F = v => (v == null ? 'غير محدد' : P(v, info));
  const blocks = [{ t: 'title', text: `توصية ${p.kind === 'binary' ? (p.side === 'buy' ? 'صعود' : 'هبوط') : p.side === 'buy' ? 'شراء' : 'بيع'} على ${p.symbol}${p.otc ? ' OTC' : ''}` }];
  if (p.kind === 'binary') blocks.push({ t: 'kv', rows: [['الانتهاء', p.expiryMin ? `${p.expiryMin} دقائق` : 'غير محدد'], ['وقت الدخول', p.time || 'فوري'], ['المضاعفات', p.mg ? String(p.mg) : 'لا']] });
  else blocks.push({ t: 'kv', rows: [['الدخول', p.zone ? `${F(p.zone[0])} إلى ${F(p.zone[1])}` : F(p.entry)], ['الوقف', F(p.sl)], ...p.tps.map((x, k) => [`الهدف ${k + 1}`, F(x)]), ...(p.rr ? [['العائد إلى المخاطرة للهدف الأول', p.rr.toFixed(2)]] : [])] });
  if (p.missing.length) blocks.push({ t: 'warn', text: `ناقص: ${p.missing.join('، ')}.` });
  for (const x of p.issues) blocks.push({ t: 'warn', text: x });
  if (info && !p.otc && sourceFor(info.s) !== 'demo') {
    try {
      const tf = p.kind === 'binary' ? (p.expiryMin && p.expiryMin <= 3 ? '1m' : '5m') : '1h';
      const res = await loadCandles(info.s, tf);
      const h = higherTf(tf);
      const htf = h ? await loadCandles(info.s, h).catch(() => null) : null;
      const r = analyze(res.candles, { symbol: info.s, tf, htf: htf?.candles });
      if (r.ok) {
        const a = r.volatility.atr;
        const agree = r.bias === p.side;
        const lines = [`المحرك يرى على ${r.frame}: ${r.biasText} بدرجة توافق ${Math.abs(r.score)}، ${r.bias === 'neutral' ? 'بلا ترجيح واضح' : agree ? 'أي أنه يتفق مع التوصية' : 'أي أنه يخالف التوصية'}.`];
        if (p.kind !== 'binary' && p.entry != null) {
          const dist = Math.abs(r.price - p.entry) / a;
          lines.push(`السعر الآن ${F(r.price)}، والدخول على بعد ${dist.toFixed(1)} من متوسط المدى.`);
          if (p.sl != null) {
            const sd = Math.abs(p.entry - p.sl) / a;
            lines.push(sd < 0.5 ? 'الوقف ضيق جدا مقارنة بحركة السوق المعتادة، وقد يضرب بالضجيج.' : sd > 4 ? 'الوقف واسع جدا، فقلل الحجم ليبقى خطرك ثابتا.' : `الوقف على بعد ${sd.toFixed(1)} من متوسط المدى، وهي مسافة معقولة.`);
          }
        }
        if (p.kind === 'binary') lines.push(`القراءة القصيرة للمحرك: ${r.binary.label} بقوة ${Math.abs(r.binary.score)}.`);
        blocks.push({ t: 'list', title: 'فحص على الأسعار', items: lines });
      }
    } catch (e) { blocks.push({ t: 'note', text: `تعذر جلب الأسعار للفحص: ${e.message}` }); }
  }
  blocks.push({ t: 'actions', items: [{ label: 'أضفها إلى التوصيات', href: `#/signals?add=1&text=${encodeURIComponent(p.text.slice(0, 900))}` }, ...(info ? [{ label: 'على الشارت', href: `#/market?sym=${info.s}` }] : [])] });
  return { blocks, mem: { ...mem, symbol: info?.s || mem.symbol } };
}

// The conversation as text, for copying.
export function blocksText(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.t === 'verdict') out.push(`${b.symbol} على ${b.frame}: ${b.bias === 'buy' ? 'شراء' : b.bias === 'sell' ? 'بيع' : 'محايد'}، التوافق ${Math.abs(b.score)} من 100، ${b.confidence}.`);
    else if (b.t === 'title') out.push(b.text);
    else if (b.t === 'p' || b.t === 'warn' || b.t === 'note') out.push(b.title ? `${b.title}: ${b.text}` : b.text);
    else if (b.t === 'list') out.push(...(b.title ? [b.title] : []), ...b.items.map(x => `- ${x}`));
    else if (b.t === 'kv') out.push(...b.rows.map(([k, v]) => `${k}: ${v}`));
    else if (b.t === 'plan') out.push(`${b.side === 'buy' ? 'شراء' : 'بيع'} ${b.entryType} ${b.entry}، الوقف ${b.stop}، الأهداف ${b.targets.map(t => t.price).join(' ثم ')}. ${b.invalid}`);
    else if (b.t === 'table') out.push(b.head.join(' | '), ...b.rows.map(r => r.join(' | ')));
  }
  return out.join('\n');
}
