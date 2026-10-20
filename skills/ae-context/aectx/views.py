"""aectx.views - offline `overview` and `tree` over an aectx/2 dump.

Both take (data, args) and return (text, exit_code). Output is dense plain text for an LLM:
no ANSI, no emoji, ASCII decoration, deterministic ordering, never raw float color arrays.
Names are printed verbatim except control characters and line separators, which are escaped
(\\r \\n \\t \\xNN \\uNNNN) so every output line stays one record; the escapes also work as --comp regex.
The views are defensive: malformed or missing fields degrade to '?' instead of raising.

Project KIND (see SCHEMA.md "CucoStudio conventions"):
  arrangement  folder PROJECT_SHOTS exists (director-built render project)
  template     folder ORIGINAL_SHOTS exists (CucoStudio style template)
  generic      anything else
PROJECT_SHOTS wins when both exist (an arrangement can carry the template's folders).
"""
import collections
import difflib
import re

EXIT_OK, EXIT_ERROR = 0, 2

KIND_LABEL = {"template": "style template", "arrangement": "director arrangement", "generic": "generic project"}
TRINITY = ("FORM", "FLOW", "PRESSURE")
PALETTE = ("1", "2", "3")
EXPECTED_MC_FX = TRINITY + PALETTE
SLIDER_MN, COLOR_MN = "ADBE Slider Control", "ADBE Color Control"
EXPECTED_MC_MN = (SLIDER_MN,) * 3 + (COLOR_MN,) * 3
OVERVIEW_BUDGET = 3000     # chars; row caps shrink (OVERVIEW_ROW_STEPS) until the overview fits
OVERVIEW_MAX_SHOT_ROWS = 16
OVERVIEW_MAX_SEQ_ROWS = 20
OVERVIEW_ROW_STEPS = (12, 8, 5)
OVERVIEW_NAME = 40         # chars per name in overview lists
OVERVIEW_MAX_FONTS = 8
OVERVIEW_MAX_OTHER = 8     # 'other mainComp layers' listed one by one; the rest summarized by type
OVERVIEW_MAX_LIST = 12     # section numbers per reused shot, unused shot names
OVERVIEW_MAX_BASES = 10    # reused template shots
OVERVIEW_MAX_MISSING = 6
TEXT_SAMPLE = 28          # chars of sample text in overview
TREE_TEXT_SAMPLE = 22     # chars of sample text on tree text-layer lines
FX_SHOWN = 3
SIMILAR_RATIO = 0.6       # tree: a comp at least this similar to an earlier one prints as a delta


# ================================================================== formatting helpers
_CTRL = re.compile(r"[\x00-\x1f\x7f\x85  ]")
_CTRL_ESC = {"\r": "\\r", "\n": "\\n", "\t": "\\t"}


def _esc(m):
    c = m.group()
    return _CTRL_ESC.get(c) or (f"\\x{ord(c):02x}" if ord(c) < 0x100 else f"\\u{ord(c):04x}")


def _nm(s):
    """A name safe for line-oriented output: control chars / line separators escaped, None -> '?'."""
    return "?" if s is None else _CTRL.sub(_esc, str(s))


def _num(x, nd=2):
    """Compact number: 10 -> '10', 6.8333 -> '6.83', None -> '?'."""
    if x is None or isinstance(x, bool):
        return "?"
    try:
        f = float(x)
    except (TypeError, ValueError):
        return _nm(x)
    if f != f or f in (float("inf"), float("-inf")):
        return "?"
    s = f"{f:.{nd}f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def to_hex(v):
    """Color value -> '#rrggbb'. Accepts [r,g,b(,a)] floats 0..1 (clamped) or an existing hex string.
    Returns None for anything that is not a color."""
    if isinstance(v, str):
        return v.lower() if re.match(r"^#[0-9a-fA-F]{6}$", v) else None
    if isinstance(v, (list, tuple)) and len(v) >= 3:
        out = "#"
        for c in v[:3]:
            if isinstance(c, bool) or not isinstance(c, (int, float)) or c != c:
                return None
            out += f"{int(round(max(0.0, min(1.0, float(c))) * 255)):02x}"
        return out
    return None


def _oneline(s):
    return re.sub(r"\s*[\r\n  \x03]+\s*", " / ", str(s)).strip()


def _trunc(s, n):
    """Free text (text samples, error messages) on one line: breaks become ' / ', the rest escaped."""
    s = _nm(_oneline(s))
    return s if len(s) <= n else s[: max(1, n - 3)].rstrip() + "..."


def _trunc_mid(s, n):
    """Long path: keep the head and (mostly) the tail."""
    if len(s) <= n:
        return s
    keep = max(4, n - 3)
    head = keep // 3
    return s[:head] + "..." + s[-(keep - head):]


def _cut(name, n=OVERVIEW_NAME):
    """A name (escaped, see _nm) shortened for a list."""
    s = _nm(name)
    return s if len(s) <= n else s[: max(1, n - 3)] + "..."


def _q(name):
    """Quote a name used as a flag value when it would be ambiguous (spaces, quotes, empty)."""
    name = "" if name is None else _nm(name)
    if name == "" or re.search(r"[\s\"'=\[\],:]", name):
        return '"' + name.replace('"', '\\"') + '"'
    return name


def _rx_lit(s):
    """Escape a name for a shell-friendly regex (only real metacharacters; '-' stays readable)."""
    return re.sub(r"([.^$*+?()\[\]{}|\\])", r"\\\1", str(s))


