import { test } from 'node:test';
import assert from 'node:assert/strict';
import { count, normalize, matches, addDays, diffDays, weekStart, isWeekend, csv, money, sum } from '../assets/js/core/util.js';

const TASK = ['مهمة واحدة', 'مهمتان', 'مهام', 'مهمة'];

test('Arabic counting follows the number rules', () => {
  assert.equal(count(0, TASK), '0 مهام');
  assert.equal(count(0, TASK, { zero: 'لا مهام' }), 'لا مهام');
  assert.equal(count(1, TASK), 'مهمة واحدة');
  assert.equal(count(2, TASK), 'مهمتان');
  assert.equal(count(3, TASK), '3 مهام');
  assert.equal(count(10, TASK), '10 مهام');
  assert.equal(count(11, TASK), '11 مهمة');
  assert.equal(count(99, TASK), '99 مهمة');
  assert.equal(count(100, TASK), '100 مهمة');
  assert.equal(count(103, TASK), '103 مهام');
  assert.equal(count(111, TASK), '111 مهمة');
});

test('search ignores diacritics, alef forms, taa marbuta and Arabic digits', () => {
  assert.equal(normalize('إِدَارَة  الأعمال'), 'اداره الاعمال');
  assert.equal(normalize('٢٠٢٦'), '2026');
  assert.equal(matches('إدارة المشاريع', 'اداره'), true);
  assert.equal(matches('عرض سعر', 'عرض فاتورة'), false);
  assert.equal(matches('أي شيء', ''), true);
});

test('dates: days, weeks starting Sunday, Saudi weekend', () => {
  assert.equal(addDays('2026-11-13', 1), '2026-11-14');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-11-20', '2026-11-13'), 7);
  assert.equal(weekStart('2026-11-13'), '2026-11-08');
  assert.equal(isWeekend('2026-11-13'), true);
  assert.equal(isWeekend('2026-11-14'), true);
  assert.equal(isWeekend('2026-11-15'), false);
});

test('csv quotes what needs quoting', () => {
  const text = csv([['الاسم', 'ملاحظة'], ['تم', 'قال "نعم", ثم ذهب']]);
  assert.match(text, /"قال ""نعم"", ثم ذهب"/);
});

test('money and sums', () => {
  assert.match(money(86250), /86,250/);
  assert.match(money(86250), /ر\.س/);
  assert.equal(sum([{ v: 1 }, { v: '2' }, { v: 'x' }], r => r.v), 3);
});
