# Brand extraction — research notes

Condensed from a deep-research pass (2026-07-10, adversarially verified,
sources checked against shipped code where possible). Backs the method in
SKILL.md Step 1a and `extract-brand.py`. Read when improving the extractor
or debugging a wrong palette/font.

## Why code-only extraction fails (verified against the tools themselves)

- Chrome CSS Overview, CSS Stats, Project Wallace `css-design-tokens` all
  count **stylesheet/element occurrences** — no pixel sampling, no area
  weighting, no eyes on raster hero imagery. A real stylesheet yields a
  noisy 100–140+ unique-color superset of the true palette (duplicate blues
  in different formats, off-brand grays, opacity hacks).
- "Design-system reverse-engineering" CLIs (extract-design-system/dembrandt)
  assign primary/secondary/accent by **name-matching JSON keys**
  (`colors.primary`, `colors.brand`…), not by analysis, and reduce type to
  family strings with no @font-face resolution.
- Consequence (hit on the Hermes build): dominance inversion — the accent
  appears in many rules, the field color once. Dominance is an AREA
  question; only rendered pixels answer it.

## The layered recipe that works (all locally scriptable)

1. **Rendered-pixel pass** — headless screenshot (FULL page, not just
   viewport) → quantize (median-cut / color-cube / vibrant-class; PIL
   `quantize(method=MEDIANCUT)` is fine) → rank by pixel share. This is what
   Site Palette does in production.
2. **Computed-style pass** — one `page.evaluate()` walking the DOM:
   per-color **visible area × alpha** accumulation (Site Palette's verified
   recipe additionally grid-samples `elementFromPoint` ~1600 points and
   down-weights text-node rects ×0.3), plus computed styles per typographic
   role (family / size / weight / letter-spacing / line-height / casing).
   This is the middle path — resolved values, cheap, structured.
3. **Font-truth pass** — read `@font-face` rules for the REAL family + file
   URLs; never trust the `font-family` fallback stack (Fonts Ninja's "Fonts
   DNA" exists precisely because CSS declarations misidentify). If family
   names look subset/obfuscated (licensed fonts often are), download the
   woff2 and read its name table (`fontTools`) to recover the true typeface.
4. **Vision pass** — LOOK at the screenshots. Production hybrid tools
   (Fudge/FontOfWeb) pair programmatic extraction with vision-embedding
   judgment because feel/density/contrast/dominance aren't derivable from
   values alone. Your visual judgment arbitrates all numeric output.

## Refinements worth applying

- **Work in Oklab** for dedup/clustering/derivation, not raw RGB or CIELAB
  (Lab drifts blue hues toward purple — directly relevant to blue brands;
  Oklab's L/C/h are orthogonal, so you can build tints/shades ramps or
  desaturate without hue shift). Cluster the noisy quantizer output into
  the 3-color system by Oklab distance.
- **Accent ≠ area rank.** Pure area ranking always puts the field first and
  can bury the accent below neutral grays. Pick the accent by SALIENCE:
  high-chroma color on interactive/CTA elements, above-the-fold usage,
  contrast against its surroundings — then confirm by eye.
- **Full-page capture**: viewport-only area-weighting (Site Palette's known
  gap) misses everything below the fold and background-image/gradient
  colors; the pixel pass covers what the CSS pass can't see (hero art).
- **Weight matters as much as family**: a 300-weight display face reads as a
  different brand than the same family at 700. Substitute selection must
  match anatomy class (Didone / transitional / grotesque / geometric /
  humanist / slab / mono) AND weight AND casing/tracking usage.

## Key sources

- Oklab: bottosson.github.io/posts/oklab/
- Site Palette (screenshot quantization + area-weighted visible CSS): palette.site
- Quantizers: github.com/lokesh/color-thief, colorcube-js, vibrant.js
- Occurrence-counting paradigm: developer.chrome.com/docs/devtools/css-overview,
  projectwallace.com (css-analyzer, css-design-tokens)
- Font-file truth: fonts.ninja/tools
- Hybrid capture→tokens→vision: design.withfudge.com (ex-FontOfWeb)
