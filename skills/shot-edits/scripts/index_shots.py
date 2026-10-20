#!/usr/bin/env python3
"""Catalog a shot archive from its enriched VLM description files.

Each shot has a `<name>_enriched.txt` (preferred) or `<name>.txt` holding JSON:
  {"scene": "...", "events": [{"start","end","description"}, ...], ...}

Usage:
  index_shots.py <enriched_dir>                 # one line per shot: code, dur, scene
  index_shots.py <dir> --full                   # full scene text
  index_shots.py <dir> --sort dur               # sort by duration (desc)
  index_shots.py <dir> --events C246 C290 ...   # dump full event beats for these codes
"""
import json, glob, os, sys, argparse


def load(path):
    try:
        return json.load(open(path))
    except Exception:
        return None


def dur_of(d):
    evs = d.get("events", []) if d else []
    return evs[-1]["end"] if evs else 0.0


def code_of(name):
    # trailing token after last underscore, e.g. A012_04020346_C246 -> C246
    return name.split("_")[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir", help="folder containing *_enriched.txt (or *.txt)")
    ap.add_argument("--full", action="store_true", help="print full scene text")
    ap.add_argument("--sort", choices=["name", "dur"], default="name")
    ap.add_argument("--events", nargs="*", default=None,
                    help="print full event lists for these shot codes")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.dir, "*_enriched.txt")))
    if not files:
        files = sorted(f for f in glob.glob(os.path.join(args.dir, "*.txt"))
                       if not f.endswith("_enriched.txt"))
    if not files:
        print("no description files found in", args.dir, file=sys.stderr)
        return 1

    rows = []
    for f in files:
        d = load(f)
        if d is None:
            continue
        base = os.path.basename(f).replace("_enriched.txt", "").replace(".txt", "")
        rows.append((code_of(base), base, dur_of(d), d))

    # --events mode: dump beats for the requested codes
    if args.events is not None:
        want = set(args.events)
        for code, base, dur, d in rows:
            if want and code not in want:
                continue
            print(f"== {code} ({dur:.1f}s)  {base}")
            print("   " + d.get("scene", "")[:300])
            for e in d.get("events", []):
                print(f"   [{e['start']}-{e['end']}] {e['description']}")
            print()
        return 0

    if args.sort == "dur":
        rows.sort(key=lambda r: -r[2])

    print(f"# {len(rows)} shots in {args.dir}\n")
    for code, base, dur, d in rows:
        scene = d.get("scene", "")
        text = scene if args.full else ". ".join(scene.split(". ")[:1])[:150]
        print(f"{code} {dur:5.1f}s  {text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
