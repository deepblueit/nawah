// The sections of the system and the order of the menu. Each entry shows only to
// whoever may open it, a group's title shows only when
// something under it shows, and long menus fold with the open group remembered.
import { can } from './ctx.js';

export const SECTIONS = {};
export const register = (key, def) => { SECTIONS[key] = { key, ...def }; };

export const NAV = [
  { key: 'home' },
  { key: 'tasks' },
  { key: 'calendar' },
  { key: 'approvals' },
  { group: 'تم', tone: 'tamm', hint: 'الشركة: العملاء والمشاريع والمال والتأسيس' },
  { key: 'clients' },
  { key: 'projects' },
  { key: 'finance' },
  { key: 'setup' },
  { key: 'team' },
  { group: 'التسويق', tone: 'market', hint: 'المحتوى والمنصات والهوية' },
  { key: 'content' },
  { key: 'accounts' },
  { key: 'brand' },
  { group: 'نواة', tone: 'nawah', hint: 'العقل في المركز: المعرفة والقرارات والإجراءات' },
  { key: 'nawah' },
  { key: 'weekly' },
  { key: 'knowledge' },
  { key: 'decisions' },
  { key: 'meetings' },
  { key: 'skills' },
  { key: 'log' },
];

export const BOTTOM = ['reports', 'settings', 'help', 'me'];

export function canOpen(key) {
  const s = SECTIONS[key];
  if (!s) return false;
  if (s.module && !can(s.module, 'own')) return false;
  if (s.when && !s.when()) return false;
  return true;
}

export function navList() {
  const out = [];
  let pending = null;
  let current = null;
  for (const item of NAV) {
    if (item.group) { pending = item; continue; }
    if (!canOpen(item.key)) continue;
    if (pending) { out.push({ group: pending }); current = pending; pending = null; }
    out.push({ key: item.key, group: current });
  }
  return out;
}
