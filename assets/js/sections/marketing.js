// Marketing: the content calendar and its publishing flow, the platform accounts, the brand.
import { html, raw, richText } from '../core/html.js';
import { icon, PLATFORMS, platformChip } from '../core/icons.js';
import { store } from '../core/store.js';
import { ctx, can, flag, canSee, canEdit, members, memberName } from '../core/ctx.js';
import { register } from '../core/nav.js';
import { onAct, onChange, onForm } from '../core/actions.js';
import { page, tabs, btn, pill, board, table, due, avatar, search, select, viewSwitch, editRecord, hooks, empty, toast, monthGrid, platforms, progress, drawer, closeDrawer, captionLimits } from '../core/ui.js';
import { today, diffDays, addDays, monthStart, fmtMonth, fmtShort, fmtTime, relDay, matches, num, copyText, local, sum, count, FORMS } from '../core/util.js';
import { POST_STATUS, POST_FORMATS, ACCOUNT_STATUS, label } from '../core/schema.js';
import { pillars, pillarLabel, pillarIndex } from './shared.js';
import { askImport } from './importer.js';

// ---------- content

const PILLAR_TONES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const pTone = key => PILLAR_TONES[pillarIndex(key) % PILLAR_TONES.length];

function postCard(p) {
  return html`<p class="card-title">${p.title}</p>
    <div class="card-meta">${platforms(p.platforms)}${p.pillar ? html`<span class="mini pillar ${pTone(p.pillar)}">${pillarLabel(p.pillar)}</span>` : ''}</div>
    <div class="card-meta">${p.date ? html`<span class="mini">${icon('calendar')}${fmtShort(p.date)}${p.time ? '، ' + fmtTime(p.time) : ''}</span>` : html`<span class="mini muted">بلا تاريخ</span>`}${p.clientApproval ? html`<span class="pill t-warn">بعد موافقة العميل</span>` : ''}${p.owner ? avatar(p.owner, { size: 's' }) : ''}</div>`;
}

function pillarMix(list) {
  const ps = pillars();
  if (!ps.length) return '';
  const total = list.length || 1;
  return html`<section class="module mix">
    <header class="module-head"><h2>توازن المحاور هذا الشهر</h2><span class="muted small">الفعلي مقابل المستهدف</span></header>
    <ul class="mix-list">${ps.map(p => {
      const n = list.filter(x => x.pillar === p.key).length;
      const actual = Math.round((n / total) * 100);
      return html`<li title="${p.description || ''}"><span class="mix-l"><span class="lg-dot ${pTone(p.key)}"></span>${p.label}</span>
        <span class="mix-track"><span class="mix-bar ${pTone(p.key)}" style="width:${list.length ? actual : 0}%"></span><span class="mix-target" style="inset-inline-start:${p.share || 0}%" title="المستهدف ${p.share || 0}%"></span></span>
        <span class="mix-v"><span dir="ltr">${list.length ? actual : 0}%</span> <small>من <span dir="ltr">${p.share || 0}%</span></small></span></li>`;
    })}</ul>
  </section>`;
}

