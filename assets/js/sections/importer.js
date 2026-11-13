// Imports a content plan or the private starter pack into this browser (and from here to
// the private data repository). Fixed ids make a second import update, never duplicate.
import { html } from '../core/html.js';
import { store } from '../core/store.js';
import { ctx } from '../core/ctx.js';
import { modal, closeModal, btn, toast } from '../core/ui.js';
import { onAct, onForm } from '../core/actions.js';
import { addDays, today, readFile, weekStart, count, FORMS } from '../core/util.js';
import { PLATFORMS } from '../core/icons.js';

const FORMATS = ['carousel', 'reel', 'image', 'video', 'thread', 'story', 'article', 'text', 'poll', 'live'];
const nextSunday = () => { const s = weekStart(today()); return s <= today() ? addDays(s, 7) : s; };

export function importPlan(plan, { start, replacePillars = true }) {
  if (!plan || plan.kind !== 'nawah-content-plan' || !Array.isArray(plan.posts)) throw new Error('هذا الملف ليس خطة محتوى من نواة');
  const content = store.setting('content', { pillars: [], platforms: [] });
  const pillars = (plan.pillars || []).filter(p => p.key && p.label).map(p => ({ key: p.key, label: p.label, share: Number(p.share) || 0, description: p.description || '' }));
  store.saveSetting('content', {
    ...content,
    pillars: replacePillars && pillars.length ? pillars : content.pillars,
    platforms: (plan.platforms || []).filter(p => PLATFORMS[p.key]).map(p => ({ key: p.key, priority: p.priority, role: p.role || '', cadence: p.cadence || '', bestTimes: p.bestTimes || '' })),
    occasions: (plan.occasions || []).filter(o => o.date && o.label),
    imported: { at: Date.now(), title: plan.title || 'خطة المحتوى', start, by: ctx.me?.id || '' },
  });
  let posts = 0;
  for (const p of plan.posts) {
    if (!p || !p.title) continue;
    const id = `post-plan-${p.day}-${String(p.time || '').replace(':', '')}`;
    const old = store.get('posts', id);
    if (old && ['scheduled', 'published'].includes(old.status)) continue;
    store.put('posts', {
      ...(old || {}),
      id,
      title: p.title,
      caption: p.caption || '',
      visual: p.visual || '',
      cta: p.cta || '',
      hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
      platforms: (p.platforms || []).filter(k => PLATFORMS[k]),
      format: FORMATS.includes(p.format) ? p.format : 'image',
      pillar: p.pillar || '',
      date: addDays(start, (Number(p.day) || 1) - 1),
      time: p.time || '',
      status: old?.status || (p.caption ? 'design' : 'idea'),
      needsApproval: true,
      clientApproval: !!p.needsApproval,
      notes: p.notes || '',
      owner: old?.owner || '',
      fromPlan: true,
    }, { log: false });
    posts++;
  }
  let accounts = 0;
  for (const a of plan.accounts || []) {
    if (!PLATFORMS[a.platform]) continue;
    const id = `acc-${a.platform}`;
    const old = store.get('accounts', id);
    const done = new Set((old?.steps || []).filter(s => s.done).map(s => s.t));
    store.put('accounts', {
      ...(old || {}),
      id,
      platform: a.platform,
      status: old?.status || 'planned',
      handleIdeas: a.handleIdeas || [],
      steps: (a.steps || []).map(t => ({ t, done: done.has(t) })),
      specs: a.specs || old?.specs || '',
      helpUrl: a.helpUrl || old?.helpUrl || '',
    }, { log: false });
    accounts++;
  }
  store.log('import', 'posts', { id: 'plan', title: plan.title || 'خطة المحتوى' });
  return { posts, accounts };
}