def _rx_arg(s):
    """Regex literal for a name, safe inside a single-quoted shell argument."""
    return _nm(_rx_lit(s)).replace("'", "'\\''")


def _plural(n, word):
    return f"{n} {word}" + ("" if n == 1 else "s")


def _natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", str(s or ""))]


def _list(x):
    return x if isinstance(x, list) else []


def _hid(x):
    """x when it can be an item id (dict key), else None."""
    return x if isinstance(x, (int, float, str)) else None


def _f(x, default=None):
    if isinstance(x, bool):
        return default
    try:
        f = float(x)
        return f if f == f else default
    except (TypeError, ValueError):
        return default


def _by_count(counter):
    return ", ".join(f"{n} {t}" for t, n in sorted(counter.items(), key=lambda kv: (-kv[1], str(kv[0]))))


# ================================================================== project index
class Project:
    def __init__(self, data):
        data = data if isinstance(data, dict) else {}
        self.data = data
        self.meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        self.items = [it for it in _list(data.get("items")) if isinstance(it, dict)]
        self.by_id = {}
        for it in self.items:
            k = _hid(it.get("id"))
            if k is not None:
                self.by_id.setdefault(k, it)
        self.comps = [it for it in self.items if it.get("type") == "comp"]
        self.folders = [it for it in self.items if it.get("type") == "folder"]
        self.item_errors = [it for it in self.items if "error" in it]
        self.comp_by_name = {}
        for c in self.comps:
            if isinstance(c.get("name"), str):
                self.comp_by_name.setdefault(c["name"], c)
        cnt = collections.Counter(c.get("name") for c in self.comps if isinstance(c.get("name"), str))
        self.dup_names = {n for n, k in cnt.items() if k > 1}
        if self.folder("PROJECT_SHOTS"):
            self.kind = "arrangement"
        elif self.folder("ORIGINAL_SHOTS"):
            self.kind = "template"
        else:
            self.kind = "generic"
        mains = [c for c in self.comps if c.get("name") == "mainComp"]
        self.main = mains[0] if mains else None
        self.n_main = len(mains)

    def get(self, ref):
        k = _hid(ref)
        return self.by_id.get(k) if k is not None else None

    def label(self, c):
        """Display name of a comp; '#id' is appended when several comps share the name (AE allows it)."""
        n = c.get("name")
        return f"{_nm(n)}#{_nm(c.get('id'))}" if isinstance(n, str) and n in self.dup_names else _nm(n)

    def folder(self, name):
        for f in self.folders:
            if f.get("name") == name:
                return f
        return None

    def folder_name(self, item):
        f = self.get(item.get("folder"))
        return f.get("name") if f else None

    def comps_in(self, folder_name):
        """Comps anywhere under the named folder (nested subfolders included), item order."""
        f = self.folder(folder_name)
        if not f:
            return []
        out = []
        for c in self.comps:
            seen, fid = set(), _hid(c.get("folder"))
            while fid is not None and fid not in seen:
                if fid == f.get("id"):
                    out.append(c)
                    break
                seen.add(fid)
                fid = _hid((self.by_id.get(fid) or {}).get("folder"))
        return out

    def source_comp(self, layer):
        src = layer.get("source") if isinstance(layer.get("source"), dict) else None
        if not src:
            return None
        it = self.get(src.get("id"))
        return it if it and it.get("type") == "comp" else None

    def shot_comps(self):
        if self.kind == "template":
            return sorted(self.comps_in("ORIGINAL_SHOTS"), key=lambda c: (_natkey(c.get("name")), _f(c.get("id"), 0)))
        if self.kind == "arrangement":
            starts = {}
            if self.main:
                for L in _layers(self.main):
                    sc = self.source_comp(L)
                    if sc is not None:
                        starts.setdefault(_hid(sc.get("id")), _f(L.get("in"), 0.0))
            return sorted(self.comps_in("PROJECT_SHOTS"),
                          key=lambda c: (starts.get(_hid(c.get("id")), float("inf")), _natkey(c.get("name")),
                                         _f(c.get("id"), 0)))
        return []


def _layers(comp):
    return [L for L in _list(comp.get("layers")) if isinstance(L, dict)]


def _props(layer):
    return [p for p in _list(layer.get("props")) if isinstance(p, dict)]


def _effects(layer):
    return [e for e in _list(layer.get("effects")) if isinstance(e, dict)]


def _layer_named(comp, name):
    for L in _layers(comp):
        if L.get("name") == name:
            return L
    return None


def _prop(layer, path):
    for p in _props(layer):
        if p.get("path") == path:
            return p
    return None


def _source_text(layer):
    for p in _props(layer):
        if str(p.get("path") or "").endswith("Source Text") or str(p.get("mn") or "").endswith("ADBE Text Document"):
            return p
    return None


def _expr_counts(layer):
    n = bad = keys = 0
    for p in _props(layer):
        if "x" in p:
            n += 1
            if p.get("xErr") or p.get("xOn") is False:
                bad += 1
        if p.get("k"):
            keys += 1
    return n, bad, keys


def _project_expr_counts(P):
    props = exprs = errs = off = 0
    layers = layer_errs = 0
    for c in P.comps:
        for L in _layers(c):
            layers += 1
            if "error" in L:
                layer_errs += 1
            for p in _props(L):
                props += 1
                if "x" in p:
                    exprs += 1
                    if p.get("xErr"):
                        errs += 1
                    if p.get("xOn") is False:
                        off += 1
    return dict(layers=layers, layer_errs=layer_errs, props=props, exprs=exprs, errs=errs, off=off)


