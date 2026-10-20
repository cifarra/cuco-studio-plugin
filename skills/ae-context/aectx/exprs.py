"""aectx.exprs - offline expression views over an aectx/2 dump.

    exprs(data, args) -> (text, exit_code)

Modes (first one set wins; default --index):
  --show ID     one cluster in full: exemplar source, varying literal slots, members (one row each, or one row per
                distinct slot-value tuple when there are few)  (unknown ID: exit 2)
  --refs NAME   clusters/locations whose source references NAME - layer()/effect()/comp("NAME") calls, string
                literals equal to NAME, whole-word uses outside string literals - with per-comp counts
  --errors      every expression with xErr or xOn == false (exit 1 if any): summary first (distinct messages,
                cluster tally), then one line each up to ERR_LIST, beyond that grouped by (cluster, message)
  --index       clusters by member count, compressed locations, varying slots (<= INDEX_BUDGET chars)
  --comp REGEX  restricts every mode to comps whose name matches (re.search)

Clustering. Each expression body is normalized: comments dropped, string literals and numeric literals
(a unary minus folds into its number, also as '- 5') become a placeholder, whitespace is collapsed
(removed entirely unless it separates two words). The normalized text is the cluster key; the cluster ID
is "E" + the first 5 hex digits of sha1(key) - stable across runs and extractions (extended to more
digits only if two keys in one dump share the prefix). Clusters are always built over the whole dump, so
--comp never changes an ID. "Slot #n" is the n-th literal (1-based) of the body; a slot "varies" when
members differ there. Measured: steel 836 expressions -> 96 clusters, arr746 910 -> 57.

Output is plain text, one record per line, deterministic order. Control characters in comp/layer/prop
names are escaped (\\n, \\t, \\xNN); non-ASCII characters in names and expression source pass through.
--index, --refs and --errors are budgeted (<= INDEX_BUDGET chars), --show <= SHOW_BUDGET plus the
exemplar source (printed as is, line breaks normalized to \\n).
"""
import hashlib
import re
from collections import OrderedDict, defaultdict
from functools import lru_cache

EXIT_OK, EXIT_FINDINGS, EXIT_ERROR = 0, 1, 2

INDEX_BUDGET = 17800      # hard cap (chars) for --index / --refs / --errors text (+ the CLI's dump header <= 18000)
SHOW_BUDGET = 17800       # cap (chars) for --show apart from the exemplar source
SNIPPET = 70              # chars of the exemplar's result statement on a cluster header line
LOC_CHARS = 480           # location text per cluster in --index / --refs (each line clipped to it)
REFS_CHARS = 200          # refs= text on a header line
LEGEND_MAX = 12           # R-aliases for repeated refs= strings in --index
PER_COMP_MAX = 25         # comps listed on the --refs 'per comp:' line
SLOTS_SHOWN = 6           # varying slots per cluster in --index
SHOW_ROWS = 400           # member rows in --show
SHOW_COLS = 16            # varying-slot columns in the --show member table
ERR_TEXT = 160            # chars of an error message's first line
ERR_LIST = 60             # --errors lists every broken expression up to this many; beyond, grouped by cluster
ERR_MSGS = 12             # distinct error messages listed in the --errors summary
MIN_PREFIX = 3            # hex digits needed to resolve a --show ID by prefix
PH = "\u00a7"        # placeholder for literals inside cluster keys (never printed)
_CTL = re.compile(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]")   # C0/C1 controls + Unicode line separators
_CTL_ESC = {"\n": "\\n", "\r": "\\r", "\t": "\\t"}

_DIGITS = "0123456789"
_NUM_RX = re.compile(r"0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")
_EXPR_KW = frozenset(("return", "case", "typeof", "in", "of", "else", "void", "delete", "throw",
                      "do", "new", "instanceof", "yield", "await"))
_REF_CALL = re.compile(r"\b(comp|layer|effect)\s*\(\s*(\"(?:[^\"\\\n]|\\.)*\"|'(?:[^'\\\n]|\\.)*'|\d+)\s*\)")
_ALIAS_LHS = re.compile(r"([A-Za-z_$][\w$]*)\s*=\s*(?:comp\s*\(\s*(?:\"[^\"\n]*\"|'[^'\n]*')\s*\)\s*\.\s*|"
                        r"[A-Za-z_$][\w$.]*\s*\.\s*)?$")


# ================================================================== normalization
def _is_word(c):
    return c.isalnum() or c in "_$" or c == PH


def _one(s):
    """A name as one printable line: control characters escaped (\\n, \\t, \\xNN, \\u2028)."""
    s = str(s)
    if not _CTL.search(s):
        return s
    return _CTL.sub(lambda m: _CTL_ESC.get(m.group(0)) or ("\\x%02x" % ord(m.group(0)) if ord(m.group(0)) < 256
                                                          else "\\u%04x" % ord(m.group(0))), s)


def _breaks(s):
    """The line breaks inside s (kept when a comment / string is blanked, so line numbers survive)."""
    return "".join(ch for ch in s if ch in "\r\n")


@lru_cache(maxsize=8192)
def _scan(src):
    """Tokenize an expression body. Returns (key, literals, positions, code, masked).

    literals: raw source text of every string/number literal in order (a folded unary minus included);
    positions: their start offsets in src; code: src with comments blanked (line breaks kept);
    masked: code with every string literal emptied as well (same line structure)."""
    out, lits, pos, code, masked = [], [], [], [], []
    i, n = 0, len(src)
    expr_start = True      # True where an operand is expected (start, after an operator / keyword)
    space = False          # whitespace (or a comment) seen since the last emitted token

    def emit(tok, operand_next):
        nonlocal space, expr_start
        if space and out and _is_word(out[-1][-1]) and _is_word(tok[0]):
            out.append(" ")
        out.append(tok)
        space = False
        expr_start = operand_next

    def keep(text, blank=None):
        code.append(text)
        masked.append(text if blank is None else blank)

    while i < n:
        c = src[i]
        nx = src[i + 1] if i + 1 < n else ""
        if c == "/" and nx == "/":                       # line comment (its newline is kept)
            j = src.find("\n", i)
            j = n if j < 0 else j
            keep(" ")
            space = True
            i = j
            continue
        if c == "/" and nx == "*":                       # block comment: blanked, line breaks kept
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            keep(" " + _breaks(src[i:j]))
            space = True
            i = j
            continue
        if c.isspace():
            j = i
            while j < n and src[j].isspace():
                j += 1
            keep(src[i:j])
            space = True
            i = j
            continue
        if c in "\"'`":                                  # string / template literal
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "\n" and c != "`":
                    break
                j += 1
            j = min(j + 1, n) if j < n and src[j] == c else j
            lits.append(src[i:j])
            pos.append(i)
            keep(src[i:j], c + _breaks(src[i + 1:j]) + c)
            emit(PH, False)
            i = j
            continue
        starts_num = c in _DIGITS or (c == "." and nx in _DIGITS and nx != "")
        num_at = i
        if c == "-" and expr_start:                      # unary minus, also '- 5'
            k = i + 1
            while k < n and src[k] in " \t":
                k += 1
            if k < n and (src[k] in _DIGITS or (src[k] == "." and k + 1 < n and src[k + 1] in _DIGITS)):
                num_at = k
        if starts_num or num_at != i:                    # number (unary minus folded in)
            m = _NUM_RX.match(src, num_at)
            j = m.end()
            lits.append(src[i:j])
            pos.append(i)
            keep(src[i:j])
            emit(PH, False)
            i = j
            continue
        if c.isalpha() or c in "_$":                     # identifier / keyword
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            w = src[i:j]
            keep(w)
            emit(w, w in _EXPR_KW)
            i = j
            continue
        if c == "/" and expr_start:                      # regex literal: kept verbatim (it is code)
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
            if j < n and src[j] == "/":
                j += 1
                while j < n and src[j].isalpha():
                    j += 1
                keep(src[i:j])
                emit(src[i:j], False)
                i = j
                continue
        if c in "+-" and nx == c:                        # ++ / --: postfix ends an operand, prefix does not
            keep(c + c)
            emit(c + c, expr_start)
            i += 2
            continue
        keep(c)
        emit(c, c not in ")]")
        i += 1
    return "".join(out), tuple(lits), tuple(pos), "".join(code), "".join(masked)


