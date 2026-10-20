# Generated animation media (three.js explainers → CucoStudio)

> `$CUCO_SKILL` below = the cuco-studio skill directory (the folder holding `SKILL.md`, one level above this file).

**Always start from the style (section 0): it is the brand's style guide.** When no footage exists for a subject — how a house is framed, how an engine works, how a
bridge carries load — build the visuals in code. A procedural 3D model, animated to the
narration and annotated like a textbook plate, then assembled and voiced in CucoStudio.
First production: "How a House Is Framed" (37 beats, 6:40, `~/edits/framing-a-house`).

The template at `templates/threejs-explainer/` is the working engine from that build,
generalized (example scene: a workbench). Copy it, replace `scene.js` + `beats.js`.

## The pipeline

```
style   →  style_brief.py <STYLE> --apply .  → theme.json + brand fonts; LOOK at the poster sheet
shots   →  shot list with opening/closing shot per section; every cut changes size, angle or subject (2b)
script  →  beats.json (1 beat = 1 storyboard section = 1 clip)
voice   →  narrate_story_clip.py  → audio/narration.wav + script/durations.json + story clip in project
model   →  web/js/scene.js        (real units, every piece = a part in a named stage)
motion  →  web/js/beats.js        (per beat: what builds, camera, labels, dims, highlights)
review  →  render.mjs --stills    + sheets.sh → look at contact sheets, fix, repeat
render  →  render.mjs --beats=all (headless Chromium on the GPU, ~50 fps, 8 min video in ~2 min)
cuco    →  attach_clips.py        (fetch storyboard fresh, 1 clip per section, bind story clip)
        →  arrangement create + process --render; check_audio.sh on the result
```

Order matters: **voice first, then render**. Clip length = that beat's narration duration
(+0.9 s tail for the style's transition). Re-voicing = re-render (cheap; beats are normalized 0..1
so animations stretch to the new duration automatically).

## Setup

```bash
cp -R $CUCO_SKILL/templates/threejs-explainer ~/edits/<project>
cd ~/edits/<project> && npm i && npx playwright install chromium   # once per machine for chromium
```

## 0. Read the style first — it is the brand's design system

