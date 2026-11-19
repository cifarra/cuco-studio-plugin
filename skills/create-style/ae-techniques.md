# AE techniques: building a material world

After Effects is a compositor and a renderer. It has light, 3D space, time,
procedural matter, mattes and footage plates. A style built only from solids, text,
gradient ramps and masks uses it as a CSS renderer (see "Slop signatures" in
[SKILL.md](./SKILL.md)). This file holds tested building blocks for the world you
invented in SKILL.md Step 2.

Every technique below is built by the runnable lab
[ae-techniques-lab.jsx](./ae-techniques-lab.jsx), tested in AE 25.6. Run it, render
it, look at it:
```bash
aectx run $CREATE_STYLE/ae-techniques-lab.jsx --args '{"img":"/abs/photo.jpg","vid":"/abs/clip.mp4"}'
aectx frames --comp lab-print --t 0.7,1.2,2.0,3.2,4.5 --sheet     # then Read the sheet
```
The lab reuses an existing `mainComp`. Run it inside your style project to see every
technique in YOUR palette and trinity. `only` rebuilds a subset
(`"only":"soak,print"`), and the LAB folder is rebuilt from scratch on every run.

**How to use this file.** Pick what expresses your world's process: usually ONE
signature technique plus one or two supporting ones. This is a vocabulary to compose
from and push further, not a buffet to sample. The best styles combine techniques in
ways not listed here (for example a print world whose plates soak in, or a glass
world lit on a 3D stage).

## Snippet conventions

All snippets use the lab's helpers:
```javascript
function fx(l, mn) { return l.property("ADBE Effect Parade").addProperty(mn); }
function pp(e, n) { return e.property(e.matchName + "-" + n); }          // pp(gradientWipe, "0001")
function tr(l, mn) { return l.property("ADBE Transform Group").property(mn); }
var TRI = 'var MC = comp("mainComp").layer("mainControl");\n' +
  'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n';
function PAL(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }
var ENV = 'var en = 0, ex = 0;\n' +
  'try { en = thisComp.layer("controller").effect("enter")("Slider").value/100; } catch (e1) {}\n' +
  'try { ex = thisComp.layer("controller").effect("exit")("Slider").value/100; } catch (e2) {}\n';
```
In the lab, text precomps are named `soak-text`, `print-text` and so on. **In a style,
every copy of the text precomp layer must be NAMED `{shot}-text`**: the director
`replaceSource`s each layer with that name, so the front, the ink and a hidden lens
copy all receive the section's text.

## Rules every technique obeys (learned in the lab)

- **Map, bump and gradient layers are hidden layers in the shot comp** (`enabled =
  false`); the effect still reads them. Keep the map's content in its own precomp. The
  director deep-duplicates every non-slot precomp per section, so maps are
  section-local.
- **Layer-reference params are set LAST** (the value is a live layer index; see
  ae.md). This covers Gradient Wipe `-0003`, Displacement Map `-0001`, CC Glass
  `-0002`, Set Matte, Texturize, Camera Lens Blur and Compound Blur.
- **Native effects only**: ADBE, CC and APC match names (list them with
  `app.effects`). Third-party plug-ins (Trapcode, Sapphire, Deep Glow…) won't exist on
  the user's machine.
- **Threshold (`ADBE Threshold2`) rendered pure black in a 16-bpc project.** Use
  Levels with a narrow input range as the hard step (`Input Black 0.03`, `Input White
  0.07`); it works at any bit depth.
- **Displacement on an ADJUSTMENT layer wraps around the buffer of everything below
  it.** A shape layer crossing the frame edge widens that buffer, and "wrap pixels"
  then pulls transparent columns into the frame. Precompose anything that crosses the
  edge: a precomp is clipped to its comp.
- **Motion Tile with a drifting Tile Center leaves a transparent seam** at the layer
  edge. Set Output Width (`ADBE Tile-0004`) to 300.
- **`layers.addCamera(name, [W/2, H/2])` left Position at `[0, 0, -zoom]`**, so the
  camera looked at the centre from the top-left corner and every plane tilted. Set
  Position explicitly. For drift without tilt, use a one-node camera
  (`autoOrient = AutoOrientType.NO_AUTO_ORIENT`).
- **Echo works on the source's time.** Motion must live INSIDE the precomp that Echo
  sits on; a layer's own transform animation isn't echoed. Echo times shorter than a
  frame (`-1/(fps*4)`) sample the precomp between frames, which turns a dotted trail
  into a continuous ribbon.
