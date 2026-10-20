"""Tests for aectx.exprs (index, errors, refs, show). Offline: fixtures + synthetic dumps.

Run: cd skills/ae-context && python3 -m unittest tests.test_exprs -v
"""
import contextlib
import copy
import gzip
import hashlib
import io
import json
import os
import re
import sys
import unittest
from argparse import Namespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from aectx import exprs as X  # noqa: E402

FIX = os.path.join(HERE, "fixtures")
BUDGET = 18000


def load(name):
    with gzip.open(os.path.join(FIX, name + ".json.gz"), "rt", encoding="utf-8") as f:
        return json.load(f)


STEEL = load("steel")
ARR = load("arr746")


def ns(**kw):
    return Namespace(**kw)


def run(data, **kw):
    return X.exprs(data, ns(**kw))


def prop(path, x=None, **extra):
    p = {"path": path, "mn": "ADBE " + path.replace("/", " "), "v": 0}
    if x is not None:
        p["x"] = x
    p.update(extra)
    return p


def layer(index, name, props, **extra):
    L = {"index": index, "id": 100 + index, "name": name, "type": "shape", "enabled": True,
         "in": 0, "out": 10, "start": 0, "props": props}
    L.update(extra)
    return L


def comp(cid, name, layers, **extra):
    c = {"id": cid, "name": name, "type": "comp", "folder": None, "width": 1080, "height": 1920,
         "duration": 10, "fps": 30, "numLayers": len(layers or []), "layers": layers}
    c.update(extra)
    return c


def dump(*items, meta=None):
    return {"schema": "aectx/2", "meta": meta or {"name": "t.aep", "at": 0, "errors": [], "warnings": []},
            "fonts": [], "items": list(items)}


def ids_in(text):
    return re.findall(r"^(E[0-9a-f]{5,}) x", text, re.M)


# ------------------------------------------------------------------ synthetic project
LIB = ('var MC = comp("mainComp").layer("mainControl");\n'
       'var FORM = MC.effect("FORM")("Slider").value/100;\n'
       'var CT = thisComp.layer("controller");\n'
       'var EN = CT.effect("enter")("Slider");\n'
       'var i = {i};\n'
       'linear(EN.value/100, 0, 1, {a}, 100) * FORM;')


def synthetic():
    def bands(cname, start, a):
        return [layer(start + k, f"{cname}-text",
                      [prop("Transform/Opacity", LIB.format(i=6 - k, a=a)),
                       prop("Transform/Scale", "[100, 100] // fixed\n")])
                for k in range(7)]
    c1 = comp(1, "01", bands("01", 7, 0) + [
        layer(14, "controller", [prop("Effects/enter/Slider", None, k=[[0, 0], [1, 100]])]),
        layer(15, "glow", [prop("Effects/Fill/Color", 'comp("mainComp").layer("mainControl").effect("1")("Color")'),
                           prop("Effects/Glow/Color A", 'comp("mainComp").layer("mainControl").effect("2")("Color")'),
                           prop("Transform/Position", "wiggle(2, 30)", xErr="Error: wiggle is broken\nline 2 detail"),
                           prop("Transform/Rotation", "time * 10", xOn=False)])])
    c2 = comp(2, "02", bands("02", 3, 20))
    return dump(c1, c2, comp(3, "mainComp", [layer(1, "mainControl", [])]))


SYN = synthetic()


# ================================================================== normalization
class NormalizeTests(unittest.TestCase):
    def test_literals_and_whitespace(self):
        k1, l1 = X.normalize('var a = "x";  b = 1.5 +\n  2;')
        k2, l2 = X.normalize("var a='yy'; b=3+4;")
        self.assertEqual(k1, k2)
        self.assertEqual(l1, ['"x"', "1.5", "2"])
        self.assertEqual(l2, ["'yy'", "3", "4"])
        self.assertNotIn("x", k1.replace("var", ""))

    def test_unary_minus_folds_binary_does_not(self):
        k1, l1 = X.normalize("[-300, 5]")
        k2, l2 = X.normalize("[300, -5]")
        self.assertEqual(k1, k2)
        self.assertEqual(l1, ["-300", "5"])
        self.assertEqual(l2, ["300", "-5"])
        k3, l3 = X.normalize("a - 5")
        self.assertEqual(l3, ["5"])
        self.assertIn("-", k3)
        self.assertEqual(X.normalize("return -1")[1], ["-1"])
        self.assertEqual(X.normalize("x * -2")[1], ["-2"])
        self.assertEqual(X.normalize("f(x) - 2")[1], ["2"])
        self.assertEqual(X.normalize("a[0] - .5")[1], ["0", ".5"])

    def test_comments_dropped(self):
        a = X.normalize("x = 1; // note 99 \"s\"\n/* 7 */ y")
        b = X.normalize("x = 2;\ny")
        self.assertEqual(a[0], b[0])
        self.assertEqual(a[1], ["1"])

    def test_identifiers_with_digits_and_number_forms(self):
        self.assertEqual(X.normalize("x1 + y2 + $3 + _4")[1], [])
        self.assertEqual(X.normalize("0xFF + 1e-3 + .5 + 2.")[1], ["0xFF", "1e-3", ".5", "2."])

    def test_regex_literal_kept_division_not(self):
        k, lits = X.normalize('s.replace(/^\\s+|\\s+$/g, "")')
        self.assertIn("/^\\s+|\\s+$/g", k)
        self.assertEqual(lits, ['""'])
        k2, l2 = X.normalize("a / 2 / b")
        self.assertEqual(l2, ["2"])
        self.assertIn("a/", k2)

    def test_escapes_and_robustness(self):
        self.assertEqual(X.normalize(r'"a\"b" + 1')[1], [r'"a\"b"', "1"])
        X.normalize('x = "unterminated\ny = 2')        # must not raise
        X.normalize("x² + 1 /* open comment")       # non-ASCII digit, open comment
        X.normalize("`tpl ${a}` + '\\")                # template, trailing backslash
        self.assertEqual(X.normalize(""), ("", []))

    def test_words_keep_their_space(self):
        k, _ = X.normalize("return  typeof   x")
        self.assertEqual(k, "return typeof x")

    def test_cluster_id_stable(self):
        key = X.normalize("linear(time, 0, 1, 2, 3)")[0]
        cid = X.cluster_id(key)
        self.assertRegex(cid, r"^E[0-9a-f]{5}$")
        self.assertEqual(cid, "E" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:5])
        self.assertEqual(cid, X.cluster_id(X.normalize("linear(time,9,8,7,6)")[0]))

    def test_assign_ids_extends_on_collision(self):
        seen, pair = {}, None
        for i in range(200000):
            k = f"k{i}"
            p = hashlib.sha1(k.encode()).hexdigest()[:5]
            if p in seen:
                pair = (seen[p], k)
                break
            seen[p] = k
        self.assertIsNotNone(pair)
        ids = X.assign_ids(list(pair) + ["other"])
        self.assertNotEqual(ids[pair[0]], ids[pair[1]])
        self.assertGreater(len(ids[pair[0]]), 6)
        self.assertEqual(len(ids["other"]), 6)


