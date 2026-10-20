"""aectx core: find the RUNNING After Effects, run a job inside it safely, cache dumps.

Safety rules (all enforced here, never by convention):
  - target the running AE process, never launch or `activate` one (the AppleScript itself checks
    `application … is running`, so an AE that quit after the ps check is not relaunched)
  - one job at a time (flock with a deadline) — parallel agents can't interleave DoScript calls
  - refuse while a CucoStudio render is building (ae-build.log), unless --force
  - a job that times out leaves a pending marker; later calls wait for it instead of queueing
  - options travel in $.global.__aectx (removed afterwards), never as bare globals
  - every job writes status.json with a nonce; no status / wrong nonce = failure, never stale data
  - dumps are verified against the job nonce and written atomically
"""
import fcntl
import gzip
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
JSX_DIR = SKILL_DIR / "jsx"
LIB = JSX_DIR / "lib.jsx"
HOME = Path(os.environ.get("AECTX_HOME", "~/.cache/aectx")).expanduser()
JOBS = HOME / "jobs"
DUMPS = HOME / "dumps"
OUTS = HOME / "out"
LOCK = HOME / "lock"
PENDING = HOME / "pending.json"
BUILD_LOG = Path("~/Library/Application Support/CucoStudio/logs/ae-build.log").expanduser()
STDOUT_BUDGET = 25000          # characters; Bash tool output truncates near 30k
LOCK_WAIT = 900                # seconds to wait for another aectx job before giving up
JOB_RETENTION = 24 * 3600      # finished job dirs older than this are pruned

AE_RX = re.compile(r"/(Adobe After Effects (?:\d{4}|\(Beta\)))\.app/Contents/MacOS/After Effects$")


class AeError(Exception):
    """A user-facing failure (exit code 2)."""


class Busy(AeError):
    """AE is busy (render build, earlier timed-out job, or another aectx job) — exit code 3."""


def log(msg):
    print(f"aectx: {msg}", file=sys.stderr, flush=True)


def write_atomic(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


# ------------------------------------------------------------------ AE discovery
def running_ae():
    """Names of running AE apps, e.g. ['Adobe After Effects 2025'] (main process only)."""
    out = subprocess.run(["ps", "-axo", "comm="], capture_output=True, text=True).stdout
    names = set()
    for line in out.splitlines():
        m = AE_RX.search(line.strip())
        if m:
            names.add(m.group(1))
    return sorted(names)


def pick_ae(explicit=None):
    running = running_ae()
    if explicit:
        if explicit not in running:
            raise AeError(f"{explicit!r} is not running (running: {running or 'none'})")
        return explicit
    if not running:
        raise AeError("After Effects is not running. aectx never launches it — open AE first.")
    if len(running) > 1:
        raise AeError(f"several AE versions are running {running}; pass --ae '<name>'")
    return running[0]


# ------------------------------------------------------------------ CucoStudio build detection
def build_status(max_age=600, render_max=4 * 3600):
    """{'active': bool, 'age': seconds, 'last': last log line} from the director's ae-build.log.
    A build is active when the last line isn't 'finalize done' and the log was written recently —
    or the last line is 'render start' (renderQueue.render() blocks without logging for a long time)."""
    if not BUILD_LOG.exists():
        return {"active": False, "age": None, "last": None}
    age = time.time() - BUILD_LOG.stat().st_mtime
    with open(BUILD_LOG, "rb") as f:
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - 4096))
        tail = f.read().decode("utf-8", "replace")
    lines = [l for l in re.split(r"[\r\n]+", tail) if l.strip()]
    last = lines[-1] if lines else ""
    finished = ("finalize done" in last) or ("abort" in last.lower())
    rendering = "render start" in last and age < render_max
    return {"active": (not finished) and (age < max_age or rendering), "age": round(age), "last": last}


