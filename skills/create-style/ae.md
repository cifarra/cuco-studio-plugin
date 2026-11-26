# After Effects Style Playbook

Build the style by driving a RUNNING After Effects via ExtendScript. You
generate a `.jsx` that constructs the whole project, execute it, inspect the
result structurally, then verify it VISUALLY with rendered frames.

**AE is a compositor, not a layout engine.** It has light and shadow in 3D space,
time effects, procedural matter (fractal noise, displacement, caustics), mattes, and
footage plates you generate or source. Build the world you invented in SKILL.md
Step 2 with those tools. The tested recipes and their runnable lab are in
[ae-techniques.md](./ae-techniques.md). A style made only of solids, text, Gradient
Ramp and masks would render the same in CSS; that's the failure this playbook exists
to avoid. Most of this file is the contract and the hard-won ExtendScript gotchas. They
keep the build working; they are not the design.

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
  position (e.g. `[srcW/2, srcH/2]` to overlay a same-size precomp), or use
  `child.setParentWithJump(parent)`, which skips the compensation.
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
- **Empty sections** (no text, no media) cast only to an "empty-compatible" shot.
  That's a shot with an empty `{shot}-text` sample and no `{shot}-frame` (manifest
  `chars` and `frame` both null; `aectx validate` lists it as "no-text-no-frame"). Use it
  for a full brand shot. Text sections score it 0, so only casting pressure 100 sends text
  there: show any text it gets (FILA20's 07).
- **A logo on every frame, or an adjustment layer over everything (grain), can't live in
  mainComp**: template layers there sit under the shots. Put it at the top of every shot.
  A logo at the same spot with no entrance reads as one logo across cuts. On bright stills a tight drop shadow (opacity ~70%, softness ~16) keeps a
  white logo legible.
- **Trace a raster logo into shape layers** with `potracer` (pure-Python potrace), building
  `Shape` vertices and tangents with an even-odd fill. Redraw circles as exact ellipse
  strokes so they can trim-draw (`examples/fila20/logo/trace_logo.py`).
- 24 fps styles work: the director takes mainComp's frame rate.
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
- **Never sequence the shot comps into `mainComp`** (keep only `mainControl`
  there). The director extends EVERY mainComp layer to the video's full
  length, so each frame of the final render also renders 3–4 hidden shot
  comps underneath the visible section. SidecarSUN: 1.5–2.4 s/frame → 0.04–0.28
  s/frame after removing them. At the slow rate a 31 s video hit CucoStudio's
  ~21 min `CREATE_AEP` timeout ("AE extension disconnected"). Benchmark with
  the render queue (`rq.render()` + `$.hiresTimer`), not `saveFrameToPng`,
  which costs ~2 s/frame even on a solid.
- Phrase engines: before the first phrase (`IDX < 1`) don't let the "next
  phrase start" act as `t1`. The out-animation fires early and parks the
  line fully visible before the section's first word.
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
  Exception — **two-colour / two-font text**: AE 25.x Source Text expressions
  style character ranges (`style.setText(s).setFont("X-Regular")
  .setFillColor(c).setFont("X-Italic", i, n).setFillColor(c2, i, n)`), read the
  palette from mainControl, and survive the director's font fitting. Used for
  an italic accent landing line and word-by-word subtitle inking from the
  "0".."100" markers (word k of n has marker `round(k/n*100)`). Set ALL ranges
  explicitly (base font too) and add no Fill effect on the precomp layer, which
  would flatten them. Set leading in the same chain (`setAutoLeading(false)
  .setLeading(fs*k)`): the director only shrinks `fontSize`, so a fixed
  leading goes loose.
- **Masked line-by-line rise** (each line rises out of its own baseline) with N
  copies of `{shot}-text`: each copy needs TWO masks. Mask 1 isolates line i
  in text-comp space. Mask 2 (Intersect) is the window, fixed in shot space,
  so it is offset by `-dy`. With mask 2 alone, the neighbouring line slides
  into the band as a ghost. Take band cuts from the baseline
  (`textBlock.toComp([0,0])`, step = leading) at the font's real
  descender/ascender gap, and measure that gap with fontTools. Newsreader at
  leading 1.04 has descenders at 0.239 em and the next ascender at 0.305 em,
  so cut at 0.27 em. Add a drift to Position only, never to the window offset,
  and the window moves with the line.
- `transform.anchorPoint.value` read in a Position expression on a
  collapsed precomp layer threw a time-dependent "Internal error" (on 1 of 3
  identical copies). Use `[thisLayer.source.width/2, thisLayer.source.height/2]`.
- Shape groups: `addProperty` on a group's contents invalidates earlier refs to
  siblings (`Object is invalid`). Re-fetch with `contents.property(k)` after
  adding the Fill/Stroke. MatchNames that are easy to guess wrong: Mask
  Expansion = `ADBE Mask Offset`, 2D Rotation = `ADBE Rotate Z`.
- Furniture text in a vertical style: ≥ 24 px (20 px tracked caps reads as
  ~7 pt on a phone). Keep captions and subtitles above the bottom ~400 px. On
  Reels/TikTok, the platform UI covers that area.
- **How the director fits text** (`typeSetSection` in utils.jsx):
  - It measures on a duplicate of textBlock named `__cuco_fit_scratch`, at the
    FIRST "100" marker. For a one-word phrase that is the phrase's first frame.
  - It applies the section's MINIMUM fitted size to every phrase.
  - It centres each phrase with HOLD anchor + position keys.
  - For point text it checks WIDTH only (`rect.width <= comp.width`). Height is
    never checked, so a reflow expression must keep the stack inside the comp's
    height itself (score each line count by `zh/(nl*lead)` too).
  - Scoring line counts by size alone gives ragged stacks such as
    "impressions, / and / an in-house / lab,". Multiply the score by
    `(shortest/longest line)^0.5`. For long copy, wrap by minimum raggedness:
    a DP over break points costing squared slack, plus a penalty per line.
    Both are in [examples/hcd-smile/](./examples/hcd-smile/).
  - A reflow that estimates character width must err WIDE. HCD Smile's 06 used
    0.405·size, real lines came out wider, and the width-only fit shrank the
    whole section to 35 px. 0.44 held.
  - Line breaks must not depend on the CURRENT font size. A reflow that caps its
    score at `style.fontSize` picks one long line at small sizes, so width stops
    growing with size and the director's binary search collapses (SALF 03 fell to
    72 px). Score line counts by the comp's capacity only.

  Per-letter animators (Expression Selectors) must therefore return the rest state
  on the scratch layer: `if (thisLayer.name == "__cuco_fit_scratch") { 0; } else
  { … }`. Previews made without the director should emulate the same fit; see
  `simTexts()` in [examples/letterpile/](./examples/letterpile/).
