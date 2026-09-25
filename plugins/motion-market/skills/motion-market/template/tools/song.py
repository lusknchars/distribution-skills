"""Song tools (numpy + ffmpeg only).
  python3 tools/song.py scan  [mixkit-tag-url] [--near 120]   download previews, rank by tempo closeness + pulse strength
  python3 tools/song.py grid  audio/<id>.mp3 [--bars 7]        beat period/phase, downbeats, best N-bar windows
  python3 tools/song.py cut   audio/<id>.mp3 --start S --bpm B [--bars 7] [--target 120]
                                                               → audio/song.wav, exactly bars*4 beats at target BPM, then re-verifies the grid
Mixkit music is free for commercial use under the Mixkit license; record title/artist for credits.
"""
import argparse, html, json, os, re, subprocess, sys, urllib.request
import numpy as np
SR, HOP = 22050, 256
FPS = SR / HOP
UA = {'User-Agent': 'Mozilla/5.0'}

def load(p, sr=SR):
    b = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', p, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(b, np.float32)

def frames(x, N=1024):
    n = (len(x) - N) // HOP
    return np.lib.stride_tricks.as_strided(x, (n, N), (x.strides[0] * HOP, x.strides[0])) * np.hanning(N)

def onset_env(x):  # spectral flux on log magnitude, local-mean removed
    S = np.log1p(100 * np.abs(np.fft.rfft(frames(x), axis=1)))
    f = np.maximum(0, np.diff(S, axis=0)).sum(1)
    f -= np.convolve(f, np.ones(16) / 16, 'same')
    f = np.maximum(f, 0); return f / (f.std() + 1e-9)

def kick_env(x):  # < 150 Hz flux: downbeats carry the kick
    S = np.abs(np.fft.rfft(frames(x), axis=1)); k = int(150 * 1024 / SR)
    f = np.maximum(0, np.diff(np.log1p(S[:, 1:k].sum(1)))); return f / (f.std() + 1e-9)

def tempo(f, lo=90, hi=160):
    ac = np.correlate(f, f, 'full')[len(f) - 1:]; ac /= ac[0]
    lags = np.arange(len(ac)); bpm = 60 * FPS / np.maximum(lags, 1)
    i = int(np.argmax(np.where((bpm >= lo) & (bpm <= hi), ac, -1)))
    a, b, c = ac[i - 1], ac[i], ac[i + 1]; d = .5 * (a - c) / (a - 2 * b + c)
    return 60 * FPS / (i + d), float(ac[i])

def scan(a):
    os.makedirs('audio', exist_ok=True)
    page = urllib.request.urlopen(urllib.request.Request(a.url, headers=UA)).read().decode('utf8', 'ignore')
    recs = re.findall(r'"name":"([^"]+)","genre":"([^"]+)","byArtist":"([^"]+)","duration":"([^"]+)","url":"(https://assets\.mixkit\.co/music/(\d+)/\d+\.mp3)"', page)
    out = []
    for name, genre, artist, dur, url, i in recs:
        p = f'audio/{i}.mp3'
        if not os.path.exists(p):
            open(p, 'wb').write(urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read())
        f = onset_env(load(p)); bpm, st = tempo(f); h = len(f) // 2
        drift = abs(tempo(f[:h])[0] - tempo(f[h:])[0])
        out.append(dict(id=i, name=json.loads(f'"{html.unescape(name)}"'), artist=json.loads(f'"{html.unescape(artist)}"'), genre=genre, dur=dur, bpm=round(bpm, 2), pulse=round(st, 3), drift=round(drift, 2)))
    out.sort(key=lambda r: (abs(r['bpm'] - a.near) > 4, r['drift'] > 1, -r['pulse']))
    for r in out:
        print(f"{r['id']:>5} {r['bpm']:7.2f} BPM  pulse={r['pulse']:.2f}  drift={r['drift']:5.2f}  {r['name']} — {r['artist']} ({r['genre']})")
    json.dump(out, open('audio/scan.json', 'w'), indent=1)
    print('\nPick: |bpm-target| ≤ 4, drift < 0.3 (steady), highest pulse. Then: song.py grid audio/<id>.mp3')