def normalize(src):
    """(cluster key, [raw literal text, ...]) for an expression body."""
    key, lits = _scan(src or "")[:2]
    return key, list(lits)


def strip_comments(src):
    """Expression source with // and /* */ comments blanked (strings kept, line breaks kept)."""
    return _scan(src or "")[3]


def mask_strings(src):
    """strip_comments(src) with every string literal emptied (same line structure)."""
    return _scan(src or "")[4]


def _sha(key):
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def cluster_id(key):
    """Stable cluster ID for a normalized key (the short form; see assign_ids for collisions)."""
    return "E" + _sha(key)[:5]


def assign_ids(keys):
    """{key: ID}; IDs are 'E'+5 hex, extended for keys whose 5-hex prefixes collide."""
    full = {k: _sha(k) for k in keys}
    by_prefix = defaultdict(list)
    for k in keys:
        by_prefix[full[k][:5]].append(k)
    ids = {}
    for p, ks in by_prefix.items():
        if len(ks) == 1:
            ids[ks[0]] = "E" + p
            continue
        w = 6
        while len({full[k][:w] for k in ks}) < len(ks):
            w += 1
        for k in ks:
            ids[k] = "E" + full[k][:w]
    return ids


# ================================================================== literal values
def _lit_num(raw):
    """Numeric value of a raw literal, or None for strings."""
    if not raw or raw[0] in "\"'`":
        return None
    neg = raw.startswith("-")
    body = (raw[1:] if neg else raw).strip()
    try:
        v = float(int(body, 16)) if body[:2] in ("0x", "0X") else float(body)
    except ValueError:
        return None
    return -v if neg else v


def _clip(s, w):
    s = " ".join(_CTL.sub(" ", str(s)).split())
    return s if len(s) <= w else s[:max(1, w - 3)] + "..."


def _fmt_values(raws, max_list=3):
    """Compact description of the distinct values one slot takes."""
    distinct = sorted(set(raws))
    nums = [_lit_num(r) for r in distinct]
    if all(v is not None for v in nums):
        pairs = sorted(zip(nums, distinct))
        if len(pairs) <= max_list:
            return "|".join(r for _, r in pairs)
        lo, hi = pairs[0], pairs[-1]
        ints = all(v == int(v) for v, _ in pairs)
        contiguous = ints and (hi[0] - lo[0] + 1) == len(pairs)
        return f"{lo[1]}..{hi[1]}" + ("" if contiguous else f"({len(pairs)} vals)")
    shown = [_clip(r, 24) for r in distinct[:max_list]]
    more = len(distinct) - max_list
    return "|".join(shown) + (f"|+{more}" if more > 0 else "")


# ================================================================== references
def parse_refs(src, code=None):
    """Syntactic references of one body: (layers, comps). code: strip_comments(src) when already at hand.

    layers: OrderedDict layer -> [effect, ...] (first-occurrence order; 'this' = the expression's own
    layer, 'layer(3)' = by index, 'X?' = effect on an unresolved receiver X); comps: [name, ...]."""
    code = strip_comments(src) if code is None else code
    layers, comps = OrderedDict(), []
    aliases = {"thisLayer": "this"}
    layer_end = {}
    for m in _REF_CALL.finditer(code):
        fn, arg = m.group(1), m.group(2)
        name = arg[1:-1] if arg[0] in "\"'" else f"{fn}({arg})"
        if fn == "comp":
            if name not in comps:
                comps.append(name)
            continue
        if fn == "layer":
            layers.setdefault(name, [])
            layer_end[m.end()] = name
            rest = code[m.end():m.end() + 2].lstrip(" \t")
            if not rest or rest[0] in ";,\n\r)":
                line_start = max(code.rfind(ch, 0, m.start()) for ch in ";\n\r{") + 1
                lm = _ALIAS_LHS.search(code, line_start, m.start())
                if lm:
                    aliases[lm.group(1)] = name
            continue
        # effect(...): find its receiver
        j = m.start() - 1
        while j >= 0 and code[j] in " \t\r\n":           # a chain may break the line before the '.'
            j -= 1
        owner = "this"
        if j >= 0 and code[j] == ".":
            j -= 1
            while j >= 0 and code[j] in " \t\r\n":
                j -= 1
            if j >= 0 and code[j] == ")":
                owner = layer_end.get(j + 1, "?")
            else:
                k = j
                while k >= 0 and (code[k].isalnum() or code[k] in "_$"):
                    k -= 1
                ident = code[k + 1:j + 1]
                owner = aliases.get(ident, f"{ident}?" if ident else "?")
        if fn == "effect" and arg[0] not in "\"'":
            name = f"#{arg}"
        fx = layers.setdefault(owner, [])
        if name not in fx:
            fx.append(name)
    return layers, comps


def _merge_refs(acc, src, code=None):
    layers, comps = parse_refs(src, code)
    for ln, fx in layers.items():
        tgt = acc[0].setdefault(ln, [])
        for f in fx:
            if f not in tgt:
                tgt.append(f)
    for c in comps:
        if c not in acc[1]:
            acc[1].append(c)


def _fmt_refs(acc, width=None):
    """'layer:fx,fx|layer|comp("X")', or '-'; with width, parts that do not fit become '|+N more'."""
    layers, comps = acc
    parts = []
    for ln, fx in layers.items():
        parts.append(_one(f"{ln}:{','.join(fx)}" if fx else ln))
    parts += [_one(f'comp("{c}")') for c in comps]
    if not parts:
        return "-"
    text = "|".join(parts)
    if width is None or len(text) <= width:
        return text
    kept, used = [], 0
    for p in parts:
        if used + len(p) + 1 > width - 12:
            break
        kept.append(p)
        used += len(p) + 1
    if not kept:
        return _clip(parts[0], width - 12) + f"|+{len(parts) - 1} more"
    return "|".join(kept) + f"|+{len(parts) - len(kept)} more"


# ================================================================== collection
def _ltag(idx, guessed):
    """Layer index as printed: '7', or '~7' when the dump had no usable index (list position used)."""
    return f"~{idx}" if guessed else str(idx)


class Member:
    __slots__ = ("comp", "corder", "lidx", "lname", "path", "src", "scan", "key", "lits", "pos", "err", "off", "cid",
                 "lguess")

    def __init__(self, comp, corder, lidx, lname, path, src, lguess=False):
        self.comp, self.corder, self.lidx, self.lname, self.path, self.src = comp, corder, lidx, lname, path, src
        self.lguess = lguess
        self.scan = _scan(src)            # (key, lits, pos, code, masked), kept: large dumps overflow the lru cache
        self.key, self.lits, self.pos = self.scan[:3]
        self.err = None
        self.off = False
        self.cid = None

    @property
    def layer(self):
        return f"[{_ltag(self.lidx, self.lguess)}] {self.lname}"

    @property
    def where(self):
        return f"{self.comp} / {self.layer} / {self.path}"


class Cluster:
    def __init__(self, key, cid, members):
        self.key, self.id, self.members = key, cid, members

    @property
    def exemplar(self):
        return self.members[0]


