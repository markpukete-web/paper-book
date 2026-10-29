#!/usr/bin/env bash
# Photo in, pencil cut-out WebP with alpha out.
# usage: cutout.sh <photo> <out.webp> [WxH+X+Y] [--erase WxH+X+Y ...] [--level N] [--floor N] [--colour] [--fuzz N]
# Exits 3, writing nothing, when the crop edge cuts through pencil or a glued-in picture.
# Warns, naming the side, when an erase covers pencil on the crop edge: the guard cannot see there.
# The crop and the erase rectangles are in the 2400-pixel-long-side coordinates
# that grid.sh labels. Erase rectangles are relative to the cropped image.
# --level N is the black point in percent (default 68): raise it for a page with light pencil.
# --floor N is the faintest mark kept, in percent of full pencil (default 12): raise it to drop a
# shadow that is lighter than the lines (30 on page 9, where a hand cast one under the cheetah).
# --colour keeps a glued-in picture as it is: the paper around it becomes transparent, the
# picture keeps its colour. The crop must contain the whole picture with paper on all sides.
# --fuzz N is how far from the corner paper colour, in percent, still counts as paper (default 13;
# 20 ate the pale blue background of the page 8 picture, 9 left white slivers at its edge).
set -euo pipefail
IN=$1; OUT=$2; shift 2
CROP=""; ERASE=(); LEVEL=68; FLOOR=12; COLOUR=0; FUZZ=13
while [ $# -gt 0 ]; do
  case $1 in
    --erase) ERASE+=("$2"); shift 2 ;;
    --level) LEVEL=$2; shift 2 ;;
    --floor) FLOOR=$2; shift 2 ;;
    --colour) COLOUR=1; shift ;;
    --fuzz) FUZZ=$2; shift 2 ;;
    *) CROP=$1; shift ;;
  esac
done

T=$(mktemp -d /tmp/pb-cut.XXXXXX)
trap 'rm -rf "$T"' EXIT

args=()
if [ "$COLOUR" = 1 ]; then
  # colour: crop, then flood the near-white paper from the four corners to transparent
  [ -n "$CROP" ] || { echo "cutout.sh: --colour needs a crop" >&2; exit 2; }
  magick "$IN" -auto-orient -resize 2400x2400 -crop "$CROP" +repage "$T/colour.png"
  w=$(magick "$T/colour.png" -format %w info:); h=$(magick "$T/colour.png" -format %h info:)
  magick "$T/colour.png" -fuzz "${FUZZ}%" -fill none \
    -draw "alpha 0,0 floodfill" -draw "alpha $((w - 1)),0 floodfill" \
    -draw "alpha 0,$((h - 1)) floodfill" -draw "alpha $((w - 1)),$((h - 1)) floodfill" "$T/cut.png"
else
  # 1. flatten the lighting: the photo divided by a blurred copy of itself. -fx 'u/v' says which way
  # round. On ImageMagick 7.1.2-34 (installed 24 Oct 2026), -compose Divide_Dst divided the blur by
  # the photo, and every cut-out became the shading around the pencil instead of the pencil.
  magick "$IN" -auto-orient -resize 2400x2400 \( +clone -blur 0x40 \) -fx 'u/v' -clamp -colorspace Gray "$T/flat.png"

  # 2. pencil to alpha: level, invert, despeckle, drop marks under the floor and specks under 12 px,
  # dark grey fill
  magick "$T/flat.png" -level "${LEVEL}%,96%" -negate -despeckle -despeckle \
    -define connected-components:area-threshold=12 -define connected-components:mean-color=true \
    -threshold "${FLOOR}%" -connected-components 4 -alpha off -write mpr:mask +delete \
    "$T/flat.png" -level "${LEVEL}%,96%" -negate mpr:mask -compose Multiply -composite \
    -alpha copy -fill '#333' -colorize 100 "$T/cut.png"
  [ -n "$CROP" ] && args+=(-crop "$CROP" +repage)
fi

# 3. erase, refuse a crop that cuts through pencil or picture, trim, cap at 2048, drop the photo's
# metadata (GPS, time, device) but keep its colour profile, write
magick "$T/cut.png" ${args[@]+"${args[@]}"} +repage "$T/cropped.png"
erases=()
for g in ${ERASE[@]+"${ERASE[@]}"}; do
  [[ $g =~ ^([0-9]+)x([0-9]+)\+([0-9]+)\+([0-9]+)$ ]] || { echo "cutout.sh: bad erase geometry $g" >&2; exit 2; }
  w=${BASH_REMATCH[1]}; h=${BASH_REMATCH[2]}; x=${BASH_REMATCH[3]}; y=${BASH_REMATCH[4]}
  erases+=( \( +clone -alpha extract -fill black -draw "rectangle $x,$y $((x + w - 1)),$((y + h - 1))" \) -alpha off -compose CopyOpacity -composite )
done
magick "$T/cropped.png" ${erases[@]+"${erases[@]}"} "$T/framed.png"

# A crop edge through a mark cut 8 of 12 text pictures short by a letter (review of 17 Oct 2026). The
# cut has already dropped specks under 12 pixels, so any pixel above 10% alpha, which keeps faint
# pencil, on the crop's outermost line is a real mark crossing the edge, and refuses the crop. A
# 3-pixel ring allowing 12 such pixels let a 4-pixel stroke through (Codex, 17 Oct 2026).
# The line is read after the erases, so an erase on it hides a cut letter: an erase along the bottom
# edge passed a crop through the cover girl's waist (Fable, 17 Oct 2026). Erasing a page edge there is
# often right, so that is a warning to check the edge by eye, not a refusal.
if [ -n "$CROP" ]; then
  W=$(magick "$T/framed.png" -format %w info:); H=$(magick "$T/framed.png" -format %h info:)
  ink() { magick "$1" -alpha extract -crop "$2" +repage -threshold 10% -format '%[fx:round(mean*w*h)]' info:; }
  total=0; sides=()
  for side in "top ${W}x1+0+0" "bottom ${W}x1+0+$((H - 1))" "left 1x${H}+0+0" "right 1x${H}+$((W - 1))+0"; do
    n=$(ink "$T/framed.png" "${side#* }"); total=$((total + n)); [ "$n" -gt 0 ] && sides+=("${side%% *}")
    e=$(ink "$T/cropped.png" "${side#* }")
    if [ "$e" -gt "$n" ]; then
      echo "cutout.sh: an erase hides $((e - n)) marked pixels on the ${side%% *} edge: check that edge by eye" >&2
    fi
  done
  if [ "$total" -gt 0 ]; then
    echo "cutout.sh: crop edge cuts through pencil: $(IFS=,; echo "${sides[*]}" | sed 's/,/, /g') ($total pixels)" >&2
    exit 3
  fi
fi
magick "$T/framed.png" -trim +repage -resize '2048x2048>' +profile '!icc,*' -quality 85 "$OUT"
