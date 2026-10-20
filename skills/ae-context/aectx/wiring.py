"""aectx.wiring - which shots ACTUALLY use the CucoStudio video-level controls.

Controls: trinity sliders FORM/FLOW/PRESSURE and palette colors "1","2","3" on mainComp's
layer mainControl, plus each shot's controller enter/exit sliders.

Substring counting is useless (in steel 810 of 836 expressions mention mainControl because every
expression carries the same library preamble), so every expression gets a small backward slice:

  1. tokenize (strings, comments, regex and template literals aware), split the top level into
     statements and find declarations: `var/let/const X = INIT` (comma lists too), plain assignments
     `X = ...`, `function f(..){..}`; record what each statement / declaration WRITES (`X = `, `X++`,
     `X[i] = `, `X.push(`...; a call to a function that writes a global writes it too);
  2. resolve aliases: a variable whose INIT is exactly a layer ref (`comp("mainComp").layer("mainControl")`,
     `thisComp.layer("controller")`, or another alias) is a layer alias; `ALIAS.effect("FORM")` and
     `...layer("mainControl").effect("FORM")` are control READS (numeric effect indices map by position);
  3. liveness from the RESULT: the last top-level statement (the expression's value; a trailing
     `if (..) { r = .. }` makes r live too) plus posterizeTime/seedRandom calls are live; a name is live
     when live code references it; a live name makes its declarations and every statement that writes
     it live; a function is live only when live code calls it (uncalled library helpers drop out);
  4. a property USES a control when a read sits in live code.

Known limits: names are not scope-qualified (two functions' same-named locals share one node);
a function that mutates an array passed as a parameter is not seen as writing the caller's array.

Properties are attributed to shots through the layer-source graph: shot comps are ORIGINAL_SHOTS comps
(template) or the PROJECT_SHOTS `{shot}-{i}` instances sequenced in mainComp (arrangement); every comp
reachable from a shot through precomp layers belongs to it (a comp reachable from several shots counts in
each). Comps the graph doesn't reach fall back to the names `{shot}-text` / `{shot}-frame` (+ " N").
Output: shot x control table, FLAGS, and hard-coded (expression-less, non-neutral) colors.
"""
import re
from collections import Counter

EXIT_OK = 0

TRINITY = ("FORM", "FLOW", "PRESSURE")
PALETTE = ("1", "2", "3")
SHOT_CTLS = ("enter", "exit")
CONTROLS = TRINITY + PALETTE + SHOT_CTLS
MC_KEYS = TRINITY + PALETTE
LAYER_KIND = {"mainControl": "MC", "controller": "CT"}

NEUTRAL_SPREAD = 0.04      # max-min RGB below this = near-neutral (not reported as hard-coded)
PALETTE_NEAR = 0.02        # per-channel distance for "is palette N"
COLOR_ROWS_MAX = 16
COMPS_LISTED = 8           # comps named per hard-coded color group before "+N comps"
FLAG_ROWS_MAX = 40
DETAIL_ROWS_MAX = 40
OUTPUT_BUDGET = 3800       # chars; the --control drill-down stops adding rows past this
WITNESS_CHARS = 64
ROOT = ""                  # owner of tokens outside every statement (defensive; normally unused)
PARAM = "@param"           # qname of a function parameter (never a node, never an alias)

KEYWORDS = frozenset("""break case catch class const continue debugger default delete do else export extends
finally for function if import in instanceof let new return super switch this throw try typeof var void while
with yield true false null undefined""".split())
ASSIGN_OPS = frozenset(("=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", ">>>=", "**=", "??=",
                        "||=", "&&="))
PUNCTS = sorted(ASSIGN_OPS | {"===", "!==", ">>>", "...", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "<<",
                              ">>", "=>", "**", "?.", "??"}, key=len, reverse=True)
_PUNCT_SET = frozenset(PUNCTS)
_PUNCT_LENS = sorted({len(p) for p in PUNCTS}, reverse=True)
OPEN, CLOSE = frozenset("([{"), frozenset(")]}")
# a line ending in one of these continues on the next line (no ASI)
CONT_END = frozenset({".", ",", "?", ":", "+", "-", "*", "/", "%", "<", ">", "!", "~", "&", "|", "^", "(", "[", "{",
                      "==", "===", "!=", "!==", "<=", ">=", "&&", "||", "<<", ">>", ">>>", "**", "=>", "??", "?."}
                     | ASSIGN_OPS)
# a line starting with one of these continues the previous one ( "(" and "[" deliberately end it: human intent)
CONT_START = frozenset({".", "?", ":", "+", "-", "*", "/", "%", "<", ">", "&", "|", "^", ",", "==", "===", "!=",
                        "!==", "<=", ">=", "&&", "||", "<<", ">>", ">>>", "**", "??", "?.", "=>"} | ASSIGN_OPS)
REGEX_AFTER_KW = frozenset(("return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case",
                            "do", "else", "yield"))
MUTATORS = frozenset(("push", "unshift", "splice", "pop", "shift", "sort", "reverse", "fill", "copyWithin"))
SIDE_EFFECTS = frozenset(("posterizeTime", "seedRandom"))   # change how the rest of the expression evaluates

_ID = re.compile(r"(?:[^\W\d]|\$)[\w$]*")   # unicode-aware identifier
_NUM = re.compile(r"0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")
_ESC = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}
_LINE_BREAKS = "\r\n  "
_CTRL = re.compile("[\x00-\x1f\x7f-\x9f  ]")
_CTRL_NAMES = {"\n": "\\n", "\r": "\\r", "\t": "\\t"}


def _s(x):
    """Any dump value as a string (names/paths may be missing or odd types)."""
    return x if isinstance(x, str) else ("" if x is None else str(x))


def _clean(x):
    """Display form of a name/path/snippet: control and line-break characters escaped (one record = one line)."""
    return _CTRL.sub(lambda m: _CTRL_NAMES.get(m.group(), "\\x%02x" % ord(m.group()) if ord(m.group()) < 256
                                              else "\\u%04x" % ord(m.group())), _s(x))


def _list(x):
    return x if isinstance(x, list) else []


def _key(x):
    return x if isinstance(x, (int, str)) and not isinstance(x, bool) else None


# ================================================================== tokenizer
class Tok:
    __slots__ = ("kind", "text", "pos", "nl")

    def __init__(self, kind, text, pos, nl):
        self.kind, self.text, self.pos, self.nl = kind, text, pos, nl   # kind: id num str re p

    def __repr__(self):
        return f"{self.kind}:{self.text!r}"


def _unescape(s):
    return re.sub(r"\\(.)", lambda m: _ESC.get(m.group(1), m.group(1)), s, flags=re.S) if "\\" in s else s


def _regex_end(src, i):
    """End index (exclusive, flags included) of a regex literal starting at src[i] == '/', or None."""
    j, n, cls = i + 1, len(src), False
    while j < n:
        c = src[j]
        if c in "\r\n":
            return None
        if c == "\\":
            j += 2
            continue
        if c == "[":
            cls = True
        elif c == "]":
            cls = False
        elif c == "/" and not cls:
            j += 1
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            return j
        j += 1
    return None


def _regex_allowed(prev):
    if prev is None:
        return True
    if prev.kind in ("num", "str", "re"):
        return False
    if prev.kind == "id":
        return prev.text in REGEX_AFTER_KW
    return prev.text not in (")", "]")


