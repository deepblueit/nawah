// التوصيات والقنوات: the signals your bot collects, the channels they come from and go to,
// honest performance, the raw inbox, and the exact steps to connect Telegram.
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { ctx } from '../../core/ctx.js';
import { onAct, onForm, onChange } from '../../core/actions.js';
import { btn, modal, closeModal, toast, confirmBox, tabs } from '../../core/ui.js';
import { ago, fmtStamp, count } from '../../core/util.js';
import { tstore, secret, tsetting } from '../tstore.js';
import { parseSignal, isSignal, channelStats } from '../engine/signals.js';
import { symbolInfo } from '../engine/symbols.js';
import { P, pctPlain, quietQuery } from '../tui.js';

let S = null;
let tg = null;
const loadTg = () => (tg ||= import('../telegram.js'));

const TABS = [['feed', 'التوصيات'], ['channels', 'القنوات'], ['stats', 'الأداء'], ['inbox', 'الوارد'], ['setup', 'الربط']];
const SIGNALS_N = ['توصية واحدة', 'توصيتان', 'توصيات', 'توصية'];
const MINUTES = ['دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'];
const STYLE = { rewrite: 'إعادة صياغة نظيفة', clean: 'النص الأصلي بلا روابط', copy: 'نسخة مطابقة' };
const VSTATUS = {
  sl: ['ضربت الوقف', 'down'], tp1: ['حققت الهدف الأول', 'up'], tp2: ['حققت الهدف الثاني', 'up'], tp3: ['حققت الهدف الثالث', 'up'], tp4: ['حققت الهدف الرابع', 'up'],
  open: ['ما زالت مفتوحة', 'flat'], pending: ['لم تتفعل بعد', 'flat'], 'not-filled': ['لم تتفعل', 'flat'], missed: ['فاتت قبل التفعيل', 'flat'],
  win: ['رابحة', 'up'], 'win-mg1': ['رابحة بعد مضاعفة', 'up'], 'win-mg2': ['رابحة بعد مضاعفتين', 'up'], 'win-mg3': ['رابحة بعد 3 مضاعفات', 'up'], loss: ['خاسرة', 'down'], draw: ['تعادل', 'flat'],
  otc: ['لا يمكن التحقق (OTC)', 'flat'], 'no-data': ['لا بيانات', 'flat'], 'no-expiry': ['بلا مدة انتهاء', 'flat'],
};

export function mount(box, route) {
  S = { box, tab: TABS.some(([k]) => k === route.query.tab) ? route.query.tab : 'feed', src: route.query.src || '', kind: route.query.kind || '', off: [] };
  S.off.push(tstore.on(ev => { if (S && ['signals', 'channels', 'inbox'].includes(ev.col)) schedule(); }));
  loadTg().then(t => { if (!S) return; S.off.push(t.onStatus(() => drawStatus())); drawStatus(); });
  draw();
  if (route.query.add) { const text = route.query.text || ''; quietQuery({ add: '', text: '' }); setTimeout(() => openAdd(text), 50); }
}
export function unmount() { S?.off.forEach(f => f()); clearTimeout(S?.t); S = null; }

function schedule() { clearTimeout(S.t); S.t = setTimeout(() => S && draw(), 250); }

function draw() {
  const sigs = tstore.all('signals');
  const body = { feed, channels, stats, inbox, setup }[S.tab]();
  S.box.innerHTML = String(html`
    <header class="page-head"><div class="page-titles"><h1>التوصيات والقنوات</h1><p class="page-sub">${count(sigs.length, SIGNALS_N, { zero: 'لا توصيات بعد' })} من ${count(tstore.all('channels').filter(c => c.role !== 'target').length, ['مصدر واحد', 'مصدرين', 'مصادر', 'مصدرا'], { zero: 'أي مصدر' })}.</p></div>
      <div class="page-actions"><span id="t-tg-status"></span>${btn('أضف توصية', { act: 't-sig-add', icon: 'plus', kind: 'primary' })}</div></header>
    <nav class="tabs" aria-label="أقسام الصفحة">${TABS.map(([k, l]) => html`<a href="#/signals?tab=${k}" class="${S.tab === k ? 'on' : ''}"${S.tab === k ? raw(' aria-current="page"') : ''}>${l}</a>`)}</nav>
    <div class="page-body">${body}</div>`);
  drawStatus();
}

