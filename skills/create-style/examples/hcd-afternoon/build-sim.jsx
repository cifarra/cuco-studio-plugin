app.beginSuppressDialogs();
var out;
try { $.evalFile(new File("/Users/ale/styles/hdc-v2/build/hcd2-lib.jsx")); out = HCD2_BUILD({ sim: true, photos: AECTX.args.photos }); }
catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