def tokenize(src):
    """JS-ish tokens; whitespace/comments dropped, `nl` marks a line break before the token.
    A template literal `a${x}b` becomes the tokens "a" + ( x ) + "b"."""
    toks = []
    _tokenize(src, 0, toks, False)
    return toks


def _tokenize(src, i, toks, sub):
    """Append tokens of src[i:] to toks. With sub=True stop at the '}' closing a template substitution
    and return its index; otherwise return len(src)."""
    n, nl, depth = len(src), False, 0
    while i < n:
        c = src[i]
        if c in _LINE_BREAKS:
            nl, i = True, i + 1
            continue
        if c.isspace() or c == "﻿":
            i += 1
            continue
        if c == "/" and src.startswith("//", i):
            j = i + 2
            while j < n and src[j] not in _LINE_BREAKS:
                j += 1
            i = j
            continue
        if c == "/" and src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            if any(b in src[i:j] for b in _LINE_BREAKS):
                nl = True
            i = j
            continue
        if c == "`":
            i = _template(src, i, toks, nl)
            nl = False
            continue
        if c in "\"'":
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] in "\r\n":
                    break
                j += 1
            toks.append(Tok("str", _unescape(src[i + 1:j]), i, nl))
            nl, i = False, j + 1
            continue
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            m = _NUM.match(src, i)
            toks.append(Tok("num", m.group(0), i, nl))
            nl, i = False, m.end()
            continue
        m = _ID.match(src, i)
        if m:
            toks.append(Tok("id", m.group(0), i, nl))
            nl, i = False, m.end()
            continue
        if c == "/" and _regex_allowed(toks[-1] if toks else None):
            j = _regex_end(src, i)
            if j is not None:
                toks.append(Tok("re", src[i:j], i, nl))
                nl, i = False, j
                continue
        for ln in _PUNCT_LENS:
            p = src[i:i + ln]
            if p in _PUNCT_SET:
                break
        else:
            p = c
        if sub:
            if p == "{":
                depth += 1
            elif p == "}":
                if depth == 0:
                    return i
                depth -= 1
        toks.append(Tok("p", p, i, nl))
        nl, i = False, i + len(p)
    return n


def _template(src, i, toks, nl):
    """Tokens of the template literal starting at src[i] == '`'; returns the index after it."""
    n, j, first = len(src), i + 1, True
    while True:
        k = j
        while k < n and src[k] != "`" and not src.startswith("${", k):
            k += 2 if src[k] == "\\" else 1
        toks.append(Tok("str", _unescape(src[j:min(k, n)]), i if first else j, nl if first else False))
        first = False
        if k >= n:
            return n
        if src[k] == "`":
            return k + 1
        toks.append(Tok("p", "+", k, False))
        toks.append(Tok("p", "(", k, False))
        e = _tokenize(src, k + 2, toks, True)
        toks.append(Tok("p", ")", e, False))
        toks.append(Tok("p", "+", e, False))
        if e >= n:
            return n
        j = e + 1


def _match_brackets(toks):
    m, st = {}, []
    for k, t in enumerate(toks):
        if t.kind != "p":
            continue
        if t.text in OPEN:
            st.append(k)
        elif t.text in CLOSE:
            want = {")": "(", "]": "[", "}": "{"}[t.text]
            if any(toks[o].text == want for o in st):
                while toks[st[-1]].text != want:
                    st.pop()
                o = st.pop()
                m[o], m[k] = k, o
    return m


# ================================================================== per-expression analysis
class _Ctx:
    """Scan context: parameters of the enclosing functions, local-name -> scope-qualified name, in a function?"""
    __slots__ = ("params", "scope", "in_fn")

    def __init__(self, params, scope, in_fn):
        self.params, self.scope, self.in_fn = params, scope, in_fn


