// Reports, settings (company, services, roles, sync, data), the guide, and the person's own page.
import { html, raw } from '../core/html.js';
import { icon, PLATFORMS } from '../core/icons.js';
import { store, COLLECTIONS } from '../core/store.js';
import { sync, syncSteps, TOKEN_URL, NEW_REPO_URL } from '../core/sync.js';
import { ctx, can, flag, members, memberName, isAdmin, settings } from '../core/ctx.js';
import { register, canOpen, SECTIONS } from '../core/nav.js';
import { onAct, onForm, onChange } from '../core/actions.js';
import { page, tabs, btn, pill, table, avatar, editRecord, empty, toast, drawer, closeDrawer, modal, closeModal, confirmBox, hbars, segbar, progress } from '../core/ui.js';
import { MODULES, FLAGS, LEVELS, LEVEL_LABELS, BUILTIN_ROLES } from '../core/perms.js';
import { today, addDays, monthStart, fmtShort, fmtMonth, fmtDate, ago, money, num, sum, download, csv, readFile, local, count, FORMS, iso } from '../core/util.js';
import { POST_STATUS, TASK_STATUS, DEAL_STAGES, SETUP_GROUPS, SETUP_STATUS, label } from '../core/schema.js';
import { askImport } from './importer.js';
import { HOME_BLOCKS } from './home.js';
import { open, dealOpen, pillars, pillarLabel } from './shared.js';

// ---------- reports

function reportShell(title, sub, body, rows) {
  drawer({
    title, sub, wide: true,
    body: html`<article class="report-doc" id="print-area">${body}</article>`,
    foot: html`${btn('اطبع أو احفظ PDF', { act: 'print', icon: 'print', kind: 'primary' })}${rows ? btn('نزل البيانات CSV', { act: 'report-csv', icon: 'download', kind: 'quiet' }) : ''}${btn('إغلاق', { act: 'close-drawer', kind: 'quiet' })}`,
  });
  reportShell.rows = rows;
}

const REPORTS = [
  {
    key: 'tasks', title: 'تقرير المهام', text: 'المنجز والمتأخر لكل عضو هذا الشهر.', module: 'tasks',
    run() {
      const m = today().slice(0, 7);
      const tasks = store.all('tasks');
      const rows = members().map(mb => {
        const mine = tasks.filter(t => (t.assignees || []).includes(mb.id));
        return { name: mb.name, done: mine.filter(t => t.status === 'done' && t.doneAt && iso(new Date(t.doneAt)).slice(0, 7) === m).length, open: mine.filter(open).length, late: mine.filter(t => open(t) && t.due && t.due < today()).length };
      });
      reportShell('تقرير المهام', fmtMonth(today()), html`<ul class="nums">${rows.map(r => html`<li><span>${r.name}</span><b>${r.done} أنجزت</b><small>${r.open} مفتوحة، ${r.late} متأخرة</small></li>`)}</ul>`, [['العضو', 'أنجزت هذا الشهر', 'مفتوحة', 'متأخرة'], ...rows.map(r => [r.name, r.done, r.open, r.late])]);
    },
  },
  {
    key: 'sales', title: 'تقرير المبيعات', text: 'الفرص بالمراحل، وما تم التعاقد عليه وما لم يكتمل.', module: 'clients',
    run() {
      const deals = store.all('deals');
      const showMoney = flag('money');
      const rows = DEAL_STAGES.map(([k, l]) => { const list = deals.filter(d => d.stage === k); return { l, n: list.length, v: sum(list, d => d.value) }; });
      reportShell('تقرير المبيعات', fmtDate(today()), html`${hbars(rows.map(r => ({ label: r.l, value: showMoney ? r.v : r.n, display: showMoney ? `${money(r.v, { short: true })}، ${r.n}` : String(r.n) })))}
        <h3>أسباب عدم الاكتمال</h3><ul>${deals.filter(d => d.stage === 'lost').map(d => html`<li>${d.title}: ${d.lostReason || 'لم يسجل السبب'}</li>`)}</ul>`,
      [['المرحلة', 'العدد', ...(showMoney ? ['القيمة'] : [])], ...rows.map(r => [r.l, r.n, ...(showMoney ? [r.v] : [])])]);
    },
  },
  {
    key: 'content', title: 'تقرير المحتوى', text: 'ما نشر هذا الشهر حسب المنصة والمحور، والنتائج المسجلة.', module: 'content',
    run() {
      const m = today().slice(0, 7);
      const posts = store.all('posts').filter(p => p.status === 'published' && String(p.date || '').slice(0, 7) === m);
      const by = k => posts.filter(p => (p.platforms || []).includes(k)).length;
      const metrics = ['reach', 'engagements', 'clicks', 'leads'].map(k => [k, sum(posts, p => p.metrics?.[k])]);
      reportShell('تقرير المحتوى', fmtMonth(today()), html`<p>${posts.length ? `نشر هذا الشهر ${count(posts.length, FORMS.post)}.` : 'لم ينشر شيء هذا الشهر بعد.'}</p>
        <h3>حسب المنصة</h3>${hbars(Object.entries(PLATFORMS).map(([k, p]) => ({ label: p.label, value: by(k) })).filter(r => r.value))}
        <h3>حسب المحور</h3>${hbars(pillars().map(p => ({ label: p.label, value: posts.filter(x => x.pillar === p.key).length })))}
        <h3>النتائج المسجلة</h3><ul class="nums">${metrics.map(([k, v]) => html`<li><span>${{ reach: 'الوصول', engagements: 'التفاعل', clicks: 'النقرات', leads: 'تواصل واستفسارات' }[k]}</span><b>${num(v)}</b></li>`)}</ul>
        <p class="muted small">الأرقام كما سجلها الفريق من نوافذ المنصات. ما لم يسجل لا يحسب.</p>`,
      [['التاريخ', 'المنشور', 'المنصات', 'المحور', 'الوصول', 'التفاعل', 'النقرات', 'تواصل'], ...posts.map(p => [p.date, p.title, (p.platforms || []).map(k => PLATFORMS[k]?.label).join(' و'), pillarLabel(p.pillar), p.metrics?.reach ?? '', p.metrics?.engagements ?? '', p.metrics?.clicks ?? '', p.metrics?.leads ?? ''])]);
    },
  },
  {
    key: 'setup', title: 'تقرير التأسيس', text: 'أين وصلنا في كل محور من محاور تأسيس الشركة.', module: 'setup',
    run() {
      const all = store.all('setup');
      reportShell('تقرير التأسيس', fmtDate(today()), html`${segbar(SETUP_STATUS.map(([k, l, tn]) => ({ label: l, value: all.filter(s => s.status === k).length, tone: tn })))}
        ${SETUP_GROUPS.map(([k, l]) => { const g = all.filter(s => s.group === k); return g.length ? html`<h3>${l}</h3><ul>${g.map(s => html`<li>${s.title}: ${label(SETUP_STATUS, s.status)}${s.owner ? `، ${memberName(s.owner)}` : ''}${s.due ? `، ${fmtShort(s.due)}` : ''}</li>`)}</ul>` : ''; })}`,
      [['المحور', 'الخطوة', 'الحالة', 'المسؤول', 'الموعد'], ...all.map(s => [label(SETUP_GROUPS, s.group), s.title, label(SETUP_STATUS, s.status), memberName(s.owner), s.due || ''])]);
    },
  },
];

