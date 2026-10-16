// Brand Ad kit: time, springs, morphing type, painted strokes, generative backgrounds.
// Everything is a pure function of the beat b, so any frame renders in any order.
// Needs vendor/opentype.min.js and vendor/flubber.min.js loaded first.

// ─────────── frame ───────────
const FORMATS = { square: [1440, 1440], portrait: [1440, 1800], vertical: [1440, 2560], landscape: [2560, 1440] };
const FMT = new URLSearchParams(location.search).get('format') || 'square';
const [W, H] = FORMATS[FMT];
const CX = W / 2, CY = H / 2;

// ─────────── time ───────────
let B = 0.5;                                     // seconds per beat; set by Ad({bpm})
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => { k = clamp(k); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };   // in-out cubic
const easeOut = k => 1 - Math.pow(1 - clamp(k), 3);
// colour that eases between two hex colours (changing fill in one frame pops)
const mixColor = (a, b, k) => { const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), A = h(a), Bc = h(b); k = clamp(k); return `rgb(${A.map((v, i) => Math.round(lerp(v, Bc[i], k))).join(',')})`; };
const expoIn = k => { k = clamp(k); return k === 0 ? 0 : Math.pow(2, 10 * k - 10); };
// closed-form damped spring, 0 → 1. w = stiffness (rad/s), z = damping ratio (≥ .8 for type, .55–.65 for pops)
function spring(t, w = 16, z = 0.6) {
  if (t <= 0) return 0;
  if (z < 1) { const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)); }
  return 1 - Math.exp(-w * t) * (1 + w * t);
}
// value that springs to each new target: keys = [[beat, value, w?, z?], ...]; a sum of springs, so pure in time
function track(b, v0, keys, w = 16, z = 0.6) { let v = v0, p = v0; for (const k of keys) { v += (k[1] - p) * spring((b - k[0]) * B, k[2] ?? w, k[3] ?? z); p = k[1]; } return v; }
const prog = (b, a, len) => clamp((b - a) / len);   // 0→1 between beat a and a+len
const win = (b, a, z) => b >= a && b < z;            // shot window [a, z)

