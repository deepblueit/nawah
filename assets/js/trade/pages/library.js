// المكتبة: every school and pattern with its definition, how to spot it, how it is traded and
// when it fails, and whether نواة detects it on the chart by itself.
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { onAct, onInput } from '../../core/actions.js';
import { btn, drawer } from '../../core/ui.js';
import { count } from '../../core/util.js';
import { SCHOOLS, ENTRIES, entry, schoolName, searchKb, searchSchools, figure } from '../kb/index.js';
import { quietQuery } from '../tui.js';

let S = null;
const ENTRY_N = ['مدخل واحد', 'مدخلان', 'مداخل', 'مدخلا'];

export function mount(box, route) {
  S = { box, q: route.query.q || '', s: route.query.s || '' };
  draw();
  if (route.query.k && entry(route.query.k)) openEntry(route.query.k);
  else if (S.q && !S.s) {
    const sc = searchSchools(S.q)[0];
    if (sc && sc.score >= 20) { S.s = sc.school.k; S.q = ''; draw(); }
  }
}
export function unmount() { S = null; }

function list() {
  if (S.q) {
    const hits = searchKb(S.q, { limit: 40 }).map(x => x.e);
    return S.s ? hits.filter(e => e.s === S.s) : hits;
  }
  return S.s ? ENTRIES.filter(e => e.s === S.s) : ENTRIES;
}

function draw() {
  const items = list();
  const autoN = ENTRIES.filter(e => e.auto).length;
  const sc = S.s ? SCHOOLS.find(x => x.k === S.s) : null;
  S.box.innerHTML = String(html`<header class="page-head"><div class="page-titles"><h1>المكتبة</h1><p class="page-sub">${count(ENTRIES.length, ENTRY_N)} في ${SCHOOLS.length} مدرسة، منها ${autoN} تكتشفها نواة أو تحسبها تلقائيا.</p></div></header>
    <div class="t-lib-tools">
      <label class="search-in">${icon('search')}<input type="search" value="${S.q}" placeholder="ابحث: أوردر بلوك، الرأس والكتفين، RSI، كوازيمودو" data-input="t-lib-q" aria-label="ابحث في المكتبة"></label>
      <nav class="chips t-lib-schools" aria-label="المدارس"><button type="button" class="chip-toggle${!S.s ? ' on' : ''}" data-act="t-lib-s" data-s="">الكل</button>${SCHOOLS.map(x => html`<button type="button" class="chip-toggle${S.s === x.k ? ' on' : ''}" data-act="t-lib-s" data-s="${x.k}">${x.n}</button>`)}</nav>
    </div>
    ${sc ? html`<p class="t-lib-school">${sc.d}</p>` : ''}
    <div id="t-lib-grid">${grid(items)}</div>`);
}

function grid(items) {
  if (!items.length) return html`<div class="empty"><div class="empty-mark">${icon('search')}</div><h3>لا نتائج</h3><p>جرب اسما آخر للنموذج، بالعربية أو الإنجليزية.</p></div>`;
  return html`<ul class="t-lib-grid">${items.map(e => html`<li><button type="button" class="t-lib-card" data-act="t-lib-open" data-k="${e.k}">
    ${e.fig ? html`<span class="t-lib-fig">${raw(figure(e.fig, { w: 160, h: 86 }))}</span>` : html`<span></span>`}
    <span class="t-lib-txt"><b>${e.n}</b><small dir="ltr">${e.en}</small><span class="small muted">${schoolName(e.s)}</span></span>
    ${e.auto ? html`<span class="t-tag t-up" title="تكتشفه نواة على الشارت">${icon('crosshair')}تلقائي</span>` : ''}
  </button></li>`)}</ul>`;
}

const AUTO_WHERE = {
  structure: 'مدرسة الاتجاه وهيكل السوق', candles: 'مدرسة الشموع وعلامات الشارت', patterns: 'النماذج الكلاسيكية على الشارت', levels: 'المستويات وخطوطها على الشارت',
  fib: 'قراءة فيبوناتشي', ma: 'مدرسة المتوسطات وطبقة المتوسطات', momentum: 'الزخم والمذبذبات', follow: 'مؤشرات تتبع الاتجاه', divergence: 'التباعدات وخطوطها على الشارت',
  volatility: 'التقلب والتحذيرات', ichimoku: 'قراءة إيشيموكو وطبقتها', volume: 'قراءة الحجم حين يكون حقيقيا', elliott: 'موجات إليوت وأرقامها على الشارت',
  harmonics: 'النماذج التوافقية ونقاطها على الشارت', wyckoff: 'وايكوف وأحداثه على الشارت', smc: 'المفاهيم الذكية ومناطقها على الشارت', sd: 'مناطق العرض والطلب في الخطة',
  mtf: 'قراءة الإطار الأعلى', session: 'ساعة السوق تحت الشارت', plan: 'خطة الصفقة', risk: 'صفحة المخاطرة والحسابات', binary: 'بطاقة الخيارات الثنائية', signals: 'التوصيات والقنوات', journal: 'يوميات التداول',
};

function openEntry(k) {
  const e = entry(k);
  if (!e) return;
  quietQuery({ k });
  drawer({
    title: e.n,
    sub: `${schoolName(e.s)}، ${e.en}`,
    wide: true,
    body: html`<article class="t-lib-entry">
      ${e.fig ? html`<figure class="t-lib-bigfig">${raw(figure(e.fig, { w: 360, h: 200 }))}<figcaption class="small muted">رسم توضيحي مبسط</figcaption></figure>` : ''}
      <p class="t-lib-def">${e.d}</p>
      ${e.id?.length ? html`<h3>كيف تتعرف عليه</h3><ul>${e.id.map(x => html`<li>${x}</li>`)}</ul>` : ''}
      ${e.tr?.length ? html`<h3>كيف يتداول</h3><ul>${e.tr.map(x => html`<li>${x}</li>`)}</ul>` : ''}
      ${e.f ? html`<h3>متى يفشل وما يحذر منه</h3><p>${e.f}</p>` : ''}
      <p class="t-lib-auto small ${e.auto ? '' : 'muted'}">${icon(e.auto ? 'crosshair' : 'eye')}${e.auto ? `تقرؤه نواة تلقائيا في: ${AUTO_WHERE[e.auto] || 'التحليل'}.` : 'لا تكتشفه نواة آليا؛ استخدمه بعينك سياقا إضافيا.'}</p>
    </article>`,
    foot: html`${e.auto ? btn('افتح الشارت', { href: '#/market', kind: 'primary', icon: 'candles' }) : ''}${btn('اسأل إكس نواة عنه', { href: `#/xnawah?q=${encodeURIComponent(`اشرح ${e.n}`)}`, kind: 'quiet', icon: 'orbit' })}${btn('إغلاق', { act: 'close-drawer', kind: 'quiet' })}`,
  });
}

onAct({
  't-lib-open': el => openEntry(el.dataset.k),
  't-lib-s': el => { if (!S) return; S.s = el.dataset.s; quietQuery({ s: S.s, k: '' }); draw(); },
});
onInput({
  't-lib-q': el => {
    if (!S) return;
    S.q = el.value;
    quietQuery({ q: S.q, k: '' });
    const g = S.box.querySelector('#t-lib-grid');
    if (g) g.innerHTML = String(grid(list()));
  },
});
