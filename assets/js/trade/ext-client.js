// Talks to an outside chat service that follows the Chat Completions format: streamed replies,
// tool calls that Nawah answers from its own engine, and cleanup of the text before it is shown.
// Nothing here touches the page or the storage, so it runs the same way in the tests.

export class ServiceError extends Error {
  constructor(message, { status = 0, code = '', tools = false, auth = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    // the request failed because of the tool definitions or the tool round, not the question
    this.tools = tools;
    // the key was refused; asking again in another form will not help
    this.auth = auth;
  }
}

// ---------- server-sent events: feed text as it arrives, receive whole data payloads
export function sseParser(onData) {
  let buf = '';
  let data = [];
  const flush = () => {
    if (data.length) onData(data.join('\n'));
    data = [];
  };
  const line = l => {
    if (l === '') flush();
    else if (l.startsWith(':')) { /* keep-alive comments, such as ": OPENROUTER PROCESSING" */ }
    else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, ''));
  };
  return {
    feed(chunk) {
      buf += chunk;
      for (;;) {
        const i = buf.search(/[\r\n]/);
        if (i < 0) break;
        // a carriage return at the very end may be the first half of \r\n: wait for the rest
        if (buf[i] === '\r' && i === buf.length - 1) break;
        line(buf.slice(0, i));
        buf = buf.slice(i + (buf[i] === '\r' && buf[i + 1] === '\n' ? 2 : 1));
      }
    },
    end() {
      if (buf) line(buf.replace(/\r$/, ''));
      buf = '';
      flush();
    },
  };
}

// ---------- errors in plain words
const STATUS_TEXT = {
  400: 'رفضت الخدمة صيغة الطلب',
  401: 'المفتاح غير صالح أو انتهت صلاحيته',
  402: 'الرصيد في حساب الخدمة لا يكفي لهذا الطلب',
  403: 'المفتاح لا يملك صلاحية هذا النموذج',
  404: 'العنوان أو النموذج غير موجود في الخدمة',
  408: 'انتهت مهلة الطلب',
  413: 'الطلب أطول مما تقبله الخدمة',
  429: 'تجاوزت الحد المسموح من الطلبات، فجرب بعد قليل',
  500: 'حدث خطأ داخلي في الخدمة',
  502: 'لم تتلق الخدمة ردا من مزود النموذج',
  503: 'الخدمة مشغولة أو متوقفة مؤقتا',
};

const errorMessage = e => (typeof e === 'string' ? e : e?.message || e?.error?.message || (Array.isArray(e) ? errorMessage(e[0]?.error || e[0]) : ''));
const looksLikeTools = msg => /tool|function/i.test(msg || '');
// the service's own words, kept short, follow the plain explanation in brackets
const withDetail = (base, detail) => (detail ? `${base} (${String(detail).replace(/\s+/g, ' ').trim().slice(0, 160)})` : base);

export async function httpError(res, withTools = false) {
  let detail = '';
  try {
    const t = await res.text();
    try { detail = errorMessage(JSON.parse(t).error || JSON.parse(t)); } catch (_) { detail = t.slice(0, 200); }
  } catch (_) { /* body unreadable */ }
  // some services answer a bad key with 400 rather than 401
  const auth = res.status === 401 || res.status === 403 || /api.?key|credential|unauthori[sz]ed|permission denied/i.test(detail);
  return new ServiceError(withDetail(auth ? STATUS_TEXT[401] : STATUS_TEXT[res.status] || `ردت الخدمة بالرمز ${res.status}`, detail), {
    status: res.status,
    auth,
    tools: !auth && withTools && (res.status === 400 || res.status === 404 || res.status === 422) && (res.status === 400 || looksLikeTools(detail)),
  });
}

