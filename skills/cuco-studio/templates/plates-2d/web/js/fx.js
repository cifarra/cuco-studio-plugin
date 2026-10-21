// Figure helpers built on the print kit: envelopes, waveforms, film strips, braces, vector cells,
// a 3D point space, line icons, chips. Add your own per video next to them.
import { COL, rng, clamp, ramp, eout, eio, smooth, lerp, mis, proj3, back } from './print.js';

// appear envelope: 0 -> 1 starting at t0 (seconds) over d
export const A = (T, t0, d = 0.45) => eout(ramp(T, t0, t0 + d));
// in at t0, out at t1
export const F = (T, t0, t1, d = 0.35) => Math.min(A(T, t0, d), 1 - ramp(T, t1 - d, t1));
export const pop = (T, t0, d = 0.5) => { const k = clamp((T - t0) / d); return k <= 0 ? 0 : back(k); };
export const fmt = n => Math.round(n).toLocaleString('en-US');

// waveform bars centered on y
export function wave(K, x, y, w, h, n, seed, col, a = 1, T = 0, live = 0, reveal = 1) {
  const r = rng(seed), step = w / n, bw = Math.max(2, step * 0.6);
  const m = Math.floor(n * clamp(reveal) + 1e-6);
  for (let i = 0; i < m; i++) {
    const env = Math.pow(Math.abs(Math.sin(i * 0.23 + seed) * Math.sin(i * 0.071 + seed * 1.7)), 0.6);
    const base = 0.16 + 0.84 * env * (0.45 + 0.55 * r());
    const lv = live ? (0.7 + 0.3 * Math.sin(T * 8 + i * 0.9 + seed)) : 1;
    const hh = Math.max(4, h * base * lv);
    K.rect(x + i * step, y - hh / 2, bw, hh, col, a, bw / 2);
  }
}

// film strip; returns frame rects [x, y, w, h] (line-pass coords)
export function film(K, x, y, w, h, n, a = 1, o = {}) {
  if (a <= 0) return [];
  K.rect(x, y, w, h, o.col || COL.tint, a);
  const [mx, my] = mis(o.seed || 9);
  K.box(x + mx, y + my, w, h, { w: 2.2, a });
  const holes = n * 3, hw = Math.min(12, w / holes * 0.45);
  for (let i = 0; i < holes; i++) {
    const hx = x + mx + (i + 0.5) * w / holes - hw / 2;
    K.inkRect(hx, y + my + h * 0.05, hw, h * 0.075, COL.ink, a, 1.5);
    K.inkRect(hx, y + my + h * 0.875, hw, h * 0.075, COL.ink, a, 1.5);
  }
  const fw = w / n, out = [];
  for (let i = 0; i < n; i++) {
    const r = [x + mx + i * fw + fw * 0.07, y + my + h * 0.19, fw * 0.86, h * 0.62];
    K.box(...r, { w: 1.8, a });
    o.scene?.(i, ...r);
    out.push(r);
  }
  return out;
}

// tiny scene inside a frame: horizon + hill/sun variations (line pass)
export function miniScene(K, i, x, y, w, h, a = 1) {
  const r = rng(100 + i), hz = y + h * (0.55 + r() * 0.2);
  K.path([[x + 4, hz], [x + w * (0.3 + r() * 0.2), hz - h * (0.15 + r() * 0.2)], [x + w * 0.7, hz - h * 0.05], [x + w - 4, hz]], { w: 1.8, a });
  if (r() > 0.4) K.ring(x + w * (0.2 + r() * 0.6), y + h * 0.25, h * 0.09, { w: 1.6, a });
}

// horizontal curly brace from x0..x1 at y, tip pointing down by h (negative h = up)
export function brace(K, x0, x1, y, h, o = {}) {
  const pts = [], n = 60, Wd = x1 - x0, r = Math.min(Math.abs(Wd) * 0.12, 40);
  for (let i = 0; i <= n; i++) {
    const u = i / n, X = x0 + Wd * u, d = Math.min(u, 1 - u) * Wd;
    const e = smooth(clamp(d / r)), tip = smooth(clamp(1 - Math.abs(u - 0.5) * Wd / r));
    pts.push([X, y + h * 0.5 * e + h * 0.5 * tip]);
  }
  K.path(pts, { w: 2.4, ...o });
}
// vertical brace from y0..y1 at x, tip pointing right by h
export function vbrace(K, x, y0, y1, h, o = {}) {
  const pts = [], n = 60, Hd = y1 - y0, r = Math.min(Math.abs(Hd) * 0.12, 40);
  for (let i = 0; i <= n; i++) {
    const u = i / n, Y = y0 + Hd * u, d = Math.min(u, 1 - u) * Hd;
    const e = smooth(clamp(d / r)), tip = smooth(clamp(1 - Math.abs(u - 0.5) * Hd / r));
    pts.push([x + h * 0.5 * e + h * 0.5 * tip, Y]);
  }
  K.path(pts, { w: 2.4, ...o });
}

