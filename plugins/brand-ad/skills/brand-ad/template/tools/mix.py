"""Soundtrack: the song edit (audio/edit.json) + one sound per cue (out/cues.json), each placed so its MEASURED peak
lands on the cue's beat. Sounds are sfx/<name>.mp3 (sh <skill>/scripts/sfx.sh . fetches a Mixkit kit). Loudnorm -14 LUFS.
Cue = [beat, name, gainDb] or [beat, name, gainDb, trimSeconds].  → out/soundtrack.wav"""
import json, os, subprocess
import numpy as np
cfg = json.load(open('out/cues.json')); ed = json.load(open('audio/edit.json'))
B = 60 / cfg['bpm']; END = cfg['duration']
if abs(ed['bpm'] - cfg['bpm']) > .01: raise SystemExit(f"bpm mismatch: page {cfg['bpm']} vs audio/edit.json {ed['bpm']}")
def peak(p):  # time of the loudest 1 ms
    x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'quiet', '-i', p, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], capture_output=True).stdout, np.float32)
    return int(np.argmax(np.convolve(x ** 2, np.ones(48), 'same'))) / 48000
names = sorted({c[1] for c in cfg['cues']}); missing = [n for n in names if not os.path.exists(f'sfx/{n}.mp3')]
if missing: raise SystemExit(f"missing sfx: {missing} (put sfx/<name>.mp3, or run scripts/sfx.sh)")
PEAK = {n: peak(f'sfx/{n}.mp3') for n in names}
inputs, fl, segs = ['-i', ed['song']], [], ed['segments']
for k, (s, e) in enumerate(segs):   # 6 ms fade-in / 8 ms fade-out at each splice: no clicks
    fl.append(f'[0:a]atrim={s:.4f}:{e:.4f},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st={e - s - .008:.4f}:d=0.008[s{k}]')
fl.append(''.join(f'[s{k}]' for k in range(len(segs))) + f'concat=n={len(segs)}:v=0:a=1,afade=t=out:st={END - .45:.4f}:d=0.43,volume=-2dB[music]')
labels = ['[music]']
for i, c in enumerate(cfg['cues']):
    beat, name, gain = c[:3]; trim = c[3] if len(c) > 3 else None
    inputs += ['-i', f'sfx/{name}.mp3']; at = beat * B - PEAK[name]; pre = 0.0
    if at < 0: pre, at = -at, 0.0
    ch = f'[{i + 1}:a]aresample=44100,aformat=channel_layouts=stereo'
    if trim: ch += f',atrim=0:{trim},afade=t=out:st={trim - .08}:d=0.08'
    if pre: ch += f',atrim=start={pre}'
    fl.append(ch + f',asetpts=PTS-STARTPTS,volume={gain}dB,adelay={int(at * 1000)}|{int(at * 1000)}[e{i}]'); labels.append(f'[e{i}]')
fl.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0:dropout_transition=0,apad,atrim=0:{END:.4f}[mix]')
fl.append('[mix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]')
os.makedirs('out', exist_ok=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error'] + inputs + ['-filter_complex', ';'.join(fl), '-map', '[out]', '-c:a', 'pcm_s16le', 'out/soundtrack.wav'], check=True)
lufs = subprocess.run(['ffmpeg', '-i', 'out/soundtrack.wav', '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr.split('Integrated loudness:')[-1].split('LUFS')[0].split()[-1]
print(f"out/soundtrack.wav: {END:.3f}s, {len(cfg['cues'])} cues, {len(segs)} song segment(s), {lufs} LUFS")
