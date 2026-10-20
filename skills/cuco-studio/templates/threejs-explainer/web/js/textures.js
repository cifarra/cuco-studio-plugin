import * as THREE from 'three';

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Long-grain face texture: grain runs along u. 1024px = 4 ft, 256px = 1 ft.
export function woodSide(base, seed, pt = false) {
  const W = 1024, H = 256, c = canvas(W, H), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) {
    const y = r() * H, h = 8 + r() * 36;
    g.fillStyle = r() < 0.5 ? `rgba(120,80,30,${0.04 + r() * 0.06})` : `rgba(255,245,220,${0.05 + r() * 0.07})`;
    g.fillRect(0, y, W, h);
  }
  for (let i = 0; i < 55; i++) {
    const y0 = r() * H, a = 0.05 + r() * 0.12;
    g.strokeStyle = `rgba(105,65,25,${a})`;
    g.lineWidth = 0.6 + r() * 1.8;
    g.beginPath();
    const amp = 1 + r() * 5, fr = 0.002 + r() * 0.008, ph = r() * 6;
    for (let x = -16; x <= W + 16; x += 16) {
      const y = y0 + Math.sin(x * fr + ph) * amp;
      x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const x = r() * W, y = r() * H;
    for (let k = 7; k > 0; k--) {
      g.strokeStyle = `rgba(95,55,20,${0.06 + 0.05 * k / 7})`;
      g.lineWidth = 1.3;
      g.beginPath(); g.ellipse(x, y, k * 5, k * 1.8, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(90,50,18,.45)';
    g.beginPath(); g.ellipse(x, y, 6, 3, 0, 0, Math.PI * 2); g.fill();
  }
  if (pt) {
    // incising marks typical of pressure-treated lumber
    g.fillStyle = 'rgba(60,70,40,0.35)';
    for (let i = 0; i < 260; i++) g.fillRect(r() * W, r() * H, 5, 1.5);
  }
  return finish(c);
}

// End grain: growth rings.
export function woodEnd(base, seed) {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const cx = S * (0.3 + r() * 0.4), cy = S * (1.1 + r() * 0.5);
  for (let k = 0; k < 60; k++) {
    g.strokeStyle = `rgba(110,65,25,${0.1 + r() * 0.18})`;
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath(); g.arc(cx, cy, 20 + k * 9 + r() * 3, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = 'rgba(80,45,15,0.08)'; g.fillRect(0, 0, S, S);
  return finish(c);
}

export function osb(base, seed) {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {
    const x = r() * S, y = r() * S, w = 18 + r() * 46, h = 5 + r() * 12, a = r() * Math.PI;
    const d = r();
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = d < 0.33 ? `rgba(160,120,65,${0.1 + r() * 0.16})` : d < 0.66 ? `rgba(245,222,175,${0.14 + r() * 0.2})` : `rgba(130,92,45,${0.06 + r() * 0.12})`;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  }
  return finish(c);
}

export function noise(base, seed, dots = 7000, dark = '60,55,50', light = '255,255,250', pebbles = 0) {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < dots; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(${dark},${0.05 + r() * 0.12})` : `rgba(${light},${0.05 + r() * 0.12})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * S, r() * S, s, s);
  }
  for (let i = 0; i < pebbles; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? dark : light},${0.2 + r() * 0.25})`;
    g.beginPath(); g.ellipse(r() * S, r() * S, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, Math.PI * 2); g.fill();
  }
  return finish(c);
}

export function flake() {
  const S = 64, c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return finish(c, false);
}

// Plywood face veneer: broad, soft "cathedral" figure.
export function plywood(base, seed) {
  const S = 1024, c = canvas(S, S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let band = 0; band < 3; band++) {
    const cx = S * (0.15 + r() * 0.7);
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = `rgba(150,105,55,${0.05 + r() * 0.09})`;
      g.lineWidth = 2 + r() * 5;
      g.beginPath();
      const w = 20 + k * 22, top = S * (0.2 + r() * 0.3);
      for (let y = S; y >= -10; y -= 12) {
        const spread = y > top ? w : w * Math.max(0.05, (y - top + 200) / 200);
        const x = cx + Math.sin(y * 0.004 + band) * 18 - spread;
        y === S ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,240,210,${0.04 + r() * 0.06})`;
    g.fillRect(r() * S, 0, 10 + r() * 60, S);
  }
  return finish(c);
}
