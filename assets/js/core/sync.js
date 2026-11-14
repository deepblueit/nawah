// Sharing between the partners through a PRIVATE GitHub repository.
// Each collection is one JSON file (data/<collection>.json). A sync reads what changed,
// merges record by record (the newer edit wins) and writes back with the file's sha,
// so two devices never overwrite each other. Every save is a commit: a full history.
// The access key stays on this device only and is never written into the data.

import { store, COLLECTIONS, mergeRecords, serialize } from './store.js';
import { local } from './util.js';

const API = 'https://api.github.com';
const CFG = 'nawah.sync';
const KEY = 'nawah.sync.key';

const b64 = str => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = b => {
  const bin = atob(String(b).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

// On GitHub Pages the site address names the organisation: <owner>.github.io/nawah/
export const pagesOwner = () => {
  try { const h = location.hostname; return h.endsWith('.github.io') ? h.split('.')[0] : ''; } catch (_) { return ''; }
};
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
export const NEW_REPO_URL = 'https://github.com/new';

// The exact clicks, written for whoever sets this up for the first time.
export const syncSteps = (owner = pagesOwner()) => {
  const org = owner || 'حساب المنظمة';
  return [
    ['أنشئ مستودع البيانات الخاص، مرة واحدة', ['افتح github.com وسجل الدخول.', 'اضغط علامة + أعلى الصفحة، ثم New repository.', `في Owner اختر ${org}، وفي Repository name اكتب nawah-data.`, 'اختر Private. هذا إلزامي، فنواة ترفض المزامنة مع مستودع عام.', 'فعل Add a README file، ثم اضغط Create repository.']],
    ['أنشئ مفتاح وصول لهذا الجهاز', ['اضغط صورتك أعلى الصفحة، ثم Settings.', 'من آخر القائمة الجانبية اضغط Developer settings، ثم Personal access tokens، ثم Fine-grained tokens.', 'اضغط Generate new token. في Token name اكتب اسما يعرف بالجهاز، مثل nawah-laptop.', 'في Expiration اختر مدة، مثل 90 يوما. عند انتهائها ينشأ مفتاح جديد بالخطوات نفسها.', `في Resource owner اختر ${org}.`, 'في Repository access اختر Only select repositories، ثم nawah-data وحده.', 'من Permissions افتح Repository permissions، واجعل Contents على Read and write.', 'اضغط Generate token، وانسخ المفتاح فورا لأنه لا يظهر مرة أخرى.']],
    ['إذا طلب GitHub موافقة المنظمة', [`من صفحة المنظمة ${org} افتح Settings.`, 'من القائمة الجانبية افتح Personal access tokens، ثم Pending requests، ووافق على الطلب.', 'إذا كانت المفاتيح الدقيقة غير مسموحة أصلا، فعلها من Personal access tokens ثم Settings.']],
    ['اربط نواة', ['الصق اسم الحساب واسم المستودع والمفتاح في النموذج، ثم اضغط «تحقق واحفظ».', 'كل شريك ينشئ مفتاحا على جهازه، ثم يختار «انضم لبيانات فريقك» عند أول فتح.']],
  ];
};

class SyncError extends Error {
  constructor(message, { offline = false, status = 0 } = {}) { super(message); this.offline = offline; this.status = status; }
}

function explain(status, body = {}) {
  const msg = String(body.message || '');
  if (status === 401) return 'مفتاح GitHub غير صالح أو انتهت صلاحيته. أنشئ مفتاحا جديدا من إعدادات GitHub.';
  if (status === 403 && /rate limit/i.test(msg)) return 'وصلت حد الطلبات المسموح في GitHub. ستعود المزامنة تلقائيا بعد قليل.';
  if (status === 403) return 'المفتاح لا يملك صلاحية الكتابة. فعل صلاحية Contents: Read and write للمستودع.';
  if (status === 404) return 'لم يتم العثور على المستودع. تأكد من اسم الحساب واسم المستودع وأن المفتاح يصل إليه.';
  if (status === 422) return 'رفض GitHub الحفظ. أعد المحاولة بعد قليل.';
  return `خطأ من GitHub (${status}) ${msg}`.trim();
}

// One factory serves the company data (nawah-data) and, when enabled, the personal
// trading data in its own private repository.
export function createSync({ store, collections, cfgKey, keyKey, repo = 'nawah-data', spaces = ['real'], what = 'بيانات الشركة', sharedKeyFrom = null }) {
  const spaceOk = typeof spaces === 'function' ? spaces : s => spaces.includes(s);
  const self = {
  store,
  collections,
  status: 'off',
  error: '',
  lastSync: 0,
  login: '',
  listeners: new Set(),
  running: null,
  timer: null,
  loop: null,

  config() { return { owner: pagesOwner(), repo, branch: 'main', dir: 'data', shareKey: false, ...local.get(cfgKey, {}) }; },
  key() { const own = local.get(keyKey, ''); if (own) return own; return this.config().shareKey && sharedKeyFrom ? sharedKeyFrom() : ''; },
  save(cfg, key) {
    local.set(cfgKey, { owner: cfg.owner.trim(), repo: cfg.repo.trim(), branch: (cfg.branch || 'main').trim(), dir: (cfg.dir || 'data').trim(), shareKey: !!cfg.shareKey });
    if (key) local.set(keyKey, key.trim());
    this.store.setMeta('shas', {});
    this.start();
  },
  forget() {
    local.del(keyKey);
    this.set('off');
  },
  enabled() {
    const c = this.config();
    return spaceOk(this.store.space) && !!(c.owner && c.repo && this.key());
  },

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  set(status, error = '') {
    this.status = status;
    this.error = error;
    for (const fn of this.listeners) { try { fn(this); } catch (e) { console.error(e); } }
  },

  async api(path, { method = 'GET', body, accept, key } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${key || this.key()}`,
          Accept: accept || 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (_) {
      throw new SyncError('لا يوجد اتصال بالإنترنت. التعديلات محفوظة على هذا الجهاز وستنتقل عند عودة الاتصال.', { offline: true });
    }
    return res;
  },

  // Checks the key and the repository before saving the settings.
  async check(cfg, key) {
    const u = await this.api('/user', { key });
    if (!u.ok) return { ok: false, message: explain(u.status, await u.json().catch(() => ({}))) };
    const user = await u.json();
    const r = await this.api(`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { key });
    if (!r.ok) return { ok: false, message: explain(r.status, await r.json().catch(() => ({}))) };
    const repo = await r.json();
    if (!repo.private) {
      return { ok: false, message: `هذا المستودع عام، وأي شخص يستطيع قراءة ${what} منه. اجعله خاصا (Private) من إعداداته أولا ثم أعد المحاولة.` };
    }
    return { ok: true, login: user.login, repo: repo.full_name, branch: repo.default_branch };
  },

  path(col) {
    const c = this.config();
    return `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.dir}/${col}.json`;
  },

  async readFile(col) {
    const c = this.config();
    const res = await this.api(`${this.path(col)}?ref=${encodeURIComponent(c.branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new SyncError(explain(res.status, await res.json().catch(() => ({}))), { status: res.status });
    const meta = await res.json();
    let text;
    if (meta.encoding === 'base64' && meta.content) text = unb64(meta.content);
    else {
      const rawRes = await this.api(`${this.path(col)}?ref=${encodeURIComponent(c.branch)}`, { accept: 'application/vnd.github.raw+json' });
      if (!rawRes.ok) throw new SyncError(explain(rawRes.status), { status: rawRes.status });
      text = await rawRes.text();
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { throw new SyncError(`ملف ${col}.json في المستودع تالف ولا يمكن قراءته.`); }
    return { sha: meta.sha, records: Array.isArray(parsed.records) ? parsed.records : [] };
  },

  async writeFile(col, records, sha) {
    const c = this.config();
    const who = this.store.me?.name ? ` (${this.store.me.name})` : '';
    const res = await this.api(this.path(col), {
      method: 'PUT',
      body: { message: `Update ${col}${who}`, content: b64(serialize(col, records)), branch: c.branch, ...(sha ? { sha } : {}) },
    });
    if (res.ok) { const j = await res.json(); return { ok: true, sha: j.content?.sha }; }
    if (res.status === 409 || res.status === 422) return { ok: false, conflict: true };
    return { ok: false, error: new SyncError(explain(res.status, await res.json().catch(() => ({}))), { status: res.status }) };
  },

  remember(col, sha) {
    const shas = { ...(this.store.meta.shas || {}) };
    if (sha) shas[col] = sha; else delete shas[col];
    this.store.setMeta('shas', shas);
  },

  async syncCol(col, rsha, known) {
    const rev = this.store.rev?.[col] || 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      let remote = null;
      let sha = rsha;
      if (rsha && (rsha !== known || attempt > 0)) {
        const f = await this.readFile(col);
        remote = f ? f.records : [];
        sha = f ? f.sha : null;
      }
      let merged;
      let changedLocal = false;
      let changedRemote;
      if (remote === null) {
        merged = this.store.raw(col);
        changedRemote = this.store.isDirty(col) || (!sha && merged.length > 0);
      } else {
        ({ merged, changedLocal, changedRemote } = mergeRecords(this.store.raw(col), remote, col));
      }
      if (changedLocal) this.store.replace(col, merged, { source: 'sync' });
      if (!sha && merged.length) changedRemote = true;
      if (!changedRemote) {
        this.remember(col, sha);
        if ((this.store.rev?.[col] || 0) === rev) this.store.clearDirty(col);
        return;
      }
      const res = await this.writeFile(col, merged, sha);
      if (res.ok) {
        this.remember(col, res.sha);
        if ((this.store.rev?.[col] || 0) === rev) this.store.clearDirty(col);
        return;
      }
      if (!res.conflict) throw res.error;
      rsha = rsha || 'conflict';
    }
    throw new SyncError('تعذر الحفظ في المستودع بعد عدة محاولات. ستعاد المحاولة تلقائيا.');
  },

  async runOnce() {
    const c = this.config();
    this.set('syncing');
    const list = await this.api(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.dir}?ref=${encodeURIComponent(c.branch)}`);
    const remote = {};
    if (list.status === 404) { /* no data folder yet: the first sync creates it */ }
    else if (!list.ok) throw new SyncError(explain(list.status, await list.json().catch(() => ({}))), { status: list.status });
    else {
      const files = await list.json();
      for (const f of Array.isArray(files) ? files : []) {
        if (f.type === 'file' && f.name.endsWith('.json')) remote[f.name.slice(0, -5)] = f.sha;
      }
    }
    const known = this.store.meta.shas || {};
    for (const col of this.collections) {
      const rsha = remote[col] || null;
      const dirty = this.store.isDirty(col);
      if (rsha && rsha === known[col] && !dirty) continue;
      if (!rsha && !dirty && this.store.raw(col).length === 0) continue;
      await this.syncCol(col, rsha, known[col] || null);
    }
    this.lastSync = Date.now();
    this.store.setMeta('lastSync', this.lastSync);
  },

  async run() {
    if (!this.enabled()) { if (this.status !== 'off') this.set('off'); return; }
    if (this.running) return this.running;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.set('offline'); return; }
    this.running = (async () => {
      try { await this.runOnce(); this.set('idle'); }
      catch (e) { this.set(e.offline ? 'offline' : 'error', e.message || String(e)); }
      finally { this.running = null; }
    })();
    return this.running;
  },

  // Called after any local change: waits a little so several edits travel together.
  soon() {
    if (!this.enabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 2500);
  },

  start() {
    this.lastSync = this.store.meta.lastSync || 0;
    clearInterval(this.loop);
    if (!this.enabled()) { this.set('off'); return; }
    this.set('idle');
    this.run();
    this.loop = setInterval(() => { if (document.visibilityState === 'visible') this.run(); }, 60000);
  },
};
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => self.run());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - self.lastSync > 20000) self.run();
    });
  }
  return self;
}

export const sync = createSync({ store, collections: COLLECTIONS, cfgKey: CFG, keyKey: KEY });
