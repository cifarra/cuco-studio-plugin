// Example beats (a tiny "how a CucoStudio section works" explainer). Replace with your own.
// One beat = one storyboard section = one clip. draw(K, c) is called every frame:
//   K   = the print kit (print.js): color pass K.rect/disc/poly/band, line pass K.box/path/arrow/dim/text/type, glyphs
//   c.T = seconds since this beat's narration started (negative during the section's intro hold)
//   c.at('word', n) = when the nth occurrence of a word is spoken (script/words.json; evenly spread until aligned)
//   c.W, c.H = canvas size (the style's media slot aspect)
// Build what is being said: every entrance is keyed to its word. Keep the composition still between entrances.
// Split into beats1.js, beats2.js ... and merge here once a video has more than a handful of beats.
import { COL, MOD, ramp, eio, lerp, mis } from './print.js';
import { A, F, wave, film, miniScene, chip } from './fx.js';

export const BEATS = {
  // ------------------------------------------------------------ b01: four inks, one story
  b01: {
    scene: 'story',
    draw(K, c) {
      const T = c.T, w = c.at;
      K.text('Every video', 110, 400, { size: 112, weight: 800, a: A(T, -0.6) });
      K.text('starts as a story', 110, 520, { size: 112, weight: 800, a: A(T, -0.3), hl: eio(ramp(T, w('story') - 0.2, w('story') + 0.5)) });
      const cards = [['text', 'lines'], ['image', 'picture'], ['video', 'clip'], ['audio', 'voice']];
      cards.forEach(([m, word], i) => {
        const x = lerp(260, c.W - 260, i / 3), y = 800, a = A(T, w(word) - 0.15, 0.4);
        K.disc(x, y, 96, MOD[m], a * (m === 'text' ? 0.18 : 1));
        const [mx, my] = mis(i + 3); K.ring(x + mx, y + my, 96, { w: 2.4, a });
        K.glyph(m, x, y, 34, a, 5 + i);
        K.text(m, x, y + 150, { size: 26, font: 'mono', align: 'center', col: COL.mute, a });
      });
    },
  },

  // ------------------------------------------------------------ b02: say + show -> style -> shot
  b02: {
    scene: 'section', chapter: ['01', 'A SECTION'],
    draw(K, c) {
      const T = c.T, w = c.at, R = c.W - 100;   // lay out against the canvas edges: width follows the style's media slot
      const aSay = A(T, w('say') - 0.2), aShow = A(T, w('show') - 0.2);
      K.gText(260, 430, 70, aSay, 1); K.text('what you say', 260, 600, { size: 28, font: 'mono', align: 'center', a: aSay });
      K.gImage(260, 790, 64, aShow, 2); K.text('what you show', 260, 920, { size: 28, font: 'mono', align: 'center', a: aShow });
      // both feed the style
      const kS = eio(ramp(T, w('style') - 0.3, w('style') + 0.4));
      const sx = (400 + R - 480) / 2 - 60;   // the style chip sits midway between the inputs and the shot
      K.arrow([[400, 430], [sx - 90, 430], [sx - 20, 610]], kS, { w: 3, dash: [0.5, 11] });
      K.arrow([[400, 790], [sx - 90, 790], [sx - 20, 650]], kS, { w: 3, dash: [0.5, 11] });
      chip(K, 'style', sx, 640, { size: 34, weight: 700, a: A(T, w('style')), fill: COL.gold });
      // into a shot: film strip, the new frame lands in gold
      const aShot = A(T, w('shot') - 0.25);
      K.arrow([[sx + 170, 630], [R - 480, 630]], eio(ramp(T, w('shot') - 0.3, w('shot') + 0.2)), { w: 3 });
      const fr = film(K, R - 440, 520, 440, 220, 2, aShot, { seed: 7, scene: (i, ...r) => miniScene(K, i, ...r, aShot) });
      if (fr[1]) K.rect(fr[1][0] - 6, fr[1][1] - 6, fr[1][2] + 12, fr[1][3] + 12, COL.gold, A(T, w('shot') + 0.3));
    },
  },

  // ------------------------------------------------------------ b03: narration sets the timing
  b03: {
    scene: 'timeline', chapter: ['02', 'TIMING'],
    draw(K, c) {
      const T = c.T, w = c.at;
      const x0 = 140, x1 = c.W - 140, y = 470;
      const rev = eio(ramp(T, w('narration') - 0.3, w('timing') + 0.4));
      wave(K, x0, y, x1 - x0, 150, 120, 11, COL.accent, A(T, -0.4), T, 1, rev);
      K.text('narration', x0, y - 120, { size: 28, font: 'mono', col: COL.mute, a: A(T, -0.4) });
      // shots below, sized by their words
      const cuts = [x0, lerp(x0, x1, 0.31), lerp(x0, x1, 0.65), x1], aS = A(T, w('shot') - 0.2);
      for (let i = 0; i < 3; i++) {
        const a = aS * A(T, w('shot') + i * 0.25, 0.3);
        K.rect(cuts[i] + 6, 640, cuts[i + 1] - cuts[i] - 12, 150, [COL.tint, COL.gold, COL.tint][i], a);
        const [mx, my] = mis(20 + i); K.box(cuts[i] + 6 + mx, 640 + my, cuts[i + 1] - cuts[i] - 12, 150, { w: 2.4, a });
        K.text(`shot ${i + 1}`, cuts[i] + 30, 728, { size: 28, weight: 700, a });
      }
      // "exactly as long as its words": dimension line over the middle shot
      K.dim([cuts[1] + 6, 800], [cuts[2] - 6, 800], '4.2 s', { off: 46, a: A(T, w('exactly')) });
      K.dashed([[cuts[1], y - 90], [cuts[1], 800]], { a: A(T, w('long')) * 0.8 });
      K.dashed([[cuts[2], y - 90], [cuts[2], 800]], { a: A(T, w('long')) * 0.8 });
      K.text('as long as its words', lerp(cuts[1], cuts[2], 0.5), 960, { size: 34, weight: 700, align: 'center', a: F(T, w('words'), c.D + 2), hl: 1 });
    },
  },
};
