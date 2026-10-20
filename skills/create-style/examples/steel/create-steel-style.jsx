// STEEL v3 — "Tensile". CucoStudio style builder (After Effects 2025, ES3).
// v3: phrase-aware layout engine — every phrase gets a composition (planes shear into new
// configurations, text scales to its zone), event/quiet rhythm, section-long temper arc.
// Blackened steel field, polished-steel type, one blued-steel accent.
// Type: Big Shoulders Display Light (monumental, drawn like steel rod) + Monaspace Neon Wide (labels).
// Signature: SHEAR — every phrase/plate arrives cut into angled bands that slide along the cut and
// lock flush; at the lock a razor line of blue-white light runs along each seam, then vanishes.

app.purge(PurgeTarget.ALL_CACHES);
app.beginSuppressDialogs();
var log = [];
function L(s) { log.push(s); }

var OUT_AEP = "/Users/ale/style-dev/steel/steel.aep";
var W = 1080, H = 1920, FPS = 30, DUR = 10;
var FONT_D = "BigShouldersDisplay-Light";
var FONT_M = "MonaspaceNeon-WideRegular";
var NT = 7;   // text slice layers built (active count comes from FORM)
var NM = 6;   // media strip layers built

function hex(h) {
    return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1];
}
var C1 = hex("#0B0D10"); // blackened steel (60)
var C2 = hex("#D9DEE3"); // polished steel (30)
var C3 = hex("#3457FF"); // blued steel (10)

// ---------------------------------------------------------------- expression library
var P1 = 'comp("mainComp").layer("mainControl").effect("1")("Color")';
var P2 = 'comp("mainComp").layer("mainControl").effect("2")("Color")';
var P3 = 'comp("mainComp").layer("mainControl").effect("3")("Color")';
function palExpr(i) { if (i === 1) return P1; if (i === 2) return P2; return P3; }
var TRI =
    'var MC = comp("mainComp").layer("mainControl");\n' +
    'var FORM = MC.effect("FORM")("Slider").value/100;\n' +
    'var FLOW = MC.effect("FLOW")("Slider").value/100;\n' +
    'var PRES = MC.effect("PRESSURE")("Slider").value/100;\n';
var CTL =
    'var CT = thisComp.layer("controller");\n' +
    'var EN = CT.effect("enter")("Slider"), EX = CT.effect("exit")("Slider");\n' +
    'var en = EN.value/100, ex = EX.value/100;\n' +
    'function tAt(f) { return EN.numKeys > 1 ? EN.key(1).time + f*(EN.key(EN.numKeys).time - EN.key(1).time) : f; }\n';
var EASE =
    'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
    'function eo(p) { p = cl(p); return p >= 1 ? 1 : 1 - Math.pow(2, -10*p); }\n' +
    'function ei(p) { p = cl(p); return p <= 0 ? 0 : Math.pow(2, 10*(p - 1)); }\n' +
    'function qo(p) { p = cl(p); return 1 - Math.pow(1 - p, 5); }\n' +
    'function ci(p) { p = cl(p); return p*p*p; }\n' +
    'function cio(p) { p = cl(p); return p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3)/2; }\n';
var HDR = TRI + CTL + EASE;

// ---- text shear library: SRC = the text precomp; phrases come from the director's "0" markers
function textLib(srcExpr, nMin, nMax, baseAng) {
    return HDR +
        'var SRC = ' + srcExpr + ';\n' +
        'var NS = Math.round(linear(FORM, 0, 1, ' + nMin + ', ' + nMax + '));\n' +
        'var DIN = linear(FLOW, 0, 1, 0.8, 0.52);\n' +
        'var STG = 0.05, OUT = 0.17;\n' +
'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n' +
        'function ordOf(i) { var r = hsh(31 + i)*Math.max(0, NS - 1); return linear(PRES, 0, 1, i, r); }\n' +
        'function angOf(k) { return (' + baseAng + ' + PRES*(hsh(53 + k)*9 - 4.5))*Math.PI/180; }\n' +
        'function chunk() {\n' +
        '  var m = SRC.marker, n = m.numKeys, t0 = -1, t1 = 1e6, prev = 1e9;\n' +
        '  for (var k = 1; k <= n; k++) {\n' +
        '    var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0;\n' +
        '    var st = (k == 1) || (c == "0") || (v < prev); prev = v;\n' +
        '    if (st) { var tk = m.key(k).time; if (tk <= time + 0.001) { t0 = tk; } else { t1 = tk; break; } }\n' +
        '  }\n' +
        '  if (n == 0) { t0 = EN.numKeys > 1 ? EN.key(1).time : 0; }\n' +
        '  return [t0, t1];\n' +
        '}\n' +
        'function rectC() {\n' +
        '  var tb = SRC.layer("textBlock"); var r = tb.sourceRectAtTime(time, false);\n' +
        '  var a = tb.toComp([r.left, r.top]), b = tb.toComp([r.left + r.width, r.top + r.height]);\n' +
        '  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];\n' +
        '}\n';
}
function textProg(i) {
    return 'var i = ' + i + ';\n' +
        'var ch = chunk(); var t0 = ch[0], t1 = ch[1];\n' +
        'var d = ordOf(i)*STG;\n' +
        'var pIn = (t0 < 0) ? 0 : eo((time - t0 - d)/DIN);\n' +
        'var pOut = (t1 > 1e5) ? 0 : ei((time - (t1 - OUT) + d*0.25)/OUT);\n' +
        'var pEx = ei((ex - 0.55 - d*0.3)/0.4);\n' +
        'var pO = Math.max(pOut, pEx);\n';
}
var TEXT_POS_TAIL =
    'var ang = (angOf(i) + angOf(i + 1))/2;\n' +
    'var T = 14 + 330*FLOW;\n' +
    'var s = (i % 2 == 0) ? -1 : 1;\n' +
    'var off = s*T*(1 - pIn) - s*T*0.7*pO + s*22*Math.pow(Math.max(0, (PRES - 0.45)/0.55), 2);\n' +
    'var vx = Math.cos(ang)*off, vy = Math.sin(ang)*off;\n' +
    'var rr = transform.rotation*Math.PI/180;\n' +
    '[value[0] + vx*Math.cos(rr) - vy*Math.sin(rr), value[1] + vx*Math.sin(rr) + vy*Math.cos(rr)];';
var TEXT_POS_TAIL_LEFT = TEXT_POS_TAIL.replace('[value[0] + vx', 'var AR = rectC(); var dx = -AR[0];\n[value[0] + dx + vx');
var TEXT_OP_TAIL =
    'var on = (i < NS) ? 1 : 0;\n' +
    '100*on*cl(pIn*2.6)*(1 - cl(pO*1.15));';
function textMask(i) {
    return 'var i = ' + i + ';\n' +
        'var R = rectC(); var lo = R[1] - 10, hi = R[3] + 10; var h = (hi - lo)/NS;\n' +
        'var Wd = SRC.width, cx = Wd/2;\n' +
        'function yA(k, x) { if (k <= 0) return -6000; if (k >= NS) return 9000; return lo + k*h + Math.tan(angOf(k))*(x - cx); }\n' +
        'var x0 = -700, x1 = Wd + 700;\n' +
        '(i >= NS) ? createPath([[0, 0], [1, 0], [1, 1]], [], [], true) : createPath([[x0, yA(i, x0)], [x1, yA(i, x1)], [x1, yA(i + 1, x1)], [x0, yA(i + 1, x0)]], [], [], true);';
}
function textSeamPath(k) {
    return 'var k = ' + k + ';\n' +
        'var R = rectC(); var lo = R[1] - 10, hi = R[3] + 10; var h = (hi - lo)/NS;\n' +
        'var Wd = SRC.width, cx = Wd/2, yc = lo + k*h, tn = Math.tan(angOf(k));\n' +
        'var xa = R[0] - 30, xb = R[2] + 30;\n' +
        'createPath([[xa, yc + tn*(xa - cx)], [xb, yc + tn*(xb - cx)]], [], [], false);';
}
function textSeamLock(k) {
    return 'var k = ' + k + ';\n' +
        'var ch = chunk(); var t0 = ch[0];\n' +
        'var lk = t0 + Math.max(ordOf(k - 1), ordOf(k))*STG + DIN*0.4;\n' +
        'var u = time - lk;\n';
}