# ------------------------------------------------------------------ locking / pending jobs
@contextmanager
def lock(wait=LOCK_WAIT):
    HOME.mkdir(parents=True, exist_ok=True)
    with open(LOCK, "w") as fh:
        deadline = time.time() + wait
        announced = False
        while True:
            try:
                fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if not announced:
                    log("waiting for another aectx job to finish…")
                    announced = True
                if time.time() > deadline:
                    raise Busy(f"another aectx job held the lock for more than {wait}s")
                time.sleep(0.5)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def check_pending(force=False, max_age=900):
    if not PENDING.exists():
        return
    try:
        p = json.loads(PENDING.read_text())
    except Exception:
        PENDING.unlink(missing_ok=True)
        return
    job = Path(p.get("job", ""))
    limit = p.get("max_age", max_age)
    if (job / "status.json").exists() or time.time() - p.get("started", 0) > limit:
        PENDING.unlink(missing_ok=True)
        return
    if not force:
        raise Busy(f"AE is still running an earlier aectx job that timed out ({job}, started "
                   f"{int(time.time() - p.get('started', 0))}s ago). Wait for it, or pass --force.")


def prune_jobs():
    if not JOBS.exists():
        return
    pending = None
    try:
        pending = json.loads(PENDING.read_text()).get("job") if PENDING.exists() else None
    except Exception:
        pass
    cutoff = time.time() - JOB_RETENTION
    for d in JOBS.glob("job_*"):
        try:
            if str(d) != pending and d.stat().st_mtime < cutoff:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


# ------------------------------------------------------------------ ES3 lint for user scripts
_REGEX_PREV = set("(,=:[!&|?{};+-*%<>~^")


def _strip_strings_comments(src):
    """Blank out string/regex literals and comments, preserving line structure."""
    out, i, n = [], 0, len(src)
    prev = ""   # last significant char emitted
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(" " + "\n" * src.count("\n", i, j))
            i = j
            continue
        if c in "\"'":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            out.append('""')
            prev = '"'
            i = j + 1
            continue
        if c == "/":
            tail = "".join(out[-24:]).rstrip()
            is_regex = (not tail) or tail[-1] in _REGEX_PREV or re.search(r"\b(return|typeof|case|in)$", tail)
            if is_regex:
                j, in_class = i + 1, False
                while j < n and src[j] != "\n":
                    ch = src[j]
                    if ch == "\\":
                        j += 2
                        continue
                    if ch == "[":
                        in_class = True
                    elif ch == "]":
                        in_class = False
                    elif ch == "/" and not in_class:
                        break
                    j += 1
                j += 1
                while j < n and src[j].isalpha():
                    j += 1
                out.append("/r/")
                i = j
                continue
        out.append(c)
        if not c.isspace():
            prev = c
        i += 1
    return "".join(out)


def es3_lint(src):
    """Problems ExtendScript (ES3) chokes on or mis-evaluates: [(line, severity, message)].
    'error' blocks the run (syntax AE rejects, or code it silently mis-evaluates); 'warn' is advisory."""
    code = _strip_strings_comments(src)
    issues = []
    for no, line in enumerate(code.split("\n"), 1):
        if re.search(r"\b(let|const)\s+[A-Za-z_$\[{]", line):
            issues.append((no, "error", "let/const is not ES3 - use var"))
        if "=>" in line:
            issues.append((no, "error", "arrow functions are not ES3"))
        if "`" in line:
            issues.append((no, "error", "template literals are not ES3"))
        if re.search(r"\bclass\s+[A-Za-z_$]", line):
            issues.append((no, "error", "class syntax is not ES3"))
        if re.search(r"\bfor\s*\([^)]*\bof\b", line):
            issues.append((no, "error", "for…of is not ES3"))
        if re.search(r"\.\.\.[A-Za-z_$\[]", line):
            issues.append((no, "error", "spread/rest syntax is not ES3"))
        flat = line
        for _ in range(8):   # collapse (…) groups so `a ? f(1) : b ? 2 : 3` is seen as nested
            nxt = re.sub(r"\([^()?]*\)", "0", flat)
            if nxt == flat:
                break
            flat = nxt
        if (re.search(r"\?[^?:;,()]*:[^?:;,()]*\?[^?:;,()]*:", flat)
                or re.search(r"\?[^?:;,()]*\?[^?:;,()]*:[^?:;,()]*:", flat)):
            issues.append((no, "error", "unparenthesized nested ternary - ExtendScript mis-evaluates these; use if/else"))
        if re.search(r"\bfunction\b[^(]*\([^)]*=", line):
            issues.append((no, "error", "default parameters are not ES3"))
        if re.search(r"\.\s*(forEach|map|filter|reduce|some|every|includes|find|findIndex)\s*\(", line):
            issues.append((no, "warn", "Array.forEach/map/filter/reduce/some/every/includes/find do not exist in ES3 (fine on strings/AECTX)"))
        if re.search(r"\bJSON\.(parse|stringify)\b", line):
            issues.append((no, "warn", "ExtendScript has no native JSON - use AECTX.json / AECTX.fmt"))
        if re.search(r"\bObject\.keys\b|\bArray\.isArray\b|\.trim\(\)|\bDate\.now\b", line):
            issues.append((no, "warn", "Object.keys/Array.isArray/String.trim/Date.now are ES5 - not in ExtendScript"))
    return issues


