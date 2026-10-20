"""Tests for aectx.views (overview, tree). Offline: fixtures + synthetic dumps.

Run: cd skills/ae-context && python3 -m unittest tests.test_views -v
"""
import copy
import gzip
import json
import os
import re
import sys
import unittest
from argparse import Namespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from aectx import views  # noqa: E402

FIX = os.path.join(HERE, "fixtures")
FLOAT_ARRAY = re.compile(r"\[\s*-?\d+\.\d+\s*,\s*-?\d+(\.\d+)?\s*,")


def load(name):
    with gzip.open(os.path.join(FIX, name + ".json.gz"), "rt", encoding="utf-8") as f:
        return json.load(f)


STEEL = load("steel")
ARR = load("arr746")


def ns(**kw):
    return Namespace(**kw)


def blocks(tree_text):
    """{comp name: block text} from tree output."""
    out = {}
    for b in tree_text.split("\n== ")[1:]:
        out[b.split()[0]] = b
    return out


# ------------------------------------------------------------------ synthetic dump builders
def layer(index, name, typ="shape", **kw):
    L = {"index": index, "id": 1000 + index, "name": name, "type": typ, "enabled": True,
         "in": 0, "out": 10, "start": 0, "props": []}
    L.update(kw)
    return L


def comp(cid, name, layers=None, folder=None, **kw):
    c = {"id": cid, "name": name, "type": "comp", "folder": folder, "width": 1080, "height": 1920,
         "duration": 10, "fps": 30, "numLayers": len(layers or []), "layers": layers or []}
    c.update(kw)
    return c


def folder(fid, name, parent=None):
    return {"id": fid, "name": name, "type": "folder", "folder": parent}


def dump(items, fonts=None, meta=None):
    m = {"name": "t.aep", "path": "/x/t.aep", "dirty": False, "aeVersion": "25.6", "at": 0, "post": False,
         "comps": None, "errors": [], "warnings": []}
    m.update(meta or {})
    return {"schema": "aectx/2", "meta": m, "fonts": fonts or [], "items": items}


def main_control(fx_vals=None):
    fx_vals = fx_vals or {}
    eff = [{"name": n, "mn": "ADBE Slider Control", "on": True} for n in ("FORM", "FLOW", "PRESSURE")]
    eff += [{"name": n, "mn": "ADBE Color Control", "on": True} for n in ("1", "2", "3")]
    props = []
    for n, v in fx_vals.items():
        sub = "Color" if n in ("1", "2", "3") else "Slider"
        props.append({"path": f"Effects/{n}/{sub}", "mn": "x", "v": v})
    return layer(1, "mainControl", "null", effects=eff, props=props)


# ================================================================== helpers
class TestHelpers(unittest.TestCase):
    def test_hex(self):
        self.assertEqual(views.to_hex([0.0431, 0.051, 0.0627, 1]), "#0b0d10")
        self.assertEqual(views.to_hex([1, 0.5, 0]), "#ff8000")
        self.assertEqual(views.to_hex([2, -1, 0.2039, 1]), "#ff0034")  # clamped
        self.assertEqual(views.to_hex("#FFFFFF"), "#ffffff")
        self.assertIsNone(views.to_hex([1, 2]))
        self.assertIsNone(views.to_hex("red"))
        self.assertIsNone(views.to_hex([None, 0, 0]))

    def test_num(self):
        self.assertEqual(views._num(10), "10")
        self.assertEqual(views._num(6.8333), "6.83")
        self.assertEqual(views._num(None), "?")
        self.assertEqual(views._num(float("nan")), "?")
        self.assertEqual(views._num(-0.001), "0")

    def test_trunc_oneline(self):
        self.assertEqual(views._trunc("HARDER THAN\rIT LOOKS", 40), "HARDER THAN / IT LOOKS")
        self.assertEqual(views._trunc("abcdefghijkl", 8), "abcde...")

    def test_rx_lit(self):
        self.assertEqual(views._rx_lit("05-0"), "05-0")
        self.assertEqual(views._rx_lit("a.b(c)"), r"a\.b\(c\)")


# ================================================================== overview on fixtures
class TestOverviewFixtures(unittest.TestCase):
    def test_steel(self):
        t, code = views.overview(STEEL, ns())
        self.assertEqual(code, 0)
        self.assertLessEqual(len(t), 3000)
        self.assertIn("project: steel.aep (/Users/ale/style-dev/steel/steel.aep)", t)
        self.assertIn("AE 25.6.4x3", t)
        self.assertIn("saved", t)
        self.assertIn("t=0s", t)
        self.assertIn("kind: style template", t)
        self.assertIn("FORM=55 FLOW=60 PRESSURE=30", t)
        self.assertIn("1=#0b0d10 2=#d9dee3 3=#3457ff", t)
        self.assertIn("836 exprs (0 errors, 0 disabled)", t)
        self.assertIn("150 layers", t)
        self.assertIn("2053 props", t)
        self.assertIn("extraction 0 errors, 0 warnings", t)
        # shot table: 6 rows, text sample + size, frame size, controller
        rows = [l for l in t.splitlines() if re.match(r"^  0\d 1080x1920 \d+L \|", l)]
        self.assertEqual(len(rows), 6)
        self.assertIn('01 1080x1920 23L | text 936x1500 "HARDER THAN / IT LOOKS" 420pt | frame - | ctrl ok', t)
        self.assertIn("frame 612x1700", t)
        self.assertIn("(all BigShouldersDisplay-Light)", t)
        self.assertIn("BigShouldersDisplay-Light x6", t)
        self.assertNotIn("SUBSTITUTED", t)
        self.assertIn("missing: none", t)
        self.assertTrue(t.splitlines()[-1].startswith("next: "))
        self.assertIn("aectx wiring", t.splitlines()[-1])
        self.assertIsNone(FLOAT_ARRAY.search(t), "raw float color array printed")
        t.encode("ascii")

    def test_arrangement(self):
        t, code = views.overview(ARR, ns())
        self.assertEqual(code, 0)
        self.assertLessEqual(len(t), 3000)
        self.assertIn("kind: director arrangement", t)
        self.assertIn("FORM=50 FLOW=50 PRESSURE=50", t)
        self.assertIn("#3457ff", t)
        seq = [l for l in t.splitlines() if re.match(r"^  \d \d\d-\d ", l)]
        self.assertEqual([l.split()[1] for l in seq], ["05-0", "01-1", "01-2", "01-3", "05-4", "01-5", "01-6"])
        self.assertIn("0 05-0 0-2.37 (2.37s)", t)
        # shared -text WxH and font are hoisted into the legend; the expected {shot}-text name is implied
        self.assertIn('-text comp: phrases "first phrase" size (all 936x1500 BigShouldersDisplay-Light)', t)
        self.assertIn('  1 01-1 2.37-9.07 (6.7s) | 6 phrases "Do you / have an" 273.75pt\n', t)
        self.assertNotIn("01-1-text", t)
        self.assertIn("template shots used: 01 x5 (sec 1,2,3,5,6); 05 x2 (sec 0,4)", t)
        self.assertIn("soundtrack (precomp, video-off)", t)
        self.assertIn("mainControl (null)", t)
        self.assertNotIn("GAP", t)
        self.assertNotIn("OVERLAP", t)
        self.assertIn("footage: 7 (7 audio-only", t)
        self.assertIsNone(FLOAT_ARRAY.search(t))
        self.assertTrue(t.splitlines()[-1].startswith("next: aectx tree"))
        self.assertIn("--comp '^05-0(-text)?$'", t)

    def test_fixtures_stripped_of_optional_fields(self):
        """Every optional field removed / mangled: views must still render (no exceptions)."""
        for src in (STEEL, ARR):
            d = copy.deepcopy(src)
            d["meta"] = {"errors": "not-a-list", "warnings": None}
            d["fonts"] = [{"postScriptName": None}, "junk"]
            for it in d["items"]:
                for k in ("width", "height", "fps", "duration", "numLayers", "folder"):
                    it.pop(k, None)
                for L in it.get("layers") or []:
                    for k in ("enabled", "in", "out", "source", "effects", "type"):
                        L.pop(k, None)
                    for p in L.get("props") or []:
                        p["path"] = None
            d["items"].append("junk")
            for fn in (views.overview, views.tree):
                t, code = fn(d, ns())
                self.assertEqual(code, 0)
                self.assertTrue(t)
            t, code = views.tree(d, ns(all=True, comp="."))
            self.assertEqual(code, 0)

    def test_deterministic(self):
        self.assertEqual(views.overview(STEEL, ns()), views.overview(copy.deepcopy(STEEL), ns()))
        self.assertEqual(views.tree(ARR, ns()), views.tree(copy.deepcopy(ARR), ns()))


