#!/usr/bin/env python3
"""Find a CucoStudio project by name (or recency) and optionally print its script.

Videos live in the app, not on disk. This wraps `cuco --json project list` +
`cuco --json storyboard get` so "my new cuco video called X" is one call.

  find_project.py                         # 10 most recently edited projects
  find_project.py "motion designers"      # projects whose name matches, newest first
  find_project.py "motion designers" --script   # best match's sections, numbered
  find_project.py 116 --script            # by id
  find_project.py --latest --script       # the most recently edited project
"""
import argparse
import json
import subprocess
import sys


def cuco(*args):
    out = subprocess.run(["cuco", "--json", *args], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"cuco {' '.join(args)} failed:\n{out.stderr or out.stdout}")
    payload = json.loads(out.stdout)
    return payload.get("data", payload)


def matches(name, query):
    name = name.lower()
    return all(word in name for word in query.lower().split())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("query", nargs="?", help="project id, or words that must all appear in the name")
    ap.add_argument("--latest", action="store_true", help="pick the most recently edited project")
    ap.add_argument("--script", action="store_true", help="print the best match's section texts, numbered")
    ap.add_argument("--limit", type=int, default=10)
    args = ap.parse_args()

    projects = sorted(cuco("project", "list"), key=lambda p: p.get("updated_at") or "", reverse=True)
    if args.query and args.query.isdigit():
        projects = [p for p in projects if p["id"] == int(args.query)]
    elif args.query:
        projects = [p for p in projects if matches(p.get("name", ""), args.query)]
    if args.latest:
        projects = projects[:1]
    if not projects:
        sys.exit(f"no project matches {args.query!r}; run without a query to see recent projects")

    for p in projects[: args.limit]:
        print(f"{p['id']:>5}  {(p.get('updated_at') or '')[:16]}  {p.get('name')}")

    if args.script:
        best = projects[0]
        if len(projects) > 1:
            print(f"\n({len(projects)} matches; showing the most recently edited)", file=sys.stderr)
        sections = cuco("storyboard", "get", str(best["id"]))["sections"]
        print(f"\n# {best['name']} (project {best['id']}, {len(sections)} sections)\n")
        for i, s in enumerate(sections, 1):
            media = f"  [{len(s['media'])} media]" if s.get("media") else ""
            print(f"[{i}] {s.get('text', '')}{media}\n")


if __name__ == "__main__":
    main()