// a vector drawn as a strip of cells, tint = |value|; horizontal (dir='h') or vertical
export function cells(K, x, y, n, cw, ch, val, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return;
  const gap = o.gap ?? 3, m = Math.floor(n * clamp(o.reveal ?? 1) + 1e-6), vert = o.dir === 'v';
  for (let i = 0; i < m; i++) {
    const v = val(i), col = v >= 0 ? (o.pos || COL.accent) : (o.neg || COL.ink);
    const al = (o.flat ? 1 : 0.18 + 0.82 * Math.min(1, Math.abs(v))) * a * (o.fade ? o.fade(i) : 1);
    if (vert) K.rect(x, y + i * ch, cw, ch - gap, col, al); else K.rect(x + i * cw, y, cw - gap, ch, col, al);
  }
  if (o.frame !== false && m > 0) {
    const [mx, my] = mis(o.seed || 3);
    if (vert) K.box(x - 5 + mx, y - 5 + my, cw + 10, m * ch - gap + 10, { w: 2, a });
    else K.box(x - 5 + mx, y - 5 + my, m * cw - gap + 10, ch + 10, { w: 2, a });
  }
}
// pseudo-random but smooth values for a vector
export const vecVals = seed => { const r = rng(seed); const v = Array.from({ length: 900 }, () => (r() * 2 - 1) * (0.35 + 0.65 * r())); return i => v[i % v.length]; };

// ---------------------------------------------------------------- 3D embedding space
export function cube(K, cam, s = 1.4, a = 0.35) {
  const c = [-s, s], V = [];
  for (const x of c) for (const y of c) for (const z of c) V.push([x, y, z]);
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [i, j] of E) { const p = proj3(V[i], cam), q = proj3(V[j], cam); K.dashed([[p.x, p.y], [q.x, q.y]], { a, w: 1.6 }); }
}
export function axes3(K, cam, s = 1.4, a = 0.6) {
  const cols = [COL.accent, COL.accent2, COL.gold];
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((d, k) => {
    const p = proj3(d.map(v => -v * s), cam), q = proj3(d.map(v => v * s), cam);
    K.dashed([[p.x, p.y], [q.x, q.y]], { a, w: 2, col: cols[k] });
    K.arrow([[lerp(p.x, q.x, 0.9), lerp(p.y, q.y, 0.9)], [q.x, q.y]], 1, { a, w: 2, col: cols[k], head: 13 });
  });
}
// cluster point sets: returns [{p:[x,y,z], from:[...], mod, c}]
export function cloud(seed, centers, per, spread = 0.22, mods = null) {
  const r = rng(seed), out = [];
  centers.forEach((c, ci) => {
    for (let i = 0; i < per; i++) {
      const g = () => (r() + r() + r() - 1.5) * spread * 1.4;
      out.push({ p: [c[0] + g(), c[1] + g(), c[2] + g()], from: [(r() * 2 - 1) * 1.3, (r() * 2 - 1) * 1.3, (r() * 2 - 1) * 1.3], c: ci, i, mod: mods ? mods[(i + ci) % mods.length] : 'text', k: r() });
    }
  });
  return out;
}
export const mixP = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// magnifier / lock / cloud / phone line icons
export function iconMag(K, x, y, s, a = 1) { K.ring(x - s * 0.15, y - s * 0.15, s * 0.5, { w: 3, a }); K.line(x + s * 0.22, y + s * 0.22, x + s * 0.62, y + s * 0.62, { w: 5, a }); }
export function iconLock(K, x, y, s, a = 1, col) {
  if (col) K.rect(x - s * 0.55, y - s * 0.1, s * 1.1, s * 0.8, col, a, 4);
  const [mx, my] = mis(77);
  K.box(x - s * 0.55 + mx, y - s * 0.1 + my, s * 1.1, s * 0.8, { w: 3, a, r: 4 });
  K.ring(x + mx, y - s * 0.1 + my, s * 0.34, { w: 3, a, a0: Math.PI, a1: Math.PI * 2 });
  K.line(x - s * 0.34 + mx, y - s * 0.1 + my, x - s * 0.34 + mx, y - s * 0.12 + my, { w: 3, a });
  K.inkDisc(x + mx, y + s * 0.25 + my, s * 0.09, COL.ink, a);
}
export function iconCloud(K, x, y, s, a = 1, o = {}) {
  K.ring(x - s * 0.45, y + s * 0.1, s * 0.35, { w: 3, a, a0: Math.PI * 0.5, a1: Math.PI * 1.5, ...o });
  K.ring(x - s * 0.05, y - s * 0.12, s * 0.5, { w: 3, a, a0: Math.PI * 1.05, a1: Math.PI * 1.95, ...o });
  K.ring(x + s * 0.5, y + s * 0.08, s * 0.37, { w: 3, a, a0: Math.PI * 1.5, a1: Math.PI * 2.5, ...o });
  K.line(x - s * 0.45, y + s * 0.45, x + s * 0.5, y + s * 0.45, { w: 3, a, ...o });
}
export function iconX(K, x, y, s, a = 1, col = COL.accent) { K.line(x - s, y - s, x + s, y + s, { w: 6, a, col }); K.line(x - s, y + s, x + s, y - s, { w: 6, a, col }); }
export function iconCheck(K, x, y, s, a = 1, col = COL.accent2) { K.path([[x - s, y], [x - s * 0.3, y + s * 0.7], [x + s, y - s * 0.8]], { w: 6, a, col }); }

// mono chip: text inside a hairline rounded box (no fill — line only)
export function chip(K, str, x, y, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return 0;
  const sz = o.size || 28, f = o.font || 'mono';
  const w = K.measure(str, { size: sz, font: f, weight: o.weight });
  const bx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  if (o.fill) K.rect(bx - 16, y - sz * 0.95, w + 32, sz * 1.5, o.fill, a * (o.fillA ?? 1), 8);
  const [mx, my] = o.fill ? mis(o.seed || 41) : [0, 0];
  if (o.box !== false) K.box(bx - 16 + mx, y - sz * 0.95 + my, w + 32, sz * 1.5, { w: 2, a, r: 8, col: o.boxCol });
  K.text(o.typed != null ? str.slice(0, Math.floor(str.length * clamp(o.typed))) : str, bx, y, { size: sz, font: f, col: o.col, a, weight: o.weight });
  return w + 32;
}