register('reports', {
  label: 'التقارير', icon: 'reports', module: 'reports', aka: 'تقرير طباعة تصدير',
  render() {
    return page({
      title: 'التقارير',
      sub: 'قالب واحد لكل تقرير: يطبع أو يحفظ بصيغة PDF، وتنزل بياناته بصيغة CSV لبرامج الجداول.',
      body: html`<div class="report-grid">
        ${canOpen('weekly') ? html`<article class="rcard"><h3>التقرير الأسبوعي</h3><p>الإنجازات والأرقام والدرس والعوائق، من وقفة الخميس.</p>${btn('افتح الوقفة الأسبوعية', { href: '#/weekly', kind: 'quiet' })}</article>` : ''}
        ${REPORTS.filter(r => can(r.module, 'own')).map(r => html`<article class="rcard"><h3>${r.title}</h3><p>${r.text}</p>${btn('اعرض التقرير', { act: 'run-report', kind: 'quiet', data: { key: r.key } })}</article>`)}
      </div>
      ${isAdmin() ? html`<section class="module wide"><header class="module-head"><h2>تصدير البيانات</h2></header><p class="muted small">كل قسم في ملف CSV يفتح في Excel أو Google Sheets.</p><div class="export-row">${[['tasks', 'المهام'], ['clients', 'العملاء'], ['deals', 'الفرص'], ['projects', 'المشاريع'], ['posts', 'المحتوى'], ['knowledge', 'المعرفة'], ['decisions', 'القرارات'], ['expenses', 'المصروفات']].map(([c, l]) => btn(l, { act: 'export-csv', kind: 'quiet', cls: 'btn-small', icon: 'download', data: { col: c } }))}</div></section>` : ''}`,
    });
  },
});

const toCsv = rows => '\uFEFF' + csv(rows);
onAct({
  'run-report': el => REPORTS.find(r => r.key === el.dataset.key)?.run(),
  'report-csv': () => reportShell.rows && download(`nawah-report-${today()}.csv`, toCsv(reportShell.rows), 'text/csv'),
  'export-csv': el => {
    const col = el.dataset.col;
    const list = store.all(col);
    if (!list.length) { toast('لا بيانات في هذا القسم بعد'); return; }
    const keys = [...new Set(list.flatMap(r => Object.keys(r)))].filter(k => !['updatedBy', 'createdBy', 'deleted'].includes(k));
    const cell = v => (Array.isArray(v) ? v.map(x => (typeof x === 'object' ? x.t || x.desc || JSON.stringify(x) : (store.get('members', x)?.name || x))).join(' | ') : v && typeof v === 'object' ? JSON.stringify(v) : (typeof v === 'string' && store.get('members', v) ? store.get('members', v).name : v ?? ''));
    download(`nawah-${col}-${today()}.csv`, toCsv([keys, ...list.map(r => keys.map(k => cell(r[k])))]), 'text/csv');
  },
});

// ---------- settings


const ROLE_FORM = role => html`<form class="rec-form" data-form="save-role" data-id="${role.id || ''}">
  <div class="fields"><div class="field wide"><label for="r-name">اسم الصلاحية</label><input id="r-name" name="name" value="${role.name || ''}" required></div>
  <div class="field wide"><label class="switch"><input type="checkbox" name="admin"${role.perms?.admin ? raw(' checked') : ''}><span>شريك: يفتح كل شيء ويعدل كل شيء</span></label></div></div>
  <div class="table-wrap"><table class="tbl perm-tbl"><thead><tr><th>القسم</th><th>المستوى</th></tr></thead><tbody>
    ${MODULES.map(m => html`<tr><td>${m.label}</td><td><select class="sel sel-small" name="m-${m.key}" aria-label="مستوى ${m.label}">${Object.entries(LEVEL_LABELS).filter(([k]) => !(m.noOwn && k === 'own')).map(([k, l]) => html`<option value="${k}"${(role.perms?.modules?.[m.key] || 'none') === k ? raw(' selected') : ''}>${l}</option>`)}</select></td></tr>`)}
  </tbody></table></div>
  <fieldset class="flags"><legend>صلاحيات إضافية</legend>${FLAGS.map(f => html`<label class="switch"><input type="checkbox" name="f-${f.key}"${role.perms?.flags?.[f.key] ? raw(' checked') : ''}><span>${f.label}</span></label>`)}</fieldset>
</form>`;