# ================================================================== refs parsing / helpers
class HelperTests(unittest.TestCase):
    def test_parse_refs_aliases(self):
        layers, comps = X.parse_refs(
            'var MC = comp("mainComp").layer("mainControl");\nvar F = MC.effect("FORM")("Slider");\n'
            'var a = 1, CT = thisComp.layer("controller"); CT.effect("enter")("Slider");\n'
            'thisComp.layer("x").effect("direct")(1); effect("Own")(1); thisLayer.effect("Me")(1);\n'
            'L.effect("Q"); thisComp.layer(3).effect(2); // layer("commented")')
        self.assertEqual(comps, ["mainComp"])
        self.assertEqual(layers["mainControl"], ["FORM"])
        self.assertEqual(layers["controller"], ["enter"])
        self.assertEqual(layers["x"], ["direct"])
        self.assertEqual(layers["this"], ["Own", "Me"])
        self.assertEqual(layers["L?"], ["Q"])
        self.assertEqual(layers["layer(3)"], ["#2"])
        self.assertNotIn("commented", layers)

    def test_location_compression(self):
        M = X.Member
        ms = [M("01", 0, i, "01-text", "Transform/Position", "1") for i in range(7, 14)]
        ms += [M("01", 0, 3, "a", "Transform/Position", "1"), M("01", 0, 5, "a", "Transform/Position", "1")]
        lines = X.location_lines(ms)
        self.assertEqual(lines, ["01/[3,5] a, [7-13] 01-text :: Transform/Position"])
        ms = [M(c, 0, 4, "seams", f"Contents/Group {g}/Contents/Path 1/Path", "1") for c in ("01", "05") for g in range(1, 7)]
        self.assertEqual(X.location_lines(ms), ["01,05/[4] seams :: Contents/Group {1-6}/Contents/Path 1/Path"])
        self.assertEqual(X.compress_paths(["Effects/CC Light Sweep/Center", "Effects/CC Light Sweep/Direction"]),
                         "Effects/CC Light Sweep/{Center,Direction}")
        ms = [M("03", 0, 8, "03-text", "Transform/Opacity", "1"), M("04", 1, 7, "04-text", "Transform/Opacity", "1")]
        self.assertEqual(X.location_lines(ms), ["03/[8] 03-text; 04/[7] 04-text :: Transform/Opacity"])

    def test_varying_slot_dimensions(self):
        M = X.Member
        ms = []
        for ci, (cn, a) in enumerate((("01", 5), ("02", 9))):
            for li in range(7, 11):
                for path in ("P/A", "P/B"):
                    ms.append(M(cn, ci, li, "L", path, f"f({a}, {li - 7}, {len(path)}, {li * 10 + ord(path[-1])})"))
        slots = {no: (dim, txt) for no, dim, txt in X.varying_slots(ms)}
        self.assertEqual(slots[1], ("comp", "5|9"))
        self.assertEqual(slots[2], ("layer", "0..3(=idx-7)"))
        self.assertNotIn(3, slots)                                # len(path) is constant
        self.assertEqual(slots[4][0], "each")
        self.assertEqual(X._fmt_values(["0.2", "0.5", "0.9", "1.7"]), "0.2..1.7(4 vals)")
        self.assertEqual(X._fmt_values(['"a"', '"b"', '"c"', '"d"']), '"a"|"b"|"c"|+1')

    def test_snippet(self):
        self.assertEqual(X.snippet("wiggle(2, 30)"), "wiggle(2, 30)")
        self.assertEqual(X.snippet("var a = 1;\n// c\nif (a) {\n  a + 1;\n}\n"), "=> a + 1;")
        self.assertTrue(X.snippet("x" * 200).endswith("..."))
        self.assertLessEqual(len(X.snippet("y = " + "x" * 200)), X.SNIPPET)


