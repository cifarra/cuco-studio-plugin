// Hermes Cobalt — CucoStudio style builder (extraction v2)
// BLUE-dominant: #0000F2 field, paper type, white-line engravings.
// Display: Didot (closest installed Didone to Sigurd 300); mono: Courier New
// (the site's own monoFont fallback for Courier Prime). ES3 only.

$.level = 0;
app.beginSuppressDialogs();

var LOG_PATH = Folder("~").fsName + "/styles/hermes/ae-log.txt";
function writeLog(success, lines) {
    var f = new File(LOG_PATH);
    f.open("w");
    f.write((success ? "SUCCESS" : "ERROR") + "\n" + lines.join("\n") + "\n");
    f.close();
}
var log = [];

// Palette v2 (area-weighted): dominant blue, paper secondary, pale tint accent
var BLUE  = [0, 0, 242/255, 1];
var PAPER = [245/255, 245/255, 245/255, 1];
var TINT  = [228/255, 230/255, 252/255, 1];

var W = 1080, H = 1920, FPS = 30, DUR = 10, MAIN_DUR = 30;
var FONT_DISPLAY = "Didot";
var FONT_DISPLAY_BOLD = "Didot-Bold";
var FONT_MONO = "CourierNewPSMT";

// ---------------------------------------------------------------- helpers
function addSlider(layer, name, value) {
    var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
    fx.name = name;
    fx.property("ADBE Slider Control-0001").setValue(value);
    return fx;
}
function addColorCtl(layer, name, rgba) {
    var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Color Control");
    fx.name = name;
    fx.property("ADBE Color Control-0001").setValue(rgba);
    return fx;
}
function addFill(layer, rgba) {
    var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Fill");
    fx.property("ADBE Fill-0002").setValue(rgba);
    return fx;
}
// White-line engraving on blue: shadows -> field blue, highlights -> paper.
function addTintEngraving(layer, blackTo, whiteTo) {
    var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Tint");
    fx.property("ADBE Tint-0001").setValue(blackTo);
    fx.property("ADBE Tint-0002").setValue(whiteTo);
    fx.property("ADBE Tint-0003").expression =
        'var fo = comp("mainComp").layer("mainControl").effect("FORM")("Slider")/100;\n' +
        '70 + 30 * fo;';
    return fx;
}
function easeKeys(prop, t1, v1, t2, v2) {
    prop.setValueAtTime(t1, v1);
    prop.setValueAtTime(t2, v2);
    var dims = 1;
    var pvt = prop.propertyValueType;
    if (pvt === PropertyValueType.TwoD) dims = 2;
    else if (pvt === PropertyValueType.ThreeD) dims = 3;
    var easeIn = [], easeOut = [];
    for (var d = 0; d < dims; d++) {
        easeIn.push(new KeyframeEase(0, 78));
        easeOut.push(new KeyframeEase(0, 78));
    }
    prop.setTemporalEaseAtKey(1, easeIn, easeOut);
    prop.setTemporalEaseAtKey(2, easeIn, easeOut);
}
function linkExpr(which, extra) {
    var e =
        'var controller = thisComp.layer("controller").effect("' + which + '")("Slider");\n' +
        'var tmv = 100;\n' +
        'try { tmv = thisLayer.effect("time_modifier")("Slider").value; } catch(err) {}\n' +
        'var dm = tmv / 100;\n' +
        'var cs = controller.key(1).time;\n' +
        'var ce = controller.key(2).time;\n' +
        'var nae = cs + ((ce - cs) * dm);\n' +
        'var progress = linear(time, cs, nae, 0, 1);\n' +
        'var nt = linear(progress, 0, 1, thisProperty.key(1).time, thisProperty.key(thisProperty.numKeys).time);\n' +
        'var v = valueAtTime(nt);\n';
    if (extra) { e += extra + '\n'; } else { e += 'v;\n'; }
    return e;
}
function makeController(comp) {
    var c = comp.layers.addNull(DUR);
    c.name = "controller";
    var enter = addSlider(c, "enter", 0);
    enter.property("ADBE Slider Control-0001").setValueAtTime(0, 0);
    enter.property("ADBE Slider Control-0001").setValueAtTime(1, 100);
    var exit = addSlider(c, "exit", 0);
    exit.property("ADBE Slider Control-0001").setValueAtTime(0, 0);
    exit.property("ADBE Slider Control-0001").setValueAtTime(1, 100);
    return c;
}
function makeBG(comp, rgba) {
    var bg = comp.layers.addSolid([1, 1, 1], "BG", W, H, 1, DUR);
    addFill(bg, rgba);
    bg.moveToEnd();
    return bg;
}
// Hairline ray burst — paper-colored engraving rays (their hero language).
function makeRays(comp, x, y, innerR, rayLen, rayW, copies, color) {
    var shape = comp.layers.addShape();
    shape.name = "rays";
    var contents = shape.property("ADBE Root Vectors Group");
    var grp = contents.addProperty("ADBE Vector Group");
    var rect = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").setValue([rayW, rayLen]);
    rect.property("ADBE Vector Rect Position").setValue([0, -(rayLen / 2 + innerR)]);
    var fill = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").setValue(color);
    var rep = contents.addProperty("ADBE Vector Filter - Repeater");
    rep.property("ADBE Vector Repeater Copies").setValue(copies);
    var tr = rep.property("ADBE Vector Repeater Transform");
    tr.property("ADBE Vector Repeater Rotation").setValue(360 / copies);
    tr.property("ADBE Vector Repeater Position").setValue([0, 0]);
    shape.property("ADBE Transform Group").property("ADBE Position").setValue([x, y]);
    shape.property("ADBE Transform Group").property("ADBE Rotate Z").expression =
        'var fl = comp("mainComp").layer("mainControl").effect("FLOW")("Slider")/100;\n' +
        'value + time * 10 * fl;';
    shape.property("ADBE Transform Group").property("ADBE Opacity").expression =
        'var fo = comp("mainComp").layer("mainControl").effect("FORM")("Slider")/100;\n' +
        'value * Math.min(1, 0.4 + fo);';
    return shape;
}
function centerInComp(layer, comp) {
    var r = layer.sourceRectAtTime(0, false);
    var tg = layer.property("ADBE Transform Group");
    var pos = tg.property("ADBE Position").value;
    var anc = tg.property("ADBE Anchor Point").value;
    var boxCx = pos[0] + (r.left + r.width / 2 - anc[0]);
    var boxCy = pos[1] + (r.top + r.height / 2 - anc[1]);
    tg.property("ADBE Position").setValue(
        [pos[0] + (comp.width / 2 - boxCx), pos[1] + (comp.height / 2 - boxCy)]);
}
function makeText(comp, str, font, size, just, fillRGB, tracking) {
    var t = comp.layers.addText(str);
    var doc = t.property("ADBE Text Properties").property("ADBE Text Document").value;
    doc.font = font;
    doc.fontSize = size;
    doc.fillColor = fillRGB;
    doc.justification = just;
    if (tracking) { doc.tracking = tracking; }
    t.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc);
    return t;
}