- **Roughen Edges Scale has a minimum of 10.**
- **Material Options match names**: `ADBE Casts Shadows`, `ADBE Accepts Shadows`,
  `ADBE Accepts Lights`. Light options: `ADBE Light Intensity`, `ADBE Light Cone
  Angle`, `ADBE Light Cone Feather 2`, `ADBE Casts Shadows`, `ADBE Light Shadow
  Darkness`, `ADBE Light Shadow Diffusion`.

---

## 1. Soak · burn · erode: an organic reveal driven by a luminance map

**Worlds:** ink soaking into paper, paper burning, frost spreading, rust, mould,
tide lines, a photo developing.

**Stack:**
- A **map precomp**: radial Ramp (white at the origin, so it reveals first) +
  Fractal Noise in OVERLAY (the fibre).
- In the shot comp:
  - the map as a hidden layer
  - **Gradient Wipe** on every layer the world reveals
  - a **front**: a second copy of the type, in the accent, placed BELOW the ink and
    revealed slightly earlier, so a coloured edge leads the ink

Because both copies share the letters' alpha, the front disappears under the ink once
the reveal completes.

```javascript
// map (its own comp, W×H)
var rp = fx(rampSolid, "ADBE Ramp");
pp(rp, "0001").setValue([cx, cy]); pp(rp, "0002").setValue([1, 1, 1, 1]);      // origin: white = first
pp(rp, "0003").setValue([cx + 900, cy + 700]); pp(rp, "0004").setValue([0, 0, 0, 1]); pp(rp, "0005").setValue(2);
var f = fx(fibreSolid, "ADBE Fractal Noise");                                    // fibreSolid.blendingMode = OVERLAY
pp(f, "0004").expression = TRI + '110 + 140*PRES;';        // contrast → raggedness of the front
pp(f, "0010").expression = TRI + '240 - 150*PRES;';        // scale → fibre size
pp(f, "0023").expression = TRI + 'time*(30 + 160*FLOW);';  // evolution → the front keeps creeping at rest
// on each revealed layer (lag < 0 runs ahead, lag > 0 trails)
var gw = fx(L, "ADBE Gradient Wipe");
pp(gw, "0001").expression = ENV + 'var c = linear(en, 0, 1, 114, -14) + (' + lag + ');\n' +
  'Math.max(0, Math.min(100, Math.max(c, 100*ex)));';      // exit erodes in the same order
pp(gw, "0002").expression = TRI + 'linear(PRES, 0, 1, 14, 4);';   // wet (soft) → dry (hard) edge
pp(gw, "0004").setValue(3);                                       // stretch the map to the layer
pp(gw, "0003").setValue(mapLayer.index);                          // LAST
```

- **Ink takes the paper:** set the ink layer to MULTIPLY over a paper layer with
  fibre noise.
- **Media soaks in too:** inside the frame precomp, Black & White + Levels; on the
  layer, Tint (ink → paper) in MULTIPLY with the same map and a positive lag.

**Trinity:**
- PRESSURE: raggedness and edge hardness
- FLOW: how alive the front is at rest
- FORM: how much fibre the spread carries, from a clean radial to pure organic

**Variants:**
- **burn:** an ember-coloured front, black ink, the origin at a corner
- **tide:** a linear Ramp + Turbulent Displace on the map
- **frost:** Cell Pattern "Crystals" in the map
- **erosion:** run the reveal on the exit only

**Slop vs authored.** CC Burn Film or an "ink transition" preset pack is slop. Authored
means the origin, the spread shape and the fibre scale belong to THIS paper and THIS
story beat. For example, a section's ink starts where the previous section's ended.

## 2. Reeded glass: a Motion Tile sawtooth driving a Displacement Map

**Worlds:** fluted glass partitions, shower glass, lenticular prints, rain on a
window, anything seen through a refracting surface.

**Stack:**
- A **ribs precomp**: a horizontal black→white Ramp + Motion Tile, which makes a
  sawtooth with one tooth per rib.
- In the shot comp:
  - the ribs as a hidden map
  - a second copy of the ribs in SOFT LIGHT at 12–40%: the rib shading that reads as
    glass
  - a **GLASS adjustment layer** carrying Displacement Map (horizontal from
    luminance), masked to the glass panel

