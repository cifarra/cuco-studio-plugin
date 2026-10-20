# WebGFX Style Playbook

> **Engine availability**: the WebGFX engine lives on branch
> `feat/webgfx-fable` (not yet merged to main). Building/verifying a web
> style requires that branch checked out (the harness imports
> `cuco_core.engine.render.webgfx.capture`). Design context and routing come
> from SKILL.md; this file is the engine contract + techniques.

Reference examples live in `webgfx-styles/` — nine first-party styles, each a
different register. Full designer docs: `designers-docs/content/webgfx/`
(anatomy, runtime API). This skill is the operational playbook distilled from
building all nine.

 — Scaffold

```
webgfx-styles/{slug}/
├── style.json
├── assets/            # optional shared JS/textures
└── shots/{shotName}/shot.html + shot.css [+ shot.js]
```

`style.json` (omit `voice_id` unless told otherwise — silent style; a
`voice_sample.wav` dropped in the folder later adds a cloned voice):

```json
{
  "schema_version": 1, "engine": "web", "name": "Display Name",
  "fps": 30, "resolution": [1080, 1920], "aspect_ratio": "vertical",
  "color_palette": ["#field", "#ink", "#accent"],
  "fonts": ["Helvetica Neue"],
  "shot_list": [
    {"shotName": "a", "chars": 80,  "frame": [1080, 1920], "text": "sample"},
    {"shotName": "b", "chars": 120, "frame": null,          "text": "sample"},
    {"shotName": "c", "chars": null, "frame": [900, 1100],  "text": null}
  ]
}
```

**Always ship the full hand**: one text+media shot, one text-only
(`frame: null`), one media-only (`chars: null`) — the caster needs all three
for arbitrary stories. `chars` = honest per-moment text capacity (long texts
auto-split). Spoken sections are never cast to `chars: null` shots (engine
guarantee). Resolution cap: 4320/axis. Shot root must be EXACTLY the
resolution; size `html, body` too and `overflow: hidden` everything.

## Step 2 — The contract (memorize)

Elements: `[data-cuco="shot"]` root · `[data-cuco="text"]` text slot —
**its PARENT defines the fit box, give the parent a definite size**; attrs
`data-cuco-fit-max/min` bound the auto font fit · `[data-cuco="media"]` media
slot — an `<img>` (object-fit: cover) is injected; style/clip it freely.

CSS vars, updated every frame on `:root`:
- `--t` local seconds · `--tn` 0..1 section progress
- `--enter` / `--exit` 0..1 transition envelopes · `--presence` = enter·(1−exit)
- `--form --flow --pressure` 0..1 — the trinity. **Each must do visible work**:
  flow = amount/speed of movement, form = graphic complexity/intensity,
  pressure = density/entropy. A style that ignores them renders every
  arrangement identically.
- `--palette-0/1/2` + aliases `--color-bg/--color-fg/--color-accent`

Per word (`.cuco-word` spans injected into the text slot): `--wi` index,
`--wn` count, `--wp` 0..1 progress through the spoken window, `--wr` 0|1
revealed; classes `.is-revealed`, `.is-active` (being spoken NOW).

CSS `@keyframes` are deterministic (the runtime pauses and seeks them —
always `animation-fill-mode: both`). **CSS transitions are disabled** — never
rely on them. `Math.random`/`Date.now` are frozen; use `cuco.rand(i)` for
stable per-element variation.

JS hook: `cuco.onSeek(s => …)` with
`{t, tn, enter, exit, presence, form, flow, pressure, palette, words,
wordCount, activeWordIndex, resolution, fps, seed}` and helpers
`cuco.ease.{outCubic,outExpo,outBack,outElastic,inOutCubic,inQuad,…}`,
`cuco.lerp/clamp/map`, `cuco.rand(i)`.

