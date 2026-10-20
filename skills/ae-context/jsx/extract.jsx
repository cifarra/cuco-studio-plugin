// aectx extract.jsx - dump the open project to <job>/dump.json (schema aectx/2, see SCHEMA.md).
// Runs inside the aectx boot wrapper (AECTX preloaded). Read-only: never saves, never mutates.
// One generic property walk per layer; a property is recorded when it has an expression
// (enabled OR disabled), keyframes, or isModified - so nothing is silently skipped and
// untouched defaults stay out.

(function () {
    var A = AECTX;
    var args = A.args || {};
    var AT = (args.at === undefined || args.at === null) ? 0 : Number(args.at);
    var POST = !!args.post;
    var COMP_RX = args.comps ? new RegExp(args.comps) : null;
    var t0 = new Date().getTime();
    var stats = { items: 0, layers: 0, props: 0, propErrors: 0, exprs: 0, exprErrors: 0, layerErrors: 0 };
    var errors = [];

    var BLEND = A.enumMap(BlendingMode, "blend");
    var MATTE = A.enumMap(TrackMatteType, "matte");
    var MASKM = A.enumMap(MaskMode, "mask");
    var INTERP = A.enumMap(KeyframeInterpolationType, "interp");
    var QUAL = A.enumMap(LayerQuality, "quality");
    var ALPHA = {};
    try { ALPHA = A.enumMap(AlphaMode, "alpha"); } catch (e) {}

    function g(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
    function parentFolderId(item) {
        var pf = g(function () { return item.parentFolder; }, null);
        if (!pf || pf === app.project.rootFolder) return null;
        return pf.id;
    }

    // ---------------------------------------------------------------- properties
    function keyframes(p, isText) {
        var ks = [];
        for (var i = 1; i <= p.numKeys; i++) {
            var v;
            try { v = p.keyValue(i); } catch (e) { v = null; }
            var pv;
            if (isText && v) pv = A.textDoc(v, true);
            else pv = A.plain(v);
            var k = [A.num(p.keyTime(i), 4), pv];
            var ti = g(function () { return INTERP[p.keyInInterpolationType(i)]; }, null);
            var to = g(function () { return INTERP[p.keyOutInterpolationType(i)]; }, null);
            if (ti === "HOLD" || to === "HOLD") k.push("HOLD");
            else if (ti === "LINEAR" && to === "LINEAR") k.push("LINEAR");
            ks.push(k);
        }
        return ks;
    }
    function recordProp(p, namePath, mnPath, out) {
        try { recordPropInner(p, namePath, mnPath, out); }
        catch (e) { out.push({ path: namePath, mn: mnPath, error: String(e.message || e) }); stats.propErrors++; }
    }
    function recordPropInner(p, namePath, mnPath, out) {
        var hasExpr = false, nk = 0, mod = false;
        try { hasExpr = p.canSetExpression && p.expression !== ""; } catch (e) {}
        try { nk = p.numKeys; } catch (e2) {}
        try { mod = p.isModified; } catch (e3) {}
        if (!hasExpr && nk === 0 && !mod) return;
        if (mnPath.indexOf("ADBE Marker") === 0) return;
        var vt = g(function () { return p.propertyValueType; }, null);
        if (vt === PropertyValueType.NO_VALUE) return;
        var isText = (p.matchName === "ADBE Text Document");
        var r = { path: namePath, mn: mnPath };
        var custom = (vt === PropertyValueType.CUSTOM_VALUE);
        if (custom) r.v = { valueType: "custom" };
        else r.v = A.value(p, AT, true);
        if (nk > 0) {
            if (custom) r.k = [];
            else r.k = keyframes(p, isText);
            if (custom) { for (var ki = 1; ki <= nk; ki++) r.k.push([A.num(p.keyTime(ki), 4), { valueType: "custom" }]); }
        }
        if (hasExpr) {
            var es = A.exprState(p, AT);
            r.x = es.x;
            if (es.on === false) r.xOn = false;
            if (es.err) { r.xErr = es.err; stats.exprErrors++; }
            if (POST) r.vPost = A.value(p, AT, false);
            stats.exprs++;
        }
        out.push(r);
        stats.props++;
    }

    // ---------------------------------------------------------------- layers
    function layerRecord(L) {
        var o = {
            index: L.index,
            id: g(function () { return L.id; }, null),
            name: L.name,
            type: A.layerType(L)
        };
        var src = g(function () { return L.source; }, null);
        if (src) o.source = { id: src.id, name: src.name };
        o.enabled = g(function () { return L.enabled; }, null);
        if (g(function () { return L.hasAudio && !L.audioEnabled; }, false)) o.audioOff = true;
        if (L.solo) o.solo = true;
        if (L.shy) o.shy = true;
        if (L.locked) o.locked = true;
        if (g(function () { return L.threeDLayer; }, false)) o.threeD = true;
        if (g(function () { return L.collapseTransformation; }, false)) o.collapse = true;
        if (g(function () { return L.adjustmentLayer; }, false)) o.adjustment = true;
        if (g(function () { return L.guideLayer; }, false)) o.guide = true;
        if (g(function () { return L.motionBlur; }, false)) o.motionBlur = true;
        if (g(function () { return L.timeRemapEnabled; }, false)) o.timeRemap = true;
        var q = g(function () { return QUAL[L.quality]; }, null);
        if (q && q !== "BEST") o.quality = q;
        o.label = g(function () { return L.label; }, null);
        o["in"] = A.num(L.inPoint);
        o.out = A.num(L.outPoint);
        o.start = A.num(L.startTime);
        var sr = g(function () { return L.stretch; }, 100);
        if (sr !== 100) o.stretch = A.num(sr);
        if (L.parent) o.parent = A.ref(L.parent);
        var bm = g(function () { return BLEND[L.blendingMode]; }, null);
        if (bm && bm !== "NORMAL") o.blend = bm;
        var mt = g(function () { return MATTE[L.trackMatteType]; }, null);
        if (mt && mt !== "NO_TRACK_MATTE") {
            o.matte = { type: mt };
            var ml = g(function () { return L.trackMatteLayer; }, null);
            if (ml) o.matte.layer = A.ref(ml);
        }
        if (g(function () { return L.isTrackMatte; }, false)) o.isMatte = true;

        // effects (names) and masks (modes) - their properties come from the generic walk
        var fx = g(function () { return L.property("ADBE Effect Parade"); }, null);
        if (fx && fx.numProperties > 0) {
            o.effects = [];
            for (var i = 1; i <= fx.numProperties; i++) {
                try {
                    var e = fx.property(i);
                    o.effects.push({ name: e.name, mn: e.matchName, on: g(function () { return e.enabled; }, true) });
                } catch (efx) { o.effects.push({ index: i, error: String(efx.message || efx) }); }
            }
        }
        var mp = g(function () { return L.property("ADBE Mask Parade"); }, null);
        if (mp && mp.numProperties > 0) {
            o.masks = [];
            for (var j = 1; j <= mp.numProperties; j++) {
                var m = mp.property(j);
                var mm = { name: m.name, mode: g(function () { return MASKM[m.maskMode]; }, null) };
                if (g(function () { return m.inverted; }, false)) mm.inverted = true;
                o.masks.push(mm);
            }
        }
        var mk = g(function () { return L.property("ADBE Marker"); }, null);
        if (mk && mk.numKeys > 0) o.markers = markers(mk);

        o.props = [];
        A.walkProps(L, function (p, np, mn) { recordProp(p, np, mn, o.props); }, "", "");
        return o;
    }
    function markers(mp) {
        var r = [];
        for (var i = 1; i <= mp.numKeys; i++) {
            try {
                var mv = mp.keyValue(i);
                var m = { t: A.num(mp.keyTime(i), 4), comment: mv.comment };
                if (mv.duration) m.dur = A.num(mv.duration);
                if (mv.chapter) m.chapter = mv.chapter;
                r.push(m);
            } catch (emk) { r.push({ index: i, error: String(emk.message || emk) }); }
        }
        return r;
    }

    // ---------------------------------------------------------------- items
    function itemRecord(it) {
        var o = { id: it.id, name: it.name, folder: parentFolderId(it) };
        if (it.comment) o.comment = it.comment;
        if (it instanceof FolderItem) { o.type = "folder"; return o; }
        if (it instanceof CompItem) {
            o.type = "comp";
            o.width = it.width; o.height = it.height;
            o.duration = A.num(it.duration); o.fps = A.num(it.frameRate);
            if (it.pixelAspect !== 1) o.pixelAspect = A.num(it.pixelAspect);
            o.bg = A.hex(it.bgColor);
            o.time = A.num(it.time);
            o.workArea = [A.num(it.workAreaStart), A.num(it.workAreaDuration)];
            if (it.motionBlur) o.motionBlur = { shutterAngle: it.shutterAngle, shutterPhase: it.shutterPhase };
            if (it.frameBlending) o.frameBlending = true;
            o.renderer = g(function () { return it.renderer; }, null);
            o.numLayers = it.numLayers;
            var mk = g(function () { return it.markerProperty; }, null);
            if (mk && mk.numKeys > 0) o.markers = markers(mk);
            o.layers = [];
            if (COMP_RX && !COMP_RX.test(it.name)) { o.skipped = true; return o; }
            for (var i = 1; i <= it.numLayers; i++) {
                var L = it.layer(i);
                try {
                    o.layers.push(layerRecord(L));
                    stats.layers++;
                } catch (e) {
                    stats.layerErrors++;
                    errors.push({ comp: it.name, layer: L.name, index: i, error: String(e.message || e), line: e.line });
                    o.layers.push({ index: i, name: L.name, error: String(e.message || e) });
                }
            }
            return o;
        }
        if (it instanceof FootageItem) {
            o.type = "footage";
            var ms = it.mainSource;
            if (ms instanceof SolidSource) { o.type = "solid"; o.color = A.hex(ms.color); }
            else if (ms instanceof PlaceholderSource) o.type = "placeholder";
            o.width = it.width; o.height = it.height;
            o.duration = A.num(it.duration); o.fps = A.num(it.frameRate);
            if (o.type === "footage") {
                o.file = g(function () { return it.file ? it.file.fsName : null; }, null);
                if (g(function () { return it.footageMissing; }, false)) o.missing = true;
                o.still = g(function () { return ms.isStill; }, null);
                o.hasVideo = it.hasVideo; o.hasAudio = it.hasAudio;
                o.alpha = g(function () { return ALPHA[ms.alphaMode]; }, null);
                if (o.alpha === "PREMULTIPLIED") o.premul = g(function () { return A.hex(ms.premulColor); }, null);
                var cf = g(function () { return ms.conformFrameRate; }, 0);
                if (cf) o.conformFps = cf;
            }
            return o;
        }
        o.type = "unknown";
        return o;
    }

    // ---------------------------------------------------------------- project
    var P = app.project;
    var dump = {
        schema: "aectx/2",
        meta: {
            name: P.file ? P.file.displayName : "Untitled",
            path: P.file ? P.file.fsName : null,
            dirty: g(function () { return P.dirty; }, null),
            aeVersion: app.version,
            bitsPerChannel: g(function () { return P.bitsPerChannel; }, null),
            expressionEngine: g(function () { return P.expressionEngine; }, null),
            at: AT,
            post: POST,
            comps: args.comps || null,
            nonce: args.nonce || null
        },
        fonts: [],
        items: []
    };
    try {
        var uf = P.usedFonts;
        for (var f = 0; f < uf.length; f++) {
            var fo = uf[f].font;
            dump.fonts.push({
                postScriptName: fo.postScriptName, family: g(function () { return fo.familyName; }, null),
                style: g(function () { return fo.styleName; }, null),
                substitute: g(function () { return fo.isSubstitute; }, false),
                uses: g(function () { return uf[f].usedAt.length; }, null)
            });
        }
    } catch (e) { A.warn("usedFonts unavailable: " + e.message); }

    for (var i = 1; i <= P.numItems; i++) {
        var it = P.item(i);
        try { dump.items.push(itemRecord(it)); stats.items++; }
        catch (e) {
            errors.push({ item: it.name, error: String(e.message || e), line: e.line });
            var stub = { id: it.id, name: it.name, error: String(e.message || e) };
            stub.folder = g(function () { return parentFolderId(it); }, null);
            stub.type = g(function () { if (it instanceof CompItem) return "comp"; if (it instanceof FolderItem) return "folder"; return "footage"; }, null);
            dump.items.push(stub);
        }
    }
    stats.ms = new Date().getTime() - t0;
    dump.meta.stats = stats;
    dump.meta.errors = errors;
    dump.meta.warnings = A.warnings;
    A.write(A.job + "/dump.json", A.json(dump), false);
    A.out("items=" + stats.items + " layers=" + stats.layers + " props=" + stats.props + " exprs=" + stats.exprs +
        " exprErrors=" + stats.exprErrors + " layerErrors=" + stats.layerErrors + " ms=" + stats.ms);
})();
