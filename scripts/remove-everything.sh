#!/bin/bash
# Remove Variable Machine and everything it installed or downloaded from this Mac.
#
# Run it from Terminal, from inside the variable-machine folder:
#
#     bash scripts/remove-everything.sh            (asks before each step)
#     bash scripts/remove-everything.sh --dry-run  (only shows what it would remove)
#
# It needs no Node or Python, so it still works after those are gone. Every
# step says what it removes and how much space it frees, and waits for "y".
# Things you own are moved to the Trash (empty the Trash to delete them for
# good); system files that need your password are deleted. It never touches
# anything outside the list below.

set -u
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TRASH="$HOME/.Trash"
STAMP="$(date +%Y%m%d-%H%M%S)"
REMOVED=()
KEPT=()

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }
size() { du -sch "$@" 2>/dev/null | tail -1 | cut -f1; }

# ask "question": true only for y / yes
ask() {
  if [ $DRY -eq 1 ]; then dim "  (dry run: nothing removed)"; return 1; fi
  printf '%s [y/N] ' "$1"
  read -r answer
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# to_trash path…: move each that exists to the Trash. Named after where it was (~/.local/share/uv
# becomes "local-share-uv"), so two things called uv don't clash and nothing lands hidden behind a dot.
to_trash() {
  for p in "$@"; do
    [ -e "$p" ] || [ -L "$p" ] || continue
    rel="${p#$HOME/}"
    rel="$(printf '%s' "$rel" | tr '/' '-' | sed 's/^\.*//; s/-\./-/g')"
    dest="$TRASH/$rel (removed $STAMP)"
    n=2
    while [ -e "$dest" ]; do dest="$TRASH/$rel (removed $STAMP) $n"; n=$((n + 1)); done
    mv "$p" "$dest" && echo "  → Trash: $p"
  done
}

# existing path…: print the ones that exist
existing() { for p in "$@"; do [ -e "$p" ] || [ -L "$p" ] && echo "$p"; done; }

echo
bold "Remove Variable Machine from this Mac"
echo "This goes through, one at a time:"
echo "  1. the models Ollama downloaded"
echo "  2. the Ollama app"
echo "  3. the Python tool uv and its downloads"
echo "  4. Node.js, if it was installed from nodejs.org"
echo "  5. the variable-machine folder itself: your datasets, adapters, chats and trained models"
echo "Each step asks first. Answer y to remove it, or just press Return to keep it."
[ $DRY -eq 1 ] && bold "Dry run: this only shows what would be removed."
echo

# 0. stop what is running
if [ $DRY -eq 0 ]; then
  lsof -ti tcp:4817 2>/dev/null | xargs kill 2>/dev/null && echo "Stopped Variable Machine."
  osascript -e 'quit app "Ollama"' 2>/dev/null
  pkill -x ollama 2>/dev/null && echo "Stopped Ollama."
fi

# 1. Ollama's models
OLLAMA_DATA="$HOME/.ollama"
if [ -d "$OLLAMA_DATA" ]; then
  bold "1. Ollama's models ($(size "$OLLAMA_DATA"))"
  echo "   $OLLAMA_DATA"
  echo "   Every model Ollama downloaded, including any you pulled for other apps."
  command -v ollama >/dev/null 2>&1 && ollama list 2>/dev/null | sed 's/^/   /' | head -20
  if ask "   Remove all of Ollama's models?"; then to_trash "$OLLAMA_DATA"; REMOVED+=("Ollama's models"); else KEPT+=("Ollama's models"); fi
  echo
fi

# 2. the Ollama app and its settings
APP_PATHS=$(existing "/Applications/Ollama.app" "$HOME/Library/Application Support/Ollama" "$HOME/Library/Caches/com.electron.ollama" "$HOME/Library/Caches/ollama" "$HOME/Library/Saved Application State/com.electron.ollama.savedState" "$HOME/Library/Logs/Ollama" "$HOME/Library/Preferences/com.electron.ollama.plist")
CLI=$(existing "/usr/local/bin/ollama")
if [ -n "$APP_PATHS$CLI" ]; then
  bold "2. The Ollama app"
  echo "$APP_PATHS" | sed '/^$/d; s/^/   /'
  [ -n "$CLI" ] && echo "   $CLI   (the ollama command; needs your Mac password)"
  if ask "   Remove the Ollama app?"; then
    IFS=$'\n'; to_trash $APP_PATHS; unset IFS
    [ -n "$CLI" ] && sudo rm -f "$CLI" && echo "  deleted $CLI"
    REMOVED+=("the Ollama app")
  else KEPT+=("the Ollama app"); fi
  echo
fi

# 3. uv and what it downloaded (the Python it fetched, its cache)
UV_PATHS=$(existing "$HOME/.local/bin/uv" "$HOME/.local/bin/uvx" "$HOME/.local/share/uv" "$HOME/.cache/uv")
if [ -n "$UV_PATHS" ]; then
  IFS=$'\n'; UV_SIZE=$(size $UV_PATHS); unset IFS
  bold "3. uv, the Python tool ($UV_SIZE)"
  echo "$UV_PATHS" | sed 's/^/   /'
  echo "   Keep it if you use uv or Python for anything else."
  if ask "   Remove uv?"; then IFS=$'\n'; to_trash $UV_PATHS; unset IFS; REMOVED+=("uv"); else KEPT+=("uv"); fi
  echo
fi

# 4. Node.js, only as installed by the nodejs.org installer (Homebrew, nvm and fnm installs are left alone)
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ "$NODE_BIN" = "/usr/local/bin/node" ] && pkgutil --pkgs 2>/dev/null | grep -q '^org.nodejs.node'; then
  bold "4. Node.js (installed from nodejs.org)"
  echo "   /usr/local/bin/node, npm, npx, corepack, /usr/local/lib/node_modules, /usr/local/include/node"
  echo "   Keep it if you use Node for anything else. Removing it needs your Mac password."
  if ask "   Remove Node.js?"; then
    sudo rm -rf /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/lib/node_modules /usr/local/include/node /usr/local/share/doc/node /usr/local/share/man/man1/node.1 /usr/local/share/systemtap/tapset/node.stp
    for p in $(pkgutil --pkgs | grep '^org.nodejs'); do sudo pkgutil --forget "$p" >/dev/null; done
    to_trash "$HOME/.npm"
    echo "  deleted Node.js"
    REMOVED+=("Node.js")
  else KEPT+=("Node.js"); fi
  echo
