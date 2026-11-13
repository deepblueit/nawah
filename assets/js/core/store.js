// Local-first data: every collection lives in this browser (IndexedDB) and works offline.
// Records are never hard-deleted: a deletion is a tombstone, so two devices can merge.
// The sync layer (sync.js) copies the same records to a private GitHub repository.

export const COLLECTIONS = [
  'members', 'roles', 'tasks', 'clients', 'deals', 'projects', 'invoices', 'expenses', 'setup',
  'posts', 'accounts', 'knowledge', 'decisions', 'meetings', 'weeks', 'skills', 'agents', 'log', 'settings',
];

const LOG_KEEP = 4000;

const titleOf = rec => rec?.title || rec?.name || rec?.number || rec?.label || rec?.id || '';

// Merge two versions of a collection: the newer edit of each record wins.
export function mergeRecords(localList = [], remoteList = [], col = '') {
  const map = new Map();
  for (const r of remoteList) if (r && r.id) map.set(r.id, r);
  let changedRemote = false;
  let changedLocal = false;
  for (const l of localList) {
    if (!l || !l.id) continue;
    const r = map.get(l.id);
    if (!r) { map.set(l.id, l); changedRemote = true; continue; }
    const lt = Number(l.updatedAt) || 0;
    const rt = Number(r.updatedAt) || 0;
    if (lt > rt) { map.set(l.id, l); changedRemote = true; }
    else if (lt === rt) {
      const ls = JSON.stringify(l);
      const rs = JSON.stringify(r);
      if (ls === rs) map.set(l.id, l); // the same record: keep the local copy
      else if (ls > rs) { map.set(l.id, l); changedRemote = true; }
    }
  }
  let merged = [...map.values()];
  if (col === 'log' && merged.length > LOG_KEEP) {
    merged.sort((a, b) => (b.at || 0) - (a.at || 0));
    merged = merged.slice(0, LOG_KEEP);
    changedRemote = true;
  }
  merged.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const localIds = new Map(localList.filter(Boolean).map(l => [l.id, l]));
  if (merged.length !== localIds.size) changedLocal = true;
  else for (const m of merged) { if (localIds.get(m.id) !== m) { changedLocal = true; break; } }
  return { merged, changedLocal, changedRemote };
}

// One record per line keeps the repository's history readable.
export const serialize = (col, records) =>
  `{"collection":${JSON.stringify(col)},"records":[\n${records.map(r => JSON.stringify(r)).join(',\n')}\n]}\n`;

function idb(name) {
  return new Promise((ok, fail) => {
    if (!('indexedDB' in globalThis)) { fail(new Error('no indexedDB')); return; }
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cols')) db.createObjectStore('cols');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new Error('blocked'));
  });
}

const tx = (db, storeName, mode, fn) => new Promise((ok, fail) => {
  const t = db.transaction(storeName, mode);
  const s = t.objectStore(storeName);
  const out = fn(s);
  t.oncomplete = () => ok(out && 'result' in out ? out.result : undefined);
  t.onerror = () => fail(t.error);
  t.onabort = () => fail(t.error);
});

class Store {
  constructor() {
    this.space = 'real';
    this.db = null;
    this.memory = false;
    this.data = {};
    this.meta = {};
    this.me = null;
    this.listeners = new Set();
    this.pending = new Set();
    this.timer = null;
    this.rev = {};
  }

