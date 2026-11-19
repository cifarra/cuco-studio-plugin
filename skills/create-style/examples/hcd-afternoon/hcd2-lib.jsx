// HIALEAH CITY DENTAL v2 — "Afternoon" — CucoStudio style builder (AE, ES3)
// World: a cream stucco wall, afternoon sun through a jalousie window. Words are written in light and shade.
// Classic 3D: a distant warm point light (the sun), a navy-tinted ambient (the shade), shadow-only occluders.
// Usage: $.evalFile(this); HCD2_BUILD({ sim: bool, photos: [abs paths] })

function HCD2_BUILD(opts) {
    var SIM = !!opts.sim, PHOTOS = opts.photos || [];
    var log = [];
    var W = 1080, H = 1920, FPS = 30, DUR = 10;
    function hx(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1]; }
    var CREAM = hx("#FBF8F4"), NAVY = hx("#152344"), PEACH = hx("#EFD7C2");
    var F_SERIF = "Newsreader60pt-Regular", F_ITAL = "Newsreader60pt-Italic";
    var S0 = [2600, -2200, -6000];          // the sun at rest (comp space; the wall is the z = 0 plane)
    var ZT = -35, ZFAR = -760;              // shadow-type depth at rest / when it arrives or leaves

    // ------------------------------------------------------------ expression snippets
    function pal(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function eo(p) { p = cl(p); return 1 - Math.pow(1 - p, 3); }\n' +
        'function ei(p) { p = cl(p); return p*p*p; }\n' +
        'function sm(p) { p = cl(p); return p*p*(3 - 2*p); }\n' +
        'function win(v, a, b) { return cl((v - a)/(b - a)); }\n' +
        'function mx(a, b, t) { return [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t]; }\n';
    var CTL =
        'var en = 0, ex = 0;\n' +
        'try { en = thisComp.layer("controller").effect("enter")("Slider").value/100; } catch (e1) {}\n' +
        'try { ex = thisComp.layer("controller").effect("exit")("Slider").value/100; } catch (e2) {}\n' +
        'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)$/); if (m) SEC = parseInt(m[1], 10); })();\n' +
        'var DAY = Math.min(1, SEC/6);   // the day moves on: midday → golden hour across the video\n';
    var HDR = FN + CTL;
    // light colours derived from the palette, so a palette swap moves the light too
    var LIGHTJS = 'var MC = comp("mainComp").layer("mainControl");\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n' +
        'var SUN = [1, Math.pow(C3[1]/C3[0], 2.2), Math.pow(C3[2]/C3[0], 4.0)];\n' +
        'var GOLD = [1, Math.pow(C3[1]/C3[0], 3.2), Math.pow(C3[2]/C3[0], 6.5)];\n' +
        'var nm = Math.max(C2[0], C2[1], C2[2], 0.001); var SKY = mx([1, 1, 1], [C2[0]/nm, C2[1]/nm, C2[2]/nm], 0.45);\n';
    // phrase window from the text comp's director markers
    var PHR =
        'function phr(S) { var m = S.marker, n = m.numKeys, t0 = -1, t1 = 1e6, prev = 1e9;\n' +
        '  for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0;\n' +
        '    var st = (k == 1) || (c == "0") || (v < prev); prev = v;\n' +
        '    if (st) { var tk = m.key(k).time; if (tk <= time + 0.001) { t0 = tk; } else { t1 = tk; break; } } }\n' +
        '  if (n == 0) t0 = 0; return [t0, t1]; }\n';

    // ------------------------------------------------------------ helpers
    function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }
    function fxAdd(layer, mn) { return layer.property("ADBE Effect Parade").addProperty(mn); }
    function pp(e, n) { return e.property(e.matchName + "-" + n); }
    function addSlider(layer, name, value) { var f = fxAdd(layer, "ADBE Slider Control"); f.name = name; f.property(1).setValue(value); return f; }
    function addColorCtl(layer, name, rgba) { var f = fxAdd(layer, "ADBE Color Control"); f.name = name; f.property(1).setValue(rgba); return f; }
    function fillFx(layer, colorExpr) { var f = fxAdd(layer, "ADBE Fill"); pp(f, "0002").expression = colorExpr; return f; }
    function textDoc(t) { return t.property("ADBE Text Properties").property("ADBE Text Document"); }
    function makeText(comp, str, font, size, just) {
        var t = comp.layers.addText(str);
        var p = textDoc(t); var d = p.value;
        try { d.resetCharStyle(); } catch (e1) {}
        try { d.resetParagraphStyle(); } catch (e2) {}
        d.font = font; d.fontSize = size;
        d.applyFill = true; d.fillColor = [NAVY[0], NAVY[1], NAVY[2]]; d.applyStroke = false;
        d.justification = just || ParagraphJustification.CENTER_JUSTIFY;
        d.tracking = -18; d.autoLeading = false; d.leading = size * 1.06;
        d.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS;
        try { d.fauxBold = false; d.fauxItalic = false; } catch (e4) {}
        p.setValue(d);
        return t;
    }
    function makeController(comp) {
        var c = comp.layers.addNull(DUR); c.name = "controller";
        var en = addSlider(c, "enter", 0).property(1); en.setValueAtTime(0, 0); en.setValueAtTime(1.2, 100);
        var ex = addSlider(c, "exit", 0).property(1); ex.setValueAtTime(DUR - 1.2, 0); ex.setValueAtTime(DUR, 100);
        return c;
    }
    function markers(comp, phrases) {
        for (var i = 0; i < phrases.length; i++) {
            var t0 = phrases[i][0], dw = phrases[i][1], n = phrases[i][2];
            comp.markerProperty.setValueAtTime(t0, new MarkerValue("0"));
            for (var k = 1; k <= n; k++) comp.markerProperty.setValueAtTime(t0 + 1 / FPS + (k - 1) * dw, new MarkerValue(String(Math.round(k / n * 100))));
            if (i < phrases.length - 1) comp.markerProperty.setValueAtTime(phrases[i + 1][0] - 2 / FPS, new MarkerValue("100"));
        }
    }
    function simTexts(tb, phrases, texts) {   // director emulation: fit all phrases, apply the MIN size, centre each with HOLD keys
        var p = textDoc(tb), comp = tb.containingComp;
        for (var i = 0; i < texts.length; i++) { var d = p.value; d.text = texts[i]; p.setValueAtTime(Math.max(0, phrases[i][0] + 1 / FPS), d); }
        var size0 = p.valueAtTime(phrases[0][0] + 1 / FPS, true).fontSize, minS = size0;
        function rectAt(t, sz) { var k = p.nearestKeyIndex(t), d = p.keyValue(k); d.fontSize = sz; p.setValueAtKey(k, d); return tb.sourceRectAtTime(t, false); }
        for (var j = 0; j < texts.length; j++) {
            var t = phrases[j][0] + 1 / FPS, lo = 8, hi = size0, r0 = rectAt(t, hi);
            if (r0.width > comp.width * 0.98 || r0.height > comp.height * 0.98) {
                for (var it = 0; it < 14; it++) { var mid = (lo + hi) / 2, r = rectAt(t, mid); if (r.width > comp.width * 0.98 || r.height > comp.height * 0.98) hi = mid; else lo = mid; }
                minS = Math.min(minS, lo);
            }
        }
        var ap = tr(tb, "ADBE Anchor Point"), ps = tr(tb, "ADBE Position");
        for (var q = 0; q < texts.length; q++) {
            var tq = phrases[q][0] + 1 / FPS, rq = rectAt(tq, minS);
            ap.setValueAtTime(tq, [rq.left + rq.width / 2, rq.top + rq.height / 2]);
            ps.setValueAtTime(tq, [comp.width / 2, comp.height / 2]);
        }
        for (var h = 1; h <= ap.numKeys; h++) { ap.setInterpolationTypeAtKey(h, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); ps.setInterpolationTypeAtKey(h, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); }
        log.push("  sim fit " + comp.name + ": " + Math.round(minS) + " px");
    }
    // balanced 1..maxL lines for the biggest type in the zone (the HDC v1 reflow)
    function reflowExpr(maxL, cw, lead, extra) {
        return 'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "");\n' +
            'var res = s, fs = style.fontSize, zw = thisComp.width, zh = thisComp.height;\n' +
            'if (s.length > 0) {\n' +
            '  var w = s.split(/\\s+/), u = [];\n' +
            '  for (var i = 0; i < w.length; i++) { if (w[i].length <= 2 && i < w.length - 1) { w[i + 1] = w[i] + " " + w[i + 1]; } else { u.push(w[i]); } }\n' +
            '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
            '  function bal(nl) { if (nl == 1) return [u.join(" ")]; var bv = 1e9, bestCuts = null;\n' +
            '    function rc(start, left, cs) { if (left == 1) { var mxl = L(start, u.length), prev = 0; for (var q = 0; q < cs.length; q++) { mxl = Math.max(mxl, L(prev, cs[q])); prev = cs[q]; } if (mxl < bv) { bv = mxl; bestCuts = cs.slice(0); } return; }\n' +
            '      for (var b = start + 1; b <= u.length - left + 1; b++) { cs.push(b); rc(b, left - 1, cs); cs.pop(); } }\n' +
            '    rc(0, nl, []); var out = [], pv = 0; for (var q = 0; q < bestCuts.length; q++) { out.push(u.slice(pv, bestCuts[q]).join(" ")); pv = bestCuts[q]; } out.push(u.slice(pv).join(" ")); return out; }\n' +
            '  var best = null, bs = -1;\n' +
            '  for (var nl = 1; nl <= Math.min(' + maxL + ', u.length); nl++) {\n' +
            '    var ls = bal(nl), mc = 0; for (var j = 0; j < ls.length; j++) mc = Math.max(mc, ls[j].length);\n' +
            '    var sc = Math.min(fs, zw/(mc*' + cw + '), zh/(nl*' + lead + ' + 0.25));\n' +
            '    if (sc > bs + 0.5) { bs = sc; best = ls; }\n' +
            '  }\n' +
            '  res = best.join("\\r");\n' +
            '}\n' +
            (extra || 'style.setText(res).setAutoLeading(false).setLeading(fs*' + lead + ');');
    }
    function makeTextComp(name, w, h, sample, font, size, maxL, cw, lead, extraExpr) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var tb = makeText(c, sample, font, size); tb.name = "textBlock";
        var r = tb.sourceRectAtTime(0, false);
        tr(tb, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr(tb, "ADBE Position").setValue([w / 2, h / 2]);
        textDoc(tb).expression = reflowExpr(maxL, cw, lead, extraExpr);
        return c;
    }
    function mat(l, casts, transmission) {
        l.threeDLayer = true;
        var m = l.property("ADBE Material Options Group");
        m.property("ADBE Casts Shadows").setValue(casts);   // 0 off, 1 on, 2 only
        if (transmission) m.property("ADBE Light Transmission").setValue(transmission);
        return m;
    }
    // where a shadow-casting point at depth z must sit so its shadow lands on T (light at rest)
    function aim(T, z) { var k = (z - S0[2]) / (-S0[2]); return [S0[0] + (T[0] - S0[0]) * k, S0[1] + (T[1] - S0[1]) * k, z]; }
    function aimJS(T) {
        return 'function AIM(z) { var L = [' + S0.join(",") + '], k = (z - L[2])/(-L[2]); return [L[0] + (' + T[0] + ' - L[0])*k, L[1] + (' + T[1] + ' - L[1])*k, z]; }\n';
    }

    // ------------------------------------------------------------ the room: wall, sun, sky, window
    var stucco = null;
    function stuccoComp() {
        if (stucco) return stucco;
        stucco = app.project.items.addComp("stucco", 2800, 3600, 1, DUR, FPS); stucco.parentFolder = preFolder;
        var base = stucco.layers.addSolid([1, 1, 1], "plaster", 2800, 3600, 1, DUR); fillFx(base, pal(1));
        var fine = stucco.layers.addSolid([0.5, 0.5, 0.5], "grain of the plaster", 2800, 3600, 1, DUR);
        var f = fxAdd(fine, "ADBE Fractal Noise"); pp(f, "0004").setValue(220); pp(f, "0010").setValue(9); pp(f, "0015").setValue(3);
        fine.blendingMode = BlendingMode.SOFT_LIGHT; tr(fine, "ADBE Opacity").setValue(20);
        var trow = stucco.layers.addSolid([0.5, 0.5, 0.5], "trowel strokes", 2800, 3600, 1, DUR);
        var f2 = fxAdd(trow, "ADBE Fractal Noise"); pp(f2, "0004").setValue(140); pp(f2, "0010").setValue(260); pp(f2, "0015").setValue(5);
        trow.blendingMode = BlendingMode.SOFT_LIGHT; tr(trow, "ADBE Opacity").setValue(13);
        return stucco;
    }
    // sun: a far warm point light that swings in on enter and moves on at exit; intensity/colour follow the day
    function room(shot, o) {
        var wall = shot.layers.add(stuccoComp()); wall.name = "wall";
        var wm = mat(wall, 0); wm.property("ADBE Specular Coefficient").setValue(5); wm.property("ADBE Diffuse Coefficient").setValue(100);
        tr(wall, "ADBE Position").setValue([W / 2, H / 2, 0]);
        wall.moveToEnd();
        var sun = shot.layers.addLight("sun", [W / 2, H / 2]); sun.lightType = LightType.POINT;
        tr(sun, "ADBE Position").expression = HDR +
            'var a = eo(win(en, 0, ' + (o.sweepIn || 0.85) + ')), b = sm(win(ex, ' + (o.sweepOut || 0.2) + ', 1));\n' +
            '[' + S0[0] + ' - ' + (o.swing || 11000) + '*(1 - a) + 6000*b + 900*DAY + 320*Math.sin(time*0.22 + SEC), ' + S0[1] + ' + 500*DAY + 160*Math.cos(time*0.17 + SEC), ' + S0[2] + '];';
        // enters from the -x side: from +x the light grazes the rotated window plane edge-on and it stops casting
        var so = sun.property("ADBE Light Options Group");
        so.property("ADBE Light Intensity").expression = HDR + (o.sunI || 64) + '*(1 + 0.08*DAY)*sm(win(en, 0, 0.32))*(1 - sm(win(ex, 0.7, 1)));';
        so.property("ADBE Light Color").expression = HDR + LIGHTJS + 'var c = mx(SUN, GOLD, DAY); [c[0], c[1], c[2], 1];';
        so.property("ADBE Casts Shadows").setValue(1);
        so.property("ADBE Light Shadow Darkness").setValue(100);
        so.property("ADBE Light Shadow Diffusion").setValue(o.diff || 8);
        var sky = shot.layers.addLight("sky", [W / 2, H / 2]); sky.lightType = LightType.AMBIENT;
        sky.property("ADBE Light Options Group").property("ADBE Light Intensity").expression = HDR + (o.ambI || 58) + '*(1 - 0.08*DAY);';
        sky.property("ADBE Light Options Group").property("ADBE Light Color").expression = HDR + LIGHTJS + '[SKY[0], SKY[1], SKY[2], 1];';
        return sun;
    }
    // the window: a shadow-only plane with a hole; slats are a second shadow-only layer parented to it
    function windowFrame(shot, o) {
        var occ = shot.layers.addShape(); occ.name = "window";
        var g = occ.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name = "wall with a window";
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([9000, 9000]);   // keep it modest: a huge occluder spreads the shadow map thin (speckled "acne")
        g = occ.property("ADBE Root Vectors Group").property(1);
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue(o.win);
        g = occ.property("ADBE Root Vectors Group").property(1);
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Merge").property("ADBE Vector Merge Type").setValue(3);
        g = occ.property("ADBE Root Vectors Group").property(1);
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([0, 0, 0]);
        mat(occ, 2);
        tr(occ, "ADBE Position").setValue(aim(o.patch, -700));
        tr(occ, "ADBE Rotate Y").setValue(o.rotY === undefined ? 28 : o.rotY); tr(occ, "ADBE Rotate Z").setValue(o.rotZ === undefined ? -6 : o.rotZ);
        if (o.slats) {
            var sl = shot.layers.addShape(); sl.name = "jalousie";
            var sg = sl.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); sg.name = "slats";
            var sr = sg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            sr.property("ADBE Vector Rect Size").expression = HDR + o.slatH + '\n[' + (o.win[0] + 20) + ', h];';
            sg = sl.property("ADBE Root Vectors Group").property(1);
            sg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([0, 0, 0]);
            sg = sl.property("ADBE Root Vectors Group").property(1);
            var rep = sg.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Repeater");
            rep.property("ADBE Vector Repeater Copies").setValue(o.slats);
            rep.property("ADBE Vector Repeater Transform").property("ADBE Vector Repeater Position").setValue([0, o.pitch || 96]);
            sg = sl.property("ADBE Root Vectors Group").property(1);
            sg.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([0, o.slatY]);
            mat(sl, 2);
            sl.parent = occ; tr(sl, "ADBE Position").setValue([0, 0, 0]); tr(sl, "ADBE Rotate Y").setValue(0); tr(sl, "ADBE Rotate Z").setValue(0);
            tr(sl, "ADBE Anchor Point").setValue([0, 0, 0]);
        }
        return occ;
    }
    // shadow type: the {shot}-text precomp as a shadow-only object; each phrase approaches the wall (blur → focus)
    function shadowType(shot, tcomp, T) {
        var L = shot.layers.add(tcomp); L.name = tcomp.name; mat(L, 2);
        tr(L, "ADBE Position").expression = HDR + PHR + aimJS(T) +
            'var S = thisLayer.source, P = phr(S), t0 = P[0], t1 = P[1];\n' +
            'var a = (t0 < 0) ? 0 : eo((time - t0)/0.7), b = (t1 > 1e5) ? 0 : ei((time - (t1 - 0.36))/0.34);\n' +
            'var c = ei(win(ex, 0.45, 0.95));\n' +
            'var k = Math.max(1 - a, b, c);\n' +
            'AIM(' + ZT + ' + (' + (ZFAR - ZT) + ')*k);';
        return L;
    }

    // ------------------------------------------------------------ media: frame comps
    var photoIdx = 0;
    function makeFrameComp(name, w, h) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        // placeholder: transparent (no media = no projection); a faint hint for designers
        var ph = c.layers.addSolid([0.6, 0.6, 0.6], "placeholder (replace with media)", w, h, 1, DUR);
        tr(ph, "ADBE Opacity").setValue(SIM && PHOTOS.length ? 0 : 35);
        if (SIM && PHOTOS.length) {
            var it = app.project.importFile(new ImportOptions(new File(PHOTOS[photoIdx % PHOTOS.length]))); photoIdx++;
            it.parentFolder = preFolder;
            var L = c.layers.add(it); var s = Math.max(w / it.width, h / it.height) * 100; tr(L, "ADBE Scale").setValue([s, s]);
        }
        return c;
    }
    // the photo as a transparency in the sun's path: it is projected onto the wall in sunlight
    function projection(shot, fcomp, T, z) {
        var L = shot.layers.add(fcomp); L.name = fcomp.name; L.audioEnabled = false;
        mat(L, 2, 100);
        var lv = fxAdd(L, "ADBE Easy Levels2"); pp(lv, "0003").setValue(0.16); pp(lv, "0004").setValue(0.84); pp(lv, "0005").setValue(0.78);
        tr(L, "ADBE Position").setValue(aim(T, z));
        return L;
    }

    // ============================================================ BUILD
    app.purge(PurgeTarget.ALL_CACHES);
    while (app.project.numItems > 0) { app.project.item(1).remove(); }
    app.project.bitsPerChannel = 8;
    var mainComp = app.project.items.addComp("mainComp", W, H, 1, DUR * 2, FPS);
    var shotsFolder = app.project.items.addFolder("ORIGINAL_SHOTS");
    var preFolder = app.project.items.addFolder("PRECOMPS");
    var mcL = mainComp.layers.addNull(DUR * 2); mcL.name = "mainControl";
    addSlider(mcL, "FORM", 50); addSlider(mcL, "FLOW", 50); addSlider(mcL, "PRESSURE", 50);
    addColorCtl(mcL, "1", CREAM); addColorCtl(mcL, "2", NAVY); addColorCtl(mcL, "3", PEACH);
    log.push("mainComp + mainControl");

    function newShot(name) { var c = app.project.items.addComp(name, W, H, 1, DUR, FPS); c.parentFolder = shotsFolder; makeController(c); return c; }
    var PH = [[0.35, 0.3, 4], [3.5, 0.3, 4], [6.6, 0.32, 3]];
    function sim(tcomp, texts) { if (!SIM) return; markers(tcomp, PH); simTexts(tcomp.layer("textBlock"), PH, texts); }
    var OPEN_SLATS = 'var a = eo(win(en, 0.25, 0.95)), b = ei(win(ex, 0.25, 0.85)); var h = 18 + 78*Math.max(1 - a, b);';
    var REST_SLATS = 'var h = 34;';

    // ============================================================ 01 WINDOW — the phrase in shadow, inside the window's sunlight
    var t01 = makeTextComp("01-text", 860, 620, "Transforming smiles with innovation and care.", F_SERIF, 150, 3, 0.47, 1.04);
    sim(t01, ["Transforming smiles with innovation and care.", "Feel amazing about your oral health.", "We\u2019re here for you."]);
    var s01 = newShot("01");
    room(s01, {});
    windowFrame(s01, { patch: [590, 900], win: [1500, 1900], slats: 7, slatY: 300, slatH: REST_SLATS });
    shadowType(s01, t01, [560, 660]);
    s01.layer("controller").moveToBeginning();
    log.push("01 window");

    // ============================================================ 02 PALM — a palm frond's shadow sways across the sunlit wall
    var t02 = makeTextComp("02-text", 960, 560, "Your smile starts here, in Hialeah.", F_SERIF, 140, 3, 0.47, 1.04);
    sim(t02, ["Your smile starts here, in Hialeah.", "Gentle care for every family.", "Same street, same faces."]);
    var s02 = newShot("02");
    room(s02, { sunI: 66 });
    windowFrame(s02, { patch: [560, 940], win: [1500, 2300], rotY: 18, rotZ: -4 });
    // frond: a curved rib with tapered leaflets on both sides (procedural)
    var fr = s02.layers.addShape(); fr.name = "palm frond";
    var fg = fr.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); fg.name = "frond";
    function ribPt(t) { return [1500 * t, -300 * t + 380 * t * t]; }
    var NL = 19;
    for (var li = 0; li < NL; li++) {
        var tt = 0.1 + 0.88 * li / (NL - 1), p0 = ribPt(tt), p1 = ribPt(Math.min(1, tt + 0.01));
        var ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        for (var side = -1; side <= 1; side += 2) {
            var len = 620 * Math.sin(Math.PI * (0.18 + 0.8 * tt)) * (0.82 + 0.18 * (((li * 5 + (side + 1) * 3) % 4) / 3));
            var a2 = ang + side * (1.15 - 0.55 * tt) + 0.22 * side * side;   // spread, then droop toward the tip
            var mid = [p0[0] + Math.cos(a2) * len * 0.5, p0[1] + Math.sin(a2) * len * 0.5 + 40];
            var tip = [p0[0] + Math.cos(a2) * len, p0[1] + Math.sin(a2) * len + 150 * (0.4 + tt)];
            var wv = 15 * (1 - 0.45 * tt);
            var nrm = [-Math.sin(a2) * wv, Math.cos(a2) * wv];
            var leaf = fg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
            var shp = new Shape();
            shp.vertices = [p0, [mid[0] + nrm[0], mid[1] + nrm[1]], tip, [mid[0] - nrm[0], mid[1] - nrm[1]]];
            shp.inTangents = [[0, 0], [-Math.cos(a2) * len * 0.2, -Math.sin(a2) * len * 0.2], [0, 0], [Math.cos(a2) * len * 0.2, Math.sin(a2) * len * 0.2]];
            shp.outTangents = [[0, 0], [Math.cos(a2) * len * 0.2, Math.sin(a2) * len * 0.2 + 20], [0, 0], [-Math.cos(a2) * len * 0.2, -Math.sin(a2) * len * 0.2]];
            shp.closed = true;
            leaf.property("ADBE Vector Shape").setValue(shp);
            fg = fr.property("ADBE Root Vectors Group").property(1);
        }
    }
    var rib = fg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
    var rs = new Shape(); rs.vertices = [ribPt(0), ribPt(0.5), ribPt(1)]; rs.inTangents = [[0, 0], [-260, -60], [0, 0]]; rs.outTangents = [[0, 0], [260, 60], [0, 0]]; rs.closed = false;
    rib.property("ADBE Vector Shape").setValue(rs);
    fg = fr.property("ADBE Root Vectors Group").property(1);
    var rst = fg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke"); rst.property("ADBE Vector Stroke Width").setValue(12); rst.property("ADBE Vector Stroke Color").setValue([0, 0, 0]);
    fg = fr.property("ADBE Root Vectors Group").property(1);
    fg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([0, 0, 0]);
    mat(fr, 2);
    tr(fr, "ADBE Anchor Point").setValue([0, 0, 0]);
    var FP = aim([1240, 40], -420);
    tr(fr, "ADBE Position").setValue(FP);
    tr(fr, "ADBE Rotate Z").expression = HDR + '146 + 2.6*Math.sin(time*0.8) + 1.1*Math.sin(time*2.1 + 1);';
    shadowType(s02, t02, [520, 1300]);
    s02.layer("controller").moveToBeginning();
    log.push("02 palm");

    // ============================================================ 03 PROJECTION — the photo cast in sunlight through the jalousie
    var t03 = makeTextComp("03-text", 980, 400, "Gentle care for every smile.", F_SERIF, 120, 2, 0.47, 1.04);
    sim(t03, ["Gentle care for every smile.", "Natural-looking results.", "Designed around you."]);
    var f03 = makeFrameComp("03-frame", 900, 1000);
    var s03 = newShot("03");
    room(s03, { sunI: 68 });
    windowFrame(s03, { patch: [580, 900], win: [1300, 1900], slats: 9, slatY: -560, slatH: OPEN_SLATS, pitch: 96 });
    projection(s03, f03, [560, 700], -70);
    shadowType(s03, t03, [540, 1460]);
    s03.layer("controller").moveToBeginning();
    log.push("03 projection");

    // ============================================================ 04 BLINDS — media only: the jalousie opens onto the photo in light
    var t04 = app.project.items.addComp("04-text", 600, 200, 1, DUR, FPS); t04.parentFolder = preFolder;
    var tb04 = makeText(t04, "", F_SERIF, 100); tb04.name = "textBlock";
    var f04 = makeFrameComp("04-frame", 1000, 1500);
    var s04 = newShot("04");
    room(s04, { sunI: 70 });
    windowFrame(s04, { patch: [560, 930], win: [1250, 2050], slats: 18, slatY: -860, slatH: OPEN_SLATS, pitch: 102 });
    projection(s04, f04, [560, 930], -70);
    var t04L = s04.layers.add(t04); t04L.name = "04-text";
    s04.layer("controller").moveToBeginning();
    log.push("04 blinds");

    // ============================================================ 05 SUNLIT — the landing line written IN light (italic, the site's gesture)
    var t05 = makeTextComp("05-text", 980, 520, "We\u2019re here for you.", F_ITAL, 170, 2, 0.42, 1.0);
    sim(t05, ["We\u2019re here for you.", "Book your visit.", "Hasta pronto."]);
    var s05 = newShot("05");
    room(s05, { sunI: 72, swing: 9000 });
    windowFrame(s05, { patch: [560, 900], win: [1300, 2000], slats: 6, slatY: 560, slatH: REST_SLATS, pitch: 96 });
    var tl05 = s05.layers.add(t05); tl05.name = "05-text"; tl05.enabled = false;
    var st05 = s05.layers.addSolid([0, 0, 0], "stencil", 2600, 3200, 1, DUR); st05.name = "stencil";
    var smk = st05.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"); smk.maskMode = MaskMode.SUBTRACT;
    var smS = new Shape(); smS.vertices = [[-200, 2240], [2800, 2240], [2800, 3400], [-200, 3400]]; smS.closed = true; smk.property("ADBE Mask Shape").setValue(smS);
    smk.property("ADBE Mask Feather").setValue([0, 0]);
    var smf = fxAdd(st05, "ADBE Set Matte3");
    pp(smf, "0002").setValue(4); pp(smf, "0003").setValue(1); pp(smf, "0004").setValue(0); pp(smf, "0005").setValue(1);
    pp(smf, "0001").setValue(tl05.index);   // layer ref LAST
    mat(st05, 2);
    tr(st05, "ADBE Position").expression = HDR + PHR + aimJS([540, 880]) +
        'var S = thisComp.layer("05-text").source, P = phr(S), t0 = P[0], t1 = P[1];\n' +
        'var a = (t0 < 0) ? 0 : eo((time - t0)/0.8), b = (t1 > 1e5) ? 0 : ei((time - (t1 - 0.36))/0.34);\n' +
        'var k = Math.max(1 - a, b, ei(win(ex, 0.4, 0.95)));\n' +
        'AIM(' + ZT + ' - 520*k);';
    s05.layer("controller").moveToBeginning();
    log.push("05 sunlit");

    // ============================================================ 06 MURAL — longer copy painted on the wall; the light passes over it
    var MURAL = 'var MC = comp("mainComp").layer("mainControl"); var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value;\n' +
        'var m = thisComp.marker, pv = 100, pt = -1;\n' +
        'if (m.numKeys > 0) { var k = m.nearestKey(time).index; if (m.key(k).time > time + 0.001) k--; if (k >= 1) { pv = parseFloat(m.key(k).comment); pt = m.key(k).time; if (isNaN(pv)) pv = 100; } else { pv = 0; } }\n' +
        'var ws = res.split(/[ \\r]/), n = ws.length, spoken = Math.round(pv/100*n);\n' +
        'var MUTE = [C2[0] + (C1[0] - C2[0])*0.72, C2[1] + (C1[1] - C2[1])*0.72, C2[2] + (C1[2] - C2[2])*0.72], INK = [C2[0], C2[1], C2[2]];\n' +
        'var st = style.setText(res).setAutoLeading(false).setLeading(fs*1.16).setFillColor(MUTE);\n' +
        'var idx = 0; for (var j = 0; j < n; j++) { var len = ws[j].length; if (j < spoken) { var aa = (j == spoken - 1 && pt >= 0) ? Math.min(1, (time - pt)/0.2) : 1;\n' +
        '  st = st.setFillColor([MUTE[0] + (INK[0] - MUTE[0])*aa, MUTE[1] + (INK[1] - MUTE[1])*aa, MUTE[2] + (INK[2] - MUTE[2])*aa], idx, len); } idx += len + 1; }\n' +
        'st;';
    var t06 = makeTextComp("06-text", 960, 1000, "Same-day emergency visits, digital impressions and an in-house lab, so your new smile is ready sooner.", F_SERIF, 124, 6, 0.44, 1.16, MURAL);
    sim(t06, ["Same-day emergency visits, digital impressions and an in-house lab, so your new smile is ready sooner.", "We accept most major insurance plans, and our team speaks English and Spanish.", "1544 W 37th St, Hialeah. Monday to Friday."]);
    var s06 = newShot("06");
    room(s06, { sunI: 64 });
    windowFrame(s06, { patch: [600, 980], win: [1300, 2100], slats: 12, slatY: -150, slatH: REST_SLATS, pitch: 120 });
    var tl06 = s06.layers.add(t06); tl06.name = "06-text"; tl06.threeDLayer = true; tl06.collapseTransformation = true;
    tr(tl06, "ADBE Position").setValue([540, 960, -1]);
    s06.layer("controller").moveToBeginning();
    log.push("06 mural");

    mcL.moveToBeginning();
    return log.join("\n");
}
