// From a reading to a plan: where to enter, where the idea is wrong (the stop), where to take
// profit, and the reward against the risk for each target. For binary options: the direction,
// the expiry in candles, and the conditions under which there is no trade at all.
import { fmtPrice, tfInfo } from './symbols.js';

const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function pipsOf(diff, info) {
  if (!info?.pip) return null;
  return Math.abs(diff) / info.pip;
}

function distText(diff, info, price) {
  const pct = Math.abs(diff / price) * 100;
  if (info?.cls === 'fx' || info?.cls === 'metal') return `${pipsOf(diff, info).toFixed(info.cls === 'metal' ? 0 : 1)} نقطة`;
  return `${pct.toFixed(2)}%`;
}

const entryWord = { market: 'من السعر الحالي', limit: 'بأمر معلق عند', stop: 'عند الاختراق فوق' };

export function buildPlan(bias, c) {
  if (bias === 'neutral') return scenarios(c);
  const { price, a, info, tf, support, resistance, obs, fvg, sd, liq, chart, harm, waves, dr, trendUp, fib, prevDay, piv, zzMain } = c;
  const dir = bias === 'buy' ? 1 : -1;
  const P = p => fmtPrice(p, info);
  const zones = [];
  const push = (top, bottom, kind, label, w) => zones.push({ top: Math.max(top, bottom), bottom: Math.min(top, bottom), kind, label, w });
  if (dir === 1) {
    for (const s of support.slice(0, 3)) push(s.top, s.bottom, 'sr', `الدعم ${P(s.price)}`, 1 + Math.min(1, s.strength / 6));
    for (const o of obs.filter(x => x.dir === 'bull')) push(o.top, o.bottom, 'ob', 'كتلة أوامر شرائية', 1.3);
    for (const g of fvg.filter(x => x.dir === 'bull')) push(g.top, g.bottom, 'fvg', 'فجوة قيمة عادلة صاعدة', 0.9);
    for (const z of sd.filter(x => x.dir === 'demand')) push(z.top, z.bottom, 'sd', z.fresh ? 'منطقة طلب لم تختبر' : 'منطقة طلب', z.fresh ? 1.2 : 0.8);
    if (dr && trendUp) push(dr.ote.top, dr.ote.bottom, 'ote', 'منطقة الدخول المثلى', 1);
    for (const h of harm.filter(x => x.potential && x.dir === 1)) push(h.prz.top, h.prz.bottom, 'prz', `منطقة انعكاس ${h.name}`, 1.1);
  } else {
    for (const s of resistance.slice(0, 3)) push(s.top, s.bottom, 'sr', `المقاومة ${P(s.price)}`, 1 + Math.min(1, s.strength / 6));
    for (const o of obs.filter(x => x.dir === 'bear')) push(o.top, o.bottom, 'ob', 'كتلة أوامر بيعية', 1.3);
    for (const g of fvg.filter(x => x.dir === 'bear')) push(g.top, g.bottom, 'fvg', 'فجوة قيمة عادلة هابطة', 0.9);
    for (const z of sd.filter(x => x.dir === 'supply')) push(z.top, z.bottom, 'sd', z.fresh ? 'منطقة عرض لم تختبر' : 'منطقة عرض', z.fresh ? 1.2 : 0.8);
    if (dr && !trendUp) push(dr.ote.top, dr.ote.bottom, 'ote', 'منطقة الدخول المثلى', 1);
    for (const h of harm.filter(x => x.potential && x.dir === -1)) push(h.prz.top, h.prz.bottom, 'prz', `منطقة انعكاس ${h.name}`, 1.1);
  }
  // reachable zones on the right side of price, at most 2.5 ATR away
  const near = z => (dir === 1 ? price - z.top : z.bottom - price);
  const cand = zones.filter(z => near(z) >= -a * 0.3 && near(z) <= a * 2.5 && (dir === 1 ? z.bottom < price + a * 0.3 : z.top > price - a * 0.3));
  for (const z of cand) z.conf = cand.filter(o => o !== z && o.bottom <= z.top + a * 0.15 && o.top >= z.bottom - a * 0.15).reduce((s, o) => s + o.w, z.w);
  cand.sort((x, y) => y.conf - x.conf || Math.abs(near(x)) - Math.abs(near(y)));
  const best = cand[0] || null;

  let entry;
  const inside = best && (dir === 1 ? price <= best.top + a * 0.3 : price >= best.bottom - a * 0.3);
  if (best && inside) entry = { type: 'market', price, zone: best };
  else if (best) entry = { type: 'limit', price: dir === 1 ? best.top : best.bottom, zone: best };
  else entry = { type: 'market', price, zone: null };

  // a forming pattern with its trigger close ahead offers a breakout entry instead
  const brk = chart.find(p => p.status === 'forming' && (p.expected ?? p.dir) === dir && (p.trigger || p.neckline || (dir === 1 ? p.upper : p.lower)));
  let breakout = null;
  if (brk) {
    const trig = brk.trigger || brk.neckline || (dir === 1 ? brk.upper : brk.lower);
    if (trig && dir * (trig - price) > 0 && Math.abs(trig - price) <= a * 1.5) breakout = { type: 'stop', price: trig + dir * a * 0.1, pattern: brk.name, fem: brk.fem };
  }

  // stop beyond structure: the zone edge or the nearest swing, at least 0.8 ATR from entry
  const e = entry.price;
  const structural = [];
  if (entry.zone) structural.push(dir === 1 ? entry.zone.bottom : entry.zone.top);
  for (const p of zzMain.slice(-10)) if (dir === 1 ? p.type === 'L' && p.price < e : p.type === 'H' && p.price > e) structural.push(p.price);
  for (const s of (dir === 1 ? support : resistance).slice(0, 4)) if (dir === 1 ? s.price < e : s.price > e) structural.push(dir === 1 ? s.bottom : s.top);
  const ok = structural.filter(x => Math.abs(e - x) >= a * 0.8 && Math.abs(e - x) <= a * 3.5).sort((x, y) => Math.abs(e - x) - Math.abs(e - y));
  let stop;
  let stopNote = '';
  if (ok.length) stop = ok[0] - dir * a * 0.25;
  else { stop = e - dir * a * 1.5; stopNote = 'لا هيكل قريب للوقف، فهو مقدر بمرة ونصف من متوسط المدى'; }
  const risk = Math.abs(e - stop);

  // targets: opposing levels, liquidity, pattern and wave targets, Fibonacci extensions
  const tcs = [];
  const T = (price_, label, weight = 1) => { if (Number.isFinite(price_) && dir * (price_ - e) > a * 0.4) tcs.push({ price: price_, label, weight }); };
  for (const r of (dir === 1 ? resistance : support).slice(0, 4)) T(r.price - dir * a * 0.1, dir === 1 ? 'مقاومة' : 'دعم', 1 + Math.min(1, r.strength / 6));
  for (const p of liq.filter(x => !x.swept && x.side === (dir === 1 ? 'buy' : 'sell'))) T(p.price, dir === 1 ? 'سيولة فوق القمم المتساوية' : 'سيولة تحت القيعان المتساوية', 1.2);
  if (prevDay) T(dir === 1 ? prevDay.h : prevDay.l, dir === 1 ? 'قمة أمس' : 'قاع أمس', 0.9);
  if (piv) { T(dir === 1 ? piv.r1 : piv.s1, dir === 1 ? 'المقاومة الأولى للارتكاز' : 'الدعم الأول للارتكاز', 0.7); T(dir === 1 ? piv.r2 : piv.s2, dir === 1 ? 'المقاومة الثانية للارتكاز' : 'الدعم الثاني للارتكاز', 0.6); }
  for (const p of chart.filter(x => x.dir === dir && x.target && x.status !== 'failed')) T(p.target, `هدف ${p.name}`, 1.3);
  for (const h of harm.filter(x => !x.potential && x.dir === dir && x.barsAgo <= 10)) h.targets.forEach((t, k) => T(t, `هدف ${h.name} ${k + 1}`, 1.1));
  for (const w of waves.filter(x => x.next.dir === dir).slice(0, 1)) w.next.targets.forEach(t => T(t, 'هدف موجي', 0.8));
  if (fib && fib.legUp === (dir === 1)) for (const x of fib.extensions.filter(q => [1.272, 1.618].includes(q.r))) T(x.price, `امتداد فيبوناتشي ${x.r}`, 0.8);
  tcs.sort((x, y) => dir * (x.price - y.price));
  const merged = [];
  for (const t of tcs) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(t.price - prev.price) <= a * 0.35) { prev.weight += t.weight; if (!prev.label.includes(t.label)) prev.label += `، ${t.label}`; continue; }
    merged.push({ ...t });
  }
  const R = p => Math.abs(p - e) / (risk || 1);
  const targets = [];
  const pick = minR => merged.find(t => !targets.includes(t) && R(t.price) >= minR && (!targets.length || dir * (t.price - targets[targets.length - 1].price) > 0));
  const t1 = pick(1) || merged.find(t => R(t.price) >= 0.6);
  if (t1) targets.push(t1);
  const t2 = pick(Math.max(1.8, t1 ? R(t1.price) + 0.6 : 1.8));
  if (t2) targets.push(t2);
  const t3 = pick(Math.max(2.8, t2 ? R(t2.price) + 0.8 : 2.8));
  if (t3) targets.push(t3);
  const filler = [1.5, 2.5, 3.5];
  while (targets.length < 2) {
    const want = filler.find(m => !targets.length || m > R(targets[targets.length - 1].price) + 0.3) || 4;
    targets.push({ price: e + dir * risk * want, label: `مضاعف المخاطرة ${want}`, weight: 0 });
  }
  const tgs = targets.map(t => ({ price: t.price, label: t.label, rr: R(t.price) }));

  const warnings = [];
  if (tgs[0].rr < 1) warnings.push('العائد للهدف الأول أقل من المخاطرة؛ الأفضل انتظار دخول أفضل أو تخطي الصفقة.');
  if (risk > a * 3.5) warnings.push('الوقف بعيد بأكثر من ثلاثة أضعاف متوسط المدى، فقلل حجم الصفقة.');
  if (stopNote) warnings.push(stopNote + '.');
  const invalid = stop;
  const typeTxt = entry.type === 'market' ? 'من السعر الحالي' : `بأمر معلق عند ${P(entry.price)}`;
  const tpTxt = tgs.map(t => P(t.price)).join(' ثم ');
  const summary = `${dir === 1 ? 'شراء' : 'بيع'} ${typeTxt}${entry.zone ? ` (${entry.zone.label})` : ''}، ووقف الخسارة ${P(stop)} على بعد ${distText(risk, info, price)}. الأهداف ${tpTxt}، والعائد إلى المخاطرة ${tgs[0].rr.toFixed(1)} للهدف الأول. تلغى الفكرة إذا أغلقت شمعة على ${tf.frame} ${dir === 1 ? 'تحت' : 'فوق'} ${P(invalid)}.${breakout ? ` بديل الاختراق: ${dir === 1 ? 'شراء' : 'بيع'} عند ${P(breakout.price)} إذا ${breakout.fem ? 'اكتملت' : 'اكتمل'} ${breakout.pattern}.` : ''}`;
  return { side: bias, dir, entry: { type: entry.type, price: entry.price, zone: entry.zone ? { top: entry.zone.top, bottom: entry.zone.bottom, label: entry.zone.label } : null, text: entryWord[entry.type] }, breakout, stop, risk, riskText: distText(risk, info, price), targets: tgs, invalid, warnings, summary, validBars: entry.type === 'limit' ? 12 : 3 };
}

