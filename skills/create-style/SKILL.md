---
name: create-style
description: Create a CucoStudio style, a motion design system for video comms, from any starting point. That can be a brand URL, a few images, a prompt or a single word, or a purchased AE template. It gathers brand context, then designs a video-native graphic world and builds it in After Effects, WebGFX or Blender. For a prompt or images that world is invented (material, image-making process, light, type that lives inside it); for an existing brand it grows out of the brand's own identity (exact colours, type, mark, photography). Use when asked to "make a style", "create a design system", "build a look for videos", or "turn this site/image/idea into a style". Read BEFORE writing any template or ExtendScript.
---

# Create a CucoStudio Style

You are a motion designer building a **motion design system for video comms**. It is
a reusable look into which the app pours any story (narrated words with spoken timing,
plus optional media). The deliverable is a **visual world that moves**. Its frames
could only be video, its motion comes from how the image is made, and its type lives
inside that world. Files that parse are the floor, not the goal.

Three stages: **understand the brand → design the world (invented, or grown from an
existing brand's identity) → build and verify it in an engine.** Context is research;
the world is your design. Keep them apart: the commonest failure is transcribing the
research (usually a website) into the video. The opposite failure, for an existing
brand, is designing over its identity.

## Step 1 — Gather context (understand, don't copy)

Starting points, alone or combined:

| Given | Go to |
|---|---|
| a brand URL | 1a |
| a few images (moodboard, product shots, past work) | 1b |
| a prompt, a described aesthetic, or a single word ("steel") | 1c |
| a purchased AE template (.aep + package) | 1d, the exception: there the template IS the world |

Every path ends in a **brief** (`BRAND.md` in your working folder
`~/styles/{brand}/`; shape in [example-brand.md](./example-brand.md)). It covers:
- who the brand is, who it talks to, and its voice
- the 3-colour core and the type character
- its **image language**: what its imagery is made of, and what it says
- anything visual the brand owns: a mark, a mascot, a product, a material, a place

**Context, not template.** A website is an interface for scrolling and clicking. Its
components carry no brand identity, and none of them go into a video style:
- cards, pills, rounded corners, 1 px borders
- eyebrow labels, nav, info strips, hero layouts
- CSS easing curves, fade-up-on-scroll reveals

From the site take who the brand is, how it talks, its colours, its type, and its
imagery with what that imagery says. Leave the interface behind.

**A style carries no content.** It is aesthetics only, and the story brings the
content. Nothing in it may read as information: no numbers or counters, dates,
names, slogans, or photos of specific people. The textBlock sample is the only
text, and the director replaces it. Decoration must be evergreen design: shape,
material, layout, the logo. The section index may vary the design (a crop, a
composition, a colour) but never appears as a number. SALF 29N failed this: it
baked in a section counter ("01" to "06"), the "29N" election date and the
candidate's portrait.

**An existing brand's identity is not context: it is the material.** What gets
dropped is the interface, never the identity. Keep all of these:
- its colours, rendered as real fields at their exact hex
- its typefaces and their gesture (an italic aside, a weight contrast)
- its mark and the shapes it is built from
- its own photography, shown whole

HCD v2 failed this. It invented a "Hialeah afternoon sun" world, and the 3D light
turned the navy into dusty violet and the cream into peach. Slats ran across the
clinic's portraits. The client's verdict: "worse than before, it doesn't feel like
their brand".

### 1a. A URL

**Truth comes from the RENDERED page, not the source code.** Reading HTML/CSS
alone has two known failure modes (both hit on a real build):
- **Dominance inversion** — counting color occurrences in code weights accents
  (used in many rules) over the field color (declared once, covers 60% of
  pixels). Dominance is an AREA question, answerable only from rendered pixels.
- **Fallback-font trap** — `font-family` stacks list the webfont first, but a
  code-only fetch can't confirm it loaded, so you end up designing with the
  fallback (e.g. Times New Roman standing in for a light Didone).

Run BOTH passes:

1. **Rendered pass** (authoritative for palette + type + imagery), using
   [extract-brand.py](./extract-brand.py):
   ```bash
   uv run --no-project --with "playwright==1.58.0" --with pillow \
     python ${CLAUDE_SKILL_DIR}/extract-brand.py <url> <outdir>
   ```
   Pin a Playwright version whose browser is already cached: 1.58.0 matches
   `chromium_headless_shell-1248`, and newer versions want a build that may not be
   downloaded. On `Executable doesn't exist`, `ls ~/Library/Caches/ms-playwright`
   and pin the matching version, or install the browser once with `python -m
   playwright install chromium-headless-shell`. It captures:
   - screenshots
   - `@font-face` rules (the real font names + files)
   - computed styles per typographic role (family, weight, casing, tracking, leading)
   - CTA/interactive-element colors (accent candidates; the accent is found by
     salience, never by area rank)
   - area-weighted element backgrounds and a full-page pixel palette
     (median-cut, merged in Oklab)
   - the page's **largest images, background images, video posters and inline
     SVG marks**, downloaded into `<outdir>/imagery/` with `imagery.json`

   Missing Google webfonts: `fonts.google.com/download/list?family=X` (strip
   the `)]}'` prefix) lists static TTF URLs; read PostScript names with
   fontTools, and AE 2025 picks up fonts installed while it is running.
   Then **LOOK at the screenshots AND the imagery folder**. Your visual judgment
   of dominance and character overrules any number. For the imagery, describe:
   - the medium (photo, illustration, 3D, scan)
   - the light, distance, grain and edge quality
   - what is depicted, and the process that made it

   Rationale + deeper techniques: [extraction-notes.md](./extraction-notes.md).

   **Bot wall** (the script prints `BOT WALL`, e.g. a Cloudflare challenge): run it
   on the latest Wayback snapshot, `https://web.archive.org/web/<timestamp>if_/<url>`
   (timestamps from `archive.org/wayback/available?url=<host>`). Compare it with the
   live page in Claude in Chrome.
2. **Content pass** (WebFetch): what the product IS, brand voice, copy tone,
   and links to the brand's films, social and press. A brand's video presence
   is richer context than its site: look at it when it exists.

From the rendered evidence, identify the **60/30/10 split** (Dominant field /
Secondary / Accent) using pixel shares + your eye — not code frequency.

**Fonts**: take the family from `@font-face`, not the fallback stack. If the
real font isn't installed locally, characterize its anatomy (Didone ·
transitional · grotesque · geometric · humanist · slab · mono), check its
weight (a 300-weight display reads very differently from a 700), and pick the
closest INSTALLED substitute by anatomy + weight (e.g. Sigurd Light, a
high-contrast Didone → Didot; Courier Prime → Courier New). List candidates
with `system_profiler SPFontsDataType` or check `/System/Library/Fonts`.