# ================================================================== fixtures
class FixtureTests(unittest.TestCase):
    def test_cluster_counts(self):
        for data, n_exprs, n_clusters in ((STEEL, 836, 96), (ARR, 910, 57)):
            members, _, _ = X.collect(data)
            self.assertEqual(len(members), n_exprs)
            self.assertEqual(len(X.build_clusters(members)), n_clusters)

    def test_index_budget_and_determinism(self):
        for data, n in ((STEEL, 96), (ARR, 57)):
            text, code = run(data)
            self.assertEqual(code, 0)
            full = "[dump: project.aep, extracted 59m ago]\n" + text      # what the CLI prints on top
            self.assertLessEqual(len(full), BUDGET)
            self.assertEqual(text, run(data)[0])
            shown = len(ids_in(text))
            m = re.search(r"\.\.\. (\d+) more clusters", text)
            self.assertEqual(shown + (int(m.group(1)) if m else 0), n)
            self.assertTrue(text.isascii())

    def test_index_content_steel(self):
        text, _ = run(STEEL)
        self.assertTrue(text.startswith("836 expressions in 96 clusters"))
        self.assertIn("Ecff9a x78 L=1 C=59 refs=mainControl:3,2,1|comp(\"mainComp\")", text)
        self.assertIn("01/[7-13] 01-text :: ", text)
        self.assertRegex(text, r"vary layer: #290=0\.\.6\(=13-idx\)")
        self.assertRegex(text, r"R\d+ = mainControl:FORM,FLOW,PRESSURE\|controller:enter,exit")
        self.assertNotIn("MC?", text)                            # MC alias resolved to mainControl
        ids = ids_in(text)
        self.assertEqual(len(ids), len(set(ids)))
        counts = [int(c) for c in re.findall(r"^E[0-9a-f]{5,} x(\d+)", text, re.M)]
        self.assertEqual(counts, sorted(counts, reverse=True))

    def test_ids_stable_across_projects(self):
        a = set(ids_in(run(STEEL)[0]))
        b = set(ids_in(run(ARR)[0]))
        self.assertTrue({"Ecff9a", "E1f4da", "E2d209"} <= (a & b))

    def test_comp_filter_keeps_ids(self):
        full = ids_in(run(STEEL)[0])
        text, code = run(STEEL, comp="^01$")
        self.assertEqual(code, 0)
        self.assertTrue(text.startswith("129 expressions in 34 clusters across 1 comps matching --comp '^01$' "
                                        "(whole dump: 836 expressions, 96 clusters)"), text[:200])
        self.assertTrue(set(ids_in(text)) <= set(full))
        self.assertNotRegex(text, r"(?m)^  .*\b0[2-6]/\[")
        self.assertIn("Ecff9a x11/78 ", text)                    # partial count of the palette cluster

    def test_errors_none(self):
        text, code = run(STEEL, errors=True); self.assertEqual(code, 0); self.assertTrue(text.startswith("no expression errors (836 expressions checked, evaluated at t=0s"), text)
        text, code = run(ARR, errors=True); self.assertEqual(code, 0); self.assertTrue(text.startswith("no expression errors (910 expressions checked, evaluated at t=0s"), text)

    def test_refs_fixture(self):
        text, code = run(STEEL, refs="controller")
        self.assertEqual(code, 0)
        self.assertTrue(text.startswith("553 of 836 expressions reference 'controller'"))
        self.assertIn("per comp: 01:93 02:12 03:120 04:119 05:93 06:116", text)
        self.assertIn("reads=controller:enter,exit", text)
        self.assertLessEqual(len(text), BUDGET)
        t2, _ = run(STEEL, refs="1")
        self.assertIn("numeric name", t2)
        self.assertIn("reads=mainControl:1", t2)
        t3, _ = run(STEEL, refs="maincontrol")
        self.assertIn("case-insensitive", t3)
        self.assertLessEqual(len(run(STEEL, refs="mainControl")[0]), BUDGET)

    def test_show_fixture(self):
        text, code = run(STEEL, show="E2e3fe")
        self.assertEqual(code, 0)
        ex = next(p["x"] for it in STEEL["items"] if it.get("name") == "03"
                  for L in it["layers"] if L["index"] == 8 for p in L["props"] if p["path"] == "Transform/Opacity")
        self.assertIn(ex, text)                                  # full exemplar source, verbatim
        self.assertIn("exemplar: 03 / [8] 03-text / Transform/Opacity", text)
        self.assertRegex(text, r"#142 by layer: L\d+: var i = <<6>>;")
        self.assertIn("member (all :: Transform/Opacity)", text)
        self.assertRegex(text, r"06 / \[11\] 06-text\s+\| 4\s+\| 110 ")
        self.assertEqual(run(STEEL, show="e2e3f")[0], text)     # case/prefix tolerant
        self.assertEqual(run(STEEL, show="2e3fe")[0], text)

    def test_show_unknown_and_ambiguous(self):
        text, code = run(STEEL, show="Ezzzzz")
        self.assertEqual(code, 2)
        self.assertIn("unknown cluster ID", text)
        self.assertIn("Ecff9a", text)                            # suggests the largest clusters
        for short in ("E", "E8", "Ee3", "e"):                    # < MIN_PREFIX hex digits: never a prefix match
            text, code = run(STEEL, show=short)
            self.assertEqual(code, 2, short)
            self.assertIn("unknown cluster ID", text)
            self.assertNotIn("ambiguous", text)
        self.assertIn("at least 3 hex digits", run(STEEL, show="E8")[0])
        self.assertIn("'E' + 5 hex digits", run(STEEL, show="Exyz")[0])
        self.assertEqual(run(STEEL, show="Ecff")[0], run(STEEL, show="Ecff9a")[0])   # 3+ digits: unique prefix
        text, code = run(STEEL, show="E2e3fe", comp="^01$")
        self.assertEqual(code, 2)
        self.assertIn("03, 04, 06", text)

    def test_cli_integration(self):
        from aectx import cli
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = cli.main(["exprs", "--file", os.path.join(FIX, "arr746.json.gz")])
        self.assertEqual(code, 0)
        self.assertIn("910 expressions in 57 clusters", buf.getvalue())
        self.assertLessEqual(len(buf.getvalue()), BUDGET + 1)


