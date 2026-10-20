// 2D annotation layer drawn over the WebGL canvas.
// Colors/fonts come from web/theme.json (derived from the CucoStudio style) via setTheme().
export let INK = '#29251e', CORAL = '#ff594e', GREEN = '#446130', PAPER = '#fbf6ea', MUTED = '#6d6252', WATER = '#3f7fd0';
export let SANS = '"Red Hat Display", sans-serif', MONO = '"JetBrains Mono", monospace';
let LW = 700, TW = 800, TRACK = '0px', LSTYLE = 'box', LS = 32, SS = 21;
export function setTheme(t) {
  INK = t.ink; CORAL = t.accent; GREEN = t.accent2; PAPER = t.paper; MUTED = t.muted; WATER = t.water || WATER;
  SANS = `"${t.display_font}", sans-serif`; MONO = `"${t.mono_font}", monospace`;
  LW = t.label_weight || LW; TW = t.title_weight || TW; TRACK = `${t.label_tracking || 0}px`; LSTYLE = t.label_style || 'box'; LS = t.label_size || 32; SS = t.sub_size || 21;   // raise when the style shows media scaled down
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function tag(g, num, name) {
  g.save();
  g.globalAlpha = 1;
  g.font = `600 26px ${MONO}`;
  const x = 84, y = 92;
  g.fillStyle = CORAL; g.fillText(num, x, y);
  const nw = g.measureText(num).width;
  g.fillStyle = INK; g.font = `${TW} 26px ${SANS}`;
  g.letterSpacing = '4px';
  g.fillText(name, x + nw + 16, y);
  const w = g.measureText(name).width;
  g.letterSpacing = '0px';
  g.fillStyle = INK; g.fillRect(x, y + 14, nw + 16 + w, 2.5);
  g.restore();
}

export function title(g, text, sub, a, W, H) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  const x = 90, y = 190 - (1 - a) * 12;
  g.fillStyle = INK; g.font = `${TW} 82px ${SANS}`;
  const lines = text.split('\n');
  lines.forEach((l, i) => g.fillText(l, x, y + i * 88));
  g.fillStyle = CORAL; g.font = `600 26px ${MONO}`;
  g.fillText(sub, x + 4, y + lines.length * 88 + 8);
  g.restore();
}

export function label(g, p, o, a) {
  if (!p || a <= 0) return;
  const dx = o.dx ?? 70, dy = o.dy ?? -80;
  g.save(); g.globalAlpha = a; g.letterSpacing = TRACK;
  const ex = p.x + dx, ey = p.y + dy;
  // leader
  g.strokeStyle = INK; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(ex, ey); g.stroke();
  g.fillStyle = CORAL; g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  if (LSTYLE === 'underline') {       // brand treatment: text + thin underline, no box (e.g. Jessee)
    g.font = `${LW} ${LS}px ${SANS}`;
    const tw = g.measureText(o.text).width;
    let sw = 0; if (o.sub) { g.font = `500 ${SS}px ${MONO}`; sw = g.measureText(o.sub).width; }
    const w = Math.max(tw, sw), bx = dx >= 0 ? ex + 10 : ex - 10 - w;
    g.font = `${LW} ${LS}px ${SANS}`; g.lineJoin = 'round'; g.strokeStyle = PAPER; g.lineWidth = LS / 6; g.strokeText(o.text, bx, ey - LS * 0.2);   // halo for legibility over geometry
    g.fillStyle = o.color || INK; g.fillText(o.text, bx, ey - LS * 0.2);
    g.fillRect(bx, ey + LS * 0.15, tw, Math.max(2.5, LS / 13));
    if (o.sub) { g.font = `500 ${SS}px ${MONO}`; g.lineWidth = SS / 5; g.strokeText(o.sub, bx, ey + LS * 0.15 + SS * 1.35); g.fillStyle = MUTED; g.fillText(o.sub, bx, ey + LS * 0.15 + SS * 1.35); }
    g.restore();
    return;
  }
  // box
  g.font = `${LW} ${LS}px ${SANS}`;
  const tw = g.measureText(o.text).width;
  let sw = 0;
  if (o.sub) { g.font = `500 ${SS}px ${MONO}`; sw = g.measureText(o.sub).width; }
  const bw = Math.max(tw, sw) + 32, bh = o.sub ? LS + SS + 29 : LS + 22;
  const bx = dx >= 0 ? ex : ex - bw, by = ey - bh / 2;
  g.fillStyle = PAPER; rrect(g, bx, by, bw, bh, 6); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.fillStyle = o.color || INK; g.font = `${LW} ${LS}px ${SANS}`;
  g.fillText(o.text, bx + 16, by + LS * 1.2);
  if (o.sub) { g.fillStyle = MUTED; g.font = `500 ${SS}px ${MONO}`; g.fillText(o.sub, bx + 16, by + LS * 1.2 + SS * 1.4); }
  g.restore();
}