def grid(a):
    x = load(a.file); f = onset_env(x); lo = kick_env(x)
    bpm0 = a.bpm or tempo(f)[0]
    best = None
    for bpm in np.arange(bpm0 - .6, bpm0 + .6, .005):
        P = 60 / bpm * FPS
        for ph in np.arange(0, P, .25):
            idx = np.round(ph + P * np.arange(int((len(f) - ph) / P))).astype(int)
            sc = f[idx].mean()
            if best is None or sc > best[0]: best = (sc, bpm, ph)
    sc, bpm, ph = best; P = 60 / bpm * FPS
    beats = (ph + P * np.arange(int((len(f) - ph) / P))) / FPS
    bi = np.round(beats * FPS).astype(int); bi = bi[bi < len(lo)]
    acc = [float(lo[bi[k::4]].mean()) for k in range(4)]; db = int(np.argmax(acc))
    downs = beats[db::4]
    rms = lambda t0, t1: float(np.sqrt((x[int(t0 * SR):int(t1 * SR)] ** 2).mean()))
    wins = []
    for j in range(len(downs) - a.bars - 1):
        r = [rms(downs[j + k], downs[j + k + 1]) for k in range(a.bars)]
        seg = bi[(bi >= downs[j] * FPS) & (bi < downs[j + a.bars] * FPS)]
        wins.append(dict(start=round(float(downs[j]), 4), loud=round(float(np.mean(r)), 4), even=round(float(np.std(r) / np.mean(r)), 3), pulse=round(float(f[seg].mean()), 2)))
    wins.sort(key=lambda w: -(w['pulse'] * w['loud'] / (1 + 3 * w['even'])))
    print(f"bpm {bpm:.3f}  comb {sc:.2f}  downbeat = beat mod 4 == {db}  (kick per position {[round(v, 2) for v in acc]})")
    print(f"best {a.bars}-bar windows (each starts on a downbeat; they overlap one bar apart; even = bar-to-bar loudness variation, lower = no drops):")
    for w in wins[:5]: print('  ', w)
    print(f"\nNext: song.py cut {a.file} --start {wins[0]['start']} --bpm {bpm:.3f} --bars {a.bars}")

def cut(a):
    beats = a.bars * 4; dur = beats * 60 / a.bpm; L = beats * 60 / a.target; fac = a.target / a.bpm
    if not .9 < fac < 1.1: sys.exit(f'tempo change {fac:.3f}× is audible; pick a song within ±10% of {a.target}')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.file, '-af',
        f'atrim=start={a.start}:duration={dur},asetpts=PTS-STARTPTS,atempo={fac},atrim=duration={L},afade=t=in:d=0.004,afade=t=out:st={L - .006}:d=0.006',
        '-ar', '48000', '-ac', '2', 'audio/song.wav'], check=True)
    x = load('audio/song.wav'); f = onset_env(x); b = 60 / a.target
    errs = []
    for n in range(beats):
        c = int(n * b * FPS); lo_, hi_ = max(0, c - 4), c + 5
        errs.append((lo_ + int(np.argmax(f[lo_:hi_]))) / FPS - n * b)
    errs = np.array(errs) * 1000
    print(f"audio/song.wav: {L:.3f}s = {beats} beats @ {a.target} BPM (×{fac:.4f}, pitch kept)")
    print(f"beat onset error vs grid: median {np.median(errs):+.1f} ms, max |{np.abs(errs).max():.0f}| ms  (1 frame @60fps = 16.7 ms)")

ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest='cmd', required=True)
s = sp.add_parser('scan'); s.add_argument('url', nargs='?', default='https://mixkit.co/free-stock-music/tag/electronic/'); s.add_argument('--near', type=float, default=120)
g = sp.add_parser('grid'); g.add_argument('file'); g.add_argument('--bars', type=int, default=7); g.add_argument('--bpm', type=float)
c = sp.add_parser('cut'); c.add_argument('file'); c.add_argument('--start', type=float, required=True); c.add_argument('--bpm', type=float, required=True)
c.add_argument('--bars', type=int, default=7); c.add_argument('--target', type=float, default=120)
a = ap.parse_args(); {'scan': scan, 'grid': grid, 'cut': cut}[a.cmd](a)
