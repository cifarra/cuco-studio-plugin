"""aectx.validate - offline CucoStudio style-contract check over an aectx/2 dump.

    validate(data, args) -> (text, exit_code)

Output: first line says what the dump is; then one finding per line,
``LEVEL CODE message (cite) [where, where...]``, BLOCK first, then WARN, then INFO (check order within a
level). Identical findings at several places are merged into one line whose [where] lists them. Then one
``summary:`` line counting those lines. Exit code 1 if any BLOCK, else 0. Deterministic. Names are printed as
they are in the project, except control characters and line separators, which are escaped (``\\x0a``) so
that every finding stays on one line.

The checks mirror the real consumers (paths under desktop-app/):
  AfterEffectsExtension/jsx/style_builder.jsx  readStyleMetadata = GET_STYLE_DATA at style import
  AfterEffectsExtension/jsx/director.jsx       projectSetup / handleShot / handleText at render
  AfterEffectsExtension/jsx/utils.jsx          findCompbyName, requireComp/requireLayer,
                                               handleTransition, typeSetSection, deepDuplicateComp
  cuco-core/src/cuco_core/engine/core/crew/edit_utils.py   eligible_shots / capacity_ladder (caster)
plus the learned rules in skills/create-style/ae.md (cited by line; tests check the cites still match).

Palette lookup, as the code really does it: readStyleMetadata reads
controlLayer.property("Effects").property("1"|"2"|"3").property("Color") BY NAME
(style_builder.jsx:112-121), inside a try whose failure is only the info-level NO_COLOR_PALETTE,
so an import "succeeds" with no palette. The director also sets FORM/FLOW/PRESSURE and "1".."3"
by name (director.jsx:86-137) and throws when a trinity slider is absent. A missing or mistyped
contract effect is therefore a BLOCK (MAINCONTROL_EFFECTS). Order is only an INFO (MAINCONTROL_ORDER):
ae.md ("looked up by NAME") documents the by-NAME lookup (a real import of steel confirms "1" resolves by name -
by position it would hit the FORM slider); the canonical order is a readability convention.

Render graph: comps reachable from mainComp and the listed shots through layer sources. Expression
errors inside it BLOCK; outside it they only WARN - but only when the graph is provably complete. A
scoped dump (--comps) or any item/layer error stub hides layers, so then every comp counts as rendered.

A director ARRANGEMENT (a PROJECT_SHOTS folder holding comps, or PROJECT_SHOTS with no ORIGINAL_SHOTS)
is a render project, not a style: only extraction health, expression errors/disabled expressions,
fonts and footage are checked.
"""
import math
import re
from collections import Counter, OrderedDict

LEVELS = ("BLOCK", "WARN", "INFO")

MAIN_COMP = "mainComp"
MAIN_CONTROL = "mainControl"
SHOTS_FOLDER = "ORIGINAL_SHOTS"
ARRANGEMENT_FOLDER = "PROJECT_SHOTS"
TARGETS_FOLDER = "PROJECT_TARGETS"
IGNORED_SHOTS = ("POSTER", "BANNER", "SOCIAL")  # constants.jsx:144-148
TRINITY = ("FORM", "FLOW", "PRESSURE")
PALETTE = ("1", "2", "3")
CONTRACT_EFFECTS = TRINITY + PALETTE
SLIDER = "ADBE Slider Control"
COLOR = "ADBE Color Control"
TEXT_DOC = "ADBE Text Document"

# skills/create-style/ae.md is cited by a quoted PHRASE, not line numbers (the playbook keeps
# growing; line cites rotted the first time it was edited). tests/test_validate.py checks every
# _cite() key used here exists and that each phrase still appears in ae.md.
AE_MD = OrderedDict((
    ("palette", "looked up by NAME"),                  # palette looked up by name; order is convention
    ("point", "use POINT text"),                       # point text, box text unreliable from scripts
    ("controller", "2 keyframes"),                     # controller enter/exit, 2 keys each
    ("permanent", "PERMANENTLY"),                      # missing referent disables an expression for good
    ("shotsize", "same size as mainComp"),             # shots match mainComp
))


def _cite(key):
    return f'ae.md "{AE_MD[key]}"'

MAX_GROUPS = 8  # distinct expression-error messages listed before "+N more"
MAX_NAMES = 8   # names listed in one line before "+N more"
MAX_COUNTS = 6  # comp(count) pairs listed in one line before "+N comps"

_COMP_REF = re.compile(r"""\bcomp\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*\)""")
_COMP_DYN = re.compile(r"""\bcomp\(\s*(?!["'\s])""")
# everything str.splitlines() breaks on, plus the other C0/C1 controls
_CTRL = re.compile("[\x00-\x1f\x7f-\x9f  ]")
_SCALAR = (str, int, float, bool, type(None))
_MISSING = object()


# ================================================================== small helpers
def _h(x):
    """A hashable stand-in for an id/name/font: hand-edited dumps can hold lists or dicts there."""
    return x if isinstance(x, _SCALAR) else repr(x)


def _list(x):
    return x if isinstance(x, list) else []


def _clean(s):
    """Escape control characters / line separators so one finding stays one line."""
    return _CTRL.sub(lambda m: "\\x%02x" % ord(m.group()) if ord(m.group()) < 0x100 else "\\u%04x" % ord(m.group()), s)


def _short(s, n=90):
    """First line of s, whitespace collapsed, truncated to n chars."""
    lines = str(s if s is not None else "").strip().splitlines()
    first = " ".join(lines[0].split()) if lines else ""
    return first if len(first) <= n else first[: n - 3] + "..."


def _num(x):
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return "?"
    if x != x or x in (float("inf"), float("-inf")):
        return "?"
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _hex(v):
    """'#rrggbb' the way utils.jsx rgba2hex rounds (Math.round(c*255)); None if not a color."""
    if isinstance(v, str) and v.startswith("#"):
        return v.lower()
    if isinstance(v, (list, tuple)) and len(v) >= 3:
        out = []
        for c in v[:3]:
            if isinstance(c, bool) or not isinstance(c, (int, float)) or c != c or c in (float("inf"), float("-inf")):
                return None
            out.append("%02x" % max(0, min(255, int(math.floor(c * 255 + 0.5)))))
        return "#" + "".join(out)
    return None


def _some(names, n=MAX_NAMES):
    names = [str(x) for x in names]
    head = ", ".join(names[:n])
    return head + (f" +{len(names) - n} more" if len(names) > n else "")


