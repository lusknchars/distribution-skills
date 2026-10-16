"""Song tools for a fast ad (numpy + ffmpeg only).
  python3 tools/song.py scan [mixkit-url] [--near 140]       download Mixkit previews, rank by tempo closeness + pulse
  python3 tools/song.py grid  audio/<song>.mp3                beat period + phase → audio/grid.json
  python3 tools/song.py hits  audio/<song>.mp3                the biggest hits (drops, returns), on the beat grid
  python3 tools/song.py check audio/<song>.mp3 T             loudness bars around T: the hit is where the bars jump
  python3 tools/song.py edit  audio/<song>.mp3 --start S --beats N [--hit T --lead 2] [--tail 4]
        → audio/edit.json. Plays N beats from S; with --hit, the last `lead` beats before the hit T are spliced in,
          so the hit lands exactly on ad beat N. Ad length = N + tail beats. Splices sit on beats (no tempo change).
Mixkit music is free under the Mixkit license; record the title and id for credits."""
import argparse, html, json, os, re, subprocess, sys, urllib.request
import numpy as np
SR, HOP = 22050, 256
FPS = SR / HOP
LAG = (1024 / 2 + HOP) / SR   # an onset-envelope frame reports ~35 ms before the sound it measures
UA = {'User-Agent': 'Mozilla/5.0'}

