// The trading mode's router: loads each page on first visit, opens the member's trading data,
// and starts the background services (the Telegram collector) on the device chosen for them.
import { openTrade } from './tstore.js';

const PAGES = {
  market: () => import('./pages/market.js'),
  xnawah: () => import('./pages/xnawah.js'),
  signals: () => import('./pages/signals.js'),
  library: () => import('./pages/library.js'),
  risk: () => import('./pages/risk.js'),
  journal: () => import('./pages/journal.js'),
  tsettings: () => import('./pages/settings.js'),
};

let current = null;

// the trading styles load once, before the first page draws
let cssP = null;
function styles() {
  if (cssP) return cssP;
  cssP = new Promise(ok => {
    if (document.querySelector('link[data-trade-css]')) { ok(); return; }
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../../css/trade.css', import.meta.url).href;
    l.dataset.tradeCss = '1';
    l.onload = () => ok();
    l.onerror = () => ok();
    document.head.append(l);
  });
  return cssP;
}

export async function mount(key, el, route) {
  const box = el.querySelector(`#tpage[data-tpage="${key}"]`);
  if (!box) return;
  const [page] = await Promise.all([PAGES[key](), openTrade(), styles()]);
  // the person may have moved on while the page was loading
  if (!box.isConnected) return;
  if (current && current.box !== box) { try { current.page.unmount?.(); } catch (e) { console.error(e); } }
  current = { key, box, page };
  box.innerHTML = '';
  page.mount(box, route);
}

export function unmount(key) {
  if (!current || current.key !== key) return;
  try { current.page.unmount?.(); } catch (e) { console.error(e); }
  current = null;
}

export async function startBackground() {
  await openTrade();
  const tg = await import('./telegram.js');
  tg.autoStart();
}
