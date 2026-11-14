// إكس نواة: the conversation. Questions in any Arabic dialect or English; answers from the engine,
// the library and the person's records. When free answers are on, an outside service writes the
// reply from the engine's results while the cards stay the engine's own.
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { onAct, onForm } from '../../core/actions.js';
import { btn, toast, confirmBox } from '../../core/ui.js';
import { copyText, fmtStamp } from '../../core/util.js';
import { tstore, tsetting, saveTSetting } from '../tstore.js';
import { respond, SUGGESTIONS, blocksText } from '../brain.js';
import { extReady, extConfig, answerWithService, pastTurns } from '../ext.js';
import { gauge, biasChip, quietQuery } from '../tui.js';

let S = null;
const KEEP = 160;
// questions the engine answers best by itself, even when free answers are on
const ENGINE_ONLY = new Set(['greet', 'thanks', 'help', 'connect', 'need-symbol', 'news']);
// the cards that stay above a free answer; the engine's own paragraphs make way for it
const CARD_TYPES = new Set(['verdict', 'plan', 'kv', 'table', 'fig', 'actions', 'ask', 'warn', 'note', 'title']);

export function mount(box, route) {
  S = { box, busy: false, live: null, mem: tsetting('xmem', {}) };
  box.innerHTML = String(shell());
  drawLog();
  const ta = box.querySelector('#t-x-q');
  ta?.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); ta.form.requestSubmit(); }
  });
  ta?.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(160, ta.scrollHeight)}px`; });
  if (route.query.q) { const q = route.query.q; quietQuery({ q: '' }); ask(q); } else setTimeout(() => ta?.focus(), 40);
}
export function unmount() { S = null; }

function shell() {
  const free = extReady();
  return html`<div class="t-x">
    <header class="t-x-head">
      <span class="t-x-mark">${icon('orbit')}</span>
      <div><h1>إكس نواة</h1><p class="page-sub">اسأل عن أي رمز أو نموذج أو حساب، بأي لهجة. يحلل بالمحرك الذي يقرأ الشارت ويشرح من المكتبة.</p></div>
      <div class="page-actions">${btn('', { act: 't-x-clear', icon: 'trash', kind: 'quiet', title: 'امسح المحادثة' })}</div>
    </header>
    <div class="t-x-log" id="t-x-log" role="log" aria-live="polite" aria-label="المحادثة"></div>
    <form data-form="t-x-send" class="t-x-input">
      <label class="sr" for="t-x-q">سؤالك</label>
      <textarea id="t-x-q" name="q" rows="1" placeholder="حلل الذهب على الساعة، ما معنى كتلة الأوامر، أو الصق توصية لأفحصها" autocomplete="off"></textarea>
      <button type="submit" class="btn btn-primary btn-icon" aria-label="أرسل" title="أرسل">${icon('send')}</button>
      <p class="t-x-mode small muted">${free
        ? html`الإجابة الحرة مفعلة عبر <bdi dir="ltr" class="mono">${extConfig().model}</bdi>، والأرقام من المحرك. <a href="#/tsettings">الإعدادات</a>`
        : html`الردود من المحرك على جهازك. <a href="#/tsettings">فعل الإجابة الحرة</a>`}</p>
    </form>
  </div>`;
}

const history = () => tstore.all('chats').sort((a, b) => (a.at || 0) - (b.at || 0));

function drawLog() {
  const el = S?.box.querySelector('#t-x-log');
  if (!el) return;
  const list = history();
  el.innerHTML = String(html`${list.length ? '' : html`<div class="t-x-hello"><p>أهلا. هذه أمثلة لما تستطيع سؤاله:</p><div class="chips">${SUGGESTIONS.map(q => html`<button type="button" class="chip-toggle" data-act="t-x-ask" data-q="${q}">${q}</button>`)}</div></div>`}
    ${list.map(m => msg(m))}${S.busy && !S.live ? html`<div class="t-x-msg bot t-x-typing" aria-label="جار التحضير"><span></span><span></span><span></span></div>` : ''}`);
  // the page scrolls, and the question box stays pinned under the conversation
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
}

function msg(m) {
  if (m.role === 'user') return html`<div class="t-x-msg user"><p dir="auto">${m.text}</p></div>`;
  const live = S?.live?.id === m.id;
  const x = m.ext;
  return html`<div class="t-x-msg bot">${(m.blocks || []).map(block)}
    ${x ? html`<div class="t-x-free${live ? ' t-x-live' : ''}"${live ? raw(' id="t-x-live"') : ''}>${live ? liveBody() : richText(x.text)}</div>` : ''}
    <footer class="t-x-foot"><time class="small muted">${fmtStamp(m.at)}</time>
      ${x ? html`<span class="t-x-by small muted">إجابة حرة <bdi dir="ltr" class="mono">${x.model || ''}</bdi>${x.state === 'cut' ? '، انقطعت لطولها' : x.state === 'stopped' ? '، أوقفت الكتابة' : ''}</span>` : ''}
      ${live
        ? html`<button type="button" class="btn btn-quiet btn-small" data-act="t-x-stop">${icon('x')}<span>أوقف</span></button>`
        : html`<button type="button" class="btn btn-quiet btn-small btn-icon" data-act="t-x-copy" data-id="${m.id}" title="انسخ الرد" aria-label="انسخ الرد">${icon('copy')}</button>`}
    </footer></div>`;
}

function liveBody() {
  const l = S.live;
  return html`${l.text ? richText(l.text) : ''}<p class="t-x-status small muted"><span class="t-x-dots" aria-hidden="true"><span></span><span></span><span></span></span>${l.status}</p>`;
}

// Latin names and commands such as @BotFather, /newbot or Twelve Data keep their reading order
// inside Arabic sentences.
const LTR_RUN = /([@/]?[A-Za-z][A-Za-z0-9_./:@+=-]*(?:[ ]+[A-Za-z0-9][A-Za-z0-9_./:@+=-]*)*)/;
const ltr = text => String(text ?? '').split(LTR_RUN).map((part, i) => (i % 2 ? html`<bdi dir="ltr">${part}</bdi>` : part));
const inline = text => String(text).split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? html`<b>${ltr(part)}</b>` : ltr(part)));

// A written reply as paragraphs and lists. Every piece of text goes through the escaping template.
function richText(text) {
  const out = [];
  let para = [];
  let list = null;
  const endPara = () => { if (para.length) out.push(html`<p>${para.map((l, i) => html`${i ? html`<br>` : ''}${inline(l)}`)}</p>`); para = []; };
  const endList = () => { if (list) out.push(list.ordered ? html`<ol>${list.items.map(x => html`<li>${inline(x)}</li>`)}</ol>` : html`<ul>${list.items.map(x => html`<li>${inline(x)}</li>`)}</ul>`); list = null; };
  for (const raw0 of String(text || '').split('\n')) {
    const l = raw0.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(l);
    const number = /^\d{1,2}[.)]\s+(.*)$/.exec(l);
    if (!l) { endPara(); endList(); continue; }
    if (bullet || number) {
      endPara();
      const ordered = !!number;
      if (list && list.ordered !== ordered) endList();
      (list ||= { ordered, items: [] }).items.push((bullet || number)[1]);
      continue;
    }
    endList();
    para.push(l);
  }
  endPara();
  endList();
  return out;
}

function block(b) {
  switch (b.t) {
    case 'title': return html`<h3 class="t-x-title">${ltr(b.text)}${b.sub ? html`<small class="muted">${b.sub}</small>` : ''}</h3>`;
    case 'p': return html`<p>${b.title ? html`<b>${b.title}:</b> ` : ''}${ltr(b.text)}</p>`;
    case 'note': return html`<p class="small muted">${ltr(b.text)}</p>`;
    case 'warn': return html`<p class="t-x-warn small">${icon('alert')}<span>${ltr(b.text)}</span></p>`;
    case 'list': return html`${b.title ? html`<h4>${b.title}</h4>` : ''}<ul>${b.items.map(x => html`<li>${ltr(x)}</li>`)}</ul>`;
    case 'kv': return html`<dl class="kvs t-kvs">${b.rows.map(([k, v]) => html`<div><dt>${k}</dt><dd class="num">${v}</dd></div>`)}</dl>`;
    case 'table': return html`<div class="table-wrap"><table class="tbl t-mini"><thead><tr>${b.head.map(h => html`<th>${h}</th>`)}</tr></thead><tbody>${b.rows.map(r => html`<tr>${r.map(c => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div>`;
    case 'fig': return html`<figure class="t-x-fig">${raw(b.svg)}</figure>`;
    case 'verdict': return html`<div class="t-x-verdict t-${b.bias === 'buy' ? 'up' : b.bias === 'sell' ? 'down' : 'flat'}">${gauge(b.score)}<div><p><b>${b.symbol}</b> <span class="muted small">${b.name || ''}، ${b.frame}</span></p><p>${biasChip(b.bias)} <b>${Math.abs(b.score)}</b> <span class="small muted">من 100 توافق، ${b.confidence}</span></p><p class="small muted">السعر ${b.price}، الاتجاه ${b.trend}${b.mtf ? `، الإطار الأعلى ${b.mtf}` : ''}</p></div></div>`;
    case 'plan': return html`<div class="t-x-plan t-${b.side === 'buy' ? 'up' : 'down'}"><h4>${b.side === 'buy' ? 'خطة الشراء' : 'خطة البيع'}</h4><dl class="kvs t-kvs"><div><dt>الدخول</dt><dd><b class="mono">${b.entry}</b> <small>${b.entryType}</small></dd></div><div><dt>الوقف</dt><dd><b class="mono down">${b.stop}</b> <small>${b.risk}</small></dd></div>${b.targets.map((t, k) => html`<div><dt>الهدف ${k + 1}</dt><dd><b class="mono up">${t.price}</b> <small>العائد ${t.rr}</small></dd></div>`)}</dl><p class="small muted">${b.invalid}</p></div>`;
    case 'actions': return html`<div class="row-btns">${b.items.map(a => btn(a.label, { href: a.href, kind: 'quiet', cls: 'btn-small', external: !!a.external }))}</div>`;
    case 'ask': return html`<div class="chips t-x-asks">${b.items.map(q => html`<button type="button" class="chip-toggle" data-act="t-x-ask" data-q="${q}">${q}</button>`)}</div>`;
    default: return '';
  }
}

