app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/letterpile/build/lp-lib.jsx"));
    out = LP_BUILD({ sim: false });
    app.project.save(new File("/Users/ale/style-dev/letterpile/Letterpile.aep"));
    out += "\nsaved " + app.project.file.fsName;
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
