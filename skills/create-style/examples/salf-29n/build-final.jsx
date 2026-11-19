app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/seacabo/build/salf-lib.jsx"));
    out = SALF_BUILD({ sim: false, foot: "/Users/ale/style-dev/salf-29n/footage" });
    app.project.save(new File("/Users/ale/style-dev/salf-29n/SALF-29N.aep"));
    out += "\nsaved " + app.project.file.fsName;
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
