// Calculations several pages share: what waits for the current person, what waits for approval.
import { store } from '../core/store.js';
import { ctx, can, flag, canSee } from '../core/ctx.js';
import { today, diffDays, relDay, local, fmtShort } from '../core/util.js';
import { label, POST_STATUS } from '../core/schema.js';

export const open = t => t.status !== 'done';
export const mine = r => !!ctx.me && ((r.assignees || []).includes(ctx.me.id) || r.owner === ctx.me.id);
export const lateOrToday = d => d && diffDays(d, today()) <= 0;

export function approvalsWaiting() {
  if (!flag('approve')) return [];
  const out = [];
  if (can('content', 'own')) {
    for (const p of store.all('posts')) {
      if (p.status === 'review' && p.needsApproval !== false) out.push({ kind: 'post', col: 'posts', id: p.id, title: p.title, note: p.date ? `للنشر ${relDay(p.date)}` : 'بلا تاريخ نشر', at: p.updatedAt });
    }
  }
  if (can('decisions', 'own')) {
    for (const d of store.all('decisions')) if (d.status === 'proposed') out.push({ kind: 'decision', col: 'decisions', id: d.id, title: d.title, note: 'قرار مقترح', at: d.updatedAt });
  }
  if (can('finance', 'own') && flag('money')) {
    for (const q of store.all('invoices')) if (q.kind !== 'invoice' && q.status === 'review') out.push({ kind: 'quote', col: 'invoices', id: q.id, title: `عرض سعر ${q.number || ''}`.trim(), note: 'بانتظار الاعتماد قبل الإرسال', at: q.updatedAt });
  }
  return out.sort((a, b) => (a.at || 0) - (b.at || 0));
}

export function needsYou() {
  if (!ctx.me) return [];
  const id = ctx.me.id;
  const seen = local.get(`nawah.seen.${id}`, 0);
  const out = [];
  if (can('tasks', 'own')) {
    for (const t of store.all('tasks')) {
      if (!open(t) || !(t.assignees || []).includes(id)) continue;
      const late = t.due && diffDays(t.due, today()) < 0;
      const fresh = t.createdBy !== id && (t.createdAt || 0) > seen;
      if (lateOrToday(t.due) || fresh) {
        out.push({ col: 'tasks', id: t.id, title: t.title, note: t.due ? relDay(t.due) : 'مهمة جديدة لك', ic: late ? 'alert' : 'tasks', urgent: late, fresh, due: t.due });
      }
    }
  }
  for (const a of approvalsWaiting()) out.push({ col: a.col, id: a.id, title: `اعتماد: ${a.title}`, note: a.note, ic: 'approvals', urgent: false, fresh: (a.at || 0) > seen, due: '' });
  if (can('content', 'own')) {
    for (const p of store.all('posts')) {
      if (p.owner !== id || ['published', 'scheduled'].includes(p.status) || !lateOrToday(p.date)) continue;
      out.push({ col: 'posts', id: p.id, title: p.title, note: `${label(POST_STATUS, p.status)}، موعد النشر ${relDay(p.date)}`, ic: 'content', urgent: diffDays(p.date, today()) < 0, due: p.date });
    }
  }
  if (can('setup', 'own')) {
    for (const s of store.all('setup')) {
      if (s.owner !== id || s.status === 'done' || !s.due || diffDays(s.due, today()) > 0) continue;
      out.push({ col: 'setup', id: s.id, title: s.title, note: `تأسيس، ${relDay(s.due)}`, ic: 'setup', urgent: diffDays(s.due, today()) < 0, due: s.due });
    }
  }
  if (can('meetings', 'own')) {
    for (const m of store.all('meetings')) {
      if (m.date === today() && (m.attendees || []).includes(id)) out.push({ col: 'meetings', id: m.id, title: m.title, note: `اجتماع اليوم${m.time ? ' ' + m.time : ''}`, ic: 'meetings', urgent: false, due: m.date });
    }
  }
  return out.sort((a, b) => (b.urgent - a.urgent) || String(a.due || '9').localeCompare(String(b.due || '9')));
}

export const pillars = () => store.setting('content', { pillars: [] }).pillars || [];
export const pillarLabel = key => pillars().find(p => p.key === key)?.label || '';
export const pillarIndex = key => Math.max(0, pillars().findIndex(p => p.key === key));

export const dealOpen = d => !['won', 'lost'].includes(d.stage);

export function projectProgress(p) {
  const ms = p.milestones || [];
  if (!ms.length) return null;
  return Math.round((ms.filter(m => m.done).length / ms.length) * 100);
}

export const visibleTasks = () => store.all('tasks').filter(t => canSee('tasks', t));

export const shortDate = d => (d ? fmtShort(d) : '');
