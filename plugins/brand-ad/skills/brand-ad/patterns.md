# Proven shots

All of these are in `examples/paperraft-ad.html`. Beat numbers refer to that file.

**Page → grid → word (0–3.6).** One page scales in at the centre. On the drop, the camera punches out and 14 more tiles spring in, ordered by their distance from the centre. Then they fly outward with `expoIn` along their own angle. The centre tile floods ink and becomes `shape(rectRing(tile))`, which morphs into the first word.

**Zoom through a counter (4.9–6).** Pick the hole ring of the "a" (`R.holes`, sorted left to right) and clip the next shot's image to it. Scale the word around that hole's centre with `Math.pow(90, k^2.4)`. The camera inside the hole has to match where the next shot's camera starts, so the cut is invisible.

**Highlighter → word (6–9).** The highlight is a stroke over the claim. At the next shot it becomes `shape(rectRing(highlight bar))` and morphs into a word, while its fill opacity eases from the highlighter's (.32) to 1.

**Checklist (9.9–12.5).** Each row rises out of its own clip box (`overflow:hidden`), one row per half beat. A ✓ or ✗ draws on, then a strike draws across the failed rows. Each row gets a `pass` or `fail` sound and a ripple at the mark.

**Terminal → 3D deck → explode (12.9–17.3).** A CSS `perspective` parent holds a `preserve-3d` child. The terminal types the real command one character per frame-time and tilts back (`rotateX` 58°, `rotateZ` −32°). The pages fan out beneath it at z = −34·i. They explode outward with `expoIn` and a per-sheet angle to reveal the background, rather than ending on a sheet.

**Data flow (17.2–23.5).** Draw the product's real graph from its export: curves drawn on in stagger, then nodes popping in. Numbers morph into each other on a white plate (`10/10 → 5/5 → 8.0e-13 → verified`), with one caption per number rising out of a clip box.

**Montage (23.5–29.4).** A list of `{at, out, src, x, y, w, mark, from}`. Each image enters from an edge, or from a zoom of 0.2 → 1, and leaves the way it came. Paint (`loop`, `under` or `tick`) draws on 0.25 beats after it lands. Overlap 2–3 images to get the "several at once" beats.

**Logo (29.4–35).** The last image collapses into an ink line (a spring, z .7). On the hit, the wordmark rises out of the line, clipped at the line's top. The line pulls in over 0.5 beats and the URL rises one beat later. Hold it for about 4 beats.

**Song splice.** Play the build plus the drop for N−2 beats, then jump to 2 beats before the song's return hit. The listener hears a fill into the big hit and the logo lands on it. Put a 6 ms fade-in and an 8 ms fade-out at the splice so it doesn't click.
