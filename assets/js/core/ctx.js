// Shared state for every page: who is using the system, where they are, and a few verbs.
import { store } from './store.js';
import * as perms from './perms.js';

export const ctx = {
  me: null,
  route: { key: 'home', parts: [], query: {} },
  go: hash => { location.hash = hash; },
  refresh: () => {},
  toast: () => {},
};

export const members = () => store.all('members').filter(m => m.active !== false).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const member = id => store.get('members', id);
export const memberName = id => member(id)?.name || '';
export const firstName = id => (memberName(id) || '').split(' ')[0];

export const can = (module, need = 'own') => perms.can(ctx.me, module, need);
export const flag = key => perms.flag(ctx.me, key);
export const canSee = (module, rec) => perms.canSee(ctx.me, module, rec);
export const canEdit = (module, rec) => perms.canEdit(ctx.me, module, rec);
export const isMine = rec => perms.isMine(ctx.me, rec);
export const isAdmin = () => perms.isAdmin(ctx.me);

// Records of a collection this person may see.
export const visible = (col, module) => store.all(col).filter(r => canSee(module, r));

export const settings = {
  company: () => store.setting('company', { name: 'تم للحلول التقنية', nameEn: 'TAMM Tech Solutions', parent: '' }),
  services: () => store.setting('services', { list: [] }).list || [],
  content: () => store.setting('content', { pillars: [], platforms: [] }),
  approvals: () => store.setting('approvals', { content: '', finance: '', decisions: '' }),
  numbering: () => store.setting('numbering', { quote: 'Q', invoice: 'INV', next: {} }),
};
