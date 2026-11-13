import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_ROLES, MODULES, LEVELS, level, can, flag, isAdmin, isMine, canSee, canEdit, useRoles } from '../assets/js/core/perms.js';

useRoles(() => BUILTIN_ROLES);
const partner = { id: 'm1', role: 'role-partner' };
const maker = { id: 'm2', role: 'role-maker' };
const viewer = { id: 'm3', role: 'role-viewer' };
const accounts = { id: 'm4', role: 'role-accounts' };
const nobody = { id: 'm5', role: 'role-missing' };

test('every built-in role names a level for real modules only', () => {
  const keys = new Set(MODULES.map(m => m.key));
  for (const role of BUILTIN_ROLES) {
    for (const [mod, lvl] of Object.entries(role.perms.modules || {})) {
      assert.ok(keys.has(mod), `${role.id} uses unknown module ${mod}`);
      assert.ok(lvl in LEVELS, `${role.id} uses unknown level ${lvl}`);
    }
  }
});

test('a partner is admin and can edit everything', () => {
  assert.equal(isAdmin(partner), true);
  for (const m of MODULES) assert.equal(level(partner, m.key), 'edit');
  assert.equal(flag(partner, 'approve'), true);
  assert.equal(flag(partner, 'money'), true);
});

test('an unknown role sees nothing', () => {
  assert.equal(level(nobody, 'tasks'), 'none');
  assert.equal(can(nobody, 'tasks', 'own'), false);
  assert.equal(flag(nobody, 'approve'), false);
  assert.equal(can(null, 'tasks'), false);
});

test('the viewer reads but cannot edit, and money stays closed', () => {
  assert.equal(can(viewer, 'tasks', 'view'), true);
  assert.equal(can(viewer, 'tasks', 'edit'), false);
  assert.equal(can(viewer, 'finance', 'own'), false);
});

test('the accountant edits finance and holds the money flag', () => {
  assert.equal(can(accounts, 'finance', 'edit'), true);
  assert.equal(flag(accounts, 'money'), true);
  assert.equal(flag(accounts, 'approve'), false);
});

test('own level reaches only what belongs to the member', () => {
  const lvl = level(maker, 'tasks');
  assert.ok(LEVELS[lvl] >= LEVELS.own);
  const mine = { id: 't1', assignees: ['m2'] };
  const theirs = { id: 't2', assignees: ['m1'], owner: 'm1' };
  assert.equal(isMine(maker, mine), true);
  assert.equal(isMine(maker, theirs), false);
  assert.equal(canSee(maker, 'tasks', mine), true);
  if (lvl === 'own') {
    assert.equal(canSee(maker, 'tasks', theirs), false);
    assert.equal(canEdit(maker, 'tasks', theirs), false);
  }
});

test('ownership covers owner, creator, assignees, attendees and team', () => {
  const m = { id: 'x' };
  for (const r of [{ owner: 'x' }, { createdBy: 'x' }, { assignees: ['x'] }, { attendees: ['x'] }, { team: ['x'] }]) {
    assert.equal(isMine(m, r), true);
  }
  assert.equal(isMine(m, {}), false);
  assert.equal(isMine(null, { owner: 'x' }), false);
});