Download key assets (logo/SVG marks, hero art, product shots) into
`assets/images/` — as reference and as possible material, not as layout.

### 1b. A few images

View every image. Sample the palette (pixel shares, Oklab). Then describe the
**image language** as precisely as a cinematographer or printer would:
- the medium, the light, the colour behaviour (inks, light, dyes)
- texture and grain, edge quality, density, depth
- the process that made the images

Images are evidence of an aesthetic. The world you build can go beyond them, but
it must feel like it came from the same hands. When images arrive with a brand
name, also run 1a/1c for the context.

### 1c. A prompt or a word

There is no reference, so write the brief yourself:
- one sentence on what the subject MEANS (steel → precision under stress), not
  what it looks like
- who will watch, and what they should feel
- where this aesthetic lives in the world: film, print, objects, places,
  processes

Then move to Step 2. The literal reading of a word is the stock-template one
(see the taste check).

### 1d. A purchased AE template

The template IS the design context, and its motion language is part of the
aesthetic. Follow "Converting a purchased AE template" in [ae.md](./ae.md):
- render ground-truth frames from the template's own final comp FIRST
- extract its actual mechanics (expressions, effect stacks, transitions)
- stay inside that world: house enter/exit vocabulary dilutes it

Consider keeping the template's native resolution/fps. Step 2 is mostly answered by
the template, so skip to Step 3.

