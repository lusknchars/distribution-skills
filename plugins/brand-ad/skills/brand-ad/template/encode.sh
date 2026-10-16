#!/bin/sh
# FORMAT=<format> sh encode.sh → out/<format>/ad.mp4: SUB subframes averaged per frame (motion blur), muxed with out/soundtrack.wav,
# then the pop scan (a single-frame jump means a morph cut or popped).
set -e
cd "$(dirname "$0")"
FORMAT=${FORMAT:-square}; FR=frames/$FORMAT
FPS=$(python3 -c "import json;print(json.load(open('$FR/meta.json'))['FPS'])")
SUB=$(python3 -c "import json;print(json.load(open('$FR/meta.json'))['SUB'])")
W=$(python3 -c "print(' '.join(['1']*$SUB))")
AUDIO=""; MAPA=""
[ -f out/soundtrack.wav ] && AUDIO="-i out/soundtrack.wav" && MAPA="-map 1:a -c:a aac -b:a 256k -shortest"
mkdir -p out/$FORMAT
ffmpeg -v error -y -framerate $((FPS*SUB)) -i $FR/s_%06d.png $AUDIO \
  -filter_complex "[0:v]tmix=frames=$SUB:weights='$W',select='eq(mod(n\,$SUB)\,$((SUB-1)))',setpts=N/($FPS*TB),format=yuv420p[v]" \
  -map "[v]" $MAPA -r $FPS -c:v libx264 -preset slow -crf 15 -tune animation -movflags +faststart out/$FORMAT/ad.mp4
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,nb_frames,duration -of compact out/$FORMAT/ad.mp4
python3 tools/popscan.py out/$FORMAT/ad.mp4
