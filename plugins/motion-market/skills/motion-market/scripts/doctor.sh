#!/bin/sh
# Checks everything Motion Market needs and prints the exact fix for what's missing.
# Usage: sh doctor.sh            (exit code 0 = ready)
ok=0
os=$(uname -s)
hint() {  # $1 = what, $2 = mac, $3 = debian/ubuntu
  case "$os" in
    Darwin) echo "   fix: $2" ;;
    Linux)  echo "   fix: $3" ;;
    *)      echo "   fix: use WSL (Ubuntu) on Windows, then: $3" ;;
  esac
}
pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; ok=1; }

if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then pass "node $(node -v)"
else fail "node 18+ missing"; hint node "brew install node" "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"; fi

if command -v python3 >/dev/null; then pass "python3 $(python3 -c 'import sys;print(sys.version.split()[0])')"
else fail "python3 missing"; hint py "brew install python" "sudo apt install -y python3 python3-pip"; fi

if python3 -c 'import numpy' 2>/dev/null; then pass "numpy $(python3 -c 'import numpy;print(numpy.__version__)')"
else fail "numpy missing"; hint np "python3 -m pip install numpy" "python3 -m pip install numpy   (or: sudo apt install -y python3-numpy)"; fi

if command -v ffmpeg >/dev/null; then
  pass "ffmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3)"
  ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 && pass "ffmpeg has libx264" || { fail "ffmpeg without libx264"; hint x264 "brew reinstall ffmpeg" "sudo apt install -y ffmpeg"; }
  ffmpeg -hide_banner -filters 2>/dev/null | grep -q " tmix " && pass "ffmpeg has tmix (motion blur)" || { fail "ffmpeg without tmix (too old)"; hint tmix "brew upgrade ffmpeg" "sudo apt install -y ffmpeg  (4.2+)"; }
else fail "ffmpeg missing"; hint ff "brew install ffmpeg" "sudo apt install -y ffmpeg"; fi

if [ -d node_modules/playwright ]; then
  node -e "require('playwright').chromium.launch().then(b=>b.close()).then(()=>process.exit(0),()=>process.exit(1))" 2>/dev/null \
    && pass "playwright chromium launches" \
    || { fail "playwright chromium does not launch"; echo "   fix: npx playwright install --with-deps chromium"; }
else echo "· playwright: not checked (run inside a project made by new-project.sh)"; fi

[ $ok -eq 0 ] && echo "\nReady." || echo "\nFix the ✗ lines above, then run this again."
exit $ok
