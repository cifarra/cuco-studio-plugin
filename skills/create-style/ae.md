# After Effects Style Playbook

Build the style by driving a RUNNING After Effects via ExtendScript. You
generate a `.jsx` that constructs the whole project, execute it, inspect the
result structurally, then verify it VISUALLY with rendered frames.

**Inspect and verify with the `ae-context` skill (`aectx`)** — not with
hand-written probes. `aectx status` tells you which AE is RUNNING (several
versions may be installed; `ls /Applications` picks the wrong one), what's open
and whether CucoStudio is mid-render; `aectx q '<snippet>'` runs one-off ES3
with lookup helpers and lint. Build scripts still go through your own runner
(`osascript … DoScriptFile`), targeting the app name `aectx status` reports.

**AE health during long batches**: `aectx status` (never trust osascript exit
codes; `timeout` doesn't exist on stock macOS). Old
Windows/legacy .aep files convert on open and can hang AE for minutes —
wait before assuming death. NEVER force-kill AE while the Mac session is
locked: a fresh launch stalls at Adobe licensing (locked keychain) until the
user unlocks, killing the whole pipeline. A pre-lock AE instance keeps
working — protect it. On multi-template batches AE WILL eventually crash
out-of-memory from cache buildup — call `app.purge(PurgeTarget.ALL_CACHES)`
at the top of every heavy script and close projects between templates; after
a crash, reopen the style .aep before patching (a cuco render leaves the
ARRANGEMENT copy open, not your style project).

## The template contract (names are law — from `AfterEffectsExtension/jsx/constants.jsx`)

```
mainComp                       ← defines resolution + fps for the style
├── mainControl (NULL, fallback name "$")
│   ├── FORM / FLOW / PRESSURE   Slider effects (0–100)
│   └── effects "1" "2" "3"      Color controls = palette (60/30/10, RGBA)
ORIGINAL_SHOTS/                ← one comp per shot, same size as mainComp
├── {shot}
│   ├── controller (NULL) with "enter" + "exit" Slider effects,
│   │     each 2 keyframes 0→100 (the DIRECTOR re-keys these at render
│   │     time at the section's transition tails — your keys are authoring
│   │     scaffolding for the linking expression)
│   ├── {shot}-text  precomp layer  ← text slot (optional)
│   ├── {shot}-frame precomp layer  ← media slot (optional; director
│   │     replaces its SOURCE with the story's media, fit-scaled)
│   └── BG solid with Fill effect
PRECOMPS/ (aka ORIGINAL_TARGETS)
├── {shot}-text   SMALL comp sized to the text area (e.g. 900×250) with a
│                 single TEXT layer named exactly "textBlock"
└── {shot}-frame  comp sized to the media slot (placeholder content)
```

**Validator requirements (learned building Hermes Ink — GET_STYLE_DATA
rejects otherwise):**
- EVERY shot needs a `{shot}-text` comp (error `MISSING_TEXT_COMP`) — a
  media-only shot carries an empty `textBlock` (empty string → no chars
  capacity, so the caster treats it as text-incapable).
- `mainControl` palette controls are looked up by NAME: `property("1")`,
  `("2")`, `("3")` in both readStyleMetadata (style_builder.jsx) and the
  director's projectSetup. Keep the conventional order (FORM, FLOW,
  PRESSURE sliders, then colors "1","2","3"), but order is not what breaks
  imports; a missing or misnamed effect is. Check with `aectx overview`,
  which prints the palette hex.

**Text: use POINT text with short samples.** Box text via scripting is
unreliable (in AE 2025, reading `doc.boxTextSize` throws and setting it is
ignored — the box collapses to one line). Point text is the CucoStudio
idiom anyway: the pipeline splits story text into short per-moment chunks
(system defaults: 34 chars / 3 words) and the director width-fits them into
your comp. Author samples that FIT the text comp at your chosen size.

How the director consumes it at render time (design for this):
- It duplicates shot comps, sets `textBlock`'s Source Text per sub-section,
  and **binary-searches the font size** to fit — your layout must tolerate
  size changes (anchor/centering comes from the director; don't hand-place
  text expecting a fixed size).
