// The trading data: personal, kept apart from the company data. Each member has a database of
// their own on each device, and may copy it to a private repository of their own.
// Keys and tokens never enter this store; they stay in this browser's local storage only.
import { Store } from '../core/store.js';
import { createSync } from '../core/sync.js';
import { store } from '../core/store.js';
import { ctx } from '../core/ctx.js';
import { local } from '../core/util.js';

export const TRADE_COLLECTIONS = ['watch', 'channels', 'inbox', 'signals', 'trades', 'chats', 'notes', 'settings'];
// the raw Telegram inbox and the assistant conversation stay on the device
const SYNCED = TRADE_COLLECTIONS.filter(c => c !== 'inbox' && c !== 'chats');

export const tstore = new Store({
  collections: TRADE_COLLECTIONS,
  prefix: 'nawah-trade',
  logCol: null,
  backupKind: 'nawah-trade-backup',
  backupError: 'هذا الملف ليس نسخة احتياطية من وضع التداول',
});

export const tsync = createSync({
  store: tstore,
  collections: SYNCED,
  cfgKey: 'nawah.tsync',
  keyKey: 'nawah.tsync.key',
  repo: 'nawah-trade-data',
  spaces: s => /^real\./.test(s),
  what: 'بيانات تداولك',
  sharedKeyFrom: () => local.get('nawah.sync.key', ''),
});

// Device secrets, one set per member: market data key, bot token, collector switch.
export const secret = {
  key: name => `nawah.t.${ctx.me?.id || 'anon'}.${name}`,
  get(name, d = '') { return local.get(this.key(name), d); },
  set(name, v) { if (v === '' || v == null) local.del(this.key(name)); else local.set(this.key(name), v); },
};

let opened = '';
let opening = null;
// Opens the database of the current member in the current space (real or demo). Several callers
// (a page and the background collector) may ask at once; they share one opening.
export function openTrade() {
  const space = `${store.space}.${ctx.me?.id || 'anon'}`;
  if (opened === space && !opening) return Promise.resolve(tstore);
  if (opening && opening.space === space) return opening.p;
  const p = (async () => {
    tstore.me = ctx.me;
    await tstore.open(space);
    if (store.space === 'demo' && !tstore.raw('watch').length) {
      const { seedTradeDemo } = await import('./demo-data.js');
      seedTradeDemo(tstore);
    }
    ensureDefaults();
    opened = space;
    tsync.start();
    return tstore;
  })();
  opening = { space, p };
  p.finally(() => { if (opening?.p === p) opening = null; });
  return p;
}

export const DEFAULT_WATCH = [
  ['XAUUSD', '1h'], ['EURUSD', '1h'], ['GBPUSD', '1h'], ['USDJPY', '1h'], ['BTCUSDT', '4h'], ['ETHUSDT', '4h'],
];

function ensureDefaults() {
  if (!tstore.raw('watch').length) {
    DEFAULT_WATCH.forEach(([s, tf], k) => tstore.put('watch', { id: s, s, tf, order: k }, { quiet: true }));
  }
  if (!tstore.raw('settings').some(x => x.id === 'risk')) {
    tstore.put('settings', { id: 'risk', balance: 1000, currency: 'USD', riskPct: 1, maxDailyLossPct: 3, payout: 85, leverage: 100 }, { quiet: true });
  }
  if (!tstore.raw('settings').some(x => x.id === 'forward')) {
    tstore.put('settings', { id: 'forward', footer: '', stripLinks: true, rewrite: true, approve: true }, { quiet: true });
  }
}

export const tsetting = (id, fallback = {}) => tstore.setting(id, fallback);
export const saveTSetting = (id, patch) => tstore.saveSetting(id, { ...tsetting(id), ...patch });