// ─────────── dom ───────────
const NS = 'http://www.w3.org/2000/svg';
let stage;
function div(p, css = {}, html = '', cls = 'A') { const e = document.createElement('div'); e.className = cls; Object.assign(e.style, css); if (html) e.innerHTML = html; p.appendChild(e); return e; }
function sv(p, tag, at = {}) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); p.appendChild(e); return e; }
function S(e, css) { for (const k in css) e.style[k] = css[k]; }
const show = (e, on) => { const v = on ? '' : 'none'; if (e.style.display !== v) e.style.display = v; };
const px = v => v.toFixed(2) + 'px';
function svgLayer(z) { const d = div(stage, { zIndex: z }, '', 'L'); d.svg = sv(d, 'svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }); sv(d.svg, 'defs'); return d; }
const around = (cx, cy, s) => `translate(${cx} ${cy}) scale(${s.toFixed(4)}) translate(${-cx} ${-cy})`;

// ─────────── morphing type: glyph outlines → rings → flubber ───────────
const loadFont = url => new Promise((res, rej) => opentype.load(url, (e, f) => e ? rej(e) : res(f)));
// rings of `text` centred on (cx, cy): outers (filled) and holes (counters), sorted left → right
function ringsOf(font, text, size, cx, cy, opt = {}) {
  const p = font.getPath(text, 0, 0, size, opt), bb = p.getBoundingBox();
  const dx = cx - (bb.x1 + bb.x2) / 2, dy = cy - (bb.y1 + bb.y2) / 2, f = v => v.toFixed(2);
  const rings = []; let d = '', pts = [];
  for (const c of p.commands) {
    if (c.type === 'M') { if (d) rings.push({ d, pts }); d = `M${f(c.x + dx)} ${f(c.y + dy)}`; pts = [[c.x + dx, c.y + dy]]; }
    else if (c.type === 'L') { d += `L${f(c.x + dx)} ${f(c.y + dy)}`; pts.push([c.x + dx, c.y + dy]); }
    else if (c.type === 'Q') { d += `Q${f(c.x1 + dx)} ${f(c.y1 + dy)} ${f(c.x + dx)} ${f(c.y + dy)}`; pts.push([c.x + dx, c.y + dy]); }
    else if (c.type === 'C') { d += `C${f(c.x1 + dx)} ${f(c.y1 + dy)} ${f(c.x2 + dx)} ${f(c.y2 + dy)} ${f(c.x + dx)} ${f(c.y + dy)}`; pts.push([c.x + dx, c.y + dy]); }
    else if (c.type === 'Z') { d += 'Z'; rings.push({ d, pts }); d = ''; pts = []; }
  }
  if (d) rings.push({ d, pts });
  for (const r of rings) { let a = 0, sx = 0, sy = 0; r.pts.forEach((p, i) => { const q = r.pts[(i + 1) % r.pts.length]; a += p[0] * q[1] - q[0] * p[1]; sx += p[0]; sy += p[1]; }); r.area = a / 2; r.cx = sx / r.pts.length; r.cy = sy / r.pts.length; }
  const big = rings.reduce((m, r) => Math.abs(r.area) > Math.abs(m.area) ? r : m, rings[0]), sgn = Math.sign(big.area);
  const outers = rings.filter(r => Math.sign(r.area) === sgn).sort((a, b) => a.cx - b.cx);
  const holes = rings.filter(r => Math.sign(r.area) !== sgn).sort((a, b) => a.cx - b.cx);
  return { outers, holes, bb: { x1: bb.x1 + dx, y1: bb.y1 + dy, x2: bb.x2 + dx, y2: bb.y2 + dy } };
}
// same, shrunk to fit maxW
function fit(font, text, maxW, size, cx, cy, opt = {}) { const bb = font.getPath(text, 0, 0, size, opt).getBoundingBox(), w = bb.x2 - bb.x1; return ringsOf(font, text, w > maxW ? size * maxW / w : size, cx, cy, opt); }
const dot = (x, y, r = 0.6) => ({ d: `M${x - r} ${y}L${x + r} ${y - r}L${x + r} ${y + r}Z`, cx: x, cy: y });
const rectRing = (x, y, w, h) => ({ d: `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`, cx: x + w / 2, cy: y + h / 2 });
const shape = (...outers) => ({ outers, holes: [] });          // a non-type shape (a card, a bar) as morph input
function pairUp(A, Bs) {  // the shorter list spreads across the longer (shapes split/merge); an empty side grows from a point
  if (!A.length && !Bs.length) return [];
  if (!A.length) return Bs.map(b => [dot(b.cx, b.cy), b]);
  if (!Bs.length) return A.map(a => [a, dot(a.cx, a.cy)]);
  const n = Math.max(A.length, Bs.length), pick = (L, k) => L[L.length === n ? k : Math.round(k * (L.length - 1) / Math.max(1, n - 1))];
  return [...Array(n)].map((_, k) => [pick(A, k), pick(Bs, k)]);
}
class Morph {  // A, B: rings → at(t) = [outer path, hole path]; t ≤ 0 and t ≥ 1 return the exact endpoints
  constructor(A, B) {
    const o = { maxSegmentLength: 6 };
    this.o = pairUp(A.outers, B.outers).map(([a, b]) => flubber.interpolate(a.d, b.d, o));
    this.h = pairUp(A.holes, B.holes).map(([a, b]) => flubber.interpolate(a.d, b.d, o));
    this.A = A; this.B = B;
  }
  at(t) {
    const j = L => L.map(r => r.d).join('');
    if (t <= 0) return [j(this.A.outers), j(this.A.holes)];
    if (t >= 1) return [j(this.B.outers), j(this.B.holes)];
    return [this.o.map(f => f(t)).join(''), this.h.map(f => f(t)).join('')];
  }
}
const still = R => new Morph(R, R).at(1);
let _wid = 0;
class Word {  // draws [outer, holes] through a mask, so counters are real holes onto whatever is behind
  constructor(layer, color = 'var(--ink)') {
    const id = 'wm' + (_wid++), defs = layer.svg.querySelector('defs');
    const m = sv(defs, 'mask', { id, maskUnits: 'userSpaceOnUse', x: -4e4, y: -4e4, width: 8e4, height: 8e4 });
    this.mo = sv(m, 'path', { fill: '#fff' }); this.mh = sv(m, 'path', { fill: '#000' });
    this.g = sv(layer.svg, 'g'); this.o = sv(this.g, 'rect', { x: -4e4, y: -4e4, width: 8e4, height: 8e4, fill: color, mask: `url(#${id})` });
  }
  set([o, h], transform = '', on = true) { show(this.g, on); if (!on) return; this.mo.setAttribute('d', o); this.mh.setAttribute('d', h); this.g.setAttribute('transform', transform); }
  color(c) { this.o.setAttribute('fill', c); }
}

// ─────────── painted strokes (always draw on along the path, never fade) ───────────
function paint(layer, d, color, width, extra = {}) {
  return sv(layer.svg, 'path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, ...extra });
}
const draw = (p, k) => { p.setAttribute('stroke-dashoffset', (1 - clamp(k)).toFixed(4)); show(p, k > 0.001); };
function loop(cx, cy, rx, ry, seed = 1) {  // hand-drawn ellipse that overshoots its start
  let d = ''; const n = 64;
  for (let i = 0; i <= n; i++) {
    const t = -0.35 + (2 * Math.PI + 0.75) * i / n, wob = 1 + 0.035 * Math.sin(t * 3 + seed) + 0.02 * Math.sin(t * 7 + seed * 2);
    const x = cx + rx * wob * Math.cos(t) * (1 + 0.06 * i / n), y = cy + ry * wob * Math.sin(t) * (1 + 0.04 * i / n) - 6 * i / n;
    d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d;
}
const tick = (x, y, s) => `M${x} ${y + 0.5 * s}L${x + 0.36 * s} ${y + 0.86 * s}L${x + s} ${y}`;
const cross = (x, y, s) => `M${x} ${y}L${x + s} ${y + s}M${x + s} ${y}L${x} ${y + s}`;
const under = (x1, x2, y) => `M${x1} ${y + 6}C${x1 + (x2 - x1) * .3} ${y - 8} ${x2 - (x2 - x1) * .3} ${y + 20} ${x2} ${y}`;

// ─────────── background: ordered-dither field (pixel grain) ───────────
// palette = 3 RGB colours, dark → light. field(nx, ny, time) → 0..1. Default field = soft marbled bands.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function marble(nx, ny, time) {
  const radius = Math.hypot(nx + .28, ny - .12);
  const m = nx * .72 + ny * .18 + .48 * Math.sin(ny * 1.65 + time * .11) + .22 * Math.sin((nx - ny) * 2.15 - time * .08);
  return .5 + .95 * (Math.sin(m * 6 + time * .34) * .34 + Math.sin((radius + m * .22) * 7.8 - time * .19) * .16);
}
function Dither({ palette, field = marble, cells = 288, speed = 2.3, opacity = .3, blend = 'multiply', z = 0 }) {
  const cw = cells, ch = Math.round(cells * H / W);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  S(c, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', imageRendering: 'pixelated', opacity, mixBlendMode: blend, zIndex: z });
  stage.appendChild(c); const ctx = c.getContext('2d'), img = ctx.createImageData(cw, ch), px = img.data;
  return function drawDither(seconds) {
    const time = seconds * speed; let i = 0;
    for (let y = 0; y < ch; y++) { const ny = (y / ch) * 2 - 1;
      for (let x = 0; x < cw; x++) { const nx = ((x / cw) * 2 - 1) * (W / H);
        const th = ((BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16 - .5) * .24, v = clamp(field(nx, ny, time) + th, 0, .999);
        const col = palette[v < .335 ? 0 : v < .665 ? 1 : 2]; px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255; i += 4; } }
    ctx.putImageData(img, 0, 0);
  };
}

// ─────────── background: honeycomb that glows under a moving light and ripples on hits ───────────
// light: [[beat, x, y], ...] (springs between points, like a cursor). ripples: [[beat, x, y, strength], ...].
// Colours default to Paperraft pink: set glow (rgb list), core and rest (css colour) for another brand.
function Honeycomb({ r = 58, glow = [185, 45, 93], core = [255, 255, 255], rest = 'rgba(150,40,80,.13)', light, ripples, reach = 330, z = 1 }) {
  const mk = (blur) => { const c = document.createElement('canvas'); c.width = W; c.height = H; S(c, { position: 'absolute', left: 0, top: 0, zIndex: z, filter: blur ? 'blur(7px)' : '' }); stage.appendChild(c); return c.getContext('2d'); };
  const gctx = mk(true), cctx = mk(false);
  const seen = new Map(), dx = 1.5 * r, dy = Math.sqrt(3) * r;
  for (let c = -1; c * dx < W + r * 2; c++) for (let q = -1; q * dy < H + dy; q++) {
    const cx = c * dx, cy = q * dy + (c & 1 ? dy / 2 : 0);
    const V = [...Array(6)].map((_, k) => [cx + r * Math.cos(k * Math.PI / 3), cy + r * Math.sin(k * Math.PI / 3)]);
    for (let k = 0; k < 6; k++) { const a = V[k], b = V[(k + 1) % 6], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, key = Math.round(mx) + ',' + Math.round(my); if (!seen.has(key)) seen.set(key, { a, b, mx, my }); }
  }
  const edges = [...seen.values()];
  const lightAt = b => { let x = light[0][1], y = light[0][2], x0 = x, y0 = y;
    for (const k of light.slice(1)) { const s = spring((b - k[0]) * B, 9, .85); x += (k[1] - x0) * s; y += (k[2] - y0) * s; x0 = k[1]; y0 = k[2]; } return [x, y]; };
  return function drawHoneycomb(b) {
    const [lx, ly] = lightAt(b), act = ripples.filter(q => b >= q[0] && (b - q[0]) * B < 1.6), levels = [...Array(12)].map(() => []);
    for (const e of edges) {
      let v = Math.exp(-((Math.hypot(e.mx - lx, e.my - ly) / reach) ** 2));
      for (const q of act) { const tt = (b - q[0]) * B, rad = tt * 1300, w = 70 + tt * 60, dd = Math.hypot(e.mx - q[1], e.my - q[2]); v += 1.25 * q[3] * Math.exp(-(((dd - rad) / w) ** 2)) * Math.exp(-tt * 2); }
      levels[Math.min(11, Math.floor(Math.min(1, v) * 12))].push(e);
    }
    gctx.clearRect(0, 0, W, H); cctx.clearRect(0, 0, W, H); gctx.lineCap = cctx.lineCap = 'round';
    cctx.beginPath(); for (const e of edges) { cctx.moveTo(...e.a); cctx.lineTo(...e.b); } cctx.strokeStyle = rest; cctx.lineWidth = 1.5; cctx.stroke();
    levels.forEach((L, k) => { if (!k || !L.length) return; const a = (k + .5) / 12;
      gctx.beginPath(); cctx.beginPath(); for (const e of L) { gctx.moveTo(...e.a); gctx.lineTo(...e.b); cctx.moveTo(...e.a); cctx.lineTo(...e.b); }
      gctx.strokeStyle = `rgba(${glow},${(a * .55).toFixed(3)})`; gctx.lineWidth = 8 + a * 10; gctx.stroke();
      cctx.strokeStyle = `rgba(${core},${Math.min(1, a * 1.1).toFixed(3)})`; cctx.lineWidth = 1.6 + a * 2.6; cctx.stroke(); });
  };
}

// ─────────── boot ───────────
// Ad({bpm, beats, setup: async () => {...}, frame: b => {...}}) → window.seek(t), window.ready, window.DURATION, window.CUES
function Ad({ bpm, beats, setup, frame, cues = [] }) {
  B = 60 / bpm; window.BPM = bpm; window.DURATION = beats * B; window.FORMAT = FMT; window.SIZE = [W, H];
  window.CUES = cues;                                          // [[beat, sfx, gainDb, trimSec?], ...] → tools/mix.py
  document.documentElement.style.cssText += `;width:${W}px;height:${H}px`;
  stage = document.getElementById('stage'); S(stage, { width: W + 'px', height: H + 'px' });
  window.seek = async t => { frame(t / B, t); };
  window.ready = (async () => {
    await document.fonts.ready; await setup();
    await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
    await window.seek(0);
    const q = new URLSearchParams(location.search);
    if (q.has('t')) await window.seek(+q.get('t'));
    else if (!q.has('render')) { const t0 = performance.now(); const f = async () => { await window.seek(((performance.now() - t0) / 1000) % window.DURATION); requestAnimationFrame(f); }; f(); }
  })();
}