# ================================================================== overview synthetic
class TestOverviewSynthetic(unittest.TestCase):
    def test_empty_project(self):
        for d in ({}, {"schema": "aectx/2"}, dump([])):
            t, code = views.overview(d, ns())
            self.assertEqual(code, 0)
            self.assertIn("kind: generic project", t)
            self.assertIn("mainComp: MISSING", t)
            self.assertIn("fonts: none recorded", t)
            self.assertTrue(t.splitlines()[-1].startswith("next: "))

    def test_not_a_dict(self):
        t, code = views.overview(None, ns())
        self.assertEqual(code, 0)
        self.assertIn("project: Untitled", t)

    def test_unsaved_scoped_errors(self):
        d = dump([comp(1, "mainComp", [main_control()]), {"id": 9, "name": "broken", "error": "boom"},
                  comp(2, "other", [], skipped=True, numLayers=4)],
                 meta={"dirty": True, "path": None, "comps": "^main", "at": 1.5, "post": True,
                       "errors": [{"comp": "x", "layer": "y", "index": 2, "error": "bad\nthing", "line": 4},
                                  {"item": "broken", "error": "boom", "line": 1}],
                       "warnings": ["usedFonts unavailable: nope"]})
        t, _ = views.overview(d, ns())
        self.assertIn("UNSAVED CHANGES", t)
        self.assertIn("(never saved)", t)
        self.assertIn("t=1.5s", t)
        self.assertIn("(+post)", t)
        self.assertIn("SCOPED extraction", t)
        self.assertIn("1 comps skipped", t)
        self.assertIn("extraction 2 errors, 1 warnings", t)
        self.assertIn("extract error: x [2] y: bad / thing", t)
        self.assertIn("extract error: item broken: boom", t)
        self.assertIn("item errors (1): broken: boom", t)
        self.assertIn("aectx extract", t.splitlines()[-1])

    def test_main_control_defaults_missing_and_order(self):
        mc = main_control({"FORM": 12.5, "1": [1, 0, 0, 1]})
        mc["props"].append({"path": "Effects/FLOW/Slider", "mn": "x", "v": 40, "k": [[0, 0], [1, 40]]})
        mc["props"].append({"path": "Effects/2/Color", "mn": "x", "v": [0, 1, 0, 1], "x": "[0,1,0,1]", "xErr": "oops"})
        mc["effects"] = [mc["effects"][i] for i in (0, 1, 2, 4, 3, 5)]  # palette out of order
        d = dump([folder(5, "ORIGINAL_SHOTS"), comp(1, "mainComp", [mc])])
        t, _ = views.overview(d, ns())
        self.assertIn("FORM=12.5", t)
        self.assertIn("FLOW=40(2keys)", t)
        self.assertIn("PRESSURE=0(default)", t)
        self.assertIn("1=#ff0000", t)
        self.assertIn("2=#00ff00(expr-ERR)", t)
        self.assertIn("3=#ff0000(default)", t)
        self.assertIn("effect order", t)
        self.assertIn("1 exprs (1 errors, 0 disabled)", t)
        self.assertTrue(t.splitlines()[-1].startswith("next: aectx exprs --errors"))
        self.assertIn("shots (0) in ORIGINAL_SHOTS", t)

    def test_main_control_missing_or_misnamed(self):
        d = dump([folder(5, "ORIGINAL_SHOTS"), comp(1, "mainComp", [layer(1, "ctrl", "null")])])
        self.assertIn("mainControl: MISSING in mainComp", views.overview(d, ns())[0])
        d = dump([folder(5, "ORIGINAL_SHOTS"), comp(1, "mainComp", [dict(main_control({"FORM": 3}), name="MainControl ")])])
        t = views.overview(d, ns())[0]
        self.assertIn("NOT exactly 'mainControl'", t)
        self.assertIn("FORM=3", t)
        d = dump([folder(5, "ORIGINAL_SHOTS")])
        self.assertIn("mainControl: - (no mainComp)", views.overview(d, ns())[0])

    def test_template_shot_variants(self):
        tb = layer(1, "textBlock", "text", props=[{"path": "Text/Source Text", "mn": "ADBE Text Properties/ADBE Text Document",
                                                   "v": {"text": "A VERY LONG HEADLINE THAT GOES ON AND ON", "size": 100,
                                                         "font": "Foo-Bold", "box": True}}])
        items = [
            folder(5, "ORIGINAL_SHOTS"), folder(6, "PRECOMPS"),
            comp(1, "mainComp", [main_control()]),
            comp(10, "01", [layer(1, "controller", "null", enabled=False,
                                  effects=[{"name": "enter", "on": True}, {"name": "exit", "on": True}])], folder=5),
            comp(11, "02", [layer(1, "controller", "null", effects=[{"name": "enter", "on": True}])], folder=5),
            comp(12, "03", [], folder=5),
            comp(20, "01-text", [tb], folder=6, width=900, height=300),
            comp(21, "02-text", [layer(1, "notTextBlock", "text")], folder=6),
            comp(22, "02-frame", [], folder=6, width=500, height=500),
        ]
        t, _ = views.overview(dump(items, fonts=[
            {"postScriptName": "Foo-Bold", "family": "Foo", "style": "Bold", "substitute": True, "uses": 2},
            {"postScriptName": "Bar", "family": "Bar", "style": "Regular", "substitute": False, "uses": 1}]), ns())
        # one usable text row: nothing is hoisted, the row carries its own size and font
        self.assertIn('01 1080x1920 1L | text 900x300 "A VERY LONG HEADLINE THAT..." Foo-Bold 100pt boxText | frame - | ctrl ok', t)
        self.assertIn('-text comp: WxH "textBlock sample" font size |', t)
        self.assertIn("02 1080x1920 1L | text 1080x1920 NO textBlock | frame 500x500 | ctrl no exit slider", t)
        self.assertIn("03 1080x1920 0L | text MISSING | frame - | ctrl MISSING", t)
        self.assertIn("fonts (2, 1 SUBSTITUTED = not installed, AE renders a fallback): Foo-Bold x2 SUBSTITUTED; Bar x1", t)
        self.assertLess(t.index("Foo-Bold x2"), t.index("Bar x1"))  # substitutes first

    def test_mixed_fonts_listed_per_row(self):
        def tcomp(cid, name, font):
            st = {"path": "Text/Source Text", "mn": "ADBE Text Document", "v": {"text": "X", "size": 10, "font": font}}
            return comp(cid, name, [layer(1, "textBlock", "text", props=[st])], folder=6)
        items = [folder(5, "ORIGINAL_SHOTS"), folder(6, "PRECOMPS"), comp(1, "mainComp", [main_control()]),
                 comp(10, "01", [], folder=5), comp(11, "02", [], folder=5),
                 tcomp(20, "01-text", "Foo"), tcomp(21, "02-text", "Bar")]
        t, _ = views.overview(dump(items), ns())
        self.assertIn('"X" Foo 10pt', t)
        self.assertIn('"X" Bar 10pt', t)
        self.assertIn('"textBlock sample" font size', t)

    def test_missing_footage(self):
        items = [{"id": 1, "name": "clip.mov", "type": "footage", "folder": None, "file": "/a/clip.mov", "missing": True,
                  "hasVideo": True, "hasAudio": True},
                 {"id": 2, "name": "ph", "type": "placeholder", "folder": None},
                 {"id": 3, "name": "ok.wav", "type": "footage", "folder": None, "hasAudio": True, "hasVideo": False}]
        t, _ = views.overview(dump(items), ns())
        self.assertIn("footage: 2 (1 audio-only, 0 stills), missing (2): clip.mov, ph (placeholder); first file: /a/clip.mov", t)

    def test_arrangement_gap_unused_and_no_text(self):
        items = [
            folder(5, "PROJECT_SHOTS"), folder(6, "PROJECT_TARGETS"),
            comp(10, "01-0", [], folder=5), comp(11, "02-1", [], folder=5), comp(12, "03-2", [], folder=5),
            comp(1, "mainComp", [
                layer(1, "02-1", "precomp", source={"id": 11, "name": "02-1"}, **{"in": 3, "out": 5}),
                layer(2, "01-0", "precomp", source={"id": 10, "name": "01-0"}, **{"in": 0, "out": 2}),
                main_control()]),
        ]
        t, _ = views.overview(dump(items), ns())
        self.assertIn("0 01-0 0-2 (2s) | no -text comp", t)
        self.assertIn("1 02-1 3-5 (2s) GAP 1s", t)
        self.assertIn("PROJECT_SHOTS not in mainComp: 03-2", t)
        self.assertLess(t.index("0 01-0"), t.index("1 02-1"))

    def test_arrangement_without_main(self):
        t, _ = views.overview(dump([folder(5, "PROJECT_SHOTS"), comp(10, "01-0", [], folder=5)]), ns())
        self.assertIn("sequence: no mainComp (1 comps in PROJECT_SHOTS)", t)


