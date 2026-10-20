// Frame-deterministic explainer engine. render(t) is a pure function of (beat, t):
// every frame is computed from scratch, so frames can be rendered in any order / in parallel.
// URL params: ?beat=b01&dur=12.3&pr=2&w=1620&h=1080
import * as THREE from 'three';
import * as K from './kit.js';
import * as OV from './overlay.js';
import * as SCENE from './scene.js';
import { BEATS } from './beats.js';

const THEME = await (await fetch(new URL('../theme.json', import.meta.url))).json();
K.setTheme(THEME); OV.setTheme(THEME);
for (const f of THEME.fonts || []) {           // brand typefaces copied from the style (style_brief.py --apply)
  // variable fonts: give a weight range ("weight": "200 700") so bold is real, not synthesized
  const face = new FontFace(f.family, `url(${new URL('../' + f.url, import.meta.url)})`, { weight: f.weight || 'normal' });
  document.fonts.add(await face.load());
}

const P = new URLSearchParams(location.search);
const W = +(P.get('w') || THEME.width || 1620), H = +(P.get('h') || THEME.height || 1080), PR = +(P.get('pr') || 2);
const BEAT = P.get('beat') || Object.keys(BEATS)[0];
const DUR = +(P.get('dur') || 12);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(PR);            // render at 2x, downsample on output = clean AA
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.style.background = THEME.bg;
document.getElementById('stage').appendChild(renderer.domElement);

const ov = document.createElement('canvas');   // 2D annotation layer
ov.width = W * PR; ov.height = H * PR;
ov.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
document.getElementById('stage').appendChild(ov);
const g = ov.getContext('2d');
const out = document.createElement('canvas');   // composite for capture
out.width = W; out.height = H;
const og = out.getContext('2d');

const scene = new THREE.Scene();
scene.background = new THREE.Color(K.COLORS.bg);
if (THEME.bg_glow) {   // soft radial glow over the bg color, like many style posters: {color, x, y, r} in 0..1 of frame
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const gg = c.getContext('2d'), gl = THEME.bg_glow;
  gg.fillStyle = THEME.bg; gg.fillRect(0, 0, 512, 512);
  const rg = gg.createRadialGradient(gl.x * 512, gl.y * 512, 0, gl.x * 512, gl.y * 512, gl.r * 512);
  rg.addColorStop(0, gl.color); rg.addColorStop(1, THEME.bg);
  gg.fillStyle = rg; gg.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 2000);
scene.add(new THREE.HemisphereLight(THEME.sky_light || '#fff7ea', THEME.ground_light || '#b9a486', THEME.ambient ?? 1.35));
const sun = new THREE.DirectionalLight('#fff0dc', 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#e3ecff', 0.55);
scene.add(fill, fill.target);

K.initTextures();
const built = SCENE.build(scene, K, THEME);   // -> { refs, order, paperY, reset? }; use THEME for effect colors
K.finalizeStages();
const { stages } = K;
const refs = built.refs || {};
// scene scale knobs: how far parts fall in when built, and the shadow box half-size (world units)
const DROP = built.drop ?? 2.5;
if (built.shadow) Object.assign(sun.shadow.camera, { left: -built.shadow, right: built.shadow, top: built.shadow, bottom: -built.shadow });
sun.shadow.camera.updateProjectionMatrix();
const SUN_OFF = built.sunOffset || [-38, 70, 46];
const ORDER = built.order || [];

// shadow-catcher "paper" floor
const paper = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.16 }));
paper.rotation.x = -Math.PI / 2; paper.position.y = (built.paperY ?? 0) - 0.002; paper.receiveShadow = true;
scene.add(paper);

// ------------------------------------------------------------------ helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const eio = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eout = x => 1 - Math.pow(1 - x, 3);
const smooth = x => x * x * (3 - 2 * x);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CORAL = new THREE.Color(THEME.highlight || K.COLORS.coral);   // 3D highlight tint

// fade window for labels/dims, in normalized beat time; 0.35 s ramps
function envelope(t, [a, b], D) {
  const f = 0.35 / D;
  if (t < a || (b < 1 && t > b)) return 0;
  const i = a <= 0 ? 1 : clamp((t - a) / f), o = b >= 1 ? 1 : clamp((b - t) / f);
  return smooth(Math.min(i, o));
}

function project(v) {
  if (!v) return null;
  const p = v.clone().project(camera);
  if (p.z > 1) return null;
  return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H };
}