// ---- LAYOUT ENGINE: phrase list from the director's markers -> blocks of phrases -> compositions
// A composition = shearing background planes + 1-2 text zones [x, y, w, h, alignX(0 L,1 C,2 R), alignY(0 T,1 C,2 B), rot, ink(1 dark|2 silver)].
var SMAX = 2.0;
function engineLib(srcExpr, spec) {
    return HDR +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n' +
        'var SRC = ' + srcExpr + ';\n' +
        'var NS = Math.round(linear(FORM, 0, 1, ' + spec.nMin + ', ' + spec.nMax + '));\n' +
        'var DIN = linear(FLOW, 0, 1, 0.8, 0.52);\n' +
        'var STG = 0.05, OUT = 0.17;\n' +
        'function ordOf(i) { var r = hsh(31 + i)*Math.max(0, NS - 1); return linear(PRES, 0, 1, i, r); }\n' +
        'function angOf(k) { return (' + spec.ang + ' + PRES*(hsh(53 + k)*9 - 4.5))*Math.PI/180; }\n' +
        'var SN = thisComp.name.split("-"); var SEC = parseInt(SN[SN.length - 1], 10); if (isNaN(SEC)) SEC = 0;\n' +
        'var COMPS = ' + spec.comps + ';\n' +
        'var RICH = ' + spec.rich + ', PLAIN = ' + spec.plain + ';\n' +
        'var G = (FORM >= 0.5) ? 2 : 3;\n' +
        'function compSeq(n) { var Ls = (FORM >= 0.5) ? RICH : PLAIN; var b = (SEC*2 + n) % Ls.length;\n' +
        '  if (PRES > 0.5 && hsh(SEC*5 + n*11 + 1) < (PRES - 0.5)*2) b = Math.floor(hsh(SEC*13 + n*7 + 3)*Ls.length) % Ls.length; return Ls[b]; }\n' +
        'var PS = [];\n' +
        '(function () { var m = SRC.marker, n = m.numKeys, prev = 1e9; for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) PS.push(m.key(k).time); prev = v; } })();\n' +
        'if (PS.length == 0) PS.push(EN.numKeys > 1 ? EN.key(1).time : 0);\n' +
        'var CNT = PS.length, IDX = 0;\n' +
        'for (var q = 0; q < CNT; q++) { if (PS[q] <= time + 0.001) IDX = q + 1; }\n' +
        'var BK = [], BS = [], ORD = 0;\n' +
        'for (var q = 1; q <= CNT; q++) { if (' + (spec.landing ? 'true' : 'false') + ' && CNT >= 3 && q == CNT) { BK.push(COMPS.length - 1); BS.push(q); } else if ((q - 1) % G == 0) { BK.push(compSeq(ORD)); BS.push(q); ORD++; } }\n' +
        'var B = 0; for (var q = 0; q < BS.length; q++) { if (BS[q] <= Math.max(1, IDX)) B = q; }\n' +
        'var CK = COMPS[BK[B]];\n' +
        'var ZI = (IDX < 1) ? 0 : ((IDX - BS[B]) % CK.z.length);\n' +
        'var Z = CK.z[ZI];\n' +
        'var EVENT = (IDX == BS[B]);\n' +
        'var t0 = (IDX < 1) ? -1 : PS[IDX - 1], t1 = (IDX < CNT) ? PS[IDX] : 1e6;\n' +
        'var BT0 = PS[BS[B] - 1], BT1 = (B + 1 < BS.length) ? PS[BS[B + 1] - 1] : 1e6;\n' +
        'var DL = (EVENT && CK.p.length > 0) ? 0.22 : 0;\n' +
        'function rectC() {\n' +
        '  var tb = SRC.layer("textBlock"); var r = tb.sourceRectAtTime(time, false);\n' +
        '  var a = tb.toComp([r.left, r.top]), b = tb.toComp([r.left + r.width, r.top + r.height]);\n' +
        '  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];\n' +
        '}\n';
}
function textProg2(i) {
    return 'var i = ' + i + ';\n' +
        'var d = ordOf(i)*STG;\n' +
        'var pIn = (t0 < 0) ? 0 : eo((time - t0 - DL - d)/DIN);\n' +
        'var pOut = (t1 > 1e5) ? 0 : ei((time - (t1 - OUT) + d*0.25)/OUT);\n' +
        'var pEx = ei((ex - 0.55 - d*0.3)/0.4);\n' +
        'var pO = Math.max(pOut, pEx);\n';
}
// slice position lives in RIG space: the rig carries zone placement, scale and rotation
var SLICE_POS_TAIL =
    'var R = rectC(); var rcx = (R[0] + R[2])/2, rcy = (R[1] + R[3])/2;\n' +
    'var ang = (angOf(i) + angOf(i + 1))/2;\n' +
    'var T = (14 + 330*FLOW)*(EVENT ? 1 : 0.45);\n' +
    'var sg = (i % 2 == 0) ? -1 : 1;\n' +
    'var off = sg*T*(1 - pIn) - sg*T*0.7*pO + sg*22*Math.pow(Math.max(0, (PRES - 0.45)/0.55), 2);\n' +
    '[SRC.width/2 - rcx + Math.cos(ang)*off, SRC.height/2 - rcy + Math.sin(ang)*off];';
var SLICE_OP_TAIL = 'var on = (i < NS) ? 1 : 0;\n100*on*cl(pIn*2.6)*(1 - cl(pO*1.15));';
var ZONEFIT =
    'var R = rectC(); var Rw = Math.max(1, R[2] - R[0]), Rh = Math.max(1, R[3] - R[1]);\n' +
    'var rot = Z[6]; var bw = (rot == 0) ? Rw : Rh, bh = (rot == 0) ? Rh : Rw;\n' +
    'var s = Math.min(Z[2]/bw, Z[3]/bh, ' + SMAX + ');\n' +
    'var cx = (Z[4] == 0) ? Z[0] + bw*s/2 : ((Z[4] == 2) ? Z[0] + Z[2] - bw*s/2 : Z[0] + Z[2]/2);\n' +
    'var cy = (Z[5] == 0) ? Z[1] + bh*s/2 : ((Z[5] == 2) ? Z[1] + Z[3] - bh*s/2 : Z[1] + Z[3]/2);\n';
function sliceMask(i) {
    return 'var i = ' + i + ';\n' +
        'var R = rectC(); var lo = R[1] - 10, hi = R[3] + 10; var h = (hi - lo)/NS;\n' +
        'var Wd = SRC.width, cx = Wd/2;\n' +
        'function yA(k, x) { if (k <= 0) return -6000; if (k >= NS) return 9000; return lo + k*h + Math.tan(angOf(k))*(x - cx); }\n' +
        'var x0 = Math.min(-700, R[0] - 400), x1 = Math.max(Wd + 700, R[2] + 400);\n' +
        '(i >= NS) ? createPath([[0, 0], [1, 0], [1, 1]], [], [], true) : createPath([[x0, yA(i, x0)], [x1, yA(i, x1)], [x1, yA(i + 1, x1)], [x0, yA(i + 1, x0)]], [], [], true);';
}
function seamPath2(k) {
    return 'var k = ' + k + ';\n' +
        'var R = rectC(); var lo = R[1] - 10, hi = R[3] + 10; var h = (hi - lo)/NS;\n' +
        'var Wd = SRC.width, cx = Wd/2, yc = lo + k*h, tn = Math.tan(angOf(k));\n' +
        'var xa = R[0] - 30, xb = R[2] + 30;\n' +
        'createPath([[xa, yc + tn*(xa - cx)], [xb, yc + tn*(xb - cx)]], [], [], false);';
}
function seamLock2(k) {
    return 'var k = ' + k + ';\n' +
        'var lk = t0 + DL + Math.max(ordOf(k - 1), ordOf(k))*STG + DIN*0.4;\n' +
        'var u = time - lk;\n';
}

