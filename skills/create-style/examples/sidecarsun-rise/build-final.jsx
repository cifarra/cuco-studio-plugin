app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/sidecarsun/scs-lib.jsx"));
    out = SCS_BUILD({ sim: false });
    app.project.save(new File("/Users/ale/style-dev/sidecarsun/SidecarSUN.aep"));
    out += "\nsaved";
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.result(out);