- It writes progress markers "0".."100" on the text comp per word and
  **measures the text at the "100" marker state** — if you add text
  animators, the 100% state must be the fully-readable rest state.
- `chars` capacity for casting is extracted from your `textBlock` sample
  text — set REPRESENTATIVE sample text lengths per shot deliberately
  (short punchy shot ≈ 40–70 chars, statement shot ≈ 100–140).
- Ship the full shot hand: at least one text+media, one text-only (no
  -frame), one media-only (no -text) — the caster needs all three.

## Converting a purchased AE template (the proven loop)

The template is a complete aesthetic universe — the style must live in ITS
world, not in your house vocabulary. Order of operations:

1. **Package first**: read Font Links / install missing fonts (dafont/azfonts
   mirrors when fontesk is Cloudflare-walled; verify the OTF's PostScript
   name matches what the AEP references). Extract tutorial.mp4 frames for a
   first look; probe any (Footage) folder (`ffprobe` — check alpha pix_fmt).
2. **Deep-analyze the AEP** (open in AE, incremental-append analyzer):
   inventory, comp hierarchy, fonts/colors, and CRUCIALLY the mechanics —
   full expressions, effect stacks with values, track-matte patterns. The
   signature techniques usually live in 2–3 comps; dump those verbatim.
3. **Render ground-truth frames from the template's own final comp**
   (10–20 saveFrameToPng across its timeline) and STUDY them. This is the
   reference every later decision is judged against — background values,
   glass/texture prominence, text scale, what transitions actually look
   like. Skipping this step is how you ship a pale imitation.
4. **Derive ALL motion from the template**: if it transitions by lens-blur
   focus pulls, so do your shots (no exitMover); if it types, you type; if
   its life is pre-rendered footage, time-remap it with loopOut("pingpong")
   for idle. Retime ITS mechanics through the controller — never import
   enter/exit vocabulary from earlier styles.
5. **Footage-based templates ship footage**: copy the needed passes into
   `{style}/footage/` and import from there (absolute paths survive
   arrangement copies). Match the template's native resolution/fps when
   fidelity matters; downscaling 16:9 passes into a vertical canvas
   discards their composition.
6. **Designer loops until convergence**: render your shots' frames, put them
   next to the ground truth, critique like a designer (values, prominence,
   color direction, refraction strength), patch, re-render. Complex worlds
   take 3–4 loops; the first loop mostly reveals invisible-layer bugs, only
   later loops are about taste.

## ExtendScript execution loop

Script skeleton (top/bottom of every generated .jsx):
```javascript
$.level = 0;
app.beginSuppressDialogs();
var LOG_PATH = Folder("~").fsName + "/styles/{name}/ae-log.txt";
function writeLog(success, lines) { var f = new File(LOG_PATH); f.open("w");
  f.write((success ? "SUCCESS" : "ERROR") + "\n" + lines.join("\n")); f.close(); }
try {
  while (app.project.numItems > 0) { app.project.item(1).remove(); }  // clean re-run
  // ... build everything ...
  writeLog(true, log);
} catch (e) { writeLog(false, [e.line + ": " + e.toString()]); }
app.endSuppressDialogs(false);
```

Run and check:
```bash
osascript -e 'tell application "Adobe After Effects 2025" to DoScript "$.evalFile(\"/abs/path/create-{name}-style.jsx\");"'
# then Read ae-log.txt
```

**ExtendScript gotchas (hard-won):**
- ES3 ONLY — no let/const/arrows/template literals.
- Create `controller` / `mainControl` BEFORE any expression that references
  them: a missing referent disables the expression PERMANENTLY (keyframes
  still play, so frames look fine while retiming/trinity are dead). Detect
  via `prop.expressionError`; repair by re-assigning `p.expression`.
- Large single-call `File.write()` from DoScript can silently write 0 bytes
  (AE 2025). Log incrementally: open("a")/write/close per line.
