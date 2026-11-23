#!/bin/bash
# Variable Machine: install it, or update it, from Terminal with one line:
#
#   curl -fsSL https://variablemachine.orpiment.studio/install.sh | bash
#
# It downloads the newest release into ~/variable-machine (an update keeps your
# workspace: datasets, sets, adapters, models), makes a Variable Machine app in
# Applications, and opens it. After that, start it from the app, like any other.
#
# For one project on its own, name it after bash -s: the same download, but the
# app it makes opens only that project (Latent Image, Research Bot, Dream Cards):
#
#   curl -fsSL https://variablemachine.orpiment.studio/install.sh | bash -s latent
#   curl -fsSL https://variablemachine.orpiment.studio/install.sh | bash -s research
#   curl -fsSL https://variablemachine.orpiment.studio/install.sh | bash -s dream
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
  # The app to make: Variable Machine, or one project's (its launcher sits beside Variable Machine.command)
  case "${1:-}" in
    "") NAME="Variable Machine" ;;
    latent) NAME="Latent Image" ;;
    research) NAME="Research Bot" ;;
    dream) NAME="Dream Cards" ;;
    *) printf '\n\033[31m✗ There is no project called %s here.\033[0m\n  Try latent, research or dream, or nothing for all of Variable Machine.\n' "$1"; exit 1 ;;
  esac

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
  if [ -n "${VARIABLE_MACHINE_TAG:-}" ]; then
    RELEASE="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$VARIABLE_MACHINE_TAG" 2>/dev/null)"
  else
    RELEASE="$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=1" 2>/dev/null)"
  fi
  TAG="${VARIABLE_MACHINE_TAG:-$(printf '%s' "$RELEASE" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)}"
  [ -n "$TAG" ] || stop "GitHub didn't answer." "Check the internet connection and paste the line again."
  # The zip attached to the release (GitHub counts its downloads); else GitHub's source zip.
  ZIP_URL="$(printf '%s' "$RELEASE" | sed -n 's/.*"browser_download_url": *"\([^"]*\.zip\)".*/\1/p' | head -1)"
  [ -n "$ZIP_URL" ] || ZIP_URL="https://github.com/$REPO/archive/refs/tags/$TAG.zip"
  say "  $TAG"
  echo
  # The app carries the version in its name (Variable Machine 0.5.0), so it is clear which one is installed.
  VERSION="${TAG#v}"
  APP="$APPS/$NAME $VERSION.app"

  # ---- download and unpack ----
  bold "2. Downloading it"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  run curl -fL --progress-bar -o "$TMP/vm.zip" "$ZIP_URL" \
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
  bold "4. Making the $NAME app"
  [ -f "$DEST/$NAME.command" ] || stop "This download has no $NAME.command." "Tell your teacher: the project may be in a newer release."
  mkdir -p "$APPS"
  # this version's app, an earlier version's (Variable Machine 0.3.0.app) and one from before versions were in the name
  rm -rf "$APP" "$APPS/$NAME.app" "$APPS/$NAME "[0-9]*.app
  # an app left in the home folder's Applications by an earlier install
  [ "$APPS" = /Applications ] && rm -rf "$HOME/Applications/$NAME.app" "$HOME/Applications/$NAME "[0-9]*.app
  # The app opens the launcher in Terminal, where its progress and messages can be read.
  run osacompile -o "$APP" -e "do shell script \"open -a Terminal \" & quoted form of \"$DEST/$NAME.command\"" \
    || stop "The app couldn't be made." "You can still start it: in Finder, open $DEST and double-click $NAME.command."
  if [ -f "$DEST/scripts/app-icon.icns" ]; then
    cp "$DEST/scripts/app-icon.icns" "$APP/Contents/Resources/applet.icns"
    # macOS 26 takes an app's icon from Assets.car when Info.plist names one
    # (CFBundleIconName), so osacompile's default icon would win over the spiral.
    rm -f "$APP/Contents/Resources/Assets.car"
    /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" >/dev/null 2>&1
  fi
  # the version in Finder's Get Info too
  /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$APP/Contents/Info.plist" >/dev/null 2>&1 \
    || /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist" >/dev/null 2>&1
  codesign --force --sign - "$APP" >/dev/null 2>&1
  touch "$APP"
  say "  $APP"
  echo

  bold "Installed. Starting $NAME."
  say "  Next time, open $NAME like any other app: it is in $APPS (the Finder window"
  say "  that just opened), or press cmd-space and type $NAME. You can drag it to the Dock."
  say "  To update it later, paste the same line again. The new version's app takes this one's place;"
  say "  if you dragged this one to the Dock, drag the new one there too."
  echo
  # show it in Finder, so it is clear where it lives, then start it
  open -R "$APP"
  run open "$APP"
}

main "$@"
