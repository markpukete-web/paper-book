#!/usr/bin/env bash
# Photo in, paper texture WebP out. The crop is a blank area of the page.
# usage: paper.sh <photo> <WxH+X+Y> <out.webp>
# The photo's metadata (GPS, time, device) is dropped; only a colour profile may stay.
set -euo pipefail
IN=$1; CROP=$2; OUT=$3
magick "$IN" -auto-orient -resize 2400x2400 \( +clone -blur 0x40 \) -fx 'u/v' -clamp \
  -colorspace Gray -crop "$CROP" +repage -resize 1024x -level 20%,100% \
  -colorspace sRGB -fill '#fbf6ea' -colorize 25 -alpha off +profile '!icc,*' -quality 85 "$OUT"
