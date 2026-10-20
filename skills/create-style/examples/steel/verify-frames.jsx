var OUT = "/Users/ale/styles/steel2/frames";
var DEF = [0.38, 0.5, 0.64, 0.82, 2.0, 3.34, 3.52, 9.8];
var MAP = { "02": [0.05, 0.12, 0.22, 0.45, 2.0, 9.45, 9.7, 9.93] };
var shots = (typeof ONLY !== "undefined") ? ONLY : ["01","02","03","04","05","06"];
function find(n){ for (var i=1;i<=app.project.numItems;i++){ var it=app.project.item(i); if (it instanceof CompItem && it.name===n) return it; } return null; }
var done=[];
for (var s=0;s<shots.length;s++){
  var c = find(shots[s]); if (!c) continue;
  var T = MAP[shots[s]] || DEF;
  for (var t=0;t<T.length;t++) c.saveFrameToPng(T[t], new File(OUT + "/" + shots[s] + "_" + t + ".png"));
  done.push(shots[s]);
}
aeWrite("done " + done.join(","));
