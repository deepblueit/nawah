// Free answers: the streamed reply, tool rounds, falling back when a service refuses the format,
// the model list, and the cleanup that keeps the text within the house style.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sseParser, chatOnce, converse, parseModels, cleanText, pastTurns, ServiceError } from '../assets/js/trade/ext-client.js';

const C = (...cps) => String.fromCodePoint(...cps);
const enc = new TextEncoder();

// A fake service: each call takes the next scripted reply and records the request body.
function fakeService(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    const step = script[calls.length - 1];
    if (!step) throw new Error('no more scripted replies');
    if (step.status) return new Response(JSON.stringify(step.json || { error: { message: step.message || '' } }), { status: step.status, headers: { 'content-type': 'application/json' } });
    const chunks = step.chunks;
    return new Response(new ReadableStream({
      start(ctrl) { for (const c of chunks) ctrl.enqueue(enc.encode(c)); ctrl.close(); },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return { calls, fetchImpl };
}
const sse = objs => objs.map(o => (typeof o === 'string' ? o : `data: ${JSON.stringify(o)}\n\n`));
const delta = (d, finish = null) => ({ model: 'm-1', choices: [{ index: 0, delta: d, finish_reason: finish }] });

test('event stream parsing survives split lines, comments and CRLF', () => {
  const got = [];
  const p = sseParser(d => got.push(d));
  p.feed(': OPENROUTER PROCESSING\n\nda');
  p.feed('ta: {"a":1}\r');
  p.feed('\n\r\ndata: x\ndata: y\n');
  p.feed('\ndata: [DONE]');
  p.end();
  assert.deepEqual(got, ['{"a":1}', 'x\ny', '[DONE]']);
});

test('a streamed reply arrives piece by piece', async () => {
  const svc = fakeService([{ chunks: sse([delta({ role: 'assistant', content: '' }), delta({ content: 'الذهب ' }), delta({ content: 'صاعد' }), delta({}, 'stop'), '[DONE]']).map(x => (x === '[DONE]' ? 'data: [DONE]\n\n' : x)) }]);
  const seen = [];
  const r = await chatOnce({ base: 'https://svc.test/v1/', key: 'k', model: 'm-1', messages: [{ role: 'user', content: 'q' }], onDelta: t => seen.push(t), fetchImpl: svc.fetchImpl });
  assert.equal(r.content, 'الذهب صاعد');
  assert.deepEqual(seen, ['الذهب ', 'الذهب صاعد']);
  assert.equal(r.finish, 'stop');
  assert.equal(svc.calls[0].url, 'https://svc.test/v1/chat/completions');
  assert.equal(svc.calls[0].headers.Authorization, 'Bearer k');
  assert.equal(svc.calls[0].body.stream, true);
});

test('tool calls are assembled from fragments, with or without an index', async () => {
  const svc = fakeService([{ chunks: sse([
    delta({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'analyze_symbol', arguments: '' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: '{"symbol":"XAU' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: 'USD","timeframe":"4h"}' } }] }),
    // a whole call without an index, carrying an extra field that must go back unchanged
    delta({ tool_calls: [{ id: '', type: 'function', function: { name: 'search_library', arguments: '{"query":"doji"}' }, extra_content: { google: { thought_signature: 'sig' } } }] }),
    delta({}, 'tool_calls'),
  ]) }]);
  const r = await chatOnce({ base: 'https://svc.test/v1', model: 'm', messages: [], tools: [{}], fetchImpl: svc.fetchImpl });
  assert.equal(r.toolCalls.length, 2);
  assert.deepEqual(JSON.parse(r.toolCalls[0].function.arguments), { symbol: 'XAUUSD', timeframe: '4h' });
  assert.equal(r.toolCalls[0].id, 'c1');
  assert.equal(r.toolCalls[1].function.name, 'search_library');
  assert.ok(r.toolCalls[1].id, 'an empty id gets a stable one');
  assert.deepEqual(r.toolCalls[1].extra_content, { google: { thought_signature: 'sig' } });
});

