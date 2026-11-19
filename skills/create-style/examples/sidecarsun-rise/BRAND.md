# SidecarSUN — "Rise" (CucoStudio style, AE engine)

## About
SidecarSUN (sidecarsun.com) — creative partners studio (Miami · LATAM · London).
"1 WEEK, ON-SITE OR ONLINE → 6 MONTHS OF ASSETS." Creative direction, ads for
traction, content partnerships. Deliverables: Pack of 4 (1× 1-min Authority Film,
3× 30s Traction Ads) + funnel launch; on-site sprint adds editorial stills and a
6-month brand asset vault; monthly partner retainer. Tagline 日の出 · RISING SUN.
Voice: confident, cinematic, direct; uppercase headlines whose LAST line turns
orange ("TWO FAMILIES. **ONE VISION.**", "WE BUILD YOUR FUNNEL **& EVERYTHING THAT FUELS IT.**").

## Palette (rendered pass + eye)
| Role | Hex | Evidence |
|---|---|---|
| 1 Field | `#FFF9ED` cream | 33% of pixels; every light section, hero bottom fade |
| 2 Ink | `#0C0A09` warm black | showreel section + hero sequence (37% black incl. canvas); headings `#111827` |
| 3 Accent | `#EA580C` orange | CTAs, landing lines, logo ring, card borders |

Derived in expressions (so palette swaps propagate):
- SUN = accent hue +22°, sat 1, light .5 → ≈ `#FFB800` (logo disc, `#FFC300` rubrics)
- EMBER = mix(ink, accent, .3) — the showreel's radial orange glow on black
- scrim = the hero overlay rgba(45,26,17,.38) ≈ mix(ink, accent, .12) @ 38%

## Typography
Site declares Syne 800 for headlines but never loads it (only Space Grotesk 300–500
is imported) — visitors SEE the fallback: Helvetica Neue Bold caps. Rendered truth wins.
- Display: `HelveticaNeue-Bold`, ALL CAPS, tracking −10, leading 0.92, 1–3 balanced lines.
- Rubric: `SpaceGrotesk-Bold` caps, tracking 200 (site 0.2em), 22–26 px, sun-yellow or orange.
(Space Grotesk static TTFs installed from Google Fonts, OFL.)

## Visual identity
- Logo mark: a ring split vertically, left half raised / right half lowered (offset 0.2 r),
  around a sun disc (r .40 of ring). Inner radius .645. Their own film builds it as an
  eclipse: corona on black → ring halves fly in → lock → disc fills yellow → cream.
- Cinematic dark sections with a radial orange glow; cream sections with soft warm glow.
- Cards: radius 12, 1px orange 25% border, deep shadow; ghosted numerals "01".
- Easing: cubic-bezier(0.16, 1, 0.3, 1) everywhere (expo-out).

## Decisions
- Motion verb **RISE**: lines rise out of their horizon masks and keep rising out
  (no sink); plates rise; the sun disc rises. Expo-out in, expo-in out.
- Signature: **eclipse lock** — split-ring halves slide vertically in opposite directions
  and lock at the logo offset around a rising sun. Budgeted to composition changes.
- Accent budget: orange = landing line of each section + the ring; sun yellow = disc + rubric.
- Media: golden-hour grade (ink→cream tint by FORM, warm soft-light wash, grain by PRESSURE),
  scope bars (2.39:1) at low FORM, counter-zoom rise in, slow push by FLOW.
- Canvas 1920×1080 @24 (all their footage is 16:9 24p "Cinemascope").

## Shots
| Shot | Kind | Idea |
|---|---|---|
| 01 Sunrise | text | layout engine: Dusk / Horizon / Daylight / Noon compositions, plates rise |
| 02 Hero | text+media | full-bleed footage, hero scrim, centred caps + orange landing, scope bars |
| 03 Reel | text+media | cream field, rounded media card right, flush-left caps column |
| 04 Eclipse | media | sun rises, ring locks, disc opens as an iris into the footage |

## As shipped (style 77 "SidecarSUN Rise")
- Layout engine (01): phrases → blocks (G = 2 at FORM ≥ .5, else 3) → compositions
  Dusk (lockup right, flush-left type on a hairline) · Horizon (cream plate rises to y 600,
  sun sits on the plate edge, orange horizon line) · Daylight (full cream, centred) ·
  Noon (logo mark above centred type = the site hero). Section start comes from a fixed
  12-step table (no repeats for neighbours or sections 4 apart); landing = Noon when CNT ≥ 3.
  Plates only move UP: to hidden = slide out the top; a "sinking" change = out the top, then
  rise from the bottom. Type waits 0.24 s when the plate changes.
- Rising type: N copies of the text precomp, ONE mask each = (line band) ∩ (window fixed in
  rig space), computed in the expression. (An Add + Intersect mask pair rendered unclipped.)
- Sun/ring: per-composition rise distance (rz) and ring travel (rt); the small Noon mark rises
  only 150 px and fades, so it never crosses the headline.
- 02 hero: Tritone grade blend 90→52% by FORM, overlay 6–22%, feathered bottom-only scrim.
- Trinity: FORM = furniture/scope bars/grade/group size; FLOW = rise speed + travel, drift,
  push; PRESSURE = stagger entropy, line jitter (> .5 only), card tilt, composition shuffle.
- Perf: mainComp holds ONLY mainControl (director extends mainComp layers to full length);
  render ≈ 0.04–0.28 s/frame; motion blur off (only ~20% of cost, but not needed).
