#!/bin/sh
# sh new-project.sh <dir> [example]  → scaffolds a render project (template, or the full shape-morph example)
set -e
SK="$(cd "$(dirname "$0")/.." && pwd)"; DIR="$1"; [ -z "$DIR" ] && { echo "usage: new-project.sh <dir> [example]"; exit 1; }
mkdir -p "$DIR"; cp -R "$SK/template/." "$DIR/"
[ "$2" = "example" ] && cp "$SK/examples/shape-morph/index.html" "$DIR/index.html"
cd "$DIR"; mkdir -p fonts out audio
npm install --silent --no-fund --no-audit || { echo "npm install failed"; exit 1; }
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2 fonts/
npx playwright install chromium >/dev/null || { echo "playwright chromium install failed"; exit 1; }
node -e "require('playwright').chromium.launch().then(b=>b.close())" || { echo "chromium does not launch"; exit 1; }
printf "node_modules/\nframes/\naudio/*.mp3\n" > .gitignore
echo "ready: $DIR  (open index.html?play after mixing; node render.mjs grid to review)"
