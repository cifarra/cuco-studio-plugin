---
name: ae-shape-animation
description: Use to build shape-based (vector) animations directly in a running Adobe After Effects via ExtendScript — flat illustrated characters/objects, animated logos, motion graphics made of ellipses/paths/fills with flapping/bobbing/sliding motion. Triggers — "animate a bird/character/logo in AE", "make an After Effects animation", "AE is open, create…", "build a motion graphic in After Effects". Includes a probe script (project/comp/layer state) and frame-export visual feedback (see the comp as PNGs).
---

# After Effects shape animation (programmatic)

Drives the **already-running** After Effects app to build vector animations from code.
You author an ExtendScript (`.jsx`) that creates a comp, shape layers, and motion, then
push it into the live AE session over AppleScript. No manual clicking in AE.

## How it runs

AE is scripted in **ExtendScript** (ES3-era JavaScript). The bridge from this shell is
AppleScript's `DoScriptFile`. Use the runner — it handles every gotcha below:

```bash
scripts/ae-run.sh examples/bird.jsx          # result -> /tmp/ae_result.txt, printed to stdout
scripts/ae-run.sh /path/to/my.jsx /tmp/r.txt
scripts/ae-run.sh scripts/ae-probe.jsx       # read-only project/comp/layer state dump
scripts/ae-frames.sh [comp] [n] [out-dir]    # export n PNG frames + contact sheet
```

For inspecting and debugging (not building), prefer the **ae-context** skill (`aectx`):
`aectx tree --comp NAME` after `aectx extract`, `aectx exprs --errors`,
`aectx eval --comp C --prop 'Transform/Position' --t 0,1`,
`aectx frames --comp C --t 0,0.5,1 --sheet`, and `aectx q '<snippet>'` for one-off questions.
It targets the running AE, serializes jobs and lints ES3.

Workflow — **probe → build → look → iterate**:

1. **Probe.** `aectx status`, then `aectx extract` + `aectx tree --comp NAME` (ae-context skill —
   it targets the running AE, serializes jobs and refuses during CucoStudio renders). The older
   `ae-run.sh scripts/ae-probe.jsx` still works (comps with the active one starred, the target comp's
   layers with parenting, keyframe counts and expressions). Never write ad-hoc probe scripts.
2. **Target.** "The open comp" = the starred active comp; else the project's only comp;
   if the project has none, create one (like `bird.jsx` does) and say which you used.
3. **Build — in stages, not one monolith.** Write a SMALL `.jsx` per stage (e.g. comp +
   background + first part → run → next part → run …), starting from `examples/bird.jsx`
   patterns. AE keeps running between calls and each run mutates the same project, so
   stages layer naturally. Never try to emit one giant script that builds everything:
   small scripts fail small, are easy to fix, and let you frame-check between stages.
   Plan briefly, then write stage 1 immediately — don't re-plan in later turns.