# ================================================================== tree on fixtures
class TestTreeFixtures(unittest.TestCase):
    def test_steel_default(self):
        t, code = views.tree(STEEL, ns())
        self.assertEqual(code, 0)
        b = blocks(t)
        self.assertEqual(list(b), ["mainComp", "01", "02", "03", "04", "05", "06"])
        self.assertTrue(b["01"].startswith("01 1080x1920 30fps 10s 23 layers [ORIGINAL_SHOTS]"))
        self.assertIn('[7-13] 01-text x7 (precomp) -> 01-text parent="01 text rig" fx=[Fill,CC Light Sweep,lock glint,+1] masks=1 expr=9', t)
        # nulls / mattes are never called disabled or video-off
        self.assertIn("[14] 01 text rig (null) expr=3\n", t)
        self.assertIn("[22] controller (null) fx=[enter,exit] keyed=2\n", t)
        self.assertIn('[25] 03 window (solid) parent="panel rig" is-matte\n', t)
        self.assertNotIn("video-off", t)
        self.assertNotIn("disabled", t)
        self.assertIn('matte=ALPHA:"03 window"', t)
        self.assertIn("[19-24] 03-frame x6", t)
        self.assertIn("blend=MULTIPLY", t)
        self.assertIsNone(re.search(r" t=\d", t))  # every layer spans its comp
        # 05 is printed as a delta against 01
        self.assertIn("(same as 01 except these lines; other indices identical; full: aectx tree --comp '^05$')", b["05"])
        self.assertIn("[7-13] 05-text x7", b["05"])
        self.assertIsNone(FLOAT_ARRAY.search(t))
        t.encode("ascii")

    def test_steel_budget(self):
        t, _ = views.tree(STEEL, ns())
        b = blocks(t)
        self.assertLessEqual(len(t) / len(b), 1100)
        for name, blk in b.items():
            self.assertLessEqual(len(blk), 1400, name)

    def test_arrangement_default(self):
        t, code = views.tree(ARR, ns())
        self.assertEqual(code, 0)
        b = blocks(t)
        self.assertEqual(list(b), ["mainComp", "05-0", "01-1", "01-2", "01-3", "05-4", "01-5", "01-6"])
        self.assertIn("[1] 01-6 (precomp) -> 01-6 t=30.33-39.07", t)
        self.assertIn("[7] 05-0 (precomp) -> 05-0 t=0-2.37", t)
        self.assertIn("[8] soundtrack (precomp) -> soundtrack video-off", t)
        self.assertIn("[9] mainControl (null) fx=[FORM,FLOW,PRESSURE,+3]", t)
        self.assertIn("-> 01-3-text", b["01-3"])
        self.assertIn("(same as 05-0 except", b["01-6"])
        self.assertLessEqual(len(t) / len(b), 1100)

    def test_comp_filter_searches_all(self):
        t, code = views.tree(STEEL, ns(comp="^01(-text)?$"))
        self.assertEqual(code, 0)
        self.assertEqual(list(blocks(t)), ["01", "01-text"])
        self.assertIn("markers=8 [PRECOMPS]", t)
        self.assertIn('[1] textBlock (text) expr=1 text="HARDER THAN / IT LOOKS"', t)
        t, _ = views.tree(ARR, ns(comp="^05-0-text$"))
        self.assertIn("[1] textBlock (text) expr=1 keyed=3", t)

    def test_all(self):
        t, _ = views.tree(STEEL, ns(all=True))
        names = list(blocks(t))
        self.assertEqual(len(names), 17)
        self.assertEqual(names[:7], ["mainComp", "01", "02", "03", "04", "05", "06"])
        self.assertIn("02-frame", names)

    def test_bad_regex_and_no_match(self):
        t, code = views.tree(STEEL, ns(comp="("))
        self.assertEqual(code, 2)
        self.assertIn("invalid --comp regex", t)
        t, code = views.tree(STEEL, ns(comp="nope"))
        self.assertEqual(code, 2)
        self.assertIn("no comp matches", t)
        self.assertIn("mainComp", t)