register('settings', {
  label: 'الإعدادات', icon: 'settings', module: 'settings', aka: 'إعدادات صلاحيات مزامنة نسخة احتياطية استيراد',
  render(r) {
    const tab = r.parts[0] || 'company';
    const t = tabs([['#/settings/company', 'الشركة'], ['#/settings/roles', 'الصلاحيات'], ['#/settings/sync', 'المزامنة'], ['#/settings/data', 'البيانات']], tab);
    const edit = can('settings', 'edit');
    if (tab === 'roles') {
      const roles = store.all('roles');
      return page({
        title: 'الإعدادات', tabs: t,
        sub: 'لكل صلاحية مستوى في كل قسم: مغلق، ما يخصه فقط، يرى الكل، يرى ويعدل. وصلاحيات إضافية للاعتماد والمبالغ والنشر.',
        actions: edit ? btn('صلاحية جديدة', { act: 'edit-role', icon: 'plus', kind: 'primary' }) : '',
        body: html`<div class="roles">${roles.map(ro => {
          const users = members().filter(m => m.role === ro.id);
          return html`<article class="role" data-act="${edit ? 'edit-role' : ''}" data-id="${ro.id}" tabindex="0">
            <header><h3>${ro.name}</h3>${ro.perms?.admin ? html`<span class="pill t-good">كل شيء</span>` : ''}</header>
            ${ro.perms?.admin ? html`<p class="muted small">يفتح كل الأقسام ويعتمد ويرى المبالغ.</p>` : html`<p class="muted small">${MODULES.filter(m => (ro.perms?.modules?.[m.key] || 'none') !== 'none').map(m => m.label).join('، ') || 'لا أقسام'}</p>`}
            <footer>${users.length ? users.map(u => avatar(u, { size: 's' })) : html`<span class="muted small">لا أحد عليها</span>`}</footer>
          </article>`;
        })}</div><p class="muted small">تنبيه صريح: في هذه النسخة تنظم الصلاحيات ما يظهر لكل عضو في الواجهة. من يملك مفتاح المستودع يملك البيانات، لذلك تعطى المفاتيح للشركاء فقط حتى ننتقل إلى خادم بحسابات حقيقية.</p>`,
      });
    }
    if (tab === 'sync') {
      const c = sync.config();
      const demo = store.space === 'demo';
      const st = { off: 'متوقفة: البيانات على هذا الجهاز فقط', idle: `تعمل، آخر مزامنة ${sync.lastSync ? ago(sync.lastSync) : 'لم تتم بعد'}`, syncing: 'جار المزامنة', error: `خطأ: ${sync.error}`, offline: 'بلا اتصال، والتعديلات محفوظة هنا' }[sync.status];
      return page({
        title: 'الإعدادات', tabs: t,
        sub: 'الرابط العام لا يحمل أي بيانات. بيانات الشركة على أجهزتكم، وتنتقل بين الشركاء عبر مستودع GitHub خاص، وكل حفظ فيه نسخة بتاريخها.',
        body: html`${demo ? html`<p class="note">${icon('eye')}المزامنة متوقفة في نسخة العرض. الخطوات أدناه للاطلاع، وتنفذ من النسخة الحقيقية.</p>` : ''}<div class="sync-grid">
          ${demo ? '' : html`<section class="module">
            <header class="module-head"><h2>الحالة</h2><span class="sync-pill s-${sync.status === 'idle' ? 'ok' : sync.status === 'error' ? 'err' : sync.status === 'syncing' ? 'busy' : 'off'}">${st}</span></header>
            <form class="stack" data-form="save-sync" data-tour="sync-form">
              <label class="lbl-block" for="s-owner">حساب GitHub المالك</label><input id="s-owner" name="owner" dir="ltr" value="${c.owner || ''}" placeholder="اسم حساب المنظمة" required>
              <label class="lbl-block" for="s-repo">مستودع البيانات الخاص</label><input id="s-repo" name="repo" dir="ltr" value="${c.repo || 'nawah-data'}" required>
              <label class="lbl-block" for="s-key">مفتاح الوصول${sync.key() ? ' (محفوظ على هذا الجهاز، اتركه فارغا للإبقاء عليه)' : ''}</label><input id="s-key" name="key" dir="ltr" type="password" autocomplete="off"${sync.key() ? '' : raw(' required')}>
              <p class="field-err" role="alert"></p>
              <div class="row-btns">${btn('تحقق واحفظ', { type: 'submit', kind: 'primary', icon: 'check' })}${sync.enabled() ? btn('زامن الآن', { act: 'sync-now', kind: 'quiet', icon: 'sync' }) : ''}${sync.key() ? btn('احذف المفتاح من هذا الجهاز', { act: 'sync-forget', kind: 'quiet danger-text' }) : ''}</div>
            </form>
          </section>`}
          <section class="module"><header class="module-head"><h2>خطوات الإعداد بالضبط</h2></header>
            <p class="row-btns">${btn('صفحة إنشاء المستودع', { href: NEW_REPO_URL, kind: 'quiet', icon: 'git', cls: 'btn-small', external: true })}${btn('صفحة إنشاء المفتاح', { href: TOKEN_URL, kind: 'quiet', icon: 'shield', cls: 'btn-small', external: true })}</p>
            ${syncSteps(c.owner).map(([h, steps]) => html`<h3 class="step-h">${h}</h3><ol class="steps">${steps.map(t => html`<li>${t}</li>`)}</ol>`)}
          </section>
        </div>`,
      });
    }
    if (tab === 'data') {
      const imported = store.setting('content', {}).imported;
      return page({
        title: 'الإعدادات', tabs: t,
        body: html`<div class="data-grid">
          <section class="module" data-tour="import"><header class="module-head"><h2>استيراد</h2></header>
            <p>حزمة البداية الخاصة أو خطة المحتوى أو نسخة احتياطية. الاستيراد يضيف ويحدث ولا يحذف.</p>
            ${imported ? html`<p class="muted small">آخر استيراد: ${imported.title}، ${ago(imported.at)}</p>` : ''}
            ${edit ? html`<label class="btn btn-primary">${icon('upload')}<span>اختر ملفا</span><input type="file" accept=".json,application/json" data-change="import-any" hidden></label>` : ''}
          </section>
          <section class="module"><header class="module-head"><h2>نسخة احتياطية</h2></header>
            <p>ملف واحد فيه كل بيانات نواة على هذا الجهاز. احفظه في مكان آمن، فهو يحتوي بيانات الشركة.</p>
            ${btn('نزل نسخة احتياطية', { act: 'backup', icon: 'download', kind: 'quiet' })}
          </section>
          <section class="module"><header class="module-head"><h2>نسخة العرض</h2></header>
            <p>بيانات تجريبية منفصلة تماما لعرض النظام على أحد أو لتجربته، ولا تمس بياناتكم.</p>
            ${store.space === 'demo' ? btn('ارجع للنسخة الحقيقية', { act: 'leave-demo', kind: 'quiet' }) : btn('افتح نسخة العرض', { act: 'enter-demo', kind: 'quiet', icon: 'eye' })}
          </section>
          ${isAdmin() ? html`<section class="module danger"><header class="module-head"><h2>مسح بيانات هذا الجهاز</h2></header>
            <p>يمسح كل بيانات نواة من هذا المتصفح فقط. المستودع الخاص لا يتأثر، وتعود البيانات منه عند المزامنة.</p>
            ${btn('امسح من هذا الجهاز', { act: 'wipe-local', kind: 'quiet danger-text', icon: 'trash' })}
          </section>` : ''}
        </div>`,
      });
    }
    const co = settings.company();
    const sv = store.setting('services', { list: [], pending: true });
    return page({
      title: 'الإعدادات', tabs: t,
      body: html`<div class="split">
        <form class="module rec-form" data-form="save-company" data-tour="company-form">
          <header class="module-head"><h2>بيانات الشركة</h2></header>
          <fieldset${edit ? '' : raw(' disabled')}><div class="fields">
            ${[['name', 'الاسم الرسمي'], ['nameEn', 'الاسم بالإنجليزية', 'ltr'], ['parent', 'الشركة الأم'], ['cr', 'رقم السجل التجاري', 'ltr'], ['vat', 'الرقم الضريبي', 'ltr'], ['city', 'المدينة'], ['address', 'العنوان'], ['phone', 'رقم التواصل', 'ltr'], ['email', 'البريد الرسمي', 'ltr'], ['website', 'الموقع', 'ltr']].map(([k, l, d]) => html`<div class="field"><label for="c-${k}">${l}</label><input id="c-${k}" name="${k}" value="${co[k] || ''}"${d ? raw(` dir="${d}"`) : ''}></div>`)}
          </div></fieldset>
          ${edit ? btn('احفظ', { type: 'submit', kind: 'primary', icon: 'check' }) : ''}
        </form>
        <form class="module rec-form" data-form="save-services">
          <header class="module-head"><h2>قائمة الخدمات</h2></header>
          <p class="muted small">تظهر في الفرص والمشاريع. ${sv.pending ? 'القائمة الحالية مبدئية وتنتظر اعتماد الشريكين.' : ''}</p>
          <fieldset${edit ? '' : raw(' disabled')}>
            <textarea name="list" rows="7" aria-label="الخدمات، سطر لكل خدمة">${(sv.list || []).join('\n')}</textarea>
            <label class="switch"><input type="checkbox" name="pending"${sv.pending ? raw(' checked') : ''}><span>القائمة مبدئية ولم تعتمد بعد</span></label>
          </fieldset>
          ${edit ? btn('احفظ', { type: 'submit', kind: 'primary', icon: 'check' }) : ''}
        </form>
      </div>`,
    });
  },
});

