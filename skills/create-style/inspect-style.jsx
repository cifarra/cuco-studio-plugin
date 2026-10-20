/*
 * Style Inspector — Deeply inspects an AE project's CucoStudio style structure
 * Writes a detailed report to ae-log.txt
 */
$.level = 0;
app.beginSuppressDialogs();

(function () {
    var LOG_PATH = Folder("~").fsName + "/styles/doyouplay/ae-log.txt";
    var lines = [];

    function log(msg) { lines.push(msg); }
    function indent(n) { var s = ""; for (var i = 0; i < n; i++) s += "  "; return s; }

    function writeLog(success) {
        var status = success ? "SUCCESS" : "ERROR";
        var f = new File(LOG_PATH);
        f.open("w");
        f.write(status + "\n" + lines.join("\n") + "\n");
        f.close();
    }

    try {
        // Read project path from a config file, or use default
        var projectPath = "";
        var configFile = new File(Folder("~").fsName + "/styles/doyouplay/inspect-target.txt");
        if (configFile.exists) {
            configFile.open("r");
            projectPath = configFile.read().replace(/[\r\n]/g, "");
            configFile.close();
        }
        if (projectPath.length) {
            var projFile = new File(projectPath);
            if (!projFile.exists) {
                throw new Error("Project file not found: " + projectPath);
            }
            app.open(projFile);
        }
        var projName = app.project.file ? app.project.file.name : "(current project)";
        log("Inspecting project: " + projName);
        log("Total items: " + app.project.numItems);
        log("");

        // ─── INVENTORY ALL ITEMS ───
        log("=== PROJECT INVENTORY ===");
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            var type = "unknown";
            if (item instanceof CompItem) type = "COMP";
            else if (item instanceof FolderItem) type = "FOLDER";
            else if (item instanceof FootageItem) type = "FOOTAGE";
            var parent = item.parentFolder ? item.parentFolder.name : "(root)";
            log(indent(1) + "[" + type + "] \"" + item.name + "\" (parent: " + parent + ")");
            if (item instanceof CompItem) {
                log(indent(2) + "size: " + item.width + "x" + item.height + " | dur: " + item.duration.toFixed(2) + "s | fps: " + item.frameRate);
            }
        }
        log("");

        // ─── DEEP INSPECT EACH COMP ───
        log("=== DETAILED COMP INSPECTION ===");
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) continue;

            log("───────────────────────────────");
            log("COMP: \"" + item.name + "\" (" + item.width + "x" + item.height + " @ " + item.frameRate + "fps, " + item.duration.toFixed(2) + "s)");
            log("  Layers: " + item.numLayers);

            for (var l = 1; l <= item.numLayers; l++) {
                var layer = item.layer(l);
                var layerType = "unknown";
                if (layer instanceof TextLayer) layerType = "TEXT";
                else if (layer instanceof ShapeLayer) layerType = "SHAPE";
                else if (layer instanceof AVLayer) {
                    if (layer.nullLayer) layerType = "NULL";
                    else if (layer.adjustmentLayer) layerType = "ADJUSTMENT";
                    else if (layer.source instanceof CompItem) layerType = "PRECOMP";
                    else layerType = "SOLID/FOOTAGE";
                }
                else if (layer instanceof CameraLayer) layerType = "CAMERA";
                else if (layer instanceof LightLayer) layerType = "LIGHT";

                var sourceInfo = "";
                if (layer.source) {
                    sourceInfo = " -> source: \"" + layer.source.name + "\"";
                }

                log(indent(1) + "[" + l + "] " + layerType + " \"" + layer.name + "\"" + sourceInfo);
                log(indent(2) + "inPoint: " + layer.inPoint.toFixed(2) + " | outPoint: " + layer.outPoint.toFixed(2) + " | startTime: " + layer.startTime.toFixed(2));

                // ─── EFFECTS ───
                var effects = layer.property("ADBE Effect Parade");
                if (effects && effects.numProperties > 0) {
                    log(indent(2) + "Effects (" + effects.numProperties + "):");
                    for (var e = 1; e <= effects.numProperties; e++) {
                        var ef = effects.property(e);
                        log(indent(3) + "\"" + ef.name + "\" [" + ef.matchName + "]");
                        // Log effect property values
                        for (var p = 1; p <= ef.numProperties; p++) {
                            var prop = ef.property(p);
                            if (prop.propertyValueType !== PropertyValueType.NO_VALUE) {
                                try {
                                    var val = prop.value;
                                    if (val instanceof Array) {
                                        val = "[" + val.join(", ") + "]";
                                    }
                                    log(indent(4) + prop.name + " = " + val);
                                    // Log keyframes
                                    if (prop.numKeys > 0) {
                                        log(indent(5) + "Keyframes (" + prop.numKeys + "):");
                                        for (var k = 1; k <= prop.numKeys; k++) {
                                            var kVal = prop.keyValue(k);
                                            if (kVal instanceof Array) kVal = "[" + kVal.join(", ") + "]";
                                            log(indent(6) + "key" + k + " @ " + prop.keyTime(k).toFixed(3) + "s = " + kVal);
                                        }
                                    }
                                } catch (ex) {}
                            }
                        }
                    }
                }

                // ─── KEY TRANSFORM PROPERTIES ───
                var transforms = [
                    {name: "Position", match: "ADBE Position"},
                    {name: "Scale", match: "ADBE Scale"},
                    {name: "Rotation", match: "ADBE Rotate Z"},
                    {name: "Opacity", match: "ADBE Opacity"},
                    {name: "Anchor Point", match: "ADBE Anchor Point"}
                ];

                var hasAnimatedTransform = false;
                for (var t = 0; t < transforms.length; t++) {
                    try {
                        var tProp = layer.property("ADBE Transform Group").property(transforms[t].match);
                        if (tProp && tProp.numKeys > 0) {
                            if (!hasAnimatedTransform) {
                                log(indent(2) + "Animated Transforms:");
                                hasAnimatedTransform = true;
                            }
                            log(indent(3) + transforms[t].name + " (" + tProp.numKeys + " keys):");
                            for (var k = 1; k <= tProp.numKeys; k++) {
                                var kVal = tProp.keyValue(k);
                                if (kVal instanceof Array) kVal = "[" + kVal.join(", ") + "]";
                                log(indent(4) + "key" + k + " @ " + tProp.keyTime(k).toFixed(3) + "s = " + kVal);
                            }
                            if (tProp.expression && tProp.expression.length > 0) {
                                // Just first 80 chars of expression
                                var expr = tProp.expression.replace(/[\r\n]/g, " ").substr(0, 80);
                                log(indent(4) + "expr: " + expr + "...");
                            }
                        }
                    } catch (ex) {}
                }

                // ─── TEXT PROPERTIES (for text layers) ───
                if (layer instanceof TextLayer) {
                    try {
                        var textProp = layer.property("Source Text");
                        var textDoc = textProp.value;
                        log(indent(2) + "Text Properties:");
                        log(indent(3) + "font: \"" + textDoc.font + "\" size: " + textDoc.fontSize);
                        log(indent(3) + "fillColor: [" + textDoc.fillColor.join(", ") + "]");
                        log(indent(3) + "justification: " + textDoc.justification);
                        var textContent = textDoc.text.replace(/[\r\n]/g, " | ");
                        log(indent(3) + "text: \"" + textContent + "\"");
                        // Check for Source Text expression
                        if (textProp.expression && textProp.expression.length > 0) {
                            var expr = textProp.expression.replace(/[\r\n]/g, " ").substr(0, 120);
                            log(indent(3) + "sourceText expr: " + expr + "...");
                        }
                        // Check for text animators
                        var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
                        if (animators && animators.numProperties > 0) {
                            log(indent(3) + "Animators (" + animators.numProperties + "):");
                            for (var a = 1; a <= animators.numProperties; a++) {
                                var animator = animators.property(a);
                                log(indent(4) + "\"" + animator.name + "\"");
                                // Check selector (Range Selector)
                                var selectors = animator.property("ADBE Text Selectors");
                                if (selectors) {
                                    for (var sel = 1; sel <= selectors.numProperties; sel++) {
                                        var selector = selectors.property(sel);
                                        log(indent(5) + "Selector: \"" + selector.name + "\" [" + selector.matchName + "]");
                                        // Check for animated Offset or other properties
                                        for (var sp = 1; sp <= selector.numProperties; sp++) {
                                            try {
                                                var sProp = selector.property(sp);
                                                if (sProp.numKeys > 0) {
                                                    log(indent(6) + sProp.name + " (" + sProp.numKeys + " keys):");
                                                    for (var k = 1; k <= Math.min(sProp.numKeys, 4); k++) {
                                                        var kVal = sProp.keyValue(k);
                                                        if (kVal instanceof Array) kVal = "[" + kVal.join(", ") + "]";
                                                        log(indent(7) + "key" + k + " @ " + sProp.keyTime(k).toFixed(3) + "s = " + kVal);
                                                    }
                                                    if (sProp.expression && sProp.expression.length > 0) {
                                                        var expr = sProp.expression.replace(/[\r\n]/g, " ").substr(0, 120);
                                                        log(indent(7) + "expr: " + expr + "...");
                                                    }
                                                }
                                            } catch(ex) {}
                                        }
                                    }
                                }
                                // Check animator properties (Opacity, Position, Scale, etc.)
                                var animProps = animator.property("ADBE Text Animator Properties");
                                if (animProps) {
                                    for (var ap = 1; ap <= animProps.numProperties; ap++) {
                                        try {
                                            var aProp = animProps.property(ap);
                                            var aVal = aProp.value;
                                            if (aVal instanceof Array) aVal = "[" + aVal.join(", ") + "]";
                                            log(indent(5) + "AnimProp: " + aProp.name + " = " + aVal);
                                        } catch(ex) {}
                                    }
                                }
                            }
                        }
                    } catch (ex) {
                        log(indent(2) + "Error reading text: " + ex.message);
                    }
                }

                // ─── MASKS ───
                try {
                    var masks = layer.property("ADBE Mask Parade");
                    if (masks && masks.numProperties > 0) {
                        log(indent(2) + "Masks (" + masks.numProperties + "):");
                        for (var m = 1; m <= masks.numProperties; m++) {
                            var mask = masks.property(m);
                            log(indent(3) + "\"" + mask.name + "\" mode: " + mask.property("ADBE Mask Mode").value);
                        }
                    }
                } catch (ex) {}

                // ─── CHECK FOR EXPRESSIONS on key properties ───
                var exprProps = [
                    ["Position", "ADBE Transform Group", "ADBE Position"],
                    ["Scale", "ADBE Transform Group", "ADBE Scale"],
                    ["Opacity", "ADBE Transform Group", "ADBE Opacity"],
                    ["Rotation", "ADBE Transform Group", "ADBE Rotate Z"]
                ];
                var hasExpr = false;
                for (var ep = 0; ep < exprProps.length; ep++) {
                    try {
                        var eProp = layer.property(exprProps[ep][1]).property(exprProps[ep][2]);
                        if (eProp.expression && eProp.expression.length > 0 && eProp.numKeys === 0) {
                            if (!hasExpr) {
                                log(indent(2) + "Expressions (no keyframes):");
                                hasExpr = true;
                            }
                            var expr = eProp.expression.replace(/[\r\n]/g, " ").substr(0, 120);
                            log(indent(3) + exprProps[ep][0] + ": " + expr + "...");
                        }
                    } catch(ex) {}
                }
            }
            log("");
        }

        writeLog(true);

    } catch (e) {
        log("FATAL: " + e.message + " (line " + e.line + ")");
        writeLog(false);
    }

    app.endSuppressDialogs(false);
})();
