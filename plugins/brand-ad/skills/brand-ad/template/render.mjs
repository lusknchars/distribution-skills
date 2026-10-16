// node render.mjs beats            → out/stills/beats_on.png + beats_mid.png (one frame per beat, and half a beat later)
// node render.mjs stills 4 4.25    → out/stills/b_*.png (any BEATS)
// node render.mjs cues             → out/cues.json (window.CUES + BPM + duration, for tools/mix.py)
// node render.mjs video            → frames/ (SUB subframes per frame), then: sh encode.sh
// env: FORMAT=square|portrait|vertical|landscape  FPS=60 SUB=4 SHUTTER=1 WORKERS=6 PAGE=index.html
// Serves the folder over http (opentype.js can't load fonts from file://).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const FORMAT = process.env.FORMAT || 'square', FPS = +(process.env.FPS || 60), SUB = +(process.env.SUB || 4);
const SHUTTER = +(process.env.SHUTTER || 1), WORKERS = +(process.env.WORKERS || 6), PAGE = process.env.PAGE || 'index.html';
const mode = process.argv[2] || 'beats';
const OUT = path.join(ROOT, 'out', FORMAT), FRAMES = path.join(ROOT, 'frames', FORMAT);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const PORT = server.address().port;

const browser = await chromium.launch({ args: ['--disable-gpu-vsync'] });
async function page() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/${PAGE}?render&format=${FORMAT}`);
  await p.evaluate(() => window.ready);
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  const [W, H] = await p.evaluate(() => window.SIZE);
  await p.setViewportSize({ width: W, height: H });
  return p;
}
const shot = async (p, t, file) => { await p.evaluate(t => window.seek(t), t); await p.screenshot({ path: file }); };
const pad = (n, w = 2) => String(n).padStart(w, '0');
const info = p => p.evaluate(() => ({ D: window.DURATION, BPM: window.BPM, cues: window.CUES }));

if (mode === 'beats' || mode === 'stills') {
  const dir = path.join(OUT, 'stills'); fs.mkdirSync(dir, { recursive: true });
  const p = await page(); const { D, BPM } = await info(p), B = 60 / BPM;
  if (mode === 'beats') {
    const n = Math.round(D / B);
    for (const [tag, off] of [['on', 0], ['mid', .5]]) {
      for (let i = 0; i < n; i++) await shot(p, (i + off) * B, path.join(dir, `${tag}_${pad(i)}.png`));
      const cols = Math.min(8, Math.ceil(Math.sqrt(n * 1.6)));
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, `${tag}_%02d.png`),
        '-vf', `scale=320:-2,tile=${cols}x${Math.ceil(n / cols)}:padding=6:color=white`,
        '-frames:v', '1', path.join(dir, `beats_${tag}.png`)]);
    }
    console.log(`${n} beats → ${path.relative(ROOT, dir)}/beats_on.png (ON the beat = the state before each change) and beats_mid.png (half a beat later). Tiles run left→right, top→bottom from beat 0.`);
  } else {
    for (const a of process.argv.slice(3)) await shot(p, +a * B, path.join(dir, `b_${(+a).toFixed(2)}.png`));
    console.log(`stills → ${path.relative(ROOT, dir)}/b_<beat>.png`);
  }
} else if (mode === 'cues') {
  const p = await page(); const c = await info(p);
  fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'out/cues.json'), JSON.stringify({ duration: c.D, bpm: c.BPM, cues: c.cues }, null, 1));
  console.log(`cues: ${c.cues.length} → out/cues.json`);
} else if (mode === 'video') {
  fs.mkdirSync(FRAMES, { recursive: true });
  for (const f of fs.readdirSync(FRAMES)) if (f.startsWith('s_')) fs.unlinkSync(path.join(FRAMES, f));
  const probe = await page(); const { D } = await info(probe); await probe.close();
  const N = Math.ceil(D * FPS) * SUB;   // ceil: the video never ends before the audio let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const p = await page();
    while (next < N) {
      const i = next++, f = Math.floor(i / SUB), k = i % SUB;
      await shot(p, f / FPS + ((k + .5) / SUB - .5) * SHUTTER / FPS, path.join(FRAMES, `s_${pad(i, 6)}.png`));   // subframes centred on the frame
      if (++done % (FPS * SUB) === 0) console.log(`${done}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }));
  fs.writeFileSync(path.join(FRAMES, 'meta.json'), JSON.stringify({ FPS, SUB, N, FORMAT }));
  console.log(`frames: ${N} → ${path.relative(ROOT, FRAMES)}/  next: FORMAT=${FORMAT} sh encode.sh`);
}
await browser.close(); server.close();