def _counts(counter, n=MAX_COUNTS):
    pairs = list(counter.items())
    s = " ".join(f"{k}({v})" for k, v in pairs[:n])
    return s + (f" +{len(pairs) - n} comps" if len(pairs) > n else "")


def _norm(s):
    return re.sub(r"[\s_\-]+", "", str(s)).lower()


def _near(target, names):
    """Names that differ from target only by case/spaces/_/- (likely typos of a contract name)."""
    t = _norm(target)
    return sorted({str(n) for n in names if n is not None and n != target and _norm(n) == t})


def _layers(comp):
    ls = comp.get("layers") if isinstance(comp, dict) else None
    if not isinstance(ls, list):
        return []
    ls = [L for L in ls if isinstance(L, dict)]
    return sorted(ls, key=lambda L: L["index"] if isinstance(L.get("index"), (int, float))
                  and not isinstance(L.get("index"), bool) and L["index"] == L["index"] else float("inf"))


def _named(comp, name):
    """Layers called exactly `name`, top first (comp.layer(name) returns the first)."""
    return [L for L in _layers(comp) if L.get("name") == name]


def _effects(layer):
    fx = layer.get("effects")
    return [e for e in fx if isinstance(e, dict)] if isinstance(fx, list) else []


def _props(layer):
    ps = layer.get("props")
    return [p for p in ps if isinstance(p, dict)] if isinstance(ps, list) else []


def _effect_prop(layer, effect, leaf):
    want = f"Effects/{effect}/{leaf}"
    for p in _props(layer):
        if p.get("path") == want:
            return p
    return None


def _source_text(layer):
    for p in _props(layer):
        if str(p.get("mn") or "").endswith(TEXT_DOC) or str(p.get("path") or "").endswith("Source Text"):
            return p
    return None


def _doc(prop):
    """TextDocument dict of a Source Text record. Per SCHEMA.md's verified AE quirk, Source Text `v`
    with an enabled expression already IS the expression-transformed text (what GET_STYLE_DATA's
    .value reads); vPost, when recorded, is the same value and is preferred."""
    if prop is None:
        return None
    v = prop.get("vPost") if isinstance(prop.get("vPost"), dict) else prop.get("v")
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        return {"text": v}
    return None


def _framed(frame):
    """edit_utils.py has_valid_frame: a 2-element frame with truthy dimensions."""
    return bool(frame and len(frame) == 2 and frame[0] and frame[1])


def _lname(layer):
    return f"[{layer.get('index')}] {layer.get('name')}"


def _is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and x == x


# ================================================================== report
class _Report:
    def __init__(self):
        self.rows = []
        self.unverified = OrderedDict()
        self.incomplete = False
        self.maybe_shots = []  # names of unextracted items that may be shots (the hand is partial)

    def add(self, level, code, msg, where=None, cite=None):
        self.rows.append((level, code, msg, cite, where))

    def skip(self, name, why):
        self.unverified.setdefault(str(name), why)

    def groups(self):
        """(level, code, msg, cite) -> [where...], first-seen order: identical findings merge."""
        g = OrderedDict()
        for level, code, msg, cite, where in self.rows:
            g.setdefault((level, code, msg, cite), []).append(where)
        return g

    def count(self, level):
        return sum(1 for k in self.groups() if k[0] == level)

    def lines(self):
        out, groups = [], self.groups()
        for lvl in LEVELS:
            for (level, code, msg, cite), wheres in groups.items():
                if level != lvl:
                    continue
                s = f"{level} {code} {msg}"
                if cite:
                    s += f" ({cite})"
                ws = list(OrderedDict.fromkeys(str(w) for w in wheres if w))
                if ws:
                    s += f" [{_some(ws)}]"
                out.append(s)
        return out


# ================================================================== project model
class _Project:
    def __init__(self, data):
        raw = data.get("items")
        self.items = [it for it in raw if isinstance(it, dict)] if isinstance(raw, list) else []
        self.by_id = {}
        for it in self.items:
            if it.get("id") is not None:
                self.by_id.setdefault(_h(it["id"]), it)
        self.comps = [it for it in self.items if it.get("type") == "comp" and "error" not in it]
        self.folders = [it for it in self.items if it.get("type") == "folder" and "error" not in it]
        self.comps_by_name = OrderedDict()
        for c in self.comps:
            self.comps_by_name.setdefault(_h(c.get("name")), []).append(c)
        self.stubs = [it for it in self.items if "error" in it]
        self.stub_names = {_h(it.get("name")) for it in self.stubs}
        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        self.at = meta.get("at") if _is_num(meta.get("at")) else 0

    def folder(self, name):
        return [f for f in self.folders if f.get("name") == name]

    def children(self, folder):
        fid = folder.get("id")
        return [it for it in self.items if it is not folder and fid is not None and it.get("folder") == fid]

    def path(self, it):
        names, seen = [], set()
        f = _h(it.get("folder"))
        while f is not None and f in self.by_id and f not in seen:
            seen.add(f)
            names.append(str(self.by_id[f].get("name")))
            f = _h(self.by_id[f].get("folder"))
        return "/".join(list(reversed(names)) + [str(it.get("name"))])

    def source(self, layer):
        src = layer.get("source")
        if isinstance(src, dict):
            return self.by_id.get(_h(src.get("id")))
        return None

    def reach(self, roots):
        """Comps reachable from roots through layer sources (the render graph), keyed by id."""
        seen = OrderedDict()
        stack = [c for c in reversed(roots) if isinstance(c, dict)]
        while stack:
            c = stack.pop()
            if _h(c.get("id")) in seen:
                continue
            seen[_h(c.get("id"))] = c
            for L in reversed(_layers(c)):
                s = self.source(L)
                if s is not None and s.get("type") == "comp" and "error" not in s and _h(s.get("id")) not in seen:
                    stack.append(s)
        return seen

    def everything(self):
        return OrderedDict((_h(c.get("id")), c) for c in self.comps)

    def footage_ids(self):
        """Ids used as the source of a footage/solid layer: such an item is not a comp."""
        out = set()
        for c in self.comps:
            for L in _layers(c):
                src = L.get("source")
                if isinstance(src, dict) and L.get("type") in ("footage", "solid"):
                    out.add(_h(src.get("id")))
        return out

    def graph_complete(self):
        """False when some layers are unknown (scoped dump, layer error stubs, item stubs that may be comps):
        then reachability cannot prove a comp unused, and every comp must be treated as rendered."""
        if any(c.get("skipped") for c in self.comps):
            return False
        if any("error" in L for c in self.comps for L in _layers(c)):
            return False
        foot = self.footage_ids()
        return not any(it.get("type") in (None, "comp") and _h(it.get("id")) not in foot for it in self.stubs)


