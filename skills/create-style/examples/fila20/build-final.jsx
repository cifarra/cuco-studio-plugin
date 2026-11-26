app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/fila20/fila-lib.jsx"));
    out = FILA_BUILD({ sim: false, logo: "/Users/ale/styles/fila20/logo/logo.json" });
    app.project.save(new File("/Users/ale/style-dev/fila20/FILA20.aep"));
    out += "\nsaved " + app.project.file.fsName;
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