- `layers.addText()` inherits the app's Character-panel state (incl. a stale
  ALL CAPS toggle) — always set `fontCapsOption` explicitly.
- `layer.setTrackMatte()` silently sets the matte source `enabled = false` —
  re-enable it if it must also render (`duplicate()` copies the off state).
- Alpha footage rendered over white (glass/liquid passes): set
  `mainSource.alphaMode = PREMULTIPLIED`, `premulColor = [1,1,1]`, or it
  vanishes/halos on dark fields.
- Layer-reference effect params only set by matchname
  (`ADBE Displacement Map-0001`, `CC Glass-0002`; `CC Glass-0001` is a
  NO_VALUE header). Re-fetch effect objects after setTrackMatte ("Object is
  invalid" otherwise) and set them LAST (value is a live layer index).
  Other effect props: set by walking display names, not guessed indices.
- Typewriter styles: a Source Text expression substringing its own `value`
  by progress (director's "0".."100" comp markers, time fallback) survives
  setValue + font fitting — plain-String return keeps base style. Blink the
  cursor via Expression Selector gating `textIndex == textTotal`.
- Fill effect colors are RGBA 4-arrays: `[r/255, g/255, b/255, 1]`.
- **Nested ternaries mis-evaluate in ExtendScript** (`i === 1 ? A : i === 2 ? B : C`
  returned B for i=1 — every palette-1 fill silently became palette-2). Use
  `if` chains in builder code. (Inside expression strings the JS engine is fine.)
- New projects use the JavaScript expression engine: array math needs
  `add()/sub()/mul()` — `[a,b] + [c,d]` silently string-concatenates.
- Parenting a child to a layer whose keyframes put it off-screen at t=0 bakes
  that offset into the child. Parent first, THEN set the child's local
  position (e.g. `[srcW/2, srcH/2]` to overlay a same-size precomp).
- `saveFrameToPng` returns before the PNG is fully written — wait/poll for
  stable file sizes before building contact sheets.
- The invisible CucoStudio CEP worker only connects if the backend was
  running when AE launched. `AE_NOT_CONNECTED` on import → save, quit AE,
  relaunch it (backend already up), retry.
- Multi-copy stacks survive the director: every layer named `{shot}-text` or
  `{shot}-frame` gets `replaceSource`d, so you can add the precomp N times
  (e.g. one mask band each — the Steel "shear"). A mask-path expression can
  cut the REAL text box: `var tb = thisLayer.source.layer("textBlock");
  tb.sourceRectAtTime(time,false)` + `tb.toComp()` → `createPath(...)`. Give
  adjacent band masks Mask Expansion 1 or their anti-aliased edges leave
  hairline gaps. One solid can be the shared track matte for many layers.
- **`seedRandom`/`random()` in expressions is salted per layer** — the same
  seed gives DIFFERENT values on different layers. Any geometry or timing that
  several layers must agree on (shared cut lines, stagger order, seam flash
  times) needs a deterministic hash instead:
  `function hsh(n){ var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }`
- **The first phrase of a section has no "0" marker.** The director puts "0"
  one frame before the first word, clamped to ≥ 0, so at section start it
  collides with the first word's progress marker and dedupe keeps the word's.
  Detect a phrase start as: the first marker, OR comment "0", OR a value lower
  than the previous marker. The next phrase's text lands one frame after its
  "0" marker, so an out-animation must finish by that marker.
- Section tails: enter spans the first 25% of the section, exit the last 25%
  (a 4 s section → 1 s each). Run exit motion only over the last ~40% of the
  exit slider or text leaves while the final word is still being spoken.
- The director centres the text block in its comp. For flush-left grid
  alignment, offset the precomp layer by `-rect.left` of the textBlock rect
  (converted with `toComp`) in its Position expression.
- Stacked type: a Source Text expression that reflows the chunk into 1–3
  balanced lines (join words ≤ 2 chars to the next word) survives the
  director's font fitting — `sourceRectAtTime` measures the reflowed block —
  and gives monumental size on vertical canvases.
- The caster may put a media-only section on a text+media shot. Test
  `thisComp.layer("{shot}-text").source.layer("textBlock").sourceRectAtTime(
  thisComp.duration/2).width > 1` and re-centre the plate (parent it to a
  null) or fade the scrim when there is no text.
- A mask feather is clipped at the layer bounds: a mask covering a whole solid
  keeps a hard edge. Inset the mask by at least the feather radius.
- **Per-phrase layout engine (Steel v3).** An expression library can rebuild
  everything from the text comp's markers:
  - the phrase list, blocks of 2–3 phrases, a composition per block (hashed
    from the section index in the director's comp name `01-3`), and a zone
    per phrase
  - a disabled null "rig" (anchor `[0,0]`) takes position, scale and rotation
    per phrase to fit the text box into its zone, and the band slices parent
    to it
  - parent while the rig is at identity, THEN add the rig's expressions, or
    AE rewrites the children's scale to compensate
- The text comp can run the same engine from inside itself: section index
  from its own name `01-3-text`, phrases from `thisComp.marker`. Its Source
  Text expression can then choose 1–3 lines for the biggest type in *that
  phrase's* zone. The director's font fit still works, because it measures
  the reflowed text.
- Scaling text precomps up per phrase: turn on `collapseTransformation` for
  crisp type. Collapsed layers are not clipped to the precomp bounds, so
  reflowed lines can overflow the text comp safely.
- Choreography with planes: on a composition change, delay the type about
  0.2 s so the plate lands before dark ink cuts onto it. Dark-on-silver type
  sliding in ahead of its plate is invisible.
- ExtendScript globals persist across `$.evalFile` calls in one AE session. A
  `var ONLY = [...]` from an earlier verify script silently filtered a later
  one. Never rely on `typeof X === "undefined"` for script options; pass them
  explicitly.
- Heavier expression rigs make `saveFrameToPng` take minutes, not seconds.
  Poll for the expected file count before building sheets.
- Reading effect/property values from ExtendScript and concatenating them into
  strings can throw "invalid numeric result" — format elements with a helper
  (`Math.round(v*100)/100`) instead of stringifying arrays directly.
- `setTemporalEaseAtKey` dims: Position 1, Scale 3, 1D 1 — or try [3,2,1]
  with fallback.
- Text animator Range Selectors are NOT auto-created — explicit
  `addProperty("ADBE Text Selector")`. `ADBE Text Blur` wants `[h, v]`.
- Colors are NOT set directly on text — `ADBE Fill` on the precomp LAYER in
  the shot comp, color expression →
  `comp("mainComp").layer("mainControl").effect("1")("Color")`.

## Motion (this is where styles live or die)

Author motion as **keyframes retimed through the controller** plus
**expressions that consume the trinity**. Reference:
[animation-reference.md](./animation-reference.md) — professional easing
(70–85% influence, never default 33%), timing tables, overshoot/bounce/
wiggle expressions, text animators via matchNames, shape layers, staggering.

**Illustrated / vector shape work** (mascots, animated ornaments, logo
marks, characters built from paths + ellipses + repeaters): use the sibling
skill [../ae-shape-animation/SKILL.md](../ae-shape-animation/SKILL.md) —
same ExtendScript-into-running-AE medium, deep shape-layer construction
craft, plus a hardened runner (`ae-shape-animation/scripts/ae-run.sh`) that
auto-detects the running AE version and returns results/errors via
`aeWrite()`. Build the ornament as its own layer/precomp inside the shot,
then wire it to the controller + trinity like everything else.

**Exits reverse the entrance.** Never bolt a generic pan/slide exitMover onto
a template conversion — the exit must live in the template's world exactly
like the enter. The robust default: a COMBINED expression on each animated
property that maps the enter slider VALUE through the property's own keys,
then blends back to key(1)'s value as the exit slider rises — every element
leaves by undoing its own native entrance (mask-rises sink back, stamps
un-stamp, bursts shrink, smears re-blur). Only override when the template has
an explicit different outro (e.g. Liquid Glass defocus, typewriter delete).
```javascript
var en = 0, ex = 0;
try { en = thisComp.layer("controller").effect("enter")("Slider").value / 100; } catch (err) {}
try { ex = thisComp.layer("controller").effect("exit")("Slider").value / 100; } catch (err) {}
var nk = thisProperty.numKeys; var vv = value;
if (nk >= 2) {
  vv = valueAtTime(linear(en, 0, 1, thisProperty.key(1).time, thisProperty.key(nk).time));
  if (ex > 0) vv = linear(ex, 0, 1, vv, thisProperty.keyValue(1));
}
vv
```

**Legacy controller-linking expression** (key-time based; still fine for
enter-only tails that add trinity math after `valueAtTime(newTime)`):
```javascript
var controller = thisComp.layer("controller").effect("enter")("Slider");
var timeModifierValue = 100;
try { timeModifierValue = thisLayer.effect("time_modifier")("Slider").value; } catch(e) {}
var durationMultiplier = timeModifierValue / 100;
var controllerStart = controller.key(1).time;
var controllerEnd = controller.key(2).time;
var newAnimationEnd = controllerStart + ((controllerEnd - controllerStart) * durationMultiplier);
var progress = linear(time, controllerStart, newAnimationEnd, 0, 1);
var newTime = linear(progress, 0, 1, thisProperty.key(1).time, thisProperty.key(thisProperty.numKeys).time);
valueAtTime(newTime);
```

**The trinity MUST do visible work** — a style that ignores it renders every
arrangement identically. Read the sliders from shot-comp expressions:
```javascript
var flow = comp("mainComp").layer("mainControl").effect("FLOW")("Slider") / 100;
// flow (static↔kinetic):   wiggle/drift amplitude, idle motion amount
//   e.g. Position: value + [0, Math.sin(time*2)*20*flow]
// form (structural↔abstract): opacity-gate decorative layers, deepen grades
//   e.g. Opacity on an ornament layer: form > 0.5 ? 100 : 0  (or linear ramp)
// pressure (low↔high entropy): scatter offsets, tracking, density
```
Wire at least one visible consequence per axis, per shot.

## Visual verification (MANDATORY — the inspector can't see beauty)

1. **Structural pass** (ae-context skill): `aectx extract`, then
   `aectx validate` (CucoStudio contract: mainControl effects by name, `{shot}-text` +
   `textBlock`, controller keys, fonts, footage, expression errors),
   `aectx exprs --errors` (broken/disabled expressions — `aectx
   repair-expressions --yes` re-assigns them) and `aectx wiring` (does every
   shot actually USE FORM/FLOW/PRESSURE and the palette?). Value questions
   ("do these bands share edges at t=2?") → `aectx eval`.
2. **Visual pass**: `aectx frames --comp 01 --t 0.3,0.5,2.0,9.6 --sheet` and
   READ the sheet (it waits until every PNG is fully written). View the PNGs. Judge: enter frames must show motion mid-flight (two
   nearby times must DIFFER), settled must be composed and confidently
   typed, palette disciplined. Iterate script → re-run → re-inspect →
   re-look, at least twice.
3. Save the project: `app.project.save(new File(".../{Name}.aep"))` into a
   dedicated style folder (exactly ONE .aep at its root).

## Finish line specifics for AE

- Import requires the app backend running AND the CucoStudio CEP extension
  connected in AE (Window → Extensions → CucoStudio; `GET_STYLE_DATA` runs at
  import and is your acceptance test — it extracts fonts/palette/shot_list
  and flags missing footage or substitute fonts. Fix anything it flags).
- Then the shared finish line from SKILL.md: smoke render (the AE path also
  requires the extension for rendering), poster.gif from the render,
  `voice_sample.wav` convention for narration.
- To learn from an existing style: open it, `aectx extract`, then
  `aectx overview`, `aectx tree`, `aectx exprs` (expression families with
  locations; `--show ID` for one in full). analyze-template.jsx is the older
  full dumper (keyframe ease detail) — prefer aectx.