def _lidx(layer, fallback):
    """(index, guessed): the layer's own index (int, integral float or digit string), else the 1-based list
    position marked as guessed."""
    v = layer.get("index")
    if isinstance(v, bool):
        v = None
    elif isinstance(v, float) and v.is_integer():
        v = int(v)
    elif isinstance(v, str) and v.strip().isdigit():
        v = int(v.strip())
    if isinstance(v, int):
        return v, False
    return fallback, True


def collect(data):
    """All expressions in dump order. Returns (members, comps, notes).

    comps: [(label, item)] for every comp item (labels are unique: duplicates get '#id');
    notes: dict with 'item_errors', 'layer_errors', 'skipped' lists."""
    items = [it for it in (data.get("items") or []) if isinstance(it, dict)]
    comp_items = [it for it in items if it.get("type") == "comp" and "error" not in it]
    counts = defaultdict(int)
    for it in comp_items:
        counts[str(it.get("name"))] += 1
    comps = []
    for it in comp_items:
        nm = str(it.get("name"))
        comps.append((_one(nm if counts[nm] == 1 else f"{nm}#{it.get('id')}"), it))
    notes = {"item_errors": [it for it in items if "error" in it], "layer_errors": [], "skipped": []}
    members = []
    for corder, (label, it) in enumerate(comps):
        if it.get("skipped"):
            notes["skipped"].append(label)
        for li, layer in enumerate(it.get("layers") or []):
            if not isinstance(layer, dict):
                continue
            if "error" in layer:
                notes["layer_errors"].append((label, layer))
                continue
            lidx, lguess = _lidx(layer, li + 1)
            lname = _one(layer.get("name", "?"))
            for prop in layer.get("props") or []:
                if not isinstance(prop, dict):
                    continue
                src = prop.get("x")
                flagged = bool(prop.get("xErr")) or prop.get("xOn") is False
                if not (isinstance(src, str) and src.strip()) and not flagged:
                    continue
                src = src if isinstance(src, str) else ""
                m = Member(label, corder, lidx, lname, _one(prop.get("path", "?")), src, lguess)
                e = prop.get("xErr")
                if e:
                    m.err = str(e)
                if prop.get("xOn") is False:
                    m.off = True
                members.append(m)
    return members, comps, notes


def build_clusters(members):
    """Clusters (sorted by member count desc, then ID); sets Member.cid."""
    groups = OrderedDict()
    for m in members:
        groups.setdefault(m.key, []).append(m)
    ids = assign_ids(list(groups))
    out = []
    for k, ms in groups.items():
        for m in ms:
            m.cid = ids[k]
        out.append(Cluster(k, ids[k], ms))
    out.sort(key=lambda c: (-len(c.members), c.id))
    return out


# ================================================================== text helpers
_TRIVIAL_LINE = re.compile(r"^[\s{}()\[\];,]*$")


def _meaningful_lines(src):
    code = strip_comments(src)
    return [ln.strip() for ln in code.splitlines() if ln.strip() and not _TRIVIAL_LINE.match(ln)]


def snippet(src, width=SNIPPET):
    """One-line gist: the body itself when it is one statement line, else '=> ' + its last (result) line."""
    lines = _meaningful_lines(src)
    if not lines:
        return "(empty)"
    if len(lines) == 1:
        return _clip(lines[0], width)
    return "=> " + _clip(lines[-1], width - 3)


def _ranges(nums, text=None):
    """[1,2,3,5] -> '1-3,5'; text maps a number to how it is printed (keeps zero padding: '01-03')."""
    nums = sorted(set(nums))
    t = text.get if text else str
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(t(nums[i]) if i == j else f"{t(nums[i])}-{t(nums[j])}")
        i = j + 1
    return ",".join(out)


_TAIL_NUM = re.compile(r"^(.*?)(\d+)(\D*)$")


def _numbered(names):
    """(prefix, suffix, {num: digits}) when every name is prefix + a distinct number + suffix and the numbers
    are printed consistently (all unpadded, or all zero-padded to one width); else None."""
    ms = [_TAIL_NUM.match(nm) for nm in names]
    if not all(ms) or len({(m.group(1), m.group(3)) for m in ms}) != 1:
        return None
    digits = [m.group(2) for m in ms]
    text = {int(d): d for d in digits}
    if len(text) != len(digits):
        return None
    if not (all(str(int(d)) == d for d in digits) or len({len(d) for d in digits}) == 1):
        return None
    return ms[0].group(1), ms[0].group(3), text


def _layer_runs(layers):
    """[(index, name, guessed)] -> '[7-13] 01-text, [14] 01 text rig': same-name layers collapse; three or
    more numbered names stepping with the index collapse too ('[1-400] Shape Layer {1-400}')."""
    byname = OrderedDict()
    for idx, name, g in sorted(set(layers), key=lambda t: (t[0], t[1], t[2])):
        byname.setdefault((name, g), []).append(idx)
    entries, lock = [], OrderedDict()            # lock: (prefix, suffix, guessed, idx - num) -> [(idx, name)]
    for (name, g), ix in byname.items():
        m = _TAIL_NUM.match(name) if len(ix) == 1 else None
        if m:
            lock.setdefault((m.group(1), m.group(3), g, ix[0] - int(m.group(2))), []).append((ix[0], name))
        else:
            tag = "~" if g else ""
            entries.append((ix[0], f"[{tag}{_ranges(ix)}] {name}"))
    for (pre, suf, g, _), group in lock.items():
        tag = "~" if g else ""
        num = _numbered([nm for _, nm in group]) if len(group) >= 3 else None
        if num is None:
            entries += [(ix, f"[{tag}{ix}] {nm}") for ix, nm in group]
            continue
        entries.append((group[0][0], f"[{tag}{_ranges([ix for ix, _ in group])}] "
                                     f"{pre}{{{_ranges(list(num[2]), num[2])}}}{suf}"))
    entries.sort(key=lambda e: e[0])
    return ", ".join(t for _, t in entries)


def _join_names(names):
    """Comp names as a ','-list; runs of 3+ numbered names compress ('{01-06}', '01-{1-3,5}') when that
    saves at least 4 chars."""
    plain = ",".join(names)
    if len(names) < 3:
        return plain
    groups = OrderedDict()                       # (prefix, suffix) -> [name]
    for nm in names:
        m = _TAIL_NUM.match(nm)
        groups.setdefault((m.group(1), m.group(3)) if m else (None, nm), []).append(nm)
    parts = []
    for (pre, suf), nms in groups.items():
        num = _numbered(nms) if pre is not None and len(nms) >= 3 else None
        if num is not None:
            packed = f"{pre}{{{_ranges(list(num[2]), num[2])}}}{suf}"
            if len(packed) + 4 <= len(",".join(nms)):
                parts.append(packed)
                continue
        parts += nms
    out = ",".join(parts)
    return out if len(out) + 4 <= len(plain) else plain


def _compress_tokens(toks):
    """['Group 1','Group 2','Group 3'] -> 'Group {1-3}'; otherwise '{a,b}'."""
    if len(toks) == 1:
        return toks[0]
    ms = [_TAIL_NUM.match(t) for t in toks]
    if all(ms) and len({(m.group(1), m.group(3)) for m in ms}) == 1:
        nums = [int(m.group(2)) for m in ms]
        if len(set(nums)) == len(nums) and all(str(int(m.group(2))) == m.group(2) for m in ms):
            return f"{ms[0].group(1)}{{{_ranges(nums)}}}{ms[0].group(3)}"
    return "{" + ",".join(toks) + "}"