```javascript
var mt = fx(ribSolid, "ADBE Tile");
pp(mt, "0002").expression = TRI + 'linear(PRES, 0, 1, 7, 3.2);';   // rib width, % of the layer width
pp(mt, "0004").setValue(300);                                       // over-cover (seam fix)
pp(mt, "0001").expression = TRI + '[thisLayer.width/2 + time*40*FLOW, thisLayer.height/2];';  // ribs drift
var dm = fx(glassAdj, "ADBE Displacement Map");                     // glassAdj.adjustmentLayer = true
pp(dm, "0002").setValue(5);                    // horizontal from Luminance
pp(dm, "0003").expression = TRI + '20 + 90*FORM;';
pp(dm, "0004").setValue(11); pp(dm, "0005").setValue(0);   // vertical: Off
pp(dm, "0006").setValue(2); pp(dm, "0007").setValue(1); pp(dm, "0008").setValue(0);  // stretch map · wrap · no expand
pp(dm, "0001").setValue(ribsLayer.index);      // LAST
```

**Composition is the technique.** Full-frame glass over type kills legibility. In the
lab the glass is a panel (lower half): the type rises from behind it, smeared, into
clear air, while a light keeps moving behind the glass. Something worth refracting
must sit behind the glass: type, media, a light.

**Trinity:**
- FORM: refraction strength
- PRESSURE: rib density
- FLOW: rib drift, and how fast the light behind moves

**Slop vs authored.** A "glass" preset over a gradient blob is slop. Authored means the
glass is a place in the world (a partition, a window), and the story moves through it.

## 3. Glass letters: CC Glass with the type as its bump map

**Worlds:** crystal, ice, resin, wet surfaces, embossed or blind-pressed type.

**Stack:** a plate (media or a textured surface) carries **CC Glass**, whose bump map
is a hidden copy of the type layer (named `{shot}-text`). The letters become lenses
that refract and light the plate behind them.

```javascript
var g = fx(plate, "CC Glass");
pp(g, "0003").setValue(4);                                          // property: alpha
pp(g, "0004").expression = TRI + '6 + 18*(1 - PRES);';              // softness = rounded glass
pp(g, "0005").expression = TRI + ENV + '(10 + 40*FORM)*en*(1 - ex);';   // height: type rises out of the plate
pp(g, "0006").expression = TRI + ENV + '(80 + 220*FORM)*en*(1 - ex);';  // refraction
pp(g, "0009").setValue(70);                                          // light intensity
pp(g, "0002").setValue(hiddenTextLayer.index);                       // LAST
```

Legibility depends on the plate: a busy photo hides the letters. Use a calm, textured
surface, or a slow push on a soft image. When you need plain reading, pair it with a
small visible type layer.

**Trinity:**
- FORM: height + refraction
- PRESSURE: the softness of the glass edges

## 4. Print: halftone screens and misregistered plates

**Worlds:** newsprint, risograph, screen print, letterpress, comics, packaging,
archival reproduction.

**Stack:** one **screen precomp** per ink. Its WHITE is where this ink prints. Inside
it:
- the image: Black & White → Levels → Gaussian Blur (≈ 0.3 × cell, for round
  dots) → Invert
- one dot: a cell-sized solid with a radial Ramp (white centre), repeated past the
  frame by **CC RepeTile** and rotated to the plate's screen angle, in LINEAR BURN
  (dome − lum is positive where this dot is inked)
- an adjustment layer with Levels 0.03 → 0.07, a hard step

In the shot comp: a palette-coloured ink solid in MULTIPLY with that screen as its
LUMA track matte, over paper.

```javascript
var dot = c.layers.addSolid([0, 0, 0], "screen", cell, cell, 1, DUR);       // ONE dot…
var rp = fx(dot, "ADBE Ramp");
pp(rp, "0001").setValue([cell/2, cell/2]); pp(rp, "0002").setValue([1, 1, 1, 1]);
pp(rp, "0003").setValue([cell, cell/2]); pp(rp, "0004").setValue([0, 0, 0, 1]); pp(rp, "0005").setValue(2);
var rt = fx(dot, "CC RepeTile");                                             // …repeated past the frame
pp(rt, "0001").setValue(1500); pp(rt, "0002").setValue(1500); pp(rt, "0003").setValue(1500); pp(rt, "0004").setValue(1500);
tr(dot, "ADBE Position").setValue([W/2, H/2]); tr(dot, "ADBE Rotate Z").setValue(angle);   // 45° ink, 15° accent
dot.blendingMode = BlendingMode.LINEAR_BURN;
var lv = fx(stepAdj, "ADBE Easy Levels2"); pp(lv, "0003").setValue(0.03); pp(lv, "0004").setValue(0.07);
// shot: inkSolid (Fill = PAL(2)), MULTIPLY, inkSolid.setTrackMatte(screenLayer, TrackMatteType.LUMA)
// misregistration: offset each plate's matte layer
tr(screenLayer, "ADBE Position").expression = TRI + ENV + 'var off = (14 + 26*PRES)*k;\n' +
  'add(value, [off + (1 - en)*180*k - ex*220*k, off*0.6]);';   // plates land from opposite sides
```

