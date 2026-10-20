// aectx lib.jsx - helpers preloaded into every aectx job (ExtendScript / ES3).
// Everything lives under AECTX. Never saves, never purges caches, never shows UI.
// Gotchas this file encodes (see create-style/ae.md):
//   - set File.encoding BEFORE open; write big strings in slices (one huge write can land 0 bytes)
//   - never stringify host arrays implicitly ("invalid numeric result" throws) - use AECTX.fmt/plain
//   - no nested ternaries in builder code; no let/const/arrow/template literals
//   - globals persist across $.evalFile calls - options arrive in AECTX.args, never as bare globals

var AECTX = (function () {
    var A = {};
    A.version = "1";
    A.job = null;          // job directory (set by the boot script)
    A.args = {};           // options from the CLI (set by the boot script)
    A.warnings = [];

    // ------------------------------------------------------------------ job I/O
    var SLICE = 200000;
    A.write = function (path, text, append) {
        var s = String(text);
        var f = new File(path);
        f.encoding = "UTF-8";
        f.lineFeed = "Unix";
        var first = true;
        var pos = 0;
        do {
            var chunk = s.substr(pos, SLICE);
            var mode = "a";
            if (first && !append) mode = "w";
            if (!f.open(mode)) throw new Error("cannot open " + path + " (" + f.error + ")");
            f.write(chunk);
            f.close();
            first = false;
            pos += SLICE;
        } while (pos < s.length);
        return path;
    };
    A.out = function (line) {
        if (!A.job) return;
        A.write(A.job + "/out.txt", String(line) + "\n", true);
    };
    A.result = function (obj) {
        if (!A.job) return;
        A.write(A.job + "/result.json", A.json(obj), false);
    };
    A.warn = function (msg) { A.warnings.push(String(msg)); };

    // ------------------------------------------------------------------ numbers / serialization
    A.num = function (n, d) {
        if (typeof n !== "number") return n;
        if (!isFinite(n)) return null;
        var f = Math.pow(10, (d === undefined) ? 4 : d);
        return Math.round(n * f) / f;
    };
    function escStr(s) {
        return '"' + s.replace(/[\\"]/g, function (c) { return "\\" + c; })
            .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
            .replace(/[\x00-\x1f\u2028\u2029\ud800-\udfff]/g, function (c) {
                var h = c.charCodeAt(0).toString(16);
                while (h.length < 4) h = "0" + h;
                return "\\u" + h;
            }) + '"';
    }
    A.json = function (v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return v ? "true" : "false";
        if (t === "string") return escStr(v);
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(A.json(v[i]));
            return "[" + a.join(",") + "]";
        }
        if (t === "object") {
            if (v.constructor !== Object) return '{"valueType":"custom"}';
            var o = [];
            for (var k in v) {
                if (!v.hasOwnProperty(k)) continue;
                if (v[k] === undefined || typeof v[k] === "function") continue;
                o.push(escStr(String(k)) + ":" + A.json(v[k]));
            }
            return "{" + o.join(",") + "}";
        }
        return "null";
    };
    // human-readable one-liner for any value - never throws
    A.fmt = function (v) {
        try { return A.json(A.plain(v)); } catch (e) { return "<unprintable>"; }
    };
    A.hex = function (c) {
        if (!c || c.length < 3) return null;
        var s = "#";
        for (var i = 0; i < 3; i++) {
            var x = Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16);
            if (x.length < 2) x = "0" + x;
            s += x;
        }
        return s;
    };

    // ------------------------------------------------------------------ enums (read live: version-proof)
    var enumCache = {};
    A.enumMap = function (E, key) {
        if (key && enumCache[key]) return enumCache[key];
        var m = {};
        try { for (var k in E) { if (typeof E[k] === "number") m[E[k]] = k; } } catch (e) {}
        if (key) enumCache[key] = m;
        return m;
    };
    A.enumName = function (E, code, key) {
        if (code === undefined || code === null) return null;
        var m = A.enumMap(E, key);
        if (m[code] !== undefined) return m[code];
        return "UNKNOWN_" + code;
    };

    // ------------------------------------------------------------------ value conversion
    A.shape = function (s) {
        var o = { closed: s.closed, v: [] };
        var nonZero = false, i;
        for (i = 0; i < s.vertices.length; i++) o.v.push([A.num(s.vertices[i][0], 1), A.num(s.vertices[i][1], 1)]);
        for (i = 0; i < s.inTangents.length; i++) {
            if (s.inTangents[i][0] || s.inTangents[i][1] || s.outTangents[i][0] || s.outTangents[i][1]) nonZero = true;
        }
        if (nonZero) {
            o["in"] = []; o["out"] = [];
            for (i = 0; i < s.inTangents.length; i++) {
                o["in"].push([A.num(s.inTangents[i][0], 1), A.num(s.inTangents[i][1], 1)]);
                o["out"].push([A.num(s.outTangents[i][0], 1), A.num(s.outTangents[i][1], 1)]);
            }
        }
        return o;
    };
    A.textDoc = function (d, brief) {
        var o = {};
        function g(k, fn) { try { var v = fn(); if (v !== undefined) o[k] = v; } catch (e) {} }
        g("text", function () { return d.text; });
        g("size", function () { return A.num(d.fontSize, 2); });
        if (brief) return o;
        g("font", function () { return d.font; });
        g("family", function () { return d.fontFamily; });
        g("style", function () { return d.fontStyle; });
        g("caps", function () { return A.enumName(FontCapsOption, d.fontCapsOption, "caps"); });
        g("leading", function () { return d.autoLeading ? "auto" : A.num(d.leading, 2); });
        g("tracking", function () { return d.tracking; });
        g("justify", function () { return A.enumName(ParagraphJustification, d.justification, "just"); });
        g("fill", function () { return d.applyFill ? A.hex(d.fillColor) : null; });
        g("stroke", function () { return d.applyStroke ? { color: A.hex(d.strokeColor), width: d.strokeWidth, overFill: d.strokeOverFill } : null; });
        g("box", function () { return d.boxText ? A.plain(d.boxTextSize) : false; });
        g("lines", function () { return d.composedLineCount; });
        return o;
    };
    A.plain = function (v) {
        if (v === null || v === undefined) return null;
        var t = typeof v;
        if (t === "number") return A.num(v);
        if (t === "boolean" || t === "string") return v;
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(A.plain(v[i]));
            return a;
        }
        if (v instanceof TextDocument) return A.textDoc(v, false);
        if (v instanceof Shape) return A.shape(v);
        if (v instanceof MarkerValue) return { comment: v.comment, duration: A.num(v.duration) };
        if (v.constructor === Object) {
            var o = {};
            for (var k in v) { if (v.hasOwnProperty(k) && typeof v[k] !== "function") o[k] = A.plain(v[k]); }
            return o;
        }
        return { valueType: "custom" };
    };
    // value of a property at time t; pre=true -> pre-expression
    A.value = function (p, t, pre) {
        var v;
        try {
            if (t === null || t === undefined) v = p.value;
            else v = p.valueAtTime(t, pre !== false);
        } catch (e) { return { error: String(e.message || e) }; }
        return A.plain(v);
    };
    // expression state, forcing one evaluation so expressionError is populated
    A.exprState = function (p, t) {
        var o = { x: p.expression };
        try { p.valueAtTime((t === null || t === undefined) ? 0 : t, false); } catch (e) {}
        try { if (!p.expressionEnabled) o.on = false; } catch (e2) {}
        try { if (p.expressionError) o.err = String(p.expressionError); } catch (e3) {}
        return o;
    };

    // ------------------------------------------------------------------ lookups
    A.comps = function (re) {
        var r = [];
        var rx = null;
        if (re) rx = (re instanceof RegExp) ? re : new RegExp(re);
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && (!rx || rx.test(it.name))) r.push(it);
        }
        return r;
    };
    A.comp = function (name) {
        var hits = [];
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === name) hits.push(it);
        }
        if (hits.length === 0) throw new Error("no comp named '" + name + "'");
        if (hits.length > 1) A.warn("comp name '" + name + "' is ambiguous (" + hits.length + "); using id " + hits[0].id);
        return hits[0];
    };
    A.layer = function (comp, nameOrIdx) {
        if (typeof nameOrIdx === "number") return comp.layer(nameOrIdx);
        var L = comp.layer(nameOrIdx);
        if (!L) throw new Error("no layer '" + nameOrIdx + "' in comp '" + comp.name + "'");
        return L;
    };
    A.layers = function (comp, re) {
        var r = [];
        var rx = null;
        if (re) rx = (re instanceof RegExp) ? re : new RegExp(re);
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (!rx || rx.test(L.name)) r.push(L);
        }
        return r;
    };
    // property by path: "Transform/Position", "ADBE Transform Group/ADBE Position",
    // "Effects/lock glint/Center", "Masks/1/Mask Path". A numeric segment matches a property NAMED
    // that first (CucoStudio palette effects are named "1","2","3"), else it is a 1-based index;
    // "Name#2" picks the 2nd sibling with that name or matchName (e.g. "ADBE Color Control#1").
    A.prop = function (layer, path) {
        var segs = String(path).split("/");
        var cur = layer;
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var next = null;
            if (/^\d+$/.test(seg)) {
                // a name match wins ("1","2","3" are CucoStudio palette effect NAMES); else a 1-based index
                for (var q = 1; q <= cur.numProperties; q++) { if (cur.property(q).name === seg) { next = cur.property(q); break; } }
                if (!next) next = cur.property(parseInt(seg, 10));
            } else {
                var nth = 1;
                var m = seg.match(/^(.*)#(\d+)$/);
                if (m) { seg = m[1]; nth = parseInt(m[2], 10); }
                var seen = 0;
                for (var k = 1; k <= cur.numProperties; k++) {
                    var c = cur.property(k);
                    if (c.name === seg || c.matchName === seg) { seen++; if (seen === nth) { next = c; break; } }
                }
                if (!next && nth === 1) { try { next = cur.property(seg); } catch (e) { next = null; } }
            }
            if (!next) throw new Error("no property '" + segs[i] + "' under '" + (cur.name || "layer") + "' (path " + path + ")");
            cur = next;
        }
        return cur;
    };
    A.walkProps = function (group, fn, namePath, mnPath) {
        for (var i = 1; i <= group.numProperties; i++) {
            var p;
            try { p = group.property(i); } catch (e) { continue; }
            if (!p) continue;
            var pn = "?", pm = "?";
            try { pn = p.name; pm = p.matchName; } catch (en) {}
            var np = namePath ? namePath + "/" + pn : pn;
            var mp = mnPath ? mnPath + "/" + pm : pm;
            if (p.propertyType === PropertyType.PROPERTY) fn(p, np, mp);
            else A.walkProps(p, fn, np, mp);
        }
    };
    A.layerType = function (L) {
        if (L instanceof CameraLayer) return "camera";
        if (L instanceof LightLayer) return "light";
        if (L instanceof TextLayer) return "text";
        if (L instanceof ShapeLayer) return "shape";
        if (L.nullLayer) return "null";
        if (L.adjustmentLayer) return "adjustment";
        try { if (L.source instanceof CompItem) return "precomp"; } catch (e) {}
        try { if (L.source && L.source.mainSource instanceof SolidSource) return "solid"; } catch (e2) {}
        return "footage";
    };
    A.ref = function (L) {
        if (!L) return null;
        var o = { index: L.index, name: L.name };
        try { o.id = L.id; } catch (e) {}
        return o;
    };

    return A;
})();

// legacy probes written for ae-run.sh call aeWrite(); route it to THIS job's output.
// Always (re)install: ae-run.sh leaves its own aeWrite in the persistent engine, pointing at a stale file.
$.global.aeWrite = function (s) { AECTX.out(s); };
