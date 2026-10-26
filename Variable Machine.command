#!/bin/bash
# Variable Machine: double-click this file to start it.
#
# It opens in Terminal, checks this Mac, installs what the app uses the first time,
# starts Ollama and the app, and opens http://localhost:4817 in your browser.
# To stop it, close this Terminal window (or press ctrl-C).
#
# Every command it runs is shown with ▸ in front, as in the app's own terminal.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1

PORT="${VARIABLE_MACHINE_PORT:-4817}"
URL="http://localhost:$PORT"

# Where datasets, adapters and trained models are kept. Later this can point at a
# USB-C drive (VARIABLE_MACHINE_WORKSPACE=/Volumes/<drive>/variable-machine); for now
# the app always uses the workspace folder inside this one, and this path is only
# used to check free disk space.
WORKSPACE="${VARIABLE_MACHINE_WORKSPACE:-$HERE/workspace}"

# Terminal may not have these on its PATH yet (uv installs to ~/.local/bin).
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
say() { printf '%s\n' "$1"; }
warn() { printf '\033[33m! %s\033[0m\n' "$1"; }
# run command…: show it, then run it
run() { printf '\033[32m▸ %s\033[0m\n' "$*"; "$@"; }
# stop "what is wrong" "what to do": say so and keep the window open until Return
stop() {
  printf '\n\033[31m✗ %s\033[0m\n' "$1"
  [ -n "${2:-}" ] && say "  $2"
  printf '\nPress Return to close this window. '
  read -r _
  exit 1
}

echo
bold "Variable Machine"
say "$HERE"
echo

# ---- 1. this Mac ----
bold "1. Checking this Mac"
[ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] \
  || stop "This Mac has an Intel processor." "Variable Machine trains models with MLX, which needs Apple Silicon (M1 or later)."
say "  Apple Silicon: yes"

MACOS="$(sw_vers -productVersion)"
[ "${MACOS%%.*}" -ge 14 ] \
  || stop "macOS $MACOS is too old." "Variable Machine needs macOS 14 (Sonoma) or later: Apple menu → System Settings → General → Software Update."
say "  macOS: $MACOS"

MEM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
say "  memory: ${MEM_GB}GB"
[ "$MEM_GB" -ge 16 ] || warn "Less than 16GB of memory: chat with small models works, but training may run out of memory."

mkdir -p "$WORKSPACE" 2>/dev/null
FREE_GB=$(df -g "$WORKSPACE" 2>/dev/null | awk 'NR==2 {print $4}')
say "  free disk: ${FREE_GB:-?}GB"
[ "${FREE_GB:-0}" -ge 10 ] || warn "Less than 10GB free: models and training need room. Empty the Trash or move files off this disk."
echo

# ---- 2. the three things it needs ----
bold "2. Checking Ollama, Node and uv"
MISSING=0

if [ -d /Applications/Ollama.app ] || command -v ollama >/dev/null 2>&1; then
  say "  Ollama: yes"
else
  say "  Ollama: not installed. It runs the models."
  say "    Download it from https://ollama.com/download, open the file, and drag Ollama to Applications."
  MISSING=1
fi

NODE_MAJOR=0
command -v node >/dev/null 2>&1 && NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -ge 22 ]; then
  say "  Node: $(node -v)"
else
  [ "$NODE_MAJOR" -gt 0 ] && say "  Node: $(node -v) is too old; it needs 22 or newer." || say "  Node: not installed. It runs the app."
  say "    Download the LTS installer from https://nodejs.org and open it."
  MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
  say ""
  say "Opening the download page(s) in your browser."
  [ -d /Applications/Ollama.app ] || command -v ollama >/dev/null 2>&1 || open "https://ollama.com/download"
  [ "$NODE_MAJOR" -ge 22 ] || open "https://nodejs.org"
  stop "Install what is missing above, then double-click Variable Machine again."
fi

if command -v uv >/dev/null 2>&1; then
  say "  uv: $(uv --version | cut -d' ' -f2)"
else
  say "  uv: not installed. It runs training. Installing it now:"
  run sh -c 'curl -LsSf https://astral.sh/uv/install.sh | sh' || stop "uv did not install." "Check the internet connection and double-click Variable Machine again."
  command -v uv >/dev/null 2>&1 || stop "uv installed, but this window cannot find it." "Close this window and double-click Variable Machine again."
fi
echo

# ---- 3. already running? ----
if curl -s --max-time 2 "$URL/" | grep -q '<title>Variable Machine'; then
  bold "Variable Machine is already running."
  run open "$URL"
  say "It runs in another Terminal window; close that one to stop it."
  sleep 3
  exit 0
fi

# ---- 4. what the app uses: installed the first time, and again when it changes ----
bold "3. Getting the app ready"
# hash file: a short fingerprint of a lockfile, so installs run only when it changes
hash() { shasum "$1" | cut -c1-16; }

if [ ! -f node_modules/.vm-installed ] || [ "$(cat node_modules/.vm-installed)" != "$(hash package-lock.json)" ]; then
  say "  Installing the app's packages (the first time takes a minute or two)."
  run npm install --no-audit --no-fund || stop "npm install did not finish." "Check the internet connection and double-click Variable Machine again."
  hash package-lock.json > node_modules/.vm-installed
else
  say "  App packages: installed"
fi

if [ ! -f python/.venv/.vm-installed ] || [ "$(cat python/.venv/.vm-installed)" != "$(hash python/uv.lock)" ]; then
  say "  Installing the training tools: Python and MLX (the first time takes a few minutes)."
  run uv sync --project python || stop "uv sync did not finish." "Check the internet connection and double-click Variable Machine again."
  hash python/uv.lock > python/.venv/.vm-installed
else
  say "  Training tools: installed"
fi

# The page is built from ui/src; build it when it's missing or a source file is newer.
if [ ! -f ui/dist/index.html ] || [ -n "$(find ui/src ui/index.html -newer ui/dist/index.html -type f 2>/dev/null | head -1)" ]; then
  say "  Building the page."
  run npm run build -w ui --silent || stop "The page did not build." "Tell your teacher what the window above says."
else
  say "  Page: built"
fi
echo

# ---- 5. Ollama ----
bold "4. Starting Ollama"
if curl -s --max-time 2 http://127.0.0.1:11434/api/version >/dev/null; then
  say "  Ollama: already running"
else
  if [ -d /Applications/Ollama.app ]; then
    run open -g -a Ollama
  else
    run nohup ollama serve >/dev/null 2>&1 &
  fi
  for _ in $(seq 1 20); do
    curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null && break
    sleep 1
  done
  curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null \
    && say "  Ollama: running" \
    || warn "Ollama has not answered yet. The app starts anyway and finds it when it's ready."
fi
echo

# ---- 6. the app ----
bold "5. Starting Variable Machine"
say "  Leave this window open while you use it. Close it (or press ctrl-C) to stop."
echo

# Closing the window (a hangup) or ctrl-C reaches the app directly: it tidies up
# (temporary variants) and stops. This window only waits for it to finish.
VARIABLE_MACHINE_PORT="$PORT" VARIABLE_MACHINE_OPEN="${VARIABLE_MACHINE_OPEN:-1}" node --import tsx helper/src/index.ts &
APP=$!
trap 'wait "$APP"; exit 0' HUP INT
trap 'kill -TERM "$APP" 2>/dev/null; wait "$APP"; exit 0' TERM
wait "$APP"
CODE=$?
# It stopped by itself (a port clash, an error): keep the window open so its message can be read.
[ "$CODE" -eq 0 ] || stop "Variable Machine stopped (code $CODE)." "The lines above say why."
