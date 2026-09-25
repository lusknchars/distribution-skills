"""Synthesises UI sounds, places each one's MEASURED PEAK on its cue, mixes over audio/song.wav → out/soundtrack.wav.
Cues come from the scene (window.CUES → `node render.mjs cues` → out/cues.json): [[seconds, sound, gain], ...].
Sounds: click soft grab release switch key enter check pop whoosh. Cues wrap across the loop seam."""
import json, subprocess, wave, os
import numpy as np
SR = 48000
cfg = json.load(open('out/cues.json')); L = cfg['L']; N = int(round(L * SR))
rng = np.random.default_rng(7)
T = lambda d: np.arange(int(d * SR)) / SR
hp = lambda x: np.diff(x, prepend=0)
def body(f, tau, d=.12): t = T(d); return np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
def burst(d, tau): t = T(d); return hp(rng.standard_normal(len(t))) * np.exp(-t / tau)
def pad(*xs): n = max(len(x) for x in xs); return sum(np.pad(x, (0, n - len(x))) for x in xs)
t = T(.35)
SFX = {
  'click':   pad(.35 * burst(.02, .0012), .55 * body(2900, .005), .45 * body(165, .018)),
  'soft':    pad(.18 * burst(.015, .001), .30 * body(1900, .004), .22 * body(140, .014)),
  'grab':    pad(.20 * burst(.02, .0015), .30 * body(1250, .006), .40 * body(120, .02)),
  'release': pad(.16 * burst(.02, .0012), .30 * body(1650, .005), .25 * body(150, .016)),
  'switch':  pad(.30 * burst(.02, .0015), .45 * body(2300, .006), .60 * body(110, .03)),
  'key':     pad(.30 * burst(.015, .0009), .32 * body(1150, .004), .20 * body(230, .012)),
  'enter':   pad(.34 * burst(.02, .0012), .40 * body(820, .008), .45 * body(130, .025)),
  'check':   pad(.32 * np.sin(2 * np.pi * 1568 * t) * np.exp(-t / .05), np.pad(.30 * np.sin(2 * np.pi * 2349 * t) * np.exp(-t / .07), (int(.055 * SR), 0))[:len(t)]),
  'pop':     .26 * np.sin(2 * np.pi * np.cumsum(np.linspace(620, 930, len(t))) / SR) * np.exp(-t / .07) * (1 - np.exp(-t / .004)),
}
tw = T(.28); nz = np.convolve(rng.standard_normal(len(tw)), np.ones(40) / 40, 'same')
SFX['whoosh'] = .5 * nz * np.sin(np.pi * np.clip(tw / .28, 0, 1)) ** 2   # peak mid-sound: lands ON the cue
peak = lambda x: int(np.argmax(np.sqrt(np.convolve(x ** 2, np.ones(48) / 48, 'same'))))  # 1 ms RMS envelope

song = np.zeros((N, 2))
if os.path.exists('audio/song.wav'):
    s = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'quiet', '-i', 'audio/song.wav', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True).stdout, np.float32).reshape(-1, 2)[:N]
    song[:len(s)] = s / (np.abs(s).max() + 1e-9) * .80
ui = np.zeros(N)
for cue, name, g in cfg['cues']:
    x = SFX[name] * g; start = int(round(cue * SR)) - peak(x)
    np.add.at(ui, (np.arange(len(x)) + start) % N, x)
mix = song * .86 + np.stack([ui, ui], 1) * .9
mix /= max(1, np.abs(mix).max() / .97)
with wave.open('out/soundtrack.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
e = np.sqrt(np.convolve(ui ** 2, np.ones(48) / 48, 'same')); worst = 0
for cue, name, g in cfg['cues']:
    c = int(round(cue * SR)); win = e[np.arange(c - 480, c + 480) % N]
    worst = max(worst, abs(np.argmax(win) - 480) / SR * 1000)
print(f"out/soundtrack.wav: {L:.3f}s, {len(cfg['cues'])} cues, worst peak-to-cue {worst:.2f} ms")