def _comp_size(c):
    return f"{_num(c.get('width'))}x{_num(c.get('height'))}"


def _nlayers(c):
    ls = c.get("layers")
    if isinstance(ls, list) and (ls or not c.get("numLayers")):
        return len(ls)
    n = c.get("numLayers")
    return n if isinstance(n, int) and not isinstance(n, bool) else 0


# ================================================================== overview
def _short_mn(mn):
    s = str(mn)
    if s.startswith("ADBE "):
        s = s[5:]
    if s.endswith(" Control"):
        s = s[:-8]
    return _nm(s)


def _mc_line(P):
    if not P.main:
        return "mainControl: - (no mainComp)"
    if P.main.get("skipped"):
        return "mainControl: ? (mainComp not extracted: outside the extract --comps scope)"
    mc = _layer_named(P.main, "mainControl")
    note = ""
    if mc is None:
        near = [L for L in _layers(P.main) if str(L.get("name", "")).strip().lower() == "maincontrol"]
        if not near:
            return "mainControl: MISSING in mainComp"
        mc = near[0]
        note = f" (layer is named {_q(mc.get('name'))}, NOT exactly 'mainControl')"
    if "error" in mc:
        return f"mainControl{note}: LAYER ERROR ({_trunc(mc.get('error'), 60)}); values unknown"
    fx = _effects(mc)

    def val(name, want):
        e = next((x for x in fx if x.get("name") == name), None)
        if e is None:
            return "MISSING"
        mn = e.get("mn")
        if mn and mn != want:
            return f"WRONG-TYPE({_short_mn(mn)})"
        is_color = want == COLOR_MN
        p = _prop(mc, f"Effects/{name}/{'Color' if is_color else 'Slider'}")
        if p is None:  # untouched default is omitted from the dump
            return ("#ff0000" if is_color else "0") + ("(default)" if mn else "(default?)")
        v = p.get("v")
        s = (to_hex(v) or "?") if is_color else _num(v)
        extra = []
        if p.get("k"):
            extra.append(f"{len(_list(p.get('k')))}keys")
        if "x" in p:
            extra.append("expr" + ("-ERR" if p.get("xErr") or p.get("xOn") is False else ""))
        return s + (f"({','.join(extra)})" if extra else "")

    tri = " ".join(f"{n}={val(n, SLIDER_MN)}" for n in TRINITY)
    pal = " ".join(f"{n}={val(n, COLOR_MN)}" for n in PALETTE)
    line = f"mainControl{note}: {tri} | palette {pal}"
    names6 = tuple(e.get("name") for e in fx[:6])
    type_bad = any(e.get("mn") and e.get("mn") != w for e, w in zip(fx[:6], EXPECTED_MC_MN))
    if names6 != EXPECTED_MC_FX or type_bad:
        shown = [_nm(e.get("name")) + (f":{_short_mn(e.get('mn'))}" if e.get("mn") else "") for e in fx[:8]]
        if len(fx) > 8:
            shown.append(f"+{len(fx) - 8}")
        line += (f"\n  effect order [{', '.join(shown)}] (expected FORM,FLOW,PRESSURE Slider then 1,2,3 Color;"
                 f" palette is read by position)")
    return line


def _text_info(comp):
    """Facts about a -text comp's textBlock: {size, problem?, phrases, sample, font, pt, flags}."""
    d = {"size": _comp_size(comp), "problem": None, "phrases": 0, "sample": '""', "font": None, "pt": "?", "flags": ""}
    if comp.get("skipped"):
        d["problem"] = "not extracted (scoped)"
        return d
    tb = _layer_named(comp, "textBlock")
    if tb is None:
        d["problem"] = "NO textBlock"
        return d
    if "error" in tb:
        d["problem"] = "textBlock LAYER ERROR"
        return d
    st = _source_text(tb)
    v = st.get("v") if st else None
    if not isinstance(v, dict):
        d["problem"] = "textBlock without a Source Text value"
        return d
    keys = [k for k in _list(st.get("k")) if isinstance(k, list) and len(k) > 1 and isinstance(k[1], dict)]
    d["phrases"] = len(keys)
    text = keys[0][1].get("text", v.get("text")) if keys else v.get("text")
    d["sample"] = '""' if not text else '"' + _trunc(text, TEXT_SAMPLE) + '"'
    d["font"] = _nm(v.get("font") or v.get("family") or "?")
    # keyframed text: sizes come from the keys (the sample is phrase 1), not from v at meta.at
    sizes = sorted({s for s in (_f(k[1].get("size")) for k in keys) if s is not None})
    if sizes:
        d["pt"] = _num(sizes[0]) if len(sizes) == 1 else f"{_num(sizes[0])}-{_num(sizes[-1])}"
    else:
        d["pt"] = _num(v.get("size"))
    if v.get("box"):
        d["flags"] += " boxText"
    if st.get("xErr") or st.get("xOn") is False:
        d["flags"] += " EXPR-ERR"
    return d


def _fmt_text(d, show_font, show_size):
    if d["problem"]:
        return f"{d['size']} {d['problem']}"
    parts = [d["size"]] if show_size else []
    if d["phrases"] > 1:
        parts.append(f"{d['phrases']} phrases")
    parts.append(d["sample"])
    if show_font:
        parts.append(d["font"])
    parts.append(f"{d['pt']}pt{d['flags']}")
    return " ".join(parts)


