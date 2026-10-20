// aectx status.jsx - what is open in the running AE (read-only).
(function () {
    var A = AECTX, P = app.project;
    var r = { aeVersion: app.version, project: P.file ? P.file.fsName : null, dirty: P.dirty, numItems: P.numItems };
    try { r.activeItem = (P.activeItem && P.activeItem.name) ? P.activeItem.name : null; } catch (e) {}
    try { r.rendering = P.renderQueue.rendering; } catch (e2) {}
    try { r.cucoExtension = (typeof $._CUCO_STYLE_BUILDER === "object"); } catch (e3) { r.cucoExtension = false; }
    var comps = 0, layers = 0, top = [];
    for (var i = 1; i <= P.numItems; i++) {
        var it = P.item(i);
        if (it instanceof CompItem) { comps++; layers += it.numLayers; }
        if (it.parentFolder === P.rootFolder) top.push(it.name);
    }
    r.comps = comps; r.layers = layers; r.root = top;
    A.result(r);
})();
