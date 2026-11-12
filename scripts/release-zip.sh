#!/bin/bash
# Attach the download zip to a GitHub release, so GitHub counts each download.
# (GitHub doesn't count downloads of its automatic source zips.)
#
#   scripts/release-zip.sh v0.3.1        make the zip from the tag and attach it
#   scripts/release-zip.sh --count       how many times each release's zip was downloaded
#
# The release must already exist (gh release create …). The zip is made with
# git archive from the tag, so it holds the same files as GitHub's source zip.
# The download page and install.sh use the attached zip when a release has one,
# and GitHub's source zip when it doesn't.
set -eu
REPO="studio0rpiment/variable-machine"

if [ "${1:-}" = "--count" ]; then
  gh api "repos/$REPO/releases" --paginate \
    --jq '.[] | "\(.tag_name)\t\([.assets[] | select(.name | endswith(".zip")) | .download_count] | add // "no zip attached")"'
  exit 0
fi

TAG="${1:?Give a release tag, like v0.3.1, or --count}"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "No tag $TAG here. Run: git fetch --tags"; exit 1; }
gh release view "$TAG" --repo "$REPO" >/dev/null || { echo "No release $TAG on GitHub yet. Make it first: gh release create $TAG"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ZIP="$TMP/variable-machine-$TAG.zip"
git archive --format=zip --prefix="variable-machine-$TAG/" -o "$ZIP" "$TAG"
echo "▸ gh release upload $TAG variable-machine-$TAG.zip"
gh release upload "$TAG" "$ZIP" --repo "$REPO" --clobber
echo "Attached. Downloads so far: scripts/release-zip.sh --count"
