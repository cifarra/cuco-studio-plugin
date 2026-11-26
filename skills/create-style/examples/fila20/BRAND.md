# FILA20 — "Fila 20" (vertical: stories, reels, TikTok)

## Brief (context)

**Who.** A Cuban production company in New York. The name is the 20th row ("fila") of
the Cuban Cinematheque, where the founders met as teenage cinephiles. They make
festival shorts (Venice, Sundance, Clermont-Ferrand) and commercials (Kodak, Louis
Vuitton, MoMA). Their thread: personal stories with timeless, universal resonance.

**Register.** Cinephile, quiet, intimate. Their films are naturalistic, warm and close,
mostly long takes. Their Instagram is film stills and title cards on black. The tempo
belongs to a cinema, not a feed: things cue on, hold, and cut.

**Identity (kept exactly).**
- **Logo:** "F I L A" in widely spaced heavy capitals, and "20" inside a ring. It's traced
  to vector (`logo/logo.json`); the ring is an exact stroke (r 420.6, stroke 52.7 in
  logo units).
- **Type:** the logo is set in Avenir Next Bold (matched by specimen), and the site uses
  Proxima Nova. Avenir Next is a macOS system font, so the style travels.
  - Bold, caps, wide tracking: the logo's gesture, for titles.
  - Demi Bold, sentence case: the subtitle voice (their films are subtitled).
- **Colour:** black on white. The site's blue is a nav link (interface), not identity.

| Slot | Hex | Role |
|---|---|---|
| 1 Black | `#121212` | the dark (auditorium, masking); type on the lit screen |
| 2 White | `#FFFFFF` | projected light: the screen, type, the logo |
| 3 Silver | `#B1A798` | warm grey from their stills: the leader sweep, credits not being spoken |

**Finish.** Film grain over everything: a monochrome Noise at 7% on a top adjustment layer
in every shot (requested by the client after the first pass).

**No content.** Logo only (no website, numbers or names). Footage: none. Media is the
story's.

## System (design)

**World.** The screen, seen from row 20. Black is the auditorium and its masking; white
is projected light. Everything projected (type, photos) weaves very slightly in the gate
and flickers with the lamp. The masking and the logo stay rock steady.

**Three mechanics.**
- **Masking (signature).** The black masking glides to fit what is projected, like a
  projectionist's: the white screen resizes to each phrase; a scope band closes over a
  16:9 still; a band opens to a full-frame image. The motion is mechanical: a smooth
  start and stop, no overshoot.
- **Cue.** Type cues on and off hard, the way titles and subtitles do. There are no
  fades, rises or reveals. Long text rolls like end credits: a continuous column, with
  the phrase being spoken white and centred and the others silver.
- **Ring.** The logo's ring:
  - as a leader sweep that draws the ring in the brand shot
  - as the phrase timer in the leader shot (the sweep follows the phrase)
  - as the changeover cue mark: two blinks top-right before every cut

**Transitions.** Hard cuts, signalled by the changeover cue, like a reel change. Nothing
passes through an empty field.

**Persistent logo.** It's small, white and top-centre in every shot at the same spot,
with no entrance, so it reads as one logo across cuts. A director rule forces this:
template layers in mainComp sit under the shots. It's left out of the brand shot, where
the logo is the hero.

**Empty sections → brand shot.** Shot 07 has no text capacity and no frame. That makes it
the caster's "empty-compatible" shot, so every section with neither text nor media gets
the full brand shot. If a text section ever lands there (casting pressure 100), its text
shows under the logo.

**Trinity.**
- FORM: masking geometry: the lit screen's minimum aspect (1.2 → 2.2), the scope band's
  final ratio (1.85 → 2.75), and title tracking (logo-wide at high FORM).
- FLOW: tempo of masking glides, the sweep and the roll ends, plus a slow push-in on
  stills.
- PRESSURE: projector entropy: gate weave amplitude and lamp flicker.

**Canvas.** 1080×1920 at **24 fps**. Text stays in y 380–1560 (clear of the stories/TikTok
UI); the logo sits at y 300.

## Don't-repeat check (vs the examples table)

| Signature already used | Fila 20 |
|---|---|
| serif lines rising out of baseline windows (HCD) | sans titles and subtitles that cue on hard; a credits roll |
| text block bottom-left under a photo window (HCD) | centred subtitles burned into or under the image |
| lockup top-left; giant tone-on-tone mark (HCD) | small logo top-centre; the big logo only in the brand shot, black on white |
| strips pulled in and ripped off; taped prints (SALF Cinta) | masking that resizes the projected screen |
| hard cuts with everything in place (SALF Cinta) | hard cuts, **repeated**: the changeover cue marks them |
| thin caps on black, light sweeps (steel) | bold tracked caps on a lit white screen |
| giant letters, per-letter stacking (letterpile) | none |

## Shots

| Shot | Kind | Composition |
|---|---|---|
| 01 Pantalla | text, short (~22c) | black; a white screen fitted to the phrase; black tracked caps |
| 02 Créditos | text, long (~100c) | black; a dark projected window; the text rolls like end credits |
| 03 Líder | text, medium (~48c) | black; the logo's ring, large; the sweep follows the phrase |
| 04 Scope | text + media (16:9) | the still's masking closes to scope; subtitles in the letterbox |
| 05 Académico | text + media (4:5) | a 4:5 screen with margins; subtitles burned in |
| 06 Completo | media-only (9:16) | a scope band opens to the full frame |
| 07 Marca | empty | white; the logo cues on letter by letter, and the ring draws with a leader sweep |
