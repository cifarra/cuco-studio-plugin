"""Rendered-page brand extraction for /create-style (Step 1a).

Truth comes from the RENDERED page, not the source code. Counting hex
occurrences in CSS inverts dominance (an accent used 16 times in code can
cover 5% of pixels while the field color appears once), and font stacks lie
(the first family is often a webfont the fetcher can't see, so you'd pick
the fallback).

Usage:
    python3 extract-brand.py <url> <out_dir>

Outputs into <out_dir>:
    fullpage.png / viewport.png  — screenshots (LOOK at these; vision judges
                                   dominance and character better than code)
    computed.json                — @font-face rules (real font names + files),
                                   computed styles per typographic role,
                                   area-weighted element background colors
    palette.json                 — area-weighted pixel palette of the
                                   rendered page (median-cut quantization)

Requires: playwright (chromium installed) + pillow.
"""

import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

URL = sys.argv[1]
OUT = Path(sys.argv[2])

PAGE_PROBE = """() => {
  const out = {fontFaces: [], roles: {}, areaColors: {}};

  // ---- @font-face rules: the REAL font names + file URLs
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (const r of rules) {
      if (r instanceof CSSFontFaceRule) {
        out.fontFaces.push({
          family: r.style.getPropertyValue('font-family'),
          src: r.style.getPropertyValue('src').slice(0, 200),
          weight: r.style.getPropertyValue('font-weight'),
          style: r.style.getPropertyValue('font-style'),
        });
      }
    }
  }

  // ---- computed styles for typographic roles (resolved, not authored)
  const roleOf = (el, name) => {
    if (!el) return;
    const cs = getComputedStyle(el);
    out.roles[name] = {
      text: (el.textContent || '').trim().slice(0, 60),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      textTransform: cs.textTransform,
      color: cs.color,
    };
  };
  roleOf(document.querySelector('h1') ||
         [...document.querySelectorAll('*')].find(e =>
           parseFloat(getComputedStyle(e).fontSize) > 60 && e.textContent.trim()),
         'display');
  roleOf(document.querySelector('p'), 'body');
  roleOf(document.querySelector('nav a, header a'), 'nav');
  const small = [...document.querySelectorAll('span,div,p,a')].find(e => {
    const cs = getComputedStyle(e);
    return parseFloat(cs.fontSize) < 15 && e.textContent.trim().length > 5;
  });
  roleOf(small, 'label');

  // ---- accent candidates: colors on interactive/CTA elements (salience,
  // not area — pure area ranking buries the accent under field + grays)
  const cta = {};
  for (const el of document.querySelectorAll('a,button,[role="button"],input[type="submit"]')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    for (const c of [cs.backgroundColor, cs.color, cs.borderColor]) {
      if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') continue;
      cta[c] = (cta[c] || 0) + 1;
    }
  }
  out.ctaColors = Object.fromEntries(
    Object.entries(cta).sort((a, b) => b[1] - a[1]).slice(0, 8)
  );

  // ---- area-weighted element backgrounds (what actually covers space)
  const areas = {};
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    const r = el.getBoundingClientRect();
    const area = Math.max(0, r.width) * Math.max(0, r.height);
    if (area < 900) continue;
    areas[bg] = (areas[bg] || 0) + area;
  }
  out.areaColors = Object.fromEntries(
    Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 10)
  );
  return out;
}"""


async def main():
    from playwright.async_api import async_playwright

    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(URL, wait_until="networkidle")
        await page.wait_for_timeout(2500)

        await page.screenshot(path=str(OUT / "viewport.png"))
        await page.screenshot(path=str(OUT / "fullpage.png"), full_page=True)

        data = await page.evaluate(PAGE_PROBE)
        (OUT / "computed.json").write_text(json.dumps(data, indent=2))
        await browser.close()

    # ---- pixel palette: area-weighted quantization of the rendered page,
    # then merge near-duplicate bins in Oklab (perceptual; Lab drifts blues)
    from PIL import Image

    img = Image.open(OUT / "fullpage.png").convert("RGB")
    img.thumbnail((400, 4000))
    q = img.quantize(colors=12, method=Image.Quantize.MEDIANCUT).convert("RGB")
    counts = Counter(q.getdata())
    total = sum(counts.values())

    def oklab(rgb):
        r, g, b = (c / 255 for c in rgb)
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
               for c in (r, g, b)]
        l = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]
        m = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]
        s = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]
        l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
        return (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_)

    clusters = []  # [rep_rgb, rep_oklab, share]
    for rgb, n in counts.most_common():
        lab = oklab(rgb)
        for cl in clusters:
            if sum((a - b) ** 2 for a, b in zip(lab, cl[1])) ** 0.5 < 0.06:
                cl[2] += n / total
                break
        else:
            clusters.append([rgb, lab, n / total])
    palette = [
        {"hex": "#%02X%02X%02X" % tuple(c[0]), "share": round(c[2], 4)}
        for c in sorted(clusters, key=lambda c: -c[2])[:8]
    ]
    (OUT / "palette.json").write_text(json.dumps(palette, indent=2))
    print(json.dumps({"palette": palette, "ctaColors": data["ctaColors"],
                      "roles": data["roles"],
                      "fontFaces": data["fontFaces"][:8]}, indent=2))


asyncio.run(main())
