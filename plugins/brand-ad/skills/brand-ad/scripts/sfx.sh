#!/bin/sh
# sh sfx.sh <project dir>  → downloads the default Mixkit SFX kit into <dir>/sfx/<name>.mp3 (Mixkit Free License).
# Add your own: any file in sfx/ named <name>.mp3 can be used as a cue name; tools/mix.py measures its peak itself.
set -e
D="${1:-.}/sfx"; mkdir -p "$D"
while read name id what; do
  [ -f "$D/$name.mp3" ] || curl -sfL -A Mozilla/5.0 "https://assets.mixkit.co/active_storage/sfx/$id/$id-preview.mp3" -o "$D/$name.mp3" || echo "failed: $name ($id)"
  echo "$name.mp3  Mixkit #$id $what" >> "$D/CREDITS.tmp"
done <<KIT
pop 2364 hard pop click
pop2 2354 message pop alert
click 1113 mouse click close
whoosh-small 166 fast small sweep
whoosh-air 1489 air woosh
whoosh-big 1492 cinematic whoosh
marker 2998 pen marker line
paper-slide 1530 paper slide
page-turn 1104 page turn single
crinkle 2385 paper crinkle
shutter 1433 camera lens shutter
typing 2531 typing on a laptop keyboard
pass 2867 confirmation tone
fail 2569 negative tone interface tap
verified 2870 correct answer tone
lock 2848 gaming lock
KIT
sort -u "$D/CREDITS.tmp" > "$D/CREDITS.txt"; rm "$D/CREDITS.tmp"
echo "sfx: $(ls "$D"/*.mp3 | wc -l | tr -d ' ') sounds in $D (credits in CREDITS.txt)"
