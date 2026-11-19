# Motion mechanics reference (ExtendScript)

How to move things well in AE once you know WHAT moves. This file has no style in
it. The world and its process come from SKILL.md Step 2 and
[ae-techniques.md](./ae-techniques.md). The generic text reveals and texture finishes
that used to live here (typewriter, blur-in, scale pop, wipe, grain + vignette +
scan lines) are mechanics, never a concept: a style built from them is a template
pack.

---

## Timing and easing

The biggest difference between professional and amateur motion is **aggressive,
intentional easing**. Default Easy Ease (33% influence) looks amateur. Use 70–90%
influence with asymmetric curves: fast attack, long settle.

At 30 fps:

| Action | Frames | Duration |
|---|---|---|
| Snap / stamp | 4–8 | 130–270 ms |
| Standard arrival | 10–15 | 330–500 ms |
| Material process (soak, develop, print run) | 20–45 | 0.7–1.5 s |
| Ambient (light drift, rib drift, boil) | continuous | — |

- The director retimes `enter`/`exit` to the section tails (25% of the section
  each). Phrase-level timing comes from the "0".."100" markers (see ae.md).
- Exits run faster than entrances, and only over the last ~40% of the exit slider.

```javascript
new KeyframeEase(0, 80)    // ease-out feel: incoming speed 0, influence 80%
new KeyframeEase(0, 90)    // aggressive settle
// setTemporalEaseAtKey dims: Position 1, Scale 3, 1D 1 (see ae.md)
```

## Expressions

### Overshoot (any keyframed property)
```javascript
var freq = 3;    // oscillations/sec (2 heavy, 4 tight, 6 jelly)
var decay = 5;   // settle speed (3 slow, 5 standard, 8 quick)
var n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
if (n > 0) {
  var t = time - key(n).time;
  var amp = velocityAtTime(key(n).time - 0.001);
  var w = freq * Math.PI * 2;
  value + amp * (Math.sin(t * w) / Math.exp(decay * t) / w);
} else { value; }
```

### Bounce (physics)
```javascript
var e = 0.7, g = 5000, nMax = 9, n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
if (n > 0) {
  var t = time - key(n).time;
  var v = -velocityAtTime(key(n).time - .001) * e;
  var vl = length(v);
  var vu = (value instanceof Array) ? ((vl > 0) ? normalize(v) : [0,0,0]) : ((v < 0) ? -1 : 1);
  var tCur = 0, segDur = 2*vl/g, tNext = segDur, nb = 1;
  while (tNext < t && nb <= nMax) { vl *= e; segDur *= e; tCur = tNext; tNext += segDur; nb++; }
  if (nb <= nMax) { var delta = t - tCur; value + vu * delta * (vl - g * delta / 2); } else { value; }
} else { value; }
```

### Cadence: hand-made time
```javascript
posterizeTime(8);            // first line of an expression: the property updates at 8 fps
time * 400;                  // e.g. a Turbulent Displace / Roughen Edges evolution that boils
```
Every property in a hand-made world should share one cadence. A smooth 30 fps fade
in a boiling world gives it away.

### Wiggle and drift
```javascript
var w = wiggle(3, 15); [value[0], w[1]];                       // Y-only wiggle
value + [0, Math.sin(time * 2) * 20 * FLOW];                    // trinity-scaled drift
```
`wiggle()` and `random()` are salted per layer. Geometry several layers must share
needs the deterministic hash in ae.md.

---

## Text animators (match names)

```
textLayer > "ADBE Text Properties" > "ADBE Text Animators"
  > "ADBE Text Animator" (addProperty)
    > "ADBE Text Selectors" > "ADBE Text Selector" (Range Selector; NOT auto-created: addProperty it)
    > "ADBE Text Animator Properties" > properties below
```

| matchName | Property |
|---|---|
| `ADBE Text Opacity` | Opacity |
| `ADBE Text Position 3D` | Position |
| `ADBE Text Scale 3D` | Scale |
| `ADBE Text Rotation` | Z Rotation |
| `ADBE Text Blur` | Blur (`[h, v]`) |
| `ADBE Text Fill Color` | Fill Color |
| `ADBE Text Tracking Amount` | Tracking |

Range Selector: `ADBE Text Percent Start` / `End` / `Offset`.

The director measures the text at its "100" marker state. Any animator's end state
must be the fully readable rest state (ae.md). Per-word timing comes from the
director's markers (word k of n has marker `round(k/n*100)`), not from a fixed
duration. Text is usually better served by the world's process applied to the whole
text layer (soak, print, glass, boil in ae-techniques.md) than by per-character
animators.

---

## Shape layers (match names)

```javascript
var sl = comp.layers.addShape();
var g = sl.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
var gc = g.property("ADBE Vectors Group");
gc.addProperty("ADBE Vector Shape - Rect");      // "- Ellipse", "- Star", "- Group" (free path: set "ADBE Vector Shape" to a Shape())
// addProperty invalidates sibling refs: re-fetch the group (contents.property(k)) after each add
```

