// render-queue benchmark: renders comp frames [a, b) to a throwaway PNG sequence, returns sec/frame
var A = AECTX.args; var c = AECTX.comp(A.comp);
var rq = app.project.renderQueue; while (rq.numItems > 0) rq.item(1).remove();
var it = rq.items.add(c);
it.timeSpanStart = A.a; it.timeSpanDuration = A.b - A.a;
var om = it.outputModule(1);
try { om.applyTemplate("PNG Sequence"); } catch (e) {}
var d = new Folder(Folder.temp.fsName + "/scs_bench"); if (!d.exists) d.create();
om.file = new File(d.fsName + "/f_[####].png");
app.beginSuppressDialogs();
$.hiresTimer; rq.render(); var us = $.hiresTimer;
app.endSuppressDialogs(false);
it.remove();
var n = Math.round((A.b - A.a) * c.frameRate);
AECTX.result(A.comp + " " + n + " frames " + Math.round(us / 1e4) / 100 + "s = " + Math.round(us / n / 1e3) + " ms/frame");
