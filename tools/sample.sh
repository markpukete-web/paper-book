#!/usr/bin/env bash
# Builds the sample book: draws sample/page.jpg, then cuts site/assets/ from it with the same tools a
# real book uses. The page is a stand-in for a photographed page of a child's book, so the site, the
# tools and their check run without anyone's real photos: pencil-grey drawings and words, one faint
# note, one coloured sticker and five staples on cream paper, lit unevenly like a phone photo.
# Coordinates are the 2400-pixel-long-side ones that grid.sh labels and check.sh crops.
# usage: sample.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=sample/page.jpg
mkdir -p sample site/assets
FONT="/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf"
[ -f "$FONT" ] || { echo "sample.sh: font not found: $FONT" >&2; exit 2; }
P='-stroke #4a4a4a -strokewidth 7 -fill none'
magick -size 2400x1800 xc:'#f4efe2' \
  \( -size 2400x1800 radial-gradient:white-'#b8b4aa' \) -compose Multiply -composite \
  -font "$FONT" -fill '#4a4a4a' -stroke none \
  -pointsize 130 -annotate +140+230 'The Paper Book' \
  -pointsize 100 -annotate +1280+190 'Draw it on paper.' -annotate +1280+310 'It stands up.' \
  -pointsize 120 -annotate +160+1150 'The end.' \
  -fill '#a8a8a8' -pointsize 60 -annotate +1960+960 'page 2' \
  $P -draw 'circle 300,520 410,520' \
  -draw 'line 300,350 300,380 line 300,660 300,690 line 130,520 160,520 line 440,520 470,520' \
  -draw 'line 180,400 200,420 line 400,620 420,640 line 420,400 400,420 line 180,640 200,620' \
  -draw 'polyline 620,530 850,330 1080,530' -draw 'rectangle 660,530 1040,850' \
  -draw 'rectangle 800,690 900,850' -draw 'rectangle 700,580 780,650' -draw 'rectangle 920,580 1000,650' \
  -draw 'line 1500,960 1500,720 line 1560,960 1560,720' \
  -draw 'path "M 1500,720 C 1300,740 1320,500 1440,520 C 1430,400 1640,390 1640,500 C 1760,500 1760,740 1560,720"' \
  -draw 'ellipse 2060,530 220,120 0,360' -draw 'polyline 1940,630 1880,720 2000,645' \
  -draw 'circle 300,1450 400,1450 circle 640,1450 740,1450 circle 980,1450 1080,1450' \
  -draw 'point 265,1420 point 335,1420' -draw 'arc 250,1420 350,1510 20,160' \
  -draw 'arc 590,1420 690,1510 20,160 arc 930,1420 1030,1510 20,160' \
  -draw 'circle 605,1420 610,1420 circle 675,1420 680,1420 circle 945,1420 950,1420 circle 1015,1420 1020,1420' \
  -draw 'circle 265,1420 270,1420 circle 335,1420 340,1420' \
  -stroke '#2d5fa8' -strokewidth 10 -fill '#e44a2c' \
  -draw 'path "M 1450,1120 C 1450,1020 1600,1020 1600,1120 C 1600,1020 1750,1020 1750,1120 C 1750,1220 1600,1300 1600,1360 C 1600,1300 1450,1220 1450,1120 Z"' \
  -stroke none -fill '#555' \
  -draw 'rectangle 2165,1080 2177,1150 rectangle 2165,1220 2177,1290 rectangle 2165,1360 2177,1430' \
  -draw 'rectangle 2165,1500 2177,1570 rectangle 2165,1640 2177,1710' \
  -blur 0x0.8 -seed 1 -attenuate 0.3 +noise Gaussian -quality 90 "$OUT"

A=site/assets
./tools/cutout.sh "$OUT" $A/01-title.webp 1000x240+100+80
./tools/cutout.sh "$OUT" $A/01-sun.webp 400x400+100+320
./tools/cutout.sh "$OUT" $A/01-house.webp 560x620+580+280
./tools/cutout.sh "$OUT" $A/01-staples.webp 120x700+2110+1040
./tools/cutout.sh "$OUT" $A/02-text.webp 1100x300+1230+70
./tools/cutout.sh "$OUT" $A/02-tree.webp 520x620+1270+380
./tools/cutout.sh "$OUT" $A/02-bubble.webp 500x380+1810+380
./tools/cutout.sh "$OUT" $A/03-text.webp 700x220+100+1020
./tools/cutout.sh "$OUT" $A/03-smileys.webp 1000x300+130+1310
./tools/cutout.sh "$OUT" $A/03-heart.webp 420x420+1390+1000 --colour
./tools/paper.sh "$OUT" 700x300+1300+1460 $A/paper.webp
