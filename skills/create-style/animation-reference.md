# Animation & Design Techniques for CucoStudio Styles

Practical reference for building professional motion graphics via ExtendScript.

---

## Timing & Easing

### Professional vs Amateur
The single biggest differentiator is **aggressive, intentional easing**. Default Easy Ease (33% influence) looks amateur. Professional motion uses 70-85% influence with asymmetric curves.

### Timing Reference (at 30fps)
| Action | Frames | Duration |
|---|---|---|
| Snappy entrance | 8-10 | ~270-330ms |
| Standard entrance | 10-15 | ~330-500ms |
| Smooth transition | 15-22 | ~500-730ms |
| Dramatic reveal | 30-60 | 1-2s |

**Rule**: Exits should be 20-30% faster than entrances.

### KeyframeEase Values for ExtendScript
```javascript
// Snappy (easeOutCubic feel): high influence on incoming
new KeyframeEase(0, 80)   // incoming: speed 0, influence 80%

// Standard ease
new KeyframeEase(0.5, 75)

// Aggressive pop
new KeyframeEase(0, 90)
```

---

## Key Expressions

### Overshoot (apply to any keyframed property)
```javascript
var freq = 3;    // oscillations/sec (2=heavy, 4=tight, 6=jelly)
var decay = 5;   // settle speed (3=slow, 5=standard, 8=quick)
var n = 0;
if (numKeys > 0) {
  n = nearestKey(time).index;
  if (key(n).time > time) n--;
}
if (n > 0) {
  var t = time - key(n).time;
  var amp = velocityAtTime(key(n).time - 0.001);
  var w = freq * Math.PI * 2;
  value + amp * (Math.sin(t * w) / Math.exp(decay * t) / w);
} else {
  value;
}
```

### Bounce (physics-based)
```javascript
var e = 0.7;       // elasticity (0.5=heavy, 0.7=standard, 0.85=super bouncy)
var g = 5000;      // gravity
var nMax = 9;
var n = 0;
if (numKeys > 0) {
  n = nearestKey(time).index;
  if (key(n).time > time) n--;
}
if (n > 0) {
  var t = time - key(n).time;
  var v = -velocityAtTime(key(n).time - .001) * e;
  var vl = length(v);
  var vu = (value instanceof Array) ? ((vl > 0) ? normalize(v) : [0,0,0]) : ((v < 0) ? -1 : 1);
  var tCur = 0; var segDur = 2*vl/g; var tNext = segDur; var nb = 1;
  while (tNext < t && nb <= nMax) { vl *= e; segDur *= e; tCur = tNext; tNext += segDur; nb++; }
  if (nb <= nMax) { var delta = t - tCur; value + vu * delta * (vl - g * delta / 2); }
  else { value; }
} else { value; }
```

### Wiggle
```javascript
wiggle(3, 15)                    // 3 freq, 15 amplitude
var w = wiggle(3, 15);           // Y-only wiggle for position:
[value[0], w[1]]
```

### Autofade (in/out at layer boundaries)
```javascript
var transition = 20; // frames
var tSecs = transition * thisComp.frameDuration;
linear(time, inPoint, inPoint + tSecs, 0, 100) - linear(time, outPoint - tSecs, outPoint, 0, 100)
```

### Oscillation / Breathing
```javascript
var amp = 5; var freq = 1; var base = 100;
var s = base + amp * Math.sin(time * freq * 2 * Math.PI);
[s, s]
```

---

## Text Animators via ExtendScript

### Hierarchy
```
textLayer > "ADBE Text Properties" > "ADBE Text Animators"
  > "ADBE Text Animator" (add via addProperty)
    > "ADBE Text Selectors" > "ADBE Text Selector" (Range Selector)
    > "ADBE Text Animator Properties" > individual properties
```

### Animator Property matchNames
| matchName | Property |
|---|---|
| `ADBE Text Opacity` | Opacity |
| `ADBE Text Position 3D` | Position |
| `ADBE Text Scale 3D` | Scale |
| `ADBE Text Rotation` | Z Rotation |
| `ADBE Text Blur` | Blur |
| `ADBE Text Fill Color` | Fill Color |
| `ADBE Text Tracking Amount` | Tracking |

