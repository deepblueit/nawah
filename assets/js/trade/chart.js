// The chart: TradingView Lightweight Charts (Apache 2.0, kept in assets/vendor and loaded on first
// use) with the analysis drawn on it: zones as shaded boxes, swings and patterns as lines, wave and
// harmonic points as labels, levels and the trade plan as price lines, candle signals as markers.
import { tzOffset } from './engine/time.js';
import * as I from './engine/indicators.js';

let libP = null;
export function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (libP) return libP;
  libP = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = new URL('../../vendor/lightweight-charts/lightweight-charts.standalone.production.js', import.meta.url).href;
    s.onload = () => (window.LightweightCharts ? ok(window.LightweightCharts) : fail(new Error('تعذر تشغيل مكتبة الرسم')));
    s.onerror = () => { libP = null; fail(new Error('تعذر تحميل مكتبة الرسم')); };
    document.head.append(s);
  });
  return libP;
}

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function palette() {
  return {
    up: css('--tr-up') || '#2E9E78', down: css('--tr-down') || '#D9534A', text: css('--tr-axis') || '#6B7C8C',
    grid: css('--tr-grid') || 'rgba(120,140,160,.12)', line: css('--tr-line') || 'rgba(120,140,160,.35)',
    gold: css('--gold') || '#C9A76A', info: css('--tr-info') || '#5B8DEF', violet: css('--tr-violet') || '#9B7BEA',
    bull: css('--tr-bull-zone') || 'rgba(46,158,120,.14)', bear: css('--tr-bear-zone') || 'rgba(217,83,74,.14)',
    ink: css('--ink') || '#132D46', bg: css('--tr-bg') || css('--surface') || '#fff',
  };
}

// ---------- primitives drawn in CSS pixels
class Layer {
  constructor(draw, z = 'normal') { this.draw_ = draw; this.z = z; this.data = null; this.view = { renderer: () => ({ draw: target => target.useMediaCoordinateSpace(scope => this.draw_(scope, this)) }), zOrder: () => this.z }; }
  attached({ chart, series, requestUpdate }) { this.chart = chart; this.series = series; this.requestUpdate = requestUpdate; }
  detached() { this.chart = null; }
  paneViews() { return [this.view]; }
  updateAllViews() {}
  set(data) { this.data = data; this.requestUpdate?.(); }
  x(t) { return this.chart ? this.chart.timeScale().timeToCoordinate(t) : null; }
  y(p) { return this.series ? this.series.priceToCoordinate(p) : null; }
}

const ZONE_STYLE = {
  'ob-bull': ['bull', 'كتلة أوامر'], 'ob-bear': ['bear', 'كتلة أوامر'], 'fvg-bull': ['bull', 'فجوة'], 'fvg-bear': ['bear', 'فجوة'],
  demand: ['bull', 'طلب'], supply: ['bear', 'عرض'], 'prz-bull': ['bull', 'منطقة انعكاس'], 'prz-bear': ['bear', 'منطقة انعكاس'],
  ote: ['gold', 'الدخول المثلى'], range: ['line', 'نطاق'], 'plan-tp': ['bull', ''], 'plan-sl': ['bear', ''],
};