def _common(infos, key):
    """The value of `key` shared by every usable row, when at least two rows share it (worth hoisting)."""
    vals = [d[key] for d in infos if d and not d["problem"]]
    return vals[0] if len(vals) >= 2 and len(set(vals)) == 1 else None


def _hoist_cols(infos, lead):
    """(font, size, column legend) for a -text column; shared font/size move into the legend."""
    font, size = _common(infos, "font"), _common(infos, "size")
    cols = ([] if size else ["WxH"]) + lead + ([] if font else ["font"]) + ["size"]
    shared = [x for x in (size, font) if x]
    return font, size, " ".join(cols) + (f" (all {' '.join(shared)})" if shared else "")


def _find_sub(P, shot, suffix):
    """The {shot}-text / {shot}-frame comp: a layer source named exactly so, else any layer source
    ending in the suffix (director frame comps keep AE duplicate names), else the comp of that name."""
    want = f"{shot.get('name')}{suffix}"
    cands = []
    for L in _layers(shot):
        sc = P.source_comp(L)
        if sc is not None and str(sc.get("name", "")).endswith(suffix):
            if sc.get("name") == want:
                return sc
            cands.append(sc)
    return cands[0] if cands else P.comp_by_name.get(want)


def _controller(shot):
    if shot.get("skipped"):
        return "? (not extracted)"
    ctl = _layer_named(shot, "controller")
    if ctl is None:
        return "MISSING"
    if "error" in ctl:
        return "LAYER ERROR"
    names = [e.get("name") for e in _effects(ctl)]
    miss = [n for n in ("enter", "exit") if n not in names]
    return "ok" if not miss else f"no {'/'.join(miss)} slider"


def _sub_name(sub, owner, suffix):
    """'' when the sub comp has the expected name, else its name and a space."""
    return "" if sub.get("name") == f"{owner.get('name')}{suffix}" else f"{_nm(sub.get('name'))} "


def _template_lines(P, max_rows):
    shots = P.shot_comps()
    rows = []
    for c in shots[:max_rows]:
        t = _find_sub(P, c, "-text")
        rows.append((c, t, _text_info(t) if t else None, _find_sub(P, c, "-frame")))
    font, size, legend = _hoist_cols([r[2] for r in rows], ['"textBlock sample"'])
    out = [f"shots ({len(shots)}) in ORIGINAL_SHOTS: shot WxH layers | -text comp: {legend} | -frame WxH | controller"]
    for c, t, ti, fr in rows:
        tinfo = (_sub_name(t, c, "-text") + _fmt_text(ti, not font, not size)) if t else "MISSING"
        finfo = (_sub_name(fr, c, "-frame") + _comp_size(fr)) if fr else "-"
        out.append(f"  {_nm(c.get('name'))} {_comp_size(c)} {_nlayers(c)}L | text {tinfo} | frame {finfo}"
                   f" | ctrl {_controller(c)}")
    if len(shots) > max_rows:
        out.append(f"  ... +{len(shots) - max_rows} more shots (aectx tree; aectx validate)")
    return out


def _split_instance(name):
    m = re.match(r"^(.*\S)-(\d+)$", str(name or ""))
    return (m.group(1), int(m.group(2))) if m else (str(name), None)


