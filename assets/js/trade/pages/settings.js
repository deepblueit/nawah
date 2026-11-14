// إعدادات التداول: data keys, the Telegram bot, the look and the time zone, risk defaults,
// the private repository for trading data, and backups. Keys and tokens stay on this device.
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { ctx } from '../../core/ctx.js';
import { onAct, onForm, onChange } from '../../core/actions.js';
import { btn, toast, confirmBox } from '../../core/ui.js';
import { local, download, readFile, ago, count } from '../../core/util.js';
import { TOKEN_URL } from '../../core/sync.js';
import { tstore, tsync, secret, tsetting, saveTSetting } from '../tstore.js';
import { clearCache, tdCredits } from '../data.js';
import { deviceTz } from '../engine/time.js';
import { DEFAULT_TEMPLATE, DEFAULT_BINARY_TEMPLATE } from '../engine/signals.js';
import { SERVICES, extConfig, saveExtConfig, verifyService } from '../ext.js';

let S = null;
const TZS = ['Asia/Riyadh', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Baghdad', 'Asia/Amman', 'Africa/Casablanca', 'Europe/London', 'America/New_York', 'UTC'];

export function mount(box) {
  S = { box, off: [], ext: null };
  S.off.push(tsync.on(() => S && drawSync()));
  draw();
}
export function unmount() { S?.off.forEach(f => f()); S = null; }

const section = (id, title, body, ic = 'settings') => html`<section class="module" id="${id}"><header class="module-head"><h2>${icon(ic)}${title}</h2></header>${body}</section>`;

function draw() {
  const td = secret.get('td');
  const tg = secret.get('tg');
  const c = tdCredits();
  const fw = tsetting('forward', {});
  const risk = tsetting('risk', {});
  const look = local.get('nawah.trade.look', 'night');
  const tz = local.get('nawah.trade.tz', '') || '';
  S.box.innerHTML = String(html`<header class="page-head"><div class="page-titles"><h1>إعدادات التداول</h1><p class="page-sub">المفاتيح والرموز تحفظ في هذا المتصفح فقط، ولا تدخل أي ملف أو مزامنة.</p></div></header>
  <div class="t-settings">
    ${section('ts-data', 'بيانات الأسعار', html`
      <p class="small">العملات الرقمية من Binance مجانا وبلا مفتاح. العملات والذهب والفضة تحتاج مفتاح Twelve Data المجاني.</p>
      <ol class="steps small">
        <li>افتح twelvedata.com واضغط Get API key، ثم أنشئ حسابا بالبريد.</li>
        <li>من لوحة الحساب افتح API Keys وانسخ المفتاح.</li>
        <li>الصقه هنا واضغط «تحقق واحفظ». الخطة المجانية: 8 طلبات في الدقيقة و800 في اليوم، ونواة تحفظ الشموع على جهازك وتطلب الناقص فقط.</li>
      </ol>
      <form data-form="t-set-td" class="t-inline-form">
        <label class="sr" for="ts-td">مفتاح Twelve Data</label>
        <input id="ts-td" name="key" type="password" dir="ltr" autocomplete="off" placeholder="${td ? 'محفوظ على هذا الجهاز' : 'الصق المفتاح هنا'}">
        ${btn('تحقق واحفظ', { type: 'submit', kind: 'primary', cls: 'btn-small' })}${td ? btn('احذف المفتاح', { act: 't-set-td-del', kind: 'quiet', cls: 'btn-small' }) : ''}
      </form>
      <p class="small muted">${td ? 'المفتاح محفوظ.' : 'بلا مفتاح: اليورو دولار والدولار ين ببيانات Twelve Data العامة، وباقي الرموز ببيانات تجريبية.'} الاستهلاك اليوم: ${c.n} من 800.</p>
      ${btn('امسح الشموع المحفوظة على الجهاز', { act: 't-set-cache', kind: 'quiet', cls: 'btn-small', icon: 'trash' })}`, 'cloud')}

    ${section('ts-look', 'الشكل والوقت', html`
      <div class="prefs">
        <div class="pref"><span>مظهر وضع التداول</span><div class="seg" role="group" aria-label="المظهر">${[['night', 'ليلي'], ['day', 'نهاري']].map(([k, l]) => html`<button type="button" class="${look === k ? 'on' : ''}" data-act="t-set-look" data-v="${k}" aria-pressed="${look === k}">${l}</button>`)}</div></div>
        <div class="pref"><span>توقيت الشارت والأوقات</span><select class="sel" data-change="t-set-tz" aria-label="التوقيت"><option value="">توقيت الجهاز (${deviceTz()})</option>${TZS.map(z => html`<option value="${z}"${tz === z ? raw(' selected') : ''}>${z}</option>`)}</select></div>
      </div>`, 'sun')}

    ${section('ts-tg', 'بوت تيليجرام', html`
      <form data-form="t-set-tg" class="t-inline-form">
        <label class="sr" for="ts-tg">رمز البوت</label>
        <input id="ts-tg" name="token" type="password" dir="ltr" autocomplete="off" placeholder="${tg ? 'محفوظ على هذا الجهاز' : '123456789:AA...'}">
        ${btn('تحقق واحفظ', { type: 'submit', kind: 'primary', cls: 'btn-small' })}${tg ? btn('احذف الرمز', { act: 't-set-tg-del', kind: 'quiet', cls: 'btn-small' }) : ''}
      </form>
      <div id="ts-tg-info" class="small"></div>
      <label class="switch-line"><input type="checkbox" data-change="t-set-poll"${secret.get('poll', false) ? raw(' checked') : ''}${tg ? '' : raw(' disabled')}><span>شغل الاستقبال على هذا الجهاز. اختر جهازا واحدا يبقى مفتوحا.</span></label>
      ${secret.get('tgOwner', null) ? html`<p class="small muted">الرسائل المباشرة للبوت مقبولة من مالكه فقط. ${btn('غير المالك', { act: 't-set-owner-reset', kind: 'quiet', cls: 'btn-small' })}</p>` : html`<p class="small muted">أول من يراسل البوت في الخاص يصبح مالكه، ورسائل غيره تهمل.</p>`}
      <h3 class="step-h">صيغة النقل إلى قنواتك</h3>
      <form data-form="t-set-fw" class="stack">
        <label class="lbl-block" for="ts-fw-footer">تذييل افتراضي</label><input id="ts-fw-footer" name="footer" value="${fw.footer || ''}">
        <label class="lbl-block" for="ts-fw-tpl">قالب توصية الفوركس</label><textarea id="ts-fw-tpl" name="template" rows="5" dir="auto">${fw.template || DEFAULT_TEMPLATE}</textarea>
        <label class="lbl-block" for="ts-fw-btpl">قالب توصية الخيارات الثنائية</label><textarea id="ts-fw-btpl" name="binaryTemplate" rows="4" dir="auto">${fw.binaryTemplate || DEFAULT_BINARY_TEMPLATE}</textarea>
        <p class="small muted">المتغيرات: {symbol} {side} {direction} {entry} {sl} {tp1} {tp2} {tp3} {tps} {expiry} {time} {source} {note}</p>
        ${btn('احفظ الصيغة', { type: 'submit', kind: 'quiet', cls: 'btn-small' })}
      </form>`, 'signal')}

    <section class="module" id="ts-ext"></section>

    ${section('ts-risk', 'المخاطرة الافتراضية', html`<form data-form="t-set-risk" class="rec-form"><div class="fields">
        <div class="field"><label for="ts-bal">رصيد الحساب بالدولار</label><input id="ts-bal" name="balance" type="number" step="any" value="${risk.balance ?? 1000}"></div>
        <div class="field"><label for="ts-pct">المخاطرة لكل صفقة %</label><input id="ts-pct" name="riskPct" type="number" step="any" value="${risk.riskPct ?? 1}"></div>
        <div class="field"><label for="ts-max">أقصى خسارة يومية %</label><input id="ts-max" name="maxDailyLossPct" type="number" step="any" value="${risk.maxDailyLossPct ?? 3}"></div>
        <div class="field"><label for="ts-pay">عائد الخيارات الثنائية %</label><input id="ts-pay" name="payout" type="number" step="any" value="${risk.payout ?? 85}"></div>
        <div class="field"><label for="ts-lev">الرافعة</label><input id="ts-lev" name="leverage" type="number" step="any" value="${risk.leverage ?? 100}"></div>
      </div>${btn('احفظ', { type: 'submit', kind: 'quiet', cls: 'btn-small' })}</form>`, 'calc')}

    <section class="module" id="ts-sync"></section>

    ${section('ts-backup', 'النسخة الاحتياطية', html`<p class="small">ملف واحد فيه قائمة المتابعة والقنوات والتوصيات واليوميات والملاحظات، دون أي مفتاح أو رمز.</p>
      <div class="row-btns">${btn('نزل نسخة احتياطية', { act: 't-set-export', icon: 'download', kind: 'quiet' })}
      <label class="btn btn-quiet" for="ts-import">${icon('upload')}<span>استرجع من ملف</span><input type="file" id="ts-import" accept=".json,application/json" data-change="t-set-import" hidden></label>
      ${btn('امسح بيانات التداول على هذا الجهاز', { act: 't-set-wipe', icon: 'trash', kind: 'quiet', cls: 'danger-text' })}</div>`, 'download')}
  </div>`);
  drawSync();
  drawExt();
  if (tg) checkTg(tg, true);
}

// ---------- free answers in إكس نواة
const MODEL_FORMS = ['نموذج واحد', 'نموذجان', 'نماذج', 'نموذجا'];
const money = x => (x >= 1 ? x.toFixed(2) : x.toFixed(x >= 0.1 ? 2 : 3));

function drawExt() {
  const el = S?.box.querySelector('#ts-ext');
  if (!el) return;
  const c = extConfig();
  const svc = S.extSvc || c.service;
  const base = svc === c.service ? c.base || SERVICES[svc].base : SERVICES[svc].base;
  const keySaved = !!c.key && svc === c.service;
  const models = S.ext?.models || [];
  el.innerHTML = String(html`<header class="module-head"><h2>${icon('chat')}الإجابة الحرة في إكس نواة</h2>${c.on ? html`<span class="sync-pill s-ok">مفعلة</span>` : ''}</header>
    <p class="small">تكتب خدمة خارجية الرد بأسلوب المحادثة، وتعتمد على أرقام المحرك ومكتبة نواة. المحرك يبقى مصدر الأرقام والبطاقات، وإذا تعذر الوصول إلى الخدمة يظهر رد المحرك كما هو.</p>
    <details${c.on ? '' : raw(' open')}><summary class="small">كيف تحصل على مفتاح</summary><ol class="steps small">
      <li><b>OpenRouter</b>، ومنه تصل إلى أغلب النماذج المعروفة بمفتاح واحد: أنشئ حسابا في موقع OpenRouter، ثم افتح Keys واضغط Create Key وانسخ المفتاح. النماذج المجانية خمسون طلبا في اليوم تقريبا، والمدفوعة تخصم من رصيد تشحنه.</li>
      <li><b>Google</b>: من حساب Google افتح صفحة مفاتيح Gemini API وأنشئ مفتاحا. نماذج Flash لها حد مجاني يومي يظهر في الحساب نفسه.</li>
      <li>اختر الخدمة هنا، والصق المفتاح، واضغط «تحقق واجلب النماذج»، ثم اختر نموذجا من القائمة وفعل الإجابة الحرة واحفظ.</li>
    </ol></details>
    <form data-form="t-set-ext" class="rec-form"><div class="fields">
      <div class="field"><label for="te-svc">الخدمة</label><select id="te-svc" name="service" class="sel" data-change="t-ext-svc">${Object.entries(SERVICES).map(([k, v]) => html`<option value="${k}"${svc === k ? raw(' selected') : ''}>${v.name}</option>`)}</select></div>
      <div class="field wide"><label for="te-base">العنوان</label><input id="te-base" name="base" dir="ltr" value="${base}" placeholder="https://..." ${svc === 'custom' ? '' : raw('readonly')}></div>
      <div class="field wide"><label for="te-key">المفتاح${SERVICES[svc].needsKey ? '' : ' إن وجد'}</label><input id="te-key" name="key" type="password" dir="ltr" autocomplete="off" placeholder="${keySaved ? 'محفوظ على هذا الجهاز' : 'الصق المفتاح هنا'}"></div>
      <div class="field wide"><label for="te-model">النموذج</label><input id="te-model" name="model" dir="ltr" list="te-models" autocomplete="off" value="${c.model && svc === c.service ? c.model : ''}" placeholder="${models.length ? 'اكتب جزءا من الاسم واختر' : 'اضغط «تحقق واجلب النماذج» أولا'}">
        <datalist id="te-models">${modelOptions(models)}</datalist></div>
      <label class="switch-line wide"><input type="checkbox" name="on"${c.on ? raw(' checked') : ''}><span>فعل الإجابة الحرة في إكس نواة</span></label>
    </div><p class="field-err" role="alert"></p>
    <div class="row-btns">${btn('تحقق واجلب النماذج', { act: 't-ext-verify', kind: 'quiet', cls: 'btn-small' })}${btn('احفظ', { type: 'submit', kind: 'primary', cls: 'btn-small' })}${c.base ? btn('احذف الإعداد', { act: 't-ext-del', kind: 'quiet', cls: 'btn-small' }) : ''}</div></form>
    <div id="te-info" class="small">${S.ext ? extInfo(S.ext) : ''}</div>
    <p class="small muted">يصل إلى الخدمة نص سؤالك وآخر رسائل المحادثة ونتائج المحرك المتعلقة بالسؤال، ومنها أرقام قنواتك ويومياتك إذا سألت عنها، وإعدادات المخاطرة في أسئلة الصفقات. لا تصلها مفاتيحك ولا بيانات الشركة. الخدمات المجانية قد تستخدم ما يصلها لتحسين خدماتها. المفتاح يحفظ في هذا المتصفح فقط.</p>`);
}

const modelOptions = models => models.map(m => html`<option value="${m.id}">${m.free ? 'مجاني' : m.price ? `${money(m.price.in)}$ و${money(m.price.out)}$ للمليون` : ''}</option>`);

function extInfo(v) {
  const free = v.models.filter(m => m.free).length;
  const q = v.quota?.free;
  return html`<p class="t-okline">${icon('checkCircle')}<span>تم التحقق: ${count(v.models.length, MODEL_FORMS)} يكتب نصا${free ? `، منها ${count(free, MODEL_FORMS)} مجانا` : ''}.${q ? ` الطلبات المجانية المتبقية اليوم ${q.remaining} من ${q.limit}.` : ''}${v.quota?.remaining != null ? ` المتبقي من حد المفتاح ${money(v.quota.remaining)}$.` : ''}</span></p>`;
}

function extForm() {
  const f = S?.box.querySelector('[data-form="t-set-ext"]');
  if (!f) return null;
  const c = extConfig();
  const service = f.service.value;
  return { f, service, base: f.base.value.trim().replace(/\/+$/, ''), key: f.key.value.trim() || (service === c.service ? c.key : ''), model: f.model.value.trim(), on: f.on.checked };
}

async function verifyExt(v) {
  const err = v.f.querySelector('.field-err');
  err.textContent = 'جار التحقق';
  try {
    S.ext = await verifyService(v);
    err.textContent = '';
    return true;
  } catch (e) {
    err.textContent = `${e.message}.`;
    return false;
  }
}

function drawSync() {
  const el = S?.box.querySelector('#ts-sync');
  if (!el) return;
  const c = tsync.config();
  const st = tsync.status;
  const on = tsync.enabled();
  el.innerHTML = String(html`<header class="module-head"><h2>${icon('git')}مزامنة بيانات التداول</h2>${on ? html`<span class="sync-pill s-${st === 'error' ? 'err' : 'ok'}">${st === 'error' ? 'تعذرت' : tsync.lastSync ? `آخر مزامنة ${ago(tsync.lastSync)}` : 'مفعلة'}</span>` : ''}</header>
    <p class="small">اختيارية، لتنتقل يومياتك وتوصياتك بين أجهزتك. تحتاج مستودعا خاصا منفصلا عن مستودع بيانات الشركة، اسمه المقترح nawah-trade-data. الوارد الخام من تيليجرام ومحادثة إكس نواة لا يزامنان.</p>
    ${st === 'error' ? html`<p class="small down">${tsync.error}</p>` : ''}
    <details${on ? '' : raw(' open')}><summary class="small">الخطوات</summary><ol class="steps small">
      <li>أنشئ مستودعا خاصا كما في خطوات مزامنة الشركة، وسمه nawah-trade-data.</li>
      <li>أنشئ مفتاحا دقيقا يصل إلى هذا المستودع بصلاحية Contents: Read and write، أو أضف المستودع إلى مفتاح الشركة نفسه واختر «استخدم مفتاح مزامنة الشركة».</li>
    </ol>${btn('افتح صفحة إنشاء المفتاح', { href: TOKEN_URL, kind: 'quiet', cls: 'btn-small', external: true, icon: 'shield' })}</details>
    <form data-form="t-set-sync" class="rec-form"><div class="fields">
      <div class="field"><label for="tsy-owner">حساب GitHub المالك</label><input id="tsy-owner" name="owner" dir="ltr" value="${c.owner || ''}" required></div>
      <div class="field"><label for="tsy-repo">اسم المستودع</label><input id="tsy-repo" name="repo" dir="ltr" value="${c.repo || 'nawah-trade-data'}" required></div>
      <div class="field wide"><label for="tsy-key">مفتاح الوصول</label><input id="tsy-key" name="key" type="password" dir="ltr" autocomplete="off" placeholder="${local.get('nawah.tsync.key', '') ? 'محفوظ على هذا الجهاز' : 'اتركه فارغا مع خيار مفتاح الشركة'}"></div>
      <label class="switch-line wide"><input type="checkbox" name="shareKey"${c.shareKey ? raw(' checked') : ''}><span>استخدم مفتاح مزامنة الشركة إن كان يصل إلى هذا المستودع</span></label>
    </div><p class="field-err" role="alert"></p>
    <div class="row-btns">${btn('تحقق واحفظ', { type: 'submit', kind: 'primary', cls: 'btn-small' })}${on ? btn('زامن الآن', { act: 't-set-sync-run', kind: 'quiet', cls: 'btn-small' }) : ''}${on ? btn('أوقف المزامنة على هذا الجهاز', { act: 't-set-sync-off', kind: 'quiet', cls: 'btn-small' }) : ''}</div></form>`);
}

async function checkTg(token, quiet = false) {
  const box = S?.box.querySelector('#ts-tg-info');
  if (!box) return;
  const t = await import('../telegram.js');
  try {
    const r = await t.checkToken(token);
    box.innerHTML = String(html`<p>${icon('checkCircle')} البوت <b dir="ltr">@${r.me.username}</b> يعمل.${r.webhook ? html` <span class="down">مربوط بعنوان ويب هوك، والاستقبال هنا لن يعمل حتى تحذفه.</span> ${btn('احذف الويب هوك', { act: 't-set-hook-del', kind: 'quiet', cls: 'btn-small' })}` : ''}</p>`);
    return r;
  } catch (e) {
    box.innerHTML = String(html`<p class="down">${e.message}</p>`);
    if (!quiet) throw e;
  }
}

onForm({
  't-set-td': async f => {
    const key = f.key.value.trim();
    if (!key) return;
    try {
      const res = await fetch(`https://api.twelvedata.com/api_usage?apikey=${encodeURIComponent(key)}`);
      const j = await res.json();
      if (j.status === 'error' || j.code) throw new Error(j.message || 'المفتاح غير صالح');
      secret.set('td', key);
      toast('حفظ مفتاح Twelve Data');
      draw();
    } catch (e) { toast(`تعذر التحقق: ${e.message}`, { ms: 7000 }); }
  },
  't-set-tg': async f => {
    const token = f.token.value.trim();
    if (!token) return;
    const t = await import('../telegram.js');
    try {
      await t.checkToken(token);
      secret.set('tg', token);
      secret.set('tgOffset', 0);
      toast('حفظ رمز البوت');
      draw();
    } catch (e) { toast(e.message, { ms: 7000 }); }
  },
  't-set-fw': f => { saveTSetting('forward', { footer: f.footer.value.trim(), template: f.template.value, binaryTemplate: f.binaryTemplate.value }); toast('حفظت الصيغة'); },
  't-set-risk': f => {
    const n = k => Number(f[k].value) || 0;
    saveTSetting('risk', { balance: n('balance'), riskPct: n('riskPct'), maxDailyLossPct: n('maxDailyLossPct'), payout: n('payout'), leverage: n('leverage') });
    toast('حفظت القيم');
  },
  't-set-ext': async () => {
    const v = extForm();
    if (!v) return;
    const err = v.f.querySelector('.field-err');
    if (!v.base) { err.textContent = 'اكتب عنوان الخدمة.'; return; }
    if (v.on && !v.model) { err.textContent = 'اختر نموذجا من القائمة.'; return; }
    if (v.on && SERVICES[v.service].needsKey && !v.key) { err.textContent = 'الصق المفتاح أولا.'; return; }
    // turning it on checks the address and the key first, so a broken setting is never saved as active
    if (v.on && !(S.ext && S.ext.base === v.base) && !(await verifyExt(v))) return;
    const meta = S.ext?.models.find(m => m.id === v.model);
    if (v.on && S.ext && !meta) { err.textContent = 'هذا النموذج غير موجود في قائمة الخدمة. اختر من القائمة.'; return; }
    const old = extConfig();
    saveExtConfig({ service: v.service, base: v.base, key: v.key, model: v.model, on: v.on, tools: meta ? meta.tools : old.model === v.model ? old.tools : null });
    S.extSvc = null;
    toast(v.on ? 'فعلت الإجابة الحرة' : 'حفظ الإعداد، والإجابة الحرة متوقفة');
    drawExt();
  },
  't-set-sync': async f => {
    const cfg = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: 'main', dir: 'data', shareKey: f.shareKey.checked };
    const key = f.key.value.trim() || (cfg.shareKey ? local.get('nawah.sync.key', '') : local.get('nawah.tsync.key', ''));
    const err = f.querySelector('.field-err');
    if (!key) { err.textContent = 'اكتب مفتاحا، أو اختر مفتاح الشركة إن كان مفعلا على هذا الجهاز.'; return; }
    err.textContent = 'جار التحقق';
    const res = await tsync.check(cfg, key);
    if (!res.ok) { err.textContent = res.message; return; }
    cfg.branch = res.branch || 'main';
    tsync.save(cfg, f.key.value.trim() || null);
    err.textContent = '';
    toast(`تم الربط بـ ${res.repo}`);
  },
});

