# Hialeah City Dental — "Smile" (v3)

v1 read as the brand but the design was mediocre. v2 ("Afternoon") invented a
sunlight world and lost the brand. v3 keeps v1's identity exactly and builds the
motion system from the monogram.

## Brief (context)

**What it is.** A family and cosmetic dental clinic at 1544 W 37th St, Hialeah, FL.
It offers exams, emergencies, smile design, implants and orthodontics, plus
digital impressions, an in-house lab and 3D imaging.

**Audience & voice.** A bilingual (EN/ES), largely Cuban-American neighbourhood.
The voice is warm, calm and reassuring: premium but approachable. Hero line:
"Transforming smiles with innovation, expertise, and care. *We're here for you.*"
The italic aside is the brand's gesture.

**Palette (rendered pixels).** These render as flat fields at their exact hex. No
light, tint or glow ever touches them.

| Role | Hex | Use in video |
|---|---|---|
| 1 Field | `#FBF8F4` cream | ground of the cream shots; every cut lands on it |
| 2 Ink | `#152344` navy | title and media sheets, the band, ink on cream |
| 3 Accent | `#EFD7C2` peach | the italic on navy, cup outlines, the landing sheet |
| derived | `#8C6042` bronze | the italic on cream (measured on the site), from palette 3 by HSL in the expression |

**Type.** Newsreader 60pt Regular, sentence case, tracking −18, leading 1.02–1.12.
The landing line of each section is set in Newsreader Italic. The lockup wordmark
uses Manrope SemiBold.

**Mark.** An H and a C with a dot, over a D shaped like a cup: flat top, straight
sides, round bottom. It is drawn as one round-capped monoline (stroke 8.8% of the
D's width; bottom radius 0.363·w).

**Photography.** Warm studio portraits on peach and tan backdrops (smiles, hands on
cheeks); the doctor on slate. Six of them ship as `footage/portrait-0N.jpg`
(880×1080 crops).

## System (design)

**One idea from the mark: the cup and its stroke.**
- **Sheets.** Brand-colour sheets rise with a smile-curved edge. The middle lags
  while they move, and the curve's depth follows their speed. Exits lift the
  sheet off; cream shots are covered by a rising cream sheet with the same edge.
  Every cut lands on cream, so any shot can follow any other.
- **Cups.** Photos sit in D-cup windows. The outline draws like the logo (down,
  around, up, top bar last), and the photo fills the cup like a rising level, then
  settles. Story media are cover-scaled into the window; the director's "fit"
  would letterbox them.
- **Writing.** Roman lines rise out of their own baseline windows. The italic
  landing line is written on with a slanted, feathered wipe as its words are
  spoken. A round-capped smile is then drawn under it.
- **Supergraphic.** A giant monoline D in a tone of the field frames the
  text-only shots, with its curve kept in frame.

## Shots

| Shot | Kind | Composition | Enter / exit |
|---|---|---|---|
| 01 Title | text (45c) | navy sheet; lockup top-left; supergraphic D; cream serif up to 4 lines, bottom-left; peach italic landing + smile | sheet rises / lifts off |
| 02 Statement | text (36c) | cream; a clinic portrait (one per section) in a large cup top-right; navy type below; bronze italic landing | cup draws + fills / cover rises |
| 03 Cup | text + media (36c, 960×768) | cream; karaoke navy words above a cup in the logo's exact proportions; without words the cup centres | cup draws + fills / cover rises |
| 04 Portrait | text + media (26c, 1080×1920) | full-bleed media; a navy band rises and rests with a smile edge; cream type in the band, peach italic + smile | media sheet with parallax, then the band / both lift |
| 05 Media | media only (900×1240) | navy sheet; tall cup with a peach outline; lockup; cream karaoke if words arrive | sheet rises, cup draws + fills / lifts off |
| 06 Letter | text, long (102c) | cream; large navy paragraph (min-raggedness wrap) inking as spoken; peach-cream D at the foot | block rises / cover rises |
| 07 Landing | text, short (19c) | peach sheet; lockup centred and drawn; navy italic written as spoken; navy smile; deeper-peach D | sheet rises / lifts off |

**Trinity (light).**
- FORM: the cup's corner radius and the depth of the sheet edges.
- FLOW: motion speed, slow push and breathing drift.
- PRESSURE: line stagger jitter.

**Performance.** 0.06–0.14 s/frame, from one `typeset` JSON layer per shot.
A 32 s, 7-section video renders end to end in ~75 s.