# ================================================================== synthetic
class SyntheticTests(unittest.TestCase):
    def test_index_synthetic(self):
        text, code = run(SYN)
        self.assertEqual(code, 0)
        self.assertTrue(text.startswith("32 expressions in 5 clusters across 2 comps"))
        self.assertIn("01/[7-13] 01-text; 02/[3-9] 02-text :: Transform/Opacity", text)
        self.assertIn("vary comp: #13=0|20; layer: #9=0..6(=c-idx, c per comp)", text)
        self.assertIn("vary prop: #3=\"1\"|\"2\"", text)
        self.assertIn("01/[15] glow :: Effects/{Fill/Color,Glow/Color A}", text)
        self.assertIn("refs=mainControl:FORM|controller:enter|comp(\"mainComp\")", text)
        self.assertIn("ERR=1", text)
        self.assertIn("OFF=1", text)
        self.assertIn("on the layers of", text)                 # Scale shares the Opacity layers

    def test_errors_synthetic(self):
        text, code = run(SYN, errors=True)
        self.assertEqual(code, 1)
        lines = text.splitlines()
        self.assertTrue(lines[0].startswith("2 broken expressions (1 with errors, 1 disabled) of 32 checked"))
        self.assertRegex(text, r"(?m)^01 / \[15\] glow / Transform/Position: Error: wiggle is broken  \[E[0-9a-f]{5}\]$")
        self.assertRegex(text, r"(?m)^01 / \[15\] glow / Transform/Rotation: \(disabled\) ")
        self.assertNotIn("line 2 detail", text)
        self.assertEqual(run(SYN, errors=True, comp="^02$")[1], 0)

    def test_errors_without_source(self):
        d = dump(comp(1, "c", [layer(1, "L", [prop("Transform/Position", None, xErr="boom")])]))
        text, code = run(d, errors=True)
        self.assertEqual(code, 1)
        self.assertIn("c / [1] L / Transform/Position: boom", text)

    def test_refs_synthetic(self):
        text, code = run(SYN, refs="FORM")
        self.assertEqual(code, 0)
        self.assertIn("14 of 32 expressions reference 'FORM'", text)
        self.assertIn("per comp: 01:7 02:7", text)
        self.assertIn("reads=mainControl:FORM", text)
        text, _ = run(SYN, refs="glow")
        self.assertIn("no expression references 'glow'", text)
        text, _ = run(SYN, refs="02-text")
        self.assertIn("no expression references", text)
        self.assertEqual(run(SYN, refs="")[1], 2)
        text, _ = run(dump(comp(1, "c", [layer(1, "L", [prop("P", "var i = 2; i")])])), refs="i")
        self.assertIn("1 whole-word only", text)

    def test_show_synthetic(self):
        cid = X.cluster_id(X.normalize(LIB.format(i=0, a=0))[0])
        text, code = run(SYN, show=cid)
        self.assertEqual(code, 0)
        self.assertIn(LIB.format(i=6, a=0), text)
        self.assertIn("#9 by layer: L5: var i = <<6>>;  values 0..6(=c-idx, c per comp)", text)
        self.assertIn("#13 by comp: L6: linear(EN.value/100, 0, 1, <<0>>, 100) * FORM;  values 0|20", text)
        self.assertRegex(text, r"02 / \[9\] 02-text\s+\| 0\s+\| 20")
        cid2 = X.cluster_id(X.normalize("[100, 100] // fixed\n")[0])
        text, code = run(SYN, show=cid2)
        self.assertEqual(code, 0)
        self.assertIn("no varying literal slots", text)
        self.assertIn("01/[7-13] 01-text; 02/[3-9] 02-text :: Transform/Scale", text)
        text, _ = run(SYN, show=X.cluster_id(X.normalize("wiggle(1,1)")[0]))
        self.assertIn("exemplar error: Error: wiggle is broken", text)
        self.assertEqual(run(SYN, show="")[1], 2)

    def test_mode_priority_and_missing_args(self):
        self.assertTrue(X.exprs(SYN, object())[0].startswith("32 expressions"))       # no fields at all
        self.assertIn("broken expressions", run(SYN, errors=True, index=False)[0])
        self.assertEqual(run(SYN, index=True)[0], run(SYN)[0])

    def test_empty_projects(self):
        for d in ({}, {"items": []}, dump(), {"items": None}, [], None):
            text, code = X.exprs(d, ns())
            self.assertEqual(code, 0, d)
            self.assertIn("0 expressions in 0 clusters", text)
            self.assertIn("no expressions in this dump", text)
            text, code = X.exprs(d, ns(errors=True)); self.assertEqual(code, 0); self.assertTrue(text.startswith("no expression errors (0 expressions checked"), text)
            self.assertEqual(X.exprs(d, ns(show="E12345"))[1], 2)
            self.assertIn("no expression references", X.exprs(d, ns(refs="x"))[0])

    def test_stubs_and_missing_fields(self):
        d = dump(
            {"id": 9, "name": "broken item", "error": "boom", "line": 3},
            comp(1, "noLayers", None),
            comp(2, "emptyLayers", []),
            comp(3, "skipped", None, skipped=True),
            comp(4, "c", [
                {"index": 1, "name": "bad layer", "error": "x", "line": 1},
                {"name": "no index", "props": [{"x": "1 + 2"}]},                 # no path, no index
                {"index": 3, "props": None},
                {"index": 4, "name": "n", "props": ["not a dict", {"path": "P", "x": ""}, {"path": "Q", "x": 42}]},
                "not a layer",
            ]),
            {"id": 5, "type": "comp", "name": "c"},                               # duplicate name, no layers
            {"id": 6, "type": "footage", "name": "f"},
            "junk",
        )
        text, code = run(d)
        self.assertEqual(code, 0)
        self.assertIn("1 expressions in 1 clusters", text)
        self.assertIn("WARNING: 1 item(s) failed to extract (not checked): broken item", text)
        self.assertIn("WARNING: 1 layer(s) failed to extract (not checked): c#4/[1] bad layer", text)
        self.assertIn("1 comp(s) skipped by a scoped extraction", text)
        self.assertIn("c#4/[~2] no index :: ?", text)            # duplicate comp names get #id labels;
        #                                                        '~' = no index in the dump, list position shown
        text, code = run(d, errors=True)
        self.assertEqual(code, 0)
        self.assertIn("no expression errors (1 expressions checked", text)
        self.assertIn("layer(s) failed to extract", text)

    def test_duplicate_comp_names_filter(self):
        d = dump(comp(1, "dup", [layer(1, "a", [prop("P", "1")])]), comp(2, "dup", [layer(1, "b", [prop("P", "2")])]))
        text, _ = run(d, comp="^dup$")
        self.assertIn("across 2 comps matching", text)
        self.assertIn("dup#1/[1] a; dup#2/[1] b :: P", text)

    def test_comp_regex_errors(self):
        text, code = run(SYN, comp="(")
        self.assertEqual(code, 2)
        self.assertIn("invalid --comp regex", text)
        text, code = run(SYN, comp="^nope$")
        self.assertEqual(code, 2)
        self.assertIn("no comp matches --comp", text)
        self.assertIn("01, 02, mainComp", text)
        text, code = run(SYN, comp="mainComp")
        self.assertEqual(code, 0)
        self.assertIn("no expressions in the selected comps", text)

    def test_budget_truncation(self):
        layers = [layer(i, f"L{i}", [prop(f"Effects/E{i}/P{j}", f"var v{i}x{j} = {i}; fn{i}_{j}(v{i}x{j}, 'a{i}')")
                                      for j in range(4)]) for i in range(1, 151)]
        d = dump(comp(1, "big", layers))
        text, code = run(d)
        self.assertEqual(code, 0)
        self.assertLessEqual(len(text), X.INDEX_BUDGET)
        m = re.search(r"\.\.\. (\d+) more clusters \((\d+) expressions, x1 each\) - use --comp REGEX", text)
        self.assertIsNotNone(m)
        self.assertEqual(len(ids_in(text)) + int(m.group(1)), 600)
        text, _ = run(d, refs="big")
        self.assertIn("no expression references", text)

    def test_input_not_mutated(self):
        before = copy.deepcopy(SYN)
        for kw in ({}, {"errors": True}, {"refs": "FORM"}, {"show": "E0"}):
            run(SYN, **kw)
        self.assertEqual(SYN, before)



