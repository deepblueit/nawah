// Small pieces the trading pages share: prices, the verdict gauge, vote bars, the symbol picker.
import { html, raw } from '../core/html.js';
import { icon } from '../core/icons.js';
import { ctx } from '../core/ctx.js';
import { SYMBOLS, TIMEFRAMES, symbolInfo, fmtPrice } from './engine/symbols.js';
import { normAr } from './engine/symbols.js';

export const P = (p, sym) => fmtPrice(p, typeof sym === 'string' ? symbolInfo(sym) : sym);
export const pct = (x, d = 2) => (x == null || !Number.isFinite(x) ? '' : `${x > 0 ? '+' : ''}${x.toFixed(d)}%`);
export const pctPlain = (x, d = 0) => (x == null || !Number.isFinite(x) ? '' : `${(x * 100).toFixed(d)}%`);

export const BIAS = { buy: ['شراء', 'up'], sell: ['بيع', 'down'], neutral: ['محايد', 'flat'] };
export const biasChip = b => html`<span class="t-bias t-${BIAS[b]?.[1] || 'flat'}">${icon(b === 'buy' ? 'arrowUp' : b === 'sell' ? 'arrowDown' : 'pulse')}${BIAS[b]?.[0] || ''}</span>`;

// Replaces the query without re-rendering the page (the chart keeps its state).
export function quietQuery(patch) {
  const r = { ...ctx.route, query: { ...ctx.route.query, ...patch } };
  const qs = new URLSearchParams(Object.entries(r.query).filter(([, v]) => v !== '' && v != null)).toString();
  history.replaceState(null, '', `#/${[r.key, ...r.parts].join('/')}${qs ? '?' + qs : ''}`);
  ctx.route = r;
}

// The verdict: a half dial from sell (left) to buy (right); the number is agreement, not odds.
export function gauge(score) {
  const v = Math.max(-100, Math.min(100, score || 0));
  const ang = Math.PI * (1 - (v + 100) / 200);
  const cx = 60;
  const cy = 58;
  const r = 46;
  const x = cx + r * Math.cos(ang) * 0.86;
  const y = cy - r * Math.sin(ang) * 0.86;
  const arc = (a1, a2) => {
    const p1 = [cx + r * Math.cos(a1), cy - r * Math.sin(a1)];
    const p2 = [cx + r * Math.cos(a2), cy - r * Math.sin(a2)];
    return `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} A${r} ${r} 0 0 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  };
  return html`<svg class="t-gauge" viewBox="0 0 120 66" role="img" aria-label="درجة التوافق ${v}">
    <path d="${arc(Math.PI, Math.PI * 0.62)}" class="g-sell"/>
    <path d="${arc(Math.PI * 0.6, Math.PI * 0.4)}" class="g-flat"/>
    <path d="${arc(Math.PI * 0.38, 0)}" class="g-buy"/>
    <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="g-needle"/>
    <circle cx="${cx}" cy="${cy}" r="4" class="g-hub"/>
  </svg>`;
}

// A vote from -1 to +1 as a bar growing from the centre (right is buy).
export const voteBar = v => {
  const w = Math.round(Math.min(1, Math.abs(v)) * 50);
  return html`<span class="t-vote" title="${v > 0 ? 'يرجح الشراء' : v < 0 ? 'يرجح البيع' : 'محايد'}"><span class="${v >= 0 ? 'pos' : 'neg'}" style="width:${w}%"></span></span>`;
};

export const CLS_NAMES = { fx: 'العملات', metal: 'المعادن', crypto: 'العملات الرقمية' };

export function symbolPicker(current, { act = 't-set-sym' } = {}) {
  const groups = Object.entries(CLS_NAMES).map(([cls, name]) => [name, SYMBOLS.filter(x => x.cls === cls)]);
  return html`<div class="t-picker">
    <label class="search-in">${icon('search')}<input type="search" id="t-sym-q" placeholder="ابحث: ذهب، EURUSD، بيتكوين" autocomplete="off" aria-label="ابحث عن رمز"></label>
    <div class="t-picker-list" id="t-sym-list">${groups.map(([name, list]) => html`<section><h3>${name}</h3><ul>${list.map(x => html`<li><button type="button" class="${x.s === current ? 'on' : ''}" data-act="${act}" data-sym="${x.s}" data-name="${normAr(`${x.s} ${x.ar} ${x.aliases.join(' ')}`)}"><b>${x.s}</b><span>${x.ar}</span></button></li>`)}</ul></section>`)}</div>
  </div>`;
}

// filter the open picker as the person types
export function wirePicker(root) {
  const q = root.querySelector('#t-sym-q');
  if (!q) return;
  q.addEventListener('input', () => {
    const n = normAr(q.value).trim();
    root.querySelectorAll('#t-sym-list li').forEach(li => {
      const b = li.querySelector('button');
      li.hidden = !!n && !b.dataset.name.includes(n);
    });
    root.querySelectorAll('#t-sym-list section').forEach(s => { s.hidden = ![...s.querySelectorAll('li')].some(li => !li.hidden); });
  });
  setTimeout(() => q.focus(), 30);
}

export const tfSeg = (active, act = 't-set-tf') => html`<div class="seg t-tfs" role="group" aria-label="الإطار الزمني">${TIMEFRAMES.map(t => html`<button type="button" class="${t.k === active ? 'on' : ''}" data-act="${act}" data-tf="${t.k}" aria-pressed="${t.k === active}" title="${t.frame}">${t.k.toUpperCase()}</button>`)}</div>`;

export const kvRow = (k, v) => (v || v === 0 ? html`<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
export { raw };