4. **Look.** `scripts/ae-frames.sh` exports evenly-spaced PNG frames of the comp plus a
   single `sheet.png` contact sheet (needs AE 2022+). **Read the sheet image** and judge
   it like a director: everything on-screen? stacked right? hitting the intended poses
   across time? Fix what you see, re-run, look again. Don't declare an animation done
   without having looked at a frame export at least once.
   - Text-only model (can't read images)? Fall back to the probe dump — check the layer
     stack, key counts and expressions against your plan — and tell the user you built
     without visual verification so they should eyeball the preview.

### Gotchas the runner already solves (know them anyway)

- **Which AE is live.** Multiple versions can be installed (2024/2025/2026). The runner
  finds the running one with `ps aux | grep "Adobe After Effects"` and targets that exact
  app name in AppleScript. AppleScript app names are version-specific.
- **`DoScriptFile` does not return your value** — it always yields `"0"`. So your script
  reports back by calling **`aeWrite("…")`** (injected globally by the runner) which writes
  to the result file. `return`ed values are lost.
- **Errors are swallowed** otherwise. The runner wraps your file in try/catch and writes
  `ERROR: … (line N)` to the result file, so a broken script doesn't fail silently.
- **It's synchronous.** `DoScriptFile` blocks until the script finishes; the result file is
  ready when the runner returns.
- Always wrap mutations in `app.beginUndoGroup("…")` … `app.endUndoGroup()` so one run = one
  undo step — and put `endUndoGroup()` in a `finally`, so a mid-script throw can't leave the
  undo group open in the user's session.

## Mental model for shape layers

This is the part that trips people up. Internalize it and the rest is easy.

**Properties are addressed by matchName**, not display name. Cheat sheet:

| Thing | matchName |
|---|---|
| Layer's shape contents root | `ADBE Root Vectors Group` |
| A group inside contents | `ADBE Vector Group` → its children live under `ADBE Vectors Group` |
| Ellipse / Rect / Star | `ADBE Vector Shape - Ellipse` / `- Rect` / `- Star` |
| Free-form path | `ADBE Vector Shape - Group` → set `ADBE Vector Shape` to a `Shape()` |
| Fill / Stroke | `ADBE Vector Graphic - Fill` / `ADBE Vector Graphic - Stroke` |
| Ellipse size / position | `ADBE Vector Ellipse Size` / `ADBE Vector Ellipse Position` |
| Fill color | `ADBE Vector Fill Color` (0–1 RGB, e.g. `[1, 0.54, 0.3]`) |
| Layer transform group | `ADBE Transform Group` |
| Position / Anchor / Rotation / Scale / Opacity | `ADBE Position` / `ADBE Anchor Point` / `ADBE Rotate Z` / `ADBE Scale` / `ADBE Opacity` |
| Effects root | `ADBE Effect Parade` |

**Coordinate trick (do this every time).** Draw each part's shape at its **local origin
`[0,0]`** (e.g. ellipse position `[0,0]`, or path verts centered on the pivot), then place
the part by setting the **layer's** `ADBE Position`. A new shape layer has anchor `[0,0]`,
so local-origin geometry lands exactly at the layer position — predictable, and rotation
pivots around that point. For a limb that should swing from a joint (a wing at the
shoulder), author its path so the joint vertex sits at `[0,0]`.

**Z-order = build order, reversed.** `comp.layers.addShape()` inserts the new layer at the
**top** (index 1). So build **back-to-front**: background solid first, frontmost detail
last. (See the bird's far-wing → … → near-wing sequence.)

**Parent after positioning.** Set each part's comp-space position, *then* `part.parent =
ctrl`. Setting the parent preserves world position by converting the value into parent
space, so you don't do the math. A null at comp center with anchor `[0,0]` makes a clean
controller — animate the null to move/rotate/scale the whole rig.

## Animating

Two ways; mix freely.

- **Expressions** — best for cyclic/organic motion, set via `prop.expression = "…"`.
  - Flap / bob / wag: `prop = amplitude*Math.sin(time*speed)`. Offset the phase per limb
    (`… + 0.5`) so they don't move in lockstep.
  - Slide across: `-350 + (time/thisComp.duration)*(thisComp.width+700)`.
  - Use `\r` to separate statements when building multi-line expressions in a JS string.
- **Keyframes** — best for precise/one-shot motion:
  ```js
  var p = layer.property("ADBE Transform Group").property("ADBE Position");
  p.setValueAtTime(0, [200, 540]);
  p.setValueAtTime(2, [1700, 540]);
  // optional ease:
  var ei = new KeyframeEase(0, 60);
  p.setTemporalEaseAtKey(1, [ei], [ei]); p.setTemporalEaseAtKey(2, [ei], [ei]);
  ```
  The ease-array length must match the property's dimension — spatial props (Position)
  take 1, but `ADBE Scale` is 3-D even on 2-D layers and takes 3. Don't hardcode it; use
  the `easeArr` helper in `references/extendscript-quickref.md`.

## Color

Shape/fill colors are **0–1 floats** (`[1, 0.54, 0.3]`), not 0–255. A `rgb(r,g,b)` helper
that divides by 255 keeps things readable (see the example). Solids via
`comp.layers.addSolid(color, name, w, h, pixelAspect)`; a Ramp effect (`ADBE Ramp`) gives a
quick sky/background gradient.

## Worked reference

`examples/bird.jsx` is a complete, runnable rig: gradient sky, a body/head/beak/eye/tail/
two-wing bird parented to a null, flying across with a bob and tilt while the wings flap and
the tail wags. Copy it as the starting skeleton for new characters — swap the parts list,
positions, and expressions.

## Rendering out (optional)

The comp lives in AE for the user to preview (RAM preview) or tweak. To export from script,
add to the render queue: `app.project.renderQueue.items.add(comp)`, set an
`outputModule.file`, then `app.project.renderQueue.render()`. Most of the time, just leave
the comp open and tell the user it's ready to preview. (To check your own work, use
`scripts/ae-frames.sh` — the render queue is only for final deliverables.)

## Troubleshooting

- `(no result written…)` → your script threw before `aeWrite`, or never called it. Re-run;
  the runner's try/catch should surface `ERROR: … (line N)`. Add an `aeWrite` at the end.
- "After Effects does not appear to be running" → AE isn't open, or only a background helper
  is. Have the user bring AE to the foreground.
- Property `null`/`undefined` → almost always a wrong matchName or addressing a child group
  via the wrong container (`ADBE Vector Group` vs `ADBE Vectors Group`). Recheck the table.
- Shapes appear off-center / pivot wrong → geometry not authored at local `[0,0]`; fix the
  shape coords rather than the layer position.
- **Property refs go stale when siblings are added.** If you cache `var e = group.addProperty("ADBE Vector Shape - Ellipse")` and then add a stroke/fill to the same group, the `e` reference can become invalid — accessing `e.property(...)` throws `ReferenceError: Object is invalid`. Fix: after all operators are added, re-fetch from the parent: `group.property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").expression = "...";`. Always add all shape operators first, then re-fetch and set values/expressions.
- `Value array does not have N elements` on `setTemporalEaseAtKey` → ease-array length
  must match the property's dimension (Scale = 3). Use `easeArr` from
  `references/extendscript-quickref.md`.
- A method/property comes back `undefined` and you're *sure* it exists → you may have
  invented it. `references/extendscript-quickref.md` lists verified signatures and the
  usual hallucinations (`activeComp`, `item.type`, string-bracket access, …).
- Result reads fine but you haven't seen it → that's not done. Run `scripts/ae-frames.sh`
  and look at `sheet.png`.
- **Shape group internal transforms** (`pg.property("ADBE Transform Group")` on a `ADBE Vector Group` child) can return null in some AE versions. If you need to rotate individual shape elements within a single layer, prefer separate layers per element over using intra-group transforms.
