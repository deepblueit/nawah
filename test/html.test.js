import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, esc, attrs, richText } from '../assets/js/core/html.js';

test('values in templates are escaped', () => {
  const name = '<img src=x onerror="alert(1)">';
  const out = String(html`<b>${name}</b>`);
  assert.equal(out, '<b>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</b>');
});

test('quotes and backticks are escaped inside attributes', () => {
  const out = String(html`<a title="${`"' \``}">x</a>`);
  assert.equal(out, '<a title="&quot;&#39; &#96;">x</a>');
});

test('raw and nested templates are not escaped twice', () => {
  const inner = html`<i>${'a&b'}</i>`;
  assert.equal(String(html`<p>${inner}${raw('<br>')}</p>`), '<p><i>a&amp;b</i><br></p>');
});

test('arrays, null and booleans', () => {
  assert.equal(String(html`${['<', '>']}`), '&lt;&gt;');
  assert.equal(String(html`[${null}${undefined}${false}${true}]`), '[]');
  assert.equal(String(html`${0}`), '0');
});

test('esc handles every special character', () => {
  assert.equal(esc(`&<>"'\``), '&amp;&lt;&gt;&quot;&#39;&#96;');
  assert.equal(esc(null), '');
});

test('attrs skips empty values and escapes the rest', () => {
  assert.equal(String(attrs({ disabled: true, hidden: false, 'data-id': 'a"b', x: null })), ' disabled data-id="a&quot;b"');
});

test('richText escapes first, then formats', () => {
  assert.equal(String(richText('<script>alert(1)</script>')), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(String(richText('# عنوان\n- أول\n- ثان\n\n**مهم** هنا')), '<h4>عنوان</h4><ul><li>أول</li><li>ثان</li></ul><p><b>مهم</b> هنا</p>');
  assert.equal(String(richText('1. واحد\n2. اثنان')), '<ol><li>واحد</li><li>اثنان</li></ol>');
});

test('richText links only http and https', () => {
  const out = String(richText('افتح https://example.com/a?b=1 الآن'));
  assert.match(out, /<a href="https:\/\/example\.com\/a\?b=1" target="_blank" rel="noopener noreferrer">/);
  assert.doesNotMatch(String(richText('javascript:alert(1)')), /<a /);
});

test('a quote in a link cannot leave the attribute', () => {
  const out = String(richText('https://example.com/"onmouseover="x'));
  assert.doesNotMatch(out, /href="[^"]*"onmouseover/);
});