// No side yet: the two conditions that would create one.
function scenarios(c) {
  const { price, a, info, tf, support, resistance } = c;
  const P = p => fmtPrice(p, info);
  const r1 = resistance[0];
  const r2 = resistance[1];
  const s1 = support[0];
  const s2 = support[1];
  const up = r1 ? { trigger: r1.price + a * 0.15, target: r2 ? r2.price : r1.price + a * 2, stop: r1.price - a * 1.2 } : null;
  const dn = s1 ? { trigger: s1.price - a * 0.15, target: s2 ? s2.price : s1.price - a * 2, stop: s1.price + a * 1.2 } : null;
  const parts = [];
  if (up) parts.push(`إغلاق شمعة على ${tf.frame} فوق ${P(up.trigger)} يرجح الشراء نحو ${P(up.target)}`);
  if (dn) parts.push(`وإغلاق تحت ${P(dn.trigger)} يرجح البيع نحو ${P(dn.target)}`);
  return { side: null, scenarios: { up, down: dn }, summary: parts.length ? `${parts.join('، ')}. بين المستويين لا صفقة.` : 'لا مستويات كافية لبناء سيناريو.', warnings: [], targets: [] };
}

// ---------- binary options: direction over the next few candles
const EXPIRY = { '1m': [2, 3, 5], '5m': [15, 20, 30], '15m': [45, 60], '30m': [90, 120], '1h': [180, 240], '4h': [720], '1d': [2880], '1w': [] };

