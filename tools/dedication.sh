#!/usr/bin/env bash
# Renders a line of text as a pencil-grey cut-out WebP with alpha, in a handwriting-style font
# that ships with macOS. Used for the dedication while there is no handwritten photo of it.
# A handwritten photo replaces the result with cutout.sh at any time.
# usage: dedication.sh "line one\nline two" <out.webp>
set -euo pipefail
TEXT=$1; OUT=$2
FONT="/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf"
[ -f "$FONT" ] || { echo "dedication.sh: font not found: $FONT" >&2; exit 2; }
magick -background none -fill '#3a3a3a' -font "$FONT" -pointsize 110 -gravity center \
  label:"$(printf '%b' "$TEXT")" -blur 0x0.5 -trim +repage -quality 85 "$OUT"