# ================================================================== shared checks
def _check_extraction(proj, meta, rep):
    bad = []
    for it in proj.stubs:
        bad.append(f'item "{it.get("name")}": {_short(it.get("error"), 60)}')
    for c in proj.comps:
        for L in _layers(c):
            if "error" in L:
                bad.append(f"{c.get('name')}/{_lname(L)}: {_short(L.get('error'), 60)}")
    if not bad:
        for e in _list(meta.get("errors")):
            if isinstance(e, dict):
                at = e.get("item") or f"{e.get('comp')}/[{e.get('index')}] {e.get('layer')}"
                bad.append(f"{at}: {_short(e.get('error'), 60)}")
    if bad:
        rep.incomplete = True
        rest = f"; +{len(bad) - 4} more" if len(bad) > 4 else ""
        rep.add("WARN", "EXTRACT_ERROR",
                f"{len(bad)} item(s)/layer(s) failed to extract, checks touching them are incomplete: "
                + "; ".join(bad[:4]) + rest)
    skipped = [c.get("name") for c in proj.comps if c.get("skipped")]
    if skipped:
        rep.incomplete = True
        rep.add("WARN", "SCOPED_DUMP",
                f"extraction was scoped (--comps {meta.get('comps')!r}): {len(skipped)} comp(s) have no layers "
                f"recorded ({_some(skipped)}); checks on them are skipped and every expression error counts as "
                f"rendered - re-run aectx extract without --comps")


def _check_exprs(proj, rep, graph, outside_label):
    """BLOCK every erroring / disabled expression inside the render graph; WARN those outside it."""
    groups = OrderedDict()  # first line of xErr -> [count, Counter(comp), example]
    disabled, dis_ex = Counter(), None
    outside = Counter()
    for c in proj.comps:
        inside = _h(c.get("id")) in graph
        cname = _h(c.get("name"))
        for L in _layers(c):
            if "error" in L:
                continue
            for p in _props(L):
                if "x" not in p:
                    continue
                err, off = p.get("xErr"), p.get("xOn") is False
                if not err and not off:
                    continue
                if not inside:
                    outside[cname] += 1
                    continue
                where = f"{c.get('name')}/{_lname(L)}/{p.get('path')}"
                if err:
                    g = groups.setdefault(_short(err), [0, Counter(), where])
                    g[0] += 1
                    g[1][cname] += 1
                else:
                    disabled[cname] += 1
                    dis_ex = dis_ex or where
    items = list(groups.items())
    for msg, (n, comps, ex) in items[:MAX_GROUPS]:
        rep.add("BLOCK", "EXPR_ERROR", f'{n} expression(s) fail with "{msg}" in {_counts(comps)}',
                where=f"e.g. {ex}")
    if len(items) > MAX_GROUPS:
        rest = items[MAX_GROUPS:]
        rep.add("BLOCK", "EXPR_ERROR", f"+{len(rest)} more distinct error(s) in "
                f"{sum(g[0] for _, g in rest)} expression(s) - see aectx exprs --errors")
    if disabled:
        rep.add("BLOCK", "EXPR_DISABLED",
                f"{sum(disabled.values())} disabled expression(s) in {_counts(disabled)}: AE disables an "
                f"expression whose referent was missing and never re-enables it, so the property is dead "
                f"while frames still look fine - re-assign (aectx repair-expressions)",
                where=f"e.g. {dis_ex}", cite=_cite("permanent"))
    if outside:
        rep.add("WARN", "EXPR_ERROR_UNUSED",
                f"{sum(outside.values())} erroring/disabled expression(s) in comps {outside_label}: {_counts(outside)}")


def _render_graph(proj, roots):
    """(graph, label for errors outside it). An incomplete dump gets every comp: nothing is provably unused."""
    if not proj.graph_complete():
        return proj.everything(), "(none)"
    return proj.reach(roots), None


def _check_fonts(data, meta, rep):
    fonts = data.get("fonts")
    unavailable = any("usedFonts" in str(w) for w in _list(meta.get("warnings")))
    if not isinstance(fonts, list) or (not fonts and unavailable):
        rep.add("INFO", "FONTS_UNKNOWN", "the dump has no usedFonts list: font substitution was not verified")
        return
    subs = [f for f in fonts if isinstance(f, dict) and f.get("substitute")]
    if subs:
        names = [f"{f.get('postScriptName') or f.get('family')} ({f.get('uses')} uses)" for f in subs]
        rep.add("WARN", "MISSING_FONTS",
                f"substituted font(s) (not installed): {_some(names)}; frames render with a substitute and "
                f"GET_STYLE_DATA flags MISSING_FONTS", cite="style_builder.jsx:155-168")


def _check_footage(proj, rep):
    miss = [it for it in proj.items if it.get("type") == "footage" and it.get("missing")]
    if miss:
        eg = next((it.get("file") for it in miss if it.get("file")), None)
        rep.add("WARN", "MISSING_FOOTAGE",
                f"{len(miss)} footage item(s) missing on disk: {_some([it.get('name') for it in miss])}"
                + (f"; e.g. {eg}" if eg else ""), cite="style_builder.jsx:140-153")
    ph = [it for it in proj.items if it.get("type") == "placeholder"]
    if ph:
        rep.add("WARN", "MISSING_FOOTAGE",
                f"{len(ph)} placeholder item(s) with no source file (render as color bars): "
                f"{_some([it.get('name') for it in ph])}", cite="style_builder.jsx:140-153")


