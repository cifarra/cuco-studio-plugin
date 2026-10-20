// Building kit: stage registry + part builders + procedural materials.
// Every visible piece is a "part" registered under a "stage" (a named build step).
// The engine animates stages in and out per beat; parts inside a stage appear in `key` order.
import * as THREE from 'three';
import * as TX from './textures.js';

export const COLORS = { bg: '#efe7d6', ink: '#29251e', coral: '#ff594e', green: '#446130', gold: '#e0bf6e', wood: '#e6c893', outline: 0.42 };
// Called by the engine with web/theme.json before building, so materials follow the style.
export function setTheme(t) {
  Object.assign(COLORS, { bg: t.bg, ink: t.ink, coral: t.accent, green: t.accent2, gold: t.gold || COLORS.gold, wood: t.wood || COLORS.wood, outline: t.outline ?? COLORS.outline, edge: t.edge_color || t.ink });
  KIND.mark.color = COLORS.coral;
  KIND.coralghost.color = COLORS.coral;
  for (const k of Object.values(KIND)) if (k.edge) k.edge = Math.min(1, k.edge * COLORS.outline / 0.42);
  // per-material overrides, e.g. {"concrete": {"color": "#1b2328"}, "wood": {"color": "#9fb4c4"}}.
  // color multiplies the texture, so a cool tint on a dark brand turns warm wood into a cool neutral.
  THEME_KINDS = t.kinds || {};
  for (const [k, v] of Object.entries(THEME_KINDS)) if (KIND[k]) Object.assign(KIND[k], v);
}
let THEME_KINDS = {};
// Scenes declare their own materials here (not by writing K.KIND directly), so each style's
// theme.json "kinds" can restyle them: same scene, different brand.
export function defineKinds(defs) {
  for (const [k, v] of Object.entries(defs)) KIND[k] = { ...v, ...(THEME_KINDS[k] || {}) };
}

export const stages = {};
// Per-stage entry animation: 'drop' (default, falls into place), 'grow' (rises from its base),
// 'fade', or 'none'. Set before building: ANIM.myStage = 'grow'.
export const ANIM = {};

function reg(stage, obj, key) {
  if (!stages[stage]) stages[stage] = { parts: [], anim: ANIM[stage] || 'drop' };
  stages[stage].parts.push(obj);
  obj.userData.stage = stage;
  obj.userData.key = key;
}

// ---------------------------------------------------------------- materials
let T = null;
export function initTextures() {
  T = {
    wood: [0, 1, 2, 3].map(i => TX.woodSide(COLORS.wood, 11 + i)),
    woodEnd: [0, 1].map(i => TX.woodEnd('#e9cd9a', 31 + i)),
    osb: [0, 1, 2].map(i => TX.osb('#d9b67c', 71 + i)),
    ply: [0, 1, 2].map(i => TX.plywood('#dcc79c', 81 + i)),
    concrete: TX.noise('#c9c3b7', 91, 9000, '70,65,60', '255,255,250', 30),
    soil: TX.noise('#a98361', 92, 8000, '70,45,25', '220,190,150', 60),
    grass: TX.noise('#7d9950', 94, 9000, '50,70,30', '190,210,130', 0),
    flake: TX.flake(),
  };
  return T;
}

// su/sv = feet of surface covered by one texture tile (keeps texel density real-scale).
// edge = opacity of the ink outline (the "illustrated" look). ghost = translucent helper volume.
export const KIND = {
  wood: { tex: 'wood', end: 'woodEnd', color: '#ffffff', rough: 0.82, su: 4, sv: 1, edge: 0.42, jitter: true },
  osb: { tex: 'osb', color: '#ffffff', rough: 0.9, su: 4, sv: 4, edge: 0.4, jitter: true },
  ply: { tex: 'ply', color: '#ffffff', rough: 0.9, su: 4, sv: 8, edge: 0.5, jitter: true },
  concrete: { tex: 'concrete', color: '#ffffff', rough: 0.95, su: 6, sv: 6, edge: 0.3 },
  soil: { tex: 'soil', color: '#ffffff', rough: 1, su: 8, sv: 8, edge: 0.18 },
  grass: { tex: 'grass', color: '#ffffff', rough: 1, su: 8, sv: 8, edge: 0 },
  steel: { color: '#6d737b', rough: 0.5, metal: 0.25, edge: 0.3 },   // keep metalness low: no env map
  metal: { color: '#c9ced4', rough: 0.4, metal: 0.2, edge: 0.45 },
  paint: { color: '#f4f1e9', rough: 0.95, edge: 0.35 },
  ghost: { color: '#fff8ee', rough: 1, edge: 0.55, ghost: 0.45 },
  coralghost: { color: '#ff594e', rough: 1, edge: 0.9, ghost: 0.28 },
  mark: { color: '#ff594e', rough: 1, edge: 0 },
};

let seedCounter = 1;
function makeMat(kind, r) {
  const k = KIND[kind];
  const pick = arr => Array.isArray(arr) ? arr[Math.floor(r() * arr.length)] : arr;
  const col = new THREE.Color(k.color).multiplyScalar(k.jitter ? 0.9 + r() * 0.14 : 1);
  const mk = map => {
    const m = new THREE.MeshStandardMaterial({ color: col.clone(), roughness: k.rough, metalness: k.metal || 0, map, emissive: new THREE.Color(k.emissive || '#000') });
    m.userData.baseColor = m.color.clone();
    m.userData.baseEmissive = m.emissive.clone();
    if (k.ghost) m.userData.ghostBase = k.ghost;
    return m;
  };
  const side = mk(k.tex ? pick(T[k.tex]) : null);
  return k.end ? [side, mk(pick(T[k.end]))] : side;
}

