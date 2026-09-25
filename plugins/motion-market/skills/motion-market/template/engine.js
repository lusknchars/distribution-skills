// UI morph motion engine. Everything is a pure function of time: seek(t) may be called in any order.
// Usage: const M = Motion({ bpm: 120, bars: 7 });  →  M.L is the loop length in seconds.
function Motion({ bpm = 120, bars = 7, beatsPerBar = 4 } = {}) {
  const L = bars * beatsPerBar * 60 / bpm;
  const beat = n => n * 60 / bpm;                 // beat index → seconds (use for every cue)
  const mod = (t, m) => ((t % m) + m) % m;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, s) => a + (b - a) * s;
  const easeOut = x => { x = clamp(x, 0, 1); return 1 - (1 - x) ** 3; };

  // [angular frequency ω, damping ratio ζ]. ζ ≥ 0.82 keeps overshoot ≤ ~1.3% ("a tiny overshoot at most").
  const P = {
    morph: [15, .84],   // shape size/radius/color between states
    snap: [26, .86],    // presses, hovers, small state flips
    cam: [8.5, .96],    // camera zoom (slower than the shape so content grows into frame)
    draw: [7, 1],       // strokes drawing themselves
    cur: [17, 1],       // cursor travel (critically damped, no overshoot)
    glide: [8.5, 1],    // slow cursor entry (loop seam)
    drag: [8, 1],       // cursor during a drag
    pull: [4, 1],       // slow drag past a limit
    fast: [30, .84],    // leading edge of a liquid indicator
    slow: [13, .9],     // trailing edge of a liquid indicator
    tip: [18, .9],      // tooltips following a hover
  };

  // Closed-form unit step response of a damped spring.
  function S(t, [w, z]) {
    if (t <= 0) return 0;
    if (t > 4) return 1;
    if (z >= 1) { const u = w * t; return 1 - (1 + u) * Math.exp(-u); }
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
  }

  // Periodic sum-of-springs. evs: [[time, value|array, presetName?], ...] — one entry per target change.
  // Targets are cyclic (the value before the first event is the last event's target) and the previous
  // loop's springs are included, so value AND velocity at t=L equal t=0: the loop never stutters.
  function ptrack(evs) {
    evs = evs.map(e => [e[0], [].concat(e[1]), P[e[2] || 'morph']]).sort((a, b) => a[0] - b[0]);
    const n = evs.length, dim = evs[0][1].length;
    const d = evs.map((e, i) => e[1].map((v, j) => v - evs[(i - 1 + n) % n][1][j]));
    const start = evs[n - 1][1];
    return t => {
      t = mod(t, L);
      const v = start.slice();
      for (const k of [-L, 0]) for (let i = 0; i < n; i++) {
        const s = S(t - evs[i][0] - k, evs[i][2]);
        if (s) for (let j = 0; j < dim; j++) v[j] += d[i][j] * s;
      }
      return dim === 1 ? v[0] : v;
    };
  }

  // Springs between layouts whose targets are functions of time (drags, dynamic positions).
  // segs: [{ T, f: t => ({key: number, ...}), p: presetName }], first T = -1. Keep segs inside one loop.
  // presetFor(key, seg) lets each key ride its own spring (see edgePreset).
  function blend(t, segs, presetFor) {
    const out = { ...segs[0].f(t) };
    let prev = segs[0].f(t);
    for (let i = 1; i < segs.length; i++) {
      const sg = segs[i];
      if (t <= sg.T) break;
      const cur = sg.f(t);
      for (const k in out) out[k] += (cur[k] - prev[k]) * S(t - sg.T, presetFor ? presetFor(k, sg) : P[sg.p]);
      prev = cur;
    }
    return out;
  }

  // Liquid indicator: boxes are {x1,x2,y1,y2}; segments with p:'edge' send the leading edge on P.fast
  // and the trailing edge on P.slow so the element stretches toward its destination.
  function prepareEdges(segs) {
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1].f(segs[i].T), b = segs[i].f(segs[i].T);
      segs[i].dir = Math.sign((b.x1 + b.x2) - (a.x1 + a.x2));
    }
    return segs;
  }
  const edgePreset = (k, sg) => {
    if (sg.p !== 'edge') return P[sg.p];
    if (k === 'x2') return sg.dir > 0 ? P.fast : P.slow;
    if (k === 'x1') return sg.dir > 0 ? P.slow : P.fast;
    return P.morph;
  };
  const box = (cx, cy, w, h) => ({ x1: cx - w / 2, x2: cx + w / 2, y1: cy - h / 2, y2: cy + h / 2 });

  // Content visibility inside a morphing container. Exit takes 100 ms from the morph; enter starts after
  // it (dIn) so swapped text never overlaps. Windows may wrap the seam (tout > L is fine).
  function vis(t, tin, tout, dIn = .09, fin = .2) {
    let a = 0;
    for (const k of [-L, 0, L]) {
      const u = t + k;
      a = Math.max(a, Math.min(easeOut((u - tin - dIn) / fin), 1 - easeOut((u - tout) / .1)));
    }
    return a;
  }

  // Direct manipulation: value from the pointer while held, frozen at release (spring the aftermath
  // with S(t - release)). grab/release are seconds; offset keeps the grab point under the pointer.
  function dragValue(t, { grab, release, pointer, from, map }) {
    if (t < grab) return from;
    const off = pointer(grab) - map.inverse(from);
    return map.forward(pointer(Math.min(t, release)) - off);
  }

  // Camera: the zoom spring may lag the morph; soft-min against the shape's live size so it never
  // outgrows the frame. frame = output size in px, margin = the largest the shape may appear.
  function camera(camSpring, w, h, margin = 1300) {
    const cap = margin / Math.max(w, h), k = .06;
    return -k * Math.log(Math.exp(-camSpring / k) + Math.exp(-cap / k));
  }

  // DOM helpers: cache writes, never add will-change (text the camera scales would go blurry).
  const set = (el, k, v) => { if (el.__s?.[k] !== v) { (el.__s ||= {})[k] = v; el.style[k] = v; } };
  const px = v => v.toFixed(2) + 'px';
  const rgb = c => `rgb(${c[0].toFixed(1)},${c[1].toFixed(1)},${c[2].toFixed(1)})`;
  const rect = (el, x1, y1, x2, y2) => { set(el, 'left', px(x1)); set(el, 'top', px(y1)); set(el, 'width', px(Math.max(0, x2 - x1))); set(el, 'height', px(Math.max(0, y2 - y1))); };
  function layer(el, a, cam = 1) {                   // opacity + blur swap; blur is divided by camera scale
    set(el, 'visibility', a < .002 ? 'hidden' : 'visible');
    set(el, 'opacity', a.toFixed(3));
    const b = (1 - a) * 9 / cam;
    set(el, 'filter', b > .04 ? `blur(${b.toFixed(2)}px)` : 'none');
  }

  return { L, bpm, beat, mod, clamp, lerp, easeOut, P, S, ptrack, blend, prepareEdges, edgePreset, box, vis, dragValue, camera, set, px, rgb, rect, layer };
}

// Standard page contract used by render.mjs: window.L, window.seek(t), window.ready, window.CUES.
function mount({ M, seek, cues = [], soundtrack = 'out/soundtrack.wav', init = () => {} }) {
  window.L = M.L;
  window.BPM = M.bpm;
  window.CUES = cues;
  window.seek = t => seek(M.mod(t, M.L));
  const images = () => Promise.all([...document.images].map(i => i.decode().catch(() => { throw new Error('image failed: ' + i.src); })));
  window.ready = document.fonts.ready.then(images).then(() => { init(); window.seek(0); return true; });   // fonts + images decoded before any frame
  if (location.search.includes('play')) {            // live preview: open index.html?play and click once
    window.ready.then(() => {
      const au = new Audio(soundtrack); au.loop = true;
      const go = () => { au.play().catch(() => {}); const loop = () => { window.seek(au.currentTime); requestAnimationFrame(loop); }; loop(); };
      document.body.addEventListener('click', go, { once: true });
    });
  }
  if (location.search.includes('scrub')) {           // ?scrub&t=8.5 → freeze on a time for inspection
    const t = Number(new URLSearchParams(location.search).get('t') || 0);
    window.ready.then(() => window.seek(t));
  }
}
