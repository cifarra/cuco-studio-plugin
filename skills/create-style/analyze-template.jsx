/*
 * Template Analyzer — Deep analysis of AE projects for CucoStudio style conversion
 *
 * Extracts complete structure: layers, keyframes with easing, full expressions,
 * colors, fonts, timing clusters, comp hierarchy, shape data, masks, and more.
 *
 * Config: reads ~/styles/analyze-config.txt
 *   Line 1: AEP path (empty = analyze current project)
 *   Line 2: Output path for analysis report
 *
 * Output: Structured text report designed for Claude to reason about
 */
$.level = 0;
app.beginSuppressDialogs();

(function () {
    // ═══════════════════════════════════════════════════════════
    // CONFIG
    // ═══════════════════════════════════════════════════════════
    var configPath = Folder("~").fsName + "/styles/analyze-config.txt";
    var aepPath = "";
    var logPath = Folder("~").fsName + "/styles/template-analysis.txt";

    var cf = new File(configPath);
    if (cf.exists) {
        cf.open("r");
        var cfText = cf.read();
        cf.close();
        var cfLines = cfText.split(/[\r\n]+/);
        if (cfLines.length > 0 && cfLines[0].length > 0) aepPath = cfLines[0];
        if (cfLines.length > 1 && cfLines[1].length > 0) logPath = cfLines[1];
    }

    var lines = [];
    var colorMap = {};    // hex -> { count, sources[] }
    var fontMap = {};     // fontName -> { sizes{}, count, sources[] }

    function log(msg) { lines.push(msg); }
    function ind(n) { var s = ""; for (var i = 0; i < n; i++) s += "  "; return s; }

    function writeLog(success) {
        try {
            var f = new File(logPath);
            f.lineFeed = "Unix";
            f.open("w");
            f.write((success ? "SUCCESS" : "ERROR") + "\n" + lines.join("\n") + "\n");
            f.close();
        } catch(wErr) {
            // Fallback: write to a known safe path
            var fb = new File(Folder("~").fsName + "/styles/analyze-error.txt");
            fb.lineFeed = "Unix";
            fb.open("w");
            fb.write("WRITE_ERROR: " + wErr.message + "\nlogPath: " + logPath + "\nlines: " + lines.length + "\n");
            fb.close();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    function rgbToHex(r, g, b) {
        var rr = Math.round(Math.min(1, Math.max(0, r)) * 255);
        var gg = Math.round(Math.min(1, Math.max(0, g)) * 255);
        var bb = Math.round(Math.min(1, Math.max(0, b)) * 255);
        var hex = "#";
        hex += (rr < 16 ? "0" : "") + rr.toString(16).toUpperCase();
        hex += (gg < 16 ? "0" : "") + gg.toString(16).toUpperCase();
        hex += (bb < 16 ? "0" : "") + bb.toString(16).toUpperCase();
        return hex;
    }

    function collectColor(r, g, b, source) {
        var hex = rgbToHex(r, g, b);
        if (!colorMap[hex]) colorMap[hex] = { count: 0, sources: [] };
        colorMap[hex].count++;
        if (colorMap[hex].sources.length < 5) colorMap[hex].sources.push(source);
    }

    function collectFont(name, size, source) {
        if (!fontMap[name]) fontMap[name] = { sizes: {}, count: 0, sources: [] };
        fontMap[name].count++;
        fontMap[name].sizes[String(Math.round(size))] = true;
        if (fontMap[name].sources.length < 3) fontMap[name].sources.push(source);
    }

    function fmtNum(v) {
        if (typeof v !== "number") return String(v);
        return (v === Math.floor(v)) ? String(v) : v.toFixed(2);
    }

    function fmtVal(v) {
        if (v === null || v === undefined) return "null";
        if (v instanceof Array) {
            var parts = [];
            for (var i = 0; i < v.length; i++) parts.push(fmtNum(v[i]));
            return "[" + parts.join(", ") + "]";
        }
        return fmtNum(v);
    }

    function interpName(t) {
        if (t === KeyframeInterpolationType.LINEAR) return "LIN";
        if (t === KeyframeInterpolationType.BEZIER) return "BEZ";
        if (t === KeyframeInterpolationType.HOLD) return "HOLD";
        return "?";
    }

    function fmtEase(easeArr) {
        var parts = [];
        for (var i = 0; i < easeArr.length; i++) {
            parts.push(fmtNum(easeArr[i].speed) + "/" + fmtNum(easeArr[i].influence) + "%");
        }
        return "[" + parts.join(", ") + "]";
    }

    function blendName(m) {
        var names = {};
        names[BlendingMode.NORMAL] = "NORMAL";
        names[BlendingMode.ADD] = "ADD";
        names[BlendingMode.MULTIPLY] = "MULTIPLY";
        names[BlendingMode.SCREEN] = "SCREEN";
        names[BlendingMode.OVERLAY] = "OVERLAY";
        names[BlendingMode.SOFT_LIGHT] = "SOFT_LIGHT";
        names[BlendingMode.HARD_LIGHT] = "HARD_LIGHT";
        names[BlendingMode.DIFFERENCE] = "DIFFERENCE";
        names[BlendingMode.COLOR_DODGE] = "COLOR_DODGE";
        names[BlendingMode.COLOR_BURN] = "COLOR_BURN";
        names[BlendingMode.DARKEN] = "DARKEN";
        names[BlendingMode.LIGHTEN] = "LIGHTEN";
        names[BlendingMode.DISSOLVE] = "DISSOLVE";
        names[BlendingMode.EXCLUSION] = "EXCLUSION";
        names[BlendingMode.HUE] = "HUE";
        names[BlendingMode.SATURATION] = "SATURATION";
        names[BlendingMode.COLOR] = "COLOR";
        names[BlendingMode.LUMINOSITY] = "LUMINOSITY";
        names[BlendingMode.SILHOUETE_ALPHA] = "SILHOUETTE_ALPHA";
        names[BlendingMode.SILHOUETE_LUMA] = "SILHOUETTE_LUMA";
        names[BlendingMode.STENCIL_ALPHA] = "STENCIL_ALPHA";
        names[BlendingMode.STENCIL_LUMA] = "STENCIL_LUMA";
        return names[m] || ("MODE_" + m);
    }

    function trackMatteName(t) {
        if (t === TrackMatteType.NO_TRACK_MATTE) return "NONE";
        if (t === TrackMatteType.ALPHA) return "ALPHA";
        if (t === TrackMatteType.ALPHA_INVERTED) return "ALPHA_INV";
        if (t === TrackMatteType.LUMA) return "LUMA";
        if (t === TrackMatteType.LUMA_INVERTED) return "LUMA_INV";
        return "?";
    }

    function layerType(layer) {
        if (layer instanceof TextLayer) return "TEXT";
        if (layer instanceof ShapeLayer) return "SHAPE";
        if (layer instanceof CameraLayer) return "CAMERA";
        if (layer instanceof LightLayer) return "LIGHT";
        if (layer instanceof AVLayer) {
            if (layer.nullLayer) return "NULL";
            if (layer.adjustmentLayer) return "ADJUSTMENT";
            if (layer.source instanceof CompItem) return "PRECOMP";
            return "SOLID/FOOTAGE";
        }
        return "UNKNOWN";
    }

    // ═══════════════════════════════════════════════════════════
    // PROPERTY INSPECTION
    // ═══════════════════════════════════════════════════════════

    // Inspect a single property: value, keyframes with easing, expressions
    function inspectProp(prop, depth, name) {
        try {
            if (prop.propertyValueType === PropertyValueType.NO_VALUE) return;

            var hasKeys = prop.numKeys > 0;
            var hasExpr = false;
            try { hasExpr = prop.expression && prop.expression.length > 0; } catch(e) {}

            if (hasKeys) {
                log(ind(depth) + name + ": ANIMATED (" + prop.numKeys + " keys)");
                for (var k = 1; k <= prop.numKeys; k++) {
                    var kVal = fmtVal(prop.keyValue(k));
                    var inI = interpName(prop.keyInInterpolationType(k));
                    var outI = interpName(prop.keyOutInterpolationType(k));
                    var easePart = "";
                    try {
                        var inE = prop.keyInTemporalEase(k);
                        var outE = prop.keyOutTemporalEase(k);
                        easePart = " | in:" + fmtEase(inE) + " out:" + fmtEase(outE);
                    } catch(e) {}
                    log(ind(depth + 1) + prop.keyTime(k).toFixed(3) + "s = " + kVal + " | " + inI + "→" + outI + easePart);
                }
            } else {
                // Static value (or expression-only)
                try {
                    log(ind(depth) + name + ": " + fmtVal(prop.value));
                } catch(e) {
                    log(ind(depth) + name + ": (unreadable)");
                }
            }

            if (hasExpr) {
                var exprLines = prop.expression.split(/[\r\n]+/);
                if (exprLines.length === 1) {
                    log(ind(depth) + "  expr: " + exprLines[0]);
                } else {
                    log(ind(depth) + "  expr (" + exprLines.length + " lines):");
                    for (var i = 0; i < exprLines.length; i++) {
                        log(ind(depth + 1) + exprLines[i]);
                    }
                }
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════
    // EFFECTS
    // ═══════════════════════════════════════════════════════════

    function inspectEffects(layer, depth, compName) {
        var effects = layer.property("ADBE Effect Parade");
        if (!effects || effects.numProperties === 0) return;

        log(ind(depth) + "── effects (" + effects.numProperties + ") ──");
        for (var e = 1; e <= effects.numProperties; e++) {
            var ef = effects.property(e);
            var enabled = "";
            try { if (!ef.enabled) enabled = " [DISABLED]"; } catch(ex) {}
            log(ind(depth + 1) + "\"" + ef.name + "\" [" + ef.matchName + "]" + enabled);

            for (var p = 1; p <= ef.numProperties; p++) {
                var prop = ef.property(p);
                if (prop.propertyValueType === PropertyValueType.NO_VALUE) continue;

                // Collect colors from Fill effects and Color Controls
                try {
                    if (prop.propertyValueType === PropertyValueType.COLOR) {
                        var c = prop.value;
                        if (c && c.length >= 3) {
                            collectColor(c[0], c[1], c[2], compName + "/" + layer.name + "/fx:" + ef.name);
                        }
                    }
                } catch(ex) {}

                inspectProp(prop, depth + 2, prop.name + " [" + prop.matchName + "]");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TRANSFORM
    // ═══════════════════════════════════════════════════════════

    function inspectTransform(layer, depth) {
        log(ind(depth) + "── transform ──");
        var group = layer.property("ADBE Transform Group");
        if (!group) return;

        var props = [
            ["Anchor Point", "ADBE Anchor Point"],
            ["Position", "ADBE Position"],
            ["Scale", "ADBE Scale"],
            ["Rotation Z", "ADBE Rotate Z"],
            ["Opacity", "ADBE Opacity"]
        ];

        try {
            if (layer.threeDLayer) {
                props.push(["Rotation X", "ADBE Rotate X"]);
                props.push(["Rotation Y", "ADBE Rotate Y"]);
                props.push(["Orientation", "ADBE Orientation"]);
            }
        } catch(e) {}

        // Check for separated position dimensions
        try {
            var posProp = group.property("ADBE Position");
            if (posProp && posProp.dimensionsSeparated) {
                // Replace Position with X/Y/Z Position
                var newProps = [];
                for (var i = 0; i < props.length; i++) {
                    if (props[i][1] !== "ADBE Position") {
                        newProps.push(props[i]);
                    }
                }
                newProps.push(["X Position", "ADBE Position_0"]);
                newProps.push(["Y Position", "ADBE Position_1"]);
                try {
                    if (layer.threeDLayer) newProps.push(["Z Position", "ADBE Position_2"]);
                } catch(e) {}
                props = newProps;
            }
        } catch(e) {}

        for (var i = 0; i < props.length; i++) {
            try {
                var p = group.property(props[i][1]);
                if (p) inspectProp(p, depth + 1, props[i][0]);
            } catch(e) {}
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TEXT
    // ═══════════════════════════════════════════════════════════

    function inspectText(layer, depth, compName) {
        log(ind(depth) + "── text ──");

        try {
            var textProp = layer.property("Source Text");
            var doc = textProp.value;

            log(ind(depth + 1) + "font: \"" + doc.font + "\" size: " + doc.fontSize);
            log(ind(depth + 1) + "fillColor: " + fmtVal(doc.fillColor) + " (" + rgbToHex(doc.fillColor[0], doc.fillColor[1], doc.fillColor[2]) + ")");
            log(ind(depth + 1) + "justify: " + doc.justification);
            try { log(ind(depth + 1) + "tracking: " + doc.tracking); } catch(e) {}
            try { log(ind(depth + 1) + "leading: " + doc.leading); } catch(e) {}
            try {
                if (doc.strokeColor) {
                    log(ind(depth + 1) + "strokeColor: " + fmtVal(doc.strokeColor) + " (" + rgbToHex(doc.strokeColor[0], doc.strokeColor[1], doc.strokeColor[2]) + ")");
                    log(ind(depth + 1) + "strokeWidth: " + doc.strokeWidth);
                    log(ind(depth + 1) + "strokeOverFill: " + doc.strokeOverFill);
                }
            } catch(e) {}
            try { log(ind(depth + 1) + "applyFill: " + doc.applyFill); } catch(e) {}
            try { log(ind(depth + 1) + "applyStroke: " + doc.applyStroke); } catch(e) {}
            try {
                if (doc.boxText) {
                    log(ind(depth + 1) + "boxText: true, boxSize: " + fmtVal(doc.boxTextSize));
                } else {
                    log(ind(depth + 1) + "pointText: true");
                }
            } catch(e) {}
            try { log(ind(depth + 1) + "baselineLocs: " + doc.baselineLocs); } catch(e) {}

            var text = doc.text.replace(/[\r\n]+/g, " | ");
            log(ind(depth + 1) + "content: \"" + text + "\"");

            // Placeholder detection
            var lower = text.toLowerCase();
            var placeholders = ["your", "type here", "placeholder", "headline", "subtitle",
                                "enter text", "title", "edit", "sample", "lorem"];
            for (var ph = 0; ph < placeholders.length; ph++) {
                if (lower.indexOf(placeholders[ph]) >= 0) {
                    log(ind(depth + 1) + "** LIKELY PLACEHOLDER **");
                    break;
                }
            }

            // Collect
            collectColor(doc.fillColor[0], doc.fillColor[1], doc.fillColor[2],
                          compName + "/" + layer.name + "/textFill");
            collectFont(doc.font, doc.fontSize, compName + "/" + layer.name);

            // Source Text expression
            try {
                if (textProp.expression && textProp.expression.length > 0) {
                    var exprLines = textProp.expression.split(/[\r\n]+/);
                    if (exprLines.length === 1) {
                        log(ind(depth + 1) + "sourceText expr: " + exprLines[0]);
                    } else {
                        log(ind(depth + 1) + "sourceText expr (" + exprLines.length + " lines):");
                        for (var i = 0; i < exprLines.length; i++) {
                            log(ind(depth + 2) + exprLines[i]);
                        }
                    }
                }
            } catch(e) {}

            // Source Text keyframes (text switching)
            if (textProp.numKeys > 0) {
                log(ind(depth + 1) + "sourceText keyframes (" + textProp.numKeys + "):");
                for (var k = 1; k <= textProp.numKeys; k++) {
                    try {
                        var kDoc = textProp.keyValue(k);
                        log(ind(depth + 2) + textProp.keyTime(k).toFixed(3) + "s: font=\"" + kDoc.font +
                            "\" size=" + kDoc.fontSize +
                            " color=" + rgbToHex(kDoc.fillColor[0], kDoc.fillColor[1], kDoc.fillColor[2]) +
                            " text=\"" + kDoc.text.replace(/[\r\n]+/g, " | ") + "\"");
                    } catch(e) {}
                }
            }
        } catch(e) {
            log(ind(depth + 1) + "Error reading text: " + e.message);
        }

        // Text Animators
        try {
            var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
            if (animators && animators.numProperties > 0) {
                log(ind(depth) + "── text animators (" + animators.numProperties + ") ──");
                for (var a = 1; a <= animators.numProperties; a++) {
                    var anim = animators.property(a);
                    log(ind(depth + 1) + "\"" + anim.name + "\"");

                    // Animator properties — only log non-default/relevant ones
                    // AE dumps ALL possible properties (including 3D text materials);
                    // we only care about the core animation properties and anything non-default
                    var animProps = anim.property("ADBE Text Animator Properties");
                    if (animProps) {
                        // Core properties that matter for animation
                        var coreMatchNames = {
                            "ADBE Text Anchor Point 3D": true,
                            "ADBE Text Position 3D": true,
                            "ADBE Text Scale 3D": true,
                            "ADBE Text Skew": true,
                            "ADBE Text Rotation X": true,
                            "ADBE Text Rotation Y": true,
                            "ADBE Text Rotation": true,
                            "ADBE Text Opacity": true,
                            "ADBE Text Fill Opacity": true,
                            "ADBE Text Stroke Opacity": true,
                            "ADBE Text Fill Color": true,
                            "ADBE Text Stroke Color": true,
                            "ADBE Text Stroke Width": true,
                            "ADBE Text Tracking Amount": true,
                            "ADBE Text Line Spacing": true,
                            "ADBE Text Blur": true
                        };
                        // Default values for core properties
                        var coreDefaults = {
                            "ADBE Text Anchor Point 3D": "[0, 0, 0]",
                            "ADBE Text Position 3D": "[0, 0, 0]",
                            "ADBE Text Scale 3D": "[100, 100, 100]",
                            "ADBE Text Skew": "0",
                            "ADBE Text Rotation X": "0",
                            "ADBE Text Rotation Y": "0",
                            "ADBE Text Rotation": "0",
                            "ADBE Text Opacity": "100",
                            "ADBE Text Fill Opacity": "100",
                            "ADBE Text Stroke Opacity": "100",
                            "ADBE Text Fill Color": "[1, 0, 0, 1]",
                            "ADBE Text Stroke Color": "[1, 0, 0, 1]",
                            "ADBE Text Stroke Width": "0",
                            "ADBE Text Tracking Amount": "0",
                            "ADBE Text Line Spacing": "[0, 0]",
                            "ADBE Text Blur": "[0, 0]"
                        };
                        var loggedHeader = false;
                        for (var ap = 1; ap <= animProps.numProperties; ap++) {
                            try {
                                var aProp = animProps.property(ap);
                                var mn = aProp.matchName;
                                // Skip non-core properties (3D text materials, VF axes, etc.)
                                if (!coreMatchNames[mn]) continue;
                                // Skip core properties at default values
                                var hasKeys = aProp.numKeys > 0;
                                var hasExpr = false;
                                try { hasExpr = aProp.expression && aProp.expression.length > 0; } catch(ex2) {}
                                if (!hasKeys && !hasExpr) {
                                    var valStr = fmtVal(aProp.value);
                                    if (coreDefaults[mn] && valStr === coreDefaults[mn]) continue;
                                }
                                if (!loggedHeader) {
                                    log(ind(depth + 2) + "Properties:");
                                    loggedHeader = true;
                                }
                                inspectProp(aProp, depth + 3, aProp.name + " [" + mn + "]");
                                // Collect colors from fill color animators
                                if (mn === "ADBE Text Fill Color") {
                                    try {
                                        var c = aProp.value;
                                        collectColor(c[0], c[1], c[2], compName + "/" + layer.name + "/animator");
                                    } catch(ex2) {}
                                }
                            } catch(ex) {}
                        }
                    }

                    // Selectors (how the animation is applied)
                    var selectors = anim.property("ADBE Text Selectors");
                    if (selectors && selectors.numProperties > 0) {
                        for (var s = 1; s <= selectors.numProperties; s++) {
                            var sel = selectors.property(s);
                            log(ind(depth + 2) + "Selector: \"" + sel.name + "\" [" + sel.matchName + "]");
                            for (var sp = 1; sp <= sel.numProperties; sp++) {
                                try {
                                    var sProp = sel.property(sp);
                                    if (sProp.propertyValueType !== PropertyValueType.NO_VALUE) {
                                        inspectProp(sProp, depth + 3, sProp.name);
                                    }
                                } catch(ex) {}
                            }
                        }
                    }
                }
            }
        } catch(e) {}

        // Text Path Options
        try {
            var pathOpts = layer.property("ADBE Text Properties").property("ADBE Text Path Options");
            if (pathOpts) {
                var pathProp = pathOpts.property("ADBE Text Path");
                if (pathProp && pathProp.value !== 0) {
                    log(ind(depth) + "── text path ──");
                    inspectProp(pathProp, depth + 1, "Path");
                    try { inspectProp(pathOpts.property("ADBE Text Reverse Path"), depth + 1, "Reverse Path"); } catch(e) {}
                    try { inspectProp(pathOpts.property("ADBE Text Perpendicular To Path"), depth + 1, "Perpendicular"); } catch(e) {}
                    try { inspectProp(pathOpts.property("ADBE Text Force Align Path"), depth + 1, "Force Alignment"); } catch(e) {}
                    try { inspectProp(pathOpts.property("ADBE Text First Margin"), depth + 1, "First Margin"); } catch(e) {}
                    try { inspectProp(pathOpts.property("ADBE Text Last Margin"), depth + 1, "Last Margin"); } catch(e) {}
                }
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════
    // SHAPE LAYERS (recursive)
    // ═══════════════════════════════════════════════════════════

    function inspectShapeContents(group, depth, compName, layerName, maxDepth) {
        if (depth > maxDepth) { log(ind(depth) + "(max depth)"); return; }

        for (var i = 1; i <= group.numProperties; i++) {
            try {
                var prop = group.property(i);
                var mn = prop.matchName;

                if (mn === "ADBE Vector Group") {
                    log(ind(depth) + "Group: \"" + prop.name + "\" [" + mn + "]");
                    // Blend mode for shape group
                    try {
                        var bm = prop.property("ADBE Vector Blend Mode");
                        if (bm && bm.value !== BlendingMode.NORMAL) {
                            log(ind(depth + 1) + "blendMode: " + blendName(bm.value));
                        }
                    } catch(e) {}
                    // Contents
                    var contents = prop.property("ADBE Vectors Group");
                    if (contents) inspectShapeContents(contents, depth + 1, compName, layerName, maxDepth);
                    // Transform
                    var xform = prop.property("ADBE Vector Transform Group");
                    if (xform) {
                        var hasTfAnim = false;
                        var tfProps = [
                            ["Anchor", "ADBE Vector Anchor"],
                            ["Position", "ADBE Vector Position"],
                            ["Scale", "ADBE Vector Scale"],
                            ["Rotation", "ADBE Vector Rotation"],
                            ["Opacity", "ADBE Vector Group Opacity"],
                            ["Skew", "ADBE Vector Skew"],
                            ["Skew Axis", "ADBE Vector Skew Axis"]
                        ];
                        for (var x = 0; x < tfProps.length; x++) {
                            try {
                                var xp = xform.property(tfProps[x][1]);
                                if (xp) {
                                    var animated = xp.numKeys > 0;
                                    var hasExpr = false;
                                    try { hasExpr = xp.expression && xp.expression.length > 0; } catch(ex) {}
                                    if (animated || hasExpr) {
                                        if (!hasTfAnim) {
                                            log(ind(depth + 1) + "GroupTransform:");
                                            hasTfAnim = true;
                                        }
                                        inspectProp(xp, depth + 2, tfProps[x][0]);
                                    }
                                }
                            } catch(ex) {}
                        }
                    }

                } else if (mn === "ADBE Vector Shape - Rect") {
                    log(ind(depth) + "Rectangle: \"" + prop.name + "\"");
                    try { inspectProp(prop.property("ADBE Vector Rect Size"), depth + 1, "Size"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Rect Position"), depth + 1, "Position"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Rect Roundness"), depth + 1, "Roundness"); } catch(e) {}

                } else if (mn === "ADBE Vector Shape - Ellipse") {
                    log(ind(depth) + "Ellipse: \"" + prop.name + "\"");
                    try { inspectProp(prop.property("ADBE Vector Ellipse Size"), depth + 1, "Size"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Ellipse Position"), depth + 1, "Position"); } catch(e) {}

                } else if (mn === "ADBE Vector Shape - Star") {
                    log(ind(depth) + "Polystar: \"" + prop.name + "\"");
                    try { inspectProp(prop.property("ADBE Vector Star Type"), depth + 1, "Type"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Star Points"), depth + 1, "Points"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Star Position"), depth + 1, "Position"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Star Inner Radius"), depth + 1, "InnerRadius"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Star Outer Radius"), depth + 1, "OuterRadius"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Star Inner Roundess"), depth + 1, "InnerRound"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Star Outer Roundess"), depth + 1, "OuterRound"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Star Rotation"), depth + 1, "Rotation"); } catch(e) {}

                } else if (mn === "ADBE Vector Shape - Group") {
                    // Freeform path
                    log(ind(depth) + "Path: \"" + prop.name + "\"");
                    try {
                        var pathProp = prop.property("ADBE Vector Shape");
                        if (pathProp) {
                            if (pathProp.numKeys > 0) {
                                log(ind(depth + 1) + "ANIMATED path (" + pathProp.numKeys + " keys)");
                                for (var pk = 1; pk <= Math.min(pathProp.numKeys, 4); pk++) {
                                    var shape = pathProp.keyValue(pk);
                                    log(ind(depth + 1) + "key" + pk + " @ " + pathProp.keyTime(pk).toFixed(3) + "s: " +
                                        shape.vertices.length + " verts, closed=" + shape.closed);
                                }
                                // Log first key vertices
                                var shape0 = pathProp.keyValue(1);
                                for (var vi = 0; vi < Math.min(shape0.vertices.length, 30); vi++) {
                                    log(ind(depth + 2) + "v[" + vi + "]: " + fmtVal(shape0.vertices[vi]) +
                                        " in:" + fmtVal(shape0.inTangents[vi]) +
                                        " out:" + fmtVal(shape0.outTangents[vi]));
                                }
                            } else {
                                var shape = pathProp.value;
                                log(ind(depth + 1) + shape.vertices.length + " verts, closed=" + shape.closed);
                                for (var vi = 0; vi < Math.min(shape.vertices.length, 30); vi++) {
                                    log(ind(depth + 2) + "v[" + vi + "]: " + fmtVal(shape.vertices[vi]) +
                                        " in:" + fmtVal(shape.inTangents[vi]) +
                                        " out:" + fmtVal(shape.outTangents[vi]));
                                }
                            }
                            try {
                                if (pathProp.expression && pathProp.expression.length > 0) {
                                    var exprLines = pathProp.expression.split(/[\r\n]+/);
                                    log(ind(depth + 1) + "expr (" + exprLines.length + " lines):");
                                    for (var ei = 0; ei < exprLines.length; ei++) {
                                        log(ind(depth + 2) + exprLines[ei]);
                                    }
                                }
                            } catch(e) {}
                        }
                    } catch(e) {}

                } else if (mn === "ADBE Vector Graphic - Fill") {
                    log(ind(depth) + "Fill: \"" + prop.name + "\"");
                    try {
                        var fillColor = prop.property("ADBE Vector Fill Color");
                        var c = fillColor.value;
                        log(ind(depth + 1) + "color: " + fmtVal(c) + " (" + rgbToHex(c[0], c[1], c[2]) + ")");
                        collectColor(c[0], c[1], c[2], compName + "/" + layerName + "/shapeFill");
                        if (fillColor.numKeys > 0 || (fillColor.expression && fillColor.expression.length > 0)) {
                            inspectProp(fillColor, depth + 1, "Color");
                        }
                    } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Fill Opacity"), depth + 1, "Opacity"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Fill Rule"), depth + 1, "FillRule"); } catch(e) {}

                } else if (mn === "ADBE Vector Graphic - Stroke") {
                    log(ind(depth) + "Stroke: \"" + prop.name + "\"");
                    try {
                        var strokeColor = prop.property("ADBE Vector Stroke Color");
                        var c = strokeColor.value;
                        log(ind(depth + 1) + "color: " + fmtVal(c) + " (" + rgbToHex(c[0], c[1], c[2]) + ")");
                        collectColor(c[0], c[1], c[2], compName + "/" + layerName + "/shapeStroke");
                        if (strokeColor.numKeys > 0 || (strokeColor.expression && strokeColor.expression.length > 0)) {
                            inspectProp(strokeColor, depth + 1, "Color");
                        }
                    } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Stroke Width"), depth + 1, "Width"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Stroke Opacity"), depth + 1, "Opacity"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Stroke Line Cap"), depth + 1, "LineCap"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Stroke Line Join"), depth + 1, "LineJoin"); } catch(e) {}
                    try {
                        var dashes = prop.property("ADBE Vector Stroke Dashes");
                        if (dashes && dashes.numProperties > 0) {
                            log(ind(depth + 1) + "Dashes:");
                            for (var d = 1; d <= dashes.numProperties; d++) {
                                try {
                                    var dp = dashes.property(d);
                                    if (dp.propertyValueType !== PropertyValueType.NO_VALUE) {
                                        inspectProp(dp, depth + 2, dp.name);
                                    }
                                } catch(ex) {}
                            }
                        }
                    } catch(e) {}

                } else if (mn === "ADBE Vector Graphic - G-Fill") {
                    log(ind(depth) + "Gradient Fill: \"" + prop.name + "\"");
                    inspectGenericGroup(prop, depth + 1);

                } else if (mn === "ADBE Vector Graphic - G-Stroke") {
                    log(ind(depth) + "Gradient Stroke: \"" + prop.name + "\"");
                    inspectGenericGroup(prop, depth + 1);

                } else if (mn === "ADBE Vector Filter - Trim") {
                    log(ind(depth) + "Trim Paths: \"" + prop.name + "\"");
                    try { inspectProp(prop.property("ADBE Vector Trim Start"), depth + 1, "Start"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Trim End"), depth + 1, "End"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Trim Offset"), depth + 1, "Offset"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Trim Type"), depth + 1, "TrimType"); } catch(e) {}

                } else if (mn === "ADBE Vector Filter - Repeater") {
                    log(ind(depth) + "Repeater: \"" + prop.name + "\"");
                    try { inspectProp(prop.property("ADBE Vector Repeater Copies"), depth + 1, "Copies"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Repeater Offset"), depth + 1, "Offset"); } catch(e) {}
                    try { inspectProp(prop.property("ADBE Vector Repeater Order"), depth + 1, "Order"); } catch(e) {}
                    var repXform = prop.property("ADBE Vector Repeater Transform");
                    if (repXform) {
                        log(ind(depth + 1) + "RepeatTransform:");
                        inspectGenericGroup(repXform, depth + 2);
                    }

                } else if (mn === "ADBE Vector Filter - RC") {
                    log(ind(depth) + "Round Corners: \"" + prop.name + "\"");
                    try { inspectProp(prop.property("ADBE Vector RoundCorner Radius"), depth + 1, "Radius"); } catch(e) {}

                } else if (mn === "ADBE Vector Filter - Offset" ||
                           mn === "ADBE Vector Filter - PB" ||
                           mn === "ADBE Vector Filter - Wiggler" ||
                           mn === "ADBE Vector Filter - Zigzag" ||
                           mn === "ADBE Vector Filter - Merge" ||
                           mn === "ADBE Vector Filter - Twist") {
                    log(ind(depth) + prop.name + " [" + mn + "]:");
                    inspectGenericGroup(prop, depth + 1);

                } else {
                    // Unknown shape operator — log generically
                    log(ind(depth) + prop.name + " [" + mn + "]");
                    inspectGenericGroup(prop, depth + 1);
                }
            } catch(e) {}
        }
    }

    // Generic group inspector — iterate all child properties
    function inspectGenericGroup(group, depth) {
        try {
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (p.propertyValueType !== PropertyValueType.NO_VALUE) {
                    inspectProp(p, depth, p.name);
                }
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════
    // MASKS
    // ═══════════════════════════════════════════════════════════

    function inspectMasks(layer, depth) {
        try {
            var masks = layer.property("ADBE Mask Parade");
            if (!masks || masks.numProperties === 0) return;

            log(ind(depth) + "── masks (" + masks.numProperties + ") ──");
            for (var m = 1; m <= masks.numProperties; m++) {
                var mask = masks.property(m);
                var modeVal = "";
                try { modeVal = " mode=" + mask.property("ADBE Mask Mode").value; } catch(e) {}
                var inverted = "";
                try { if (mask.property("ADBE Mask Inverted").value) inverted = " INVERTED"; } catch(e) {}

                log(ind(depth + 1) + "\"" + mask.name + "\"" + modeVal + inverted);

                // Mask path
                try {
                    var maskShape = mask.property("ADBE Mask Shape");
                    if (maskShape.numKeys > 0) {
                        log(ind(depth + 2) + "path: ANIMATED (" + maskShape.numKeys + " keys)");
                        var shape0 = maskShape.keyValue(1);
                        log(ind(depth + 2) + "key1 verts: " + shape0.vertices.length + ", closed=" + shape0.closed);
                        for (var vi = 0; vi < Math.min(shape0.vertices.length, 20); vi++) {
                            log(ind(depth + 3) + "v[" + vi + "]: " + fmtVal(shape0.vertices[vi]));
                        }
                    } else {
                        var shape = maskShape.value;
                        log(ind(depth + 2) + "path: " + shape.vertices.length + " verts, closed=" + shape.closed);
                        for (var vi = 0; vi < Math.min(shape.vertices.length, 20); vi++) {
                            log(ind(depth + 3) + "v[" + vi + "]: " + fmtVal(shape.vertices[vi]));
                        }
                    }
                    try {
                        if (maskShape.expression && maskShape.expression.length > 0) {
                            var exprLines = maskShape.expression.split(/[\r\n]+/);
                            log(ind(depth + 2) + "path expr (" + exprLines.length + " lines):");
                            for (var ei = 0; ei < exprLines.length; ei++) {
                                log(ind(depth + 3) + exprLines[ei]);
                            }
                        }
                    } catch(e) {}
                } catch(e) {}

                try { inspectProp(mask.property("ADBE Mask Feather"), depth + 2, "Feather"); } catch(e) {}
                try { inspectProp(mask.property("ADBE Mask Opacity"), depth + 2, "Opacity"); } catch(e) {}
                try { inspectProp(mask.property("ADBE Mask Offset"), depth + 2, "Expansion"); } catch(e) {}
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER STYLES
    // ═══════════════════════════════════════════════════════════

    function inspectLayerStyles(layer, depth) {
        try {
            var styles = layer.property("ADBE Layer Styles");
            if (!styles || styles.numProperties === 0) return;

            var hasEnabled = false;
            for (var s = 1; s <= styles.numProperties; s++) {
                try {
                    var style = styles.property(s);
                    if (style.enabled) {
                        if (!hasEnabled) {
                            log(ind(depth) + "── layer styles ──");
                            hasEnabled = true;
                        }
                        log(ind(depth + 1) + "\"" + style.name + "\" [" + style.matchName + "]");
                        inspectGenericGroup(style, depth + 2);
                    }
                } catch(e) {}
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════
    // CATCH-ALL: Find animated properties not covered above
    // ═══════════════════════════════════════════════════════════

    function scanExtras(propGroup, depth, path, maxDepth) {
        if (depth > maxDepth || !propGroup) return;

        var skipMatches = {
            "ADBE Transform Group": true,
            "ADBE Effect Parade": true,
            "ADBE Text Properties": true,
            "ADBE Root Vectors Group": true,
            "ADBE Mask Parade": true,
            "ADBE Layer Styles": true
        };

        try {
            for (var i = 1; i <= propGroup.numProperties; i++) {
                try {
                    var prop = propGroup.property(i);
                    if (!prop) continue;

                    if (prop.propertyType === PropertyType.PROPERTY) {
                        var hasKeys = prop.numKeys > 0;
                        var hasExpr = false;
                        try { hasExpr = prop.expression && prop.expression.length > 0; } catch(e) {}
                        if (hasKeys || hasExpr) {
                            inspectProp(prop, depth, path + " > " + prop.name);
                        }
                    } else {
                        if (!skipMatches[prop.matchName]) {
                            scanExtras(prop, depth, path + " > " + prop.name, maxDepth);
                        }
                    }
                } catch(ex) {}
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════
    // MAIN ANALYSIS
    // ═══════════════════════════════════════════════════════════

    try {
        // Open project if specified
        if (aepPath.length > 0) {
            var projFile = new File(aepPath);
            if (!projFile.exists) throw new Error("Project not found: " + aepPath);
            app.open(projFile);
        }

        var projName = app.project.file ? app.project.file.name : "(current project)";

        // ─── HEADER ───
        log("════════════════════════════════════════════════════════════");
        log("TEMPLATE ANALYSIS: \"" + projName + "\"");
        log("════════════════════════════════════════════════════════════");
        log("Note: Color & Font inventories are at the end of this report.");
        log("");

        // ─── PROJECT OVERVIEW ───
        var compCount = 0, folderCount = 0, footageCount = 0;
        var largestComp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                compCount++;
                if (!largestComp || (item.width * item.height > largestComp.width * largestComp.height)) {
                    largestComp = item;
                }
            } else if (item instanceof FolderItem) folderCount++;
            else if (item instanceof FootageItem) footageCount++;
        }

        log("▸ PROJECT OVERVIEW");
        log(ind(1) + "Total items: " + app.project.numItems +
            " (" + compCount + " comps, " + folderCount + " folders, " + footageCount + " footage)");
        if (largestComp) {
            log(ind(1) + "Largest comp: \"" + largestComp.name + "\" (" +
                largestComp.width + "x" + largestComp.height + " @ " +
                largestComp.frameRate + "fps, " + largestComp.duration.toFixed(2) + "s)");
        }
        log("");

        // ─── ITEM INVENTORY ───
        log("▸ ITEM INVENTORY");
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            var type = "UNKNOWN";
            if (item instanceof CompItem) type = "COMP";
            else if (item instanceof FolderItem) type = "FOLDER";
            else if (item instanceof FootageItem) type = "FOOTAGE";

            var parent = item.parentFolder ? item.parentFolder.name : "(root)";
            var extra = "";
            if (item instanceof CompItem) {
                extra = " " + item.width + "x" + item.height + " @" + item.frameRate + "fps " + item.duration.toFixed(2) + "s";
            }
            if (item instanceof FootageItem) {
                try { extra = " " + item.width + "x" + item.height; } catch(e) {}
                try {
                    if (item.file) extra += " file:" + item.file.name;
                } catch(e) {}
            }
            log(ind(1) + "[" + type + "] \"" + item.name + "\"" + extra + " (in: " + parent + ")");
        }
        log("");

        // ─── COMP HIERARCHY ───
        log("▸ COMP HIERARCHY");
        log(ind(1) + "(which comps reference which as precomps)");
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) continue;

            var refs = [];
            for (var l = 1; l <= item.numLayers; l++) {
                try {
                    var layer = item.layer(l);
                    if (layer.source && layer.source instanceof CompItem) {
                        refs.push("[" + l + "] \"" + layer.name + "\" → \"" + layer.source.name + "\"");
                    }
                } catch(e) {}
            }
            if (refs.length > 0) {
                log(ind(1) + "\"" + item.name + "\" contains:");
                for (var r = 0; r < refs.length; r++) {
                    log(ind(2) + "└── " + refs[r]);
                }
            }
        }
        log("");

        // ─── COMP MARKERS ───
        log("▸ COMP MARKERS");
        var hasMarkers = false;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) continue;
            try {
                var markers = item.markerProperty;
                if (markers && markers.numKeys > 0) {
                    hasMarkers = true;
                    log(ind(1) + "\"" + item.name + "\" (" + markers.numKeys + " markers):");
                    for (var m = 1; m <= markers.numKeys; m++) {
                        var mv = markers.keyValue(m);
                        var dur = mv.duration > 0 ? " dur=" + mv.duration.toFixed(2) + "s" : "";
                        var ch = "";
                        try { if (mv.chapter && mv.chapter.length > 0) ch = " ch=\"" + mv.chapter + "\""; } catch(e) {}
                        log(ind(2) + markers.keyTime(m).toFixed(2) + "s: \"" + mv.comment + "\"" + dur + ch);
                    }
                }
            } catch(e) {}
        }
        if (!hasMarkers) log(ind(1) + "(none)");
        log("");

        // ─── LAYER MARKERS ───
        log("▸ LAYER MARKERS");
        var hasLayerMarkers = false;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) continue;
            for (var l = 1; l <= item.numLayers; l++) {
                try {
                    var layer = item.layer(l);
                    var lm = layer.property("ADBE Marker");
                    if (lm && lm.numKeys > 0) {
                        hasLayerMarkers = true;
                        log(ind(1) + "\"" + item.name + "\" > [" + l + "] \"" + layer.name + "\" (" + lm.numKeys + " markers):");
                        for (var m = 1; m <= lm.numKeys; m++) {
                            var mv = lm.keyValue(m);
                            var dur = mv.duration > 0 ? " dur=" + mv.duration.toFixed(2) + "s" : "";
                            log(ind(2) + lm.keyTime(m).toFixed(2) + "s: \"" + mv.comment + "\"" + dur);
                        }
                    }
                } catch(e) {}
            }
        }
        if (!hasLayerMarkers) log(ind(1) + "(none)");
        log("");

        // ─── TIMING CLUSTERS ───
        log("▸ TIMING CLUSTERS");
        log(ind(1) + "(groups of layers with similar start times — potential shot boundaries)");
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) continue;
            if (item.numLayers < 2) continue;

            var layerTimes = [];
            for (var l = 1; l <= item.numLayers; l++) {
                var layer = item.layer(l);
                layerTimes.push({
                    index: l,
                    name: layer.name,
                    inPoint: layer.inPoint,
                    outPoint: layer.outPoint
                });
            }

            // Group by similar inPoints (within 3 frames)
            var tolerance = 3 / item.frameRate;
            var clusters = [];
            var used = {};
            for (var a = 0; a < layerTimes.length; a++) {
                if (used[a]) continue;
                var cluster = { start: layerTimes[a].inPoint, end: layerTimes[a].outPoint, layers: [layerTimes[a]] };
                used[a] = true;
                for (var b = a + 1; b < layerTimes.length; b++) {
                    if (used[b]) continue;
                    if (Math.abs(layerTimes[b].inPoint - cluster.start) < tolerance) {
                        cluster.layers.push(layerTimes[b]);
                        if (layerTimes[b].outPoint > cluster.end) cluster.end = layerTimes[b].outPoint;
                        used[b] = true;
                    }
                }
                clusters.push(cluster);
            }
            clusters.sort(function(a, b) { return a.start - b.start; });

            if (clusters.length > 1) {
                log(ind(1) + "\"" + item.name + "\" — " + clusters.length + " clusters:");
                for (var c = 0; c < clusters.length; c++) {
                    var cl = clusters[c];
                    var endTime = cl.end;
                    log(ind(2) + "Cluster " + (c + 1) + " (" + cl.start.toFixed(2) + "s → " + endTime.toFixed(2) + "s) " + cl.layers.length + " layers:");
                    for (var cl_l = 0; cl_l < cl.layers.length; cl_l++) {
                        log(ind(3) + "[" + cl.layers[cl_l].index + "] \"" + cl.layers[cl_l].name + "\" " +
                            cl.layers[cl_l].inPoint.toFixed(2) + "→" + cl.layers[cl_l].outPoint.toFixed(2) + "s");
                    }
                }
            } else {
                log(ind(1) + "\"" + item.name + "\" — single cluster (all layers start together)");
            }
        }
        log("");

        // ═══════════════════════════════════════════════════════════
        // DETAILED COMP INSPECTION
        // ═══════════════════════════════════════════════════════════

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) continue;

            log("════════════════════════════════════════════════════════════");
            log("COMP: \"" + item.name + "\" (" + item.width + "x" + item.height +
                " @" + item.frameRate + "fps " + item.duration.toFixed(2) + "s)");
            log("Layers: " + item.numLayers);
            var bgColor = item.bgColor;
            log("BG Color: " + fmtVal(bgColor) + " (" + rgbToHex(bgColor[0], bgColor[1], bgColor[2]) + ")");
            log("════════════════════════════════════════════════════════════");

            for (var l = 1; l <= item.numLayers; l++) {
                var layer = item.layer(l);
                var lType = layerType(layer);

                // Source info
                var sourceInfo = "";
                if (layer.source) {
                    sourceInfo = " → \"" + layer.source.name + "\"";
                    if (lType === "SOLID/FOOTAGE") {
                        try {
                            var solidColor = layer.source.mainSource.color;
                            if (solidColor) {
                                sourceInfo += " solidColor:" + rgbToHex(solidColor[0], solidColor[1], solidColor[2]);
                                collectColor(solidColor[0], solidColor[1], solidColor[2],
                                             item.name + "/" + layer.name + "/solid");
                            }
                        } catch(ex) {}
                        try {
                            if (layer.source.file) {
                                sourceInfo += " file:" + layer.source.file.name;
                            }
                        } catch(ex) {}
                    }
                }

                log("");
                log("  [" + l + "] " + lType + " \"" + layer.name + "\"" + sourceInfo);

                // ─── Layer metadata ───
                var meta = [];
                try {
                    if (layer.parent) meta.push("parent:[" + layer.parent.index + "] \"" + layer.parent.name + "\"");
                } catch(e) {}
                try {
                    if (layer.blendMode !== BlendingMode.NORMAL) meta.push("blend:" + blendName(layer.blendMode));
                } catch(e) {}
                try {
                    if (layer.trackMatteType && layer.trackMatteType !== TrackMatteType.NO_TRACK_MATTE) {
                        meta.push("trackMatte:" + trackMatteName(layer.trackMatteType));
                    }
                } catch(e) {}
                try { if (layer.threeDLayer) meta.push("3D"); } catch(e) {}
                try { if (layer.motionBlur) meta.push("motionBlur"); } catch(e) {}
                try { if (layer.guideLayer) meta.push("GUIDE"); } catch(e) {}
                try { if (layer.adjustmentLayer) meta.push("ADJUSTMENT"); } catch(e) {}
                try { if (layer.collapseTransformation) meta.push("collapsed"); } catch(e) {}
                try { if (layer.autoOrient !== AutoOrientType.NO_AUTO_ORIENT) meta.push("autoOrient"); } catch(e) {}
                try { if (layer.preserveTransparency) meta.push("preserveAlpha"); } catch(e) {}

                if (meta.length > 0) log(ind(2) + meta.join(" | "));

                // Timing
                log(ind(2) + "timing: " + layer.inPoint.toFixed(2) + "s → " +
                    layer.outPoint.toFixed(2) + "s (start: " + layer.startTime.toFixed(2) + "s" +
                    ", stretch: " + layer.stretch.toFixed(1) + "%)");

                // Label color
                try {
                    if (layer.label > 0) log(ind(2) + "label: " + layer.label);
                } catch(e) {}

                // ─── Transform ───
                inspectTransform(layer, 2);

                // ─── Effects ───
                inspectEffects(layer, 2, item.name);

                // ─── Text ───
                if (layer instanceof TextLayer) {
                    inspectText(layer, 2, item.name);
                }

                // ─── Shape Contents ───
                if (layer instanceof ShapeLayer) {
                    log(ind(2) + "── shape contents ──");
                    try {
                        var contents = layer.property("ADBE Root Vectors Group");
                        if (contents) inspectShapeContents(contents, 3, item.name, layer.name, 12);
                    } catch(e) {
                        log(ind(3) + "Error reading shapes: " + e.message);
                    }
                }

                // ─── Masks ───
                inspectMasks(layer, 2);

                // ─── Layer Styles ───
                inspectLayerStyles(layer, 2);

                // ─── Catch-all: anything else animated ───
                try {
                    var hasExtra = false;
                    // Quick pre-check: scan top-level groups for anything we haven't covered
                    for (var pg = 1; pg <= layer.numProperties; pg++) {
                        var topProp = layer.property(pg);
                        var skipTop = {
                            "ADBE Transform Group": true,
                            "ADBE Effect Parade": true,
                            "ADBE Text Properties": true,
                            "ADBE Root Vectors Group": true,
                            "ADBE Mask Parade": true,
                            "ADBE Layer Styles": true,
                            "ADBE Marker": true
                        };
                        if (!skipTop[topProp.matchName]) {
                            // Check if this group has anything animated
                            var extraLines = lines.length;
                            scanExtras(topProp, 3, topProp.name, 6);
                            if (lines.length > extraLines && !hasExtra) {
                                // Insert header before the extra lines we just added
                                lines.splice(extraLines, 0, ind(2) + "── other animated properties ──");
                                hasExtra = true;
                            }
                        }
                    }
                } catch(e) {}
            }
            log("");
        }

        // ═══════════════════════════════════════════════════════════
        // SUMMARIES (collected during inspection)
        // ═══════════════════════════════════════════════════════════

        log("════════════════════════════════════════════════════════════");
        log("SUMMARIES");
        log("════════════════════════════════════════════════════════════");
        log("");

        // ─── COLOR INVENTORY ───
        log("▸ COLOR INVENTORY");
        var colorKeys = [];
        for (var hex in colorMap) {
            if (colorMap.hasOwnProperty(hex)) colorKeys.push(hex);
        }
        colorKeys.sort(function(a, b) { return colorMap[b].count - colorMap[a].count; });

        log(ind(1) + colorKeys.length + " unique colors:");
        for (var ci = 0; ci < colorKeys.length; ci++) {
            var cm = colorMap[colorKeys[ci]];
            log(ind(2) + colorKeys[ci] + " (" + cm.count + " uses) — " + cm.sources.join(", "));
        }

        // Suggest 60/30/10 (skip pure white and black)
        var filtered = [];
        for (var ci = 0; ci < colorKeys.length; ci++) {
            var hex = colorKeys[ci];
            if (hex !== "#FFFFFF" && hex !== "#000000" && hex !== "#010101") {
                filtered.push(hex);
            }
        }
        if (filtered.length >= 3) {
            log("");
            log(ind(1) + "Suggested 60/30/10:");
            log(ind(2) + "Dominant:   " + filtered[0] + " (" + colorMap[filtered[0]].count + " uses)");
            log(ind(2) + "Secondary:  " + filtered[1] + " (" + colorMap[filtered[1]].count + " uses)");
            log(ind(2) + "Accent:     " + filtered[2] + " (" + colorMap[filtered[2]].count + " uses)");
        }
        log("");

        // ─── FONT INVENTORY ───
        log("▸ FONT INVENTORY");
        var fontKeys = [];
        for (var fn in fontMap) {
            if (fontMap.hasOwnProperty(fn)) fontKeys.push(fn);
        }
        fontKeys.sort(function(a, b) { return fontMap[b].count - fontMap[a].count; });

        if (fontKeys.length === 0) {
            log(ind(1) + "(no text layers found)");
        }
        for (var fi = 0; fi < fontKeys.length; fi++) {
            var fm = fontMap[fontKeys[fi]];
            var sizes = [];
            for (var s in fm.sizes) { if (fm.sizes.hasOwnProperty(s)) sizes.push(s + "px"); }
            log(ind(1) + "\"" + fontKeys[fi] + "\" sizes: " + sizes.join(", ") + " (" + fm.count + " layers)");
        }
        log("");

        // ─── ANALYSIS COMPLETE ───
        log("════════════════════════════════════════════════════════════");
        log("END OF ANALYSIS");
        log("════════════════════════════════════════════════════════════");

        writeLog(true);

    } catch (e) {
        log("FATAL: " + e.message + " (line " + e.line + ")");
        writeLog(false);
    }

    app.endSuppressDialogs(false);
})();