const parentUp = new Map();
function localUp(obj) {   // world-up in the parent's frame (so "drop" falls down even inside rotated groups)
  if (parentUp.has(obj.parent)) return parentUp.get(obj.parent);
  const q = new THREE.Quaternion(); obj.parent.getWorldQuaternion(q);
  const v = V(0, 1, 0).applyQuaternion(q.invert());
  parentUp.set(obj.parent, v);
  return v;
}

function setLook(mesh, o, h) {
  const mats = Array.isArray(mesh.material) ? [...new Set(mesh.material)] : [mesh.material];
  for (const m of mats) {
    const gb = m.userData.ghostBase, op = o * (gb ?? 1);
    const tr = op < 0.999;
    // three.js bakes OPAQUE into the shader: flipping `transparent` after first use needs a recompile
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = op; m.depthWrite = gb ? false : op > 0.5;
    if (m.userData.baseColor) {
      m.color.copy(m.userData.baseColor).lerp(CORAL, h * 0.72);
      m.emissive.copy(m.userData.baseEmissive).lerp(CORAL, h * 0.22);
    }
  }
  const e = mesh.userData.edge;
  if (e) { e.material.opacity = e.material.userData.base * o; e.visible = o > 0.02; }
  mesh.visible = o > 0.003;
  mesh.castShadow = o > 0.6 && !mats[0].userData.ghostBase;
}

function applyStages(state, hlFn) {
  parentUp.clear();
  for (const [name, st] of Object.entries(stages)) {
    const s = state[name];
    const n = st.n, w = n <= 1 ? 1 : Math.min(0.5, Math.max(0.05, 4 / n));
    for (const part of st.parts) {
      const ud = part.userData;
      const start = n <= 1 ? 0 : (ud.k / (n - 1)) * (1 - w);
      const q = s.p >= 1 ? 1 : s.p <= 0 ? 0 : clamp((s.p - start) / w);
      let alpha = q > 0 ? 1 : 0;
      if (st.anim === 'drop') {
        if (q > 0 && q < 1) part.position.addScaledVector(localUp(part), (1 - eout(q)) * DROP);
        alpha = smooth(clamp(q / 0.45));
      } else if (st.anim === 'grow') {
        const sc = Math.max(0.001, eio(q));
        part.scale.y = ud.baseScale.y * sc;
        part.position.y = ud.basePos.y - (1 - sc) * ud.h / 2;
      } else if (st.anim === 'fade') alpha = smooth(q);
      if (ud.forceHide) alpha = 0;
      if (ud.kind === 'pts') { part.visible = alpha * s.g > 0.01; part.material.opacity = alpha * s.g; continue; }
      setLook(part, alpha * s.g, Math.max(s.h, hlFn(part)));
    }
  }
}

function cameraAt(k, t) {
  if (t <= k[0][0]) return k[0];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, p0, g0, f0 = 35] = k[i - 1], [t1, p1, g1, f1 = 35] = k[i];
      const e = eio(clamp((t - t0) / (t1 - t0)));
      const L = (a, b) => a.map((v, j) => v + (b[j] - v) * e);
      return [t, L(p0, p1), L(g0, g1), f0 + (f1 - f0) * e];
    }
  }
  return k[k.length - 1];
}

// ------------------------------------------------------------------ frame
// Camera keys are normalized to absolute positions (the beat's dolly `k` baked in). A key with 'prev'
// copies the previous beat's final framing, which at a section boundary produces a JUMP CUT (Cuco
// cuts between sections). Use it only when one continuous shot is deliberately split across beats.
const ORDER_BEATS = Object.keys(BEATS);
function absCam(id, depth = 0) {
  const sp = BEATS[id], k = sp.k || 1, i = ORDER_BEATS.indexOf(id);
  return sp.cam.map(key => {
    if (key[1] === 'prev') {
      if (i <= 0 || depth > 40) throw new Error(`beat ${id}: 'prev' camera but no previous beat`);
      const last = absCam(ORDER_BEATS[i - 1], depth + 1).at(-1);
      return [key[0], last[1], last[2], last[3]];
    }
    const [t, p, g, f = 35] = key;
    return [t, p.map((v, j) => g[j] + (v - g[j]) * k), g, f];
  });
}
const spec = BEATS[BEAT];
const CAM = absCam(BEAT);
const ctx = { THREE, K, OV, V, ramp, eio, eout, smooth, clamp, refs, stages, W, H, project };

