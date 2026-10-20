# ExtendScript quick reference — the API this skill actually uses

Load this when a call errors or you're unsure a method exists. It is curated, not
Adobe's docs: every signature here is verified against a running AE. If an API is
not listed here or in SKILL.md, assume it doesn't exist and check here first.

## APIs that DO NOT exist (common hallucinations)

| You may be tempted to write | Reality |
|---|---|
| `app.project.activeComp` | `app.project.activeItem` — may be null; check `instanceof CompItem` |
| `item.type`, `Item.Comp` enum | `item instanceof CompItem / FolderItem / FootageItem` |
| `obj["width"]`, `layer["ADBE Scale"]` | string-bracket access fails on AE objects — dot access or `.property("matchName")` only |
| `project.item("name")` | `item(i)` is 1-based **integer** only; loop `1..numItems` to find by name |
| `layer.duration` | layers have `inPoint` / `outPoint` / `startTime` (seconds); only comps/footage have `duration` |
| `comp.saveFramePreview(...)` | `comp.saveFrameToPng(time, new File(path))` — AE 22.0 (2022)+ |

## Keyframe ease dimensions — the #1 crash

`prop.setTemporalEaseAtKey(keyIndex, inEaseArr, outEaseArr)` — array length MUST be:
- **1** for 1-D props (Opacity, Rotation) **and all spatial props** (Position, Anchor Point)
- **2** for 2-D, **3** for 3-D non-spatial. **`ADBE Scale` is 3-D even on a 2-D layer → needs 3.**

Never hardcode the length; derive it:

```js
function easeArr(prop, e) {
    var n = prop.isSpatial ? 1 : (prop.value instanceof Array ? prop.value.length : 1);
    var a = []; while (a.length < n) a.push(e);
    return a;
}
var e = new KeyframeEase(0, 60);          // (speed, influence 0.1–100)
prop.setTemporalEaseAtKey(1, easeArr(prop, e), easeArr(prop, e));
```

## Undo safety

`app.beginUndoGroup()` without a matching `endUndoGroup()` (script threw mid-way)
leaves the group open in the user's session. Always:

```js
app.beginUndoGroup("My change");
try { /* all mutations */ } finally { app.endUndoGroup(); }
```

## Values cheat-sheet

- Colors: 0–1 floats `[1, 0.54, 0.3]`, never 0–255.
- Scale: percent — `[100, 100]` set is fine, but its *value* reads back 3-D.
- Times: seconds (floats). Rotation: degrees. `comp.frameRate`, `comp.duration` for math.
- Keyframes: `prop.setValueAtTime(t, v)`; expressions: `prop.expression = "…"` (use `\r` between statements).
- Free path: `var s = new Shape(); s.vertices = [[x,y],…]; s.closed = true;` — optional
  `s.inTangents` / `s.outTangents` (same length as vertices) for curves.
- New comp: `app.project.items.addComp(name, w, h, pixelAspect, durSec, fps)`.
- Layer stack: `comp.layer(i)` 1-based, 1 = top. New shape/null/solid layers insert at the top.
- Growth-from-a-point: draw geometry with the pivot vertex at local `[0,0]`, set layer
  Position to the pivot's comp-space point, keyframe Scale `[0,0]→[100,100]` — the default
  anchor `[0,0]` makes it grow out of that point. Y-only growth: `[100,0]→[100,100]`.

## Version note

`app.version` (e.g. `"25.6.4x3"` = AE 2025). Frame export needs ≥ 22.0. If an API
behaves differently than documented here, re-verify against the running version and
update this file.
