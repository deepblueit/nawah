// What a message to إكس نواة asks for. It reads Modern Standard Arabic, Egyptian, Gulf and
// Levantine phrasing and English, finds the symbol and timeframe, and keeps the last ones so a
// follow-up such as «وعلى الأربع ساعات؟» works without repeating the symbol.
import { findSymbol, findTimeframe, normAr, symbolsIn } from './symbols.js';
import { parseSignal, isSignal } from './signals.js';

const has = (t, re) => re.test(t);

const RX = {
  greet: /^(السلام عليكم|سلام|اهلا|أهلا|مرحبا|هاي|هلا|صباح الخير|مساء الخير|hi|hello|hey)(?=$|[\s!.,،؟?])/i,
  thanks: /(شكرا|متشكر|تسلم|يعطيك العافيه|thank)/i,
  help: /(بتعمل ايه|تعمل ايه|بتعرف تعمل|تقدر تعمل|ايش تسوي|شو بتعمل|ماذا تستطيع|ما الذي تستطيع|مساعده|help|what can you)/i,
  analyze: /(حلل|حلل لي|تحليل|رايك|رأيك|ايه وضع|ايش وضع|شو وضع|وضع|اتجاه|هيطلع|هينزل|يطلع|ينزل|طالع|نازل|صاعد ولا هابط|شراء ولا بيع|اشتري ولا ابيع|ادخل|ندخل|صفقه على|فرصه|نظره|توقع|analy[sz]e|analysis|outlook|setup|bias|should i (buy|sell))/i,
  levels: /(دعوم|دعم|مقاومات|مقاومه|مستويات|ارتكاز|بيفوت|levels?|support|resistance|pivot)/i,
  patterns: /(نماذج|نموذج|باترن|بترن|شموع|شمعه|هارمونيك|موجات|pattern)/i,
  binary: /(باينري|بايناري|خيارات ثنائيه|(?:^|\s)(?:كول|بوت)(?=$|\s)|\bcall\b|\bput\b|expiry|انتهاء|صفقه دقيقه|صفقات دقيقه|quotex|pocket|olymp|iq option|binary)/i,
  explain: /(يعني ايه|يعني ايش|يعني شو|ايه هو|ايه هي|ايش هو|شو هو|ما هو|ما هي|ماهو|ماهي|ما معنى|معنى|اشرح|شرح|عرفني|علمني|ازاي اتعامل|كيف اتعامل|كيف يعمل|explain|what is|what are|meaning of|how does)/i,
  differ: /(الفرق بين|ايه الفرق|ما الفرق|difference between|vs\b)/i,
  risk: /(لوت|اللوت|حجم الصفقه|حجم العقد|كام لوت|كم لوت|قيمه النقطه|قيمه البيب|مارجن|هامش|lot size|position size|pip value|margin)/i,
  martingale: /(مضاعفه|مضاعفات|مارتينجال|مارتنجال|martingale|gale)/i,
  breakeven: /(نسبه النجاح المطلوبه|نقطه التعادل|اتعادل|break ?even|payout|العائد \d+|نسبه الربح \d+|ربح \d+ ?%)/i,
  session: /(جلسه|جلسات|سيشن|امتى يفتح|متى يفتح|افضل وقت|أفضل وقت|اوقات التداول|السوق مفتوح|السوق مقفول|السوق مغلق|session|killzone|كيل زون)/i,
  compare: /(قارن|مقارنه|اقوى|أقوى|افضل بين|احسن بين|compare)/i,
  channel: /(قناه|القناه|قنوات|تيليجرام|تلجرام|تيلجرام|channel)/i,
  stats: /(اداء|أداء|نسبه نجاح|نتائج|احصائيات|إحصائيات|stats|performance|win ?rate)/i,
  journal: /(صفقاتي|يومياتي|اليوميات|سجلي|journal|my trades)/i,
  connect: /(?:اربط|ربط|اوصل|توصيل|وصل|اضيف|اضافه|ضيف|انقل|نقل|انسخ|نسخ|connect|link)\S*\s.{0,25}(?:بوت|تيليجرام|تلجرام|تيلجرام|تليجرام|قناه|قنوات|توصيات|telegram|bot)|(?:telegram|تيليجرام|تلجرام|تيلجرام|تليجرام)\s.{0,20}(?:ربط|اربط|اوصل)/i,
  news: /(خبر|اخبار|أخبار|الفيدرالي|الفائده|التضخم|الوظائف|nfp|cpi|fomc|news)/i,
  plan: /(الهدف|الاهداف|الوقف|الستوب|الدخول|ادخل منين|ادخل امتى|target|stop|entry)/i,
};