# ================================================================== style template checks
def _check_main_control(proj, main, rep):
    ctrls = _named(main, MAIN_CONTROL)
    if not ctrls:
        names = [L.get("name") for L in _layers(main)]
        msg = 'mainComp has no layer named exactly "mainControl": GET_STYLE_DATA throws "mainControl layer not found"'
        if "$" in names:
            msg += '; a "$" layer exists - the director falls back to it (director.jsx:60-62) but the import does not'
        near = _near(MAIN_CONTROL, names)
        if near:
            msg += f"; near-miss: {_some(near)}"
        rep.add("BLOCK", "NO_MAIN_CONTROL", msg, where=MAIN_COMP, cite="style_builder.jsx:42-45")
        return
    ctl = ctrls[0]
    if len(ctrls) > 1:
        rep.add("WARN", "DUPLICATE_MAIN_CONTROL",
                f'{len(ctrls)} layers named "mainControl": comp.layer(name) and every expression bind the top one '
                f"{_lname(ctl)}", where=MAIN_COMP)
    if "error" in ctl:
        rep.skip("mainControl", "layer failed to extract")
        return
    fx = _effects(ctl)
    names = [e.get("name") for e in fx]
    problems, dups = [], []
    for n in CONTRACT_EFFECTS:
        want = SLIDER if n in TRINITY else COLOR
        hits = [e for e in fx if e.get("name") == n]
        if not hits:
            problems.append(f'"{n}" missing')
        elif hits[0].get("mn") != want:
            problems.append(f'"{n}" is {hits[0].get("mn")} (needs {want})')
        if len(hits) > 1:
            dups.append(n)
    where = f"{MAIN_COMP}/{MAIN_CONTROL}"
    if problems:
        rep.add("BLOCK", "MAINCONTROL_EFFECTS",
                "mainControl effects: " + ", ".join(problems) + ". The director sets FORM/FLOW/PRESSURE by name and "
                "throws without them; GET_STYLE_DATA reads the palette by name \"1\"/\"2\"/\"3\" and on failure only "
                "logs info-level NO_COLOR_PALETTE, so the style imports with no palette",
                where=where, cite="director.jsx:86-137, style_builder.jsx:110-129")
    elif [str(n) for n in names[:6]] != list(CONTRACT_EFFECTS):
        rep.add("INFO", "MAINCONTROL_ORDER",
                f"mainControl effects are [{', '.join(str(n) for n in names[:6])}], canonical is FORM, FLOW, PRESSURE "
                "(sliders) then 1, 2, 3 (colors). Import and render look them up by name, so this works; the "
                "canonical order is only a convention",
                where=where, cite="style_builder.jsx:112-121, director.jsx:86-137, " + _cite("palette"))
    if dups:
        rep.add("WARN", "MAINCONTROL_DUP_EFFECT",
                f"several mainControl effects named {_some(dups)}: by-name lookups and expressions bind the first",
                where=where)
    vals = []
    for n in PALETTE:
        p = _effect_prop(ctl, n, "Color")
        vals.append(f"{n}={(_hex(p.get('v')) or '?') if p else ('default' if n in names else 'missing')}")
    for n in TRINITY:
        p = _effect_prop(ctl, n, "Slider")
        vals.append(f"{n}={_num(p.get('v')) if p else ('default' if n in names else 'missing')}")
    extra = [str(n) for n in names if n not in CONTRACT_EFFECTS]
    rep.add("INFO", "PALETTE",
            " ".join(vals[:3]) + "; " + " ".join(vals[3:]) + " (template values; the director overwrites them per video)"
            + (f"; other effects: {_some(extra)}" if extra else ""), where=where)


def _loose_stubs(proj):
    """Item stubs that may be shots. extract.jsx writes a failed item as {id, name, error} - no folder,
    no type - so a failed shot is not seen as an ORIGINAL_SHOTS child. Leave out names that cannot be
    shots: mainComp, the folder itself, -text/-frame slot comps, and items used as footage/solid layers."""
    used_as_footage = proj.footage_ids()
    out = []
    for it in proj.stubs:
        nm = str(it.get("name"))
        if "folder" in it or nm in (MAIN_COMP, SHOTS_FOLDER) or nm.endswith(("-text", "-frame")):
            continue
        if _h(it.get("id")) in used_as_footage:
            continue
        out.append(it)
    return out


def _shots_folder(proj, rep):
    folders = proj.folder(SHOTS_FOLDER)
    if not folders:
        stub = [it for it in proj.stubs if it.get("name") == SHOTS_FOLDER]
        if not stub:
            near = _near(SHOTS_FOLDER, [f.get("name") for f in proj.folders])
            rep.add("BLOCK", "NO_SHOTS_FOLDER",
                    'no folder named "ORIGINAL_SHOTS": GET_STYLE_DATA raises MISSING_SHOTS_FOLDER and lists no shots'
                    + (f"; near-miss: {_some(near)}" if near else ""), cite="style_builder.jsx:40, 103-107")
            return []
        rep.skip(SHOTS_FOLDER, "item failed to extract; its children are still read")
        folders = stub
    if len(folders) > 1:
        rep.add("WARN", "DUPLICATE_FOLDER",
                f'{len(folders)} folders named "ORIGINAL_SHOTS" ({_some([proj.path(f) for f in folders], 4)}): '
                f"findFolderByName uses the first in project order, shots in the others are never listed",
                cite="utils.jsx:383-394")
    shots, invalid = [], []
    for it in proj.children(folders[0]):
        nm = it.get("name")
        if "error" in it:
            rep.skip(nm, "item failed to extract")
            rep.maybe_shots.append(str(nm))
        elif it.get("type") == "comp":
            shots.append(it)
        elif nm in IGNORED_SHOTS:
            continue  # style_builder.jsx:95 silences INVALID_SHOT_STRUCTURE for these names
        else:
            invalid.append(f"{nm} ({it.get('type')})")
    for it in _loose_stubs(proj):
        rep.skip(it.get("name"), "item failed to extract; may be a shot")
        rep.maybe_shots.append(str(it.get("name")))
    if invalid:
        rep.add("WARN", "INVALID_SHOT_STRUCTURE",
                f"ORIGINAL_SHOTS holds non-comp item(s): {_some(invalid)} - GET_STYLE_DATA flags each as \"not a CompItem\"; "
                "comps inside sub-folders are not shots", where=SHOTS_FOLDER, cite="style_builder.jsx:94-100")
    if not shots and not rep.maybe_shots:
        rep.add("BLOCK", "NO_SHOTS",
                "ORIGINAL_SHOTS has no shot comps: GET_STYLE_DATA returns an empty shot_list, nothing can be cast",
                where=SHOTS_FOLDER)
    return sorted(shots, key=lambda s: (str(s.get("name")), proj.path(s)))


def _check_duplicates(proj, rep, shots):
    seen = {MAIN_COMP}
    for s in shots:
        nm = _h(s.get("name"))
        if nm in seen:
            continue
        seen.add(nm)
        hits = proj.comps_by_name.get(nm, [])
        if len(hits) > 1:
            note = "" if hits[0] is s else f"; the first is {proj.path(hits[0])}, NOT the ORIGINAL_SHOTS shot"
            rep.add("BLOCK", "DUPLICATE_COMP",
                    f'{len(hits)} comps named "{nm}" ({_some([proj.path(c) for c in hits], 4)}): the director picks the '
                    f"shot with requireComp -> findCompbyName, which returns the first in project order{note}",
                    where=nm, cite="director.jsx:514-518, utils.jsx:396-407")
    other = [f"{n} x{len(v)}" for n, v in proj.comps_by_name.items() if len(v) > 1 and n not in seen]
    if other:
        rep.add("INFO", "DUPLICATE_NAMES",
                f"other comps sharing a name (harmless unless an expression calls comp() on them): {_some(other)}")


