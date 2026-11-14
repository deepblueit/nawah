// Telegram: a bot of the person's own reads the channels it administers (and anything forwarded to
// it in private), turns signals into records, links result posts to their signal, and re-posts
// approved signals to the person's channels. The token stays on this device.
//
// What the Bot API allows, and the ways around its limits:
// - A bot only sees channels where it is an administrator. For a channel you do not own, forward
//   its posts to your bot: the original channel and time travel with the forward.
// - Telegram keeps undelivered updates for 24 hours, and only one reader may poll a bot at a time.
//   For round-the-clock collection from any channel you follow, use tools/telegram-copier.
import { tstore, secret, tsetting } from './tstore.js';
import { store } from '../core/store.js';
import { parseSignal, isSignal, formatSignal, stripPromo } from './engine/signals.js';

const API = 'https://api.telegram.org';
const listeners = new Set();
export const status = { state: 'off', error: '', lastAt: 0, received: 0, me: null };
const setStatus = patch => { Object.assign(status, patch); for (const fn of listeners) { try { fn(status); } catch (e) { console.error(e); } } };
export const onStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export async function call(method, params = {}, { token = secret.get('tg'), signal } = {}) {
  if (!token) throw Object.assign(new Error('أضف رمز البوت من إعدادات التداول أولا.'), { code: 0 });
  let res;
  try {
    res = await fetch(`${API}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw Object.assign(new Error('لا يوجد اتصال بخوادم تيليجرام.'), { code: -1 });
  }
  const j = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!j.ok) {
    const err = new Error(explain(j.error_code, j.description));
    err.code = j.error_code;
    err.retry = j.parameters?.retry_after;
    throw err;
  }
  return j.result;
}

function explain(code, d = '') {
  if (code === 401) return 'رمز البوت غير صحيح. انسخه من BotFather مرة أخرى.';
  if (code === 409 && /webhook/i.test(d)) return 'البوت مربوط بعنوان ويب هوك، فلا يمكن القراءة منه هنا. احذف الويب هوك من الإعدادات.';
  if (code === 409) return 'جهاز أو برنامج آخر يقرأ من البوت نفسه الآن. شغل الاستقبال على جهاز واحد فقط.';
  if (code === 403) return 'البوت لا يملك صلاحية في هذه المحادثة. أضفه مشرفا في القناة.';
  if (code === 400 && /chat not found/i.test(d)) return 'لم يجد البوت القناة. تأكد أنه مشرف فيها، أو استخدم المعرف الرقمي.';
  if (code === 429) return 'تيليجرام يطلب التمهل قليلا قبل الإرسال التالي.';
  return d || `خطأ من تيليجرام (${code})`;
}

// ---------- checks used by the settings page
export async function checkToken(token) {
  const me = await call('getMe', {}, { token });
  const hook = await call('getWebhookInfo', {}, { token });
  return { me, webhook: hook.url || '' };
}
export const dropWebhook = () => call('deleteWebhook', { drop_pending_updates: false });
export async function chatInfo(chatId) {
  const chat = await call('getChat', { chat_id: chatId });
  let admin = null;
  try {
    const me = status.me || (await call('getMe'));
    const m = await call('getChatMember', { chat_id: chatId, user_id: me.id });
    admin = ['administrator', 'creator'].includes(m.status) ? m : false;
  } catch (_) { admin = null; }
  return { chat, admin };
}

// ---------- reading updates
const ALLOWED = ['channel_post', 'edited_channel_post', 'message', 'edited_message'];
let ctrl = null;
let running = false;

export function autoStart() {
  if (secret.get('poll', false) && secret.get('tg')) start();
}

export async function start() {
  if (running) return;
  if (!secret.get('tg')) { setStatus({ state: 'error', error: 'أضف رمز البوت أولا.' }); return; }
  running = true;
  setStatus({ state: 'starting', error: '' });
  const space = store.space;
  const run = async () => {
    try { status.me = await call('getMe'); } catch (e) { setStatus({ state: 'error', error: e.message }); running = false; return; }
    setStatus({ state: 'running' });
    let backoff = 0;
    while (running && store.space === space) {
      ctrl = new AbortController();
      try {
        const updates = await call('getUpdates', { offset: secret.get('tgOffset', 0) || undefined, timeout: 25, allowed_updates: ALLOWED }, { signal: ctrl.signal });
        backoff = 0;
        for (const u of updates) {
          try { handle(u); } catch (e) { console.error('telegram update', e); }
          secret.set('tgOffset', u.update_id + 1);
        }
        if (updates.length) { setStatus({ lastAt: Date.now(), received: status.received + updates.length }); pruneInbox(); }
        if (status.state !== 'running') setStatus({ state: 'running', error: '' });
      } catch (e) {
        if (e.name === 'AbortError' || !running) break;
        if (e.code === 401) { setStatus({ state: 'error', error: e.message }); break; }
        setStatus({ state: e.code === 409 ? 'conflict' : 'retrying', error: e.message });
        backoff = Math.min(60, backoff ? backoff * 2 : 5);
        await new Promise(r => setTimeout(r, (e.code === 409 ? 30 : backoff) * 1000));
      }
    }
    running = false;
    if (status.state === 'running' || status.state === 'retrying') setStatus({ state: 'off' });
  };
  // one reader per browser: other tabs wait instead of fighting over the same bot
  if (navigator.locks?.request) {
    navigator.locks.request('nawah-telegram', { ifAvailable: true }, async lock => {
      if (!lock) { running = false; setStatus({ state: 'other-tab', error: 'الاستقبال يعمل في نافذة أخرى من نواة على هذا الجهاز.' }); return; }
      await run();
    });
  } else run();
}

export function stop() {
  running = false;
  ctrl?.abort();
  setStatus({ state: 'off', error: '' });
}

// the raw inbox stays on this device and keeps the latest 3000 messages
function pruneInbox() {
  const all = tstore.raw('inbox');
  if (all.length <= 3500) return;
  const drop = all.sort((a, b) => (a.date || 0) - (b.date || 0)).slice(0, all.length - 3000);
  for (const m of drop) tstore.data.inbox.delete(m.id);
  tstore.markDirty('inbox');
}

const titleOf = chat => chat.title || (chat.username ? `@${chat.username}` : [chat.first_name, chat.last_name].filter(Boolean).join(' ')) || String(chat.id);

// the copier names the source on the first line when a channel forbids forwarding
const SOURCE_LINE = /^المصدر: ([^\n]+)\n?/;

// one rule for a message and for the message it answers, so a reply finds its signal
function sourceOf(m, chat) {
  const fo = m.forward_origin;
  const oc = fo && (fo.type === 'channel' || fo.type === 'chat') ? fo.chat || fo.sender_chat : null;
  const priv = chat.type === 'private';
  if (oc) return { src: { id: String(oc.id), title: titleOf(oc), username: oc.username || '', type: 'channel', virtual: priv, via: priv ? null : chat.id }, msgId: fo.message_id || m.message_id, date: fo.date || m.date };
  const named = !priv && SOURCE_LINE.exec(m.text || m.caption || '');
  if (named) {
    const title = named[1].trim();
    return { src: { id: `${chat.id}~${title}`, title, username: '', type: 'channel', virtual: true, via: chat.id }, msgId: m.message_id, date: m.date, named: true };
  }
  if (priv) return { src: { id: `dm${chat.id}`, title: 'رسائلك المباشرة للبوت', username: '', type: 'private', virtual: true }, msgId: m.message_id, date: m.date };
  return { src: { id: String(chat.id), title: titleOf(chat), username: chat.username || '', type: chat.type }, msgId: m.message_id, date: m.date };
}

// exported for tests and for pasting updates by hand; the poller is the normal caller
export function handle(u) {
  const msg = u.channel_post || u.edited_channel_post || u.message || u.edited_message;
  if (!msg) return;
  let edited = !!(u.edited_channel_post || u.edited_message);
  const chat = msg.chat;
  // private messages are accepted from the owner only; the first person to write becomes the owner
  if (chat.type === 'private') {
    const owner = secret.get('tgOwner', null);
    if (!owner) secret.set('tgOwner', msg.from?.id);
    else if (msg.from?.id !== owner) return;
  }
  if (chat.type === 'group' || chat.type === 'supergroup') {
    if (!tstore.get('channels', String(chat.id))) return;
  }
  const { src, msgId, date, named } = sourceOf(msg, chat);
  const raw = msg.text || msg.caption || '';
  const text = named ? raw.replace(SOURCE_LINE, '') : raw;
  const origin = { chatId: chat.id, msgId: msg.message_id };
  const id = `${src.id}:${msgId}`;
  const rt = msg.reply_to_message;
  let replyKey = null;
  if (rt) { const r = sourceOf(rt, chat); replyKey = `${r.src.id}:${r.msgId}`; }
  // the copier notes deletions in the source with a reply; channels that delete losing signals show it
  if (replyKey && text.trim().startsWith('حذف المصدر هذه الرسالة')) {
    const target = tstore.get('signals', replyKey) || tstore.all('signals').find(x => x.origin?.chatId === chat.id && x.origin?.msgId === rt.message_id);
    if (target) tstore.patch('signals', target.id, { deletedBySource: Date.now() });
    return;
  }
  const prev = tstore.get('inbox', id);
  // the same original message with a new text is an edit, even when it arrives as a fresh forward
  if (prev && prev.text !== text) edited = true;
  const ch = tstore.get('channels', src.id);
  if (!ch) tstore.put('channels', { id: src.id, chatId: src.virtual || src.via ? null : Number(src.id), title: src.title, username: src.username, type: src.type, virtual: !!src.virtual, via: src.via || null, role: 'source', mode: 'manual', style: 'rewrite', routeTo: [], count: 1, firstAt: Date.now(), lastAt: Date.now() }, { quiet: true });
  else tstore.patch('channels', src.id, { title: src.title || ch.title, count: (ch.count || 0) + (prev ? 0 : 1), lastAt: Date.now() }, { quiet: true });
  const history = prev && prev.text !== text ? [...(prev.history || []), { text: prev.text, at: Date.now() }] : prev?.history || [];
  const parsed = text ? parseSignal(text) : null;
  tstore.put('inbox', { id, src: src.id, srcTitle: src.title, msgId, date, text, media: !!(msg.photo || msg.document || msg.video), replyTo: replyKey, origin, edited: edited || !!prev?.edited, history, kind: parsed?.kind || null, status: prev?.status || 'new' }, { quiet: true });
  if (!parsed) { tstore.emit({ col: 'inbox', ids: [id], source: 'telegram' }); return; }
  if (parsed.kind === 'update') linkUpdate(src, replyKey, parsed, date);
  else if (isSignal(parsed)) {
    const old = tstore.get('signals', id);
    const rec = {
      id, src: src.id, srcTitle: src.title, msgId, at: date * 1000, text, parsed, origin,
      claims: old?.claims || [], forwarded: old?.forwarded || [], status: old?.status || 'new',
      edited: edited || !!old?.edited,
      firstParsed: old?.firstParsed || (edited ? null : parsed),
      verified: old && JSON.stringify(old.parsed) === JSON.stringify(parsed) ? old.verified : null,
    };
    tstore.put('signals', rec);
    const channel = tstore.get('channels', src.id);
    if (!edited && channel?.mode === 'auto' && channel.routeTo?.length) for (const t of channel.routeTo) enqueue({ target: t, signalId: id });
  }
  tstore.emit({ col: 'inbox', ids: [id], source: 'telegram' });
}

function linkUpdate(src, replyKey, parsed, date) {
  let sig = replyKey ? tstore.get('signals', replyKey) : null;
  if (!sig) {
    const recent = tstore.all('signals').filter(s => s.src === src.id && date * 1000 - s.at < 72 * 3600 * 1000 && date * 1000 >= s.at && (!parsed.symbol || s.parsed?.symbol === parsed.symbol)).sort((a, b) => b.at - a.at);
    sig = recent[0];
  }
  if (!sig) return;
  const claim = { event: parsed.event, tp: parsed.tp, pips: parsed.pips, at: date * 1000, text: parsed.text.slice(0, 280) };
  if ((sig.claims || []).some(c => c.at === claim.at && c.event === claim.event)) return;
  tstore.patch('signals', sig.id, { claims: [...(sig.claims || []), claim] });
}

// ---------- sending
const queue = [];
let sending = false;
const lastSent = new Map();

export function enqueue(job) {
  queue.push(job);
  pump();
}

async function pump() {
  if (sending) return;
  sending = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      const wait = 3200 - (Date.now() - (lastSent.get(job.target) || 0));
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      try {
        const res = await sendSignal(job);
        lastSent.set(job.target, Date.now());
        job.done?.(res);
      } catch (e) {
        if (e.code === 429 && (job.tries || 0) < 3) { queue.unshift({ ...job, tries: (job.tries || 0) + 1 }); await new Promise(r => setTimeout(r, (e.retry || 5) * 1000)); continue; }
        job.fail?.(e);
      }
    }
  } finally { sending = false; }
}

// The text that leaves for a target channel, by the source's chosen style.
export function outgoingText(sig, style, { footer, template } = {}) {
  if (style === 'clean') return [stripPromo(sig.text), footer].filter(Boolean).join('\n\n');
  return formatSignal(sig.parsed, { footer, template });
}

async function sendSignal({ target, signalId, style: forced }) {
  const sig = tstore.get('signals', signalId);
  if (!sig) throw new Error('التوصية غير موجودة.');
  const ch = tstore.get('channels', sig.src) || {};
  const style = forced || ch.style || 'rewrite';
  const fw = tsetting('forward', {});
  const tgt = tstore.get('channels', String(target));
  const footer = tgt?.footer ?? fw.footer ?? '';
  let result;
  if (style === 'copy' && sig.origin?.chatId) result = await call('copyMessage', { chat_id: target, from_chat_id: sig.origin.chatId, message_id: sig.origin.msgId });
  else result = await call('sendMessage', { chat_id: target, text: outgoingText(sig, style, { footer, template: sig.parsed.kind === 'binary' ? fw.binaryTemplate : fw.template }), link_preview_options: { is_disabled: true } });
  const fresh = tstore.get('signals', signalId);
  tstore.patch('signals', signalId, { status: 'forwarded', forwarded: [...(fresh.forwarded || []), { chat: String(target), msgId: result.message_id, at: Date.now(), style }] });
  return result;
}

export const sendText = (chatId, text) => call('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
export const queued = () => queue.length;
