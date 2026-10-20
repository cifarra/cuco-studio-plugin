// Worked example: a flapping bird that flies across the comp.
// Run with:  scripts/ae-run.sh examples/bird.jsx
// Demonstrates: shape layers (ellipse + custom path), fills, a null controller,
// parenting, back-to-front build order, and animation via expressions.
(function buildBird() {
    app.beginUndoGroup("Create Bird Animation");

    var W = 1920, H = 1080, FPS = 30, DUR = 6;
    var comp = app.project.items.addComp("Bird Animation", W, H, 1, DUR, FPS);
    comp.openInViewer();

    function rgb(r, g, b) { return [r / 255, g / 255, b / 255]; }
    function addFill(grp, color) {
        var fill = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(color);
        return fill;
    }
    function newShapeLayer(name) { var l = comp.layers.addShape(); l.name = name; return l; }
    function rootGroup(l) { return l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); }

    function ellipseLayer(name, size, color, pos) {
        var l = newShapeLayer(name), g = rootGroup(l);
        var e = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");
        e.property("ADBE Vector Ellipse Size").setValue(size);
        e.property("ADBE Vector Ellipse Position").setValue([0, 0]); // draw at layer origin
        addFill(g, color);
        l.property("ADBE Transform Group").property("ADBE Position").setValue(pos);
        return l;
    }
    function pathLayer(name, verts, color, pos) {
        var l = newShapeLayer(name), g = rootGroup(l);
        var pg = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
        var sh = new Shape(); sh.vertices = verts; sh.closed = true;
        pg.property("ADBE Vector Shape").setValue(sh);
        addFill(g, color);
        l.property("ADBE Transform Group").property("ADBE Position").setValue(pos);
        return l;
    }

    var bodyCol = rgb(255, 138, 76), wingCol = rgb(230, 110, 56), headCol = rgb(255, 158, 96),
        beakCol = rgb(255, 204, 92), tailCol = rgb(214, 96, 48);

    // background (added FIRST -> ends up at the bottom of the stack)
    var bg = comp.layers.addSolid(rgb(135, 206, 250), "Sky", W, H, 1);
    var ramp = bg.property("ADBE Effect Parade").addProperty("ADBE Ramp");
    ramp.property("ADBE Ramp-0001").setValue([W / 2, 0]);
    ramp.property("ADBE Ramp-0002").setValue(rgb(175, 222, 255));
    ramp.property("ADBE Ramp-0003").setValue([W / 2, H]);
    ramp.property("ADBE Ramp-0004").setValue(rgb(120, 190, 245));

    var ctrl = comp.layers.addNull(); ctrl.name = "Bird_CTRL";
    ctrl.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);

    var cx = W / 2, cy = H / 2;
    // Build BACK -> FRONT: each new layer is added on top of the previous one.
    var farWing = pathLayer("Wing_Far", [[0, 0], [-150, -30], [-130, 70], [-15, 35]], wingCol, [cx - 30, cy - 30]);
    var tail = pathLayer("Tail", [[0, 0], [-130, -45], [-110, 25], [-130, 70], [0, 35]], tailCol, [cx - 95, cy + 5]);
    var body = ellipseLayer("Body", [260, 170], bodyCol, [cx, cy]);
    var head = ellipseLayer("Head", [150, 150], headCol, [cx + 110, cy - 60]);
    var beak = pathLayer("Beak", [[0, -18], [70, 5], [0, 28]], beakCol, [cx + 175, cy - 58]);
    var eyeW = ellipseLayer("Eye", [44, 44], rgb(255, 255, 255), [cx + 135, cy - 78]);
    var pupil = ellipseLayer("Pupil", [20, 20], rgb(40, 40, 40), [cx + 142, cy - 78]);
    var nearWing = pathLayer("Wing_Near", [[0, 0], [-165, -35], [-140, 80], [-15, 40]], wingCol, [cx - 10, cy - 20]);

    var parts = [farWing, tail, body, head, beak, eyeW, pupil, nearWing];
    for (var i = 0; i < parts.length; i++) parts[i].parent = ctrl; // parent AFTER positioning

    // flight path + bob
    ctrl.property("ADBE Transform Group").property("ADBE Position").expression =
        "x = -350 + (time/thisComp.duration)*(thisComp.width+700);\r" +
        "y = thisComp.height*0.42 + 70*Math.sin(time*2.2);\r[x, y];";
    ctrl.property("ADBE Transform Group").property("ADBE Rotate Z").expression = "8*Math.cos(time*2.2);";

    // wing flap + tail wag
    nearWing.property("ADBE Transform Group").property("ADBE Rotate Z").expression = "28*Math.sin(time*11);";
    farWing.property("ADBE Transform Group").property("ADBE Rotate Z").expression = "22*Math.sin(time*11 + 0.5);";
    tail.property("ADBE Transform Group").property("ADBE Rotate Z").expression = "6*Math.sin(time*11 + 1.0);";

    app.endUndoGroup();
    aeWrite("Bird Animation created: " + comp.numLayers + " layers, " + DUR + "s @ " + FPS + "fps.");
})();