# ================================================================== tree synthetic
class TestTreeSynthetic(unittest.TestCase):
    def test_empty(self):
        for d in ({}, dump([]), None):
            t, code = views.tree(d, ns())
            self.assertEqual(code, 0)
            self.assertIn("no comps", t)

    def test_generic_shows_all_comps_and_stubs(self):
        items = [
            comp(1, "A", [layer(1, "ok"), {"index": 2, "name": "bad", "error": "kaboom\nline2"}, layer(3, "ok")]),
            comp(2, "B", []),
            comp(3, "C", [], numLayers=5),
            comp(4, "D", [], skipped=True, numLayers=2),
            {"id": 5, "name": "Z", "type": "comp"},  # missing optional fields
            {"id": 6, "name": "stub", "error": "item failed"},
        ]
        t, code = views.tree(dump(items), ns(all=True))
        self.assertEqual(code, 0)
        b = blocks(t)
        self.assertEqual(list(b), ["A", "B", "C", "D", "Z"])
        self.assertIn("[2] bad !LAYER ERROR: kaboom / line2", b["A"])
        self.assertIn("[1] ok (shape)", b["A"])
        self.assertIn("[3] ok (shape)", b["A"])  # an error stub breaks the run
        self.assertIn("(no layers)", b["B"])
        self.assertIn("no layer records; numLayers=5", b["C"])
        self.assertIn("outside the extract --comps scope", b["D"])
        self.assertTrue(b["Z"].startswith("Z ?x? ?fps ?s 0 layers"))
        self.assertIn("item errors: stub: item failed", t)

    def test_flags(self):
        L = [
            layer(1, "n", "null", enabled=False),
            layer(2, "m", "solid", enabled=False, isMatte=True, source={"id": 9, "name": "m"}),
            layer(3, "v", "footage", enabled=False, source={"id": 8, "name": "v.mov"}, parent={"index": 1, "name": "n"},
                  matte={"type": "LUMA_INVERTED", "layer": {"index": 2, "name": "m"}}, blend="SCREEN",
                  effects=[{"name": "A", "on": True}, {"name": "B", "on": False}, {"name": "C"}, {"name": "D"}, {"name": "E"}],
                  masks=[{"name": "Mask 1", "mode": "ADD"}, {"name": "Mask 2", "mode": "SUBTRACT"}],
                  markers=[{"t": 1, "comment": "x"}], threeD=True, guide=True, timeRemap=True, stretch=50,
                  props=[{"path": "a", "x": "1"}, {"path": "b", "x": "2", "xOn": False}, {"path": "c", "x": "3", "xErr": "e"},
                         {"path": "d", "v": 1, "k": [[0, 1], [1, 2]]}, {"path": "e", "v": 1}],
                  **{"in": 2, "out": 5}),
            layer(4, "s", "solid", source={"id": 7, "name": "Dark Gray Solid 1"}),
            layer(5, "adj", "adjustment", source={"id": 6, "name": "adj"}),
            layer(6, "nn", "null", source={"id": 5, "name": "Null 3"}),
        ]
        t, _ = views.tree(dump([comp(1, "X", L)]), ns())
        self.assertIn("[1] n (null)\n", t)
        self.assertIn("[2] m (solid) is-matte\n", t)
        line3 = [l for l in t.splitlines() if l.startswith("  [3] ")][0]
        for frag in ("-> v.mov", "video-off", "guide", "3d", "timeremap", "stretch=50%", "parent=n",
                     "matte=LUMA_INVERTED:m", "blend=SCREEN", "fx=[A,B(off),C,+2]", "masks=2", "expr=3 !err=2",
                     "keyed=1", "markers=1", "t=2-5"):
            self.assertIn(frag, line3)
        self.assertNotIn("is-matte", line3)
        self.assertIn("[4] s (solid) -> Dark Gray Solid 1\n", t)
        self.assertIn("[5] adj (adjustment)\n", t)
        self.assertTrue(t.rstrip().endswith("[6] nn (null)"))

    def test_collapse_only_identical(self):
        L = [layer(i, "dup", "precomp", source={"id": 3, "name": "src"}) for i in range(1, 5)]
        L.append(layer(5, "dup", "precomp", source={"id": 3, "name": "src"}, blend="ADD"))
        L.append(layer(6, "dup", "precomp", source={"id": 3, "name": "src"}))
        L.append(layer(7, "other", "precomp", source={"id": 3, "name": "src"}))
        t, _ = views.tree(dump([comp(1, "X", L)]), ns())
        self.assertIn("[1-4] dup x4 (precomp) -> src\n", t)
        self.assertIn("[5] dup (precomp) -> src blend=ADD\n", t)
        self.assertIn("[6] dup (precomp) -> src\n", t)
        self.assertIn("[7] other (precomp) -> src", t)

    def test_collapse_requires_consecutive_indices(self):
        L = [layer(1, "dup"), layer(3, "dup")]
        t, _ = views.tree(dump([comp(1, "X", L)]), ns())
        self.assertIn("[1] dup (shape)\n  [3] dup (shape)", t)

    def test_layers_missing_optional_fields(self):
        L = [{"name": "bare"}, {"index": 2}, {"index": 3, "name": "t", "type": "text",
                                               "props": [{"path": "Text/Source Text", "v": {"text": "hi\nthere"}}]}]
        t, code = views.tree(dump([comp(1, "X", L, duration=None)]), ns())
        self.assertEqual(code, 0)
        self.assertIn("[1] bare (?)", t)
        self.assertIn("[2] ? (?)", t)
        self.assertIn('[3] t (text) text="hi / there"', t)

    def test_delta_and_identical(self):
        base = [layer(i, f"L{i}") for i in range(1, 11)]
        same = copy.deepcopy(base)
        changed = copy.deepcopy(base)
        changed[4]["blend"] = "ADD"
        shorter = copy.deepcopy(base)[:9]
        items = [comp(1, "A", base), comp(2, "B", same), comp(3, "C", changed), comp(4, "D", shorter),
                 comp(5, "E", [layer(1, "zzz", "text")])]
        t, _ = views.tree(dump(items), ns())
        b = blocks(t)
        self.assertIn("(layers identical to A)", b["B"])
        self.assertIn("(same as A except these lines; other indices identical; full: aectx tree --comp '^C$')\n"
                      "  [5] L5 (shape) blend=ADD", b["C"])
        self.assertEqual(b["C"].count("\n  ["), 1)
        self.assertIn("'- ' = layer of A absent here", b["D"])
        self.assertIn("  - [10] L10 (shape)", b["D"])
        self.assertIn("[1] zzz (text)", b["E"])  # dissimilar -> full
        t, _ = views.tree(dump(items), ns(full=True))
        self.assertNotIn("same as", t)
        self.assertNotIn("identical to", t)

    def test_template_default_selection(self):
        items = [folder(5, "ORIGINAL_SHOTS"), folder(6, "PRECOMPS"), folder(7, "sub", parent=5),
                 comp(1, "mainComp", [main_control()]), comp(10, "10", [], folder=5), comp(11, "2", [], folder=7),
                 comp(20, "2-text", [], folder=6), comp(30, "loose", [])]
        t, _ = views.tree(dump(items), ns())
        self.assertEqual(list(blocks(t)), ["mainComp", "2", "10"])  # nested folder included, natural order
        t, _ = views.tree(dump(items), ns(all=True))
        self.assertEqual(list(blocks(t)), ["mainComp", "2", "10", "2-text", "loose"])

    def test_template_without_shots_falls_back_to_all(self):
        items = [folder(5, "ORIGINAL_SHOTS"), comp(30, "loose", [layer(1, "a")])]
        t, code = views.tree(dump(items), ns())
        self.assertEqual(code, 0)
        self.assertEqual(list(blocks(t)), ["loose"])