test('errors become plain messages', async () => {
  const bad = fakeService([{ status: 401, json: { error: { message: 'No auth credentials found' } } }]);
  await assert.rejects(chatOnce({ base: 'https://s.test', model: 'm', messages: [], fetchImpl: bad.fetchImpl }), e => e instanceof ServiceError && e.status === 401 && /المفتاح/.test(e.message));
  const noTools = fakeService([{ status: 404, json: { error: { message: 'No endpoints found that support tool use.' } } }]);
  await assert.rejects(chatOnce({ base: 'https://s.test', model: 'm', messages: [], tools: [{}], fetchImpl: noTools.fetchImpl }), e => e.tools === true);
  const mid = fakeService([{ chunks: sse([delta({ content: 'جزء' }), { error: { message: 'Provider disconnected' }, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] }]) }]);
  await assert.rejects(chatOnce({ base: 'https://s.test', model: 'm', messages: [], fetchImpl: mid.fetchImpl }), e => e.code === 'stream');
});

test('a tool round: the engine answers and the service writes the reply', async () => {
  const svc = fakeService([
    { chunks: sse([delta({ tool_calls: [{ index: 0, id: 't1', type: 'function', function: { name: 'analyze_symbol', arguments: '{"symbol":"XAUUSD","timeframe":"4h"}' } }] }, 'tool_calls')]) },
    { chunks: sse([delta({ content: 'على الأربع ساعات السعر 2350.' }, 'stop')]) },
  ]);
  const asked = [];
  const r = await converse({
    base: 'https://s.test', model: 'm', system: 'S', history: [{ role: 'user', content: 'حلل الذهب' }, { role: 'assistant', content: 'تم' }], question: 'وعلى الأربع ساعات؟',
    tools: [{ type: 'function', function: { name: 'analyze_symbol' } }],
    run: async (name, args) => { asked.push([name, args]); return { price: 2350 }; },
    fetchImpl: svc.fetchImpl,
  });
  assert.equal(r.text, 'على الأربع ساعات السعر 2350.');
  assert.deepEqual(asked, [['analyze_symbol', { symbol: 'XAUUSD', timeframe: '4h' }]]);
  const second = svc.calls[1].body.messages;
  assert.deepEqual(second.map(m => m.role), ['system', 'user', 'assistant', 'user', 'assistant', 'tool']);
  assert.equal(second[4].tool_calls[0].id, 't1');
  assert.equal(second[5].tool_call_id, 't1');
  assert.equal(second[5].name, 'analyze_symbol');
  assert.deepEqual(JSON.parse(second[5].content), { price: 2350 });
  assert.deepEqual(r.tools, ['analyze_symbol']);
});

test('a service that refuses tools gets the plain form, once', async () => {
  const svc = fakeService([
    { status: 404, json: { error: { message: 'No endpoints found that support tool use.' } } },
    { chunks: sse([delta({ content: 'رد بلا أدوات' }, 'stop')]) },
  ]);
  const r = await converse({ base: 'https://s.test', model: 'm', system: 'S', question: 'q', tools: [{ type: 'function', function: { name: 'x' } }], run: async () => ({}), extra: { reasoning_effort: 'low' }, fetchImpl: svc.fetchImpl });
  assert.equal(r.text, 'رد بلا أدوات');
  assert.equal(r.restarted, true);
  assert.equal(svc.calls[1].body.tools, undefined);
  assert.equal(svc.calls[1].body.reasoning_effort, undefined);
});

test('a failure after a tool round restarts with what the tools returned', async () => {
  const svc = fakeService([
    { chunks: sse([delta({ tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'market_sessions', arguments: '{}' } }] }, 'tool_calls')]) },
    { status: 400, json: { error: { message: 'Request contains an invalid argument.' } } },
    { chunks: sse([delta({ content: 'لندن مفتوحة' }, 'stop')]) },
  ]);
  const r = await converse({
    base: 'https://s.test', model: 'm', system: 'S', question: 'متى لندن؟', tools: [{ type: 'function', function: { name: 'market_sessions' } }],
    run: async () => ({ open_now: ['لندن'] }),
    addFacts: (sys, g) => `${sys}\nMORE ${JSON.stringify(g.map(x => x.result))}`,
    fetchImpl: svc.fetchImpl,
  });
  assert.equal(r.text, 'لندن مفتوحة');
  const sys = svc.calls[2].body.messages[0].content;
  assert.match(sys, /MORE \[\{"open_now":\["لندن"\]\}\]/);
  assert.equal(svc.calls[2].body.tools, undefined);
});

