# Seam check on the LOSSLESS blended subframes in frames/ (encoded frames add I/B-frame codec noise at the seam).
# The last→first difference must look like any other adjacent pair. Usage: python3 tools/loopcheck.py
import json, subprocess, sys, numpy as np
m = json.load(open('frames/meta.json')); SUB, N = m['SUB'], m['N']; F = N // SUB
def sub(i):
    b = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f'frames/s_{i:06d}.png', '-vf', 'scale=480:480', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
    return np.frombuffer(b, np.uint8).astype(float)
fr = lambda f: np.mean([sub(f * SUB + k) for k in range(SUB)], 0)
a, b, c, d = fr(F - 2), fr(F - 1), fr(0), fr(1)
d1, seam, d2 = np.abs(a - b).mean(), np.abs(b - c).mean(), np.abs(c - d).mean()
ok = seam <= 1.5 * max(d1, d2) + .02
print(f"loop seam (lossless): {F-2}→{F-1} {d1:.3f} | {F-1}→0 {seam:.3f} | 0→1 {d2:.3f}  →  " +
      ('SEAMLESS' if ok else 'STUTTER: a value jumps at the seam — something is not a ptrack, a blend-driven element is visible at t=0, or a drag has not settled'))
sys.exit(0 if ok else 1)
