#!/bin/sh
# SUB subframes per frame → tmix averages each group → keep the last of each group → FPS, then mux the soundtrack.
set -e
cd "$(dirname "$0")"
FPS=$(python3 -c "import json;print(json.load(open('frames/meta.json'))['FPS'])")
SUB=$(python3 -c "import json;print(json.load(open('frames/meta.json'))['SUB'])")
W=$(python3 -c "print(' '.join(['1']*$SUB))")
AUDIO=""; MAPA=""
[ -f out/soundtrack.wav ] && AUDIO="-i out/soundtrack.wav" && MAPA="-map 1:a -c:a aac -b:a 256k -shortest"
ffmpeg -v error -y -framerate $((FPS*SUB)) -i frames/s_%06d.png $AUDIO \
  -filter_complex "[0:v]tmix=frames=$SUB:weights='$W',select='eq(mod(n\,$SUB)\,$((SUB-1)))',setpts=N/($FPS*TB),format=yuv420p[v]" \
  -map "[v]" $MAPA -r $FPS -c:v libx264 -preset slow -crf 14 -tune animation -movflags +faststart ${OUT:-out/video.mp4}
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,nb_frames,duration -of compact ${OUT:-out/video.mp4}
python3 tools/loopcheck.py