test('a key that is refused is not retried', async () => {
  const svc = fakeService([{ status: 401, json: { error: { message: 'bad key' } } }]);
  await assert.rejects(converse({ base: 'https://s.test', model: 'm', system: 'S', question: 'q', tools: [{}], run: async () => ({}), fetchImpl: svc.fetchImpl }), e => e.status === 401);
  assert.equal(svc.calls.length, 1);
  // Google answers a bad key with 400 and a list of errors
  const g = fakeService([{ status: 400, json: [{ error: { code: 400, message: 'Please pass a valid API key', status: 'INVALID_ARGUMENT' } }] }]);
  await assert.rejects(converse({ base: 'https://s.test', model: 'm', system: 'S', question: 'q', tools: [{}], run: async () => ({}), extra: { reasoning_effort: 'low' }, fetchImpl: g.fetchImpl }), e => e.auth === true && /المفتاح/.test(e.message) && /valid API key/.test(e.message));
  assert.equal(g.calls.length, 1);
});

test('model lists from different services', () => {
  const or = parseModels({ data: [
    { id: 'vendor/fast:free', name: 'Fast (free)', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] } },
    { id: 'vendor/pro', name: 'Pro', pricing: { prompt: '0.000002', completion: '0.00001' }, supported_parameters: ['temperature'], architecture: { output_modalities: ['text'] } },
    { id: 'vendor/painter', pricing: { prompt: '0.000001', completion: '0' }, architecture: { output_modalities: ['image', 'text'] } },
  ] });
  assert.deepEqual(or.map(m => [m.id, m.free, m.tools]), [['vendor/fast:free', true, true], ['vendor/pro', false, false]]);
  assert.equal(Math.round(or[1].price.in * 100) / 100, 2);
  const google = parseModels({ object: 'list', data: [{ id: 'models/gemini-flash-x', object: 'model' }, { id: 'models/text-embedding-9' }, { id: 'models/imagen-5' }, { id: 'models/veo-4' }] });
  assert.deepEqual(google.map(m => m.id), ['gemini-flash-x']);
  assert.equal(google[0].tools, null);
  assert.deepEqual(parseModels({ data: [{ id: 'llama-local' }] }).map(m => m.id), ['llama-local']);
});

test('the text keeps the house style', () => {
  const kasra = C(0x0650);
  const fatha = C(0x064E);
  const em = C(0x2014);
  const rocket = C(0x1F680);
  const check = C(0x2705);
  const raw = [
    `## الخلاصة`,
    `الذ${fatha}هب ${em} صاعد ${rocket} والسعر ${C(0x0662, 0x0663, 0x0665, 0x0660)}`,
    '---',
    '| المستوى | السعر |',
    '|---|---|',
    `| دعم | 2340 ${check} |`,
    '',
    '',
    '',
    `${C(0x2022)} الوقف تحت 2330`,
    `المدى 10${C(0x2013)}12 نقطة، الإ${kasra}طار`,
  ].join('\n');
  const out = cleanText(raw);
  assert.equal(out, ['الخلاصة', 'الذهب، صاعد والسعر 2350', '- المستوى، السعر', '- دعم، 2340', '', '- الوقف تحت 2330', 'المدى 10-12 نقطة، الإطار'].join('\n'));
});

test('the conversation history alternates and ends with a reply', () => {
  const list = [
    { role: 'bot', text: 'ترحيب' },
    { role: 'user', text: 'سؤال 1' },
    { role: 'bot', text: 'رد 1' },
    { role: 'user', text: 'سؤال 2' },
    { role: 'user', text: 'سؤال 3' },
  ];
  const turns = pastTurns(list, m => m.text);
  assert.deepEqual(turns.map(t => t.role), ['user', 'assistant']);
  assert.equal(turns[0].content, 'سؤال 1');
});