def _arrangement_lines(P, max_rows):
    out = []
    shots = P.comps_in("PROJECT_SHOTS")
    shot_ids = {_hid(c.get("id")) for c in shots} - {None}
    if not P.main:
        out.append(f"sequence: no mainComp ({len(shots)} comps in PROJECT_SHOTS)")
        return out
    if P.main.get("skipped"):
        out.append(f"sequence: mainComp not extracted (outside the extract --comps scope; {len(shots)} comps in"
                   f" PROJECT_SHOTS); re-run aectx extract without --comps")
        return out
    seq, other, errs = [], [], []
    for L in _layers(P.main):
        if "error" in L:
            errs.append(L)
            continue
        sc = P.source_comp(L)
        (seq if sc is not None and _hid(sc.get("id")) in shot_ids else other).append((L, sc))
    seq.sort(key=lambda t: (_f(t[0].get("in"), 0.0), _f(t[0].get("index"), 0.0)))
    fps = _f(P.main.get("fps"), 30.0) or 30.0
    half = 0.5 / fps
    used, gaps, prev_out = {}, [], None
    for L, sc in seq:
        base, sec = _split_instance(sc.get("name"))
        used.setdefault(base, []).append(sec if sec is not None else "?")
        i, o = _f(L.get("in")), _f(L.get("out"))
        g = ""
        if prev_out is not None and i is not None:
            if i - prev_out > half:
                g = f" GAP {_num(i - prev_out)}s"
            elif prev_out - i > half:
                g = f" OVERLAP {_num(prev_out - i)}s"
        gaps.append(g)
        prev_out = o
    rows = []
    for L, sc in seq[:max_rows]:
        t = _find_sub(P, sc, "-text")
        rows.append((L, sc, t, _text_info(t) if t else None))
    font, size, legend = _hoist_cols([r[3] for r in rows], ["phrases", '"first phrase"'])
    out.append(f"sequence (mainComp, {_plural(len(seq), 'section')}): sec shot in-out (dur) | -text comp: {legend}")
    for (L, sc, t, ti), gap in zip(rows, gaps):
        base, sec = _split_instance(sc.get("name"))
        i, o = _f(L.get("in")), _f(L.get("out"))
        dur = (o - i) if i is not None and o is not None else None
        tinfo = (_sub_name(t, sc, "-text") + _fmt_text(ti, not font, not size)) if t else "no -text comp"
        sname = _nm(sc.get("name")) if sc.get("name") == L.get("name") else f"{_nm(L.get('name'))}->{_nm(sc.get('name'))}"
        flag = " video-off" if L.get("enabled") is False else ""
        out.append(f"  {sec if sec is not None else '?'} {sname} {_num(i)}-{_num(o)} ({_num(dur)}s){gap}{flag} | {tinfo}")
    if len(seq) > max_rows:
        hidden_gaps = sum(1 for g in gaps[max_rows:] if g)
        out.append(f"  ... +{len(seq) - max_rows} more sections"
                   + (f" ({hidden_gaps} with GAP/OVERLAP)" if hidden_gaps else "") + " (aectx tree --comp '^mainComp$')")
    if errs:
        out.append(f"mainComp layer errors ({len(errs)}; sequence may be incomplete): " + "; ".join(
            f"[{_nm(L.get('index'))}] {_cut(L.get('name'))}: {_trunc(L.get('error'), 50)}" for L in errs[:5])
            + (f"; +{len(errs) - 5} more" if len(errs) > 5 else ""))
    if other:
        parts = []
        for L, _ in other[:OVERVIEW_MAX_OTHER]:
            fl = [_nm(L.get("type") or "?")]
            if L.get("enabled") is False and L.get("type") != "null" and not L.get("isMatte"):
                fl.append("video-off")
            parts.append(f"[{_nm(L.get('index'))}] {_cut(L.get('name'))} ({', '.join(fl)})")
        rest = other[OVERVIEW_MAX_OTHER:]
        if rest:
            parts.append(f"+{len(rest)} more: " + _by_count(collections.Counter(_nm(L.get("type") or "?") for L, _ in rest)))
        out.append("other mainComp layers: " + "; ".join(parts))
    if used:
        bases = sorted(used.items(), key=lambda kv: (-len(kv[1]), _natkey(kv[0])))
        parts = []
        for b, s in bases[:OVERVIEW_MAX_BASES]:
            secs = ",".join(str(x) for x in s[:OVERVIEW_MAX_LIST]) + (",..." if len(s) > OVERVIEW_MAX_LIST else "")
            parts.append(f"{_cut(b)} x{len(s)} (sec {secs})")
        if len(bases) > OVERVIEW_MAX_BASES:
            parts.append(f"+{len(bases) - OVERVIEW_MAX_BASES} more shots")
        out.append(f"template shots used: {'; '.join(parts)}")
    in_seq = {_hid(sc.get("id")) for _, sc in seq}
    stub_names = {str(L.get("name")) for L in errs}
    unused = sorted((str(c.get("name")) for c in shots
                     if _hid(c.get("id")) not in in_seq and str(c.get("name")) not in stub_names), key=_natkey)
    if unused:
        line = f"PROJECT_SHOTS not in mainComp: {', '.join(_cut(n) for n in unused[:OVERVIEW_MAX_LIST])}"
        if len(unused) > OVERVIEW_MAX_LIST:
            line += f" +{len(unused) - OVERVIEW_MAX_LIST} more"
        if errs:
            line += f" (unless among the {len(errs)} mainComp layers that failed to extract)"
        out.append(line)
    return out


def _generic_lines(P, limit=12):
    cs = sorted(P.comps, key=lambda c: (-_nlayers(c), _natkey(c.get("name"))))
    out = [f"comps ({len(cs)}, most layers first):"]
    row = [f"{P.label(c)} {_comp_size(c)} {_nlayers(c)}L" for c in cs[:limit]]
    if row:
        out.append("  " + "; ".join(row) + (f"; +{len(cs) - limit} more" if len(cs) > limit else ""))
    return out


def _font_lines(data):
    fonts = [f for f in _list(data.get("fonts")) if isinstance(f, dict)] if isinstance(data, dict) else []
    if not fonts:
        return ["fonts: none recorded"]
    fparts = []
    srt = sorted(fonts, key=lambda f: (not f.get("substitute"), str(f.get("postScriptName"))))
    for f in srt[:OVERVIEW_MAX_FONTS]:
        psn = f.get("postScriptName")
        fam = " ".join(_nm(x) for x in (f.get("family"), f.get("style")) if x)
        s = _cut(psn or fam or "?")
        if f.get("uses") is not None:
            s += f" x{_nm(f.get('uses'))}"
        if f.get("substitute"):
            s += " SUBSTITUTED"
        fparts.append(s)
    if len(fonts) > OVERVIEW_MAX_FONTS:
        fparts.append(f"+{len(fonts) - OVERVIEW_MAX_FONTS} more")
    nsub = sum(1 for f in fonts if f.get("substitute"))
    head = f", {nsub} SUBSTITUTED = not installed, AE renders a fallback" if nsub else ""
    return [f"fonts ({len(fonts)}{head}): " + "; ".join(fparts)]


def _footage_line(P):
    foot = [it for it in P.items if it.get("type") == "footage"]
    missing = [it for it in foot if it.get("missing")] + [it for it in P.items if it.get("type") == "placeholder"]
    if not foot and not missing:
        return "footage: none, missing: none"
    audio_only = sum(1 for it in foot if it.get("hasAudio") and not it.get("hasVideo"))
    stills = sum(1 for it in foot if it.get("still"))
    if missing:
        names = [_cut(it.get("name")) + (" (placeholder)" if it.get("type") == "placeholder" else "")
                 for it in missing[:OVERVIEW_MAX_MISSING]]
        ms = f"missing ({len(missing)}): " + ", ".join(names)
        if len(missing) > OVERVIEW_MAX_MISSING:
            ms += f" +{len(missing) - OVERVIEW_MAX_MISSING} more"
        first = next((it.get("file") for it in missing if it.get("file")), None)
        if first:
            ms += f"; first file: {_trunc_mid(_nm(first), 80)}"
    else:
        ms = "missing: none"
    return f"footage: {len(foot)} ({audio_only} audio-only, {stills} stills), {ms}"


