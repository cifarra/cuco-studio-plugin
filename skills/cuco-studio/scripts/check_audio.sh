#!/bin/bash
# Fail loudly if a rendered video (or wav) is silent. max_volume around -91 dB = digital silence.
#   check_audio.sh <file>
MAX=$(ffmpeg -i "$1" -vn -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB.*/\1/p')
echo "max_volume=${MAX} dB"
python3 -c "import sys; sys.exit(1 if float('${MAX:--99}') < -60 else 0)" || { echo "SILENT AUDIO: $1"; exit 1; }
