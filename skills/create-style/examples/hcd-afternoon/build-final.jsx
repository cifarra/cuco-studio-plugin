app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/hdc-v2/build/hcd2-lib.jsx"));
    out = HCD2_BUILD({ sim: false });
    app.project.save(new File("/Users/ale/style-dev/hdc-afternoon/HCD-Afternoon.aep"));
    out += "\nsaved " + app.project.file.fsName;
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