def overview(data, args):
    """One-screen project summary (<= OVERVIEW_BUDGET chars, also on large projects: every list is capped,
    and the shot / section table shrinks until the whole summary fits)."""
    P = Project(data)
    if P.kind == "generic":
        caps = (0,)  # no row table to shrink
    else:
        caps = (OVERVIEW_MAX_SHOT_ROWS if P.kind == "template" else OVERVIEW_MAX_SEQ_ROWS,) + OVERVIEW_ROW_STEPS
    text = ""
    for cap in caps:
        text = _overview(P, data, cap)
        if len(text) <= OVERVIEW_BUDGET:
            break
    return text, EXIT_OK


def _overview(P, data, max_rows):
    m = P.meta
    out = []
    name = _nm(m.get("name") or "Untitled")
    out.append(f"project: {name}" + (f" ({_nm(m.get('path'))})" if m.get("path") else " (never saved)"))
    dirty = m.get("dirty")
    state = "UNSAVED CHANGES (dump = AE memory, not the .aep on disk)" if dirty else ("saved" if dirty is False else "saved=unknown")
    bits = [f"AE {_nm(m.get('aeVersion') or '?')}"]
    if m.get("bitsPerChannel"):
        bits.append(f"{_nm(m['bitsPerChannel'])}bpc")
    if m.get("expressionEngine"):
        bits.append(_nm(m["expressionEngine"]))
    bits.append(state)
    bits.append(f"values at t={_num(m.get('at', 0), 4)}s pre-expression" + (" (+post)" if m.get("post") else ""))
    out.append(" | ".join(bits))
    if m.get("comps"):
        skipped = sum(1 for c in P.comps if c.get("skipped"))
        out.append(f"SCOPED extraction --comps {m['comps']!r}: {skipped} comps skipped (no layers); counts below are partial")

    # kind
    kind = KIND_LABEL[P.kind]
    kd = ""
    if P.kind == "template":
        tgt = "PRECOMPS" if P.folder("PRECOMPS") else ("ORIGINAL_TARGETS" if P.folder("ORIGINAL_TARGETS") else "no PRECOMPS/ORIGINAL_TARGETS folder")
        kd = f" (ORIGINAL_SHOTS {len(P.comps_in('ORIGINAL_SHOTS'))} shots; text/frame comps in {tgt})"
    elif P.kind == "arrangement":
        kd = f" (PROJECT_SHOTS {len(P.comps_in('PROJECT_SHOTS'))} shot instances, PROJECT_TARGETS {len(P.comps_in('PROJECT_TARGETS'))} comps)"
        if P.folder("ORIGINAL_SHOTS"):
            kd += " (also has ORIGINAL_SHOTS)"
    out.append(f"kind: {kind}{kd}")

    # counts
    ec = _project_expr_counts(P)
    by_type = collections.Counter()
    for it in P.items:
        t = it.get("type")
        by_type[_nm(t) if t else ("ERROR" if "error" in it else "?")] += 1
    merrs = m.get("errors") if isinstance(m.get("errors"), list) else []
    mwarns = m.get("warnings") if isinstance(m.get("warnings"), list) else []
    stubs = f" ({ec['layer_errs']} layer error stubs)" if ec["layer_errs"] else ""
    out.append(f"counts: {len(P.items)} items ({_by_count(by_type)}), {ec['layers']} layers{stubs}, {ec['props']} props, "
               f"{ec['exprs']} exprs ({ec['errs']} errors, {ec['off']} disabled); "
               f"extraction {len(merrs)} errors, {len(mwarns)} warnings")
    for e in merrs[:3]:
        if isinstance(e, dict):
            where = (f"{_nm(e.get('comp'))} [{_nm(e.get('index'))}] {_nm(e.get('layer'))}" if e.get("comp")
                     else f"item {_nm(e.get('item'))}")
            out.append(f"  extract error: {where}: {_trunc(e.get('error', ''), 90)}")
    if len(merrs) > 3:
        out.append(f"  ... +{len(merrs) - 3} more extraction errors")
    for w in mwarns[:2]:
        out.append(f"  extract warning: {_trunc(w, 100)}")

    # mainComp + mainControl
    if P.main:
        mc = P.main
        out.append(f"mainComp: {_comp_size(mc)} {_num(mc.get('fps'))}fps {_num(mc.get('duration'))}s {_plural(_nlayers(mc), 'layer')}"
                   + (" (layers not extracted: scoped)" if mc.get("skipped") else "")
                   + (f" (WARNING: {P.n_main} comps named mainComp)" if P.n_main > 1 else ""))
    else:
        out.append("mainComp: MISSING")
    if P.kind != "generic" or P.main:
        out.append(_mc_line(P))

    # kind-specific
    if P.kind == "template":
        out.extend(_template_lines(P, max_rows))
    elif P.kind == "arrangement":
        out.extend(_arrangement_lines(P, max_rows))
    else:
        out.extend(_generic_lines(P))

    out.extend(_font_lines(data))
    out.append(_footage_line(P))
    if P.item_errors:
        out.append(f"item errors ({len(P.item_errors)}): " + "; ".join(
            f"{_nm(it.get('name'))}: {_trunc(it.get('error'), 60)}" for it in P.item_errors[:3])
            + (f"; +{len(P.item_errors) - 3} more" if len(P.item_errors) > 3 else ""))

    # next
    nxt = []
    if ec["errs"] or ec["off"]:
        nxt.append("aectx exprs --errors")
    if m.get("comps"):
        nxt.append("aectx extract (full, without --comps)")
    elif merrs or P.item_errors or ec["layer_errs"]:
        nxt.append("aectx extract (re-run; extraction had errors)")
    if P.kind == "template":
        shots = P.shot_comps()
        first = _rx_arg(shots[0].get("name")) if shots else "01"
        nxt += ["aectx tree", f"aectx tree --comp '^{first}(-text|-frame)?$'", "aectx wiring", "aectx validate", "aectx exprs"]
    elif P.kind == "arrangement":
        shots = P.shot_comps()
        first = _rx_arg(shots[0].get("name")) if shots else "01-1"
        nxt += ["aectx tree", f"aectx tree --comp '^{first}(-text)?$'", "aectx exprs", "aectx wiring", "aectx validate"]
    else:
        nxt += ["aectx tree", "aectx exprs"]
        if P.main:
            nxt.append("aectx validate")
    out.append("next: " + " | ".join(nxt))
    return "\n".join(out)


