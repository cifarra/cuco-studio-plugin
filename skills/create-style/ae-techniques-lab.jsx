// ae-techniques-lab.jsx: runnable reference for ae-techniques.md (tested in AE 25.6).
// Builds one comp per technique ("lab-soak", "lab-fluted", ...) into the OPEN project, under a
// folder "LAB". The folder is rebuilt from scratch on every run. Wiring matches a real style:
// mainComp/mainControl (FORM/FLOW/PRESSURE + palette "1" "2" "3") and a per-comp
// controller with enter/exit sliders.
// It reuses an existing mainComp, so running it inside your style project previews every
// technique in YOUR palette and trinity. It never saves the project.
//
//   aectx run ae-techniques-lab.jsx --args '{"img":"/abs/photo.jpg","vid":"/abs/clip.mp4"}'
//   aectx run ae-techniques-lab.jsx --args '{"img":"...","only":"soak,print"}'
//   aectx frames --comp lab-soak --t 0.7,1.2,2.0,3.2,4.5 --sheet
//
// img: any photo (soak plate, glass backdrop, print). vid: any clip with luminance movement
// (clouds, ink, smoke) for the plate-driven reveal. Without them, those parts are skipped.
var A = AECTX.args || {};
var W = 1080, H = 1920, FPS = 30, DUR = 5;
var FONT = A.font || "Newsreader60pt-Regular";
var ONLY = A.only ? ("," + A.only + ",") : "";