def _slot_sources(proj, rep, shot_name, layers, slot):
    ids = OrderedDict()
    for L in layers:
        src = L.get("source")
        if isinstance(src, dict):
            ids.setdefault(_h(src.get("id")), src.get("name"))
    if len(ids) > 1:
        rep.add("WARN", "SLOT_SOURCES_DIFFER",
                f'{len(layers)} "{slot}" layers source different comps ({_some(ids.values(), 4)}): the director '
                f"replaces all of them with a copy of the first layer's source", where=shot_name,
                cite="director.jsx:336-350, 578-638")


def _check_text_comp(proj, rep, rec, tc):
    if tc.get("skipped"):
        rep.skip(tc.get("name"), "skipped by --comps")
        rec["unknown_text"] = True
        return
    tcn = tc.get("name")
    tbs = _named(tc, "textBlock")
    if not tbs:
        near = _near("textBlock", [L.get("name") for L in _layers(tc)])
        rep.add("BLOCK", "MISSING_TEXTBLOCK",
                'text comp has no layer named "textBlock": the render aborts at requireLayer and GET_STYLE_DATA '
                "records no sample text" + (f"; near-miss: {_some(near)}" if near else ""),
                where=tcn, cite="director.jsx:450-455, style_builder.jsx:66-68")
        return
    tb = tbs[0]
    tbw = f"{tcn}/textBlock"
    if len(tbs) > 1:
        rep.add("WARN", "MULTIPLE_TEXTBLOCK",
                f'{len(tbs)} layers named "textBlock": only the top one {_lname(tb)} is read and typeset', where=tcn)
    if "error" in tb:
        rep.skip(tbw, "layer failed to extract")
        rec["unknown_text"] = True
        return
    if tb.get("type") != "text":
        rep.add("BLOCK", "TEXTBLOCK_NOT_TEXT",
                f'"textBlock" is a {tb.get("type")} layer: the director reads and keys its Source Text',
                where=tbw, cite="utils.jsx:1348-1351, director.jsx:456-482")
        return
    st = _source_text(tb)
    doc = _doc(st)
    if doc is None:
        rep.add("INFO", "SAMPLE_UNKNOWN", "textBlock Source Text was not recorded: sample text and chars unknown",
                where=tbw)
        rec["unknown_text"] = True
        return
    text = doc.get("text")
    text = text if isinstance(text, str) else None
    rec["chars"] = len(text) if text else None  # style_builder.jsx:68  text ? text.length : null
    keys = _list(st.get("k"))
    live = ("x" in st and st.get("xOn") is not False) or bool(keys)
    t = tc.get("time")
    # GET_STYLE_DATA reads .value at the text comp's playhead; the dump read v at meta.at
    rec["star"] = bool(text) and live and _is_num(t) and abs(t - proj.at) > 1e-6
    if doc.get("font"):
        rec["font"] = _h(doc.get("font"))
    if text and not text.strip():
        rep.add("WARN", "SAMPLE_WHITESPACE",
                "textBlock sample is whitespace only: GET_STYLE_DATA records its length as chars, so the caster treats "
                "the shot as text-capable; use an empty string for a media-only shot",
                where=tcn, cite="style_builder.jsx:67-68")
    box = doc.get("box", _MISSING)
    if box is not _MISSING and box:
        size = f" {_num(box[0])}x{_num(box[1])}" if isinstance(box, list) and len(box) == 2 else ""
        rep.add("WARN", "BOX_TEXT",
                "textBlock is box (paragraph) text: the director fits box text by the template's line count, and "
                "box size is unreliable from scripts - use point text (the CucoStudio idiom)",
                where=tcn + size, cite="utils.jsx:1364, " + _cite("point"))
    elif box is _MISSING and "font" in doc:
        rep.add("WARN", "BOX_TEXT",
                "textBlock looks like box (paragraph) text (boxTextSize was unreadable at extraction): the director fits box "
                "text by line count - use point text", where=tcn, cite="utils.jsx:1364, " + _cite("point"))
    if keys:
        rep.add("WARN", "TEXT_KEYFRAMED",
                "textBlock Source Text has template keyframe(s): the director adds per-phrase keys without removing "
                "them, so the sample text can reappear between phrases",
                where=f"{tcn} ({len(keys)} keys)", cite="utils.jsx:1541-1545")