# ================================================================== tree
def _layer_tail(layer, comp):
    """Everything after the name: '(type) -> source flags...'. Used as the collapse key."""
    typ = layer.get("type") or "?"
    parts = [f"({_nm(typ)})"]
    src = layer.get("source") if isinstance(layer.get("source"), dict) else None
    sname = src.get("name") if src else None
    if sname is not None:
        if typ in ("precomp", "footage") or (typ != "null" and sname != layer.get("name")):
            parts.append(f"-> {_nm(sname)}")
    fl = []
    if layer.get("enabled") is False and typ != "null" and not layer.get("isMatte"):
        fl.append("video-off")
    if layer.get("guide"):
        fl.append("guide")
    if layer.get("solo"):
        fl.append("solo")
    if layer.get("threeD"):
        fl.append("3d")
    if layer.get("timeRemap"):
        fl.append("timeremap")
    if layer.get("stretch") not in (None, 100):
        fl.append(f"stretch={_num(layer.get('stretch'))}%")
    par = layer.get("parent")
    if isinstance(par, dict):
        fl.append(f"parent={_q(par.get('name'))}")
    mt = layer.get("matte")
    if isinstance(mt, dict):
        ml = mt.get("layer") if isinstance(mt.get("layer"), dict) else None
        fl.append(f"matte={_nm(mt.get('type') or '?')}" + (f":{_q(ml.get('name'))}" if ml else ""))
    if layer.get("isMatte"):
        fl.append("is-matte")
    if layer.get("blend"):
        fl.append(f"blend={_nm(layer['blend'])}")
    fx = _effects(layer)
    if fx:
        names = [_nm(e.get("name")) + ("(off)" if e.get("on") is False else "") for e in fx]
        shown = names[:FX_SHOWN] + ([f"+{len(names) - FX_SHOWN}"] if len(names) > FX_SHOWN else [])
        fl.append(f"fx=[{','.join(shown)}]")
    masks = _list(layer.get("masks"))
    if masks:
        fl.append(f"masks={len(masks)}")
    n, bad, keys = _expr_counts(layer)
    if n:
        fl.append(f"expr={n}" + (f" !err={bad}" if bad else ""))
    if keys:
        fl.append(f"keyed={keys}")
    mk = _list(layer.get("markers"))
    if mk:
        fl.append(f"markers={len(mk)}")
    if typ == "text":
        st = _source_text(layer)
        v = st.get("v") if st else None
        if isinstance(v, dict) and v.get("text") is not None:
            fl.append(f'text="{_trunc(v.get("text"), TREE_TEXT_SAMPLE)}"')
    i, o = _f(layer.get("in")), _f(layer.get("out"))
    dur = _f(comp.get("duration"))
    fps = _f(comp.get("fps"), 30.0) or 30.0
    half = 0.5 / fps
    if i is not None and o is not None and dur is not None and (i > half or o < dur - half):
        fl.append(f"t={_num(i)}-{_num(o)}")
    return " ".join(parts + fl)


def _comp_rows(comp):
    """Layer rows [first_index, last_index, name, tail, count, collapsible]; consecutive identical
    (name, tail) runs collapsed. Error stubs never collapse."""
    rows = []
    for pos, L in enumerate(_layers(comp), 1):
        ix = L.get("index")
        idx = ix if isinstance(ix, int) and not isinstance(ix, bool) else pos
        name = _nm(L.get("name"))
        if "error" in L:
            rows.append([idx, idx, name, f"!LAYER ERROR: {_trunc(L.get('error'), 100)}", 1, False])
            continue
        tail = _layer_tail(L, comp)
        if rows and rows[-1][5] and rows[-1][2] == name and rows[-1][3] == tail and rows[-1][1] == idx - 1:
            rows[-1][1] = idx
            rows[-1][4] += 1
        else:
            rows.append([idx, idx, name, tail, 1, True])
    return rows


def _fmt_row(a, b, name, tail, cnt):
    rng = f"[{a}]" if a == b else f"[{a}-{b}]"
    return f"  {rng} {name}" + (f" x{cnt}" if cnt > 1 else "") + f" {tail}"


