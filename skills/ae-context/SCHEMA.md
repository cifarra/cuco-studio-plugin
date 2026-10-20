# aectx dump schema `aectx/2`

Written by `jsx/extract.jsx` (`aectx extract`) to `~/.cache/aectx/dumps/<sha1(path)[:16]>.json`.
`~/.cache/aectx/dumps/latest.json` points to the most recent extraction.
Fixtures: `tests/fixtures/steel.json.gz` (style template, 6 shots) and `tests/fixtures/arr746.json.gz` (a director-built CucoStudio arrangement, 7 text-only sections).

```
{
  "schema": "aectx/2",
  "meta": {
    "name", "path", "dirty", "aeVersion", "bitsPerChannel", "expressionEngine",
    "at": 0,            // time (s) at which every "v" was read — deterministic, not AE's playhead
    "post": false,      // true when "vPost" (post-expression values) were recorded
    "comps": null,      // regex if extraction was scoped (non-matching comps have "skipped": true, no layers)
    "nonce",
    "stats": {"items","layers","props","propErrors","exprs","exprErrors","layerErrors","ms"},
    "errors": [{"comp","layer","index","error","line"} | {"item","error","line"}],   // extraction failures (stubs remain in items)
    "warnings": [str]
  },
  "fonts": [{"postScriptName","family","style","substitute": bool,"uses": int}],   // app.project.usedFonts
  "items": [ Item ... ]
}
```

## Item
Common: `id`, `name`, `type` (`folder|comp|footage|solid|placeholder|unknown`), `folder` (parent folder item id, `null` = project root), optional `comment`.
An item that failed to extract is `{id, name, error, folder?, type?}` (folder/type best effort).

- **folder**: nothing else.
- **comp**: `width`, `height`, `duration`, `fps`, optional `pixelAspect`, `bg` (hex), `time` (AE playhead at extraction — informative only), `workArea` [start, dur], optional `motionBlur` {shutterAngle, shutterPhase}, optional `frameBlending`, `renderer`, `numLayers`, optional `markers`, `layers` [Layer], optional `skipped`.
- **footage**: `width`, `height`, `duration`, `fps`, `file`, optional `missing: true`, `still`, `hasVideo`, `hasAudio`, `alpha` (AlphaMode name), optional `premul` (hex), optional `conformFps`.
- **solid**: `width`, `height`, `color` (hex).

## Layer
```
{ "index", "id", "name",
  "type": "precomp|footage|solid|text|shape|null|adjustment|camera|light",
  "source": {"id","name"} | absent,
  "enabled": bool,                    // video switch (nulls/track mattes are normally false — not "broken")
  optional flags: "audioOff","solo","shy","locked","threeD","collapse","adjustment","guide","motionBlur","timeRemap",
  optional "quality" (when not BEST), "label" (always present; 0 = none),
  "in","out","start", optional "stretch",
  optional "parent": {"index","name","id"},
  optional "blend": BlendingMode name (absent = NORMAL),
  optional "matte": {"type": "ALPHA|ALPHA_INVERTED|LUMA|LUMA_INVERTED", "layer": {"index","name","id"}},
  optional "isMatte": true,          // this layer is used as someone's track matte
  optional "effects": [{"name","mn","on"}],
  optional "masks": [{"name","mode","inverted"?}],
  optional "markers": [{"t","comment","dur"?, "chapter"?}],
  "props": [Prop],
  // a layer that failed: {"index","name","error"}
}
```

## Prop
One record per leaf property that has an expression (enabled OR disabled), keyframes, or `isModified` (untouched defaults are omitted).
```
{ "path": "Effects/lock glint/Center",        // display-name path from the layer ('/'-joined)
  "mn":   "ADBE Effect Parade/CC Light Sweep/CC Light Sweep-0001",   // matchName path
  "v":    value at meta.at, PRE-expression,
  "k":    [[t, value, "LINEAR"|"HOLD"?], ...]  // keyframes WITH values (ease detail omitted)
  "x":    "expression source",                // present when the property has an expression
  "xOn":  false,                              // present only when the expression is DISABLED
  "xErr": "error text",                       // present when AE reports an expression error (after forcing one evaluation)
  "vPost": value                              // only with extract --post
}
```
A property that could not be read is `{path, mn, error}` (counted in `meta.stats.propErrors`); a value that
could not be read is `{"error": "..."}`. Unreadable effect/marker entries are `{index, error}`.

Value encodings: numbers (rounded 4dp; NaN/Infinity → null), arrays, strings, booleans;
TextDocument → `{text, size, font, family, style, caps, leading ("auto"|num), tracking, justify, fill (hex|null), stroke, box, lines}`
(Source Text **keyframes** carry only `{text, size}`);
Shape (mask/shape paths) → `{closed, v: [[x,y]...], in?, out?}` (tangents only when non-zero);
anything else → `{"valueType": "custom"}`.

AE quirk (verified on AE 2025.6): when Source Text has an enabled expression, `valueAtTime(t, true)`,
`.value` and `keyValue(k)` ALL return the expression-transformed text (raw "gamma delta" with expression
`String(value).toUpperCase()+"!"` reads back as "GAMMA DELTA!"). The raw source text is not recoverable from
scripting while the expression is on — treat Source Text `v`/`k` as rendered text.

## CucoStudio conventions you will see
- Style template: `mainComp` with layer `mainControl` (effects FORM/FLOW/PRESSURE sliders, then colors "1","2","3");
  folder `ORIGINAL_SHOTS` (shot comps), `PRECOMPS` (or `ORIGINAL_TARGETS`) holding `{shot}-text` / `{shot}-frame` comps;
  each shot has a `controller` null with `enter`/`exit` sliders; the text comp has a layer `textBlock`.
- Director arrangement (render project): folders `PROJECT_SHOTS` / `PROJECT_TARGETS`; shot instances named `{shot}-{sectionIndex}`
  (e.g. `01-3`) sequenced in `mainComp`; text comps `{shot}-{i}-text` whose textBlock Source Text is keyframed per phrase
  and whose comp markers are the director's progress markers ("0".."100" per phrase).
