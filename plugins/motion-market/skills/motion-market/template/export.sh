#!/bin/sh
# Social-ready files from the master render.
#   out/share.mp4    shorter side 1080 px, H.264 + AAC, faststart (X, LinkedIn, Instagram, Slack)
#   out/preview.gif  480 px wide, 20 fps, loops forever (READMEs, docs, Notion)
#   out/poster.png   one still for thumbnails (POSTER_T seconds, default 60% into the loop)
# Usage: sh export.sh [out/video.mp4]
set -e
cd "$(dirname "$0")"
IN=${1:-out/video.mp4}
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
T=${POSTER_T:-$(python3 -c "print(round($DUR*0.6,3))")}
ffmpeg -v error -y -i "$IN" -vf "scale='if(lt(iw,ih),1080,-2)':'if(lt(iw,ih),-2,1080)':flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -movflags +faststart out/share.mp4
ffmpeg -v error -y -i "$IN" -vf "fps=20,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a" -loop 0 out/preview.gif
ffmpeg -v error -y -ss "$T" -i "$IN" -frames:v 1 out/poster.png
for f in out/share.mp4 out/preview.gif out/poster.png; do printf "%-18s %s\n" "$f" "$(du -h "$f" | cut -f1)"; done