def _row_lines(rows):
    return [_fmt_row(*r[:5]) for r in rows]


def _comp_header(P, c):
    bits = [f"== {P.label(c)}", _comp_size(c), f"{_num(c.get('fps'))}fps", f"{_num(c.get('duration'))}s",
            _plural(_nlayers(c), "layer")]
    mk = _list(c.get("markers"))
    if mk:
        bits.append(f"markers={len(mk)}")
    fn = P.folder_name(c)
    if fn:
        bits.append(f"[{_nm(fn)}]")
    return " ".join(bits)


def _runs(nums):
    out = []
    for k in nums:
        if out and k == out[-1][1] + 1:
            out[-1][1] = k
        else:
            out.append([k, k])
    return out


def _delta(ref_label, ref_rows, ref_lines, rows, lines, full_cmd):
    """Delta rendering of a comp against a comp printed in full, or None when they are not similar.
    Equal lines are identical strings (index included). Every index of this comp is either an unlisted
    line of the reference or a printed line; every index of the reference that this comp lacks is a
    '- ' line (also when difflib reports it inside a 'replace', e.g. a shorter comp with a changed tail)."""
    if lines == ref_lines:
        return [f"  (layers identical to {ref_label})"]
    sm = difflib.SequenceMatcher(None, ref_lines, lines, autojunk=False)
    if sm.ratio() < SIMILAR_RATIO:
        return None
    here = set()
    for r in rows:
        here.update(range(r[0], r[1] + 1))
    body, gone = [], False
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        for r in ref_rows[i1:i2]:
            for a, b in _runs([k for k in range(r[0], r[1] + 1) if k not in here]):
                gone = True
                body.append("  - " + _fmt_row(a, b, r[2], r[3], b - a + 1).lstrip())
        body.extend(lines[j1:j2])
    if not body:
        return None
    note = f"; '- ' = layer of {ref_label} absent here" if gone else ""
    return [f"  (same as {ref_label} except these lines; other indices identical{note}; full: {full_cmd})"] + body


def _tree_selection(P, args):
    rx_s = getattr(args, "comp", None)
    want_all = bool(getattr(args, "all", None))
    if P.kind == "generic":
        default = list(P.comps)
    else:
        default = ([P.main] if P.main else []) + P.shot_comps()
    if not default:
        default = list(P.comps)
    if want_all or rx_s:
        ids = {id(c) for c in default}
        pool = default + [c for c in P.comps if id(c) not in ids]
    else:
        pool = default
    if rx_s:
        rx = re.compile(rx_s)
        pool = [c for c in pool if rx.search(str(c.get("name", "")))]
    return pool


def _chars(lines):
    return sum(len(x) + 1 for x in lines)


def tree(data, args):
    """Per-comp layer tree. Default comps: mainComp + shot comps (ORIGINAL_SHOTS / PROJECT_SHOTS);
    generic projects: all comps. --comp RX searches ALL comps (re.search on names); --all adds every comp.
    A comp whose lines are >= 60% identical to a comp printed in full earlier is printed as a delta against it
    when that saves both lines and chars; the delta note says how to print it whole. --full disables deltas.
    Comps sharing a name are labelled NAME#id."""
    P = Project(data)
    rx_s = getattr(args, "comp", None)
    try:
        comps = _tree_selection(P, args)
    except re.error as e:
        return f"tree: invalid --comp regex {rx_s!r}: {e}", EXIT_ERROR
    if not P.comps:
        return "tree: the dump has no comps", EXIT_OK
    if not comps:
        names = sorted({_nm(c.get("name")) for c in P.comps}, key=_natkey)
        more = f" +{len(names) - 40} more" if len(names) > 40 else ""
        return f"tree: no comp matches --comp {rx_s!r}. comps: {', '.join(names[:40])}{more}", EXIT_ERROR
    scope = "selected" if rx_s else ("all" if getattr(args, "all", None) else f"default for {KIND_LABEL[P.kind]}")
    out = [f"{_plural(len(comps), 'comp')} ({scope}). [index] name (type) -> source flags; identical consecutive layers"
           f" collapsed; a comp like an earlier one lists only its differing lines"]
    full = bool(getattr(args, "full", None))
    printed = []  # (label, rows, lines) of comps printed in full: the only valid delta references
    for c in comps:
        out.append(_comp_header(P, c))
        if c.get("skipped"):
            out.append("  (layers not extracted: outside the extract --comps scope)")
            continue
        rows = _comp_rows(c)
        if not rows:
            out.append("  (no layers)" if not c.get("numLayers") else f"  (no layer records; numLayers={_nm(c.get('numLayers'))})")
            continue
        lines = _row_lines(rows)
        shown = None
        if not full:
            full_cmd = f"aectx tree --comp '^{_rx_arg(c.get('name'))}$'"
            for ref_label, ref_rows, ref_lines in printed:
                d = _delta(ref_label, ref_rows, ref_lines, rows, lines, full_cmd)
                if d is not None and (shown is None or _chars(d) < _chars(shown)):
                    shown = d
        if shown is not None and len(shown) < len(lines) and _chars(shown) < _chars(lines):  # must save both
            out.extend(shown)
        else:
            printed.append((P.label(c), rows, lines))
            out.extend(lines)
    if getattr(args, "all", None) and P.item_errors:
        out.append("item errors: " + "; ".join(f"{_nm(it.get('name'))}: {_trunc(it.get('error'), 60)}" for it in P.item_errors))
    return "\n".join(out), EXIT_OK
