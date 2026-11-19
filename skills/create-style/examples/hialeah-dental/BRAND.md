# Hialeah City Dental — "Settle" (CucoStudio style, AE engine)

## About
Hialeah City Dental (hialeahcitydental.com) — a family/cosmetic dental clinic in
Hialeah, FL (1544 W 37th St · (305) 558-9222). Bilingual community (EN/ES reviews).
Voice: warm, calm, reassuring, premium-but-approachable. Hero line:
"Transforming smiles with innovation, expertise, and care. *We're here for you.*"

## Palette (rendered-pixel pass + eye)
| Role | Hex | Evidence |
|---|---|---|
| 1 Dominant field | `#FBF8F4` cream paper | 66% of page pixels; all body sections |
| 2 Secondary ink | `#152344` deep navy | 31%; hero, footer, logo, headings |
| 3 Accent | `#EFD7C2` peach sand | "Book Now" pills, the italic hero line, quote glyphs |

Extended (derived in expressions from the 3, so palette swaps propagate):
slate glow = mix(navy, cream, .22) (hero light, top-right) · muted ink = mix(navy, cream, .62)
(upcoming subtitle words) · warm band `#F4EFE8` ≈ mix(cream, peach, .25).

## Typography (from @font-face — real families, installed locally from Google Fonts, OFL)
- **Newsreader** (Production Type) — transitional/old-style text serif, optical sizes.
  Site: 72px, weight 400, tracking −0.022em, leading 1.04, sentence case; the closing
  line in *Italic*, peach. Video: `Newsreader60pt-Regular` / `Newsreader60pt-Italic`
  (largest static optical size), tracking −22.
- **Manrope** — geometric grotesque. Site: body 15px/400, labels 600 caps with wide
  tracking (eyebrows: hairline rule + "DENTAL CARE"). Video: `Manrope-SemiBold` caps
  tracked 240–280 for furniture, `Manrope-Medium/Regular` for info values.

## Visual identity
- Navy hero with a cool slate light falling from the top-right onto the portrait; cream
  serif headline flush-left; final line italic peach. Calm, lots of air.
- Eyebrow: a 56px hairline rule followed by tracked caps label.
- Rounded cards (radius ~16–24) with 1px translucent hairlines; info strip
  VISIT US | OPEN | CALL on the hero.
- Monogram: H C (with a dot "eye") over a U-shaped D cup — round-capped strokes,
  rebuilt here as vector shapes (draw-on).
- Motion on site: soft fade-up reveals on scroll.

## Decisions
- Motion verb: **SETTLE** — lines rise out of their own baseline and come to rest
  (quart-out, no overshoot); exits sink back. Nothing jolts.
- Accent budget: peach = the landing line (last line of a section's final phrase,
  set in Newsreader Italic) on the title; a single short dash above subtitles.
- Media treatment: rounded 4:5-ish window, navy/cream duotone mix (FORM), settle-in
  counter-zoom + slow push (FLOW), grain + hand-placed tilt (PRESSURE).
- Canvas 1080×1920 @30, social safe zone respected (bottom ~400px free).

## Assets
assets/images: logo-{navy,beige,white}.png, hero-portrait.jpg, hero-wide.jpg,
team-group.jpg, service-*.jpg, implants-smile.jpg, og.png. fonts/: Newsreader 60pt, Manrope.
