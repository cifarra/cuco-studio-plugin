app.beginSuppressDialogs();
var out;
try { $.evalFile(new File("/Users/ale/styles/seacabo/build/salf-lib.jsx")); out = SALF_BUILD({ sim: true, photos: AECTX.args.photos, foot: "/Users/ale/style-dev/salf-29n/footage" }); }
catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
