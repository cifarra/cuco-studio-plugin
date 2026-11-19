app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/hdc/hdc-lib.jsx"));
    out = HDC_BUILD({ sim: false });
    app.project.save(new File("/Users/ale/style-dev/hdc/HialeahCityDental.aep"));
    out += "\nsaved";
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.result(out);
