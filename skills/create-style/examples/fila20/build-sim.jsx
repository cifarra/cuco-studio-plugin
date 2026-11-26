app.beginSuppressDialogs();
var out;
try { $.evalFile(new File("/Users/ale/styles/fila20/fila-lib.jsx")); out = FILA_BUILD({ sim: true, photos: AECTX.args.photos, logo: "/Users/ale/styles/fila20/logo/logo.json" }); }
catch (e) { out = "ERROR line " + e.line + ": " + e.toString(); }
app.endSuppressDialogs(false);
AECTX.out(out);