# ================================================================== review fixes
def scoped(src, rx):
    """A fixture as `aectx extract --comps RX` would dump it: non-matching comps skipped, no layers."""
    d = copy.deepcopy(src)
    d["meta"]["comps"] = rx
    for c in d["items"]:
        if c.get("type") == "comp" and not re.search(rx, c["name"]):
            c["skipped"] = True
            c["layers"] = []
    return d


def named(d, name):
    return [c for c in d["items"] if c.get("name") == name][0]


def stub_layer(c, name, error="boom"):
    for i, L in enumerate(c["layers"]):
        if L.get("name") == name:
            c["layers"][i] = {"index": L["index"], "name": name, "error": error}
            return
    raise KeyError(name)


def grow_arr(n):
    """arr746 with sections 7..n-1 appended (copies of 01-1 and its -text comp), 5s each."""
    d = copy.deepcopy(ARR)
    nid = max(it["id"] for it in d["items"]) + 1
    main, sc, tc = named(d, "mainComp"), named(d, "01-1"), named(d, "01-1-text")
    tmpl = [L for L in main["layers"] if (L.get("source") or {}).get("name") == "01-1"][0]
    t0 = 39.0667
    for k in range(7, n):
        nc, nt = copy.deepcopy(sc), copy.deepcopy(tc)
        nc.update(id=nid, name=f"01-{k}")
        nt.update(id=nid + 1, name=f"01-{k}-text")
        nid += 2
        for L in nc["layers"]:
            if (L.get("source") or {}).get("name") == "01-1-text":
                L["source"] = {"id": nt["id"], "name": nt["name"]}
        nl = copy.deepcopy(tmpl)
        nl.update(index=100 + k, name=nc["name"], source={"id": nc["id"], "name": nc["name"]})
        nl["in"], nl["out"] = t0, t0 + 5
        t0 += 5
        main["layers"].append(nl)
        d["items"] += [nc, nt]
    return d


LONG_FX = [{"name": n, "on": True} for n in ("Fill", "Glow", "Tint", "Levels")]


def long_layer(i, name=None, **kw):
    """A layer whose tree line is long enough that a delta beats a full listing."""
    return layer(i, name or f"a fairly long descriptive layer {i}", effects=LONG_FX, blend="ADD",
                 masks=[{"name": "Mask 1", "mode": "ADD"}], **kw)