## Step 2 — Invent the world (the design step)

The brief says who the brand is. Expand, don't transcribe: the target is the brand's
title sequence or brand film, not its website playing as a video. How much you
invent depends on the starting point:
- **A prompt, a word, or a few images with no established identity.** What the
  video world looks like is your decision. Invent the material, the process and the
  light (2a–2g).
- **An existing brand with a visible identity** (a logo, a palette, its own
  photography). The world grows out of that identity: a motion system and
  compositions built from the brand's own parts. Possible sources, not a recipe:
  - the mark's shapes become windows, wipes and strokes
  - the type's gesture becomes an event
  - the photography is the hero
  - the exact colours are the fields

  Don't bring in an outside metaphor (weather, sunlight, a place, a material)
  that re-lights its colours or covers its photos. Material and texture are
  allowed only if they leave the identity intact.
  [hcd-smile](./examples/hcd-smile/) shows brand fidelity. Don't reuse its motion
  or layouts.

**Don't converge on the last style.** HCD Smile and SALF 29N came out as one video
in two palettes:
- the same serif, rising line by line out of baseline windows
- the same block of text bottom-left under a photo window, with the lockup top-left
- a giant tone-on-tone graphic, and a last phrase turning to the accent colour
- the same 7-shot skeleton, with cuts through an empty field

SALF was forked from HCD's builder, and this step read as a recipe. So:
- **Register and tempo first**, from the brand's video, social and print presence,
  not its website: how fast it cuts, how loud its type is, how it moves. A rally and
  a dental clinic don't share an easing curve.
- **Design type motion, layout grid and transitions fresh**, and write them down
  before building. Check the plan against the "Its look (don't repeat)" column of
  the examples table. Repeating more than one of those means redesign.
- **Reuse only infrastructure** from examples: the typeset layer, controller timing,
  fit-safe reflow, cover-scale, the casting test. Never their line stacks, layouts
  or transitions. The shot count and kinds come from the design; the contract only
  needs text-only, text + media and media-only.

Write these down, in order; they are the style.

### 2a. The world: a material and a process

What is a frame MADE of, and what process makes the image? Write one sentence for
each. Registers to calibrate the ambition (examples, not a menu):
- ink soaking into newsprint
- cyanotype exposures developing in a tray
- light through reeded glass
- cut paper under a rostrum camera, lit from one side
- two-colour risograph plates drifting off register
- engraved security paper
- a single object turning under a softbox
- chalk on slate, neon smeared across wet asphalt
- a culture growing in agar (for a biotech)
- a long exposure of headlights (for logistics)

Sources for the world:
- **the brand's image language** (a painterly illustrator → paint)
- **its product or material** (a coffee roaster → smoke, crema, burlap)
- **its place**
- **a metaphor for what it does** (an accounting firm → ledger engraving and
  guilloche)

**Empty-frame test.** Describe a frame with no media and no words. If the answer
is "a colour field with a soft gradient", you don't have a world yet. For a
brand-led style these pass: an exact brand field carrying a graphic built from the
mark (a supergraphic, or a window in the shape of the mark), or a sheet of brand
colour in motion.

### 2b. The signature: a process verb

Name the image-making process in motion as ONE verb, for example:
- burn, soak, bleed, etch, print, expose, develop, refract
- erode, grow, fold, cut, press, smear, scan, condense, crystallize, weave

It is the style's punctuation: budget it to the moments that matter, not every
phrase. Rigid moves (slide, fade, scale, glide, rise, pop) only place things.
They are never the style.

Three rules that turned HCD v1's mediocre motion into v3's:
- **Every move has a cause**: its own speed (an edge that bends while moving),
  the mark's drawing order, the voice. One uniform rise on every line has none.
