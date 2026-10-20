// render shot 01 as if it were different sections — rename BOTH the shot comp and its text comp like the director does
var OUT = "/Users/ale/styles/steel2/frames";
function find(n){ for (var i=1;i<=app.project.numItems;i++){ var it=app.project.item(i); if (it instanceof CompItem && it.name===n) return it; } return null; }
var c = find("01"), tc = find("01-text"); var T = [1.2, 2.8, 4.4, 6.0];
var secs = [0, 1, 2, 3];
for (var k=0;k<secs.length;k++){ c.name = "01-" + secs[k]; tc.name = "01-" + secs[k] + "-text";
  for (var t=0;t<T.length;t++) c.saveFrameToPng(T[t], new File(OUT+"/sec_"+secs[k]+"_"+t+".png")); }
c.name = "01"; tc.name = "01-text";
aeWrite("ok");