def compress_paths(paths):
    """Factor a common '/'-prefix and suffix: 'Effects/CC Light Sweep/{Center,Direction}'."""
    paths = list(OrderedDict.fromkeys(paths))
    if len(paths) == 1:
        return paths[0]
    split = [p.split("/") for p in paths]
    pre = 0
    while all(len(s) > pre + 1 for s in split) and len({s[pre] for s in split}) == 1:
        pre += 1
    suf = 0
    while all(len(s) > pre + suf + 1 for s in split) and len({s[-1 - suf] for s in split}) == 1:
        suf += 1
    mids = ["/".join(s[pre:len(s) - suf]) for s in split]
    head = "/".join(split[0][:pre])
    tail = "/".join(split[0][len(split[0]) - suf:]) if suf else ""
    mid = _compress_tokens(mids)
    return (head + "/" if head else "") + mid + ("/" + tail if tail else "")


def location_lines(members, width=200):
    """Compressed locations: 'comp[,comp]/[7-13] layer[; comp/[..] layer] :: path'.

    Members are grouped by (comp, prop path); same-name layer runs collapse; paths with the same layers
    are factored ('Effects/X/{A,B}'); comps with identical layers+paths merge ('01,05/...'); comp groups
    sharing a path pattern share a line ('; '-separated, wrapped at `width`)."""
    per = OrderedDict()                                   # comp -> path -> [(idx, name)]
    for m in members:
        per.setdefault(m.comp, OrderedDict()).setdefault(m.path, []).append((m.lidx, m.lname, m.lguess))
    step = OrderedDict()                                  # (comp, runs) -> [path]
    for comp, paths in per.items():
        for path, layers in paths.items():
            step.setdefault((comp, _layer_runs(layers)), []).append(path)
    merged = OrderedDict()                                # (runs, paths) -> [comp]
    for (comp, runs), paths in step.items():
        merged.setdefault((runs, compress_paths(paths)), []).append(comp)
    by_path = OrderedDict()                               # paths -> ["comps/runs", ...]
    for (runs, paths), comps in merged.items():
        by_path.setdefault(paths, []).append(f"{_join_names(comps)}/{runs}")
    lines = []
    for paths, entries in by_path.items():
        cur = []
        for e in entries:
            if cur and len("; ".join(cur + [e])) + len(paths) + 4 > width:
                lines.append(f"{'; '.join(cur)} :: {paths}")
                cur = []
            cur.append(e)
        lines.append(f"{'; '.join(cur)} :: {paths}")
    return lines


# ================================================================== slot variation
def _depends(members, s, keyfn):
    seen = {}
    for m in members:
        k = keyfn(m)
        v = m.lits[s]
        if seen.setdefault(k, v) != v:
            return False
    return True


def _index_relation(members, s):
    """'(=idx-7)' / '(=13-idx)' / '(=c-idx, c per comp)' when a per-layer integer slot tracks the layer index.

    Only claimed when some comp has 3+ distinct layers (with two layers per comp any two-valued slot fits)."""
    vals = []
    for m in members:
        v = _lit_num(m.lits[s])
        if v is None or v != int(v) or m.lguess:
            return ""
        vals.append((m, int(v)))
    per = defaultdict(set)
    for m in members:
        per[m.comp].add(m.lidx)
    if max(len(x) for x in per.values()) < 3:
        return ""
    for sl in (1, -1):
        per_comp = {}
        if all(per_comp.setdefault(m.comp, v - sl * m.lidx) == v - sl * m.lidx for m, v in vals):
            consts = set(per_comp.values())
            if len(consts) == 1:
                b = consts.pop()
                return ("(=idx" + (f"{b:+d}" if b else "") + ")") if sl == 1 else f"(={b}-idx)"
            return "(=idx+c, c per comp)" if sl == 1 else "(=c-idx, c per comp)"
    return ""


def varying_slots(members):
    """[(slot_no 1-based, dim, values_text)] for literal slots that differ across members.

    dim: 'comp' (constant within each comp), 'layer' (within each layer), 'prop' (within each prop path
    of a comp), 'each' (none of these). When both 'layer' and 'prop' hold, the coarser one (fewer groups)
    wins: with one member per layer 'layer' is trivially true and says nothing."""
    if len(members) < 2:
        return []
    n = min(len(m.lits) for m in members)
    n_layer = len({(m.comp, m.lidx) for m in members})
    n_prop = len({(m.comp, m.path) for m in members})
    out = []
    for s in range(n):
        vals = [m.lits[s] for m in members]
        if len(set(vals)) == 1:
            continue
        if _depends(members, s, lambda m: m.comp):
            dim = "comp"
        else:
            bl = _depends(members, s, lambda m: (m.comp, m.lidx))
            bp = _depends(members, s, lambda m: (m.comp, m.path))
            dim = "prop" if bp and (not bl or n_prop < n_layer) else "layer" if bl else "each"
        txt = _fmt_values(vals)
        if dim == "layer":
            txt += _index_relation(members, s)
        out.append((s + 1, dim, txt))
    return out


def _fmt_vary(slots, limit=SLOTS_SHOWN):
    if not slots:
        return ""
    by = OrderedDict((d, []) for d in ("comp", "layer", "prop", "each"))
    for no, dim, txt in slots[:limit]:
        by[dim].append(f"#{no}={txt}")
    parts = [f"{d}: {' '.join(v)}" for d, v in by.items() if v]
    more = len(slots) - limit
    return "vary " + "; ".join(parts) + (f"; +{more} more slots" if more > 0 else "")


