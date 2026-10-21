// Overprint-plate drawing kit (CucoStudio print language: flat multiply inks, a thin misregistered
// ink line pass, dashed construction lines, drafting dimension lines).
// Two layers per frame: C = color pass (multiply fills, wobbled + specked by the engine),
// L = line pass + type (crisp ink on top).
// Inks + type come from web/theme.json (the CucoStudio style) via setTheme(); defaults = style 65 "Cuco".
// Roles: paper (the stock), ink (line pass + type), gold (highlight blocks), accent, tint (light), accent2 (deep).
export const COL = {
  paper: '#F7F6F3', ink: '#26221B', gold: '#FCCD57', accent: '#FF594E', tint: '#95DCA5', accent2: '#446130',
  mute: 'rgba(38,34,27,0.55)', faint: 'rgba(38,34,27,0.22)',
};
// modality inks: text is ink, image gold, video tint, audio accent (theme "kinds" overrides)
export const MOD = { text: COL.ink, code: COL.ink, image: COL.gold, video: COL.tint, audio: COL.accent };
export let SANS = '"Red Hat Display", sans-serif', MONO = '"JetBrains Mono", monospace';
// print feel: wobble = color-pass edge displacement (px), grain = paper grain opacity, speck = ink dropouts, mis = misregistration scale
export const PRINT = { wobble: 9, grain: 0.16, speck: 0.9, mis: 1 };

