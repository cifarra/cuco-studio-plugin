// Hialeah City Dental — "Settle" — CucoStudio style builder (AE, ES3)
// Two shots: 01 hero title (text only, navy) · 02 framed media + subtitles (cream).
// Usage: $.evalFile(this); HDC_BUILD({ sim: true|false, photo: "/abs/path.jpg" })

function HDC_BUILD(opts) {
    var SIM = !!opts.sim;
    var log = [];
    var W = 1080, H = 1920, FPS = 30, DUR = 10;

    var CREAM = [251 / 255, 248 / 255, 244 / 255, 1];
    var NAVY = [21 / 255, 35 / 255, 68 / 255, 1];
    var PEACH = [239 / 255, 215 / 255, 194 / 255, 1];

    var F_SERIF = "Newsreader60pt-Regular";
    var F_LABEL = "Manrope-SemiBold";
    var F_BODY = "Manrope-Medium";

    // ------------------------------------------------------------ expression snippets
    var TRI =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n';
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function qo(p) { p = cl(p); return 1 - Math.pow(1 - p, 4); }\n' +
        'function ci(p) { p = cl(p); return p*p*p; }\n' +
        'function sm(p) { p = cl(p); return p*p*(3 - 2*p); }\n' +
        'function win(v, a, b) { return cl((v - a)/(b - a)); }\n' +
        'function mix(a, b, t) { return [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t, 1]; }\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n';
    var CTL =
        'var CT = thisComp.layer("controller");\n' +
        'var en = CT.effect("enter")("Slider").value/100, ex = CT.effect("exit")("Slider").value/100;\n' +
        'function IN(a, b) { return qo(win(en, a, b)); }\n' +
        'function OUT(a, b) { return ci(win(ex, a, b)); }\n' +
        'var FUR = 1 - sm(win(FORM, 0.62, 0.92));\n';
    var HDR = TRI + FN + CTL;
    // phrase timing from the text comp's director markers ("0".."100" per word)
    var PHR =
        'function phr(S) { var m = S.marker, n = m.numKeys, t0 = -1, t1 = 1e6, prev = 1e9;\n' +
        '  for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0;\n' +
        '    var st = (k == 1) || (c == "0") || (v < prev); prev = v;\n' +
        '    if (st) { var tk = m.key(k).time; if (tk <= time + 0.001) { t0 = tk; } else { t1 = tk; break; } } }\n' +
        '  if (n == 0) t0 = 0; return [t0, t1]; }\n';
    function pal(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }

    // ------------------------------------------------------------ helpers
    function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }
    function fxAdd(layer, mn) { return layer.property("ADBE Effect Parade").addProperty(mn); }
    function fxByName(fx, nm) {
        for (var i = 1; i <= fx.numProperties; i++) { if (fx.property(i).name == nm) return fx.property(i); }
        return null;
    }
    function addSlider(layer, name, value) {
        var fx = fxAdd(layer, "ADBE Slider Control"); fx.name = name;
        fx.property("ADBE Slider Control-0001").setValue(value); return fx;
    }
    function addColorCtl(layer, name, rgba) {
        var fx = fxAdd(layer, "ADBE Color Control"); fx.name = name;
        fx.property("ADBE Color Control-0001").setValue(rgba); return fx;
    }
    function fillFx(layer, colorExpr) {
        var fx = fxAdd(layer, "ADBE Fill");
        fx.property("ADBE Fill-0002").expression = colorExpr;
        return fx;
    }
    function textDoc(t) { return t.property("ADBE Text Properties").property("ADBE Text Document"); }
    function makeText(comp, str, font, size, just, rgb, tracking, leading) {
        var t = comp.layers.addText(str);
        var p = textDoc(t);
        var d = p.value;
        try { d.resetCharStyle(); } catch (e1) {}
        try { d.resetParagraphStyle(); } catch (e2) {}
        d.font = font; d.fontSize = size;
        d.applyFill = true; d.fillColor = rgb; d.applyStroke = false;
        d.justification = just;
        d.tracking = tracking || 0;
        if (leading) { d.autoLeading = false; d.leading = leading; }
        try { d.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; } catch (e3) {}
        try { d.fauxBold = false; d.fauxItalic = false; } catch (e4) {}
        p.setValue(d);
        return t;
    }
    function makeController(comp) {
        var c = comp.layers.addNull(DUR);
        c.name = "controller";
        var en = addSlider(c, "enter", 0).property("ADBE Slider Control-0001");
        en.setValueAtTime(0, 0); en.setValueAtTime(1.5, 100);
        var ex = addSlider(c, "exit", 0).property("ADBE Slider Control-0001");
        ex.setValueAtTime(DUR - 1.5, 0); ex.setValueAtTime(DUR, 100);
        return c;
    }
    function makeSolid(comp, name, rgb) {
        return comp.layers.addSolid(rgb, name, W, H, 1, DUR);
    }
    function shapeLayer(comp, name) {
        var s = comp.layers.addShape(); s.name = name; return s;
    }
    function grp(parentContents, name) {
        var g = parentContents.addProperty("ADBE Vector Group"); g.name = name; return g;
    }
    function gv(g) { return g.property("ADBE Vectors Group"); }
    function addPath(g, verts, ins, outs, closed) {
        var p = gv(g).addProperty("ADBE Vector Shape - Group");
        var sh = new Shape();
        sh.vertices = verts;
        var zeros = [];
        for (var i = 0; i < verts.length; i++) zeros.push([0, 0]);
        sh.inTangents = ins || zeros; sh.outTangents = outs || zeros; sh.closed = !!closed;
        p.property("ADBE Vector Shape").setValue(sh);
        return p;
    }
    function addStroke(g, width, colorExpr, opacity) {
        var s = gv(g).addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").expression = colorExpr;
        s.property("ADBE Vector Stroke Width").setValue(width);
        s.property("ADBE Vector Stroke Line Cap").setValue(2);
        s.property("ADBE Vector Stroke Line Join").setValue(2);
        if (opacity !== undefined) s.property("ADBE Vector Stroke Opacity").setValue(opacity);
        return s;
    }
    function addFillV(g, colorExpr) {
        var f = gv(g).addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").expression = colorExpr;
        return f;
    }
    function addTrim(g, endExpr) {
        var t = gv(g).addProperty("ADBE Vector Filter - Trim");
        t.property("ADBE Vector Trim End").expression = endExpr;
        return t;
    }
    function markers(comp, phrases) {
        // phrases: [[t0, durWords, nWords], ...] — director-style "0".."100" per word + hold
        for (var i = 0; i < phrases.length; i++) {
            var t0 = phrases[i][0], dw = phrases[i][1], n = phrases[i][2];
            comp.markerProperty.setValueAtTime(t0, new MarkerValue("0"));
            for (var k = 1; k <= n; k++) {
                comp.markerProperty.setValueAtTime(t0 + 1 / FPS + (k - 1) * dw,
                    new MarkerValue(String(Math.round(k / n * 100))));
            }
            if (i < phrases.length - 1) {
                comp.markerProperty.setValueAtTime(phrases[i + 1][0] - 1 / FPS, new MarkerValue("100"));
            }
        }
    }
    function simTexts(tb, phrases, texts) {
        var p = textDoc(tb);
        for (var i = 0; i < texts.length; i++) {
            var d = p.value; d.text = texts[i];
            p.setValueAtTime(Math.max(0, phrases[i][0] + 1 / FPS), d);
        }
    }

    // ------------------------------------------------------------ HCD monogram (vector rebuild)
    // geometry measured from logo-navy.png (mark bbox 216 x 325 units, stroke 17.5)
    function makeMark(comp, name, x, y, hPx, colorIdx, a, b) {
        var s = hPx / 325;
        function P(px, py) { return [px * s, py * s]; }
        var L = shapeLayer(comp, name);
        var root = L.property("ADBE Root Vectors Group");
        var col = pal(colorIdx);
        var sw = 17.5 * s;
        var still = (a === null);  // still: persistent furniture, drawn from frame 1 (no draw-on)
        function seg(win0, win1) {
            if (still) return '100;';
            return HDR + 'var p = IN(' + a + ' + (' + b + ' - ' + a + ')*' + win0 + ', ' + a + ' + (' + b + ' - ' + a + ')*' + win1 + ');\n100*p;';
        }
        var g1 = grp(root, "H-left"); addPath(g1, [P(8.5, 12.75), P(8.5, 114.25)]); addTrim(g1, seg(0.0, 0.42)); addStroke(g1, sw, col);
        var g2 = grp(root, "H-right"); addPath(g2, [P(86.5, 12.75), P(86.5, 114.25)]); addTrim(g2, seg(0.08, 0.5)); addStroke(g2, sw, col);
        var g3 = grp(root, "H-bar"); addPath(g3, [P(8.5, 62), P(86.5, 62)]); addTrim(g3, seg(0.2, 0.55)); addStroke(g3, sw, col);
        // C arc: centre (180.5, 63.5) r 52.5, from 300deg through 180 to 60 (opens right)
        var cx = 180.5, cy = 63.5, r = 52.5, hl = 4 / 3 * Math.tan(Math.PI / 12) * r;
        var cv = [], ci2 = [], co = [];
        for (var k = 0; k < 5; k++) {
            var ang = (300 - 60 * k) * Math.PI / 180;
            cv.push(P(cx + r * Math.cos(ang), cy + r * Math.sin(ang)));
            var dx = Math.sin(ang) * hl * s, dy = -Math.cos(ang) * hl * s;
            co.push(k < 4 ? [dx, dy] : [0, 0]);
            ci2.push(k > 0 ? [-dx, -dy] : [0, 0]);
        }
        var g4 = grp(root, "C"); addPath(g4, cv, ci2, co, false); addTrim(g4, seg(0.22, 0.68)); addStroke(g4, sw, col);
        // dot (the "eye")
        var g5 = grp(root, "dot");
        var el = gv(g5).addProperty("ADBE Vector Shape - Ellipse");
        el.property("ADBE Vector Ellipse Size").setValue([21 * s, 21 * s]);
        el.property("ADBE Vector Ellipse Position").setValue(P(180, 63.5));
        addFillV(g5, col);
        var g5t = g5.property("ADBE Vector Transform Group");
        g5t.property("ADBE Vector Anchor").setValue(P(180, 63.5));
        g5t.property("ADBE Vector Position").setValue(P(180, 63.5));
        if (!still) g5t.property("ADBE Vector Scale").expression =
            HDR + 'var p = IN(' + a + ' + (' + b + ' - ' + a + ')*0.55, ' + a + ' + (' + b + ' - ' + a + ')*0.8);\n[100*p, 100*p];';
        // D cup — drawn down the left side, round the smile, up the right, top bar last
        var K = 0.5523 * 72 * s;
        var g6 = grp(root, "D");
        addPath(g6,
            [P(8.5, 154.5), P(8.5, 241.5), P(80.5, 313.5), P(135, 313.5), P(207, 241.5), P(207, 154.5)],
            [[0, 0], [0, 0], [-K, 0], [0, 0], [0, K], [0, 0]],
            [[0, 0], [0, K], [0, 0], [K, 0], [0, 0], [0, 0]], true);
        addTrim(g6, seg(0.32, 1.0)); addStroke(g6, sw, col);
        tr(L, "ADBE Anchor Point").setValue([0, 0]);
        tr(L, "ADBE Position").setValue([x, y]);
        return L;
    }
    function makeWordmark(comp, x, yMid, hPx, rgb, colorIdx) {
        var fs = Math.round(hPx * 0.185 / 0.72);
        var lead = Math.round(hPx * 0.32);
        var t = makeText(comp, "HIALEAH CITY\rDENTAL", F_LABEL, fs, ParagraphJustification.LEFT_JUSTIFY, rgb, 70, lead);
        t.name = "wordmark";
        // baseline of line 1 so the 2-line block centres on the mark
        var capH = fs * 0.72;
        tr(t, "ADBE Position").setValue([x, yMid - lead / 2 + capH / 2]);
        fillFx(t, pal(colorIdx));
        return t;
    }

    // ============================================================ BUILD
    app.purge(PurgeTarget.ALL_CACHES);
    while (app.project.numItems > 0) { app.project.item(1).remove(); }

    var mainComp = app.project.items.addComp("mainComp", W, H, 1, DUR * 2, FPS);
    var shotsFolder = app.project.items.addFolder("ORIGINAL_SHOTS");
    var preFolder = app.project.items.addFolder("PRECOMPS");
    var mc = mainComp.layers.addNull(DUR * 2);
    mc.name = "mainControl";
    addSlider(mc, "FORM", 45);
    addSlider(mc, "FLOW", 45);
    addSlider(mc, "PRESSURE", 25);
    addColorCtl(mc, "1", CREAM);
    addColorCtl(mc, "2", NAVY);
    addColorCtl(mc, "3", PEACH);
    log.push("mainComp + mainControl");

    // ============================================================ SHOT 01 — HERO TITLE (text only)
    var X0 = 84, TOPY = 700, TW = 912, TH = 640;
    var t01 = app.project.items.addComp("01-text", TW, TH, 1, DUR, FPS);
    t01.parentFolder = preFolder;
    var tb01 = makeText(t01, "Transforming smiles with care.", F_SERIF, 150,
        ParagraphJustification.LEFT_JUSTIFY, [CREAM[0], CREAM[1], CREAM[2]], -22, 156);
    tb01.name = "textBlock";
    // Stack 1-3 balanced lines for the biggest type in the zone; the section's LAST phrase
    // lands with its last line in Newsreader Italic, peach (the site's hero gesture).
    textDoc(tb01).expression =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var C1 = MC.effect("1")("Color").value, C3 = MC.effect("3")("Color").value;\n' +
        'var PS = [];\n' +
        '(function () { var m = thisComp.marker, n = m.numKeys, prev = 1e9; for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) PS.push(m.key(k).time); prev = v; } })();\n' +
        'var CNT = PS.length, IDX = 0;\n' +
        'for (var q = 0; q < CNT; q++) { if (PS[q] <= time + 0.001) IDX = q + 1; }\n' +
        'var LAND = (CNT == 0) || (IDX == CNT);\n' +
        'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "");\n' +
        'var res = s;\n' +
        'var fs = style.fontSize, zw = thisComp.width, zh = thisComp.height;\n' +
        'if (s.length > 0) {\n' +
        '  var w = s.split(/\\s+/), u = [];\n' +
        '  for (var i = 0; i < w.length; i++) {\n' +
        '    if (w[i].length <= 2 && i < w.length - 1) { w[i + 1] = w[i] + " " + w[i + 1]; }\n' +
        '    else { u.push(w[i]); }\n' +
        '  }\n' +
        '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
        '  function split(nl) {\n' +
        '    if (nl == 1) return [u.join(" ")];\n' +
        '    if (nl == 2) { var bb = 1, bv = 1e9; for (var b1 = 1; b1 < u.length; b1++) { var v = Math.max(L(0, b1), L(b1, u.length)); if (v < bv) { bv = v; bb = b1; } } return [u.slice(0, bb).join(" "), u.slice(bb).join(" ")]; }\n' +
        '    var c1 = 1, c2 = 2, bv3 = 1e9; for (var b1 = 1; b1 < u.length - 1; b1++) { for (var b2 = b1 + 1; b2 < u.length; b2++) { var v = Math.max(L(0, b1), L(b1, b2), L(b2, u.length)); if (v < bv3) { bv3 = v; c1 = b1; c2 = b2; } } }\n' +
        '    return [u.slice(0, c1).join(" "), u.slice(c1, c2).join(" "), u.slice(c2).join(" ")];\n' +
        '  }\n' +
        '  var best = null, bs = -1;\n' +
        '  for (var nl = 1; nl <= Math.min(3, u.length); nl++) {\n' +
        '    var ls = split(nl), mc = 0; for (var j = 0; j < ls.length; j++) mc = Math.max(mc, ls[j].length);\n' +
        '    var sc = Math.min(fs, zw/(mc*0.46), zh/(nl*1.06));\n' +
        '    if (sc > bs + 0.5) { bs = sc; best = ls; }\n' +
        '  }\n' +
        '  res = best.join("\\r");\n' +
        '}\n' +
        'var st = style.setText(res).setAllCaps(false).setAutoLeading(false).setLeading(fs*1.04).setFont("Newsreader60pt-Regular").setFillColor([C1[0], C1[1], C1[2]]);\n' +
        'if (LAND && res.length > 0) { var li = res.lastIndexOf("\\r") + 1; var n = res.length - li;\n' +
        '  st = st.setFont("Newsreader60pt-Italic", li, n).setFillColor([C3[0], C3[1], C3[2]], li, n); }\n' +
        'st;';
    var PH01 = [[0.3, 0.3, 4], [3.4, 0.3, 5], [6.4, 0.28, 4]];
    markers(t01, PH01);
    if (SIM) simTexts(tb01, PH01, ["Transforming smiles with care.", "Gentle dentistry for every family", "We\u2019re here for you."]);

    var s01 = app.project.items.addComp("01", W, H, 1, DUR, FPS);
    s01.parentFolder = shotsFolder;
    var ctl01 = makeController(s01);

    // BG + slate light from the top-right (the hero portrait's light) + grain
    var bg01 = makeSolid(s01, "BG", [1, 1, 1]);
    fillFx(bg01, pal(2));
    var glow01 = makeSolid(s01, "light", [1, 1, 1]);
    var rp = fxAdd(glow01, "ADBE Ramp");
    rp.property("ADBE Ramp-0005").setValue(2); // radial
    rp.property("ADBE Ramp-0006").setValue(18); // scatter (anti-banding)
    rp.property("ADBE Ramp-0001").expression = TRI +
        '[820 + Math.sin(time*0.31)*90*FLOW, 430 + Math.cos(time*0.23)*70*FLOW];';
    rp.property("ADBE Ramp-0003").expression = TRI +
        'var c = [820 + Math.sin(time*0.31)*90*FLOW, 430 + Math.cos(time*0.23)*70*FLOW]; [c[0] - 380 - 260*FORM, c[1] + 980 + 420*FORM];';
    rp.property("ADBE Ramp-0002").expression = TRI + FN + 'mix(C2, C1, 0.2 + 0.1*FORM);';
    rp.property("ADBE Ramp-0004").expression = TRI + FN + 'mix(C2, [0, 0, 0, 1], 0.28);';
    tr(glow01, "ADBE Opacity").expression = HDR + '100*IN(0, 0.7)*(1 - 0.5*OUT(0.3, 1));';

    var grain01 = s01.layers.addSolid([1, 1, 1], "grain", W, H, 1, DUR);
    grain01.adjustmentLayer = true;
    var nz = fxAdd(grain01, "ADBE Noise");
    nz.property(1).expression = TRI + '1.2 + 6*PRES;';
    try { nz.property(2).setValue(0); } catch (eN) {}

    // info card (site hero's VISIT US | CALL strip)
    var card = shapeLayer(s01, "info-card");
    var cr = card.property("ADBE Root Vectors Group");
    var cg = grp(cr, "box");
    var rect = gv(cg).addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").setValue([TW, 150]);
    rect.property("ADBE Vector Rect Roundness").setValue(16);
    addStroke(cg, 1.6, pal(1), 24);
    var dg = grp(cr, "divider");
    addPath(dg, [[0, -42], [0, 42]]);
    addStroke(dg, 1.6, pal(1), 24);
    tr(card, "ADBE Position").setValue([540, 1525]);
    tr(card, "ADBE Opacity").expression = HDR + '100*FUR*IN(0.3, 0.85)*(1 - OUT(0.5, 0.95));';
    tr(card, "ADBE Scale").expression = HDR + 'var p = IN(0.3, 0.9); [100, 100*(0.92 + 0.08*p)];';
    var infoTxt = [
        ["VISIT US", 124, 1499, F_LABEL, 20, 240, 0.55, 0.36],
        ["1544 W 37th St, Hialeah", 124, 1552, F_BODY, 30, 0, 0.92, 0.42],
        ["CALL", 580, 1499, F_LABEL, 20, 240, 0.55, 0.44],
        ["(305) 558-9222", 580, 1552, F_BODY, 30, 0, 0.92, 0.5]
    ];
    for (var it = 0; it < infoTxt.length; it++) {
        var I = infoTxt[it];
        var tl = makeText(s01, I[0], I[3], I[4], ParagraphJustification.LEFT_JUSTIFY, [1, 1, 1], I[5]);
        tl.name = "info-" + it;
        fillFx(tl, pal(1));
        tr(tl, "ADBE Position").setValue([I[1], I[2]]);
        tr(tl, "ADBE Position").expression = HDR + 'var p = IN(' + I[7] + ', ' + (I[7] + 0.45) + '); value + [0, 14*(1 - p)];';
        tr(tl, "ADBE Opacity").expression = HDR + (I[6] * 100) + '*FUR*IN(' + I[7] + ', ' + (I[7] + 0.45) + ')*(1 - OUT(0.5, 0.95));';
    }

    // eyebrow: hairline rule + tracked caps
    var rule01 = shapeLayer(s01, "eyebrow-rule");
    var rg = grp(rule01.property("ADBE Root Vectors Group"), "rule");
    addPath(rg, [[0, 0], [56, 0]]);
    addTrim(rg, HDR + '100*IN(0.12, 0.6)*(1 - OUT(0.55, 0.95));');
    var rs = addStroke(rg, 1.8, pal(1), 60);
    rs.property("ADBE Vector Stroke Line Cap").setValue(1);
    tr(rule01, "ADBE Anchor Point").setValue([0, 0]);
    tr(rule01, "ADBE Position").setValue([X0, TOPY - 46]);
    tr(rule01, "ADBE Opacity").expression = HDR + '100*FUR;';
    var lab01 = makeText(s01, "DENTAL CARE", F_LABEL, 24, ParagraphJustification.LEFT_JUSTIFY, [1, 1, 1], 280);
    lab01.name = "eyebrow-label";
    fillFx(lab01, pal(1));
    tr(lab01, "ADBE Position").setValue([X0 + 56 + 22, TOPY - 46 + 8.6]);
    tr(lab01, "ADBE Position").expression = HDR + 'var p = IN(0.3, 0.75); value + [-18*(1 - p), 0];';
    tr(lab01, "ADBE Opacity").expression = HDR + '72*FUR*IN(0.3, 0.75)*(1 - OUT(0.55, 0.95));';

    // logo lockup (top-left)
    var MH = 88, MY = 104;
    var mark01 = makeMark(s01, "hcd-mark", X0, MY, MH, 1, 0.0, 0.85);
    mark01.property("ADBE Transform Group").property("ADBE Opacity").expression = HDR + '100*FUR*(1 - OUT(0.5, 0.95));';
    var wm01 = makeWordmark(s01, X0 + 216 * MH / 325 + 30, MY + MH / 2, MH, [1, 1, 1], 1);
    tr(wm01, "ADBE Opacity").expression = HDR + '100*FUR*IN(0.35, 0.8)*(1 - OUT(0.5, 0.95));';
    tr(wm01, "ADBE Position").expression = HDR + 'var p = IN(0.35, 0.8); value + [-14*(1 - p), 0];';

    // TITLE: three copies of the text precomp, each clipped to one line band that is
    // fixed in shot space; each line rises out of its own baseline and settles.
    var LINE_LIB = HDR + PHR +
        'var SRC = thisLayer.source, TB = SRC.layer("textBlock");\n' +
        'var SN = thisComp.name.split("-"); var SEC = parseInt(SN[SN.length - 1], 10); if (isNaN(SEC)) SEC = 0;\n' +
        'var R = TB.sourceRectAtTime(time, false);\n' +
        'var A = TB.toComp([R.left, R.top]), B = TB.toComp([R.left + R.width, R.top + R.height]);\n' +
        'var LFT = Math.min(A[0], B[0]), TOP = Math.min(A[1], B[1]), BOT = Math.max(A[1], B[1]);\n' +
        'var NL = String(TB.text.sourceText.value).split("\\r").length;\n' +
        'var FS = TB.text.sourceText.style.fontSize, LEAD = FS*1.04, BL0 = TB.toComp([0, 0])[1];\n' +
        'var LH = LEAD;\n' +
        'function bnd(k) { if (k <= 0) return -6000; if (k >= NL) return 9000; return BL0 + (k - 1)*LEAD + 0.27*FS; }\n' +
        'var PH = phr(SRC), t0 = PH[0], t1 = PH[1];\n' +
        'var DIN = linear(FLOW, 0, 1, 1.35, 0.8), STG = 0.09, OUTD = 0.34;\n' +
        'var TRV = LH*linear(FLOW, 0, 1, 0.55, 1.0);\n' +
        'function dlay(i) { return Math.max(0, i + PRES*(hsh(SEC*7 + i*3 + 1)*2 - 1)*1.2)*STG; }\n' +
        'function prog(i) {\n' +
        '  var pIn = (t0 < 0) ? 0 : qo((time - t0 - dlay(i))/DIN);\n' +
        '  var pOut = (t1 > 1e5) ? 0 : ci((time - (t1 - OUTD) - (NL - 1 - i)*0.04)/(OUTD - 0.1));\n' +
        '  var pEx = ci(win(ex, 0.62 + (NL - 1 - i)*0.04, 0.9 + (NL - 1 - i)*0.04));\n' +
        '  return [pIn, Math.max(pOut, pEx)];\n' +
        '}\n' +
        'function dyOf(i) { var p = prog(i); return TRV*(1 - p[0]) + TRV*0.8*p[1]; }\n';
    var lines01 = [];
    for (var li = 0; li < 3; li++) {
        var L01 = s01.layers.add(t01);
        L01.name = "01-text";
        L01.collapseTransformation = true;
        // mask 1 isolates line i inside the text comp; mask 2 is the window, fixed in shot space
        var mk = L01.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mk.property("ADBE Mask Offset").setValue(1);
        mk.property("ADBE Mask Shape").expression = LINE_LIB +
            'var i = ' + li + ';\n' +
            'if (i >= NL) { createPath([[0, 0], [1, 0], [1, 1]], [], [], true); } else {\n' +
            '  var y0 = bnd(i), y1 = bnd(i + 1);\n' +
            '  createPath([[-6000, y0], [9000, y0], [9000, y1], [-6000, y1]], [], [], true); }';
        var mk2 = L01.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mk2.maskMode = MaskMode.INTERSECT;
        mk2.property("ADBE Mask Offset").setValue(1);
        mk2.property("ADBE Mask Shape").expression = LINE_LIB +
            'var i = ' + li + ';\n' +
            'if (i >= NL) { createPath([[0, 0], [1, 0], [1, 1]], [], [], true); } else {\n' +
            '  var y0 = bnd(i), y1 = bnd(i + 1), dy = dyOf(i);\n' +
            '  createPath([[-6000, y0 - dy], [9000, y0 - dy], [9000, y1 - dy], [-6000, y1 - dy]], [], [], true); }';
        tr(L01, "ADBE Position").expression = LINE_LIB +
            'var i = ' + li + ';\n' +
            'var an = [SRC.width/2, SRC.height/2];\n' +
            'var jx = Math.pow(PRES, 2)*(hsh(SEC*5 + i*11 + 2) - 0.5)*70;\n' +
            'var fl = Math.sin(time*0.55 + i*0.5)*7*FLOW*FLOW;\n' +
            '[' + X0 + ' + an[0] - LFT + jx, ' + TOPY + ' + an[1] - TOP + dyOf(i) + fl];';
        tr(L01, "ADBE Opacity").expression = LINE_LIB +
            'var i = ' + li + ';\n' +
            'if (i >= NL) { 0; } else { var p = prog(i); 100*cl(p[0]*1.8)*(1 - cl(p[1]*1.25)); }';
        lines01.push(L01);
    }

    // stacking: controller, title lines, eyebrow, logo, info, grain, light, BG
    grain01.moveBefore(glow01);
    log.push("shot 01 built");

    // ============================================================ SHOT 02 — FRAME + SUBTITLES
    var FW = 912, FY = 262, FH = 1000, FCY = FY + FH / 2;
    var DASHY = 1336, SUBTOP = 1384, STH = 280;
    var t02 = app.project.items.addComp("02-text", FW, STH, 1, DUR, FPS);
    t02.parentFolder = preFolder;
    var tb02 = makeText(t02, "Gentle, expert care for every smile.", F_SERIF, 70,
        ParagraphJustification.CENTER_JUSTIFY, [NAVY[0], NAVY[1], NAVY[2]], -10, 82);
    tb02.name = "textBlock";
    // balance into 1-2 lines; words ink from muted to navy as they are spoken
    textDoc(tb02).expression =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value;\n' +
        'function mx(a, b, t) { return [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t]; }\n' +
        'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "");\n' +
        'var res = s, fs = style.fontSize, zw = thisComp.width;\n' +
        'var w = s.length ? s.split(/\\s+/) : [];\n' +
        'if (w.length > 1 && s.length*0.46*fs > zw*0.94) {\n' +
        '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += w[k].length + (k > a ? 1 : 0); return t; }\n' +
        '  var bb = 1, bv = 1e9; for (var b1 = 1; b1 < w.length; b1++) { var v = Math.max(L(0, b1), L(b1, w.length)); if (v < bv) { bv = v; bb = b1; } }\n' +
        '  res = w.slice(0, bb).join(" ") + "\\r" + w.slice(bb).join(" ");\n' +
        '}\n' +
        'var m = thisComp.marker, pv = 100, pt = -1;\n' +
        'if (m.numKeys > 0) { var k = m.nearestKey(time).index; if (m.key(k).time > time + 0.001) k--; if (k >= 1) { pv = parseFloat(m.key(k).comment); pt = m.key(k).time; if (isNaN(pv)) pv = 100; } else { pv = 0; } }\n' +
        'var n = w.length, spoken = Math.round(pv/100*n);\n' +
        'var MUTE = mx(C2, C1, 0.58), INK = [C2[0], C2[1], C2[2]];\n' +
        'var st = style.setText(res).setAllCaps(false).setAutoLeading(false).setLeading(fs*1.17).setFillColor(MUTE);\n' +
        'var idx = 0;\n' +
        'for (var j = 0; j < n; j++) {\n' +
        '  var len = w[j].length;\n' +
        '  if (j < spoken) { var a = (j == spoken - 1 && pt >= 0) ? Math.min(1, (time - pt)/0.18) : 1; st = st.setFillColor(mx(MUTE, INK, a), idx, len); }\n' +
        '  idx += len + 1;\n' +
        '}\n' +
        'st;';
    var PH02 = [[0.35, 0.32, 6], [2.6, 0.3, 4], [4.8, 0.3, 6], [7.1, 0.3, 4]];
    markers(t02, PH02);
    if (SIM) simTexts(tb02, PH02, ["Gentle, expert care for every smile.", "Same-day emergency visits.", "We accept most major insurance plans.", "Book your visit today."]);

    var f02 = app.project.items.addComp("02-frame", FW, FH, 1, DUR, FPS);
    f02.parentFolder = preFolder;
    var ph = f02.layers.addSolid([0.4, 0.45, 0.55], "placeholder", FW, FH, 1, DUR);
    var prp = fxAdd(ph, "ADBE Ramp");
    prp.property("ADBE Ramp-0005").setValue(2);
    prp.property("ADBE Ramp-0001").setValue([FW * 0.75, FH * 0.2]);
    prp.property("ADBE Ramp-0003").setValue([FW * 0.1, FH * 1.1]);
    prp.property("ADBE Ramp-0002").expression = TRI + FN + 'mix(C2, C1, 0.3);';
    prp.property("ADBE Ramp-0004").expression = TRI + 'C2;';
    if (SIM && opts.photo) {
        var ftg = app.project.importFile(new ImportOptions(new File(opts.photo)));
        var pl = f02.layers.add(ftg);
        var sc = Math.max(FW / ftg.width, FH / ftg.height) * 100;
        tr(pl, "ADBE Scale").setValue([sc, sc]);
        tr(pl, "ADBE Position").setValue([FW / 2, FH / 2]);
    }

    var s02 = app.project.items.addComp("02", W, H, 1, DUR, FPS);
    s02.parentFolder = shotsFolder;
    var ctl02 = makeController(s02);
    // the subtitle layer exists first: several expressions below reference it
    var sub = s02.layers.add(t02);
    sub.name = "02-text";
    sub.collapseTransformation = true;

    var bg02 = makeSolid(s02, "BG", [1, 1, 1]);
    fillFx(bg02, pal(1));
    var warm02 = makeSolid(s02, "warm", [1, 1, 1]);
    var wr = fxAdd(warm02, "ADBE Ramp");
    wr.property("ADBE Ramp-0001").setValue([540, 900]);
    wr.property("ADBE Ramp-0003").setValue([540, 1920]);
    wr.property("ADBE Ramp-0006").setValue(14);
    wr.property("ADBE Ramp-0002").expression = TRI + 'C1;';
    wr.property("ADBE Ramp-0004").expression = TRI + FN + 'mix(C1, C3, 0.32);';
    tr(warm02, "ADBE Opacity").expression = TRI + '100*(0.35 + 0.65*FORM);';
    var grain02 = s02.layers.addSolid([1, 1, 1], "grain", W, H, 1, DUR);
    grain02.adjustmentLayer = true;
    var nz2 = fxAdd(grain02, "ADBE Noise");
    nz2.property(1).expression = TRI + '1.0 + 5*PRES;';
    try { nz2.property(2).setValue(0); } catch (eN2) {}

    // frame rig: build at identity, parent children, THEN add its expressions
    var rig = s02.layers.addNull(DUR);
    rig.name = "frame-rig";
    tr(rig, "ADBE Anchor Point").setValue([0, 0]);
    tr(rig, "ADBE Position").setValue([540, FCY]);

    var RAD = 'linear(FORM, 0, 1, 10, 84)';
    var matte = shapeLayer(s02, "frame-matte");
    var mg = grp(matte.property("ADBE Root Vectors Group"), "win");
    var mr = gv(mg).addProperty("ADBE Vector Shape - Rect");
    var mf = gv(mg).addProperty("ADBE Vector Graphic - Fill");
    mf.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]);
    matte.parent = rig;
    tr(matte, "ADBE Position").setValue([0, 0]);
    mr = gv(mg).property(1);
    mr.property("ADBE Vector Rect Size").expression = HDR + 'var p = IN(0, 0.85), q = OUT(0.5, 1); [' + FW + ', ' + FH + '*(0.84 + 0.16*p - 0.14*q)];';
    mr.property("ADBE Vector Rect Roundness").expression = TRI + RAD + ';';

    var fr = s02.layers.add(f02);
    fr.name = "02-frame";
    fr.parent = rig;
    tr(fr, "ADBE Position").setValue([0, 0]);
    // settle: counter-zoom in, then a slow FLOW push; duotone navy/cream mixed by FORM
    tr(fr, "ADBE Scale").expression = HDR +
        'var p = IN(0, 1);\n' +
        'var s = 100*(1.12 - 0.08*p) + 7*FLOW*(time/thisComp.duration) + 4*OUT(0.4, 1); [s, s];';
    var tint = fxAdd(fr, "ADBE Tint");
    tint.property("ADBE Tint-0001").expression = TRI + 'C2;';
    tint.property("ADBE Tint-0002").expression = TRI + 'C1;';
    tint.property("ADBE Tint-0003").expression = TRI + '12 + 58*Math.pow(FORM, 1.3);';
    var fgrain = fxAdd(fr, "ADBE Noise");
    fgrain.property(1).expression = TRI + '1.5 + 7*PRES;';
    try { fgrain.property(2).setValue(0); } catch (eN3) {}
    tr(fr, "ADBE Opacity").expression = HDR + '100*cl(IN(0, 0.6)*1.2)*(1 - OUT(0.55, 1));';
    fr.setTrackMatte(matte, TrackMatteType.ALPHA);

    var border = shapeLayer(s02, "frame-border");
    var bgp = grp(border.property("ADBE Root Vectors Group"), "edge");
    var br = gv(bgp).addProperty("ADBE Vector Shape - Rect");
    addStroke(bgp, 1.6, pal(2), 16);
    border.parent = rig;
    tr(border, "ADBE Position").setValue([0, 0]);
    br = gv(bgp).property(1);
    br.property("ADBE Vector Rect Size").expression = 'thisComp.layer("frame-matte").content("win").content(1).size + [14, 14];';
    br.property("ADBE Vector Rect Roundness").expression = TRI + RAD + ' + 7;';
    tr(border, "ADBE Opacity").expression = HDR + '100*FUR*IN(0.25, 0.9)*(1 - OUT(0.5, 0.95));';

    tr(rig, "ADBE Position").expression = HDR +
        'var tb = thisComp.layer("02-text").source.layer("textBlock");\n' +
        'var has = tb.sourceRectAtTime(thisComp.duration/2, false).width > 1;\n' +
        'var trv = linear(FLOW, 0, 1, 40, 150);\n' +
        'var p = IN(0, 0.8), q = OUT(0.45, 1);\n' +
        'value + [0, (has ? 0 : 150) + trv*(1 - p) + trv*0.7*q + Math.sin(time*0.6)*12*FLOW*FLOW];';
    tr(rig, "ADBE Rotate Z").expression = HDR +
        'var SN = thisComp.name.split("-"); var SEC = parseInt(SN[SN.length - 1], 10); if (isNaN(SEC)) SEC = 0;\n' +
        '(hsh(SEC*3 + 1)*2 - 1)*2.2*Math.pow(PRES, 1.5);';
    tr(rig, "ADBE Scale").expression = HDR + 'var s = 97 + 3*IN(0, 0.9); [s, s];';

    // peach dash above the subtitle (the one accent use in this shot)
    var dash = shapeLayer(s02, "accent-dash");
    var dg2 = grp(dash.property("ADBE Root Vectors Group"), "dash");
    addPath(dg2, [[-32, 0], [32, 0]]);
    var dtr = gv(dg2).addProperty("ADBE Vector Filter - Trim");
    dtr.property("ADBE Vector Trim Start").expression = HDR + '50 - 50*IN(0.35, 0.9);';
    dtr.property("ADBE Vector Trim End").expression = HDR + '50 + 50*IN(0.35, 0.9);';
    addStroke(dg2, 5, pal(3));
    tr(dash, "ADBE Position").setValue([540, DASHY]);
    tr(dash, "ADBE Opacity").expression = HDR +
        'var tb = thisComp.layer("02-text").source.layer("textBlock");\n' +
        '(tb.sourceRectAtTime(time, false).width > 1 ? 100*FUR + 100*(1 - FUR)*0.6 : 0)*(1 - OUT(0.55, 0.95));';

    // subtitle: hangs from SUBTOP; per phrase a soft rise + clear-in, quick dip between phrases
    var SUBX = HDR + PHR +
        'var S = thisLayer.source, PH = phr(S), t0 = PH[0], t1 = PH[1];\n' +
        'var pIn = (t0 < 0) ? 0 : qo((time - t0)/linear(FLOW, 0, 1, 0.6, 0.38));\n' +
        'var pOut = (t1 > 1e5) ? 0 : ci((time - (t1 - 0.2))/0.17);\n' +
        'var pO = Math.max(pOut, OUT(0.5, 0.92));\n';
    tr(sub, "ADBE Position").expression = SUBX +
        'var tb = S.layer("textBlock"); var R = tb.sourceRectAtTime(time, false);\n' +
        'var top = tb.toComp([R.left, R.top])[1];\n' +
        'var an = [S.width/2, S.height/2];\n' +
        '[540, ' + SUBTOP + ' + an[1] - top + linear(FLOW, 0, 1, 8, 26)*(1 - pIn) - 10*pO];';
    tr(sub, "ADBE Opacity").expression = SUBX + '100*cl(pIn*1.5)*(1 - pO);';
    var sblur = fxAdd(sub, "ADBE Gaussian Blur 2");
    sblur.property(1).expression = SUBX + '7*(1 - pIn) + 4*pO;';
    try { sblur.property(3).setValue(1); } catch (eB) {}

    // header: logo (navy) + phone, like the site's nav
    // persistent: framed sections often run back to back, so the header must not re-animate per cut
    var mark02 = makeMark(s02, "hcd-mark", X0, MY, MH, 2, null, null);
    tr(mark02, "ADBE Opacity").expression = HDR + '100*FUR;';
    var wm02 = makeWordmark(s02, X0 + 216 * MH / 325 + 30, MY + MH / 2, MH, [0, 0, 0], 2);
    tr(wm02, "ADBE Opacity").expression = HDR + '100*FUR;';
    var phone = makeText(s02, "(305) 558-9222", F_BODY, 26, ParagraphJustification.RIGHT_JUSTIFY, [0, 0, 0], 20);
    phone.name = "phone";
    fillFx(phone, pal(2));
    tr(phone, "ADBE Position").setValue([996, MY + MH / 2 + 9]);
    tr(phone, "ADBE Opacity").expression = HDR + '78*FUR;';

    sub.moveToBeginning();
    ctl02.moveToBeginning();
    log.push("shot 02 built");

    // ------------------------------------------------------------ sequence in mainComp
    var lay1 = mainComp.layers.add(s01); lay1.startTime = 0;
    var lay2 = mainComp.layers.add(s02); lay2.startTime = DUR;
    mc.moveToBeginning();
    log.push("sequenced");
    return log.join("\n");
}
