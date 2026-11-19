// SE ACABÓ LA FIESTA — "Cinta" (v2) — CucoStudio style builder (AE, ES3)
// From the brand's posters and reels: heavy italic caps printed on strips of tape, photos taped up as prints.
//  - pull: each line is a torn strip sized to its words, pulled in from alternating sides, landing with a slap
//  - rip: at a phrase's end its strips are ripped off, out the far side
//  - print: media drop in as prints in a paper border, tape slapped on the corners; full-bleed photos punch in
//  - hard cuts: nothing leaves at the section end
// No content: no numbers, dates, names or people. Footage: the squirrel mark only.
// Usage: $.evalFile(this); SALF2_BUILD({ sim: bool, photos: [abs], foot: abs footage folder })

function SALF2_BUILD(opts) {
    var SIM = !!opts.sim, PHOTOS = opts.photos || [], FOOT = opts.foot;
    var log = [];
    var W = 1080, H = 1920, FPS = 30, DUR = 10, K = 9, LEADF = 1.26;
    function hx(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1]; }
    var NIGHT = hx("#0C1714"), PAPER = hx("#FDFAF3"), TAN = hx("#D7BD96");
    var F_CAPS = "Montserrat-ExtraBoldItalic";

    // ------------------------------------------------------------ expression library (infrastructure)
    var TRI =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n';
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function eo(p) { p = cl(p); return 1 - Math.pow(1 - p, 5); }\n' +
        'function ex(p) { p = cl(p); return p >= 1 ? 1 : 1 - Math.pow(2, -10*p); }\n' +
        'function ci(p) { p = cl(p); return p*p*p; }\n' +
        'function sm(p) { p = cl(p); return p*p*(3 - 2*p); }\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n';
    var CTL =
        'var CT = thisComp.layer("controller"), ENS = CT.effect("enter")("Slider"), EXS = CT.effect("exit")("Slider");\n' +
        'var e0 = 0, e1 = 1.2, x0 = thisComp.duration - 1.2, x1 = thisComp.duration;\n' +
        'if (ENS.numKeys >= 2) { e0 = ENS.key(1).time; e1 = ENS.key(ENS.numKeys).time; }\n' +
        'if (EXS.numKeys >= 2) { x0 = EXS.key(1).time; x1 = EXS.key(EXS.numKeys).time; }\n' +
        'var TEMPO = 1.25 - 0.5*FLOW;\n' +
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
        d.applyFill = true; d.fillColor = rgb || [NIGHT[0], NIGHT[1], NIGHT[2]]; d.applyStroke = false;
        d.justification = just;
        d.tracking = tracking;
        if (leading) { d.autoLeading = false; d.leading = leading; }
        try { d.allCaps = true; } catch (e3) {}
        try { d.fauxBold = false; d.fauxItalic = false; } catch (e4) {}
        p.setValue(d);
        return t;
    }
    function makeController(comp) {
        var c = comp.layers.addNull(DUR); c.name = "controller";
        var en = addSlider(c, "enter", 0).property(1); en.setValueAtTime(0, 0); en.setValueAtTime(1.0, 100);
        var ex = addSlider(c, "exit", 0).property(1); ex.setValueAtTime(DUR - 0.6, 0); ex.setValueAtTime(DUR, 100);
        return c;
    }
    function parentJ(child, parent) {
        if (child.setParentWithJump) child.setParentWithJump(parent); else child.parent = parent;
        tr(child, "ADBE Rotate Z").setValue(0);
        if (!tr(child, "ADBE Scale").expressionEnabled) tr(child, "ADBE Scale").setValue([100, 100]);
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
    function simTexts(tb, phrases, texts) {   // director emulation: width-only fit, MIN size, centred with HOLD keys
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
        var r1 = tb.sourceRectAtTime(phrases[0][0] + 1 / FPS, false), chars = String(p.valueAtTime(phrases[0][0] + 1 / FPS, false).text).replace(/[\r\n]/g, "").length;
        log.push("  sim fit " + comp.name + ": " + Math.round(minS) + " px, block " + Math.round(r1.width) + "x" + Math.round(r1.height) + " in " + comp.width + "x" + comp.height);
    }

    // ------------------------------------------------------------ type: reflow (size-independent breaks), caps
    function styleExpr(o) {
        return TRI + FN +
            'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "");\n' +
            'var res = s, fs = style.fontSize, zw = thisComp.width, zh = thisComp.height;\n' +
            'if (s.length > 0) {\n' +
            '  var w = s.split(/\\s+/), u = [];\n' +
            (o.noJoin ? '  for (var i = 0; i < w.length; i++) u.push(w[i]);\n' :
            '  var pend = ""; for (var i = 0; i < w.length; i++) { if (w[i].length <= 2 && i < w.length - 1) { pend += w[i] + " "; } else { u.push(pend + w[i]); pend = ""; } }\n') +
            '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
            '  function bal(nl) { if (nl == 1) return [u.join(" ")]; var bv = 1e9, best = null;\n' +
            '    function rc(start, left, cs) { if (left == 1) { var mxl = L(start, u.length), pv = 0; for (var q = 0; q < cs.length; q++) { mxl = Math.max(mxl, L(pv, cs[q])); pv = cs[q]; } if (mxl < bv) { bv = mxl; best = cs.slice(0); } return; }\n' +
            '      for (var b = start + 1; b <= u.length - left + 1; b++) { cs.push(b); rc(b, left - 1, cs); cs.pop(); } }\n' +
            '    rc(0, nl, []); var out = [], pv = 0; for (var q = 0; q < best.length; q++) { out.push(u.slice(pv, best[q]).join(" ")); pv = best[q]; } out.push(u.slice(pv).join(" ")); return out; }\n' +
            '  var bestL = null, bs = -1;\n' +
            (o.greedy ?
            '  var mxc = Math.max(6, Math.floor(zw/(fs*' + o.cw + '))), n = u.length;\n' +
            '  for (var tries = 0; tries < 40; tries++) { var cost = [], nxt = []; cost[n] = 0;\n' +
            '    for (var i = n - 1; i >= 0; i--) { cost[i] = 1e18; var len = -1;\n' +
            '      for (var j = i + 1; j <= n; j++) { len += u[j - 1].length + 1; if (len > mxc && j > i + 1) break;\n' +
            '        var c = (j == n ? 0 : Math.pow(mxc - len, 2)) + mxc*mxc*0.6; if (c + cost[j] < cost[i]) { cost[i] = c + cost[j]; nxt[i] = j; } } }\n' +
            '    bestL = []; var ii = 0; while (ii < n) { bestL.push(u.slice(ii, nxt[ii]).join(" ")); ii = nxt[ii]; }\n' +
            '    if (bestL.length <= ' + o.maxL + ') break; mxc += 1; }\n' :
            '  for (var nl = 1; nl <= Math.min(' + o.maxL + ', u.length); nl++) {\n' +
            '    var ls = bal(nl), mc = 0, mn = 1e9; for (var j = 0; j < ls.length; j++) { mc = Math.max(mc, ls[j].length); mn = Math.min(mn, ls[j].length); }\n' +
            '    var sc = Math.min(zw/(mc*' + o.cw + '), zh/(nl*' + LEADF + ' + 0.2))*Math.pow(mn/mc, 0.35);\n' +
            '    if (sc > bs + 0.5) { bs = sc; bestL = ls; }\n' +
            '  }\n') +
            '  res = bestL.join("\\r");\n' +
            '}\n' +
            'var INK = ' + o.ink + ';\n' +
            'style.setText(res).setAllCaps(true).setAutoLeading(false).setLeading(fs*' + LEADF + ').setFont("' + F_CAPS + '").setFillColor([INK[0], INK[1], INK[2]]);';
    }
    var TXI = {};
    function makeTextComp(name, w, h, sample, size, just, o) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var tb = makeText(c, sample, F_CAPS, size, just, o.track, size * LEADF); tb.name = "textBlock";
        var r = tb.sourceRectAtTime(0, false);
        tr(tb, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr(tb, "ADBE Position").setValue([w / 2, h / 2]);
        textDoc(tb).expression = styleExpr(o);
        TXI[name] = { ink: o.ink.replace(/^C/, ""), track: o.track };
        return c;
    }

    // ------------------------------------------------------------ the typeset layer: measured once per frame, per line
    function tsName(tname) { return "typeset " + tname; }
    function rfName(tname) { return "reflow " + tname; }
    var FT = 'Math.round(time*' + FPS + ')/' + FPS;
    function makeReflow(shot, tname) {
        // the block's reflow, read ONCE per frame. Lines reading the block themselves (getStyleAt) re-ran it per line: 03 cost 570 → 29 ms/frame
        var t = shot.layers.addText("{}"); t.name = rfName(tname);
        t.guideLayer = true; tr(t, "ADBE Opacity").setValue(0);
        textDoc(t).expression =
            'var out;\n' +
            'try { var ST = thisComp.layer("' + tname + '").source.layer("textBlock").text.sourceText, ft = ' + FT + ';\n' +
            '  var TXT = String(ST.valueAtTime(ft)), fs = 100; try { fs = ST.getStyleAt(0, ft).fontSize; } catch (e2) {}\n' +
            '  out = JSON.stringify({ fs: fs, L: TXT.replace(/\\s/g, "").length ? TXT.split("\\r") : [] });\n' +
            '} catch (err) { out = JSON.stringify({ fs: 100, L: [] }); }\n' +
            'out;';
    }
    function LINEJS(tname, i, ink, trk) {   // one line of the block, at the block's (director-fitted) size; the layer measures itself
        return 'try { var R = JSON.parse(String(thisComp.layer("' + rfName(tname) + '").text.sourceText.valueAtTime(' + FT + ')));\n' +
            'var C = comp("mainComp").layer("mainControl").effect("' + ink + '")("Color").value;\n' +
            'style.setText(R.L[' + i + '] || " ").setFontSize(R.fs).setFont("' + F_CAPS + '").setAllCaps(true).setTracking(' + trk + ')' +
            '.setAutoLeading(false).setLeading(R.fs*' + LEADF + ').setFillColor([C[0], C[1], C[2]]); } catch (err) { " "; }';
    }
    function makeTypeset(shot, tname, n) {
        // per-line rects from the line layers themselves: strips sized to their words
        var t = shot.layers.addText("{}"); t.name = tsName(tname);
        t.guideLayer = true; tr(t, "ADBE Opacity").setValue(0);
        textDoc(t).expression = PHR +
            'var out = "";\n' +
            'try {\n' +
            '  var SRC = thisComp.layer("' + tname + '").source, TB = SRC.layer("textBlock");\n' +
            '  var R = JSON.parse(String(thisComp.layer("' + rfName(tname) + '").text.sourceText.value)), LNS = R.L, fs = R.fs, ld = fs*' + LEADF + ', ln = [];\n' +
            '  for (var i = 0; i < LNS.length && i < ' + n + '; i++) { var M = thisComp.layer("line " + i), r = M.sourceRectAtTime(time, false);\n' +
            '    var a = TB.toComp([r.left, i*ld]), b = TB.toComp([r.left + r.width, i*ld]);\n' +
            '    ln.push([Math.min(a[0], b[0]), Math.max(a[0], b[0]), a[1], r.left, r.width]); }\n' +
            '  var P = phr(SRC);\n' +
            '  out = JSON.stringify({ fs: fs, nl: ln.length, ln: ln, t0: P[0], t1: P[1], pi: P[2], pn: P[3], w: SRC.width, h: SRC.height, has: LNS.length > 0 });\n' +
            '} catch (err) { out = JSON.stringify({ fs: 100, nl: 0, ln: [], t0: -1, t1: 1e6, pi: 0, pn: 1, w: 100, h: 100, has: false }); }\n' +
            'out;';
        return t;
    }
    function TSJ(tname) { return 'JSON.parse(String(thisComp.layer("' + tsName(tname) + '").text.sourceText.valueAtTime(Math.round(time*' + FPS + ')/' + FPS + ')))'; }
    function hasJS(tname) { return 'var HAS = ' + TSJ(tname) + '.has;\n'; }

    // ------------------------------------------------------------ THE STRIP: a line of caps on torn tape
    // o: { tname, n, x, y (zone centre in the shot), angMul, side0, stripCol ('ALT' | expr), after, shift }
    var MOT =   // the moving header: trinity + enter timing only (no colours, no exit keys)
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        FN +
        'var ENS = thisComp.layer("controller").effect("enter")("Slider"), e0 = (ENS.numKeys >= 2) ? ENS.key(1).time : 0;\n' +
        'var TEMPO = 1.25 - 0.5*FLOW;\n' +
        'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)$/); if (m) SEC = parseInt(m[1], 10); })();\n';
    function stripLib(o) {
        return MOT +
            'var J = ' + TSJ(o.tname) + ';\n' +
            'var FS = J.fs, NL = J.nl, t0 = J.t0, t1 = J.t1, OX = ' + o.x + ' - J.w/2, OY = ' + o.y + ' - J.h/2;\n' +
            'var CAP = 0.70*FS, PV = 0.2*FS, PH = 0.34*FS;\n' +
            'var TS = Math.max(t0, e0 + ' + (o.after || 0) + '*TEMPO), DURP = 0.36*TEMPO, STG = (0.085 + 0.05*PRES)*TEMPO;\n' +
            'var PAT = [-1, 0.7, -0.45, 1, -0.8, 0.55];\n' +
            'var PI = Math.max(0, J.pi), SHF = ' + (o.shift ? '[0, -0.35, 0.3, -0.15][(PI + SEC) % 4]*FS*(0.4 + FORM)' : '0') + ';\n' +
            'function ang(i) { return (1 + 7*FORM)*' + (o.angMul || 1) + '*PAT[(i + SEC + PI*3) % 6] + PRES*4*(hsh(SEC*13 + PI*29 + i*7 + 3) - 0.5); }\n' +
            'function side(i) { return ((i + SEC + PI + ' + (o.side0 || 0) + ') % 2 == 0) ? -1 : 1; }\n' +
            'function L(i) { return J.ln[i] || [0, 0, 0, 0, 0]; }\n' +
            'function CX(i) { return (L(i)[0] + L(i)[1])/2; } function CY(i) { return L(i)[2] - CAP/2; }\n' +
            'function tin(i) { return TS + i*STG; }\n' +
            'function pin(i) { return (t0 < 0) ? 0 : eo((time - tin(i))/DURP); }\n' +
            'function rip(i) { return (t1 > 1e5 || t0 < 0) ? 0 : ci((time - (t1 - 0.3*TEMPO) - (NL - 1 - i)*0.04)/(0.24*TEMPO)); }\n' +
            'function ta(i) { return time - (tin(i) + DURP*0.5); }\n' +
            'function slapR(i) { var a = ta(i); return (a < 0) ? 1 : Math.exp(-7*a)*Math.cos(19*a); }\n' +
            'function slapS(i) { var a = ta(i); return (a < 0) ? 0 : Math.exp(-11*a)*Math.sin(15*a); }\n' +
            'function jx(i) { return PRES*0.5*FS*(hsh(SEC*5 + i*11 + 1) - 0.5)*2; } function jy(i) { return PRES*0.16*FS*(hsh(SEC*3 + i*17 + 2) - 0.5)*2; }\n';
    }
    function stripStack(shot, tcomp, o) {
        o.tname = tcomp.name;
        // the director's slot: it fills and fits the text comp; the lines below draw it, one text layer per line
        var slot = shot.layers.add(tcomp); slot.name = tcomp.name; tr(slot, "ADBE Opacity").setValue(0);
        makeReflow(shot, tcomp.name);
        makeTypeset(shot, tcomp.name, o.n);
        // full header only where it moves (position, rotation, scale); the frame-level rest reads the typeset alone.
        // Each expression's header (cross-comp trinity/colour reads, controller keys) is the cost, not its maths
        var LIB = stripLib(o), lines = [];
        var LITE = 'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n' +
            'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)$/); if (m) SEC = parseInt(m[1], 10); })();\n' +
            'var J = ' + TSJ(o.tname) + ', FS = J.fs, NL = J.nl, t0 = J.t0, CAP = 0.70*FS, PV = 0.2*FS, PH = 0.34*FS, PI = Math.max(0, J.pi);\n' +
            'function L(i) { return J.ln[i] || [0, 0, 0, 0, 0]; }\n';
        for (var li = 0; li < o.n; li++) {
            var I = 'var i = ' + li + ';\n';
            var S = shapeLayer(shot, "strip " + li); grp(S, "tape");
            addPathExpr(S, "tape", LITE + I +   // in the line layer's own space: origin on its baseline
                'if (i >= NL) { createPath([[0, 0], [1, 0], [1, 1]], [], [], true); } else {\n' +
                '  var x0 = L(i)[3] - PH, x1 = L(i)[3] + L(i)[4] + PH, y0 = -CAP - PV, y1 = PV, n = 7, A = 0.07*FS, v = [];\n' +
                '  v.push([x0, y0]); v.push([x1, y0]);\n' +
                '  for (var k = 1; k < n; k++) v.push([x1 + (hsh(i*31 + k + SEC) - 0.5)*2*A + ((k % 2) ? A : -A)*0.6, y0 + (y1 - y0)*k/n]);\n' +
                '  v.push([x1, y1]); v.push([x0, y1]);\n' +
                '  for (var k = n - 1; k >= 1; k--) v.push([x0 + (hsh(i*37 + k + SEC*3) - 0.5)*2*A + ((k % 2) ? -A : A)*0.6, y0 + (y1 - y0)*k/n]);\n' +
                '  createPath(v, [], [], true); }');
            addFillV(S, "tape", (o.stripCol === "ALT" ? LITE + I + 'var MC = comp("mainComp").layer("mainControl");\n((i + SEC + PI) % 2 == 0) ? MC.effect("3")("Color").value : MC.effect("2")("Color").value;' :
                pal(o.stripCol.replace(/^C/, "")) + ';'));
            S.motionBlur = true;
            var T = makeText(shot, "X", F_CAPS, 100, o.just, 0, 126); T.name = "line " + li;
            textDoc(T).expression = LINEJS(tcomp.name, li, TXI[tcomp.name].ink, TXI[tcomp.name].track);
            tr(T, "ADBE Anchor Point").expression = LITE + I + '[L(i)[3] + L(i)[4]/2, -CAP/2];';
            tr(T, "ADBE Position").expression = LIB + I +
                'var dx = side(i)*1700*(1 - pin(i)) - side(i)*1800*rip(i);\n' +
                '[OX + SHF + CX(i) + dx + jx(i), OY + CY(i) + jy(i)];';
            tr(T, "ADBE Rotate Z").expression = LIB + I + 'ang(i) + side(i)*3.2*slapR(i) - side(i)*9*rip(i);';
            tr(T, "ADBE Scale").expression = LIB + I + 'var s = 100 + 4.5*slapS(i); [s, s];';
            tr(T, "ADBE Opacity").expression = LITE + I + '(i >= NL || t0 < 0) ? 0 : 100;';
            T.motionBlur = true;
            parentJ(S, T);
            tr(S, "ADBE Anchor Point").setValue([0, 0]); tr(S, "ADBE Position").setValue([0, 0]);
            tr(S, "ADBE Opacity").expression = LITE + I + '(i >= NL || t0 < 0) ? 0 : 100;';
            lines.push(T);
        }
        return lines;
    }

    // ------------------------------------------------------------ THE PRINT: media taped up in a paper border
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
    var COVER = 'var S = thisLayer.source, k = 1;\n' +
        'try { var Lm = S.layer(1); if (Lm.source && Lm.source.width > 0) { var sc = Lm.transform.scale.value; var mw = Lm.source.width*Math.abs(sc[0])/100, mh = Lm.source.height*Math.abs(sc[1])/100; if (mw > 1 && mh > 1) k = Math.max(S.width/mw, S.height/mh); } } catch (err) {}\n';
    function rectShape(comp, name, w, h, colExpr) {
        var s = shapeLayer(comp, name); grp(s, "r");
        addPathExpr(s, "r", 'createPath([[' + (-w / 2) + ', ' + (-h / 2) + '], [' + (w / 2) + ', ' + (-h / 2) + '], [' + (w / 2) + ', ' + (h / 2) + '], [' + (-w / 2) + ', ' + (h / 2) + ']], [], [], true);');
        addFillV(s, "r", colExpr);
        return s;
    }
    // a short piece of tape with torn ends, centred on its layer origin
    function tapePiece(comp, name, len, th) {
        var s = shapeLayer(comp, name); grp(s, "t");
        var v = [], n = 5, A = th * 0.12, k;
        v.push([-len / 2, -th / 2]); v.push([len / 2, -th / 2]);
        for (k = 1; k < n; k++) v.push([len / 2 + ((k % 2) ? A : -A), -th / 2 + th * k / n]);
        v.push([len / 2, th / 2]); v.push([-len / 2, th / 2]);
        for (k = n - 1; k >= 1; k--) v.push([-len / 2 + ((k % 2) ? -A : A), -th / 2 + th * k / n]);
        var js = '['; for (k = 0; k < v.length; k++) js += (k ? ',' : '') + '[' + Math.round(v[k][0]) + ',' + Math.round(v[k][1]) + ']'; js += ']';
        addPathExpr(s, "t", 'createPath(' + js + ', [], [], true);');
        addFillV(s, "t", TRI + 'C3;');
        return s;
    }
    // o: { x, y (centre), w, h (photo), b (border), rot, yNoText (expr-able), tname }
    function printUp(shot, frameLayer, o) {
        var rig = shot.layers.addNull(DUR); rig.name = "print";
        tr(rig, "ADBE Anchor Point").setValue([0, 0, 0]);
        var LAND = 'var tl = e0 + 0.05*TEMPO, a = time - tl - 0.26*TEMPO;\n' +
            'var p = eo((time - tl)/(0.26*TEMPO)), damp = (a < 0) ? 1 : Math.exp(-6*a)*Math.cos(17*a);\n' +
            'var R0 = ' + o.rot + '*((SEC % 2) ? -1 : 1)*(0.6 + FORM) + PRES*3*(hsh(SEC*19 + 4) - 0.5);\n';
        tr(rig, "ADBE Position").expression = HDR + (o.tname ? hasJS(o.tname) : 'var HAS = true;\n') + LAND +
            '[' + o.x + ', (HAS ? ' + o.y + ' : ' + (o.yNoText || o.y) + ') + 90*(1 - p)];';
        tr(rig, "ADBE Rotate Z").expression = HDR + LAND + 'R0 + 7*(1 - p) + ((a < 0) ? 0 : 2.4*damp);';
        tr(rig, "ADBE Scale").expression = HDR + LAND + 'var s = 116 - 16*p + ((a < 0) ? 0 : 2.2*Math.exp(-9*a)*Math.sin(15*a)); [s, s];';
        tr(rig, "ADBE Opacity").expression = HDR + LAND + '(time < tl) ? 0 : 100;';
        var paper = rectShape(shot, "print paper", o.w + 2 * o.b, o.h + 2 * o.b, TRI + 'C2;');
        parentJ(paper, rig); tr(paper, "ADBE Position").setValue([0, 0]);
        paper.motionBlur = true;
        var matte = rectShape(shot, "print window", o.w, o.h, '[1, 1, 1, 1];');
        parentJ(matte, rig); tr(matte, "ADBE Position").setValue([0, 0]);
        frameLayer.moveBefore(paper);
        matte.moveBefore(frameLayer);
        parentJ(frameLayer, rig); tr(frameLayer, "ADBE Position").setValue([0, 0]);
        tr(frameLayer, "ADBE Scale").expression = HDR + COVER +
            'k = Math.max(k, ' + o.w + '/S.width, ' + o.h + '/S.height);\n' +
            'var s = 100*k*(1 + 0.04*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';
        frameLayer.setTrackMatte(matte, TrackMatteType.ALPHA);
        frameLayer.motionBlur = true;
        // two pieces of tape slapped on the top corners
        var corners = [[-o.w / 2 - o.b * 0.4, -o.h / 2 - o.b * 0.4, -38], [o.w / 2 + o.b * 0.4, -o.h / 2 - o.b * 0.4, 38]];
        for (var c = 0; c < 2; c++) {
            var tp = tapePiece(shot, "tape " + (c + 1), Math.round(o.w * 0.3), Math.round(o.w * 0.075));
            parentJ(tp, rig);
            tr(tp, "ADBE Position").setValue([corners[c][0], corners[c][1]]);
            var TP = HDR + 'var tt = e0 + (0.36 + ' + (c * 0.07) + ')*TEMPO, a = time - tt, p = eo(a/(0.12*TEMPO));\n';
            tr(tp, "ADBE Rotate Z").setValue(corners[c][2]);
            tr(tp, "ADBE Scale").expression = TP + 'var s = 150 - 50*p; [s, s];';
            tr(tp, "ADBE Opacity").expression = TP + '(a < 0) ? 0 : 100;';
            tp.motionBlur = true;
        }
        rig.moveToBeginning();
        return rig;
    }

    // ------------------------------------------------------------ the mark on a strip of tape
    var ardItem = null;
    function imp(path) { var it = app.project.importFile(new ImportOptions(new File(path))); it.parentFolder = footFolder; return it; }
    function markStrip(shot, x, y, hPx, rot, gate) {
        if (!ardItem) ardItem = imp(FOOT + "/ardilla.png");
        var rig = shot.layers.addNull(DUR); rig.name = "mark";
        tr(rig, "ADBE Anchor Point").setValue([0, 0, 0]);
        var PULL = HDR + (gate || 'var GATE = 1;\n') + 'var tl = e0 + 0.5*TEMPO, p = eo((time - tl)/(0.36*TEMPO)), a = time - tl - 0.18*TEMPO, damp = (a < 0) ? 1 : Math.exp(-7*a)*Math.cos(19*a);\n';
        tr(rig, "ADBE Position").expression = PULL + '[' + x + ' - 1500*(1 - p), ' + y + '];';
        tr(rig, "ADBE Rotate Z").expression = PULL + rot + ' - 3*damp;';
        var fs = Math.round(hPx * 0.42);
        var t = makeText(shot, "SE ACAB\u00D3 LA FIESTA", F_CAPS, fs, ParagraphJustification.LEFT_JUSTIFY, -10, fs * 1.2);
        t.name = "mark words"; fillFx(t, TRI + 'C1;');
        var r = t.sourceRectAtTime(0, false);
        var sqW = ardItem.width * hPx / ardItem.height, gap = hPx * 0.16, total = sqW + gap + r.width, padH = hPx * 0.3, padV = hPx * 0.14;
        var strip = tapePiece(shot, "mark tape", Math.round(total + 2 * padH), Math.round(hPx + 2 * padV));
        parentJ(strip, rig); tr(strip, "ADBE Position").setValue([0, 0]);
        var sq = shot.layers.add(ardItem); sq.name = "ardilla";
        var sc = hPx / ardItem.height * 100;
        parentJ(sq, rig); tr(sq, "ADBE Anchor Point").setValue([0, ardItem.height / 2]);
        tr(sq, "ADBE Position").setValue([-total / 2, 0]); tr(sq, "ADBE Scale").setValue([sc, sc]);
        parentJ(t, rig); tr(t, "ADBE Position").setValue([-total / 2 + sqW + gap - r.left, -(r.top + r.height / 2)]);
        var layers = [strip, sq, t];
        for (var i = 0; i < 3; i++) { tr(layers[i], "ADBE Opacity").expression = PULL + '100*GATE*((time < tl) ? 0 : 1);'; layers[i].motionBlur = true; }
        strip.moveAfter(sq); t.moveBefore(sq);
        return rig;
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
        c.shutterAngle = 200; c.shutterPhase = -100;
        c.motionBlurSamplesPerFrame = 8; c.motionBlurAdaptiveSampleLimit = 24;
        makeController(c);
        var g = c.layers.addSolid([1, 1, 1], "field", W, H, 1, DUR); fillFx(g, fieldExpr); g.moveToEnd();
        return c;
    }
    function finish(shot) { shot.layer("controller").moveToBeginning(); }
    var PH = [[0.3, 0.3, 4], [3.4, 0.3, 4], [6.5, 0.3, 4]];
    function sim(tcomp, texts, ph) { if (!SIM) return; var P = ph || PH; markers(tcomp, P); simTexts(tcomp.layer("textBlock"), P, texts); }
    var LJ = ParagraphJustification.LEFT_JUSTIFY, CJ = ParagraphJustification.CENTER_JUSTIFY;
    var CW = 0.70, CWG = 0.69;   // Montserrat ExtraBold Italic caps (real ~0.58-0.64): err wide

    // ============================================================ 01 PANCARTA — Night; a centred stack of tan/paper strips
    var t01 = makeTextComp("01-text", 960, 1150, "Nadie nos regala nada y lo vamos a cambiar", 170, CJ, { maxL: 4, cw: CW, ink: "C1", track: -20 });
    sim(t01, ["Nadie nos regala nada", "y lo vamos a cambiar", "Juntos"]);
    var s01 = newShot("01", TRI + 'C1;');
    stripStack(s01, t01, { n: 4, x: 540, y: 960, just: CJ, stripCol: "ALT", angMul: 1, shift: true });
    finish(s01); log.push("01 pancarta");

    // ============================================================ 02 GRITO — Tan field; one or two huge night strips, steep
    var t02 = makeTextComp("02-text", 1000, 900, "\u00A1Se acab\u00F3 ya!", 260, CJ, { maxL: 2, cw: CW, ink: "C2", track: -30, noJoin: true });
    sim(t02, ["Se acab\u00F3", "Basta ya", "Ahora"]);
    var s02 = newShot("02", TRI + 'C3;');
    stripStack(s02, t02, { n: 2, x: 540, y: 960, just: CJ, stripCol: "C1", angMul: 1.9, side0: 1 });
    finish(s02); log.push("02 grito");

    // ============================================================ 03 ALEGATO — Paper field; a left-aligned stack of night strips
    var t03 = makeTextComp("03-text", 920, 1500, "Lo que se decide en los despachos tambi\u00E9n se puede contar en la calle, con nombres y con pruebas", 104, LJ, { maxL: 9, cw: CWG, ink: "C2", track: -15, greedy: true });
    sim(t03, ["Lo que se decide en los despachos tambi\u00E9n se puede contar en la calle", "Con nombres y con pruebas, sin miedo y sin pedir permiso", "Ese es el trato"], [[0.3, 0.24, 14], [4.4, 0.24, 11], [8.0, 0.25, 4]]);
    var s03 = newShot("03", TRI + 'C2;');
    stripStack(s03, t03, { n: 9, x: 540, y: 960, just: LJ, stripCol: "C1", angMul: 0.35 });
    finish(s03); log.push("03 alegato");

    // ============================================================ 04 TABLÓN — Night; the print taped up top, strips below
    var t04 = makeTextComp("04-text", 960, 620, "As\u00ED se vive en la calle", 124, CJ, { maxL: 3, cw: CW, ink: "C1", track: -20 });
    sim(t04, ["As\u00ED se vive en la calle", "Cara a cara", "Sin filtros"]);
    var f04 = makeFrameComp("04-frame", 900, 675);
    var s04 = newShot("04", TRI + 'C1;');
    var fl04 = s04.layers.add(f04); fl04.name = "04-frame"; fl04.audioEnabled = false;
    stripStack(s04, t04, { n: 3, x: 540, y: 1440, just: CJ, stripCol: "ALT", angMul: 1, after: 0.25, shift: true });
    printUp(s04, fl04, { x: 540, y: 640, yNoText: 900, w: 900, h: 675, b: 22, rot: -2.5, tname: "04-text" });
    finish(s04); log.push("04 tablon");

    // ============================================================ 05 CARTEL — full-bleed photo punched in; strips across the lower middle
    var t05 = makeTextComp("05-text", 960, 600, "Esto no se calla", 132, CJ, { maxL: 3, cw: CW, ink: "C1", track: -20 });
    sim(t05, ["Esto no se calla", "Se cuenta", "Y se cambia"]);
    var f05 = makeFrameComp("05-frame", 1080, 1920);
    var s05 = newShot("05", TRI + 'C1;');
    var fl05 = s05.layers.add(f05); fl05.name = "05-frame"; fl05.audioEnabled = false;
    tr(fl05, "ADBE Position").setValue([540, 960]);
    tr(fl05, "ADBE Scale").expression = HDR + COVER +
        'k = Math.max(k, ' + W + '/S.width, ' + H + '/S.height);\n' +
        'var p = ex((time - e0)/(0.3*TEMPO)), s = 100*k*(1.14 - 0.14*p + 0.05*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';
    fl05.motionBlur = true;
    stripStack(s05, t05, { n: 3, x: 540, y: 1330, just: CJ, stripCol: "ALT", angMul: 1, after: 0.2, shift: true });
    finish(s05); log.push("05 cartel");

    // ============================================================ 06 PRUEBA — media only: a large print taped up; the mark on a strip of tape
    var t06 = makeTextComp("06-text", 940, 300, "", 96, CJ, { maxL: 2, cw: CW, ink: "C1", track: -20 });
    var f06 = makeFrameComp("06-frame", 860, 1075);
    var s06 = newShot("06", TRI + 'C1;');
    var fl06 = s06.layers.add(f06); fl06.name = "06-frame"; fl06.audioEnabled = false;
    stripStack(s06, t06, { n: 2, x: 540, y: 1690, just: CJ, stripCol: "ALT", angMul: 1, after: 0.4 });
    printUp(s06, fl06, { x: 540, y: 840, w: 860, h: 1075, b: 24, rot: 2 });
    markStrip(s06, 540, 1700, 92, -2.5, hasJS("06-text") + 'var GATE = HAS ? 0 : 1;\n');
    finish(s06); log.push("06 prueba");

    mcL.moveToBeginning();
    return log.join("\n");
}