// ---- media strip library (bands across the frame comp; enter/exit sliders drive them)
function stripLib(nMin, nMax, baseAng, seed) {
    return HDR +
        'var NS = Math.round(linear(FORM, 0, 1, ' + nMin + ', ' + nMax + '));\n' +
        'var STG = 0.07;\n' +
'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n' +
        'function ordOf(i) { var r = hsh(' + seed + ' + i)*Math.max(0, NS - 1); return linear(PRES, 0, 1, i, r); }\n' +
        'function angOf(k) { return (' + baseAng + ' + PRES*(hsh(' + (seed + 40) + ' + k)*6 - 3))*Math.PI/180; }\n';
}
function stripProg(j) {
    return 'var j = ' + j + ';\n' +
        'var d = ordOf(j)*STG;\n' +
        'var pIn = qo((en - 0.02 - d)/0.64);\n' +
        'var pO = ei((ex - 0.5 - (NS - 1 - ordOf(j))*0.03)/0.42);\n';
}
// orient "v": cuts run top->bottom (bands side by side), slide vertically along the cut.
// orient "h": cuts run left->right (bands stacked), slide horizontally along the cut.
function stripMask(j, orient) {
    var s = 'var j = ' + j + ';\n' +
        'var Wd = thisLayer.source.width, Hd = thisLayer.source.height;\n';
    if (orient === "v") {
        s += 'var w = Wd/NS, cy = Hd/2;\n' +
            'function xA(k, y) { if (k <= 0) return -6000; if (k >= NS) return 9000; return k*w + Math.tan(angOf(k))*(y - cy); }\n' +
            'var y0 = -900, y1 = Hd + 900;\n' +
            '(j >= NS) ? createPath([[0, 0], [1, 0], [1, 1]], [], [], true) : createPath([[xA(j, y0), y0], [xA(j + 1, y0), y0], [xA(j + 1, y1), y1], [xA(j, y1), y1]], [], [], true);';
    } else {
        s += 'var h = Hd/NS, cx = Wd/2;\n' +
            'function yA(k, x) { if (k <= 0) return -6000; if (k >= NS) return 9000; return k*h + Math.tan(angOf(k))*(x - cx); }\n' +
            'var x0 = -900, x1 = Wd + 900;\n' +
            '(j >= NS) ? createPath([[0, 0], [1, 0], [1, 1]], [], [], true) : createPath([[x0, yA(j, x0)], [x1, yA(j, x1)], [x1, yA(j + 1, x1)], [x0, yA(j + 1, x0)]], [], [], true);';
    }
    return s;
}
function stripPosTail(orient, travelExpr) {
    var s = 'var Wd = thisLayer.source.width, Hd = thisLayer.source.height;\n' +
        'var ang = (angOf(j) + angOf(j + 1))/2;\n' +
        'var T = ' + travelExpr + ';\n' +
        'var sg = (j % 2 == 0) ? -1 : 1;\n' +
        'var off = sg*T*(1 - pIn) + sg*T*0.9*pO + sg*14*Math.pow(Math.max(0, (PRES - 0.45)/0.55), 2);\n';
    if (orient === "v") s += '[value[0] + Math.sin(ang)*off, value[1] + Math.cos(ang)*off];';
    else s += '[value[0] + Math.cos(ang)*off, value[1] + Math.sin(ang)*off];';
    return s;
}
var STRIP_OP_TAIL = 'var on = (j < NS) ? 1 : 0;\n100*on*cl(pIn*4)*(1 - cl(pO*1.3));';
function stripSeamPath(k, orient) {
    var s = 'var k = ' + k + ';\n';
    if (orient === "v") {
        s += 'var Wd = ' + '%W%' + ', Hd = ' + '%H%' + ', w = Wd/NS, cy = Hd/2, tn = Math.tan(angOf(k));\n' +
            'createPath([[k*w + tn*(0 - cy), 0], [k*w + tn*(Hd - cy), Hd]], [], [], false);';
    } else {
        s += 'var Wd = ' + '%W%' + ', Hd = ' + '%H%' + ', h = Hd/NS, cx = Wd/2, tn = Math.tan(angOf(k));\n' +
            'createPath([[0, k*h + tn*(0 - cx)], [Wd, k*h + tn*(Wd - cx)]], [], [], false);';
    }
    return s;
}
function stripSeamLock(k) {
    return 'var k = ' + k + ';\n' +
        'var eL = 0.02 + Math.max(ordOf(k - 1), ordOf(k))*STG + 0.64*0.45;\n' +
        'var u = time - tAt(eL);\n';
}

// ---------------------------------------------------------------- AE helpers
function fxAdd(layer, mn) { return layer.property("ADBE Effect Parade").addProperty(mn); }
function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }
function addSlider(layer, name, v) { var f = fxAdd(layer, "ADBE Slider Control"); f.name = name; f.property(1).setValue(v); return f; }
function addColor(layer, name, v) { var f = fxAdd(layer, "ADBE Color Control"); f.name = name; f.property(1).setValue(v); return f; }
function fillFx(layer, which) {
    var f = fxAdd(layer, "ADBE Fill");
    f.property("ADBE Fill-0002").expression = palExpr(which) + ';';
    return f;
}
function makeController(comp) {
    var c = comp.layers.addNull(DUR);
    c.name = "controller";
    c.enabled = false;
    var e = addSlider(c, "enter", 0);
    e.property(1).setValueAtTime(0, 0); e.property(1).setValueAtTime(1.0, 100);
    var x = addSlider(c, "exit", 0);
    x.property(1).setValueAtTime(DUR - 1.0, 0); x.property(1).setValueAtTime(DUR, 100);
    return c;
}
function textDoc(layer) { return layer.property("ADBE Text Properties").property("ADBE Text Document"); }
function makeText(comp, str, font, size, just, tracking, caps) {
    var t = comp.layers.addText(str);
    var sp = textDoc(t);
    var d = sp.value;
    d.resetCharStyle();
    d.font = font; d.fontSize = size; d.applyFill = true; d.fillColor = [1, 1, 1];
    d.applyStroke = false; d.justification = just; d.tracking = tracking || 0;
    try { d.fontCapsOption = caps ? FontCapsOption.FONT_ALL_CAPS : FontCapsOption.FONT_NORMAL_CAPS; } catch (e2) {}
    sp.setValue(d);
    return t;
}
function setLeading(layer, lead) { var sp = textDoc(layer); var d = sp.value; d.autoLeading = false; d.leading = lead; sp.setValue(d); }
// balanced reflow: 1 line for short phrases, else 2-3 lines minimising the longest line;
// words <= 2 chars ride with the next word (a trailing one rides with the previous)
var STACK_EXPR =
    'var s = String(value).replace(/^\\s+|\\s+$/g, "");\n' +
    'var res = s;\n' +
    'if (s.length > 0) {\n' +
    '  var w = s.split(/\\s+/), u = [];\n' +
    '  for (var i = 0; i < w.length; i++) {\n' +
    '    if (w[i].length <= 2 && i < w.length - 1) { w[i + 1] = w[i] + " " + w[i + 1]; }\n' +
    '    else if (w[i].length <= 2 && u.length > 0) { u[u.length - 1] = u[u.length - 1] + " " + w[i]; }\n' +
    '    else { u.push(w[i]); }\n' +
    '  }\n' +
    '  var nl = (u.length <= 1 || s.length <= 11) ? 1 : ((s.length <= 26 || u.length <= 3) ? 2 : 3);\n' +
    '  nl = Math.min(nl, u.length);\n' +
    '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
    '  if (nl == 1) { res = u.join(" "); }\n' +
    '  else if (nl == 2) { var bb = 1, bv = 1e9; for (var b1 = 1; b1 < u.length; b1++) { var v = Math.max(L(0, b1), L(b1, u.length)); if (v < bv) { bv = v; bb = b1; } } res = u.slice(0, bb).join(" ") + "\\r" + u.slice(bb).join(" "); }\n' +
    '  else { var c1 = 1, c2 = 2, bv = 1e9; for (var b1 = 1; b1 < u.length - 1; b1++) { for (var b2 = b1 + 1; b2 < u.length; b2++) { var v = Math.max(L(0, b1), L(b1, b2), L(b2, u.length)); if (v < bv) { bv = v; c1 = b1; c2 = b2; } } } res = u.slice(0, c1).join(" ") + "\\r" + u.slice(c1, c2).join(" ") + "\\r" + u.slice(c2).join(" "); }\n' +
    '}\n' +
    'res;';
