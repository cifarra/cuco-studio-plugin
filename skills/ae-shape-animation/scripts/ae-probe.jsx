// Read-only project prober. Run:  scripts/ae-run.sh scripts/ae-probe.jsx
// Reports every comp (marking the active one) and the target comp's layer stack
// with parenting + keyframe/expression counts — a textual "screenshot" of state.
// Run this FIRST, before building anything, instead of writing ad-hoc probes.
(function probe() {
    var p = app.project, out = "", i, j;
    var active = (p.activeItem && p.activeItem instanceof CompItem) ? p.activeItem : null;
    var comps = [];
    for (i = 1; i <= p.numItems; i++) if (p.item(i) instanceof CompItem) comps.push(p.item(i));
    out += "AE " + app.version + " | project items=" + p.numItems + " comps=" + comps.length +
           " | activeComp=" + (active ? "'" + active.name + "'" : "none") + "\n";
    for (i = 0; i < comps.length; i++) {
        var c = comps[i];
        out += (c === active ? " * " : "   ") + "'" + c.name + "'  " + c.width + "x" + c.height +
               "  " + c.duration.toFixed(2) + "s @" + c.frameRate + "fps  " + c.numLayers + " layers\n";
    }
    var t = active || (comps.length ? comps[0] : null);
    if (!t) { aeWrite(out + "(no comps — create one)"); return; }

    function animBits(l) {
        var tg = l.property("ADBE Transform Group");
        var names = ["ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity", "ADBE Anchor Point"];
        var bits = [], k;
        if (!tg) return "";
        for (k = 0; k < names.length; k++) {
            try {
                var pr = tg.property(names[k]);
                if (!pr) continue;
                var tag = "";
                if (pr.numKeys > 0) tag = pr.numKeys + "k";
                if (pr.expressionEnabled) tag += (tag ? "+" : "") + "expr";
                if (tag) bits.push(names[k].replace("ADBE ", "").replace(" ", "") + ":" + tag);
            } catch (e) {}
        }
        return bits.join(" ");
    }
    out += "layers of '" + t.name + "' (top of stack first):\n";
    for (j = 1; j <= t.numLayers; j++) {
        var l = t.layer(j), kind = "av";
        try { if (l.nullLayer) kind = "null"; else if (l instanceof ShapeLayer) kind = "shape"; else if (l instanceof TextLayer) kind = "text"; } catch (e) {}
        var line = "  " + j + ". '" + l.name + "' [" + kind + "]" +
                   " in=" + l.inPoint.toFixed(2) + " out=" + l.outPoint.toFixed(2);
        try { if (l.parent) line += " parent='" + l.parent.name + "'"; } catch (e) {}
        var a = animBits(l);
        if (a) line += "  " + a;
        out += line + "\n";
    }
    aeWrite(out);
})();
