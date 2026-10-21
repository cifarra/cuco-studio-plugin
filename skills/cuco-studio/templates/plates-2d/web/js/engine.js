// Frame-deterministic 2D plate engine. render(t) is a pure function of (beat, t).
// URL params: ?beat=b01&dur=12.3&pr=2&w=1620&h=1080&off=1.1
// Per frame: paper -> color pass (multiply inks, edge wobble, speck holes) -> line pass + type -> grain.
// Inks, typefaces and print feel come from web/theme.json (scripts/style_brief.py --apply + your roles).
import * as P from './print.js';
import { BEATS } from './beats.js';

const json = async (u, dflt) => { try { const r = await fetch(new URL(u, import.meta.url)); return r.ok ? await r.json() : dflt; } catch { return dflt; } };
const THEME = await json('../theme.json', {});
P.setTheme(THEME);
for (const f of THEME.fonts || []) {           // brand typefaces copied from the style (style_brief.py --apply)
  // variable fonts: give a weight range ("weight": "300 900") so bold is real, not synthesized
  const face = new FontFace(f.family, `url(${new URL('../' + f.url, import.meta.url)})`, { weight: f.weight || 'normal' });
  document.fonts.add(await face.load());
}
await Promise.all(['400', '700', '800'].map(w => document.fonts.load(`${w} 40px ${P.SANS}`)).concat(['500', '700'].map(w => document.fonts.load(`${w} 40px ${P.MONO}`))));
const WORDS = await json('../../script/words.json', {});     // script/align.py; optional until narration exists
const BEATTXT = await json('../../script/beats.json', []);

const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || THEME.width || 1620), H = +(Q.get('h') || THEME.height || 1080), PR = +(Q.get('pr') || 2);
const BEAT = Q.get('beat') || Object.keys(BEATS)[0];
const DUR = +(Q.get('dur') || 10);
const OFF = +(Q.get('off') || 0);   // clip time 0 = OFF seconds before this beat's narration starts
const LEAD = BEAT === (BEATTXT[0]?.id ?? Object.keys(BEATS)[0]) ? 0.3 : 0;   // narrate_story_clip.py --lead (0.3 s) before the first beat
const spec = BEATS[BEAT];
if (!spec) throw new Error('no beat ' + BEAT);

document.body.style.background = P.COL.paper;
document.querySelector('#wob feDisplacementMap').setAttribute('scale', P.PRINT.wobble);

const mk = () => { const c = document.createElement('canvas'); c.width = W * PR; c.height = H * PR; return c; };
const out = mk(), color = mk(), wob = mk(), line = mk();
out.style.cssText = `width:${W}px;height:${H}px`;
document.getElementById('stage').appendChild(out);
const O = out.getContext('2d'), C = color.getContext('2d'), WB = wob.getContext('2d'), L = line.getContext('2d');

// static textures: speck holes for the ink, grain for the paper (deterministic)
function noiseCanvas(seed, fn) {
  const c = mk(), g = c.getContext('2d'), img = g.createImageData(c.width, c.height), r = P.rng(seed), d = img.data;
  for (let i = 0; i < d.length; i += 4) fn(d, i, r);
  g.putImageData(img, 0, 0); return c;
}
const speck = noiseCanvas(11, (d, i, r) => { const v = r(); d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = v > 0.985 ? 255 : v > 0.965 ? 110 : 0; });
const grain = noiseCanvas(23, (d, i, r) => { const v = 128 + (r() - 0.5) * 200; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
// soften the speck a touch so holes read as ink dropouts, not pixels
const speckSoft = mk(); { const g = speckSoft.getContext('2d'); g.filter = 'blur(0.6px)'; g.drawImage(speck, 0, 0); }

// word timing: c.at('cosine') -> seconds into the clip where that word starts (nth occurrence)
const norm = s => s.toLowerCase().replace(/[^a-z0-9.]/g, '').replace(/\.$/, '');
// No alignment yet (drafting before narration): spread the beat's text evenly over its duration.
const draft = () => { const ws = (BEATTXT.find(b => b.id === BEAT)?.text || '').split(/\s+/).filter(Boolean), step = DUR * 0.92 / Math.max(1, ws.length); return ws.map((w, i) => ({ w, s: i * step, e: (i + 0.8) * step })); };
const words = (WORDS[BEAT] || draft()).map(w => ({ ...w, k: norm(w.w) }));
function at(word, n = 0, end = false) {
  const k = norm(word);
  const hits = words.filter(w => w.k === k || w.k.startsWith(k));
  const h = hits[Math.min(n, hits.length - 1)];
  if (!h) { console.warn(`beat ${BEAT}: word "${word}" not found`); return 0; }
  return LEAD + (end ? h.e : h.s);
}

const ctx = { W, H, PR, D: DUR, at, THEME, ...P };
ctx.tw = (word, n = 0, end = false) => at(word, n, end) / DUR;   // normalized

function render(tSec) {
  const T = tSec, t = Math.max(0, T) / DUR;   // T < 0 during the hold before narration: intro entrances play there
  // reset layers
  for (const [g, cv] of [[C, color], [L, line], [WB, wob]]) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.globalAlpha = 1; g.filter = 'none'; }
  C.setTransform(PR, 0, 0, PR, 0, 0); L.setTransform(PR, 0, 0, PR, 0, 0);
  C.globalCompositeOperation = 'multiply';   // inks overprint each other
  L.globalCompositeOperation = 'source-over';
  const K = P.kit(C, L);
  Object.assign(ctx, { t, T, K, C, L });
  spec.draw(K, ctx);
  if (spec.chapter && THEME.chapter_tag !== false) K.tag(spec.chapter[0], spec.chapter[1]);

  // color pass: wobble edges, punch specks
  WB.filter = spec.noWobble || !P.PRINT.wobble ? 'none' : 'url(#wob)';
  WB.drawImage(color, 0, 0);
  WB.filter = 'none';
  if (P.PRINT.speck > 0) { WB.globalCompositeOperation = 'destination-out'; WB.globalAlpha = P.PRINT.speck; WB.drawImage(speckSoft, 0, 0); }
  WB.globalCompositeOperation = 'source-over'; WB.globalAlpha = 1;

  O.setTransform(1, 0, 0, 1, 0, 0);
  O.globalCompositeOperation = 'source-over'; O.globalAlpha = 1;
  O.fillStyle = P.COL.paper; O.fillRect(0, 0, out.width, out.height);
  O.globalCompositeOperation = 'multiply'; O.drawImage(wob, 0, 0);
  O.globalCompositeOperation = 'source-over'; O.drawImage(line, 0, 0);
  if (P.PRINT.grain > 0) { O.globalCompositeOperation = 'soft-light'; O.globalAlpha = P.PRINT.grain; O.drawImage(grain, 0, 0); }
  O.globalCompositeOperation = 'source-over'; O.globalAlpha = 1;
}

const small = document.createElement('canvas'); small.width = W; small.height = H;
const S = small.getContext('2d'); S.imageSmoothingQuality = 'high';
window.renderAt = (tSec, fmt = 'image/jpeg', q = 0.93) => {
  render(tSec - OFF);
  S.clearRect(0, 0, W, H); S.drawImage(out, 0, 0, W, H);
  return small.toDataURL(fmt, q);
};
// seam checker hook: 2D plates have no camera; report the beat's declared scene so different plates count as a subject change
window.__seam = tSec => { render(tSec); return { pos: [0, 0, 10], tgt: [0, 0, 0], fov: 35, vis: { [spec.scene || BEAT]: 1 } }; };
window.__ctx = ctx;
render(0);
window.READY = true;