function zoneStackExpr(spec) {
    return 'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n' +
        'var SN = thisComp.name.split("-"); var SEC = parseInt(SN[Math.max(0, SN.length - 2)], 10); if (isNaN(SEC)) SEC = 0;\n' +
        'var COMPS = ' + spec.comps + ';\n' +
        'var RICH = ' + spec.rich + ', PLAIN = ' + spec.plain + ';\n' +
        'var G = (FORM >= 0.5) ? 2 : 3;\n' +
        'function compSeq(n) { var Ls = (FORM >= 0.5) ? RICH : PLAIN; var b = (SEC*2 + n) % Ls.length;\n' +
        '  if (PRES > 0.5 && hsh(SEC*5 + n*11 + 1) < (PRES - 0.5)*2) b = Math.floor(hsh(SEC*13 + n*7 + 3)*Ls.length) % Ls.length; return Ls[b]; }\n' +
        'var PS = [];\n' +
        '(function () { var m = thisComp.marker, n = m.numKeys, prev = 1e9; for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) PS.push(m.key(k).time); prev = v; } })();\n' +
        'if (PS.length == 0) PS.push(0);\n' +
        'var CNT = PS.length, IDX = 0;\n' +
        'for (var q = 0; q < CNT; q++) { if (PS[q] <= time + 0.001) IDX = q + 1; }\n' +
        'var BK = [], BS = [], ORD = 0;\n' +
        'for (var q = 1; q <= CNT; q++) { if (' + (spec.landing ? 'true' : 'false') + ' && CNT >= 3 && q == CNT) { BK.push(COMPS.length - 1); BS.push(q); } else if ((q - 1) % G == 0) { BK.push(compSeq(ORD)); BS.push(q); ORD++; } }\n' +
        'var B = 0; for (var q = 0; q < BS.length; q++) { if (BS[q] <= Math.max(1, IDX)) B = q; }\n' +
        'var CK = COMPS[BK[B]];\n' +
        'var Z = CK.z[(IDX < 1) ? 0 : ((IDX - BS[B]) % CK.z.length)];\n' +
        'var zw = (Z[6] == 0) ? Z[2] : Z[3], zh = (Z[6] == 0) ? Z[3] : Z[2];\n' +
        'var s = String(value).replace(/^\\s+|\\s+$/g, "");\n' +
        'var res = s;\n' +
        'if (s.length > 0) {\n' +
        '  var w = s.split(/\\s+/), u = [];\n' +
        '  for (var i = 0; i < w.length; i++) {\n' +
        '    if (w[i].length <= 2 && i < w.length - 1) { w[i + 1] = w[i] + " " + w[i + 1]; }\n' +
        '    else if (w[i].length <= 2 && u.length > 0) { u[u.length - 1] = u[u.length - 1] + " " + w[i]; }\n' +
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
        '    var sc = Math.min(zw/(mc*0.29), zh/(nl*0.86));\n' +
        '    if (sc > bs*1.04) { bs = sc; best = ls; }\n' +
        '  }\n' +
        '  res = best.join("\\r");\n' +
        '}\n' +
        'res;';
}
function centerLayerInComp(layer, comp) {
    var r = layer.sourceRectAtTime(0, false);
    tr(layer, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
    tr(layer, "ADBE Position").setValue([comp.width / 2, comp.height / 2]);
}
function makeTextComp(name, w, h, sample, size, stack, folder) {
    var c = app.project.items.addComp(name, w, h, 1, DUR, FPS);
    c.parentFolder = folder;
    var tb = makeText(c, sample, FONT_D, size, ParagraphJustification.LEFT_JUSTIFY, 6, true);
    tb.name = "textBlock";
    if (sample !== "") {
        setLeading(tb, Math.round(size * 0.86));
        if (stack) textDoc(tb).expression = (typeof stack === "string") ? stack : STACK_EXPR;
        centerLayerInComp(tb, c);
        // preview-only phrase markers (the director clears and rewrites these)
        var pm = [0.3, 1.9, 3.5, 5.1];
        for (var pi = 0; pi < pm.length; pi++) {
            c.markerProperty.setValueAtTime(pm[pi], new MarkerValue("0"));
            c.markerProperty.setValueAtTime(pm[pi] + 0.8, new MarkerValue("100"));
        }
    }
    return c;
}
function makeFrameComp(name, w, h, folder) {
    var c = app.project.items.addComp(name, w, h, 1, DUR, FPS);
    c.parentFolder = folder;
    var s = c.layers.addSolid([0.5, 0.5, 0.5], "placeholder", w, h, 1, DUR);
    var r = fxAdd(s, "ADBE Ramp");
    r.property("ADBE Ramp-0001").setValue([w * 0.25, 0]); r.property("ADBE Ramp-0002").setValue([0.62, 0.66, 0.7, 1]);
    r.property("ADBE Ramp-0003").setValue([w * 0.75, h]); r.property("ADBE Ramp-0004").setValue([0.05, 0.06, 0.07, 1]);
    var n = fxAdd(s, "ADBE Fractal Noise");
    n.property("ADBE Fractal Noise-0004").setValue(55); n.property("ADBE Fractal Noise-0010").setValue(420);
    n.property("ADBE Fractal Noise-0029").setValue(30); n.property("ADBE Fractal Noise-0030").setValue(4);
    return c;
}
function hairlineRect(comp, name, w, h, colorIdx) {
    var s = comp.layers.addShape();
    s.name = name;
    var g = s.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var gv = g.property("ADBE Vectors Group");
    gv.addProperty("ADBE Vector Shape - Rect");
    gv.addProperty("ADBE Vector Graphic - Fill");
    gv.property(1).property("ADBE Vector Rect Size").setValue([w, h]);
    gv.property(2).property("ADBE Vector Fill Color").expression = palExpr(colorIdx) + ';';
    return s;
}

// ---- finishing: polished-steel light on silver type (one slow softbox glide)
function steelTypeFx(layer) {
    fillFx(layer, 2);
    var sw = fxAdd(layer, "CC Light Sweep");
    sw.property("CC Light Sweep-0001").expression = TRI +
        'var P = linear(FLOW, 0, 1, 11, 4.8); var ph = (time % P)/P;\n' +
        'var Wd = thisLayer.source.width, Hd = thisLayer.source.height;\n' +
        '[linear(ph, 0, 1, -800, Wd + 800), Hd/2];';
    sw.property("CC Light Sweep-0002").setValue(-26);
    sw.property("CC Light Sweep-0003").setValue(2);
    sw.property("CC Light Sweep-0004").setValue(230);
    sw.property("CC Light Sweep-0005").expression = TRI + '20 + 34*FORM;';
    sw.property("CC Light Sweep-0006").setValue(0);
    sw.property("CC Light Sweep-0007").setValue(0);
    sw.property("CC Light Sweep-0008").setValue([1, 1, 1, 1]);
}
// ---- the lock glint: on EVENT phrases the letters catch one sharp pass of light as the bands lock
function lockGlint(layer, lib, i) {
    var g = fxAdd(layer, "CC Light Sweep");
    g.name = "lock glint";
    var gp = lib + textProg2(i) + 'var gg = (t0 < 0) ? -1 : (time - t0 - DL - DIN*0.28)/0.55;\n';
    g.property("CC Light Sweep-0001").expression = gp + 'var Wd = SRC.width, Hd = SRC.height; [linear(gg, 0, 1, -500, Wd + 500), Hd/2];';
    g.property("CC Light Sweep-0002").setValue(-26);
    g.property("CC Light Sweep-0003").setValue(2);
    g.property("CC Light Sweep-0004").setValue(120);
    g.property("CC Light Sweep-0005").expression = gp + '(gg > 0 && gg < 1 && EVENT) ? 55*(0.5 + 0.5*FORM) : 0;';
    g.property("CC Light Sweep-0006").setValue(0);
    g.property("CC Light Sweep-0007").setValue(0);
    g.property("CC Light Sweep-0008").setValue([1, 1, 1, 1]);
}
// ---- temper: the whole SECTION cools — first phrase white-hot, last phrase settled into the accent
function temperFx(layer, lib, i) {
    var f = fxAdd(layer, "ADBE Fill"); f.property("ADBE Fill-0002").setValue([1, 1, 1, 1]);
    var rp = fxAdd(layer, "ADBE Ramp");
    var core = lib + textProg2(i) +
        'var R = rectC(); var cx = (R[0] + R[2])/2;\n' +
        'var q = cl((time - PS[0] - 0.25)/Math.max(1.4, (thisComp.duration - PS[0])*0.8));\n' +
        'var e1 = 1 - Math.pow(1 - q, 1.5);\n' +
        'var Lb = linear(e1, 0, 1, 0.95, 0.0), Lt = linear(e1, 0, 1, 1.0, 0.3 + 0.08*(1 - FORM));\n' +
        'if (Lt - Lb < 0.05) Lt = Lb + 0.05;\n' +
        'var hh = Math.max(1, R[3] - R[1]); var D = hh/(Lt - Lb);\n' +
        'var ye = R[3] + Lb*D, ys = ye - D;\n';
    rp.property("ADBE Ramp-0001").expression = core + '[cx - 90, ys];';
    rp.property("ADBE Ramp-0003").expression = core + '[cx + 90, ye];';
    rp.property("ADBE Ramp-0002").setValue([1, 1, 1, 1]);
    rp.property("ADBE Ramp-0004").setValue([0, 0, 0, 1]);
    var tn = fxAdd(layer, "CC Toner");
    tn.property("CC Toner-0005").setValue(3);
    tn.property("CC Toner-0001").setValue([0.98, 0.94, 0.86, 1]);  // white-hot
    tn.property("CC Toner-0006").setValue([0.80, 0.58, 0.32, 1]);  // straw
    tn.property("CC Toner-0002").setValue([0.56, 0.32, 0.22, 1]);  // bronze
    tn.property("CC Toner-0007").expression = 'var a = [0.56, 0.32, 0.22, 1], b = ' + P3 + '; add(a, mul(sub(b, a), 0.6));';
    tn.property("CC Toner-0003").expression = P3 + ';';            // settles into the accent (blued steel)
    var g = fxAdd(layer, "ADBE Glo2");
    g.property("ADBE Glo2-0002").setValue(150);
    g.property("ADBE Glo2-0003").setValue(40);
    g.property("ADBE Glo2-0004").expression = lib + 'var q = cl((time - PS[0] - 0.25)/Math.max(1.4, (thisComp.duration - PS[0])*0.8));\nlinear(q, 0, 0.3, 0.7, 0);';
}
function glowBlue(layer, radius, intensity) {
    var g = fxAdd(layer, "ADBE Glo2");
    g.property("ADBE Glo2-0002").setValue(30);
    g.property("ADBE Glo2-0003").setValue(radius);
    g.property("ADBE Glo2-0004").setValue(intensity);
    g.property("ADBE Glo2-0007").setValue(2);
    g.property("ADBE Glo2-0012").expression = P3 + ';';
    g.property("ADBE Glo2-0013").expression = P3 + ';';
    return g;
}
// ---- seams: razor lines of light along each cut, fired at the lock
function seamLayer(comp, name, count, pathFn, lockFn, lib, gateExpr) {
    var s = comp.layers.addShape();
    s.name = name;
    var root = s.property("ADBE Root Vectors Group");
    var k;
    for (k = 1; k <= count; k++) {
        var g = root.addProperty("ADBE Vector Group");
        var gv = g.property("ADBE Vectors Group");
        gv.addProperty("ADBE Vector Shape - Group");
        gv.addProperty("ADBE Vector Graphic - Stroke");
        gv.addProperty("ADBE Vector Filter - Trim");
    }
    for (k = 1; k <= count; k++) {
        var gv2 = root.property(k).property("ADBE Vectors Group");
        gv2.property(1).property("ADBE Vector Shape").expression = lib + pathFn(k);
        var st = gv2.property(2);
        st.property("ADBE Vector Stroke Width").setValue(2);
        st.property("ADBE Vector Stroke Color").setValue([0.94, 0.96, 1]);
        st.property("ADBE Vector Stroke Line Cap").setValue(2);
        st.property("ADBE Vector Stroke Opacity").expression = lib + lockFn(k) +
            '(k < NS && u >= 0 && u < 0.5 && ' + gateExpr + ') ? 100*(0.55 + 0.45*FORM)*(1 - cl((u - 0.28)/0.2)) : 0;';
        var tm = gv2.property(3);
        tm.property("ADBE Vector Trim End").expression = lib + lockFn(k) + 'eo(u/0.3)*100;';
        tm.property("ADBE Vector Trim Start").expression = lib + lockFn(k) + 'eo((u - 0.09)/0.42)*100;';
    }
    glowBlue(s, 16, 2.2);
    s.blendingMode = BlendingMode.ADD;
    return s;
}

// ---- the text engine: a RIG (zone placement/scale/rotation per phrase) carrying NT band slices + seams
function engineText(shot, tcomp, spec) {
    var lib = engineLib('thisLayer.source', spec);
    var tname = tcomp.name;
    var base = tname.replace("-text", "");
    var rig = shot.layers.addNull(DUR);
    rig.name = base + " text rig";
    rig.enabled = false;
    tr(rig, "ADBE Anchor Point").setValue([0, 0]);
    tr(rig, "ADBE Position").setValue([0, 0]);
    var slices = [];
    for (var i = 0; i < NT; i++) {
        var Ly = shot.layers.add(tcomp);
        Ly.name = tname;
        Ly.collapseTransformation = true;
        tr(Ly, "ADBE Position").setValue([tcomp.width / 2, tcomp.height / 2]);
        var m = Ly.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        m.property("ADBE Mask Shape").expression = lib + sliceMask(i);
        m.property("ADBE Mask Offset").setValue(1);
        if (spec.temper) {
            temperFx(Ly, lib, i);
        } else {
            var f = fxAdd(Ly, "ADBE Fill");
            f.property("ADBE Fill-0002").expression = lib + '(Z[7] == 1) ? ' + P1 + ' : ' + P2 + ';';
            steelTypeSweep(Ly);
            lockGlint(Ly, lib, i);
        }
        var db = fxAdd(Ly, "ADBE Motion Blur");
        db.property("ADBE Motion Blur-0001").setValue(90 + spec.ang);
        db.property("ADBE Motion Blur-0002").expression = lib + textProg2(i) +
            '(pIn < 0.03 || (pIn > 0.999 && pO < 0.001)) ? 0 : Math.min(70, length(transform.position.velocity)/42);';
        Ly.parent = rig;
        tr(Ly, "ADBE Position").expression = lib + textProg2(i) + SLICE_POS_TAIL;
        tr(Ly, "ADBE Opacity").expression = lib + textProg2(i) + SLICE_OP_TAIL;
        slices.push(Ly);
    }
    var slib = engineLib('thisComp.layer("' + tname + '").source', spec);
    var sm = seamLayer(shot, base + " seams", NT - 1, seamPath2, seamLock2, slib, 'EVENT');
    tr(sm, "ADBE Anchor Point").setValue([0, 0]);
    tr(sm, "ADBE Position").setValue([0, 0]);
    sm.parent = rig;
    tr(sm, "ADBE Position").expression = slib + 'var R = rectC(); [-(R[0] + R[2])/2, -(R[1] + R[3])/2];';
    // the rig: every phrase fits its zone (scale), sits on its alignment, takes its rotation
    var rlib = slib;
    tr(rig, "ADBE Position").expression = rlib + ZONEFIT + '[cx, cy];';
    tr(rig, "ADBE Scale").expression = rlib + ZONEFIT + 'var k = s*100*(1 + 0.025*FLOW*cl((time - Math.max(0, t0))/2.2)); [k, k];';
    tr(rig, "ADBE Rotate Z").expression = rlib + 'Z[6];';
    return { rig: rig, slices: slices, seams: sm, lib: slib };
}
function steelTypeSweep(layer) {
    var sw = fxAdd(layer, "CC Light Sweep");
    sw.property("CC Light Sweep-0001").expression = TRI +
        'var P = linear(FLOW, 0, 1, 11, 4.8); var ph = (time % P)/P;\n' +
        'var Wd = thisLayer.source.width, Hd = thisLayer.source.height;\n' +
        '[linear(ph, 0, 1, -800, Wd + 800), Hd/2];';
    sw.property("CC Light Sweep-0002").setValue(-26);
    sw.property("CC Light Sweep-0003").setValue(2);
    sw.property("CC Light Sweep-0004").setValue(230);
    sw.property("CC Light Sweep-0005").expression = TRI + '18 + 30*FORM;';
    sw.property("CC Light Sweep-0006").setValue(0);
    sw.property("CC Light Sweep-0007").setValue(0);
    sw.property("CC Light Sweep-0008").setValue([1, 1, 1, 1]);
}
// ---- planes: the FRAME itself is re-cut per composition — planes shear in along their edge
var PLANE_MOVE =
    'var pin = eo((time - BT0)/linear(FLOW, 0, 1, 0.95, 0.62));\n' +
    'var pout = (BT1 > 1e5) ? 0 : ei((time - (BT1 - 0.22))/0.22);\n' +
    'var po = Math.max(pout, ei((ex - 0.6)/0.4));\n' +
    'var D = 40 + 1500*FLOW;\n' +
    'var off = -D*(1 - pin) + D*po;\n';
function makePlanes(shot, textName, spec, below) {
    var lib = engineLib('thisComp.layer("' + textName + '").source', spec);
    var made = [];
    for (var par = 0; par < 2; par++) {
        var pl = shot.layers.addShape();
        pl.name = "planes " + (par === 0 ? "A" : "B");
        tr(pl, "ADBE Position").setValue([0, 0]);
        var root = pl.property("ADBE Root Vectors Group");
        for (var tone = 0; tone < 2; tone++) {
            var g = root.addProperty("ADBE Vector Group");
            g.name = tone === 0 ? "dark plane" : "silver plane";
            var gv = g.property("ADBE Vectors Group");
            gv.addProperty("ADBE Vector Shape - Group");
            gv.addProperty("ADBE Vector Graphic - Fill");
        }
        for (var tone2 = 0; tone2 < 2; tone2++) {
            var gv2 = root.property(tone2 + 1).property("ADBE Vectors Group");
            gv2.property(1).property("ADBE Vector Shape").expression = lib +
                'var PAR = ' + par + ', TONE = ' + tone2 + ';\n' +
                'var show = (IDX >= 1) && (B % 2 == PAR);\n' +
                'var pl = null; if (show) { for (var j = 0; j < CK.p.length; j++) { if (CK.p[j][0] == TONE) pl = CK.p[j][1]; } }\n' +
                'var res;\n' +
                'if (!pl) { res = createPath([[0, 0], [0, 0.1], [0.1, 0]], [], [], true); } else {\n' +
                PLANE_MOVE +
                '  var pts = []; for (var j = 0; j < pl.length; j++) pts.push([pl[j][0] + CK.d[0]*off, pl[j][1] + CK.d[1]*off]);\n' +
                '  res = createPath(pts, [], [], true);\n' +
                '}\n' +
                'res;';
            gv2.property(2).property("ADBE Vector Fill Color").expression = tone2 === 0 ?
                ('var a = ' + P1 + ', b = ' + P2 + '; add(a, mul(sub(b, a), 0.075));') :
                ('var b = ' + P2 + '; [b[0]*0.93, b[1]*0.93, b[2]*0.93, 1];');
        }
        var sw = fxAdd(pl, "CC Light Sweep");
        sw.property("CC Light Sweep-0001").expression = TRI + 'var P = linear(FLOW, 0, 1, 13, 6); var ph = ((time + 1.5) % P)/P; [linear(ph, 0, 1, -900, 1980), 960];';
        sw.property("CC Light Sweep-0002").setValue(-28); sw.property("CC Light Sweep-0003").setValue(2);
        sw.property("CC Light Sweep-0004").setValue(420); sw.property("CC Light Sweep-0005").setValue(16);
        sw.property("CC Light Sweep-0006").setValue(0);
        pl.moveAfter(below);
        made.push(pl);
        // the plane's cut edge catches the light when it locks
        var ed = shot.layers.addShape();
        ed.name = "plane edge " + (par === 0 ? "A" : "B");
        tr(ed, "ADBE Position").setValue([0, 0]);
        var eg = ed.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var egv = eg.property("ADBE Vectors Group");
        egv.addProperty("ADBE Vector Shape - Group");
        egv.addProperty("ADBE Vector Graphic - Stroke");
        egv.addProperty("ADBE Vector Filter - Trim");
        egv = ed.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
        var ELOCK = 'var u = time - (BT0 + 0.36);\n';
        egv.property(1).property("ADBE Vector Shape").expression = lib +
            'var PAR = ' + par + ';\n' +
            'var show = (IDX >= 1) && (B % 2 == PAR) && (CK.e != null);\n' +
            'var res;\n' +
            'if (!show) { res = createPath([[0, 0], [0.1, 0]], [], [], false); } else {\n' +
            PLANE_MOVE +
            '  res = createPath([[CK.e[0][0] + CK.d[0]*off, CK.e[0][1] + CK.d[1]*off], [CK.e[1][0] + CK.d[0]*off, CK.e[1][1] + CK.d[1]*off]], [], [], false);\n' +
            '}\n' +
            'res;';
        var est = egv.property(2);
        est.property("ADBE Vector Stroke Width").setValue(2);
        est.property("ADBE Vector Stroke Color").setValue([0.94, 0.96, 1]);
        est.property("ADBE Vector Stroke Line Cap").setValue(2);
        est.property("ADBE Vector Stroke Opacity").expression = lib + 'var PAR = ' + par + ';\n' + ELOCK +
            '((IDX >= 1) && (B % 2 == PAR) && CK.e != null && u >= 0 && u < 0.6) ? 100*(0.5 + 0.5*FORM)*(1 - cl((u - 0.38)/0.22)) : 0;';
        egv.property(3).property("ADBE Vector Trim End").expression = lib + ELOCK + 'eo(u/0.4)*100;';
        egv.property(3).property("ADBE Vector Trim Start").expression = lib + ELOCK + 'eo((u - 0.12)/0.5)*100;';
        glowBlue(ed, 16, 2.2);
        ed.blendingMode = BlendingMode.ADD;
        ed.moveBefore(below);
        made.push(ed);
    }
    return made;
}
function makeCamera(comp) {
    var a = comp.layers.addSolid([1, 1, 1], "CAMERA drift", W, H, 1, DUR);
    a.adjustmentLayer = true;
    var g = fxAdd(a, "ADBE Geometry2");
    g.property("ADBE Geometry2-0003").expression = TRI + '100 + 3.5*FLOW*(time/thisComp.duration);';
    a.moveToBeginning();
    return a;
}
// ---- the media shear stack: NM copies of {shot}-frame, graded to cold steel
function gradeMedia(layer) {
    var t = fxAdd(layer, "ADBE Tint");
    t.property("ADBE Tint-0001").expression = 'var a = ' + P1 + ', b = ' + P3 + '; var c = add(a, mul(sub(b, a), 0.16)); [c[0]*0.9, c[1]*0.9, c[2]*0.9, 1];';
    t.property("ADBE Tint-0002").expression = 'var b = ' + P2 + '; [Math.min(1, b[0]*1.08), Math.min(1, b[1]*1.08), Math.min(1, b[2]*1.08), 1];';
    t.property("ADBE Tint-0003").expression = TRI + '72 + 24*FORM;';
    var lv = fxAdd(layer, "ADBE Easy Levels2");
    lv.property("ADBE Easy Levels2-0003").setValue(0.035);
    lv.property("ADBE Easy Levels2-0004").setValue(0.93);
    lv.property("ADBE Easy Levels2-0005").setValue(0.9);
}
function shearMedia(shot, fcomp, pos, o) {
    var lib = stripLib(o.nMin, o.nMax, o.ang, o.seed || 71);
    var matte = null;
    if (o.clip) {
        matte = shot.layers.addSolid([1, 1, 1], fcomp.name.replace("-frame", "") + " window", fcomp.width, fcomp.height, 1, DUR);
        tr(matte, "ADBE Position").setValue(pos);
    }
    var strips = [];
    for (var j = 0; j < NM; j++) {
        var Ly = shot.layers.add(fcomp);
        Ly.name = fcomp.name;
        tr(Ly, "ADBE Position").setValue(pos);
        var m = Ly.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        m.property("ADBE Mask Shape").expression = lib + stripMask(j, o.orient);
        m.property("ADBE Mask Offset").setValue(1);
        gradeMedia(Ly);
        var dbm = fxAdd(Ly, "ADBE Motion Blur");
        dbm.property("ADBE Motion Blur-0001").setValue(o.orient === "v" ? o.ang : 90 + o.ang);
        dbm.property("ADBE Motion Blur-0002").expression = 'Math.min(80, length(transform.position.velocity)/40);';
        tr(Ly, "ADBE Scale").expression = TRI + 'var s = 100 + 6*FLOW*(time/thisComp.duration); [s, s];';
        tr(Ly, "ADBE Position").expression = lib + stripProg(j) + stripPosTail(o.orient, o.travel);
        tr(Ly, "ADBE Opacity").expression = lib + stripProg(j) + STRIP_OP_TAIL;
        strips.push(Ly);
    }
    if (matte) {
        for (var q = 0; q < strips.length; q++) strips[q].setTrackMatte(matte, TrackMatteType.ALPHA);
        matte.enabled = false;
    }
    var pathFn = function (k) { return stripSeamPath(k, o.orient).replace("%W%", String(fcomp.width)).replace("%H%", String(fcomp.height)); };
    var sm = seamLayer(shot, fcomp.name.replace("-frame", "") + " media seams", NM - 1, pathFn, stripSeamLock, lib, 'true');
    tr(sm, "ADBE Anchor Point").setValue([fcomp.width / 2, fcomp.height / 2]);
    tr(sm, "ADBE Position").setValue(pos);
    var all = strips.slice(0); all.push(sm); if (matte) all.push(matte);
    return all;
}

// ---- adaptive layout: a media-only section re-centres the plate instead of leaving a void
function hasTextExpr(textName) {
    return 'var tb = thisComp.layer("' + textName + '").source.layer("textBlock");\n' +
        'var hasText = tb.sourceRectAtTime(thisComp.duration/2, false).width > 1;\n';
}
function layoutRig(shot, name, pos, textName, emptyPos, extra) {
    var r = shot.layers.addNull(DUR);
    r.name = name;
    r.enabled = false;
    tr(r, "ADBE Position").setValue(pos);
    tr(r, "ADBE Position").expression = hasTextExpr(textName) + 'hasText ? value : [' + emptyPos[0] + ', ' + emptyPos[1] + '];';
    for (var i = 0; i < extra.length; i++) extra[i].parent = r;
    return r;
}
// ---- atmosphere
function makeBG(comp) {
    var bg = comp.layers.addSolid([0, 0, 0], "BG", W, H, 1, DUR);
    fillFx(bg, 1);
    bg.moveToEnd();
    return bg;
}
// the softbox: one soft band of reflected light gliding across blackened steel
function makeSheen(comp, strength, tintIdx) {
    var s = comp.layers.addSolid([1, 1, 1], "softbox", 4200, 2400, 1, DUR);
    fillFx(s, tintIdx || 2);
    var m = s.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var sh = new Shape(); sh.vertices = [[900, 1000], [3300, 1000], [3300, 1400], [900, 1400]]; sh.closed = true;
    m.property("ADBE Mask Shape").setValue(sh);
    m.property("ADBE Mask Feather").setValue([800, 700]);
    tr(s, "ADBE Rotate Z").setValue(-24);
    tr(s, "ADBE Position").expression = TRI +
        'var P = linear(FLOW, 0, 1, 26, 12); var ph = ((time + 3) % P)/P;\n' +
        '[linear(ph, 0, 1, -900, 2000), linear(ph, 0, 1, 1500, 380)];';
    tr(s, "ADBE Opacity").expression = TRI + '(' + strength + ')*(0.6 + 0.6*FORM);';
    s.blendingMode = BlendingMode.ADD;
    return s;
}
function makePool(comp, x, y, strength) {
    var p = comp.layers.addSolid([1, 1, 1], "light pool", W, H, 1, DUR);
    var r = fxAdd(p, "ADBE Ramp");
    r.property("ADBE Ramp-0001").setValue([x, y]); r.property("ADBE Ramp-0002").setValue([1, 1, 1, 1]);
    r.property("ADBE Ramp-0003").setValue([x + 900, y + 600]); r.property("ADBE Ramp-0004").setValue([0, 0, 0, 1]);
    r.property("ADBE Ramp-0005").setValue(2);
    p.blendingMode = BlendingMode.ADD;
    tr(p, "ADBE Opacity").setValue(strength);
    return p;
}
function makeVignette(comp, strength) {
    var v = comp.layers.addSolid([1, 1, 1], "vignette", W, H, 1, DUR);
    var r = fxAdd(v, "ADBE Ramp");
    r.property("ADBE Ramp-0001").setValue([W / 2, H * 0.46]); r.property("ADBE Ramp-0002").setValue([1, 1, 1, 1]);
    r.property("ADBE Ramp-0003").setValue([W * 1.1, H * 1.05]); r.property("ADBE Ramp-0004").setValue([0, 0, 0, 1]);
    r.property("ADBE Ramp-0005").setValue(2);
    v.blendingMode = BlendingMode.MULTIPLY;
    tr(v, "ADBE Opacity").setValue(strength);
    return v;
}
function makeFinish(comp) {
    var a = comp.layers.addSolid([1, 1, 1], "FINISH grain", W, H, 1, DUR);
    a.adjustmentLayer = true;
    var n = fxAdd(a, "ADBE Noise");
    n.property("ADBE Noise-0001").expression = TRI + '1.8 + 1.6*PRES;';
    n.property("ADBE Noise-0002").setValue(0);
    a.moveToBeginning();
    return a;
}
// ---- furniture: chapter numeral (from the director's comp name), hairline, blued pin
var FURN_OP = HDR + 'var g = cl(linear(FORM, 0.18, 0.38, 0, 1));\n100*g*qo(en/0.7)*(1 - cl((ex - 0.55)/0.3));';
function makeFurniture(comp, y) {
    var t = makeText(comp, "01", FONT_M, 20, ParagraphJustification.LEFT_JUSTIFY, 40, true);
    t.name = "chapter";
    fillFx(t, 2);
    textDoc(t).expression =
        'var n = thisComp.name.split("-"); var v = parseInt(n[n.length - 1], 10);\n' +
        'var s = (n.length > 1 && !isNaN(v)) ? v + 1 : 1;\n' +
        '(s < 10 ? "0" : "") + s;';
    tr(t, "ADBE Position").setValue([72, y + 7]);
    tr(t, "ADBE Opacity").expression = FURN_OP.replace("100*g", "62*g");
    var hl = hairlineRect(comp, "hairline", 830, 1, 2);
    tr(hl, "ADBE Anchor Point").setValue([-415, 0]);
    tr(hl, "ADBE Position").setValue([150, y]);
    tr(hl, "ADBE Scale").expression = HDR + '[100*qo((en - 0.05)/0.8), 100];';
    tr(hl, "ADBE Opacity").expression = FURN_OP.replace("100*g", "30*g");
    var pin = hairlineRect(comp, "blued pin", 8, 8, 3);
    tr(pin, "ADBE Position").setValue([1004, y]);
    tr(pin, "ADBE Opacity").expression = FURN_OP.replace("qo(en/0.7)", "cl((en - 0.6)/0.1)");
    return t;
}
function makeCropMarks(comp, x0, y0, x1, y1) {
    var s = comp.layers.addShape();
    s.name = "crop marks";
    var root = s.property("ADBE Root Vectors Group");
    var off = 16, len = 26;
    var corners = [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]];
    var c;
    for (c = 0; c < 4; c++) {
        var g = root.addProperty("ADBE Vector Group");
        var gv = g.property("ADBE Vectors Group");
        gv.addProperty("ADBE Vector Shape - Group");
        gv.addProperty("ADBE Vector Shape - Group");
        gv.addProperty("ADBE Vector Graphic - Stroke");
    }
    for (c = 0; c < 4; c++) {
        var cc = corners[c];
        var gv3 = root.property(c + 1).property("ADBE Vectors Group");
        var a = new Shape(); a.vertices = [[cc[0] + cc[2] * off, cc[1]], [cc[0] + cc[2] * (off + len), cc[1]]]; a.closed = false;
        var b = new Shape(); b.vertices = [[cc[0], cc[1] + cc[3] * off], [cc[0], cc[1] + cc[3] * (off + len)]]; b.closed = false;
        gv3.property(1).property("ADBE Vector Shape").setValue(a);
        gv3.property(2).property("ADBE Vector Shape").setValue(b);
        gv3.property(3).property("ADBE Vector Stroke Width").setValue(1.5);
        gv3.property(3).property("ADBE Vector Stroke Color").expression = P2 + ';';
    }
    tr(s, "ADBE Position").setValue([0, 0]);
    tr(s, "ADBE Opacity").expression = HDR + 'var g = cl(linear(FORM, 0.45, 0.7, 0, 1));\n55*g*qo((en - 0.3)/0.5)*(1 - cl((ex - 0.5)/0.3));';
    return s;
}

