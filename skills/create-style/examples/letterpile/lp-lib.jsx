// LETTERPILE — CucoStudio style builder (AE, ES3). World: a pile of cut-out letters on a yellow table.
// Signature verb: STACK. Usage: $.evalFile(this); LP_BUILD({ sim: bool, photos: [abs paths] })
// sim = director-style markers + sample phrases + photos in the frame comps (verification only, never shipped).

function LP_BUILD(opts) {
    var SIM = !!opts.sim, PHOTOS = opts.photos || [];
    var log = [];
    var W = 1080, H = 1920, FPS = 30, DUR = 10;
    var FONT = "HelveticaNeue-Bold";
    function hx(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1]; }
    var FIELD = hx("#FADF4F"), INK = hx("#1A0E0B"), RED = hx("#EA3323");
    var SETHEX = ["#B9CDEB", "#4BA5D9", "#F3DA5A", "#469D5C", "#6A85D9", "#F19CCF", "#DEDBCF"];
    var SW = 7;   // the uniform line weight of every outline, in comp pixels

    // ------------------------------------------------------------ expression snippets
    function rgbList(hs) { var o = []; for (var i = 0; i < hs.length; i++) { var c = hx(hs[i]); o.push("[" + c[0].toFixed(4) + "," + c[1].toFixed(4) + "," + c[2].toFixed(4) + "]"); } return "[" + o.join(",") + "]"; }
    var SETJS = 'var SET = ' + rgbList(SETHEX) + ';\n';
    function pal(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }
    var PALJS = 'var MC = comp("mainComp").layer("mainControl");\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n' +
        'var INK = [C2[0], C2[1], C2[2]], RED = [C3[0], C3[1], C3[2]];\n';
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function eo(p) { p = cl(p); return 1 - Math.pow(1 - p, 3); }\n' +
        'function ei(p) { p = cl(p); return p*p*p; }\n' +
        'function eob(p, s) { p = cl(p); var c1 = s || 1.7, c3 = c1 + 1, q = p - 1; return 1 + c3*q*q*q + c1*q*q; }\n' +
        'function win(v, a, b) { return cl((v - a)/(b - a)); }\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n';
    var CTL =
        'var en = 0, ex = 0;\n' +
        'try { en = thisComp.layer("controller").effect("enter")("Slider").value/100; } catch (e1) {}\n' +
        'try { ex = thisComp.layer("controller").effect("exit")("Slider").value/100; } catch (e2) {}\n' +
        'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)$/); if (m) SEC = parseInt(m[1], 10); })();\n';
    var HDR = FN + CTL;
    // letters of the section's story (words of 3+ letters); fallback = the style frame's letters
    function lettersJS(textLayerName) {
        return 'function LETTERS(initials) { var s = "";\n' +
            '  try { var S = thisComp.layer("' + textLayerName + '").source; var TB = S.layer("textBlock");\n' +
            '    var tt = (S.marker.numKeys > 0) ? S.marker.key(1).time + 0.2 : 0.2; s = String(TB.text.sourceText.valueAtTime(tt)); } catch (eL) {}\n' +
            '  var w = s.toUpperCase().split(/[\\s\\r\\n]+/), out = "";\n' +
            '  for (var j = 0; j < w.length; j++) { var x = w[j].replace(/[^A-Z0-9\\u00C0-\\u00DD]/g, ""); if (x.length >= 3) out += initials ? x.charAt(0) : x; }\n' +
            '  if (out.length == 0) out = s.toUpperCase().replace(/[^A-Z0-9\\u00C0-\\u00DD]/g, "");\n' +
            '  if (out.length == 0) out = "MOGLON";\n' +
            '  return out; }\n';
    }

    // ------------------------------------------------------------ helpers
    function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }
    function fxAdd(layer, mn) { return layer.property("ADBE Effect Parade").addProperty(mn); }
    function pp(e, n) { return e.property(e.matchName + "-" + n); }
    function addSlider(layer, name, value) { var f = fxAdd(layer, "ADBE Slider Control"); f.name = name; f.property(1).setValue(value); return f; }
    function addColorCtl(layer, name, rgba) { var f = fxAdd(layer, "ADBE Color Control"); f.name = name; f.property(1).setValue(rgba); return f; }
    function fillFx(layer, colorExpr) { var f = fxAdd(layer, "ADBE Fill"); pp(f, "0002").expression = colorExpr; return f; }
    function textDoc(t) { return t.property("ADBE Text Properties").property("ADBE Text Document"); }
    function makeText(comp, str, size, just) {
        var t = comp.layers.addText(str);
        var p = textDoc(t); var d = p.value;
        try { d.resetCharStyle(); } catch (e1) {}
        try { d.resetParagraphStyle(); } catch (e2) {}
        d.font = FONT; d.fontSize = size;
        d.applyFill = true; d.fillColor = [1, 1, 1];
        d.applyStroke = true; d.strokeColor = [INK[0], INK[1], INK[2]]; d.strokeWidth = SW; d.strokeOverFill = true;
        d.justification = just || ParagraphJustification.CENTER_JUSTIFY;
        d.tracking = 0;
        try { d.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; } catch (e3) {}
        try { d.fauxBold = false; d.fauxItalic = false; } catch (e4) {}
        p.setValue(d);
        return t;
    }
    function makeController(comp) {
        var c = comp.layers.addNull(DUR); c.name = "controller";
        var en = addSlider(c, "enter", 0).property(1); en.setValueAtTime(0, 0); en.setValueAtTime(1.0, 100);
        var ex = addSlider(c, "exit", 0).property(1); ex.setValueAtTime(DUR - 1.0, 0); ex.setValueAtTime(DUR, 100);
        return c;
    }
    function makeBG(comp) { var s = comp.layers.addSolid([1, 1, 1], "BG", W, H, 1, DUR); fillFx(s, pal(1)); s.moveToEnd(); return s; }
    function markers(comp, phrases) {   // director-style: "0" one frame before, "%" per word, "100" hold
        for (var i = 0; i < phrases.length; i++) {
            var t0 = phrases[i][0], dw = phrases[i][1], n = phrases[i][2];
            comp.markerProperty.setValueAtTime(t0, new MarkerValue("0"));
            for (var k = 1; k <= n; k++) comp.markerProperty.setValueAtTime(t0 + 1 / FPS + (k - 1) * dw, new MarkerValue(String(Math.round(k / n * 100))));
            if (i < phrases.length - 1) comp.markerProperty.setValueAtTime(phrases[i + 1][0] - 2 / FPS, new MarkerValue("100"));
        }
    }
    function simTexts(tb, phrases, texts) {
        var p = textDoc(tb);
        for (var i = 0; i < texts.length; i++) { var d = p.value; d.text = texts[i]; p.setValueAtTime(Math.max(0, phrases[i][0] + 1 / FPS), d); }
        // emulate the director: fit every phrase (rest state), apply the MIN size to all, centre each with HOLD keys
        var comp = tb.containingComp, nm = tb.name; tb.name = "__cuco_fit_scratch";
        var size0 = p.valueAtTime(phrases[0][0] + 1 / FPS, true).fontSize, minS = size0;
        function rectAt(t, sz) { var k = p.nearestKeyIndex(t), d = p.keyValue(k); d.fontSize = sz; p.setValueAtKey(k, d); return tb.sourceRectAtTime(t, false); }
        for (var j = 0; j < texts.length; j++) {
            var t = phrases[j][0] + 1 / FPS, lo = 8, hi = size0;
            var r0 = rectAt(t, hi);
            if (r0.width > comp.width * 0.98 || r0.height > comp.height * 0.98) {
                for (var it = 0; it < 14; it++) { var mid = (lo + hi) / 2, r = rectAt(t, mid); if (r.width > comp.width * 0.98 || r.height > comp.height * 0.98) hi = mid; else lo = mid; }
                minS = Math.min(minS, lo);
            }
        }
        var ap = tb.property("ADBE Transform Group").property("ADBE Anchor Point"), ps = tb.property("ADBE Transform Group").property("ADBE Position");
        for (var q = 0; q < texts.length; q++) {
            var tq = phrases[q][0] + 1 / FPS, rq = rectAt(tq, minS);
            ap.setValueAtTime(tq, [rq.left + rq.width / 2, rq.top + rq.height / 2]);
            ps.setValueAtTime(tq, [comp.width / 2, comp.height / 2]);
        }
        for (var h = 1; h <= ap.numKeys; h++) { ap.setInterpolationTypeAtKey(h, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); ps.setInterpolationTypeAtKey(h, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); }
        tb.name = nm;
        log.push("  sim fit " + comp.name + ": " + Math.round(minS) + " px");
    }

    // ------------------------------------------------------------ the cut-out phrase (Source Text expression)
    // reflow into 1..maxL balanced lines for the biggest type in the zone, all caps, one palette colour per
    // letter (stride 3 through 7 colours, offset per phrase + section), uniform ink outline.
    function cutoutExpr(o) {
        return PALJS + SETJS + FN +
            'var PS = []; (function () { var m = thisComp.marker, n = m.numKeys, prev = 1e9; for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) PS.push(m.key(k).time); prev = v; } })();\n' +
            'var IDX = 0; for (var q = 0; q < PS.length; q++) { if (PS[q] <= time + 0.001) IDX = q + 1; }\n' +
            'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)-text$/); if (m) SEC = parseInt(m[1], 10); })();\n' +
            'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "").toUpperCase();\n' +
            'var res = s, fs = style.fontSize, zw = thisComp.width, zh = thisComp.height;\n' +
            'if (s.length > 0) {\n' +
            '  var w = s.split(/\\s+/), u = [];\n' +
            '  for (var i = 0; i < w.length; i++) { if (w[i].length <= 2 && i < w.length - 1) { w[i + 1] = w[i] + " " + w[i + 1]; } else { u.push(w[i]); } }\n' +
            '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
            '  function split(nl) {\n' +
            '    if (nl == 1) return [u.join(" ")];\n' +
            '    if (nl == 2) { var bb = 1, bv = 1e9; for (var b1 = 1; b1 < u.length; b1++) { var v = Math.max(L(0, b1), L(b1, u.length)); if (v < bv) { bv = v; bb = b1; } } return [u.slice(0, bb).join(" "), u.slice(bb).join(" ")]; }\n' +
            '    var c1 = 1, c2 = 2, bv3 = 1e9; for (var b1 = 1; b1 < u.length - 1; b1++) { for (var b2 = b1 + 1; b2 < u.length; b2++) { var v = Math.max(L(0, b1), L(b1, b2), L(b2, u.length)); if (v < bv3) { bv3 = v; c1 = b1; c2 = b2; } } }\n' +
            '    return [u.slice(0, c1).join(" "), u.slice(c1, c2).join(" "), u.slice(c2).join(" ")];\n' +
            '  }\n' +
            '  var best = null, bs = -1;\n' +
            '  for (var nl = 1; nl <= Math.min(' + o.maxL + ', u.length); nl++) {\n' +
            '    var ls = split(nl), mc = 0; for (var j = 0; j < ls.length; j++) mc = Math.max(mc, ls[j].length);\n' +
            '    var sc = Math.min(fs, zw/(mc*' + o.cw + '), zh/(nl*' + o.lead + ' + 0.2));\n' +
            '    if (sc > bs + 0.5) { bs = sc; best = ls; }\n' +
            '  }\n' +
            '  res = best.join("\\r");\n' +
            '}\n' +
            'var st = style.setText(res).setFont("' + FONT + '").setAllCaps(false).setAutoLeading(false).setLeading(fs*' + o.lead + ').setTracking(' + o.trk + ')' +
            '.setApplyFill(true).setApplyStroke(true).setStrokeColor(INK).setStrokeWidth(' + SW + ');\n' +
            'var off = IDX*3 + SEC*5 + ' + (o.off || 0) + ', ci = 0;\n' +
            'for (var i = 0; i < res.length; i++) { var ch = res.charAt(i); if (ch == " ") { st = st.setTracking(' + (o.spc || 140) + ', i, 1); continue; } if (ch == "\\r") continue;\n' +
            '  st = st.setFillColor(SET[(ci*3 + off) % SET.length], i, 1);\n' +
            (o.cluster ?
            '  st = st.setFontSize(fs*(0.74 + 0.5*hsh(ci*3.1 + off)), i, 1).setBaselineShift(fs*(hsh(ci*7.7 + off) - 0.5)*0.3, i, 1);\n' : '') +
            '  ci++; }\n' +
            'st;';
    }
    // phrase window + shot exit, shared by every per-letter selector
    var SELHEAD =
        'var m = thisComp.marker, n = m.numKeys, t0 = -1, t1 = 1e6, prev = 1e9, fi = 0;\n' +
        'for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; var stt = (k == 1) || (c == "0") || (v < prev); prev = v;\n' +
        '  if (stt) { var tk = m.key(k).time; if (tk <= time + 0.001) { t0 = tk; fi++; } else { t1 = tk; break; } } }\n' +
        'if (n == 0) { t0 = 0; fi = 1; }\n' +
        'var ex = 0; try { ex = comp(thisComp.name.replace(/-text$/, "")).layer("controller").effect("exit")("Slider").value/100; } catch (eX) {}\n' +
        'var i = textIndex - 1, N = Math.max(1, textTotal), r = N - 1 - i;\n';
    // drop mode: letters fall in reading order and land with an overshoot; lift off in reverse order
    function selDrop(pick, firstDelay) {
        return 'if (thisLayer.name == "__cuco_fit_scratch") { 0; } else {\n' + FN + SELHEAD +
            'if ((hsh(i*1.7 + 3) < 0.5) != ' + pick + ') { 0; } else {\n' +
            'var DEL = (fi == 1) ? ' + firstDelay + ' : 0, st = Math.min(0.06, 0.55/N);\n' +
            'var a = (t0 < 0) ? 1 : 1 - eob((time - t0 - DEL - i*st)/0.36, 1.9);\n' +
            'var b = (t1 > 1e5) ? 0 : ei((time - (t1 - 0.32) - r*Math.min(0.02, 0.2/N))/0.22);\n' +
            'var c2 = ei(win(ex, 0.45 + 0.3*r/N, 0.7 + 0.3*r/N));\n' +
            'var o = Math.max(b, c2); 100*((o > 0) ? Math.max(a, o) : a); } }';
    }
    // scatter mode: four groups fly in from four sides in hashed order; fly back out
    function selScatter(g, firstDelay) {
        return 'if (thisLayer.name == "__cuco_fit_scratch") { 0; } else {\n' + FN + SELHEAD +
            'if (Math.floor(hsh(i*2.3 + 1)*4) != ' + g + ') { 0; } else {\n' +
            'var DEL = (fi == 1) ? ' + firstDelay + ' : 0, ord = hsh(i*5.3 + 2)*Math.min(0.5, N*0.045);\n' +
            'var a = (t0 < 0) ? 1 : 1 - eob((time - t0 - DEL - ord)/0.42, 1.4);\n' +
            'var b = (t1 > 1e5) ? 0 : ei((time - (t1 - 0.34) - ord*0.3)/0.24);\n' +
            'var c2 = ei(win(ex, 0.45 + ord, 0.75 + ord));\n' +
            'var o = Math.max(b, c2); 100*((o > 0) ? Math.max(a, o) : a); } }';
    }
    function addAnimator(tb, name, pos, rot, selExpr) {
        var ans = tb.property("ADBE Text Properties").property("ADBE Text Animators");
        var an = ans.addProperty("ADBE Text Animator"); an.name = name;
        an.property("ADBE Text Animator Properties").addProperty("ADBE Text Position 3D").setValue([pos[0], pos[1], 0]);
        an = ans.property(name);
        an.property("ADBE Text Animator Properties").addProperty("ADBE Text Rotation").setValue(rot);
        an = ans.property(name);
        var sel = an.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
        sel.property("ADBE Text Range Type2").setValue(2);   // characters excluding spaces
        sel.property("ADBE Text Expressible Amount").expression = selExpr;
    }
    // text comp: { name, w, h, sample, size, mode: "drop"|"scatter", maxL, lead, trk, cw, cluster, drop, firstDelay }
    function makeTextComp(o) {
        var c = app.project.items.addComp(o.name, o.w, o.h, 1, DUR, FPS); c.parentFolder = preFolder;
        var tb = makeText(c, o.sample, o.size); tb.name = "textBlock";
        tr(tb, "ADBE Position").setValue([o.w / 2, o.h / 2]);
        textDoc(tb).expression = cutoutExpr(o);
        if (o.cluster) {   // static per-letter tilt: the heap is not a typeset line
            var ans0 = tb.property("ADBE Text Properties").property("ADBE Text Animators");
            var an0 = ans0.addProperty("ADBE Text Animator"); an0.name = "tilt";
            an0.property("ADBE Text Animator Properties").addProperty("ADBE Text Rotation").setValue(16);
            an0 = ans0.property("tilt");
            var sl0 = an0.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
            sl0.property("ADBE Text Range Type2").setValue(2);
            sl0.property("ADBE Text Expressible Amount").expression = 'if (thisLayer.name == "__cuco_fit_scratch") { 0; } else {\n' + FN +
                'var off = 0; (function () { var m = thisComp.marker, n = m.numKeys, prev = 1e9; for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if ((k == 1 || c == "0" || v < prev) && m.key(k).time <= time + 0.001) off++; prev = v; } })();\n' +
                '(hsh((textIndex - 1)*9.1 + off*3) - 0.5)*200; }';
        }
        if (o.mode == "scatter") {
            addAnimator(tb, "fly-L", [-1500, -350], -40, selScatter(0, o.firstDelay));
            addAnimator(tb, "fly-R", [1500, -250], 36, selScatter(1, o.firstDelay));
            addAnimator(tb, "fly-BL", [-1300, 1100], 28, selScatter(2, o.firstDelay));
            addAnimator(tb, "fly-BR", [1300, 1200], -32, selScatter(3, o.firstDelay));
        } else {
            addAnimator(tb, "drop-A", [0, -o.drop], 14, selDrop("true", o.firstDelay));
            addAnimator(tb, "drop-B", [0, -o.drop], -11, selDrop("false", o.firstDelay));
        }
        return c;
    }
    function addTextLayer(shot, tcomp, pos) {
        var L = shot.layers.add(tcomp); L.name = tcomp.name; L.collapseTransformation = true;
        tr(L, "ADBE Position").setValue(pos);
        return L;
    }

    // ------------------------------------------------------------ giant letters (separate text layers)
    // letterJS is "<function defs>@@<expression>"; build helpers:
    function pickLetter(textLayerName, k, initials) {
        return lettersJS(textLayerName) + '@@(function () { var Ls = LETTERS(' + (initials ? 'true' : 'false') + '); return Ls.charAt(Math.floor(hsh(' + k + '*3.7 + SEC*1.9)*Ls.length) % Ls.length); })()';
    }
    function firstLetter(textLayerName) {
        return lettersJS(textLayerName) + '@@(function () { var Ls = LETTERS(true); return Ls.charAt(SEC % Ls.length); })()';
    }
    function fixedLetters(word, k) { return '@@"' + word + '".charAt((' + k + ' + SEC) % ' + word.length + ')'; }
    function setColor(k) { return 'SET[Math.floor(hsh(' + k + '*5.1 + SEC*1.3)*7) % 7]'; }
    // ------------------------------------------------------------ media: flattened into the letter palette
    function treatMedia(layer, tones) {
        var md = fxAdd(layer, "ADBE PS Median"); pp(md, "0001").setValue(3);
        var ct = fxAdd(layer, "ADBE Cartoonify");
        pp(ct, "0001").setValue(3); pp(ct, "0002").setValue(10); pp(ct, "0003").setValue(20);
        pp(ct, "0005").setValue(5); pp(ct, "0006").setValue(10);
        pp(ct, "0009").setValue(1.8); pp(ct, "0010").setValue(3); pp(ct, "0011").setValue(10);
        fxAdd(layer, "ADBE Black&White");
        var lv = fxAdd(layer, "ADBE Easy Levels2"); pp(lv, "0003").setValue(0.06); pp(lv, "0004").setValue(0.9);
        var po = fxAdd(layer, "ADBE Posterize"); pp(po, "0001").setValue(5);
        var tn = fxAdd(layer, "CC Toner"); pp(tn, "0005").setValue(3);
        pp(tn, "0001").setValue(hx(tones[0])); pp(tn, "0006").setValue(hx(tones[1]));
        pp(tn, "0002").setValue(hx(tones[2])); pp(tn, "0007").setValue(hx(tones[3]));
        pp(tn, "0003").expression = pal(2) + ';';   // shadows = the ink
    }
    var photoIdx = 0;
    function makeFrameComp(name, w, h, phColor) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var ph = c.layers.addSolid([1, 1, 1], "placeholder", w, h, 1, DUR);
        fillFx(ph, '[' + hx(phColor).join(",") + ']');
        var g = fxAdd(ph, "ADBE Ramp"); pp(g, "0001").setValue([w * 0.2, 0]); pp(g, "0003").setValue([w * 0.8, h]);
        pp(g, "0002").setValue([0.9, 0.9, 0.9, 1]); pp(g, "0004").setValue([0.15, 0.15, 0.15, 1]);
        if (SIM && PHOTOS.length) {
            var it = app.project.importFile(new ImportOptions(new File(PHOTOS[photoIdx % PHOTOS.length]))); photoIdx++;
            it.parentFolder = preFolder;
            var L = c.layers.add(it); var s = Math.max(w / it.width, h / it.height) * 100;
            tr(L, "ADBE Scale").setValue([s, s]);
        }
        return c;
    }
    function shapeLayer(comp, name) { var s = comp.layers.addShape(); s.name = name; return s; }

    // ============================================================ BUILD
    app.purge(PurgeTarget.ALL_CACHES);
    while (app.project.numItems > 0) { app.project.item(1).remove(); }
    app.project.bitsPerChannel = 8;
    var mainComp = app.project.items.addComp("mainComp", W, H, 1, DUR * 2, FPS);
    var shotsFolder = app.project.items.addFolder("ORIGINAL_SHOTS");
    var preFolder = app.project.items.addFolder("PRECOMPS");
    var mcL = mainComp.layers.addNull(DUR * 2); mcL.name = "mainControl";
    addSlider(mcL, "FORM", 50); addSlider(mcL, "FLOW", 50); addSlider(mcL, "PRESSURE", 50);
    addColorCtl(mcL, "1", FIELD); addColorCtl(mcL, "2", INK); addColorCtl(mcL, "3", RED);
    log.push("mainComp + mainControl");

    function newShot(name) { var c = app.project.items.addComp(name, W, H, 1, DUR, FPS); c.parentFolder = shotsFolder; makeController(c); return c; }
    var PH = [[0.3, 0.3, 4], [3.4, 0.3, 4], [6.5, 0.32, 3]];
    function sim(tcomp, texts) { if (!SIM) return; markers(tcomp, PH); simTexts(tcomp.layer("textBlock"), PH, texts); }

    // giant assembly (letter spec "<defs>@@<expr>")
    function giant(comp, name, spec, colJS, scale, applyFill) {
        var parts = spec.split("@@");
        var t = makeText(comp, "M", 1000); t.name = name;
        var swl = (SW / (scale / 100)).toFixed(3);
        textDoc(t).expression = PALJS + SETJS + HDR + parts[0] +
            'var LTR = ' + parts[1] + ';\n' +
            'var COL = ' + colJS + ';\n' +
            'style.setText(LTR).setFont("' + FONT + '").setFontSize(1000).setTracking(0).setAllCaps(false)' +
            '.setApplyFill(' + (applyFill === false ? 'false' : 'true') + ').setFillColor(COL).setApplyStroke(true).setStrokeColor(INK).setStrokeWidth(' + swl + ');';
        tr(t, "ADBE Scale").setValue([scale, scale]);
        tr(t, "ADBE Anchor Point").expression = 'var r = sourceRectAtTime(time, false); [r.left + r.width/2, r.top + r.height/2];';
        return t;
    }

    // ============================================================ 01 STACK — text on a pile of giant story letters
    var t01 = makeTextComp({ name: "01-text", w: 1000, h: 980, sample: "EVERY WORD LANDS ON THE PILE", size: 300,
        mode: "drop", maxL: 3, lead: 0.86, trk: -110, cw: 0.6, drop: 2400, firstDelay: 0.35 });
    sim(t01, ["Every word lands on the pile", "Stack the story letter by letter", "Built to be seen"]);
    var s01 = newShot("01");
    makeBG(s01);
    // pile: 4 slots, layout by section, grows with the section index (2 → 4 letters)
    var LAY = '[[[230, 400, 120], [870, 1700, 115], [930, 560, 100], [150, 1560, 105]],' +
        '[[860, 360, 125], [240, 1720, 115], [140, 820, 95], [950, 1420, 105]],' +
        '[[540, 230, 130], [560, 1830, 120], [-10, 1060, 110], [1090, 1200, 110]]]';
    for (var k = 3; k >= 0; k--) {
        var g01 = giant(s01, "pile-" + k, pickLetter("01-text", k, k === 0), k === 0 ? 'RED' : setColor(k), 100);
        tr(g01, "ADBE Scale").expression = HDR + 'var LY = ' + LAY + '[SEC % 3][' + k + ']; [LY[2], LY[2]];';
        textDoc(g01).expression = textDoc(g01).expression.replace(/setStrokeWidth\([0-9.]+\)/,
            'setStrokeWidth(' + SW + '/(' + LAY + '[SEC % 3][' + k + '][2]/100))');
        tr(g01, "ADBE Position").expression = HDR + 'var LY = ' + LAY + '[SEC % 3][' + k + '];\n' +
            'var a = eob(win(en, ' + (k * 0.13) + ', ' + (k * 0.13 + 0.5) + '), 1.4);\n' +
            'var b = ei(win(ex, ' + (0.35 + (3 - k) * 0.1) + ', ' + (0.7 + (3 - k) * 0.1) + '));\n' +
            '[LY[0], LY[1] - 2300*(1 - a) - 2600*b];';
        tr(g01, "ADBE Opacity").expression = HDR + '(' + k + ' < Math.min(4, 2 + Math.floor(SEC/2))) ? 100 : 0;';
    }
    addTextLayer(s01, t01, [540, 1000]);
    s01.layer("controller").moveToBeginning();
    log.push("01 stack");

    // ============================================================ 02 GIANT — one letter fills the frame, tips in like a plank
    var t02 = makeTextComp({ name: "02-text", w: 1000, h: 620, sample: "ONE BIG IDEA AT A TIME", size: 260,
        mode: "drop", maxL: 2, lead: 0.86, trk: -110, cw: 0.6, drop: 2500, firstDelay: 0.45 });
    sim(t02, ["One big idea at a time", "Make it loud", "Make it yours"]);
    var s02 = newShot("02");
    makeBG(s02);
    var g02 = giant(s02, "giant", firstLetter("02-text"), 'RED', 185);
    // pivot on the glyph's bottom-left corner; rest centre (540, 820)
    tr(g02, "ADBE Anchor Point").expression = 'var r = sourceRectAtTime(time, false); [r.left, r.top + r.height];';
    tr(g02, "ADBE Position").expression = 'var r = sourceRectAtTime(time, false), s = transform.scale[0]/100;\n' + HDR +
        'var drop = 1500*ei(win(ex, 0.55, 1));\n' +
        '[540 - r.width*s/2, 820 + r.height*s/2 + drop];';
    tr(g02, "ADBE Rotate Z").expression = HDR +
        '-100*(1 - eob(win(en, 0, 0.62), 1.3)) + 105*ei(win(ex, 0.3, 0.85));';
    addTextLayer(s02, t02, [540, 1440]);
    s02.layer("controller").moveToBeginning();
    log.push("02 giant");

    // ============================================================ 03 CLUSTER — the phrase heaped like the style frame
    var t03 = makeTextComp({ name: "03-text", w: 960, h: 1060, sample: "HEAP OF FUN", size: 340,
        mode: "scatter", maxL: 3, lead: 0.68, trk: -190, cw: 0.5, cluster: true, firstDelay: 0.25, off: 2, spc: 30 });
    sim(t03, ["Heap of fun", "Big and loud", "Yes"]);
    var s03 = newShot("03");
    makeBG(s03);
    var g03 = giant(s03, "corner", pickLetter("03-text", 1, true), 'RED', 115);
    tr(g03, "ADBE Position").expression = HDR + 'var a = eo(win(en, 0, 0.55)), b = ei(win(ex, 0.4, 0.9));\n' +
        '[960 + 900*(1 - a) + 900*b, 300 - 900*(1 - a) - 900*b];';
    var g03b = giant(s03, "corner-2", pickLetter("03-text", 4, false), setColor(2), 100);
    tr(g03b, "ADBE Position").expression = HDR + 'var a = eo(win(en, 0.12, 0.65)), b = ei(win(ex, 0.35, 0.85));\n' +
        '[120 - 900*(1 - a) - 900*b, 1720 + 800*(1 - a) + 800*b];';
    addTextLayer(s03, t03, [540, 960]);
    s03.layer("controller").moveToBeginning();
    log.push("03 cluster");

    // ============================================================ 04 PORTHOLE — media in the counter of a giant O that rolls in
    var t04 = makeTextComp({ name: "04-text", w: 1000, h: 470, sample: "A WINDOW INTO THE STORY", size: 220,
        mode: "drop", maxL: 2, lead: 0.86, trk: -110, cw: 0.6, drop: 2500, firstDelay: 0.5 });
    sim(t04, ["A window into the story", "Look closer", "Right here"]);
    var f04 = makeFrameComp("04-frame", 600, 700, "#4BA5D9");
    var s04 = newShot("04");
    makeBG(s04);
    var OX = 540, OY = 760, R = 450;
    var ROLLX = HDR + 'var a = eo(win(en, 0, 0.7)), b = ei(win(ex, 0.35, 1));\n' +
        'var X = ' + OX + ' + 1300*(1 - a) - 1500*b;\n';
    var foot = giant(s04, "foot", pickLetter("04-text", 2, true), setColor(3), 110);
    tr(foot, "ADBE Position").expression = HDR + 'var a = eo(win(en, 0.2, 0.7)), b = ei(win(ex, 0.4, 0.9));\n' +
        '[170, 1760 + 900*(1 - a) + 900*b];';
    var fr04 = s04.layers.add(f04); fr04.name = "04-frame";
    treatMedia(fr04, ["#DEDBCF", "#B9CDEB", "#F19CCF", "#469D5C"]);
    tr(fr04, "ADBE Position").expression = ROLLX + '[X, ' + OY + '];';
    var hole = shapeLayer(s04, "counter-matte");
    var hg = hole.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    hg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([540, 660]);
    hg = hole.property("ADBE Root Vectors Group").property(1);
    hg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([1, 1, 1]);
    tr(hole, "ADBE Position").expression = ROLLX + '[X, ' + OY + '];';
    tr(hole, "ADBE Rotate Z").expression = ROLLX + '(X - ' + OX + ')/' + R + '*180/Math.PI;';
    hole.moveBefore(fr04);
    fr04.setTrackMatte(hole, TrackMatteType.ALPHA);
    var ring = shapeLayer(s04, "O ring");
    var rg = ring.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); rg.name = "O";
    rg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([880, 920]);
    rg = ring.property("ADBE Root Vectors Group").property(1);
    rg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([520, 640]);
    rg = ring.property("ADBE Root Vectors Group").property(1);
    rg.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Merge").property("ADBE Vector Merge Type").setValue(3);   // subtract
    rg = ring.property("ADBE Root Vectors Group").property(1);
    var rf = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill"); rf.property("ADBE Vector Fill Color").expression = pal(3) + ';';
    rg = ring.property("ADBE Root Vectors Group").property(1);
    var rs = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
    rs.property("ADBE Vector Stroke Color").expression = pal(2) + ';'; rs.property("ADBE Vector Stroke Width").setValue(SW);
    tr(ring, "ADBE Position").expression = ROLLX + '[X, ' + OY + '];';
    tr(ring, "ADBE Rotate Z").expression = ROLLX + '(X - ' + OX + ')/' + R + '*180/Math.PI;';
    addTextLayer(s04, t04, [540, 1520]);
    s04.layer("controller").moveToBeginning();
    log.push("04 porthole");

    // ============================================================ 05 WINDOW — media seen through a giant story letter, stacked on its red twin
    var t05 = makeTextComp({ name: "05-text", w: 1000, h: 430, sample: "SEEN THROUGH A LETTER", size: 210,
        mode: "drop", maxL: 2, lead: 0.86, trk: -110, cw: 0.6, drop: 2500, firstDelay: 0.55, off: 4 });
    sim(t05, ["Seen through a letter", "The picture lives here", "Inside the pile"]);
    var f05 = makeFrameComp("05-frame", 1080, 1400, "#F19CCF");
    var s05 = newShot("05");
    makeBG(s05);
    var GX = 540, GY = 780, GS = 150;
    var twin = giant(s05, "twin", firstLetter("05-text"), 'RED', GS);
    tr(twin, "ADBE Position").expression = HDR + 'var a = eo(win(en, 0, 0.5)), b = ei(win(ex, 0.5, 1));\n' +
        '[' + (GX - 46) + ' - 1400*(1 - a) - 1400*b, ' + (GY + 46) + '];';
    var WPOS = HDR + 'var a = eob(win(en, 0.25, 0.85), 1.5), b = ei(win(ex, 0.3, 0.75));\n' +
        'var P = [' + GX + ', ' + GY + ' - 2300*(1 - a) - 2300*b];\n';
    var fr05 = s05.layers.add(f05); fr05.name = "05-frame";
    treatMedia(fr05, ["#F3DA5A", "#F19CCF", "#4BA5D9", "#6A85D9"]);
    tr(fr05, "ADBE Position").expression = WPOS + 'P;';
    var wm = giant(s05, "window-matte", firstLetter("05-text"), '[1,1,1]', GS);
    tr(wm, "ADBE Position").expression = WPOS + 'P;';
    wm.moveBefore(fr05);
    fr05.setTrackMatte(wm, TrackMatteType.ALPHA);
    var we = giant(s05, "window-edge", firstLetter("05-text"), 'INK', GS, false);
    tr(we, "ADBE Position").expression = WPOS + 'P;';
    we.moveToBeginning();
    addTextLayer(s05, t05, [540, 1590]);
    s05.layer("controller").moveToBeginning();
    log.push("05 window");

    // ============================================================ 06 CROWD — media framed by giant letters crowding in from every edge
    var t06 = app.project.items.addComp("06-text", 600, 200, 1, DUR, FPS); t06.parentFolder = preFolder;
    var tb06 = makeText(t06, "", 100); tb06.name = "textBlock";   // media-only: empty textBlock for the validator
    var f06 = makeFrameComp("06-frame", W, H, "#6A85D9");
    var s06 = newShot("06");
    makeBG(s06);
    var fr06 = s06.layers.add(f06); fr06.name = "06-frame";
    treatMedia(fr06, ["#F3DA5A", "#F19CCF", "#6A85D9", "#469D5C"]);
    tr(fr06, "ADBE Scale").expression = HDR + 'var s = 100 + 14*(1 - eo(win(en, 0, 0.8))) - 6*ei(win(ex, 0.3, 1)); [s, s];';
    // [x, y, scale, fromX, fromY, toX, toY, color]
    var CROWD = [[110, 230, 120, -900, -700, 330, 600, setColor(1)], [990, 330, 115, 900, -700, 780, 700, 'RED'],
                 [230, 1640, 110, -900, 700, 400, 1330, setColor(3)], [960, 1660, 125, 900, 700, 760, 1300, setColor(6)]];
    for (var q = 0; q < CROWD.length; q++) {
        var C = CROWD[q];
        var gq = giant(s06, "crowd-" + q, fixedLetters("MOLN", q), C[7], C[2]);
        tr(gq, "ADBE Position").expression = HDR + 'var a = eob(win(en, ' + (q * 0.1) + ', ' + (q * 0.1 + 0.55) + '), 1.3), b = ei(win(ex, ' + (0.3 + q * 0.06) + ', ' + (0.8 + q * 0.05) + '));\n' +
            '[' + C[0] + ' + ' + C[3] + '*(1 - a) + ' + (C[5] - C[0]) + '*b, ' + C[1] + ' + ' + C[4] + '*(1 - a) + ' + (C[6] - C[1]) + '*b];';
    }
    var t06L = s06.layers.add(t06); t06L.name = "06-text";
    s06.layer("controller").moveToBeginning();
    log.push("06 crowd");

    // ============================================================ 07 POSTER — flattened media revealed by a sweeping red letter
    var t07 = makeTextComp({ name: "07-text", w: 1000, h: 660, sample: "THE PICTURE BECOMES PART OF THE PILE", size: 240,
        mode: "drop", maxL: 3, lead: 0.86, trk: -110, cw: 0.6, drop: 2400, firstDelay: 0.55, off: 1 });
    sim(t07, ["The picture becomes part of the pile", "Printed flat", "Loud and clear"]);
    var f07 = makeFrameComp("07-frame", W, H, "#469D5C");
    var s07 = newShot("07");
    makeBG(s07);
    var SWEEP = HDR + 'var a = eo(win(en, 0, 0.75)), b = ei(win(ex, 0.25, 0.9));\n' +
        'var X = (b > 0) ? -1300 + 3200*b : 1900 - 3200*a;\n';
    var fr07 = s07.layers.add(f07); fr07.name = "07-frame";
    treatMedia(fr07, ["#DEDBCF", "#F19CCF", "#4BA5D9", "#6A85D9"]);
    var rev = shapeLayer(s07, "reveal-matte");
    var rvg = rev.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    rvg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([4000, H + 200]);
    rvg = rev.property("ADBE Root Vectors Group").property(1);
    rvg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([1, 1, 1]);
    tr(rev, "ADBE Position").expression = SWEEP + '[X + 2000, ' + (H / 2) + '];';   // media visible right of the letter's centre
    rev.moveBefore(fr07);
    fr07.setTrackMatte(rev, TrackMatteType.ALPHA);
    var sw07 = giant(s07, "sweeper", firstLetter("07-text"), 'RED', 230);
    tr(sw07, "ADBE Position").expression = SWEEP + '[X, ' + (H / 2) + '];';
    tr(sw07, "ADBE Rotate Z").expression = SWEEP + '-8*Math.sin(Math.max(a, b)*Math.PI);';
    var back07 = addTextLayer(s07, t07, [540, 1380]); back07.name = "07-text";
    var mm = fxAdd(back07, "ADBE Minimax"); pp(mm, "0001").setValue(2); pp(mm, "0002").setValue(16); pp(mm, "0003").setValue(2);
    fillFx(back07, pal(1));
    var edge07 = addTextLayer(s07, t07, [540, 1380]); edge07.name = "07-text";   // the backing's own ink edge
    var mm2 = fxAdd(edge07, "ADBE Minimax"); pp(mm2, "0001").setValue(2); pp(mm2, "0002").setValue(16 + SW); pp(mm2, "0003").setValue(2);
    fillFx(edge07, pal(2));
    back07.moveBefore(sw07); edge07.moveAfter(back07);
    addTextLayer(s07, t07, [540, 1380]);
    s07.layer("controller").moveToBeginning();
    log.push("07 poster");

    mcL.moveToBeginning();
    return log.join("\n");
}