onForm({
  'save-company': f => {
    const v = {};
    for (const el of f.querySelectorAll('input[name]')) v[el.name] = el.value.trim();
    store.saveSetting('company', { ...settings.company(), ...v });
    store.log('update', 'settings', { id: 'company', title: 'بيانات الشركة' });
    toast('حفظت بيانات الشركة');
  },
  'save-services': f => {
    store.saveSetting('services', { list: f.list.value.split('\n').map(s => s.trim()).filter(Boolean), pending: f.pending.checked });
    toast('حفظت قائمة الخدمات');
  },
  'save-sync': async f => {
    const err = f.querySelector('.field-err');
    const key = f.key.value.trim() || sync.key();
    const cfg = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: 'main', dir: 'data' };
    err.textContent = 'جار التحقق من المفتاح والمستودع';
    const res = await sync.check(cfg, key);
    if (!res.ok) { err.textContent = res.message; return; }
    cfg.branch = res.branch || 'main';
    sync.save(cfg, key);
    if (ctx.me && !ctx.me.github && res.login) store.patch('members', ctx.me.id, { github: res.login }, { log: false });
    err.textContent = '';
    toast(`تم الربط بـ ${res.repo}. تبدأ المزامنة الآن.`);
    ctx.refresh();
  },
  'save-role': f => {
    const id = f.dataset.id;
    const modules = Object.fromEntries(MODULES.map(m => [m.key, f[`m-${m.key}`].value]));
    const flags = Object.fromEntries(FLAGS.map(x => [x.key, f[`f-${x.key}`].checked]));
    const old = id ? store.get('roles', id) : {};
    store.put('roles', { ...(old || {}), ...(id ? { id } : {}), name: f.name.value.trim() || 'صلاحية', perms: f.admin.checked ? { admin: true } : { modules, flags } });
    closeDrawer();
    toast('حفظت الصلاحية');
  },
});