  async open(space = 'real') {
    this.flushNow();
    if (this.db) { try { this.db.close(); } catch (_) { /* ignore */ } }
    this.space = space;
    this.data = Object.fromEntries(COLLECTIONS.map(c => [c, new Map()]));
    this.meta = {};
    this.memory = false;
    try {
      this.db = await idb(`nawah-${space}`);
      const cols = await new Promise((ok, fail) => {
        const out = {};
        const t = this.db.transaction('cols', 'readonly');
        const s = t.objectStore('cols');
        const req = s.openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) { out[cur.key] = cur.value; cur.continue(); } else ok(out);
        };
        req.onerror = () => fail(req.error);
      });
      for (const [c, list] of Object.entries(cols)) {
        if (!this.data[c]) this.data[c] = new Map();
        for (const r of list || []) if (r && r.id) this.data[c].set(r.id, r);
      }
      this.meta = await new Promise((ok, fail) => {
        const out = {};
        const t = this.db.transaction('meta', 'readonly');
        const req = t.objectStore('meta').openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) { out[cur.key] = cur.value; cur.continue(); } else ok(out);
        };
        req.onerror = () => fail(req.error);
      });
    } catch (_) {
      this.db = null;
      this.memory = true;
    }
    return this;
  }

  // ----- reading
  all(col) { return [...(this.data[col] || new Map()).values()].filter(r => !r.deleted); }
  raw(col) { return [...(this.data[col] || new Map()).values()]; }
  get(col, id) { const r = this.data[col]?.get(id); return r && !r.deleted ? r : null; }
  count(col) { return this.all(col).length; }
  isEmpty() { return this.all('members').length === 0; }

  setting(id, fallback = {}) {
    const r = this.get('settings', id);
    if (!r) return structuredClone(fallback);
    const { id: _i, createdAt, createdBy, updatedAt, updatedBy, ...rest } = r;
    return { ...structuredClone(fallback), ...rest };
  }

  // ----- writing
  stamp(rec, isNew) {
    const now = Date.now();
    const by = this.me?.id || 'system';
    if (isNew) { rec.createdAt = rec.createdAt || now; rec.createdBy = rec.createdBy || by; }
    rec.updatedAt = Math.max(now, (Number(rec.updatedAt) || 0) + 1);
    rec.updatedBy = by;
    return rec;
  }

  put(col, rec, { log = true, action, quiet = false } = {}) {
    if (!rec.id) rec.id = `${col.slice(0, 2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const old = this.data[col].get(rec.id);
    const isNew = !old || old.deleted;
    const next = this.stamp({ ...(old && !old.deleted ? old : {}), ...rec, deleted: undefined }, isNew);
    delete next.deleted;
    this.data[col].set(next.id, next);
    this.markDirty(col);
    if (log && col !== 'log' && col !== 'settings') this.log(action || (isNew ? 'create' : 'update'), col, next);
    if (!quiet) this.emit({ col, ids: [next.id], source: 'local' });
    return next;
  }

  patch(col, id, changes, opts = {}) {
    const old = this.get(col, id);
    if (!old) return null;
    return this.put(col, { ...old, ...changes, id }, opts);
  }

  remove(col, id, { log = true } = {}) {
    const old = this.data[col].get(id);
    if (!old || old.deleted) return;
    const next = this.stamp({ ...old, deleted: true }, false);
    this.data[col].set(id, next);
    this.markDirty(col);
    if (log && col !== 'log') this.log('delete', col, old);
    this.emit({ col, ids: [id], source: 'local' });
  }

  restore(col, id) {
    const old = this.data[col].get(id);
    if (!old || !old.deleted) return;
    const next = this.stamp({ ...old }, false);
    delete next.deleted;
    this.data[col].set(id, next);
    this.markDirty(col);
    this.log('restore', col, next);
    this.emit({ col, ids: [id], source: 'local' });
  }

  saveSetting(id, value) {
    return this.put('settings', { ...value, id }, { log: false });
  }

  log(action, col, rec, extra = {}) {
    const entry = {
      id: `lg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(), by: this.me?.id || 'system', action, col, ref: rec?.id || '', label: String(titleOf(rec)).slice(0, 140), ...extra,
    };
    entry.updatedAt = entry.at;
    entry.createdAt = entry.at;
    this.data.log.set(entry.id, entry);
    this.markDirty('log');
  }

  // Replace a whole collection with merged records (sync and import). Returns true when it changed.
  replace(col, records, { source = 'sync' } = {}) {
    if (!this.data[col]) this.data[col] = new Map();
    const before = this.data[col];
    const next = new Map();
    for (const r of records) if (r && r.id) next.set(r.id, r);
    let changed = before.size !== next.size;
    if (!changed) for (const [id, r] of next) { if (before.get(id) !== r) { changed = true; break; } }
    if (!changed) return false;
    this.data[col] = next;
    this.queue(col);
    this.emit({ col, ids: null, source });
    return true;
  }

  // ----- dirty tracking (what still needs to reach the shared repository)
  markDirty(col) {
    this.rev[col] = (this.rev[col] || 0) + 1;
    const d = new Set(this.meta.dirty || []);
    d.add(col);
    this.meta.dirty = [...d];
    this.queue(col);
    this.queueMeta();
  }

  clearDirty(col) {
    this.meta.dirty = (this.meta.dirty || []).filter(c => c !== col);
    this.queueMeta();
  }

  isDirty(col) { return (this.meta.dirty || []).includes(col); }

  setMeta(key, value) { this.meta[key] = value; this.queueMeta(); }

  // ----- persistence (batched)
  queue(col) {
    this.pending.add(col);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 40);
  }

  queueMeta() {
    this.pending.add('__meta');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 40);
  }

  async flush() {
    if (!this.db || this.memory) { this.pending.clear(); return; }
    const cols = [...this.pending];
    this.pending.clear();
    try {
      const writeCols = cols.filter(c => c !== '__meta');
      if (writeCols.length) {
        await tx(this.db, 'cols', 'readwrite', s => {
          for (const c of writeCols) s.put([...this.data[c].values()], c);
        });
      }
      if (cols.includes('__meta')) {
        await tx(this.db, 'meta', 'readwrite', s => {
          for (const [k, v] of Object.entries(this.meta)) s.put(v, k);
        });
      }
    } catch (e) {
      console.warn('save failed', e);
    }
  }

  flushNow() { if (this.pending.size) this.flush(); }

  // ----- events
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error(e); } } }

  // ----- backup
  exportAll() {
    const collections = {};
    for (const c of COLLECTIONS) collections[c] = this.raw(c);
    return { kind: 'nawah-backup', version: 1, exportedAt: new Date().toISOString(), space: this.space, collections };
  }

  importBackup(backup, { replace = false } = {}) {
    if (!backup || backup.kind !== 'nawah-backup' || !backup.collections) throw new Error('هذا الملف ليس نسخة احتياطية من نواة');
    let touched = 0;
    for (const c of COLLECTIONS) {
      const incoming = Array.isArray(backup.collections[c]) ? backup.collections[c] : null;
      if (!incoming) continue;
      const result = replace ? { merged: incoming, changedLocal: true } : mergeRecords(this.raw(c), incoming, c);
      if (result.changedLocal) {
        this.replace(c, result.merged, { source: 'import' });
        this.markDirty(c);
        touched++;
      }
    }
    return touched;
  }

  async wipe() {
    for (const c of COLLECTIONS) this.data[c] = new Map();
    this.meta = {};
    if (this.db) {
      await tx(this.db, 'cols', 'readwrite', s => s.clear());
      await tx(this.db, 'meta', 'readwrite', s => s.clear());
    }
    this.emit({ col: null, ids: null, source: 'wipe' });
  }
}

export const store = new Store();
