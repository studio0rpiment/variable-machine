#!/bin/bash
# Variable Machine: install it, or update it, from Terminal with one line:
#
#   curl -fsSL https://variablemachine.orpiment.studio/install.sh | bash
#
# It downloads the newest release into ~/variable-machine (an update keeps your
# workspace: datasets, sets, adapters, models), makes a Variable Machine app in
# Applications, and opens it. After that, start it from the app, like any other.
#
# Why not just the zip: macOS won't open a script downloaded in a browser unless
# Apple has signed it. Files that curl downloads aren't marked as downloaded, so
# macOS opens them, and the app is made on this Mac, so it opens too.
#
# Every command it runs is shown with ▸ in front.

# Everything is inside main, so nothing runs until the whole file has arrived.
main() {
  set -u
  REPO="studio0rpiment/variable-machine"
  DEST="${VARIABLE_MACHINE_HOME:-$HOME/variable-machine}"
  # The Applications folder; on a Mac where this user can't write there (not an
  # administrator), the Applications folder in their home folder.
  if [ -w /Applications ]; then APPS=/Applications; else APPS="$HOME/Applications"; fi
  APP="$APPS/Variable Machine.app"

  bold() { printf '\033[1m%s\033[0m\n' "$1"; }
  say() { printf '%s\n' "$1"; }
  run() { printf '\033[32m▸ %s\033[0m\n' "$*"; "$@"; }
  stop() {
    printf '\n\033[31m✗ %s\033[0m\n' "$1"
    [ -n "${2:-}" ] && say "  $2"
    exit 1
  }

  echo
  bold "Variable Machine: install"
  echo

  [ "$(uname)" = "Darwin" ] || stop "This isn't a Mac." "Variable Machine runs on a Mac with Apple Silicon."
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] \
    || stop "This Mac has an Intel processor." "Variable Machine trains models with MLX, which needs Apple Silicon (M1 or later)."
  MACOS="$(sw_vers -productVersion)"
  [ "${MACOS%%.*}" -ge 14 ] \
    || stop "macOS $MACOS is too old." "Variable Machine needs macOS 14 (Sonoma) or later: Apple menu → System Settings → General → Software Update."

  # ---- the newest release ----
  bold "1. Finding the newest release"
  TAG="${VARIABLE_MACHINE_TAG:-$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=1" 2>/dev/null \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)}"
  [ -n "$TAG" ] || stop "GitHub didn't answer." "Check the internet connection and paste the line again."
  say "  $TAG"
  echo

  # ---- download and unpack ----
  bold "2. Downloading it"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  run curl -fL --progress-bar -o "$TMP/vm.zip" "https://github.com/$REPO/archive/refs/tags/$TAG.zip" \
    || stop "The download didn't finish." "Check the internet connection and paste the line again."
  run unzip -q "$TMP/vm.zip" -d "$TMP" || stop "The download is damaged." "Paste the line again."
  SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [ -f "$SRC/Variable Machine.command" ] || stop "The download doesn't look like Variable Machine." "Tell your teacher."
  echo

  # ---- into place ----
  if [ -d "$DEST" ]; then
    bold "3. Updating $DEST"
    say "  Your workspace (datasets, sets, adapters, models) stays as it is."
    # No --delete: whatever is already there, and isn't in the release, stays.
    run rsync -a "$SRC/" "$DEST/" || stop "The update didn't finish." "Close Variable Machine's Terminal window if it is open, then paste the line again."
  else
    bold "3. Putting it in $DEST"
    run mv "$SRC" "$DEST" || stop "It couldn't be put in $DEST."
  fi
  echo "$TAG" > "$DEST/.vm-version"
  echo

  # ---- the app ----
  bold "4. Making the Variable Machine app"
  mkdir -p "$APPS"
  rm -rf "$APP"
  # an app left in the home folder's Applications by an earlier install
  [ "$APPS" = /Applications ] && rm -rf "$HOME/Applications/Variable Machine.app"
  # The app opens the launcher in Terminal, where its progress and messages can be read.
  run osacompile -o "$APP" -e "do shell script \"open -a Terminal \" & quoted form of \"$DEST/Variable Machine.command\"" \
    || stop "The app couldn't be made." "You can still start it: in Finder, open $DEST and double-click Variable Machine.command."
  if [ -f "$DEST/scripts/app-icon.icns" ]; then
    cp "$DEST/scripts/app-icon.icns" "$APP/Contents/Resources/applet.icns"
    codesign --force --sign - "$APP" >/dev/null 2>&1
    touch "$APP"
  fi
  say "  $APP"
  echo

  bold "Installed. Starting Variable Machine."
  say "  Next time, open Variable Machine like any other app: it is in $APPS (the Finder window"
  say "  that just opened), or press cmd-space and type Variable Machine. You can drag it to the Dock."
  say "  To update it later, paste the same line again."
  echo
  # show it in Finder, so it is clear where it lives, then start it
  open -R "$APP"
  run open "$APP"
}

main "$@"
