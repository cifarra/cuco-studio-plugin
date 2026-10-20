// aectx repair.jsx - find disabled/erroring expressions; with apply=true re-assign them in one
// undo group (the "re-assign trick" from create-style/ae.md). Never saves the project.
// args: comps (regex|null), apply (bool)
(function () {
    var A = AECTX, a = A.args;
    var comps = A.comps(a.comps || null);
    var found = [];
    var t = 0;
    if (a.apply) app.beginUndoGroup("aectx repair-expressions");
    try {
        for (var c = 0; c < comps.length; c++) {
            var comp = comps[c];
            for (var i = 1; i <= comp.numLayers; i++) {
                var L = comp.layer(i);
                try {
                    A.walkProps(L, function (p, np) {
                        try {
                            var x;
                            if (!p.canSetExpression || p.expression === "") return;
                            x = p.expression;
                            var s = A.exprState(p, t);
                            if (s.on !== false && !s.err) return;
                            var rec = { comp: comp.name, layer: L.name, index: L.index, path: np, before: s.err || "disabled" };
                            if (a.apply) {
                                try { p.expression = ""; p.expression = x; try { p.expressionEnabled = true; } catch (e1) {} } catch (e2) { rec.applyError = String(e2.message || e2); }
                                var s2 = A.exprState(p, t);
                                if (s2.on === false || s2.err) rec.after = s2.err || "still disabled";
                                else rec.after = "ok";
                            }
                            found.push(rec);
                        } catch (ep) { found.push({ comp: comp.name, layer: L.name, index: L.index, path: np, before: "unreadable: " + (ep.message || ep) }); }
                    }, "", "");
                } catch (el) { found.push({ comp: comp.name, layer: L.name, index: L.index, path: "*", before: "layer walk failed: " + (el.message || el) }); }
            }
        }
    } finally {
        if (a.apply) app.endUndoGroup();
        A.result({ applied: !!a.apply, count: found.length, items: found });
    }
})();
