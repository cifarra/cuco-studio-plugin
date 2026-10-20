#!/usr/bin/env bash
# Run an ExtendScript (.jsx) file inside the already-running Adobe After Effects.
#
# Usage:   ae-run.sh <script.jsx> [result-file]
#
# - Auto-detects which AE version is the live process (2024/2025/2026/...).
# - DoScriptFile is SYNCHRONOUS but does NOT echo the script's return value
#   (it always returns "0"), so we capture output via a result file instead.
# - Your .jsx should call  aeWrite("...")  to report a result/diagnostics.
#   aeWrite() is injected globally before your script runs; any uncaught
#   exception is caught and written to the result file with its line number.
set -euo pipefail

JSX="${1:?usage: ae-run.sh <script.jsx> [result-file]}"
RESULT="${2:-/tmp/ae_result.txt}"
[ -f "$JSX" ] || { echo "no such jsx: $JSX" >&2; exit 1; }
# Absolutize both paths: ExtendScript's evalFile / File() resolve RELATIVE paths
# against AE's own cwd, not this shell's — relative paths fail with a confusing
# "File or folder does not exist".
JSX="$(cd "$(dirname "$JSX")" && pwd)/$(basename "$JSX")"
case "$RESULT" in /*) ;; *) RESULT="$(pwd)/$RESULT" ;; esac

# Match only AE's MAIN executable — helpers (CEPHtmlEngine, dynamiclinkmanager, crashpad…)
# can outlive a crashed AE of another version and would otherwise pick the wrong app.
RUNNING=$(ps -axo comm= \
  | sed -n 's#.*/\(Adobe After Effects [0-9]\{4\}\)\.app/Contents/MacOS/After Effects$#\1#p' \
  | sort -u)
APP=$(printf '%s\n' "$RUNNING" | head -1)
[ -n "$APP" ] || { echo "After Effects does not appear to be running." >&2; exit 1; }
if [ "$(printf '%s\n' "$RUNNING" | grep -c .)" -gt 1 ]; then
  echo "warning: several AE versions running ($(echo $RUNNING | tr '\n' ' ')); using $APP" >&2
fi

: > "$RESULT"
BOOT=$(mktemp /tmp/ae_boot.XXXXXX).jsx
cat > "$BOOT" <<EOF
var AE_RESULT = "$RESULT";
function aeWrite(s){ var f=new File(AE_RESULT); f.encoding="UTF-8"; f.open("w"); f.write(String(s)); f.close(); }
try { \$.evalFile(new File("$JSX")); }
catch(e){ aeWrite("ERROR: " + e.toString() + (e.line ? " (line " + e.line + ")" : "")); }
EOF

osascript -e "tell application \"$APP\" to DoScriptFile \"$BOOT\"" >/dev/null

# DoScriptFile is synchronous; poll briefly as a safety net.
for _ in $(seq 1 50); do [ -s "$RESULT" ] && break; sleep 0.1; done
rm -f "$BOOT"

if [ -s "$RESULT" ]; then cat "$RESULT"; echo; else echo "(no result written — script may not have called aeWrite)"; fi