# ================================================================== review fixes (scale, budgets, edge cases)
def _plain(i, name, props, **kw):
    d = {"index": i, "name": name, "props": props}
    d.update(kw)
    return d


def _c(cid, name, layers):
    return {"id": cid, "name": name, "type": "comp", "layers": layers}


def _broken_steel():
    """Steel with every expression that reads mainControl broken (a renamed control layer)."""
    d = copy.deepcopy(STEEL)
    n = 0
    for it in d["items"]:
        for L in it.get("layers") or []:
            for p in L.get("props") or []:
                if "mainControl" in (p.get("x") or ""):
                    p["xErr"] = ("Error: Layer named 'mainControl' is missing or does not exist.\n"
                                 "Error occurred at line 1.")
                    p["xOn"] = False
                    n += 1
    return d, n


class ReviewFixTests(unittest.TestCase):
    # 1 --errors at scale: summary first, grouped by (cluster, message), within budget
    def test_errors_at_scale_summary_first(self):
        d, n = _broken_steel()
        self.assertEqual(n, 810)
        text, code = run(d, errors=True)
        self.assertEqual(code, 1)
        self.assertLessEqual(len(text), X.INDEX_BUDGET)
        lines = text.splitlines()
        self.assertTrue(lines[0].startswith("810 broken expressions (810 with errors, 810 disabled) of 836 checked"))
        self.assertEqual(lines[1], "by message (1 distinct):")
        self.assertRegex(lines[2], r'^  M1 810 x "\(disabled\) Error: Layer named \'mainControl\' is missing or does '
                                   r'not exist\." in 92 clusters: Ecff9a x78 E2d209 x47 ')
        self.assertTrue(lines[3].startswith("by cluster (92): Ecff9a x78 E2d209 x47"))
        self.assertLess(text.find("by cluster"), 4000)          # visible even when core.emit spills to a file
        self.assertIn("locations by cluster and message (M#) - 810 > 60", text)
        self.assertIn("\nEcff9a x78: M1\n  01,03,04,05/[3] blued pin, [4] hairline; ", text)
        self.assertEqual(text.count("is missing or does not exist"), 1)       # the message is printed once
        self.assertNotRegex(text, r"(?m)^\S+ / \[\d+\] .* / .*: \(disabled\)")  # no one-line-per-member list
        self.assertTrue(lines[-1].startswith("next: aectx exprs --show ID"))
        self.assertEqual(text, run(d, errors=True)[0])

    def test_errors_small_scope_lists_each(self):
        d, _ = _broken_steel()
        text, code = run(d, errors=True, comp="^02$")
        self.assertEqual(code, 1)
        self.assertTrue(text.startswith("39 broken expressions"))
        self.assertLessEqual(39, X.ERR_LIST)
        each = re.findall(r"(?m)^02 / \[\d+\] .+: \(disabled\) Error: Layer named 'mainControl'.*  \[E[0-9a-f]{5}\]$",
                          text)
        self.assertEqual(len(each), 39)
        self.assertLess(text.find("by message (1 distinct):"), text.find("\n02 / ["))   # summary first
        self.assertNotIn("locations by cluster and message", text)
        text, _ = run(d, errors=True, comp="^01$")                 # 128 > ERR_LIST: grouped
        self.assertIn("locations by cluster and message (M#) - 128 > 60", text)

    # 2 budgets hold for the head: legend, per-comp line
    def test_many_clusters_legend_budget(self):
        items = [_c(k + 10, f"c{k}", [_plain(1, "x", [{"path": "Transform/Opacity", "x":
                 f'thisComp.layer("controllerLayerNumber{k // 2:05d}").effect("slider")("Slider") + v{k}'}])])
                 for k in range(3000)]
        text, code = run(dump(*items))
        self.assertEqual(code, 0)
        self.assertLessEqual(len(text), X.INDEX_BUDGET)
        heads = ids_in(text)
        self.assertGreater(len(heads), 20)
        legend = dict(re.findall(r"(?m)^(R\d+) = (.+)$", text))
        self.assertLessEqual(len(legend), X.LEGEND_MAX)
        used = set(re.findall(r"(?m)^E[0-9a-f]{5,} x\d+ .*?refs=(R\d+) ", text))
        self.assertTrue(used <= set(legend))                      # every alias used is defined
        for alias in legend:                                      # ... and every defined alias is used twice
            self.assertGreaterEqual(len(re.findall(r"refs=" + alias + " ", text)), 2)
        m = re.search(r"\.\.\. (\d+) more clusters", text)
        self.assertEqual(len(heads) + int(m.group(1)), 3000)

    def test_refs_per_comp_capped(self):
        items = [_c(k, f"section-{k:04d}", [_plain(1, "x", [{"path": "p", "x":
                 'thisComp.layer("controller").effect("enter")("Slider")'}])]) for k in range(1500)]
        text, code = run(dump(*items), refs="controller")
        self.assertEqual(code, 0)
        self.assertLessEqual(len(text), X.INDEX_BUDGET)
        pc = next(l for l in text.splitlines() if l.startswith("per comp"))
        self.assertTrue(pc.startswith(f"per comp (top {X.PER_COMP_MAX} of 1500 by count): section-0000:1 "))
        self.assertTrue(pc.endswith("+1475 more comps (1475 expressions; narrow with --comp)"))
        self.assertEqual(len(re.findall(r"section-\d{4}:1", pc)), X.PER_COMP_MAX)
        self.assertIn("  section-{0000-1499}/[1] x :: p", text)   # numbered comp names compress

    def test_head_clipped_to_a_third(self):
        head = [f"line {i} " + "x" * 300 for i in range(100)]
        text, full, brief = X._render_budget(head, [["E00001 x1 a", "  loc"]], lambda n, s: "tail", budget=3000)
        self.assertLessEqual(len(text), 3000)
        self.assertIn("head lines clipped)", text)
        self.assertIn("E00001 x1 a", text)
        self.assertEqual((full, brief), (1, 0))

    # 3 one oversized block never hides the rest
    def test_numbered_layer_names_compress(self):
        d = dump(_c(1, "main", [_plain(i, f"Shape Layer {i}", [{"path": "Transform/Position", "x": "wiggle(2, 30)"}])
                                for i in range(1, 401)]))
        text, _ = run(d)
        self.assertIn("  main/[1-400] Shape Layer {1-400} :: Transform/Position", text)
        self.assertLess(len(text), 1000)
        ms = [X.Member("c", 0, i, f"Shape Layer {i}", "P", "1") for i in (1, 2, 3, 7)]
        self.assertEqual(X.location_lines(ms), ["c/[1-3,7] Shape Layer {1-3,7} :: P"])
        ms = [X.Member("c", 0, i, f"L {i + 1}", "P", "1") for i in (1, 2)]   # < 3 names: kept as they are
        self.assertEqual(X.location_lines(ms), ["c/[1] L 2, [2] L 3 :: P"])
        self.assertEqual(X._join_names(["01-1", "01-2", "01-3", "01-5", "01-6"]), "01-{1-3,5-6}")
        self.assertEqual(X._join_names(["01", "02", "03", "04", "05", "07"]), "{01-05,07}")
        self.assertEqual(X._join_names(["01", "03", "04", "05", "07"]), "01,03,04,05,07")   # saves < 4 chars
        self.assertEqual(X._join_names(["a", "b"]), "a,b")

    def test_giant_block_does_not_hide_small_cluster(self):
        names = [f"sec{chr(65 + k % 26)}{chr(65 + k // 26 % 26)}x{chr(97 + k // 676)}" for k in range(1500)]
        items = [_c(k, nm, [_plain(1, "x", [{"path": "p", "x": 'thisComp.layer("controller").effect("enter")("Slider")'}])])
                 for k, nm in enumerate(names)]
        items.append(_c(9999, "small", [_plain(1, "y", [{"path": "p", "x": "wiggle(1,2)"}])]))
        text, _ = run(dump(*items))
        self.assertEqual(len(ids_in(text)), 2)
        self.assertIn("  small/[1] y :: p", text)
        for ln in text.splitlines()[2:]:
            self.assertLessEqual(len(ln), X.LOC_CHARS)
        giant = text.splitlines()[3]
        self.assertTrue(giant.endswith("... :: p"), giant[-40:])  # clipped, prop path kept

    def test_budget_overflow_shows_header_lines(self):
        layers = [_plain(i, f"layer {i * 7919 % 1000:03d} with a long name", [      # 80 different layer sets
            {"path": f"Effects/E/P{j}", "x": f"fn{j}(1)"} for j in range(80) if i - 1 != j % 40]) for i in range(1, 41)]
        text, _ = run(dump(_c(1, "big", layers)))
        self.assertLessEqual(len(text), X.INDEX_BUDGET)
        self.assertIn("(budget reached: ", text)
        after = text.split("(budget reached: ", 1)[1].splitlines()[1:-1]
        self.assertTrue(after and all(re.match(r"^E[0-9a-f]{5,} x39 L=1 C=\d+ refs=-  fn\d+\(1\)$", l)
                                      for l in after), after)

    # 4 slot dimension: the coarser explanation wins
    def test_vary_prefers_prop_over_trivial_layer(self):
        text, _ = run(STEEL)
        block = text.split("\nE2d209 ", 1)[1].split("\nE", 1)[0]
        self.assertIn("vary prop: #12=18|72 #13=24|30", block)
        text, _ = run(STEEL, comp="^03$")
        block = text.split("\nE2d209 ", 1)[1].split("\nE", 1)[0]
        self.assertIn("vary prop: #12=18|72 #13=24|30", block)
        M = X.Member
        ms = [M("c", 0, i, f"L{i}", p, f"f({v})") for i, (p, v) in enumerate((("A", 1), ("A", 1), ("B", 2)), 1)]
        self.assertEqual(X.varying_slots(ms), [(1, "prop", "1|2")])
        ms = [M("c", 0, i, "L", "A", f"f({i})") for i in (1, 2, 3)]   # one prop, per layer
        self.assertEqual(X.varying_slots(ms)[0][1], "layer")

    # 5 control characters never break the one-record-per-line format
    def test_control_characters_in_names(self):
        d = dump(_c(1, "\u041a\u043e\u043c\u043f\nnext", [
            _plain(1, "\u0441\u043b\u043e\u0439\r\n2 \u2728", [{"path": "Transform/Opacity\nX",
                   "x": 'thisComp.layer("s").opacity', "xErr": "boom\nline2"}]),
            _plain(2, "tab\tname\u2028sep", [{"path": "Transform/Opacity", "x": 'thisComp.layer("s").opacity',
                                               "xOn": False}])]))
        text, code = run(d, errors=True)
        self.assertEqual(code, 1)
        entries = [l for l in text.splitlines() if " / [" in l]
        self.assertEqual(len(entries), 2)
        self.assertIn("\u041a\u043e\u043c\u043f\\nnext / [1] \u0441\u043b\u043e\u0439\\r\\n2 \u2728 / "
                      "Transform/Opacity\\nX: boom  [E", entries[0])
        self.assertIn("/ [2] tab\\tname\\u2028sep / Transform/Opacity: (disabled)", entries[1])
        self.assertNotIn("\t", text)
        self.assertNotIn("\r", text)
        self.assertNotIn("\u2028", text)
        for kw in ({}, {"refs": "s"}, {"show": X.cluster_id(X.normalize('thisComp.layer("s").opacity')[0])}):
            t, _ = run(d, **kw)
            locs = [l for l in t.splitlines() if "next/" in l or "next /" in l]
            self.assertTrue(locs, kw)
            for l in locs:
                self.assertIn("\\n", l)
        t, _ = run(d, refs="a\nb")
        self.assertIn("'a\\nb'", t)

    # 6 --show groups members by slot-value tuple when there are few
    def test_show_groups_few_value_tuples(self):
        text, code = run(STEEL, show="Ecff9a")
        self.assertEqual(code, 0)
        self.assertIn("members (78) by slot values, 3 distinct:", text)
        self.assertIn('  #3="3" x43:', text)
        self.assertIn('  #3="1" x11:', text)
        self.assertIn("    02/[8] door bottom, [10] door top :: Effects/Gradient Ramp/End Color", text)
        self.assertNotIn("member (all", text)
        self.assertNotIn("more location lines", text)            # the whole member set fits
        text, _ = run(STEEL, show="E1f4da")                        # one value per member: table kept
        self.assertRegex(text, r"(?m)^  01 / \[7\] 01-text\s+\| 6$")

    def test_show_table_within_budget(self):
        items = [_c(1, "m", [_plain(i, f"L{i}", [{"path": f"Effects/E/P{j}", "x": f"[{i}, {j}, {i * j}]"}
                                                 for j in range(1, 6)]) for i in range(1, 501)])]
        cid = X.cluster_id(X.normalize("[1,2,3]")[0])
        text, code = run(dump(*items), show=cid)
        self.assertEqual(code, 0)
        src = "[1, 1, 1]"
        self.assertLessEqual(len(text) - len(src), X.SHOW_BUDGET + 60)
        m = re.search(r"\.\.\. \+(\d+) more members \(narrow with --comp\)$", text)
        self.assertIsNotNone(m)
        rows = re.findall(r"(?m)^  m / \[\d+\] L\d+ / ", text)
        self.assertEqual(len(rows) + int(m.group(1)), 2500)

    def test_show_source_line_breaks_normalized(self):
        d = dump(_c(1, "c", [_plain(1, "L", [{"path": "p", "x": "var a = 1;\r\nvar b = 2;\ra + b"}])]))
        text, _ = run(d, show=X.cluster_id(X.normalize("var a=1;var b=2;a+b")[0]))
        self.assertIn("----- source -----\nvar a = 1;\nvar b = 2;\na + b\n----- end source -----", text)

    # 7 --refs: no whole-word hits inside string literals; string literals count as their own kind
    def test_refs_ignores_words_inside_strings(self):
        text, code = run(ARR, refs="text")
        self.assertEqual(code, 0)
        self.assertTrue(text.startswith("no expression references 'text'"), text[:200])
        text, _ = run(ARR, refs="01-text")
        self.assertIn("(200 via layer()/effect()/comp(), 0 as a string literal, 0 whole-word only)", text)
        text, _ = run(STEEL, refs="Slider")
        self.assertIn("677 of 836 expressions reference 'Slider'", text)
        self.assertIn("(0 via layer()/effect()/comp(), 677 as a string literal, 0 whole-word only)", text)
        self.assertIn("via=string", text)
        d = dump(_c(1, "c", [_plain(1, "L", [
            {"path": "a", "x": 'thisComp.layer("01-text").text.sourceText'},           # .text property: a word
            {"path": "b", "x": 'var s = "text"; s'},                                   # equal string literal
            {"path": "c", "x": 'var s = "my text"; s'},                                # neither
            {"path": "d", "x": "// text\nvar q = 'x'; q"}])]))                         # comment: neither
        text, _ = run(d, refs="text")
        self.assertIn("2 of 4 expressions reference 'text', in 2 clusters (0 via layer()/effect()/comp(), "
                      "1 as a string literal, 1 whole-word only)", text)
        self.assertNotIn(" :: c", text)
        self.assertNotIn(" :: d", text)

    # 8 line numbers survive block comments
    def test_block_comment_keeps_line_numbers(self):
        src = ('/* header\n   line 2\n   line 3 */\nvar a = 1;\n'
               'var c = thisComp.layer("ctl").effect("FORM")("Slider");\na*c;')
        self.assertEqual(X.strip_comments(src).count("\n"), src.count("\n"))
        self.assertEqual(X.mask_strings(src).count("\n"), src.count("\n"))
        d = dump(_c(1, "c", [_plain(1, "L", [{"path": "p", "x": src}])]))
        text, _ = run(d, refs="ctl")
        self.assertIn('  ref: L5 var c = thisComp.layer("ctl").effect("FORM")("Slider");', text)

    # 9 layer indices: integral floats and digit strings accepted; a fallback is marked '~'
    def test_layer_index_forms(self):
        d = dump(_c(1, "c", [_plain("3", "s", [{"path": "t", "x": "a+1"}]), _plain(3.0, "f", [{"path": "t", "x": "a+2"}]),
                             _plain(True, "b", [{"path": "t", "x": "a+3"}]), _plain(None, "n", [{"path": "t", "x": "a+4"}]),
                             {"name": "noidx", "props": [{"path": "t", "x": "a+5"}]},
                             _plain(2.5, "h", [{"path": "t", "x": "a+6"}])]))
        text, _ = run(d)
        self.assertIn("  c/[~3] b, [3] f, [3] s, [~4] n, [~5] noidx, [~6] h :: t", text)
        text, _ = run(d, show=X.cluster_id("a+\u00a7"))
        self.assertIn("  c / [3] s ", text)
        self.assertIn("  c / [~4] n ", text)
        self.assertNotIn("(=", text)                              # no index relation from guessed indices

    # 10 small correctness gaps
    def test_on_the_layers_of_needs_a_complete_block(self):
        layers = [_plain(i, f"layer named {i * 7919 % 1000:03d} here", [{"path": "P1", "x": "wiggle(1, 2)"},
                                                                         {"path": "P2", "x": "time * 3"}])
                  for i in range(1, 41)]
        text, _ = run(dump(_c(1, "c", layers)))
        self.assertNotIn("on the layers of", text)                # E5438a's own listing is clipped
        self.assertIn("  on the same 40 layers as E5438a (clipped there; --show E5438a) :: P2", text)
        self.assertEqual(text.count(" :: P1"), 1)
        layers = [_plain(i, f"distinct layer name {i}{'xyz'[i % 3]}", [{"path": "P1", "x": "wiggle(1, 2)"},
                                                                        {"path": "P2", "x": "time * 3"}])
                  for i in range(1, 7)]
        text, _ = run(dump(_c(1, "c", layers)))
        self.assertIn("  on the layers of E5438a :: P2", text)    # complete block: still referenced

    def test_index_relation_needs_three_layers(self):
        text, _ = run(ARR)
        block = text.split("\nE0f40c ", 1)[1].split("\nE", 1)[0]
        self.assertIn("vary layer: #291=0|1;", block)
        self.assertNotIn("idx", block)
        M = X.Member
        ms = [M(c, 0, i, f"L{i}", "P", f"f({20 - i})") for c in ("a", "b") for i in (18, 19)]
        self.assertEqual(X.varying_slots(ms), [(1, "layer", "1|2")])
        ms = [M("a", 0, i, f"L{i}", "P", f"f({20 - i})") for i in (17, 18, 19)]
        self.assertEqual(X.varying_slots(ms), [(1, "layer", "1|2|3(=20-idx)")])

    def test_parse_refs_chain_broken_after_dot(self):
        layers, _ = X.parse_refs('var x = thisComp.layer("ctl").\n  effect("FORM")("Slider");\n'
                                 'var y = thisComp.layer("b")\r\n  .effect("G")(1);')
        self.assertEqual(dict(layers), {"ctl": ["FORM"], "b": ["G"]})

    def test_unary_minus_with_space_folds(self):
        self.assertEqual(X.normalize("x = - 300")[0], X.normalize("x = -300")[0])
        self.assertEqual(X.normalize("x = - 300")[1], ["- 300"])
        self.assertEqual(X._lit_num("- 300"), -300.0)
        self.assertEqual(X.normalize("a - 300")[1], ["300"])         # binary minus untouched

    def test_show_short_or_ambiguous_prefix(self):
        found, seen = None, {}
        for i in range(5000):
            key = X.normalize(f"v{i} + 1")[0]
            p = X.cluster_id(key)[1:4]
            if p in seen:
                found = (seen[p], i, p)
                break
            seen[p] = i
        a, b, p = found
        d = dump(_c(1, "c", [_plain(1, "L", [{"path": "p", "x": f"v{a} + 1"}, {"path": "q", "x": f"v{b} + 1"}])]))
        text, code = run(d, show="E" + p)
        self.assertEqual(code, 2)
        self.assertIn("ambiguous cluster ID", text)
        self.assertIn("give more hex digits", text)
        text, code = run(d, show="E" + p[:2])
        self.assertEqual(code, 2)
        self.assertIn("unknown cluster ID", text)
        self.assertEqual(run(d, show=X.cluster_id(X.normalize(f"v{a} + 1")[0]))[1], 0)

    def test_all_fixture_modes_within_budget(self):
        for data in (STEEL, ARR):
            for kw in ({}, {"errors": True}, {"refs": "mainControl"}, {"refs": "controller"}, {"refs": "FORM"},
                       {"refs": "textBlock"}, {"comp": "^0[1-3]"}):
                text, _ = run(data, **kw)
                self.assertLessEqual(len(text), X.INDEX_BUDGET, kw)
                self.assertNotIn("\r", text)
            for cid in ("Ecff9a", "E1f4da", "E2d209"):
                text, code = run(data, show=cid)
                self.assertEqual(code, 0)
                src = text.split("----- source -----\n", 1)[1].split("\n----- end source -----", 1)[0]
                self.assertLessEqual(len(text) - len(src), X.SHOW_BUDGET)

if __name__ == "__main__":
    unittest.main()