function drawZones({ context: ctx, mediaSize }, L) {
  const zs = L.data?.zones || [];
  const pal = L.data?.pal;
  if (!zs.length || !pal) return;
  ctx.save();
  ctx.font = '11px "IBM Plex Sans Arabic", sans-serif';
  ctx.direction = 'rtl';
  for (const z of zs) {
    const x1 = z.t1 != null ? L.x(z.t1) : 0;
    const x2 = z.t2 != null ? L.x(z.t2) : mediaSize.width;
    const y1 = L.y(z.top);
    const y2 = L.y(z.bottom);
    if (y1 == null || y2 == null) continue;
    const left = x1 == null ? 0 : Math.max(0, x1);
    const right = x2 == null ? mediaSize.width : Math.min(mediaSize.width, x2);
    if (right <= left) continue;
    const [tone] = ZONE_STYLE[z.kind] || ['line'];
    const fill = tone === 'bull' ? pal.bull : tone === 'bear' ? pal.bear : tone === 'gold' ? 'rgba(201,167,106,.16)' : 'rgba(120,140,160,.09)';
    ctx.fillStyle = z.kind?.startsWith('plan') ? fill.replace(/[\d.]+\)$/, '0.10)') : fill;
    ctx.fillRect(left, Math.min(y1, y2), right - left, Math.max(1, Math.abs(y2 - y1)));
    if (z.kind === 'range' || z.kind === 'ote') {
      ctx.strokeStyle = tone === 'gold' ? pal.gold : pal.line;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(left + 0.5, Math.min(y1, y2) + 0.5, right - left - 1, Math.abs(y2 - y1));
      ctx.setLineDash([]);
    }
    // the name sits where the zone begins, so stacked zones do not write over each other
    if (z.label && right - left > 90 && Math.abs(y2 - y1) > 15) {
      ctx.fillStyle = tone === 'bull' ? pal.up : tone === 'bear' ? pal.down : tone === 'gold' ? pal.gold : pal.text;
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.globalAlpha = 0.85;
      ctx.fillText(z.label, left + 6, Math.min(y1, y2) + 12);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function drawPaths({ context: ctx }, L) {
  const ps = L.data?.paths || [];
  const labels = L.data?.labels || [];
  const pal = L.data?.pal;
  if (!pal) return;
  ctx.save();
  for (const p of ps) {
    const pts = p.points.map(q => [L.x(q.t), L.y(q.price)]).filter(([x, y]) => x != null && y != null);
    if (pts.length < 2) continue;
    const color = p.kind === 'zigzag' ? pal.line : p.kind === 'harmonic' ? pal.violet : p.kind === 'div' ? pal.gold : p.dir > 0 ? pal.up : p.dir < 0 ? pal.down : pal.info;
    ctx.strokeStyle = color;
    ctx.lineWidth = p.kind === 'zigzag' ? 1 : 1.6;
    ctx.setLineDash(p.kind === 'neck' || p.kind === 'div' ? [5, 4] : []);
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    if (p.kind === 'harmonic' && pts.length >= 4) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.slice(0, 3).forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      pts.slice(2, 5).forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.setLineDash([]);
  ctx.font = '600 11px "IBM Plex Sans Arabic", "IBM Plex Mono", sans-serif';
  ctx.textAlign = 'center';
  for (const lb of labels) {
    const x = L.x(lb.t);
    const y = L.y(lb.price);
    if (x == null || y == null) continue;
    const yy = lb.pos === 'above' ? y - 10 : y + 16;
    const w = ctx.measureText(lb.text).width + 10;
    ctx.fillStyle = lb.kind === 'harmonic' ? pal.violet : lb.kind === 'wave' ? pal.info : lb.kind === 'bos' ? pal.text : lb.kind === 'sweep' ? pal.gold : pal.text;
    if (lb.kind === 'wave' || lb.kind === 'harmonic') {
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect?.(x - w / 2, yy - 11, w, 15, 4);
      if (!ctx.roundRect) ctx.rect(x - w / 2, yy - 11, w, 15);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
    }
    if (lb.kind === 'bos' && lb.toT != null) {
      const x2 = L.x(lb.toT);
      if (x2 != null) {
        ctx.strokeStyle = pal.text; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillText(lb.text, (x + x2) / 2, lb.pos === 'above' ? y - 4 : y + 12);
        continue;
      }
    }
    ctx.fillText(lb.text, x, yy);
  }
  ctx.restore();
}

function drawBand({ context: ctx }, L) {
  const pts = L.data?.points || [];
  const pal = L.data?.pal;
  if (pts.length < 2 || !pal) return;
  ctx.save();
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const xa = L.x(a.t);
    const xb = L.x(b.t);
    if (xa == null || xb == null) continue;
    const ya1 = L.y(a.a); const ya2 = L.y(a.b); const yb1 = L.y(b.a); const yb2 = L.y(b.b);
    if ([ya1, ya2, yb1, yb2].some(v => v == null)) continue;
    ctx.fillStyle = b.a >= b.b ? pal.bull : pal.bear;
    ctx.beginPath();
    ctx.moveTo(xa, ya1); ctx.lineTo(xb, yb1); ctx.lineTo(xb, yb2); ctx.lineTo(xa, ya2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------- the chart controller
export async function createTradeChart(el, { digits = 5, tz = 'UTC', onCrosshair } = {}) {
  const LW = await loadLib();
  let pal = palette();
  // one offset for the whole series: a per-bar daylight saving shift could repeat an hour and break the time order
  const off = tzOffset(tz, Math.floor(Date.now() / 1000));
  const shift = t => t + off;
  const chart = LW.createChart(el, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: pal.text, fontSize: 11, fontFamily: '"IBM Plex Mono", "IBM Plex Sans Arabic", ui-monospace, monospace', attributionLogo: true, panes: { separatorColor: pal.grid, separatorHoverColor: pal.line, enableResize: true } },
    grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
    rightPriceScale: { borderColor: pal.grid, scaleMargins: { top: 0.08, bottom: 0.12 } },
    timeScale: { borderColor: pal.grid, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
    crosshair: { mode: LW.CrosshairMode.Normal },
    localization: { locale: 'en-US' },
  });
  const candles = chart.addSeries(LW.CandlestickSeries, { upColor: pal.up, downColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down, borderVisible: false, priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits } });
  const zones = new Layer(drawZones, 'bottom');
  const paths = new Layer(drawPaths, 'top');
  candles.attachPrimitive(zones);
  candles.attachPrimitive(paths);
  const markers = LW.createSeriesMarkers(candles, []);
  let volume = null;
  let data = [];
  let priceLines = [];
  let overlays = null;
  let layers = {};
  const ind = {};
  let band = null;

  const self = {
    chart, candles,
    setData(cs, { fit = false } = {}) {
      data = cs;
      candles.setData(cs.map(c => ({ time: shift(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
      const hasVol = cs.slice(-50).some(c => c.v > 0);
      if (hasVol && layers.volume !== false) {
        if (!volume) {
          volume = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
          chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
        }
        volume.setData(cs.map(c => ({ time: shift(c.t), value: c.v, color: c.c >= c.o ? withAlpha(pal.up, 0.35) : withAlpha(pal.down, 0.35) })));
      } else if (volume) { chart.removeSeries(volume); volume = null; }
      self.drawIndicators();
      if (fit) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, cs.length - 160), to: cs.length + 6 });
    },
    update(c) {
      if (!data.length) return;
      const last = data[data.length - 1];
      if (c.t < last.t) return;
      if (c.t === last.t) data[data.length - 1] = c; else data.push(c);
      candles.update({ time: shift(c.t), open: c.o, high: c.h, low: c.l, close: c.c });
      if (volume) volume.update({ time: shift(c.t), value: c.v, color: c.c >= c.o ? withAlpha(pal.up, 0.35) : withAlpha(pal.down, 0.35) });
    },
    setLayers(l) { layers = { ...l }; self.drawIndicators(); self.drawOverlays(); },
    setOverlays(o) { overlays = o; self.drawOverlays(); },
    drawOverlays() {
      for (const pl of priceLines) candles.removePriceLine(pl);
      priceLines = [];
      const o = overlays;
      if (!o) { zones.set(null); paths.set(null); markers.setMarkers([]); return; }
      const S = x => ({ ...x, t1: x.t1 != null ? shift(x.t1) : null, t2: x.t2 != null ? shift(x.t2) : null });
      const zs = [];
      if (layers.zones !== false) zs.push(...o.zones.map(S));
      if (layers.plan !== false && o.plan) {
        const p = o.plan;
        const far = p.targets[p.targets.length - 1];
        zs.push({ kind: 'plan-tp', t1: shift(p.t), t2: null, top: Math.max(p.entry, far), bottom: Math.min(p.entry, far) });
        zs.push({ kind: 'plan-sl', t1: shift(p.t), t2: null, top: Math.max(p.entry, p.stop), bottom: Math.min(p.entry, p.stop) });
      }
      zones.set({ zones: zs, pal });
      const pathData = { paths: [], labels: [], pal };
      if (layers.patterns !== false) {
        pathData.paths.push(...o.paths.filter(p => p.kind !== 'zigzag' || layers.zigzag !== false).map(p => ({ ...p, points: p.points.map(q => ({ ...q, t: shift(q.t) })) })));
        pathData.labels.push(...o.labels.map(l => ({ ...l, t: shift(l.t), toT: l.toT != null ? shift(l.toT) : null })));
      }
      paths.set(pathData);
      const line = (price, color, title, style = 2, width = 1, axis = true) => priceLines.push(candles.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: axis, title }));
      if (layers.levels !== false) {
        // levels carry their name on the line only; the price axis keeps the plan's labels readable
        for (const lv of o.levels) line(lv.price, lv.kind === 'support' ? withAlpha(pal.up, 0.7) : lv.kind === 'resistance' ? withAlpha(pal.down, 0.7) : withAlpha(pal.gold, 0.8), '', lv.kind === 'pivot' ? 1 : 2, 1, false);
      }
      if (layers.plan !== false && o.plan) {
        const p = o.plan;
        line(p.entry, pal.info, 'الدخول', 0, 2);
        line(p.stop, pal.down, 'الوقف', 0, 2);
        p.targets.forEach((t, k) => line(t, pal.up, `الهدف ${k + 1}`, 0, 1));
      }
      if (layers.markers !== false) {
        // names only on the latest three signals; older ones keep their arrow
        const ms = o.markers.slice().sort((a, b) => a.t - b.t);
        markers.setMarkers(ms.map((m, k) => ({ time: shift(m.t), position: m.pos, shape: m.shape, color: m.kind === 'bull' ? pal.up : pal.down, text: k >= ms.length - 3 ? m.text : '', size: 0.8 })));
      } else markers.setMarkers([]);
    },
    drawIndicators() {
      if (!data.length) return;
      const C = data.map(c => c.c);
      const T = data.map(c => shift(c.t));
      const lineOf = (key, values, color, opts = {}, pane = 0) => {
        if (!ind[key]) ind[key] = chart.addSeries(LW.LineSeries, { color, lineWidth: opts.width || 1.4, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, lineStyle: opts.style || 0, ...(opts.scale ? { priceScaleId: opts.scale } : {}) }, pane);
        ind[key].setData(values.map((v, i) => (v == null || !Number.isFinite(v) ? { time: T[i] } : { time: T[i], value: v })));
        return ind[key];
      };
      const drop = (...keys) => { for (const k of keys) if (ind[k]) { chart.removeSeries(ind[k]); delete ind[k]; } };
      if (layers.ema) { lineOf('e20', I.ema(C, 20), pal.gold); lineOf('e50', I.ema(C, 50), pal.info); lineOf('e200', I.ema(C, 200), pal.violet, { width: 1.8 }); } else drop('e20', 'e50', 'e200');
      if (layers.bb) { const b = I.bollinger(C); lineOf('bbu', b.upper, pal.line); lineOf('bbm', b.mid, pal.line, { style: 2 }); lineOf('bbl', b.lower, pal.line); } else drop('bbu', 'bbm', 'bbl');
      if (layers.ichimoku) {
        const ich = I.ichimoku(data);
        lineOf('tk', ich.tenkan, pal.info, { width: 1 });
        lineOf('kj', ich.kijun, pal.down, { width: 1 });
        const step = data.length > 1 ? data[data.length - 1].t - data[data.length - 2].t : 3600;
        const times = [...data.map(c => c.t), ...Array.from({ length: ich.shift }, (_, k) => data[data.length - 1].t + step * (k + 1))].map(shift);
        const spanA = ich.senkouA.map((v, i) => (v == null ? { time: times[i] } : { time: times[i], value: v }));
        if (!ind.sa) ind.sa = chart.addSeries(LW.LineSeries, { color: withAlpha(pal.up, 0.6), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        if (!ind.sb) ind.sb = chart.addSeries(LW.LineSeries, { color: withAlpha(pal.down, 0.6), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        ind.sa.setData(spanA);
        ind.sb.setData(ich.senkouB.map((v, i) => (v == null ? { time: times[i] } : { time: times[i], value: v })));
        if (!band) { band = new Layer(drawBand, 'bottom'); ind.sa.attachPrimitive(band); }
        band.set({ points: ich.senkouA.map((v, i) => ({ t: times[i], a: v, b: ich.senkouB[i] })).filter(x => x.a != null && x.b != null), pal });
      } else { if (band && ind.sa) { ind.sa.detachPrimitive(band); band = null; } drop('tk', 'kj', 'sa', 'sb'); }
      if (layers.vwap && data.some(c => c.v > 0)) lineOf('vwap', I.vwap(data), pal.gold, { style: 2 }); else drop('vwap');
      if (layers.supertrend) { const st = I.supertrend(data); lineOf('st', st.line, pal.text, { width: 1.2 }); } else drop('st');
      // oscillator panes: when the set changes they are rebuilt, so each keeps a pane of its own
      const oscKey = ['rsi', 'macd', 'stoch'].filter(k => layers[k]).join();
      if (oscKey !== self._osc) { drop('rsi', 'mh', 'ml', 'ms', 'sk', 'sd'); self._osc = oscKey; }
      let pane = 1;
      if (layers.rsi) {
        const s = lineOf('rsi', I.rsi(C), pal.violet, {}, pane);
        s.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
        if (!s._lines) s._lines = [70, 50, 30].map(v => s.createPriceLine({ price: v, color: pal.grid, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' }));
        pane++;
      } else drop('rsi');
      if (layers.macd) {
        const m = I.macd(C);
        if (!ind.mh) ind.mh = chart.addSeries(LW.HistogramSeries, { lastValueVisible: false, priceLineVisible: false }, pane);
        ind.mh.setData(m.hist.map((v, i) => (v == null ? { time: T[i] } : { time: T[i], value: v, color: v >= 0 ? withAlpha(pal.up, 0.5) : withAlpha(pal.down, 0.5) })));
        ind.mh.applyOptions({ priceFormat: { type: 'price', precision: digits + 1, minMove: 10 ** -(digits + 1) } });
        lineOf('ml', m.line, pal.info, { width: 1.2 }, pane).applyOptions({ priceFormat: { type: 'price', precision: digits + 1, minMove: 10 ** -(digits + 1) } });
        lineOf('ms', m.signal, pal.gold, { width: 1.2 }, pane).applyOptions({ priceFormat: { type: 'price', precision: digits + 1, minMove: 10 ** -(digits + 1) } });
        pane++;
      } else drop('mh', 'ml', 'ms');
      if (layers.stoch) { const s = I.stochastic(data); lineOf('sk', s.k, pal.info, { width: 1.2 }, pane).applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } }); lineOf('sd', s.d, pal.down, { width: 1.2 }, pane); pane++; } else drop('sk', 'sd');
      const panes = chart.panes();
      for (let k = 1; k < panes.length; k++) panes[k].setHeight?.(Math.max(90, Math.round(el.clientHeight * 0.18)));
    },
    fit() { chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 160), to: data.length + 6 }); },
    retheme() {
      pal = palette();
      chart.applyOptions({ layout: { textColor: pal.text, panes: { separatorColor: pal.grid } }, grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } }, rightPriceScale: { borderColor: pal.grid }, timeScale: { borderColor: pal.grid } });
      candles.applyOptions({ upColor: pal.up, downColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down });
      if (data.length) self.setData(data);
      self.drawOverlays();
    },
    destroy() { try { chart.remove(); } catch (_) { /* already gone */ } },
  };

  chart.subscribeCrosshairMove(param => {
    if (!onCrosshair) return;
    const bar = param?.time != null ? param.seriesData?.get(candles) : null;
    onCrosshair(bar ? { o: bar.open, h: bar.high, l: bar.low, c: bar.close, t: param.time } : null);
  });
  return self;
}

function withAlpha(color, a) {
  if (!color) return color;
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4 ? color.slice(1).split('').map(x => x + x).join('') : color.slice(1);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color;
}