| Kind | matchName | Key props |
|---|---|---|
| Fill / Stroke | `ADBE Vector Graphic - Fill` / `- Stroke` | `ADBE Vector Fill Color`, `ADBE Vector Stroke Width`, `ADBE Vector Stroke Line Cap` |
| Gradient fill | `ADBE Vector Graphic - G-Fill` | |
| Trim Paths | `ADBE Vector Filter - Trim` | `ADBE Vector Trim Start` / `End` / `Offset` |
| Repeater | `ADBE Vector Filter - Repeater` | `ADBE Vector Repeater Copies`, `… Offset`, `ADBE Vector Repeater Transform` > `… Rotation` / `… Scale` / `… Position` / `… Opacity 1` / `… Opacity 2` |
| Zig Zag | `ADBE Vector Filter - Zigzag` | `ADBE Vector Zigzag Size`, `… Detail` (ridges), `… Points` (1 corner, 2 smooth) |
| Wiggle Paths | `ADBE Vector Filter - Roughen` | `ADBE Vector Roughen Size`, `… Detail`, `ADBE Vector Temporal Freq`, `ADBE Vector Random Seed` |
| Offset Paths | `ADBE Vector Filter - Offset` | `ADBE Vector Offset Amount`, `… Copies`, `… Copy Offset` (contour rings) |
| Pucker & Bloat | `ADBE Vector Filter - PB` | `ADBE Vector PuckerBloat Amount` |
| Twist | `ADBE Vector Filter - Twist` | `ADBE Vector Twist Angle`, `… Center` |
| Merge Paths | `ADBE Vector Filter - Merge` | `ADBE Vector Merge Type` |
| Wiggle Transform | `ADBE Vector Filter - Wiggler` | `ADBE Vector Xform Temporal Freq`, `ADBE Vector Wiggler Transform` |
| Round Corners | `ADBE Vector Filter - RC` | `ADBE Vector RoundCorner Radius` |

For illustrated vector work (characters, marks, ornaments), use the sibling skill
`ae-shape-animation`.

---

## Effects: finding match names and params

Never guess parameter indices: list them. The Fractal Noise snippet that used to sit
here set "Evolution" on `-0008`, which is Rotation; Evolution is `-0023`.
```javascript
// every installed effect (category | display name | matchName)
var e = app.effects; for (var i = 0; i < e.length; i++) $.writeln(e[i].category + " | " + e[i].displayName + " | " + e[i].matchName);
// params of one effect: add it to a scratch solid and walk e.property(i).matchName / .name
```
Run them through `aectx q`. Parameter dumps for the effects used in the technique
library (Fractal Noise, Turbulent Displace, Gradient Wipe, Displacement Map, Motion
Tile, Levels, Roughen Edges, Echo, CC Glass, CC RepeTile, Card Dance, CC Particle
World…) are written into [ae-techniques.md](./ae-techniques.md) and its lab.

Frequently used (verified in AE 25.6):

| Effect | matchName | Params |
|---|---|---|
| Fractal Noise | `ADBE Fractal Noise` | `-0004` Contrast, `-0005` Brightness, `-0010` Scale, `-0015` Complexity, `-0023` Evolution, `-0029` Opacity, `-0030` Blending Mode |
| Gradient Ramp | `ADBE Ramp` | `-0001` Start, `-0002` Start Color, `-0003` End, `-0004` End Color, `-0005` Shape (2 = radial), `-0006` Scatter |
| Gaussian Blur | `ADBE Gaussian Blur 2` | `-0001` Blurriness, `-0003` Repeat Edge Pixels |
| Levels | `ADBE Easy Levels2` | `-0003` Input Black, `-0004` Input White, `-0005` Gamma (0..1 floats) |
| Tint | `ADBE Tint` | `-0001` Map Black To, `-0002` Map White To, `-0003` Amount |
| Fill | `ADBE Fill` | `-0002` Color (RGBA) |
| Transform | `ADBE Geometry2` | `-0003` Scale |
| Directional Blur | `ADBE Motion Blur` | `-0001` Direction, `-0002` Length |

---

## Vertical video (1080×1920)

### Safe zones
| Platform | Top | Bottom | Left | Right |
|---|---|---|---|---|
| IG Reels | 220px | 420px | 60px | 120px |
| TikTok | 150px | 384px | 48px | 192px |
| YouTube Shorts | 288px | 672px | 48px | 192px |
| **Universal safe** | **288px** | **672px** | **64px** | **192px** |

Keep captions and subtitles above the bottom ~400 px. The world itself (material,
light, plates) should run full-bleed; only text needs the safe zone.

### Type at video scale
Video type is read in a second from a phone at arm's length.

| Role | Size on 1080×1920 |
|---|---|
| Monumental / landing | 260–420 px |
| Statement | 140–240 px |
| Supporting line | 64–110 px |
| Furniture / labels | ≥ 24 px (20 px tracked caps reads as ~7 pt) |

The director binary-searches the font size to fit the text comp, so these are design
intents for sample text and zone sizes, not fixed values.