onAct({
  'sync-now': () => { sync.run(); toast('بدأت المزامنة'); },
  'sync-forget': async () => {
    if (!(await confirmBox('حذف المفتاح من هذا الجهاز؟', { ok: 'احذفه', danger: true, detail: 'تتوقف المزامنة على هذا الجهاز فقط، والبيانات تبقى هنا وفي المستودع.' }))) return;
    sync.forget();
    ctx.refresh();
  },
  'edit-role': el => {
    const role = el.dataset.id ? store.get('roles', el.dataset.id) : { name: '', perms: { modules: {}, flags: {} } };
    const used = el.dataset.id && members().some(m => m.role === el.dataset.id);
    drawer({
      title: role.id ? `صلاحية: ${role.name}` : 'صلاحية جديدة',
      wide: true,
      body: ROLE_FORM(role),
      foot: html`${btn('احفظ', { act: 'submit-role', kind: 'primary', icon: 'check' })}${role.id && !used && !role.builtin ? btn('حذف', { act: 'delete-record', kind: 'quiet danger-text', icon: 'trash', data: { col: 'roles', id: role.id } }) : ''}`,
    });
  },
  'submit-role': () => document.querySelector('#drawer form[data-form="save-role"]')?.requestSubmit(),
  backup: () => {
    download(`nawah-backup-${store.space}-${today()}.json`, JSON.stringify(store.exportAll()));
    toast('نزلت النسخة الاحتياطية. احفظها في مكان آمن.');
  },
  'wipe-local': async () => {
    if (!(await confirmBox('مسح كل بيانات نواة من هذا المتصفح؟', { ok: 'امسح', danger: true, detail: sync.enabled() ? 'المستودع الخاص لا يتأثر، وتعود البيانات منه عند فتح نواة والمزامنة.' : 'المزامنة غير مفعلة، فلن تعود البيانات إلا من نسخة احتياطية. نزل نسخة أولا.' }))) return;
    await store.wipe();
    local.del(`nawah.me.${store.space}`);
    location.reload();
  },
});
onChange({ 'import-any': el => { const f = el.files?.[0]; if (f) askImport(f); el.value = ''; } });

ctx.restoreBackup = async obj => {
  if (!(await confirmBox('استرجاع النسخة الاحتياطية؟', { ok: 'استرجع', detail: 'تدمج مع البيانات الحالية: الأحدث من كل عنصر يبقى، ولا يحذف شيء.' }))) return;
  try { const n = store.importBackup(obj); toast(`تم الاسترجاع في ${n} أقسام`); } catch (e) { toast(e.message); }
};

// ---------- the guide

