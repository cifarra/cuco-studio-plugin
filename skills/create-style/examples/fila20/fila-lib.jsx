// FILA20 "Fila 20": the screen seen from row 20. Masking, cue, ring.
// FILA_BUILD({ sim, photos, logo }) builds the whole style into the open project.
function FILA_BUILD(opts) {
    var SIM = !!opts.sim, PHOTOS = opts.photos || [], LOGO = opts.logo;
    var log = [];
    var W = 1080, H = 1920, FPS = 24, DUR = 10;
    function hx(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, 1]; }
    var BLACK = hx("#121212"), WHITE = hx("#FFFFFF"), SILVER = hx("#B1A798");
    var F_CAPS = "AvenirNext-Bold", F_SUB = "AvenirNext-DemiBold";

    // ------------------------------------------------------------ expression library (infrastructure)
    var TRI =
        'var MC = comp("mainComp").layer("mainControl");\n' +
        'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n' +
        'var C1 = MC.effect("1")("Color").value, C2 = MC.effect("2")("Color").value, C3 = MC.effect("3")("Color").value;\n';
    var FN =
        'function cl(p) { return Math.max(0, Math.min(1, p)); }\n' +
        'function sm(p) { p = cl(p); return p*p*(3 - 2*p); }\n' +                          // the masking motor: smooth start and stop
        'function mech(p) { p = cl(p); return p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3)/2; }\n' +
        'function lerp(a, b, p) { return a + (b - a)*p; }\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n';
    var SECJS = 'var SEC = 0; (function () { var m = thisComp.name.match(/-(\\d+)$/); if (m) SEC = parseInt(m[1], 10); })();\n';
    var CTL =
        'var CT = thisComp.layer("controller"), ENS = CT.effect("enter")("Slider"), EXS = CT.effect("exit")("Slider");\n' +
        'var e0 = 0, x1 = thisComp.duration;\n' +
        'if (ENS.numKeys >= 2) e0 = ENS.key(1).time;\n' +
        'if (EXS.numKeys >= 2) x1 = EXS.key(EXS.numKeys).time;\n' +
        'var TEMPO = 1.2 - 0.4*FLOW;\n' + SECJS;
    var HDR = TRI + FN + CTL;
    var FT = 'Math.round(time*' + FPS + ')/' + FPS;
    // gate weave: the projected image drifts a pixel or two inside the steady masking
    var WEAVE =
        'var WF = Math.floor(time*24), WA = 0.4 + 9*PRES;\n' +
        'var WV = [WA*(0.7*Math.sin(time*1.9 + SEC) + 0.3*(hsh(WF*1.37 + SEC)*2 - 1)), WA*0.7*(0.7*Math.sin(time*1.3 + 2.1 + SEC) + 0.3*(hsh(WF*2.11 + 7 + SEC)*2 - 1))];\n';
    var WVH = 'var PRES = comp("mainComp").layer("mainControl").effect("PRESSURE")("Slider").value/100;\n' +
        'function hsh(n) { var x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }\n' + SECJS + WEAVE;
    // phrases from the text comp's markers: starts, current index, current start/end
    var PHR =
        'function phrs(S) { var m = S.marker, n = m.numKeys, st = [], prev = 1e9;\n' +
        '  for (var k = 1; k <= n; k++) { var c = m.key(k).comment, v = parseFloat(c); if (isNaN(v)) v = 0; if (k == 1 || c == "0" || v < prev) st.push(m.key(k).time); prev = v; }\n' +
        '  var ix = -1; for (var q = 0; q < st.length; q++) if (st[q] <= time + 0.001) ix = q;\n' +
        '  if (n == 0) { st = [0]; ix = 0; }\n' +
        '  return { st: st, ix: ix, t0: ix >= 0 ? st[ix] : -1, t1: (ix + 1 < st.length) ? st[ix + 1] : 1e6 }; }\n';
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
        d.applyFill = true; d.fillColor = rgb || [1, 1, 1]; d.applyStroke = false;
        d.justification = just; d.tracking = tracking;
        if (leading) { d.autoLeading = false; d.leading = leading; }
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
    function addFillV(layer, gname, colorExpr, opac) {
        var g = gget(layer, gname); var f = gv(g).addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").expression = colorExpr;
        if (opac !== undefined) f.property("ADBE Vector Fill Opacity").setValue(opac);
        return f;
    }
    function rectPathJS(wJS, hJS) {   // a rectangle centred on the layer origin
        return 'var w = ' + wJS + ', h = ' + hJS + ';\ncreatePath([[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]], [], [], true);';
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
        var r1 = tb.sourceRectAtTime(phrases[0][0] + 1 / FPS, false);
        log.push("  sim fit " + comp.name + ": " + Math.round(minS) + " px, block " + Math.round(r1.width) + "x" + Math.round(r1.height) + " in " + comp.width + "x" + comp.height);
    }

    // ------------------------------------------------------------ type: size-independent balanced reflow
    // o: { font, caps, trk (expr), cw, lead, maxL, ink (palette slot) }
    function styleExpr(o) {
        return TRI + FN +
            'var s = String(value).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "");\n' +
            'var TRK = ' + o.trk + ', CW = ' + o.cw + ' + TRK/1000, LEAD = ' + o.lead + ';\n' +
            'var res = s, zw = thisComp.width, zh = thisComp.height;\n' +
            'if (s.length > 0) {\n' +
            '  var w = s.split(/\\s+/), u = [], pend = "";\n' +
            '  for (var i = 0; i < w.length; i++) { if (w[i].length <= 2 && i < w.length - 1) { pend += w[i] + " "; } else { u.push(pend + w[i]); pend = ""; } }\n' +
            '  function L(a, b) { var t = 0; for (var k = a; k < b; k++) t += u[k].length + (k > a ? 1 : 0); return t; }\n' +
            '  function bal(nl) { if (nl == 1) return [u.join(" ")]; var bv = 1e9, best = null;\n' +
            '    function rc(start, left, cs) { if (left == 1) { var mxl = L(start, u.length), pv = 0; for (var q = 0; q < cs.length; q++) { mxl = Math.max(mxl, L(pv, cs[q])); pv = cs[q]; } if (mxl < bv) { bv = mxl; best = cs.slice(0); } return; }\n' +
            '      for (var b = start + 1; b <= u.length - left + 1; b++) { cs.push(b); rc(b, left - 1, cs); cs.pop(); } }\n' +
            '    rc(0, nl, []); var out = [], pv = 0; for (var q = 0; q < best.length; q++) { out.push(u.slice(pv, best[q]).join(" ")); pv = best[q]; } out.push(u.slice(pv).join(" ")); return out; }\n' +
            '  var bestL = null, bs = -1;\n' +
            '  for (var nl = 1; nl <= Math.min(' + o.maxL + ', u.length); nl++) {\n' +
            '    var ls = bal(nl), mc = 0, mn = 1e9; for (var j = 0; j < ls.length; j++) { mc = Math.max(mc, ls[j].length); mn = Math.min(mn, ls[j].length); }\n' +
            '    var sc = Math.min(zw/(mc*CW), zh/(nl*LEAD + 0.2))*Math.pow(mn/mc, 0.3);\n' +
            '    if (sc > bs + 0.5) { bs = sc; bestL = ls; } }\n' +
            '  res = bestL.join("\\r");\n' +
            '}\n' +
            'var INK = C' + o.ink + ';\n' +
            'style.setText(res).setAllCaps(' + (o.caps ? 'true' : 'false') + ').setTracking(TRK).setAutoLeading(false).setLeading(style.fontSize*LEAD)' +
            '.setFont("' + o.font + '").setFillColor([INK[0], INK[1], INK[2]]);';
    }
    var preFolder, shotsFolder, footFolder;
    function makeTextComp(name, w, h, sample, size, o) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var tb = makeText(c, sample, o.font, size, o.just || ParagraphJustification.CENTER_JUSTIFY, 0, size * o.lead); tb.name = "textBlock";
        var r = tb.sourceRectAtTime(0, false);
        tr(tb, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr(tb, "ADBE Position").setValue([w / 2, h / 2]);
        textDoc(tb).expression = styleExpr(o);
        return c;
    }
    function slot(shot, tcomp, x, y) {   // the director's text slot, drawn directly (collapsed: crisp at any fitted size)
        var L = shot.layers.add(tcomp); L.name = tcomp.name; L.collapseTransformation = true;
        tr(L, "ADBE Position").setValue([x, y]);
        return L;
    }
    // subtitles: the block's BOTTOM line sits on a fixed baseline, so 1 and 2 lines read like subtitles
    function subtitlePos(x, yBottom) {
        return WVH + 'var S = thisLayer.source, TB = S.layer("textBlock"), ft = ' + FT + ', r = TB.sourceRectAtTime(ft, false);\n' +
            'var b = TB.toComp([r.left, r.top + r.height], ft);\n' +
            '[' + x + ' + WV[0], ' + yBottom + ' - (b[1] - S.height/2) + WV[1]];';
    }
    function shadow(layer, opac, soft) {
        var f = fxAdd(layer, "ADBE Drop Shadow");
        pp(f, "0002").setValue(opac * 2.55);   // opacity 0-255
        pp(f, "0004").setValue(0);              // distance
        pp(f, "0005").setValue(soft);           // softness
    }

    // ------------------------------------------------------------ the logo, from the traced vector
    var lf = new File(LOGO); lf.encoding = "UTF-8"; lf.open("r"); var LG = eval("(" + lf.read() + ")"); lf.close();
    function setShape(prop, q) {
        var s = new Shape(); s.vertices = q.v; s.inTangents = q.i; s.outTangents = q.o; s.closed = true; prop.setValue(s);
    }
    function glyphLayer(comp, name, part, colorExpr) {
        var s = shapeLayer(comp, name); grp(s, "glyph");
        for (var k = 0; k < part.paths.length; k++) {
            var g = gget(s, "glyph"); gv(g).addProperty("ADBE Vector Shape - Group");
            g = gget(s, "glyph"); setShape(gv(g).property(gv(g).numProperties).property("ADBE Vector Shape"), part.paths[k]);
        }
        var f = addFillV(s, "glyph", colorExpr);
        try { f.property("ADBE Vector Fill Rule").setValue(2); } catch (e) {}   // even-odd: the A's and the 0's counters
        return s;
    }
    function ringLayer(comp, name, colorExpr, trimEndExpr, r, sw) {
        var s = shapeLayer(comp, name); grp(s, "ring");
        var g = gget(s, "ring"); var el = gv(g).addProperty("ADBE Vector Shape - Ellipse");
        el.property("ADBE Vector Ellipse Size").setValue([2 * (r || LG.ring.r), 2 * (r || LG.ring.r)]);
        el.property("ADBE Vector Ellipse Position").setValue([r ? 0 : LG.ring.cx, r ? 0 : LG.ring.cy]);
        if (trimEndExpr) {
            g = gget(s, "ring"); var tm = gv(g).addProperty("ADBE Vector Filter - Trim");
            tm.property("ADBE Vector Trim End").expression = trimEndExpr;
        }
        g = gget(s, "ring"); var st = gv(g).addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Width").setValue(sw || LG.ring.stroke);
        st.property("ADBE Vector Stroke Color").expression = colorExpr;
        return s;
    }
    var logoComp = null;
    function makeLogoComp() {
        logoComp = app.project.items.addComp("fila20 logo", 3500, 1000, 1, DUR, FPS); logoComp.parentFolder = preFolder;
        for (var k = 0; k < LG.parts.length; k++) {
            var gl = glyphLayer(logoComp, "glyph " + LG.parts[k].name, LG.parts[k], pal(2));
            tr(gl, "ADBE Position").setValue([1750, 500]);
        }
        var rg = ringLayer(logoComp, "ring", pal(2)); tr(rg, "ADBE Position").setValue([1750, 500]);
    }
    var LOGO_W = 330, LOGO_Y = 300;
    function persistentLogo(shot) {
        var L = shot.layers.add(logoComp); L.name = "logo"; L.collapseTransformation = true;
        var sc = LOGO_W / LG.w * 100;
        tr(L, "ADBE Position").setValue([W / 2, LOGO_Y]); tr(L, "ADBE Scale").setValue([sc, sc]);
        shadow(L, 72, 16);   // legible over bright stills; invisible on the dark
        return L;
    }
    // the changeover cue: the logo's ring blinks twice, top-right, before the cut
    function cueMark(shot, slotN) {
        var r = 34, s = ringLayer(shot, "cue", pal(slotN), null, r, r * LG.ring.stroke / LG.ring.r);
        tr(s, "ADBE Position").setValue([958, 330]);
        tr(s, "ADBE Opacity").expression = HDR +
            'var f = 5/24, a = x1 - 0.72*TEMPO, b = x1 - 0.30*TEMPO;\n' +
            '((time >= a && time < a + f) || (time >= b && time < b + f)) ? 100 : 0;';
        return s;
    }
    // lamp flicker: a black veil a few percent deep, stepped at 24 fps. Only light flickers; the dark stays dark
    function flicker(shot) {
        var s = shot.layers.addSolid([0, 0, 0], "lamp flicker", W, H, 1, DUR);
        tr(s, "ADBE Opacity").expression = WVH + '(0.6 + 9*PRES)*hsh(WF*3.17 + SEC*11);';
        return s;
    }

    // ------------------------------------------------------------ media
    var photoIdx = 0;
    function makeFrameComp(name, w, h) {
        var c = app.project.items.addComp(name, w, h, 1, DUR, FPS); c.parentFolder = preFolder;
        var ph = c.layers.addSolid([0.5, 0.5, 0.5], "placeholder (replace with media)", w, h, 1, DUR);
        ph.guideLayer = true;
        if (SIM && PHOTOS.length) {
            var it = app.project.importFile(new ImportOptions(new File(PHOTOS[photoIdx % PHOTOS.length]))); photoIdx++;
            it.parentFolder = preFolder;
            var L = c.layers.add(it); var sc = Math.min(w / it.width, h / it.height) * 100; tr(L, "ADBE Scale").setValue([sc, sc]);   // "fit", like the director
        }
        return c;
    }
    var COVER = 'var S = thisLayer.source, k = 1;\n' +
        'try { var Lm = S.layer(1); if (Lm.source && Lm.source.width > 0) { var sc = Lm.transform.scale.value; var mw = Lm.source.width*Math.abs(sc[0])/100, mh = Lm.source.height*Math.abs(sc[1])/100; if (mw > 1 && mh > 1) k = Math.max(S.width/mw, S.height/mh); } } catch (err) {}\n';
    // a still projected in a masked window: cover-scaled, slow push-in, weaving; the matte is the masking
    function projectStill(shot, frameComp, cx, cy, ww, wh, maskHJS) {
        var fl = shot.layers.add(frameComp); fl.name = frameComp.name; fl.audioEnabled = false;
        tr(fl, "ADBE Position").expression = HDR + WEAVE + '[' + cx + ' + WV[0], ' + cy + ' + WV[1]];';
        tr(fl, "ADBE Scale").expression = HDR + COVER +
            'k = Math.max(k, ' + ww + '/S.width, ' + wh + '/S.height);\n' +
            'var s = 100*k*(1.0 + 0.06*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';
        var m = shapeLayer(shot, frameComp.name + " masking"); grp(m, "w");
        addPathExpr(m, "w", HDR + rectPathJS(ww, maskHJS || wh));
        addFillV(m, "w", '[1, 1, 1, 1];');
        tr(m, "ADBE Position").setValue([cx, cy]);
        m.moveBefore(fl);
        fl.setTrackMatte(m, TrackMatteType.ALPHA);
        return fl;
    }

    // ============================================================ BUILD
    app.purge(PurgeTarget.ALL_CACHES);
    while (app.project.numItems > 0) { app.project.item(1).remove(); }
    app.project.bitsPerChannel = 8;
    var mainComp = app.project.items.addComp("mainComp", W, H, 1, DUR * 2, FPS);
    shotsFolder = app.project.items.addFolder("ORIGINAL_SHOTS");
    preFolder = app.project.items.addFolder("PRECOMPS");
    footFolder = app.project.items.addFolder("FOOTAGE");
    var mcL = mainComp.layers.addNull(DUR * 2); mcL.name = "mainControl";
    addSlider(mcL, "FORM", 40); addSlider(mcL, "FLOW", 40); addSlider(mcL, "PRESSURE", 25);
    addColorCtl(mcL, "1", BLACK); addColorCtl(mcL, "2", WHITE); addColorCtl(mcL, "3", SILVER);
    makeLogoComp();
    log.push("mainComp + mainControl + logo");

    function newShot(name, fieldExpr) {
        var c = app.project.items.addComp(name, W, H, 1, DUR, FPS); c.parentFolder = shotsFolder; c.motionBlur = false;
        makeController(c);
        var g = c.layers.addSolid([1, 1, 1], "field", W, H, 1, DUR); fillFx(g, fieldExpr); g.moveToEnd();
        return c;
    }
    // film grain over everything (logo included): monochrome Noise at 7% on a top adjustment layer.
    // Per shot, because a mainComp template layer sits UNDER the shots and would grade nothing
    function grain(shot) {
        var g = shot.layers.addSolid([0, 0, 0], "grain", W, H, 1, DUR); g.adjustmentLayer = true;
        var f = fxAdd(g, "ADBE Noise");
        pp(f, "0001").setValue(7);   // Amount of Noise %
        pp(f, "0002").setValue(0);   // Use Color Noise off: monochrome
        return g;
    }
    function finishShot(shot, o) {
        o = o || {};
        flicker(shot);
        if (o.logo !== false) persistentLogo(shot);
        cueMark(shot, o.cue || "2");
        grain(shot);
        shot.layer("controller").moveToBeginning();
    }
    var PH = [[0.3, 0.3, 4], [3.4, 0.3, 4], [6.5, 0.3, 4]];
    function sim(tcomp, texts, ph) { if (!SIM) return; var P = ph || PH; markers(tcomp, P); simTexts(tcomp.layer("textBlock"), P, texts); }
    var CJ = ParagraphJustification.CENTER_JUSTIFY;
    var CAPS = { font: F_CAPS, caps: true, cw: 0.74, lead: 1.22 };        // Avenir Next Bold caps ~0.66 em: err wide
    var SUB = { font: F_SUB, caps: false, cw: 0.56, lead: 1.28, trk: "0" };  // Demi Bold sentence case ~0.50 em
    function O(base, extra) { var o = {}, k; for (k in base) o[k] = base[k]; for (k in extra) o[k] = extra[k]; return o; }
    function projBlack() { return TRI + 'var k = 0.045; [C1[0] + (C2[0] - C1[0])*k, C1[1] + (C2[1] - C1[1])*k, C1[2] + (C2[2] - C1[2])*k, 1];'; }

    // ============================================================ 01 PANTALLA: a white screen fitted to the phrase
    var t01 = makeTextComp("01-text", 880, 380, "Every film starts dark", 92, O(CAPS, { trk: "100 + 260*FORM", maxL: 4, ink: 1 }));
    sim(t01, ["Every film starts dark", "Then the light", "Row twenty, always"]);
    var s01 = newShot("01", TRI + 'C1;');
    var scr = shapeLayer(s01, "screen"); grp(scr, "s");
    var SCREEN = HDR + PHR +
        'var SL = thisComp.layer("01-text"), S = SL.source, TB = S.layer("textBlock"), P = phrs(S), fs = 92;\n' +
        'try { fs = TB.text.sourceText.getStyleAt(0, ' + FT + ').fontSize; } catch (e) {}\n' +
        'function dims(t) { var r = TB.sourceRectAtTime(t, false); var a = TB.toComp([r.left, r.top], t), b = TB.toComp([r.left + r.width, r.top + r.height], t);\n' +
        '  var w = Math.abs(b[0] - a[0]) + 1.5*fs, h = Math.abs(b[1] - a[1]) + 1.3*fs, amin = 1.2 + 1.0*FORM;\n' +
        '  if (w/h < amin) w = Math.min(1000, h*amin);\n' +
        '  return [Math.min(1000, w), Math.min(1180, h), (a[0] + b[0])/2 - S.width/2, (a[1] + b[1])/2 - S.height/2]; }\n' +
        'var D = dims(' + FT + ');\n' +
        'if (P.ix > 0) { var D0 = dims(P.t0 - 2/24), p = mech((time - P.t0)/(0.55*TEMPO)); for (var q = 0; q < 4; q++) D[q] = lerp(D0[q], D[q], p); }\n';
    addPathExpr(scr, "s", SCREEN + 'createPath([[D[2] - D[0]/2, D[3] - D[1]/2], [D[2] + D[0]/2, D[3] - D[1]/2], [D[2] + D[0]/2, D[3] + D[1]/2], [D[2] - D[0]/2, D[3] + D[1]/2]], [], [], true);');
    addFillV(scr, "s", TRI + 'C2;');
    var sl01 = slot(s01, t01, 540, 980);
    tr(scr, "ADBE Position").expression = WVH + '[540 + WV[0], 980 + WV[1]];';
    tr(sl01, "ADBE Position").expression = WVH + '[540 + WV[0], 980 + WV[1]];';
    finishShot(s01); log.push("01 pantalla");

    // ============================================================ 02 CRÉDITOS: the text rolls like end credits
    var t02 = makeTextComp("02-text", 900, 480, "We met in the twentieth row of a cinema and never really left it. Every story we tell starts there", 62, O(SUB, { maxL: 5, ink: 2 }));
    sim(t02, ["We met in the twentieth row of a cinema and never really left it", "Every story we tell starts there, in the dark, waiting for the light", "Personal stories with a long memory"], [[0.3, 0.25, 13], [3.9, 0.25, 13], [7.4, 0.25, 6]]);
    var s02 = newShot("02", TRI + 'C1;');
    var WX = 540, WCY = 980, WW = 960, WH = 1120;
    var win = shapeLayer(s02, "projected window"); grp(win, "w");
    addPathExpr(win, "w", rectPathJS(WW, WH)); addFillV(win, "w", projBlack());
    tr(win, "ADBE Position").setValue([WX, WCY]);
    var sl02 = slot(s02, t02, 540, 980); tr(sl02, "ADBE Opacity").setValue(0);   // the director's slot; the roll draws it
    var ROLLTXT = function (d) {
        return HDR + PHR +
            'var S = thisComp.layer("02-text").source, TB = S.layer("textBlock"), ST = TB.text.sourceText, P = phrs(S), j = P.ix + (' + d + ');\n' +
            'var out = " ";\n' +
            'if (j >= 0 && j < P.st.length) { var tj = P.st[j] + 1.5/24, T = String(ST.valueAtTime(tj));\n' +
            '  if (T.replace(/\\s/g, "").length) { var col = (' + d + ' == 0) ? C2 : C3; out = ST.getStyleAt(0, tj).setText(T).setFillColor([col[0], col[1], col[2]]); } }\n' +
            'out;';
    };
    var rollMatte = shapeLayer(s02, "roll masking"); grp(rollMatte, "w");
    addPathExpr(rollMatte, "w", rectPathJS(WW, WH)); addFillV(rollMatte, "w", '[1, 1, 1, 1];');
    tr(rollMatte, "ADBE Position").setValue([WX, WCY]);
    var rset = s02.layers.addText("{}"); rset.name = "roll set"; rset.guideLayer = true; tr(rset, "ADBE Opacity").setValue(0);
    for (var d = -1; d <= 2; d++) {
        var rl = makeText(s02, " ", F_SUB, 62, CJ, 0, 80); rl.name = "roll " + (d + 1);
        textDoc(rl).expression = ROLLTXT(d);
        tr(rl, "ADBE Anchor Point").expression = 'var r = thisLayer.sourceRectAtTime(' + FT + ', false); [r.left + r.width/2, r.top + r.height/2];';
        tr(rl, "ADBE Position").expression = WVH + 'var J = JSON.parse(String(thisComp.layer("roll set").text.sourceText.valueAtTime(' + FT + ')));\n' +
            '[' + WX + ' + WV[0], ' + WCY + ' + J.Y[' + (d + 1) + '] - J.u + WV[1]];';
        rl.moveBefore(rollMatte);
        rl.setTrackMatte(rollMatte, TrackMatteType.ALPHA);
    }
    // the column: phrase centres stacked by measured height; the spoken phrase reaches the window centre at mid-phrase
    textDoc(rset).expression = HDR + PHR +
        'var out;\n' +
        'try {\n' +
        '  var S = thisComp.layer("02-text").source, TB = S.layer("textBlock"), P = phrs(S), ft = ' + FT + ', fs = 62;\n' +
        '  try { fs = TB.text.sourceText.getStyleAt(0, ft).fontSize; } catch (e) {}\n' +
        '  var h = []; for (var k = 0; k < 4; k++) { var R = thisComp.layer("roll " + k).sourceRectAtTime(ft, false); h.push(R.height > 2 ? R.height : 0); }\n' +
        '  var gap = 0.9*fs, Y = [-(h[0]/2 + gap + h[1]/2), 0, h[1]/2 + gap + h[2]/2, 0]; Y[3] = Y[2] + h[2]/2 + gap + h[3]/2;\n' +
        '  var n = P.st.length, ix = Math.max(0, P.ix), END = x1;\n' +
        '  function mid(j) { return (P.st[j] + ((j + 1 < n) ? P.st[j + 1] : END))/2; }\n' +
        '  var u, t = ft;\n' +
        '  if (t < mid(ix)) { var a = (ix == 0) ? Math.min(P.st[0], e0) : mid(ix - 1), ua = (ix == 0) ? -0.30*' + WH + ' : Y[0];\n' +
        '    u = lerp(ua, 0, cl((t - a)/Math.max(0.05, mid(ix) - a))); }\n' +
        '  else if (ix + 1 < n) u = lerp(0, Y[2], cl((t - mid(ix))/Math.max(0.05, mid(ix + 1) - mid(ix))));\n' +
        '  else u = (t - mid(ix))*(30 + 60*FLOW);\n' +
        '  out = JSON.stringify({ u: u, Y: Y });\n' +
        '} catch (err) { out = JSON.stringify({ u: 0, Y: [0, 0, 0, 0] }); }\n' +
        'out;';
    finishShot(s02); log.push("02 creditos");

    // ============================================================ 03 LÍDER: the logo's ring as the phrase timer
    var t03 = makeTextComp("03-text", 600, 520, "We tell personal stories with timeless resonance", 66, O(SUB, { maxL: 4, ink: 2 }));
    sim(t03, ["We tell personal stories with timeless resonance", "Close enough to touch", "And far enough to last"]);
    var s03 = newShot("03", TRI + 'C1;');
    var RR = 'var R = 390 + 50*FORM, SW = R*' + (LG.ring.stroke / LG.ring.r) + ';\n';
    var sweep = shapeLayer(s03, "sweep"); grp(sweep, "s");
    addPathExpr(sweep, "s", HDR + PHR + RR +
        'var P = phrs(thisComp.layer("03-text").source), p = (P.t0 < 0) ? 0 : cl((time - P.t0)/Math.max(0.3, Math.min(P.t1, x1) - P.t0 - 0.15));\n' +
        'var r = R - SW/2, n = Math.max(2, Math.ceil(72*p)), v = [[0, 0]];\n' +
        'if (p <= 0.001) { createPath([[0, 0], [0.1, 0], [0, 0.1]], [], [], true); } else {\n' +
        '  for (var k = 0; k <= n; k++) { var a = -Math.PI/2 + 2*Math.PI*p*k/n; v.push([r*Math.cos(a), r*Math.sin(a)]); }\n' +
        '  createPath(v, [], [], true); }');
    addFillV(sweep, "s", TRI + 'C3;', 34);
    var ring = shapeLayer(s03, "ring"); grp(ring, "r");
    var rg = gget(ring, "r"); var rel = gv(rg).addProperty("ADBE Vector Shape - Ellipse");
    rel.property("ADBE Vector Ellipse Size").expression = HDR + RR + '[2*R, 2*R];';
    rg = gget(ring, "r"); var rst = gv(rg).addProperty("ADBE Vector Graphic - Stroke");
    rst.property("ADBE Vector Stroke Width").expression = HDR + RR + 'SW;';
    rst.property("ADBE Vector Stroke Color").expression = TRI + 'C2;';
    var sl03 = slot(s03, t03, 540, 980);
    var RINGPOS = WVH + '[540 + WV[0], 980 + WV[1]];';
    tr(sweep, "ADBE Position").expression = RINGPOS; tr(ring, "ADBE Position").expression = RINGPOS; tr(sl03, "ADBE Position").expression = RINGPOS;
    finishShot(s03); log.push("03 lider");

    // ============================================================ 04 SCOPE: the masking closes to scope over a still; subtitles in the letterbox
    var t04 = makeTextComp("04-text", 980, 240, "The light finds them before we do", 58, O(SUB, { maxL: 2, ink: 2 }));
    sim(t04, ["The light finds them before we do", "A whole life in one look", "Then we cut"]);
    var f04 = makeFrameComp("04-frame", 1080, 608);
    var s04 = newShot("04", TRI + 'C1;');
    projectStill(s04, f04, 540, 880, 1080, 608,
        'lerp(608, 1080/(1.85 + 0.9*FORM), mech((time - e0 - 0.7*TEMPO)/(1.2*TEMPO)))');
    var sl04 = slot(s04, t04, 540, 1300); tr(sl04, "ADBE Position").expression = subtitlePos(540, 1360);
    finishShot(s04); log.push("04 scope");

    // ============================================================ 05 ACADÉMICO: a 4:5 screen with margins; subtitles burned in
    var t05 = makeTextComp("05-text", 900, 240, "Shot on location, one take at a time", 56, O(SUB, { maxL: 2, ink: 2 }));
    sim(t05, ["Shot on location, one take at a time", "Nobody acting", "Everybody remembering"]);
    var f05 = makeFrameComp("05-frame", 1000, 1250);
    var s05 = newShot("05", TRI + 'C1;');
    projectStill(s05, f05, 540, 1000, 1000, 1250);
    var sl05 = slot(s05, t05, 540, 1500); tr(sl05, "ADBE Position").expression = subtitlePos(540, 1545);
    shadow(sl05, 70, 22);
    finishShot(s05); log.push("05 academico");

    // ============================================================ 06 COMPLETO: a scope band opens to the full frame
    var t06 = makeTextComp("06-text", 920, 240, "", 56, O(SUB, { maxL: 2, ink: 2 }));
    var f06 = makeFrameComp("06-frame", 1080, 1920);
    var s06 = newShot("06", TRI + 'C1;');
    projectStill(s06, f06, 540, 960, 1080, 1920,
        'lerp(1080/(2.0 + 0.75*FORM), 1920, mech((time - e0 - 0.45*TEMPO)/(1.1*TEMPO)))');
    var sl06 = slot(s06, t06, 540, 1450); tr(sl06, "ADBE Position").expression = subtitlePos(540, 1500);
    shadow(sl06, 70, 22);
    finishShot(s06); log.push("06 completo");

    // ============================================================ 07 MARCA: the full brand (empty sections land here)
    var t07 = makeTextComp("07-text", 900, 300, "", 50, O(CAPS, { trk: "200 + 200*FORM", maxL: 3, ink: 1 }));
    var s07 = newShot("07", TRI + 'C2;');
    var rig = s07.layers.addNull(DUR); rig.name = "logo rig";
    var BIG = 920 / LG.w * 100;
    tr(rig, "ADBE Anchor Point").setValue([0, 0, 0]);
    tr(rig, "ADBE Scale").expression = HDR + 'var s = ' + BIG + '*(1 + 0.05*FLOW*cl((time - e0)/Math.max(1, x1 - e0))); [s, s];';   // the hold breathes: a slow push-in
    tr(rig, "ADBE Position").expression = HDR + WEAVE + PHR +
        'var HAS = false; try { HAS = String(thisComp.layer("07-text").source.layer("textBlock").text.sourceText.valueAtTime(' + FT + ')).replace(/\\s/g, "").length > 0; } catch (e) {}\n' +
        '[540 + WV[0], (HAS ? 860 : 940) + WV[1]];';
    var CUEAT = function (k) { return HDR + 'var tc = e0 + (0.25 + 0.125*' + k + ')*TEMPO; (time >= tc) ? 100 : 0;'; };
    var SW0 = 'var ts = e0 + 0.80*TEMPO, te = ts + 0.85*TEMPO, p = cl((time - ts)/(te - ts));\n';
    var letters = 0;
    for (var gi = 0; gi < LG.parts.length; gi++) {
        var part = LG.parts[gi];
        var gl = glyphLayer(s07, "glyph " + part.name, part, TRI + 'C1;');
        parentJ(gl, rig); tr(gl, "ADBE Position").setValue([0, 0]); tr(gl, "ADBE Scale").setValue([100, 100]);
        if (part.name == "2" || part.name == "0")   // the 20 lands when the sweep closes the ring
            tr(gl, "ADBE Opacity").expression = HDR + SW0 + '(time >= te + ' + (part.name == "0" ? '2/24' : '0') + ') ? 100 : 0;';
        else { tr(gl, "ADBE Opacity").expression = CUEAT(letters); letters++; }
    }
    var lsweep = shapeLayer(s07, "leader sweep"); grp(lsweep, "s");
    addPathExpr(lsweep, "s", HDR + SW0 +
        'var cx = ' + LG.ring.cx + ', cy = ' + LG.ring.cy + ', r = ' + (LG.ring.r - LG.ring.stroke / 2) + ';\n' +
        'if (p <= 0.001 || p >= 1) { createPath([[cx, cy], [cx + 0.1, cy], [cx, cy + 0.1]], [], [], true); } else {\n' +
        '  var n = Math.max(2, Math.ceil(72*p)), v = [[cx, cy]];\n' +
        '  for (var k = 0; k <= n; k++) { var a = -Math.PI/2 + 2*Math.PI*p*k/n; v.push([cx + r*Math.cos(a), cy + r*Math.sin(a)]); }\n' +
        '  createPath(v, [], [], true); }');
    addFillV(lsweep, "s", TRI + 'C3;', 45);
    parentJ(lsweep, rig); tr(lsweep, "ADBE Position").setValue([0, 0]); tr(lsweep, "ADBE Scale").setValue([100, 100]);
    var lring = ringLayer(s07, "ring", TRI + 'C1;', HDR + SW0 + '100*p;');
    parentJ(lring, rig); tr(lring, "ADBE Position").setValue([0, 0]); tr(lring, "ADBE Scale").setValue([100, 100]);
    var sl07 = slot(s07, t07, 540, 1230);
    tr(sl07, "ADBE Position").expression = WVH + '[540 + WV[0], 1230 + WV[1]];';
    finishShot(s07, { logo: false, cue: "1" }); log.push("07 marca");

    mcL.moveToBeginning();
    return log.join("\n");
}
