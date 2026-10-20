"""aectx — inspect and verify the running After Effects project.

Live commands talk to the RUNNING AE (never launch it, never save, one job at a time):
  status, extract, run, q, eval, frames, repair-expressions
Offline commands read the latest extraction (or --file DUMP.json[.gz]):
  overview, tree, exprs, wiring, validate, phrases
Utility: lint
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from . import core

EXIT_OK, EXIT_FINDINGS, EXIT_ERROR, EXIT_BUSY = 0, 1, 2, 3


def _times(s):
    try:
        t = [float(x) for x in str(s).replace(" ", "").split(",") if x != ""]
    except ValueError:
        raise core.AeError(f"--t must be comma-separated seconds, e.g. 0,0.5,2 (got {s!r})")
    if not t:
        raise core.AeError("--t needs at least one time")
    return t


def _json_args(s):
    if not s:
        return {}
    try:
        v = json.loads(s)
    except ValueError as e:
        raise core.AeError(f"--args is not valid JSON: {e}")
    if not isinstance(v, dict):
        raise core.AeError("--args must be a JSON object, e.g. '{\"comp\": \"01\"}'")
    return v


def _common_live(p):
    p.add_argument("--ae", help="AE app name when several versions run, e.g. 'Adobe After Effects 2025'")
    p.add_argument("--timeout", type=int, default=120, help="seconds to wait for AE (default 120)")
    p.add_argument("--force", action="store_true", help="run even if a CucoStudio render is building / a job is pending")


def _common_offline(p):
    p.add_argument("--file", help="read this dump instead of the latest extraction")


# ------------------------------------------------------------------ live commands
def cmd_status(a):
    running = core.running_ae()
    b = core.build_status()
    lines = [f"AE running: {', '.join(running) if running else 'NO'}"]
    if b["last"] is not None:
        lines.append(f"CucoStudio build log: {'ACTIVE BUILD' if b['active'] else 'idle'} (last write {b['age']}s ago: {b['last'][:70]!r})")
    r = None
    if running:
        try:
            res = core.run_job(core.JSX_DIR / "status.jsx", timeout=a.timeout, ae=a.ae, force=a.force)
            r = res.result
            res.cleanup()
            lines.append(f"AE version: {r.get('aeVersion')}")
            lines.append(f"project: {r.get('project') or 'UNTITLED'}{'  (UNSAVED CHANGES)' if r.get('dirty') else ''}")
            lines.append(f"items: {r['numItems']}  comps: {r['comps']}  layers: {r['layers']}  active: {r.get('activeItem')}")
            lines.append(f"root: {', '.join(r.get('root', [])[:12])}")
            lines.append(f"CucoStudio extension loaded: {r.get('cucoExtension')}   render queue busy: {r.get('rendering')}")
        except core.AeError as e:
            lines.append(f"(project not queried: {e})")
    latest = core.DUMPS / "latest.json"
    if latest.exists():
        try:
            info = json.loads(latest.read_text())
            if not isinstance(info, dict):
                raise ValueError("not an object")
            age = int(time.time() - info.get("extracted_at", 0))
            stale = ""
            if r is not None:
                if (info.get("path") or None) != (r.get("project") or None):
                    stale = "  <- a DIFFERENT project than the one open now: run `aectx extract`"
                elif (r.get("dirty") and not info.get("dirty")) or (info.get("items") is not None and info.get("items") != r.get("numItems")):
                    stale = "  <- project changed since: run `aectx extract`"
            lines.append(f"latest dump: {core.display_name(info.get('path'))}, {age // 60}m old{stale}")
        except (OSError, ValueError):
            lines.append("latest dump: unreadable pointer — run `aectx extract`")
    print("\n".join(lines))
    return EXIT_OK


def cmd_extract(a):
    args = {"at": a.at, "post": a.post}
    if a.comps:
        args["comps"] = a.comps
    res = core.run_job(core.JSX_DIR / "extract.jsx", args=args, timeout=a.timeout, ae=a.ae, force=a.force)
    dst, data = core.store_dump(res)
    m = data["meta"]
    s = m.get("stats", {})
    size = dst.stat().st_size
    print(f"extracted {m.get('name')} at t={m.get('at')}{' (+post values)' if m.get('post') else ''}: "
          f"{s.get('items')} items, {s.get('layers')} layers, {s.get('props')} props, {s.get('exprs')} expressions "
          f"({s.get('exprErrors')} with errors), {s.get('ms')} ms")
    print(f"dump: {dst} ({size / 1e6:.1f} MB, ~{int(size / 3.6):,} tokens — do NOT read it whole; use the views)")
    if m.get("dirty"):
        print("note: the project has UNSAVED changes — the dump reflects AE's memory, not the .aep on disk")
    if m.get("errors"):
        print(f"WARNING: {len(m['errors'])} items/layers failed to extract: {m['errors'][:3]}")
    for w in (res.status.get("warnings") or [])[:5]:
        print(f"warning: {w}")
    m_errs = (m.get("stats") or {}).get("propErrors")
    if m_errs:
        print(f"note: {m_errs} properties could not be read (recorded with an 'error' field)")
    print("next: aectx overview | aectx tree --comp NAME | aectx exprs --errors | aectx validate")
    return EXIT_OK


def _print_job(res):
    parts = []
    out = res.out.rstrip()
    if out:
        parts.append(out)
    r = res.result
    if r is not None:
        parts.append(json.dumps(r, indent=1, ensure_ascii=False))
    if parts:
        core.emit("\n".join(parts), "run")
    for w in (res.status.get("warnings") or []):
        print(f"warning: {w}", file=sys.stderr)
    res.cleanup()


def _lint_or_die(src, label, no_lint):
    issues = core.es3_lint(src)
    for ln, sev, msg in issues:
        print(f"{label}:{ln}: {sev}: {msg}", file=sys.stderr)
    if not no_lint and any(sev == "error" for _, sev, _ in issues):
        print("aborted: fix the ES3 errors above (or pass --no-lint)", file=sys.stderr)
        return False
    return True


def _read_script(path):
    try:
        return Path(path).read_text(encoding="utf-8")
    except OSError as e:
        raise core.AeError(f"cannot read {path}: {e}")


def cmd_run(a):
    src = _read_script(a.script)
    if not _lint_or_die(src, a.script, a.no_lint):
        return EXIT_ERROR
    args = _json_args(a.args)
    core.HOME.mkdir(parents=True, exist_ok=True)
    wrapped = Path(tempfile.mkstemp(prefix="run_", suffix=".jsx", dir=core.HOME)[1])
    wrapped.write_text(core.wrap_script(src), encoding="utf-8")
    try:
        res = core.run_job(wrapped, args=args, timeout=a.timeout, ae=a.ae, force=a.force, label=Path(a.script).name)
    finally:
        wrapped.unlink(missing_ok=True)
    _print_job(res)
    return EXIT_OK


def cmd_q(a):
    code = a.code if a.code != "-" else sys.stdin.read()
    if not _lint_or_die(code, "snippet", a.no_lint):
        return EXIT_ERROR
    args = _json_args(a.args)
    res = core.run_snippet(code, args=args, timeout=a.timeout, ae=a.ae, force=a.force)
    _print_job(res)
    return EXIT_OK


def cmd_eval(a):
    args = {"comp": a.comp, "layers": a.layers, "prop": a.prop, "times": _times(a.t), "pre": a.pre}
    res = core.run_job(core.JSX_DIR / "eval.jsx", args=args, timeout=a.timeout, ae=a.ae, force=a.force)
    r = res.result
    res.cleanup()
    if a.json:
        core.emit(json.dumps(r, indent=1), "eval")
        return EXIT_OK
    lines = [f"{r['comp']} :: {r['prop']}  ({'pre' if r['pre'] else 'post'}-expression)  t = {', '.join(str(t) for t in r['times'])}"]
    for row in r["rows"]:
        flag = ""
        if row.get("exprErr"):
            flag = f"  EXPR ERROR: {row['exprErr'].splitlines()[0][:90]}"
        elif row.get("exprOff"):
            flag = "  (expression disabled)"
        vals = " | ".join(json.dumps(v, separators=(",", ":")) for v in row["values"])
        lines.append(f"[{row['index']}] {row['layer']}: {vals}{flag}")
    core.emit("\n".join(lines), "eval")
    return EXIT_OK


def _png_complete(p):
    try:
        with open(p, "rb") as f:
            f.seek(-12, 2)
            return b"IEND" in f.read()
    except OSError:
        return False


def cmd_frames(a):
    times = _times(a.t)
    if a.out:
        out = Path(a.out).expanduser()
        out.mkdir(parents=True, exist_ok=True)
    else:
        core.OUTS.mkdir(parents=True, exist_ok=True)
        out = Path(tempfile.mkdtemp(prefix="frames-", dir=core.OUTS))
    res = core.run_job(core.JSX_DIR / "frames.jsx", args={"comp": a.comp, "times": times, "outdir": str(out)},
                       timeout=a.timeout, ae=a.ae, force=a.force)
    r = res.result
    res.cleanup()
    files = r["files"]
    deadline = time.time() + a.wait
    pending = list(files)
    while pending and time.time() < deadline:
        pending = [f for f in pending if not _png_complete(f)]
        if pending:
            time.sleep(1.0)
    if pending:
        print(f"WARNING: {len(pending)} frame(s) still incomplete after {a.wait}s (heavy comps take minutes): {pending[:3]}")
    for f in files:
        if f not in pending:
            print(f)
    done = [f for f in files if f not in pending]
    if a.sheet and not shutil.which("ffmpeg"):
        print("note: --sheet needs ffmpeg on PATH; skipped")
    elif a.sheet and len(done) >= 2:
        sheet = out / "sheet.png"
        cols = min(6, len(done))
        ins, fc, labels = [], "", ""
        for i, f in enumerate(done):
            ins += ["-i", f]
            fc += f"[{i}:v]scale=-2:{a.sheet_height}[s{i}];"
            labels += f"[s{i}]"
        def _off(n, unit):
            return "+".join([unit] * n) or "0"
        layout = "|".join(f"{_off(k % cols, 'w0')}_{_off(k // cols, 'h0')}" for k in range(len(done)))
        cmd = ["ffmpeg", "-y", "-loglevel", "error", *ins, "-filter_complex",
               f"{fc}{labels}xstack=inputs={len(done)}:layout={layout}:fill=black", "-frames:v", "1", str(sheet)]
        rc = subprocess.run(cmd).returncode
        if rc == 0:
            print(f"sheet: {sheet}")
        else:
            print(f"note: contact sheet failed (ffmpeg rc={rc})")
    return EXIT_OK if not pending else EXIT_FINDINGS


def cmd_repair(a):
    res = core.run_job(core.JSX_DIR / "repair.jsx", args={"comps": a.comps, "apply": a.yes},
                       timeout=a.timeout, ae=a.ae, force=a.force)
    r = res.result
    res.cleanup()
    lines = [f"{r['count']} disabled/erroring expression(s){' — re-assigned' if r['applied'] else ' (dry run; pass --yes to re-assign)'}"]
    for it in r["items"][:200]:
        after = f" -> {it['after'].splitlines()[0][:80]}" if "after" in it else ""
        lines.append(f"  {it['comp']} / [{it['index']}] {it['layer']} / {it['path']}: {it['before'].splitlines()[0][:80]}{after}")
    if r["applied"] and r["count"]:
        lines.append("Project now has unsaved changes (one undo step). aectx never saves — save in AE if you want to keep them.")
    core.emit("\n".join(lines), "repair")
    still = [i for i in r["items"] if i.get("after", "x") != "ok"]
    return EXIT_FINDINGS if still else EXIT_OK


# ------------------------------------------------------------------ offline commands
def _offline(fn_name, module):
    def run(a):
        data, info, note = core.load_dump(a.file)
        if not isinstance(data, dict) or data.get("schema") != "aectx/2":
            raise core.AeError(f"unsupported dump schema {data.get('schema')!r} (expected aectx/2) — re-run `aectx extract`")
        mod = __import__(f"aectx.{module}", fromlist=[fn_name])
        text, code = getattr(mod, fn_name)(data, a)
        core.emit(core.header(info, note) + "\n" + text, fn_name)
        return code
    return run


def cmd_lint(a):
    src = _read_script(a.script)
    issues = core.es3_lint(src)
    for ln, sev, msg in issues:
        print(f"{a.script}:{ln}: {sev}: {msg}")
    if not issues:
        print("no ES3 issues found")
    return EXIT_ERROR if any(s == "error" for _, s, _ in issues) else EXIT_OK


def build_parser():
    p = argparse.ArgumentParser(prog="aectx", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("status", help="what is running/open, unsaved changes, build activity, latest dump")
    _common_live(s); s.set_defaults(fn=cmd_status)

    s = sub.add_parser("extract", help="dump the open project to the cache (schema aectx/2)")
    s.add_argument("--at", type=float, default=0.0, help="time (s) at which values are read (default 0; deterministic)")
    s.add_argument("--post", action="store_true", help="also record post-expression values (slower)")
    s.add_argument("--comps", help="JS regex: only walk layers of matching comps (others listed, layers skipped)")
    _common_live(s); s.set_defaults(fn=cmd_extract)

    s = sub.add_parser("run", help="run a .jsx with AECTX preloaded (ES3-linted); AECTX.out()/AECTX.result() print")
    s.add_argument("script"); s.add_argument("--args", help="JSON object exposed as AECTX.args")
    s.add_argument("--no-lint", action="store_true"); _common_live(s); s.set_defaults(fn=cmd_run)

    s = sub.add_parser("q", help="run an inline ES3 snippet; `return x` prints x. '-' reads stdin")
    s.add_argument("code"); s.add_argument("--args", help="JSON object exposed as AECTX.args")
    s.add_argument("--no-lint", action="store_true"); _common_live(s); s.set_defaults(fn=cmd_q)

    s = sub.add_parser("eval", help="value of one property at times t across layers")
    s.add_argument("--comp", required=True); s.add_argument("--layers", help="JS regex on layer names (default all)")
    s.add_argument("--prop", required=True, help="path by names or matchNames, e.g. 'Transform/Position', 'Masks/1/Mask Path', 'Effects/Fill/Color'")
    s.add_argument("--t", required=True, help="comma-separated seconds, e.g. 0,0.5,2")
    s.add_argument("--pre", action="store_true", help="pre-expression values (default post)")
    s.add_argument("--json", action="store_true"); _common_live(s); s.set_defaults(fn=cmd_eval)

    s = sub.add_parser("frames", help="render PNG frames at times (waits until files are complete) + contact sheet")
    s.add_argument("--comp", required=True); s.add_argument("--t", required=True, help="comma-separated seconds")
    s.add_argument("--out", help="output dir (default a fresh dir under ~/.cache/aectx/out)")
    s.add_argument("--sheet", action="store_true", help="build sheet.png (needs ffmpeg)")
    s.add_argument("--sheet-height", type=int, default=480)
    s.add_argument("--wait", type=int, default=600, help="seconds to wait for PNGs to finish writing (default 600)")
    _common_live(s); s.set_defaults(fn=cmd_frames)

    s = sub.add_parser("repair-expressions", help="list disabled/erroring expressions; --yes re-assigns them (never saves)")
    s.add_argument("--comps", help="JS regex on comp names"); s.add_argument("--yes", action="store_true")
    _common_live(s); s.set_defaults(fn=cmd_repair)

    s = sub.add_parser("overview", help="one-screen project summary (palette, trinity, shots, fonts, health)")
    _common_offline(s); s.set_defaults(fn=_offline("overview", "views"))

    s = sub.add_parser("tree", help="layer tree per comp (identical layer runs collapsed)")
    s.add_argument("--comp", help="regex on comp names (Python regex)"); s.add_argument("--all", action="store_true", help="include PRECOMPS/asset comps")
    s.add_argument("--full", action="store_true", help="print every comp in full (no 'same as X except' deltas)")
    _common_offline(s); s.set_defaults(fn=_offline("tree", "views"))

    s = sub.add_parser("exprs", help="expression index (clustered), errors, references, one cluster in full")
    g = s.add_mutually_exclusive_group()
    g.add_argument("--index", action="store_true", help="clusters with counts and locations (default)")
    g.add_argument("--errors", action="store_true", help="every disabled/erroring expression")
    g.add_argument("--refs", metavar="NAME", help="expressions referencing a layer/effect/comp name, e.g. mainControl, FORM")
    g.add_argument("--show", metavar="ID", help="one cluster in full with its per-location slot values")
    s.add_argument("--comp", help="regex on comp names")
    _common_offline(s); s.set_defaults(fn=_offline("exprs", "exprs"))

    s = sub.add_parser("wiring", help="which shots actually use FORM/FLOW/PRESSURE, palette 1/2/3, enter/exit")
    s.add_argument("--control", help="FORM|FLOW|PRESSURE|1|2|3|enter|exit: list the properties using it")
    s.add_argument("--comp", help="regex on shot/comp names (Python regex)")
    _common_offline(s); s.set_defaults(fn=_offline("wiring", "wiring"))

    s = sub.add_parser("phrases", help="phrase timeline per section (arrangements) / textBlock samples (templates)")
    s.add_argument("--comp", help="regex on shot/section names (Python regex)")
    _common_offline(s); s.set_defaults(fn=_offline("phrases", "phrases"))

    s = sub.add_parser("validate", help="CucoStudio style contract check (exit 1 on BLOCK findings)")
    _common_offline(s); s.set_defaults(fn=_offline("validate", "validate"))

    s = sub.add_parser("lint", help="ES3 lint a .jsx without running it")
    s.add_argument("script"); s.set_defaults(fn=cmd_lint)
    return p


def main(argv=None):
    a = build_parser().parse_args(argv)
    try:
        return a.fn(a)
    except core.Busy as e:
        print(f"aectx: busy: {e}", file=sys.stderr)
        return EXIT_BUSY
    except core.AeError as e:
        print(f"aectx: {e}", file=sys.stderr)
        return EXIT_ERROR
    except KeyboardInterrupt:
        return 130
