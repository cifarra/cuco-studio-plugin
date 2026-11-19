// SidecarSUN — "Rise" — CucoStudio style builder (AE, ES3)
// 1920x1080 @24. Motion verb RISE: type rises out of horizon masks and keeps rising out,
// plates rise, the sun rises; signature = the logo's split ring locking around a rising sun.
// Shots: 01 Sunrise (text, layout engine) · 02 Hero (text+media full-bleed)
//        03 Reel (text+media card on cream) · 04 Eclipse (media, sun iris)
// Usage: $.evalFile(this); SCS_BUILD({ sim: true|false, media: {f02:..., f03:..., f04:...} })

function SCS_BUILD(opts) {
    var SIM = !!opts.sim;
    var log = [];
    var W = 1920, H = 1080, FPS = 24, DUR = 10;

    var CREAM = [255 / 255, 249 / 255, 237 / 255, 1];
    var INK = [12 / 255, 10 / 255, 9 / 255, 1];
    var ORANGE = [234 / 255, 88 / 255, 12 / 255, 1];

    var F_D = "HelveticaNeue-Bold";
    var F_R = "SpaceGrotesk-Bold";

    // ------------------------------------------------------------ expression snippets
    var TRI =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n';
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function eo(p) { p = cl(p); return (p >= 1) ? 1 : 1 - Math.pow(2, -10*p); }\n' +
        'function ei(p) { p = cl(p); return (p <= 0) ? 0 : Math.pow(2, 10*(p - 1)); }\n' +
        'function eio(p) { p = cl(p); if (p <= 0) return 0; if (p >= 1) return 1; return (p < 0.5) ? Math.pow(2, 20*p - 10)/2 : (2 - Math.pow(2, -20*p + 10))/2; }\n' +
        'function sm(p) { p = cl(p); return p*p*(3 - 2*p); }\n' +
        'function win(v, a, b) { return cl((v - a)/(b - a)); }\n' +
        'function lp(a, b, t) { return a + (b - a)*t; }\n' +
        'function mix(a, b, t) { return [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t, 1]; }\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n' +
        'function SUNC(c) { var h = rgbToHsl(c); return hslToRgb([(h[0] + 0.062) % 1, Math.min(1, h[1]*1.1 + 0.05), Math.min(0.6, Math.max(0.47, h[2] + 0.03)), 1]); }\n';
    var CTL =
        'var CT = thisComp.layer("controller");\n' +
        'var ENs = CT.effect("enter")("Slider"), EXs = CT.effect("exit")("Slider");\n' +
        'var en = ENs.value/100, ex = EXs.value/100;\n' +
        'var TS = (ENs.numKeys > 0) ? ENs.key(1).time : 0;\n' +
        'var TE = (EXs.numKeys > 1) ? EXs.key(EXs.numKeys).time : thisComp.duration;\n' +
        'function IN(a, b) { return eo(win(en, a, b)); }\n' +
        'function OUT(a, b) { return ei(win(ex, a, b)); }\n' +
        'var FUR = 1 - sm(win(FORM, 0.6, 0.9));\n' +
        'var SN = thisComp.name.split("-"); var SEC = parseInt(SN[SN.length - 1], 10); if (isNaN(SEC)) SEC = 1;\n';
    var HDR = TRI + FN + CTL;
    function pal(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }
    var SUNEXPR = TRI + FN + 'SUNC(C3);';

    // ------------------------------------------------------------ layout specs
    // comp: f = plate state (0 none, 1 horizon, 2 full cream) · ink (1 cream type, 2 ink type)
    //       z = zones [x, y, w, h, alignX 0L 1C 2R, alignY 0T 1C 2B] · sun = [x, y, discR, ring]
    //       glow = [x, y, radius, k] · hz = hairline y (0 none)
    var SPEC01 = {
        comps: '[' +
            '{f: 0, ink: 1, z: [[140, 300, 1060, 500, 0, 2]], sun: [1490, 530, 90, 1], glow: [1490, 530, 1150, 0.55], hz: 838, rz: 970, rt: 1100},' +
            '{f: 1, ink: 2, z: [[140, 660, 1640, 320, 0, 1]], sun: [1530, 600, 150, 0], glow: [1530, 600, 1250, 0.7], hz: 0, rz: 900, rt: 1100},' +
            '{f: 2, ink: 2, z: [[220, 250, 1480, 580, 1, 1]], sun: [960, 1500, 120, 0], glow: [960, 540, 1300, 0.3], hz: 0, rz: 0, rt: 1100},' +
            '{f: 0, ink: 1, z: [[160, 345, 1600, 520, 1, 1]], sun: [960, 212, 34, 1], glow: [960, 640, 1150, 0.7], hz: 0, rz: 150, rt: 520}' +
            ']',
        seq: '[0, 1, 2, 3]', landing: true, fsmax: 230, maxl: 3
    };
    var SPEC02 = {
        comps: '[{f: 0, ink: 1, z: [[210, 560, 1500, 340, 1, 2]], sun: [0, 0, 0, 0], glow: [0, 0, 0, 0], hz: 0}]',
        seq: '[0]', landing: false, fsmax: 150, maxl: 2
    };
    var SPEC03 = {
        comps: '[{f: 0, ink: 2, z: [[120, 330, 590, 430, 0, 1]], sun: [0, 0, 0, 0], glow: [0, 0, 0, 0], hz: 0}]',
        seq: '[0]', landing: false, fsmax: 120, maxl: 4
    };

    // phrase/block engine — needs MK (marker prop), SEC, FORM, PRES, T00 (fallback start)
    function CORE(spec) {
        return 'var COMPS = ' + spec.comps + ', SEQ = ' + spec.seq + ';\n' +
            'var G = (FORM >= 0.5) ? 2 : 3;\n' +
            'var TBL = [1, 3, 0, 2, 0, 2, 1, 3, 2, 0, 3, 0];\n' +
            'function compSeq(n) { var b = TBL[(SEC + n) % 12] % SEQ.length; if (PRES > 0.5 && hsh(SEC*5 + n*11 + 1) < (PRES - 0.5)*2) b = Math.floor(hsh(SEC*13 + n*7 + 3)*SEQ.length) % SEQ.length; return SEQ[b]; }\n' +
            'var PS = [];\n' +
            '(function () { var n = MK.numKeys, prev = 1e9; for (var k = 1; k <= n; k++) { var c = MK.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) PS.push(MK.key(k).time); prev = v; } })();\n' +
            'if (PS.length == 0) PS.push(T00);\n' +
            'var CNT = PS.length, IDX = 0;\n' +
            'for (var q = 0; q < CNT; q++) { if (PS[q] <= time + 0.001) IDX = q + 1; }\n' +
            'var BK = [], BS = [], ORD = 0;\n' +
            'for (var q = 1; q <= CNT; q++) { if (' + (spec.landing ? 'true' : 'false') + ' && CNT >= 3 && q == CNT) { BK.push(COMPS.length - 1); BS.push(q); } else if ((q - 1) % G == 0) { BK.push(compSeq(ORD)); BS.push(q); ORD++; } }\n' +
            'var B = 0; for (var q = 0; q < BS.length; q++) { if (BS[q] <= Math.max(1, IDX)) B = q; }\n' +
            'var CK = COMPS[BK[B]], PK = (B > 0) ? COMPS[BK[B - 1]] : null;\n' +
            'var Z = CK.z[(IDX < 1) ? 0 : ((IDX - BS[B]) % CK.z.length)];\n' +
            'var EVENT = (IDX == BS[B]);\n' +
            'var t0 = (IDX < 1) ? -1 : PS[IDX - 1], t1 = (IDX < CNT) ? PS[IDX] : 1e6;\n' +
            'var BT0 = PS[BS[B] - 1];\n' +
            'var LAND = (IDX >= CNT);\n';
    }
    // shot-space engine (rig, lines, plate, sun, glow, furniture)
    function ENG(spec, srcExpr) {
        return HDR +
            'var SRC = ' + srcExpr + ';\n' +
            'var MK = SRC.marker, T00 = TS;\n' +
            CORE(spec) +
            'var FSMAX = ' + spec.fsmax + ';\n' +
            'var DL = (EVENT && PK != null && PK.f != CK.f) ? 0.24 : 0;\n' +
            'var DIN = linear(FLOW, 0, 1, 1.05, 0.62), OUTD = 0.36;\n' +
            'var PTD = linear(FLOW, 0, 1, 0.95, 0.62);\n' +
            'var BP = (IDX < 1) ? 0 : eo((time - BT0)/PTD);\n' +
            'function rectC() { var tb = SRC.layer("textBlock"); var r = tb.sourceRectAtTime(time, false);\n' +
            '  var a = tb.toComp([r.left, r.top]), b = tb.toComp([r.left + r.width, r.top + r.height]);\n' +
            '  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }\n' +
            'function PST(f) { if (f == 1) return 600; if (f == 2) return 0; return -1; }\n' +
            'function PLATE() {\n' +
            '  var a = PST((PK == null) ? 0 : PK.f), b = PST(CK.f);\n' +
            '  if (IDX < 1) b = -1;\n' +
            '  var u = (IDX < 1) ? 0 : cl((time - BT0)/PTD);\n' +
            '  if (a < 0 && b < 0) return [2000, 2000];\n' +
            '  if (a < 0) return [lp(1092, b, eo(u)), 1092];\n' +
            '  if (b < 0) return [lp(a, -12, eo(u)), lp(1092, -12, eo(u))];\n' +
            '  if (b <= a) return [lp(a, b, eo(u)), 1092];\n' +
            '  if (u < 0.5) return [lp(a, -12, eo(u*2)), lp(1092, -12, eo(u*2))];\n' +
            '  return [lp(1092, b, eo((u - 0.5)*2)), 1092]; }\n' +
            'function onPlate(y) { var pb = PLATE(); return (y >= pb[0] && y <= pb[1]); }\n';
    }
    var ZONEFIT =
        'var R = rectC(); var bw = Math.max(1, R[2] - R[0]), bh = Math.max(1, R[3] - R[1]);\n' +
        'var FS = SRC.layer("textBlock").text.sourceText.style.fontSize;\n' +
        'var s = Math.min(Z[2]/bw, Z[3]/bh, FSMAX/Math.max(1, FS));\n' +
        'var cx = Z[0] + Z[2]/2; if (Z[4] == 0) cx = Z[0] + bw*s/2; if (Z[4] == 2) cx = Z[0] + Z[2] - bw*s/2;\n' +
        'var cy = Z[1] + Z[3]/2; if (Z[5] == 0) cy = Z[1] + bh*s/2; if (Z[5] == 2) cy = Z[1] + Z[3] - bh*s/2;\n';
    var LINES =
        'var TB = SRC.layer("textBlock"); var TXT = String(TB.text.sourceText.value);\n' +
        'var NL = (TXT.replace(/\\s/g, "").length == 0) ? 0 : TXT.split("\\r").length;\n' +
        'var FS2 = TB.text.sourceText.style.fontSize, LEAD = FS2*0.92, BL0 = TB.toComp([0, 0])[1];\n' +
        'function wTop(k) { return (k == 0) ? BL0 - 1.08*FS2 : BL0 + (k - 1)*LEAD + 0.13*FS2; }\n' +
        'function wBot(k) { return BL0 + k*LEAD + 0.13*FS2; }\n' +
        'var TRV = LEAD*1.04;\n' +
        'function dlay(k) { return Math.max(0, k + PRES*(hsh(SEC*7 + k*3 + 1)*2 - 1)*1.2)*0.085; }\n' +
        'function prog(k) {\n' +
        '  var pIn = (t0 < 0) ? 0 : eo((time - t0 - DL - dlay(k))/DIN);\n' +
        '  var pOut = (t1 > 1e5 || t0 < 0) ? 0 : ei((time - (t1 - OUTD - 0.14 + k*0.035))/OUTD);\n' +
        '  var pEx = ei(win(ex, 0.5 + k*0.05, 0.86 + k*0.05));\n' +
        '  return [pIn, Math.max(pOut, pEx)]; }\n' +
        'function dyOf(k) { var p = prog(k); return TRV*(1 - p[0]) - TRV*1.05*p[1]; }\n';

    // text-comp Source Text: reflow for the zone, case, colour, landing accent
    function zoneTextExpr(spec) {
        return TRI + FN +
            'var MK = thisComp.marker, T00 = 0;\n' +
            'var SN = thisComp.name.split("-"); var SEC = parseInt(SN[Math.max(0, SN.length - 2)], 10); if (isNaN(SEC)) SEC = 1;\n' +
            CORE(spec) +
            'var zw = Z[2], zh = Z[3], MAXL = ' + spec.maxl + ';\n' +
            'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/\\s+/g, " ").replace(/^\\s+|\\s+$/g, "").toUpperCase();\n' +
            'var res = s;\n' +
            'if (s.length > 0) {\n' +
            '  var w = s.split(" "), u = [];\n' +
            '  for (var i = 0; i < w.length; i++) {\n' +
            '    if (w[i].length <= 2 && i < w.length - 1) { w[i + 1] = w[i] + " " + w[i + 1]; }\n' +
            '    else { u.push(w[i]); }\n' +
            '  }\n' +
            '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
            '  function best(nl) {\n' +
            '    if (nl == 1) return [u.join(" ")];\n' +
            '    var bestV = 1e9, bestC = null;\n' +
            '    function rec(start, left, acc) {\n' +
            '      if (left == 1) { var mx = 0; for (var j = 0; j < acc.length; j++) mx = Math.max(mx, acc[j]); mx = Math.max(mx, L(start, u.length));\n' +
            '        if (mx < bestV) { bestV = mx; bestC = cuts.slice(0); } return; }\n' +
            '      for (var c = start + 1; c <= u.length - left + 1 - 0; c++) { if (c >= u.length) break; cuts.push(c); acc.push(L(start, c)); rec(c, left - 1, acc); acc.pop(); cuts.pop(); }\n' +
            '    }\n' +
            '    var cuts = []; rec(0, nl, []);\n' +
            '    if (bestC == null) return [u.join(" ")];\n' +
            '    var out = [], st = 0; for (var j = 0; j < bestC.length; j++) { out.push(u.slice(st, bestC[j]).join(" ")); st = bestC[j]; } out.push(u.slice(st).join(" "));\n' +
            '    return out;\n' +
            '  }\n' +
            '  var pick = null, bs = -1;\n' +
            '  for (var nl = 1; nl <= Math.min(MAXL, u.length); nl++) {\n' +
            '    var ls = best(nl), mc = 0; for (var j = 0; j < ls.length; j++) mc = Math.max(mc, ls[j].length);\n' +
            '    var sc = Math.min(zw/(mc*0.66), zh/(ls.length*0.92 + 0.1), ' + spec.fsmax + ');\n' +
            '    if (sc > bs*1.06) { bs = sc; pick = ls; }\n' +
            '  }\n' +
            '  res = pick.join("\\r");\n' +
            '}\n' +
            'var fs = style.fontSize;\n' +
            'var INKC = (CK.ink == 1) ? C1 : C2;\n' +
            'var J = "alignCenter"; if (Z[4] == 0) J = "alignLeft"; if (Z[4] == 2) J = "alignRight";\n' +
            'var st = style.setText(res).setFont("' + F_D + '").setAllCaps(false).setAutoLeading(false).setLeading(fs*0.92).setTracking(-10).setJustification(J).setFillColor([INKC[0], INKC[1], INKC[2]]);\n' +
            'if (LAND && res.length > 0) {\n' +
            '  var li = res.lastIndexOf("\\r") + 1;\n' +
            '  if (li == 0) { li = res.lastIndexOf(" ") + 1; }\n' +
            '  var n = res.length - li;\n' +
            '  if (n > 0) st = st.setFillColor([C3[0], C3[1], C3[2]], li, n);\n' +
            '}\n' +
            'st;';
    }

    // ------------------------------------------------------------ helpers
    function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }
    function fxAdd(layer, mn) { return layer.property("ADBE Effect Parade").addProperty(mn); }
    function fxProp(fx, nm) {
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
        d.applyFill = true; d.fillColor = [rgb[0], rgb[1], rgb[2]]; d.applyStroke = false;
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
        en.setValueAtTime(0, 0); en.setValueAtTime(DUR * 0.25, 100);
        var ex = addSlider(c, "exit", 0).property("ADBE Slider Control-0001");
        ex.setValueAtTime(DUR * 0.75, 0); ex.setValueAtTime(DUR, 100);
        return c;
    }
    function makeSolid(comp, name) { var s = comp.layers.addSolid([1, 1, 1], name, W, H, 1, DUR); return s; }
    function shapeLayer(comp, name) {
        var s = comp.layers.addShape(); s.name = name;
        tr(s, "ADBE Anchor Point").setValue([0, 0]);
        tr(s, "ADBE Position").setValue([0, 0]);
        return s;
    }
    function grp(parentContents, name) { var g = parentContents.addProperty("ADBE Vector Group"); g.name = name; return g; }
    function gv(g) { return g.property("ADBE Vectors Group"); }
    function gt(g) { return g.property("ADBE Vector Transform Group"); }
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
        if (opacity !== undefined) s.property("ADBE Vector Stroke Opacity").setValue(opacity);
        return s;
    }
    function addFillV(g, colorExpr) {
        var f = gv(g).addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").expression = colorExpr;
        return f;
    }
    function pathGroup(layer, name, colorExpr, strokeW) {
        // a group with one path (set by expression later) + fill or stroke
        var root = layer.property("ADBE Root Vectors Group");
        var g = grp(root, name);
        addPath(g, [[0, 0], [1, 0], [1, 1]], null, null, true);
        if (strokeW) { addStroke(g, strokeW, colorExpr); } else { addFillV(g, colorExpr); }
        return name;
    }
    function gpath(layer, name) {
        return layer.property("ADBE Root Vectors Group").property(name).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape");
    }
    function grain(comp) {
        var g = comp.layers.addSolid([1, 1, 1], "grain", W, H, 1, DUR);
        g.adjustmentLayer = true;
        var nz = fxAdd(g, "ADBE Noise");
        nz.property(1).expression = TRI + '0.8 + 5.5*PRES;';
        try { nz.property(2).setValue(0); } catch (eN) {}
        return g;
    }
    function rampFx(layer, radial) {
        var rp = fxAdd(layer, "ADBE Ramp");
        rp.property("ADBE Ramp-0005").setValue(radial ? 2 : 1);
        rp.property("ADBE Ramp-0006").setValue(24);
        return rp;
    }
    function tritone(layer) {
        var t = fxAdd(layer, "ADBE Tritone");
        fxProp(t, "Highlights").expression = TRI + 'C1;';
        fxProp(t, "Midtones").expression = TRI + FN + 'mix(mix(C2, C3, 0.75), C1, 0.28);';
        fxProp(t, "Shadows").expression = TRI + FN + 'mix(C2, C3, 0.06);';
        fxProp(t, "Blend With Original").expression = TRI + 'linear(FORM, 0, 1, 90, 52);';
        return t;
    }
    function halfRing(root, name, side) {
        var Ro = 250, Ri = 161, k = 0.5523, s = side, gp = 3 * s;
        var g = grp(root, name);
        addPath(g,
            [[gp, -Ro], [s * Ro + gp, 0], [gp, Ro], [gp, Ri], [s * Ri + gp, 0], [gp, -Ri]],
            [[0, 0], [0, -k * Ro], [s * k * Ro, 0], [0, 0], [0, k * Ri], [s * k * Ri, 0]],
            [[s * k * Ro, 0], [0, k * Ro], [0, 0], [s * k * Ri, 0], [0, -k * Ri], [0, 0]], true);
        addFillV(g, pal(3));
        return g;
    }
    // the SidecarSUN mark: split ring (left raised, right lowered) around a sun disc; disc r = 100 units
    function makeLockup(comp, name) {
        var L = shapeLayer(comp, name);
        var root = L.property("ADBE Root Vectors Group");
        halfRing(root, "ringL", -1);
        halfRing(root, "ringR", 1);
        var gD = grp(root, "disc");
        var el = gv(gD).addProperty("ADBE Vector Shape - Ellipse");
        el.property("ADBE Vector Ellipse Size").setValue([200, 200]);
        addFillV(gD, SUNEXPR);
        root = L.property("ADBE Root Vectors Group");
        gt(root.property("ringL")).property("ADBE Vector Position").setValue([0, -50]);
        gt(root.property("ringR")).property("ADBE Vector Position").setValue([0, 50]);
        return L;
    }
    function lkp(L, g, prop) { return gt(L.property("ADBE Root Vectors Group").property(g)).property(prop); }
    function markers(comp, phrases) {
        for (var i = 0; i < phrases.length; i++) {
            var t0 = phrases[i][0], dw = phrases[i][1], n = phrases[i][2];
            comp.markerProperty.setValueAtTime(t0, new MarkerValue("0"));
            for (var k = 1; k <= n; k++) {
                comp.markerProperty.setValueAtTime(t0 + 1 / FPS + (k - 1) * dw, new MarkerValue(String(Math.round(k / n * 100))));
            }
            if (i < phrases.length - 1) comp.markerProperty.setValueAtTime(phrases[i + 1][0] - 1 / FPS, new MarkerValue("100"));
        }
    }
    function simTexts(tb, phrases, texts) {
        var p = textDoc(tb);
        for (var i = 0; i < texts.length; i++) {
            var d = p.value; d.text = texts[i];
            p.setValueAtTime(Math.max(0, phrases[i][0] + 1 / FPS), d);
        }
    }
    function textComp(name, w, h, sample, size, expr, folder) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS);
        c.parentFolder = folder;
        var tb = makeText(c, sample, F_D, size, ParagraphJustification.CENTER_JUSTIFY, CREAM, -10, Math.round(size * 0.92));
        tb.name = "textBlock";
        if (expr) textDoc(tb).expression = expr;
        if (sample !== "") {
            var r = tb.sourceRectAtTime(0, false);
            tr(tb, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        }
        tr(tb, "ADBE Position").setValue([w / 2, h / 2]);
        return c;
    }
    function frameComp(name, w, h, folder, simFile) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS);
        c.parentFolder = folder;
        var ph = c.layers.addSolid([1, 1, 1], "placeholder", w, h, 1, DUR);
        var rp = rampFx(ph, true);
        rp.property("ADBE Ramp-0001").setValue([w * 0.72, h * 0.3]);
        rp.property("ADBE Ramp-0003").setValue([w * 0.05, h * 1.1]);
        rp.property("ADBE Ramp-0002").expression = TRI + FN + 'SUNC(C3);';
        rp.property("ADBE Ramp-0004").expression = TRI + FN + 'mix(C2, C3, 0.35);';
        if (SIM && simFile) {
            var ftg = app.project.importFile(new ImportOptions(new File(simFile)));
            var pl = c.layers.add(ftg);
            var sc = Math.max(w / ftg.width, h / ftg.height) * 100;
            tr(pl, "ADBE Scale").setValue([sc, sc]);
            tr(pl, "ADBE Position").setValue([w / 2, h / 2]);
            try { pl.outPoint = DUR; } catch (eo) {}
        }
        return c;
    }
    // section transition: an ink band with an orange horizon edge; it rises out on enter and
    // rises in from below on exit, so consecutive cuts read as one upward pass
    function curtain(comp) {
        var L = shapeLayer(comp, "curtain");
        pathGroup(L, "edge", pal(3), 5);
        pathGroup(L, "band", pal(2));
        var band = HDR +
            'var pe = eo(win(en, 0.0, 0.42)), pq = ei(win(ex, 0.58, 1.0));\n' +
            'var top = -10 - 1100*pe; if (pq > 0) top = 1090 - 1100*pq;\n' +
            'if (pe >= 1 && pq <= 0) top = 3000;\n';
        gpath(L, "band").expression = band + 'createPath([[-20, top], [1940, top], [1940, top + 1100], [-20, top + 1100]], [], [], true);';
        gpath(L, "edge").expression = band + 'createPath([[-20, top], [1940, top], [1940, top + 1100], [-20, top + 1100]], [], [], true);';
        return L;
    }
    function furniture(comp, colorExprFor) {
        // persistent furniture: static from frame 1, gated by FORM only
        var mk = makeLockup(comp, "mini-mark");
        tr(mk, "ADBE Position").setValue([150, 66]);
        tr(mk, "ADBE Scale").setValue([11, 11]);
        tr(mk, "ADBE Opacity").expression = HDR + '100*FUR;';
        var wm = makeText(comp, "SIDECAR SUN", F_R, 22, ParagraphJustification.LEFT_JUSTIFY, CREAM, 200);
        wm.name = "wordmark";
        tr(wm, "ADBE Position").setValue([196, 74]);
        fillFx(wm, colorExprFor(74));
        tr(wm, "ADBE Opacity").expression = HDR + '100*FUR;';
        var ct = makeText(comp, "MIAMI \u00B7 LATAM \u00B7 LONDON", F_R, 20, ParagraphJustification.RIGHT_JUSTIFY, CREAM, 200);
        ct.name = "cities";
        tr(ct, "ADBE Position").setValue([1800, 73]);
        fillFx(ct, colorExprFor(73));
        tr(ct, "ADBE Opacity").expression = HDR + '62*FUR;';
        var nm = makeText(comp, "01", F_R, 22, ParagraphJustification.RIGHT_JUSTIFY, CREAM, 200);
        nm.name = "numeral";
        textDoc(nm).expression = 'var SN = thisComp.name.split("-"); var s = (SN.length > 1) ? parseInt(SN[SN.length - 1], 10) + 1 : 1; if (isNaN(s)) s = 1; ((s < 10) ? "0" : "") + s + "  \u2014  SIDECARSUN.COM";';
        tr(nm, "ADBE Position").setValue([1800, 1014]);
        fillFx(nm, colorExprFor(1014));
        tr(nm, "ADBE Opacity").expression = HDR + '62*FUR;';
        return [mk, wm, ct, nm];
    }
    // the rising-type engine: a rig null (zone fit) carrying N masked line copies of the text precomp
    function textEngine(shot, tcomp, spec, nLines) {
        var lib = ENG(spec, 'thisLayer.source');
        var rig = shot.layers.addNull(DUR);
        rig.name = tcomp.name.replace("-text", "") + " text rig";
        rig.enabled = false;
        tr(rig, "ADBE Anchor Point").setValue([0, 0]);
        tr(rig, "ADBE Position").setValue([0, 0]);
        var lines = [];
        for (var i = 0; i < nLines; i++) {
            var Ly = shot.layers.add(tcomp);
            Ly.name = tcomp.name;
            Ly.collapseTransformation = true;
            Ly.motionBlur = false;
            Ly.parent = rig;
            tr(Ly, "ADBE Position").setValue([tcomp.width / 2, tcomp.height / 2]);
            // one mask = (line i band in text space) ∩ (its window fixed in rig space), intersected here:
            // an Add+Intersect mask pair rendered unclipped whenever the window was fully below the line
            var m1 = Ly.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            m1.property("ADBE Mask Offset").setValue(1);
            m1.property("ADBE Mask Shape").expression = lib + LINES +
                'var i = ' + i + ';\n' +
                'var y0 = 0, y1 = 0; if (i < NL) { var dy = dyOf(i); y0 = Math.max(wTop(i), wTop(i) - dy); y1 = Math.min(wBot(i), wBot(i) - dy); }\n' +
                '(y1 - y0 < 0.5) ? createPath([[-9000, -9000], [-8999, -9000], [-8999, -8999]], [], [], true) : createPath([[-8000, y0], [9000, y0], [9000, y1], [-8000, y1]], [], [], true);';
            tr(Ly, "ADBE Position").expression = lib + LINES +
                'var i = ' + i + ';\n' +
                'var R = rectC(); var rcx = (R[0] + R[2])/2, rcy = (R[1] + R[3])/2;\n' +
                'var jx = Math.pow(Math.max(0, PRES - 0.5)*2, 2)*(hsh(SEC*5 + i*11 + 2) - 0.5)*90;\n' +
                '[SRC.width/2 - rcx + jx, SRC.height/2 - rcy + dyOf(i)];';
            lines.push(Ly);
        }
        var rlib = ENG(spec, 'thisComp.layer("' + tcomp.name + '").source');
        tr(rig, "ADBE Position").expression = rlib + ZONEFIT +
            '[cx, cy + Math.sin(time*0.6 + SEC)*5*FLOW*FLOW];';
        tr(rig, "ADBE Scale").expression = rlib + ZONEFIT +
            'var k = s*100*(1 + 0.022*FLOW*cl((time - Math.max(0, t0))/3)); [k, k];';
        return { rig: rig, lines: lines, lib: rlib };
    }

    // ============================================================ BUILD
    app.purge(PurgeTarget.ALL_CACHES);
    while (app.project.numItems > 0) { app.project.item(1).remove(); }

    var mainComp = app.project.items.addComp("mainComp", W, H, 1, DUR * 4, FPS);
    var shotsFolder = app.project.items.addFolder("ORIGINAL_SHOTS");
    var preFolder = app.project.items.addFolder("PRECOMPS");
    var mc = mainComp.layers.addNull(DUR * 4);
    mc.name = "mainControl";
    addSlider(mc, "FORM", 40);
    addSlider(mc, "FLOW", 55);
    addSlider(mc, "PRESSURE", 25);
    addColorCtl(mc, "1", CREAM);
    addColorCtl(mc, "2", INK);
    addColorCtl(mc, "3", ORANGE);
    log.push("mainComp + mainControl");

    var M = opts.media || {};

    // ============================================================ SHOT 01 — SUNRISE (text only, layout engine)
    var t01 = textComp("01-text", 1600, 560, "ONE WEEK. SIX MONTHS OF CINEMATIC ASSETS.", 130, zoneTextExpr(SPEC01), preFolder);
    var PH01 = [[0.25, 0.22, 2], [1.85, 0.22, 3], [3.45, 0.22, 4], [5.05, 0.22, 4], [6.55, 0.22, 3]];
    if (SIM) {
        markers(t01, PH01);
        simTexts(t01.layer("textBlock"), PH01, ["One week.", "On-site or online.", "Six months of assets.", "Built to win clients.", "Brand that resonates."]);
    }
    var s01 = app.project.items.addComp("01", W, H, 1, DUR, FPS);
    s01.parentFolder = shotsFolder;
    s01.motionBlur = false;
    var ctl01 = makeController(s01);
    var bg01 = makeSolid(s01, "BG"); fillFx(bg01, pal(2));
    var glow01 = makeSolid(s01, "glow"); var gr01 = rampFx(glow01, true);
    var sun01 = makeLockup(s01, "sun"); sun01.motionBlur = false;
    var plate01 = shapeLayer(s01, "plate"); pathGroup(plate01, "band", pal(1));
    var warm01 = makeSolid(s01, "daylight"); var wr01 = rampFx(warm01, true);
    warm01.blendingMode = BlendingMode.MULTIPLY;
    var edge01 = shapeLayer(s01, "horizon-edge"); pathGroup(edge01, "line", pal(3), 3);
    var hair01 = shapeLayer(s01, "hairline");
    var hg = grp(hair01.property("ADBE Root Vectors Group"), "line");
    addPath(hg, [[0, 0], [1, 0]], null, null, false);
    gv(hg).addProperty("ADBE Vector Filter - Trim");
    hg = hair01.property("ADBE Root Vectors Group").property("line");
    addStroke(hg, 1.5, pal(1));
    var FCOL01 = function (y) { return ENG(SPEC01, 'thisComp.layer("01-text").source') + 'onPlate(' + y + ') ? C2 : C1;'; };
    var eng01 = textEngine(s01, t01, SPEC01, 3);
    var fur01 = furniture(s01, FCOL01);
    var cur01 = curtain(s01);
    var gn01 = grain(s01);
    // expressions (all referenced layers exist now)
    var E01 = ENG(SPEC01, 'thisComp.layer("01-text").source');
    var GLOWST = 'var G1 = CK.glow, G0 = (PK == null) ? [G1[0], G1[1], G1[2], 0] : PK.glow; if (IDX < 1) G1 = [G1[0], G1[1], G1[2], 0];\n' +
        'var gx = lp(G0[0], G1[0], BP) + Math.sin(time*0.37)*40*FLOW, gy = lp(G0[1], G1[1], BP) + Math.cos(time*0.29)*30*FLOW;\n' +
        'var gr = lp(G0[2], G1[2], BP)*(0.85 + 0.4*FORM), gk = lp(G0[3], G1[3], BP);\n';
    gr01.property("ADBE Ramp-0001").expression = E01 + GLOWST + '[gx, gy];';
    gr01.property("ADBE Ramp-0003").expression = E01 + GLOWST + '[gx + gr, gy];';
    gr01.property("ADBE Ramp-0002").expression = E01 + GLOWST + 'mix(C2, C3, gk*0.5);';
    gr01.property("ADBE Ramp-0004").expression = TRI + 'C2;';
    var SUNST = 'var S1 = CK.sun, S0 = (PK == null) ? [S1[0], S1[1] + CK.rz, S1[2], 0] : PK.sun; if (IDX < 1) S1 = [S1[0], S1[1] + CK.rz, S1[2], S1[3]];\n';
    tr(sun01, "ADBE Position").expression = E01 + SUNST +
        '[lp(S0[0], S1[0], BP), lp(S0[1], S1[1], BP) + Math.sin(time*0.8)*7*FLOW];';
    tr(sun01, "ADBE Scale").expression = E01 + SUNST + 'var r = lp(S0[2], S1[2], BP)*(0.92 + 0.16*FORM); [r, r];';
    tr(sun01, "ADBE Opacity").expression = E01 + '(IDX < 1) ? ((CK.rz < 300) ? 0 : 100) : ((PK == null && CK.rz < 300) ? 100*cl(BP*2.2) : 100);';
    var RINGX = function (dly, base) {
        return E01 + SUNST +
            'var R1 = S1[3], R0 = S0[3]; if (IDX < 1) R1 = 0;\n' +
            'var pin = (IDX < 1) ? 0 : eo((time - BT0 - ' + dly + ')/(PTD*1.15));\n' +
            'var pout = (IDX < 1) ? 0 : ei((time - BT0 - ' + dly + '*0.5)/(PTD*0.75));\n' +
            'var off = 2400, op = 0;\n' +
            'if (R1 == 1 && R0 == 0) { off = CK.rt*(1 - pin); op = cl(pin*3); }\n' +
            'else if (R1 == 0 && R0 == 1) { off = -1100*pout; op = 1 - pout; }\n' +
            'else if (R1 == 1) { off = 0; op = 1; }\n';
    };
    var RK = 'var cur = lp(S0[2], S1[2], BP); var kk = 1;\n' +
        'if (R1 == 0 && R0 == 1) kk = S0[2]/Math.max(1, cur); else if (R1 == 1 && R0 == 0) kk = S1[2]/Math.max(1, cur);\n';
    lkp(sun01, "ringL", "ADBE Vector Position").expression = RINGX(0.04) + RK + '[0, -50*kk + off];';
    lkp(sun01, "ringR", "ADBE Vector Position").expression = RINGX(0.16) + RK + '[0, 50*kk + off];';
    lkp(sun01, "ringL", "ADBE Vector Scale").expression = RINGX(0.04) + RK + '[100*kk, 100*kk];';
    lkp(sun01, "ringR", "ADBE Vector Scale").expression = RINGX(0.16) + RK + '[100*kk, 100*kk];';
    lkp(sun01, "ringL", "ADBE Vector Group Opacity").expression = RINGX(0.04) + '100*op;';
    lkp(sun01, "ringR", "ADBE Vector Group Opacity").expression = RINGX(0.16) + '100*op;';
    gpath(plate01, "band").expression = E01 + 'var pb = PLATE(); createPath([[-20, pb[0]], [1940, pb[0]], [1940, pb[1]], [-20, pb[1]]], [], [], true);';
    wr01.property("ADBE Ramp-0001").setValue([960, 470]);
    wr01.property("ADBE Ramp-0003").setValue([960 + 1250, 470]);
    wr01.property("ADBE Ramp-0002").setValue([1, 1, 1, 1]);
    wr01.property("ADBE Ramp-0004").expression = TRI + FN + 'mix(C1, C3, 0.32);';
    tr(warm01, "ADBE Opacity").expression = TRI + '45 + 50*FORM;';
    gpath(edge01, "line").expression = E01 + 'var pb = PLATE(); createPath([[-20, pb[0]], [1940, pb[0]]], [], [], false);';
    tr(edge01, "ADBE Opacity").expression = E01 + 'var pb = PLATE(); (pb[0] > 3 && pb[0] < 1077 && pb[1] - pb[0] > 3) ? 100 : 0;';
    gpath(hair01, "line").expression = E01 + 'var y = (CK.hz > 0) ? CK.hz : 2000; createPath([[140, y], [1780, y]], [], [], false);';
    hair01.property("ADBE Root Vectors Group").property("line").property("ADBE Vectors Group").property("ADBE Vector Filter - Trim").property("ADBE Vector Trim End").expression = E01 + '(IDX < 1) ? 0 : 100*eo((time - BT0 - 0.1)/(PTD*1.3));';
    tr(hair01, "ADBE Opacity").expression = E01 + '(CK.hz > 0) ? 34*FUR*(1 - OUT(0.4, 0.9)) : 0;';
    // stacking (top → bottom): grain, curtain, furniture, lines, rig, hairline, edge, daylight, plate, sun, glow, BG
    ctl01.moveToBeginning();
    log.push("shot 01 built");

    // ============================================================ SHOT 02 — HERO (full-bleed media + centred caps)
    var f02 = frameComp("02-frame", W, H, preFolder, M.f02);
    var t02 = textComp("02-text", 1500, 300, "FILMS THAT MAKE YOUR BRAND THE AUTHORITY.", 110, zoneTextExpr(SPEC02), preFolder);
    var PH02 = [[0.3, 0.3, 2], [3.4, 0.28, 4]];
    if (SIM) {
        markers(t02, PH02);
        simTexts(t02.layer("textBlock"), PH02, ["Authority films", "that win the room."]);
    }
    var s02 = app.project.items.addComp("02", W, H, 1, DUR, FPS);
    s02.parentFolder = shotsFolder;
    s02.motionBlur = false;
    var ctl02 = makeController(s02);
    var bg02 = makeSolid(s02, "BG"); fillFx(bg02, pal(2));
    var fr02 = s02.layers.add(f02); fr02.name = "02-frame";
    tritone(fr02);
    tr(fr02, "ADBE Scale").expression = HDR +
        'var p = IN(0, 1); var k = cl((time - TS)/Math.max(0.5, TE - TS));\n' +
        'var s = 100*(1.09 - 0.07*p) + 5*FLOW*k; [s, s];';
    tr(fr02, "ADBE Position").expression = HDR + 'value + [0, 70*FLOW*(1 - IN(0, 1))];';
    var ov02 = makeSolid(s02, "hero-overlay"); fillFx(ov02, TRI + FN + 'mix(C2, C3, 0.14);');
    tr(ov02, "ADBE Opacity").expression = TRI + '6 + 16*FORM;';
    var sc02 = s02.layers.addSolid([1, 1, 1], "scrim", W + 400, H + 1200, 1, DUR); fillFx(sc02, pal(2));
    tr(sc02, "ADBE Position").setValue([W / 2, H / 2]);
    var smk = sc02.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var sms = new Shape(); var ox = 200, oy = 600;
    sms.vertices = [[0, oy + 600], [W + 400, oy + 600], [W + 400, H + 1200], [0, H + 1200]]; sms.closed = true;
    smk.property("ADBE Mask Shape").setValue(sms);
    smk.property("ADBE Mask Feather").setValue([0, 520]);
    tr(sc02, "ADBE Opacity").expression = HDR +
        'var tb = thisComp.layer("02-text").source.layer("textBlock");\n' +
        '(tb.sourceRectAtTime(time, false).width > 1) ? 88 : 45;';
    var bars02 = shapeLayer(s02, "scope-bars"); pathGroup(bars02, "top", pal(2)); pathGroup(bars02, "bot", pal(2));
    var eng02 = textEngine(s02, t02, SPEC02, 2);
    var fur02 = furniture(s02, function (y) { return TRI + 'C1;'; });
    var cur02 = curtain(s02);
    var gn02 = grain(s02);
    gpath(bars02, "top").expression = HDR + 'var h = 138*FUR; createPath([[-20, -20], [1940, -20], [1940, h], [-20, h]], [], [], true);';
    gpath(bars02, "bot").expression = HDR + 'var h = 138*FUR; createPath([[-20, 1080 - h], [1940, 1080 - h], [1940, 1100], [-20, 1100]], [], [], true);';
    ctl02.moveToBeginning();
    log.push("shot 02 built");

    // ============================================================ SHOT 03 — REEL (cream, media card + caps column)
    var FW3 = 1040, FH3 = 585;
    var f03 = frameComp("03-frame", FW3, FH3, preFolder, M.f03);
    var t03 = textComp("03-text", 620, 470, "TRACTION ADS THAT TURN ATTENTION INTO CLIENTS.", 80, zoneTextExpr(SPEC03), preFolder);
    var PH03 = [[0.3, 0.3, 2], [3.4, 0.25, 5]];
    if (SIM) {
        markers(t03, PH03);
        simTexts(t03.layer("textBlock"), PH03, ["Traction ads", "that turn attention into clients."]);
    }
    var s03 = app.project.items.addComp("03", W, H, 1, DUR, FPS);
    s03.parentFolder = shotsFolder;
    s03.motionBlur = false;
    var ctl03 = makeController(s03);
    var bg03 = makeSolid(s03, "BG"); fillFx(bg03, pal(1));
    var warm03 = makeSolid(s03, "daylight"); var wr03 = rampFx(warm03, true);
    warm03.blendingMode = BlendingMode.MULTIPLY;
    wr03.property("ADBE Ramp-0001").setValue([1290, 520]);
    wr03.property("ADBE Ramp-0003").setValue([1290 + 1300, 520]);
    wr03.property("ADBE Ramp-0002").setValue([1, 1, 1, 1]);
    wr03.property("ADBE Ramp-0004").expression = TRI + FN + 'mix(C1, C3, 0.3);';
    tr(warm03, "ADBE Opacity").expression = TRI + '45 + 50*FORM;';
    // the card rig: build at identity, parent children, THEN add expressions
    var rig03 = s03.layers.addNull(DUR);
    rig03.name = "card-rig"; rig03.enabled = false;
    tr(rig03, "ADBE Anchor Point").setValue([0, 0]);
    tr(rig03, "ADBE Position").setValue([0, 0]);
    var shadow03 = shapeLayer(s03, "card-shadow"); pathGroup(shadow03, "box", pal(2));
    var sb = fxAdd(shadow03, "ADBE Gaussian Blur 2"); sb.property(1).setValue(60); try { sb.property(3).setValue(0); } catch (eB) {}
    var matte03 = shapeLayer(s03, "card-matte"); pathGroup(matte03, "box", '[1, 1, 1, 1]');
    var fr03 = s03.layers.add(f03); fr03.name = "03-frame"; fr03.motionBlur = false;
    var border03 = shapeLayer(s03, "card-border"); pathGroup(border03, "box", pal(3), 2);
    shadow03.parent = rig03; matte03.parent = rig03; fr03.parent = rig03; border03.parent = rig03;
    tr(fr03, "ADBE Position").setValue([0, 0]);
    tritone(fr03);
    fr03.moveAfter(matte03);
    fr03.setTrackMatte(matte03, TrackMatteType.ALPHA);
    var eng03 = textEngine(s03, t03, SPEC03, 4);
    var rub03 = makeText(s03, "SIDECAR SUN", F_R, 22, ParagraphJustification.LEFT_JUSTIFY, ORANGE, 200);
    rub03.name = "rubric";
    textDoc(rub03).expression = 'var SN = thisComp.name.split("-"); var s = (SN.length > 1) ? parseInt(SN[SN.length - 1], 10) + 1 : 1; if (isNaN(s)) s = 1; "SHOWREEL  \u00B7  " + ((s < 10) ? "0" : "") + s;';
    fillFx(rub03, pal(3));
    var fur03 = furniture(s03, function (y) { return TRI + 'C2;'; });
    var cur03 = curtain(s03);
    var gn03 = grain(s03);
    var HAS03 = 'var HAS = (thisComp.layer("03-text").source.layer("textBlock").sourceRectAtTime(thisComp.duration/2, false).width > 1);\n';
    var CARD = HDR + HAS03 +
        'var pin = IN(0, 0.9), pq = OUT(0.45, 1);\n' +
        'var FWc = ' + FW3 + ', FHc = ' + FH3 + ';\n' +
        'var top = lp(FHc/2, -FHc/2, eo(win(en, 0.05, 0.85))), bot = lp(FHc/2, -FHc/2, pq);\n' +
        'if (en >= 1 || pq > 0) top = -FHc/2;\n' +
        'function rr(x0, y0, x1, y1, r) { r = Math.min(r, (y1 - y0)/2, (x1 - x0)/2); if (r < 0.5) return createPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [], [], true); var k = 0.5523*r;\n' +
        '  return createPath([[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]],\n' +
        '    [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]], [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]], true); }\n';
    gpath(matte03, "box").expression = CARD + 'rr(-FWc/2, top, FWc/2, Math.max(top, bot), 14);';
    gpath(border03, "box").expression = CARD + '(Math.max(top, bot) - top < 4) ? createPath([[-9000, -9000], [-8999, -9000], [-8999, -8999]], [], [], true) : rr(-FWc/2, top, FWc/2, Math.max(top, bot), 14);';
    tr(border03, "ADBE Opacity").expression = HDR + '30*(1 - OUT(0.5, 0.9));';
    gpath(shadow03, "box").expression = CARD + 'rr(-FWc/2 + 30, top + 40, FWc/2 - 30, Math.max(top, bot) + 40, 14);';
    tr(shadow03, "ADBE Opacity").expression = HDR + '30*IN(0.2, 1)*(1 - OUT(0.3, 0.8));';
    tr(fr03, "ADBE Scale").expression = HDR + 'var k = cl((time - TS)/Math.max(0.5, TE - TS)); var s = 100*(1.12 - 0.1*IN(0, 1)) + 5*FLOW*k; [s, s];';
    tr(rig03, "ADBE Position").expression = HDR + HAS03 +
        'var x = HAS ? 1290 : 960; [x, 540 + 110*FLOW*(1 - IN(0, 0.9)) - 60*FLOW*OUT(0.45, 1) + Math.sin(time*0.5)*5*FLOW*FLOW];';
    tr(rig03, "ADBE Scale").expression = HDR + HAS03 + 'var s = HAS ? 100 : 128; [s, s];';
    tr(rig03, "ADBE Rotate Z").expression = HDR + '(hsh(SEC*3 + 1)*2 - 1)*2.4*Math.pow(PRES, 1.5);';
    tr(rub03, "ADBE Position").expression = eng03.lib + ZONEFIT +
        'var p = (t0 < 0) ? 0 : eo((time - t0)/DIN);\n' +
        '[Z[0] + 4, cy - bh*s/2 - 44 + 24*(1 - p)];';
    tr(rub03, "ADBE Opacity").expression = eng03.lib + ZONEFIT +
        'var NLx = String(SRC.layer("textBlock").text.sourceText.value).replace(/\\s/g, "").length;\n' +
        '(NLx == 0 || t0 < 0) ? 0 : 100*FUR*cl((time - t0)/0.4)*(1 - OUT(0.4, 0.8));';
    ctl03.moveToBeginning();
    log.push("shot 03 built");

    // ============================================================ SHOT 04 — ECLIPSE (media only, sun iris)
    var f04 = frameComp("04-frame", W, H, preFolder, M.f04);
    var t04 = textComp("04-text", 400, 120, "", 60, null, preFolder);
    var s04 = app.project.items.addComp("04", W, H, 1, DUR, FPS);
    s04.parentFolder = shotsFolder;
    s04.motionBlur = false;
    var ctl04 = makeController(s04);
    var bg04 = makeSolid(s04, "BG"); fillFx(bg04, pal(2));
    var glow04 = makeSolid(s04, "glow"); var gr04 = rampFx(glow04, true);
    var iris04 = shapeLayer(s04, "iris"); pathGroup(iris04, "disc", '[1, 1, 1, 1]');
    var fr04 = s04.layers.add(f04); fr04.name = "04-frame";
    tritone(fr04);
    fr04.moveAfter(iris04);
    fr04.setTrackMatte(iris04, TrackMatteType.ALPHA);
    var sun04 = makeLockup(s04, "sun"); sun04.motionBlur = false;
    var bars04 = shapeLayer(s04, "scope-bars"); pathGroup(bars04, "top", pal(2)); pathGroup(bars04, "bot", pal(2));
    var tx04 = s04.layers.add(t04); tx04.name = "04-text"; tx04.enabled = false;
    var fur04 = furniture(s04, function (y) { return TRI + 'C1;'; });
    var cur04 = curtain(s04);
    var gn04 = grain(s04);
    var ECL = HDR +
        'var TD = linear(FLOW, 0, 1, 2.0, 1.35)*Math.min(1, (TE - TS)*0.5/linear(FLOW, 0, 1, 2.0, 1.35));\n' +
        'var u = (time - TS)/Math.max(0.3, TD);\n' +
        'var psun = eo(win(u, 0.0, 0.42));\n' +
        'var pir = eio(win(u, 0.5, 1.0));\n' +
        'var RD = 72*(0.9 + 0.25*FORM);\n' +
        'var r = lp(RD, 1160, pir);\n';
    gpath(iris04, "disc").expression = ECL +
        'var cy = 540 + 700*(1 - psun); var k = 0.5523*r;\n' +
        'createPath([[960, cy - r], [960 + r, cy], [960, cy + r], [960 - r, cy]], [[-k, 0], [0, -k], [k, 0], [0, k]], [[k, 0], [0, k], [-k, 0], [0, -k]], true);';
    tr(fr04, "ADBE Scale").expression = ECL + 'var k = cl((time - TS)/Math.max(0.5, TE - TS)); var s = 100*(1.16 - 0.14*pir) + 5*FLOW*k; [s, s];';
    tr(sun04, "ADBE Position").expression = ECL + '[960, 540 + 700*(1 - psun)];';
    tr(sun04, "ADBE Scale").expression = ECL + 'var q = r/100; [100*q, 100*q];';
    tr(sun04, "ADBE Opacity").expression = ECL + '100*(1 - win(u, 0.62, 0.95));';
    lkp(sun04, "disc", "ADBE Vector Group Opacity").expression = ECL + '100*(1 - win(u, 0.5, 0.78));';
    lkp(sun04, "ringL", "ADBE Vector Position").expression = ECL +
        'var pl = eo(win(u, 0.1, 0.5)), po = ei(win(u, 0.5, 0.95)); [0, -50 + 1300*(1 - pl) - 260*po];';
    lkp(sun04, "ringR", "ADBE Vector Position").expression = ECL +
        'var pl = eo(win(u, 0.2, 0.58)), po = ei(win(u, 0.52, 0.97)); [0, 50 + 1300*(1 - pl) - 380*po];';
    gr04.property("ADBE Ramp-0001").expression = ECL + '[960, 540 + 700*(1 - psun)];';
    gr04.property("ADBE Ramp-0003").expression = ECL + '[960 + 760*(0.8 + 0.5*FORM), 540 + 700*(1 - psun)];';
    gr04.property("ADBE Ramp-0002").expression = ECL + 'mix(C2, C3, 0.42*psun*(1 - pir));';
    gr04.property("ADBE Ramp-0004").expression = TRI + 'C2;';
    gpath(bars04, "top").expression = HDR + 'var h = 138*FUR; createPath([[-20, -20], [1940, -20], [1940, h], [-20, h]], [], [], true);';
    gpath(bars04, "bot").expression = HDR + 'var h = 138*FUR; createPath([[-20, 1080 - h], [1940, 1080 - h], [1940, 1100], [-20, 1100]], [], [], true);';
    ctl04.moveToBeginning();
    log.push("shot 04 built");

    // mainComp carries ONLY mainControl. The director extends every mainComp layer to the full video
    // length, so shot comps sequenced here would render (hidden) under every section: 5-10x slower renders.
    mc.moveToBeginning();
    return log.join("\n");
}