// Architectural dimension line between two screen points.
export function dim(g, a, b, text, off, al, color = INK) {
  if (!a || !b || al <= 0) return;
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const A = { x: a.x + nx * off, y: a.y + ny * off }, B = { x: b.x + nx * off, y: b.y + ny * off };
  g.save(); g.globalAlpha = al;
  g.strokeStyle = color; g.lineWidth = 2;
  // extension lines
  g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(A.x + nx * 8 * Math.sign(off || 1), A.y + ny * 8 * Math.sign(off || 1));
  g.moveTo(b.x, b.y); g.lineTo(B.x + nx * 8 * Math.sign(off || 1), B.y + ny * 8 * Math.sign(off || 1)); g.stroke();
  g.setLineDash([]);
  g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
  // ticks
  g.lineWidth = 3; g.strokeStyle = CORAL;
  const t = 9, ux = dx / L, uy = dy / L;
  for (const P of [A, B]) {
    g.beginPath(); g.moveTo(P.x - (ux + nx) * t, P.y - (uy + ny) * t); g.lineTo(P.x + (ux + nx) * t, P.y + (uy + ny) * t); g.stroke();
  }
  if (text) {
    g.font = `600 22px ${MONO}`;
    const tw = g.measureText(text).width;
    const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2;
    g.fillStyle = PAPER; rrect(g, cx - tw / 2 - 10, cy - 17, tw + 20, 34, 17); g.fill();
    g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = color; g.fillText(text, cx - tw / 2, cy + 8);
  }
  g.restore();
}

export function dashed(g, pts, color, width, a, dash = [14, 10]) {
  if (a <= 0) return;
  const P = pts.filter(Boolean);
  if (P.length < 2) return;
  g.save(); g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.lineCap = 'round';
  g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
  g.restore();
}

// Arrow along a polyline, drawn up to fraction `f` of its length.
export function arrow(g, pts, f, color, width, a, head = 16) {
  const P = pts.filter(Boolean);
  if (P.length < 2 || a <= 0 || f <= 0) return;
  const seg = []; let total = 0;
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); seg.push(l); total += l; }
  let rem = total * Math.min(1, f);
  g.save(); g.globalAlpha = a; g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(P[0].x, P[0].y);
  let end = P[0], dir = { x: 1, y: 0 };
  for (let i = 1; i < P.length && rem > 0; i++) {
    const l = seg[i - 1], k = Math.min(1, rem / l);
    end = { x: P[i - 1].x + (P[i].x - P[i - 1].x) * k, y: P[i - 1].y + (P[i].y - P[i - 1].y) * k };
    dir = { x: (P[i].x - P[i - 1].x) / l, y: (P[i].y - P[i - 1].y) / l };
    g.lineTo(end.x, end.y); rem -= l;
  }
  g.stroke();
  const nx = -dir.y, ny = dir.x;
  g.beginPath();
  g.moveTo(end.x + dir.x * head * 0.6, end.y + dir.y * head * 0.6);
  g.lineTo(end.x - dir.x * head + nx * head * 0.6, end.y - dir.y * head + ny * head * 0.6);
  g.lineTo(end.x - dir.x * head - nx * head * 0.6, end.y - dir.y * head - ny * head * 0.6);
  g.closePath(); g.fill();
  g.restore();
}

export function text(g, str, x, y, { size = 28, weight = 700, color = INK, font = SANS, align = 'left', a = 1, pill = false } = {}) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a; g.font = `${weight} ${size}px ${font}`; g.textAlign = align;
  if (pill) {
    const w = g.measureText(str).width;
    const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.fillStyle = PAPER; rrect(g, bx - 12, y - size, w + 24, size * 1.45, 8); g.fill();
    g.strokeStyle = color; g.lineWidth = 2; g.stroke();
  }
  g.fillStyle = color; g.fillText(str, x, y);
  g.restore();
}

// Small inset diagram: an unsheathed frame racks, a sheathed one stays square.
export function rackingInset(g, x, y, t, a) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  const w = 400, h = 200;
  g.fillStyle = PAPER; rrect(g, x, y, w, h, 10); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  const sk = Math.sin(t * Math.PI * 2) * 22;
  const fw = 110, fh = 110, y0 = y + 140;
  const frame = (ox, skew, sheathed) => {
    g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.moveTo(ox, y0); g.lineTo(ox + fw, y0); g.lineTo(ox + fw + skew, y0 - fh); g.lineTo(ox + skew, y0 - fh); g.closePath();
    if (sheathed) { g.fillStyle = 'rgba(210,171,111,0.85)'; g.fill(); }
    g.stroke();
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) { const f = i / 4; g.beginPath(); g.moveTo(ox + fw * f, y0); g.lineTo(ox + fw * f + skew, y0 - fh); g.stroke(); }
  };
  frame(x + 40, sk, false);
  frame(x + 240, 0, true);
  g.font = `600 18px ${MONO}`; g.fillStyle = CORAL; g.fillText('bare: racks', x + 44, y + 178);
  g.fillStyle = GREEN; g.fillText('sheathed: rigid', x + 222, y + 178);
  g.restore();
}
