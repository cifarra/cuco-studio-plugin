#!/usr/bin/env python3
"""Assemble + render micro edits in CucoStudio from a spec file.

Spec JSON:
{
  "source_dir": "/path/to/original/shots",     // where source movs live
  "style": "Pk-clean",                          // style name OR "style_id": 5
  "trim": true,                                  // honor per-shot in/dur (lossless for intra codecs)
  "open": true,                                  // open each rendered video (override with --no-open)
  "edits": [
    {"name": "PK — The Shot", "shots": [
        {"file": "A012_04020035_C078", "in": 0.0, "dur": 7.1},
        {"file": "A012_04020058_C100", "in": 0.0, "dur": 4.0}
    ]}
  ]
}

Notes:
- "file" may be a basename (extension resolved against source_dir) or an absolute path.
- Omit "in"/"dur" (or set "trim": false) to use the whole clip.
- A trailing empty section is ALWAYS appended (for styles that drop a logo on an empty last section).
- Per-shot "text" is supported but defaults to "" (this workflow keeps section text empty).

Run: assemble.py spec.json [--no-open] [--dry-run]
Env overrides: CUCO_BIN, CUCO_PROJECTS, FFMPEG_BIN
"""
import json, os, sys, glob, subprocess, hashlib, shutil, argparse

HOME = os.path.expanduser("~")
PROJECTS = os.environ.get("CUCO_PROJECTS",
    os.path.join(HOME, "Library/Application Support/CucoStudio/projects"))
FFMPEG = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
VIDEO_EXT = (".mov", ".mp4", ".m4v", ".mxf")
MIME = {".mov": "video/quicktime", ".mp4": "video/mp4", ".m4v": "video/mp4", ".mxf": "video/mxf"}


def find_cuco():
    """Prefer a `cuco` on PATH that can read the app config; else fall back to the cuco-cli venv."""
    env = os.environ.get("CUCO_BIN")
    if env:
        return env
    cand = shutil.which("cuco")
    if cand:
        r = subprocess.run([cand, "config"], capture_output=True, text=True)
        if "FAIL" not in r.stdout and "FAIL" not in r.stderr and r.returncode == 0:
            return cand
    # fall back: poetry virtualenvs/cuco-cli-*/bin/cuco
    for p in sorted(glob.glob(os.path.join(HOME, "Library/Caches/pypoetry/virtualenvs/cuco-cli-*/bin/cuco"))):
        if os.path.exists(p):
            return p
    return cand or "cuco"


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def first_id(text):
    for line in text.splitlines():
        if "id=" in line:
            try:
                return int(line.split("id=")[1].split()[0])
            except ValueError:
                pass
    return None


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def resolve_style(cuco, spec):
    if "style_id" in spec:
        return int(spec["style_id"])
    name = spec.get("style")
    if name is None:
        sys.exit("spec needs 'style' (name) or 'style_id'")
    r = run([cuco, "--json", "style", "list"])
    try:
        data = json.loads(r.stdout)["data"]
    except Exception:
        sys.exit("could not list styles: " + r.stdout + r.stderr)
    styles = data.get("local", []) + data.get("remote", []) if isinstance(data, dict) else data
    for s in styles:
        if s.get("name", "").lower() == name.lower():
            return int(s["id"])
    avail = ", ".join(f"{s['id']}:{s['name']}" for s in styles)
    sys.exit(f"style '{name}' not found. Available: {avail}")


def resolve_src(source_dir, ref):
    if os.path.isabs(ref) and os.path.exists(ref):
        return ref
    base = os.path.join(source_dir, ref)
    if os.path.exists(base):
        return base
    for ext in VIDEO_EXT:
        if os.path.exists(base + ext):
            return base + ext
    # last resort: glob by trailing code
    hits = [f for f in glob.glob(os.path.join(source_dir, "*" + ref + "*"))
            if not os.path.basename(f).startswith("._") and f.lower().endswith(VIDEO_EXT)]
    if hits:
        return hits[0]
    sys.exit(f"source not found for '{ref}' in {source_dir}")