- **Few mechanics, many compositions.** Three mechanics recombined across seven
  shots: the mechanics give consistency, the layouts give variety.
- **Transitions are one system.** The caster picks the shot order, so any shot must
  be able to follow any other. Passing through an empty field is one answer, not
  the default.

### 2c. Type lives in the world

Choose the **type voice**: families, weights, case and tracking from the context,
or chosen by rendering a specimen of installed candidates and looking. Then
decide **how type exists in the material**, for example:
- printed into it, or debossed into it
- cut out of it, or exposed through it
- projected onto it, or casting shadows on it
- a window into a plate, or a lens that bends what's behind

Type floating above a background is the web default; avoid it.

### 2d. Palette

Three hex from the context: dominant field, secondary ink, one accent. The world's
light and material create in-between values (shadow, highlight, ink density,
glass tint). Derive them from the three inside expressions, so a palette swap
propagates. Spend the accent on one meaningful use.

### 2e. Media becomes material

Story media enters the world through its process:
- screened and printed as plates
- projected onto surfaces, or seen through the glass
- exposed, soaked in, cut into, or burned in

Duotone/tint/scrim/grain is the minimum treatment, never the idea.

### 2f. The trinity drives the world

The three sliders must change the image-making process, not just nudge positions.
Write one sentence per axis:
- **FORM** (structural ↔ abstract): how far the process transforms the image,
  from crisp and literal to dissolved, painted or abstracted
- **FLOW** (static ↔ kinetic): how alive the material is, from a still print to
  boiling, flowing or drifting
- **PRESSURE** (low ↔ high entropy): how much the process disorders things,
  from clean registration to misregistered, eroded, scattered or fractured

For a brand-led style the axes bend the system's geometry and tempo (the mark's
radius, edge depth, speed, stagger), never the brand colours or how much of a
photo shows.

### 2g. Canvas

1080×1920 vertical (default), 1080×1350, 1080×1080, or 1920×1080. Match the
world's energy.

### Source the material

A world needs material, and ExtendScript alone draws little of it convincingly.
Combine:
- **In-engine procedural matter.** For AE, [ae-techniques.md](./ae-techniques.md)
  covers fractal matter, displacement and refraction, halftone print, 3D light
  and shadow, time, marks, and generative vector work.
- **Generated plates and loops:**
  - the `comfy` skill: Krea2 stills for textures and backplates; LTX
    image-to-video for living loops of ink, smoke, light or fabric
  - the `blender` MCP: renders of an object, a material or a light study
  - the `lupa` vault: real scans, textures and photographs
- **The user's own** filmed or scanned material.

Generate MATERIAL, not finished pictures: paper, ink blooms, caustics, film burns,
smoke, fibres, light leaks, all designed to loop and to be composited. Ship them
in `{style}/footage/` (absolute paths survive arrangement copies). Drive them with
the controller and the trinity: a plate is matte, map, texture or light, never a
static backdrop.

### Taste check

**Material is not the enemy; decoration without a concept is.** The first "steel"
shipped brushed-noise plates, rivets, Bevel Alpha + CC Light Sweep chrome and
orange sparks, and was rejected as tasteless. Each effect was a stock preset
signalling "metal". The rebuild that shipped started from a concept (steel →
precision under stress) and one mechanic (shear bands locking flush with a seam of
light). It did not succeed by having less material.

Ask of every layer: does it express the world's process, or decorate? These are
decoration:
- presets used as found
- lens flares, generic particle bursts
- glow on everything
- grain + vignette as the "finish"

Authored is fractal noise tuned into the burn of THIS paper, or a light that
behaves like the softbox in a product film. Choose type by rendering a specimen
and looking. See [examples/steel/](./examples/steel/).

### Slop signatures: you rebuilt a website if you see these

