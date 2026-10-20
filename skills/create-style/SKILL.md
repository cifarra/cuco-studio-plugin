---
name: create-style
description: Create a CucoStudio style (a reusable video design system) from visual context — a brand/website URL, reference images, a moodboard, or a described aesthetic. Routes to the right render engine (After Effects, WebGFX, Blender). Use when asked to "make a style", "create a design system", "build a look for videos", or "turn this site/image into a style". Extracts brand identity from URLs automatically. Read BEFORE writing any template or ExtendScript.
---

# Create a CucoStudio Style

You are acting as a motion designer. The deliverable is not files that parse —
it is **frames that look designed and motion that feels intentional**. A style
is a reusable design system: the app pours any story (words with spoken
timing + media) into its shots.

The process has three parts: **gather design context → route to an engine →
execute that engine's playbook**. The design thinking is shared; only the
build medium differs.

## Step 1 — Gather design context

### 1a. If given a URL: extract the brand

**Truth comes from the RENDERED page, not the source code.** Reading HTML/CSS
alone has two known failure modes (both hit on a real build):
- **Dominance inversion** — counting color occurrences in code weights accents
  (used in many rules) over the field color (declared once, covers 60% of
  pixels). Dominance is an AREA question, answerable only from rendered pixels.
- **Fallback-font trap** — `font-family` stacks list the webfont first, but a
  code-only fetch can't confirm it loaded, so you end up designing with the
  fallback (e.g. Times New Roman standing in for a light Didone).

Create a working folder (`~/styles/{brand}/`) and run BOTH passes:

1. **Rendered pass** (authoritative for palette + type):
   `python3 extract-brand.py <url> <outdir>` (asset:
   [extract-brand.py](./extract-brand.py); needs playwright + pillow — the
   cuco-core poetry env has both: `cd cuco-core && poetry run python …`). It
   captures screenshots, `@font-face` rules (the real font names + files),
   computed styles per typographic role (family, weight, casing, tracking,
   leading), CTA/interactive-element colors (accent candidates — the accent
   is found by salience, never by area rank), area-weighted element
   backgrounds, and a full-page pixel palette (median-cut, merged in Oklab).
   Then **LOOK at the screenshots** — your visual judgment of dominance and
   character overrules any number. Rationale + deeper techniques:
   [extraction-notes.md](./extraction-notes.md).
2. **Content pass** (WebFetch): brand voice, copy tone, layout patterns,
   `og:image` / hero asset URLs, what the product IS.

From the rendered evidence, identify the **60/30/10 split** (Dominant field /
Secondary / Accent) using pixel shares + your eye — not code frequency.

**Fonts**: take the family from `@font-face`, not the fallback stack. If the
real font isn't installed locally, characterize its anatomy (Didone ·
transitional · grotesque · geometric · humanist · slab · mono), check its
weight (a 300-weight display reads very differently from a 700), and pick the
closest INSTALLED substitute by anatomy + weight (e.g. Sigurd Light, a
high-contrast Didone → Didot; Courier Prime → Courier New). List candidates
with `system_profiler SPFontsDataType` or check `/System/Library/Fonts`.

Download key assets with `curl` (og-image, logo/SVG, hero art) into
`assets/images/`. Write a `BRAND.md` — see [example-brand.md](./example-brand.md)
for the expected shape (about, 60/30/10 palette + extended palette,
typography with roles + substitute rationale, visual identity notes, assets
list).

### 1b. If given images / a described aesthetic

Study them directly (view the images). Sample the palette from the reference.

### 1b². If given a purchased AE template (.aep + package)

The template IS the design context — and its motion language is part of the
aesthetic. Follow "Converting a purchased AE template" in [ae.md](./ae.md):
render ground-truth frames from the template's own final comp FIRST, extract
its actual mechanics (expressions, effect stacks, transitions), and stay
inside that world — house enter/exit vocabulary dilutes it. Consider keeping
the template's native resolution/fps.

### 1c. Commit to design decisions BEFORE building

Write these down; they are the style:
1. **Palette (exactly 3 hex)**: dominant field, secondary ink, one accent.
   Discipline beats variety.
2. **Type voice**: families, weights, case, tracking that match the
   reference's attitude. (Engine constraint: WebGFX/Blender need locally
   available fonts; AE will flag substitutes at import.)
3. **One motion verb** everything obeys: *slam · stamp · settle · breathe ·
   converge · orbit · radiate · glide*. If you can't name the verb, you
   don't have a style yet.