function render(tSec) {
  const D = DUR, t = clamp(tSec / D);
  Object.assign(ctx, { t, T: tSec, D });

  // 1. stage state: p = build progress 0..1, g = ghost opacity, h = highlight
  const state = {};
  for (const name of Object.keys(stages)) state[name] = { p: 0, g: 1, h: 0 };
  if (spec.upto) { const idx = ORDER.indexOf(spec.upto); for (let i = 0; i <= idx; i++) state[ORDER[i]].p = 1; }
  for (const n of spec.show || []) state[n].p = 1;
  for (const n of spec.hide || []) state[n].p = 0;
  for (const [n, [a, b]] of Object.entries(spec.build || {})) state[n].p = ramp(t, a, b);
  for (const [n, v] of Object.entries(spec.ghost || {})) state[n].g = typeof v === 'function' ? v(t, ctx) : v;
  ctx.state = state;

  // 2. reset transforms, then let the beat hook move things (tilts, digs, splays...)
  for (const st of Object.values(stages)) for (const p of st.parts) {
    p.position.copy(p.userData.basePos); p.scale.copy(p.userData.baseScale); p.userData.forceHide = false;
  }
  built.reset?.(refs);
  spec.hook?.(ctx);
  scene.updateMatrixWorld(true);

  // 3. per-part visuals
  const hls = spec.hl || [];
  applyStages(state, part => {
    let h = 0;
    for (const hl of hls) {
      if (hl.stage !== part.userData.stage || (hl.where && !hl.where(part.userData))) continue;
      const [a, b, c, d] = hl.t;
      let v = ramp(t, a, b);
      if (c != null) v *= 1 - ramp(t, c, d);
      h = Math.max(h, v);
    }
    return h;
  });

  // 4. camera (k = dolly factor: >1 pulls back along the view ray)
  const [, p0, tgt, fov] = cameraAt(CAM, t);
  camera.position.set(...p0);
  ctx.pose = { pos: p0, tgt, fov };
  camera.lookAt(...tgt);
  camera.fov = fov; camera.updateProjectionMatrix();
  const tv = V(...tgt);
  sun.position.copy(tv).add(V(...SUN_OFF)); sun.target.position.copy(tv);   // light follows the subject
  fill.position.copy(tv).add(V(50, 20, -30)); fill.target.position.copy(tv);
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);

  // 5. 2D overlay
  g.setTransform(PR, 0, 0, PR, 0, 0);
  g.clearRect(0, 0, W, H);
  const resolve = a => (typeof a === 'function' ? a(ctx) : Array.isArray(a) ? V(...a) : a);
  for (const d of spec.dims || []) {
    const al = envelope(t, d.t, D);
    if (al > 0) OV.dim(g, project(resolve(d.a)), project(resolve(d.b)), d.text, d.off ?? 30, al, d.color);
  }
  spec.draw?.(g, ctx);
  for (const l of spec.labels || []) {
    const al = envelope(t, l.t, D);
    if (al > 0) OV.label(g, project(resolve(l.at)), l, al);
  }
  if (spec.chapter && THEME.chapter_tag !== false) OV.tag(g, spec.chapter[0], spec.chapter[1]);

  og.drawImage(renderer.domElement, 0, 0, W, H);
  og.drawImage(ov, 0, 0, W, H);
}

window.renderAt = (tSec, fmt = 'image/jpeg', q = 0.93) => { render(tSec); return out.toDataURL(fmt, q); };
window.__ctx = ctx;
// seam checker: camera pose + which stages are visible/ghosted at time t
window.__seam = tSec => {
  render(tSec);
  const vis = {};
  for (const [n, s] of Object.entries(ctx.state)) if (s.p > 0.02) vis[n] = +(s.g.toFixed(2));
  return { ...ctx.pose, vis, cut: spec.cut || null };   // spec.cut: declared seam type ('match' | 'action' | 'topic')
};   // debug: inspect ctx.state (per-stage p/g/h) from Playwright after renderAt()

await Promise.all([
  document.fonts.load(`${THEME.title_weight || 800} 40px "${THEME.display_font}"`), document.fonts.load(`${THEME.label_weight || 700} 40px "${THEME.display_font}"`),
  document.fonts.load(`600 40px "${THEME.mono_font}"`), document.fonts.load(`500 40px "${THEME.mono_font}"`),
]);
render(0);
window.READY = true;