register('content', {
  label: 'المحتوى والنشر', short: 'المحتوى', icon: 'content', module: 'content', aka: 'سوشيال منشورات خطة المحتوى تقويم النشر',
  badge: () => store.all('posts').filter(p => p.owner === ctx.me.id && !['published', 'scheduled'].includes(p.status) && p.date && diffDays(p.date, today()) <= 0).length,
  render(r) {
    const q = r.query;
    const view = q.view || local.get('nawah.view.content', 'calendar');
    local.set('nawah.view.content', view);
    const month = q.m ? `${q.m}-01` : monthStart(today());
    let list = store.all('posts').filter(p => canSee('content', p));
    if (q.q) list = list.filter(p => matches(`${p.title} ${p.caption || ''}`, q.q));
    if (q.pf) list = list.filter(p => (p.platforms || []).includes(q.pf));
    if (q.pillar) list = list.filter(p => p.pillar === q.pillar);
    if (q.status) list = list.filter(p => p.status === q.status);
    const inMonth = list.filter(p => String(p.date || '').slice(0, 7) === month.slice(0, 7));
    const canImport = can('content', 'edit');
    const filters = html`<div class="filters">
      ${search('q', q.q, 'ابحث في المحتوى')}
      ${select('pf', Object.entries(PLATFORMS).map(([k, p]) => [k, p.label]), q.pf, { all: 'كل المنصات' })}
      ${select('pillar', pillars().map(p => [p.key, p.label]), q.pillar, { all: 'كل المحاور' })}
      ${view !== 'board' ? select('status', POST_STATUS.map(([k, l]) => [k, l]), q.status, { all: 'كل الحالات' }) : ''}
      ${viewSwitch([['calendar', 'تقويم', 'calendar'], ['board', 'لوحة', 'board'], ['list', 'قائمة', 'list']], view)}
    </div>`;
    const prev = addDays(month, -1).slice(0, 7);
    const next = addDays(month, 32).slice(0, 7);
    let body;
    if (!store.count('posts')) {
      body = empty({
        title: 'التقويم فارغ',
        text: 'استورد خطة المحتوى الجاهزة فتتوزع منشوراتها على التقويم من يوم الإطلاق، أو أضف أول منشور بنفسك.',
        actions: html`${canImport ? html`<label class="btn btn-primary" data-tour="import-plan">${icon('upload')}<span>استورد خطة المحتوى</span><input type="file" accept=".json,application/json" data-change="import-file" hidden></label>` : ''}${btn('أضف منشورا', { act: 'new-post', icon: 'plus', kind: 'quiet' })}`,
        ic: 'content',
      });
    } else if (view === 'board') {
      body = board({ col: 'posts', field: 'status', card: postCard, columns: POST_STATUS.map(([k, l, tn]) => ({ key: k, label: l, tone: tn, items: list.filter(p => (p.status || 'idea') === k && (k !== 'published' || diffDays(today(), p.date || today()) <= 30)).sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9'))) })) });
    } else if (view === 'list') {
      body = table({ col: 'posts', rows: list.sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9'))), columns: [
        { label: 'التاريخ', cell: p => (p.date ? html`${fmtShort(p.date)}${p.time ? html`<span class="muted small"> ${fmtTime(p.time)}</span>` : ''}` : html`<span class="muted">بلا تاريخ</span>`) },
        { label: 'المنشور', cell: p => html`<b>${p.title}</b>` },
        { label: 'المنصات', cell: p => platforms(p.platforms) },
        { label: 'المحور', cell: p => pillarLabel(p.pillar) },
        { label: 'الحالة', cell: p => pill(POST_STATUS, p.status) },
      ] });
    } else {
      const byDay = {};
      for (const p of list) if (p.date) (byDay[p.date] ||= []).push(p);
      body = html`<div class="month-nav">${btn('', { act: 'go', icon: 'chevR', title: 'الشهر السابق', data: { href: `#/content?view=calendar&m=${prev}` } })}<h2>${fmtMonth(month)}</h2>${btn('', { act: 'go', icon: 'chevL', title: 'الشهر التالي', data: { href: `#/content?view=calendar&m=${next}` } })}</div>
        ${monthGrid(month, d => html`${(byDay[d] || []).sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))).map(p => html`<button type="button" class="cal-it post ${pTone(p.pillar)} s-${p.status}" data-act="open" data-col="posts" data-id="${p.id}" draggable="true" title="${p.title}، ${label(POST_STATUS, p.status)}"><span class="st-dot s-${p.status}" aria-hidden="true"></span><span class="cal-pfs">${(p.platforms || []).slice(0, 3).map(k => PLATFORMS[k]?.code).join(' ')}</span>${p.title}</button>`)}`, { addAct: 'new-post' })}
        <ul class="legend">${POST_STATUS.map(([k, l]) => html`<li><span class="st-dot s-${k}"></span>${l}</li>`)}</ul>`;
    }
    const imported = store.setting('content', {}).imported;
    return page({
      title: 'المحتوى والنشر',
      sub: imported ? `الخطة المستوردة: ${imported.title}، تبدأ ${fmtShort(imported.start)}` : 'كل منشور يمر بستة مراحل: فكرة، كتابة، تصميم، مراجعة، مجدول، منشور.',
      actions: html`${canImport && store.count('posts') ? html`<label class="btn btn-quiet" title="استيراد خطة محتوى">${icon('upload')}<span class="hide-mobile">استيراد خطة</span><input type="file" accept=".json,application/json" data-change="import-file" hidden></label>` : ''}${btn('أضف منشورا', { act: 'new-post', icon: 'plus', kind: 'primary' })}`,
      body: html`${filters}${store.count('posts') && view === 'calendar' ? pillarMix(inMonth) : ''}${body}`,
    });
  },
});

hooks.beforeSave.posts = (p, old) => {
  const out = ['scheduled', 'published'];
  if (out.includes(p.status) && (!old || !out.includes(old.status)) && p.needsApproval !== false && !p.approvedBy && !flag('approve')) {
    p.status = 'review';
    toast('المنشور يحتاج اعتماد شريك قبل الجدولة، فأرسل للمراجعة');
  }
  if (p.status === 'published' && old?.status !== 'published') p.publishedAt = Date.now();
  return p;
};
hooks.panelFoot.posts = p => {
  if (!p.id) return '';
  return html`${btn('انسخ النص', { act: 'copy-caption', icon: 'copy', kind: 'quiet', data: { id: p.id } })}
    ${['idea', 'writing', 'design'].includes(p.status) ? btn('أرسل للمراجعة', { act: 'post-review', icon: 'approvals', kind: 'quiet', data: { id: p.id } }) : ''}
    ${p.status === 'scheduled' && flag('publish') ? btn('علمه منشورا', { act: 'post-published', icon: 'send', kind: 'quiet', data: { id: p.id } }) : ''}`;
};
hooks.panelExtra.posts = p => {
  if (!p.id || p.status !== 'published') return '';
  const m = p.metrics || {};
  return html`<form class="related metrics" data-form="post-metrics" data-id="${p.id}">
    <h3>النتائج بعد النشر</h3>
    <div class="fields">${[['reach', 'الوصول'], ['engagements', 'التفاعل'], ['clicks', 'النقرات'], ['leads', 'تواصل أو استفسارات']].map(([k, l]) => html`<div class="field"><label for="m-${k}">${l}</label><input id="m-${k}" type="number" min="0" name="${k}" value="${m[k] ?? ''}"></div>`)}</div>
    <div class="field wide"><label for="m-links">روابط المنشور على المنصات</label><textarea id="m-links" name="links" rows="2" dir="ltr" placeholder="رابط في كل سطر">${(p.links || []).join('\n')}</textarea></div>
    ${btn('احفظ النتائج', { type: 'submit', kind: 'quiet', icon: 'check' })}
  </form>`;
};

onAct({
  'new-post': el => editRecord('posts', null, { defaults: { owner: ctx.me.id, status: 'idea', date: el?.dataset?.date || '', needsApproval: true, platforms: ['linkedin'] } }),
  'copy-caption': async el => {
    const p = store.get('posts', el.dataset.id);
    const text = [p.caption, (p.hashtags || []).map(h => `#${h}`).join(' ')].filter(Boolean).join('\n\n');
    toast((await copyText(text)) ? 'نسخ النص مع الوسوم' : 'تعذر النسخ، انسخه يدويا من الخانة');
  },
  'post-review': el => { store.patch('posts', el.dataset.id, { status: 'review' }); closeDrawer(); toast('أرسل للمراجعة'); },
  'post-published': el => { store.patch('posts', el.dataset.id, { status: 'published', publishedAt: Date.now() }); toast('تم. سجل النتائج بعد أيام من نافذة المنشور'); closeDrawer(); },
});
onForm({
  'post-metrics': f => {
    const metrics = {};
    for (const k of ['reach', 'engagements', 'clicks', 'leads']) if (f[k].value !== '') metrics[k] = Number(f[k].value);
    store.patch('posts', f.dataset.id, { metrics, links: f.links.value.split('\n').map(s => s.trim()).filter(Boolean) });
    toast('حفظت النتائج');
  },
});
onChange({ 'import-file': el => { const f = el.files?.[0]; if (f) askImport(f); el.value = ''; } });

// ---------- platform accounts

const GENERIC_STEPS = ['احجز اسم الحساب نفسه المعتمد في كل المنصات', 'أنشئ الحساب ببريد الشركة لا ببريد شخصي', 'فعل التحقق بخطوتين', 'أضف شريكا ثانيا بصلاحية مدير', 'ارفع الشعار والغلاف واكتب النبذة', 'ثبت منشور التعريف'];

register('accounts', {
  label: 'حسابات المنصات', short: 'الحسابات', icon: 'accounts', module: 'accounts', aka: 'لينكدإن انستغرام اكس تيك توك سناب واتساب يوتيوب حساب',
  render() {
    const list = store.all('accounts');
    const edit = can('accounts', 'edit');
    const order = Object.keys(PLATFORMS);
    list.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
    return page({
      title: 'حسابات المنصات',
      sub: 'خطوات إنشاء كل حساب ومقاساته، ومن يملك الصلاحية. كلمات المرور لا تكتب هنا أبدا، مكانها مدير كلمات المرور.',
      actions: edit ? btn('أضف حسابا', { act: 'new-account', icon: 'plus', kind: 'primary' }) : '',
      body: list.length ? html`<div class="accounts">${list.map(a => {
        const steps = a.steps || [];
        const done = steps.filter(s => s.done).length;
        return html`<article class="acct" data-act="open" data-col="accounts" data-id="${a.id}" tabindex="0">
          <header>${platformChip(a.platform)}<h3>${PLATFORMS[a.platform]?.label || a.platform}</h3>${pill(ACCOUNT_STATUS, a.status)}</header>
          <p class="acct-handle">${a.handle ? html`<bdi class="mono" dir="ltr">@${String(a.handle).replace(/^@/, '')}</bdi>` : a.handleIdeas?.length ? html`مقترح: <bdi class="mono" dir="ltr">${a.handleIdeas.join(', ')}</bdi>` : html`<span class="muted">لم يحدد اسم الحساب بعد</span>`}</p>
          ${steps.length ? html`<div class="acct-steps">${progress((done / steps.length) * 100, { label: 'خطوات الإنشاء' })}<span class="muted small">${done ? `أنجز ${done} من ${count(steps.length, FORMS.step)}` : `لم تبدأ، ${count(steps.length, FORMS.step)}`}</span></div>` : ''}
          <p class="acct-meta">${a.twoFactor ? html`<span class="ok-mark">${icon('shield')}التحقق بخطوتين مفعل</span>` : html`<span class="warn-mark">${icon('alert')}التحقق بخطوتين غير مفعل</span>`}${a.owner ? avatar(a.owner, { size: 's' }) : ''}</p>
        </article>`;
      })}</div>` : empty({
        title: 'لا حسابات بعد',
        text: 'حزمة البداية فيها خطوات إنشاء كل حساب بالضبط. أو أنشئ بطاقات المنصات بخطوات عامة وعدلها.',
        actions: edit ? html`${btn('أنشئ بطاقات المنصات', { act: 'seed-accounts', icon: 'plus', kind: 'primary' })}<label class="btn btn-quiet">${icon('upload')}<span>استورد الخطة</span><input type="file" accept=".json,application/json" data-change="import-file" hidden></label>` : '',
        ic: 'accounts',
      }),
    });
  },
});
hooks.title.accounts = a => `${PLATFORMS[a.platform]?.label || ''} ${a.handle || ''}`.trim();
hooks.panelExtra.accounts = a => (a.handleIdeas?.length ? html`<p class="muted small related">أسماء مقترحة للحجز (تحقق من توفرها): <span class="mono">${a.handleIdeas.join('، ')}</span></p>` : '');
onAct({
  'new-account': () => editRecord('accounts', null, { defaults: { status: 'planned', owner: ctx.me.id, steps: GENERIC_STEPS.map(t => ({ t, done: false })) } }),
  'seed-accounts': () => {
    for (const k of ['linkedin', 'x', 'instagram', 'whatsapp', 'tiktok', 'youtube', 'facebook', 'snapchat']) {
      if (!store.get('accounts', `acc-${k}`)) store.put('accounts', { id: `acc-${k}`, platform: k, status: 'planned', steps: GENERIC_STEPS.map(t => ({ t, done: false })) }, { log: false });
    }
    toast('أنشئت بطاقات المنصات');
  },
});

// ---------- brand and voice

const BRAND_DEFAULT = {
  pending: true,
  logo: 'بانتظار اعتماد الشعار النهائي.',
  colors: [],
  fonts: [{ name: 'IBM Plex Sans Arabic', use: 'العناوين والنصوص العربية والإنجليزية' }],
  voice: ['عربية فصحى واضحة بجمل قصيرة، بلا تشكيل ولا شرطة طويلة ولا رموز تعبيرية', 'نتكلم عن مشكلة صاحب العمل اليومية بأمثلة ملموسة', 'كل منشور ينتهي بدعوة واحدة واضحة', 'لا رقم ولا نتيجة ولا اسم عميل دون مصدر وموافقة'],
  words: [],
  banned: ['حلول متكاملة', 'الأفضل في المملكة', 'نضمن الصفحة الأولى في جوجل', 'في عالم اليوم المتسارع', 'لا تفوت'],
  hashtags: [],
  templates: [],
};

register('brand', {
  label: 'الهوية والصوت', short: 'الهوية', icon: 'brand', module: 'brand', aka: 'هوية ألوان خطوط شعار نبرة صوت',
  render() {
    const b = store.setting('brand', BRAND_DEFAULT);
    const edit = can('brand', 'edit');
    return page({
      title: 'الهوية والصوت',
      sub: 'المرجع الواحد لكل تصميم ونص يخرج باسم تم.',
      actions: edit ? btn('عدل الهوية', { act: 'edit-brand', icon: 'edit', kind: 'primary' }) : '',
      body: html`${b.pending ? html`<p class="note">${icon('alert')}الهوية لم تعتمد نهائيا بعد. ما هنا يتحدث مع كل قرار.</p>` : ''}
        <div class="brand-grid">
          <section class="module"><header class="module-head"><h2>الشعار</h2></header><p>${b.logo}</p></section>
          <section class="module"><header class="module-head"><h2>الألوان</h2></header>${b.colors?.length ? html`<ul class="swatches">${b.colors.map(c => html`<li><button type="button" class="sw" style="--sw:${c.hex}" data-act="copy-hex" data-hex="${c.hex}" aria-label="انسخ ${c.hex}"></button><b>${c.name}</b><span class="mono">${c.hex}</span><small>${c.role || ''}</small></li>`)}</ul>` : html`<p class="muted">تضاف رموز الألوان بعد اعتماد الهوية.</p>`}</section>
          <section class="module"><header class="module-head"><h2>الخطوط</h2></header><ul class="plain">${(b.fonts || []).map(f => html`<li><b>${f.name}</b><span class="muted"> ${f.use || ''}</span></li>`)}</ul></section>
          <section class="module"><header class="module-head"><h2>صوت تم</h2></header><ul class="ticks">${(b.voice || []).map(v => html`<li>${v}</li>`)}</ul></section>
          ${b.words?.length ? html`<section class="module"><header class="module-head"><h2>كلمات نستخدمها</h2></header><p class="tags">${b.words.map(w => html`<span>${w}</span>`)}</p></section>` : ''}
          <section class="module"><header class="module-head"><h2>عبارات ممنوعة</h2></header><p class="tags banned">${(b.banned || []).map(w => html`<span>${w}</span>`)}</p></section>
          ${b.hashtags?.length ? html`<section class="module"><header class="module-head"><h2>الوسوم الثابتة</h2></header><p class="tags">${b.hashtags.map(h => html`<span>#${h}</span>`)}</p></section>` : ''}
          ${b.templates?.length ? html`<section class="module"><header class="module-head"><h2>القوالب</h2></header><ul class="plain">${b.templates.map(t => html`<li>${t.link ? html`<a href="${t.link}" target="_blank" rel="noopener noreferrer">${t.name}</a>` : t.name}</li>`)}</ul></section>` : ''}
        </div>`,
    });
  },
});

const lines = v => String(v || '').split('\n').map(s => s.trim()).filter(Boolean);
onAct({
  'copy-hex': async el => toast((await copyText(el.dataset.hex)) ? `نسخ ${el.dataset.hex}` : el.dataset.hex),
  'edit-brand': () => {
    const b = store.setting('brand', BRAND_DEFAULT);
    drawer({
      title: 'تعديل الهوية والصوت',
      wide: true,
      body: html`<form class="rec-form" data-form="save-brand"><div class="fields">
        <div class="field wide"><label class="switch"><input type="checkbox" name="pending"${b.pending ? raw(' checked') : ''}><span>الهوية لم تعتمد نهائيا بعد</span></label></div>
        <div class="field wide"><label for="b-logo">الشعار وقواعد استخدامه</label><textarea id="b-logo" name="logo" rows="3">${b.logo || ''}</textarea></div>
        <div class="field wide"><label for="b-colors">الألوان: سطر لكل لون بالشكل «الاسم | #RRGGBB | الاستخدام»</label><textarea id="b-colors" name="colors" rows="4" dir="auto">${(b.colors || []).map(c => `${c.name} | ${c.hex} | ${c.role || ''}`).join('\n')}</textarea></div>
        <div class="field wide"><label for="b-fonts">الخطوط: سطر لكل خط «الاسم | الاستخدام»</label><textarea id="b-fonts" name="fonts" rows="2">${(b.fonts || []).map(f => `${f.name} | ${f.use || ''}`).join('\n')}</textarea></div>
        <div class="field wide"><label for="b-voice">قواعد الصوت (سطر لكل قاعدة)</label><textarea id="b-voice" name="voice" rows="4">${(b.voice || []).join('\n')}</textarea></div>
        <div class="field wide"><label for="b-words">كلمات نستخدمها (سطر لكل كلمة)</label><textarea id="b-words" name="words" rows="3">${(b.words || []).join('\n')}</textarea></div>
        <div class="field wide"><label for="b-banned">عبارات ممنوعة (سطر لكل عبارة)</label><textarea id="b-banned" name="banned" rows="3">${(b.banned || []).join('\n')}</textarea></div>
        <div class="field wide"><label for="b-tags">الوسوم الثابتة (سطر لكل وسم)</label><textarea id="b-tags" name="hashtags" rows="2">${(b.hashtags || []).join('\n')}</textarea></div>
        <div class="field wide"><label for="b-tpl">القوالب: سطر لكل قالب «الاسم | الرابط»</label><textarea id="b-tpl" name="templates" rows="3" dir="auto">${(b.templates || []).map(t => `${t.name} | ${t.link || ''}`).join('\n')}</textarea></div>
      </div></form>`,
      foot: html`${btn('احفظ', { act: 'submit-brand', kind: 'primary', icon: 'check' })}${btn('إلغاء', { act: 'close-drawer', kind: 'quiet' })}`,
    });
  },
  'submit-brand': () => document.querySelector('#drawer form[data-form="save-brand"]')?.requestSubmit(),
});
onForm({
  'save-brand': f => {
    const split = l => l.split('|').map(s => s.trim());
    const colors = lines(f.colors.value).map(split).filter(([, hex]) => /^#[0-9a-f]{6}$/i.test(hex || '')).map(([name, hex, role]) => ({ name, hex, role }));
    store.saveSetting('brand', {
      pending: f.pending.checked,
      logo: f.logo.value.trim(),
      colors,
      fonts: lines(f.fonts.value).map(split).map(([name, use]) => ({ name, use })),
      voice: lines(f.voice.value),
      words: lines(f.words.value),
      banned: lines(f.banned.value),
      hashtags: lines(f.hashtags.value).map(h => h.replace(/^#/, '')),
      templates: lines(f.templates.value).map(split).map(([name, link]) => ({ name, link: /^https?:\/\//.test(link || '') ? link : '' })),
    });
    store.log('update', 'settings', { id: 'brand', title: 'الهوية والصوت' });
    closeDrawer();
    toast('حفظت الهوية');
  },
});

export { BRAND_DEFAULT };
