# Se Acabó La Fiesta (SALF) — "29N" campaign style

## Brief (context)

**What it is.** SALF, a Spanish political party, campaigning for the general
election of 29 November 2026 (29N). The site is the campaign: "La ilusión de un
país", a 119-measure electoral contract with 10 commitments, campaign events and
volunteer sign-up.

**Voice.** Short two-beat statements in Spanish: a setup, then a payoff. "Un país
por hacer. / Un plan para hacerlo." "El que la hace, / la paga." "Y si no
cumplimos, / hay consecuencias." The payoff is set in the accent colour. That
colour turn is the brand's typographic gesture.

**Palette (rendered pixels).** Each colour renders as a flat field at its exact hex.

| Slot | Hex | Role |
|---|---|---|
| 1 Night | `#0C1714` | the campaign field: hero, contract band, footer; the low-key portrait merges into it |
| 2 Paper | `#FDFAF3` | pages; type on Night |
| 3 Tan | `#D7BD96` | the payoff beat on Night ("país."), the 29N, the light numerals |
| derived Brown | `#785A46` | the payoff beat on Paper; from Tan by HSL (h −0.033, s ×0.587, l 0.373) |
| derived Sand | `#E9DECB` | the "contigo" band; mix(Paper, Tan, 0.47) |

**Type.**
- Newsreader Regular (60pt optical size installed) for statements, set very tight:
  tracking −65 at display size, −35 to −45 smaller.
- Inter Bold for "29N" (tracking −80).
- The wordmark is a bold geometric sans (Montserrat Bold as the live substitute).
- Plex Mono eyebrow labels are site UI: dropped.

**Mark.** A squirrel in a white mask (illustrated, raster), plus the wordmark
"SE ACABÓ / LA FIESTA" in brown and black.

**Photography.** The candidate in profile, laughing and looking up. It is low-key
studio light against black, side-lit, with cool shadows. The photo has no edge: its
dark falls into the Night field. The contract cover is a gold bar on cream paper.

## System (design)

Grown from the identity, with three mechanics:

1. **Light on Night, ink on Paper.** Photos come up by their own luminance.
   - On Night the highlights arrive first (face, teeth, eyes), like lights coming
     up. On the exit the shadows go first and the highlights last: the lights go
     out ("se acabó la fiesta").
   - On Paper the image inks in, darks first, and its highlights become the page.
   - The photo's darks rest as the field itself, as on the site's hero.
   - Built with Extract (luminance) on the media layer.
2. **The two-beat turn.** Statements in Newsreader rise out of their baselines in
   Paper (on Night) or Night (on Paper). The section's landing phrase turns Tan (on
   Night) or Brown (on Paper) as it is spoken: a soft colour front moves through
   the characters, driven by the word markers. With a single phrase, only its last
   line turns.
3. **The clause number.** Sections are numbered like the contract's commitments.
   A giant Newsreader numeral "0N" (section index + 1), tone-on-tone, rolls up from
   the previous number on enter. Across the video it counts through the story.

**Transitions.** Hard cuts. Every shot's field is present from frame 0; content
rises or lights up within ~0.5 s and leaves in ~0.4 s (lines rise out, photos go
dark).

**Trinity.**
- FORM: the rest threshold of the light/ink. Low: the full photo. High: a
  high-contrast stencil of its highlights (poster).
- FLOW: push and drift speed, reveal pace.
- PRESSURE: line stagger jitter, and a fluorescent stutter as the light comes on.

## Shots

| Shot | Kind | Composition |
|---|---|---|
| 01 Portada | text (~40c) | Night; lockup top-left (squirrel lit from the dark); giant clause numeral top-right; huge statement bottom-left, payoff turns Tan |
| 02 Retrato | text (~36c) | Night; the candidate's portrait lit out of the dark (one crop per section); statement below |
| 03 Página | text + media (~30c, 1000×800) | Paper; the story's photo inks onto the page; statement below in Night, payoff Brown |
| 04 Noche | text + media (~24c, 1080×1920) | full-bleed photo lit from Night, falling into the field at the foot; statement over the dark |
| 05 Plano | media only (1080×1440) | Night; photo lit from the dark; lockup at the foot |
| 06 Contrato | long text (~105c) | Paper; giant clause numeral; paragraph in Night, landing phrase turns Brown |
| 07 Contigo | short text (~20c) | Sand; the logo inks in; centred statement; giant tone-on-tone 29N at the foot |