// World-scale box UVs; grain (u) runs along the longest axis, end faces get end grain.
function boxUV(geo, long, su, sv, off) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const na = n[0] > 0.5 ? 0 : n[1] > 0.5 ? 1 : 2;
    let ua, va;
    if (na !== long) { ua = long; va = [0, 1, 2].find(a => a !== na && a !== long); }
    else { const o = [0, 1, 2].filter(a => a !== na); ua = o[0]; va = o[1]; }
    uv.setXY(i, p[ua] / su + off, p[va] / sv + off * 2.3);
  }
}

// UVs for arbitrary geometry (extrusions) with grain along dirU.
export function dirUV(geo, dirU, su, sv, off) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), a = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    if (Math.abs(n.dot(dirU)) > 0.97) { uv.setXY(i, p.x / su, p.y / sv); continue; }
    a.crossVectors(n, dirU).normalize();
    uv.setXY(i, p.dot(dirU) / su + off, p.dot(a) / sv + off * 2.3);
  }
}

function addEdges(mesh, kind) {
  const e = KIND[kind].edge;
  if (!e) return;
  const lm = new THREE.LineBasicMaterial({ color: COLORS.edge || COLORS.ink, transparent: true, opacity: e });
  lm.userData.base = e;
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), lm);
  mesh.add(lines);
  mesh.userData.edge = lines;
}

export function finishMesh(mesh, stage, key, kind, parent, ud) {
  mesh.castShadow = !KIND[kind].ghost;
  mesh.receiveShadow = true;
  parent.add(mesh);
  addEdges(mesh, kind);
  Object.assign(mesh.userData, ud || {});
  mesh.userData.kind = kind;
  mesh.userData.basePos = mesh.position.clone();
  mesh.userData.baseScale = mesh.scale.clone();
  reg(stage, mesh, key);
  return mesh;
}

// Axis-aligned box from ranges. `key` orders the build inside the stage (equal keys animate together).
export function box(stage, key, [x0, x1], [y0, y1], [z0, z1], kind, parent, ud) {
  const dims = [x1 - x0, y1 - y0, z1 - z0];
  const geo = new THREE.BoxGeometry(...dims);
  const long = dims.indexOf(Math.max(...dims));
  const r = TX.rng(seedCounter++), k = KIND[kind];
  boxUV(geo, long, k.su || 4, k.sv || 4, r() * 10);
  let mat = makeMat(kind, r);
  if (Array.isArray(mat)) { const [side, end] = mat; mat = [0, 1, 2, 3, 4, 5].map(i => (Math.floor(i / 2) === long ? end : side)); }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.userData.h = dims[1];
  return finishMesh(mesh, stage, key, kind, parent, ud);
}

// A board from p0 to p1 (centerline); `h` measured in the vertical plane, `w` = thickness.
export function lumber(stage, key, p0, p1, h, w, kind, parent, ud) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
  const dir = b.clone().sub(a); const L = dir.length(); dir.normalize();
  let hv = new THREE.Vector3(0, 1, 0).sub(dir.clone().multiplyScalar(dir.y));
  if (hv.length() < 1e-3) hv = new THREE.Vector3(1, 0, 0); hv.normalize();
  const geo = new THREE.BoxGeometry(L, h, w);
  const r = TX.rng(seedCounter++), k = KIND[kind];
  boxUV(geo, 0, k.su || 4, k.sv || 4, r() * 10);
  let mat = makeMat(kind, r);
  if (Array.isArray(mat)) { const [side, end] = mat; mat = [end, end, side, side, side, side]; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, hv, new THREE.Vector3().crossVectors(dir, hv)));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.userData.h = h;
  return finishMesh(mesh, stage, key, kind, parent, ud);
}

export function cyl(stage, key, x, z, y0, y1, r, kind, parent, seg = 20, ud) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, seg), makeMat(kind, TX.rng(seedCounter++)));
  mesh.position.set(x, (y0 + y1) / 2, z);
  mesh.userData.h = y1 - y0;
  return finishMesh(mesh, stage, key, kind, parent, ud);
}

// Profile (list of [u, v] points in a vertical plane) extruded along x by `depth`.
// Great for rafters with bird's-mouth cuts, stair stringers, trusses gussets, etc.
export function profile(stage, key, pts, depth, x, kind, parent, grainDir, ud) {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2); // shape u -> world z, v -> world y, extrusion -> world -x
  geo.translate(depth / 2, 0, 0);
  geo.computeVertexNormals();
  const r = TX.rng(seedCounter++);
  dirUV(geo, grainDir || new THREE.Vector3(0, 0, 1), KIND[kind].su || 4, KIND[kind].sv || 1, r() * 10);
  const m = makeMat(kind, r);
  const mesh = new THREE.Mesh(geo, Array.isArray(m) ? m[0] : m);
  mesh.position.x = x;
  mesh.userData.h = 1;
  return finishMesh(mesh, stage, key, kind, parent, ud);
}

// Call once after building: ranks parts by unique key so equal keys animate together.
export function finalizeStages() {
  for (const st of Object.values(stages)) {
    st.parts.sort((a, b) => a.userData.key - b.userData.key);
    const keys = [...new Set(st.parts.map(p => p.userData.key))];
    const rank = new Map(keys.map((k, i) => [k, i]));
    st.parts.forEach(p => { p.userData.k = rank.get(p.userData.key); });
    st.n = keys.length;
  }
}