const GUIDE = [
  { key: 'home', title: 'الرئيسية', steps: ['في المركز: ما يستحق عليك. الحلقة الداخلية لليوم والمتأخر، ثم الأسبوع، ثم بقية الشهر. اضغط أي نقطة لتفتحها.', 'بجانبها «مسؤولياتك اليوم» بالترتيب، وزر «تم» ينجز المهمة مباشرة، ويمكن التراجع من الرسالة.', 'تخفي أي بطاقة من «صفحتي»، «الرئيسية».'] },
  { key: 'tasks', title: 'المهام', steps: ['كل مهمة لها مسؤول وموعد وخطوات. «أضف مهمة» أعلى الصفحة، أو + من أي مكان.', 'في اللوحة اسحب البطاقة بين الأعمدة لتغيير حالتها.', 'المهام المتأخرة تظهر في الجرس وعلى الرئيسية حتى تنجز.'] },
  { key: 'calendar', title: 'التقويم', steps: ['المهام والمنشورات والاجتماعات والتأسيس والفرص وتسليمات المشاريع والمناسبات في شهر واحد.', 'اسحب أي عنصر إلى يوم آخر لتغيير موعده، و+ في أي يوم تضيف مهمة فيه.'] },
  { key: 'approvals', title: 'الموافقات', steps: ['يظهر هنا ما ينتظر اعتمادك: منشورات وقرارات مقترحة وعروض أسعار.', 'تراجع الحمولة كما ستخرج حرفيا. المنشور يحتاج إكمال فحص الهوية قبل «اعتمد وجدول».', 'الإعادة للتعديل تحتاج ملاحظة تصل لصاحب العمل.'] },
  { key: 'clients', title: 'العملاء والفرص', steps: ['الفرصة تتحرك بين المراحل حتى «تم التعاقد» أو «لم تكتمل» مع السبب.', 'عند التعاقد تعرض نواة إنشاء المشروع مباشرة.', 'ملف العميل يجمع فرصه ومشاريعه وعروضه وما نعرفه عنه، ومنه تبدأ «موجز عميل».'] },
  { key: 'projects', title: 'المشاريع', steps: ['المشروع له مراحل وتسليمات بمواعيد، والتقدم يحسب من التسليمات المكتملة.', 'من داخل المشروع: «تقرير حالة» للطباعة، و«قائمة إطلاق موقع» تضاف كمهمة بخطواتها.'] },
  { key: 'finance', title: 'العروض والفواتير', steps: ['عرض السعر مسودة، ثم «أرسل للاعتماد»، ثم بعد الاعتماد «علمه كمرسل»، ثم «تم القبول».', 'العرض المقبول يتحول إلى فاتورة بضغطة، و«تم الدفع» عند التحصيل.', 'الفاتورة الضريبية الرسمية تصدر من نظام فوترة متوافق مع هيئة الزكاة والضريبة. هنا متابعة داخلية ونسخة مطبوعة نظيفة.'] },
  { key: 'setup', title: 'تأسيس الشركة', steps: ['قائمة أولية بمحاور التأسيس وروابط الجهات الرسمية. غير الحالة من القائمة مباشرة.', 'راجع القائمة مع المحاسب أو المستشار، وأضف ما يخص وضع تم.'] },
  { key: 'team', title: 'الفريق', steps: ['أضف العضو وحدد صلاحيته. اسم المستخدم في GitHub يربطه بالمزامنة.', '«السعة» تعرض حمل كل عضو لثمانية أسابيع قبل قبول أي التزام جديد.'] },
  { key: 'content', title: 'المحتوى والنشر', steps: ['استورد خطة المحتوى فتتوزع المنشورات من يوم الإطلاق، أو أضف منشورا.', 'المراحل: فكرة، كتابة، تصميم، مراجعة، مجدول، منشور. الجدولة تحتاج اعتماد شريك.', 'من المنشور: «انسخ النص» ينسخه مع الوسوم للنشر، وعداد الحروف ينبه إذا تجاوز حد المنصة.', 'بعد النشر سجل النتائج من نافذة المنشور، وتظهر في تقرير المحتوى.'] },
  { key: 'accounts', title: 'حسابات المنصات', steps: ['لكل منصة خطوات الإنشاء بالضبط والمقاسات وصفحة المساعدة الرسمية. علم الخطوات وأنت تنفذ.', 'لا تكتب كلمات المرور هنا. فعل التحقق بخطوتين، وأضف شريكا ثانيا مديرا.'] },
  { key: 'brand', title: 'الهوية والصوت', steps: ['المرجع الواحد للألوان والخطوط وقواعد الكتابة والعبارات الممنوعة.'] },
  { key: 'weekly', title: 'الوقفة الأسبوعية', steps: ['الأحد: ثلاث أولويات لكل عضو بمخرج ملموس، وما ليس هذا الأسبوع. المتبقي من الأسبوع الماضي تحمله أو تسقطه بوعي.', 'الخميس: ثلاثة إنجازات، ودرس بصيغة قاعدة يحفظ في المعرفة، والعوائق، وأولوية الأسبوع القادم.', '«التقرير» صفحة واحدة للطباعة بالأرقام مقابل الأسبوع الماضي.'] },
  { key: 'knowledge', title: 'المعرفة', steps: ['التقط أي معلومة قبل أن تتبخر، وعنوانها السؤال الذي سيبحث عنه أحد لاحقا.', 'كل معلومة بمصدرها. المعلومة بلا مصدر عليها علامة حتى يضاف.', 'السري يوسم «سري» ولا يلصق في أدوات غير معتمدة.'] },
  { key: 'decisions', title: 'القرارات', steps: ['سجل أي قرار خلال 24 ساعة بصياغة قابلة للتنفيذ ومالك واحد. الرقم يتولد تلقائيا.', 'قرار العضو غير الشريك يبدأ مقترحا حتى يعتمده شريك.'] },
  { key: 'meetings', title: 'الاجتماعات والمحاضر', steps: ['افرز الاجتماع إلى: الخلاصة، القرارات، المهام بأصحابها ومواعيدها، المعلومات، المعلق.', '«حول إلى مهام» ينشئ المهام فعلا، و«سجل القرارات» يضيفها لسجل القرارات.'] },
  { key: 'skills', title: 'المهارات والوكلاء', steps: ['كل مهارة إجراء موثق بخطواته وحدوده. «ابدأ» يفتح المكان الصحيح لتنفيذها هنا.', 'أي عمل يتكرر ثلاث مرات يتحول إلى مهارة جديدة.'] },
  { key: 'log', title: 'سجل التغييرات', steps: ['كل تغيير بمن فعله ومتى. المحذوف يمكن استرجاعه من هنا.'] },
  { key: 'settings', title: 'الإعدادات', steps: ['الشركة: البيانات الرسمية التي تظهر في العروض.', 'الصلاحيات: مستوى لكل قسم وصلاحيات إضافية.', 'المزامنة: ربط المستودع الخاص بخطوات مكتوبة بالضبط.', 'البيانات: الاستيراد والنسخة الاحتياطية ونسخة العرض.'] },
];