async function drawStatus() {
  const el = S?.box.querySelector('#t-tg-status');
  if (!el) return;
  const t = await loadTg();
  const st = t.status;
  const has = !!secret.get('tg');
  const map = { off: ['cloudOff', 'الاستقبال متوقف', 'off'], starting: ['sync', 'جار التشغيل', 'busy'], running: ['signal', st.lastAt ? `يستقبل، آخر رسالة ${ago(st.lastAt)}` : 'يستقبل الآن', 'ok'], retrying: ['alert', 'يعيد المحاولة', 'err'], conflict: ['alert', 'تعارض مع قارئ آخر', 'err'], error: ['alert', 'خطأ في الاستقبال', 'err'], 'other-tab': ['eye', 'يعمل في نافذة أخرى', 'off'] };
  const [ic, txt, cls] = has ? map[st.state] || map.off : ['cloudOff', 'البوت غير مربوط', 'off'];
  el.innerHTML = String(html`<button type="button" class="sync-pill s-${cls}" data-act="${has ? 't-tg-toggle' : 'go'}" data-href="#/signals?tab=setup" title="${st.error || txt}">${icon(ic)}<span>${txt}</span></button>`);
}

// ---------- feed
function feed() {
  const all = tstore.all('signals').sort((a, b) => b.at - a.at);
  const list = all.filter(s => (!S.src || s.src === S.src) && (!S.kind || s.parsed?.kind === S.kind));
  const sources = [...new Map(all.map(s => [s.src, s.srcTitle])).entries()];
  const unverified = list.filter(s => !s.verified && s.parsed?.kind !== 'update').length;
  return html`<div class="filters t-filters">
      <select class="sel" data-change="t-sig-filter" data-key="src" aria-label="المصدر"><option value="">كل المصادر</option>${sources.map(([id, t]) => html`<option value="${id}"${S.src === id ? raw(' selected') : ''}>${t}</option>`)}</select>
      <select class="sel" data-change="t-sig-filter" data-key="kind" aria-label="النوع"><option value="">كل الأنواع</option><option value="forex"${S.kind === 'forex' ? raw(' selected') : ''}>فوركس وعقود</option><option value="binary"${S.kind === 'binary' ? raw(' selected') : ''}>خيارات ثنائية</option></select>
      ${list.length ? btn(unverified ? `تحقق من ${count(unverified, SIGNALS_N)}` : 'أعد التحقق من الكل', { act: 't-sig-verify-all', icon: 'checkCircle', kind: 'quiet', cls: 'btn-small' }) : ''}
    </div>
    ${list.length ? html`<ul class="t-sigs">${list.slice(0, 150).map(sigCard)}</ul>` : html`<div class="empty"><div class="empty-mark">${icon('signal')}</div><h3>لا توصيات بعد</h3><p>اربط بوتك من تبويب «الربط» ليجمع توصيات قنواتك تلقائيا، أو الصق توصية يدويا.</p><div class="empty-actions">${btn('خطوات الربط', { href: '#/signals?tab=setup', kind: 'primary' })}${btn('أضف توصية', { act: 't-sig-add', kind: 'quiet' })}</div></div>`}`;
}