- type floating over a colour field with a radial-gradient "glow" or "light pool"
- hairlines, eyebrow labels, info cards, rounded rects, pills
- every motion is a fade/slide/scale/blur reveal staggered per word or line
- grain + vignette as the only texture
- the text-only shot is typography and rectangles
- **The CSS test**: could this frame be rebuilt in HTML/CSS in an afternoon? Then
  it isn't using the medium.

### Boredom check: design for the text-only story

Most real stories are narration with no media, so the caster reuses the text-only
shots for most sections. Those shots carry the video, and they need the WORLD, not
just layout:
- **The world evolves across the video**: the material changes state (the print
  ages, light moves through the day, the ink spreads, the glass fogs).
- Several compositions that change per phrase, driven by the director's phrase
  markers, with type scaled to fill each composition's zone.
- An event/quiet rhythm, so the signature punctuates instead of becoming a tic.
- A landing composition for each section's last phrase.

A second "steel" had two text-only shots with the same composition and the same
shear on every phrase. Its 39 s video was correct and boring. Before calling a
style done, render a text-only story of 6+ sections and watch it at speed.
[examples/steel/](./examples/steel/) has the phrase→composition engine; it
supplies the mechanics, and the world is still yours to add.

## Step 3 — Route to an engine

Priority: **explicit user choice → inference → ask**.

| Engine | Playbook | When | Requires |
|---|---|---|---|
| After Effects | [ae.md](./ae.md) + [ae-techniques.md](./ae-techniques.md) | Production default on main. A compositor for material worlds: procedural matter, generated plates, 3D layers with light and shadow, time effects | AE running + CucoStudio CEP extension connected (for import + render) |
| WebGFX | [webgfx.md](./webgfx.md) | Typographic, print, kinetic-caption and shader (canvas/WebGL) worlds; fully offline renders | Branch `feat/webgfx-fable` (engine not yet on main) |
| Blender | [blender.md](./blender.md) | True 3D: objects, materials, lighting, camera moves | Branch `feat/blendergfx` (engine not yet on main) |

Inference hints:
- the world is an object or a space → Blender, or AE with Blender-rendered plates
- the world is a material, a print process, or a light → AE
- the world is purely typographic or graphic → WebGFX or AE
- the render must run today on a user's machine → AE

When genuinely ambiguous, ask.

Read the chosen playbook fully before building. Each playbook contains the
engine's contract, craft techniques, and its own verification loop.

## Step 4 — The shared finish line (every engine)

A style is DONE when all of these hold — never stop at "files exist":

Import and run one real E2E after the first two shots work, not at the end. The
director's fit, casting and timing only show there: HCD Smile's dead air, ragged
lines and mistimed writing never appeared in previews.

1. **Visually verified**: you rendered frames at enter / mid / exit moments
   for every shot and LOOKED at them (each playbook says how). Two nearby
   enter frames must differ — motion must be real. Iterate at least twice.
   Then judge the world:
   - the text-only shot passes the empty-frame test
   - no slop signature is present
   - no frame passes the CSS test
   - the media is visibly transformed by the world's process (for a brand-led
     style: placed and moved by the brand's system, never covered)

   Judge type size and detail at FULL resolution. On contact-sheet tiles, 100 px
   type looked like 50 px and nearly sent a correct layout back for rework.
1b. **Brand fidelity (existing brands)**:
   - Sample the rendered pixels: each brand hex must appear as a field, not as
     a lit or tinted approximation.
   - The brand's photography must be visible and uncovered.
   - Before calling a version better, render the previous version and the new
     one through the SAME storyboard, as two arrangements on one project, and
     put them side by side:
     `ffmpeg -i a.mp4 -i b.mp4 -filter_complex "[0:v]scale=432:768[a];[1:v]scale=432:768[b];[a][b]hstack" out.mp4`
   - For a restyle, show style frames for a new direction before the full build.
2. **Trinity does visible work**: form / flow / pressure each change the
   output (see `designers-docs` trinity concept: flow = static↔kinetic,
   form = structural↔abstract, pressure = low↔high entropy), and at least
   one axis changes the world's process, not just positions or opacity.