const TRADE_GUIDE = [
  { key: 'market', title: 'السوق والتحليل', steps: ['اختر الرمز والإطار الزمني. العملات الرقمية تأتي من Binance مباشرة، والعملات والذهب والفضة تحتاج مفتاح Twelve Data المجاني من «إعدادات التداول».', 'الحكم في الأعلى نسبة اتفاق المدارس على اتجاه واحد، وليس احتمال ربح. تحته الخطة: الدخول والوقف والأهداف ونسبة العائد إلى المخاطرة، ومتى تبطل.', 'في «خيارات ثنائية» يظهر الاتجاه ومدد الانتهاء المقترحة، ونسبة النجاح اللازمة للتعادل حسب عائد منصتك.', 'لكل مدرسة سطر بحكمها وسببها، و«اشرح هذه المدرسة» يفتح شرحها في المكتبة. أزرار الطبقات فوق الشارت تظهر المستويات والمناطق والمؤشرات أو تخفيها.', 'زر «المصدر» يغير مصدر البيانات أو يستورد ملف CSV من منصتك.'] },
  { key: 'xnawah', title: 'إكس نواة', steps: ['اكتب سؤالك كما تقوله: حلل الذهب على الساعة، قارن اليورو والباوند، ما هو نموذج الرأس والكتفين، احسب اللوت لرصيد 1000 ووقف 30 نقطة.', 'يجيب من محرك التحليل والمكتبة داخل نواة، ويتذكر سياق المحادثة: بعد تحليل رمز اسأل «وعلى الأربع ساعات؟».', 'الصق نص توصية ليقرأها ويقيمها: الرمز والاتجاه والوقف والأهداف ونسبة العائد وما ينقصها.', 'الإجابة الحرة اختيارية من «إعدادات التداول»: خدمة خارجية تكتب الرد بأسلوب المحادثة من أرقام المحرك، والبطاقات والأرقام تبقى من المحرك.'] },
  { key: 'signals', title: 'التوصيات والقنوات', steps: ['اربط بوتك من تبويب «الربط» بالخطوات المكتوبة، فتصل منشورات القنوات التي البوت مشرف فيها وما تحوله أنت إليه.', 'كل توصية تقرأ تلقائيا، و«تحقق بالأسعار» يراجعها على الأسعار الفعلية بعد نشرها: هل لمست الهدف الأول قبل الوقف.', 'تبويب «الأداء» يضع ما أعلنته القناة بجانب ما حدث فعلا، ويعد التوصيات المعدلة بعد النشر والمحذوفة.', 'لنقل التوصيات إلى قنواتك أضف القناة هدفا من تبويب «القنوات»، واختر النقل اليدوي أو التلقائي وصيغة الكتابة.', 'لقنوات لا تملكها على مدار الساعة استخدم برنامج النسخ المشروح في تبويب «الربط».'] },
  { key: 'library', title: 'المكتبة', steps: ['مدارس التحليل الفني ونماذجه وحيله، لكل منها شرح ورسم وطريقة تداول وأخطاء شائعة.', 'ابحث بالاسم العربي أو الإنجليزي أو اختر مدرسة. علامة «تلقائي» تعني أن نواة تكتشفه على الشارت.'] },
  { key: 'risk', title: 'المخاطرة والحسابات', steps: ['حجم الصفقة من رصيدك ونسبة المخاطرة ومسافة الوقف، مع الخسارة الفعلية بعد تقريب اللوت.', 'حاسبة الخيارات الثنائية ونسبة التعادل، وحاسبة المضاعفة تبين ما تخسره إذا خسرت كل الخطوات.', 'التوقع الرياضي ومعيار كيلي، وكم تحتاج من ربح لتعويض خسارة.'] },
  { key: 'journal', title: 'يوميات التداول', steps: ['سجل كل صفقة بسببها وخطتها ونتيجتها وحالتك. زر «سجلها في اليوميات» في صفحة السوق يملأ أغلبها.', 'الإحصاءات تحسب نسبة النجاح ومتوسط العائد بوحدة المخاطرة وأقصى تراجع، وتوزع النتائج حسب الإعداد والرمز واليوم.'] },
  { key: 'tsettings', title: 'إعدادات التداول', steps: ['مفتاح Twelve Data ورمز البوت يحفظان على هذا الجهاز فقط ولا يزامنان.', 'اختر التوقيت الذي تقرأ به الشارت، والمظهر الليلي أو النهاري.', 'مزامنة بيانات التداول اختيارية إلى مستودع خاص بك، والنسخة الاحتياطية ملف تحفظه بنفسك.'] },
];

register('help', {
  label: 'الدليل', icon: 'help', aka: 'مساعدة شرح كيف دليل الاستخدام',
  render() {
    const trade = TRADE_GUIDE.filter(g => canOpen(g.key));
    const company = GUIDE.filter(g => canOpen(g.key));
    const list = document.documentElement.dataset.mode === 'trade' ? [...trade, ...company] : [...company, ...trade];
    return page({
      title: 'الدليل',
      sub: 'شرح قصير لكل قسم يخص عملك. ابحث عن أي شيء بالضغط على / من أي صفحة.',
      body: html`<nav class="filters" aria-label="أقسام الدليل">${list.map(g => html`<a class="chip-toggle" href="#/help" data-act="scroll-to" data-target="g-${g.key}">${g.title}</a>`)}</nav>
        <section class="guide-part" id="g-privacy"><h2>الخصوصية والمزامنة</h2><ol class="steps"><li>رابط نواة عام لأنه على GitHub Pages، لذلك لا يحتوي أي بيانات للشركة.</li><li>البيانات تحفظ في متصفحك أولا وتعمل دون اتصال، وتنتقل بين الشركاء عبر مستودع GitHub خاص بمفتاح لكل جهاز.</li><li>كلمات المرور والمفاتيح لا تكتب في نواة أبدا.</li>${trade.length ? html`<li>بيانات التداول شخصية لكل عضو على جهازه ولا تظهر لباقي الفريق. مفتاح الأسعار ورمز البوت ومفتاح الإجابة الحرة تبقى في متصفح الجهاز ولا تزامن.</li>` : ''}</ol></section>
        ${list.map(g => html`<section class="guide-part" id="g-${g.key}"><h2>${icon(SECTIONS[g.key]?.icon || 'help')}${g.title}</h2><ol class="steps">${g.steps.map(s => html`<li>${s}</li>`)}</ol>${btn('افتح القسم', { href: `#/${g.key}`, kind: 'quiet', cls: 'btn-small' })}</section>`)}`,
    });
  },
});
onAct({ 'scroll-to': el => document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) });

// ---------- my page

const CHOICES = {
  theme: [['light', 'فاتح'], ['dark', 'داكن'], ['auto', 'حسب الجهاز']],
  accent: [['mint', 'نعناعي'], ['teal', 'زيتي'], ['blue', 'أزرق'], ['violet', 'بنفسجي'], ['rose', 'وردي'], ['slate', 'رصاصي']],
  side: [['paper', 'فاتحة'], ['deep', 'عميقة']],
  size: [['normal', 'عادي'], ['large', 'كبير'], ['xl', 'كبير جدا']],
  density: [['comfortable', 'مريحة'], ['compact', 'مضغوطة']],
  motion: [['on', 'تعمل'], ['off', 'متوقفة']],
};
const CHOICE_LABELS = { theme: 'الوضع', accent: 'اللون المميز', side: 'القائمة الجانبية', size: 'حجم الخط', density: 'المسافات', motion: 'الحركة' };