def prepare_media(src, dst, ss, dur, trim, subclips_dir):
    """Place a render-ready file at dst (inside the project's attached_media).

    For trims, the canonical subclip lives in `subclips_dir` (a folder beside the
    originals). It is created once with a lossless stream-copy and REUSED on later
    runs; the project just gets a working copy. Whole clips copy straight from src.
    Returns (dst, reused) where `reused` is True if an existing subclip was reused.
    """
    if trim and ss is not None and dur is not None:
        canon = os.path.join(subclips_dir, os.path.basename(dst))
        reused = os.path.exists(canon)
        if not reused:
            run([FFMPEG, "-y", "-ss", str(ss), "-i", src, "-t", str(dur),
                 "-c", "copy", "-avoid_negative_ts", "make_zero", canon])
        subprocess.run(["cp", canon, dst], check=True)
        return dst, reused
    subprocess.run(["cp", src, dst], check=True)
    return dst, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    spec = json.load(open(args.spec))
    source_dir = spec["source_dir"]
    trim = spec.get("trim", True)
    # canonical home for shaved subclips, beside the originals (override with spec "subclips_dir")
    subclips_dir = spec.get("subclips_dir") or os.path.join(source_dir, "subclips")
    os.makedirs(subclips_dir, exist_ok=True)
    do_open = spec.get("open", True) and not args.no_open
    cuco = find_cuco()
    style_id = resolve_style(cuco, spec)
    print(f"cuco={cuco}\nstyle_id={style_id}  trim={trim}\nsubclips={subclips_dir}\n")

    if args.dry_run:
        for e in spec["edits"]:
            shots = " -> ".join(
                f"{s['file']}@{s.get('in','0')}+{s.get('dur','full')}" for s in e["shots"])
            print(f"[{e['name']}]  {shots}  -> logo")
        return 0

    results = []
    for e in spec["edits"]:
        name = e["name"]
        print(f"===== {name} =====", flush=True)
        r = run([cuco, "project", "create", "--name", name])
        pid = first_id(r.stdout + r.stderr)
        if pid is None:
            print("  FAIL create:", r.stdout, r.stderr); continue
        am = os.path.join(PROJECTS, str(pid), "attached_media")
        os.makedirs(am, exist_ok=True)
        sections = []
        for s in e["shots"]:
            src = resolve_src(source_dir, s["file"])
            ss, dur = s.get("in"), s.get("dur")
            stem = os.path.splitext(os.path.basename(src))[0]
            ext = os.path.splitext(src)[1].lower()
            tag = f"_t{str(ss).replace('.','')}_{str(dur).replace('.','')}" if (trim and ss is not None and dur is not None) else ""
            clip = stem + tag + ext
            dst = os.path.join(am, clip)
            _, reused = prepare_media(src, dst, ss, dur, trim, subclips_dir)
            sz = os.path.getsize(dst)
            where = "(full)" if not tag else (f"@{ss}+{dur}s" + (" [reused]" if reused else " [new subclip]"))
            print(f"  {stem} {where} -> {round(sz/1e6)}MB", flush=True)
            sections.append({
                "text": s.get("text", ""),
                "media": [{"filePath": f"projects/{pid}/attached_media/{clip}",
                           "fileHash": sha256(dst), "originalName": clip,
                           "fileSize": sz, "mimeType": MIME.get(ext, "video/quicktime")}],
                "clip_id": None, "origin": "video", "story_source": "text",
                "language": "en", "prompt": None, "mute": s.get("mute", False)})
        # trailing empty section -> logo on logo-aware styles
        sections.append({"text": "", "media": [], "clip_id": None, "origin": "empty",
                         "story_source": "text", "language": "en", "prompt": None, "mute": False})
        sbpath = os.path.join("/tmp", f"shotedits_sb_{pid}.json")
        json.dump({"sections": sections, "soundtrack_duration": 0}, open(sbpath, "w"))
        r = run([cuco, "storyboard", "update", str(pid), "--file", sbpath])
        if "ok" not in r.stdout:
            print("  storyboard FAIL:", r.stdout, r.stderr); continue
        r = run([cuco, "arrangement", "create", str(pid), "--patch-json",
                 json.dumps({"style_id": style_id})])
        aid = first_id(r.stdout + r.stderr)
        if aid is None:
            print("  arrangement FAIL:", r.stdout, r.stderr); continue
        print(f"  rendering p{pid}/a{aid}...", flush=True)
        r = run([cuco, "arrangement", "process", str(pid), str(aid), "--render",
                 f"--style-id={style_id}", "--wait"])
        vid = os.path.join(PROJECTS, str(pid), "arrangements", str(aid), "video.mp4")
        ok = os.path.exists(vid) and "COMPLETED" in r.stdout
        print(f"  {'COMPLETED' if ok else 'FAIL: ' + r.stdout + r.stderr}\n", flush=True)
        results.append((name, pid, aid, ok, vid))
        if ok and do_open:
            subprocess.run(["open", vid])

    print("========== SUMMARY ==========")
    for name, pid, aid, ok, vid in results:
        print(f"{'OK ' if ok else 'XX '} {name:32s} p{pid}/a{aid}")
    print(f"\n{sum(1 for r in results if r[3])}/{len(spec['edits'])} rendered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
