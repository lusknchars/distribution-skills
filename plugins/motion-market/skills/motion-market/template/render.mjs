// node render.mjs grid            → out/stills/grid_on.png + grid_mid.png (one frame per beat, and half a beat later)
// node render.mjs stills 2.5 9.1  → out/stills/t_*.png (any times, seconds)
// node render.mjs cues            → out/cues.json (the scene's CUES, for tools/mix.py)
// node render.mjs video           → frames/ (SUB subframes per frame), then: sh encode.sh
// env: SIZE=1440 FPS=60 SUB=4 SHUTTER=0.5 WORKERS=8 PAGE=index.html
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SIZE = +(process.env.SIZE || 1440), FPS = +(process.env.FPS || 60), SUB = +(process.env.SUB || 4);
const SHUTTER = +(process.env.SHUTTER || 0.5), WORKERS = +(process.env.WORKERS || 8);
const PAGE = process.env.PAGE || 'index.html';
const mode = process.argv[2] || 'grid';

const browser = await chromium.launch();
async function page() {
  const p = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.join(ROOT, PAGE));
  await p.evaluate(() => window.ready);
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  return p;
}
const shot = async (p, t, file) => {
  await p.evaluate(t => window.seek(t), t);
  await p.locator('#frame').screenshot({ path: file, animations: 'disabled' });
};
const pad = (n, w = 2) => String(n).padStart(w, '0');

if (mode === 'grid' || mode === 'stills') {
  const dir = path.join(ROOT, 'out/stills'); fs.mkdirSync(dir, { recursive: true });
  const p = await page();
  const { L, BPM } = await p.evaluate(() => ({ L: window.L, BPM: window.BPM }));
  if (mode === 'grid') {
    const b = 60 / BPM, n = Math.round(L / b);
    for (const [tag, off] of [['on', 0], ['mid', b / 2]]) {
      const files = [];
      for (let i = 0; i < n; i++) { const f = path.join(dir, `${tag}_${pad(i)}.png`); await shot(p, i * b + off, f); files.push(f); }
      const cols = Math.min(8, Math.ceil(Math.sqrt(n * 1.8)));
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, `${tag}_%02d.png`),
        '-vf', `scale=360:360,tile=${cols}x${Math.ceil(n / cols)}:padding=6:color=white`,
        '-frames:v', '1', path.join(dir, `grid_${tag}.png`)]);
    }
    // bounds audit: every 1/30 s, the cursor and the shape must stay inside the frame
    const bad = await p.evaluate(({ L, SIZE }) => {
      const out = [], m = 24, inside = r => r.left >= m && r.top >= m && r.right <= SIZE - m && r.bottom <= SIZE - m;
      for (let t = 0; t < L; t += 1 / 30) {
        window.seek(t);
        for (const id of ['cursor', 'shape']) {
          const el = document.getElementById(id); if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width && !inside(r)) out.push(`${t.toFixed(2)}s #${id} at [${r.left | 0},${r.top | 0} → ${r.right | 0},${r.bottom | 0}]`);
        }
      }
      return out;
    }, { L, SIZE });
    console.log(bad.length ? `BOUNDS: ${bad.length} samples outside the frame (fix cursor world positions or the camera fit):\n  ` + bad.slice(0, 12).join('\n  ') : 'bounds: cursor and shape stay inside the frame');
    console.log(`grid: ${n} beats → out/stills/grid_on.png (on the beat = the state BEFORE each change) and grid_mid.png (half a beat later = settling)`);
  } else {
    for (const a of process.argv.slice(3)) await shot(p, +a, path.join(dir, `t_${(+a).toFixed(3)}.png`));
    console.log('stills written to out/stills/');
  }
} else if (mode === 'cues') {
  const p = await page();
  const cues = await p.evaluate(() => ({ L: window.L, bpm: window.BPM, cues: window.CUES }));
  fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'out/cues.json'), JSON.stringify(cues, null, 1));
  console.log(`cues: ${cues.cues.length} → out/cues.json`);
} else if (mode === 'video') {
  const dir = path.join(ROOT, 'frames'); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith('s_')) fs.unlinkSync(path.join(dir, f));
  const probe = await page();
  const L = await probe.evaluate(() => window.L); await probe.close();
  const N = Math.round(L * FPS) * SUB;
  let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const p = await page();
    while (next < N) {
      const i = next++;
      const f = Math.floor(i / SUB), k = i % SUB;
      const t = f / FPS + ((k + 0.5) / SUB - 0.5) * SHUTTER / FPS;   // subframes centred on the frame time
      await shot(p, t, path.join(dir, `s_${pad(i, 6)}.png`));
      if (++done % (FPS * SUB) === 0) console.log(`${done}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ FPS, SUB, N }));
  console.log(`frames: ${N} → frames/  next: sh encode.sh`);
}
await browser.close();
