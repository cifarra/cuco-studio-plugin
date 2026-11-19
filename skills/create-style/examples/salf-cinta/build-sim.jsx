app.beginSuppressDialogs();
var out;
try { $.evalFile(new File("/Users/ale/styles/seacabo/v2/salf2-lib.jsx")); out = SALF2_BUILD({ sim: true, photos: AECTX.args.photos, foot: "/Users/ale/style-dev/salf-cinta/footage" }); }
catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