### Range Selector Properties
| matchName | Property |
|---|---|
| `ADBE Text Percent Start` | Start (%) |
| `ADBE Text Percent End` | End (%) |
| `ADBE Text Percent Offset` | Offset (%) |

### Typewriter Effect
```javascript
var animators = textLayer.property("ADBE Text Properties").property("ADBE Text Animators");
var anim = animators.addProperty("ADBE Text Animator");
anim.name = "Typewriter";
anim.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity").setValue(0);
var sel = anim.property("ADBE Text Selectors").property(1);
var sEnd = sel.property("ADBE Text Percent End");
sEnd.setValueAtTime(0, 0);
sEnd.setValueAtTime(2, 100);
```

### Blur-In Reveal
```javascript
var anim = animators.addProperty("ADBE Text Animator");
anim.property("ADBE Text Animator Properties").addProperty("ADBE Text Blur").setValue(20);
anim.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity").setValue(0);
var sel = anim.property("ADBE Text Selectors").property(1);
sel.property("ADBE Text Percent Start").setValueAtTime(0, 0);
sel.property("ADBE Text Percent Start").setValueAtTime(1.5, 100);
```

### Scale Pop Per-Character
```javascript
var anim = animators.addProperty("ADBE Text Animator");
anim.property("ADBE Text Animator Properties").addProperty("ADBE Text Scale 3D").setValue([0, 0, 0]);
anim.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity").setValue(0);
var sel = anim.property("ADBE Text Selectors").property(1);
sel.property("ADBE Text Percent Start").setValueAtTime(0, 0);
sel.property("ADBE Text Percent Start").setValueAtTime(1.2, 100);
```

---

## Shape Layers via ExtendScript

### Rounded Rectangle
```javascript
var sl = comp.layers.addShape();
var contents = sl.property("ADBE Root Vectors Group");
var group = contents.addProperty("ADBE Vector Group");
var gc = group.property("ADBE Vectors Group");
var rect = gc.addProperty("ADBE Vector Shape - Rect");
rect.property("ADBE Vector Rect Size").setValue([400, 200]);
rect.property("ADBE Vector Rect Roundness").setValue(20);
var fill = gc.addProperty("ADBE Vector Graphic - Fill");
fill.property("ADBE Vector Fill Color").setValue([0.23, 0.51, 0.96]);
```

### Animated Line Draw-On (Trim Paths)
```javascript
var gc = group.property("ADBE Vectors Group");
var pathG = gc.addProperty("ADBE Vector Shape - Group");
var shape = new Shape();
shape.vertices = [[0, 0], [400, 0]];
shape.closed = false;
pathG.property("ADBE Vector Shape").setValue(shape);
var stroke = gc.addProperty("ADBE Vector Graphic - Stroke");
stroke.property("ADBE Vector Stroke Color").setValue([1, 1, 1]);
stroke.property("ADBE Vector Stroke Width").setValue(4);
var trim = gc.addProperty("ADBE Vector Filter - Trim");
trim.property("ADBE Vector Trim End").setValueAtTime(0, 0);
trim.property("ADBE Vector Trim End").setValueAtTime(1.5, 100);
```

### Expanding Circle
```javascript
var ellipse = gc.addProperty("ADBE Vector Shape - Ellipse");
ellipse.property("ADBE Vector Ellipse Size").setValueAtTime(0, [0, 0]);
ellipse.property("ADBE Vector Ellipse Size").setValueAtTime(1, [600, 600]);
```

---

## Effects via ExtendScript

### Key matchNames
| Effect | matchName |
|---|---|
| Gaussian Blur | `ADBE Gaussian Blur 2` |
| Drop Shadow | `ADBE Drop Shadow` |
| Glow | `ADBE Glo2` |
| Roughen Edges | `ADBE Roughen Edges` |
| Turbulent Displace | `ADBE Turbulent Displace` |
| Linear Wipe | `ADBE Linear Wipe` |
| Radial Wipe | `ADBE Radial Wipe` |
| Gradient Ramp | `ADBE Ramp` |
| Fill | `ADBE Fill` |
| Noise | `ADBE Noise2` |
| Tint | `ADBE Tint` |