class Expr:
    """Backward-slice data-flow analysis of one expression source.

    own_kind: 'MC' when the property sits on mainControl itself, 'CT' on a controller, else None
    (decides what a bare `effect("X")` / `thisLayer.effect("X")` reads).
    Nodes: top-level statements ('#0', '#1', ...) and declared names (vars, assigned names, functions).
    """

    def __init__(self, src, own_kind=None, mc_effects=MC_KEYS, ct_effects=SHOT_CTLS):
        self.src = src or ""
        self.own_kind = own_kind
        self.mc_effects, self.ct_effects = tuple(mc_effects), tuple(ct_effects)
        self.t = tokenize(self.src)
        self.m = _match_brackets(self.t)
        self.owner = [ROOT] * len(self.t)
        self.regions = {}        # decl name -> [(s, e)] token ranges of its INIT / assigned value / function body
        self.funcs = set()
        self.refs = {}           # node -> {name: [token idx]}
        self.writes = {}         # node -> {names it assigns or mutates}
        self.locals = {}         # node -> {names declared with var/let/const inside it}
        self.stmts = []          # top-level statements: (node id, start, end, kind)  kind: stmt|var|func|empty
        self.alias = {}          # layer-alias variable -> 'MC' | 'CT'
        self.qname = {}          # token idx -> scope-qualified name ('x@3' = local x of function scope 3)
        self._scopes = 0
        self.reads = {}          # node -> [(control, token idx)]
        self._split_and_scan()
        self._resolve_aliases()
        self._find_reads()
        self._liveness()
        self.pos = [x.pos for x in self.t]      # all witness() needs from the tokens
        del self.t, self.m, self.owner, self.qname

    # ---------------------------------------------------------------- token helpers
    def _p(self, k, text):
        return k < len(self.t) and self.t[k].kind == "p" and self.t[k].text == text

    def _w(self, k, text):
        return k < len(self.t) and self.t[k].kind == "id" and self.t[k].text == text

    def _is_member(self, k):
        return k > 0 and self.t[k - 1].kind == "p" and self.t[k - 1].text in (".", "?.")

    def _is_key(self, k):
        t = self.t
        return (k + 1 < len(t) and t[k + 1].text == ":" and t[k + 1].kind == "p"
                and k > 0 and t[k - 1].kind == "p" and t[k - 1].text in ("{", ","))

    def _stmt_start(self, k):
        if k == 0:
            return True
        prev = self.t[k - 1]
        if prev.kind == "p" and prev.text in (";", "{", "}"):
            return True
        return self.t[k].nl and not (prev.kind == "p" and prev.text in CONT_END)

    def _asi(self, k):
        prev, cur = self.t[k - 1], self.t[k]
        if prev.kind == "p" and prev.text in CONT_END:
            return False
        if prev.kind == "id" and prev.text in ("in", "instanceof", "typeof", "new", "delete", "void"):
            return False
        if cur.kind == "p" and cur.text in CONT_START:
            return False
        if cur.kind == "id" and cur.text in ("in", "instanceof"):
            return False
        return True

    def _group_end(self, k):
        """Index after the bracket group opening at k (k itself + 1 when unmatched)."""
        return self.m[k] + 1 if k in self.m and self.m[k] > k else k + 1

    # ---------------------------------------------------------------- statements
    def _stmt_end(self, k, j):
        """Index after the statement starting at token k (always > k when k < j)."""
        t = self.t
        if k >= j:
            return j
        x = t[k]
        if x.kind == "p" and x.text == ";":
            return k + 1
        if x.kind == "p" and x.text == "{":
            return min(self._group_end(k), j)
        if x.kind == "id" and not self._is_member(k):
            w = x.text
            if w in ("for", "while", "with", "if", "switch") and self._p(k + 1, "("):
                e = min(self._group_end(k + 1), j)
                if w == "switch":
                    return min(self._group_end(e), j) if self._p(e, "{") else e
                e = self._stmt_end(e, j)
                while w == "if" and e < j and self._w(e, "else"):
                    if self._w(e + 1, "if") and self._p(e + 2, "("):
                        e = self._stmt_end(min(self._group_end(e + 2), j), j)
                        continue
                    e = self._stmt_end(e + 1, j)
                    break
                return max(e, k + 1)
            if w == "do":
                e = self._stmt_end(k + 1, j)
                if self._w(e, "while") and self._p(e + 1, "("):
                    e = min(self._group_end(e + 1), j)
                    if self._p(e, ";"):
                        e += 1
                return max(e, k + 1)
            if w == "try":
                e = k + 1
                if self._p(e, "{"):
                    e = self._group_end(e)
                while e < j and (self._w(e, "catch") or self._w(e, "finally")):
                    e += 1
                    if self._p(e, "("):
                        e = self._group_end(e)
                    if self._p(e, "{"):
                        e = self._group_end(e)
                return min(e, j)
            if w == "function" and k + 2 < j and t[k + 1].kind == "id" and self._p(k + 2, "("):
                bo = self._group_end(k + 2)
                if self._p(bo, "{") and bo in self.m:
                    return min(self._group_end(bo), j)
        i = k
        while i < j:                                   # expression / var statement
            y = t[i]
            if y.kind == "p":
                if y.text in OPEN and i in self.m and self.m[i] > i:
                    i = self.m[i] + 1
                    continue
                if y.text == ";":
                    return i + 1
                if y.text in CLOSE and i > k:          # stray closer ends the statement
                    return i
            if i > k and y.nl and self._asi(i):
                return i
            i += 1
        return j

    def _stmt_kind(self, s, e):
        t = self.t
        if all(t[x].kind == "p" and t[x].text == ";" for x in range(s, e)):
            return "empty"
        if t[s].kind == "id" and t[s].text in ("var", "let", "const"):
            return "var"
        if t[s].kind == "id" and t[s].text == "function" and s + 1 < e and t[s + 1].kind == "id":
            return "func"
        return "stmt"

    def _split_and_scan(self):
        n, k = len(self.t), 0
        while k < n:
            e = self._stmt_end(k, n)
            sid = f"#{len(self.stmts)}"
            self.stmts.append((sid, k, e, self._stmt_kind(k, e)))
            self._scan(k, e, sid, _Ctx(frozenset(), {}, False), True)
            k = e

    # ---------------------------------------------------------------- declarations and writes
    def _init_end(self, s, j):
        t, depth, k = self.t, 0, s
        while k < j:
            x = t[k]
            if x.kind == "p":
                if x.text in OPEN:
                    depth += 1
                elif x.text in CLOSE:
                    if depth == 0:
                        return k
                    depth -= 1
                elif depth == 0 and x.text in (",", ";"):
                    return k
            if depth == 0 and k > s and x.nl and self._asi(k):
                return k
            k += 1
        return j

    def _write(self, owner, name):
        self.writes.setdefault(owner, set()).add(name)

    def _mutates(self, k):
        """Is the identifier at k the root of a write target: `X = / X[i] = / X.a = / X++ / ++X / X.push(`?"""
        t, n = self.t, len(self.t)
        prev = t[k - 1] if k > 0 else None
        if prev is not None and not t[k].nl and (
                (prev.kind == "p" and prev.text in ("++", "--")) or (prev.kind == "id" and prev.text == "delete")):
            return True
        i = k + 1
        while i < n:
            y = t[i]
            if y.kind == "p" and y.text in (".", "?.") and i + 1 < n and t[i + 1].kind == "id":
                if self._p(i + 2, "("):
                    return t[i + 1].text in MUTATORS
                i += 2
                continue
            if y.kind == "p" and y.text == "[" and i in self.m and self.m[i] > i:
                i = self.m[i] + 1
                continue
            break
        if i < n and t[i].kind == "p":
            if t[i].text in ASSIGN_OPS:
                return True
            if t[i].text in ("++", "--") and not t[i].nl:
                return True
        return False

    def _own(self, k, owner, cx):
        self.owner[k] = owner
        x = self.t[k]
        if x.kind != "id" or x.text in KEYWORDS or self._is_member(k) or self._is_key(k):
            return
        if x.text in cx.params:
            self.qname[k] = PARAM
            return
        q = cx.scope.get(x.text, x.text)
        self.qname[k] = q
        self.refs.setdefault(owner, {}).setdefault(q, []).append(k)
        if self._mutates(k):
            self._write(owner, q)

    def _decl(self, q, s, e, owner, cx):
        self.regions.setdefault(q, []).append((s, e))
        self._scan(s, e, q, cx, False)

    def _scan(self, i, j, owner, cx, allow_assign):
        t, k = self.t, i
        while k < j:
            x = t[k]
            self.owner[k] = owner
            if x.kind == "id":
                w = x.text
                if w == "function" and not self._is_member(k):
                    k = self._function(k, j, owner, cx)
                    continue
                if w in ("var", "let", "const") and not self._is_member(k):
                    k = self._var(k + 1, j, owner, cx)
                    continue
                if (allow_assign and w not in KEYWORDS and w not in cx.params and not self._is_member(k)
                        and k + 1 < j and t[k + 1].kind == "p" and t[k + 1].text in ASSIGN_OPS):
                    q = cx.scope.get(w, w)
                    e = self._init_end(k + 2, j)
                    self.qname[k] = q
                    self._write(owner, q)
                    if cx.in_fn and q not in cx.scope.values():
                        # a function body assigning a global: the value belongs to the function (it only
                        # happens when the function is called), not to a free-standing declaration
                        self._scan(k + 1, e, owner, cx, False)
                    else:
                        self._decl(q, k + 2, e, owner, cx)
                    k = e
                    continue
            self._own(k, owner, cx)
            k += 1

    def _var(self, k, j, owner, cx):
        t = self.t
        while k < j and t[k].kind == "id":
            name = t[k].text
            q = cx.scope.get(name, name)
            self.owner[k] = owner
            self.qname[k] = q
            self.locals.setdefault(owner, set()).add(q)
            if k + 1 < j and t[k + 1].kind == "p" and t[k + 1].text == "=":
                e = self._init_end(k + 2, j)
                if name in cx.params:            # `var p = ..` re-assigning a parameter: the function's own code
                    self._scan(k + 2, e, owner, cx, False)
                else:
                    self._decl(q, k + 2, e, owner, cx)
                k = e
            else:
                k += 1
            if k < j and t[k].kind == "p" and t[k].text == ",":
                self.owner[k] = owner
                k += 1
                continue
            break
        return k

    def _hoisted(self, i, j):
        """Names a function body declares (var/let/const, nested function declarations), nested bodies skipped."""
        t, names, k = self.t, set(), i
        while k < j:
            x = t[k]
            if x.kind == "id" and not self._is_member(k):
                if x.text == "function":
                    named = k + 1 < j and t[k + 1].kind == "id"
                    if named and self._stmt_start(k):
                        names.add(t[k + 1].text)
                    po = k + 2 if named else k + 1
                    if self._p(po, "(") and po in self.m:
                        bo = self.m[po] + 1
                        if self._p(bo, "{") and bo in self.m and self.m[bo] < j:
                            k = self.m[bo] + 1
                            continue
                    k += 1
                    continue
                if x.text in ("var", "let", "const"):
                    k += 1
                    while k < j and t[k].kind == "id":
                        names.add(t[k].text)
                        k = self._init_end(k + 2, j) if self._p(k + 1, "=") else k + 1
                        if self._p(k, ","):
                            k += 1
                            continue
                        break
                    continue
            k += 1
        return names

    def _function(self, k, j, owner, cx):
        t, m = self.t, self.m
        named = k + 2 < j and t[k + 1].kind == "id" and t[k + 2].text == "("
        po = k + 2 if named else k + 1
        if po >= j or t[po].text != "(" or po not in m:
            self._own(k, owner, cx)
            return k + 1
        pc = m[po]
        bo = pc + 1
        if bo >= j or t[bo].text != "{" or bo not in m or m[bo] > j:
            self._own(k, owner, cx)
            return k + 1
        bc = m[bo]
        fparams = {t[x].text for x in range(po + 1, pc) if t[x].kind == "id"}
        local = self._hoisted(bo + 1, bc) - fparams
        self._scopes += 1
        scope = {n: q for n, q in cx.scope.items() if n not in fparams}
        scope.update({n: f"{n}@{self._scopes}" for n in local})
        inner = _Ctx((cx.params - local) | fparams, scope, True)
        for x in range(k, bo + 1):
            self.owner[x] = owner
        if named and self._stmt_start(k):
            name = cx.scope.get(t[k + 1].text, t[k + 1].text)
            self.qname[k + 1] = name
            self.funcs.add(name)
            self.regions.setdefault(name, []).append((bo + 1, bc))
            self._scan(bo + 1, bc, name, inner, True)
        else:                                      # anonymous / function expression: part of its owner
            self._scan(bo + 1, bc, owner, inner, True)
        self.owner[bc] = owner
        return bc + 1

    # ---------------------------------------------------------------- aliases and reads
    def _layer_ref_kind(self, s, e):
        t = self.t
        seq = t[s:e]
        if len(seq) == 1 and seq[0].kind == "id":
            return self.alias.get(self.qname.get(s, seq[0].text))
        if (len(seq) >= 4 and seq[-4].kind == "id" and seq[-4].text == "layer" and seq[-3].text == "("
                and seq[-2].kind == "str" and seq[-1].text == ")"):
            head = [x.text for x in seq[:-4]]
            kinds = [x.kind for x in seq[:-4]]
            if head == ["thisComp", "."] or (len(head) == 5 and head[0] == "comp" and head[1] == "("
                                              and kinds[2] == "str" and head[3] == ")" and head[4] == "."):
                return LAYER_KIND.get(seq[-2].text)
        return None

    def _resolve_aliases(self):
        for _ in range(len(self.regions) + 1):
            changed = False
            for name, regs in self.regions.items():
                if name in self.alias or name in self.funcs:
                    continue
                for s, e in regs:
                    kind = self._layer_ref_kind(s, e)
                    if kind:
                        self.alias[name] = kind
                        changed = True
                        break
            if not changed:
                break

    def _effect_key(self, kind, tok):
        names, keys = (self.mc_effects, MC_KEYS) if kind == "MC" else (self.ct_effects, SHOT_CTLS)
        if tok.kind == "str":
            return tok.text if tok.text in keys else None
        try:
            idx = int(float(tok.text))
        except ValueError:
            return None
        if 1 <= idx <= len(names) and names[idx - 1] in keys:
            return names[idx - 1]
        return None

    def _find_reads(self):
        t, m = self.t, self.m
        for k, x in enumerate(t):
            if x.kind != "id" or x.text != "effect":
                continue
            if not (k + 3 < len(t) and t[k + 1].text == "(" and t[k + 2].kind in ("str", "num")
                    and t[k + 3].text == ")"):
                continue
            kind = None
            if self._is_member(k):
                r = k - 2
                if r >= 0 and t[r].kind == "p" and t[r].text == ")" and r in m:
                    o = m[r]
                    if o >= 1 and t[o - 1].kind == "id" and t[o - 1].text == "layer" and o + 2 == r \
                            and t[o + 1].kind == "str":
                        kind = LAYER_KIND.get(t[o + 1].text)
                elif r >= 0 and t[r].kind == "id" and not self._is_member(r):
                    kind = self.own_kind if t[r].text == "thisLayer" else self.alias.get(self.qname.get(r, t[r].text))
            elif k == 0 or t[k - 1].text != "function":
                kind = self.own_kind
            if not kind:
                continue
            ctl = self._effect_key(kind, t[k + 2])
            if ctl:
                self.reads.setdefault(self.owner[k], []).append((ctl, k))

    # ---------------------------------------------------------------- liveness (backward slice)
    def _effective_writes(self):
        """node -> names it writes, including globals written by the functions it calls (transitively)."""
        fw = {f: {x for x in self.writes.get(f, ()) if "@" not in x} for f in self.funcs}   # globals only
        for _ in range(len(fw) + 1):
            changed = False
            for f in fw:
                add = set()
                for g in self.refs.get(f, {}):
                    if g in fw and g != f:
                        add |= fw[g]
                if not add <= fw[f]:
                    fw[f] |= add
                    changed = True
            if not changed:
                break
        nodes = set(self.regions) | {sid for sid, _, _, _ in self.stmts} | {ROOT}
        eff = {}
        for n in nodes:
            ws = set(self.writes.get(n, ()))
            for g in self.refs.get(n, {}):
                if g in fw and g != n:
                    ws |= fw[g]
            if ws:
                eff[n] = ws
        writers = {}
        for n, ws in eff.items():
            if n in self.funcs:                  # an uncalled function's writes never happen
                continue
            for x in ws:
                writers.setdefault(x, set()).add(n)
        return nodes, eff, writers

    def _liveness(self):
        nodes, eff, writers = self._effective_writes()
        self.writers = writers
        # the result: the last statement with a value. A trailing `var x = ..` is the value in ExtendScript
        # but has no completion value in JS (the last non-var statement is): keep both.
        root_nodes, root_names = [], set()
        for sid, s, e, kind in reversed(self.stmts):
            if kind in ("empty", "func") or (kind == "var" and root_nodes):
                continue
            root_nodes.append(sid)
            root_names |= eff.get(sid, set())           # `x = ...` / `if (..) { r = .. }` as the result
            if kind == "var":
                root_names |= self.locals.get(sid, set())
                continue
            break
        result_sids = list(root_nodes)
        for n in sorted(nodes, key=self._node_pos):
            if n not in self.funcs and SIDE_EFFECTS & set(self.refs.get(n, {})) and n not in root_nodes:
                root_nodes.append(n)
        if self.refs.get(ROOT) or self.reads.get(ROOT):
            root_nodes.append(ROOT)
        live, live_names = set(), set()
        todo_n, todo_x = list(root_nodes), list(root_names)
        while todo_n or todo_x:
            while todo_x:
                x = todo_x.pop()
                if x in live_names:
                    continue
                live_names.add(x)
                if x in self.regions:
                    todo_n.append(x)
                todo_n.extend(writers.get(x, ()))
            if todo_n:
                n = todo_n.pop()
                if n in live:
                    continue
                live.add(n)
                todo_x.extend(r for r in self.refs.get(n, {}) if r not in live_names)
        self.live = live
        self.used = set()
        for n in live:
            self.used.update(c for c, _ in self.reads.get(n, []))
        self.mentioned = {c for rs in self.reads.values() for c, _ in rs}
        # taint: which controls flow into each node / name (through refs, declarations and writers)
        taint = {n: {c for c, _ in self.reads.get(n, [])} for n in nodes}
        names = set(self.regions) | set(writers)
        nt = {}
        for _ in range(len(nodes) + 2):
            nt = {}
            for x in names:
                tx = set(taint.get(x, ())) if x in self.regions else set()
                for w in writers.get(x, ()):
                    tx |= taint.get(w, set())
                nt[x] = tx
            changed = False
            for n in nodes:
                add = set()
                for r in self.refs.get(n, {}):
                    if r != n and r in nt:
                        add |= nt[r]
                if not add <= taint[n]:
                    taint[n] |= add
                    changed = True
            if not changed:
                break
        self.taint, self.name_taint = taint, nt
        # witness search order: the result, what it assigns, other live statements (last first), declarations
        order = list(result_sids)
        order += sorted((x for x in root_names if x in self.regions and x in live), key=self._node_pos)
        order += [sid for sid, _, _, _ in reversed(self.stmts) if sid in live and sid not in order]
        order += sorted((n for n in live if n in self.regions and n not in order), key=self._node_pos)
        order += [n for n in root_nodes if n not in order]
        self._witness_order = order

    def _node_pos(self, n):
        """Sort key: where a node's code starts (ties broken by name, so set order never leaks out)."""
        if n in self.regions:
            return (self.regions[n][0][0], n)
        if not hasattr(self, "_stmt_pos"):
            self._stmt_pos = {sid: s for sid, s, _, _ in self.stmts}
        return (self._stmt_pos.get(n, -1), n)

    def witness(self, ctl):
        """Source snippet where `ctl` is consumed by live code (the result line when it carries it)."""
        for n in self._witness_order:
            cands = [k for c, k in self.reads.get(n, []) if c == ctl]
            for name, ks in self.refs.get(n, {}).items():
                if name != n and ctl in self.name_taint.get(name, ()):
                    cands.extend(ks)
            if cands:
                return _snippet(self.src, self.pos[max(cands)])
        return ""