function sigCard(s) {
  const p = s.parsed || {};
  const info = symbolInfo(p.symbol);
  const F = v => (v == null ? 'غير محدد' : P(v, info));
  const v = s.verified;
  const [vt, vc] = v ? VSTATUS[v.status] || [v.status, 'flat'] : [];
  const claims = s.claims || [];
  return html`<li class="t-sig t-${p.side === 'buy' ? 'up' : 'down'}">
    <header>
      <span class="t-sig-side">${p.kind === 'binary' ? (p.side === 'buy' ? 'صعود' : 'هبوط') : p.side === 'buy' ? 'شراء' : 'بيع'}</span>
      <b class="t-sig-sym">${p.symbol}${p.otc ? ' OTC' : ''}</b>
      <span class="muted small">${s.srcTitle}</span>
      <time class="muted small" title="${fmtStamp(s.at)}">${ago(s.at)}</time>
    </header>
    ${p.kind === 'binary'
      ? html`<p class="t-sig-lv small"><span>الانتهاء ${p.expiryMin ? count(p.expiryMin, MINUTES) : 'غير محدد'}</span>${p.time ? html`<span>الدخول <b class="mono">${p.time}</b></span>` : ''}${p.mg ? html`<span>${count(p.mg, ['مضاعفة واحدة', 'مضاعفتان', 'مضاعفات', 'مضاعفة'])}</span>` : ''}</p>`
      : html`<p class="t-sig-lv small"><span>الدخول <b class="mono">${p.zone ? `${F(p.zone[0])} - ${F(p.zone[1])}` : F(p.entry)}</b></span><span>الوقف <b class="mono down">${F(p.sl)}</b></span>${(p.tps || []).map((tp, k) => html`<span>الهدف ${k + 1} <b class="mono up">${F(tp)}</b></span>`)}${p.rr ? html`<span>العائد <b class="mono">${p.rr.toFixed(1)}</b></span>` : ''}</p>`}
    <div class="t-sig-tags">
      ${v ? html`<span class="t-tag t-${vc}" title="${v.note || ''}">${icon('checkCircle')}الأسعار: ${vt}${v.ambiguous ? '؟' : ''}</span>` : ''}
      ${claims.length ? html`<span class="t-tag" title="${claims.map(c => c.text).join(' | ')}">${icon('chat')}القناة أعلنت: ${claims.map(c => (c.event === 'win' ? `ربح${c.tp ? ' ه' + c.tp : ''}` : c.event === 'loss' ? 'خسارة' : c.event === 'be' ? 'تأمين' : 'إغلاق')).join('، ')}</span>` : ''}
      ${s.edited ? html`<span class="t-tag t-warn">${icon('edit')}عدلت بعد نشرها</span>` : ''}
      ${s.late ? html`<span class="t-tag t-warn">${icon('clock')}نشرت بعد الحركة</span>` : ''}
      ${s.deletedBySource ? html`<span class="t-tag t-warn">${icon('trash')}حذفها المصدر</span>` : ''}
      ${p.issues?.length ? html`<span class="t-tag t-warn" title="${p.issues.join(' ')}">${icon('alert')}${count(p.issues.length, ['ملاحظة واحدة', 'ملاحظتان', 'ملاحظات', 'ملاحظة'])}</span>` : ''}
      ${(s.forwarded || []).length ? html`<span class="t-tag t-up">${icon('send')}نقلت ${count(s.forwarded.length, ['مرة واحدة', 'مرتين', 'مرات', 'مرة'])}</span>` : ''}
    </div>
    <details class="t-sig-more"><summary class="small">النص الأصلي والإجراءات</summary>
      <pre class="t-sig-text">${s.text}</pre>
      ${p.issues?.length ? html`<ul class="small t-mini-warn">${p.issues.map(x => html`<li>${x}</li>`)}</ul>` : ''}
      ${s.edited && s.firstParsed ? html`<p class="small muted">قبل التعديل: الدخول ${F(s.firstParsed.entry)}، الوقف ${F(s.firstParsed.sl)}، الأهداف ${(s.firstParsed.tps || []).map(F).join('، ')}</p>` : ''}
      <div class="row-btns">
        ${btn('انقل إلى قناتي', { act: 't-sig-forward', data: { id: s.id }, icon: 'send', kind: 'primary', cls: 'btn-small' })}
        ${btn('تحقق بالأسعار', { act: 't-sig-verify', data: { id: s.id }, icon: 'checkCircle', kind: 'quiet', cls: 'btn-small' })}
        ${btn('على الشارت', { href: `#/market?sym=${p.symbol}`, icon: 'candles', kind: 'quiet', cls: 'btn-small' })}
        ${btn('اسأل إكس نواة', { href: `#/xnawah?q=${encodeURIComponent(s.text.slice(0, 500))}`, icon: 'orbit', kind: 'quiet', cls: 'btn-small' })}
        ${btn('', { act: 't-sig-del', data: { id: s.id }, icon: 'trash', kind: 'quiet', cls: 'btn-small', title: 'احذف' })}
      </div>
    </details>
  </li>`;
}

// ---------- channels
function channels() {
  const list = tstore.all('channels').sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const sources = list.filter(c => c.role !== 'target');
  const targets = list.filter(c => c.role === 'target');
  return html`<div class="split">
    <section class="module">
      <header class="module-head"><h2>المصادر</h2><span class="muted small">تظهر هنا تلقائيا عند أول رسالة</span></header>
      ${sources.length ? html`<ul class="t-chans">${sources.map(c => {
        const st = channelStats(tstore.all('signals').filter(s => s.src === c.id));
        return html`<li class="t-chan">
          <div class="t-chan-top"><b>${c.title}</b>${c.username ? html`<span class="muted small" dir="ltr">@${c.username}</span>` : ''}${c.virtual || c.via ? html`<span class="t-tag">${c.type === 'private' ? 'رسائل مباشرة' : c.via ? 'عبر قناة الوسيط' : 'عبر التحويل'}</span>` : ''}</div>
          <p class="small muted">${count(st.total, SIGNALS_N, { zero: 'لا توصيات' })}${st.winRate != null ? `، نجاح موثق بالأسعار ${pctPlain(st.winRate)} من ${st.verified}` : ''}${st.claimedWinRate != null ? `، والقناة تعلن ${pctPlain(st.claimedWinRate)}` : ''}</p>
          <div class="t-chan-ctl">
            <label class="small">النقل<select class="sel sel-small" data-change="t-chan-set" data-id="${c.id}" data-k="mode"><option value="manual"${c.mode !== 'auto' ? raw(' selected') : ''}>بموافقتي</option><option value="auto"${c.mode === 'auto' ? raw(' selected') : ''}>تلقائي</option></select></label>
            <label class="small">الصيغة<select class="sel sel-small" data-change="t-chan-set" data-id="${c.id}" data-k="style">${Object.entries(STYLE).map(([k, l]) => html`<option value="${k}"${(c.style || 'rewrite') === k ? raw(' selected') : ''}>${l}</option>`)}</select></label>
          </div>
          ${targets.length ? html`<div class="chips small">${targets.map(t => html`<label class="chip-check"><input type="checkbox" data-change="t-chan-route" data-id="${c.id}" value="${t.id}"${(c.routeTo || []).includes(t.id) ? raw(' checked') : ''}><span>إلى ${t.title}</span></label>`)}</div>` : html`<p class="small muted">أضف قناة وجهة لتختار إليها النقل.</p>`}
          <div class="row-btns">${btn('اجعلها وجهة', { act: 't-chan-role', data: { id: c.id, role: 'target' }, kind: 'quiet', cls: 'btn-small' })}${btn('', { act: 't-chan-del', data: { id: c.id }, icon: 'trash', kind: 'quiet', cls: 'btn-small', title: 'احذف المصدر' })}</div>
        </li>`;
      })}</ul>` : html`<p class="muted small">لم تصل رسائل بعد. أضف البوت مشرفا في قناة، أو حول له رسالة من أي قناة.</p>`}
    </section>
    <section class="module">
      <header class="module-head"><h2>قنواتك (الوجهات)</h2></header>
      <form data-form="t-chan-add" class="stack t-chan-add">
        <label class="lbl-block" for="t-chan-id">معرف القناة أو اسمها</label>
        <input id="t-chan-id" name="id" dir="ltr" placeholder="@mychannel أو -1001234567890" required>
        <p class="small muted">أضف البوت مشرفا في قناتك بصلاحية النشر أولا. القنوات الخاصة تحتاج المعرف الرقمي، وتجده إذا حولت رسالة منها إلى البوت.</p>
        ${btn('تحقق وأضف', { type: 'submit', kind: 'primary', icon: 'check' })}
      </form>
      ${targets.length ? html`<ul class="t-chans">${targets.map(t => html`<li class="t-chan">
        <div class="t-chan-top"><b>${t.title}</b>${t.username ? html`<span class="muted small" dir="ltr">@${t.username}</span>` : ''}<span class="t-tag t-up">وجهة</span></div>
        <label class="lbl-block small" for="ft-${t.id}">تذييل يضاف لكل رسالة</label>
        <input id="ft-${t.id}" class="t-footer-in" data-change="t-chan-set" data-id="${t.id}" data-k="footer" value="${t.footer || ''}" placeholder="مثال: قناتي للتحليل الفني">
        <div class="row-btns">${btn('أرسل رسالة اختبار', { act: 't-chan-test', data: { id: t.id }, kind: 'quiet', cls: 'btn-small' })}${btn('اجعلها مصدرا', { act: 't-chan-role', data: { id: t.id, role: 'source' }, kind: 'quiet', cls: 'btn-small' })}${btn('', { act: 't-chan-del', data: { id: t.id }, icon: 'trash', kind: 'quiet', cls: 'btn-small', title: 'احذف' })}</div>
      </li>`)}</ul>` : ''}
    </section>
  </div>`;
}

// ---------- stats
function stats() {
  const chans = tstore.all('channels').filter(c => c.role !== 'target');
  const rows = chans.map(c => ({ c, st: channelStats(tstore.all('signals').filter(s => s.src === c.id)) })).filter(x => x.st.total);
  if (!rows.length) return html`<div class="empty"><div class="empty-mark">${icon('gauge')}</div><h3>لا أداء لعرضه بعد</h3><p>بعد وصول التوصيات اضغط «تحقق» في تبويب التوصيات، فتقارن نواة كل توصية بالأسعار الحقيقية.</p></div>`;
  const SAMPLE = { small: 'عينة صغيرة: أقل من 30 توصية لا تكفي للحكم', medium: 'عينة متوسطة', large: 'عينة كافية' };
  return html`<p class="muted small t-note-line">الموثق: ما حدث فعلا على الأسعار، بقاعدة الهدف الأول قبل الوقف. المعلن: ما نشرته القناة عن نتائجها. الفرق بينهما هو أول ما تنظر إليه.</p>
  <div class="table-wrap"><table class="tbl t-stats">
    <thead><tr><th>القناة</th><th>التوصيات</th><th>نجاح موثق</th><th>نجاح معلن</th><th>متوسط العائد</th><th>معامل الربح</th><th>أطول خسائر متتالية</th><th>معدلة بعد النشر</th><th>حذفها المصدر</th><th>بلا وقف</th></tr></thead>
    <tbody>${rows.map(({ c, st }) => html`<tr>
      <td data-label="القناة"><b>${c.title}</b><br><small class="muted">${SAMPLE[st.sample]}</small></td>
      <td data-label="التوصيات">${st.total}</td>
      <td data-label="نجاح موثق">${st.winRate != null ? html`<b>${pctPlain(st.winRate)}</b> <small class="muted t-nw">${st.wins} من ${st.verified}</small>` : html`<span class="muted">لم يتحقق</span>`}</td>
      <td data-label="نجاح معلن">${st.claimedWinRate != null ? pctPlain(st.claimedWinRate) : html`<span class="muted">لا إعلانات</span>`}</td>
      <td data-label="متوسط العائد">${st.avgR != null ? `${st.avgR.toFixed(2)}R` : ''}</td>
      <td data-label="معامل الربح">${st.profitFactor != null && Number.isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : st.profitFactor === Infinity ? 'بلا خسائر' : ''}</td>
      <td data-label="أطول خسائر متتالية">${st.maxLossStreak}</td>
      <td data-label="معدلة بعد النشر">${st.edited}</td>
      <td data-label="حذفها المصدر">${st.deleted}</td>
      <td data-label="بلا وقف">${st.noStop}</td>
    </tr>`)}</tbody></table></div>`;
}

// ---------- inbox
function inbox() {
  const list = tstore.all('inbox').sort((a, b) => b.date - a.date).slice(0, 200);
  if (!list.length) return html`<p class="muted">لم يستقبل البوت رسائل على هذا الجهاز بعد.</p>`;
  const KIND = { forex: 'توصية', binary: 'توصية ثنائية', update: 'تحديث نتيجة' };
  return html`<ul class="t-inbox">${list.map(m => html`<li>
    <header class="small"><b>${m.srcTitle}</b><span class="muted">${ago(m.date * 1000)}</span>${m.kind ? html`<span class="t-tag">${KIND[m.kind] || m.kind}</span>` : html`<span class="t-tag">رسالة</span>`}${m.edited ? html`<span class="t-tag t-warn">معدلة</span>` : ''}${m.media ? html`<span class="t-tag">وسائط</span>` : ''}</header>
    <pre class="t-sig-text">${m.text || 'رسالة بلا نص'}</pre>
    ${m.history?.length ? html`<details class="small"><summary>النص قبل التعديل</summary>${m.history.map(h => html`<pre class="t-sig-text">${h.text}</pre>`)}</details>` : ''}
    ${!tstore.get('signals', m.id) && m.text ? btn('حولها إلى توصية', { act: 't-inbox-make', data: { id: m.id }, kind: 'quiet', cls: 'btn-small' }) : ''}
  </li>`)}</ul>`;
}

// ---------- setup guide
function setup() {
  const has = !!secret.get('tg');
  return html`<div class="split">
    <section class="module">
      <header class="module-head"><h2>اربط بوتك، مرة واحدة</h2></header>
      <ol class="steps">
        <li>افتح تيليجرام وابحث عن <b dir="ltr">@BotFather</b> (الحساب الرسمي بعلامة التوثيق)، ثم اضغط Start.</li>
        <li>أرسل <b dir="ltr">/newbot</b>، واكتب اسما للبوت، ثم اسم مستخدم ينتهي بـ bot.</li>
        <li>سيرسل لك BotFather رمزا طويلا (Token). انسخه، ولا تشاركه مع أحد.</li>
        <li>في نواة افتح ${btn('إعدادات التداول', { href: '#/tsettings', kind: 'quiet', cls: 'btn-small' })} والصق الرمز، ثم فعل «شغل الاستقبال على هذا الجهاز».</li>
        <li>افتح قناتك واضغط اسمها في الأعلى، ثم تعديل (رمز القلم)، ثم المشرفون (Administrators)، ثم إضافة مشرف (Add Admin). ابحث باسم مستخدم البوت، وأبق صلاحية نشر الرسائل مفعلة، ثم احفظ.</li>
        <li>لكل قناة توصيات تملكها: أضف البوت مشرفا بالطريقة نفسها، فتصل منشوراتها هنا تلقائيا.</li>
      </ol>
      <p class="small muted">${has ? 'البوت مربوط على هذا الجهاز.' : 'البوت غير مربوط بعد.'}</p>
    </section>
    <section class="module">
      <header class="module-head"><h2>قنوات لا تملكها</h2></header>
      <ol class="steps">
        <li><b>التحويل اليدوي:</b> اضغط مطولا على التوصية في قناة المصدر، ثم Forward، واختر بوتك. تصل باسم القناة الأصلية ووقت نشرها، فتدخل الإحصاءات بوقتها الصحيح.</li>
        <li><b>على مدار الساعة:</b> برنامج النسخ يقرأ بحسابك أي قناة أنت مشترك فيها، ويحولها فورا إلى قناة خاصة بك يكون البوت مشرفا فيها. تصل التوصيات باسم قناتها الأصلية، وتظهر هنا تعديلاتها بعد النشر وما حذفته القناة منها. يعمل على حاسوب يبقى مفتوحا أو خادم صغير. <a href="https://github.com/deepblueit/nawah/tree/main/tools/telegram-copier" target="_blank" rel="noopener">خطوات التشغيل كاملة</a>.</li>
        <li><b>حدود يجب معرفتها:</b> تيليجرام يحتفظ بالرسائل غير المستلمة للبوت 24 ساعة فقط، ويسمح بقارئ واحد للبوت في الوقت نفسه. لذلك شغل الاستقبال على جهاز واحد يبقى مفتوحا، أو اعتمد برنامج النسخ.</li>
        <li><b>الحقوق:</b> إعادة نشر توصيات قناة مدفوعة قد تخالف شروط اشتراكها. انقل ما تملك حق نشره.</li>
      </ol>
    </section>
  </div>`;
}

// ---------- adding by hand
function openAdd(prefill = '') {
  modal({
    title: 'أضف توصية',
    body: html`<form data-form="t-sig-add" class="stack">
      <label class="lbl-block" for="t-sig-text">نص التوصية كما وصلك</label>
      <textarea id="t-sig-text" name="text" rows="7" required placeholder="مثال: XAUUSD BUY 2350 SL 2340 TP 2360 TP 2375">${prefill}</textarea>
      <label class="lbl-block" for="t-sig-src">المصدر</label>
      <input id="t-sig-src" name="src" placeholder="اسم القناة أو الشخص" value="إدخال يدوي">
      <div id="t-sig-preview" class="t-preview small"></div>
    </form>`,
    actions: html`${btn('احفظ', { act: 't-sig-add-submit', kind: 'primary' })}${btn('إلغاء', { act: 'close-modal', kind: 'quiet' })}`,
  });
  const ta = document.getElementById('t-sig-text');
  const prev = () => {
    const p = parseSignal(ta.value);
    const box = document.getElementById('t-sig-preview');
    if (!box) return;
    if (!ta.value.trim()) { box.innerHTML = ''; return; }
    box.innerHTML = String(p.kind === 'update' ? html`<p>هذا تحديث نتيجة وليس توصية.</p>` : html`<p><b>${p.kind === 'binary' ? 'خيارات ثنائية' : 'فوركس وعقود'}:</b> ${p.symbol || 'الرمز غير معروف'}، ${p.side === 'buy' ? 'شراء' : p.side === 'sell' ? 'بيع' : 'الاتجاه غير معروف'}${p.entry != null ? `، الدخول ${p.entry}` : ''}${p.sl != null ? `، الوقف ${p.sl}` : ''}${p.tps?.length ? `، الأهداف ${p.tps.join(' ثم ')}` : ''}${p.expiryMin ? `، الانتهاء ${p.expiryMin} دقائق` : ''}</p>${p.missing?.length ? html`<p class="muted">ناقص: ${p.missing.join('، ')}</p>` : ''}${p.issues?.length ? html`<ul class="t-mini-warn">${p.issues.map(x => html`<li>${x}</li>`)}</ul>` : ''}`);
  };
  ta.addEventListener('input', prev);
  prev();
  setTimeout(() => ta.focus(), 30);
}

onAct({
  't-sig-add': () => openAdd(),
  't-sig-add-submit': () => document.querySelector('#modal form[data-form="t-sig-add"]')?.requestSubmit(),
  't-sig-del': async el => { if (await confirmBox('حذف التوصية؟', { ok: 'احذف', danger: true })) tstore.remove('signals', el.dataset.id); },
  't-sig-verify': async el => {
    const s = tstore.get('signals', el.dataset.id);
    if (!s) return;
    toast('جار التحقق بالأسعار');
    const { verifySignals } = await import('../verify.js');
    const res = await verifySignals([s]);
    toast(res.errors.length ? res.errors[0] : 'تم التحقق');
  },
  't-sig-verify-all': async () => {
    const list = tstore.all('signals').filter(s => (!S?.src || s.src === S.src) && (!S?.kind || s.parsed?.kind === S.kind));
    if (!list.length) return;
    toast(`جار التحقق من ${count(list.length, SIGNALS_N)}. التوصيات على الرمز نفسه تشترك في تحميل واحد.`, { ms: 6000 });
    const { verifySignals } = await import('../verify.js');
    const res = await verifySignals(list);
    toast(res.errors.length ? `تحقق من ${res.done}، وتعذر: ${res.errors.slice(0, 2).join('؛ ')}` : `تحقق من ${count(res.done, SIGNALS_N)}`, { ms: 7000 });
  },
  't-sig-forward': el => openForward(el.dataset.id),
  't-sig-forward-go': async el => {
    const t = await loadTg();
    const ids = [...document.querySelectorAll('#modal input[name="fwd-target"]:checked')].map(x => x.value);
    if (!ids.length) { toast('اختر قناة واحدة على الأقل'); return; }
    const style = document.querySelector('#modal select[name="fwd-style"]')?.value;
    closeModal();
    for (const target of ids) t.enqueue({ target, signalId: el.dataset.id, style, done: () => toast('نقلت التوصية'), fail: e => toast(e.message, { ms: 7000 }) });
  },
  't-inbox-make': el => { const m = tstore.get('inbox', el.dataset.id); if (m) openAdd(m.text); },
  't-tg-toggle': async () => {
    const t = await loadTg();
    if (['running', 'starting', 'retrying', 'conflict'].includes(t.status.state)) { t.stop(); secret.set('poll', false); toast('أوقف الاستقبال على هذا الجهاز'); }
    else { secret.set('poll', true); t.start(); toast('بدأ الاستقبال على هذا الجهاز'); }
  },
  't-chan-role': el => tstore.patch('channels', el.dataset.id, { role: el.dataset.role }),
  't-chan-del': async el => { if (await confirmBox('حذف القناة من القائمة؟', { ok: 'احذف', danger: true, detail: 'تبقى توصياتها السابقة. إذا وصلت رسالة جديدة منها تعود للقائمة.' })) tstore.remove('channels', el.dataset.id); },
  't-chan-test': async el => {
    const t = await loadTg();
    try { await t.sendText(el.dataset.id, 'رسالة اختبار من نواة: الربط يعمل.'); toast('وصلت رسالة الاختبار'); } catch (e) { toast(e.message, { ms: 7000 }); }
  },
});

function openForward(id) {
  const s = tstore.get('signals', id);
  const targets = tstore.all('channels').filter(c => c.role === 'target');
  if (!s) return;
  if (!targets.length) { toast('أضف قناة وجهة من تبويب القنوات أولا'); quietQuery({ tab: 'channels' }); S && (S.tab = 'channels', draw()); return; }
  const src = tstore.get('channels', s.src) || {};
  loadTg().then(t => {
    const fw = tsetting('forward', {});
    const preview = t.outgoingText(s, src.style || 'rewrite', { footer: targets[0].footer ?? fw.footer ?? '', template: s.parsed.kind === 'binary' ? fw.binaryTemplate : fw.template });
    modal({
      title: 'انقل التوصية',
      body: html`<div class="stack">
        <div class="chips">${targets.map((x, k) => html`<label class="chip-check"><input type="checkbox" name="fwd-target" value="${x.id}"${k === 0 ? raw(' checked') : ''}><span>${x.title}</span></label>`)}</div>
        <label class="lbl-block" for="fwd-style">الصيغة</label>
        <select id="fwd-style" name="fwd-style" class="sel">${Object.entries(STYLE).map(([k, l]) => html`<option value="${k}"${(src.style || 'rewrite') === k ? raw(' selected') : ''}${k === 'copy' && !s.origin?.chatId ? raw(' disabled') : ''}>${l}</option>`)}</select>
        <p class="small muted">معاينة الصيغة المختارة للمصدر:</p>
        <pre class="t-sig-text">${preview}</pre>
      </div>`,
      actions: html`${btn('انقل الآن', { act: 't-sig-forward-go', data: { id }, kind: 'primary', icon: 'send' })}${btn('إلغاء', { act: 'close-modal', kind: 'quiet' })}`,
    });
  });
}

onForm({
  't-sig-add': f => {
    const text = f.text.value.trim();
    const p = parseSignal(text);
    if (!isSignal(p)) { toast('لم أجد في النص رمزا واتجاها على الأقل'); return; }
    const srcTitle = f.src.value.trim() || 'إدخال يدوي';
    const srcId = `manual:${srcTitle}`;
    if (!tstore.get('channels', srcId)) tstore.put('channels', { id: srcId, title: srcTitle, type: 'manual', virtual: true, role: 'source', mode: 'manual', style: 'rewrite', routeTo: [], firstAt: Date.now(), lastAt: Date.now() });
    tstore.put('signals', { src: srcId, srcTitle, at: Date.now(), text, parsed: p, claims: [], forwarded: [], status: 'new' });
    closeModal();
    toast('حفظت التوصية');
  },
  't-chan-add': async f => {
    const raw_ = f.id.value.trim();
    const id = /^-?\d+$/.test(raw_) ? Number(raw_) : raw_.startsWith('@') ? raw_ : `@${raw_.replace(/^https?:\/\/t\.me\//, '')}`;
    const t = await loadTg();
    try {
      const { chat, admin } = await t.chatInfo(id);
      tstore.put('channels', { id: String(chat.id), chatId: chat.id, title: chat.title || chat.username, username: chat.username || '', type: chat.type, role: 'target', mode: 'manual', style: 'rewrite', routeTo: [], footer: '', firstAt: Date.now(), lastAt: Date.now() });
      toast(admin ? 'أضيفت القناة، والبوت مشرف فيها' : admin === false ? 'أضيفت القناة، لكن البوت ليس مشرفا فيها بعد' : 'أضيفت القناة');
      f.reset();
    } catch (e) { toast(e.message, { ms: 7000 }); }
  },
});

onChange({
  't-sig-filter': el => { if (!S) return; S[el.dataset.key] = el.value; quietQuery({ [el.dataset.key]: el.value }); draw(); },
  't-chan-set': el => tstore.patch('channels', el.dataset.id, { [el.dataset.k]: el.value }),
  't-chan-route': el => {
    const c = tstore.get('channels', el.dataset.id);
    if (!c) return;
    const set = new Set(c.routeTo || []);
    if (el.checked) set.add(el.value); else set.delete(el.value);
    tstore.patch('channels', c.id, { routeTo: [...set] });
  },
});

