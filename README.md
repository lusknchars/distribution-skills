# Distribution Skills

Skills for Claude Code that turn a product into the assets that sell it.

| Skill | What it makes |
|---|---|
| [Motion Market](plugins/motion-market/skills/motion-market/SKILL.md) | A UI motion video of your app. One shape morphs through your real UI states (button, loader, player, slider, toggle, tabs, chart, ⌘K, toast…), a cursor drives each change, and it's cut to a 120 BPM track. The output is a seamless 1440×1440, 60 fps MP4 loop. |

## Install

In Claude Code:

```
/plugin marketplace add lusknchars/distribution-skills
/plugin install motion-market@distribution-skills
```

Or copy (or symlink) `plugins/motion-market/skills/motion-market` into `~/.claude/skills/`.

## Motion Market

https://github.com/lusknchars/distribution-skills/raw/main/docs/shape-morph.mp4

Ask for something like *"make a motion video for our app"*. The skill:

1. Asks for 8–12 UI states, a palette and a song. For your own app, it reads your code for the font, colors, radii, icons and copy.
2. Finds a Mixkit track, locates the best section starting on a downbeat, and speeds it to exactly 120 BPM (one beat = 30 frames).
3. Shows you a beat-by-beat grid to approve before writing any code.
4. Builds the scene on a small engine where every frame is a pure function of time. It uses closed-form springs, a liquid indicator whose edges ride different springs, direct-manipulation drags and a camera that can't let the shape leave the frame.
5. Reviews one still per beat and checks every 1/30 s that the cursor and the shape stay in frame.
6. Renders 4 motion-blur subframes per frame with Playwright, blends them with ffmpeg, places each UI sound by its measured peak, and checks the loop seam on lossless frames.

**Requirements:** Node 18+, Python 3 with numpy, and ffmpeg. Playwright's Chromium is installed by the scaffold script.

The example video uses "Brainiac" by Alejandro Magaña ([Mixkit](https://mixkit.co), Mixkit Stock Music Free License).