_EXPR_CACHE = {}           # (src, own kind, effect orders) -> Expr; analyses are immutable once built
_EXPR_CACHE_MAX = 4096


def analyze(src, own_kind=None, mc_effects=MC_KEYS, ct_effects=SHOT_CTLS):
    """Cached Expr(src, ...): many props share one expression source, and repeated views re-read one dump."""
    key = (src, own_kind, tuple(mc_effects), tuple(ct_effects))
    e = _EXPR_CACHE.get(key)
    if e is None:
        if len(_EXPR_CACHE) >= _EXPR_CACHE_MAX:
            _EXPR_CACHE.clear()
        e = _EXPR_CACHE[key] = Expr(src, own_kind, mc_effects, ct_effects)
    return e


def _snippet(src, pos, width=WITNESS_CHARS):
    a = max(src.rfind(b, 0, pos) for b in _LINE_BREAKS) + 1
    ends = [x for x in (src.find(b, pos) for b in _LINE_BREAKS) if x >= 0]
    b = min(ends) if ends else len(src)
    line = src[a:b]
    rel = pos - a
    if len(line.strip()) <= width:
        return _clean(line.strip())
    lo = max(0, min(rel - width // 3, len(line) - width))
    s = line[lo:lo + width].strip()
    return _clean(("..." if lo > 0 else "") + s + ("..." if lo + width < len(line) else ""))


# ================================================================== project model
def _natkey(s):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", _s(s))]


def _hex(rgb):
    return "#" + "".join(f"{max(0, min(255, int(round(float(c) * 255)))):02x}" for c in rgb[:3])


def _is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _is_color(p):
    v = p.get("v")
    if not (isinstance(v, list) and len(v) == 4 and all(_is_num(c) for c in v)):
        return False
    if "Color" in _s(p.get("mn")) or "Color" in _s(p.get("path")):
        return True
    return all(-0.001 <= c <= 1.001 for c in v)


def _layers(comp):
    return [L for L in _list(comp.get("layers")) if isinstance(L, dict)]


def _src_id(layer):
    src = layer.get("source")
    return _key(src.get("id")) if isinstance(src, dict) else None


class Project:
    def __init__(self, data):
        items = [it for it in _list(data.get("items")) if isinstance(it, dict)]
        self.items = items
        self.errors = [it for it in items if "error" in it]
        self.byid = {}
        for it in items:
            if _key(it.get("id")) is not None:
                self.byid[_key(it.get("id"))] = it
        self.comps = [it for it in items if it.get("type") == "comp" and "error" not in it]
        self.skipped = [c for c in self.comps if c.get("skipped")]
        self.main = next((c for c in self.comps if c.get("name") == "mainComp"), None)
        self.mc_layer, self.mc_stub = None, False
        if self.main:
            for L in _layers(self.main):
                if L.get("name") == "mainControl":
                    if "error" in L:
                        self.mc_stub = True
                    elif self.mc_layer is None:
                        self.mc_layer = L
        fx = [e.get("name") for e in _list((self.mc_layer or {}).get("effects")) if isinstance(e, dict)]
        self.mc_effects = tuple(_s(n) for n in fx) if fx else MC_KEYS
        self.kind, cands = self._find_shots()
        self.shots = self._shot_comps(cands)
        self.dup_names = sorted(((n, c) for n, c in Counter(_s(c.get("name")) for c in self.shots).items() if c > 1),
                                key=lambda x: _natkey(x[0]))
        shot_names = {_s(c.get("name")) for c in self.shots}
        if self.kind == "arrangement":
            def key(s):
                m = re.search(r"-(\d+)$", s)
                return (int(m.group(1)) if m else 1 << 30, _natkey(s))
        else:
            key = _natkey
        self.shot_order = sorted(shot_names, key=key)
        self.shot_of = self._attribute()          # id(comp) -> tuple of row names

    def _in_folder(self, it, name):
        seen, fid = set(), _key(it.get("folder"))
        while fid is not None and fid not in seen:
            seen.add(fid)
            f = self.byid.get(fid)
            if not f:
                return False
            if f.get("name") == name:
                return True
            fid = _key(f.get("folder"))
        return False

    def _find_shots(self):
        for kind, folder in (("arrangement", "PROJECT_SHOTS"), ("template", "ORIGINAL_SHOTS")):
            if any(it.get("type") == "folder" and it.get("name") == folder for it in self.items):
                shots = [c for c in self.comps if self._in_folder(c, folder) and c is not self.main]
                if shots:
                    return kind, shots
        shots = [c for c in self.comps if re.fullmatch(r"\d+(-\d+)?", _s(c.get("name")))]
        return "generic", shots

    def _shot_comps(self, cands):
        """Shot rows among the comps of the shots folder: not precomps nested in another shot comp
        (director asset clones live in PROJECT_SHOTS too); arrangement: the instances sequenced in mainComp,
        or named {shot}-{i}."""
        ids = {_key(c.get("id")) for c in cands} - {None}
        nested = set()
        for c in cands:
            for L in _layers(c):
                sid = _src_id(L)
                if sid in ids and sid != _key(c.get("id")):
                    nested.add(sid)
        top = [c for c in cands if _key(c.get("id")) not in nested]
        if self.kind == "arrangement":
            in_main = {_src_id(L) for L in _layers(self.main or {})} - {None}
            top_ids = {id(c) for c in top}
            picked = [c for c in cands if _key(c.get("id")) in in_main
                      or (id(c) in top_ids and re.fullmatch(r".+-\d+", _s(c.get("name"))))]
            if picked:
                return picked
        return top or cands

    def _attribute(self):
        comp_by_id = {}
        for c in self.comps:
            if _key(c.get("id")) is not None:
                comp_by_id[_key(c.get("id"))] = c
        shot_ids = {id(c) for c in self.shots}
        reach = {}
        for s in sorted(self.shots, key=lambda c: self.shot_order.index(_s(c.get("name")))):
            row = _s(s.get("name"))
            seen, queue = {id(s)}, [s]
            while queue:
                c = queue.pop(0)
                for L in _layers(c):
                    sub = comp_by_id.get(_src_id(L))
                    if sub is None or id(sub) in seen or id(sub) in shot_ids or sub is self.main:
                        continue
                    seen.add(id(sub))
                    queue.append(sub)
                    rows = reach.setdefault(id(sub), [])
                    if row not in rows:
                        rows.append(row)
        out = {}
        by_len = sorted(set(self.shot_order), key=lambda s: (-len(s), s))
        for c in self.comps:
            if id(c) in shot_ids:
                out[id(c)] = (_s(c.get("name")),)
            elif id(c) in reach:
                out[id(c)] = tuple(reach[id(c)])
            else:
                nm = _s(c.get("name"))
                for s in by_len:                   # fallback: {shot}-text / {shot}-frame (+ AE " N" suffix)
                    if nm.startswith(s + "-") and re.fullmatch(r"(?:text|frame)(?: \d+)?", nm[len(s) + 1:]):
                        out[id(c)] = (s,)
                        break
        return out

    def palette(self):
        out = {}
        for p in _list((self.mc_layer or {}).get("props")):
            if not isinstance(p, dict):
                continue
            parts = _s(p.get("path")).split("/")
            if len(parts) >= 2 and parts[0] == "Effects" and parts[1] in MC_KEYS:
                out[parts[1]] = p
        return out


def _own_kind(comp, layer):
    if layer.get("name") == "mainControl" and comp.get("name") == "mainComp":
        return "MC"
    if layer.get("name") == "controller":
        return "CT"
    return None


def _ct_effects(layer_by_name):
    ct = layer_by_name.get("controller")
    fx = [e.get("name") for e in _list((ct or {}).get("effects")) if isinstance(e, dict)]
    return tuple(_s(n) for n in fx) if fx else SHOT_CTLS


# ================================================================== analysis over the dump
class Wiring:
    def __init__(self, data):
        self.P = P = Project(data)
        self.rows = {}           # row name -> {"exprs": n, "any": n, ctl: n, "dead": {ctl: n}}
        self.uses = []           # the subset that uses >= 1 control (row "(other)" when unattributed)
        self.stats = {"exprs": 0, "disabled": 0, "xerr": 0, "mention_mc": 0, "mention_ct": 0,
                      "use_mc": 0, "use_ct": 0, "layer_errors": 0}
        self.other_comps = set()
        for comp in P.comps:
            layers = _layers(comp)
            self.stats["layer_errors"] += sum(1 for L in layers if "error" in L)
            layers = [L for L in layers if "error" not in L]
            ct_fx = _ct_effects({L.get("name"): L for L in layers if _key(L.get("name")) is not None})
            rows = P.shot_of.get(id(comp))
            for L in layers:
                ok = _own_kind(comp, L)
                for p in _list(L.get("props")):
                    if not isinstance(p, dict) or not isinstance(p.get("x"), str):
                        continue
                    if p.get("xOn") is False:
                        self.stats["disabled"] += 1
                        continue
                    x = p["x"]
                    self.stats["exprs"] += 1
                    if p.get("xErr"):
                        self.stats["xerr"] += 1
                    if "mainControl" in x:
                        self.stats["mention_mc"] += 1
                    if "controller" in x:
                        self.stats["mention_ct"] += 1
                    e = analyze(x, ok, P.mc_effects, ct_fx)
                    if e.used & set(MC_KEYS):
                        self.stats["use_mc"] += 1
                    if e.used & set(SHOT_CTLS):
                        self.stats["use_ct"] += 1
                    if rows is None:
                        if not (e.used or e.mentioned):
                            continue
                        if e.used:
                            self.other_comps.add(_s(comp.get("name")) or "?")
                    for rname in rows or ("(other)",):
                        r = self.rows.setdefault(rname, _new_row())
                        for c in e.mentioned - e.used:
                            r["dead"][c] += 1
                        if rows is None and not e.used:
                            continue
                        r["exprs"] += 1
                        if e.used:
                            r["any"] += 1
                            self.uses.append((rname, comp, L, p, e))
                        for c in e.used:
                            r[c] += 1
        for s in P.shot_order:
            self.rows.setdefault(s, _new_row())

    def row_order(self):
        names = list(self.P.shot_order)
        if self.other_comps:
            names.append("(other)")
        return names


def _new_row():
    r = {"exprs": 0, "any": 0, "dead": {c: 0 for c in CONTROLS}}
    r.update({c: 0 for c in CONTROLS})
    return r


def _loc(row, comp, layer, p):
    cn = _s(comp.get("name")) or "?"
    pre = "" if cn == row else f"{_clean(cn)} / "
    return f"{pre}[{_clean(layer.get('index', '?'))}] {_clean(layer.get('name', '?'))} / {_clean(p.get('path') or '?')}"


# ================================================================== hard-coded colors
def _range_text(vals):
    nums = sorted(set(vals), key=int)
    ints = [int(v) for v in nums]
    if len(ints) > 2 and ints == list(range(ints[0], ints[-1] + 1)):
        return f"{ints[0]}-{ints[-1]}"
    return ",".join(nums)


def _collapse_paths(paths):
    """Paths that differ only in integers -> one templated path ('Group 1-6/...')."""
    groups = {}
    for p in paths:
        parts = re.split(r"(\d+)", _s(p))
        key = tuple(x if i % 2 == 0 else "#" for i, x in enumerate(parts))
        groups.setdefault(key, []).append(parts)
    out = []
    for key, members in groups.items():
        segs = []
        for i, x in enumerate(key):
            if i % 2 == 0:
                segs.append(x)
            else:
                segs.append(_range_text([m[i] for m in members]))
        out.append(("".join(segs), len(members)))
    return out


def _hardcoded_colors(W, rx=None):
    P = W.P
    pal = {}
    for k, p in P.palette().items():
        v = p.get("v")
        if isinstance(v, list) and len(v) >= 3 and all(_is_num(c) for c in v[:3]):
            pal[k] = v[:3]
    order = {s: i for i, s in enumerate(P.shot_order)}

    def rows_of(c):
        return P.shot_of.get(id(c)) or ()

    def first_row(c):
        r = rows_of(c)
        return r[0] if r else None

    comps = [c for c in P.comps if rx is None or rx.search(_s(c.get("name")))
             or any(rx.search(r) for r in rows_of(c))]
    comps = sorted(comps, key=lambda c: (order.get(first_row(c), 1 << 30),
                                         0 if first_row(c) == c.get("name") else 1, _natkey(c.get("name"))))
    # stage 1: (comp, layer) -> {(hex, note): [paths]}
    rows1 = []
    total = 0
    for c in comps:
        for L in _layers(c):
            if "error" in L:
                continue
            if c is P.main and L.get("name") == "mainControl":
                continue
            buckets = {}
            for p in _list(L.get("props")):
                if not isinstance(p, dict) or not _is_color(p):
                    continue
                if isinstance(p.get("x"), str) and p.get("xOn") is not False:
                    continue
                rgb = p["v"][:3]
                if max(rgb) - min(rgb) < NEUTRAL_SPREAD:
                    continue
                notes = []
                if p.get("k"):
                    notes.append("keyed")
                if isinstance(p.get("x"), str):
                    notes.append("expr off")
                for k2, prgb in sorted(pal.items()):
                    if all(abs(a - b) <= PALETTE_NEAR for a, b in zip(rgb, prgb)):
                        notes.append(f"= palette {k2}, not linked")
                        break
                buckets.setdefault((_hex(rgb), ", ".join(notes)), []).append(_s(p.get("path")) or "?")
                total += 1
            row = first_row(c)
            base = re.sub(r"-\d+$", "", row) if row and P.kind == "arrangement" else row
            for (hx, note), paths in buckets.items():
                for tpl, n in _collapse_paths(paths):
                    rows1.append((_s(c.get("name")) or "?", base, _s(L.get("name")) or "?", tpl, hx, note, n))
    # stage 2: merge layers with the same (comp, path, hex, note)
    st2, ord2 = {}, []
    for comp, base, layer, tpl, hx, note, n in rows1:
        k = (comp, tpl, hx, note)
        if k not in st2:
            st2[k] = [base, [], 0]
            ord2.append(k)
        st2[k][1].append(layer)
        st2[k][2] += n
    # stage 3: merge comps with the same (layers, path, hex, note); a layer name starting with the comp's
    # shot ("03 seams" in 03) matches across shots as "{shot} seams"
    st3, ord3 = {}, []
    for k in ord2:
        base, layers, n = st2[k]
        counts = {}
        for nm in layers:
            counts[nm] = counts.get(nm, 0) + 1
        label = ", ".join(nm if cnt == 1 else f"{nm} x{cnt}" for nm, cnt in counts.items())
        norm = label
        if base:
            norm = re.sub(r"(^|, )" + re.escape(base) + r"(?=[^0-9A-Za-z]|$)", r"\1{shot}", label)
        k3 = (norm, k[1], k[2], k[3])
        if k3 not in st3:
            st3[k3] = [[], set(), 0]
            ord3.append(k3)
        st3[k3][0].append(k[0])
        st3[k3][1].add(label)
        st3[k3][2] += n
    lines = []
    for k3 in ord3:
        comps_l, labels, n = st3[k3]
        norm, tpl, hx, note = k3
        label = next(iter(labels)) if len(labels) == 1 else norm
        comps_c = [_clean(c) for c in comps_l]
        if len(comps_c) > COMPS_LISTED:
            comps_s = ",".join(comps_c[:COMPS_LISTED]) + f",+{len(comps_c) - COMPS_LISTED} comps"
        else:
            comps_s = ",".join(comps_c)
        extra = (f" x{n}" if n > 1 else "") + (f" ({note})" if note else "")
        lines.append(f"  {comps_s} / {_clean(label)} / {_clean(tpl)} / {hx}{extra}")
    return total, lines


# ================================================================== rendering
def _fmt_val(p):
    if p is None:
        return "?"
    v = p.get("v")
    s = _hex(v) if isinstance(v, list) and len(v) >= 3 and all(_is_num(c) for c in v[:3]) else \
        (f"{v:g}" if _is_num(v) else _clean(v))
    if p.get("k"):
        s += " keyed"
    if isinstance(p.get("x"), str) and p.get("xOn") is not False:
        s += " expr"
    return s


def _table(W, names, filtered=False):
    cols = ["exprs", "any"] + list(CONTROLS)
    shown = [_clean(n) for n in names]
    w0 = max([4] + [len(n) for n in shown])
    widths = [max(4, len(c)) for c in cols]
    out = ["shot".ljust(w0) + "".join(" " + c.rjust(w) for c, w in zip(cols, widths))]
    for n, sn in zip(names, shown):
        r = W.rows[n]
        out.append(sn.ljust(w0) + "".join(" " + str(r[c]).rjust(w) for c, w in zip(cols, widths)))
    dead_rows = [n for n in W.rows if n in names or (n == "(other)" and not filtered)]
    dead = {c: sum(W.rows[n]["dead"][c] for n in dead_rows) for c in CONTROLS}
    out.append("dead".ljust(w0) + "".join(" " + str(dead.get(c, "-")).rjust(w) for c, w in zip(cols, widths)))
    return out


def _flags(W, names):
    by = {}
    for row, comp, L, p, e in W.uses:
        for c in e.used:
            by.setdefault((row, c), []).append((comp, L, p, e))
    flags = []
    for n in names:
        if n == "(other)":
            continue
        r, sn = W.rows[n], _clean(n)
        for c in TRINITY:
            if r[c] == 0:
                flags.append(f"  {sn} {c}: used by 0 props")
            elif r[c] == 1:
                comp, L, p, e = by[(n, c)][0]
                wt = e.witness(c)
                flags.append(f"  {sn} {c}: used by 1 prop only - {_loc(n, comp, L, p)}" + (f"  `{wt}`" if wt else ""))
        if r["enter"] == 0 and r["exit"] == 0:
            flags.append(f"  {sn} no enter/exit usage (nothing animates in or out)")
        elif r["enter"] == 0 or r["exit"] == 0:
            flags.append(f"  {sn} no {'enter' if r['enter'] == 0 else 'exit'} usage")
        if r["1"] == 0 and r["2"] == 0 and r["3"] == 0:
            flags.append(f"  {sn} uses no palette color 1/2/3")
    return flags


SHOT_MARK = "{shot}"


def _detail(W, ctl, names, budget=OUTPUT_BUDGET):
    """Per-shot list of the props using ctl; shots with identical lists are printed once; stops adding
    rows once the text passes `budget` chars."""
    by = {}
    for row, comp, L, p, e in W.uses:
        if ctl in e.used:
            by.setdefault(row, []).append((comp, L, p, e))
    groups, gorder = {}, []                   # signature -> [shot names], in row order
    for n in names:
        uses = by.get(n, [])
        dead = W.rows.get(n, {}).get("dead", {}).get(ctl, 0)
        rk, rorder = {}, []
        for comp, L, p, e in uses:
            path = _s(p.get("path")) or "?"
            k = (id(comp), _s(L.get("name")), re.sub(r"\d+", "#", path))
            if k not in rk:
                rk[k] = [comp, _s(L.get("name")) or "?", set(), [], e.witness(ctl)]
                rorder.append(k)
            rk[k][2].add(_s(L.get("index", "?")))
            rk[k][3].append(path)
        rows = []
        for k in rorder:
            comp, lname, idxs, paths, wt = rk[k]
            tpl = _collapse_paths(paths)[0][0]
            ix = _range_text(idxs) if all(i.isdigit() for i in idxs) else ",".join(sorted(idxs))
            cn = _s(comp.get("name")) or "?"
            if cn == n:
                pre = ""
            elif n != "(other)" and cn.startswith(n + "-"):
                pre = SHOT_MARK + cn[len(n):] + " / "
            else:
                pre = cn + " / "
            cnt = f" x{len(paths)}" if len(paths) > 1 else ""
            rows.append((pre, f"[{ix}] {lname} / {tpl}{cnt}", wt))
        sig = (len(uses), dead, tuple(rows))
        if sig not in groups:
            groups[sig] = []
            gorder.append(sig)
        groups[sig].append(n)
    grouped = any(len(groups[sig]) > 1 for sig in gorder)
    head = (f"props using {ctl} (live reads only; `snippet` = where the value is consumed; same-named layers "
            f"and paths differing only in numbers collapsed" + (f"; {SHOT_MARK} = each shot listed" if grouped else "")
            + "):")
    headers, bodies = [], []
    for sig in gorder:
        members = groups[sig]
        nuse, dead, rows = sig
        label = ",".join(_clean(m) for m in members)
        headers.append(f"{label}: {nuse} prop(s) use {ctl}; {dead} read it but never use it")
        body = []
        for pre, rest, wt in rows:
            if len(members) == 1:
                pre = pre.replace(SHOT_MARK, members[0], 1)
            body.append(f"  {_clean(pre)}{_clean(rest)}" + (f"  `{wt}`" if wt else ""))
        bodies.append(body)
    room = budget - len(head) - sum(len(h) + 1 for h in headers) - 60
    lines, shown, total = [head], 0, 0
    for h, body in zip(headers, bodies):
        lines.append(h)
        for b in body:
            total += 1
            if shown >= DETAIL_ROWS_MAX or len(b) + 1 > room:
                room = -1                         # keep order: once a row is cut, cut the rest too
                continue
            room -= len(b) + 1
            shown += 1
            lines.append(b)
    if total > shown:
        lines.append(f"  ... +{total - shown} more rows (narrow with --comp)")
    return lines


def _norm_control(name):
    if not name:
        return None
    for c in CONTROLS:
        if c.lower() == str(name).lower():
            return c
    if str(name).upper() in ("PRES", "PRESS"):
        return "PRESSURE"
    return False


def wiring(data, args):
    """Return (text, exit_code): shot x {FORM,FLOW,PRESSURE,1,2,3,enter,exit} live-usage table + flags."""
    if not isinstance(data, dict):
        return ("wiring: dump is not a JSON object", 2)
    W = Wiring(data)
    P = W.P
    comp_rx = getattr(args, "comp", None)
    names = W.row_order()
    rx = None
    if comp_rx:
        try:
            rx = re.compile(comp_rx)
        except re.error as e:
            return (f"wiring: bad --comp regex {comp_rx!r}: {e}", 2)
        names = [n for n in names if rx.search(n)]
    out = []
    pal = P.palette()
    if P.mc_layer:
        out.append("mainComp/mainControl: " + " | ".join(f"{c} {_fmt_val(pal.get(c))}" for c in MC_KEYS))
    elif P.mc_stub:
        out.append("mainComp/mainControl failed to extract (error stub) - effect order unknown, reads matched by name")
    else:
        out.append("NO mainComp/mainControl layer found - control reads below are by name only")
    s = W.stats
    extra = [f"{s['disabled']} disabled skipped"] if s["disabled"] else []
    extra += [f"{s['xerr']} with errors"] if s["xerr"] else []
    out.append(f"{s['exprs']} exprs{' (' + ', '.join(extra) + ')' if extra else ''}: "
               f"{s['mention_mc']} mention mainControl -> {s['use_mc']} use it; "
               f"{s['mention_ct']} mention controller -> {s['use_ct']} use it")
    notes = []
    if P.errors:
        notes.append(f"{len(P.errors)} item error stubs")
    if s["layer_errors"]:
        notes.append(f"{s['layer_errors']} layer error stubs")
    if P.skipped:
        notes.append(f"{len(P.skipped)} comps skipped by --comps scope")
    if notes:
        out.append("INCOMPLETE: " + ", ".join(notes) + " (counts exclude them)")
    if P.dup_names:
        out.append("NOTE: duplicate shot comp names merged into one row: "
                   + ", ".join(f"{_clean(n)} x{c}" for n, c in P.dup_names))
    if not P.comps:
        out.append("no comps in dump")
        return ("\n".join(out), EXIT_OK)

    ctl = _norm_control(getattr(args, "control", None))
    if ctl is False:
        return (f"wiring: unknown control {getattr(args, 'control', None)!r} (one of {', '.join(CONTROLS)})", 2)
    if not names:
        out.append("no shots found" + (f" matching {comp_rx!r}" if comp_rx else
                                       " (no ORIGINAL_SHOTS/PROJECT_SHOTS folder, no NN comps)"))
        if ctl or comp_rx:
            return ("\n".join(out), 2)
    if ctl:
        out.extend(_detail(W, ctl, names, OUTPUT_BUDGET - sum(len(x) + 1 for x in out)))
        return ("\n".join(out), EXIT_OK)

    if names:
        where = {"arrangement": "PROJECT_SHOTS instances in sequence order",
                 "template": "ORIGINAL_SHOTS", "generic": "comps named NN / NN-i"}[P.kind]
        out.append(f"props per shot ({where} + their precomps; any = uses >=1 control; "
                   f"dead = reads it, value unused):")
        out.extend(_table(W, names, bool(comp_rx)))
        if W.other_comps:
            out.append(f"(other) = {', '.join(_clean(c) for c in sorted(W.other_comps, key=_natkey))}")
    flags = _flags(W, names)
    if flags:
        out.append(f"FLAGS ({len(flags)}):")
        out.extend(flags[:FLAG_ROWS_MAX])
        if len(flags) > FLAG_ROWS_MAX:
            out.append(f"  ... +{len(flags) - FLAG_ROWS_MAX} more")
    else:
        out.append("FLAGS: none")
    total, lines = _hardcoded_colors(W, rx)
    if total:
        out.append(f"hard-coded colors (confirm intent): {total} props with no expression, "
                   f"RGB spread >= {NEUTRAL_SPREAD} (comp / layer / path / hex):")
        out.extend(lines[:COLOR_ROWS_MAX])
        if len(lines) > COLOR_ROWS_MAX:
            rest = len(lines) - COLOR_ROWS_MAX
            out.append(f"  ... +{rest} more groups")
    else:
        out.append("hard-coded colors: none (every non-neutral color has an expression)")
    if hasattr(args, "control") and names:
        out.append(f"drill down: aectx wiring --control PRESSURE [--comp '^{names[0]}$']")
    return ("\n".join(out), EXIT_OK)
