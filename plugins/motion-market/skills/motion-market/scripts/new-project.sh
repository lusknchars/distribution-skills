#!/bin/sh
# sh new-project.sh <dir> [shape-morph|upload-share]  → scaffolds a render project (starter, or one of the examples)
set -e
SK="$(cd "$(dirname "$0")/.." && pwd)"; DIR="$1"; [ -z "$DIR" ] && { echo "usage: new-project.sh <dir> [shape-morph|upload-share]"; exit 1; }
mkdir -p "$DIR"; cp -R "$SK/template/." "$DIR/"
EX="$2"; [ "$EX" = "example" ] && EX=shape-morph
[ -n "$EX" ] && { [ -f "$SK/examples/$EX/index.html" ] || { echo "no example: $EX"; exit 1; }; cp "$SK/examples/$EX/index.html" "$DIR/index.html"; }
cd "$DIR"; mkdir -p fonts out audio
npm install --silent --no-fund --no-audit || { echo "npm install failed"; exit 1; }
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2 fonts/
npx playwright install chromium >/dev/null || { echo "playwright chromium install failed"; exit 1; }
node -e "require('playwright').chromium.launch().then(b=>b.close())" || { echo "chromium does not launch"; exit 1; }
printf "node_modules/\nframes/\naudio/*.mp3\n" > .gitignore
sh "$SK/scripts/doctor.sh" || true
echo "ready: $DIR  (open index.html?play after mixing; node render.mjs grid to review)"
