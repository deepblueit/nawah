import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, serialize } from '../assets/js/core/store.js';

const rec = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });

test('the newer edit of a record wins on both sides', () => {
  const local = [rec('a', 200, { title: 'محلي' }), rec('b', 100, { title: 'قديم' })];
  const remote = [rec('a', 100, { title: 'بعيد' }), rec('b', 300, { title: 'جديد' })];
  const { merged, changedLocal, changedRemote } = mergeRecords(local, remote, 'tasks');
  assert.deepEqual(merged.map(r => r.title), ['محلي', 'جديد']);
  assert.equal(changedLocal, true);
  assert.equal(changedRemote, true);
});

test('records that exist on one side only are kept', () => {
  const { merged, changedLocal, changedRemote } = mergeRecords([rec('a', 1)], [rec('b', 1)]);
  assert.deepEqual(merged.map(r => r.id), ['a', 'b']);
  assert.equal(changedLocal, true);
  assert.equal(changedRemote, true);
});

test('identical copies change nothing', () => {
  const local = [rec('a', 5, { title: 'س' })];
  const remote = [rec('a', 5, { title: 'س' })];
  const { merged, changedLocal, changedRemote } = mergeRecords(local, remote);
  assert.equal(changedLocal, false);
  assert.equal(changedRemote, false);
  assert.equal(merged[0], local[0]);
});

test('a tie with different content resolves the same way on every device', () => {
  const x = rec('a', 5, { title: 'أ' });
  const y = rec('a', 5, { title: 'ب' });
  const one = mergeRecords([x], [y]).merged[0];
  const two = mergeRecords([y], [x]).merged[0];
  assert.deepEqual(one, two);
});

test('a deletion travels as a tombstone and wins when newer', () => {
  const local = [rec('a', 10, { title: 'مهمة' })];
  const remote = [rec('a', 20, { deleted: true })];
  const { merged } = mergeRecords(local, remote);
  assert.equal(merged[0].deleted, true);
});

test('the activity log is capped to the newest 4000 entries', () => {
  const remote = Array.from({ length: 4100 }, (_, i) => ({ id: `l${String(i).padStart(5, '0')}`, at: i, updatedAt: i }));
  const { merged, changedRemote } = mergeRecords([], remote, 'log');
  assert.equal(merged.length, 4000);
  assert.equal(changedRemote, true);
  assert.equal(Math.min(...merged.map(r => r.at)), 100);
});

test('records without an id are ignored and output is sorted by id', () => {
  const { merged } = mergeRecords([rec('c', 1), null, { title: 'بلا معرف' }], [rec('a', 1)]);
  assert.deepEqual(merged.map(r => r.id), ['a', 'c']);
});

test('serialize writes one record per line', () => {
  const text = serialize('tasks', [rec('a', 1), rec('b', 2)]);
  assert.equal(text, '{"collection":"tasks","records":[\n{"id":"a","updatedAt":1},\n{"id":"b","updatedAt":2}\n]}\n');
  assert.deepEqual(JSON.parse(text).records.length, 2);
});
