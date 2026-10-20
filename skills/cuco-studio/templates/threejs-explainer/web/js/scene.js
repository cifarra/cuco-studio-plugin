// EXAMPLE scene: a workbench assembled piece by piece. Replace with your subject.
// Units are real-world (feet here). Build every piece with the kit and a stage name;
// `order` lists the cumulative build stages so a beat can say `upto: 'top'`.
import * as THREE from 'three';

export const IN = 1 / 12;
export const LEG_H = 34 * IN, TOP_T = 0.75 * IN;

export function build(scene, K) {
  K.ANIM.floor = 'none';
  K.ANIM.legs = 'grow';
  const refs = {};

  // a slab of "ground" to sit on (diorama look)
  K.box('floor', 0, [-5, 5], [-0.5, 0], [-3.5, 3.5], 'concrete', scene);

  // legs: 4x4 posts
  const L = 2.5, D = 1.1, s = 1.75 * IN;
  const legs = [[-L, -D], [L, -D], [L, D], [-L, D]];
  legs.forEach(([x, z], i) => K.box('legs', i, [x - s, x + s], [0, LEG_H], [z - s, z + s], 'wood', scene, { leg: i }));

  // aprons: 2x4 on edge between legs
  const AY = [LEG_H - 3.5 * IN, LEG_H];
  K.box('aprons', 0, [-L, L], AY, [-D - s, -D - s + 1.5 * IN], 'wood', scene);
  K.box('aprons', 1, [-L, L], AY, [D + s - 1.5 * IN, D + s], 'wood', scene);
  K.box('aprons', 2, [-L - s, -L - s + 1.5 * IN], AY, [-D, D], 'wood', scene);
  K.box('aprons', 3, [L + s - 1.5 * IN, L + s], AY, [-D, D], 'wood', scene);
  // a stretcher lower down, placed with lumber() to show sloped/arbitrary boards
  K.lumber('aprons', 4, [-L, 0.5, 0], [L, 0.5, 0], 3.5 * IN, 1.5 * IN, 'wood', scene);

  // top: plywood sheet
  K.box('top', 0, [-2.9, 2.9], [LEG_H, LEG_H + TOP_T], [-1.45, 1.45], 'ply', scene);

  // a ghost helper volume (e.g. "load" or "future part")
  K.box('ghostload', 0, [-1, 1], [LEG_H + TOP_T, LEG_H + TOP_T + 1.2], [-0.6, 0.6], 'coralghost', scene);
  K.ANIM.ghostload = 'fade';

  return { refs, order: ['floor', 'legs', 'aprons', 'top'], paperY: -0.5 };
}