export function binaryView(c) {
  const { cs, price, a, info, tf, rsi, stoch, bb, ema9, ema21, candleList, closedI, clock, atrRank, payout = 0.85, support, resistance, score } = c;
  const lastI = cs.length - 1;
  let v = 0;
  const why = [];
  const st = sgn((ema9[lastI] ?? price) - (ema21[lastI] ?? price));
  v += 0.2 * st;
  why.push(st > 0 ? 'المتوسطان 9 و21 مرتبان صعودا' : 'المتوسطان 9 و21 مرتبان هبوطا');
  const r = rsi[lastI];
  const r3 = rsi[lastI - 3];
  if (r != null && r3 != null) { v += 0.15 * sgn(r - r3); }
  const k = stoch.k[lastI];
  const kp = stoch.k[lastI - 1];
  const dd = stoch.d[lastI];
  const dp = stoch.d[lastI - 1];
  if (k != null && kp != null) {
    if (kp <= dp && k > dd && k < 30) { v += 0.25; why.push('تقاطع صاعد للستوكاستك من التشبع البيعي'); }
    if (kp >= dp && k < dd && k > 70) { v -= 0.25; why.push('تقاطع هابط للستوكاستك من التشبع الشرائي'); }
  }
  const up = bb.upper[lastI];
  const lo = bb.lower[lastI];
  const lc = cs[closedI];
  if (up != null && lc.h >= bb.upper[closedI] && r >= 68) { v -= 0.3; why.push('لمس الحد العلوي لبولينجر مع تشبع شرائي'); }
  if (lo != null && lc.l <= bb.lower[closedI] && r <= 32) { v += 0.3; why.push('لمس الحد السفلي لبولينجر مع تشبع بيعي'); }
  const pat = candleList.filter(p => p.i === closedI && p.context && p.bias !== 0 && p.strength >= 2)[0];
  if (pat) { v += pat.bias * 0.3; why.push(`${pat.name} على آخر شمعة مغلقة`); }
  const s1 = support[0];
  const r1 = resistance[0];
  const dS = s1 ? (price - s1.price) / a : Infinity;
  const dR = r1 ? (r1.price - price) / a : Infinity;
  if (dS <= 0.5) { v += 0.2; why.push('السعر على دعم قريب'); }
  if (dR <= 0.5) { v -= 0.2; why.push('السعر تحت مقاومة قريبة'); }
  v += 0.15 * sgn(score);
  const bscore = Math.round(clamp(v) * 100);
  const direction = bscore >= 25 ? 'call' : bscore <= -25 ? 'put' : null;

  const noTrade = [];
  if (info?.otc) noTrade.push('أسعار OTC يولدها الوسيط نفسه ولا تطابق السوق الحقيقي، فلا يصلح تحليلها بهذه البيانات.');
  if (clock.fxClosed) noTrade.push('السوق الحقيقي مغلق الآن.');
  if (atrRank != null && atrRank < 0.1) noTrade.push('الحركة ميتة: التقلب في أدنى مستوياته، والنتيجة شبه عشوائية.');
  if (atrRank != null && atrRank > 0.95) noTrade.push('تقلب مفرط الآن، غالبا بسبب خبر؛ انتظر حتى يهدأ.');
  if (dS > 1.5 && dR > 1.5) noTrade.push('السعر بعيد عن أي مستوى، ولا سبب واضح للحركة في مدة قصيرة.');
  if (!direction) noTrade.push('الإشارات متعارضة على المدى القصير.');
  if (clock.quality === 'thin' && info?.cls !== 'crypto') noTrade.push('سيولة ضعيفة في هذا الوقت.');

  const tfi = tfInfo(tf.k || tf);
  const nextClose = (Math.floor(cs[lastI].t / tfi.sec) + 1) * tfi.sec;
  const p = Number(payout) > 1 ? Number(payout) / 100 : Number(payout);
  const breakEven = 1 / (1 + p);
  return {
    direction, label: direction === 'call' ? 'صعود (Call)' : direction === 'put' ? 'هبوط (Put)' : 'لا صفقة', score: bscore, reasons: why,
    expiries: EXPIRY[tfi.k] || [], expiryCandles: [3, 5], entryAt: nextClose, noTrade, breakEven, payout: p,
    note: `بعائد ${Math.round(p * 100)}% تحتاج نسبة نجاح ${(breakEven * 100).toFixed(1)}% فقط لتتعادل، وأي نسبة أقل تعني خسارة مؤكدة على المدى الطويل.`,
  };
}
