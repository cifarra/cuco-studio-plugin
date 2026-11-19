// HIALEAH CITY DENTAL v3 — "Smile" — CucoStudio style builder (AE, ES3)
// Brand first: the exact navy / cream / peach as flat fields, Newsreader with the peach italic gesture,
// the clinic's own portraits. One graphic idea, taken from the monogram: the D cup and its round-capped stroke.
//  - sheets of brand colour rise with a smile-curved edge whose depth follows their speed; every cut lands on cream
//  - photos sit in D-cup windows; the outline draws like the logo, the photo fills the cup like a level rising
//  - the section's landing line is italic, written on with a slanted wipe, and underlined by a drawn smile
// Usage: $.evalFile(this); HCD3_BUILD({ sim: bool, photos: [abs], portraits: [abs] })

function HCD3_BUILD(opts) {
    var SIM = !!opts.sim, PHOTOS = opts.photos || [], PORTRAITS = opts.portraits || [];
    var log = [];
    var W = 1080, H = 1920, FPS = 30, DUR = 10;
    function hx(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1]; }
    var CREAM = hx("#FBF8F4"), NAVY = hx("#152344"), PEACH = hx("#EFD7C2");
    var F_SERIF = "Newsreader60pt-Regular", F_ITAL = "Newsreader60pt-Italic", F_LABEL = "Manrope-SemiBold";

    // ------------------------------------------------------------ expression library
    var TRI =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n' +
        // the site's italic on cream is a bronze of the peach (#8C6042 measured): same hue, less saturation, L 0.40
        'function BRZ() { var h = rgbToHsl(C3); return hslToRgb([h[0] - 0.011, h[1]*0.62, 0.40, 1]); }\n';
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function eo(p) { p = cl(p); return 1 - Math.pow(1 - p, 5); }\n' +
        'function qo(p) { p = cl(p); return 1 - Math.pow(1 - p, 4); }\n' +
        'function ci(p) { p = cl(p); return p*p*p; }\n' +
        'function sm(p) { p = cl(p); return p*p*(3 - 2*p); }\n' +
        'function io(p) { p = cl(p); return p < 0.5 ? 4*p*p*p : 1 - Math.pow(2 - 2*p, 3)/2; }\n' +
        'function win(v, a, b) { return cl((v - a)/(b - a)); }\n' +
        'function mx(a, b, t) { return [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t, 1]; }\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n';
    // timing in seconds from the controller's keys (the director keys enter at the head, exit at the tail);
    // compressed when the section's tails are short
    var CTL =
        'var CT = thisComp.layer("controller"), ENS = CT.effect("enter")("Slider"), EXS = CT.effect("exit")("Slider");\n' +
        'var e0 = 0, e1 = 1.2, x0 = thisComp.duration - 1.2, x1 = thisComp.duration;\n' +
        'if (ENS.numKeys >= 2) { e0 = ENS.key(1).time; e1 = ENS.key(ENS.numKeys).time; }\n' +
        'if (EXS.numKeys >= 2) { x0 = EXS.key(1).time; x1 = EXS.key(EXS.numKeys).time; }\n' +
        'var KE = Math.max(0.4, Math.min(1, (e1 - e0)/1.3))*(1.2 - 0.4*FLOW), KX = Math.max(0.35, Math.min(1, (x1 - x0)/1.1));\n' +
        'function ENt(t, a, b) { return cl(((t - e0)/KE - a)/(b - a)); }\n' +
        'function EXt(t, a, b) { return cl((a - (x1 - t)/KX)/(a - b)); }\n' +
        'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)$/); if (m) SEC = parseInt(m[1], 10); })();\n';
    var HDR = TRI + FN + CTL;
    // phrases from the text comp's director markers: [t0, t1, index, count]
    var PHR =
        'function phr(S) { var m = S.marker, n = m.numKeys, st = [], prev = 1e9;\n' +
        '  for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) st.push(m.key(k).time); prev = v; }\n' +
        '  var t0 = -1, t1 = 1e6, ix = -1;\n' +
        '  for (var q = 0; q < st.length; q++) { if (st[q] <= time + 0.001) { t0 = st[q]; ix = q; } else { t1 = st[q]; break; } }\n' +
        '  if (n == 0) { t0 = 0; ix = 0; }\n' +
        '  return [t0, t1, ix, Math.max(1, st.length)]; }\n';
    function pal(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }
    function colJS(c) { return (c === "BRZ") ? 'BRZ()' : c; }   // "C1" | "C2" | "C3" | "BRZ"

    // ------------------------------------------------------------ helpers
    function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }
    function fxAdd(layer, mn) { return layer.property("ADBE Effect Parade").addProperty(mn); }
    function pp(e, n) { return e.property(e.matchName + "-" + n); }
    function addSlider(layer, name, value) { var f = fxAdd(layer, "ADBE Slider Control"); f.name = name; f.property(1).setValue(value); return f; }
    function addColorCtl(layer, name, rgba) { var f = fxAdd(layer, "ADBE Color Control"); f.name = name; f.property(1).setValue(rgba); return f; }
    function fillFx(layer, colorExpr) { var f = fxAdd(layer, "ADBE Fill"); pp(f, "0002").expression = colorExpr; return f; }
    function textDoc(t) { return t.property("ADBE Text Properties").property("ADBE Text Document"); }
    function makeText(comp, str, font, size, just, tracking, leading) {
        var t = comp.layers.addText(str);
        var p = textDoc(t); var d = p.value;
        try { d.resetCharStyle(); } catch (e1) {}
        try { d.resetParagraphStyle(); } catch (e2) {}
        d.font = font; d.fontSize = size;
        d.applyFill = true; d.fillColor = [NAVY[0], NAVY[1], NAVY[2]]; d.applyStroke = false;
        d.justification = just;
        d.tracking = (tracking === undefined) ? -18 : tracking;
        if (leading) { d.autoLeading = false; d.leading = leading; }
        try { d.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; } catch (e3) {}
        try { d.fauxBold = false; d.fauxItalic = false; } catch (e4) {}
        p.setValue(d);
        return t;
    }
    function makeController(comp) {
        var c = comp.layers.addNull(DUR); c.name = "controller";
        var en = addSlider(c, "enter", 0).property(1); en.setValueAtTime(0, 0); en.setValueAtTime(1.3, 100);
        var ex = addSlider(c, "exit", 0).property(1); ex.setValueAtTime(DUR - 1.1, 0); ex.setValueAtTime(DUR, 100);
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
        var g = gget(layer, gname); var p = gv(g).addProperty("ADBE Vector Shape - Group");
        g = gget(layer, gname); gv(g).property(gv(g).numProperties).property("ADBE Vector Shape").expression = expr;
    }
    function addPath(layer, gname, verts, ins, outs, closed) {
        var g = gget(layer, gname); gv(g).addProperty("ADBE Vector Shape - Group");
        var sh = new Shape(); sh.vertices = verts;
        var z = []; for (var i = 0; i < verts.length; i++) z.push([0, 0]);
        sh.inTangents = ins || z; sh.outTangents = outs || z; sh.closed = !!closed;
        g = gget(layer, gname); gv(g).property(gv(g).numProperties).property("ADBE Vector Shape").setValue(sh);
    }
    function addFillV(layer, gname, colorExpr) {
        var g = gget(layer, gname); var f = gv(g).addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").expression = colorExpr;
    }
    function addStrokeV(layer, gname, width, colorExpr) {
        var g = gget(layer, gname); var s = gv(g).addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").expression = colorExpr;
        if (typeof width === "string") s.property("ADBE Vector Stroke Width").expression = width; else s.property("ADBE Vector Stroke Width").setValue(width);
        s.property("ADBE Vector Stroke Line Cap").setValue(2);
        s.property("ADBE Vector Stroke Line Join").setValue(2);
    }
    function addTrimV(layer, gname, endExpr, startExpr) {
        var g = gget(layer, gname); var t = gv(g).addProperty("ADBE Vector Filter - Trim");
        t.property("ADBE Vector Trim End").expression = endExpr;
        if (startExpr) t.property("ADBE Vector Trim Start").expression = startExpr;
    }
    function addMerge(layer, gname, mode) {
        var g = gget(layer, gname); gv(g).addProperty("ADBE Vector Filter - Merge").property("ADBE Vector Merge Type").setValue(mode);
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

    // ------------------------------------------------------------ type: Source Text (reflow + brand styling)
    // o: { maxL, cw, lead, ink, land (colour or null), allItal, karaoke, mute }
    function styleExpr(o) {
        var s = TRI + FN +
            'var PS = [], prv = 1e9; (function () { var m = thisComp.marker; for (var k = 1; k <= m.numKeys; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prv) PS.push(m.key(k).time); prv = v; } })();\n' +
            'var IDX = 0; for (var q = 0; q < PS.length; q++) { if (PS[q] <= time + 0.001) IDX = q + 1; }\n' +
            'var LAND = (PS.length == 0) || (IDX == PS.length);\n' +
            // balanced 1..maxL lines for the biggest type in the comp (join words of <= 2 chars to the next)
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
            '  function gre(mxc) { var out = [], cur = "";\n' +
            '    for (var q = 0; q < u.length; q++) { var nx = cur.length ? cur + " " + u[q] : u[q]; if (nx.length > mxc && cur.length) { out.push(cur); cur = u[q]; } else { cur = nx; } }\n' +
            '    if (cur.length) out.push(cur); return out; }\n' +
            '  var bestL = null, bs = -1;\n' +
            (o.greedy ?
            // a paragraph: wrap at the width for this size (cw is a safe upper bound), then even out the lines
            // minimum raggedness (squared slack, last line free) under the width limit, a penalty per extra line
            '  var mxc = Math.max(8, Math.floor(zw/(fs*' + o.cw + '))), n = u.length, cost = [], nxt = []; cost[n] = 0;\n' +
            '  for (var i = n - 1; i >= 0; i--) { cost[i] = 1e18; var len = -1;\n' +
            '    for (var j = i + 1; j <= n; j++) { len += u[j - 1].length + 1; if (len > mxc && j > i + 1) break;\n' +
            '      var c = (j == n ? 0 : Math.pow(mxc - len, 2)) + mxc*mxc*0.6; if (c + cost[j] < cost[i]) { cost[i] = c + cost[j]; nxt[i] = j; } } }\n' +
            '  bestL = []; var ii = 0; while (ii < n) { bestL.push(u.slice(ii, nxt[ii]).join(" ")); ii = nxt[ii]; }\n' :
            '  for (var nl = 1; nl <= Math.min(' + o.maxL + ', u.length); nl++) {\n' +
            '    var ls = bal(nl), mc = 0, mn = 1e9; for (var j = 0; j < ls.length; j++) { mc = Math.max(mc, ls[j].length); mn = Math.min(mn, ls[j].length); }\n' +
            '    var sc = Math.min(fs, zw/(mc*' + o.cw + '), zh/(nl*' + o.lead + ' + 0.3))*Math.pow(mn/mc, 0.5);\n' +
            '    if (sc > bs + 0.5) { bs = sc; bestL = ls; }\n' +
            '  }\n') +
            '  res = bestL.join("\\r");\n' +
            '}\n' +
            'var INK = ' + colJS(o.ink) + ';\n' +
            'var st = style.setText(res).setAllCaps(false).setAutoLeading(false).setLeading(fs*' + o.lead + ').setFont("' + (o.allItal ? F_ITAL : F_SERIF) + '").setFillColor([INK[0], INK[1], INK[2]]);\n';
        if (o.land) s +=
            'if (LAND && res.length > 0) { var li = res.lastIndexOf("\\r") + 1, n = res.length - li, LC = ' + colJS(o.land) + ';\n' +
            '  st = st.setFont("' + F_ITAL + '", li, n).setFillColor([LC[0], LC[1], LC[2]], li, n); }\n';
        if (o.karaoke) s +=
            // words ink from a muted tone to full ink as they are spoken ("0".."100" word markers)
            'var m = thisComp.marker, pv = 100, pt = -1;\n' +
            'if (m.numKeys > 0) { var kk = m.nearestKey(time).index; if (m.key(kk).time > time + 0.001) kk--; if (kk >= 1) { pv = parseFloat(m.key(kk).comment); pt = m.key(kk).time; if (isNaN(pv)) pv = 100; } else { pv = 0; } }\n' +
            'var ws = res.length ? res.split(/[ \\r]/) : [], nw = ws.length, spoken = Math.round(pv/100*nw);\n' +
            'var BGC = ' + colJS(o.bg) + ', MUTE = mx(INK, BGC, ' + o.mute + ');\n' +
            'st = st.setFillColor([MUTE[0], MUTE[1], MUTE[2]]);\n' +
            'var idx = 0; for (var j = 0; j < nw; j++) { var len = ws[j].length; if (j < spoken) { var aa = (j == spoken - 1 && pt >= 0) ? cl((time - pt)/0.16) : 1; var cc = mx(MUTE, INK, aa);\n' +
            '  st = st.setFillColor([cc[0], cc[1], cc[2]], idx, len); } idx += len + 1; }\n';
        return s + 'st;';
    }
    function makeTextComp(name, w, h, sample, font, size, just, o) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var tb = makeText(c, sample, font, size, just, -18, size * o.lead); tb.name = "textBlock";
        var r = tb.sourceRectAtTime(0, false);
        tr(tb, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr(tb, "ADBE Position").setValue([w / 2, h / 2]);
        textDoc(tb).expression = styleExpr(o);
        return c;
    }

    // ------------------------------------------------------------ type: measured once per frame, read by many
    // A guide text layer per shot measures the {shot}-text block and its phrase timing and publishes JSON.
    // Line copies read it at the frame time (also during motion-blur sub-frames), so text layout runs once a frame.
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
            '  var P = phr(SRC), m = SRC.marker, sp = -1, tl = -1;\n' +
            '  if (m.numKeys > 0) { sp = 0;\n' +
            '    if (P[0] >= 0) { var pv = 0, cv = 0, ct = P[0];\n' +
            '      for (var k = 1; k <= m.numKeys; k++) { var mk = m.key(k); if (mk.time < P[0] - 0.001) continue; if (mk.time > time + 0.001 || mk.time >= P[1] - 0.001) break;\n' +
            '        var v = parseFloat(mk.comment); if (isNaN(v)) v = 0; pv = cv; cv = v; ct = mk.time; if (v >= 100 && tl < 0) tl = mk.time; }\n' +
            '      sp = (pv + (cv - pv)*Math.min(1, Math.max(0, (time - ct)/0.25)))/100; } }\n' +
            '  out = JSON.stringify({ sp: sp, tl: tl, l: Math.min(A[0], B[0]), r: Math.max(A[0], B[0]), t: Math.min(A[1], B[1]), b: Math.max(A[1], B[1]),\n' +
            '    fs: TB.text.sourceText.style.fontSize, bl: TB.toComp([0, 0])[1], nl: LNS.length, lens: lens,\n' +
            '    t0: P[0], t1: P[1], pi: P[2], pn: P[3], w: SRC.width, h: SRC.height, has: TXT.replace(/\\s/g, "").length > 0 });\n' +
            '} catch (err) { out = JSON.stringify({ sp: -1, tl: -1, l: 0, r: 0, t: 0, b: 0, fs: 100, bl: 0, nl: 0, lens: [], t0: -1, t1: 1e6, pi: 0, pn: 1, w: 100, h: 100, has: false }); }\n' +
            'out;';
        return t;
    }
    function TSJ(tname) { return 'JSON.parse(String(thisComp.layer("' + tsName(tname) + '").text.sourceText.valueAtTime(Math.round(time*' + FPS + ')/' + FPS + ')))'; }

    // Each line rises out of its own baseline window. Written lines (the landing line, or every line in
    // "all" mode) are revealed by a wipe slanted like the italic. o: { tname, n, x, y, ax 0 left|1 centre,
    // ay 0 top|1 centre|2 bottom, lead, cut, write 0 none|1 landing|2 all, after, block }
    function lineLib(o) {
        return HDR +
            'var J = ' + TSJ(o.tname) + ';\n' +
            'var LFT = J.l, RGT = J.r, TOP = J.t, BOT = J.b, FS = J.fs, BL0 = J.bl, NL = J.nl, t0 = J.t0, t1 = J.t1, PI = J.pi, PN = J.pn, HAS = J.has;\n' +
            'var an = [J.w/2, J.h/2], LEAD = FS*' + o.lead + ';\n' +
            'var X = ' + (o.ax === 0 ? o.x + ' + an[0] - LFT' : o.x + ' + an[0] - (LFT + RGT)/2') + ';\n' +
            'var Y = ' + (o.ay === 0 ? o.y + ' + an[1] - TOP' : (o.ay === 1 ? o.y + ' + an[1] - (TOP + BOT)/2' : o.y + ' + an[1] - BOT')) + ';\n' +
            'function gl(k) { return BL0 + (k - 1)*LEAD + ' + o.cut + '*FS; }\n' +
            'function bnd(k) { if (k <= 0) return -6000; if (k >= NL) return gl(NL) + 0.06*FS; return gl(k); }\n' +
            'var LAND = (PI == PN - 1), WM = ' + o.write + ';\n' +
            'var TS = Math.max(t0, e0 + ' + (o.after === undefined ? 0.3 : o.after) + '*KE);\n' +
            'var STG = 0.07 + 0.05*PRES, DIN = 1.0 - 0.3*FLOW, TRV = ' + (o.block ? '0.6*LEAD' : 'LEAD*0.98') + ';\n' +
            'function dl(i) { return Math.max(0, i + PRES*(hsh(SEC*7 + i*3 + 1)*2 - 1)*0.8)*STG; }\n' +
            'function isW(i) { return (WM == 2) || (WM == 1 && LAND && i == NL - 1); }\n' +
            'function wdur(i) { var n = J.lens[i] || 0; return Math.max(0.45, Math.min(1.15, n*0.055)); }\n' +
            'function wst(i) { if (WM == 2) { var s = 0; for (var q = 0; q < i; q++) s += wdur(q)*0.8; return TS + 0.08 + s; } return TS + dl(Math.max(0, NL - 2)) + DIN*0.5; }\n' +
            'function pin(i) { return (t0 < 0) ? 0 : eo((time - TS - dl(i))/DIN); }\n' +
            'function frac(i) { var tot = 0, a = 0; for (var q = 0; q < NL; q++) { tot += (J.lens[q] || 0) + 1; if (q < i) a = tot; } return [a/tot, (a + (J.lens[i] || 0) + 1)/tot]; }\n' +
            'function pw(i) { if (t0 < 0) return 0; if (J.sp < 0) return io((time - wst(i))/wdur(i));\n' +
            '  var f = frac(i); return sm((J.sp - f[0])/Math.max(0.01, f[1] - f[0])); }\n' +
            'function SMT() { return (J.sp < 0) ? WEND() + 0.08 : ((J.tl < 0) ? 1e6 : Math.max(J.tl + 0.12, TS + 0.4)); }\n' +
            'function pout(i) { return (t1 > 1e5 || t0 < 0) ? 0 : ci((time - (t1 - 0.36) - i*0.035)/0.28); }\n' +
            'function dyR(i) { return (isW(i) ? 0 : TRV*(1 - pin(i))) - TRV*1.1*pout(i); }\n' +
            'function WEND() { return wst(NL - 1) + wdur(NL - 1); }\n';
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
                    '  createPath([[-6000, bnd(i)], [9000, bnd(i)], [9000, bnd(i + 1)], [-6000, bnd(i + 1)]], [], [], true); }';
                var mk2 = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
                mk2.maskMode = MaskMode.INTERSECT;
                mk2.property("ADBE Mask Offset").setValue(1);
                mk2.property("ADBE Mask Shape").expression = LIB + 'var i = ' + li + ';\n' +
                    'if (i >= NL) { createPath([[0, 0], [1, 0], [1, 1]], [], [], true); } else {\n' +
                    '  var y0 = bnd(i), y1 = bnd(i + 1), dy = dyR(i);\n' +
                    '  if (isW(i)) {\n' +
                    '    var ya = gl(i), yb = gl(i + 1), s = (yb - ya)*0.21, x = LFT - 90 + (RGT - LFT + 240)*pw(i);\n' +
                    '    createPath([[-6000, y0 - dy], [x + s, y0 - dy], [x + s, ya - dy], [x - s, yb - dy], [x - s, y1 - dy], [-6000, y1 - dy]], [], [], true);\n' +
                    '  } else { createPath([[-6000, y0 - dy], [9000, y0 - dy], [9000, y1 - dy], [-6000, y1 - dy]], [], [], true); } }';
                if (o.write) mk2.property("ADBE Mask Feather").expression = LIB + 'var i = ' + li + ';\n(i < NL && isW(i)) ? [46, 0] : [0, 0];';
            }
            tr(L, "ADBE Position").expression = LIB + 'var i = ' + li + ';\n' +
                'var fl = Math.sin(time*0.55 + i*0.7)*6*FLOW*FLOW;\n' +
                '[X, Y + (i < NL ? dyR(i) : 0) + fl];';
            tr(L, "ADBE Opacity").expression = LIB + 'var i = ' + li + ';\n' +
                (o.block ? '(NL < 1) ? 0 : 100*cl(pin(0)*1.6)*(1 - cl(pout(0)*1.4));' :
                'if (i >= NL) { 0; } else { var a = isW(i) ? ((pw(i) > 0) ? 100 : 0) : 100*cl(pin(i)*2.4); a*(1 - cl(pout(i)*1.4)); }');
            L.motionBlur = true;
            out.push(L);
        }
        return out;
    }
    // a drawn smile under the landing line (round caps, the logo's stroke); o: the lineStack options + { col, wfac, drop, always }
    function smileStroke(shot, parentRig, o) {
        var L = shapeLayer(shot, "smile");
        grp(L, "smile");
        var GEO = lineLib(o) +
            'var OX = X - an[0], OY = Y - an[1];\n' +   // text-comp → shot offset
            'var lastW = Math.min(RGT - LFT, (J.lens[NL - 1] || 0)*FS*0.43);\n' +
            'var sw = Math.max(0, lastW*' + (o.wfac || 0.7) + ');\n' +
            'var sx = ' + (o.ax === 0 ? 'LFT + OX + lastW*0.04' : '(LFT + RGT)/2 + OX - sw/2') + ', sy = BL0 + (NL - 1)*LEAD + OY + FS*' + (o.drop || 0.3) + ';\n';
        addPathExpr(L, "smile", GEO + 'var d = sw*0.12, h = sw*0.3;\n' +
            'createPath([[sx, sy], [sx + sw, sy]], [[0, 0], [-h, d*1.333]], [[h, d*1.333], [0, 0]], false);');
        addTrimV(L, "smile", GEO + 'var on = (NL > 0) && ' + (o.always ? 'true' : 'LAND') + ';\n' +
            'on ? 100*io((time - SMT())/0.42) : 0;');
        addStrokeV(L, "smile", GEO + 'Math.max(6, FS*0.075);', TRI + colJS(o.col) + ';');
        if (parentRig) L.parent = parentRig;
        L.motionBlur = true;
        return L;
    }

    // ------------------------------------------------------------ sheets, rigs, cups
    // a sheet of brand colour: top edge rests at y0; rises on enter (window a..b s), lifts off at exit.
    // Its edges smile in proportion to its speed (a pulled sheet: the middle lags the sides).
    function SHEETJS(y0, a, b) {
        return 'function SHY(t) { var p = eo(ENt(t, ' + a + ', ' + b + ')), q = ci(EXt(t, 0.48, 0)); return ' + y0 + ' + ' + (H + 140 - y0) + '*(1 - p) - ' + (y0 + H + 480) + '*q; }\n' +
            'function SHV(t) { return (SHY(t) - SHY(t - 1/60))*60; }\n';
    }
    function sheet(shot, name, colorIdx, y0, a, b, restDepth) {
        var L = shapeLayer(shot, name);
        grp(L, "sheet");
        addPathExpr(L, "sheet", HDR + SHEETJS(y0, a, b) +
            'var y = SHY(time), G = 0.012 + 0.022*FORM, d = Math.min(300, Math.abs(SHV(time))*G) + ' + (restDepth || 0) + '*(0.5 + FORM);\n' +
            'var Lx = -90, Rx = ' + (W + 90) + ', hx = (Rx - Lx)*0.34, k = 1.333*d, yb = y + ' + (H - y0 + 200) + ';\n' +
            'createPath([[Lx, y], [Rx, y], [Rx, yb], [Lx, yb]], [[0, 0], [-hx, k], [0, 0], [hx, k]], [[hx, k], [0, 0], [-hx, k], [0, 0]], true);');
        addFillV(L, "sheet", pal(colorIdx) + ';');
        L.motionBlur = true;
        return L;
    }
    // exit of a cream shot: a cream sheet rises over everything (the same edge as a navy sheet's trailing edge)
    function cover(shot) {
        var L = shapeLayer(shot, "cover");
        grp(L, "cover");
        addPathExpr(L, "cover", HDR +
            'function CY(t) { return ' + (H + 200) + ' - ' + (H + 480) + '*ci(EXt(t, 0.48, 0)); }\n' +
            'var y = CY(time), G = 0.012 + 0.022*FORM, d = Math.min(300, Math.abs((CY(time) - CY(time - 1/60))*60)*G);\n' +
            'var Lx = -90, Rx = ' + (W + 90) + ', hx = (Rx - Lx)*0.34, k = 1.333*d;\n' +
            'createPath([[Lx, y], [Rx, y], [Rx, ' + (H + 900) + '], [Lx, ' + (H + 900) + ']], [[0, 0], [-hx, k], [0, 0], [0, 0]], [[hx, k], [0, 0], [0, 0], [0, 0]], true);');
        addFillV(L, "cover", pal(1) + ';');
        L.motionBlur = true;
        return L;
    }
    function makeRig(shot, name) {
        var r = shot.layers.addNull(DUR); r.name = name;
        tr(r, "ADBE Anchor Point").setValue([0, 0, 0]); tr(r, "ADBE Position").setValue([0, 0]);
        return r;
    }
    var CUPJS =
        'function CUP(x, y, w, h, r) { var K = 0.5523*r;\n' +
        '  return createPath([[x, y], [x, y + h - r], [x + r, y + h], [x + w - r, y + h], [x + w, y + h - r], [x + w, y]],\n' +
        '    [[0, 0], [0, 0], [-K, 0], [0, 0], [0, K], [0, 0]], [[0, 0], [0, K], [0, 0], [K, 0], [0, 0], [0, 0]], true); }\n' +
        'function RAD(w) { return w*(0.2 + 0.32*FORM); }\n';   // FORM 0.5 → 0.36 w, the monogram's D
    // the D-cup window: matte (cup ∩ rising level) over the media layer, the drawn outline around it.
    // o: { x, y, w, h, gap, sw, col, draw:[a,b], fill:[a,b], hDyn (expr for height), rig }
    function cupWindow(shot, mediaLayer, o) {
        var HJS = 'var CX = ' + o.x + ', CYY = ' + o.y + ', CW = ' + o.w + ', CH = ' + (o.hDyn || o.h) + ';\n';
        // matte
        var M = shapeLayer(shot, o.name + "-matte");
        grp(M, "cup");
        addPathExpr(M, "cup", HDR + CUPJS + HJS + 'CUP(CX, CYY, CW, CH, RAD(CW));');
        addPathExpr(M, "cup", HDR + HJS +
            'function LV(t) { return CYY + CH + 60 - (CH + 180)*eo(ENt(t, ' + o.fill[0] + ', ' + o.fill[1] + ')); }\n' +
            'var y = LV(time), G = 0.012 + 0.022*FORM, d = Math.min(220, Math.abs((LV(time) - LV(time - 1/60))*60)*G), hx = (CW + 80)*0.34, k = 1.333*d;\n' +
            'createPath([[CX - 40, y], [CX + CW + 40, y], [CX + CW + 40, CYY + CH + 600], [CX - 40, CYY + CH + 600]], [[0, 0], [-hx, k], [0, 0], [0, 0]], [[hx, k], [0, 0], [0, 0], [0, 0]], true);');
        addMerge(M, "cup", 4);   // intersect
        addFillV(M, "cup", '[1, 1, 1, 1];');
        if (o.rig) M.parent = o.rig;
        M.motionBlur = true;
        // media: settles into the cup (counter-zoom + drop), then a slow push; cover-fits whatever the director put in
        mediaLayer.moveAfter(M);
        if (o.rig) mediaLayer.parent = o.rig;
        tr(mediaLayer, "ADBE Position").setValue([o.x + o.w / 2, o.y + o.h / 2]);
        tr(mediaLayer, "ADBE Position").expression = HDR + HJS +
            'var p = eo(ENt(time, ' + o.fill[0] + ', ' + (o.fill[1] + 0.5) + '));\n' +
            '[CX + CW/2, CYY + CH/2 + 70*(1 - p)];';
        tr(mediaLayer, "ADBE Scale").expression = HDR + HJS +
            'var S = thisLayer.source, k = 1;\n' +
            'try { var Lm = S.layer(1); if (Lm.source && Lm.source.width > 0) { var sc = Lm.transform.scale.value; var mw = Lm.source.width*Math.abs(sc[0])/100, mh = Lm.source.height*Math.abs(sc[1])/100; if (mw > 1 && mh > 1) k = Math.max(S.width/mw, S.height/mh); } } catch (err) {}\n' +
            'k = Math.max(k, CW/S.width, CH/S.height);\n' +
            'var p = eo(ENt(time, ' + o.fill[0] + ', ' + (o.fill[1] + 0.5) + '));\n' +
            'var s = 100*k*(1.14 - 0.14*p + 0.05*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';
        mediaLayer.setTrackMatte(M, TrackMatteType.ALPHA);
        mediaLayer.motionBlur = true;
        // outline
        var O = shapeLayer(shot, o.name + "-outline");
        grp(O, "outline");
        addPathExpr(O, "outline", HDR + CUPJS + HJS + 'var g = ' + o.gap + ';\nCUP(CX - g, CYY - g, CW + 2*g, CH + 2*g, RAD(CW) + g);');
        addTrimV(O, "outline", HDR + '100*io(ENt(time, ' + o.draw[0] + ', ' + o.draw[1] + '));');
        addStrokeV(O, "outline", o.sw, TRI + colJS(o.col) + ';');
        if (o.rig) O.parent = o.rig;
        O.motionBlur = true;
        return { matte: M, outline: O };
    }

    // ------------------------------------------------------------ the HCD monogram (vector rebuild of the logo)
    // geometry measured from logo-navy.png (mark bbox 216 x 325 units, stroke 17.5)
    function makeMark(comp, name, x, y, hPx, colorIdx, drawExpr, a, b) {
        var s = hPx / 325;
        function P(px, py) { return [px * s, py * s]; }
        var L = shapeLayer(comp, name);
        var col = TRI + 'C' + colorIdx + ';';
        var sw = 17.5 * s;
        function seg(w0, w1) { return HDR + 'var DRAW = ' + drawExpr + ';\nDRAW ? 100*io(ENt(time, ' + a + ' + ' + (b - a) + '*' + w0 + ', ' + a + ' + ' + (b - a) + '*' + w1 + ')) : 100;'; }
        grp(L, "H-left"); addPath(L, "H-left", [P(8.5, 12.75), P(8.5, 114.25)]); addTrimV(L, "H-left", seg(0.0, 0.42)); addStrokeV(L, "H-left", sw, col);
        grp(L, "H-right"); addPath(L, "H-right", [P(86.5, 12.75), P(86.5, 114.25)]); addTrimV(L, "H-right", seg(0.08, 0.5)); addStrokeV(L, "H-right", sw, col);
        grp(L, "H-bar"); addPath(L, "H-bar", [P(8.5, 62), P(86.5, 62)]); addTrimV(L, "H-bar", seg(0.2, 0.55)); addStrokeV(L, "H-bar", sw, col);
        var cx = 180.5, cy = 63.5, r = 52.5, hl = 4 / 3 * Math.tan(Math.PI / 12) * r;
        var cv = [], ci2 = [], co = [];
        for (var k = 0; k < 5; k++) {
            var ang = (300 - 60 * k) * Math.PI / 180;
            cv.push(P(cx + r * Math.cos(ang), cy + r * Math.sin(ang)));
            var dx = Math.sin(ang) * hl * s, dy = -Math.cos(ang) * hl * s;
            co.push(k < 4 ? [dx, dy] : [0, 0]);
            ci2.push(k > 0 ? [-dx, -dy] : [0, 0]);
        }
        grp(L, "C"); addPath(L, "C", cv, ci2, co, false); addTrimV(L, "C", seg(0.22, 0.68)); addStrokeV(L, "C", sw, col);
        var g5 = grp(L, "dot");
        var el = gv(g5).addProperty("ADBE Vector Shape - Ellipse");
        el.property("ADBE Vector Ellipse Size").setValue([21 * s, 21 * s]);
        el.property("ADBE Vector Ellipse Position").setValue(P(180, 63.5));
        addFillV(L, "dot", col);
        g5 = gget(L, "dot");
        var g5t = g5.property("ADBE Vector Transform Group");
        g5t.property("ADBE Vector Anchor").setValue(P(180, 63.5));
        g5t.property("ADBE Vector Position").setValue(P(180, 63.5));
        g5t.property("ADBE Vector Scale").expression = HDR + 'var DRAW = ' + drawExpr + ';\nvar p = DRAW ? qo(ENt(time, ' + a + ' + ' + (b - a) + '*0.6, ' + a + ' + ' + (b - a) + '*0.85)) : 1; [100*p, 100*p];';
        // D cup: down the left side, round the smile, up the right, top bar last
        var K = 0.5523 * 72 * s;
        grp(L, "D");
        addPath(L, "D", [P(8.5, 154.5), P(8.5, 241.5), P(80.5, 313.5), P(135, 313.5), P(207, 241.5), P(207, 154.5)],
            [[0, 0], [0, 0], [-K, 0], [0, 0], [0, K], [0, 0]], [[0, 0], [0, K], [0, 0], [K, 0], [0, 0], [0, 0]], true);
        addTrimV(L, "D", seg(0.32, 1.0)); addStrokeV(L, "D", sw, col);
        tr(L, "ADBE Position").setValue([x, y]);
        return L;
    }
    function makeWordmark(comp, x, yMid, hPx, colorIdx, drawExpr, a, b) {
        var fs = Math.round(hPx * 0.185 / 0.72), lead = Math.round(hPx * 0.32);
        var t = makeText(comp, "HIALEAH CITY\rDENTAL", F_LABEL, fs, ParagraphJustification.LEFT_JUSTIFY, 70, lead);
        t.name = "wordmark";
        var capH = fs * 0.72;
        tr(t, "ADBE Position").setValue([x, yMid - lead / 2 + capH / 2]);
        fillFx(t, TRI + 'C' + colorIdx + ';');
        tr(t, "ADBE Opacity").expression = HDR + 'var DRAW = ' + drawExpr + ';\nDRAW ? 100*sm(ENt(time, ' + a + ', ' + b + ')) : 100;';
        return t;
    }
    // lockup: mark + wordmark; returns [mark, wordmark, totalWidth]
    function lockup(comp, x, y, hPx, colorIdx, drawExpr, a, b) {
        var m = makeMark(comp, "hcd-mark", x, y, hPx, colorIdx, drawExpr, a, b);
        var wm = makeWordmark(comp, x + 216 * hPx / 325 + hPx * 0.34, y + hPx / 2, hPx, colorIdx, drawExpr, a + (b - a) * 0.5, b + 0.2);
        var r = wm.sourceRectAtTime(0, false);
        return [m, wm, 216 * hPx / 325 + hPx * 0.34 + r.width];
    }

    // ------------------------------------------------------------ media comps
    var photoIdx = 0;
    function makeFrameComp(name, w, h) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var ph = c.layers.addSolid([0.62, 0.6, 0.58], "placeholder (replace with media)", w, h, 1, DUR);
        ph.guideLayer = true;   // never renders: letterbox bars from "fit" stay transparent
        if (SIM && PHOTOS.length) {
            var it = app.project.importFile(new ImportOptions(new File(PHOTOS[photoIdx % PHOTOS.length]))); photoIdx++;
            it.parentFolder = preFolder;
            var L = c.layers.add(it); var sc = Math.min(w / it.width, h / it.height) * 100; tr(L, "ADBE Scale").setValue([sc, sc]);   // "fit", like the director
        }
        return c;
    }
    // the clinic's portraits, one per section (time-remapped by section index)
    var portraitComp = null;
    function portraits(w, h) {
        if (portraitComp) return portraitComp;
        var n = Math.max(1, PORTRAITS.length);
        portraitComp = app.project.items.addComp("portraits", w, h, 1, DUR, FPS); portraitComp.parentFolder = preFolder;
        for (var i = 0; i < PORTRAITS.length; i++) {
            var it = app.project.importFile(new ImportOptions(new File(PORTRAITS[i]))); it.parentFolder = footFolder;
            var L = portraitComp.layers.add(it);
            var sc = Math.max(w / it.width, h / it.height) * 100; tr(L, "ADBE Scale").setValue([sc, sc]);
            L.startTime = i / FPS; L.inPoint = i / FPS; L.outPoint = (i + 1) / FPS;
        }
        return portraitComp;
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
    addSlider(mcL, "FORM", 50); addSlider(mcL, "FLOW", 50); addSlider(mcL, "PRESSURE", 30);
    addColorCtl(mcL, "1", CREAM); addColorCtl(mcL, "2", NAVY); addColorCtl(mcL, "3", PEACH);
    log.push("mainComp + mainControl");

    function newShot(name) {
        var c = app.project.items.addComp(name, W, H, 1, DUR, FPS); c.parentFolder = shotsFolder; c.motionBlur = true;
        c.shutterAngle = 200; c.shutterPhase = -100;
        makeController(c);
        var g = c.layers.addSolid([1, 1, 1], "ground", W, H, 1, DUR); fillFx(g, pal(1)); g.moveToEnd();
        return c;
    }
    function finish(shot) { shot.layer("controller").moveToBeginning(); }
    var PH = [[0.3, 0.32, 4], [3.4, 0.3, 4], [6.5, 0.3, 4]];
    function sim(tcomp, texts, ph) { if (!SIM) return; var P = ph || PH; markers(tcomp, P); simTexts(tcomp.layer("textBlock"), P, texts); }
    var CUT = 0.27;   // Newsreader at leading ~1.04: descender 0.239 em, next ascender 0.305 em

    // supergraphic: the monogram's D drawn huge in a tone of the field, cropped by the frame; draws on, drifts up
    function superD(shot, rig, x, y, w, sw, colExpr) {
        var L = shapeLayer(shot, "supergraphic D"); grp(L, "D");
        addPathExpr(L, "D", HDR + CUPJS + 'CUP(' + x + ', ' + y + ', ' + w + ', ' + Math.round(w * 0.8) + ', 0.363*' + w + ');');
        addTrimV(L, "D", HDR + '100*io(ENt(time, 0.3, 1.7));');
        addStrokeV(L, "D", sw, TRI + FN + colExpr + ';');
        if (rig) L.parent = rig;
        tr(L, "ADBE Position").expression = HDR + '[0, -60*cl((time - e0)/Math.max(1, x1 - e0))*(0.4 + FLOW)];';
        return L;
    }
    function cp(o, extra) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in extra) r[k] = extra[k]; return r; }
    function hasJS(tname) { return 'var HAS = ' + TSJ(tname) + '.has;\n'; }

    // ============================================================ 01 TITLE — navy sheet, monumental cream serif, the peach italic landing
    var o01 = { maxL: 4, cw: 0.46, lead: 1.02, ink: "C1", land: "C3" };
    var t01 = makeTextComp("01-text", 912, 820, "Transforming smiles with innovation and care.", F_SERIF, 172, ParagraphJustification.LEFT_JUSTIFY, o01);
    sim(t01, ["Transforming smiles with innovation and care.", "Feel amazing about your oral health.", "We\u2019re here for you."]);
    var s01 = newShot("01");
    var r01 = makeRig(s01, "rig");
    sheet(s01, "navy", 2, 0, 0, 0.75, 0);
    // supergraphic: the monogram's D, drawn huge in a tone of the navy, cropped by the frame
    superD(s01, r01, 372, 96, 1500, 118, 'mx(C2, C1, 0.075)');
    var lk01 = lockup(s01, 84, 124, 96, 1, 'SEC == 0', 0.5, 1.5);
    lk01[0].parent = r01; lk01[1].parent = r01;
    var L01 = { n: 4, x: 84, y: 1410, ax: 0, ay: 2, lead: 1.02, cut: CUT, write: 1 };
    lineStack(s01, t01, r01, L01);
    smileStroke(s01, r01, cp(L01, { col: "C3", wfac: 0.78 }));
    tr(r01, "ADBE Position").expression = HDR + SHEETJS(0, 0, 0.75) + '[0, SHY(time)];';
    finish(s01);
    log.push("01 title");

    // ============================================================ 02 STATEMENT — cream; a clinic portrait in a large cup top-right, big navy type below
    var o02 = { maxL: 4, cw: 0.46, lead: 1.02, ink: "C2", land: "BRZ" };
    var t02 = makeTextComp("02-text", 912, 560, "Feel amazing about your oral health.", F_SERIF, 150, ParagraphJustification.LEFT_JUSTIFY, o02);
    sim(t02, ["Feel amazing about your oral health.", "Gentle care for every family.", "Your smile starts here."]);
    var s02 = newShot("02");
    var r02 = makeRig(s02, "rig");
    var pc = portraits(656, 804);
    var pl = s02.layers.add(pc); pl.name = "portrait";
    pl.timeRemapEnabled = true;
    pl.property("ADBE Time Remapping").expression = HDR + 'var N = ' + Math.max(1, PORTRAITS.length) + ';\n(((SEC % N) + N) % N)/' + FPS + ' + 0.5/' + FPS + ';';
    cupWindow(s02, pl, { name: "cup", x: 340, y: 170, w: 656, h: 804, gap: 22, sw: 11, col: "C3", draw: [0.0, 0.85], fill: [0.05, 0.8], rig: r02 });
    var L02 = { n: 4, x: 84, y: 1062, ax: 0, ay: 0, lead: 1.02, cut: CUT, write: 1, after: 0.3 };
    lineStack(s02, t02, r02, L02);
    cover(s02);
    tr(r02, "ADBE Position").expression = HDR + '[0, -260*ci(EXt(time, 0.48, 0))];';
    finish(s02);
    log.push("02 statement");

    // ============================================================ 03 CUP — words on top, the story's media in the logo's D (its exact proportions) below
    var o03 = { maxL: 3, cw: 0.45, lead: 1.1, ink: "C2", karaoke: true, bg: "C1", mute: 0.6 };
    var t03 = makeTextComp("03-text", 912, 400, "Gentle, expert care for every smile.", F_SERIF, 104, ParagraphJustification.LEFT_JUSTIFY, o03);
    sim(t03, ["Gentle, expert care for every smile.", "Digital impressions, no goop.", "Results that look like you."]);
    var f03 = makeFrameComp("03-frame", 960, 768);
    var s03 = newShot("03");
    var r03 = makeRig(s03, "rig");
    var cr03 = makeRig(s03, "cup-rig"); cr03.parent = r03;
    var fl03 = s03.layers.add(f03); fl03.name = "03-frame"; fl03.audioEnabled = false;
    cupWindow(s03, fl03, { name: "cup", x: 60, y: 760, w: 960, h: 768, gap: 24, sw: 12, col: "C3", draw: [0.0, 0.85], fill: [0.0, 0.75], rig: cr03 });
    var L03 = { n: 3, x: 84, y: 680, ax: 0, ay: 2, lead: 1.1, cut: 0.3, write: 0, after: 0.25 };
    lineStack(s03, t03, r03, L03);
    cover(s03);
    tr(cr03, "ADBE Position").expression = HDR + hasJS("03-text") + '[0, HAS ? 0 : -184];';
    tr(r03, "ADBE Position").expression = HDR + '[0, -260*ci(EXt(time, 0.48, 0))];';
    finish(s03);
    log.push("03 cup");

    // ============================================================ 04 PORTRAIT — full-bleed media; a navy band rises and rests with a smile-curved edge
    var o04 = { maxL: 3, cw: 0.46, lead: 1.04, ink: "C1", land: "C3" };
    var t04 = makeTextComp("04-text", 912, 330, "Same-day emergency visits.", F_SERIF, 112, ParagraphJustification.LEFT_JUSTIFY, o04);
    sim(t04, ["Same-day emergency visits.", "Chipped tooth? Toothache?", "We\u2019ll see you today."]);
    var f04 = makeFrameComp("04-frame", 1080, 1920);
    var s04 = newShot("04");
    var r04 = makeRig(s04, "rig");
    // media sheet (matte) — the photo rides up behind its own rising edge with parallax
    var m04 = shapeLayer(s04, "media-matte"); grp(m04, "sheet");
    addPathExpr(m04, "sheet", HDR + SHEETJS(0, 0, 0.8) +
        'var y = SHY(time), G = 0.012 + 0.022*FORM, d = Math.min(300, Math.abs(SHV(time))*G);\n' +
        'var Lx = -90, Rx = ' + (W + 90) + ', hx = (Rx - Lx)*0.34, k = 1.333*d, yb = y + ' + (H + 200) + ';\n' +
        'createPath([[Lx, y], [Rx, y], [Rx, yb], [Lx, yb]], [[0, 0], [-hx, k], [0, 0], [hx, k]], [[hx, k], [0, 0], [-hx, k], [0, 0]], true);');
    addFillV(m04, "sheet", '[1, 1, 1, 1];'); m04.motionBlur = true;
    var fl04 = s04.layers.add(f04); fl04.name = "04-frame"; fl04.audioEnabled = false;
    fl04.moveAfter(m04);
    tr(fl04, "ADBE Position").expression = HDR +
        'var p = eo(ENt(time, 0, 0.8)), q = ci(EXt(time, 0.48, 0));\n' +
        '[540, 960 + 0.32*' + (H + 140) + '*(1 - p) - ' + (H + 480) + '*q];';
    tr(fl04, "ADBE Scale").expression = HDR +
        'var S = thisLayer.source, k = 1;\n' +
        'try { var Lm = S.layer(1); if (Lm.source && Lm.source.width > 0) { var sc = Lm.transform.scale.value; var mw = Lm.source.width*Math.abs(sc[0])/100, mh = Lm.source.height*Math.abs(sc[1])/100; if (mw > 1 && mh > 1) k = Math.max(S.width/mw, S.height/mh); } } catch (err) {}\n' +
        'var p = eo(ENt(time, 0, 1.4));\n' +
        'var s = 100*k*(1.12 - 0.09*p + 0.05*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';
    fl04.setTrackMatte(m04, TrackMatteType.ALPHA); fl04.motionBlur = true;
    var L04 = { n: 3, x: 84, y: 1236, ax: 0, ay: 0, lead: 1.04, cut: CUT, write: 1, after: 0.5 };
    lineStack(s04, t04, r04, L04);
    smileStroke(s04, r04, cp(L04, { col: "C3", wfac: 0.78 }));
    // the band: rests at Y0 with a permanent smile; lower and empty when there are no words
    var band = shapeLayer(s04, "band"); grp(band, "sheet");
    addPathExpr(band, "sheet", HDR + hasJS("04-text") +
        'var Y0 = HAS ? 1080 : 1690;\n' +
        'function SHY(t) { var p = eo(ENt(t, 0.12, 0.9)), q = ci(EXt(t, 0.48, 0)); return Y0 + (' + (H + 140) + ' - Y0)*(1 - p) - (Y0 + ' + (H + 480) + ')*q; }\n' +
        'var y = SHY(time), G = 0.012 + 0.022*FORM, d = Math.min(300, Math.abs((SHY(time) - SHY(time - 1/60))*60)*G) + 62*(0.5 + FORM);\n' +
        'var Lx = -90, Rx = ' + (W + 90) + ', hx = (Rx - Lx)*0.34, k = 1.333*d, yb = y + (' + (H + 200) + ' - Y0);\n' +
        'createPath([[Lx, y], [Rx, y], [Rx, yb], [Lx, yb]], [[0, 0], [-hx, k], [0, 0], [hx, k]], [[hx, k], [0, 0], [-hx, k], [0, 0]], true);');
    addFillV(band, "sheet", pal(2) + ';'); band.motionBlur = true;
    band.moveAfter(s04.layer("typeset 04-text"));
    tr(r04, "ADBE Position").expression = HDR + hasJS("04-text") +
        'var Y0 = HAS ? 1080 : 1690;\n' +
        'var p = eo(ENt(time, 0.12, 0.9)), q = ci(EXt(time, 0.48, 0));\n' +
        '[0, (' + (H + 140) + ' - Y0)*(1 - p) - (Y0 + ' + (H + 480) + ')*q];';
    finish(s04);
    log.push("04 portrait");

    // ============================================================ 05 MEDIA — navy sheet; the story's media in a tall cup (media only)
    var o05 = { maxL: 2, cw: 0.45, lead: 1.12, ink: "C1", karaoke: true, bg: "C2", mute: 0.55 };
    var t05 = makeTextComp("05-text", 940, 240, "", F_SERIF, 72, ParagraphJustification.CENTER_JUSTIFY, o05);
    var f05 = makeFrameComp("05-frame", 900, 1240);
    var s05 = newShot("05");
    var r05 = makeRig(s05, "rig");
    sheet(s05, "navy", 2, 0, 0, 0.75, 0);
    var lk05 = lockup(s05, 90, 116, 72, 1, 'false', 0, 1);
    lk05[0].parent = r05; lk05[1].parent = r05;
    var L05 = { n: 2, x: 540, y: 1400, ax: 1, ay: 1, lead: 1.12, cut: 0.3, write: 0, after: 0.5 };
    lineStack(s05, t05, r05, L05);
    var fl05 = s05.layers.add(f05); fl05.name = "05-frame"; fl05.audioEnabled = false;
    cupWindow(s05, fl05, { name: "cup", x: 90, y: 262, w: 900, h: 1240, hDyn: '(function () { ' + hasJS("05-text") + ' return HAS ? 1000 : 1240; })()', gap: 24, sw: 12, col: "C3", draw: [0.1, 0.95], fill: [0.15, 0.9], rig: r05 });
    tr(r05, "ADBE Position").expression = HDR + SHEETJS(0, 0, 0.75) + '[0, SHY(time)];';
    finish(s05);
    log.push("05 media");

    // ============================================================ 06 LETTER — long copy, large; words ink as they are spoken
    var o06 = { maxL: 8, cw: 0.44, lead: 1.12, ink: "C2", karaoke: true, bg: "C1", mute: 0.64, greedy: true };
    var t06 = makeTextComp("06-text", 880, 1080, "Same-day emergency visits, digital impressions and an in-house lab, so your new smile is ready sooner.", F_SERIF, 112, ParagraphJustification.LEFT_JUSTIFY, o06);
    sim(t06, ["Same-day emergency visits, digital impressions and an in-house lab, so your new smile is ready sooner.", "We accept most major insurance plans, and our team speaks English and Spanish.", "1544 W 37th St, Hialeah. Monday to Friday, 9:30 to 5."], [[0.3, 0.26, 17], [5.0, 0.24, 13], [8.0, 0.2, 9]]);
    var s06 = newShot("06");
    var r06 = makeRig(s06, "rig");
    var L06 = { n: 1, x: 100, y: 800, ax: 0, ay: 1, lead: 1.12, cut: 0.3, write: 0, block: true };
    superD(s06, r06, 600, 1290, 760, 64, 'mx(C1, C3, 0.6)');
    lineStack(s06, t06, r06, L06);
    cover(s06);
    tr(r06, "ADBE Position").expression = HDR + '[0, -260*ci(EXt(time, 0.48, 0))];';
    finish(s06);
    log.push("06 letter");

    // ============================================================ 07 LANDING — peach sheet; the italic voice written in navy; a drawn smile; the lockup
    var o07 = { maxL: 3, cw: 0.42, lead: 1.0, ink: "C2", allItal: true };
    var t07 = makeTextComp("07-text", 960, 700, "We\u2019re here for you.", F_ITAL, 236, ParagraphJustification.CENTER_JUSTIFY, o07);
    sim(t07, ["We\u2019re here for you.", "Book your visit.", "Hasta pronto."]);
    var s07 = newShot("07");
    var r07 = makeRig(s07, "rig");
    sheet(s07, "peach", 3, 0, 0, 0.75, 0);
    superD(s07, r07, -280, 1250, 760, 64, 'mx(C3, C2, 0.08)');
    var lk07 = lockup(s07, 0, 300, 96, 2, 'true', 0.45, 1.45);
    var dx07 = 540 - lk07[2] / 2;
    for (var q7 = 0; q7 < 2; q7++) { var pv7 = tr(lk07[q7], "ADBE Position").value; tr(lk07[q7], "ADBE Position").setValue([pv7[0] + dx07, pv7[1]]); }
    lk07[0].parent = r07; lk07[1].parent = r07;
    var L07 = { n: 3, x: 540, y: 960, ax: 1, ay: 1, lead: 1.0, cut: 0.25, write: 2, after: 0.35 };
    lineStack(s07, t07, r07, L07);
    smileStroke(s07, r07, cp(L07, { col: "C2", wfac: 0.55, always: true, drop: 0.42 }));
    tr(r07, "ADBE Position").expression = HDR + SHEETJS(0, 0, 0.75) + '[0, SHY(time)];';
    finish(s07);
    log.push("07 landing (lockup width " + Math.round(lk07[2]) + ")");

    mcL.moveToBeginning();
    return log.join("\n");
}