// ---------- live writing: only the reply being written is redrawn, once per frame
let frame = 0;
function paintLive(s) {
  if (frame || S !== s) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const el = S === s && s.live ? s.box.querySelector('#t-x-live') : null;
    if (!el) return;
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
    el.innerHTML = String(liveBody());
    if (nearBottom) window.scrollTo({ top: document.documentElement.scrollHeight });
  });
}

const textOf = m => (m.role === 'user' ? m.text : m.ext?.text ? m.ext.text : blocksText(m.blocks || []));

async function ask(text) {
  if (!S || S.busy || !text.trim()) return;
  const s = S;
  const q = text.trim();
  const free = extReady();
  const past = free ? pastTurns(history(), textOf) : [];
  tstore.put('chats', { role: 'user', text: q, at: Date.now() });
  s.busy = true;
  drawLog();
  let res;
  try { res = await respond(q, s.mem, { facts: free }); } catch (e) { res = { blocks: [{ t: 'warn', text: e.message }], mem: s.mem }; }
  s.mem = res.mem || s.mem;
  saveTSetting('xmem', { symbol: s.mem.symbol || null, tf: s.mem.tf || null, plan: s.mem.plan || null, topic: s.mem.topic || null });

  if (!free || ENGINE_ONLY.has(res.intent)) {
    tstore.put('chats', { role: 'bot', blocks: res.blocks, at: Date.now() });
    return finish(s);
  }
  const cfg = extConfig();
  const cards = res.blocks.filter(b => CARD_TYPES.has(b.t));
  const m = tstore.put('chats', { role: 'bot', blocks: cards, ext: { text: '', model: cfg.model, state: 'live' }, at: Date.now() });
  s.live = { id: m.id, text: '', status: 'يكتب الرد', ctrl: new AbortController() };
  if (S === s) drawLog();
  try {
    const out = await answerWithService({
      question: q,
      past,
      facts: res.facts || null,
      intent: res.intent,
      cards: cards.some(b => ['verdict', 'plan', 'kv', 'table'].includes(b.t)),
      mem: s.mem,
      signal: s.live.ctrl.signal,
      onDelta: t => { s.live.text = t; s.live.status = t ? 'يكتب الرد' : s.live.status; paintLive(s); },
      onTool: label => { s.live.status = label; paintLive(s); },
    });
    if (!out.text.trim()) throw new Error('لم تكتب الخدمة ردا');
    tstore.patch('chats', m.id, { ext: { text: out.text, model: out.model, state: out.finish === 'length' ? 'cut' : 'done' } });
  } catch (e) {
    if (e?.name === 'AbortError') {
      if (s.live.text) tstore.patch('chats', m.id, { ext: { text: s.live.text, model: cfg.model, state: 'stopped' } });
      else tstore.patch('chats', m.id, { blocks: res.blocks, ext: null });
    } else {
      tstore.patch('chats', m.id, { blocks: [...res.blocks, { t: 'note', text: `تعذرت الإجابة الحرة: ${e.message}. هذا رد المحرك.` }], ext: null });
    }
  }
  s.live = null;
  finish(s);
}