- Cell 22–30 px reads as print on a phone; under 16 px it reads as noise.
- Type in the same world: Roughen Edges (border 2.5, scale 14) with its Evolution on
  `posterizeTime(8)` reads as ink squeezed onto paper.

**Trinity:**
- PRESSURE: misregistration distance
- FORM: accent plate density, cell size
- FLOW: whether the plates crawl or sit

**Slop vs authored.** A halftone filter over everything is slop. Authored means each
plate is a palette ink with its own screen angle, the plates arrive like a print run,
and the misregistration is the expression.

## 5. Paper stage: 3D layers, a raking light, cast shadows, a camera

**Worlds:** cut paper, pop-up books, shadow boxes, architectural models, signage on
a wall, anything physical with depth.

**Stack:**
- a backdrop that accepts shadows
- cut layers (shapes, the type precomp, media) at small negative z
- a SPOT light from the upper side, raking, that casts soft shadows
- an ambient light at 40% so shadows aren't black
- a one-node camera that drifts

```javascript
function mat3D(l, casts, accepts) {
  l.threeDLayer = true;
  var m = l.property("ADBE Material Options Group");
  m.property("ADBE Casts Shadows").setValue(casts ? 1 : 0);
  m.property("ADBE Accepts Shadows").setValue(accepts ? 1 : 0);
}
var lt = comp.layers.addLight("key", [W/2, H/2]); lt.lightType = LightType.SPOT;
tr(lt, "ADBE Position").expression = TRI + '[-260 + 160*Math.sin(time*0.5)*FLOW, 260, -1000];';
tr(lt, "ADBE Anchor Point").setValue([W/2, H/2, 0]);              // point of interest
var lo = lt.property("ADBE Light Options Group");
lo.property("ADBE Light Intensity").setValue(95); lo.property("ADBE Light Cone Angle").setValue(110);
lo.property("ADBE Light Cone Feather 2").setValue(80); lo.property("ADBE Casts Shadows").setValue(1);
lo.property("ADBE Light Shadow Darkness").expression = TRI + '35 + 35*FORM;';
lo.property("ADBE Light Shadow Diffusion").expression = TRI + '60 - 40*PRES;';
var cam = comp.layers.addCamera("camera", [W/2, H/2]);
var zoom = cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").value;
cam.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
tr(cam, "ADBE Position").setValue([W/2, H/2, -zoom]);              // addCamera left it at [0,0,-zoom]
tr(cam, "ADBE Position").expression = TRI + ENV + 'add(value, [50*Math.sin(time*0.5)*FLOW, -30*FLOW*time, (1 - en)*-500]);';
```

- Make the backdrop large (scale 260%) so the camera never finds its edge.
- Depth is the composition: the type at z −180 casts a soft shadow onto the backdrop,
  and that shadow makes it an object.
- The director doesn't touch layer transforms in shot comps. 3D layers, cameras and
  lights survive section duplication.

**Trinity:**
- FORM: layer depth and shadow darkness
- PRESSURE: shadow hardness
- FLOW: the camera and light drift

**Further:** comps set to the Advanced 3D renderer can extrude text and shapes, take
environment lights, and import glTF/OBJ models (AE 2024+). This is not in the lab yet,
so bench its render cost and run a real CucoStudio render before relying on it.

## 5b. Light and shade on a wall: shadow-only occluders, projected media, words in light

**Worlds:** sun through a window or blinds, a room's light, a projector, stained
glass, light passing through anything.

Proven in the HCD "Afternoon" build ([examples/hcd-afternoon/](./examples/hcd-afternoon/)),
Classic 3D, ~100 ms/frame:
- **Shadow-only objects:** Material Options › Casts Shadows = **2 ("Only")**. The
  layer is invisible but casts. A window is a huge shape with a rectangular hole
  (Merge Paths, Subtract). Jalousie slats are a Repeater of rects in a second
  shadow-only layer parented to it; animate the slat height to open and close.
- **Shadow type:** the `{shot}-text` precomp itself as a shadow-only 3D layer near
  the wall. Moving it in z per phrase (from far to −35) makes the shadow arrive
  larger, offset and blurred, and land sharp. Physical focus.
