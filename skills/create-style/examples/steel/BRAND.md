# STEEL — "Tensile" (worked example, AE engine)

A style built from a one-word brief ("steel"), no reference. The first attempt
was rejected as tasteless: it read the word literally (brushed-metal noise,
rivets, Bevel Alpha, CC Light Sweep chrome, orange sparks, forge glow) — stock
"industrial template" language with no point of view. This rebuild is the one
that shipped. Use it as the model for turning an abstract word into a system.

## Concept
Steel as *precision under stress* — the language of premium product films
(one cold light gliding over black metal), Swiss grids, and machined joints.
Not rust-belt, not chrome clip-art.

## Palette (60/30/10)
| Role | Hex | Name |
|---|---|---|
| 1 Dominant | `#0B0D10` | blackened steel |
| 2 Secondary | `#D9DEE3` | polished steel (type, light) |
| 3 Accent | `#3457FF` | blued steel — the heat-blued screw of fine watchmaking |

Temper stops for the hero shot (fixed, cooling into the accent):
white-hot `#FAF0DB` → straw `#CC9452` → bronze `#8F5238` → violet `#613D9E` → accent.

## Type
- **Big Shoulders Display Light** — tall, thin, drawn like steel rod; designed
  from Chicago's industrial signage. Set monumental (300–420 px), caps,
  stacked 1–3 balanced lines by a Source Text expression.
- **Monaspace Neon Wide Regular** — 20 px chapter numerals. Narrow display vs
  wide mono is the proportion contrast.
- Chosen by rendering a specimen of 19 installed candidates and looking.

## Motion verb: SHEAR
Every phrase and plate arrives cut into angled bands that slide *along the
cut* and lock flush (expo-out). At the lock a razor line of blue-white light
runs along each seam and vanishes; a sharp glint crosses the letters. At rest
the cuts are invisible — precision. Exits pass through / reverse.

## Text layout engine (v3 — added after v2 was "better but boring")
v2 rendered a 39 s text-only pitch as one composition repeated 39 times: a
centred stack on black with the same shear every 1.1 s. v3 gives text a
composition system:
- **Phrases → blocks → compositions.** Phrase starts come from the director's
  markers. Every 2 phrases (3 at low FORM) start a new *composition*, hashed
  from the section index, and the last phrase of a 3+-phrase section is the
  **Monument** landing.
- **Compositions.** Each is shearing background planes plus two text zones:
  - Void: open field
  - Horizon: dark plate cut low across the frame
  - Slab: polished silver bar on the right
  - Diagonal: dark plate on a 31° cut
  - Inversion: dark band over a silver plate, with dark ink on silver
  - Monument: the landing
  Planes slide in along their own cut edge, and the edge flashes a razor of
  light when they lock.
- **Zone fit.** A rig null scales, places and aligns each phrase into its
  zone. The text comp's Source Text expression runs the same engine and
  chooses 1–3 lines for the biggest type in that zone. That gives real scale
  contrast: two lines in wide, short zones, a three-line stack in tall ones.
- **Rhythm.** An *event* phrase (new composition) gets a full-travel shear,
  seams and a lock glint, and its type waits 0.22 s for the plate. A *quiet*
  phrase (second zone) gets a short shear with no seams.
- **Temper arc.** In 05 the whole section cools: first phrase white-hot, last
  phrase blued steel.

## Shots
| Shot | Kind | Idea |
|---|---|---|
| 01 Monolith | text | stacked monumental type, softbox light glides behind |
| 02 Slit | media | two black-steel doors part on a crack of blue light; reflection pinned in world space |
| 03 Shear | text+media | plate in vertical strips + flush-left text, crop marks |
| 04 Section | text+media | full-bleed media sheared on a diagonal, scrim, flush-left text |
| 05 Temper | text | letters arrive white-hot and cool through straw/bronze/violet into blued steel |
| 06 Column | text+media | the line runs vertically up the left edge beside a tall plate |

## Trinity
- FORM: band count (2 → 7 text, 2 → 6 media), furniture/crop marks, seam intensity, grade strength, slit width.
- FLOW: shear travel/speed, light glide speed, push-in, door motion (0 = static).
- PRESSURE: band order entropy, cut-angle variance, permanent stress fractures above 45%.

## Media treatment
Tint to a cold steel duotone (shadows pulled toward blued steel), Levels
contrast, film grain from a top adjustment layer.