### Adding Gaussian Blur
```javascript
var blur = layer.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
blur.property("ADBE Gaussian Blur 2-0001").setValueAtTime(0, 30);  // blurry
blur.property("ADBE Gaussian Blur 2-0001").setValueAtTime(1, 0);   // sharp
```

### Adding Linear Wipe (Reveal)
```javascript
var wipe = layer.property("ADBE Effect Parade").addProperty("ADBE Linear Wipe");
wipe.property("ADBE Linear Wipe-0001").setValueAtTime(0, 100);  // hidden
wipe.property("ADBE Linear Wipe-0001").setValueAtTime(1, 0);    // revealed
wipe.property("ADBE Linear Wipe-0002").setValue(90);              // angle: left-to-right
wipe.property("ADBE Linear Wipe-0003").setValue(50);              // feather
```

### Film Grain (Fractal Noise)
```javascript
var solid = comp.layers.addSolid([0,0,0], "grain", comp.width, comp.height, 1);
var fn = solid.property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
// Contrast: 140, Brightness: -30, Scale: 50%, Complexity: 1
fn.property("ADBE Fractal Noise-0004").setValue(140);
fn.property("ADBE Fractal Noise-0005").setValue(-30);
fn.property("ADBE Fractal Noise-0111").setValue(50);   // Transform > Scale
fn.property("ADBE Fractal Noise-0007").setValue(1);
fn.property("ADBE Fractal Noise-0008").expression = "time * 300";  // Evolution
solid.blendMode = BlendingMode.OVERLAY;
solid.property("Opacity").setValue(10);
```

---

## Vertical Video Layout (1080×1920)

### Safe Zones
| Platform | Top | Bottom | Left | Right |
|---|---|---|---|---|
| IG Reels | 220px | 420px | 60px | 120px |
| TikTok | 150px | 384px | 48px | 192px |
| YouTube Shorts | 288px | 672px | 48px | 192px |
| **Universal safe** | **288px** | **672px** | **64px** | **192px** |

### Typography Scale
| Role | Size |
|---|---|
| Display/hero | 72-120px |
| Headline | 48-72px |
| Subhead | 32-48px |
| Body | 24-32px |
| Caption | 18-24px |

### Spacing (8px grid)
- Micro (related elements): 8-16px
- Small (between text blocks): 24-32px
- Medium (between sections): 48-64px
- Large (margins): 80-128px

---

## Texture Stack Order (bottom to top)
1. Background (gradient, solid, footage)
2. Content layers (text, graphics, media)
3. Vignette — Multiply, 20-35% opacity
4. Film grain — Overlay/Soft Light, 8-15% opacity
5. Scan lines — Multiply, 5-12% opacity (optional)

---

## Stagger Timing
| Delay | Feel | Use |
|---|---|---|
| 2-3 frames | Almost simultaneous | Particles, large groups |
| 3-5 frames | Quick cascade | List items, cards |
| 5-7 frames | Comfortable | Nav items, features |
| 8-12 frames | Deliberate | Hero sections |

**Golden rule**: Stagger delay = 20-40% of individual animation duration.

---

## Animation Recipes

### Standard Entrance
1. Duration: 10-15 frames
2. Easing: easeOutCubic
3. Stagger: 3-5 frames between elements
4. Optional overshoot: 5-10% past target
5. Motion blur on

### Bouncy/Playful Entrance
1. Duration: 12-18 frames
2. Scale from 0% to 110% (overshoot) to 100%
3. Or use overshoot expression (freq=3, decay=5)
4. Slight rotation during scale (-3° to 0°)

### Text Reveal
1. Typewriter: Range Selector End 0→100 over 1-2s
2. Blur-in: Blur 20→0 + Opacity 0→100, per character
3. Scale pop: Scale 0→100 + Opacity 0→100, per character
4. Wipe: Linear Wipe 100→0 over 0.5-1s with feather 50px