// ---------- one request, streamed
// The model's own temperature is kept unless one is given: some recent models are tuned for it.
export async function chatOnce({ base, key, model, messages, tools = null, extra = {}, headers = {}, signal, onDelta, fetchImpl = globalThis.fetch, maxTokens = 1400, temperature }) {
  const body = { model, messages, stream: true, max_tokens: maxTokens, ...(Number.isFinite(temperature) ? { temperature } : {}), ...extra };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  let res;
  try {
    res = await fetchImpl(`${String(base).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ServiceError('تعذر الوصول إلى الخدمة، فتحقق من العنوان ومن الاتصال بالإنترنت', { code: 'network' });
  }
  if (!res.ok) throw await httpError(res, !!tools?.length);

  const out = { content: '', toolCalls: [], finish: null, model: '', usage: null };
  const calls = [];
  const take = raw => {
    if (raw === '[DONE]') return;
    let j;
    try { j = JSON.parse(raw); } catch (_) { return; }
    if (j.error) throw new ServiceError(withDetail('انقطع الرد بخطأ من الخدمة', errorMessage(j.error)), { code: 'stream', tools: !!tools?.length && looksLikeTools(errorMessage(j.error)) });
    if (j.model) out.model = j.model;
    if (j.usage) out.usage = j.usage;
    const ch = j.choices?.[0];
    if (!ch) return;
    const d = ch.delta || ch.message || {};
    if (typeof d.content === 'string' && d.content) {
      out.content += d.content;
      onDelta?.(out.content);
    }
    (d.tool_calls || []).forEach((tc, n) => {
      // some services leave out the index; a call that arrives whole then takes the next slot
      const k = Number.isInteger(tc.index) ? tc.index : calls.length + n;
      const c = (calls[k] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
      for (const [f, v] of Object.entries(tc)) {
        if (f === 'index' || f === 'function') continue;
        // anything else the service attaches (such as a thought signature) goes back unchanged
        if (f === 'id') { if (v) c.id = v; } else if (v != null) c[f] = v;
      }
      if (tc.function?.name && !c.function.name.endsWith(tc.function.name)) c.function.name += tc.function.name;
      if (typeof tc.function?.arguments === 'string') c.function.arguments += tc.function.arguments;
      else if (tc.function?.arguments && typeof tc.function.arguments === 'object') c.function.arguments = JSON.stringify(tc.function.arguments);
    });
    if (ch.finish_reason) out.finish = ch.finish_reason;
  };

  const type = res.headers?.get?.('content-type') || '';
  if (!type.includes('event-stream') && type.includes('json')) {
    take(JSON.stringify(await res.json()));
  } else {
    const parser = sseParser(take);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(dec.decode(value, { stream: true }));
    }
    parser.feed(dec.decode());
    parser.end();
  }
  if (out.finish === 'error') throw new ServiceError('انقطع الرد بخطأ من الخدمة', { code: 'stream' });
  out.toolCalls = calls.filter(Boolean).filter(c => c.function.name).map((c, i) => ({ ...c, id: c.id || `call_${i + 1}_${c.function.name}` }));
  return out;
}

// ---------- a conversation with tool rounds
// run(name, args) answers a tool call. When the service rejects the request format (the tools or
// an optional setting), the conversation starts once more in the plainest form, with whatever
// the tools returned so far added to the context.
export async function converse({ system, history = [], question, tools = [], run, maxRounds = 4, onDelta, onTool, addFacts, extra = {}, ...opts }) {
  let useTools = tools.length > 0;
  let options = extra;
  const gathered = [];
  const start = () => [{ role: 'system', content: gathered.length && addFacts ? addFacts(system, gathered) : system }, ...history, { role: 'user', content: question }];
  let msgs = start();
  let restarted = false;
  let model = '';
  const done = (r, text) => ({ text, model, finish: r?.finish || null, tools: gathered.map(g => g.name), restarted });
  for (let round = 0; round < maxRounds; round++) {
    const last = round === maxRounds - 1;
    let r;
    try {
      r = await chatOnce({ ...opts, extra: options, messages: msgs, tools: useTools && !last ? tools : null, onDelta });
    } catch (e) {
      const format = e instanceof ServiceError && !e.auth && (e.tools || e.status === 400 || e.status === 422);
      if (format && !restarted && (useTools || Object.keys(options).length)) {
        useTools = false;
        options = {};
        restarted = true;
        msgs = start();
        round = -1;
        onDelta?.('');
        continue;
      }
      throw e;
    }
    model = r.model || model;
    if (!r.toolCalls.length || last) return done(r, r.content);
    msgs.push({ role: 'assistant', content: r.content || null, tool_calls: r.toolCalls });
    onDelta?.('');
    for (const c of r.toolCalls) {
      let args = {};
      try { args = c.function.arguments ? JSON.parse(c.function.arguments) : {}; } catch (_) { args = {}; }
      onTool?.(c.function.name, args);
      let result;
      try { result = await run(c.function.name, args); } catch (e) { result = { error: e?.message || String(e) }; }
      gathered.push({ name: c.function.name, args, result });
      msgs.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: JSON.stringify(result ?? null).slice(0, 14000) });
    }
  }
  return done(null, '');
}

// ---------- the list of models a key can use
// OpenRouter lists prices and supported parameters; Google prefixes names with "models/";
// other services return plain ids.
export function parseModels(json) {
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
  const out = [];
  for (const m of list) {
    const id = String(m.id || m.name || '').replace(/^models\//, '');
    if (!id) continue;
    const outputs = m.architecture?.output_modalities;
    if (Array.isArray(outputs) && !outputs.includes('text')) continue;
    if (Array.isArray(outputs) && outputs.some(x => x !== 'text')) continue;
    if (Array.isArray(m.supportedGenerationMethods) && !m.supportedGenerationMethods.includes('generateContent')) continue;
    if (/(^|[-_/])(embed|embedding|tts|transcribe|whisper|imagen|image|veo|video|audio|lyria|moderation|rerank|aqa)([-_.:]|$)/i.test(id)) continue;
    const p = m.pricing;
    const free = /:free$/.test(id) || (p && Number(p.prompt) === 0 && Number(p.completion) === 0);
    const sp = m.supported_parameters;
    out.push({
      id,
      label: m.name && m.name !== id ? String(m.name) : id,
      free: !!free,
      tools: Array.isArray(sp) ? sp.includes('tools') : null,
      price: p ? { in: Number(p.prompt) * 1e6, out: Number(p.completion) * 1e6 } : null,
      context: m.context_length || null,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------- the text as the person sees it
// No diacritics, no em dash, no emoji, no tables and no separator lines, whatever the service wrote.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
export function cleanText(s) {
  let t = String(s || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/([\u0621-\u064A])\u0640+(?=[\u0621-\u064A])/g, '$1')
    .replace(/(\d)\s*\u2013\s*(\d)/g, '$1-$2')
    .replace(/\s*[\u2014\u2015\u2013]\s*/g, '\u060C ')
    .replace(EMOJI, '')
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/(\d)\u066B(\d)/g, '$1.$2');
  const lines = [];
  for (const raw of t.split('\n')) {
    const l = raw.replace(/\s+$/, '');
    if (/^\s*([-*_]\s*){3,}$/.test(l)) continue;
    if (/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-')) continue;
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean);
      lines.push(`- ${cells.join('، ')}`);
      continue;
    }
    lines.push(l.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^(\s*)[\u2022\u25CF\u25AA]\s*/, '$1- '));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.,:;!?\u060C\u061B\u061F])/g, '$1').trim();
}

// The conversation so far, in the shape the service expects: alternating turns, newest last,
// trimmed to a sensible length.
export function pastTurns(list, textOf, { turns = 10, chars = 9000 } = {}) {
  const msgs = [];
  for (const m of list.slice(-turns)) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const content = String(textOf(m) || '').slice(0, 1500).trim();
    if (!content) continue;
    if (msgs.length && msgs.at(-1).role === role) msgs.at(-1).content += `\n\n${content}`;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  while (msgs.reduce((n, m) => n + m.content.length, 0) > chars && msgs.length > 2) msgs.splice(0, 2);
  // the question being asked is added separately, so the history must end with a reply
  if (msgs.length && msgs.at(-1).role === 'user') msgs.pop();
  return msgs;
}