3. **Imported into CucoStudio**: `cuco --json style create --name "Name"
   --folder-path <abs path>` (backend must be running — port from
   `jq -r '.ports.fastapi' ~/Library/Application\ Support/CucoStudio/config/app_config.json`).
   Verify the response's engine/metadata. The client can time out while the
   style is still created: run `cuco --json style list` before retrying.
4. **Smoke-rendered E2E** through a real arrangement (use the cuco-studio skill).
   The storyboard must cast EVERY shot. At pressure 0 the caster always picks the
   best match by media aspect ratio and by the section's AVERAGE phrase length
   (each sentence becomes a phrase; shots smaller than the longest phrase lose).
   So write it from the manifest: one section per shot, its sentences at or just
   under that shot's `chars`, media at its `frame` aspect (no text for media-only shots). A 7-section test that ignored
   this never rendered 4 of HCD Smile's 7 shots. Sheet the
   whole video at 4 fps and look at the cuts: enter + exit dead air (an empty
   field) adds up fast. HCD Smile lost ~0.6 s per cut until enters were cut
   to ≤ 0.8 s and exits to ~0.5 s. In a silent render the word markers spread
   to the section's end, so a beat after the last word (an underline) barely
   shows: check landing beats with a voiced render. Silent
   styles (no voice) render fastest; a `voice_sample.wav` dropped in the
   style folder later adds a cloned narration voice — never invent another
   voice mechanism. Heavy procedural worlds must also render inside the
   app's time budget (see "Render cost" in [ae-techniques.md](./ae-techniques.md)).
5. **Poster**: generate `poster.gif` from the actual render and set it:
   ```bash
   ffmpeg -y -ss 0.4 -t 4 -i "$VIDEO" -vf "fps=10,scale=360:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -strict unofficial {style}/poster.gif
   curl -s -X PUT "http://127.0.0.1:$PORT/api/v1/styles/$ID" -H 'Content-Type: application/json' -d '{"poster_filename": "poster.gif"}'
   ```
   For template-LINKED styles (`is_template_linked: true`) the PUT is a no-op
   (API ignores `poster_filename`; GET keeps returning null) and that's FINE:
   `styles/{id}/template` is a symlink to your style folder and the UI
   discovers `poster.gif` there by file convention — just having the file in
   the folder is enough. Verify via
   `GET /api/v1/files/exists/styles/{id}/template/poster.gif`.