elif [ -n "$NODE_BIN" ]; then
  bold "4. Node.js"
  echo "   Node is at $NODE_BIN, installed some other way (Homebrew, nvm or fnm), so it is left alone."
  echo "   If you installed it only for this, remove it the way you installed it (for Homebrew: brew uninstall node)."
  echo
fi

# 5. the variable-machine folder: the app, its workspace (datasets, adapters, chats, trained models), node_modules, the Python environment
bold "5. The variable-machine folder ($(size "$HERE"))"
echo "   $HERE"
echo "   The app and everything you made with it: datasets, adapters, trained models,"
echo "   chat logs, and the base models downloaded for training (workspace/hf)."
[ -d "$HOME/.cache/huggingface" ] && echo "   (Hugging Face's own cache at ~/.cache/huggingface is not touched: other apps may use it.)"
if ask "   Remove the variable-machine folder?"; then
  cd "$HOME" && to_trash "$HERE"
  REMOVED+=("the variable-machine folder")
else KEPT+=("the variable-machine folder"); fi

echo
bold "Done."
[ ${#REMOVED[@]} -gt 0 ] && echo "Removed: ${REMOVED[*]}."
[ ${#KEPT[@]} -gt 0 ] && echo "Kept: ${KEPT[*]}."
if [ ${#REMOVED[@]} -gt 0 ]; then
  echo "Most of it is in the Trash. Empty the Trash to delete it for good, or put anything back from there."
fi
echo "Your browser may still remember Variable Machine's settings for localhost:4817; clear that site's data in the browser's settings if you want it gone too."
echo