4. **Media treatment**: never leave media untouched — duotone, tint, scrim,
   grain, plate contrast, or a shaped mask that grades it into the system.
5. **Canvas**: 1080×1920 vertical (default), 1080×1350, 1080×1080, or
   1920×1080 — match the reference's energy.

**Taste check — when the brief is just a word** ("steel", "glass", "paper"):
the literal reading is the stock-template one, and it gets rejected as
tasteless (a first "steel" shipped brushed-noise plates, rivets, Bevel Alpha +
CC Light Sweep chrome, orange sparks). Before building, write one sentence on
what the material *means* (steel → precision under stress), pick ONE signature
mechanic that expresses it (steel → shear bands locking flush with a seam of
light), choose type by rendering a specimen of the installed candidates and
looking, and budget the accent to a single meaningful use. Bevel/emboss/glow
presets, particle bursts and texture overlays are last resorts, never the
concept. See [examples/steel/](./examples/steel/) for the rebuild that shipped.

**Boredom check — design for the text-only story.** Most real stories are
narration with no media, so the caster reuses the text-only shots for every
section. A second "steel" had two text-only shots with the same composition
(centred stack on black) and the same shear on every phrase. The 39-second
video it produced was correct and boring. A style must give text its own
*composition system*:
- several layouts that change per phrase (driven by the director's phrase
  markers)
- type scaled to fill each layout's zone
- background planes that reconfigure
- an event/quiet rhythm, so the signature punctuates instead of becoming a tic
- a landing composition for each section's last phrase

Before calling a style done, render a text-only story of 6+ sections and watch
it at speed. See the layout engine in [examples/steel/](./examples/steel/).

## Step 2 — Route to an engine

Priority: **explicit user choice → inference → ask**.

| Engine | Playbook | When | Requires |
|---|---|---|---|
| After Effects | [ae.md](./ae.md) | Production default on main; template-driven motion, designer-familiar output | AE running + CucoStudio CEP extension connected (for import + render) |
| WebGFX | [webgfx.md](./webgfx.md) | Typographic / print / flat-graphic / kinetic-caption registers; fully offline renders | Branch `feat/webgfx-fable` (engine not yet on main) |
| Blender | [blender.md](./blender.md) | True 3D: depth, lighting, materials, camera moves | Branch `feat/blendergfx` (engine not yet on main) |

Inference hints: 3D/depth/camera language in the reference → Blender;
flat/graphic/typographic → WebGFX or AE; if the render must run today on a
user's machine → AE. When genuinely ambiguous, ask.

Read the chosen playbook fully before building. Each playbook contains the
engine's contract, craft techniques, and its own verification loop.

## Step 3 — The shared finish line (every engine)

A style is DONE when all of these hold — never stop at "files exist":

1. **Visually verified**: you rendered frames at enter / mid / exit moments
   for every shot and LOOKED at them (each playbook says how). Two nearby
   enter frames must differ — motion must be real. Iterate at least twice.
2. **Trinity does visible work**: form / flow / pressure each change the
   output (see `designers-docs` trinity concept: flow = static↔kinetic,
   form = structural↔abstract, pressure = low↔high entropy).
3. **Imported into CucoStudio**: `cuco --json style create --name "Name"
   --folder-path <abs path>` (backend must be running — port from
   `jq -r '.ports.fastapi' ~/Library/Application\ Support/CucoStudio/config/app_config.json`).
   Verify the response's engine/metadata.
4. **Smoke-rendered E2E** through a real arrangement (3-section storyboard:
   text+media / text-only / media-only; use the cuco-studio skill). Silent
   styles (no voice) render fastest; a `voice_sample.wav` dropped in the
   style folder later adds a cloned narration voice — never invent another
   voice mechanism.
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
6. **Style folder is CLEAN** — the delivered folder (`~/style-dev/{name}/`)
   contains ONLY what the app and the designer use: exactly one `.aep` (or
   the engine's template) at root, `manifest.json`, `poster.gif`, optional
   `voice_sample.wav`. The designer iterates at the After Effects level —
   never leave BRAND.md, builder/verify scripts, or extraction JSONs there.
   Those are your working files: they live in your working dir
   (`~/styles/{brand}/`) during the build and are disposable after. Fold
   durable LESSONS into this skill's playbooks instead; if the build proved
   a new technique end-to-end, save its BRAND.md + builder script under
   [examples/](./examples/) (see `examples/hermes-cobalt/` — a complete
   worked example: rendered-page extraction → BRAND.md → builder →
   verification).