- AE 25.6 Source Text expressions style per character range: `setApplyStroke`,
  `setStrokeColor`, `setStrokeWidth`, `setTracking`, `setFontSize`,
  `setBaselineShift`, `setFillColor` (value, index, count). With the document's
  `strokeOverFill = true` and the default "Per Character Palette" fill & stroke
  order, later characters cover earlier ones, fill AND outline: real stacking
  with no extra layers. Negative tracking eats word spaces, so give the space
  characters their own positive tracking.
- Text font size caps at 1296 px. Make giant letters at 1000 px and scale the
  layer. Keep a uniform line weight with `strokeWidth = SW/(scale/100)`.
- Shot-comp expressions can read the section's own words through the slot,
  because layer names survive `replaceSource`:
  `thisComp.layer("01-text").source.layer("textBlock").text.sourceText.valueAtTime(firstMarker + 0.2)`.
  A text comp can read its shot's controller with
  `comp(thisComp.name.replace(/-text$/, "")).layer("controller")`.
- Extra copies of `{shot}-text` with `ADBE Minimax` (Operation 2, Channel 2 =
  alpha, Radius r) + Fill make a die-cut backing that follows every per-letter
  animation, because the copies run the same animators. A copy dilated by
  r + line weight and filled with the ink gives the backing its own outline.