def load(p):
    return np.frombuffer(subprocess.run(['ffmpeg', '-v', 'quiet', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout, np.float32)
def frames(x, N=1024):
    n = (len(x) - N) // HOP
    return np.lib.stride_tricks.as_strided(x, (n, N), (x.strides[0] * HOP, x.strides[0])) * np.hanning(N)
def onset_env(x):
    S = np.log1p(100 * np.abs(np.fft.rfft(frames(x), axis=1)))
    f = np.maximum(0, np.diff(S, axis=0)).sum(1); f -= np.convolve(f, np.ones(16) / 16, 'same')
    f = np.maximum(f, 0); return f / (f.std() + 1e-9)
def tempo(f, lo=100, hi=180):
    ac = np.correlate(f, f, 'full')[len(f) - 1:]; ac /= ac[0]
    bpm = 60 * FPS / np.maximum(np.arange(len(ac)), 1)
    i = int(np.argmax(np.where((bpm >= lo) & (bpm <= hi), ac, -1))); a, b, c = ac[i - 1], ac[i], ac[i + 1]
    return 60 * FPS / (i + .5 * (a - c) / (a - 2 * b + c)), float(ac[i])
def beatgrid(f):
    bpm0, best = tempo(f)[0], None
    for bpm in np.arange(bpm0 - .5, bpm0 + .5, .005):
        P = 60 / bpm * FPS
        for ph in np.arange(0, P, .25):
            sc = f[np.round(ph + P * np.arange(int((len(f) - ph) / P))).astype(int)].mean()
            if best is None or sc > best[0]: best = (sc, bpm, ph)
    return best[1], best[2] / FPS + LAG

def scan(a):
    os.makedirs('audio', exist_ok=True)
    page = urllib.request.urlopen(urllib.request.Request(a.url, headers=UA)).read().decode('utf8', 'ignore')
    recs = re.findall(r'"name":"([^"]+)","genre":"([^"]+)","byArtist":"([^"]+)","duration":"([^"]+)","url":"(https://assets\.mixkit\.co/music/(\d+)/\d+\.mp3)"', page)
    out = []
    for name, genre, artist, dur, url, i in recs:
        p = f'audio/{i}.mp3'
        if not os.path.exists(p): open(p, 'wb').write(urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read())
        bpm, st = tempo(onset_env(load(p)))
        out.append(dict(id=i, name=html.unescape(name), artist=html.unescape(artist), bpm=round(bpm, 2), pulse=round(st, 3)))
    out.sort(key=lambda r: (abs(r['bpm'] - a.near) > 8, -r['pulse']))
    for r in out: print(f"{r['id']:>5} {r['bpm']:7.2f} BPM  pulse={r['pulse']:.2f}  {r['name']} — {r['artist']}")
    print('\nPick a steady track with a clear hit (then: song.py hits audio/<id>.mp3)')

def grid(a):
    bpm, ph = beatgrid(onset_env(load(a.file)))
    json.dump(dict(file=a.file, bpm=round(bpm, 3), phase=round(ph, 4)), open('audio/grid.json', 'w'))
    print(f"bpm {bpm:.3f}  beat = {60 / bpm:.4f}s  first beat at {ph:.4f}s  → audio/grid.json")

def hits(a):
    x = load(a.file); f = onset_env(x); bpm, ph = beatgrid(f); B = 60 / bpm
    beats = np.arange(ph, len(x) / SR - 4 * B, B)
    rms = lambda t0, t1: float(np.sqrt((x[int(max(0, t0) * SR):int(t1 * SR)] ** 2).mean() + 1e-12))
    rows = []
    for t in beats[8:]:
        jump = rms(t, t + 2 * B) / rms(t - 4 * B, t); i = int((t - LAG) * FPS); o = f[i - 2:i + 3].max()
        rows.append((jump * (1 + o / 4), t, jump, o))
    rows.sort(reverse=True); taken = []
    print(f"bpm {bpm:.3f}  beat {B:.4f}s\n  time      jump   onset   (jump = loudness of the next 2 beats / the 4 before)")
    for s, t, j, o in rows:
        if any(abs(t - u) < 8 * B for u in taken): continue
        taken.append(t); print(f"  {t:7.3f}s  x{j:4.2f}  {o:5.1f}")
        if len(taken) == 8: break
    print('Land the logo on a hit with a big jump after a quieter stretch (a drop, or the return after a breakdown).')

def check(a):
    x = load(a.file)
    for t in np.arange(a.t - .4, a.t + .4, .02):
        r = float(np.sqrt((x[int(t * SR):int((t + .02) * SR)] ** 2).mean())); print(f"{t:7.2f}s {'#' * int(r * 150)}")

def edit(a):
    g = json.load(open('audio/grid.json')) if os.path.exists('audio/grid.json') and json.load(open('audio/grid.json'))['file'] == a.file else None
    bpm = g['bpm'] if g else beatgrid(onset_env(load(a.file)))[0]; B = 60 / bpm
    if a.hit is None: segs = [[a.start, a.start + (a.beats + a.tail) * B]]
    else: segs = [[a.start, a.start + (a.beats - a.lead) * B], [a.hit - a.lead * B, a.hit + a.tail * B]]
    json.dump(dict(song=a.file, bpm=bpm, segments=segs, beats=a.beats + a.tail, hit_beat=a.beats if a.hit else None), open('audio/edit.json', 'w'), indent=1)
    print(f"audio/edit.json: {len(segs)} segment(s), {(a.beats + a.tail) * B:.3f}s at {bpm:.3f} BPM." +
          (f"  The hit lands on ad beat {a.beats}." if a.hit is not None else '') + f"  In index.html: bpm: {bpm:.3f}, beats: {a.beats + a.tail}")

ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest='cmd', required=True)
p = sp.add_parser('scan'); p.add_argument('url', nargs='?', default='https://mixkit.co/free-stock-music/tag/energetic/'); p.add_argument('--near', type=float, default=140); p.set_defaults(fn=scan)
p = sp.add_parser('grid'); p.add_argument('file'); p.set_defaults(fn=grid)
p = sp.add_parser('hits'); p.add_argument('file'); p.set_defaults(fn=hits)
p = sp.add_parser('check'); p.add_argument('file'); p.add_argument('t', type=float); p.set_defaults(fn=check)
p = sp.add_parser('edit'); p.add_argument('file'); p.add_argument('--start', type=float, required=True); p.add_argument('--beats', type=int, required=True)
p.add_argument('--hit', type=float); p.add_argument('--lead', type=int, default=2); p.add_argument('--tail', type=int, default=4); p.set_defaults(fn=edit)
a = ap.parse_args(); a.fn(a)
