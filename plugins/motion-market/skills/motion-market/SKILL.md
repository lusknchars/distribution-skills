---
name: motion-market
description: Use when asked for a UI motion video, product animation, Dribbble-style shot, app promo loop, launch teaser or "motion for our app", especially one continuous shape morphing between UI states (button, loader, player, slider, toggle, tabs, chart, command palette, toast) cut to music with a cursor driving it, rendered to MP4.
---

# Motion Market

## Overview
One element never cuts: it morphs its size, radius and color from state to state while its content swaps with a short blur. A cursor drives each change with real clicks and drags, the camera zooms so each state fills the frame, and something happens on every beat of a ~120 BPM track. The last frame equals the first, so it loops.

**Core principle:** `seek(t)` is a pure function of time. Every value is a closed-form spring (or a sum of springs), so any frame renders in any order. That gives exact motion blur, exact loops and deterministic re-renders.

## Workflow (do it in this order)

0. **Check the machine:** `sh <skill>/scripts/doctor.sh`. It prints the exact install command for anything missing (macOS, Debian/Ubuntu, or WSL on Windows). Don't continue until it says Ready.
1. **Ask for inputs, then stop.** You need 8–12 UI states (4-bar videos can use 5–7), a palette (the app's neutrals plus at most one accent, or pure black and white), a song (a file, or "pick one from Mixkit") and a **format**: square 1440×1440 (default), vertical 1080×1920 (Reels, TikTok, Shorts, Stories) or landscape 1920×1080 (YouTube, sites, decks). If the user says "you choose", pick the defaults and say which. For a real app, read its components and tokens (font, radii, colors, icon set, copy) and rebuild each state as static DOM. Never use screenshots.
2. **Scaffold:** `sh <skill>/scripts/new-project.sh <dir>` gives you the starter (a 2-bar button → loader → check → toast). Add `shape-morph` (light, square, 7 bars, 11 states) or `upload-share` (dark, vertical, 4 bars, a drag-and-drop) as a second argument to start from a full example. **Run everything below from `<dir>`.**
3. **Song** (tools read and write `./audio/`; copy a supplied file there first):
   - `python3 tools/song.py scan` ranks Mixkit tracks.
   - `grid audio/<id>.mp3 --bars N` lists the best N-bar windows. Windows overlap, one bar apart; take the top one unless the user wants a different section.
   - `cut audio/<id>.mp3 --start S --bpm B --bars N` writes `audio/song.wav` at exactly 120 BPM, which makes each beat exactly 30 frames at 60 fps.
   - Accept the cut if the median onset error is ≤ 10 ms and the maximum is ≤ 25 ms, about a frame and a half. Otherwise try the next window.
   - Record the title and artist for credits.
4. **Show the beat grid before writing code.** Use a table with columns bar.beat | time | frame | what happens | camera. Put the heavy morphs on downbeats and direct interactions (click, drag, hover, type) on the beats in between. Get the user's approval.
5. **Build** `index.html` on `engine.js`. Read `patterns.md` for persistent elements, label clipping, counters, rubber bands, stagger and the seam.
6. **Review stills:** `FORMAT=<format> node render.mjs grid` writes `out/stills/grid_on.png` (the state *before* each change) and `grid_mid.png` (half a beat later), and prints a **bounds audit**. Read both images. Use `node render.mjs stills 9.08 9.2` for transitions. Fix anything off the grid, cramped, hard to read or listed by the audit, then re-check.
7. **Render:** `FORMAT=<format> npm run render` runs cues → mix → subframes → `encode.sh`, which ends with the lossless loop seam check. The output is `out/video.mp4`. For a live preview, open `index.html?play&format=<format>`.
8. **Export:** `sh export.sh` writes `out/share.mp4` (1080 on the short side, for social), `out/preview.gif` (480 px, for READMEs and docs) and `out/poster.png` (thumbnail).

## Engine quick reference (`const M = Motion({bpm:120, bars:7})`)

| Need | Use |
|---|---|
| Value that changes target over time | `ptrack([[t, value, 'preset'], ...])`. Targets are cyclic, so the last target is the value at t=0 |
| Beat time | `beat(n)` |
| Layout with live targets (drag, dynamic positions) | `blend(t, [{T, f: t => ({...}), p}])` |
| Liquid indicator or toggle knob stretch | boxes from `box(cx, cy, w, h)`, segments with `p:'edge'`, `prepareEdges(segs)`, then `blend(t, segs, edgePreset)` |
| Content swap inside the morphing shape | `layer(el, vis(t, tin, tout), cam)`. The exit takes 100 ms and the enter starts after it |
| Drag (direct manipulation) | value = f(pointer) while held, frozen at release, aftermath × `(1 - S(t - release, P.morph))` |
| Frame | `Motion({format})` or `?format=`. Place everything around (0,0) in world units; `M.CX`/`M.CY` is the frame centre |
| Zoom per state | `M.fit(w, h)`: the scale that makes a state fill the frame, for any format |
| Camera | `camera(camSpring(t), liveW, liveH)` soft-caps the zoom so the shape never leaves the frame |
| Presets | `morph snap cam draw cur glide drag pull fast slow tip` (ζ ≥ .82, overshoot ≤ 1.3%) |
| Sound | `CUES = [[t, 'click'\|'soft'\|'grab'\|'release'\|'switch'\|'key'\|'enter'\|'check'\|'pop'\|'whoosh', gain]]`. The mixer places each sound's measured peak on `t` |

## Timing rules
- Morphs land on the beat. The visual press leads the beat by about 0.1 s and the release is the beat, which is where the click sound goes.
- The cursor lives in screen space at a constant size: `screen = centre + cam * world`. Its last event before the seam must still be moving at t=0, which `ptrack` guarantees.
- The bounds audit catches the cursor or shape leaving the frame, so you don't have to work camera limits out by hand.
- `blend` is not periodic: anything it drives must be hidden across the seam.
- Give each state its own content layer. Keep elements that persist across states (knob, rail, album art, tab labels) outside the layers and move them with `blend`.

## Direction (non-negotiable)
Warm-gray canvas, one UI font, neutral components plus at most one accent, used only on active values. Springs everywhere, with a tiny overshoot at most. All icons are 24 px with a 2 px stroke.

**Banned:** bouncy easing, particle bursts, glows, gradients on UI chrome, mismatched icon strokes, dead beats, anything template-looking, `will-change` on anything the camera scales, and CSS transitions or timers.

## Common mistakes (all observed)

| Symptom | Fix |
|---|---|
| Shape pokes off the frame during a zoom-out | Wrap the camera: `camera(camS(t), w, h)` |
| An SVG icon inside a `width="0"` svg doesn't render | Give it `width="1" height="1"` with `overflow:visible` |
| A dot shows at the end of an undrawn stroke | Use `stroke-dasharray="1 2"` and opacity 0 while progress ≈ 0 |
| Swapped text overlaps inside the morph | Use separate `vis` windows, and cross-blur text that changes within a state |
| Muddy gray midway through a black↔white color change | Use `'snap'` for that color change |
| Loop stutters | Every track must be `ptrack`, including cursor, hover and press. Drags must finish and spring back inside the loop |
| Stills "look wrong" on the beat | The on-beat frame is the state before the change. Judge readability from `grid_mid` |
| Loop check says STUTTER | The check runs on lossless frames, so it's real: something isn't a `ptrack`, a blend-driven element is visible at the seam, or a drag hasn't settled |
| Cursor exits the frame after a drag | Add a cursor event right at release that pulls it back. The drag spring keeps travelling otherwise |
| A wide state (a pipeline or table more than 900 px wide) reads tiny | Let it fill more of the frame (`1290/w` in `fit`, `camera(..., 1320)`) and enlarge its type. Drop small caps that end up under ~16 px on screen |
| A scene built for one format breaks in another | Run the grid with each `FORMAT`; the bounds audit names the times. Usually a resting cursor is too far out, or the cursor travels while the camera is still zooming out: split the trip into two moves |
| Final beat feels dead | Start the glide back 0.2–0.3 s after the last morph, and/or hover the final state |

## Deliverable
Report back with:
- the `out/video.mp4` path, its format, size, frame count and duration, plus the three export files
- the loop check line
- the song credit
- the approved grid table
- what the stills review caught and fixed

Mention `index.html?play` for a live preview.
