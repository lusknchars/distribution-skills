#!/bin/sh
# sh new-project.sh <dir>  → scaffolds a brand-ad project: kit + starter ad + tools + Playwright + the default SFX kit
set -e
SK="$(cd "$(dirname "$0")/.." && pwd)"; DIR="$1"; [ -z "$DIR" ] && { echo "usage: new-project.sh <dir>"; exit 1; }
mkdir -p "$DIR"; cp -R "$SK/template/." "$DIR/"
cd "$DIR"; mkdir -p audio assets out
npm install --silent --no-fund --no-audit || { echo "npm install failed"; exit 1; }
npx playwright install chromium >/dev/null || { echo "playwright chromium install failed"; exit 1; }
sh "$SK/scripts/sfx.sh" .
printf "node_modules/\nframes/\naudio/*.mp3\nassets/private/\n" > .gitignore
sh "$SK/scripts/doctor.sh" || true
echo "ready: $DIR   preview: node render.mjs beats   live: serve the folder and open index.html"
