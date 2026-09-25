# Patterns (all used in examples/shape-morph/index.html)

## Persistent elements vs layers
- **Layer** (`.layer` + `layer(el, vis(t, tin, tout), cam)`): content that belongs to one state (labels, icons, a chart).
- **Persistent element**: something that visibly *becomes* the next thing, for example progress knob → volume knob → toggle knob → tab indicator, or album thumbnail → album art. Place it outside the layers and drive it with `blend(t, segs)`.
- `blend` is **not periodic**. A blend-driven element must be invisible at t=0 and t=L: give it a `vis` window that ends before the seam, or make the value at L equal the value at 0.

## White label on a moving indicator
Render the labels twice. Put the ink set below the indicator and the white set above it, inside a 2000×2000 wrapper at (-1000,-1000). Clip the wrapper to the indicator's live box:
```js
set(clip, 'clipPath', `inset(${px(k.y1+1000)} ${px(1000-k.x2)} ${px(1000-k.y2)} ${px(k.x1+1000)} round ${px(r)})`);
```

## Text that changes within one state (tooltip value, counter 6→7, total 392→412)
Use two stacked copies. The old one fades out over 0.1 s from the cue with `blur((1-a)*4px)`. The new one fades in over 0.16 s starting 0.06 s after the cue. For a counter roll, also translate the old copy up by 30% and the new copy in from below.

## Drag with a rubber band past max
```js
const hand = t => pointer(Math.min(t, release)) - grabOffset;            // grabOffset = pointer(grab) - knob(grab)
const over = t => Math.max(0, hand(t) - max);
const rubber = o => 120 * (1 - Math.exp(-o / 120));
const extra = t => t < grab ? 0 : t < release ? rubber(over(t)) : rubber(over(release)) * (1 - S(t - release, P.morph));
```
Add `extra` to the shape width (and shift the shape by extra/2 so the far edge stays put). Shrink the height by `extra*0.1`.

## Play ↔ pause
Split the triangle into two quads that share vertex order with the two pause bars, then lerp each vertex with one `ptrack` (preset `snap`).

## Staggered bars or list rows
Give each item its own `S(t - (t0 + i*0.03), P.morph)`. Keep the stagger at 20–40 ms per item, and keep the total under a beat.

## Shadows
Use world units so they scale with the camera: `0 14px 40px rgba(0,0,0,.06–.10)`. Use a larger alpha for larger shapes, and never a colored or glowing shadow.

## The seam
- The last beat can be quiet, but it can't be static. Start the cursor's glide back 0.2–0.3 s *after* the last morph, so it's still visibly moving across the seam.
- A hover on the final state also counts as that beat's event.

## Checks that catch real bugs
- `node render.mjs grid` prints a **bounds audit**, checking the cursor and shape every 1/30 s. Fix every line it prints.
- `encode.sh` runs `tools/loopcheck.py` on the lossless subframes. STUTTER there is a real discontinuity; it's not codec noise.
