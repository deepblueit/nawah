// What the outside writing service may ask Nawah for while it composes a reply. Every answer
// comes from the engine on this device; the service never reaches prices or records directly.
import { tfInfo, TIMEFRAMES } from './engine/symbols.js';
import { runAnalysis, analysisFacts, libraryFacts, computeSize, sizeFacts, binaryFacts, sessionFacts, channelFacts, journalFacts, signalFacts, resolveSymbol } from './facts.js';

const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = description => ({ type: 'string', description });
const num = description => ({ type: 'number', description });
const TF = { type: 'string', enum: TIMEFRAMES.map(t => t.k), description: 'Candle timeframe. Default 1h.' };
const SYMBOL = str('Symbol code or name, for example XAUUSD, EURUSD, GBPJPY, BTCUSDT, or an Arabic name such as الذهب.');

export const TOOL_DEFS = [
  fn('analyze_symbol', 'Run the Nawah engine on one symbol and timeframe: verdict, trend, the sixteen schools, levels, zones, patterns, trade plan, binary-options reading and the session.', { symbol: SYMBOL, timeframe: TF }, ['symbol']),
  fn('search_library', 'Search the Nawah technical-analysis library for a concept, pattern, school or trick, in Arabic or English.', { query: str('What to look up.') }, ['query']),
  fn('position_size', 'Position size from balance, risk percent and stop distance. Anything left out comes from the saved risk settings and the current price.', { symbol: SYMBOL, balance: num('Account balance in USD.'), risk_percent: num('Risk per trade in percent.'), stop_pips: num('Stop distance in pips.'), entry: num('Entry price.'), stop: num('Stop price.') }, ['symbol']),
  fn('binary_math', 'Break-even win rate for a binary-options payout, and the real numbers of a martingale ladder when steps are given.', { payout_percent: num('Payout in percent.'), win_rate_percent: num('Assumed win rate in percent.'), stake: num('First stake.'), martingale_steps: { type: 'integer', description: 'Number of doublings after the first trade.' } }),
  fn('market_sessions', 'The trading sessions now: which are open, overlaps, killzone and market quality, with times in the person\'s time zone.'),
  fn('my_channels', 'Verified performance of the Telegram channels the person follows, next to what each channel claimed.'),
  fn('my_journal', 'Statistics from the person\'s own trading journal.'),
  fn('check_signal', 'Read a trading signal text and check it against current prices.', { text: str('The signal as written.') }, ['text']),
];

const LABELS = {
  analyze_symbol: a => `يحلل ${resolveSymbol(a.symbol)?.s || a.symbol || ''} على ${tfInfo(a.timeframe || '1h').frame}`,
  search_library: a => `يبحث في المكتبة عن ${a.query || ''}`,
  position_size: () => 'يحسب حجم الصفقة',
  binary_math: () => 'يحسب أرقام الخيارات الثنائية',
  market_sessions: () => 'يراجع الجلسات',
  my_channels: () => 'يراجع أداء قنواتك',
  my_journal: () => 'يراجع يومياتك',
  check_signal: () => 'يفحص التوصية',
};
export const toolLabel = (name, args) => (LABELS[name] ? LABELS[name](args || {}) : 'يجلب بيانات من المحرك');

export async function runTool(name, a = {}, { mem = {} } = {}) {
  switch (name) {
    case 'analyze_symbol': {
      if (/\botc\b/i.test(String(a.symbol || ''))) return { error: 'OTC prices come from the broker and cannot be analysed with market data' };
      const info = resolveSymbol(a.symbol);
      if (!info) return { error: `unknown symbol: ${a.symbol}` };
      return analysisFacts(await runAnalysis(info.s, tfInfo(a.timeframe || '1h').k));
    }
    case 'search_library': return libraryFacts(String(a.query || ''));
    case 'position_size': {
      const info = resolveSymbol(a.symbol);
      if (!info) return { error: `unknown symbol: ${a.symbol}` };
      return sizeFacts(await computeSize({ symbol: info.s, balance: a.balance, riskPct: a.risk_percent, stopPips: a.stop_pips, entry: a.entry, stop: a.stop, mem }));
    }
    case 'binary_math': return binaryFacts({ payout: a.payout_percent, winRate: a.win_rate_percent, stake: a.stake, steps: a.martingale_steps });
    case 'market_sessions': return sessionFacts();
    case 'my_channels': return channelFacts();
    case 'my_journal': return journalFacts();
    case 'check_signal': return signalFacts(String(a.text || ''));
    default: return { error: `unknown tool: ${name}` };
  }
}
