app.beginSuppressDialogs();
var out;
try {
    $.evalFile(new File("/Users/ale/styles/letterpile/build/lp-lib.jsx"));
    out = LP_BUILD({ sim: true, photos: AECTX.args.photos });
} catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
