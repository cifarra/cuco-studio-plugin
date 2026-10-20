#!/bin/bash
# Where does a style put the media and the text? Renders a test pattern through a style
# and saves a full frame, so you can size/compose generated media for the style's media slot.
#   probe_style.sh <STYLE_ID> [OUT_PNG]
# Look for: media slot aspect (many styles show media in a card/crop, not full-frame),
# how much gets cropped, and where captions land (keep labels away from that area).
set -e
STYLE=$1; OUT=${2:-/tmp/cuco_probe_$STYLE.png}
BASE="$HOME/Library/Application Support/CucoStudio"
TMP=$(mktemp -d)
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1920x1080:r=24:d=8" -pix_fmt yuv420p "$TMP/probe.mp4"
PID=$(cuco --json project create --name "zz style probe $STYLE" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")
H=$(shasum -a 256 "$TMP/probe.mp4" | cut -d' ' -f1)
mkdir -p "$BASE/projects/$PID/attached_media"; cp "$TMP/probe.mp4" "$BASE/projects/$PID/attached_media/$H.mp4"
SZ=$(stat -f%z "$TMP/probe.mp4")
cat > "$TMP/sb.json" <<JSON
{"sections":[{"text":"This is a layout probe for the style, one two three four five six.","media":[{"filePath":"projects/$PID/attached_media/$H.mp4","fileHash":"$H","originalName":"probe.mp4","fileSize":$SZ,"mimeType":"video/mp4"}],"origin":"text","story_source":"text","language":"en","mute":true}],"soundtrack_duration":0}
JSON
cuco storyboard update "$PID" --file "$TMP/sb.json" >/dev/null
AID=$(cuco --json arrangement create "$PID" --patch-json "{\"style_id\": $STYLE}" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")
cuco arrangement process "$PID" "$AID" --render --style-id="$STYLE" --wait >/dev/null
ffmpeg -v error -y -ss 2.5 -i "$BASE/projects/$PID/arrangements/$AID/video.mp4" -frames:v 1 "$OUT"
echo "probe frame: $OUT   (project $PID — delete it in the app when done)"