// ---------------------------------------------------------------- build
try {
    while (app.project.numItems > 0) { app.project.item(1).remove(); }

    var mainComp = app.project.items.addComp("mainComp", W, H, 1, MAIN_DUR, FPS);
    var shotsFolder = app.project.items.addFolder("ORIGINAL_SHOTS");
    var preFolder = app.project.items.addFolder("PRECOMPS");

    var mc = mainComp.layers.addNull(MAIN_DUR);
    mc.name = "mainControl";
    addSlider(mc, "FORM", 55);
    addSlider(mc, "FLOW", 45);
    addSlider(mc, "PRESSURE", 40);
    addColorCtl(mc, "1", BLUE);
    addColorCtl(mc, "2", PAPER);
    addColorCtl(mc, "3", TINT);
    log.push("mainComp + mainControl created");

    // ============================ SHOT 01 — herald (text + media, blue field)
    var t01 = app.project.items.addComp("01-text", 960, 560, 1, DUR, FPS);
    t01.parentFolder = preFolder;
    var tb01 = makeText(t01, "THE AGENT\rTHAT GROWS\rWITH YOU",
        FONT_DISPLAY, 96, ParagraphJustification.LEFT_JUSTIFY,
        [PAPER[0], PAPER[1], PAPER[2]], 40);
    tb01.name = "textBlock";
    var d01 = tb01.property("ADBE Text Properties").property("ADBE Text Document").value;
    d01.leading = 88;  // tight 0.9 leading like the site
    tb01.property("ADBE Text Properties").property("ADBE Text Document").setValue(d01);
    centerInComp(tb01, t01);

    var f01 = app.project.items.addComp("01-frame", 900, 900, 1, DUR, FPS);
    f01.parentFolder = preFolder;
    f01.layers.addSolid([0.2, 0.2, 0.25], "placeholder", 900, 900, 1, DUR);

    var s01 = app.project.items.addComp("01", W, H, 1, DUR, FPS);
    s01.parentFolder = shotsFolder;
    makeController(s01);

    // mono kicker (their "OPEN SOURCE • MIT LICENSE" register)
    var kick01 = makeText(s01, "OPEN SYSTEM • ONE INK",
        FONT_MONO, 28, ParagraphJustification.LEFT_JUSTIFY,
        [PAPER[0], PAPER[1], PAPER[2]], 160);
    kick01.property("ADBE Transform Group").property("ADBE Position").setValue([120, 1310]);
    easeKeys(kick01.property("ADBE Transform Group").property("ADBE Opacity"), 0.35, 0, 0.9, 100);
    kick01.property("ADBE Transform Group").property("ADBE Opacity").expression =
        linkExpr("enter",
            'var p = comp("mainComp").layer("mainControl").effect("PRESSURE")("Slider")/100;\n' +
            'v * Math.min(1, 0.35 + p * 1.3);');

    // display text block, lower-left like the hero
    var lt01 = s01.layers.add(t01);
    addFill(lt01, PAPER);
    addSlider(lt01, "time_modifier", 100);
    lt01.property("ADBE Transform Group").property("ADBE Position").setValue([540, 1520]);
    easeKeys(lt01.property("ADBE Transform Group").property("ADBE Position"),
        0.3, [540, 1580], 1.0, [540, 1520]);
    lt01.property("ADBE Transform Group").property("ADBE Position").expression = linkExpr("enter", "v;");
    easeKeys(lt01.property("ADBE Transform Group").property("ADBE Opacity"), 0.3, 0, 0.95, 100);
    lt01.property("ADBE Transform Group").property("ADBE Opacity").expression = linkExpr("enter", "v;");

    // media: white-line engraving floating on the field (no box)
    var lf01 = s01.layers.add(f01);
    addTintEngraving(lf01, BLUE, PAPER);
    addSlider(lf01, "time_modifier", 100);
    lf01.property("ADBE Transform Group").property("ADBE Position").setValue([540, 660]);
    easeKeys(lf01.property("ADBE Transform Group").property("ADBE Scale"),
        0.1, [92, 92, 100], 0.9, [100, 100, 100]);
    lf01.property("ADBE Transform Group").property("ADBE Scale").expression = linkExpr("enter", "v;");
    easeKeys(lf01.property("ADBE Transform Group").property("ADBE Opacity"), 0.1, 0, 0.75, 100);
    lf01.property("ADBE Transform Group").property("ADBE Opacity").expression = linkExpr("enter", "v;");

    // hairline paper rays radiating from behind the media
    var rays01 = makeRays(s01, 540, 660, 350, 300, 3, 48, PAPER);
    rays01.moveAfter(lf01);
    addSlider(rays01, "time_modifier", 100);
    easeKeys(rays01.property("ADBE Transform Group").property("ADBE Scale"),
        0.0, [55, 55, 100], 1.0, [100, 100, 100]);
    rays01.property("ADBE Transform Group").property("ADBE Scale").expression = linkExpr("enter", "v;");

    makeBG(s01, BLUE);
    log.push("shot 01 (herald) built");

    // ============================ SHOT 02 — titles (text only, blue field)
    var t02 = app.project.items.addComp("02-text", 960, 760, 1, DUR, FPS);
    t02.parentFolder = preFolder;
    var tb02 = makeText(t02, "THE STORIES\rWE TELL",
        FONT_DISPLAY, 120, ParagraphJustification.CENTER_JUSTIFY,
        [PAPER[0], PAPER[1], PAPER[2]], 30);
    tb02.name = "textBlock";
    var d02 = tb02.property("ADBE Text Properties").property("ADBE Text Document").value;
    d02.leading = 112;
    tb02.property("ADBE Text Properties").property("ADBE Text Document").setValue(d02);
    centerInComp(tb02, t02);

    var s02 = app.project.items.addComp("02", W, H, 1, DUR, FPS);
    s02.parentFolder = shotsFolder;
    makeController(s02);

    // wide-tracked serif caps header (their nav register)
    var head02 = makeText(s02, "H E R M E S",
        FONT_DISPLAY_BOLD, 34, ParagraphJustification.CENTER_JUSTIFY,
        [PAPER[0], PAPER[1], PAPER[2]], 420);
    head02.property("ADBE Transform Group").property("ADBE Position").setValue([540, 260]);
    easeKeys(head02.property("ADBE Transform Group").property("ADBE Opacity"), 0.15, 0, 0.7, 100);
    head02.property("ADBE Transform Group").property("ADBE Opacity").expression = linkExpr("enter", "v;");

    var lt02 = s02.layers.add(t02);
    addFill(lt02, PAPER);
    addSlider(lt02, "time_modifier", 100);
    lt02.property("ADBE Transform Group").property("ADBE Position").setValue([540, 930]);
    easeKeys(lt02.property("ADBE Transform Group").property("ADBE Opacity"), 0.25, 0, 1.0, 100);
    lt02.property("ADBE Transform Group").property("ADBE Opacity").expression = linkExpr("enter", "v;");
    easeKeys(lt02.property("ADBE Transform Group").property("ADBE Scale"),
        0.25, [96, 96, 100], 1.0, [100, 100, 100]);
    lt02.property("ADBE Transform Group").property("ADBE Scale").expression = linkExpr("enter", "v;");

    // giant hairline burst behind, engraving register
    var rays02 = makeRays(s02, 540, 960, 430, 560, 3, 56, PAPER);
    rays02.moveToEnd();
    addSlider(rays02, "time_modifier", 100);
    easeKeys(rays02.property("ADBE Transform Group").property("ADBE Opacity"), 0.0, 0, 1.2, 55);
    rays02.property("ADBE Transform Group").property("ADBE Opacity").expression =
        linkExpr("enter",
            'var fo = comp("mainComp").layer("mainControl").effect("FORM")("Slider")/100;\n' +
            'v * Math.min(1, 0.4 + fo);');

    // mono furniture
    var foot02 = makeText(s02, "/\\-_=+|<  NO. 02  ~:*-/",
        FONT_MONO, 26, ParagraphJustification.CENTER_JUSTIFY,
        [TINT[0], TINT[1], TINT[2]], 200);
    foot02.property("ADBE Transform Group").property("ADBE Position").setValue([540, 1730]);
    foot02.property("ADBE Transform Group").property("ADBE Opacity").expression =
        'var p = comp("mainComp").layer("mainControl").effect("PRESSURE")("Slider")/100;\n' +
        'Math.min(100, (0.35 + p * 1.3) * 100);';

    makeBG(s02, BLUE);
    log.push("shot 02 (titles) built");

    // ============================ SHOT 03 — card (media only, white card on blue)
    var t03 = app.project.items.addComp("03-text", 900, 200, 1, DUR, FPS);
    t03.parentFolder = preFolder;
    var tb03 = makeText(t03, "", FONT_MONO, 30,
        ParagraphJustification.CENTER_JUSTIFY, [0, 0, 242/255]);
    tb03.name = "textBlock";

    var f03 = app.project.items.addComp("03-frame", 880, 1060, 1, DUR, FPS);
    f03.parentFolder = preFolder;
    f03.layers.addSolid([0.2, 0.2, 0.25], "placeholder", 880, 1060, 1, DUR);

    var s03 = app.project.items.addComp("03", W, H, 1, DUR, FPS);
    s03.parentFolder = shotsFolder;
    makeController(s03);

    // number + label furniture on the card (their "#4 DELEGATE" register)
    var num03 = makeText(s03, "#3  ARCHIVE",
        FONT_MONO, 30, ParagraphJustification.LEFT_JUSTIFY, [0, 0, 242/255], 220);
    num03.property("ADBE Transform Group").property("ADBE Position").setValue([170, 1595]);
    easeKeys(num03.property("ADBE Transform Group").property("ADBE Opacity"), 0.5, 0, 1.0, 100);
    num03.property("ADBE Transform Group").property("ADBE Opacity").expression =
        linkExpr("enter",
            'var p = comp("mainComp").layer("mainControl").effect("PRESSURE")("Slider")/100;\n' +
            'v * Math.min(1, 0.35 + p * 1.3);');

    // media duotone BLUE-on-white inside the card
    var lf03 = s03.layers.add(f03);
    addTintEngraving(lf03, BLUE, [1, 1, 1, 1]);
    addSlider(lf03, "time_modifier", 100);
    lf03.property("ADBE Transform Group").property("ADBE Position").setValue([540, 890]);
    easeKeys(lf03.property("ADBE Transform Group").property("ADBE Scale"),
        0.15, [96, 96, 100], 1.0, [100, 100, 100]);
    lf03.property("ADBE Transform Group").property("ADBE Scale").expression = linkExpr("enter", "v;");
    easeKeys(lf03.property("ADBE Transform Group").property("ADBE Opacity"), 0.15, 0, 0.8, 100);
    lf03.property("ADBE Transform Group").property("ADBE Opacity").expression = linkExpr("enter", "v;");

    // the white card plate
    var card03 = s03.layers.addSolid([1, 1, 1], "card", 960, 1400, 1, DUR);
    addFill(card03, [1, 1, 1, 1]);
    card03.property("ADBE Transform Group").property("ADBE Position").setValue([540, 960]);
    card03.moveAfter(lf03);
    addSlider(card03, "time_modifier", 100);
    easeKeys(card03.property("ADBE Transform Group").property("ADBE Scale"),
        0.0, [100, 0, 100], 0.7, [100, 100, 100]);
    card03.property("ADBE Transform Group").property("ADBE Scale").expression = linkExpr("enter", "v;");

    // empty text slot — validator requires a -text layer on every shot
    var lt03 = s03.layers.add(t03);
    lt03.property("ADBE Transform Group").property("ADBE Position").setValue([540, 1750]);

    makeBG(s03, BLUE);
    log.push("shot 03 (card) built");

    num03.moveToBeginning();

    var shots = [s01, s02, s03];
    for (var i = 0; i < shots.length; i++) {
        var lay = mainComp.layers.add(shots[i]);
        lay.startTime = i * DUR;
    }
    log.push("shots sequenced in mainComp");

    writeLog(true, log);
} catch (e) {
    log.push("line " + e.line + ": " + e.toString());
    writeLog(false, log);
}

app.endSuppressDialogs(false);
