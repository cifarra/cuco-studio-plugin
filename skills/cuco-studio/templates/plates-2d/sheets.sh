#!/bin/bash
# Contact sheets for review: one strip per beat (stills at 0.2 / 0.6 / 0.97), 3 beats per sheet.
#   ./sheets.sh OUTDIR b01 b02 b03 ...      (render stills first: node render.mjs --stills=0.2,0.6,0.97)
OUT=$1; shift; mkdir -p "$OUT"
for b in "$@"; do
  ffmpeg -v error -y -i stills/${b}_02.png -i stills/${b}_06.png -i stills/${b}_097.png \
    -filter_complex "[0]scale=600:-1[a];[1]scale=600:-1[b];[2]scale=600:-1[c];[a][b][c]hstack=3" "$OUT/$b.jpg"
done
set -- "$@"
while [ $# -gt 0 ]; do
  a=$1; b=${2:-$1}; c=${3:-${2:-$1}}
  ffmpeg -v error -y -i "$OUT/$a.jpg" -i "$OUT/$b.jpg" -i "$OUT/$c.jpg" -filter_complex vstack=3 "$OUT/sheet_$a.jpg"
  shift $(( $# < 3 ? $# : 3 ))
done
exit 0