- **Words in light:** a large black shadow-only solid with **Set Matte** (Take Matte
  From = the hidden `{shot}-text` layer, Use For Matte = alpha, Invert on).
  - "Stretch Matte to Fit" is a **checkbox**: leave it off so the letters keep true
    size.
  - A mask on the same solid (set `mask.maskMode = MaskMode.SUBTRACT`; it is not a
    property) needs "Composite Matte with Original" on, or Set Matte discards it.
- **Projected media:** the `{shot}-frame` layer as shadow-only with **Light
  Transmission 100**. The sun projects the photo onto the wall. Add Levels before it
  for contrast.
- **Exposure maths:** `wall = albedo × (ambient × ambientColour + diffuse × sun ×
  sunColour × cosθ)`.
  - Material **Diffuse defaults to 50%**: set the wall to 100.
  - Sun and shade that read as light: warm key `[1, .78, .40]` at ~64%, navy-tinted
    ambient `[.62, .67, .88]` at ~60%.
  - A grey "sun" means the ambient is out-weighing a too-weak key.
- **Light types:** Parallel lights **hide Shadow Diffusion** (hard shadows only).
  For a soft sun use a POINT light ~6000 px away. Point lights have **no Point of
  Interest**: setting their Anchor Point throws "property is hidden".
- **Aim a shadow:** to land a shadow at wall point T from depth z, with light L at
  rest:
  - place the caster at `L + (T − L)·(z − Lz)/(−Lz)`
  - sweep the light far sideways to move the window patch, since nearer casters move
    less (parallax for free).
- **Captions in shade are invisible:** shadow type only exists where the light falls.
  Keep every text zone inside the sunlit patch at rest.

## 6. Boil: hand-made time

**Worlds:** hand-drawn, cel animation, stop-motion, sketchbooks, children's books,
anything made by a hand rather than a machine.

**Stack:** on type and line work:
- Turbulent Displace (amount 1.5–7.5 px, size 14) with its Evolution on
  `posterizeTime(fps)`
- Roughen Edges with the same cadence

Hand-drawn strokes (shape path + Trim Paths) get Wiggle Paths with Wiggles/Second 0
and the Random Seed stepped by `posterizeTime`.

```javascript
var td = fx(typeLayer, "ADBE Turbulent Displace");
pp(td, "0002").expression = TRI + '1.5 + 6*PRES;'; pp(td, "0003").setValue(14);
pp(td, "0006").expression = TRI + 'posterizeTime(linear(FLOW, 0, 1, 4, 12)); time*400;';   // on 3s → on 1s… 12 fps max
// shape strokes: Wiggle Paths = "ADBE Vector Filter - Roughen"
wp.property("ADBE Vector Roughen Size").setValue(5); wp.property("ADBE Vector Temporal Freq").setValue(0);
wp.property("ADBE Vector Random Seed").expression = 'posterizeTime(8); Math.floor(time*8);';
trim.property("ADBE Vector Trim End").expression = ENV + 'posterizeTime(12); 100*Math.min(1, Math.max(0, (en - 0.4)/0.6))*(1 - ex);';
```

Opacity and position on the same cadence (`posterizeTime(8)` at the top of the
expression) complete the illusion. Smooth 30 fps fades inside a boiling world give it
away.

**Trinity:**
- FLOW: the boil frame rate, from 4 to 12 fps
- PRESSURE: the boil amplitude

The boil is subtle in stills and obvious in motion: judge it from a rendered clip.

## 7. Guilloche: engraved line systems

**Worlds:** banknotes, certificates, security paper, watch dials, finance, legal,
anything that must feel trustworthy and precise.

**Stack:** a stroked ellipse (no fill) + Zig Zag (smooth points, many ridges) + a
Repeater that rotates each copy by 180/N degrees and scales it 99.2%. Two rosettes in
two palette inks, rotating in opposite directions, give the moiré.

```javascript
// inside one shape group: Ellipse → Zig Zag → Stroke → Repeater (re-fetch the group after each addProperty)
zz.property("ADBE Vector Zigzag Size").expression = TRI + ENV + '(10 + 22*FORM)*en;';
zz.property("ADBE Vector Zigzag Detail").setValue(18); zz.property("ADBE Vector Zigzag Points").setValue(2);  // smooth
st.property("ADBE Vector Stroke Width").setValue(1.6);
rep.property("ADBE Vector Repeater Copies").expression = TRI + ENV + 'Math.round((24 + 36*PRES)*en);';
var rt = rep.property("ADBE Vector Repeater Transform");
rt.property("ADBE Vector Repeater Rotation").expression = TRI + '180/(24 + 36*PRES);';
rt.property("ADBE Vector Repeater Position").setValue([0, 0]); rt.property("ADBE Vector Repeater Scale").setValue([99.2, 99.2]);
tr(rosette, "ADBE Rotate Z").expression = TRI + 'time*' + speed + '*6*FLOW;';
```

