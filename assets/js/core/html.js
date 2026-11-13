// Every value put into a template is escaped, unless it is marked safe with raw().
// Pages are built from these strings, so nothing a person types can become markup.

export class Safe {
  constructor(s) { this.s = String(s ?? ''); }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = v => String(v ?? '').replace(/[&<>"'`]/g, c => ESC[c]);

export const raw = s => (s instanceof Safe ? s : new Safe(s ?? ''));

function part(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Safe(out);
}

// Attribute helper: {disabled: true, 'data-id': 5} -> ' disabled data-id="5"'
export function attrs(obj) {
  let out = '';
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === false) continue;
    out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
  }
  return new Safe(out);
}

// A short, safe text formatter for notes: paragraphs, lists, headings, bold and links.
// The text is escaped first, so only these patterns become markup.
export function richText(src) {
  const lines = esc(src || '').split(/\r?\n/);
  const out = [];
  let list = null;
  const inline = t => t
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,،؛:)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { close(); continue; }
    let m;
    if ((m = t.match(/^#{1,3}\s+(.+)/))) { close(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
    if ((m = t.match(/^[-*•]\s+(.+)/))) {
      if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    if ((m = t.match(/^\d+[.)]\s+(.+)/))) {
      if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    close();
    out.push(`<p>${inline(t)}</p>`);
  }
  close();
  return new Safe(out.join(''));
}