- **Measure the text ONCE per frame: the typeset layer.** HCD Smile's first engine
  rendered at 4.8 s/frame with 4 line copies. Every copy ran 5 expressions, and
  each called `sourceRectAtTime`, read Source Text and walked the markers, all
  multiplied by motion-blur sub-frames. The fix:
  - Add one guide text layer per shot (`guideLayer = true`, opacity 0), named
    `typeset {shot}-text`. Its Source Text expression measures the block and
    returns JSON: rect, font size, baseline, line lengths, phrase t0/t1/index,
    spoken fraction.
  - Every copy, mask, stroke and rig reads it with
    `JSON.parse(String(thisComp.layer("typeset 01-text").text.sourceText.valueAtTime(Math.round(time*30)/30)))`.
    Reading at the FRAME time keeps motion-blur sub-frames from re-measuring.

  Result: 0.06–0.14 s/frame. Benchmark the render queue
  ([examples/sidecarsun-rise/bench.jsx](./examples/sidecarsun-rise/bench.jsx))
  after the first build, not after the last.
- **Read the reflowed block once, too.** SALF Cinta's line layers each copied the
  block with `getStyleAt(0, t)`, and so did matching measure layers, so the reflow
  expression ran 18 times a frame (1.7 s/frame). Fix: one guide layer reads the
  block once and returns `{fs, lines}`. Each line layer styles itself from that
  (`style.setText(…).setFontSize(fs)…`) and is measured by the typeset directly:
  0.24 s/frame.
- **What's left is each expression's header**: cross-comp control reads and
  controller keys. Give frame-level properties (anchor, path, fill, opacity) only
  what they need. Don't funnel every transform through one JSON "drive" layer:
  its sub-frame readers re-run it (0.76 vs 0.28 s/frame).
- **Media arrive "fit", not "cover".** The director's `frameClip` scales media
  with `"fit"`, so other aspect ratios letterbox inside `{shot}-frame`. The frame
  comp's own layers survive `frameComp.duplicate()`, so make the placeholder a
  guide layer, or it shows in the letterbox bars. To fill a window, cover-scale
  the frame LAYER in the shot from the media layer inside it:
  `var Lm = thisLayer.source.layer(1), sc = Lm.transform.scale.value; k = Math.max(S.width/(Lm.source.width*sc[0]/100), S.height/(Lm.source.height*sc[1]/100))`.
  To move the media inside a shaped window, give it a separate shape-layer
  track matte; the media layer's own transform is then free.
- Shot comps are renamed `{shot}-{sectionIndex}` with a 0-based index:
  `thisComp.name.match(/-(\d+)$/)`. Use it to vary the DESIGN per section (a
  crop, a composition, a texture frame), never to show it as content: a visible
  section counter reads as information. A time-remapped precomp of evergreen
  plates at one frame each: `(SEC % N)/fps`. Time remapping also lets `fillComp` extend the layer past the
  precomp's duration.
- **Time from the controller's keys, in seconds.** The director keys enter from
  `inPoint − 0.01` to `tail_a` and exit from `tail_b` to `outPoint + 0.01`.
  Reading those key times and running motion in seconds gives the same pace in
  every section length. Compress only when a tail is shorter than the motion:
  `KE = min(1, (e1 − e0)/1.3)`. Driving everything from the slider stretches a
  2.5 s enter to 2.5 s of motion.
- **Write in step with the voice.** In the typeset JSON, compute the spoken
  fraction of the current phrase from the word markers: the last marker ≤ time,
  eased from the previous value over 0.25 s. Also record when the phrase reached
  "100". A written line `i` reveals while that fraction crosses its share of the
  phrase's characters. Anything that follows the last word (an underline, a
  flourish) starts from the "100" time. A fixed-duration write ran past short
  phrases and never reached its flourish.