function want(k) { return ONLY === "" || ONLY.indexOf("," + k + ",") >= 0; }
function rgb(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
function fx(l, mn) { return l.property("ADBE Effect Parade").addProperty(mn); }
function pp(e, n) { return e.property(e.matchName + "-" + n); }
function tr(l, mn) { return l.property("ADBE Transform Group").property(mn); }
function findItem(name) { for (var i = 1; i <= app.project.numItems; i++) { if (app.project.item(i).name === name) return app.project.item(i); } return null; }

var TRI = 'var MC = comp("mainComp").layer("mainControl");\n' +
    'var FORM = MC.effect("FORM")("Slider").value/100, FLOW = MC.effect("FLOW")("Slider").value/100, PRES = MC.effect("PRESSURE")("Slider").value/100;\n';
function PAL(i) { return 'comp("mainComp").layer("mainControl").effect("' + i + '")("Color").value'; }
var ENV = 'var en = 0, ex = 0;\n' +
    'try { en = thisComp.layer("controller").effect("enter")("Slider").value/100; } catch (e1) {}\n' +
    'try { ex = thisComp.layer("controller").effect("exit")("Slider").value/100; } catch (e2) {}\n';

// ---------- scaffolding: folder, mainComp + mainControl, controller, text comp ----------
var LAB = findItem("LAB");
if (LAB) { while (LAB.numItems > 0) LAB.item(1).remove(); } else { LAB = app.project.items.addFolder("LAB"); }

var mainComp = findItem("mainComp");
if (!mainComp) {
    mainComp = app.project.items.addComp("mainComp", W, H, 1, DUR, FPS);
    var mc = mainComp.layers.addNull(DUR); mc.name = "mainControl";
    var sl = ["FORM", "FLOW", "PRESSURE"];
    for (var s = 0; s < 3; s++) { var e = fx(mc, "ADBE Slider Control"); e.name = sl[s]; e.property(1).setValue(50); }
    var pal = ["#EFE7D6", "#1C1B19", "#E0452B"];   // paper · ink · vermilion
    for (var c = 0; c < 3; c++) { var cc = fx(mc, "ADBE Color Control"); cc.name = String(c + 1); cc.property(1).setValue(rgb(pal[c]).concat([1])); }
}

function addComp(name, w, h) { var c = app.project.items.addComp(name, w || W, h || H, 1, DUR, FPS); c.parentFolder = LAB; return c; }
function controller(comp) {
    var n = comp.layers.addNull(DUR); n.name = "controller"; n.enabled = false;
    var en = fx(n, "ADBE Slider Control"); en.name = "enter";
    en.property(1).setValueAtTime(0.3, 0); en.property(1).setValueAtTime(1.8, 100);
    var ex = fx(n, "ADBE Slider Control"); ex.name = "exit";
    ex.property(1).setValueAtTime(3.9, 0); ex.property(1).setValueAtTime(4.9, 100);
    return n;
}
function fillFx(l, i) { var f = fx(l, "ADBE Fill"); pp(f, "0002").expression = PAL(i) + ';'; return f; }
function solid(comp, name, i) { var s = comp.layers.addSolid([1, 1, 1], name, comp.width, comp.height, 1, DUR); fillFx(s, i); return s; }
function textComp(name, str, size, font, w, h) {
    var c = addComp(name, w || 1000, h || 760);
    var t = c.layers.addText(str); t.name = "textBlock";
    var p = t.property("ADBE Text Properties").property("ADBE Text Document"); var d = p.value;
    d.font = font || FONT; d.fontSize = size; d.fillColor = [1, 1, 1]; d.applyFill = true; d.applyStroke = false;
    d.justification = ParagraphJustification.CENTER_JUSTIFY; d.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; d.tracking = -10;
    p.setValue(d);
    var r = t.sourceRectAtTime(0, false);
    tr(t, "ADBE Position").setValue([c.width / 2 - r.left - r.width / 2, c.height / 2 - r.top - r.height / 2]);
    return c;
}
function importFile(path) {
    var f = new File(path); if (!f.exists) throw new Error("missing file " + path);
    var it = app.project.importFile(new ImportOptions(f)); it.parentFolder = LAB; return it;
}
var log = [];

// =====================================================================================
// 1. SOAK — organic luma reveal (ink soaking into paper / burn / erosion) — Gradient Wipe
// =====================================================================================
function soakMap(name, cx, cy) {
    var c = addComp(name);
    var r = c.layers.addSolid([0, 0, 0], "spread", W, H, 1, DUR);
    var rp = fx(r, "ADBE Ramp");
    pp(rp, "0001").setValue([cx, cy]); pp(rp, "0002").setValue([1, 1, 1, 1]);      // white at the drop = reveals first
    pp(rp, "0003").setValue([cx + 900, cy + 700]); pp(rp, "0004").setValue([0, 0, 0, 1]);
    pp(rp, "0005").setValue(2);                                                    // radial
    var n = c.layers.addSolid([0, 0, 0], "fibre", W, H, 1, DUR);
    var f = fx(n, "ADBE Fractal Noise");
    pp(f, "0004").expression = TRI + '110 + 140*PRES;';          // contrast = raggedness of the front
    pp(f, "0010").expression = TRI + '240 - 150*PRES;';          // scale: finer fibres under pressure
    pp(f, "0015").setValue(6);                                     // complexity
    pp(f, "0023").expression = TRI + 'time*(30 + 160*FLOW);';    // evolution: the front keeps creeping
    n.blendingMode = BlendingMode.OVERLAY;
    tr(n, "ADBE Opacity").expression = TRI + '40 + 55*FORM;';
    return c;
}
function soakLayer(shot, src, mapLayer, palIdx, lag) {
    var L = shot.layers.add(src); L.name = src.name;
    fillFx(L, palIdx);
    var gw = fx(L, "ADBE Gradient Wipe");
    pp(gw, "0001").expression = ENV + 'var c = linear(en, 0, 1, 114, -14) + (' + lag + '); Math.max(0, Math.min(100, Math.max(c, 100*ex)));';
    pp(gw, "0002").expression = TRI + 'linear(PRES, 0, 1, 14, 4);';   // wet (soft) → dry (hard) edge
    pp(gw, "0004").setValue(3);                                       // stretch gradient to fit
    pp(gw, "0003").setValue(mapLayer.index);                          // layer ref LAST
    return L;
}
if (want("soak")) {
    var sk = addComp("lab-soak"); controller(sk);
    var skMap = soakMap("soak-map", 380, 760);
    var paper = solid(sk, "paper", 1); paper.moveToEnd();
    var fib = sk.layers.addSolid([0.5, 0.5, 0.5], "paper fibre", W, H, 1, DUR);
    var pf = fx(fib, "ADBE Fractal Noise"); pp(pf, "0004").setValue(160); pp(pf, "0010").setValue(60); pp(pf, "0011").setValue(60); pp(pf, "0015").setValue(4);
    fib.blendingMode = BlendingMode.SOFT_LIGHT; tr(fib, "ADBE Opacity").setValue(18);
    var mapL = sk.layers.add(skMap); mapL.enabled = false; mapL.name = "soak map";
    var txt = textComp("soak-text", "Ink\nremembers", 190, null, 1060, 700);
    var front = soakLayer(sk, txt, mapL, 3, -8);    // accent front runs AHEAD of the ink (negative lag)
    var ink = soakLayer(sk, txt, mapL, 2, 0);
    ink.blendingMode = BlendingMode.MULTIPLY;         // ink takes the paper's fibre
    tr(ink, "ADBE Position").setValue([W / 2, 640]); tr(front, "ADBE Position").setValue([W / 2, 640]);
    if (A.img) {
        var ph = importFile(A.img);
        var pc = addComp("soak-plate", 860, 760);
        var pl = pc.layers.add(ph); var sc = Math.max(860 / ph.width, 760 / ph.height) * 100; tr(pl, "ADBE Scale").setValue([sc, sc]);
        var bw = fx(pl, "ADBE Black&White");
        var lv = fx(pl, "ADBE Easy Levels2"); pp(lv, "0003").setValue(0.12); pp(lv, "0004").setValue(0.85);
        var plate = soakLayer(sk, pc, mapL, 2, 12);  // trails the type (positive lag)
        // ink on paper: luminance → ink density (white paper stays paper)
        var tn = fx(plate, "ADBE Tint"); pp(tn, "0001").expression = PAL(2) + ';'; pp(tn, "0002").expression = PAL(1) + ';';
        plate.blendingMode = BlendingMode.MULTIPLY;
        // the Fill from soakLayer would flatten the photo: drop it
        plate.property("ADBE Effect Parade").property("ADBE Fill").remove();
        tr(plate, "ADBE Position").setValue([W / 2, 1340]);
        plate.moveAfter(ink);
    }
    log.push("soak ok");
}

// =====================================================================================
// 2. FLUTED GLASS — Motion Tile sawtooth → Displacement Map on an adjustment layer
// =====================================================================================
if (want("fluted")) {
    var fl = addComp("lab-fluted"); controller(fl);
    var ribs = addComp("ribs-map");
    var rb = ribs.layers.addSolid([0, 0, 0], "rib", W, H, 1, DUR);
    var rr = fx(rb, "ADBE Ramp"); pp(rr, "0001").setValue([0, H / 2]); pp(rr, "0002").setValue([0, 0, 0, 1]); pp(rr, "0003").setValue([W, H / 2]); pp(rr, "0004").setValue([1, 1, 1, 1]);
    var mt = fx(rb, "ADBE Tile");
    pp(mt, "0002").expression = TRI + 'linear(PRES, 0, 1, 7, 3.2);';   // rib width as % of the comp width (~76 → 35 px)
    pp(mt, "0003").setValue(100); pp(mt, "0004").setValue(300);   // over-cover: a drifting tile centre leaves a seam at the layer edge
    pp(mt, "0001").expression = TRI + '[thisLayer.width/2 + time*40*FLOW, thisLayer.height/2];';  // ribs drift
    // behind the glass: something worth refracting — big type + a moving light
    solid(fl, "field", 2).moveToEnd();
    // anything under a displacement ADJUSTMENT layer must stay inside the frame: a shape layer that crosses the
    // edge widens the buffer and "wrap pixels" pulls transparent pixels in. Precomps are clipped to their comp.
    var lampC = addComp("lamp");
    var glow = lampC.layers.addShape(); glow.name = "lamp";
    var gg = glow.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    gg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([620, 620]);
    var gf = gg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    gf.property("ADBE Vector Fill Color").expression = PAL(3) + ';';
    tr(glow, "ADBE Position").expression = TRI + ENV + '[540 + 300*Math.sin(time*(0.4 + 0.8*FLOW)), 1420 - 120*en];';
    var gb = fx(glow, "ADBE Gaussian Blur 2"); pp(gb, "0001").setValue(60);
    var lampL = fl.layers.add(lampC); lampL.name = "lamp";
    var ft = textComp("fluted-text", "Through\nthe glass", 220, "HelveticaNeue-Bold");
    var fT = fl.layers.add(ft); fillFx(fT, 1); tr(fT, "ADBE Position").setValue([W / 2, 1000]);
    tr(fT, "ADBE Position").expression = ENV + 'var q = 1 - Math.pow(1 - en, 3); [540, linear(q, 0, 1, 1500, 640) - 500*ex*ex];';
    var rm = fl.layers.add(ribs); rm.enabled = false; rm.name = "ribs map";
    var shade = fl.layers.add(ribs); shade.name = "rib shading"; shade.blendingMode = BlendingMode.SOFT_LIGHT;
    var sm = shade.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"); var sshape = new Shape(); sshape.vertices = [[0, 900], [W, 900], [W, H], [0, H]]; sshape.closed = true; sm.property("ADBE Mask Shape").setValue(sshape);
    tr(shade, "ADBE Opacity").expression = TRI + '12 + 25*FORM;';
    var adj = fl.layers.addSolid([1, 1, 1], "GLASS", W, H, 1, DUR); adj.adjustmentLayer = true;
    var dm = fx(adj, "ADBE Displacement Map");
    pp(dm, "0002").setValue(5);                                         // horizontal from luminance
    pp(dm, "0003").expression = TRI + '20 + 90*FORM;';   // refraction strength = FORM
    var pm = adj.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");          // the glass is a panel, not the screen
    var pshape = new Shape(); pshape.vertices = [[0, 900], [W, 900], [W, H], [0, H]]; pshape.closed = true;
    pm.property("ADBE Mask Shape").setValue(pshape);
    var edge = fl.layers.addShape(); edge.name = "panel edge";                        // a hairline of light on the glass edge
    var eg = edge.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    eg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([W, 3]);
    eg = edge.property("ADBE Root Vectors Group").property(1);
    eg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").expression = PAL(1) + ';';
    tr(edge, "ADBE Position").setValue([W / 2, 900]); tr(edge, "ADBE Opacity").setValue(35);
    pp(dm, "0004").setValue(11); pp(dm, "0005").setValue(0);         // vertical off
    pp(dm, "0006").setValue(2);                                         // stretch map to fit
    pp(dm, "0007").setValue(1);                                         // wrap pixels
    pp(dm, "0008").setValue(0);                                         // don't expand output
    pp(dm, "0001").setValue(rm.index);                                  // layer ref LAST
    log.push("fluted ok");
}

// =====================================================================================
// 3. GLASS TYPE — CC Glass on the plate, bump map = the text layer: letters become lenses
// =====================================================================================
if (want("glass")) {
    var gl = addComp("lab-glass"); controller(gl);
    var back;
    if (A.img) {
        var gph = importFile(A.img); back = gl.layers.add(gph);
        var gs = Math.max(W / gph.width, H / gph.height) * 100; tr(back, "ADBE Scale").expression = ENV + 'var s = ' + gs + '*(1.08 - 0.06*en); [s, s];';
    } else { back = solid(gl, "back", 3); }
    var gtc = textComp("glass-text", "Clear", 400, "HelveticaNeue-Bold", 1080, 700);
    var lens = gl.layers.add(gtc); lens.name = "lens"; lens.enabled = false; tr(lens, "ADBE Position").setValue([W / 2, 960]);
    var ccg = fx(back, "CC Glass");
    pp(ccg, "0003").setValue(4);                                        // property: alpha
    pp(ccg, "0004").expression = TRI + '6 + 18*(1 - PRES);';            // softness = rounded glass
    pp(ccg, "0005").expression = TRI + ENV + '(10 + 40*FORM)*en*(1 - ex);';   // height = the type rises out of the plate
    pp(ccg, "0006").expression = TRI + ENV + '(80 + 220*FORM)*en*(1 - ex);';  // refraction
    pp(ccg, "0009").setValue(70);
    pp(ccg, "0002").setValue(lens.index);                               // layer ref LAST
    log.push("glass ok");
}

// =====================================================================================
// 4. PRINT — amplitude-modulated halftone + misregistered plates
// =====================================================================================
function screenComp(name, srcItem, angle, cell, dx) {
    // returns a comp whose WHITE = ink for this plate
    var c = addComp(name);
    var im = c.layers.add(srcItem);
    var s0 = Math.max(W / srcItem.width, H / srcItem.height) * 100; tr(im, "ADBE Scale").setValue([s0, s0]);
    tr(im, "ADBE Position").setValue([W / 2 + dx, H / 2]);
    fx(im, "ADBE Black&White");
    var lv = fx(im, "ADBE Easy Levels2"); pp(lv, "0003").setValue(0.08); pp(lv, "0004").setValue(0.92);
    fx(im, "ADBE Invert");
    var gb = fx(im, "ADBE Gaussian Blur 2"); pp(gb, "0001").setValue(cell * 0.3);   // rounder dots
    var dots = c.layers.addSolid([0, 0, 0], "screen", cell, cell, 1, DUR);   // ONE dot…
    var rp = fx(dots, "ADBE Ramp");
    pp(rp, "0001").setValue([cell / 2, cell / 2]); pp(rp, "0002").setValue([1, 1, 1, 1]);
    pp(rp, "0003").setValue([cell, cell / 2]); pp(rp, "0004").setValue([0, 0, 0, 1]); pp(rp, "0005").setValue(2);
    var rt = fx(dots, "CC RepeTile");                                             // …repeated past the frame
    pp(rt, "0001").setValue(1500); pp(rt, "0002").setValue(1500); pp(rt, "0003").setValue(1500); pp(rt, "0004").setValue(1500);
    tr(dots, "ADBE Position").setValue([W / 2, H / 2]);
    tr(dots, "ADBE Rotate Z").setValue(angle);                                    // screen angle per plate
    dots.blendingMode = BlendingMode.LINEAR_BURN;   // dome + (1 - lum) - 1 = dome - lum: positive where this dot is inked
    var th = c.layers.addSolid([1, 1, 1], "threshold", W, H, 1, DUR); th.adjustmentLayer = true;
    var lv2 = fx(th, "ADBE Easy Levels2"); pp(lv2, "0003").setValue(0.03); pp(lv2, "0004").setValue(0.07);  // hard step
    return c;
}
if (want("print") && A.img) {
    var pr = addComp("lab-print"); controller(pr);
    var pimg = importFile(A.img);
    solid(pr, "paper", 1).moveToEnd();
    var plates = [["ink plate", 2, 45, 0], ["accent plate", 3, 15, 1]];
    for (var q = 0; q < plates.length; q++) {
        var scr = screenComp("screen-" + q, pimg, plates[q][2], 26, 0);
        var mat = pr.layers.add(scr); mat.name = plates[q][0] + " matte";
        var ink2 = solid(pr, plates[q][0], plates[q][1]);
        ink2.blendingMode = BlendingMode.MULTIPLY;
        ink2.setTrackMatte(mat, TrackMatteType.LUMA);
        // misregistration: each plate lands from its own offset; PRESSURE leaves it off-register
        tr(mat, "ADBE Position").expression = TRI + ENV + 'var k = ' + (q === 0 ? 1 : -1) + ';\n' +
            'var off = (14 + 26*PRES)*k; var land = (1 - en)*180*k + ex*-220*k;\n' +
            'add(value, [off + land, off*0.6]);';
        if (q === 1) tr(ink2, "ADBE Opacity").expression = TRI + '45 + 50*FORM;';
    }
    var ptc = textComp("print-text", "Second\nprinting", 190);
    var pT = pr.layers.add(ptc); fillFx(pT, 2); tr(pT, "ADBE Position").setValue([W / 2, 1520]);
    var re = fx(pT, "ADBE Roughen Edges"); pp(re, "0002").setValue(2.5); pp(re, "0005").setValue(14); pp(re, "0004").setValue(1.0);
    pp(re, "0009").expression = 'posterizeTime(8); time*120;';
    tr(pT, "ADBE Opacity").expression = ENV + '100*Math.min(1, en*1.5)*(1-ex);';
    log.push("print ok");
}

// =====================================================================================
// 5. PAPER STAGE — 3D layers, a spot light that casts shadows, a drifting camera
// =====================================================================================
function mat3D(l, casts, accepts) {
    l.threeDLayer = true;
    var m = l.property("ADBE Material Options Group");
    m.property("ADBE Casts Shadows").setValue(casts ? 1 : 0);
    m.property("ADBE Accepts Shadows").setValue(accepts ? 1 : 0);
}
if (want("stage")) {
    var st = addComp("lab-stage"); controller(st);
    var back3 = solid(st, "backdrop", 1); mat3D(back3, false, true);
    tr(back3, "ADBE Position").setValue([W / 2, H / 2, 0]); tr(back3, "ADBE Scale").setValue([260, 260, 100]);
    var cuts = [[3, 360, 1180, -120, 520], [2, 760, 700, -260, 380]];
    for (var u = 0; u < cuts.length; u++) {
        var cut = st.layers.addShape(); cut.name = "cut " + u;
        var cg = cut.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        cg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([cuts[u][4], cuts[u][4]]);
        cg = cut.property("ADBE Root Vectors Group").property(1);
        var cf = cg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        cf.property("ADBE Vector Fill Color").expression = PAL(cuts[u][0]) + ';';
        mat3D(cut, true, true);
        tr(cut, "ADBE Position").expression = TRI + ENV + 'var z = ' + cuts[u][3] + '*(0.4 + 0.6*FORM);\n' +
            '[' + cuts[u][1] + ', ' + cuts[u][2] + ' + (1 - en)*1400, z];';
    }
    var stc = textComp("stage-text", "Paper\nstage", 220);
    var sT = st.layers.add(stc); fillFx(sT, 2); mat3D(sT, true, true);
    tr(sT, "ADBE Position").expression = ENV + '[540, 1450, -180 + (1 - en)*-900];';
    tr(sT, "ADBE Opacity").expression = ENV + '100*Math.min(1, en*2)*(1 - ex);';
    var lt = st.layers.addLight("key", [W / 2, H / 2]);
    lt.lightType = LightType.SPOT;
    tr(lt, "ADBE Position").expression = TRI + '[-260 + 160*Math.sin(time*0.5)*FLOW, 260, -1000];';   // raking, upper left
    tr(lt, "ADBE Anchor Point").setValue([W / 2, H / 2, 0]);
    var lo = lt.property("ADBE Light Options Group");
    lo.property("ADBE Light Intensity").setValue(95);
    lo.property("ADBE Light Cone Angle").setValue(110);
    lo.property("ADBE Light Cone Feather 2").setValue(80);
    lo.property("ADBE Casts Shadows").setValue(1);
    lo.property("ADBE Light Shadow Darkness").expression = TRI + '35 + 35*FORM;';
    lo.property("ADBE Light Shadow Diffusion").expression = TRI + '60 - 40*PRES;';
    var amb = st.layers.addLight("ambient", [W / 2, H / 2]); amb.lightType = LightType.AMBIENT;
    amb.property("ADBE Light Options Group").property("ADBE Light Intensity").setValue(40);
    var cam = st.layers.addCamera("camera", [W / 2, H / 2]);
    var zoom = cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").value;
    cam.autoOrient = AutoOrientType.NO_AUTO_ORIENT;   // one-node camera: drifts without tilting
    tr(cam, "ADBE Position").setValue([W / 2, H / 2, -zoom]);   // addCamera can leave it at [0,0,-zoom]
    tr(cam, "ADBE Position").expression = TRI + ENV + 'add(value, [50*Math.sin(time*0.5)*FLOW, -30*FLOW*time, (1 - en)*-500]);';
    log.push("stage ok");
}

// =====================================================================================
// 6. BOIL — hand-made time: posterized Turbulent Displace + Roughen Edges ink
// =====================================================================================
if (want("boil")) {
    var bo = addComp("lab-boil"); controller(bo);
    solid(bo, "paper", 1).moveToEnd();
    var btc = textComp("boil-text", "Drawn by\nhand", 230, "Newsreader60pt-Italic");
    var bT = bo.layers.add(btc); fillFx(bT, 2); tr(bT, "ADBE Position").setValue([W / 2, 900]);
    var td = fx(bT, "ADBE Turbulent Displace");
    pp(td, "0002").expression = TRI + '1.5 + 6*PRES;';
    pp(td, "0003").setValue(14);
    pp(td, "0006").expression = TRI + 'var fps = linear(FLOW, 0, 1, 4, 12); posterizeTime(fps); time*400;';
    var bre = fx(bT, "ADBE Roughen Edges"); pp(bre, "0002").setValue(3); pp(bre, "0005").setValue(12);
    pp(bre, "0009").expression = TRI + 'posterizeTime(linear(FLOW, 0, 1, 4, 12)); time*300;';
    // a hand-drawn underline: Stroke-style shape with trim + the same boil
    var ul = bo.layers.addShape(); ul.name = "underline";
    var ug = ul.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var up = ug.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
    var shp = new Shape(); shp.vertices = [[-330, 0], [-60, -14], [340, 6]]; shp.inTangents = [[0, 0], [-120, 4], [0, 0]]; shp.outTangents = [[0, 0], [120, -4], [0, 0]]; shp.closed = false;
    up.property("ADBE Vector Shape").setValue(shp);
    ug = ul.property("ADBE Root Vectors Group").property(1);
    var us = ug.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
    us.property("ADBE Vector Stroke Color").expression = PAL(3) + ';'; us.property("ADBE Vector Stroke Width").setValue(16);
    us.property("ADBE Vector Stroke Line Cap").setValue(2);
    ug = ul.property("ADBE Root Vectors Group").property(1);
    var ut = ug.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim");
    ut.property("ADBE Vector Trim End").expression = ENV + 'posterizeTime(12); 100*Math.min(1, Math.max(0, (en - 0.4)/0.6))*(1 - ex);';
    ug = ul.property("ADBE Root Vectors Group").property(1);
    var uw = ug.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Roughen");   // Wiggle Paths
    uw.property("ADBE Vector Roughen Size").setValue(5); uw.property("ADBE Vector Roughen Detail").setValue(6);
    uw.property("ADBE Vector Temporal Freq").setValue(0);
    uw.property("ADBE Vector Random Seed").expression = 'posterizeTime(8); Math.floor(time*8);';
    tr(ul, "ADBE Position").setValue([W / 2, 1220]);
    tr(bT, "ADBE Opacity").expression = ENV + 'posterizeTime(8); 100*Math.min(1, en*1.6)*(1 - ex);';
    log.push("boil ok");
}

// =====================================================================================
// 7. GUILLOCHE — Zig Zag + Repeater: engraved security-paper rosettes
// =====================================================================================
if (want("guilloche")) {
    var gu = addComp("lab-guilloche"); controller(gu);
    solid(gu, "paper", 1).moveToEnd();
    var rings = [[2, 520, 0.9], [3, 340, 1.4]];
    for (var g = 0; g < rings.length; g++) {
        var ros = gu.layers.addShape(); ros.name = "rosette " + g;
        var rg = ros.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var el = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");
        el.property("ADBE Vector Ellipse Size").setValue([rings[g][1] * 2, rings[g][1] * 1.2]);
        rg = ros.property("ADBE Root Vectors Group").property(1);
        var zz = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Zigzag");
        zz.property("ADBE Vector Zigzag Size").expression = TRI + ENV + '(10 + 22*FORM)*en;';
        zz.property("ADBE Vector Zigzag Detail").setValue(18);
        zz.property("ADBE Vector Zigzag Points").setValue(2);     // smooth
        rg = ros.property("ADBE Root Vectors Group").property(1);
        var rst = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
        rst.property("ADBE Vector Stroke Color").expression = PAL(rings[g][0]) + ';';
        rst.property("ADBE Vector Stroke Width").setValue(1.6);
        rg = ros.property("ADBE Root Vectors Group").property(1);
        var rep = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Repeater");
        rep.property("ADBE Vector Repeater Copies").expression = TRI + ENV + 'Math.round((24 + 36*PRES)*en);';
        var rtf = rep.property("ADBE Vector Repeater Transform");
        rtf.property("ADBE Vector Repeater Rotation").expression = TRI + '(180/(24 + 36*PRES)) + 0.0;';
        rtf.property("ADBE Vector Repeater Position").setValue([0, 0]);
        rtf.property("ADBE Vector Repeater Scale").setValue([99.2, 99.2]);
        tr(ros, "ADBE Position").setValue([W / 2, 860]);
        tr(ros, "ADBE Rotate Z").expression = TRI + 'time*' + rings[g][2] + '*6*FLOW;';
        tr(ros, "ADBE Opacity").expression = ENV + '100*(1 - ex);';
    }
    var gtc2 = textComp("guilloche-text", "No. 0042", 150, "Didot");
    var guT = gu.layers.add(gtc2); fillFx(guT, 2); tr(guT, "ADBE Position").setValue([W / 2, 1480]);
    tr(guT, "ADBE Opacity").expression = ENV + '100*Math.min(1, Math.max(0, en*2 - 1))*(1-ex);';
    log.push("guilloche ok");
}

// =====================================================================================
// 8. LONG EXPOSURE — motion inside a precomp, Echo on the precomp layer
// =====================================================================================
if (want("exposure")) {
    var ex8 = addComp("lab-exposure"); controller(ex8);
    solid(ex8, "night", 2).moveToEnd();
    var mv = addComp("exposure-light");
    var dot = mv.layers.addShape(); dot.name = "lamp";
    var dg = dot.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    dg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([26, 26]);
    dg = dot.property("ADBE Root Vectors Group").property(1);
    dg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").expression = PAL(3) + ';';
    tr(dot, "ADBE Position").expression = TRI + 'var t = time*(0.8 + 1.6*FLOW);\n[540 + 380*Math.sin(t*1.3), 900 + 520*Math.sin(t*2.1 + 0.6)];';
    var mvL = ex8.layers.add(mv); mvL.name = "light painting";
    var ech = fx(mvL, "ADBE Echo");
    pp(ech, "0001").setValue(-1 / (FPS * 4));                          // sub-frame echoes → a continuous ribbon
    pp(ech, "0002").expression = TRI + 'Math.round(60 + 140*FORM);';
    pp(ech, "0003").setValue(1);
    pp(ech, "0004").expression = TRI + '0.975 + 0.02*FORM;';
    pp(ech, "0005").setValue(2);     // maximum
    var etc = textComp("exposure-text", "Afterglow", 190);
    var eT = ex8.layers.add(etc); fillFx(eT, 1); tr(eT, "ADBE Position").setValue([W / 2, 1520]);
    tr(eT, "ADBE Opacity").expression = ENV + '100*en*(1-ex);';
    log.push("exposure ok");
}

// =====================================================================================
// 9. PLATE-DRIVEN REVEAL — imported footage as the Gradient Wipe map (e.g. a generated ink bloom)
// =====================================================================================
if (want("plate") && A.vid) {
    var pv = addComp("lab-plate"); controller(pv);
    solid(pv, "paper", 1).moveToEnd();
    var vid = importFile(A.vid);
    var vL = pv.layers.add(vid); vL.name = "bloom plate"; vL.enabled = false; vL.audioEnabled = false;
    var vs = Math.max(W / vid.width, H / vid.height) * 100; tr(vL, "ADBE Scale").setValue([vs, vs]);
    if (vid.duration < DUR) { vL.timeRemapEnabled = true; vL.property("ADBE Time Remapping").expression = 'loopOut("pingpong");'; }
    var ptx = textComp("plate-text", "Weather\nsystem", 230);
    var pT2 = pv.layers.add(ptx); fillFx(pT2, 2); tr(pT2, "ADBE Position").setValue([W / 2, 960]);
    var pgw = fx(pT2, "ADBE Gradient Wipe");
    pp(pgw, "0001").expression = ENV + 'Math.max(100*(1 - en), 100*ex);';
    pp(pgw, "0002").expression = TRI + 'linear(PRES, 0, 1, 25, 6);';
    pp(pgw, "0004").setValue(3);
    pp(pgw, "0003").setValue(vL.index);
    // the plate also shows, faintly, as weather on the paper
    var vShow = pv.layers.add(vid); vShow.name = "plate show"; vShow.audioEnabled = false; tr(vShow, "ADBE Scale").setValue([vs, vs]);
    fx(vShow, "ADBE Black&White");
    vShow.blendingMode = BlendingMode.MULTIPLY; tr(vShow, "ADBE Opacity").expression = TRI + '10 + 30*FORM;';
    vShow.moveBefore(pv.layer("paper"));
    log.push("plate ok");
}

AECTX.out(log.join("\n"));
