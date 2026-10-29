#!/usr/bin/env bash
# The runnable check for the tools. With --release, also the pre-publish guard.
set -euo pipefail
cd "$(dirname "$0")/.."

T=$(mktemp -d /tmp/pb-check.XXXXXX)
trap 'rm -rf "$T"' EXIT
fail() { echo "check: FAIL: $*" >&2; exit 1; }
# Camera photos carry GPS, capture time and device in EXIF and XMP. None of it may reach site/.
nometa() { ! magick identify -verbose "$1" | grep -qiE 'Profile-(exif|xmp|iptc|8bim)'; }

P=sample/page.jpg
[ -f "$P" ] || ./tools/sample.sh

./tools/cutout.sh "$P" "$T/house.webp" 560x620+580+280
[ -f "$T/house.webp" ] || fail "cutout.sh wrote nothing"
ch=$(magick "$T/house.webp" -format '%[channels]' info:); [[ $ch == srgba* ]] || fail "cut-out has no alpha: $ch"
w=$(magick "$T/house.webp" -format '%w' info:); [ "$w" -le 2048 ] || fail "cut-out wider than 2048"
nometa "$T/house.webp" || fail "cut-out keeps the photo's metadata"
# the pencil, not the shading around it. On ImageMagick 7.1.2-34 (installed 24 Oct 2026), -compose
# Divide_Dst divided the blur by the photo, and every cut-out became the halo of its lines. The house
# wall is solid ink at its centre line.
a=$(magick "$T/house.webp" -alpha extract -format '%[fx:p{43,350}]' info:)
awk "BEGIN { exit !($a > 0.9) }" || fail "the house wall is not ink: alpha $a"

./tools/paper.sh "$P" 700x300+1300+1460 "$T/paper.webp"
ch=$(magick "$T/paper.webp" -format '%[channels]' info:); [[ $ch == srgb || $ch == "srgb "* ]] || fail "paper has an alpha channel: $ch"
[ "$(magick "$T/paper.webp" -format '%w' info:)" = "1024" ] || fail "paper is not 1024 wide"
nometa "$T/paper.webp" || fail "paper keeps the photo's metadata"

./tools/grid.sh "$P" "$T/grid.jpg"
[ "$(magick "$T/grid.jpg" -format '%w' info:)" = "1200" ] || fail "grid is not half scale"

# colour mode keeps a glued-in picture as it is: alpha outside it, colour inside it
./tools/cutout.sh "$P" "$T/colour.webp" 420x420+1390+1000 --colour
ch=$(magick "$T/colour.webp" -format '%[channels]' info:); [[ $ch == srgba* ]] || fail "colour cut-out has no alpha: $ch"
sat=$(magick "$T/colour.webp" -colorspace HSL -channel G -separate +channel -format '%[fx:mean]' info:)
awk "BEGIN { exit !($sat > 0.15) }" || fail "colour cut-out is grey: saturation $sat"
nometa "$T/colour.webp" || fail "colour cut-out keeps the photo's metadata"

# the guard: a crop whose edge cuts through pencil, dark or faint, or through a glued-in picture, is refused
refused() { local photo=$1; shift; local rc=0; ./tools/cutout.sh "$photo" "$T/refused.webp" "$@" >/dev/null 2>&1 || rc=$?; [ "$rc" = 3 ]; }
refused "$P" 560x300+580+280 || fail "a crop through the house walls was not refused"
refused "$P" 300x70+1900+880 || fail "a crop through the faint note was not refused"
refused "$P" 300x420+1390+1000 --colour || fail "a crop through the sticker was not refused"
# a crop through a stroke only 4 pixels wide (Codex's case): a black T whose stem the crop cuts
magick -size 2400x2400 xc:white -fill black -draw 'rectangle 500,500 660,503' -draw 'rectangle 578,500 581,700' "$T/t.png"
refused "$T/t.png" 150x260+480+480 || fail "a crop through a 4-pixel stroke was not refused"
# an erase on the edge hides the cut from the guard, so the same house crop with its bottom line erased
# passes, and must say so (Fable's case)
./tools/cutout.sh "$P" "$T/erased.webp" 560x300+580+280 --erase 560x1+0+299 2>"$T/erased.err" || fail "the house crop with its edge erased was refused"
grep -q 'on the bottom edge: check that edge by eye' "$T/erased.err" || fail "an erase over a cut edge gave no warning"

if [ "${1:-}" = "--release" ]; then
  grep -q '<meta name="robots" content="noindex, noimageindex">' site/index.html || fail "the page must ask search engines not to index it or its images"
  grep -q '"X-Robots-Tag", "value": "noindex"' site/vercel.json || fail "site/vercel.json must send X-Robots-Tag: noindex on every response"
  [ -z "$(find site -iname '*original*')" ] || fail "an 'original' file is inside site/"
  for f in site/assets/*.webp; do nometa "$f" || fail "$f carries photo metadata"; done
fi

echo "check: ok"