# ------------------------------------------------------------------ jobs
BOOT = """// aectx boot - generated; do not edit
$.level = 0;
try {{ if (typeof __outputPath !== "undefined") __outputPath = undefined; }} catch (e0a) {{}}
try {{ if (typeof __openPath !== "undefined") __openPath = undefined; }} catch (e0b) {{}}
try {{ if (typeof ONLY !== "undefined") ONLY = undefined; }} catch (e0c) {{}}
$.global.__aectx = {{ job: {job}, nonce: {nonce}, lib: {lib}, script: {script}, args: {args} }};
(function () {{
    var X = $.global.__aectx;
    var t0 = new Date().getTime();
    var ok = false, libOk = false, err = null, line = null, file = null, warnings = [];
    app.beginSuppressDialogs();
    try {{
        $.evalFile(new File(X.lib));
        libOk = true;
        AECTX.job = X.job; AECTX.args = X.args; AECTX.warnings = [];
        $.evalFile(new File(X.script));
        ok = true;
    }} catch (e) {{
        err = String(e.message || e); line = e.line || null;
        try {{ file = String(e.fileName || ""); }} catch (e1) {{}}
    }} finally {{
        try {{ app.endSuppressDialogs(false); }} catch (e2) {{}}
        if (libOk) {{ try {{ warnings = AECTX.warnings || []; }} catch (e3) {{}} }}
        var st = {{ ok: ok, nonce: X.nonce, error: err, line: line, file: file, ms: new Date().getTime() - t0, warnings: warnings }};
        var f = new File(X.job + "/status.json");
        f.encoding = "UTF-8";
        if (f.open("w")) {{
            try {{ f.write(AECTX.json(st)); }}
            catch (e4) {{ f.write('{{"ok":' + ok + ',"nonce":"' + X.nonce + '","line":' + (line || "null") + ',"error":"' + String(err).replace(/[\\\\"\\x00-\\x1f]/g, " ") + '"}}'); }}
            f.close();
        }}
        try {{ delete $.global.__aectx; }} catch (e5) {{ $.global.__aectx = undefined; }}
    }}
}})();
"""


class JobResult:
    def __init__(self, job, status):
        self.job = Path(job)
        self.status = status

    @property
    def out(self):
        p = self.job / "out.txt"
        return p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""

    @property
    def result(self):
        p = self.job / "result.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def file(self, name):
        return self.job / name

    def cleanup(self):
        shutil.rmtree(self.job, ignore_errors=True)


def _applescript(app, boot, timeout):
    path = json.dumps(str(boot), ensure_ascii=False)
    return (f"if application \"{app}\" is running then\n"
            f"  with timeout of {int(timeout)} seconds\n"
            f"    tell application \"{app}\" to DoScriptFile {path}\n"
            f"  end timeout\n"
            f"else\n"
            f"  error \"After Effects is not running\"\n"
            f"end if")


