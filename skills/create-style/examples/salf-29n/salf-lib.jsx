// SE ACABÓ LA FIESTA — "29N" — CucoStudio style builder (AE, ES3)
// Brand first: Night / Paper / Tan as flat fields, Newsreader set tight, the campaign portrait, the squirrel mark.
// Three mechanics grown from the identity:
//  - light on Night, ink on Paper: photos come up by their own luminance (Extract), and go dark on exit
//  - the two-beat turn: the landing phrase turns Tan (Brown on paper) as it is spoken
//  - the clause number: a giant tone-on-tone numeral rolls from the previous section's number
// Usage: $.evalFile(this); SALF_BUILD({ sim: bool, photos: [abs], foot: abs footage folder })

function SALF_BUILD(opts) {
    var SIM = !!opts.sim, PHOTOS = opts.photos || [], FOOT = opts.foot;
    var log = [];
    var W = 1080, H = 1920, FPS = 30, DUR = 10;
    function hx(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1]; }
    var NIGHT = hx("#0C1714"), PAPER = hx("#FDFAF3"), TAN = hx("#D7BD96");
    var F_SERIF = "Newsreader60pt-Regular", F_NUM = "Inter28pt-Bold", F_WORD = "Montserrat-Bold";

    // ------------------------------------------------------------ expression library
    var TRI =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n' +
        // the payoff on paper is a brown of the tan (#785A46 measured on the site); sand is paper toward tan
        'function BRN() { var h = rgbToHsl(C3); return hslToRgb([h[0] - 0.033, h[1]*0.587, 0.373, 1]); }\n' +
        'function SAND() { return [C2[0] + (C3[0] - C2[0])*0.47, C2[1] + (C3[1] - C2[1])*0.47, C2[2] + (C3[2] - C2[2])*0.47, 1]; }\n';
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function eo(p) { p = cl(p); return 1 - Math.pow(1 - p, 5); }\n' +
        'function qo(p) { p = cl(p); return 1 - Math.pow(1 - p, 4); }\n' +
        'function ci(p) { p = cl(p); return p*p*p; }\n' +
        'function sm(p) { p = cl(p); return p*p*(3 - 2*p); }\n' +
        'function io(p) { p = cl(p); return p < 0.5 ? 4*p*p*p : 1 - Math.pow(2 - 2*p, 3)/2; }\n' +
        'function mx(a, b, t) { return [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t, 1]; }\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n';
    // timing in seconds from the controller's keys; compressed when the section's tails are short
    var CTL =
        'var CT = thisComp.layer("controller"), ENS = CT.effect("enter")("Slider"), EXS = CT.effect("exit")("Slider");\n' +
        'var e0 = 0, e1 = 1.2, x0 = thisComp.duration - 1.2, x1 = thisComp.duration;\n' +
        'if (ENS.numKeys >= 2) { e0 = ENS.key(1).time; e1 = ENS.key(ENS.numKeys).time; }\n' +
        'if (EXS.numKeys >= 2) { x0 = EXS.key(1).time; x1 = EXS.key(EXS.numKeys).time; }\n' +
        'var KE = Math.max(0.4, Math.min(1, (e1 - e0)/1.1))*(1.15 - 0.3*FLOW), KX = Math.max(0.35, Math.min(1, (x1 - x0)/0.9));\n' +
        'function ENt(t, a, b) { return cl(((t - e0)/KE - a)/(b - a)); }\n' +
        'function EXt(t, a, b) { return cl((a - (x1 - t)/KX)/(a - b)); }\n' +
        'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)$/); if (m) SEC = parseInt(m[1], 10); })();\n';
    var HDR = TRI + FN + CTL;
    var PHR =
        'function phr(S) { var m = S.marker, n = m.numKeys, st = [], prev = 1e9;\n' +
        '  for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) st.push(m.key(k).time); prev = v; }\n' +
        '  var t0 = -1, t1 = 1e6, ix = -1;\n' +
        '  for (var q = 0; q < st.length; q++) { if (st[q] <= time + 0.001) { t0 = st[q]; ix = q; } else { t1 = st[q]; break; } }\n' +
        '  if (n == 0) { t0 = 0; ix = 0; }\n' +
        '  return [t0, t1, ix, Math.max(1, st.length)]; }\n';
    function pal(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }

    // ------------------------------------------------------------ helpers
    function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }
    function fxAdd(layer, mn) { return layer.property("ADBE Effect Parade").addProperty(mn); }
    function pp(e, n) { return e.property(e.matchName + "-" + n); }
    function addSlider(layer, name, value) { var f = fxAdd(layer, "ADBE Slider Control"); f.name = name; f.property(1).setValue(value); return f; }
    function addColorCtl(layer, name, rgba) { var f = fxAdd(layer, "ADBE Color Control"); f.name = name; f.property(1).setValue(rgba); return f; }
    function fillFx(layer, colorExpr) { var f = fxAdd(layer, "ADBE Fill"); pp(f, "0002").expression = colorExpr; return f; }
    function textDoc(t) { return t.property("ADBE Text Properties").property("ADBE Text Document"); }
    function makeText(comp, str, font, size, just, tracking, leading, rgb) {
        var t = comp.layers.addText(str);
        var p = textDoc(t); var d = p.value;
        try { d.resetCharStyle(); } catch (e1) {}
        try { d.resetParagraphStyle(); } catch (e2) {}
        d.font = font; d.fontSize = size;
        d.applyFill = true; d.fillColor = rgb || [PAPER[0], PAPER[1], PAPER[2]]; d.applyStroke = false;
        d.justification = just;
        d.tracking = tracking;
        if (leading) { d.autoLeading = false; d.leading = leading; }
        try { d.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; } catch (e3) {}
        try { d.fauxBold = false; d.fauxItalic = false; } catch (e4) {}
        p.setValue(d);
        return t;
    }
    function makeController(comp) {
        var c = comp.layers.addNull(DUR); c.name = "controller";
        var en = addSlider(c, "enter", 0).property(1); en.setValueAtTime(0, 0); en.setValueAtTime(1.1, 100);
        var ex = addSlider(c, "exit", 0).property(1); ex.setValueAtTime(DUR - 0.9, 0); ex.setValueAtTime(DUR, 100);
        return c;
    }
    function shapeLayer(comp, name) {
        var s = comp.layers.addShape(); s.name = name;
        tr(s, "ADBE Anchor Point").setValue([0, 0]); tr(s, "ADBE Position").setValue([0, 0]);
        return s;
    }
    function grp(layer, name) { var g = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name = name; return g; }
    function gget(layer, name) { return layer.property("ADBE Root Vectors Group").property(name); }
    function gv(g) { return g.property("ADBE Vectors Group"); }
    function addPathExpr(layer, gname, expr) {
        var g = gget(layer, gname); gv(g).addProperty("ADBE Vector Shape - Group");
        g = gget(layer, gname); gv(g).property(gv(g).numProperties).property("ADBE Vector Shape").expression = expr;
    }
    function addFillV(layer, gname, colorExpr) {
        var g = gget(layer, gname); var f = gv(g).addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").expression = colorExpr;
    }
    function markers(comp, phrases) {
        for (var i = 0; i < phrases.length; i++) {
            var t0 = phrases[i][0], dw = phrases[i][1], n = phrases[i][2];
            comp.markerProperty.setValueAtTime(t0, new MarkerValue("0"));
            for (var k = 1; k <= n; k++) comp.markerProperty.setValueAtTime(t0 + 1 / FPS + (k - 1) * dw, new MarkerValue(String(Math.round(k / n * 100))));
            if (i < phrases.length - 1) comp.markerProperty.setValueAtTime(phrases[i + 1][0] - 2 / FPS, new MarkerValue("100"));
        }
    }
    function simTexts(tb, phrases, texts) {   // director emulation: fit all phrases by width, apply the MIN size, centre each with HOLD keys
        var p = textDoc(tb), comp = tb.containingComp;
        for (var i = 0; i < texts.length; i++) { var d = p.value; d.text = texts[i]; p.setValueAtTime(Math.max(0, phrases[i][0] + 1 / FPS), d); }
        var size0 = p.valueAtTime(phrases[0][0] + 1 / FPS, true).fontSize, minS = size0;
        function rectAt(t, sz) { var k = p.nearestKeyIndex(t), d = p.keyValue(k); d.fontSize = sz; p.setValueAtKey(k, d); return tb.sourceRectAtTime(t, false); }
        for (var j = 0; j < texts.length; j++) {
            var t = phrases[j][0] + 1 / FPS, lo = 8, hi = size0, r0 = rectAt(t, hi);
            if (r0.width > comp.width) {
                for (var it = 0; it < 14; it++) { var mid = (lo + hi) / 2, r = rectAt(t, mid); if (r.width > comp.width) hi = mid; else lo = mid; }
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
        var r1 = tb.sourceRectAtTime(phrases[0][0] + 1 / FPS, false);
        log.push("  sim fit " + comp.name + ": " + Math.round(minS) + " px, block " + Math.round(r1.width) + "x" + Math.round(r1.height) + " in " + comp.width + "x" + comp.height);
    }

    // ------------------------------------------------------------ type: Source Text (reflow + the two-beat turn)
    // o: { maxL, cw, lead, ink, turn (colour expr), greedy }
    function styleExpr(o) {
        var s = TRI + FN +
            'var PS = [], prv = 1e9; (function () { var m = thisComp.marker; for (var k = 1; k <= m.numKeys; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prv) PS.push(m.key(k).time); prv = v; } })();\n' +
            'var IDX = 0; for (var q = 0; q < PS.length; q++) { if (PS[q] <= time + 0.001) IDX = q + 1; }\n' +
            'var LAND = (PS.length == 0) || (IDX == PS.length);\n' +
            'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "");\n' +
            'var res = s, fs = style.fontSize, zw = thisComp.width, zh = thisComp.height;\n' +
            'if (s.length > 0) {\n' +
            '  var w = s.split(/\\s+/), u = [];\n' +
            '  for (var i = 0; i < w.length; i++) { if (w[i].length <= 2 && i < w.length - 1) { w[i + 1] = w[i] + " " + w[i + 1]; } else { u.push(w[i]); } }\n' +
            '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
            '  function bal(nl) { if (nl == 1) return [u.join(" ")]; var bv = 1e9, best = null;\n' +
            '    function rc(start, left, cs) { if (left == 1) { var mxl = L(start, u.length), pv = 0; for (var q = 0; q < cs.length; q++) { mxl = Math.max(mxl, L(pv, cs[q])); pv = cs[q]; } if (mxl < bv) { bv = mxl; best = cs.slice(0); } return; }\n' +
            '      for (var b = start + 1; b <= u.length - left + 1; b++) { cs.push(b); rc(b, left - 1, cs); cs.pop(); } }\n' +
            '    rc(0, nl, []); var out = [], pv = 0; for (var q = 0; q < best.length; q++) { out.push(u.slice(pv, best[q]).join(" ")); pv = best[q]; } out.push(u.slice(pv).join(" ")); return out; }\n' +
            '  var bestL = null, bs = -1;\n' +
            (o.greedy ?
            // a paragraph: minimum raggedness under the width limit (cw errs wide), a penalty per extra line
            '  var mxc = Math.max(8, Math.floor(zw/(fs*' + o.cw + '))), n = u.length, cost = [], nxt = []; cost[n] = 0;\n' +
            '  for (var i = n - 1; i >= 0; i--) { cost[i] = 1e18; var len = -1;\n' +
            '    for (var j = i + 1; j <= n; j++) { len += u[j - 1].length + 1; if (len > mxc && j > i + 1) break;\n' +
            '      var c = (j == n ? 0 : Math.pow(mxc - len, 2)) + mxc*mxc*0.6; if (c + cost[j] < cost[i]) { cost[i] = c + cost[j]; nxt[i] = j; } } }\n' +
            '  bestL = []; var ii = 0; while (ii < n) { bestL.push(u.slice(ii, nxt[ii]).join(" ")); ii = nxt[ii]; }\n' :
            '  for (var nl = 1; nl <= Math.min(' + o.maxL + ', u.length); nl++) {\n' +
            '    var ls = bal(nl), mc = 0, mn = 1e9; for (var j = 0; j < ls.length; j++) { mc = Math.max(mc, ls[j].length); mn = Math.min(mn, ls[j].length); }\n' +
            '    var sc = Math.min(zw/(mc*' + o.cw + '), zh/(nl*' + o.lead + ' + 0.3))*Math.pow(mn/mc, 0.5);\n' +   // breaks never depend on the current size: the director's binary search stays monotonic

            '    if (sc > bs + 0.5) { bs = sc; bestL = ls; }\n' +
            '  }\n') +
            '  res = bestL.join("\\r");\n' +
            '}\n' +
            'var INK = ' + o.ink + ', TC = ' + o.turn + ';\n' +
            'var st = style.setText(res).setAllCaps(false).setAutoLeading(false).setLeading(fs*' + o.lead + ').setFont("' + F_SERIF + '").setFillColor([INK[0], INK[1], INK[2]]);\n' +
            // the two-beat turn: the landing phrase turns as it is spoken (word markers "0".."100"); one phrase → its last line
            'if (LAND && res.length > 0) {\n' +
            '  var sp = 1, m = thisComp.marker;\n' +
            '  if (m.numKeys > 0 && IDX > 0) { var p0 = PS[IDX - 1], pv = 0, cv = 0, ct = p0;\n' +
            '    for (var k = 1; k <= m.numKeys; k++) { var mk = m.key(k); if (mk.time < p0 - 0.001) continue; if (mk.time > time + 0.001) break;\n' +
            '      var v = parseFloat(mk.comment); if (isNaN(v)) v = 0; pv = cv; cv = v; ct = mk.time; }\n' +
            '    sp = (pv + (cv - pv)*cl((time - ct)/0.25))/100; }\n' +
            '  var a0 = (PS.length > 1) ? 0 : res.lastIndexOf("\\r") + 1, n = res.length - a0, front = sp*(n + 6) - 3;\n' +
            '  for (var k = 0; k < n; k++) { var f = cl((front - k)/4 + 0.5); if (f <= 0) break; var cc = mx(INK, TC, f); st = st.setFillColor([cc[0], cc[1], cc[2]], a0 + k, 1); }\n' +
            '}\n';
        return s + 'st;';
    }
    function makeTextComp(name, w, h, sample, size, just, tracking, o) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var tb = makeText(c, sample, F_SERIF, size, just, tracking, size * o.lead); tb.name = "textBlock";
        var r = tb.sourceRectAtTime(0, false);
        tr(tb, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr(tb, "ADBE Position").setValue([w / 2, h / 2]);
        textDoc(tb).expression = styleExpr(o);
        return c;
    }

    // ------------------------------------------------------------ type: measured once per frame, read by many
    function tsName(tname) { return "typeset " + tname; }
    function makeTypeset(shot, tname) {
        var t = shot.layers.addText("{}"); t.name = tsName(tname);
        t.guideLayer = true; tr(t, "ADBE Opacity").setValue(0);
        textDoc(t).expression = PHR +
            'var out = "";\n' +
            'try {\n' +
            '  var SRC = thisComp.layer("' + tname + '").source, TB = SRC.layer("textBlock");\n' +
            '  var R = TB.sourceRectAtTime(time, false);\n' +
            '  var A = TB.toComp([R.left, R.top]), B = TB.toComp([R.left + R.width, R.top + R.height]);\n' +
            '  var TXT = String(TB.text.sourceText.value), LNS = TXT.length ? TXT.split("\\r") : [], lens = [];\n' +
            '  for (var i = 0; i < LNS.length; i++) lens.push(LNS[i].length);\n' +
            '  var P = phr(SRC);\n' +
            '  out = JSON.stringify({ l: Math.min(A[0], B[0]), r: Math.max(A[0], B[0]), t: Math.min(A[1], B[1]), b: Math.max(A[1], B[1]),\n' +
            '    fs: TB.text.sourceText.style.fontSize, bl: TB.toComp([0, 0])[1], nl: LNS.length, lens: lens,\n' +
            '    t0: P[0], t1: P[1], pi: P[2], pn: P[3], w: SRC.width, h: SRC.height, has: TXT.replace(/\\s/g, "").length > 0 });\n' +
            '} catch (err) { out = JSON.stringify({ l: 0, r: 0, t: 0, b: 0, fs: 100, bl: 0, nl: 0, lens: [], t0: -1, t1: 1e6, pi: 0, pn: 1, w: 100, h: 100, has: false }); }\n' +
            'out;';
        return t;
    }
    function TSJ(tname) { return 'JSON.parse(String(thisComp.layer("' + tsName(tname) + '").text.sourceText.valueAtTime(Math.round(time*' + FPS + ')/' + FPS + ')))'; }
    function hasJS(tname) { return 'var HAS = ' + TSJ(tname) + '.has;\n'; }

    // Each line rises out of its own baseline window; phrases rise out at their end, the section at its exit.
    // o: { tname, n, x, y, ax 0 left|1 centre, ay 0 top|1 centre|2 bottom, lead, cut, after, block }
    function lineLib(o) {
        return HDR +
            'var J = ' + TSJ(o.tname) + ';\n' +
            'var LFT = J.l, RGT = J.r, TOP = J.t, BOT = J.b, FS = J.fs, BL0 = J.bl, NL = J.nl, t0 = J.t0, t1 = J.t1;\n' +
            'var an = [J.w/2, J.h/2], LEAD = FS*' + o.lead + ';\n' +
            'var X = ' + (o.ax === 0 ? o.x + ' + an[0] - LFT' : o.x + ' + an[0] - (LFT + RGT)/2') + ';\n' +
            'var Y = ' + (o.ay === 0 ? o.y + ' + an[1] - TOP' : (o.ay === 1 ? o.y + ' + an[1] - (TOP + BOT)/2' : o.y + ' + an[1] - BOT')) + ';\n' +
            'function gl(k) { return BL0 + (k - 1)*LEAD + ' + o.cut + '*FS; }\n' +
            'function bnd(k) { if (k <= 0) return -6000; if (k >= NL) return gl(NL) + 0.06*FS; return gl(k); }\n' +
            'var TS = Math.max(t0, e0 + ' + (o.after === undefined ? 0.15 : o.after) + '*KE);\n' +
            'var STG = 0.06 + 0.06*PRES, DIN = 0.95 - 0.3*FLOW, TRV = ' + (o.block ? '0.5*LEAD' : 'LEAD*0.98') + ';\n' +
            'function dl(i) { return Math.max(0, i + PRES*(hsh(SEC*7 + i*3 + 1)*2 - 1)*0.9)*STG; }\n' +
            'function pin(i) { return (t0 < 0) ? 0 : eo((time - TS - dl(i))/DIN); }\n' +
            'function pout(i) { var a = (t1 > 1e5 || t0 < 0) ? 0 : ci((time - (t1 - 0.34) - i*0.035)/0.28); return Math.max(a, ci(EXt(time - i*0.03, 0.4, 0))); }\n' +
            'function dyR(i) { return TRV*(1 - pin(i)) - TRV*1.1*pout(i); }\n' +
            'function RS(i) { if (i < 0 || i >= NL) return 1; return sm((pin(i) - 0.985)/0.015)*(1 - cl(pout(i)*50)); }\n' +
            'function eT(i) { return 0.24*FS*RS(i)*RS(i - 1); }\n' +
            'function eB(i) { return (i >= NL - 1) ? 0 : 0.24*FS*RS(i)*RS(i + 1); }\n' +
            'var FL = Math.sin(time*0.5)*5*FLOW*FLOW;\n';
    }
    function lineStack(shot, tcomp, parentRig, o) {
        o.tname = tcomp.name;
        makeTypeset(shot, tcomp.name);
        var LIB = lineLib(o), out = [];
        for (var li = 0; li < o.n; li++) {
            var L = shot.layers.add(tcomp); L.name = tcomp.name; L.collapseTransformation = true;
            if (parentRig) { L.parent = parentRig; }
            if (!o.block) {
                var mk = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
                mk.property("ADBE Mask Offset").setValue(1);
                mk.property("ADBE Mask Shape").expression = LIB + 'var i = ' + li + ';\n' +
                    'if (i >= NL) { createPath([[0, 0], [1, 0], [1, 1]], [], [], true); } else {\n' +
                    '  var ya = bnd(i) - eT(i), yb = bnd(i + 1) + eB(i);\n' +
                    '  createPath([[-6000, ya], [9000, ya], [9000, yb], [-6000, yb]], [], [], true); }';
                var mk2 = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
                mk2.maskMode = MaskMode.INTERSECT;
                mk2.property("ADBE Mask Offset").setValue(1);
                mk2.property("ADBE Mask Shape").expression = LIB + 'var i = ' + li + ';\n' +
                    'if (i >= NL) { createPath([[0, 0], [1, 0], [1, 1]], [], [], true); } else {\n' +
                    '  var y0 = bnd(i) - eT(i), y1 = bnd(i + 1) + eB(i), dy = dyR(i);\n' +
                    '  createPath([[-6000, y0 - dy], [9000, y0 - dy], [9000, y1 - dy], [-6000, y1 - dy]], [], [], true); }';
            }
            tr(L, "ADBE Position").expression = LIB + 'var i = ' + li + ';\n' +
                '[X, Y + (i < NL ? dyR(i) : 0) + FL];';
            tr(L, "ADBE Opacity").expression = LIB + 'var i = ' + li + ';\n' +
                (o.block ? '(NL < 1) ? 0 : 100*cl(pin(0)*1.6)*(1 - cl(pout(0)*1.4));' :
                'if (i >= NL) { 0; } else { 100*cl(pin(i)*2.4)*(1 - cl(pout(i)*1.4)); }');
            L.motionBlur = true;
            out.push(L);
        }
        return out;
    }

    // ------------------------------------------------------------ light on Night / ink on Paper
    // Extract (luminance) on a media layer. light: highlights arrive first, rest with the darks as the field;
    // on exit the shadows go first, the highlights last. ink: darks arrive first, the highlights become the page.
    // win: [a, b] enter window in seconds (scaled by KE)
    function lumaFx(layer, mode, win) {
        var e = fxAdd(layer, "ADBE Extract");
        pp(e, "0002").setValue(1);   // luminance
        var P = HDR + 'var p = sm(ENt(time, ' + win[0] + ', ' + win[1] + ')), q = sm(EXt(time, 0.42, 0));\n';
        if (mode === "light") {
            pp(e, "0005").setValue(80);   // black softness: a soft threshold front
            pp(e, "0003").expression = P +
                'var REST = 20 + 150*Math.pow(FORM, 3);\n' +
                // PRESSURE: the light stutters on, like a tube catching
                'var fk = (p > 0.05 && p < 0.75 && hsh(Math.floor(time*20) + SEC*13) < 0.45*PRES) ? 1 : 0;\n' +
                'var bp = 255 + (REST - 255)*p + 140*fk*(1 - p);\n' +
                'Math.min(255, bp + (255 - bp)*q);';
        } else {
            pp(e, "0006").setValue(70);   // white softness
            pp(e, "0004").expression = P +
                'var REST = 236 - 150*Math.pow(FORM, 3);\n' +
                'var wp = REST*p; Math.max(0, wp - wp*q);';
        }
        tr(layer, "ADBE Opacity").expression = HDR + '100*cl(ENt(time, ' + win[0] + ', ' + win[1] + ')*10)*(1 - cl(EXt(time, 0.06, 0)));';
        return e;
    }
    // cover-scale a {shot}-frame layer into a window, with a slow push; the matte is a fixed rectangle
    function mediaWindow(shot, frameLayer, x, y, w, h, win) {
        var M = shapeLayer(shot, frameLayer.name + "-window"); grp(M, "win");
        addPathExpr(M, "win", 'createPath([[' + x + ', ' + y + '], [' + (x + w) + ', ' + y + '], [' + (x + w) + ', ' + (y + h) + '], [' + x + ', ' + (y + h) + ']], [], [], true);');
        addFillV(M, "win", '[1, 1, 1, 1];');
        frameLayer.moveAfter(M);
        tr(frameLayer, "ADBE Position").setValue([x + w / 2, y + h / 2]);
        tr(frameLayer, "ADBE Scale").expression = HDR +
            'var S = thisLayer.source, k = 1;\n' +
            'try { var Lm = S.layer(1); if (Lm.source && Lm.source.width > 0) { var sc = Lm.transform.scale.value; var mw = Lm.source.width*Math.abs(sc[0])/100, mh = Lm.source.height*Math.abs(sc[1])/100; if (mw > 1 && mh > 1) k = Math.max(S.width/mw, S.height/mh); } } catch (err) {}\n' +
            'k = Math.max(k, ' + w + '/S.width, ' + h + '/S.height);\n' +
            'var p = eo(ENt(time, ' + win[0] + ', ' + (win[1] + 0.8) + '));\n' +
            'var s = 100*k*(1.07 - 0.07*p + 0.05*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';
        frameLayer.setTrackMatte(M, TrackMatteType.ALPHA);
        frameLayer.motionBlur = true;
        return M;
    }
    // the field closing over the foot of a photo (the site's hero: the portrait falls into Night)
    function falloff(shot, y, feather, colExpr) {
        var s = shot.layers.addSolid([1, 1, 1], "falloff", W, H, 1, DUR);
        fillFx(s, colExpr);
        var mk = s.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        var sh = new Shape(); sh.vertices = [[-200, y], [W + 200, y], [W + 200, H + 400], [-200, H + 400]]; sh.closed = true;
        mk.property("ADBE Mask Shape").setValue(sh);
        mk.property("ADBE Mask Feather").setValue([0, feather]);
        return s;
    }

    // ------------------------------------------------------------ the clause number
    // a giant numeral: section index + 1, rolling up from the previous number; tone-on-tone
    function numeral(shot, rig, x, y, size, colExpr, just, win) {
        var hgt = size * 0.74, out = [];
        var names = ["numeral", "numeral prev"];
        for (var i = 0; i < 2; i++) {
            var t = makeText(shot, "01", F_SERIF, size, just, -40, size);
            t.name = names[i];
            textDoc(t).expression = HDR + 'var n = SEC + ' + (i === 0 ? 1 : 0) + '; (n < 1) ? "" : ((n < 10 ? "0" : "") + n);';
            fillFx(t, TRI + FN + colExpr + ';');
            var ROLL = HDR + 'var p = io(ENt(time, ' + win[0] + ', ' + win[1] + ')), q = ci(EXt(time, 0.4, 0)), H = ' + (hgt * 1.25) + ';\n' +
                'var dy = ' + (i === 0 ? 'H*(1 - p) - H*q' : '-H*p') + ';\n';
            tr(t, "ADBE Position").setValue([x, y]);
            tr(t, "ADBE Position").expression = ROLL + '[' + x + ', ' + y + ' + dy];';
            var mk = t.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            mk.property("ADBE Mask Shape").expression = ROLL +
                'var y0 = ' + (-hgt - size * 0.08) + ' - dy, y1 = ' + (size * 0.1) + ' - dy;\n' +
                'createPath([[-4000, y0], [4000, y0], [4000, y1], [-4000, y1]], [], [], true);';
            if (rig) t.parent = rig;
            t.motionBlur = true;
            out.push(t);
        }
        return out;
    }

    // ------------------------------------------------------------ the mark
    // night: the squirrel lit out of the dark + the wordmark set live; light fields: the full logo inked in
    var ardItem = null, logoItem = null;
    function imp(path) { var it = app.project.importFile(new ImportOptions(new File(path))); it.parentFolder = footFolder; return it; }
    function lockupNight(comp, x, y, hPx, drawExpr, a, gate) {
        var G = gate || 'var GATE = 1;\n';
        if (!ardItem) ardItem = imp(FOOT + "/ardilla.png");
        var sq = comp.layers.add(ardItem); sq.name = "ardilla";
        var sc = hPx / ardItem.height * 100;
        tr(sq, "ADBE Anchor Point").setValue([0, 0]);
        tr(sq, "ADBE Position").setValue([x, y]); tr(sq, "ADBE Scale").setValue([sc, sc]);
        var e = fxAdd(sq, "ADBE Extract"); pp(e, "0002").setValue(1); pp(e, "0005").setValue(60);
        pp(e, "0003").expression = HDR + 'var DRAW = ' + drawExpr + ';\nvar p = DRAW ? sm(ENt(time, ' + a + ', ' + (a + 1.0) + ')) : 1, q = sm(EXt(time, 0.42, 0));\n' +
            'var bp = 255 - 255*p; Math.min(255, bp + (255 - bp)*q);';
        tr(sq, "ADBE Opacity").expression = HDR + G + '100*GATE;';
        var fs = Math.round(hPx * 0.27), lead = Math.round(hPx * 0.3), out = [sq];
        var lines = ["SE ACAB\u00D3", "LA FIESTA"], cols = ["C3", "C2"];
        for (var i = 0; i < 2; i++) {
            var t = makeText(comp, lines[i], F_WORD, fs, ParagraphJustification.LEFT_JUSTIFY, -10, lead);
            t.name = "wordmark " + (i + 1);
            fillFx(t, TRI + cols[i] + ';');
            var yy = y + hPx * 0.5 + (i === 0 ? -lead * 0.12 : lead * 0.88);
            tr(t, "ADBE Position").setValue([x + ardItem.width * sc / 100 + hPx * 0.16, yy]);
            tr(t, "ADBE Position").expression = HDR + 'var DRAW = ' + drawExpr + ';\nvar p = DRAW ? eo(ENt(time, ' + (a + 0.35 + i * 0.08) + ', ' + (a + 1.05 + i * 0.08) + ')) : 1, q = ci(EXt(time, 0.4, 0));\n' +
                '[value[0], value[1] + 26*(1 - p) - 30*q];';
            tr(t, "ADBE Opacity").expression = HDR + G + 'var DRAW = ' + drawExpr + ';\nvar p = DRAW ? sm(ENt(time, ' + (a + 0.35 + i * 0.08) + ', ' + (a + 0.8 + i * 0.08) + ')) : 1;\n100*GATE*p*(1 - sm(EXt(time, 0.36, 0)));';
            out.push(t);
        }
        return out;
    }
    function logoInk(comp, cx, cy, wPx, a) {
        if (!logoItem) logoItem = imp(FOOT + "/salf-logo.png");
        var L = comp.layers.add(logoItem); L.name = "salf-logo";
        var sc = wPx / logoItem.width * 100;
        tr(L, "ADBE Position").setValue([cx, cy]); tr(L, "ADBE Scale").setValue([sc, sc]);
        var e = fxAdd(L, "ADBE Extract"); pp(e, "0002").setValue(1); pp(e, "0006").setValue(60);
        pp(e, "0004").expression = HDR + 'var p = sm(ENt(time, ' + a + ', ' + (a + 1.0) + ')), q = sm(EXt(time, 0.42, 0));\nvar wp = 255*p; Math.max(0, wp - wp*q);';
        return L;
    }

    // ------------------------------------------------------------ media comps
    var photoIdx = 0;
    function makeFrameComp(name, w, h) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var ph = c.layers.addSolid([0.5, 0.5, 0.5], "placeholder (replace with media)", w, h, 1, DUR);
        ph.guideLayer = true;   // never renders: letterbox bars from "fit" stay transparent
        if (SIM && PHOTOS.length) {
            var it = app.project.importFile(new ImportOptions(new File(PHOTOS[photoIdx % PHOTOS.length]))); photoIdx++;
            it.parentFolder = preFolder;
            var L = c.layers.add(it); var sc = Math.min(w / it.width, h / it.height) * 100; tr(L, "ADBE Scale").setValue([sc, sc]);   // "fit", like the director
        }
        return c;
    }

    // ============================================================ BUILD
    app.purge(PurgeTarget.ALL_CACHES);
    while (app.project.numItems > 0) { app.project.item(1).remove(); }
    app.project.bitsPerChannel = 8;
    var mainComp = app.project.items.addComp("mainComp", W, H, 1, DUR * 2, FPS);
    var shotsFolder = app.project.items.addFolder("ORIGINAL_SHOTS");
    var preFolder = app.project.items.addFolder("PRECOMPS");
    var footFolder = app.project.items.addFolder("FOOTAGE");
    var mcL = mainComp.layers.addNull(DUR * 2); mcL.name = "mainControl";
    addSlider(mcL, "FORM", 40); addSlider(mcL, "FLOW", 50); addSlider(mcL, "PRESSURE", 30);
    addColorCtl(mcL, "1", NIGHT); addColorCtl(mcL, "2", PAPER); addColorCtl(mcL, "3", TAN);
    log.push("mainComp + mainControl");

    function newShot(name, fieldExpr) {
        var c = app.project.items.addComp(name, W, H, 1, DUR, FPS); c.parentFolder = shotsFolder; c.motionBlur = true;
        c.shutterAngle = 180; c.shutterPhase = -90;
        makeController(c);
        var g = c.layers.addSolid([1, 1, 1], "field", W, H, 1, DUR); fillFx(g, fieldExpr); g.moveToEnd();
        return c;
    }
    function makeRig(shot, name) {
        var r = shot.layers.addNull(DUR); r.name = name;
        tr(r, "ADBE Anchor Point").setValue([0, 0, 0]); tr(r, "ADBE Position").setValue([0, 0]);
        return r;
    }
    function finish(shot) { shot.layer("controller").moveToBeginning(); }
    var PH = [[0.3, 0.3, 4], [3.4, 0.3, 4], [6.5, 0.3, 4]];
    function sim(tcomp, texts, ph) { if (!SIM) return; var P = ph || PH; markers(tcomp, P); simTexts(tcomp.layer("textBlock"), P, texts); }
    var LJ = ParagraphJustification.LEFT_JUSTIFY, CJ = ParagraphJustification.CENTER_JUSTIFY;
    var NIGHT_F = TRI + 'C1;', PAPER_F = TRI + 'C2;', SAND_F = TRI + 'SAND();';

    // ============================================================ 01 PORTADA — Night; lockup; clause numeral; the statement, payoff in Tan
    var o01 = { maxL: 4, cw: 0.40, lead: 0.98, ink: "C2", turn: "C3" };
    var t01 = makeTextComp("01-text", 920, 860, "Un pa\u00EDs por hacer. Un plan para hacerlo.", 220, LJ, -60, o01);
    sim(t01, ["Un pa\u00EDs por hacer.", "Un plan para hacerlo.", "La ilusi\u00F3n de un pa\u00EDs."]);
    var s01 = newShot("01", NIGHT_F);
    var r01 = makeRig(s01, "rig");
    numeral(s01, r01, 1000, 700, 620, 'mx(C1, C3, 0.11)', ParagraphJustification.RIGHT_JUSTIFY, [0.05, 0.9]);
    lockupNight(s01, 80, 96, 112, 'SEC == 0', 0.1);
    lineStack(s01, t01, r01, { n: 4, x: 80, y: 1730, ax: 0, ay: 2, lead: 0.98, cut: 0.24, after: 0.12 });
    finish(s01);
    log.push("01 portada");

    // ============================================================ 02 RETRATO — the candidate lit out of the dark (a crop per section); the statement below
    var o02 = { maxL: 4, cw: 0.40, lead: 1.0, ink: "C2", turn: "C3" };
    var t02 = makeTextComp("02-text", 920, 600, "Tu primera casa. Tu futuro.", 160, LJ, -50, o02);
    sim(t02, ["El fruto de tu trabajo, en tu bolsillo.", "Tu primera casa.", "Tu futuro."]);
    var s02 = newShot("02", NIGHT_F);
    var r02 = makeRig(s02, "rig");
    var pf = imp(FOOT + "/perfil.jpg");
    var pl = s02.layers.add(pf); pl.name = "retrato";
    // crops [scale %, focus x, focus y (source px), target x, target y]: wide profile, close on the laugh, the eye
    var CROPS = '[[84, 1180, 700, 560, 560], [128, 1330, 900, 560, 640], [150, 1260, 690, 600, 520]]';
    tr(pl, "ADBE Anchor Point").setValue([0, 0]);
    tr(pl, "ADBE Scale").expression = HDR + 'var C = ' + CROPS + '[SEC % 3], p = eo(ENt(time, 0, 1.6));\nvar s = C[0]*(1.05 - 0.05*p + 0.04*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';
    tr(pl, "ADBE Position").expression = HDR + 'var C = ' + CROPS + '[SEC % 3], s = transform.scale[0]/100;\n[C[3] - C[1]*s, C[4] - C[2]*s];';
    lumaFx(pl, "light", [0.0, 1.1]);
    pl.motionBlur = true;
    falloff(s02, 1000, 300, NIGHT_F);
    lineStack(s02, t02, r02, { n: 4, x: 80, y: 1230, ax: 0, ay: 0, lead: 1.0, cut: 0.24, after: 0.3 });
    finish(s02);
    log.push("02 retrato");

    // ============================================================ 03 PÁGINA — Paper; the story's photo inks onto the page; the statement below
    var o03 = { maxL: 3, cw: 0.40, lead: 1.0, ink: "C1", turn: "BRN()" };
    var t03 = makeTextComp("03-text", 920, 520, "La campa\u00F1a se vive de cerca.", 140, LJ, -50, o03);
    sim(t03, ["La campa\u00F1a se vive de cerca.", "Mesas informativas en tu ciudad.", "Hablemos."]);
    var f03 = makeFrameComp("03-frame", 1000, 800);
    var s03 = newShot("03", PAPER_F);
    var r03 = makeRig(s03, "rig");
    var mr03 = makeRig(s03, "media-rig");
    var fl03 = s03.layers.add(f03); fl03.name = "03-frame"; fl03.audioEnabled = false;
    var w03 = mediaWindow(s03, fl03, 40, 150, 1000, 800, [0.0, 1.0]);
    lumaFx(fl03, "ink", [0.0, 1.0]);
    w03.parent = mr03; fl03.parent = mr03;
    lineStack(s03, t03, r03, { n: 3, x: 80, y: 1040, ax: 0, ay: 0, lead: 1.0, cut: 0.24, after: 0.3 });
    tr(mr03, "ADBE Position").expression = HDR + hasJS("03-text") + '[0, HAS ? 0 : 330];';
    finish(s03);
    log.push("03 pagina");

    // ============================================================ 04 NOCHE — full-bleed photo lit from Night, falling into the field at the foot
    var o04 = { maxL: 3, cw: 0.40, lead: 1.0, ink: "C2", turn: "C3" };
    var t04 = makeTextComp("04-text", 920, 470, "Tu voz en el Congreso.", 156, LJ, -55, o04);
    sim(t04, ["Tu voz en el Congreso.", "El que la hace,", "la paga."]);
    var f04 = makeFrameComp("04-frame", 1080, 1920);
    var s04 = newShot("04", NIGHT_F);
    var r04 = makeRig(s04, "rig");
    var fl04 = s04.layers.add(f04); fl04.name = "04-frame"; fl04.audioEnabled = false;
    mediaWindow(s04, fl04, 0, 0, 1080, 1920, [0.0, 1.1]);
    lumaFx(fl04, "light", [0.0, 1.1]);
    var fo04 = falloff(s04, 1120, 420, NIGHT_F);
    tr(fo04, "ADBE Position").expression = HDR + hasJS("04-text") + '[value[0], value[1] + (HAS ? 0 : 520)];';
    lineStack(s04, t04, r04, { n: 3, x: 80, y: 1760, ax: 0, ay: 2, lead: 1.0, cut: 0.24, after: 0.35 });
    finish(s04);
    log.push("04 noche");

    // ============================================================ 05 PLANO — media only: the photo lit from the dark; the lockup at the foot
    var o05 = { maxL: 2, cw: 0.40, lead: 1.04, ink: "C2", turn: "C3" };
    var t05 = makeTextComp("05-text", 920, 260, "", 96, CJ, -40, o05);
    var f05 = makeFrameComp("05-frame", 1080, 1520);
    var s05 = newShot("05", NIGHT_F);
    var r05 = makeRig(s05, "rig");
    var fl05 = s05.layers.add(f05); fl05.name = "05-frame"; fl05.audioEnabled = false;
    mediaWindow(s05, fl05, 0, 0, 1080, 1520, [0.0, 1.1]);
    lumaFx(fl05, "light", [0.0, 1.1]);
    var fo05 = falloff(s05, 1340, 300, NIGHT_F);
    lockupNight(s05, 80, 1660, 104, 'true', 0.45, hasJS("05-text") + 'var GATE = HAS ? 0 : 1;\n');
    lineStack(s05, t05, r05, { n: 2, x: 540, y: 1730, ax: 1, ay: 1, lead: 1.04, cut: 0.24, after: 0.4 });
    finish(s05);
    log.push("05 plano");

    // ============================================================ 06 CONTRATO — Paper; the clause numeral; the paragraph, its landing phrase turns Brown
    var o06 = { maxL: 8, cw: 0.40, lead: 1.1, ink: "C1", turn: "BRN()", greedy: true };
    var t06 = makeTextComp("06-text", 910, 1080, "En junio de 2030 se comparar\u00E1n las 119 medidas con sus votos en el Congreso. Si no cumplimos, hay consecuencias.", 110, LJ, -35, o06);
    sim(t06, ["En junio de 2030 se comparar\u00E1n las 119 medidas con sus votos en el Congreso.", "Si la correspondencia no llega al 100 %, el dinero acumulado se lo queda Espa\u00F1a.", "Y si no cumplimos, hay consecuencias."], [[0.3, 0.24, 14], [4.4, 0.22, 15], [8.0, 0.2, 6]]);
    var s06 = newShot("06", PAPER_F);
    var r06 = makeRig(s06, "rig");
    numeral(s06, r06, 70, 700, 520, 'mx(C2, C3, 0.42)', LJ, [0.05, 0.9]);
    lineStack(s06, t06, r06, { n: 1, x: 85, y: 800, ax: 0, ay: 0, lead: 1.1, cut: 0.26, block: true, after: 0.25 });
    finish(s06);
    log.push("06 contrato");

    // ============================================================ 07 CONTIGO — Sand; the logo inks in; the statement; a giant tone-on-tone 29N
    var o07 = { maxL: 3, cw: 0.40, lead: 0.98, ink: "C1", turn: "BRN()" };
    var t07 = makeTextComp("07-text", 960, 640, "La ilusi\u00F3n de un pa\u00EDs.", 230, CJ, -60, o07);
    sim(t07, ["La ilusi\u00F3n de un pa\u00EDs.", "Se construye contigo.", "Nos vemos el 29N."]);
    var s07 = newShot("07", SAND_F);
    var r07 = makeRig(s07, "rig");
    var n29 = makeText(s07, "29N", F_NUM, 560, CJ, -80, 560);
    n29.name = "29N";
    fillFx(n29, TRI + FN + 'mx(SAND(), C3, 0.75);');
    tr(n29, "ADBE Position").setValue([540, 1985]);
    var N29 = HDR + 'var p = eo(ENt(time, 0.15, 1.0)), q = ci(EXt(time, 0.4, 0)), dy = 300*(1 - p) - 300*q;\n';
    tr(n29, "ADBE Position").expression = N29 + '[value[0], value[1] + dy];';
    var m29 = n29.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    m29.property("ADBE Mask Shape").expression = N29 + 'createPath([[-4000, -460 - dy], [4000, -460 - dy], [4000, 40 - dy], [-4000, 40 - dy]], [], [], true);';
    n29.motionBlur = true;
    logoInk(s07, 540, 330, 560, 0.0);
    lineStack(s07, t07, r07, { n: 3, x: 540, y: 960, ax: 1, ay: 1, lead: 0.98, cut: 0.24, after: 0.3 });
    finish(s07);
    log.push("07 contigo");

    mcL.moveToBeginning();
    return log.join("\n");
}