register('me', {
  label: 'صفحتي', icon: 'me', aka: 'حسابي تفضيلات الشكل الوضع الداكن رمز سري',
  render() {
    const me = ctx.me;
    const p = { theme: 'light', accent: 'mint', side: 'paper', size: 'normal', density: 'comfortable', motion: 'on', hide: [], ...(me.prefs || {}) };
    const mine = store.all('tasks').filter(t => (t.assignees || []).includes(me.id) && open(t));
    return page({
      title: 'صفحتي',
      sub: me.title || '',
      body: html`<div class="split">
        <form class="module rec-form" data-form="save-me">
          <header class="module-head"><h2>ملفي في نواة</h2></header>
          <div class="fields">
            <div class="field"><label for="me-name">الاسم</label><input id="me-name" name="name" value="${me.name}" required></div>
            <div class="field"><label for="me-title">الدور</label><input id="me-title" name="title" value="${me.title || ''}"></div>
            <div class="field"><label for="me-gh">اسم المستخدم في GitHub</label><input id="me-gh" name="github" dir="ltr" value="${me.github || ''}"></div>
            <div class="field"><label for="me-out">طريقة الإخراج المفضلة</label><select id="me-out" name="output"><option value="brief"${me.output !== 'detail' ? raw(' selected') : ''}>مختصر تنفيذي</option><option value="detail"${me.output === 'detail' ? raw(' selected') : ''}>تفصيلي</option></select></div>
            <div class="field wide"><label for="me-tone">كيف تحب أن نكلمك</label><textarea id="me-tone" name="tone" rows="2" placeholder="مثال: الخلاصة أولا، ثم القرارات المطلوبة">${me.tone || ''}</textarea></div>
            <div class="field wide"><label for="me-now">أعمل حاليا على</label><textarea id="me-now" name="now" rows="2">${me.now || ''}</textarea></div>
          </div>
          ${btn('احفظ', { type: 'submit', kind: 'primary', icon: 'check' })}
          <p class="muted small">${mine.length ? `عليك ${count(mine.length, FORMS.openTask)}.` : 'لا مهام مفتوحة عليك.'} ${btn('افتح مهامي', { href: '#/tasks?who=mine', kind: 'quiet', cls: 'btn-small' })}</p>
        </form>
        <section class="module">
          <header class="module-head"><h2>الشكل</h2></header>
          <div class="prefs">${Object.entries(CHOICES).map(([k, opts]) => html`<div class="pref"><span>${CHOICE_LABELS[k]}</span><div class="seg" role="group" aria-label="${CHOICE_LABELS[k]}">${opts.map(([v, l]) => html`<button type="button" class="${p[k] === v ? 'on' : ''}${k === 'accent' ? ' acc acc-' + v : ''}" data-act="set-pref" data-k="${k}" data-v="${v}" aria-pressed="${p[k] === v}">${l}</button>`)}</div></div>`)}</div>
          <h3 class="step-h">بطاقات الرئيسية</h3>
          <div class="chips">${HOME_BLOCKS.map(([k, l]) => html`<label class="chip-check"><input type="checkbox" data-change="home-block" value="${k}"${(p.hide || []).includes(k) ? '' : raw(' checked')}><span>${l}</span></label>`)}</div>
          <h3 class="step-h">الرمز السري</h3>
          <p class="muted small">يطلب عند فتح نواة على أي جهاز. يحمي من فتح عابر لا من اختراق، والبيانات نفسها على جهازك.</p>
          <div class="row-btns">${btn(me.pin ? 'غير الرمز' : 'ضع رمزا سريا', { act: 'set-pin', kind: 'quiet', icon: 'lock' })}${me.pin ? btn('أزل الرمز', { act: 'clear-pin', kind: 'quiet danger-text' }) : ''}</div>
        </section>
      </div>`,
    });
  },
});

onForm({
  'save-me': f => {
    ctx.me = store.patch('members', ctx.me.id, { name: f.name.value.trim() || ctx.me.name, title: f.title.value.trim(), github: f.github.value.trim().replace(/^@/, ''), output: f.output.value, tone: f.tone.value.trim(), now: f.now.value.trim() });
    toast('حفظ ملفك');
  },
  'pin-form': async f => {
    if (f.pin.value.length < 4) { f.querySelector('.field-err').textContent = 'أربعة أرقام على الأقل'; return; }
    if (f.pin.value !== f.pin2.value) { f.querySelector('.field-err').textContent = 'الرمزان غير متطابقين'; return; }
    const { hashPin } = await import('../app.js');
    ctx.me = store.patch('members', ctx.me.id, { pin: await hashPin(f.pin.value, ctx.me.id) }, { log: false });
    sessionStorage.setItem('nawah.unlocked', ctx.me.id);
    closeModal();
    toast('وضع الرمز السري');
  },
});
onAct({
  'set-pref': async el => { const { savePrefs } = await import('../app.js'); savePrefs({ [el.dataset.k]: el.dataset.v }); ctx.refresh(); },
  'set-pin': () => modal({ title: 'الرمز السري', body: html`<form data-form="pin-form" class="stack"><label class="lbl-block" for="pin1">الرمز (أرقام)</label><input id="pin1" name="pin" type="password" inputmode="numeric" autocomplete="new-password" required><label class="lbl-block" for="pin2">أعد كتابته</label><input id="pin2" name="pin2" type="password" inputmode="numeric" autocomplete="new-password" required><p class="field-err" role="alert"></p></form>`, actions: html`${btn('احفظ', { act: 'submit-pin', kind: 'primary' })}${btn('إلغاء', { act: 'close-modal', kind: 'quiet' })}` }),
  'submit-pin': () => document.querySelector('#modal form[data-form="pin-form"]')?.requestSubmit(),
  'clear-pin': () => { ctx.me = store.patch('members', ctx.me.id, { pin: null }, { log: false }); toast('أزيل الرمز'); },
});
onChange({
  'home-block': el => {
    const hide = new Set((ctx.me.prefs || {}).hide || []);
    if (el.checked) hide.delete(el.value); else hide.add(el.value);
    ctx.me = store.patch('members', ctx.me.id, { prefs: { ...(ctx.me.prefs || {}), hide: [...hide] } }, { log: false });
  },
});
