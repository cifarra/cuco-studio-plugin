// aectx frames.jsx - saveFrameToPng at times (read-only render; files land asynchronously).
// args: comp, times [..], outdir
(function () {
    var A = AECTX, a = A.args;
    var comp = A.comp(a.comp);
    if (!comp.saveFrameToPng) throw new Error("saveFrameToPng needs AE 2022+");
    var files = [];
    for (var i = 0; i < a.times.length; i++) {
        var t = a.times[i];
        var name = a.outdir + "/" + comp.name.replace(/[^A-Za-z0-9_.-]/g, "_") + "_" + (i < 10 ? "0" : "") + i + "_t" + t.toFixed(2) + ".png";
        var f = new File(name);
        if (f.exists) f.remove();   // never let an old PNG pass as this run's frame
        comp.saveFrameToPng(t, f);
        files.push(name);
    }
    A.result({ comp: comp.name, size: [comp.width, comp.height], files: files });
})();
