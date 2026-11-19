app.beginSuppressDialogs();
var out;
try { $.evalFile(new File("/Users/ale/styles/hdc-v3/build/hcd3-lib.jsx")); out = HCD3_BUILD({ sim: true, photos: AECTX.args.photos, portraits: AECTX.args.portraits }); }
catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
