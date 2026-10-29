#!/usr/bin/env bash
# Photo in, labelled coordinate grid JPEG out at half scale, for finding crop geometry.
# The labels are the full-scale coordinates cutout.sh and paper.sh use.
# usage: grid.sh <photo> <out.jpg>
set -euo pipefail
IN=$1; OUT=$2
T=$(mktemp -d /tmp/pb-grid.XXXXXX)
trap 'rm -rf "$T"' EXIT
magick "$IN" -auto-orient -resize 2400x2400 \( +clone -blur 0x40 \) -fx 'u/v' -clamp -colorspace sRGB "$T/flat.png"
W=$(magick "$T/flat.png" -format %w info:)
H=$(magick "$T/flat.png" -format %h info:)
draw=()
for ((x = 100; x < W; x += 100)); do draw+=(-draw "line $x,0 $x,$H" -draw "text $((x + 4)),30 '$x'"); done
for ((y = 100; y < H; y += 100)); do draw+=(-draw "line 0,$y $W,$y" -draw "text 4,$((y - 6)) '$y'"); done
magick "$T/flat.png" -font /System/Library/Fonts/Supplemental/Arial.ttf -pointsize 28 -fill red -stroke red -strokewidth 1 \
  "${draw[@]}" -resize 50% -quality 80 "$OUT"