def _check_shot(proj, rep, shot, main):
    nm = shot.get("name")
    rec = {"name": nm, "chars": None, "frame": None, "star": False, "font": None, "listed": True,
           "text_comp": None, "frame_comp": None, "unknown": False, "unknown_text": False, "ignored": False}
    if shot.get("skipped"):
        rec["unknown"] = True
        rep.skip(nm, "skipped by --comps")
        return rec
    slot = f"{nm}-text"
    tls = _named(shot, slot)
    if nm in IGNORED_SHOTS and (not tls or ("error" not in tls[0] and not isinstance(tls[0].get("source"), dict))):
        # no text comp: GET_STYLE_DATA leaves it out of shot_list and isIgnoredShot silences the issue
        rec["listed"], rec["ignored"] = False, True
        return rec
    if isinstance(main, dict):
        mw, mh, sw, sh = main.get("width"), main.get("height"), shot.get("width"), shot.get("height")
        if None not in (mw, mh, sw, sh) and (mw, mh) != (sw, sh):
            rep.add("WARN", "SHOT_SIZE", f"shot is {sw}x{sh}, mainComp is {mw}x{mh}: the director nests each shot "
                    f"full-frame in mainComp", where=nm, cite=_cite("shotsize") + ", director.jsx:528")
        mf, sf = main.get("fps"), shot.get("fps")
        if _is_num(mf) and _is_num(sf) and abs(mf - sf) > 1e-3:
            rep.add("WARN", "SHOT_FPS", f"shot runs at {_num(sf)} fps, mainComp at {_num(mf)}: section times are "
                    f"frame-aligned to mainComp's rate, so this shot's keys and markers land off-frame",
                    where=nm, cite="director.jsx:52, 524-526")

    # --- text slot: {shot}-text precomp -> textBlock
    if not tls:
        near = _near(slot, [L.get("name") for L in _layers(shot)])
        rec["listed"] = False
        rep.add("BLOCK", "MISSING_TEXT_COMP",
                'shot has no layer named "<shot>-text": GET_STYLE_DATA raises MISSING_TEXT_COMP and leaves the shot out '
                "of shot_list, and the render aborts in handleText; a media-only shot still needs it, with an empty "
                "textBlock" + (f"; near-miss: {_some(near)}" if near else ""),
                where=nm, cite="style_builder.jsx:62-93, director.jsx:320-325")
    elif "error" in tls[0]:
        rep.skip(f"{nm}/{slot}", "layer failed to extract")
        rec["unknown_text"] = True
    else:
        tl = tls[0]
        src = proj.source(tl)
        if not isinstance(tl.get("source"), dict):
            rec["listed"] = False
            rep.add("BLOCK", "MISSING_TEXT_COMP",
                    f'the "<shot>-text" layer is a {tl.get("type")} layer, not a precomp: GET_STYLE_DATA sees no text '
                    f"comp (MISSING_TEXT_COMP) and the director cannot duplicate its source",
                    where=f"{nm}/{slot}", cite="style_builder.jsx:62-65, director.jsx:326")
        elif src is not None and "error" not in src and src.get("type") != "comp":
            rec["listed"] = False
            rep.add("BLOCK", "MISSING_TEXT_COMP",
                    f'the "<shot>-text" layer sources a {src.get("type")}, not a comp: GET_STYLE_DATA calls .layer() on '
                    f"it and throws, and the director cannot duplicate it",
                    where=f'{nm}/{slot} -> "{src.get("name")}"', cite="style_builder.jsx:63-66, director.jsx:326")
        elif src is None or "error" in src:
            rep.skip(f"{nm}/{slot}", "source comp not in the dump")
            rec["unknown_text"] = True
        else:
            rec["text_comp"] = src.get("name")
            _slot_sources(proj, rep, nm, tls, slot)
            _check_text_comp(proj, rep, rec, src)

    # --- media slot: {shot}-frame (optional)
    fslot = f"{nm}-frame"
    fls = _named(shot, fslot)
    if fls and "error" in fls[0]:
        rep.skip(f"{nm}/{fslot}", "layer failed to extract")
    elif fls:
        fl = fls[0]
        src = proj.source(fl)
        if src is None:
            if not isinstance(fl.get("source"), dict):
                rep.add("WARN", "FRAME_NOT_PRECOMP",
                        f'the "<shot>-frame" layer is a {fl.get("type")} layer with no source: GET_STYLE_DATA records no '
                        f"frame, so the caster treats the shot as frameless", where=f"{nm}/{fslot}",
                        cite="style_builder.jsx:56-60")
            else:
                rep.skip(f"{nm}/{fslot}", "source not in the dump")
        elif "error" in src:
            rep.skip(f"{nm}/{fslot}", "source failed to extract")
        else:
            w, h = src.get("width"), src.get("height")
            rec["frame"] = [w, h] if (w is not None and h is not None) else None
            if src.get("type") == "comp":
                rec["frame_comp"] = src.get("name")
                _slot_sources(proj, rep, nm, fls, fslot)
            else:
                rep.add("WARN", "FRAME_NOT_PRECOMP",
                        f'the "<shot>-frame" layer sources a {src.get("type")}, not a comp: the director\'s '
                        f"frameLayer.source.duplicate() fails (FRAME_LAYER_ERROR) and story media never lands",
                        where=f'{nm}/{fslot} -> "{src.get("name")}"', cite="director.jsx:574-575, 644-651")

    # --- controller null with enter/exit sliders
    ctls = _named(shot, "controller")
    if not ctls:
        rep.add("WARN", "NO_CONTROLLER",
                'no "controller" layer: the director keys no enter/exit transition (CONTROLLER_NOT_FOUND)',
                where=nm, cite="director.jsx:655-664")
    elif "error" in ctls[0]:
        rep.skip(f"{nm}/controller", "layer failed to extract")
    else:
        ctl = ctls[0]
        fx = _effects(ctl)
        probs, keys = [], []
        for e in ("enter", "exit"):
            hits = [f for f in fx if f.get("name") == e]
            if not hits:
                probs.append(f'"{e}" missing')
            elif hits[0].get("mn") != SLIDER:
                probs.append(f'"{e}" is {hits[0].get("mn")}')
            else:
                p = _effect_prop(ctl, e, "Slider")
                nk = len(_list(p.get("k"))) if p else 0
                if nk != 2:
                    keys.append(f"{e} {nk}")
        if probs:
            rep.add("WARN", "CONTROLLER_EFFECTS",
                    f"controller effects: {', '.join(probs)} (need Slider Controls \"enter\" and \"exit\"): handleTransition "
                    f"throws, TRANSITION_ERROR, the shot renders without transitions",
                    where=nm, cite="utils.jsx:632-637, director.jsx:666-672")
        if keys:
            rep.add("WARN", "CONTROLLER_KEYS",
                    "controller enter/exit keyframe count is not 2 (want 0 -> 100 each): the director re-keys exactly "
                    "2 per slider, and linking expressions read key(1)/key(2)",
                    where=f"{nm} ({', '.join(keys)})", cite="utils.jsx:638-660, " + _cite("controller"))
    return rec