Pick the style *before* designing (ask the user if they didn't say), then derive the look from it:

```bash
python3 $CUCO_SKILL/scripts/style_brief.py <STYLE_ID> --out style_brief --apply .
$CUCO_SKILL/scripts/probe_style.sh <STYLE_ID>      # where media + captions land
```

`--apply` writes `web/theme.json` (canvas = media-slot aspect, palette, brand font files copied to
`web/fonts/`). It can't know *roles*, so after looking at `style_brief/poster_sheet.jpg` and the
probe frame, set them in `theme.json` by hand:

| key | decide from the style |
|---|---|
| `bg`, `paper`, `ink`, `muted` | background, label box, lines/text, secondary text |
| `accent`, `accent2` | highlight/arrows/dims, second emphasis color |
| `display_font`, `mono_font`, `label_weight`, `title_weight` | brand typefaces (single-weight fonts: 400; variable font files: add `"weight": "200 700"` to that entry in `fonts` so bold is real) |
| `fx` | effect colors your scene reads from `THEME.fx` (arc glow, sparks, gas, puddle...), `additive` blending on dark bgs only |
| `kinds` | material tints, e.g. `{"concrete": {"color": "#27313a"}, "wood": {"color": "#8fa6b8"}}`; the tint multiplies the warm textures, so a full re-skin (pure blueprint, neon) needs neutral textures in `textures.js` |
| `sky_light`, `ground_light`, `ambient`, `outline` | lighting mood; outline strength (glowing line-art styles want ~0.9) |
| `bg_glow` | `{color, x, y, r}` soft radial glow over `bg`, for posters with a gradient/vignette background |
| `highlight`, `edge_color` | 3D highlight tint and outline color when they shouldn't equal accent/ink (e.g. off-white ink on a light style → indigo highlight) |
| `label_tracking` | letter-spacing in px for label text (tracked caps styles) |
| `label_style` | `box` (default: tag with border) or `underline` (text + thin underline + halo, for styles whose typographic mark is an underline, e.g. Jessee) |
| `label_size`, `sub_size` | label/sub px (defaults 32/21). Raise them when the style shows media scaled down (Jessee's 1440×700 panel ≈ 65% → 46/30) |
| `chapter_tag` | `false` when the style already draws HUD/corner text there |
| `width`, `height` | set by `--apply` from the slot; per-beat overrides in `script/sizes.json` |

Examples: **Inefable** (54) is a periwinkle gradient with off-white, widely tracked Newake caps, and
white lowercase captions over the bottom quarter of a full-bleed 4:3 slot. So: `bg_glow`, off-white
ink/labels on a darker periwinkle `paper`, indigo `highlight` (a darker shade of the palette hue),
flat clay-like materials in palette tones, no chapter tag, labels kept above y≈800. The subject's
one hot element (the welding arc) stays blue-white so it belongs to the palette. **Cuco** (65) is a slightly rotated 1155×777 card on cream paper with word-by-word
coral captions *below* it, so render 3:2 (1620×1080) and use a cream background, coral accent,
green secondary and Red Hat Display. **Terminal Type** (36) is near-black with pale-blue VCR mono
text and terminal status bars top and bottom, so use a dark background, blue ink/accent, VCR
labels, strong line outlines, no chapter tag, and a 4:3 canvas. Same scene code, two brands.

If a style offers several slot shapes (e.g. square + full-bleed), run
`cuco arrangement process <PID> <AID> --no-render` once, read `screenplay.json` →
`sections[i].shot.frame`, and write `script/sizes.json` so each clip matches the slot it lands in.

## 1. Script as beats

Write the lesson as 25–40 beats of 1–3 sentences (≈7–15 s spoken). Each beat should have ONE
visual idea you can build or point at. Teach the *why* next to the *what* ("sill is
pressure-treated because concrete wicks moisture"). Split beats rather than stacking media:
the clip must land exactly on its words.

## 2. Voice (don't trust text-section TTS)

Text sections (`origin: text`, `mute: false`) depend on CucoStudio's local Chatterbox TTS. It can
return **silent WAVs with `synthetic_timing: true`** while `cuco chatterbox-health` says ok, and the
render then has no voice at all. So:

```bash
python3 $CUCO_SKILL/scripts/narrate_story_clip.py script/beats.json --project <PID>
```

Voice choice comes from the style too: if the brief lists a `voice_sample.wav` or the style
metadata has a `voice_id`, that is the brand voice. Ask the user before cloning, then:

```bash
python3 $CUCO_SKILL/scripts/brand_voice.py clone <STYLE_ID>        # -> voice_id (reuses existing clone)
python3 $CUCO_SKILL/scripts/brand_voice.py check audio/b01.mp3 "<line text>"  # intelligibility
```

A 2.8 s sample (Inefable) cloned into a clear voice (100% word match on check). Check with
`brand_voice.py check`: `cuco transcribe` has returned empty text while `transcribe align`
(what story clips use) worked. No brand voice → pick one that matches the style's tone.

ElevenLabs per beat (cached: re-runs only voice missing mp3s) → one narration track with
0.55 s gaps → copied to `projects/<PID>/story_clips/<uuid>.wav`. Sections then use
`origin: audio, story_source: upload, clip_id: <uuid>`, all pointing to the same clip, and Cuco
force-aligns each section's text inside it. Section timing lands within ~1 s of the measured
durations. Always finish with `scripts/check_audio.sh video.mp4`.

## 2b. Cuts between sections — design for visual separation (no jump cuts)

**Every section boundary is a cut.** CucoStudio plays one clip per section and cuts (or runs the
style's transition) between them; clips are separate media, so there is no such thing as a camera
move that "continues" across a section boundary. The editing rule that matters is the jump cut:

> A **jump cut** happens when the last frames of shot A and the first frames of shot B show
> *nearly the same picture*: same subject, similar size and angle, slightly shifted. The small
> difference reads as a glitch and is jarring.

So when designing the media for each section, make every cut a **clear change of picture**:

| across the cut, change at least one of | rule of thumb |
|---|---|
| **shot size** | ≥ 2 steps: wide → close-up, close-up → wide, medium → extreme close (framed width ratio ≥ 2) |
| **angle** | ≥ 30° around the subject (the 30° rule); ideally also a height change |
| **subject / scene** | a different object or place: machine → gas bottle, main scene → macro specimen, 3D → a 2D diagram |

and avoid:
- ending A with a slow push-in and opening B slightly closer on the same thing (the classic jump);
- starting B from A's final camera (this is what `[0, 'prev']` does — it *creates* jump cuts at
  section boundaries; it's only for multi-part shots you render as one clip);
- two consecutive sections that are both medium shots of the same object from similar angles.

Plan the shot list before writing beats: for each section note its **opening** and **closing**
shot (size, angle, subject) and read the chain `A.close → B.open` for every seam. Alternate sizes
(wide / close / macro / wide...), swing angles, and alternate subjects. Inside a section the camera
can move freely (push-ins, orbits, cranes), as long as the *next* section opens clearly different
from where this one closes. Keep **logical** continuity across cuts (a part that exists stays
built, the arc doesn't flicker on/off without reason, the gun is where it was) — but the
*picture* must change.

Check it mechanically before rendering clips:

```bash
node render.mjs --seams        # -> seams/report.txt + seams/seam_bNN_bMM.jpg (A last frame | B first frame)
```

The report compares A's last frame and B's first frame: camera turn, framed-width ratio (shot size
change), and image similarity (SSIM). Verdicts:
- `JUMP CUT` — same scene, turn < 30°, size ratio < 2, or the images are simply too similar (SSIM
  high). Fix it: change size, angle or subject.
- `ok` — separated by size, angle or subject.
Look at the seam images too; every `JUMP CUT` must be fixed. After the Cuco render, verify the real
cuts: `scripts/cut_frames.py <PID> <AID>` samples the final video just before/after each boundary.
Some styles *reveal* the next clip with a wipe or slide (Jessee wipes the panel in vertically), so a
clip's first ~0.3 s is partly hidden: open on a picture that reads instantly, not on a detail.

The welding v2 (Ink Bleed) is the cautionary example: it chained 14 sections camera-to-camera and
matched 8 more, so almost every cut was a jump cut.

## 3. Model (scene.js)

- **Real units** (feet/inches) and real dimensions. Accuracy is the content: 2×10 = 1½×9¼,
  16 in on-center layout, 8/12 pitch. Viewers learn from proportions.
- Every piece is a *part* in a *stage* (`K.box('joists', key, ...)`). Stages are the
  vocabulary of the lesson; `order` lists the cumulative ones so beats say `upto: 'subfloor'`.
- `key` orders parts inside a stage (e.g. x position → joists drop in left to right).
  Equal keys animate together (a truss's 7 members, a bolt + its nut).
- Scale: return `drop` (how far parts fall in), `shadow` (shadow box half-size) and `sunOffset` from
  `build()` when the subject isn't house-sized (machine-sized: `drop: 0.6, shadow: 6, sunOffset: [-6, 12, 8]`).
- **Make the scene restylable.** Declare materials with `K.defineKinds({...})` (never assign `K.KIND`
  directly) so `theme.json` → `kinds` can recolor them per style, and read effect colors (glows,
  sparks, particles, emissives, additive vs normal blending) from `THEME.fx` via
  `build(scene, K, THEME)`. Additive glows vanish on light paper backgrounds: set `fx.additive: false`
  there. Then a new style = new `theme.json` only; the scene code stays the same.
- Custom kinds: flat "clay" materials (`{color, rough, metal, edge}`),
  and build custom geometry (tubes, lathes, half-cylinder cutaways) with a small helper that calls
  `K.finishMesh` so it joins the stage system. Effects (glow sprites, point lights, particles) live
  outside stages in `refs`: turn them off in `reset(refs)`, drive them from hooks.
- Build assemblies that move (a wall that tilts up, a roof that splays) inside a
  `THREE.Group` with its pivot at the group origin; store the group in `refs` and reset it in
  `build().reset(refs)`.
- Cutaways teach: a soil diorama with the front face cut open showed footing, frost line,
  and the foundation all at once.
- **Specimens** for details the full model can't show clearly. Build them far away from the
  main model (x = 120, 200, 300…) on the same paper floor: a lumber pile, nominal-vs-actual
  cross-sections, a 2×4 vs 2×6 wall section, a rafter sitting on a plate. A beat just points
  the camera there (a hard cut = two camera keys 0.0001 apart).
- Profiles with cuts (rafters with a bird's mouth, stringers) → `K.profile(...)`: a 2D outline
  extruded, exact and cheap.

## 4. Motion + annotation (beats.js)

See the header of the template's `beats.js` for the full schema. Patterns that worked:

- **Build what's being said:** `build: {rafters: [0.2, 0.62]}` over the words about rafters.
- **Show forces with motion,** not just arrows: walls splaying outward (group tilt + roof scale)
  until the ceiling joists appear and pull them back in taught rafter ties better than any label.
- **Ghost** (`ghost: {wsheath: 0.18}`) to see through sheathing for a load path, or to swap
  alternatives (rafters fade → trusses drop in → swap back).
- **Highlight** in coral what the sentence names (`hl`), sparingly. Never highlight big
  concrete masses: the frame turns into a red slab.
- **Labels:** leader line + paper tag, title + mono sub-line ("PRESSURE-TREATED / resists rot
  & insects"). 32 px on a 1620 canvas reads fine after the style shrinks the card.
  Place them with `dx/dy` pointing toward empty space, never off-canvas.
- **Dimension lines** (`dims`) for the numbers the narration says (16 in o.c., 48 in frost, 8 ft).
- `draw(g, ctx)` for arrows (load flow, heave, thrust), dashed lines (frost line, rough
  opening), little 2D insets (racking diagram). Project 3D points with `ctx.project(V(...))`.
- One chapter tag top-left (`chapter: ['05', 'FLOOR']`) keeps a long lesson navigable.

## 5. Review loop — the step that makes it good

```bash
node render.mjs --stills=0.2,0.6,0.97          # 3 stills per beat, seconds for all beats
node render.mjs --seams                        # jump-cut check across every seam (section 2b)
./sheets.sh /tmp/sheets b01 b02 b03 …          # 3 beats per sheet; Read the sheet images
```

Look at every sheet. Typical first-pass problems (all hit on the house build):
- **Camera too tight.** Frames felt cramped and cropped the subject. Fix globally per beat with
  `k: 1.2–1.45` (dolly along the view ray) instead of re-typing positions.
- **Similar materials merge.** OSB sheathing on an OSB deck vanished. Give adjacent materials
  different textures/values (plywood deck vs OSB wall). Tone down busy textures.
- **Labels cut off / colliding** with the chapter tag. Flip `dx`, move anchors inward.
- **Detail unreadable in context.** A bird's-mouth cut seen on the house was mush. A specimen
  in pure profile (long lens: fov ~4–7°, camera ~40 ft away, looking *away* from the main
  model so it isn't in the background) read like a textbook section.
- **Metals render black:** MeshStandard with metalness > 0.3 and no env map. Keep ≤ 0.25.
- **Stretched layers when scaling a group** (a "dig" squashed grass onto the pit floor). Hide
  those parts with `ud.forceHide` in the hook.
Iterate on stills (seconds) and only render video once the sheets are right.

## 6. Render + assemble

```bash
node render.mjs --beats=all --workers=3                        # clips/<id>.mp4
python3 $CUCO_SKILL/scripts/attach_clips.py script/beats.json \
    --project <PID> --clips clips --clip-id $(cat script/clip_id.txt)
cuco arrangement create <PID> --patch-json '{"style_id": 65}'
cuco arrangement process <PID> <AID> --render --style-id=65 --wait --timeout 1800
$CUCO_SKILL/scripts/check_audio.sh "<...>/arrangements/<AID>/video.mp4"
```

A render of a 6–8 min story takes >10 min: run it in the background or with a long
`--timeout`. Then spot-check the result with a contact sheet
(`ffmpeg -i video.mp4 -vf "fps=1/25,scale=400:-1,tile=4x4" -frames:v 1 sheet.jpg`).

## Engine notes

- **Transparency toggles need a shader recompile.** three.js bakes `OPAQUE` into the program, so a
  material that becomes transparent after its first frame stays visually opaque unless
  `material.needsUpdate = true`. The engine does this; if you write custom material code, do it too.
  (Symptom: constant `ghost` values work, animated ghosts don't.)
- Debugging: after `window.renderAt(t)`, `window.__ctx.state` holds each stage's `{p, g, h}` and
  `window.__ctx.stages` the parts/materials. Inspect from Playwright instead of guessing.

- `render(t)` is a pure function of (beat, t): state is rebuilt every frame, so frames can
  render in any order and in parallel workers. Keep hooks pure too (derive everything from
  `ctx.t` / `ctx.T`, no accumulated state).
- Renders at pixelRatio 2 and downsamples for clean anti-aliasing; `--use-angle=metal` gives the
  real GPU in headless Chromium on macOS.
- The overlay is a 2D canvas composited over WebGL per frame; fonts (Red Hat Display, JetBrains
  Mono) load from Google Fonts before the first frame.
- `cuco files copy-local` rejects sources outside its allowed dirs (e.g. `/private/tmp`).
  Copy into `projects/<PID>/attached_media/<sha256>.<ext>` by hand, as `attach_clips.py` does.