The enter animates the line system *growing* (copies + amplitude from `en`), not the
layer fading. Related vector modifiers:
- Offset Paths has Copies + Copy Offset in AE 2025, giving contour and topographic
  rings from any path
- Pucker & Bloat, Twist, Merge Paths, Wiggle Transform

**Trinity:**
- PRESSURE: copy density
- FORM: wave amplitude
- FLOW: counter-rotation (the moiré)

## 8. Long exposure: light painting with Echo

**Worlds:** night traffic, logistics, motion, sparklers, data in transit, time passing.

**Stack:** the light's motion lives INSIDE a precomp, a small bright shape on a path.
On the precomp layer: **Echo** with a sub-frame echo time, many echoes, slow decay,
operator Maximum.

```javascript
var e = fx(lightPrecompLayer, "ADBE Echo");
pp(e, "0001").setValue(-1 / (fps * 4));                     // sub-frame: continuous ribbon
pp(e, "0002").expression = TRI + 'Math.round(60 + 140*FORM);';   // trail length
pp(e, "0003").setValue(1);
pp(e, "0004").expression = TRI + '0.975 + 0.02*FORM;';      // decay
pp(e, "0005").setValue(2);                                  // Maximum (Screen / Add for hotter light)
```

The light's path can be authored: the brand mark's outline, a route, the type's own
baseline, the shape of a gesture. Glow is optional and goes on the trail, never on
everything.

**Trinity:**
- FORM: trail length
- FLOW: light speed

## 9. Plate-driven reveal: footage as the map

**Worlds:** any world whose material exists as footage (ink in water, smoke, clouds,
film burns, light leaks, fabric, a generated loop) driving the type's appearance.

**Stack:**
- import the clip into `{style}/footage/`
- add it as a hidden layer; when it's shorter than the comp, time-remap it with
  `loopOut("pingpong")`
- make it the Gradient Wipe map of the type: the type appears in the order of the
  footage's luminance
- a second, visible copy in Black & White + MULTIPLY at 10–40% puts the material on
  the paper

```javascript
var v = app.project.importFile(new ImportOptions(new File(clipPath)));
var vL = shot.layers.add(v); vL.enabled = false; vL.audioEnabled = false;
if (v.duration < shot.duration) { vL.timeRemapEnabled = true; vL.property("ADBE Time Remapping").expression = 'loopOut("pingpong");'; }
var gw = fx(typeLayer, "ADBE Gradient Wipe");
pp(gw, "0001").expression = ENV + 'Math.max(100*(1 - en), 100*ex);';
pp(gw, "0002").expression = TRI + 'linear(PRES, 0, 1, 25, 6);';
pp(gw, "0004").setValue(3);
pp(gw, "0003").setValue(vL.index);   // LAST
```

This is the bridge to generated material: a Comfy/LTX ink bloom, a Blender
smoke render or a lupa texture becomes the map, matte or light of the world. See
"Generated plates" below.

## 10. Flatten media into the palette: a cut-out print of the photo

**Worlds:** flat-colour graphic worlds (cut paper, screen print, stickers, poster
art), where a raw photo would break the register.

