app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/hdc-v3/build/hcd3-lib.jsx"));
    var P = []; for (var i = 1; i <= 6; i++) P.push("/Users/ale/style-dev/hcd-smile/footage/portrait-0" + i + ".jpg");
    out = HCD3_BUILD({ sim: false, portraits: P });
    app.project.save(new File("/Users/ale/style-dev/hcd-smile/HCD-Smile.aep"));
    out += "\nsaved " + app.project.file.fsName;
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