Hard rules: pure function of `(t, drivers)` — no wall clock, no rAF loops.
Fully offline — no CDN, no web fonts (data: URIs are fine and DO work for
SVG grain). Write `var(--enter, 1)`-style fallbacks everywhere so shots
compose when opened directly in a browser. **A pageerror during template load
FAILS the whole render** — shot.js must be error-free and guarded.

## Step 3 — Craft techniques (learned the hard way)

- **Word reveal idiom**: `--atk: min(calc(var(--wp) * 2.5), 1)` gives a fast
  attack (word completes its motion in the first ~40% of its spoken window).
  Compose opacity/transform from `--wr` × `--atk`. Give `.is-active` a
  precise treatment: accent fill, inverted block (`background: ink; color:
  paper` with padding/negative-margin canceling so no reflow), or a marker
  bar (`.cuco-word.is-active { background: accent }` — it jumps for free).
- **CSS can't ease custom properties.** For eased/springy motion, set
  pre-eased vars in onSeek (`el.style.setProperty('--ein',
  cuco.ease.outBack(s.enter))`) and compose transforms from them in CSS —
  or set transforms directly in JS.
- **Big drop-ins**: naive `outBack` over hundreds of px slams past rest.
  Split into a fast fall (`outExpo`) plus a SMALL overshoot component.
- **Stepped/stamped motion**: quantize progress —
  `qz = x => Math.floor(x * steps) / steps` — and make the FIRST step land
  immediately (`Math.ceil` variant) so the first captured frame isn't empty.
- **`mix-blend-mode` + transforms**: a transformed wrapper creates a stacking
  context that ISOLATES blending. Put blend and transform on the SAME element,
  inside an `isolation: isolate` container. (This is the overprint/duotone
  trap.)
- **Duotone recipe**: paper bg → grayscale img with `multiply` → ink-colored
  layer with `lighten`, inside `isolation: isolate`. Drive contrast from
  `--form`.
- **`clip-path` clips `box-shadow`** — use `filter: drop-shadow(…)` on a
  wrapper instead (torn-paper/organic shapes).
- **Imperfection**: per-element tilts/offsets from `cuco.rand(i)` (indexed →
  stable across frames, varies per arrangement via the seed).
- **Grain**: inline SVG `feTurbulence` data-URI background + `mix-blend-mode:
  overlay/multiply`; drift it with a seeked `steps()` @keyframes.
- **Canvas particle fields**: NEVER draw glow with per-path `shadowBlur`
  every frame (~40× slowdown) — pre-render glow sprites once per
  (size-bucket, color) and `drawImage` blit. See
  `webgfx-styles/lumen-swarm/assets/swarm.js` for the pattern.
- **Class-triggered CSS animations** (e.g. on `.is-revealed`) show their END
  state — the runtime seeks all animations to section-local time. Per-word
  motion must come from `--wp`/`--wr` math, not animation-on-class-add.
- **Enter/exit are choreography**, not just fades: slide, rotate, eclipse,
  converge, retract — and make exit a deliberate departure (bookending the
  enter reads beautifully). The engine guarantees exits never overlap
  narration, so fading on exit is safe.

## Step 4 — Verify (NON-NEGOTIABLE, ≥2 look-and-refine rounds)

Copy `harness.py` from this skill's directory, edit STYLE/shots/palette/
resolution, then:

```bash
cd cuco-core && poetry run python /tmp/{slug}-check/check.py
```

READ the captured JPGs (view them — you can) and judge five moments per shot:
- `0.2 / 0.45` — enter mid-flight: is something clearly, tastefully moving?
  Compare the two frames: they must DIFFER (motion is real, not a fade).
- `1.2 / 2.4` — settled: composition balanced? type confident (be ~30% bolder
  than feels safe)? accent disciplined? media graded into the system?
- `3.7` — exit departing with intent?

`console errors: []` is mandatory. First drafts are never shipped — the
common failures are: type too small, motion only on opacity, accent
everywhere, media untouched, trinity ignored.