def _hand(rep, recs, at):
    """INFO: the shot hand as the caster sees it (edit_utils.py eligible_shots / capacity_ladder)."""
    recs = [r for r in recs if not r["ignored"]]
    unlisted = [str(r["name"]) for r in recs if not r["listed"]]
    listed = [r for r in recs if r["listed"]]
    known = [r for r in listed if not r["unknown"] and not r["unknown_text"]]
    unk = [str(r["name"]) for r in listed if r["unknown"] or r["unknown_text"]] + rep.maybe_shots
    partial = (f"; hand partial, {len(unk)} shot(s) unverified ({_some(unk)}): gaps and repetition not assessed"
               if unk else "")
    if not known:
        if unlisted or unk:
            msg = "no verified shot in shot_list"
            if unlisted:
                msg += f"; not in shot_list (no text comp): {_some(unlisted)}"
            rep.add("INFO", "SHOT_HAND", msg + partial, cite="style_builder.jsx:50-93")
        return
    cats = OrderedDict((k, []) for k in ("text-only", "text+media", "media-only", "no-text-no-frame"))
    for r in known:
        framed = _framed(r["frame"])
        key = ("text+media" if framed else "text-only") if r["chars"] else ("media-only" if framed else "no-text-no-frame")
        cats[key].append(r)

    def tag(r):
        bits = []
        if r["chars"]:
            bits.append(f"{r['chars']}c" + ("*" if r["star"] else ""))
        if _framed(r["frame"]):
            bits.append(f"{_num(r['frame'][0])}x{_num(r['frame'][1])}")
        return str(r["name"]) + (":" + "/".join(bits) if bits else "")

    parts = [f"{k} {' '.join(tag(r) for r in v)}" for k, v in cats.items() if v]
    msg = f"{len(known)} shot(s): " + " | ".join(parts)
    if unlisted:
        msg += f"; not in shot_list (no text comp): {_some(unlisted)}"
    msg += partial
    if any(r["star"] for r in known):
        msg += (f"; * sample read at t={_num(at)}s, GET_STYLE_DATA reads Source Text (keyed or expression-driven) "
                f"at the text comp's playhead - chars may differ")
    rep.add("INFO", "SHOT_HAND", msg, cite="style_builder.jsx:50-93")

    frameless = [r for r in known if not _framed(r["frame"])]
    framed = [r for r in known if _framed(r["frame"])]
    text_pool = frameless or known   # edit_utils.py:208-210  frameless or shot_list
    media_pool = framed or known     # edit_utils.py:205-207  framed or shot_list
    if not unk:
        if not frameless:
            rep.add("INFO", "HAND_GAP", "no frameless shot: text sections fall back to every shot, i.e. onto frames "
                    "with no media", cite="edit_utils.py:208-210")
        elif not cats["text-only"]:
            rep.add("INFO", "HAND_GAP", "no text-only shot (-text sample, no -frame): text sections land on empty "
                    f"frameless shot(s) {_some(str(r['name']) for r in frameless)} (no sample, chars None: no char cap)",
                    cite="edit_utils.py:208-210")
        if not framed:
            rep.add("INFO", "HAND_GAP", "no shot has a -frame: media sections fall back to every shot, where story "
                    "media has no slot", cite="edit_utils.py:205-207")
        else:
            if not cats["media-only"]:
                rep.add("INFO", "HAND_GAP", "no media-only shot (-frame + empty textBlock): media sections always get a "
                        "text+media layout", cite="edit_utils.py:205-207")
            if not cats["text+media"]:
                rep.add("INFO", "HAND_GAP", "no text+media shot: media sections that carry text land on media-only "
                        "shots, which have no chars capacity", cite="edit_utils.py:205-207")
        if len(text_pool) < 3:
            names = [str(r["name"]) + ("(empty)" if not r["chars"] else "") for r in text_pool]
            why = "text sections are cast only on frameless shots" if frameless else "no frameless shot, so on every shot"
            rep.add("INFO", "REPETITION",
                    f"text-only stories reuse {len(text_pool)} shot(s) ({', '.join(names)}) - expect repetition ({why})",
                    cite="edit_utils.py:208-210")
    text_l = sorted({r["chars"] for r in text_pool if r["chars"]})
    media_l = sorted({r["chars"] for r in media_pool if r["chars"]})
    rep.add("INFO", "CAPACITY",
            ("partial " if unk else "") +
            f"chars ladder: text sections {text_l or 'none (uncapped)'}, media sections {media_l or 'none (uncapped)'} "
            f"(sample length incl. line breaks)", cite="edit_utils.py:219-229")
    fonts = list(OrderedDict.fromkeys(r["font"] for r in known if r["font"]))
    if fonts:
        rep.add("INFO", "TEXT_FONTS", f"textBlock fonts (manifest.fonts): {_some(fonts)}")


def _check_comp_refs(proj, rep, graph, shots, recs):
    refs = OrderedDict()  # referenced name -> [count, example]
    dyn = 0
    for c in graph.values():
        for L in _layers(c):
            if "error" in L:
                continue
            for p in _props(L):
                x = p.get("x")
                if not isinstance(x, str) or "comp(" not in x:
                    continue
                for m in _COMP_REF.finditer(x):
                    name = m.group(2).replace("\\" + m.group(1), m.group(1))
                    if name == MAIN_COMP:
                        continue
                    r = refs.setdefault(name, [0, f"{c.get('name')}/{_lname(L)}/{p.get('path')}"])
                    r[0] += 1
                dyn += len(_COMP_DYN.findall(x))
    per_section = {_h(s.get("name")) for s in shots}
    per_section |= {_h(r["text_comp"]) for r in recs if r.get("text_comp")}
    per_section |= {_h(r["frame_comp"]) for r in recs if r.get("frame_comp")}
    # handleShot STEP 1b deep-duplicates every precomp nested in a shot except the two slots
    nested = set()
    for s in shots:
        slots = (f"{s.get('name')}-text", f"{s.get('name')}-frame")
        for L in _layers(s):
            if L.get("name") in slots:
                continue
            src = proj.source(L)
            if src is not None and src.get("type") == "comp" and "error" not in src:
                nested |= {_h(c.get("name")) for c in proj.reach([src]).values()}
    for name, (n, ex) in refs.items():
        hits = proj.comps_by_name.get(name, [])
        if not hits:
            if name in proj.stub_names:
                continue
            near = _near(name, proj.comps_by_name.keys())
            rep.add("WARN", "COMP_REF_MISSING", f'{n} expression(s) call comp("{name}") but no comp has that name'
                    + (f"; near-miss: {_some(near)}" if near else ""), where=f"e.g. {ex}")
            continue
        why = []
        if len(hits) > 1:
            why.append(f"{len(hits)} comps share that name and AE binds the first")
        if name in per_section:
            why.append("the director duplicates and renames this comp per section, so the reference keeps reading the "
                       "template original (director.jsx:518-521, 326-332)")
        elif name in nested:
            why.append("it is nested in a shot, and handleShot deep-duplicates every such precomp per section, so the "
                       "reference keeps reading the template original (director.jsx:533-560)")
        elif _h(hits[0].get("id")) not in graph:
            why.append("nothing under mainComp or a shot uses it, so reduceProject(mainComp) at render can drop it "
                       "(director.jsx:255)")
        if why:
            rep.add("WARN", "COMP_REF_FRAGILE", f'{n} expression(s) call comp("{name}"): ' + "; ".join(why),
                    where=f"e.g. {ex}")
    if dyn:
        rep.add("INFO", "COMP_REF_DYNAMIC", f"{dyn} comp(<computed name>) call(s) were not checked")


