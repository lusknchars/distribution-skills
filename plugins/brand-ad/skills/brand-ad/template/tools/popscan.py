"""Pop scan: flags single-frame jumps (a morph that cut, an element that popped in/out, a seam).
For each frame, d = mean |frame - previous| on a small gray copy. A spike is d > 3x the larger of its neighbours' d and > 0.6.
Usage: python3 tools/popscan.py out/square/ad.mp4 [--allow 4.0,9.5]   (--allow = beats where a hard cut is intended)"""
import json, os, subprocess, sys
import numpy as np
f = sys.argv[1]; allow = []
if '--allow' in sys.argv: allow = [float(x) for x in sys.argv[sys.argv.index('--allow') + 1].split(',')]
bpm = json.load(open('out/cues.json'))['bpm'] if os.path.exists('out/cues.json') else None
fps = eval(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip())
raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f, '-vf', 'scale=240:-2,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
W, H = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip().split(','))
w = 240; h = round(H * 240 / W / 2) * 2
fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
d = np.abs(np.diff(fr, axis=0)).mean((1, 2))
spikes = []
for i in range(1, len(d) - 1):
    if d[i] > 0.6 and d[i] > 3 * max(d[i - 1], d[i + 1]):
        t = (i + 1) / fps; b = t * bpm / 60 if bpm else None
        if b is not None and any(abs(b - a) < 0.15 for a in allow): continue
        spikes.append((i + 1, t, b, d[i], max(d[i - 1], d[i + 1])))
for n, t, b, v, nb in spikes:
    print(f"POP frame {n}  t={t:.3f}s" + (f"  beat {b:.2f}" if b is not None else '') + f"  diff {v:.2f} vs neighbours {nb:.2f}")
print(f"pop scan: {len(fr)} frames, {len(spikes)} spikes" + ('  CLEAN' if not spikes else '  → open those beats with node render.mjs stills'))
sys.exit(1 if spikes else 0)
