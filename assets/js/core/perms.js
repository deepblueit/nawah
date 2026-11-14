// Who may open what. Each role gives every section a level (closed, own only, view all,
// view and edit) plus a few flags. In this static
// version the rules organise the work in the interface; a server enforces them later.

export const MODULES = [
  { key: 'tasks', label: 'المهام والتقويم' },
  { key: 'clients', label: 'العملاء والفرص' },
  { key: 'projects', label: 'المشاريع' },
  { key: 'finance', label: 'العروض والفواتير والمصروفات' },
  { key: 'setup', label: 'تأسيس الشركة', noOwn: true },
  { key: 'team', label: 'الفريق والسعة', noOwn: true },
  { key: 'content', label: 'المحتوى والنشر' },
  { key: 'accounts', label: 'حسابات المنصات', noOwn: true },
  { key: 'brand', label: 'الهوية والصوت', noOwn: true },
  { key: 'knowledge', label: 'المعرفة' },
  { key: 'decisions', label: 'القرارات' },
  { key: 'meetings', label: 'الاجتماعات والمحاضر' },
  { key: 'weekly', label: 'الوقفة الأسبوعية' },
  { key: 'skills', label: 'المهارات والوكلاء', noOwn: true },
  { key: 'log', label: 'سجل التغييرات', noOwn: true },
  { key: 'reports', label: 'التقارير', noOwn: true },
  { key: 'settings', label: 'الإعدادات', noOwn: true },
  { key: 'trade', label: 'وضع التداول، وبياناته شخصية على جهاز كل عضو', noOwn: true },
];

export const FLAGS = [
  { key: 'approve', label: 'يعتمد المحتوى والقرارات والعروض قبل خروجها' },
  { key: 'money', label: 'يرى المبالغ والأسعار والفواتير' },
  { key: 'publish', label: 'ينشر المحتوى ويجدوله على المنصات' },
];

export const LEVELS = { none: 0, own: 1, view: 2, edit: 3 };
export const LEVEL_LABELS = { none: 'مغلق', own: 'ما يخصه فقط', view: 'يرى الكل', edit: 'يرى ويعدل' };

const all = level => Object.fromEntries(MODULES.map(m => [m.key, m.noOwn && level === 'own' ? 'view' : level]));

export const BUILTIN_ROLES = [
  { id: 'role-partner', name: 'شريك', builtin: true, perms: { admin: true } },
  {
    id: 'role-pm', name: 'مدير مشاريع', builtin: true,
    perms: {
      modules: { ...all('view'), tasks: 'edit', clients: 'edit', projects: 'edit', finance: 'view', knowledge: 'edit', decisions: 'edit', meetings: 'edit', weekly: 'edit', settings: 'none', log: 'view', trade: 'none' },
      flags: { approve: false, money: true, publish: false },
    },
  },
  {
    id: 'role-maker', name: 'مصمم أو مطور', builtin: true,
    perms: {
      modules: { ...all('none'), tasks: 'own', projects: 'view', content: 'own', brand: 'view', knowledge: 'edit', decisions: 'view', meetings: 'view', weekly: 'view', skills: 'view' },
      flags: {},
    },
  },
  {
    id: 'role-content', name: 'مسؤول المحتوى', builtin: true,
    perms: {
      modules: { ...all('none'), tasks: 'own', content: 'edit', accounts: 'edit', brand: 'edit', knowledge: 'edit', decisions: 'view', meetings: 'view', weekly: 'view', skills: 'view', reports: 'view' },
      flags: { publish: true },
    },
  },
  {
    id: 'role-accounts', name: 'محاسب', builtin: true,
    perms: {
      modules: { ...all('none'), tasks: 'own', clients: 'view', projects: 'view', finance: 'edit', setup: 'edit', knowledge: 'view', decisions: 'view', reports: 'view' },
      flags: { money: true },
    },
  },
  {
    id: 'role-viewer', name: 'مطلع', builtin: true,
    perms: { modules: { ...all('view'), finance: 'none', settings: 'none', log: 'none', trade: 'none' }, flags: {} },
  },
];

let rolesSource = () => BUILTIN_ROLES;
export const useRoles = fn => { rolesSource = fn; };
export const roleOf = member => (member && rolesSource().find(r => r.id === member.role)) || null;

export const isAdmin = member => !!roleOf(member)?.perms?.admin;

export function level(member, module) {
  const role = roleOf(member);
  if (!role) return 'none';
  if (role.perms?.admin) return 'edit';
  return role.perms?.modules?.[module] || 'none';
}

export const can = (member, module, need = 'own') => LEVELS[level(member, module)] >= LEVELS[need];

export function flag(member, key) {
  const role = roleOf(member);
  if (!role) return false;
  return !!(role.perms?.admin || role.perms?.flags?.[key]);
}

// A record belongs to someone when they own it, are assigned to it, attend it or created it.
export function isMine(member, rec) {
  if (!member || !rec) return false;
  const id = member.id;
  return rec.owner === id || rec.createdBy === id
    || (Array.isArray(rec.assignees) && rec.assignees.includes(id))
    || (Array.isArray(rec.attendees) && rec.attendees.includes(id))
    || (Array.isArray(rec.team) && rec.team.includes(id));
}

export const canSee = (member, module, rec) => can(member, module, 'view') || (can(member, module, 'own') && isMine(member, rec));
export const canEdit = (member, module, rec) => can(member, module, 'edit') || (can(member, module, 'own') && (!rec || isMine(member, rec)));
