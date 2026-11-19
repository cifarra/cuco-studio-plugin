app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/seacabo/v2/salf2-lib.jsx"));
    out = SALF2_BUILD({ sim: false, foot: "/Users/ale/style-dev/salf-cinta/footage" });
    app.project.save(new File("/Users/ale/style-dev/salf-cinta/SALF-Cinta.aep"));
    out += "\nsaved " + app.project.file.fsName;
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
