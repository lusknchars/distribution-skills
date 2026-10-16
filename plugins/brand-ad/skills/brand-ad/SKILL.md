---
name: brand-ad
description: Use when asked for a short fast-paced ad, teaser, promo or sizzle (roughly 8–20 s) for a brand, product, project or launch, especially with morphing typography, kinetic type, images flying in, painted marks over screenshots or papers, the brand's own background, or "end on the logo", cut to music and rendered to MP4 for X, LinkedIn, Reels or Shorts.
---

# Brand Ad

## Overview
A 10–15 s ad where nothing cuts: a card becomes a word, the word becomes a number, the number collapses into an ink line, and the logo rises out of that line on the song's biggest hit. Real images (pages, figures, screens) fly in small, big or several at once, with strokes painted over them. The brand's own background (ported from its site code) and an interaction effect (glow and ripples) sit under everything.

**Core principle:** `seek(t)` is a pure function of time. Every value is a closed-form spring or an eased progress over beats, so any frame renders alone. That gives 4-subframe motion blur, deterministic re-renders and a provable pop scan.

## Workflow
0. `sh <skill>/scripts/doctor.sh` checks the machine. `sh <skill>/scripts/new-project.sh <dir>` scaffolds the kit, the starter ad, the tools, Playwright and a Mixkit SFX kit. **Run everything else from `<dir>`.**
1. **Study the brand before designing.** Read its site's code, not screenshots of it:
   - the display and logo fonts, with exact weight and tracking
   - the colors
   - the background generator: port the actual function into a `Dither({field})` or your own canvas function
   - any interaction effect the owner shows you: rebuild it with a light path plus ripples on hits
   If you don't have the logo, ask for it. The logo is the exact wordmark (font, weight, tracking) and the brand name in full, never shortened. Tracking goes in as `fit(font, text, maxW, size, cx, cy, {tracking: -40})`, in thousandths of an em, so -0.04em is -40.
2. **Collect the assets and write SOURCES.md before using any of them.** Images must be CC-BY or CC0, or owned by the brand. Every number on screen comes from real output (the product's CLI, an API or its data). If a number isn't real, cut the shot. A placeholder number is allowed only in a test that the user asked for, marked in NOTES.md. Don't show any other company's logo. If the brief has no images, the type morphs and the background carry the ad; skip the image shots.
3. **Song:**
   - `python3 tools/song.py hits audio/<song>.mp3` lists the drops and returns.
   - `check audio/<song>.mp3 T` prints loudness bars around T. Confirm that the hit is where the bars jump; never trust a hand-measured time.
   - `edit audio/<song>.mp3 --start S --beats N --hit T [--lead 2] [--tail 4]` splices the song on beats so the hit T lands on ad beat N, where the logo goes. `--tail` is the logo hold in beats.
     - Choose S where the music should begin: usually a few beats before a drop, so the first shots ride the build and the drop lands on a punch.
     - The drop lands on ad beat (drop − S) / beat length. Plan the shot table around that beat.
   - Copy the `bpm` and `beats` that `edit` prints into `Ad({...})`. `mix.py` refuses a bpm that differs by more than 0.01.
4. **Shot list, then stop for approval.** Make a beat table with columns beat | what morphs into what | image moves | paint | sfx. Each shot runs 0.3–0.9 s and nothing holds longer than 0.6 s except the logo. Render 4 stills (`node render.mjs stills <beats>`) and show them.
5. **Build** `index.html` on `kit.js`. Replace the starter's timeline: it has 12 beats with the hit on beat 10. See the Kit table below and `patterns.md` for proven shots. `examples/paperraft-ad.html` is a full 15 s ad to read for techniques. It predates `kit.js`: its `ringsOf` and `fit` take the text first and use a global font, so copy ideas from it, not calls. Its assets are not included.
6. **Review:** `node render.mjs beats` writes, to `out/<format>/stills/`, `beats_on.png`, the state before each change, and `beats_mid.png`, half a beat later. Read both images. Fix it, then re-check.
7. **Render each format natively:** `FORMAT=square|portrait|vertical|landscape npm run render`. Lay out each format from `W`, `H`, `CX` and `CY`. Never pad or crop a square into a tall frame. The render ends with the pop scan, which must say CLEAN.

## Kit (`kit.js`)
| Need | Use |
|---|---|
| Timeline | `Ad({bpm, beats, cues, setup, frame(b, t)})`, where `b` is beats. `win(b,a,z)` is a shot window, `prog(b,a,len)` an eased progress, `track(b, v0, [[beat, v, w, z]])` springs |
| Word, number or shape morph | `R = fit(font, text, maxW, size, cx, cy)` or `shape(rectRing(...))`, then `new Morph(A, B).at(ease(k))`. Endpoints are exact |
| Draw type | `new Word(svgLayer(z))`, then `.set(paths, transform)`. Counters are real holes onto the background |
| Paint on images | `paint(layer, d, color, w)` + `draw(p, k)`, with shapes `loop`, `tick`, `cross` and `under`. A stroke draws on and draws back off; it never fades |
| Background | `Dither({palette, field, opacity, blend})` and `Honeycomb({light, ripples, glow:[r,g,b], core:[r,g,b], rest:'rgba(...)'})`. The honeycomb colours default to pink, so set all three for another brand. Ripples go on the same beats as the hits |
| Colour change | `word.color(mixColor('#0E0E10', '#2F6BFF', ease(prog(b, a, .5))))`. A fill set in one frame pops |
| Sound | `cues: [[beat, 'pop'\|'whoosh-small'\|..., gainDb, trim?]]`. Names are files in `sfx/` and each sound's measured peak lands on its beat |

## Direction
- Bold and fast, one accent color, the brand's own type.
- No eyebrow labels, no small grey captions, no beige "artsy" paper look, no glows on UI chrome.
- Something happens on every beat, and every event gets a sound.
- Morphs ease in-out over about 0.7 beats. Pops use springs with z ≈ .6; type and camera use z ≥ .8.

## Common mistakes (all observed)
| Symptom | Fix |
|---|---|
| Letter counters filled white or with a flat color | Draw through `Word` (a mask). Then a zoom through a counter can open onto the next shot |
| Morph pops on its first or last frame | Build the Morph from the exact rings that are on screen before and after it. Start the next shot on its endpoint, not on a re-laid-out copy |
| An element appears or vanishes in one frame | It needs a scale, draw or fly-out driven by `b`. The pop scan prints its beat; open that beat with `stills` |
| A glyph is missing (σ, ✓, arrows) | Check `font.charToGlyph(c).index`, then use another glyph or draw it as a path |
| The logo font is a system or commercial font | Fine for the render, but keep the file in `assets/private/` (gitignored) and never publish it |
| Vertical format shows plain bands | Lay out natively per format. Padding doesn't extend a generated background |
| The drop lands a beat off | Use `song.py hits`, which corrects for onset lag. Hand-measured drops were 0.4 s off |
| Fonts don't load (opentype on file://) | Use `render.mjs`, which serves over http. For a live preview, serve the folder too |
| A wide image reads tiny in the vertical format | Give that format its own size and position, not a scaled copy |
| The vertical frame is mostly empty | Give tall formats more: bigger type (size from `W`, not `min(W,H)`), stacked words, images above and below the word |
| A painted loop cuts through the letters | Size it from the word's `bb` with a margin of 15% or more, and check it in the narrowest format |

## Deliverable
Report back with:
- each `out/<format>/ad.mp4` with its size and duration
- the pop scan line
- the song credit and edit (segments, hit beat)
- the approved shot table
- SOURCES.md
- what the beat review caught

Say plainly what you didn't check, such as listening in real time.