function finish(s) {
  prune();
  s.busy = false;
  if (S === s) drawLog();
}

function prune() {
  const list = history();
  if (list.length <= KEEP) return;
  for (const m of list.slice(0, list.length - KEEP)) tstore.data.chats.delete(m.id);
  tstore.markDirty('chats');
}

onForm({
  't-x-send': f => {
    const q = f.q.value;
    f.q.value = '';
    f.q.style.height = 'auto';
    ask(q);
  },
});
onAct({
  't-x-ask': el => ask(el.dataset.q),
  't-x-stop': () => S?.live?.ctrl.abort(),
  't-x-copy': async el => {
    const m = tstore.get('chats', el.dataset.id);
    if (!m) return;
    const text = [blocksText(m.blocks || []), (m.ext?.text || '').replace(/\*\*/g, '')].filter(Boolean).join('\n\n');
    toast((await copyText(text)) ? 'نسخ الرد' : 'تعذر النسخ');
  },
  't-x-clear': async () => {
    if (S?.busy) return;
    if (!(await confirmBox('مسح المحادثة؟', { ok: 'امسح', danger: true }))) return;
    for (const m of tstore.raw('chats')) tstore.data.chats.delete(m.id);
    tstore.markDirty('chats');
    saveTSetting('xmem', {});
    if (S) { S.mem = {}; drawLog(); }
  },
});
