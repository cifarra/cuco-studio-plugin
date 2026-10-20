// aectx eval.jsx - a property's value at times t across layers (read-only).
// args: comp, layers (regex|null), prop (path), times [..], pre (bool)
(function () {
    var A = AECTX, a = A.args;
    var comp = A.comp(a.comp);
    var ls = A.layers(comp, a.layers || null);
    var rows = [];
    var firstErr = null;
    for (var i = 0; i < ls.length; i++) {
        var L = ls[i], p = null;
        try { p = A.prop(L, a.prop); } catch (e) { if (!firstErr) firstErr = "[" + L.index + "] " + L.name + ": " + e.message; continue; }
        if (!p || p.propertyType !== PropertyType.PROPERTY) { if (!firstErr) firstErr = "[" + L.index + "] " + L.name + ": '" + a.prop + "' is a group, not a property"; continue; }
        var row = { index: L.index, layer: L.name, values: [] };
        try { if (p.canSetExpression && p.expression !== "") { var s = A.exprState(p, a.times[0]); if (s.err) row.exprErr = s.err; if (s.on === false) row.exprOff = true; row.hasExpr = true; } } catch (e2) {}
        for (var k = 0; k < a.times.length; k++) row.values.push(A.value(p, a.times[k], !!a.pre));
        rows.push(row);
    }
    if (rows.length === 0) throw new Error("no layer in '" + comp.name + "' matching '" + (a.layers || "*") + "' (" + ls.length + " layers) has property '" + a.prop + "'" + (firstErr ? " - e.g. " + firstErr : ""));
    A.result({ comp: comp.name, prop: a.prop, times: a.times, pre: !!a.pre, rows: rows });
})();
