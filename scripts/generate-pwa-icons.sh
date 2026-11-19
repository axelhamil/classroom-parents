#!/usr/bin/env bash
# Regenerates every PNG icon of the app from the one source, packages/ui/src/assets/public/favicon.svg:
# the rounded tile (any purpose, favicon), a full-bleed tile (apple-touch-icon, maskable, with the mark
# inside the maskable safe zone) and the white mark alone (monochrome, notification badge). Run it after
# any change to the source, so the installed icon never drifts from the palette.
# Needs rsvg-convert (librsvg) and ImageMagick.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_svg="$root/packages/ui/src/assets/public/favicon.svg"
icons="$root/packages/ui/src/assets/public/icons"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for tool in rsvg-convert magick; do
  command -v "$tool" >/dev/null || { echo "generate-pwa-icons: $tool is required" >&2; exit 1; }
done

# The light tile only: a raster has no colour scheme to follow.
sed -E 's#@media[^{]*\{[^}]*\}\}##' "$source_svg" >"$work/tile.svg"
sed -E 's#(<rect class="t" width="64" height="64") rx="14"#\1#' "$work/tile.svg" >"$work/full-bleed.svg"
# Maskable: the mark shrinks from 84 % to 70 % of the side, inside the 80 % safe circle.
sed -E 's#translate\(5\.12 5\.12\) scale\(0\.84\)#translate(9.6 9.6) scale(0.7)#' "$work/full-bleed.svg" >"$work/maskable.svg"
# Monochrome: no tile, the whole mark in white, only its alpha is used by the system.
sed -E -e 's#<style>.*</style>##' -e 's#<rect class="t"[^>]*/>##' -e 's#fill="\#[0-9a-fA-F]{6}"#fill="\#fff"#g' \
  "$source_svg" >"$work/mark.svg"

render() {
  rsvg-convert -w "$3" -h "$3" "$work/$1.svg" -o "$work/$2"
  magick "$work/$2" -strip "$icons/$2"
}

render tile favicon-32.png 32
render tile icon-192.png 192
render tile icon-512.png 512
render full-bleed apple-touch-icon.png 180
render maskable icon-maskable-192.png 192
render maskable icon-maskable-512.png 512
render mark icon-monochrome-512.png 512
render mark badge-96.png 96

echo "generate-pwa-icons: 8 icons written to ${icons#"$root"/}"