**Stack, on the `{shot}-frame` LAYER** (the director swaps the source and keeps the
layer's effects):
- `ADBE PS Median` 3
- `ADBE Cartoonify`: Render 3, Detail Radius 10, Threshold 20, Shading Steps 5,
  Smoothness 10, Edge Threshold 1.8, Width 3, Softness 10. This gives flat areas
  with ink contours.
- `ADBE Black&White`, Levels 0.06 → 0.9
- `ADBE Posterize` 5: luminance bands
- `CC Toner` with Tones 3 (pentone): four palette colours, and Shadows linked to
  palette "2" (the ink)

The order matters: Posterize AFTER the toner pushes each RGB channel to extremes
and the colours leave the palette. Map a different tone set per shot so the media
shots don't all look alike. Tested in the Letterpile build
([examples/letterpile/](./examples/letterpile/), `treatMedia()`).

## 11. Per-letter stacking: animators driven by the phrase markers

**Worlds:** any world where type is made of objects (letters, tiles, stamps, blocks)
that land, stack, scatter or lift one by one.

**Stack:** on `textBlock`, text animators carry the "away" pose (Position offset +
Rotation). Each one has an **Expression Selector** (Based On = characters excluding
spaces) whose Amount is:
- 100 before the letter's moment
- an ease-out-back to 0 when it lands (staggered by `textIndex`)
- back up with an ease-in before the next phrase's start marker, and on the shot's
  exit slider (in reverse order)

Two animators with opposite rotations, each picking half the letters by a
deterministic hash, keep the letters from tumbling in lockstep. The phrase window
comes from the text comp's markers (same parser as ae.md). Return 0 on
`__cuco_fit_scratch` so the director measures the rest state (ae.md). See
`selDrop()` / `selScatter()` in [examples/letterpile/](./examples/letterpile/).

## 12. A brand's own system: sheets, mark-shaped windows, written asides

**Worlds:** an existing brand whose identity must survive exactly: flat brand fields,
its photography, its type. The motion is built from the mark instead of an invented
material. All of it is in `hcd3-lib.jsx` in [examples/hcd-smile/](./examples/hcd-smile/);
the shots run at 0.06–0.14 s/frame.

- **A sheet with a speed-bent edge.** A full-frame shape path whose top edge is a
  cubic from `[L, y]` to `[R, y]`, both handles pushed down by `k = 1.333·d`, where
  `d` is the depth at mid-span. Make the depth follow speed:
  `d = min(300, |SHY(t) − SHY(t − 1/60)|·60·G)` with `G ≈ 0.02`. The middle lags
  the sides while the sheet moves and flattens as it lands, like the HCD
  monogram's smile.
  - Use the same edge for the enter (the sheet rises) and the exit (it lifts
    off, its trailing edge smiling).
  - End every exit and start every enter on ONE field colour, and cuts between
    any two shots become invisible.
  - Turn motion blur on for the shape layer; path animation blurs too.
- **A window in the shape of the mark.** Build the logo's construction as a
  closed path (the HCD D: flat top, straight sides, bottom corner radius 0.363·w):
  - Make it a shape-layer **alpha track matte** for the `{shot}-frame` layer, so
    the media can settle (scale 114→100, drop 70 px) inside a fixed window.
  - Intersect (Merge Paths mode 4) the window with a rising "level" path that
    uses the same speed-bent edge: the photo fills the window.
  - Draw the outline as a separate stroke, offset by a gap, with Trim End on the
    enter: down the left side, round the bottom, up the right, top bar last.
- **An italic aside written on.** For the line that changes font (the brand's
  italic), use the line copy's second (intersect) mask: a parallelogram whose
  edge leans like the italic, `s = 0.21·line height`. Give it Mask Feather
  `[46, 0]` and advance it with the spoken fraction (ae.md). Underline it with a
  round-capped open path, a shallow arc `[[x, y], [x + w, y]]` with handles
  `[±0.3w, 0.16w]`, drawn from the phrase's "100" time.
- **A supergraphic of the mark.** The same closed path, 1200–1500 px wide, stroked
  in the field colour mixed ~7% toward the ink, and cropped so the CURVE stays
  in frame. A crop that keeps only the top bar and a side reads as a box corner,
  not the mark.

---

## 13. Light and ink: a photo arrives by its own luminance

**Worlds:** low-key photography that falls into a dark field, or a print on paper.
Built in [examples/salf-29n/](./examples/salf-29n/) (`lumaFx`).

- **Light (dark field).** Extract (`ADBE Extract`, Channel 1 = luminance, Black
  Softness ~80). Sweep the Black Point 255 → rest (~20): the highlights arrive
  first (eyes, teeth, skin). The photo's darks stay transparent, so the field shows
  through them. Exit back to 255: shadows go first, highlights last.
- **Ink (light field).** Sweep the White Point 0 → rest (~226), with White Softness
  ~70. Darks print first, and the highlights become the page.
- Gate opacity for the first frames: at Black Point 255 the softness still passes
  pure whites.
- A rest threshold driven by FORM turns the photo into a high-contrast stencil.
  For PRESSURE, add a random stutter to the threshold during the enter, like a tube
  catching.
- Where the photo stops, a field-colour solid with a feathered mask hides the edge.

---

## Further native vocabulary (not in the lab: verify before relying on it)

Confirm params with an `app.effects` / property walk (see ae-context `aectx q`), and
render frames before building on any of these.

| Family | Effects (match names) | Worlds |
|---|---|---|
| Water light | `APC Caustics`, `APC Wave World` (height map → caustics) | pools, sea, glass, luxury |
| Particles | `CC Particle World` (Texture Layer = a letterform, paper flake, petal), `CC Particle Systems II` | dust, snow, sparks, seeds; never generic bursts |
| Tiles | `APC CardDanceCam` (image re-forming from cards driven by a gradient layer), `APC CardWipeCam` | split-flap boards, mosaics, signage |
| Fracture | `APC Shatter` | glass, ice, breaking news |
| Optics | `ADBE Camera Lens Blur` (Blur Map = depth layer), `ADBE Compound Blur`, `CC Lens`, `CC Light Rays` (light through a stencil), `ADBE Optics Compensation` | focus pulls, peepholes, projectors |
| Distortion | `ADBE Turbulent Displace`, `ADBE Wave Warp`, `CC Blobbylize`, `ADBE SCHMEAR`, `ADBE Polar Coordinates` (bands ↔ rings), `ADBE BEZMESH` | heat, liquid, warp |
| Ink & mattes | `ADBE Simple Choker`, `ADBE Matte Choker` (ink spread), `ADBE Minimax`, blur + Levels "gooey" merges, `ADBE Set Matte3` | ink, metaballs, mercury |
| Marks | `ADBE Scribble Fill` (hatching inside masks), `ADBE Stroke`, `ADBE Write-on`, `ADBE Brush Strokes`, `ADBE Roughen Edges`, `ADBE Texturize` (type pressed into a texture layer) | drawing, engraving, letterpress |
| Time | `ADBE Echo`, `ADBE Time Displacement` (slit-scan from a gradient map), `ADBE Posterize Time`, time remap | slit-scan, stop-motion, memory |
| Colour as process | `APC Colorama` (luminance → cycling palette), `CC Toner`, `ADBE Tritone` | thermal, heat maps, toning baths |
| Real 3D | Advanced 3D renderer (`comp.renderer`): extrusion, environment light, glTF/OBJ import | objects, products, architecture |

## Generated plates: Comfy · Blender · lupa · the user's footage

ExtendScript draws geometry, while generated plates bring matter. Generate
**material**, not illustrations:
- macro ink blooms in water (black on white, top light)
- paper and fabric textures (flat, even light, tileable)
- smoke and fog, caustic light on a white wall
- film burns and light leaks on black
- a single object turning on a seamless background

Guidance:
- **Generate neutral, colour in AE.** Grayscale (or neutral) plates take the palette
  in AE (Tint/Tritone/CC Toner from `mainControl`, blend modes), so palette swaps still
  propagate. A plate rendered in brand colours freezes the palette.
- **Design for compositing:** black-on-white ink plates go MULTIPLY; white-on-black
  light plates go SCREEN or ADD; plates with alpha need `mainSource.alphaMode =
  PREMULTIPLIED` (see ae.md).
- **Loops:** generate 4–10 s and make them loop (`loopOut("pingpong")` on time remap,
  or LTX loops). Image-to-video from a Krea2 still is the fastest route to a living
  texture (comfy skill).
- **Roles a plate can play:** map (Gradient Wipe, Displacement, Time Displacement),
  matte (LUMA track matte), texture (multiply/overlay), light (screen/add), or surface
  (the backdrop of a 3D stage).
- **Ship in `{style}/footage/`.** Absolute paths survive arrangement copies. Keep files
  modest (H.264 or ProRes 422 LT at the canvas size); the folder ships with the style.
- **Bake heavy procedural matter.** When a procedural layer is expensive and doesn't
  depend on the story, render it once to a looping clip in `footage/` and drive the
  clip instead.

## Render cost

Measured with the render queue (`examples/sidecarsun-rise/bench.jsx`) at 8 bpc,
1080×1920, AE 25.6, one lab comp each:

| Technique | ms/frame |
|---|---|
| soak (2 type copies + photo plate) | 30 |
| reeded glass | 29 |
| glass letters | 32 |
| print (2 screens) | 28 |
| paper stage (3D, spot + shadows) | 47 |
| boil | 26 |
| guilloche (2 rosettes, ~60 copies) | 40 |
| long exposure (~130 sub-frame echoes) | 23 |
| plate reveal (1080p clip) | 42 |

The budget is set by CucoStudio's ~21 min `CREATE_AEP` timeout: a 31 s video failed at
1.5–2.4 s/frame (ae.md). Keep a whole shot under ~0.3 s/frame and benchmark the
finished shot comps, not single techniques. At 16 bpc the same comps were 1.0–1.7×
slower; keep 8 bpc unless the world needs smooth gradients. Particles, Caustics, Card
Dance, Camera Lens Blur and stacks of displacements are the usual offenders: bake
them.