def _template(proj, rep):
    mains = proj.comps_by_name.get(MAIN_COMP, [])
    main = mains[0] if mains else None
    if not mains:
        if MAIN_COMP in proj.stub_names:
            rep.skip(MAIN_COMP, "item failed to extract")
        else:
            near = _near(MAIN_COMP, [c.get("name") for c in proj.comps])
            rep.add("BLOCK", "NO_MAIN_COMP",
                    'no comp named exactly "mainComp": GET_STYLE_DATA throws "mainComp not found" and the director stops '
                    "with MISSING_MAIN_COMP" + (f"; near-miss: {_some(near)}" if near else ""),
                    cite="style_builder.jsx:35-38, director.jsx:47-50")
    elif len(mains) > 1:
        rep.add("BLOCK", "DUPLICATE_COMP",
                f'{len(mains)} comps named "mainComp" ({_some([proj.path(c) for c in mains], 4)}): findCompbyName returns '
                f'the first in project order, so import, render and comp("mainComp") expressions can bind different ones',
                where=MAIN_COMP, cite="utils.jsx:396-407")
    if main is not None:
        if main.get("skipped"):
            rep.skip(MAIN_COMP, "skipped by --comps")
        else:
            _check_main_control(proj, main, rep)
    shots = _shots_folder(proj, rep)
    recs = [_check_shot(proj, rep, s, main) for s in shots]
    cast = [s for s, r in zip(shots, recs) if not r["ignored"]]   # what GET_STYLE_DATA can list / the director renders
    _check_duplicates(proj, rep, cast)
    for s, r in zip(shots, recs):
        if r["ignored"]:
            rep.add("INFO", "IGNORED_SHOTS", "non-casting name with no text comp: GET_STYLE_DATA leaves it out of "
                    "shot_list without an issue", where=s.get("name"), cite="style_builder.jsx:65-90, constants.jsx:144-148")
        elif s.get("name") in IGNORED_SHOTS and r["listed"] and not r["unknown"]:
            rep.add("WARN", "IGNORED_SHOT_CASTABLE",
                    'non-casting name (POSTER/BANNER/SOCIAL) with a "<shot>-text" comp: GET_STYLE_DATA still lists it '
                    "in shot_list and the caster can cast it - isIgnoredShot only silences import issues",
                    where=s.get("name"), cite="style_builder.jsx:62-99")
    _hand(rep, recs, proj.at)
    graph, label = _render_graph(proj, ([main] if main is not None else []) + cast)
    _check_exprs(proj, rep, graph, label or "the director never renders (not under mainComp or a listed shot)")
    _check_comp_refs(proj, rep, graph, cast, recs)

    if not proj.items:
        return "validate: style template check - empty project (0 items)"
    head = f"validate: style template - {len(cast)} shot(s) in ORIGINAL_SHOTS"
    if rep.maybe_shots:
        head += f" (+{len(rep.maybe_shots)} unextracted item(s) that may be shots)"
    if main is not None:
        head += f", mainComp {_num(main.get('width'))}x{_num(main.get('height'))} @{_num(main.get('fps'))}fps"
    else:
        head += ", no mainComp"
    return head


# ================================================================== arrangement (render project)
def _arrangement(proj, rep, folder):
    shots = [it for it in proj.children(folder) if it.get("type") == "comp"]
    tf = proj.folder(TARGETS_FOLDER)
    targets = [it for it in proj.children(tf[0]) if it.get("type") == "comp"] if tf else []
    mains = proj.comps_by_name.get(MAIN_COMP, [])
    if mains:
        graph, label = _render_graph(proj, mains[:1])
        label = label or "not under mainComp (not rendered)"
    else:
        rep.add("WARN", "NO_MAIN_COMP", "arrangement has no mainComp, so nothing renders; expressions checked in every comp")
        graph, label = proj.everything(), "(none)"
    _check_exprs(proj, rep, graph, label)
    extra = "; ORIGINAL_SHOTS still present (build in progress or not reduced)" if proj.folder(SHOTS_FOLDER) else ""
    return (f"validate: ARRANGEMENT - director render project ({len(shots)} shot comp(s) in PROJECT_SHOTS, "
            f"{len(targets)} in PROJECT_TARGETS){extra}; style-contract checks skipped (validate the style .aep); "
            f"checked: extraction, expressions, fonts, footage")


def _arrangement_folder(proj, rep):
    """The PROJECT_SHOTS folder that makes this a render project, or None. An empty PROJECT_SHOTS next to
    ORIGINAL_SHOTS is a style template with a leftover folder, not an arrangement."""
    folders = proj.folder(ARRANGEMENT_FOLDER)
    if not folders:
        return None
    full = [f for f in folders if any(it.get("type") == "comp" for it in proj.children(f))]
    if full:
        return full[0]
    if proj.folder(SHOTS_FOLDER) or SHOTS_FOLDER in proj.stub_names:
        rep.add("WARN", "STRAY_PROJECT_FOLDER",
                "empty PROJECT_SHOTS folder in a style template (leftover from a test build?): the director creates "
                "its own at render, so delete it", where=ARRANGEMENT_FOLDER)
        return None
    return folders[0]


# ================================================================== entry point
def validate(data, args=None):
    """Return (text, exit_code): exit 1 if any BLOCK finding, else 0."""
    if not isinstance(data, dict):
        data = {}
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    proj = _Project(data)
    rep = _Report()
    _check_extraction(proj, meta, rep)
    arr = _arrangement_folder(proj, rep)
    first = _arrangement(proj, rep, arr) if arr is not None else _template(proj, rep)
    _check_fonts(data, meta, rep)
    _check_footage(proj, rep)
    if rep.unverified:
        rep.incomplete = True
        by_why = OrderedDict()
        for n, why in rep.unverified.items():
            by_why.setdefault(why, []).append(n)
        rep.add("WARN", "UNVERIFIED", "checks not run for: "
                + "; ".join(f"{_some(ns)} ({why})" for why, ns in by_why.items()) + " - re-run aectx extract")

    b, w, i = (rep.count(lvl) for lvl in LEVELS)
    if b:
        verdict = "FAIL: fix every BLOCK before " + ("rendering" if arr is not None else "import/render")
    else:
        verdict = "PASS: no " + ("render" if arr is not None else "contract") + " blockers found offline"
    if rep.incomplete:
        verdict += "; dump INCOMPLETE, some checks did not run"
    lines = [first] + rep.lines() + [f"summary: {b} BLOCK, {w} WARN, {i} INFO - {verdict}"]
    return "\n".join(_clean(s) for s in lines), (1 if b else 0)
