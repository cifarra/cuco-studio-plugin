// Save verification frames for Hermes Ink shots
$.level = 0;
app.beginSuppressDialogs();
var LOG_PATH = Folder("~").fsName + "/styles/hermes/ae-log.txt";
function writeLog(success, lines) {
    var f = new File(LOG_PATH); f.open("w");
    f.write((success ? "SUCCESS" : "ERROR") + "\n" + lines.join("\n") + "\n"); f.close();
}
var log = [];
function findComp(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
}
try {
    var base = Folder("~").fsName + "/styles/hermes/frames";
    new Folder(base).create();
    var names = ["01", "02", "03"];
    var times = [0.3, 0.7, 2.0];
    for (var n = 0; n < names.length; n++) {
        var comp = findComp(names[n]);
        if (!comp) { log.push("MISSING comp " + names[n]); continue; }
        for (var t = 0; t < times.length; t++) {
            var file = new File(base + "/" + names[n] + "_" + times[t] + ".png");
            comp.saveFrameToPng(times[t], file);
            log.push("saved " + file.fsName);
        }
    }
    writeLog(true, log);
} catch (e) {
    log.push("line " + e.line + ": " + e.toString());
    writeLog(false, log);
}
app.endSuppressDialogs(false);