def _slot_context(m, slot_no, width=60):
    """'L24: var IDX = <<0>>;' for the slot in member m's source."""
    s = slot_no - 1
    p = m.pos[s]
    raw = m.lits[s]
    src = m.src
    ls = max(src.rfind("\n", 0, p), src.rfind("\r", 0, p)) + 1
    le_candidates = [x for x in (src.find("\n", p), src.find("\r", p)) if x >= 0]
    le = min(le_candidates) if le_candidates else len(src)
    line_no = src.count("\n", 0, p) + 1 if "\n" in src else src.count("\r", 0, p) + 1
    left = _CTL.sub(" ", src[ls:p]).lstrip()
    right = _CTL.sub(" ", src[p + len(raw):le]).rstrip()
    lw = max(10, (width - len(raw)) * 2 // 3)
    rw = max(6, width - len(raw) - lw)
    if len(left) > lw:
        left = "..." + left[-(lw - 3):]
    if len(right) > rw:
        right = right[:rw - 3] + "..."
    return f"L{line_no}: {left}<<{_clip(raw, 40)}>>{right}"


# ================================================================== shared rendering
def _flags(members):
    e = sum(1 for m in members if m.err)
    o = sum(1 for m in members if m.off)
    return (f" ERR={e}" if e else "") + (f" OFF={o}" if o else "")


def _refs_acc(members):
    """Merged (layers, comps) references of the members' distinct sources."""
    acc, seen = (OrderedDict(), []), set()
    for m in members:
        if m.src not in seen:
            seen.add(m.src)
            _merge_refs(acc, m.src, m.scan[3])
    return acc


def refs_text(members, width=REFS_CHARS):
    """Union of the syntactic references of the members' (distinct) sources, as one string."""
    return _fmt_refs(_refs_acc(members), width)


def _header(c, members, total=None, refs=None):
    ex = members[0]
    count = f"x{len(members)}" + (f"/{total}" if total is not None and total != len(members) else "")
    lines = len(ex.src.splitlines()) or 1
    refs = refs if refs is not None else refs_text(members)
    return f"{c.id} {count} L={lines} C={len(ex.src)}{_flags(members)} refs={refs}  {snippet(ex.src)}"


def _clip_loc(line, width):
    """Clip a location line to width, keeping its ' :: prop path' tail visible."""
    if len(line) <= width:
        return line
    head, sep, path = line.rpartition(" :: ")
    if not sep:
        return _clip(line, width)
    path = _clip(path, max(24, width // 3))
    return _clip(head, max(12, width - len(path) - 4)) + " :: " + path


def _loc_block(members, limit=LOC_CHARS, locs=None, indent="  ", more=" (--show ID lists every member)"):
    """(lines, complete): location lines (indented, each clipped to `limit`) up to `limit` chars in all,
    then '... +N more location lines' + more; complete is False when anything was clipped or cut."""
    locs = location_lines(members) if locs is None else locs
    out, used, complete = [], 0, True
    for i, l in enumerate(locs):
        if out and used + len(l) + 3 > limit:
            out.append(f"{indent}... +{len(locs) - i} more location lines{more}")
            return out, False
        if len(l) > limit - 3:
            l, complete = _clip_loc(l, limit - 3), False
        out.append(indent + l)
        used += len(l) + 3
    return out, complete


def _comp_rx(args):
    pat = getattr(args, "comp", None)
    if not pat:
        return None, None
    try:
        return re.compile(pat), None
    except re.error as e:
        return None, f"invalid --comp regex {pat!r}: {e}"


def _scope(data, args):
    """Common setup: (members_all, clusters, comps, notes, member_filter, scope_text, error)."""
    members, comps, notes = collect(data)
    clusters = build_clusters(members)
    rx, err = _comp_rx(args)
    if err:
        return None, None, None, None, None, None, err
    if rx is None:
        return members, clusters, comps, notes, (lambda m: True), "", None
    names = [lbl for lbl, it in comps if rx.search(lbl) or rx.search(str(it.get("name", "")))]
    if not names:
        allnames = ", ".join(lbl for lbl, _ in comps[:40]) or "(none)"
        return None, None, None, None, None, None, (
            f"no comp matches --comp {rx.pattern!r}. Comps: {allnames}")
    keep = set(names)
    return members, clusters, comps, notes, (lambda m: m.comp in keep), f" in comps matching --comp {rx.pattern!r}", None


def _extraction_notes(notes, width=400):
    """Warning lines for extraction stubs (each clipped to `width`, so a budgeted head stays small)."""
    out = []
    if notes["item_errors"]:
        nm = ", ".join(_one(it.get("name", it.get("id"))) for it in notes["item_errors"][:5])
        out.append(f"WARNING: {len(notes['item_errors'])} item(s) failed to extract (not checked): {nm}")
    if notes["layer_errors"]:
        nm = ", ".join(f"{c}/[{_one(l.get('index'))}] {_one(l.get('name'))}" for c, l in notes["layer_errors"][:5])
        out.append(f"WARNING: {len(notes['layer_errors'])} layer(s) failed to extract (not checked): {nm}")
    if notes["skipped"]:
        out.append(f"note: {len(notes['skipped'])} comp(s) skipped by a scoped extraction (no layers): "
                   + ", ".join(notes["skipped"][:8]) + (" ..." if len(notes["skipped"]) > 8 else ""))
    return [_clip(ln, width) for ln in out]


def _clip_head(head, limit):
    """Head lines within `limit` chars: long lines clipped, then '... (N head lines clipped)'."""
    out, used = [], 0
    for i, ln in enumerate(head):
        ln = ln if len(ln) <= limit // 2 else _clip(ln, limit // 2)
        if used + len(ln) + 1 > limit - 40:
            out.append(f"... ({len(head) - i} head lines clipped)")
            break
        out.append(ln)
        used += len(ln) + 1
    return out


def _render_budget(head, blocks, tail_note, budget=INDEX_BUDGET):
    """(text, n_full, n_brief) within budget.

    Blocks are added whole while they fit; from the first one that does not, the remaining blocks are shown
    by their first (header) line only, and what still does not fit is summarized by
    tail_note(n_left, n_shown). The head is clipped to budget/3, so it can never crowd out every block."""
    if len("\n".join(head)) > budget // 3:
        head = _clip_head(head, budget // 3)
    text = "\n".join(head)
    nb = len(blocks)

    def reserve(i):                       # room for the tail note if we had to stop after block i
        return len(tail_note(nb - i - 1, i + 1)) + 2 if i + 1 < nb else 0

    i = 0
    while i < nb:
        chunk = "\n".join(blocks[i])
        if len(text) + 1 + len(chunk) + reserve(i) > budget:
            break
        text += "\n" + chunk
        i += 1
    n_full = i
    if i < nb:
        marker = (f"(budget reached: {nb - i} more, header line only - locations: --show ID, or narrow "
                  f"with --comp REGEX)")
        if len(text) + 1 + len(marker) + 1 + len(blocks[i][0]) + reserve(i) <= budget:
            text += "\n" + marker
            while i < nb and len(text) + 1 + len(blocks[i][0]) + reserve(i) <= budget:
                text += "\n" + blocks[i][0]
                i += 1
    if i < nb:
        text += "\n" + tail_note(nb - i, i)
    return text, n_full, i - n_full


def _budgeted(head, blocks, tail_note, budget=INDEX_BUDGET):
    """Join head + blocks within budget (see _render_budget)."""
    return _render_budget(head, blocks, tail_note, budget)[0]


# ================================================================== modes
def _mode_index(data, args):
    members, clusters, comps, notes, keep, scope, err = _scope(data, args)
    if err:
        return err, EXIT_ERROR
    sel = []
    for c in clusters:
        ms = [m for m in c.members if keep(m)]
        if ms:
            sel.append((c, ms))
    sel.sort(key=lambda t: (-len(t[1]), t[0].id))
    n_exprs = sum(len(ms) for _, ms in sel)
    n_comps = len({m.comp for _, ms in sel for m in ms})
    head = [f"{n_exprs} expressions in {len(sel)} clusters across {n_comps} comps"
            + (scope.replace(" in comps", "") + f" (whole dump: {len(members)} expressions, {len(clusters)} clusters)"
               if scope else "")]
    head += _extraction_notes(notes)
    if not sel:
        head.append("no expressions" + (" in the selected comps" if scope else " in this dump"))
        return "\n".join(head), EXIT_OK
    head.append("format: ID xMEMBERS L=lines C=chars refs=layer:effects|comp(\"X\")  gist (=> result line); "
                "locations comp/[layer idx] layer :: prop path; vary = literal slots #n that differ, by "
                "comp|layer|prop|each. Full source + per-member values: aectx exprs --show ID")
    refs_of = {c.id: refs_text(ms) for c, ms in sel}
    parts = []                                            # per cluster: (header args, location lines, ...)
    for c, ms in sel:
        layerset = tuple(sorted({(m.corder, m.lidx) for m in ms}))
        paths = list(OrderedDict.fromkeys(m.path for m in ms))
        grid = len(ms) == len(layerset) * len(paths) == len({(m.corder, m.lidx, m.path) for m in ms})
        locs, complete = _loc_block(ms)
        parts.append((c, ms, layerset, paths, grid, locs, complete, _fmt_vary(varying_slots(ms))))

    def render(legend):
        blocks, first_on, first_vary = [], {}, {}       # first_on: layer set -> (cluster ID, fully listed?)
        for c, ms, layerset, paths, grid, locs, complete, v in parts:
            r = refs_of[c.id]
            b = [_header(c, ms, len(c.members) if scope else None, legend.get(r, r))]
            alt = ""
            if layerset in first_on:
                cid, full = first_on[layerset]
                alt = (f"  on the layers of {cid}" if full else
                       f"  on the same {len(layerset)} layers as {cid} (clipped there; --show {cid})")
                alt += f" :: {compress_paths(paths)}"
            if alt and grid and len(alt) < len("\n".join(locs)):
                b.append(_clip_loc(alt, LOC_CHARS))
            else:
                b += locs
                if layerset not in first_on or (complete and not first_on[layerset][1]):
                    first_on[layerset] = (c.id, complete)
            if v and v in first_vary:
                b.append(f"  vary: as {first_vary[v]}")
            elif v:
                b.append("  " + v)
                first_vary[v] = c.id
            blocks.append(b)
        return blocks

    def tail(n_left, shown):
        left = sel[len(sel) - n_left:]
        n_ex = sum(len(ms) for _, ms in left)
        ids = " ".join(c.id for c, _ in left[:12]) + (" ..." if len(left) > 12 else "")
        big = len(left[0][1])
        each = "x1 each" if big == 1 else f"x{big} or fewer each"
        return f"... {n_left} more clusters ({n_ex} expressions, {each}) - use --comp REGEX, or --show ID: {ids}"

    # pass 1: refs inline; pass 2: R-aliases for long refs strings repeated among the clusters pass 1 emitted
    text, n_full, n_brief = _render_budget(head, render({}), tail)
    uses = defaultdict(int)
    for c, _ in sel[:n_full + n_brief]:
        uses[refs_of[c.id]] += 1
    legend = OrderedDict()
    for c, _ in sel[:n_full + n_brief]:
        r = refs_of[c.id]
        if uses[r] >= 2 and len(r) >= 24 and r not in legend and len(legend) < LEGEND_MAX:
            legend[r] = f"R{len(legend) + 1}"
    if legend:
        text = _render_budget(head + [f"{alias} = {r}" for r, alias in legend.items()], render(legend), tail)[0]
    return text, EXIT_OK


def _err_msg(m):
    """The first non-blank line of a member's error, as printed (disabled members are marked)."""
    first = next((ln.strip() for ln in (m.err or "").splitlines() if ln.strip()), "")
    if m.off and first:
        return f"(disabled) {_clip(first, ERR_TEXT)}"
    if m.off:
        return "(disabled) no error text recorded - AE disables an expression when it breaks"
    return _clip(first, ERR_TEXT) if first else "(error flagged, no message text)"


def _ids_list(counts, limit):
    """'E1 x5 E2 x3 ... +N more' for {id: count}, by count desc then ID."""
    top = sorted(counts.items(), key=lambda t: (-t[1], t[0]))
    return " ".join(f"{k} x{v}" for k, v in top[:limit]) + (f" +{len(top) - limit} more" if len(top) > limit else "")


def _mode_errors(data, args):
    members, clusters, comps, notes, keep, scope, err = _scope(data, args)
    if err:
        return err, EXIT_ERROR
    checked = [m for m in members if keep(m)]
    bad = [m for m in checked if m.err or m.off]
    if not bad:
        at = (data.get("meta") or {}).get("at", 0) if isinstance(data.get("meta"), dict) else 0
        out = [f"no expression errors ({len(checked)} expressions checked{scope}, evaluated at t={at}s;"
               f" errors that only occur at other times need `aectx extract --at T`)"]
        out += _extraction_notes(notes)
        return "\n".join(out), EXIT_OK
    size = {c.id: len(c.members) for c in clusters}
    n_err = sum(1 for m in bad if m.err)
    n_off = sum(1 for m in bad if m.off)
    msg = {id(m): _err_msg(m) for m in bad}
    head = [f"{len(bad)} broken expressions ({n_err} with errors, {n_off} disabled) of {len(checked)} checked"
            f"{scope}, in {len({m.comp for m in bad})} comps:"]
    # summary first, so it survives any truncation downstream: distinct messages, then the cluster tally
    by_msg = OrderedDict()
    for m in bad:
        by_msg.setdefault(msg[id(m)], OrderedDict()).setdefault(m.cid, 0)
        by_msg[msg[id(m)]][m.cid] += 1
    by_cid = OrderedDict()
    for m in bad:
        by_cid[m.cid] = by_cid.get(m.cid, 0) + 1
    alias = {}                                                     # message -> 'M1' (used by grouped blocks)
    if len(by_msg) < len(bad):
        ranked = sorted(by_msg.items(), key=lambda t: (-sum(t[1].values()), t[0]))
        head.append(f"by message ({len(by_msg)} distinct):")
        for i, (text, cids) in enumerate(ranked[:ERR_MSGS], 1):
            alias[text] = f"M{i}"
            head.append(f"  M{i} {sum(cids.values())} x \"{text}\" in {len(cids)} cluster{'s' if len(cids) > 1 else ''}: "
                        + _ids_list(cids, 8))
        if len(ranked) > ERR_MSGS:
            head.append(f"  +{len(ranked) - ERR_MSGS} more distinct messages "
                        f"({sum(sum(c.values()) for _, c in ranked[ERR_MSGS:])} expressions)")
    if len(by_cid) < len(bad):
        head.append(f"by cluster ({len(by_cid)}): " + _ids_list(by_cid, 30))
    head += _extraction_notes(notes)
    nxt = "next: aectx exprs --show ID (full source) | aectx repair-expressions (dry run; --yes re-assigns)"
    budget = INDEX_BUDGET - len(nxt) - 1
    if len(bad) <= ERR_LIST:
        blocks = [[f"{_clip_loc(m.where, 240)}: {msg[id(m)]}  [{m.cid}]"] for m in bad]

        def tail(n_left, shown):
            return f"... {n_left} more broken expressions - narrow with --comp REGEX"
    else:
        groups = OrderedDict()                                     # (cluster, message) -> [member]
        for m in bad:
            groups.setdefault((m.cid, msg[id(m)]), []).append(m)
        ranked = sorted(groups.items(), key=lambda t: (-len(t[1]), t[0][0], t[0][1]))
        head.append(f"locations by cluster and message (M#) - {len(bad)} > {ERR_LIST}, so not one line each; "
                    f"--comp REGEX narrows to a scope, listed one per line when it has <= {ERR_LIST}:")
        blocks = []
        for (cid, text), ms in ranked:
            cnt = f"x{len(ms)}" + (f"/{size[cid]}" if size[cid] != len(ms) else "")
            blocks.append([f"{cid} {cnt}: {alias.get(text) or text}"] + _loc_block(ms)[0])

        def tail(n_left, shown):
            left = ranked[len(ranked) - n_left:]
            return (f"... {n_left} more (cluster, message) groups ({sum(len(ms) for _, ms in left)} expressions) - "
                    f"narrow with --comp REGEX")
    return _budgeted(head, blocks, tail, budget) + "\n" + nxt, EXIT_FINDINGS


def _ref_patterns(name, flags=0):
    """(explicit, string, word) regexes for NAME: a layer()/effect()/comp("NAME") call; a string literal equal
    to NAME (only used to find its line - the match itself is decided on the scanned literals); a whole word,
    searched in code whose string literals are emptied (so layer("01-text") is no hit for 'text')."""
    q = re.escape(name)
    explicit = re.compile(r"\b(layer|effect|comp)\s*\(\s*([\"'])" + q + r"\2\s*\)", flags)
    string = re.compile(r"([\"'])" + q + r"\1", flags)
    word = re.compile(r"(?<![\w$])" + q + r"(?![\w$])", flags)
    return explicit, string, word


def _lit_equals(m, name, fold):
    """True when one of m's string literals is exactly NAME (quotes stripped; case-folded with fold)."""
    want = name.lower() if fold else name
    for raw in m.lits:
        if len(raw) >= 2 and raw[0] in "\"'" and raw[-1] == raw[0]:
            body = raw[1:-1]
            if (body.lower() if fold else body) == want:
                return True
    return False


def _reads_of(members, name, fold):
    """What the members read through NAME: 'NAME:fx,..' (layer), 'owner:NAME' (effect), 'comp("NAME")'."""
    same = (lambda x: x.lower() == name.lower()) if fold else (lambda x: x == name)
    layers, comps = _refs_acc(members)
    parts = []
    for ln, fx in layers.items():
        if same(ln):
            parts.append(f"{ln}:{','.join(fx)}" if fx else ln)
        else:
            hit = [f for f in fx if same(f)]
            if hit:
                parts.append(f"{ln}:{','.join(hit)}")
    parts += [f'comp("{c}")' for c in comps if same(c)]
    return _one("|".join(parts))


def _first_ref_line(code, masked, tests):
    """(line_no, stripped line of code) of the first line that references the name; tests are (regex, use_masked)
    tried in order (code and masked share their line structure)."""
    lines = code.splitlines() or [code]
    mlines = masked.splitlines() or [masked]
    for rx, use_masked in tests:
        for no, ln in enumerate(mlines if use_masked else lines, 1):
            if rx.search(ln):
                return no, lines[no - 1].strip() if no <= len(lines) else ln.strip()
    return None, None


def _cut(s, w):
    """s cut to w chars at a space, ' ...' appended (names keep their exact spelling, unlike _clip)."""
    if len(s) <= w:
        return s
    k = s.rfind(" ", 0, w - 4)
    return s[:k if k > w // 2 else w - 4] + " ..."


_KIND_RANK = {"layer()": 0, "effect()": 0, "comp()": 0, "string": 1, "word": 2}


def _mode_refs(data, args):
    name = getattr(args, "refs", None)
    if name is None or str(name).strip() == "":
        return "--refs needs a NAME (a layer, effect or comp name, e.g. mainControl, FORM, controller)", EXIT_ERROR
    name = str(name)
    qname = repr(name) if len(name) <= 80 else repr(name[:77]) + "..."
    members, clusters, comps, notes, keep, scope, err = _scope(data, args)
    if err:
        return err, EXIT_ERROR
    numeric = bool(re.fullmatch(r"\d+", name))

    def run(flags):
        fold = bool(flags)
        explicit, string, word = _ref_patterns(name, flags)
        tests = [(explicit, False)] + ([] if numeric else [(string, False), (word, True)])
        hits = []
        for c in clusters:
            ms, kinds, kk, first = [], [], set(), None
            for m in c.members:
                if not keep(m):
                    continue
                code, masked = m.scan[3], m.scan[4]
                ks = {f"{x.group(1)}()" for x in explicit.finditer(code)}
                if not ks and not numeric:
                    if _lit_equals(m, name, fold):
                        ks = {"string"}
                    elif word.search(masked):
                        ks = {"word"}
                if ks:
                    ms.append(m)
                    kinds.append(min(_KIND_RANK[k] for k in ks))
                    kk |= ks
                    if first is None:
                        first = _first_ref_line(code, masked, tests)
            if ms:
                hits.append((c, ms, sorted(kk, key=lambda k: (_KIND_RANK[k], k)), first, kinds))
        return hits

    fold = False
    hits = run(0)
    if not hits:
        hits = run(re.IGNORECASE)
        fold = bool(hits)
    checked = sum(1 for m in members if keep(m))
    if not hits:
        return (f"no expression references {qname} ({checked} expressions checked{scope}; matched layer()/effect()/"
                f"comp() calls" + ("" if numeric else ", string literals equal to it and whole-word uses outside "
                                                      "strings") + ")"), EXIT_OK
    hits.sort(key=lambda t: (-len(t[1]), t[0].id))
    n = sum(len(ms) for _, ms, _, _, _ in hits)
    by_rank = defaultdict(int)
    for *_, kinds in hits:
        for k in kinds:
            by_rank[k] += 1
    per_comp, corder = defaultdict(int), {}
    for _, ms, _, _, _ in hits:
        for m in ms:
            per_comp[m.comp] += 1
            corder[m.comp] = m.corder
    line_uses = defaultdict(int)
    for _, _, _, (no, ln), _ in hits:
        line_uses[ln] += 1
    typical = max(sorted(line_uses), key=lambda k: line_uses[k]) if line_uses else None
    if typical is not None and line_uses[typical] < 2:
        typical = None
    head = [f"{n} of {checked} expressions{scope} reference {qname}, in {len(hits)} clusters"
            + (" (numeric name: only layer()/effect()/comp() calls counted)" if numeric else
               f" ({by_rank[0]} via layer()/effect()/comp(), {by_rank[1]} as a string literal, "
               f"{by_rank[2]} whole-word only)")]
    if fold:
        head.append(f"(no exact-case match for {qname}; showing case-insensitive matches)")
    order = sorted(per_comp, key=lambda k: corder[k])
    if len(order) <= PER_COMP_MAX:
        head.append(_cut("per comp: " + " ".join(f"{k}:{per_comp[k]}" for k in order), 1500))
    else:
        top = set(sorted(per_comp, key=lambda k: (-per_comp[k], corder[k]))[:PER_COMP_MAX])
        rest = [k for k in order if k not in top]
        head.append(_cut(f"per comp (top {PER_COMP_MAX} of {len(order)} by count): "
                         + " ".join(f"{k}:{per_comp[k]}" for k in order if k in top), 1500)
                    + f" +{len(rest)} more comps ({sum(per_comp[k] for k in rest)} expressions; narrow with --comp)")
    head += _extraction_notes(notes)
    if typical:
        head.append(f"typical first reference ({line_uses[typical]} clusters): {_clip(typical, 110)}")
    head.append("format: ID xMATCHING[/CLUSTER] via=kinds (layer()/effect()/comp() call, string literal, whole word) "
                "reads=what is read through the name  gist (=> result line); 'ref:' = first referencing line when not "
                "the typical one; then locations")
    blocks = []
    for c, ms, kk, (no, ln), _ in hits:
        cnt = f"x{len(ms)}" + (f"/{len(c.members)}" if len(ms) != len(c.members) else "")
        reads = _cut(_reads_of(ms, name, fold), REFS_CHARS)
        b = [f"{c.id} {cnt}{_flags(ms)} via={','.join(kk)}" + (f" reads={reads}" if reads else "")
             + f"  {snippet(ms[0].src)}"]
        if ln is not None and ln != typical and len(_meaningful_lines(ms[0].src)) > 1:
            b.append(f"  ref: L{no} {_clip(ln, SNIPPET + 20)}")
        b += _loc_block(ms)[0]
        blocks.append(b)

    def tail(n_left, shown):
        left = hits[len(hits) - n_left:]
        ids = " ".join(t[0].id for t in left[:12]) + (" ..." if len(left) > 12 else "")
        return f"... {n_left} more clusters ({sum(len(t[1]) for t in left)} expressions) - use --comp REGEX: {ids}"
    return _budgeted(head, blocks, tail), EXIT_OK


def _resolve_id(want, clusters):
    """(cluster, None) or (None, error text). Accepts 'E1a2b3', 'e1a2b3', '1a2b3' or a unique prefix of at
    least MIN_PREFIX hex digits after the 'E' ('E1a2')."""
    raw = str(want or "").strip()
    hexrx = re.compile(r"[0-9a-f]{1,40}")
    low = raw.lower()
    stripped = low[1:] if low[:1] == "e" else None
    by_hex = {c.id[1:].lower(): c for c in clusters}
    exact = [h for h in (stripped, low) if h and hexrx.fullmatch(h)]
    for h in exact:
        if h in by_hex:
            return by_hex[h], None
    # prefixes: the digits after a leading E/e, or the bare hex when there is no leading E/e
    pref_of = stripped if stripped is not None else low
    if pref_of and hexrx.fullmatch(pref_of) and len(pref_of) >= MIN_PREFIX:
        pref = sorted((c for k, c in by_hex.items() if k.startswith(pref_of)), key=lambda c: c.id)
        if len(pref) == 1:
            return pref[0], None
        if len(pref) > 1:
            return None, (f"ambiguous cluster ID {raw!r}: matches " + " ".join(c.id for c in pref[:20])
                          + (" ..." if len(pref) > 20 else "") + " - give more hex digits")
    top = " ".join(c.id for c in clusters[:8])
    if not (pref_of and hexrx.fullmatch(pref_of)):
        shape = " (IDs look like E1a2b3: 'E' + 5 hex digits)"
    elif len(pref_of) < MIN_PREFIX:
        shape = f" (too short: IDs look like E1a2b3; a prefix needs at least {MIN_PREFIX} hex digits)"
    else:
        shape = ""
    return None, (f"unknown cluster ID {raw[:40]!r}{shape}. IDs come from `aectx exprs --index` and are stable for "
                  f"the same expression text; re-run --index if the project changed. Largest clusters: "
                  f"{top or '(none)'}")


def _add_lines(out, lines, budget, more, extra=0):
    """Append lines to out while the total (out included) stays within budget chars, then more(n_left) once if
    anything is left out; `extra` = further items that are not in `lines` at all. Returns n added."""
    used = sum(len(l) + 1 for l in out)
    for i, l in enumerate(lines):
        left = len(lines) - i - 1 + extra
        if used + len(l) + 1 + (len(more(left)) + 1 if left else 0) > budget:
            out.append(more(len(lines) - i + extra))
            return i
        out.append(l)
        used += len(l) + 1
    if extra:
        out.append(more(extra))
    return len(lines)


def _mode_show(data, args):
    members, clusters, comps, notes, keep, scope, err = _scope(data, args)
    if err:
        return err, EXIT_ERROR
    c, err = _resolve_id(getattr(args, "show", None), clusters)
    if err:
        return err, EXIT_ERROR
    ms = [m for m in c.members if keep(m)]
    if not ms:
        where = ", ".join(list(OrderedDict.fromkeys(m.comp for m in c.members))[:12])
        return _cut(f"{c.id} has no members{scope} (its {len(c.members)} members are in: {where})", 1000), EXIT_ERROR
    ex = ms[0]
    comps_in = list(OrderedDict.fromkeys(m.comp for m in ms))
    slots = varying_slots(ms)
    pre = [_cut(f"{c.id}: {len(ms)} expressions" + (f" (of {len(c.members)})" if len(ms) != len(c.members) else "")
                + f" in {len(comps_in)} comps ({_join_names(comps_in[:10])}{' ...' if len(comps_in) > 10 else ''})", 900)
           + f"{scope}; {len(ex.lits)} literal slots, {len(slots)} vary{_flags(ms)}"]
    pre.append(f"refs: {_fmt_refs(_refs_acc(ms), 1200)}")
    pre.append(f"exemplar: {_clip_loc(ex.where, 400)}  (L={len(ex.src.splitlines()) or 1} C={len(ex.src)})")
    if ex.err:
        pre.append(f"exemplar error: {_clip(ex.err.splitlines()[0] if ex.err.splitlines() else ex.err, ERR_TEXT)}")
    source = ["----- source -----", ex.src.replace("\r\n", "\n").replace("\r", "\n").rstrip("\n"),
              "----- end source -----"]
    out = list(pre)                       # everything but `source` counts against SHOW_BUDGET
    if slots:
        out.append("varying slots (#n = n-th literal; context from the exemplar; values across members):")
        _add_lines(out, [f"  #{no} by {dim}: {_slot_context(ex, no)}  values {txt}" for no, dim, txt in slots],
                   SHOW_BUDGET // 3, lambda k: f"  ... +{k} more varying slots")
    else:
        out.append("no varying literal slots: all members have identical source")
    broken = [m for m in ms if m.err or m.off]
    if broken:
        out.append(f"broken members ({len(broken)}):")
        _add_lines(out, [f"  {_clip_loc(m.where, 200)}: {_err_msg(m)}" for m in broken], SHOW_BUDGET // 2,
                   lambda k: f"  ... +{k} more broken members (aectx exprs --errors)")
    if not slots:
        out.append("locations:")
        out += _loc_block(ms, limit=SHOW_BUDGET - sum(len(l) + 1 for l in out) - 200,
                          more=" (narrow with --comp REGEX)")[0]
        return "\n".join(out[:len(pre)] + source + out[len(pre):]), EXIT_OK
    cols = [no for no, _, _ in slots][:SHOW_COLS]
    colnote = f" (first {SHOW_COLS} of {len(slots)} varying slots)" if len(slots) > SHOW_COLS else ""
    groups = OrderedDict()                                     # slot-value tuple -> [member]
    for m in ms:
        groups.setdefault(tuple(m.lits[no - 1] for no in cols), []).append(m)
    if len(ms) >= 6 and len(groups) <= len(ms) / 3:
        # few distinct value tuples: one row per tuple with its compressed locations
        out.append(f"members ({len(ms)}) by slot values, {len(groups)} distinct{colnote}:")
        rows = []
        room = max(LOC_CHARS, (SHOW_BUDGET - sum(len(l) + 1 for l in out)) // len(groups) - 200)
        for vals, gm in sorted(groups.items(), key=lambda t: (-len(t[1]), t[0])):
            tag = " ".join(f"#{no}={_clip(v, 40)}" for no, v in zip(cols, vals))
            rows.append([f"  {tag} x{len(gm)}:"] + _loc_block(gm, limit=room, indent="    ",
                                                               more=" (narrow with --comp REGEX)")[0])
        rows_flat = [l for r in rows for l in r]
        if sum(len(l) + 1 for l in out + rows_flat) <= SHOW_BUDGET:
            out += rows_flat
        else:
            _add_lines(out, [r[0] + " " + _clip_loc("; ".join(l.strip() for l in r[1:]), 300) for r in rows],
                       SHOW_BUDGET, lambda k: f"  ... +{k} more value tuples (narrow with --comp)")
    else:
        one_path = len({m.path for m in ms}) == 1
        label = (lambda m: f"{m.comp} / {m.layer}") if one_path else (lambda m: m.where)
        hdr = ["member" + (f" (all :: {_clip(ex.path, 80)})" if one_path else "")] + [f"#{n}" for n in cols]
        rows = [[_clip(label(m), 70)] + [_clip(m.lits[no - 1], 40) for no in cols] for m in ms[:SHOW_ROWS]]
        widths = [max(len(r[i]) for r in rows + [hdr]) for i in range(len(hdr))]
        fmt = lambda r: "  " + " | ".join(v.ljust(widths[i]) for i, v in enumerate(r)).rstrip()
        out.append(f"members ({len(ms)}):{colnote}")
        out.append(fmt(hdr))
        _add_lines(out, [fmt(r) for r in rows], SHOW_BUDGET, lambda k: f"  ... +{k} more members (narrow with --comp)",
                   extra=len(ms) - len(rows))
    return "\n".join(out[:len(pre)] + source + out[len(pre):]), EXIT_OK


def exprs(data, args):
    """Return (text, exit_code). See the module docstring for modes."""
    data = data if isinstance(data, dict) else {}
    if getattr(args, "show", None) is not None:
        return _mode_show(data, args)
    if getattr(args, "refs", None) is not None:
        return _mode_refs(data, args)
    if getattr(args, "errors", False):
        return _mode_errors(data, args)
    return _mode_index(data, args)