// numbers with their meaning: balance, risk percent, stop distance, payout, stake
function numbersOf(t) {
  const out = {};
  const pct = t.match(/(\d+(?:\.\d+)?)\s*(%|٪|بالمئه|بالميه|في الميه|percent)/i);
  if (pct) out.pct = Number(pct[1]);
  const bal = t.match(/(?:حساب|رصيد|راس مال|راس المال|balance|account)\D{0,12}(\d[\d,.]*)/i) || t.match(/(\d[\d,.]*)\s*(دولار|\$|usd)/i);
  if (bal) out.balance = Number(bal[1].replace(/,/g, ''));
  const stop = t.match(/(?:ستوب|استوب|الوقف|وقف|stop|sl)\D{0,10}(\d+(?:\.\d+)?)\s*(نقطه|نقاط|بيب|pips?)?/i) || t.match(/(\d+(?:\.\d+)?)\s*(نقطه|نقاط|بيب|pips?)/i);
  if (stop) out.stopPips = Number(stop[1]);
  const payout = t.match(/(?:عائد|payout|ربح|نسبه الربح)\D{0,8}(\d{2,3})/i);
  if (payout) out.payout = Number(payout[1]);
  const steps = t.match(/(\d)\s*(مضاعفات|مضاعفه|خطوات|steps?)/i);
  if (steps) out.steps = Number(steps[1]);
  const wr = t.match(/(?:نسبه نجاح|نسبه النجاح|win ?rate)\D{0,8}(\d{1,3})/i);
  if (wr) out.winRate = Number(wr[1]);
  return out;
}

export function understand(text, memory = {}) {
  const raw = String(text || '').trim();
  const t = normAr(raw);
  const sig = parseSignal(raw);
  const symbol = findSymbol(raw);
  const symbols = symbolsIn(raw).map(x => x.s);
  const tf = findTimeframe(t);
  const nums = numbersOf(t);
  const base = { raw, t, symbol: symbol?.s || null, otc: !!symbol?.otc, tf, nums, symbols: [...new Set(symbols)] };
  const follow = !base.symbol && memory.symbol;
  const withMem = x => ({ ...x, symbol: x.symbol || memory.symbol || null, tf: x.tf || memory.tf || null, followUp: follow });

  if (isSignal(sig) && (sig.kind === 'binary' || sig.entry != null || sig.sl != null)) return { ...base, intent: 'signal', signal: sig };
  if (has(t, RX.greet) && t.length < 40) return { ...base, intent: 'greet' };
  if (has(t, RX.thanks) && t.length < 40) return { ...base, intent: 'thanks' };
  if (has(t, RX.help) && !base.symbol) return { ...base, intent: 'help' };
  if (has(t, RX.connect) && !has(t, RX.stats)) return { ...base, intent: 'connect' };
  if (has(t, RX.martingale)) return withMem({ ...base, intent: 'martingale' });
  if (has(t, RX.breakeven) && !has(t, RX.analyze)) return { ...base, intent: 'breakeven' };
  if (has(t, RX.risk)) return withMem({ ...base, intent: 'risk' });
  if (has(t, RX.session) && !base.symbol) return { ...base, intent: 'session' };
  if (has(t, RX.journal)) return { ...base, intent: 'journal' };
  if (has(t, RX.channel) && has(t, RX.stats)) return { ...base, intent: 'channel' };
  if (has(t, RX.compare) && base.symbols.length >= 2) return { ...base, intent: 'compare', tf: tf || memory.tf || null };
  if ((has(t, RX.explain) || has(t, RX.differ)) && !(base.symbol && has(t, RX.analyze))) return { ...base, intent: has(t, RX.differ) ? 'differ' : 'explain' };
  if (has(t, RX.news)) return withMem({ ...base, intent: 'news' });
  if (has(t, RX.binary) && (base.symbol || memory.symbol)) return withMem({ ...base, intent: 'binary' });
  if (has(t, RX.levels) && (base.symbol || memory.symbol)) return withMem({ ...base, intent: 'levels' });
  if (has(t, RX.patterns) && (base.symbol || memory.symbol) && !has(t, RX.explain)) return withMem({ ...base, intent: 'patterns' });
  if (base.symbol || has(t, RX.analyze) || (tf && memory.symbol)) {
    if (!base.symbol && !memory.symbol) return { ...base, intent: 'need-symbol' };
    return withMem({ ...base, intent: has(t, RX.plan) && !has(t, RX.analyze) && memory.symbol ? 'plan' : 'analyze' });
  }
  if (has(t, RX.plan) && memory.symbol) return withMem({ ...base, intent: 'plan' });
  // a single word may name a concept from the library
  return { ...base, intent: 'explain', guess: true };
}