const rgba = (hex, a) => { const n = parseInt(hex.slice(1, 7), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
export function setTheme(t) {
  for (const k of ['paper', 'ink', 'gold', 'accent', 'tint', 'accent2']) if (t[k]) COL[k] = t[k];
  COL.mute = t.muted || rgba(COL.ink, 0.55); COL.faint = rgba(COL.ink, 0.22);
  Object.assign(MOD, { text: COL.ink, code: COL.ink, image: COL.gold, video: COL.tint, audio: COL.accent }, t.kinds || {});
  if (t.display_font) SANS = `"${t.display_font}", sans-serif`;
  if (t.mono_font) MONO = `"${t.mono_font}", monospace`;
  Object.assign(PRINT, t.print || {});
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
export const eio = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const eout = x => 1 - Math.pow(1 - x, 3);
export const ein = x => x * x * x;
export const smooth = x => x * x * (3 - 2 * x);
export const lerp = (a, b, k) => a + (b - a) * k;
export const back = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
export function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// gaussian-ish
export function grand(r) { return (r() + r() + r() + r() - 2) / 2; }

// deterministic misregistration offset per shape seed (2–5 px, direction varies)
export function mis(seed, amt = 1) {
  const r = rng(seed * 9973 + 17); const a = r() * Math.PI * 2, m = (2.5 + r() * 2.5) * amt * PRINT.mis;
  return [Math.cos(a) * m, Math.sin(a) * m];
}

export function rr(g, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  if (r <= 0) { g.rect(x, y, w, h); return; }
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ------------------------------------------------------------------ the kit, bound to a frame
export function kit(C, L) {
  const K = {};
  // ---- color pass (flat multiply ink, no outline)
  K.disc = (x, y, r, col, a = 1) => { if (a <= 0 || r <= 0) return; C.globalAlpha = a; C.fillStyle = col; C.beginPath(); C.arc(x, y, r, 0, 7); C.fill(); C.globalAlpha = 1; };
  K.rect = (x, y, w, h, col, a = 1, r = 0) => { if (a <= 0 || w === 0 || h === 0) return; C.globalAlpha = a; C.fillStyle = col; rr(C, x, y, w, h, r); C.fill(); C.globalAlpha = 1; };
  K.poly = (pts, col, a = 1) => { if (a <= 0 || pts.length < 3) return; C.globalAlpha = a; C.fillStyle = col; C.beginPath(); pts.forEach(([x, y], i) => i ? C.lineTo(x, y) : C.moveTo(x, y)); C.closePath(); C.fill(); C.globalAlpha = 1; };
  K.tri = (x, y, s, col, a = 1, rot = 0) => { const p = [0, 1, 2].map(i => { const an = rot - Math.PI / 2 + i * Math.PI * 2 / 3; return [x + Math.cos(an) * s, y + Math.sin(an) * s]; }); K.poly(p, col, a); };
  K.diamond = (x, y, s, col, a = 1) => K.poly([[x, y - s], [x + s, y], [x, y + s], [x - s, y]], col, a);
  K.sq = (x, y, s, col, a = 1) => K.rect(x - s, y - s, 2 * s, 2 * s, col, a);
  // union of several closed polygons, filled once (no self-overprint where they overlap)
  K.union = (polys, col, a = 1) => { if (a <= 0) return; C.globalAlpha = a; C.fillStyle = col; C.beginPath(); for (const pts of polys) { pts.forEach(([x, y], i) => i ? C.lineTo(x, y) : C.moveTo(x, y)); C.closePath(); } C.fill('nonzero'); C.globalAlpha = 1; };
  K.ellipsePts = (cx, cy, rx, ry, n = 64) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * rx, cy + Math.sin(i / n * Math.PI * 2) * ry]);
  K.band = (pts, w, col, a = 1) => { if (a <= 0) return; C.globalAlpha = a; C.strokeStyle = col; C.lineWidth = w; C.lineCap = 'round'; C.lineJoin = 'round'; C.beginPath(); pts.forEach(([x, y], i) => i ? C.lineTo(x, y) : C.moveTo(x, y)); C.stroke(); C.globalAlpha = 1; };

  // ---- line pass (ink strokes)
  const stroke = (o = {}) => { L.globalAlpha = o.a ?? 1; L.strokeStyle = o.col || COL.ink; L.lineWidth = o.w ?? 2.5; L.setLineDash(o.dash || []); L.lineCap = o.cap || 'round'; L.lineJoin = 'round'; };
  K.ring = (x, y, r, o = {}) => { if ((o.a ?? 1) <= 0 || r <= 0) return; stroke(o); L.beginPath(); L.arc(x, y, r, o.a0 ?? 0, o.a1 ?? Math.PI * 2); L.stroke(); L.setLineDash([]); L.globalAlpha = 1; };
  K.box = (x, y, w, h, o = {}) => { if ((o.a ?? 1) <= 0) return; stroke(o); rr(L, x, y, w, h, o.r || 0); L.stroke(); L.setLineDash([]); L.globalAlpha = 1; };
  K.path = (pts, o = {}) => { const P = pts.filter(Boolean); if ((o.a ?? 1) <= 0 || P.length < 2) return; stroke(o); L.beginPath(); P.forEach(([x, y], i) => i ? L.lineTo(x, y) : L.moveTo(x, y)); if (o.close) L.closePath(); L.stroke(); L.setLineDash([]); L.globalAlpha = 1; };
  K.line = (x0, y0, x1, y1, o = {}) => K.path([[x0, y0], [x1, y1]], o);
  // dotted median (round caps on a near-zero dash)
  K.dots = (pts, o = {}) => K.path(pts, { w: 3.5, dash: [0.5, 12], ...o });
  K.dashed = (pts, o = {}) => K.path(pts, { w: 2, dash: [7, 8], cap: 'butt', ...o });
  // ink-filled shapes on the line layer (focal marks)
  K.inkDisc = (x, y, r, col = COL.ink, a = 1) => { if (a <= 0) return; L.globalAlpha = a; L.fillStyle = col; L.beginPath(); L.arc(x, y, r, 0, 7); L.fill(); L.globalAlpha = 1; };
  K.inkRect = (x, y, w, h, col = COL.ink, a = 1, r = 0) => { if (a <= 0) return; L.globalAlpha = a; L.fillStyle = col; rr(L, x, y, w, h, r); L.fill(); L.globalAlpha = 1; };
  K.inkPoly = (pts, col = COL.ink, a = 1) => { if (a <= 0) return; L.globalAlpha = a; L.fillStyle = col; L.beginPath(); pts.forEach(([x, y], i) => i ? L.lineTo(x, y) : L.moveTo(x, y)); L.closePath(); L.fill(); L.globalAlpha = 1; };
  // focal marker: paper disc with an ink ring (pops against dark mixes)
  K.focal = (x, y, r = 11, a = 1) => { if (a <= 0) return; L.globalAlpha = a; L.fillStyle = COL.paper; L.beginPath(); L.arc(x, y, r, 0, 7); L.fill(); L.lineWidth = 3; L.strokeStyle = COL.ink; L.stroke(); L.globalAlpha = 1; };
  // crosshair
  K.cross = (x, y, s = 14, o = {}) => { K.line(x - s, y, x + s, y, { w: 2, ...o }); K.line(x, y - s, x, y + s, { w: 2, ...o }); };

  // arrow along a polyline up to fraction f
  K.arrow = (pts, f = 1, o = {}) => {
    const P = pts.filter(Boolean); const a = o.a ?? 1;
    if (P.length < 2 || a <= 0 || f <= 0) return;
    const seg = []; let tot = 0;
    for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(l); tot += l; }
    let rem = tot * Math.min(1, f);
    stroke(o); L.beginPath(); L.moveTo(P[0][0], P[0][1]);
    let end = P[0], dir = [1, 0];
    for (let i = 1; i < P.length && rem > 0; i++) {
      const l = seg[i - 1], k = Math.min(1, rem / l);
      end = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k];
      dir = [(P[i][0] - P[i - 1][0]) / l, (P[i][1] - P[i - 1][1]) / l];
      L.lineTo(end[0], end[1]); rem -= l;
    }
    L.stroke(); L.setLineDash([]);
    const hd = o.head ?? 16, nx = -dir[1], ny = dir[0];
    L.fillStyle = o.col || COL.ink; L.beginPath();
    L.moveTo(end[0] + dir[0] * hd * 0.55, end[1] + dir[1] * hd * 0.55);
    L.lineTo(end[0] - dir[0] * hd + nx * hd * 0.55, end[1] - dir[1] * hd + ny * hd * 0.55);
    L.lineTo(end[0] - dir[0] * hd - nx * hd * 0.55, end[1] - dir[1] * hd - ny * hd * 0.55);
    L.closePath(); L.fill(); L.globalAlpha = 1;
  };

  // drafting dimension line between two points, offset perpendicular by `off`
  K.dim = (a, b, text, o = {}) => {
    const al = o.a ?? 1; if (al <= 0) return;
    const off = o.off ?? 30, col = o.col || COL.ink;
    const dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy) || 1, nx = -dy / Ln, ny = dx / Ln, ux = dx / Ln, uy = dy / Ln;
    const A = [a[0] + nx * off, a[1] + ny * off], B = [b[0] + nx * off, b[1] + ny * off], s = Math.sign(off || 1);
    L.globalAlpha = al; L.strokeStyle = col; L.lineWidth = 1.6; L.setLineDash([4, 5]);
    L.beginPath(); L.moveTo(a[0], a[1]); L.lineTo(A[0] + nx * 10 * s, A[1] + ny * 10 * s); L.moveTo(b[0], b[1]); L.lineTo(B[0] + nx * 10 * s, B[1] + ny * 10 * s); L.stroke();
    L.setLineDash([]); L.lineWidth = 2; L.beginPath(); L.moveTo(A[0], A[1]); L.lineTo(B[0], B[1]); L.stroke();
    L.lineWidth = 2.5; const tk = 9;
    for (const P of [A, B]) { L.beginPath(); L.moveTo(P[0] - (ux + nx) * tk, P[1] - (uy + ny) * tk); L.lineTo(P[0] + (ux + nx) * tk, P[1] + (uy + ny) * tk); L.stroke(); }
    if (text) {
      const sz = o.size || 26;
      L.font = `600 ${sz}px ${MONO}`; const tw = L.measureText(text).width;
      const cx = (A[0] + B[0]) / 2 + nx * (o.tOff ?? 0), cy = (A[1] + B[1]) / 2 + ny * (o.tOff ?? 0);
      L.fillStyle = COL.paper; L.fillRect(cx - tw / 2 - 10, cy - sz * 0.7, tw + 20, sz * 1.4);
      L.fillStyle = col; L.textAlign = 'center'; L.textBaseline = 'middle'; L.fillText(text, cx, cy + 1);
      L.textAlign = 'left'; L.textBaseline = 'alphabetic';
    }
    L.globalAlpha = 1;
  };

  // type. o: size, weight, col, align, font ('sans'|'mono'), a, track, base, hl (gold highlight block behind)
  K.text = (str, x, y, o = {}) => {
    const a = o.a ?? 1; if (a <= 0 || !str) return 0;
    const sz = o.size || 34, wt = o.weight || (o.font === 'mono' ? 500 : 700);
    L.font = `${wt} ${sz}px ${o.font === 'mono' ? MONO : SANS}`;
    L.letterSpacing = `${o.track || (o.font === 'mono' ? 0.1 : 0)}px`;   // non-zero spacing also disables mono ligatures (<| |> -> arrows)
    L.textAlign = o.align || 'left'; L.textBaseline = o.base || 'alphabetic';
    const w = L.measureText(str).width;
    if (o.hl) {   // flat gold block printed under a short phrase (goes on the color pass so ink overprints it)
      const bx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      const k = typeof o.hl === 'number' ? o.hl : 1;
      K.rect(bx - 10, y - sz * 0.82, (w + 20) * k, sz * 1.12, o.hlCol || COL.gold, a);
    }
    L.globalAlpha = a; L.fillStyle = o.col || COL.ink; L.fillText(str, x, y);
    L.globalAlpha = 1; L.letterSpacing = '0px'; L.textAlign = 'left'; L.textBaseline = 'alphabetic';
    return w;
  };
  K.measure = (str, o = {}) => { L.font = `${o.weight || (o.font === 'mono' ? 500 : 700)} ${o.size || 34}px ${o.font === 'mono' ? MONO : SANS}`; L.letterSpacing = `${o.track || (o.font === 'mono' ? 0.1 : 0)}px`; const w = L.measureText(str).width; L.letterSpacing = '0px'; return w; };
  // typewriter: show the first fraction f of str (with a caret while typing)
  K.type = (str, x, y, f, o = {}) => {
    const n = Math.floor(str.length * clamp(f) + 1e-6);
    const s = str.slice(0, n);
    const w = K.text(s, x, y, o);
    if (f > 0 && f < 1 && o.caret !== false) K.inkRect(x + w + 3, y - (o.size || 34) * 0.78, 3, (o.size || 34) * 0.95, o.col || COL.ink, o.a ?? 1);
    return w;
  };

  // chapter tag, top-left (like the house explainer): accent number + tracked caps + ink underline
  K.tag = (num, name, a = 1) => {
    if (a <= 0) return;
    const x = 84, y = 96;
    const nw = K.text(num, x, y, { size: 28, font: 'mono', weight: 600, col: COL.accent, a });
    const w = K.text(name, x + nw + 16, y, { size: 28, weight: 800, track: 4, a });
    K.inkRect(x, y + 14, nw + 16 + w, 2.5, COL.ink, a);
  };

  // ---------------- modality glyphs (color fill + misregistered line pass)
  // text page: ink-lined card
  K.gText = (x, y, s, a = 1, seed = 1, lines = 4) => {
    const w = s * 1.5, h = s * 1.9, [mx, my] = mis(seed);
    K.box(x - w / 2 + mx, y - h / 2 + my, w, h, { w: 2.5, a, r: 4 });
    for (let i = 0; i < lines; i++) { const lw = (i === lines - 1 ? 0.55 : 0.82) * w * 0.8; K.inkRect(x - w * 0.4, y - h * 0.32 + i * h * 0.19, lw, Math.max(3, s * 0.1), COL.ink, a); }
  };
  // code: </> card
  K.gCode = (x, y, s, a = 1, seed = 2) => {
    const w = s * 1.9, h = s * 1.5, [mx, my] = mis(seed);
    K.box(x - w / 2 + mx, y - h / 2 + my, w, h, { w: 2.5, a, r: 4 });
    K.text('</>', x, y + s * 0.22, { size: s * 0.72, font: 'mono', weight: 700, align: 'center', a });
  };
  // image: gold plate + mountain/sun line drawing
  K.gImage = (x, y, s, a = 1, seed = 3, col = COL.gold) => {
    const w = s * 2, h = s * 1.5, [mx, my] = mis(seed);
    K.rect(x - w / 2, y - h / 2, w, h, col, a);
    const ox = x - w / 2 + mx, oy = y - h / 2 + my;
    K.box(ox, oy, w, h, { w: 2.5, a });
    K.path([[ox + w * 0.08, oy + h * 0.86], [ox + w * 0.38, oy + h * 0.42], [ox + w * 0.58, oy + h * 0.7], [ox + w * 0.72, oy + h * 0.52], [ox + w * 0.92, oy + h * 0.86]], { w: 2.5, a });
    K.ring(ox + w * 0.74, oy + h * 0.28, s * 0.13, { w: 2.5, a });
  };
  // video: tint film strip with sprocket holes
  K.gVideo = (x, y, s, a = 1, seed = 4, col = COL.tint) => {
    const w = s * 2.1, h = s * 1.45, [mx, my] = mis(seed);
    K.rect(x - w / 2, y - h / 2, w, h, col, a);
    const ox = x - w / 2 + mx, oy = y - h / 2 + my;
    K.box(ox, oy, w, h, { w: 2.5, a });
    const n = 5, hw = w / n;
    for (let i = 0; i < n; i++) { K.inkRect(ox + i * hw + hw * 0.3, oy + h * 0.07, hw * 0.4, h * 0.1, COL.ink, a); K.inkRect(ox + i * hw + hw * 0.3, oy + h * 0.83, hw * 0.4, h * 0.1, COL.ink, a); }
    K.inkPoly([[ox + w * 0.43, oy + h * 0.33], [ox + w * 0.43, oy + h * 0.67], [ox + w * 0.62, oy + h * 0.5]], COL.ink, a);
  };
  // audio: accent waveform bars
  K.gAudio = (x, y, s, a = 1, seed = 5, col = COL.accent) => {
    const n = 9, bw = s * 0.16, gap = s * 0.08, tw = n * bw + (n - 1) * gap, r = rng(seed * 31);
    for (let i = 0; i < n; i++) {
      const hh = s * (0.3 + 1.25 * Math.abs(Math.sin(i * 1.3 + seed)) * (0.6 + 0.4 * r()));
      K.rect(x - tw / 2 + i * (bw + gap), y - hh / 2, bw, hh, col, a, bw / 2);
    }
    const [mx, my] = mis(seed);
    K.line(x - tw / 2 - s * 0.15 + mx, y + my, x + tw / 2 + s * 0.15 + mx, y + my, { w: 2.2, a });
  };
  K.glyph = (mod, x, y, s, a = 1, seed = 1) => ({ text: K.gText, code: K.gCode, image: K.gImage, video: K.gVideo, audio: K.gAudio })[mod](x, y, s, a, seed);
  // point-cloud marker per modality (shape + ink), so the kinds read without color
  K.marker = (mod, x, y, s, a = 1) => {
    if (mod === 'text' || mod === 'code') K.sq(x, y, s * 0.82, COL.ink, a);
    else if (mod === 'image') K.disc(x, y, s, COL.gold, a);
    else if (mod === 'video') K.diamond(x, y, s * 1.15, COL.tint, a);
    else if (mod === 'audio') K.tri(x, y, s * 1.2, COL.accent, a);
  };
  return K;
}

// ------------------------------------------------------------------ simple 3D projection for "embedding space" plates
// cam: {yaw, pitch, dist, f (focal px), cx, cy}
export function proj3(p, cam) {
  const [x, y, z] = p;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const x1 = x * cy - z * sy, z1 = x * sy + z * cy;          // yaw around y
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;         // pitch around x
  const d = cam.dist - z2;
  const k = cam.f / d;
  return { x: cam.cx + x1 * k, y: cam.cy - y2 * k, s: k / (cam.f / cam.dist), z: z2 };
}
