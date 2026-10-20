# Hermes Cobalt — brand extraction v2

Source: https://hermes-agent.nousresearch.com/ · Extraction: rendered-page
(`extract_v2.py` — Playwright screenshots + computed styles + @font-face +
area-weighted median-cut pixel palette). Second take on the same brand as
Hermes Ink (style 27), built to fix v1's two extraction errors:

1. **v1 inverted dominance** — counted `#0000f2` occurrences in source and
   made paper the field. Rendered pixels: blue covers ~57% of the page
   (40% + 16% shades), white/near-white ~34%. **Blue IS the brand field.**
2. **v1 took the fallback font** — `font-family` stack ended in Times New
   Roman; the real display face is **Sigurd Variable** (weight 300, uppercase,
   letter-spacing 2.4px, line-height 0.88 — a light high-contrast Didone).
   Mono is **Courier Prime**.

## 60/30/10 (area-weighted, rendered)

| Role | Hex | Share | Use |
|---|---|---|---|
| Dominant | `#0000F2` | ~57% | the field — everything sits ON blue |
| Secondary | `#F5F5F5` | ~34% | type, hairline engravings, the card plate |
| Accent | `#E4E6FC` | ~9% | pale tint for furniture / secondary text |

## Typography

| Role | Real font | Installed substitute | Why |
|---|---|---|---|
| Display | Sigurd Variable 300, UPPERCASE, tracked, tight leading | **Didot** | closest installed Didone (high stroke contrast, hairline serifs) |
| Mono | Courier Prime | **Courier New** (CourierNewPSMT) | Courier Prime is literally a Courier revival |

## Visual language

White-line engraving art on blue (inverted woodcut), hairline ray bursts,
tracked mono furniture (`#N LABEL`, `/\-_=+|<` glyph runs), archive-card
plates (white polaroid on blue). Motion verb: **radiate**.

## Shots

- `01` herald — text+media: engraving media floating on blue with paper rays,
  stacked Didot display, mono kicker
- `02` titles — text-only: HERMES tracked header, giant hairline burst,
  stacked display, mono footer
- `03` card — media-only: white archive card, media duotoned blue-on-white,
  `#3 ARCHIVE` furniture (empty textBlock for the validator)

## Result

Style 28 · .aep at `~/style-dev/hermes-cobalt/` · test render: project 109,
arrangement 365. Hermes Ink (style 27) kept untouched for A/B evaluation.