def run_job(script, args=None, timeout=120, ae=None, force=False, label=None, line_offset=0):
    """Run a .jsx inside the running AE with AECTX preloaded. Returns JobResult or raises AeError."""
    script = Path(script).resolve()
    if not script.exists():
        raise AeError(f"no such script: {script}")
    if args is not None and not isinstance(args, dict):
        raise AeError("--args must be a JSON object")
    with lock(wait=min(LOCK_WAIT, max(30, timeout))):
        check_pending(force)
        prune_jobs()
        app = pick_ae(ae)
        if not force:
            b = build_status()
            if b["active"]:
                raise Busy(f"CucoStudio is building a render right now (ae-build.log {b['age']}s ago: "
                           f"{b['last'][:80]!r}). Wait for 'finalize done', or pass --force.")
        JOBS.mkdir(parents=True, exist_ok=True)
        job = Path(tempfile.mkdtemp(prefix="job_", dir=JOBS))
        nonce = secrets.token_hex(8)
        a = dict(args or {})
        a["nonce"] = nonce
        boot = job / "boot.jsx"
        boot.write_text(BOOT.format(job=json.dumps(str(job)), nonce=json.dumps(nonce), lib=json.dumps(str(LIB)),
                                    script=json.dumps(str(script)), args=json.dumps(a)), encoding="utf-8")
        pending = {"job": str(job), "started": time.time(), "max_age": max(900, 2 * timeout)}
        try:
            proc = subprocess.run(["osascript", "-e", _applescript(app, boot, timeout)],
                                  capture_output=True, text=True, timeout=timeout + 15)
        except subprocess.TimeoutExpired:
            write_atomic(PENDING, json.dumps(pending))
            raise AeError(f"AE did not finish within {timeout}s (job {job}). It may still be running it; "
                          f"later aectx calls will wait for it. Raise --timeout for heavy jobs.")
        status_p = job / "status.json"
        for _ in range(50):
            if status_p.exists() and status_p.stat().st_size > 0:
                break
            time.sleep(0.1)
        if not status_p.exists():
            err = (proc.stderr or "").strip()
            if proc.returncode != 0 and ("-1712" in err or "timed out" in err.lower()):
                write_atomic(PENDING, json.dumps(pending))
                raise AeError(f"AE did not finish within {timeout}s (job {job}); it may still be running it — "
                              f"later aectx calls will wait for it. Raise --timeout for heavy jobs.")
            if "not running" in err:
                raise AeError("After Effects is not running (it quit before the job could start)")
            raise AeError(f"job failed: {err or 'no status.json — the job never ran (modal dialog in AE?)'} (job {job})")
        try:
            status = json.loads(status_p.read_text(encoding="utf-8"))
        except ValueError:
            raise AeError(f"unreadable status.json in {job}")
        if status.get("nonce") != nonce:
            raise AeError(f"stale status (nonce mismatch) in {job}")
        res = JobResult(job, status)
        if not status.get("ok"):
            where = ""
            if status.get("line"):
                fname = Path(status.get("file") or "").name
                if fname == "lib.jsx":
                    where = f" (raised by an AECTX helper, lib.jsx:{status['line']}, called from your {label or 'script'})"
                elif label and (not fname or fname == script.name):
                    where = f" (line {int(status['line']) - line_offset} of {label})"
                else:
                    where = f" (line {status['line']} of {fname or 'script'})"
            out = res.out
            if len(out) > 4000:
                out = "…" + out[-4000:]
            raise AeError(f"script error: {status.get('error')}{where}\n{out}".rstrip())
        return res


SNIPPET_HEAD = "(function () { var __r = (function () { "
SNIPPET_TAIL = "\n})(); if (__r !== undefined) AECTX.out(typeof __r === 'string' ? __r : AECTX.fmt(__r)); })();\n"


def run_snippet(code, args=None, **kw):
    """Run an inline ES3 snippet wrapped in an IIFE; `return x` makes x the printed result.
    The wrapper opens on the snippet's first line, so reported error lines match the snippet."""
    HOME.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix="q_", suffix=".jsx", dir=HOME)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(SNIPPET_HEAD + code + SNIPPET_TAIL)
    try:
        return run_job(path, args=args, label="snippet", **kw)
    finally:
        os.unlink(path)


def wrap_script(src):
    """Wrap a `run` script in an IIFE (same first line) so its vars don't become lasting globals."""
    return "(function () { " + src + "\n})();\n"


# ------------------------------------------------------------------ dump cache
def dump_key(path):
    return hashlib.sha1((path or "untitled").encode()).hexdigest()[:16]


