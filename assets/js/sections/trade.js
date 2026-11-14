// The trading mode and its assistant, إكس نواة. Only the menu entries live here; each page and
// the analysis engine load on first use, so the company side of نواة stays as light as before.
import { html } from '../core/html.js';
import { register } from '../core/nav.js';

const PAGES = [
  ['market', { label: 'السوق والتحليل', short: 'السوق', icon: 'candles', aka: 'شارت تحليل فني فوركس ذهب بيتكوين عملات رمز إطار زمني' }],
  ['xnawah', { label: 'إكس نواة', short: 'إكس نواة', icon: 'orbit', aka: 'المساعد اسأل حلل اشرح توصية' }],
  ['signals', { label: 'التوصيات والقنوات', short: 'التوصيات', icon: 'signal', aka: 'تيلجرام قنوات توصيات نسخ نقل بوت' }],
  ['library', { label: 'المكتبة', icon: 'layers', aka: 'مدارس التحليل النماذج الفنية الشموع الهارمونيك إليوت المفاهيم الذكية وايكوف' }],
  ['risk', { label: 'المخاطرة والحسابات', short: 'الحسابات', icon: 'calc', aka: 'حجم اللوت قيمة النقطة الخيارات الثنائية المضاعفة نسبة العائد' }],
  ['journal', { label: 'يوميات التداول', short: 'اليوميات', icon: 'journal', aka: 'صفقاتي سجل الأداء نتائج' }],
  ['tsettings', { label: 'إعدادات التداول', short: 'الإعدادات', icon: 'settings', aka: 'مفتاح البيانات بوت تيلجرام مزامنة التداول' }],
];

let mod = null;
const load = () => (mod ||= import('../trade/index.js'));

for (const [key, def] of PAGES) {
  register(key, {
    ...def,
    mode: 'trade',
    module: 'trade',
    // these pages draw themselves from the trading data, not from the company data
    stable: true,
    render: () => html`<section class="page tpage" id="tpage" data-tpage="${key}"><div class="t-boot" aria-busy="true"><span class="t-boot-dot"></span><span>جار التحميل</span></div></section>`,
    mount: (el, route) => {
      load().then(m => m.mount(key, el, route)).catch(e => {
        console.error(e);
        const box = el.querySelector('#tpage');
        if (box) box.innerHTML = String(html`<div class="empty"><h3>تعذر تحميل وضع التداول</h3><p class="mono">${e.message}</p></div>`);
      });
    },
    unmount: () => { mod?.then(m => m.unmount(key)).catch(() => {}); },
  });
}
