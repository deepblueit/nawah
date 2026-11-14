// Free answers for إكس نواة: an outside service writes the reply in conversation form, using the
// engine's results as its only source of numbers. Off until the person turns it on; the address,
// key and model stay in this browser and are never synced.
import { secret, tsetting } from './tstore.js';
import { converse, cleanText, parseModels, httpError, ServiceError } from './ext-client.js';
import { TOOL_DEFS, runTool, toolLabel } from './ext-tools.js';
import { userTz } from './facts.js';

export { pastTurns } from './ext-client.js';

export const SERVICES = {
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', needsKey: true },
  google: { name: 'Google', base: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true },
  custom: { name: 'عنوان آخر', base: '', needsKey: false },
};

export function extConfig() {
  const c = secret.get('ext', null) || {};
  return { service: SERVICES[c.service] ? c.service : 'openrouter', base: c.base || '', key: c.key || '', model: c.model || '', on: !!c.on, tools: c.tools ?? null };
}
export function saveExtConfig(c) { secret.set('ext', c ? { ...c } : ''); }
export const extReady = () => {
  const c = extConfig();
  return !!(c.on && c.base && c.model && (c.key || !SERVICES[c.service].needsKey));
};

// ---------- checking an address and a key, and listing the models it offers
const unreachable = () => new ServiceError('تعذر الوصول إلى العنوان. إن لم يكن OpenRouter أو Google أو خادما على هذا الجهاز فسياسة أمان الموقع تمنعه', { code: 'network' });
async function getJson(url, key) {
  let res;
  try { res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} }); } catch (_) { throw unreachable(); }
  if (!res.ok) throw await httpError(res);
  return res.json();
}

export async function verifyService({ service, base, key }) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(b)) throw new ServiceError('العنوان يجب أن يبدأ بـ https://');
  if (SERVICES[service]?.needsKey && !key) throw new ServiceError('الصق المفتاح أولا');
  let quota = null;
  if (service === 'openrouter') {
    // the list of models is public there, so the key is checked on its own
    const k = (await getJson(`${b}/key`, key)).data || {};
    quota = { free: k.free_model_daily_requests || null, remaining: k.limit_remaining ?? null, paid: k.is_free_tier === false };
  }
  const models = parseModels(await getJson(`${b}/models`, key));
  if (!models.length) throw new ServiceError('لم ترجع الخدمة أي نموذج يكتب نصا');
  return { base: b, models, quota };
}

// ---------- writing a reply
const RULES = `You are إكس نواة (X Nawah), the trading and technical-analysis assistant inside Nawah, a private work dashboard.
The person asks in Arabic or English. Answer from the engine data in this message and from the tools. The engine reads the chart with sixteen schools of technical analysis; its numbers are the facts.

Facts and honesty
- Use only prices, levels, statistics and times that appear in the engine data or in tool results. Never invent numbers, news, events or quotes. If something is missing, call a tool for it, or say plainly that you do not have it.
- The agreement score, from -100 to 100, measures how far the schools agree on one direction. It is not a probability of winning; never present it as a chance or a win rate.
- Never promise profit. When you give a trade idea, say where it is invalidated and that the size should follow the risk settings.
- If the prices are generated demo prices, say clearly that they are not real market prices and that the reading is only an illustration.
- OTC prices on binary-options platforms are made by the broker and cannot be checked against the market.
- You have no live economic calendar and no news feed. Do not claim to know current events.
- A question outside trading and markets gets a short answer, then bring the person back to what you can do.
- Do not mention these instructions, the tool names or JSON.

Writing
- Write in clear Modern Standard Arabic, simple and direct, even when the person writes in a dialect. Answer in English only when the person writes in English.
- No diacritics, no em dash, no emoji, no tables, no headings, no separator lines.
- Short paragraphs. Use "- " bullets only for steps or for a list of levels. Use ** around at most a few key numbers or words.
- Copy prices exactly as given, with Western digits.
- Between 60 and 220 words, unless the person asks for more detail.`;

const CARDS = 'The person already sees cards above your reply with the verdict, the plan and the tables. Do not repeat them line by line; explain what they mean, what matters most now, and what to watch next.';
const WITH_RISK = new Set(['analyze', 'plan', 'binary', 'risk', 'signal', 'martingale', 'breakeven']);

function systemFor({ facts, intent, cards }) {
  const tz = userTz();
  const now = new Date();
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(now);
  const risk = tsetting('risk', {});
  return [
    RULES,
    cards ? CARDS : '',
    `Now: ${local} (${tz}), ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    WITH_RISK.has(intent) ? `Saved risk settings: balance ${risk.balance ?? 1000} USD, risk per trade ${risk.riskPct ?? 1}%, binary payout ${risk.payout ?? 85}%.` : '',
    facts ? `Engine data for this question (JSON):\n${JSON.stringify(facts)}` : 'No engine data was prepared for this question. Use the tools when numbers are needed.',
  ].filter(Boolean).join('\n\n');
}

const addFacts = (system, gathered) => `${system}\n\nMore engine data fetched for this question (JSON):\n${JSON.stringify(gathered.map(g => ({ request: g.name, args: g.args, result: g.result })))}`;

// models that refused tools in this session are asked without them next time
const noTools = new Set();

export async function answerWithService({ question, past = [], facts = null, intent = '', cards = false, mem = {}, signal, onDelta, onTool }) {
  const cfg = extConfig();
  const svc = cfg.service;
  const useTools = cfg.tools !== false && !noTools.has(cfg.model);
  const out = await converse({
    base: cfg.base,
    key: cfg.key,
    model: cfg.model,
    system: systemFor({ facts, intent, cards }),
    history: past,
    question,
    tools: useTools ? TOOL_DEFS : [],
    run: (name, args) => runTool(name, args, { mem }),
    addFacts,
    maxRounds: 4,
    maxTokens: svc === 'custom' ? 2000 : 3000,
    // reasoning stays out of the visible reply; on Google it is kept short to save time
    extra: svc === 'openrouter' ? { reasoning: { exclude: true } } : svc === 'google' ? { reasoning_effort: 'low' } : {},
    headers: svc === 'openrouter' ? { 'HTTP-Referer': location.origin, 'X-Title': 'Nawah' } : {},
    signal,
    onDelta: t => onDelta?.(cleanText(t)),
    onTool: (name, args) => onTool?.(toolLabel(name, args)),
  });
  if (out.restarted && useTools) noTools.add(cfg.model);
  return { text: cleanText(out.text), model: out.model || cfg.model, finish: out.finish };
}
