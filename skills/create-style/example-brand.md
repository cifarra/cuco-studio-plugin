# BRAND.md: the expected shape

One file in your working folder (`~/styles/{brand}/BRAND.md`), in two parts. The
**brief** records what you learned (Step 1: context). The **world** records what you
invented (Step 2: design). Keep them separate: the brief is evidence, the world is a
decision. A brief can come from a URL, from a handful of images, or from a sentence of
prompt. Fill what the input gives you and write the rest yourself.

Worked example: Doyouplay, from its website.

---

# Doyouplay

## Brief (context)

**What it is.** A tennis matchmaking app: find partners and open courts in your city.

**Audience & voice.** Urban amateur players, 25–40. Friendly, energetic, a bit
cheeky ("Do you play?"); community over competition.

**Palette (60/30/10)**, from rendered pixels:

| Role | Hex | Evidence |
|---|---|---|
| Dominant | `#F5F0E2` warm cream | page field, ~60% of pixels |
| Secondary | `#3B82F6` vivid blue | headings, CTAs |
| Accent | `#4ADE80` tennis-ball green | the ball, one highlight per section |

**Type character.**
- Display: Bungee (blocky, signage-like, all caps)
- Body: Onest (friendly grotesque)
- Mono: Kode Mono, used for court numbers and times

**Image language.** This is the part that matters for video.
- Painterly gouache illustrations: flat opaque colour, visible dry-brush edges,
  sketchy black contour lines that don't quite close.
- Subjects: courts seen from above, balls, rackets, city landmarks (Golden Gate, NYC
  skyline) in the same hand.
- Warm, slightly overexposed light. Off-white paper shows through thin paint.

**Owned visuals.** The green ball mascot with black seam strokes, and the Bungee
wordmark.

**Left on the site.** These are interface, not identity:
- rounded cards, `rotate-1..3deg` tilts on cards
- pill buttons, app-store badges
- the scroll fade-ins

**Assets** (`assets/images/`): `opengraph-image.jpg`, `hero-courts.png`,
`hero-ball-man.png`, `court.png`, `rackets.png`, `sf-city.png`, `nyc-skyline.png`.

## World (design)

**Material + process.** Gouache on cold-press paper, painted while you watch. Every
frame is a painting in progress: court lines laid down with a dry brush, colour
fields blocked in, the black contour drawn last.

**Empty frame.** Cream paper with fibre, last section's paint drying at the edges,
and a court line half-painted across the frame.

**Signature verb: PAINT.**
- Shapes and type are painted in: Scribble/Write-on strokes inside masks, with Brush
  Strokes texture on the fills.
- The whole world boils at 12 fps.
- The ball is the one thing that moves physically: it bounces once per section,
  leaves a scuff on the paper, and the scuff stays.

**Type in the world.** Bungee painted as court-line paint: white or blue dry-brush
caps, painted stroke by stroke, with Roughen Edges and a slight boil. Onest for
supporting lines, painted flat.

**Palette use.**
- Cream is the paper and blue is the paint.
- Green is spent only on the ball and its scuff marks.
- Darker blue and paper shadow come from blue × cream in expressions.

**Media becomes material.** Photos get posterized toward a few flat tones (Cartoon +
Levels), get Brush Strokes, and are multiplied onto the paper. A black contour pass
(Find Edges → Levels → boil) draws over them.

**Trinity.**
- FORM: from loose sketch (contours only) to finished painting (all fields blocked
  in).
- FLOW: boil rate, 6 → 12 fps, plus how far the painting hand travels.
- PRESSURE: how messy the brush is: stroke spill past the lines, paint spatter,
  misaligned contours.

**Canvas.** 1080×1920 at 30 fps.

**Material plates.** A Comfy/Krea2 cold-press paper texture (neutral, tileable),
three LTX loops of gouache brush strokes on white (MULTIPLY maps for the paint-in),
and one paint-spatter still.