class TestReviewFixes(unittest.TestCase):
    # ---- 1: scoped extraction is not a contract failure
    def test_scoped_extraction_template(self):
        t, _ = views.overview(scoped(STEEL, "^0[12]$"), ns())
        for bad in ("MISSING", "NO textBlock", "no enter", "effect order"):
            self.assertNotIn(bad, t)
        self.assertIn("mainControl: ? (mainComp not extracted: outside the extract --comps scope)", t)
        self.assertIn("mainComp: 1080x1920 30fps 30s 1 layer (layers not extracted: scoped)", t)
        self.assertIn("  01 1080x1920 23L | text 936x1500 not extracted (scoped) | frame - | ctrl ok", t)
        self.assertIn("  03 1080x1920 28L | text 936x600 not extracted (scoped) | frame 936x1000 | ctrl ? (not extracted)", t)
        self.assertIn("aectx extract (full, without --comps)", t.splitlines()[-1])
        self.assertLessEqual(len(t), 3000)

    def test_scoped_extraction_arrangement(self):
        t, _ = views.overview(scoped(ARR, "-text$"), ns())
        for bad in ("MISSING", "0 sections", "not in mainComp"):
            self.assertNotIn(bad, t)
        self.assertIn("sequence: mainComp not extracted (outside the extract --comps scope; 7 comps in PROJECT_SHOTS)", t)
        # mainComp + shot instances extracted, their -text comps not
        t, _ = views.overview(scoped(ARR, r"^(mainComp|\d\d-\d)$"), ns())
        rows = [l for l in t.splitlines() if re.match(r"^  \d \d\d-\d ", l)]
        self.assertEqual(len(rows), 7)
        self.assertTrue(all(l.endswith("| 936x1500 not extracted (scoped)") for l in rows), rows)
        self.assertNotIn("NO textBlock", t)
        self.assertIn("FORM=50 FLOW=50 PRESSURE=50", t)

    # ---- 2 + 10: layer error stubs are extraction failures, and are counted
    def test_layer_stubs_template(self):
        d = copy.deepcopy(STEEL)
        stub_layer(named(d, "mainComp"), "mainControl")
        stub_layer(named(d, "03"), "controller", "x")
        t, _ = views.overview(d, ns())
        self.assertIn("mainControl: LAYER ERROR (boom); values unknown", t)
        self.assertNotIn("MISSING", t)
        self.assertNotIn("effect order", t)
        row = [l for l in t.splitlines() if l.startswith("  03 ")][0]
        self.assertTrue(row.endswith("| ctrl LAYER ERROR"), row)
        self.assertIn("150 layers (2 layer error stubs)", t)
        self.assertIn("aectx extract (re-run; extraction had errors)", t.splitlines()[-1])

    def test_layer_stubs_arrangement(self):
        d = copy.deepcopy(ARR)
        stub_layer(named(d, "mainComp"), "01-3", "layer read failed")
        t, _ = views.overview(d, ns())
        self.assertIn("sequence (mainComp, 6 sections)", t)
        self.assertIn("mainComp layer errors (1; sequence may be incomplete): [4] 01-3: layer read failed", t)
        self.assertIn("template shots used: 01 x4 (sec 1,2,5,6); 05 x2 (sec 0,4)", t)
        self.assertNotIn("(?)", t)
        self.assertNotIn("not in mainComp", t)  # 01-3 is the stub, not an unused shot
        self.assertIn("1 layer error stubs", t)
        # a genuinely unused shot is still listed, with the caveat
        items = [folder(5, "PROJECT_SHOTS"), comp(10, "01-0", [], folder=5), comp(11, "02-1", [], folder=5),
                 comp(12, "03-2", [], folder=5),
                 comp(1, "mainComp", [main_control(), {"index": 2, "name": "01-0", "error": "bad"},
                                      layer(3, "02-1", "precomp", source={"id": 11, "name": "02-1"})])]
        t, _ = views.overview(dump(items), ns())
        self.assertIn("PROJECT_SHOTS not in mainComp: 03-2 (unless among the 1 mainComp layers that failed to extract)", t)
        self.assertNotIn("01-0 (?)", t)
        self.assertIn("other mainComp layers: [1] mainControl (null)\n", t)

    # ---- 3: delta lists reference layers this comp lacks, also inside a 'replace'
    def test_delta_shorter_comp_with_changed_tail(self):
        A = [long_layer(i) for i in range(1, 13)]
        B = copy.deepcopy(A)[:11]
        B[10]["blend"] = "SCREEN"
        b = blocks(views.tree(dump([comp(1, "A", A), comp(2, "B", B)]), ns())[0])["B"]
        self.assertIn("(same as A except these lines; other indices identical; '- ' = layer of A absent here;", b)
        self.assertIn("  - [12] a fairly long descriptive layer 12 (shape) blend=ADD fx=[Fill,Glow,Tint,+1] masks=1\n", b)
        self.assertIn("  [11] a fairly long descriptive layer 11 (shape) blend=SCREEN", b)
        self.assertEqual(b.count("\n  "), 3)

    def test_delta_only_when_it_saves_lines_and_chars(self):
        one = [layer(1, "placeholder", "solid", effects=LONG_FX[:2])]
        b = blocks(views.tree(dump([comp(1, "P", one), comp(2, "Q", copy.deepcopy(one))]), ns())[0])
        self.assertIn("  [1] placeholder (solid) fx=[Fill,Glow]", b["Q"])  # a 1-line comp is never a reference
        short = [layer(i, f"L{i}") for i in range(1, 6)]
        changed = copy.deepcopy(short)
        changed[4]["blend"] = "ADD"
        b = blocks(views.tree(dump([comp(1, "A", short), comp(2, "B", changed)]), ns())[0])
        self.assertNotIn("same as", b["B"])  # the delta header would be longer than the 5 short lines

    def test_delta_partial_collapsed_run(self):
        src = {"id": 9, "name": "src"}
        A = [long_layer(i) for i in range(1, 13)] + [long_layer(i, "dup", typ="precomp", source=src) for i in range(13, 20)]
        B = copy.deepcopy(A)[:16] + [long_layer(17, "tail", typ="text")]
        b = blocks(views.tree(dump([comp(1, "A", A), comp(2, "B", B)]), ns())[0])["B"]
        self.assertIn("  - [18-19] dup x2 (precomp) -> src", b)   # only the indices B lacks
        self.assertIn("  [13-16] dup x4 (precomp) -> src", b)
        self.assertIn("  [17] tail (text)", b)
        self.assertNotIn("[13-19]", b)

    # ---- 4: control characters never break the line structure
    def test_control_chars_in_names(self):
        L = [layer(1, "HARDER THAN\rIT LOOKS", "text"), layer(2, "ctrl\nfake", "null"),
             layer(3, "kid", "precomp", parent={"index": 2, "name": "ctrl\nfake"}, source={"id": 9, "name": "src\x07"},
                   matte={"type": "ALPHA", "layer": {"index": 2, "name": "m x"}}, effects=[{"name": "fx\tA"}]),
             {"index": 4, "name": "bad\x85stub", "error": "e\nf"}]
        items = [comp(1, "comp\nX", L), comp(2, "B\r", [layer(1, "x\x00y")])]
        fonts = [{"postScriptName": "F\nG", "family": "F", "style": "\r", "substitute": True, "uses": 1}]
        legend = re.compile(r"^\d+ comps? \(")
        for args in (ns(), ns(all=True)):
            t, _ = views.tree(dump(items, fonts=fonts), args)
            self.assertEqual(t.splitlines(), t.split("\n"))
            for line in t.split("\n"):
                self.assertTrue(re.match(r"^(== |  \[|  \(|  - )", line) or legend.match(line), repr(line))
        self.assertIn("== comp\\nX 1080x1920", t)
        self.assertIn("  [1] HARDER THAN\\rIT LOOKS (text)\n", t)
        self.assertIn("  [2] ctrl\\nfake (null)\n", t)
        self.assertIn("-> src\\x07 parent=ctrl\\nfake matte=ALPHA:m\\u2028x fx=[fx\\tA]", t)
        self.assertIn("  [4] bad\\x85stub !LAYER ERROR: e / f", t)
        self.assertIn("  [1] x\\x00y (shape)", t)
        self.assertEqual(list(blocks(t)), ["comp\\nX", "B\\r"])
        # the printed escape works as a --comp regex
        t2, code = views.tree(dump(items), ns(comp=r"^comp\nX$"))
        self.assertEqual((code, list(blocks(t2))), (0, ["comp\\nX"]))
        o, _ = views.overview(dump(items, fonts=fonts), ns())
        self.assertEqual(o.splitlines(), o.split("\n"))
        self.assertIn("  comp\\nX 1080x1920 4L; B\\r 1080x1920 1L", o)
        self.assertIn("fonts (1, 1 SUBSTITUTED = not installed, AE renders a fallback): F\\nG x1 SUBSTITUTED\n", o)
        # template / arrangement rows too
        tmpl = [folder(5, "ORIGINAL_SHOTS"), comp(1, "mainComp", [main_control()]),
                comp(10, "0\n1", [layer(1, "controller", "null", effects=[{"name": "enter"}, {"name": "exit"}])], folder=5)]
        o, _ = views.overview(dump(tmpl), ns())
        self.assertEqual(o.splitlines(), o.split("\n"))
        self.assertIn("  0\\n1 1080x1920 1L | text MISSING", o)
        self.assertIn("--comp '^0\\n1(-text|-frame)?$'", o)

    def test_quote_in_name_is_shell_safe(self):
        t, _ = views.overview(dump([folder(5, "ORIGINAL_SHOTS"), comp(10, "it's", [], folder=5)]), ns())
        self.assertIn("aectx tree --comp '^it'\\''s(-text|-frame)?$'", t)

    # ---- 5: overview stays on one screen for big projects
    def test_overview_budget_many_sections(self):
        for n in (20, 30, 60):
            t, _ = views.overview(grow_arr(n), ns())
            self.assertLessEqual(len(t), 3000, n)
        self.assertIn(f"sequence (mainComp, 60 sections)", t)
        self.assertIn("  ... +40 more sections (aectx tree --comp '^mainComp$')", t)
        self.assertIn("template shots used: 01 x58 (sec 1,2,3,5,6,7,8,9,10,11,12,13,...); 05 x2 (sec 0,4)", t)
        self.assertNotIn("-text 936x1500", t)

    def test_overview_budget_fonts_layers_footage(self):
        d = grow_arr(30)
        d["fonts"] = [{"postScriptName": f"SomeFontFamily-Style{i:02d}", "family": "SomeFontFamily", "style": f"Style{i:02d}",
                       "substitute": i % 7 == 0, "uses": i} for i in range(60)]
        main = named(d, "mainComp")
        for i in range(40):
            main["layers"].append(layer(200 + i, f"stock clip {i}.mov", "footage", source={"id": 99999, "name": "x"}))
        for it in d["items"]:
            if it.get("type") == "footage":
                it["missing"] = True
                it["file"] = "/Users/ale/Library/Application Support/CucoStudio/projects/125/audio/very/deep/" + it["name"]
        t, _ = views.overview(d, ns())
        self.assertLessEqual(len(t), 3000)
        self.assertIn("fonts (60, 9 SUBSTITUTED = not installed, AE renders a fallback): SomeFontFamily-Style00 x0 SUBSTITUTED;", t)
        self.assertIn("  ... +18 more sections", t)  # the table shrank to 12 rows to make room
        self.assertIn("; +52 more\n", t)
        self.assertIn("; +34 more: 34 footage\n", t)
        self.assertIn("missing (7): ", t)
        self.assertEqual(t.count("/Users/ale/Library"), 1 + t.splitlines()[0].count("/Users/ale/Library"))

    def test_overview_budget_many_template_shots(self):
        items = [folder(5, "ORIGINAL_SHOTS"), folder(6, "PRECOMPS"), comp(1, "mainComp", [main_control()])]
        for i in range(1, 41):
            st = {"path": "Text/Source Text", "v": {"text": "SOME HEADLINE TEXT HERE", "size": 300, "font": "Foo"}}
            items.append(comp(100 + i, f"{i:02d}", [layer(1, f"{i:02d}-text", "precomp", source={"id": 200 + i, "name": f"{i:02d}-text"})], folder=5))
            items.append(comp(200 + i, f"{i:02d}-text", [layer(1, "textBlock", "text", props=[st])], folder=6, width=900 + i))
        t, _ = views.overview(dump(items), ns())
        self.assertLessEqual(len(t), 3000)
        self.assertIn("  ... +24 more shots", t)

    # ---- 6: mainControl effect types are checked, not just names
    def test_main_control_wrong_effect_type(self):
        mc = main_control({"FORM": 1})
        mc["effects"][3] = {"name": "1", "mn": "ADBE Slider Control", "on": True}
        mc["effects"][0] = {"name": "FORM", "mn": "ADBE Color Control", "on": True}
        mc["props"].append({"path": "Effects/1/Slider", "mn": "x", "v": 7})
        t, _ = views.overview(dump([folder(5, "ORIGINAL_SHOTS"), comp(1, "mainComp", [mc])]), ns())
        self.assertIn("FORM=WRONG-TYPE(Color) FLOW=0(default)", t)
        self.assertIn("palette 1=WRONG-TYPE(Slider) 2=#ff0000(default)", t)
        self.assertNotIn("1=#ff0000", t)
        self.assertIn("effect order [FORM:Color, FLOW:Slider, PRESSURE:Slider, 1:Slider, 2:Color, 3:Color]", t)
        # unknown type (no mn): no false warning, default flagged as a guess
        mc = main_control()
        for e in mc["effects"]:
            e.pop("mn")
        t, _ = views.overview(dump([folder(5, "ORIGINAL_SHOTS"), comp(1, "mainComp", [mc])]), ns())
        self.assertIn("FORM=0(default?)", t)
        self.assertNotIn("effect order", t)

    # ---- 7: the delta note says how to see the comp whole, and that works
    def test_delta_full_hint_works(self):
        b = blocks(views.tree(ARR, ns())[0])
        self.assertIn("full: aectx tree --comp '^01-1$')", b["01-1"])
        t, _ = views.tree(ARR, ns(comp="^01-1$"))
        self.assertNotIn("same as", t)
        self.assertIn("  [22] controller (null) fx=[enter,exit] keyed=2", t)

    # ---- 8: duplicate comp names are disambiguated
    def test_duplicate_comp_names(self):
        A = [long_layer(i) for i in range(1, 11)]
        B = copy.deepcopy(A)
        B[0]["blend"] = "SCREEN"
        items = [comp(7, "X", A), comp(8, "X", B), comp(9, "Y", [layer(1, "y")])]
        b = blocks(views.tree(dump(items), ns())[0])
        self.assertEqual(list(b), ["X#7", "X#8", "Y"])
        self.assertIn("(same as X#7 except these lines;", b["X#8"])
        o, _ = views.overview(dump(items), ns())
        self.assertIn("X#7 1080x1920 10L; X#8 1080x1920 10L; Y 1080x1920 1L", o)

    # ---- 11: malformed field types degrade, never raise
    def test_malformed_specific(self):
        cases = []
        d = dump([comp(1, "A", [])]); d["items"][0]["layers"] = 5; cases.append(d)
        d = dump([comp(1, "A", [layer(1, "a")])]); d["items"][0]["layers"][0]["props"] = 3; cases.append(d)
        cases.append(dump([comp(1, "A", [layer(1, "a", masks=3, markers=2, effects=7)], markers=4)]))
        cases.append(dump([comp(1, "A", []), {"id": 2, "name": "q", "type": 5}, {"id": 3, "name": "r", "type": 7},
                           {"id": [4], "name": "s", "type": ["comp"], "folder": {"x": 1}}]))
        cases.append(dump([folder(5, "PROJECT_SHOTS"), comp(10, "01-0", [], folder=5), comp(11, "01-1", [], folder=5),
                           comp(1, "mainComp", [dict(layer(1, "01-0", "precomp", source={"id": 10, "name": "01-0"}), index="a"),
                                                layer(2, "01-1", "precomp", source={"id": 11, "name": "01-1"}, **{"in": 0})])]))
        tb = layer(1, "textBlock", "text", props=[{"path": "Text/Source Text", "v": {"text": "x", "size": 3}, "k": 5}])
        cases.append(dump([folder(5, "ORIGINAL_SHOTS"), comp(10, "01", [], folder=5), comp(11, "01-text", [tb])]))
        cases.append({"schema": "aectx/2", "meta": [], "fonts": 5, "items": {"a": 1}})
        for d in cases:
            for fn in (views.overview, views.tree):
                t, code = fn(d, ns(all=True))
                self.assertIn(code, (0, 2))
                self.assertTrue(t)

    def test_malformed_mutation_sweep(self):
        """Every known field, on every record of both fixtures, set to each wrong type."""
        bad_values = (5, "x", {"a": [1]}, [1, "b"], None, True, -1.5)
        item_f = ("id", "name", "type", "folder", "layers", "width", "height", "fps", "duration", "numLayers",
                  "markers", "skipped", "file", "missing", "hasAudio", "hasVideo", "still")
        layer_f = ("index", "name", "type", "source", "enabled", "in", "out", "parent", "matte", "isMatte", "blend",
                   "effects", "masks", "markers", "props", "stretch", "error")
        prop_f = ("path", "mn", "v", "k", "x", "xOn", "xErr")
        for src in (STEEL, ARR):
            for where, fields in (("item", item_f), ("layer", layer_f), ("prop", prop_f), ("fx", ("name", "mn", "on"))):
                for field in fields:
                    for bv in bad_values:
                        d = copy.deepcopy(src)
                        for it in d["items"]:
                            if where == "item":
                                it[field] = bv
                                continue
                            for L in it.get("layers") or []:
                                if where == "layer":
                                    L[field] = bv
                                elif where == "prop":
                                    for p in L.get("props") or []:
                                        p[field] = bv
                                else:
                                    for e in L.get("effects") or []:
                                        e[field] = bv
                        for fn in (views.overview, views.tree):
                            try:
                                fn(d, ns(all=True))
                            except Exception as e:  # pragma: no cover - the failure message is the point
                                self.fail(f"{fn.__name__}: {where}.{field}={bv!r}: {type(e).__name__}: {e}")

    # ---- 12: text sizes come from the keys the sample comes from; exact -text comp preferred
    def test_text_sizes_from_keys(self):
        def tcomp(cid, name, keys, v_size=50):
            st = {"path": "Text/Source Text", "v": {"text": "AT T", "size": v_size, "font": "Foo"}, "k": keys}
            return comp(cid, name, [layer(1, "textBlock", "text", props=[st])], folder=6)
        items = [folder(5, "PROJECT_SHOTS"), folder(6, "PROJECT_TARGETS"),
                 comp(10, "01-0", [], folder=5), comp(11, "01-1", [], folder=5),
                 tcomp(20, "01-0-text", [[0, {"text": "one", "size": 100}], [2, {"text": "two", "size": 120}]]),
                 tcomp(21, "01-1-text", [[0, {"text": "uno", "size": 90}], [2, {"text": "dos", "size": 90}]]),
                 comp(1, "mainComp", [layer(1, "01-0", "precomp", source={"id": 10, "name": "01-0"}, **{"in": 0, "out": 2}),
                                      layer(2, "01-1", "precomp", source={"id": 11, "name": "01-1"}, **{"in": 2, "out": 4})])]
        t, _ = views.overview(dump(items, meta={"at": 3}), ns())
        self.assertIn('| 2 phrases "one" 100-120pt', t)
        self.assertIn('| 2 phrases "uno" 90pt', t)
        self.assertNotIn("50pt", t)

    def test_find_sub_prefers_exact_name(self):
        tb = lambda txt: [layer(1, "textBlock", "text", props=[{"path": "Text/Source Text", "v": {"text": txt, "size": 10}}])]
        items = [folder(5, "ORIGINAL_SHOTS"), folder(6, "PRECOMPS"), comp(1, "mainComp", [main_control()]),
                 comp(10, "01", [layer(1, "old", "precomp", source={"id": 30, "name": "old-text"}),
                                 layer(2, "new", "precomp", source={"id": 20, "name": "01-text"})], folder=5),
                 comp(11, "02", [layer(1, "borrowed", "precomp", source={"id": 30, "name": "old-text"})], folder=5),
                 comp(20, "01-text", tb("RIGHT"), folder=6), comp(30, "old-text", tb("WRONG"), folder=6),
                 comp(21, "02-text", tb("UNUSED"), folder=6)]
        t, _ = views.overview(dump(items), ns())
        self.assertIn('  01 1080x1920 2L | text "RIGHT" 10pt', t)
        # the shot renders another -text comp: shown, and named
        self.assertIn('  02 1080x1920 1L | text old-text "WRONG" 10pt', t)

    # ---- sizes on the fixtures stay in budget
    def test_fixture_budgets(self):
        for d in (STEEL, ARR):
            self.assertLessEqual(len(views.overview(d, ns())[0]), 3000)
            t, _ = views.tree(d, ns())
            b = blocks(t)
            self.assertLessEqual(len(t) / len(b), 1100)
            t, _ = views.tree(d, ns(full=True))
            for name, blk in blocks(t).items():
                self.assertLessEqual(len(blk), 1100, name)

if __name__ == "__main__":
    unittest.main()
