#!/usr/bin/env bash
# Export N evenly-spaced frames of a comp from the RUNNING After Effects as PNGs,
# plus one horizontal contact sheet (needs ffmpeg) — so you can LOOK at what you
# just animated instead of authoring blind.
#
# Usage:  ae-frames.sh [comp-name] [num-frames] [out-dir]
#         (a numeric first arg is treated as num-frames: ae-frames.sh 6 /tmp/x)
#   comp-name   omitted/"" = active comp, else the first comp in the project
#   num-frames  default 5 (capped at 12)
#   out-dir     default /tmp/ae_frames (wiped each run)
#
# Prints comp info + one PNG path per frame + the sheet path. Read the sheet
# image to see the whole motion in a single look.
# Requires AE >= 2022 (22.0) for CompItem.saveFrameToPng().
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
COMP_NAME="${1:-}"
N="${2:-5}"
OUT="${3:-/tmp/ae_frames}"
# Forgiving arg order: a purely numeric first arg is a frame count, not a comp
# name — so `ae-frames.sh 6 /tmp/x` works. (Corner case: a comp whose name is
# purely numeric can't be addressed by name here — make it the active comp instead.)
case "$COMP_NAME" in
  (''|*[!0-9]*) : ;;
  (*) N="$COMP_NAME"; OUT="${2:-/tmp/ae_frames}"; COMP_NAME="" ;;
esac
case "$N" in (*[!0-9]*|'') echo "num-frames must be a positive integer" >&2; exit 1;; esac
[ "$N" -ge 1 ] || N=1
[ "$N" -le 12 ] || N=12

rm -rf "$OUT"; mkdir -p "$OUT"

JSX=$(mktemp /tmp/ae_frames.XXXXXX).jsx
cat > "$JSX" <<EOF
(function () {
    var COMP_NAME = "$COMP_NAME";
    var N = $N;
    var OUT = "$OUT";
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    var p = app.project, comps = [], target = null, i;
    for (i = 1; i <= p.numItems; i++) if (p.item(i) instanceof CompItem) comps.push(p.item(i));
    if (COMP_NAME !== "") {
        for (i = 0; i < comps.length; i++) if (comps[i].name === COMP_NAME) { target = comps[i]; break; }
        if (!target) {
            var names = []; for (i = 0; i < comps.length; i++) names.push(comps[i].name);
            aeWrite("ERROR: no comp named '" + COMP_NAME + "'. Comps: " + names.join(", "));
            return;
        }
    } else if (p.activeItem && p.activeItem instanceof CompItem) {
        target = p.activeItem;
    } else if (comps.length >= 1) {
        target = comps[0];
    }
    if (!target) { aeWrite("ERROR: project has no comps."); return; }
    if (!target.saveFrameToPng) { aeWrite("ERROR: saveFrameToPng not available (needs AE 2022+)."); return; }
    var out = "comp='" + target.name + "' " + target.width + "x" + target.height +
              " dur=" + target.duration.toFixed(2) + "s fps=" + target.frameRate +
              " layers=" + target.numLayers + "\n";
    var lastT = Math.max(0, target.duration - 1 / target.frameRate);
    for (i = 0; i < N; i++) {
        var t = (N === 1) ? 0 : lastT * i / (N - 1);
        var f = new File(OUT + "/frame_" + pad(i) + "_t" + t.toFixed(2) + "s.png");
        target.saveFrameToPng(t, f);
        out += f.fsName + "\n";
    }
    aeWrite(out);
})();
EOF

"$HERE/ae-run.sh" "$JSX" "$OUT/result.txt"
rm -f "$JSX"
grep -q '^ERROR' "$OUT/result.txt" && exit 1

# saveFrameToPng can lag a beat behind the script returning; wait for the files
for _ in $(seq 1 50); do
  [ "$(ls "$OUT"/frame_*.png 2>/dev/null | wc -l | tr -d ' ')" -ge "$N" ] && break
  sleep 0.1
done
GOT="$(ls "$OUT"/frame_*.png 2>/dev/null | wc -l | tr -d ' ')"
[ "$GOT" -ge 1 ] || { echo "no PNGs were written (frames may still be rendering, or the comp failed to render)" >&2; exit 1; }
[ "$GOT" -eq "$N" ] || echo "warning: expected $N frames, got $GOT" >&2

# contact sheet: every frame side by side at 360px tall — the whole motion in one image
if command -v ffmpeg >/dev/null 2>&1 && [ "$GOT" -ge 2 ]; then
  FRAMES=("$OUT"/frame_*.png)
  IN=(); FC=""
  for idx in "${!FRAMES[@]}"; do
    IN+=(-i "${FRAMES[$idx]}")
    FC+="[${idx}:v]scale=-1:360[s${idx}];"
  done
  for idx in "${!FRAMES[@]}"; do FC+="[s${idx}]"; done
  FC+="hstack=inputs=${#FRAMES[@]}"
  ffmpeg -y -loglevel error "${IN[@]}" -filter_complex "$FC" "$OUT/sheet.png" \
    && echo "sheet: $OUT/sheet.png"
fi