onAct({
  't-set-td-del': () => { secret.set('td', ''); toast('حذف المفتاح'); draw(); },
  't-ext-verify': async () => {
    const v = extForm();
    if (!v || !(await verifyExt(v))) return;
    // only the list and the result change, so what the person typed stays in place
    const box = S.box.querySelector('#ts-ext');
    box.querySelector('#te-models').innerHTML = String(html`${modelOptions(S.ext.models)}`);
    box.querySelector('#te-info').innerHTML = String(extInfo(S.ext));
    box.querySelector('#te-model').placeholder = 'اكتب جزءا من الاسم واختر';
  },
  't-ext-del': async () => {
    if (!(await confirmBox('حذف إعداد الإجابة الحرة؟', { ok: 'احذف', danger: true, detail: 'يحذف العنوان والمفتاح والنموذج من هذا المتصفح، ويعود إكس نواة إلى ردود المحرك.' }))) return;
    saveExtConfig(null);
    S.ext = null;
    S.extSvc = null;
    toast('حذف الإعداد');
    drawExt();
  },
  't-set-tg-del': async () => { const t = await import('../telegram.js'); t.stop(); secret.set('tg', ''); secret.set('poll', false); toast('حذف رمز البوت'); draw(); },
  't-set-hook-del': async () => { const t = await import('../telegram.js'); try { await t.dropWebhook(); toast('حذف الويب هوك'); checkTg(secret.get('tg'), true); } catch (e) { toast(e.message); } },
  't-set-owner-reset': () => { secret.set('tgOwner', null); toast('سيصبح مالك البوت أول من يراسله في الخاص'); draw(); },
  't-set-cache': async () => { await clearCache(); toast('مسحت الشموع المحفوظة'); },
  't-set-look': el => { local.set('nawah.trade.look', el.dataset.v); ctx.applyMode?.(); draw(); },
  't-set-sync-run': () => tsync.run(),
  't-set-sync-off': () => { tsync.forget(); drawSync(); },
  't-set-export': () => download(`nawah-trade-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(tstore.exportAll())),
  't-set-wipe': async () => {
    if (!(await confirmBox('مسح بيانات التداول من هذا الجهاز؟', { ok: 'امسح', danger: true, detail: 'تمسح قائمة المتابعة والقنوات والتوصيات واليوميات من هذا المتصفح. نزل نسخة احتياطية أولا إن احتجتها.' }))) return;
    await tstore.wipe();
    toast('مسحت بيانات التداول');
  },
});

onChange({
  't-ext-svc': el => { if (!S) return; S.extSvc = el.value; S.ext = null; drawExt(); },
  't-set-tz': el => { local.set('nawah.trade.tz', el.value); toast('غير التوقيت، ويظهر في الشارت عند فتحه'); },
  't-set-poll': async el => {
    const t = await import('../telegram.js');
    secret.set('poll', el.checked);
    if (el.checked) t.start(); else t.stop();
    toast(el.checked ? 'بدأ الاستقبال على هذا الجهاز' : 'أوقف الاستقبال');
  },
  't-set-import': async el => {
    const file = el.files?.[0];
    if (!file) return;
    try { const n = tstore.importBackup(JSON.parse(await readFile(file))); toast(`استرجع ${n} من أقسام البيانات`); } catch (e) { toast(e.message || 'تعذر قراءة الملف'); }
  },
});