// ---------------------------------------------------------------- build
try {
    app.beginUndoGroup("build steel v3");
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (ce) {}
    app.newProject();

    var mainComp = app.project.items.addComp("mainComp", W, H, 1, 30, FPS);
    var shotsF = app.project.items.addFolder("ORIGINAL_SHOTS");
    var preF = app.project.items.addFolder("PRECOMPS");

    var mc = mainComp.layers.addNull(30);
    mc.name = "mainControl";
    addSlider(mc, "FORM", 55);
    addSlider(mc, "FLOW", 60);
    addSlider(mc, "PRESSURE", 30);
    addColor(mc, "1", C1);
    addColor(mc, "2", C2);
    addColor(mc, "3", C3);
    L("mainComp ok");

    // ---- compositions: planes [tone 0 dark | 1 silver, polygon], d = shear direction (along the cut), e = cut edge
    var C_VOID = '{p: [], d: [1, 0], e: null, z: [[72, 300, 936, 1320, 0, 1, 0, 2], [72, 180, 936, 620, 0, 0, 0, 2]]}';
    var C_HORIZON = '{p: [[0, [[-300, 1195], [1380, 1017], [1380, 2300], [-300, 2300]]]], d: [0.9944, -0.1054], e: [[-300, 1195], [1380, 1017]], z: [[72, 230, 936, 740, 0, 2, 0, 2], [72, 1240, 936, 560, 0, 0, 0, 2]]}';
    var C_SLAB = '{p: [[1, [[838, -300], [1380, -300], [1380, 2300], [872, 2300]]]], d: [0.0131, 0.9999], e: [[838, -300], [872, 2300]], z: [[72, 230, 720, 820, 0, 0, 0, 2], [72, 1000, 720, 790, 0, 2, 0, 2]]}';
    var C_DIAGONAL = '{p: [[0, [[-300, 1472], [1380, 467], [1380, 2300], [-300, 2300]]]], d: [0.8582, -0.5134], e: [[-300, 1472], [1380, 467]], z: [[72, 170, 936, 470, 0, 0, 0, 2], [72, 1300, 936, 490, 2, 2, 0, 2]]}';
    var C_INVERT = '{p: [[1, [[-300, 800], [1380, 730], [1380, 2300], [-300, 2300]]]], d: [0.9991, -0.0416], e: [[-300, 800], [1380, 730]], z: [[72, 860, 936, 900, 0, 1, 0, 1], [72, 170, 936, 520, 0, 2, 0, 2]]}';
    var C_MONUMENT = '{p: [], d: [1, 0], e: null, z: [[72, 250, 936, 1420, 0, 1, 0, 2]]}';
    var SPEC01 = { nMin: 2, nMax: 7, ang: -7, landing: true,
        comps: '[' + [C_VOID, C_HORIZON, C_SLAB, C_DIAGONAL, C_INVERT, C_MONUMENT].join(', ') + ']',
        rich: '[1, 2, 3, 4, 0]', plain: '[1, 3, 0]' };
    var SPEC05 = { nMin: 2, nMax: 6, ang: -7, landing: true, temper: true,
        comps: '[' + [C_VOID, C_HORIZON, C_DIAGONAL, C_MONUMENT].join(', ') + ']',
        rich: '[1, 2, 0]', plain: '[1, 2, 0]' };
    function single(zone, nMax) {
        return { nMin: 2, nMax: nMax, ang: -7, landing: false, rich: '[0]', plain: '[0]',
            comps: '[{p: [], d: [1, 0], e: null, z: [' + zone + ']}]' };
    }

    function newShot(name) {
        var s = app.project.items.addComp(name, W, H, 1, DUR, FPS);
        s.parentFolder = shotsF;
        makeBG(s);
        makeController(s);
        return s;
    }

    // ============================================================ 01 MONOLITH — text only
    var t01 = makeTextComp("01-text", 936, 1500, "HARDER THAN IT LOOKS", 420, zoneStackExpr(SPEC01), preF);
    var s01 = newShot("01");
    makePool(s01, 540, 520, 6);
    makeSheen(s01, 6, 2);
    var vig01 = makeVignette(s01, 45);
    engineText(s01, t01, SPEC01);
    makePlanes(s01, "01-text", SPEC01, vig01);
    makeFurniture(s01, 100);
    makeCamera(s01);
    makeFinish(s01);
    L("01 ok");

    // ============================================================ 02 SLIT — media only, two black-steel doors part
    var t02 = makeTextComp("02-text", 900, 200, "", 80, false, preF);
    var f02 = makeFrameComp("02-frame", W, H, preF);
    var s02 = newShot("02");
    var med02 = s02.layers.add(f02); med02.name = "02-frame";
    gradeMedia(med02);
    tr(med02, "ADBE Scale").expression = TRI + 'var s = 100 + 7*FLOW*(time/thisComp.duration); [s, s];';
    makeVignette(s02, 50);
    var lt02 = s02.layers.add(t02); lt02.name = "02-text";
    tr(lt02, "ADBE Position").setValue([540, 1700]);
    var DOOR = HDR +
        'var D = (FORM <= 0.5) ? 1180 : linear(FORM, 0.5, 1, 1180, 520);\n' +
        'var pOpen = cio((en - 0.2)/0.74);\n' +
        'var pClose = ci((ex - 0.42)/0.5);\n' +
        'var o = (FLOW < 0.08) ? D : D*pOpen*(1 - pClose);\n';
    var doors = [["door top", -1], ["door bottom", 1]];
    for (var di = 0; di < 2; di++) {
        var dr = s02.layers.addSolid([1, 1, 1], doors[di][0], 1240, 1160, 1, DUR);
        fillFx(dr, 1);
        var rp = fxAdd(dr, "ADBE Ramp");
        var edgeY = doors[di][1] < 0 ? 1160 : 0;
        rp.property("ADBE Ramp-0001").setValue([620, edgeY]);
        rp.property("ADBE Ramp-0003").setValue([620, doors[di][1] < 0 ? 0 : 1160]);
        rp.property("ADBE Ramp-0002").expression = 'var a = ' + P1 + ', b = ' + P2 + '; add(a, mul(sub(b, a), 0.13));';
        rp.property("ADBE Ramp-0004").expression = P1 + ';';
        var sw = fxAdd(dr, "CC Light Sweep");
        sw.property("CC Light Sweep-0001").expression = TRI + 'var P = linear(FLOW, 0, 1, 14, 7); var ph = ((time + 2) % P)/P; fromComp([linear(ph, 0, 1, -700, 1780), 960]);';
        sw.property("CC Light Sweep-0002").setValue(-32); sw.property("CC Light Sweep-0003").setValue(2);
        sw.property("CC Light Sweep-0004").setValue(150); sw.property("CC Light Sweep-0005").setValue(22);
        sw.property("CC Light Sweep-0006").setValue(0);
        tr(dr, "ADBE Anchor Point").setValue([620, edgeY]);
        tr(dr, "ADBE Position").setValue([540, 960]);
        tr(dr, "ADBE Position").expression = DOOR + '[value[0], value[1] + ' + doors[di][1] + '*o];';
        // machined edge catching the light
        var ed = hairlineRect(s02, doors[di][0] + " edge", 1240, 2, 2);
        tr(ed, "ADBE Position").setValue([540, 960 + doors[di][1] * 1]);
        tr(ed, "ADBE Position").expression = DOOR + '[value[0], value[1] + ' + doors[di][1] + '*o];';
        tr(ed, "ADBE Opacity").expression = DOOR + '(o > 1 && o < D - 2) ? 70 : 0;';
        glowBlue(ed, 10, 1.2);
    }
    // the crack of light along the closed seam, before the doors part and again as they meet
    var crack = hairlineRect(s02, "crack of light", 1080, 2, 2);
    tr(crack, "ADBE Position").setValue([540, 960]);
    tr(crack, "ADBE Anchor Point").setValue([-540, 0]);
    tr(crack, "ADBE Position").setValue([0, 960]);
    tr(crack, "ADBE Scale").expression = HDR + 'var a = eo(en/0.2), b = eo((ex - 0.9)/0.1); [100*Math.max(a*(1 - cl((en - 0.3)/0.1)), b), 100];';
    tr(crack, "ADBE Opacity").expression = HDR + 'var on1 = en < 0.34 ? 1 : 0, on2 = ex > 0.9 ? 1 : 0; 100*Math.max(on1, on2)*(FLOW < 0.08 ? 0 : 1);';
    glowBlue(crack, 22, 2.6);
    crack.blendingMode = BlendingMode.ADD;
    makeFurniture(s02, 100);
    makeCamera(s02);
    makeFinish(s02);
    L("02 ok");

    // ============================================================ 03 SHEAR — media panel in vertical strips + text
    var SPEC03 = single('[72, 1210, 936, 590, 0, 1, 0, 2]', 5);
    var t03 = makeTextComp("03-text", 936, 600, "BUILT TO OUTLAST", 300, zoneStackExpr(SPEC03), preF);
    var f03 = makeFrameComp("03-frame", 936, 1000, preF);
    var s03 = newShot("03");
    makeSheen(s03, 5, 2);
    var m03 = shearMedia(s03, f03, [540, 650], { nMin: 2, nMax: 6, ang: 5, orient: "v", clip: true, travel: 'Hd*(0.04 + 0.5*FLOW)', seed: 71 });
    m03.push(makeCropMarks(s03, 72, 150, 1008, 1150));
    makeVignette(s03, 40);
    engineText(s03, t03, SPEC03);
    layoutRig(s03, "panel rig", [540, 650], "03-text", [540, 960], m03);
    makeFurniture(s03, 100);
    makeCamera(s03);
    makeFinish(s03);
    L("03 ok");

    // ============================================================ 04 SECTION — full-bleed media sheared on the diagonal + text
    var SPEC04 = single('[72, 1150, 936, 650, 0, 2, 0, 2]', 5);
    var t04 = makeTextComp("04-text", 936, 620, "ONE LINE HOLDS", 300, zoneStackExpr(SPEC04), preF);
    var f04 = makeFrameComp("04-frame", W, H, preF);
    var s04 = newShot("04");
    shearMedia(s04, f04, [540, 960], { nMin: 2, nMax: 3, ang: -24, orient: "h", clip: false, travel: '60 + 300*FLOW', seed: 91 });
    var scrim = s04.layers.addSolid([0, 0, 0], "scrim", 1700, 2000, 1, DUR);
    fillFx(scrim, 1);
    var smk = scrim.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var ssh = new Shape(); ssh.vertices = [[-200, 300], [1900, 300], [1900, 2200], [-200, 2200]]; ssh.closed = true;
    smk.property("ADBE Mask Shape").setValue(ssh);
    smk.property("ADBE Mask Feather").setValue([0, 600]);
    tr(scrim, "ADBE Position").setValue([540, 1960]);
    tr(scrim, "ADBE Opacity").setValue(94);
    makeVignette(s04, 40);
    engineText(s04, t04, SPEC04);
    tr(scrim, "ADBE Opacity").expression = hasTextExpr("04-text") + 'hasText ? value : 0;';
    makeFurniture(s04, 100);
    makeCamera(s04);
    makeFinish(s04);
    L("04 ok");

    // ============================================================ 05 TEMPER — text only, heat-tint cooling into blued steel
    var t05 = makeTextComp("05-text", 936, 1500, "TEMPERED BY TIME", 380, zoneStackExpr(SPEC05), preF);
    var s05 = newShot("05");
    makePool(s05, 540, 1500, 5);
    makeSheen(s05, 5, 3);
    var vig05 = makeVignette(s05, 50);
    engineText(s05, t05, SPEC05);
    makePlanes(s05, "05-text", SPEC05, vig05);
    makeFurniture(s05, 100);
    makeCamera(s05);
    makeFinish(s05);
    L("05 ok");

    // ============================================================ 06 COLUMN — vertical monumental line + tall media panel
    var t06 = makeTextComp("06-text", 1700, 300, "SOMETHING HARDER", 300, false, preF);
    var f06 = makeFrameComp("06-frame", 612, 1700, preF);
    var s06 = newShot("06");
    makeSheen(s06, 5, 2);
    var m06 = shearMedia(s06, f06, [702, 960], { nMin: 2, nMax: 5, ang: 4, orient: "h", clip: true, travel: 'Wd*(0.06 + 0.6*FLOW)', seed: 111 });
    m06.push(makeCropMarks(s06, 396, 110, 1008, 1810));
    makeVignette(s06, 40);
    engineText(s06, t06, single('[72, 110, 300, 1700, 1, 1, -90, 2]', 4));
    layoutRig(s06, "panel rig", [702, 960], "06-text", [540, 960], m06);
    makeCamera(s06);
    makeFinish(s06);
    L("06 ok");

    app.endUndoGroup();

    // ---- expression audit (repair once, then report)
    var bad = [];
    function walk(g, comp, ly, path) {
        for (var k = 1; k <= g.numProperties; k++) {
            var p = g.property(k);
            if (p.propertyType === PropertyType.PROPERTY) {
                try {
                    if (p.canSetExpression && p.expression !== "" && (p.expressionEnabled === false || p.expressionError)) {
                        var ee = p.expression; p.expression = ""; p.expression = ee;
                        try { p.expressionEnabled = true; } catch (x1) {}
                    }
                    if (p.canSetExpression && p.expression !== "" && (p.expressionEnabled === false || p.expressionError)) {
                        bad.push(comp.name + "/" + ly.name + "/" + path + p.name + ": " + p.expressionError);
                    }
                } catch (e0) {}
            } else { walk(p, comp, ly, path + p.name + "/"); }
        }
    }
    for (var ci = 1; ci <= app.project.numItems; ci++) {
        var it = app.project.item(ci);
        if (it instanceof CompItem) { for (var li = 1; li <= it.numLayers; li++) walk(it.layer(li), it, it.layer(li), ""); }
    }
    L("expression issues: " + bad.length);
    for (var bi = 0; bi < bad.length && bi < 30; bi++) L("  " + bad[bi]);
    app.project.save(new File(OUT_AEP));
    L("saved " + OUT_AEP);
} catch (e) {
    try { app.endUndoGroup(); } catch (e2) {}
    L("ERROR line " + e.line + ": " + e.toString());
}
app.endSuppressDialogs(false);
aeWrite(log.join("\r\n"));