export function importStarter(pack, opts) {
  if (!pack || pack.kind !== 'nawah-starter') throw new Error('هذا الملف ليس حزمة بداية من نواة');
  const counts = {};
  for (const col of ['knowledge', 'decisions', 'tasks', 'setup', 'skills', 'clients', 'projects']) {
    for (const r of pack[col] || []) {
      if (!r.id) continue;
      const old = store.get(col, r.id);
      // a record someone edited after the last import (or after it was seeded) keeps their edits
      const untouched = old && (old.starter ? (old.updatedAt || 0) <= (old.importedAt || 0) + 2000 : old.seed ? (old.updatedAt || 0) <= (old.createdAt || 0) + 2000 : false);
      if (old && !untouched) continue;
      store.put(col, { ...(old || {}), ...r, starter: true, importedAt: Date.now() }, { log: false });
      counts[col] = (counts[col] || 0) + 1;
    }
  }
  for (const [id, value] of Object.entries(pack.settings || {})) {
    store.saveSetting(id, { ...store.setting(id, {}), ...value });
  }
  let plan = { posts: 0, accounts: 0 };
  if (pack.plan) plan = importPlan(pack.plan, opts);
  store.log('import', 'knowledge', { id: 'starter', title: pack.title || 'حزمة البداية' });
  return { ...counts, ...plan };
}

let pending = null;
export function askImport(file) {
  readFile(file).then(text => {
    let obj;
    try { obj = JSON.parse(text); } catch (_) { toast('الملف غير صالح'); return; }
    if (obj.kind === 'nawah-backup') { ctx.restoreBackup?.(obj); return; }
    if (!['nawah-content-plan', 'nawah-starter'].includes(obj.kind)) { toast('هذا الملف ليس من ملفات نواة'); return; }
    pending = obj;
    const plan = obj.kind === 'nawah-starter' ? obj.plan : obj;
    modal({
      title: obj.kind === 'nawah-starter' ? 'استيراد حزمة البداية' : 'استيراد خطة المحتوى',
      body: html`<form data-form="do-import" class="stack">
        <p>${obj.title || ''}</p>
        ${plan ? html`<label class="lbl-block" for="imp-start">يوم الإطلاق (اليوم الأول في التقويم)</label>
        <input id="imp-start" type="date" name="start" value="${nextSunday()}" required>
        <p class="muted small">${count(plan.posts?.length || 0, FORMS.post, { zero: 'لا منشورات' })} في الخطة، تتوزع على التقويم ابتداء من هذا اليوم. يمكن تغيير أي موعد لاحقا بالسحب.</p>
        <label class="switch"><input type="checkbox" name="pillars" checked><span>استخدم محاور المحتوى الموجودة في الخطة</span></label>` : ''}
        <p class="muted small">الاستيراد يضيف ويحدث ولا يحذف شيئا. المنشورات المجدولة أو المنشورة لا تتغير.</p>
      </form>`,
      actions: html`${btn('استورد', { act: 'submit-import', kind: 'primary', icon: 'upload' })}${btn('إلغاء', { act: 'close-modal', kind: 'quiet' })}`,
    });
  });
}

onAct({ 'submit-import': () => document.querySelector('#modal form[data-form="do-import"]')?.requestSubmit() });
onForm({
  'do-import': f => {
    if (!pending) return;
    const opts = { start: f.start?.value || nextSunday(), replacePillars: !!f.pillars?.checked };
    try {
      const res = pending.kind === 'nawah-starter' ? importStarter(pending, opts) : importPlan(pending, opts);
      closeModal();
      const parts = [];
      const forms = { posts: FORMS.post, accounts: FORMS.account, knowledge: FORMS.info, decisions: FORMS.decision, tasks: FORMS.task, setup: FORMS.setupStep, skills: FORMS.skill, clients: FORMS.client, projects: FORMS.project };
      for (const [k, f] of Object.entries(forms)) if (res[k]) parts.push(count(res[k], f));
      toast(`تم الاستيراد: ${parts.join('، ') || 'لا جديد'}`, { ms: 6000 });
      pending = null;
      ctx.refresh();
    } catch (e) { toast(e.message); }
  },
});