## Motion (this is where styles live or die)

**The world's process IS the motion.** Ink soaks and type appears where it soaks;
plates land off register and settle; light rakes across a paper stage; a line system
grows. Rigid moves (slide, scale, fade) place things between those events and are
never the style. Build the process with [ae-techniques.md](./ae-techniques.md).

Author it as **keyframes retimed through the controller** plus **expressions that
consume the trinity**. Mechanics reference:
[animation-reference.md](./animation-reference.md) covers easing (70–85% influence,
never the default 33%), overshoot/bounce expressions, text animator and shape
match names, and timing at video scale.

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

**Shot furniture must not re-animate on every cut.** The caster runs the same
framed shot back to back: a promo reel can have 6–9 framed sections in a row.
A logo draw-on or header fade inside that shot replays at every cut, and the
header blinks. Hialeah City Dental did exactly this. In repeatable shots, make
headers, logos and phone lines static from frame 1, gated only by FORM; save
draw-ons for the title shot that opens a video. The fix there was a `still` flag
in `makeMark()` (see [examples/hialeah-dental/](./examples/hialeah-dental/)).
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
arrangement identically. Wire each axis into the world's PROCESS, not only into
positions and opacity. Read the sliders from shot-comp expressions:
```javascript
var MC = comp("mainComp").layer("mainControl");
var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100,
    PRES = MC.effect("PRESSURE")("Slider").value/100;
// FORM (structural↔abstract): how far the process transforms the image —
//   refraction strength, noise share of a soak map, halftone cell size, layer depth
// FLOW (static↔kinetic): how alive the material is at rest —
//   fractal evolution speed, boil frame rate (posterizeTime), camera/light drift, rib drift
// PRESSURE (low↔high entropy): how much the process disorders —
//   misregistration, raggedness/edge hardness, shadow hardness, copy density, cut-angle variance
```
Wire at least one visible consequence per axis, per shot. At least one of them
must change the image-making process itself. Every recipe in
[ae-techniques.md](./ae-techniques.md) lists its trinity hooks.

## Visual verification (MANDATORY — the inspector can't see beauty)

1. **Structural pass** (ae-context skill): `aectx extract`, then
   `aectx validate` (CucoStudio contract: mainControl effects by name, `{shot}-text` +
   `textBlock`, controller keys, fonts, footage, expression errors),
   `aectx exprs --errors` (broken/disabled expressions — `aectx
   repair-expressions --yes` re-assigns them) and `aectx wiring` (does every
   shot actually USE FORM/FLOW/PRESSURE and the palette?). Value questions
   ("do these bands share edges at t=2?") → `aectx eval`.
2. **Visual pass**: `aectx frames --comp 01 --t 0.3,0.5,2.0,9.6 --sheet` and
   READ the sheet (it waits until every PNG is fully written). View the PNGs.
   Judge the craft:
   - enter frames must show motion mid-flight (two nearby times must DIFFER)
   - settled frames must be composed and confidently typed
   - the palette must be disciplined

   Then judge the world (SKILL.md Step 2):
   - the text-only shot passes the empty-frame test
   - no slop signature is present
   - no frame could be rebuilt in CSS
   - the media is visibly transformed by the world's process

   Iterate script → re-run → re-inspect → re-look, at least twice.
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
- Material plates (generated, sourced or baked) live in `{style}/footage/` and are
  imported from there. `aectx validate` and `GET_STYLE_DATA` flag missing footage.
  Benchmark the finished shot comps with the render queue (`examples/sidecarsun-rise/bench.jsx`)
  against the budget in [ae-techniques.md](./ae-techniques.md) "Render cost".
- To learn from an existing style: open it, `aectx extract`, then
  `aectx overview`, `aectx tree`, `aectx exprs` (expression families with
  locations; `--show ID` for one in full). analyze-template.jsx is the older
  full dumper (keyframe ease detail) — prefer aectx.