6. **Style folder is CLEAN**. The delivered folder (`~/style-dev/{name}/`)
   contains ONLY what the app and the designer use:
   - exactly one `.aep` (or the engine's template) at root
   - `manifest.json`, `poster.gif`, optional `voice_sample.wav`
   - `footage/` with the material plates the project references

   The designer iterates at the After Effects level, so never leave BRAND.md,
   builder/verify scripts, or extraction JSONs there. Those are working files:
   they live in `~/styles/{brand}/` during the build and are disposable after.
   Fold durable LESSONS into this skill's playbooks instead. If a build proved a
   new technique end-to-end, save its BRAND.md + builder under
   [examples/](./examples/).

## Examples: what each one teaches

The first four examples in the table predate the doctrine above. Mine them for
**engineering** (the contract, phrase engines, masks, performance). Graphically,
they are what this skill now steers away from: type on a field with gradient light.
Don't copy their look. The builds after the table are the current references.

| Example | Learn from it | Its look (don't repeat) |
|---|---|---|
| [hermes-cobalt](./examples/hermes-cobalt/) | rendered-page extraction (dominance inversion, fallback-font trap) → BRAND → builder → verification | type + repeater rays poster |
| [steel](./examples/steel/) | word → concept; multi-copy mask shear; per-phrase layout engine; event/quiet rhythm | thin caps on black, light-sweep gradients |
| [hialeah-dental](./examples/hialeah-dental/) | two-font Source Text; furniture that doesn't replay on every cut | the clinic's website hero, nearly verbatim (its identity was right: [hcd-smile](./examples/hcd-smile/) keeps it) |
| [sidecarsun-rise](./examples/sidecarsun-rise/) | render performance (mainComp holds only mainControl); eclipse mark; plates that only move up | web sections as plates under a radial glow |
| [hcd-smile](./examples/hcd-smile/) | brand fidelity; the typeset layer (performance); mark-shaped windows; speed-bent sheets | serif lines rising out of baseline windows; text block bottom-left under a photo window; lockup top-left; giant tone-on-tone mark; landing phrase in the accent |
| [salf-29n](./examples/salf-29n/) | Extract light/ink reveal; bot-wall extraction; manifest-driven casting test | HCD Smile again (same engine, layouts, skeleton), plus baked content: a section counter, a date, the candidate's portrait |
| [salf-cinta](./examples/salf-cinta/) | register from posters and reels; one device (tape) for type and media; a line layer per line, sized strips; the reflow read once (performance) | heavy italic caps on torn strips pulled in sideways and ripped off; tilted taped-up prints; hard cuts with everything in place; 6 shots |
| [fila20](./examples/fila20/) | the brand's name as the world (row 20 → the cinema screen); traced vector logo; persistent logo; empty sections → brand shot; credits-roll column; 24 fps | a lit white screen re-fitted to each phrase; end-credits roll; the logo ring as leader sweep and changeover cue; subtitles under or burned into stills |

The first world-first build is [letterpile](./examples/letterpile/): one style frame →
BRAND (brief + world) → 7 shots, smoke-rendered through CucoStudio (style 78). Learn
from it:
- per-letter stacking driven by phrase markers, safe for the director's fit
- director-fit emulation for previews
- giant letters taken from the section's own words, in a pile that grows with the
  section index
- media flattened into the palette, and a die-cut backing for type over photos

Its register is flat graphic because the style frame is. Its trinity is not wired
yet.

The same clinic was built three times, and the three versions are the lesson:
- **[hialeah-dental](./examples/hialeah-dental/) (v1).** Read as the brand, but the
  design was mediocre: the website hero transcribed, with a generic glow and
  static type.
- **[hcd-afternoon](./examples/hcd-afternoon/) (v2).** Rejected as off-brand. It
  invented a world (afternoon sun through a jalousie window on stucco) that
  re-lit the brand's colours and striped its portraits. Its techniques are sound
  and reusable for worlds that own their light:
  - shadow-only occluders, and type as a cast shadow
  - words written in light through a Set Matte stencil
  - photos projected by a light (Light Transmission)
  - a procedural palm frond
- **[hcd-smile](./examples/hcd-smile/) (v3).** The reference for brand fidelity (not for motion or layout).
  It keeps v1's identity exactly (navy, cream and peach fields; Newsreader with
  the italic aside; the clinic's portraits) and builds the system from the
  monogram:
  - sheets of brand colour rise with a smile-curved edge that deepens with speed,
    and every cut lands on cream
  - photos sit in D-cup windows: the outline draws like the logo stroke, and the
    photo fills the cup like a rising level
  - the italic landing line is written on as it is spoken, then underlined by a
    drawn smile
  - a giant tone-on-tone D frames the text-only shots

  It is also the performance reference: a per-shot "typeset" JSON layer took it
  from 4.8 s to 0.06–0.14 s/frame (see ae.md).

[salf-29n](./examples/salf-29n/) is the convergence failure described in Step 2. Keep
its techniques (Extract light/ink in ae-techniques §13, the casting test), not its look.
[salf-cinta](./examples/salf-cinta/) is its redo (style 82): register taken from the
brand's posters, reels and Telegram, and checked against the don't-repeat column
before building (see its BRAND.md).

The tested building blocks of a material world live in
[ae-techniques.md](./ae-techniques.md) and its runnable lab,
[ae-techniques-lab.jsx](./ae-techniques-lab.jsx). In those files `$CREATE_STYLE`
stands for this skill's folder, `${CLAUDE_SKILL_DIR}`.
