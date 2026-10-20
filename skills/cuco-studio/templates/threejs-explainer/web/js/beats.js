// EXAMPLE beats. One beat = one narrated storyboard section = one rendered clip.
// All times are normalized 0..1 over the narration duration of that section.
//
//   upto:   'stage'          every stage in `order` up to and including this one is fully built
//   show / hide: [stages]    force special (non-cumulative) stages on / off
//   build:  {stage: [t0,t1]} animate a stage in over that window (parts stagger by key)
//   ghost:  {stage: 0.2 | t=>...}  translucency (see through walls, swap alternatives)
//   hl:     [{stage, where: ud=>bool, t:[in0,in1, out0?, out1?]}]  coral highlight
//   k:      camera dolly factor (>1 pulls back). Start at ~1.2; tight shots feel cramped in the style card.
//   cam:    [[t, [pos], [target], fov], ...]  eased keyframes. EVERY BEAT BOUNDARY IS A CUT: open each beat on a
//           shot clearly different from the previous beat's closing shot (size ≥2 steps, angle ≥30°, or new subject)
//           or it reads as a jump cut. ([0, 'prev'] copies the previous closing camera — only for one shot split in two.)
//   labels: [{t:[a,b], text, sub, at:[x,y,z] | ctx=>Vector3, dx, dy}]   leader-line callouts
//   dims:   [{t:[a,b], a, b, text, off}]   architectural dimension lines
//   hook(ctx)      move things (group rotations, scale, forceHide) — runs after transforms reset
//   draw(g, ctx)   custom 2D overlay (arrows, dashed lines, insets); use ctx.project(V(...))
//   chapter: ['01', 'NAME']  small tag in the top-left
import { LEG_H, TOP_T, IN } from './scene.js';
import * as OV from './overlay.js';

export const BEATS = {
  b01: {
    upto: 'floor', build: { legs: [0.05, 0.4], aprons: [0.45, 0.8] }, chapter: ['01', 'FRAME'], k: 1.2,
    cam: [[0, [7, 4, 8], [0, 1.2, 0], 35], [1, [5, 3.5, 9], [0, 1.2, 0], 35]],
    labels: [
      { t: [0.3, 1], text: 'LEGS', sub: '4×4 posts', at: [-2.5, 1.5, 1.1], dx: -80, dy: -90 },
      { t: [0.7, 1], text: 'APRON', sub: '2×4 on edge', at: [0, LEG_H - 2 * IN, 1.25], dx: 80, dy: -90 },
    ],
    dims: [{ t: [0.35, 1], a: [2.8, 0, 1.3], b: [2.8, LEG_H, 1.3], text: '34 in', off: -40 }],
  },
  b02: {
    upto: 'aprons', build: { top: [0.1, 0.3], ghostload: [0.5, 0.62] }, chapter: ['02', 'TOP'], k: 1.2,
    hl: [{ stage: 'aprons', t: [0.6, 0.7] }],
    // b01 closes wide from the front-right; b02 opens as a close-up from the left (size ×2+, angle 60°+): a clean cut
    cam: [[0, [-2.6, 2.0, 1.4], [0.6, 1.2, 0.2], 35], [1, [-3.6, 2.6, 3.0], [0, 1.2, 0], 35]],
    labels: [{ t: [0.3, 1], text: 'PLYWOOD TOP', sub: '¾ in', at: [1, LEG_H + TOP_T, 0.5], dx: 70, dy: -100 }],
    draw(g, c) {
      const a = c.t > 0.55 ? 1 : 0;
      OV.arrow(g, [c.project(c.V(0, LEG_H + 2.2, 0)), c.project(c.V(0, LEG_H + 1.25, 0))], c.ramp(c.t, 0.55, 0.7), OV.INK, 5, a, 18);
    },
  },
};