def store_dump(job_result):
    dump_p = job_result.file("dump.json")
    try:
        text = dump_p.read_text(encoding="utf-8")
        data = json.loads(text)
    except (OSError, ValueError) as e:
        raise AeError(f"extraction wrote an unreadable dump ({e}) in {job_result.job}")
    meta = data.get("meta", {})
    if meta.get("nonce") != job_result.status.get("nonce"):
        raise AeError(f"dump nonce mismatch in {job_result.job} — refusing stale data")
    path = meta.get("path")
    key = dump_key(path)
    dst = DUMPS / f"{key}.json"
    write_atomic(dst, text)
    info = {"path": path, "dump": str(dst), "extracted_at": time.time(), "at": meta.get("at"),
            "post": meta.get("post"), "comps": meta.get("comps"), "dirty": meta.get("dirty"),
            "items": meta.get("stats", {}).get("items")}
    if path and Path(path).exists():
        st = Path(path).stat()
        info.update(aep_mtime=st.st_mtime, aep_size=st.st_size)
    write_atomic(DUMPS / f"{key}.meta.json", json.dumps(info, indent=1))
    write_atomic(DUMPS / "latest.json", json.dumps(info, indent=1))
    job_result.cleanup()
    return dst, data


def _read_json(p):
    p = Path(p).expanduser()
    try:
        if p.suffix == ".gz":
            with gzip.open(p, "rt", encoding="utf-8") as f:
                return json.load(f)
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise AeError(f"dump not found: {p}")
    except (OSError, ValueError, EOFError) as e:
        raise AeError(f"cannot read dump {p}: {e}")


def load_dump(file=None):
    """Load a dump: --file path, else the latest extraction. Returns (data, info, staleness_note)."""
    if file:
        data = _read_json(file)
        if not isinstance(data, dict):
            raise AeError(f"{file} is not an aectx dump (expected a JSON object)")
        return data, {"dump": str(file), "path": (data.get("meta") or {}).get("path")}, None
    latest = DUMPS / "latest.json"
    if not latest.exists():
        raise AeError("no extraction yet — run `aectx extract` (or pass --file DUMP.json)")
    info = _read_json(latest)
    if not isinstance(info, dict) or not info.get("dump"):
        raise AeError("latest.json is corrupt — re-run `aectx extract`")
    data = _read_json(info["dump"])
    if not isinstance(data, dict):
        raise AeError("the latest dump is not an aectx dump — re-run `aectx extract`")
    note = None
    age = time.time() - info.get("extracted_at", 0)
    if info.get("path") and Path(info["path"]).exists() and info.get("aep_mtime"):
        if Path(info["path"]).stat().st_mtime > info["aep_mtime"] + 1:
            note = "the .aep was saved after this extraction — re-run `aectx extract`"
    if info.get("dirty"):
        note = (note + "; " if note else "") + "project had unsaved changes when extracted"
    info["age_s"] = int(age)
    return data, info, note


def display_name(path):
    """steel.aep — or, for CucoStudio arrangements (always project.aep), projects/125/arrangements/746/project.aep."""
    if not path:
        return "untitled"
    p = Path(path)
    if p.name == "project.aep" and p.parent.parent.name == "arrangements":
        return f"projects/{p.parent.parent.parent.name}/arrangements/{p.parent.name}/project.aep"
    return p.name


def header(info, note=None):
    name = display_name(info.get("path"))
    age = info.get("age_s")
    agestr = "" if age is None else (f", extracted {age // 60}m ago" if age >= 60 else f", extracted {age}s ago")
    s = f"[dump: {name}{agestr}]"
    if note:
        s += f"\n[STALE? {note}]"
    return s


# ------------------------------------------------------------------ output budget
def tokens_estimate(text):
    return int(len(text) / 3.6)


def emit(text, name="output"):
    """Print text, or spill it to a file when it would blow the tool-output budget."""
    if len(text) <= STDOUT_BUDGET:
        print(text)
        return None
    OUTS.mkdir(parents=True, exist_ok=True)
    fd, p = tempfile.mkstemp(prefix=f"{name}-", suffix=".txt", dir=OUTS)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    print(text[:4000])
    print(f"\n… output is {len(text):,} chars (~{tokens_estimate(text):,} tokens); full text written to {p}\n"
          f"Read it with offset/limit, or narrow the command (--comp / --layers / a smaller view).")
    return p
