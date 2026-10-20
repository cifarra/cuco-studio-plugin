"""Tests for aectx.validate (offline style-contract check).

Run: cd skills/ae-context && python3 -m unittest tests.test_validate -v
"""
import argparse
import contextlib
import copy
import gzip
import io
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from aectx.validate import validate  # noqa: E402

FIXTURES = os.path.join(HERE, "fixtures")


def load_fixture(name):
    with gzip.open(os.path.join(FIXTURES, name), "rt", encoding="utf-8") as f:
        return json.load(f)


def run(data, args=None):
    text, code = validate(data, args if args is not None else argparse.Namespace())
    return text, code


def codes(text, level=None):
    out = []
    for line in text.splitlines():
        parts = line.split(" ", 2)
        if len(parts) >= 2 and parts[0] in ("BLOCK", "WARN", "INFO"):
            if level is None or parts[0] == level:
                out.append(parts[1])
    return out


def line_for(text, code):
    for line in text.splitlines():
        parts = line.split(" ", 2)
        if len(parts) >= 2 and parts[1] == code:
            return line
    return None


# ------------------------------------------------------------------ synthetic dump builder
SLIDER_MN = "ADBE Effect Parade/ADBE Slider Control/ADBE Slider Control-0001"
COLOR_MN = "ADBE Effect Parade/ADBE Color Control/ADBE Color Control-0001"
TEXT_MN = "ADBE Text Properties/ADBE Text Document"


def doc(text, box=False, font="Inter-Regular"):
    return {"text": text, "size": 100, "font": font, "family": "Inter", "style": "Regular", "caps": "FONT_NORMAL",
            "leading": "auto", "tracking": 0, "justify": "LEFT_JUSTIFY", "fill": "#ffffff", "stroke": None,
            "box": box, "lines": 1}


class Dump:
    """Builds a minimal, valid CucoStudio style template dump; tests then break one thing."""

    def __init__(self):
        self.items = []
        self.nid = 0
        self.fonts = [{"postScriptName": "Inter-Regular", "family": "Inter", "style": "Regular",
                       "substitute": False, "uses": 3}]
        self.meta = {"name": "t.aep", "path": "/tmp/t.aep", "at": 0, "post": False, "comps": None,
                     "errors": [], "warnings": []}

    def _id(self):
        self.nid += 1
        return self.nid

    def folder(self, name, parent=None):
        it = {"id": self._id(), "name": name, "type": "folder", "folder": parent}
        self.items.append(it)
        return it

    def comp(self, name, folder=None, layers=None, w=1080, h=1920, fps=30):
        it = {"id": self._id(), "name": name, "type": "comp", "folder": folder["id"] if folder else None,
              "width": w, "height": h, "duration": 10, "fps": fps, "numLayers": 0, "layers": []}
        for L in layers or []:
            self.add_layer(it, L)
        self.items.append(it)
        return it

    def solid(self, name, folder=None):
        it = {"id": self._id(), "name": name, "type": "solid", "folder": folder["id"] if folder else None,
              "width": 1080, "height": 1920, "color": "#000000"}
        self.items.append(it)
        return it

    @staticmethod
    def add_layer(comp, L):
        L = dict(L)
        L.setdefault("index", len(comp["layers"]) + 1)
        L.setdefault("props", [])
        comp["layers"].append(L)
        comp["numLayers"] = len(comp["layers"])
        return L

    def data(self):
        return {"schema": "aectx/2", "meta": self.meta, "fonts": self.fonts, "items": self.items}


def precomp(name, src):
    return {"name": name, "type": "precomp", "source": {"id": src["id"], "name": src["name"]}, "enabled": True}


def controller(enter_keys=2, exit_keys=2):
    props = []
    if enter_keys:
        props.append({"path": "Effects/enter/Slider", "mn": SLIDER_MN, "v": 0,
                      "k": [[i, 0 if i == 0 else 100] for i in range(enter_keys)]})
    if exit_keys:
        props.append({"path": "Effects/exit/Slider", "mn": SLIDER_MN, "v": 0,
                      "k": [[9 + i, 0 if i == 0 else 100] for i in range(exit_keys)]})
    return {"name": "controller", "type": "null", "enabled": False,
            "effects": [{"name": "enter", "mn": "ADBE Slider Control", "on": True},
                        {"name": "exit", "mn": "ADBE Slider Control", "on": True}],
            "props": props}


def main_control(order=("FORM", "FLOW", "PRESSURE", "1", "2", "3")):
    fx, props = [], []
    for n in order:
        if n in ("FORM", "FLOW", "PRESSURE"):
            fx.append({"name": n, "mn": "ADBE Slider Control", "on": True})
            props.append({"path": f"Effects/{n}/Slider", "mn": SLIDER_MN, "v": 50})
        else:
            fx.append({"name": n, "mn": "ADBE Color Control", "on": True})
            props.append({"path": f"Effects/{n}/Color", "mn": COLOR_MN, "v": [1, 0, 0, 1]})
    return {"name": "mainControl", "type": "null", "enabled": True, "effects": fx, "props": props}


# kind: "text" (text-only), "media" (media-only), "both" (text+media), "empty" (-text with "", no -frame)
DEFAULT_HAND = (("01", "text"), ("02", "media"), ("03", "both"), ("04", "text"), ("05", "text"))


def template(hand=DEFAULT_HAND, mc_order=("FORM", "FLOW", "PRESSURE", "1", "2", "3")):
    d = Dump()
    d.comp("mainComp", layers=[main_control(mc_order)])
    shots_f = d.folder("ORIGINAL_SHOTS")
    pre_f = d.folder("PRECOMPS")
    solids = d.folder("Solids")
    bg = d.solid("BG", solids)
    for name, kind in hand:
        sample = "" if kind in ("media", "empty") else f"SAMPLE TEXT {name}"
        tc = d.comp(f"{name}-text", pre_f, w=900, h=300, layers=[
            {"name": "textBlock", "type": "text", "enabled": True,
             "props": [{"path": "Text/Source Text", "mn": TEXT_MN, "v": doc(sample)}]}])
        layers = [precomp(f"{name}-text", tc)]
        if kind in ("media", "both"):
            fc = d.comp(f"{name}-frame", pre_f, w=1000, h=1000,
                        layers=[{"name": "placeholder", "type": "solid", "source": {"id": bg["id"], "name": "BG"}}])
            layers.append(precomp(f"{name}-frame", fc))
        layers.append(controller())
        layers.append({"name": "BG", "type": "solid", "source": {"id": bg["id"], "name": "BG"}, "enabled": True})
        d.comp(name, shots_f, layers=layers)
    return d


def item(data, name, type_=None):
    for it in data["items"]:
        if it.get("name") == name and (type_ is None or it.get("type") == type_):
            return it
    raise KeyError(name)


def layer(comp, name):
    for L in comp["layers"]:
        if L.get("name") == name:
            return L
    raise KeyError(name)


# ================================================================== fixtures
class TestFixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.steel = load_fixture("steel.json.gz")
        cls.arr = load_fixture("arr746.json.gz")

    def test_steel_has_no_block(self):
        text, code = run(self.steel)
        self.assertEqual(code, 0, text)
        self.assertEqual(codes(text, "BLOCK"), [], text)
        self.assertTrue(text.splitlines()[0].startswith("validate: style template - 6 shot(s)"), text)
        self.assertTrue(text.splitlines()[-1].startswith("summary: 0 BLOCK"), text)

    def test_steel_shot_hand_matches_the_caster(self):
        text, _ = run(self.steel)
        hand = line_for(text, "SHOT_HAND")
        self.assertIn("text-only 01:20c 05:16c", hand)
        self.assertIn("media-only 02:1080x1920", hand)
        self.assertIn("text+media 03:16c/936x1000 04:14c/1080x1920 06:16c/612x1700", hand)
        self.assertNotIn("*", hand)  # Source Text v is already the rendered text (SCHEMA.md quirk)
        self.assertIn("reuse 2 shot(s) (01, 05)", line_for(text, "REPETITION"))
        self.assertIn("text sections [16, 20], media sections [14, 16]", line_for(text, "CAPACITY"))
        self.assertIn("1=#0b0d10 2=#d9dee3 3=#3457ff", line_for(text, "PALETTE"))
        self.assertNotIn("HAND_GAP", codes(text))

    def test_arrangement_mode(self):
        text, code = run(self.arr)
        self.assertEqual(code, 0, text)
        first = text.splitlines()[0]
        self.assertTrue(first.startswith("validate: ARRANGEMENT"), first)
        self.assertIn("7 shot comp(s) in PROJECT_SHOTS", first)
        for c in ("NO_SHOTS_FOLDER", "SHOT_HAND", "MISSING_TEXT_COMP", "NO_MAIN_CONTROL", "PALETTE"):
            self.assertNotIn(c, codes(text))

    def test_deterministic_and_budget(self):
        for data in (self.steel, self.arr):
            a, _ = run(data)
            b, _ = run(copy.deepcopy(data))
            self.assertEqual(a, b)
            self.assertLess(len(a), 3000)
            self.assertTrue(a.isascii())

    def test_cli_offline_integration(self):
        from aectx import cli
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main(["validate", "--file", os.path.join(FIXTURES, "steel.json.gz")])
        self.assertEqual(rc, 0)
        self.assertIn("summary: 0 BLOCK", buf.getvalue())


# ================================================================== synthetic: valid baseline
class TestBaseline(unittest.TestCase):
    def test_valid_template_is_clean(self):
        text, code = run(template().data())
        self.assertEqual(code, 0, text)
        self.assertEqual(codes(text, "BLOCK"), [], text)
        self.assertEqual(codes(text, "WARN"), [], text)
        self.assertIn("text-only 01:14c 04:14c 05:14c", line_for(text, "SHOT_HAND"))  # len("SAMPLE TEXT 01")
        self.assertNotIn("REPETITION", codes(text))  # 3 text-only shots

    def test_args_variants(self):
        d = template().data()
        self.assertEqual(validate(d, None), validate(d, argparse.Namespace(file="x", cmd="validate")))

    def test_level_ordering_and_summary(self):
        d = template()
        data = d.data()
        item(data, "mainComp")["layers"] = []           # BLOCK
        data["fonts"][0]["substitute"] = True            # WARN
        text, code = run(data)
        self.assertEqual(code, 1)
        lv = [l.split(" ", 1)[0] for l in text.splitlines()[1:-1]]
        rank = {"BLOCK": 0, "WARN": 1, "INFO": 2}
        self.assertEqual(lv, sorted(lv, key=rank.__getitem__), text)
        self.assertTrue(text.splitlines()[-1].startswith("summary: 1 BLOCK, 1 WARN"), text)
        self.assertIn("FAIL", text.splitlines()[-1])


# ================================================================== synthetic: every BLOCK code
class TestBlocks(unittest.TestCase):
    def assertBlock(self, data, code_):
        text, code = run(data)
        self.assertEqual(code, 1, text)
        self.assertIn(code_, codes(text, "BLOCK"), text)
        return text

    def test_no_main_comp_with_near_miss(self):
        data = template().data()
        item(data, "mainComp")["name"] = "MainComp"
        text = self.assertBlock(data, "NO_MAIN_COMP")
        self.assertIn("near-miss: MainComp", line_for(text, "NO_MAIN_COMP"))

    def test_duplicate_main_comp(self):
        d = template()
        d.comp("mainComp", d.folder("OLD"), layers=[main_control()])
        text = self.assertBlock(d.data(), "DUPLICATE_COMP")
        self.assertIn('2 comps named "mainComp"', text)

    def test_duplicate_shot_comp(self):
        d = template()
        d.items.insert(0, {"id": 999, "name": "01", "type": "comp", "folder": None, "width": 10, "height": 10,
                           "fps": 30, "layers": []})
        text = self.assertBlock(d.data(), "DUPLICATE_COMP")
        self.assertIn("NOT the ORIGINAL_SHOTS shot", line_for(text, "DUPLICATE_COMP"))

    def test_no_main_control_dollar_fallback(self):
        data = template().data()
        layer(item(data, "mainComp"), "mainControl")["name"] = "$"
        text = self.assertBlock(data, "NO_MAIN_CONTROL")
        self.assertIn('"$" layer exists', line_for(text, "NO_MAIN_CONTROL"))

    def test_main_comp_without_layers(self):
        data = template().data()
        del item(data, "mainComp")["layers"]
        self.assertBlock(data, "NO_MAIN_CONTROL")

    def test_main_control_effect_missing(self):
        data = template(mc_order=("FLOW", "PRESSURE", "1", "2", "3")).data()
        text = self.assertBlock(data, "MAINCONTROL_EFFECTS")
        self.assertIn('"FORM" missing', text)
        self.assertNotIn("MAINCONTROL_ORDER", codes(text))

    def test_main_control_wrong_control_type(self):
        data = template().data()
        mc = layer(item(data, "mainComp"), "mainControl")
        mc["effects"][3]["mn"] = "ADBE Slider Control"   # "1" as a slider
        text = self.assertBlock(data, "MAINCONTROL_EFFECTS")
        self.assertIn('"1" is ADBE Slider Control', text)


    def test_main_control_extra_effect_after_contract_is_fine(self):
        data = template().data()
        mc = layer(item(data, "mainComp"), "mainControl")
        mc["effects"].append({"name": "seed", "mn": "ADBE Slider Control", "on": True})
        text, code = run(data)
        self.assertEqual(code, 0, text)
        self.assertIn("other effects: seed", line_for(text, "PALETTE"))

    def test_no_shots_folder(self):
        data = template().data()
        item(data, "ORIGINAL_SHOTS")["name"] = "Original Shots"
        text = self.assertBlock(data, "NO_SHOTS_FOLDER")
        self.assertIn("near-miss: Original Shots", text)

    def test_empty_shots_folder(self):
        self.assertBlock(template(hand=()).data(), "NO_SHOTS")

    def test_missing_text_comp(self):
        data = template().data()
        shot = item(data, "02")
        shot["layers"] = [L for L in shot["layers"] if L["name"] != "02-text"]
        text = self.assertBlock(data, "MISSING_TEXT_COMP")
        self.assertIn("[02]", line_for(text, "MISSING_TEXT_COMP"))

    def test_missing_text_comp_shot_is_not_in_the_hand(self):
        data = template().data()
        shot = item(data, "03")
        shot["layers"] = [L for L in shot["layers"] if L["name"] != "03-text"]
        hand = line_for(run(data)[0], "SHOT_HAND")
        self.assertIn("4 shot(s)", hand)
        self.assertIn("not in shot_list (no text comp): 03", hand)
        self.assertNotIn("03:", hand)

    def test_text_slot_not_a_precomp(self):
        data = template().data()
        L = layer(item(data, "01"), "01-text")
        L["type"] = "text"
        del L["source"]
        text = self.assertBlock(data, "MISSING_TEXT_COMP")
        self.assertIn("is a text layer, not a precomp", line_for(text, "MISSING_TEXT_COMP"))

    def test_text_slot_sources_footage(self):
        data = template().data()
        bg = item(data, "BG", "solid")
        layer(item(data, "01"), "01-text")["source"] = {"id": bg["id"], "name": "BG"}
        text = self.assertBlock(data, "MISSING_TEXT_COMP")
        ln = line_for(text, "MISSING_TEXT_COMP")
        self.assertIn("sources a solid, not a comp", ln)
        self.assertIn('[01/01-text -> "BG"]', ln)

    def test_shot_comp_without_layers(self):
        data = template().data()
        item(data, "03")["layers"] = []
        text = self.assertBlock(data, "MISSING_TEXT_COMP")
        self.assertIn("NO_CONTROLLER", codes(text, "WARN"))

    def test_missing_textblock_near_miss(self):
        data = template().data()
        layer(item(data, "01-text"), "textBlock")["name"] = "Textblock"
        text = self.assertBlock(data, "MISSING_TEXTBLOCK")
        self.assertIn("near-miss: Textblock", text)

    def test_textblock_not_text(self):
        data = template().data()
        layer(item(data, "04-text"), "textBlock")["type"] = "shape"
        self.assertBlock(data, "TEXTBLOCK_NOT_TEXT")

    def test_expression_error_in_shot_precomp(self):
        data = template().data()
        layer(item(data, "01-text"), "textBlock")["props"].append(
            {"path": "Transform/Opacity", "mn": "ADBE Transform Group/ADBE Opacity", "v": 100,
             "x": 'comp("mainComp").layer("mainControl").effect("FORM")("Slider")',
             "xErr": "Error: property or method named 'FORM' is missing\nError occurred at line 1", "xOn": False})
        text = self.assertBlock(data, "EXPR_ERROR")
        ln = line_for(text, "EXPR_ERROR")
        self.assertIn("named 'FORM' is missing", ln)
        self.assertIn("01-text(1)", ln)
        self.assertIn("[e.g. 01-text/[1] textBlock/Transform/Opacity]", ln)
        self.assertNotIn("EXPR_DISABLED", codes(text))  # erroring + disabled counts once

    def test_disabled_expression_in_shot(self):
        data = template().data()
        layer(item(data, "02"), "BG")["props"].append(
            {"path": "Transform/Position", "mn": "ADBE Transform Group/ADBE Position", "v": [0, 0],
             "x": "wiggle(1,1)", "xOn": False})
        text = self.assertBlock(data, "EXPR_DISABLED")
        self.assertIn("02(1)", line_for(text, "EXPR_DISABLED"))

    def test_expression_error_outside_render_graph_is_warn(self):
        d = template()
        d.comp("scratch", layers=[{"name": "x", "type": "null",
                                   "props": [{"path": "Transform/Opacity", "x": "boom", "xErr": "Error: boom"}]}])
        text, code = run(d.data())
        self.assertEqual(code, 0, text)
        self.assertIn("EXPR_ERROR_UNUSED", codes(text, "WARN"))

    def test_expression_error_grouping_is_capped(self):
        data = template().data()
        bg = layer(item(data, "01"), "BG")
        for i in range(12):
            bg["props"].append({"path": f"P{i}", "x": "x", "xErr": f"Error: distinct {i}"})
        text, _ = run(data)
        self.assertEqual(codes(text, "BLOCK").count("EXPR_ERROR"), 9)
        self.assertIn("+4 more distinct error(s) in 4 expression(s)", text)


# ================================================================== synthetic: WARN / INFO
class TestWarnInfo(unittest.TestCase):
    def assertWarn(self, data, code_):
        text, code = run(data)
        self.assertEqual(code, 0, text)
        self.assertIn(code_, codes(text, "WARN"), text)
        return text

    def test_substituted_fonts(self):
        data = template().data()
        data["fonts"][0]["substitute"] = True
        self.assertIn("Inter-Regular (3 uses)", line_for(self.assertWarn(data, "MISSING_FONTS"), "MISSING_FONTS"))

    def test_missing_footage_and_placeholder(self):
        d = template()
        d.items.append({"id": 900, "name": "clip.mov", "type": "footage", "folder": None, "file": "/x/clip.mov",
                        "missing": True})
        d.items.append({"id": 901, "name": "ph", "type": "placeholder", "folder": None})
        text = self.assertWarn(d.data(), "MISSING_FOOTAGE")
        self.assertEqual(codes(text, "WARN").count("MISSING_FOOTAGE"), 2)
        self.assertIn("e.g. /x/clip.mov", text)

    def test_no_controller(self):
        data = template().data()
        shot = item(data, "01")
        shot["layers"] = [L for L in shot["layers"] if L["name"] != "controller"]
        self.assertWarn(data, "NO_CONTROLLER")

    def test_controller_key_count(self):
        data = template().data()
        shot = item(data, "01")
        shot["layers"] = [controller(enter_keys=3, exit_keys=0) if L["name"] == "controller" else L
                          for L in shot["layers"]]
        text = self.assertWarn(data, "CONTROLLER_KEYS")
        self.assertIn("enter 3, exit 0", text)

    def test_controller_effect_missing(self):
        data = template().data()
        ctl = layer(item(data, "02"), "controller")
        ctl["effects"] = ctl["effects"][:1]
        self.assertIn('"exit" missing', self.assertWarn(data, "CONTROLLER_EFFECTS"))

    def test_box_text(self):
        data = template().data()
        layer(item(data, "01-text"), "textBlock")["props"][0]["v"]["box"] = [800, 200]
        ln = line_for(self.assertWarn(data, "BOX_TEXT"), "BOX_TEXT")
        self.assertIn("[01-text 800x200]", ln)
        self.assertIn('ae.md "use POINT text"', ln)

    def test_box_text_unreadable(self):
        data = template().data()
        del layer(item(data, "01-text"), "textBlock")["props"][0]["v"]["box"]
        self.assertIn("boxTextSize was unreadable", self.assertWarn(data, "BOX_TEXT"))

    def test_text_keyframed(self):
        data = template().data()
        layer(item(data, "04-text"), "textBlock")["props"][0]["k"] = [[0, {"text": "a", "size": 1}, "HOLD"]]
        self.assertWarn(data, "TEXT_KEYFRAMED")

    def test_comp_ref_missing(self):
        data = template().data()
        layer(item(data, "01"), "BG")["props"].append({"path": "Effects/Fill/Color", "v": [1, 1, 1, 1],
                                                       "x": 'comp("palette").layer("x").effect("c")("Color")'})
        self.assertIn('comp("palette")', self.assertWarn(data, "COMP_REF_MISSING"))

    def test_comp_ref_to_per_section_comp(self):
        data = template().data()
        layer(item(data, "02"), "BG")["props"].append({"path": "Transform/Opacity", "v": 100,
                                                       "x": "comp('01-text').layer('textBlock'); comp(nm)"})
        text = self.assertWarn(data, "COMP_REF_FRAGILE")
        self.assertIn("template original", text)
        self.assertIn("COMP_REF_DYNAMIC", codes(text, "INFO"))

    def test_comp_ref_to_unused_comp(self):
        d = template()
        d.comp("library")
        data = d.data()
        layer(item(data, "02"), "BG")["props"].append({"path": "Transform/Opacity", "v": 100,
                                                       "x": 'comp("library").duration'})
        self.assertIn("reduceProject", self.assertWarn(data, "COMP_REF_FRAGILE"))

    def test_shot_size_and_fps(self):
        data = template().data()
        shot = item(data, "03")
        shot["width"], shot["fps"] = 1920, 25
        text = self.assertWarn(data, "SHOT_SIZE")
        self.assertIn("SHOT_FPS", codes(text, "WARN"))

    def test_frame_slot_sources_footage(self):
        d = template()
        data = d.data()
        fl = layer(item(data, "03"), "03-frame")
        bg = item(data, "BG", "solid")
        fl["source"] = {"id": bg["id"], "name": "BG"}
        text = self.assertWarn(data, "FRAME_NOT_PRECOMP")
        self.assertIn("duplicate() fails", text)

    def test_slot_sources_differ(self):
        data = template().data()
        shot = item(data, "01")
        other = item(data, "04-text")
        Dump.add_layer(shot, precomp("01-text", other))
        self.assertWarn(data, "SLOT_SOURCES_DIFFER")

    def test_invalid_shot_structure_and_ignored_shots(self):
        d = template()
        sf = next(f for f in d.items if f["name"] == "ORIGINAL_SHOTS")
        d.solid("stray", sf)
        d.comp("POSTER", sf)  # no -text layer, but ignored by GET_STYLE_DATA
        text = self.assertWarn(d.data(), "INVALID_SHOT_STRUCTURE")
        self.assertIn("IGNORED_SHOTS", codes(text, "INFO"))
        self.assertNotIn("MISSING_TEXT_COMP", codes(text))

    def test_whitespace_sample(self):
        data = template().data()
        layer(item(data, "01-text"), "textBlock")["props"][0]["v"]["text"] = "  "
        self.assertWarn(data, "SAMPLE_WHITESPACE")

    def test_duplicate_main_control(self):
        data = template().data()
        Dump.add_layer(item(data, "mainComp"), main_control())
        self.assertWarn(data, "DUPLICATE_MAIN_CONTROL")

    def test_hand_gaps_and_repetition(self):
        text, code = run(template(hand=(("01", "text"), ("02", "text"))).data())
        self.assertEqual(code, 0, text)
        gaps = [l for l in text.splitlines() if " HAND_GAP " in l]
        self.assertEqual(len(gaps), 1, text)   # no framed shot at all: media falls back to every shot
        self.assertIn("no shot has a -frame", gaps[0])
        self.assertIn("reuse 2 shot(s) (01, 02)", line_for(text, "REPETITION"))
        # capacity_ladder: framed or shot_list -> the text shots' chars
        self.assertIn("text sections [14], media sections [14]", line_for(text, "CAPACITY"))

    def test_no_frameless_shot(self):
        text, _ = run(template(hand=(("01", "media"), ("02", "both"))).data())
        self.assertIn("no frameless shot: text sections fall back to every shot", line_for(text, "HAND_GAP"))
        self.assertIn("reuse 2 shot(s) (01(empty), 02)", line_for(text, "REPETITION"))
        self.assertIn("text sections [14]", line_for(text, "CAPACITY"))   # fallback pool, not 'none'

    def test_post_expression_value_preferred(self):
        data = template().data()
        st = layer(item(data, "01-text"), "textBlock")["props"][0]
        st["x"] = "text.sourceText.toUpperCase()"
        st["vPost"] = doc("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        hand = line_for(run(data)[0], "SHOT_HAND")
        self.assertIn("01:26c ", hand)
        self.assertNotIn("*", hand)


# ================================================================== edge cases
class TestEdgeCases(unittest.TestCase):
    def test_empty_project(self):
        for data in ({}, None, {"items": []}, {"items": None, "meta": None, "fonts": None}):
            text, code = run(data)
            self.assertEqual(code, 1, text)
            self.assertIn("NO_MAIN_COMP", codes(text, "BLOCK"))
            self.assertIn("NO_SHOTS_FOLDER", codes(text, "BLOCK"))
            self.assertIn("empty project", text.splitlines()[0])
            self.assertIn("FONTS_UNKNOWN", codes(text, "INFO"))

    def test_item_error_stub_for_main_comp(self):
        data = template().data()
        mc = item(data, "mainComp")
        data["items"][data["items"].index(mc)] = {"id": mc["id"], "name": "mainComp", "error": "boom"}
        text, code = run(data)
        self.assertNotIn("NO_MAIN_COMP", codes(text))
        self.assertIn("EXTRACT_ERROR", codes(text, "WARN"))
        self.assertIn("UNVERIFIED", codes(text, "WARN"))
        self.assertIn("INCOMPLETE", text.splitlines()[-1])
        self.assertEqual(code, 0, text)

    def test_layer_error_stubs(self):
        data = template().data()
        mcomp = item(data, "mainComp")
        mcomp["layers"] = [{"index": 1, "name": "mainControl", "error": "x"}]
        tc = item(data, "01-text")
        tc["layers"] = [{"index": 1, "name": "textBlock", "error": "y"}]
        text, code = run(data)
        self.assertEqual(code, 0, text)
        self.assertNotIn("NO_MAIN_CONTROL", codes(text))
        self.assertNotIn("MISSING_TEXTBLOCK", codes(text))
        self.assertIn("mainControl, 01-text/textBlock (layer failed to extract)", line_for(text, "UNVERIFIED"))
        self.assertNotIn(" 01:", line_for(text, "SHOT_HAND"))  # unknown sample -> left out of the hand

    def test_missing_optional_fields(self):
        data = template().data()
        for it in data["items"]:
            for k in ("width", "height", "fps", "numLayers"):
                it.pop(k, None)
            for L in it.get("layers", []):
                L.pop("enabled", None)
                L.pop("index", None)
                if L.get("name") != "textBlock":
                    L.pop("props", None)
                    L.pop("effects", None)
        del data["meta"]
        del data["fonts"]
        text, code = run(data)   # must not raise
        self.assertEqual(code, 1, text)  # mainControl lost its effects
        self.assertIn("MAINCONTROL_EFFECTS", codes(text, "BLOCK"))
        self.assertIn("CONTROLLER_EFFECTS", codes(text, "WARN"))
        self.assertIn("FONTS_UNKNOWN", codes(text, "INFO"))
        self.assertIn("mainComp ?x? @?fps", text.splitlines()[0])

    def test_source_text_not_recorded(self):
        data = template().data()
        layer(item(data, "01-text"), "textBlock")["props"] = []
        text, _ = run(data)
        self.assertIn("SAMPLE_UNKNOWN", codes(text, "INFO"))

    def test_scoped_dump(self):
        data = template().data()
        data["meta"]["comps"] = "^0[2-5]"
        shot = item(data, "01")
        shot["layers"], shot["skipped"] = [], True
        text, code = run(data)
        self.assertEqual(code, 0, text)
        self.assertIn("SCOPED_DUMP", codes(text, "WARN"))
        self.assertNotIn("MISSING_TEXT_COMP", codes(text))
        self.assertIn("01 (skipped by --comps)", line_for(text, "UNVERIFIED"))

    def test_arrangement_checks_only_render_concerns(self):
        d = Dump()
        ps = d.folder("PROJECT_SHOTS")
        pt = d.folder("PROJECT_TARGETS")
        tc = d.comp("01-0-text", pt, layers=[{"name": "textBlock", "type": "text",
                                              "props": [{"path": "Opacity", "x": "x", "xErr": "Error: bad"}]}])
        s = d.comp("01-0", ps, layers=[precomp("01-text", tc)])
        d.comp("mainComp", layers=[precomp("01-0", s)])
        d.items.append({"id": 500, "name": "a.mov", "type": "footage", "folder": None, "missing": True})
        text, code = run(d.data())
        self.assertEqual(code, 1, text)
        self.assertTrue(text.startswith("validate: ARRANGEMENT"), text)
        self.assertEqual(codes(text, "BLOCK"), ["EXPR_ERROR"], text)
        self.assertIn("MISSING_FOOTAGE", codes(text, "WARN"))
        self.assertNotIn("NO_SHOTS_FOLDER", codes(text))
        self.assertNotIn("NO_MAIN_CONTROL", codes(text))

    def test_arrangement_without_main_comp(self):
        d = Dump()
        d.folder("PROJECT_SHOTS")
        text, code = run(d.data())
        self.assertEqual(code, 0, text)
        self.assertIn("NO_MAIN_COMP", codes(text, "WARN"))



# ================================================================== review round 1 regressions
def stub_item(data, name, type_=None):
    """Replace an item by the stub extract.jsx:245 writes: {id, name, error} - no folder, no type."""
    it = item(data, name, type_)
    i = data["items"].index(it)
    data["items"][i] = {"id": it["id"], "name": it["name"], "error": "Unable to read markers"}
    return data


def is_contract_line(line):
    return line.startswith(("validate: ", "summary: ")) or line.split(" ", 1)[0] in ("BLOCK", "WARN", "INFO")


def summary_counts(text):
    import re
    m = re.match(r"summary: (\d+) BLOCK, (\d+) WARN, (\d+) INFO", text.splitlines()[-1])
    return tuple(int(x) for x in m.groups())


class TestScopedReachability(unittest.TestCase):
    """Issue 1: a scoped/stubbed dump cannot prove a comp unused, so its errors must BLOCK."""

    def test_steel_scoped_to_text_comps_blocks_on_text_error(self):
        data = load_fixture("steel.json.gz")
        data["meta"]["comps"] = "-text$"
        for it in data["items"]:
            if it.get("type") == "comp" and not it["name"].endswith("-text"):
                it["layers"], it["skipped"] = [], True
        tb = layer(item(data, "05-text"), "textBlock")
        tb["props"].append({"path": "Transform/Opacity", "x": "thisComp.layer('gone')", "xErr": "Error: gone"})
        text, code = run(data)
        self.assertEqual(code, 1, text)
        self.assertIn("05-text(1)", line_for(text, "EXPR_ERROR"))
        self.assertNotIn("EXPR_ERROR_UNUSED", codes(text))
        self.assertIn("INCOMPLETE", text.splitlines()[-1])

    def test_synthetic_skipped_shot_text_error_blocks(self):
        data = template().data()
        shot = item(data, "01")
        shot["layers"], shot["skipped"] = [], True
        layer(item(data, "01-text"), "textBlock")["props"].append({"path": "Opacity", "x": "x", "xErr": "Error: e"})
        text, code = run(data)
        self.assertEqual(code, 1, text)
        self.assertIn("EXPR_ERROR", codes(text, "BLOCK"))

    def test_layer_stub_makes_graph_incomplete(self):
        d = template()
        d.comp("scratch", layers=[{"name": "x", "type": "null",
                                   "props": [{"path": "Opacity", "x": "boom", "xErr": "Error: boom"}]}])
        data = d.data()
        item(data, "02")["layers"].append({"index": 99, "name": "lost", "error": "cannot read"})
        text, code = run(data)
        self.assertEqual(code, 1, text)   # "lost" might source scratch: not provably unused
        self.assertIn("scratch(1)", line_for(text, "EXPR_ERROR"))

    def test_footage_stub_keeps_graph_complete(self):
        d = template()
        d.comp("scratch", layers=[{"name": "x", "type": "null",
                                   "props": [{"path": "Opacity", "x": "boom", "xErr": "Error: boom"}]}])
        d.items.append({"id": 700, "name": "clip.mov", "error": "x"})
        Dump.add_layer(next(i for i in d.items if i["name"] == "01"),
                       {"name": "clip", "type": "footage", "source": {"id": 700, "name": "clip.mov"}})
        text, code = run(d.data())
        self.assertEqual(code, 0, text)
        self.assertIn("scratch(1)", line_for(text, "EXPR_ERROR_UNUSED"))

    def test_complete_dump_still_warns_outside_graph(self):
        d = template()
        d.comp("scratch", layers=[{"name": "x", "type": "null",
                                   "props": [{"path": "Opacity", "x": "boom", "xErr": "Error: boom"}]}])
        text, code = run(d.data())
        self.assertEqual(code, 0, text)
        self.assertIn("scratch(1)", line_for(text, "EXPR_ERROR_UNUSED"))


class TestItemStubs(unittest.TestCase):
    """Issue 2: real item stubs have no folder key, so ORIGINAL_SHOTS never lists them as children."""

    def test_steel_shot_stub_makes_the_hand_partial(self):
        data = stub_item(load_fixture("steel.json.gz"), "05", "comp")
        text, code = run(data)
        self.assertEqual(code, 0, text)
        self.assertIn("5 shot(s) in ORIGINAL_SHOTS (+1 unextracted item(s) that may be shots)", text.splitlines()[0])
        self.assertIn("05 (item failed to extract; may be a shot)", line_for(text, "UNVERIFIED"))
        self.assertIn("hand partial, 1 shot(s) unverified (05)", line_for(text, "SHOT_HAND"))
        self.assertNotIn("REPETITION", codes(text))
        self.assertTrue(line_for(text, "CAPACITY").startswith("INFO CAPACITY partial chars ladder"))

    def test_only_shot_stubbed_is_not_no_shots(self):
        data = stub_item(template(hand=(("01", "text"),)).data(), "01", "comp")
        text, code = run(data)
        self.assertEqual(code, 0, text)
        self.assertNotIn("NO_SHOTS", codes(text))
        self.assertIn("01 (item failed to extract; may be a shot)", line_for(text, "UNVERIFIED"))

    def test_shots_folder_stub_still_reads_children(self):
        data = stub_item(template().data(), "ORIGINAL_SHOTS", "folder")
        text, code = run(data)
        self.assertEqual(code, 0, text)
        self.assertNotIn("NO_SHOTS_FOLDER", codes(text))
        self.assertIn("5 shot(s) in ORIGINAL_SHOTS", text.splitlines()[0])
        self.assertIn("ORIGINAL_SHOTS (item failed to extract", line_for(text, "UNVERIFIED"))

    def test_footage_and_slot_stubs_are_not_shots(self):
        d = template()
        d.items.append({"id": 700, "name": "clip.mov", "error": "x"})
        Dump.add_layer(next(i for i in d.items if i["name"] == "01"),
                       {"name": "clip", "type": "footage", "source": {"id": 700, "name": "clip.mov"}})
        data = stub_item(d.data(), "02-frame")
        text, _ = run(data)
        self.assertNotIn("may be a shot", text)
        self.assertIn("5 shot(s) in ORIGINAL_SHOTS, mainComp", text.splitlines()[0])


class TestIgnoredShots(unittest.TestCase):
    """Issue 3: isIgnoredShot only silences issues; a POSTER with a -text comp is still in shot_list."""

    def poster(self, with_text=True):
        d = template()
        sf = next(f for f in d.items if f["name"] == "ORIGINAL_SHOTS")
        pf = next(f for f in d.items if f["name"] == "PRECOMPS")
        layers = [{"name": "BG", "type": "shape", "props": [{"path": "Opacity", "x": "x", "xErr": "Error: poster"}]}]
        if with_text:
            tc = d.comp("POSTER-text", pf, layers=[
                {"name": "textBlock", "type": "text",
                 "props": [{"path": "Text/Source Text", "mn": TEXT_MN, "v": doc("A POSTER SAMPLE THAT IS 37 CHARS LONG")}]}])
            layers.insert(0, precomp("POSTER-text", tc))
        d.comp("POSTER", sf, layers=layers, w=1000, h=1000)
        return d.data()

    def test_poster_with_text_comp_is_castable(self):
        text, code = run(self.poster())
        self.assertEqual(code, 1, text)
        self.assertIn("[POSTER]", line_for(text, "IGNORED_SHOT_CASTABLE"))
        self.assertIn("POSTER(1)", line_for(text, "EXPR_ERROR"))       # rendered when cast: BLOCK
        self.assertNotIn("EXPR_ERROR_UNUSED", codes(text))
        self.assertIn("POSTER:37c", line_for(text, "SHOT_HAND"))
        self.assertIn("37", line_for(text, "CAPACITY"))
        self.assertIn("SHOT_SIZE", codes(text, "WARN"))                  # full checks run
        self.assertNotIn("IGNORED_SHOTS", codes(text))

    def test_poster_without_text_comp_is_not_listed(self):
        text, code = run(self.poster(with_text=False))
        self.assertEqual(code, 0, text)
        self.assertIn("[POSTER]", line_for(text, "IGNORED_SHOTS"))
        self.assertIn("POSTER(1)", line_for(text, "EXPR_ERROR_UNUSED"))
        for c in ("MISSING_TEXT_COMP", "SHOT_SIZE", "NO_CONTROLLER", "IGNORED_SHOT_CASTABLE"):
            self.assertNotIn(c, codes(text))
        self.assertNotIn("POSTER", line_for(text, "SHOT_HAND"))
        self.assertIn("5 shot(s) in ORIGINAL_SHOTS", text.splitlines()[0])

    def test_non_comp_ignored_item_is_silent(self):
        d = template()
        sf = next(f for f in d.items if f["name"] == "ORIGINAL_SHOTS")
        d.solid("BANNER", sf)
        text, code = run(d.data())
        self.assertEqual(code, 0, text)
        self.assertNotIn("INVALID_SHOT_STRUCTURE", codes(text))
        self.assertNotIn("BANNER", text)


class TestSanitizing(unittest.TestCase):
    """Issue 4: names with newlines must not forge finding lines."""

    def test_newline_in_shot_name_and_footage_path(self):
        d = template()
        sf = next(f for f in d.items if f["name"] == "ORIGINAL_SHOTS")
        d.comp("évil\nBLOCK FAKE_CODE injected", sf, layers=[controller()])
        d.items.append({"id": 901, "name": "clip\nINFO FAKE2 x", "type": "footage", "folder": None,
                        "file": "/a/b\nc.mov", "missing": True})
        d.comp("sep WARN FAKE3 y", sf, layers=[controller()])
        text, code = run(d.data())
        self.assertEqual(code, 1, text)
        for line in text.splitlines():
            self.assertTrue(is_contract_line(line), line)
        self.assertNotIn("FAKE_CODE", codes(text))
        self.assertNotIn("FAKE2", codes(text))
        b, w, i = summary_counts(text)
        self.assertEqual(b, len(codes(text, "BLOCK")))
        self.assertEqual(w, len(codes(text, "WARN")))
        self.assertEqual(i, len(codes(text, "INFO")))
        self.assertIn("évil\\x0aBLOCK FAKE_CODE injected", text)   # non-ASCII kept, control escaped
        self.assertIn("/a/b\\x0ac.mov", text)
        self.assertIn("sep\\u2028WARN", text)


class TestArrangementDetection(unittest.TestCase):
    """Issue 5: an empty PROJECT_SHOTS next to ORIGINAL_SHOTS is a template, not an arrangement."""

    def test_empty_project_shots_in_template(self):
        d = template()
        d.folder("PROJECT_SHOTS")
        data = d.data()
        shot = item(data, "01")
        shot["layers"] = [L for L in shot["layers"] if L["name"] != "01-text"]
        text, code = run(data)
        self.assertEqual(code, 1, text)
        self.assertTrue(text.startswith("validate: style template"), text)
        self.assertIn("MISSING_TEXT_COMP", codes(text, "BLOCK"))
        self.assertIn("STRAY_PROJECT_FOLDER", codes(text, "WARN"))

    def test_project_shots_with_comps_is_an_arrangement(self):
        d = template()
        ps = d.folder("PROJECT_SHOTS")
        d.comp("01-0", ps)
        text, _ = run(d.data())
        self.assertTrue(text.startswith("validate: ARRANGEMENT"), text)
        self.assertIn("ORIGINAL_SHOTS still present", text.splitlines()[0])


class TestMainControlOrder(unittest.TestCase):
    """Issue 6: the consumers read mainControl by name, so order alone is a WARN."""

    def test_order_is_info(self):
        data = template(mc_order=("1", "2", "3", "FORM", "FLOW", "PRESSURE")).data()
        text, code = run(data)
        self.assertEqual(code, 0, text)
        ln = line_for(text, "MAINCONTROL_ORDER")
        self.assertTrue(ln.startswith("INFO "), ln)
        self.assertIn("[1, 2, 3, FORM, FLOW, PRESSURE]", ln)
        self.assertIn("style_builder.jsx:112-121", ln)
        self.assertIn("1=#ff0000", line_for(text, "PALETTE"))   # still read by name


class TestHandPools(unittest.TestCase):
    """Issue 7: text pool = frameless shots incl. empty ones, else every shot (edit_utils.py:208-210)."""

    def test_empty_frameless_shot_takes_text(self):
        text, _ = run(template(hand=(("02", "media"), ("03", "both"), ("07", "empty"))).data())
        gap = [l for l in text.splitlines() if " HAND_GAP " in l]
        self.assertEqual(len(gap), 1, text)
        self.assertIn("text sections land on empty frameless shot(s) 07", gap[0])
        self.assertNotIn("fall back to every shot", text)
        self.assertIn("reuse 1 shot(s) (07(empty))", line_for(text, "REPETITION"))
        self.assertIn("text sections none (uncapped), media sections [14]", line_for(text, "CAPACITY"))

    def test_neo_brutal_shape(self):
        # /Users/ale/style-dev/neo_brutal/manifest.json: 01 5c, 02 15c+frame, 03 None/None, 04 None+frame
        text, _ = run(template(hand=(("01", "text"), ("02", "both"), ("03", "empty"), ("04", "media"))).data())
        self.assertIn("reuse 2 shot(s) (01, 03(empty))", line_for(text, "REPETITION"))
        self.assertNotIn("HAND_GAP", codes(text))
        self.assertIn("no-text-no-frame 03", line_for(text, "SHOT_HAND"))


class TestPartialHand(unittest.TestCase):
    """Issue 8: hand-derived findings are not stated over a partial hand."""

    def test_skipped_text_only_shot(self):
        data = template().data()          # text-only 01, 04, 05
        shot = item(data, "05")
        shot["layers"], shot["skipped"] = [], True
        text, _ = run(data)
        self.assertIn("hand partial, 1 shot(s) unverified (05)", line_for(text, "SHOT_HAND"))
        self.assertNotIn("REPETITION", codes(text))
        self.assertNotIn("HAND_GAP", codes(text))
        self.assertTrue(line_for(text, "CAPACITY").startswith("INFO CAPACITY partial chars ladder"))

    def test_text_comp_layer_stub(self):
        data = template(hand=(("01", "text"), ("02", "media"))).data()
        item(data, "01-text")["layers"] = [{"index": 1, "name": "textBlock", "error": "y"}]
        text, _ = run(data)
        self.assertIn("unverified (01)", line_for(text, "SHOT_HAND"))
        self.assertNotIn("HAND_GAP", codes(text))


class TestAeMdCites(unittest.TestCase):
    """Issue 9: every ae.md:N cite in validate.py must point at its rule."""
    AE_MD_PATH = os.path.join(os.path.dirname(os.path.dirname(HERE)), "create-style", "ae.md")

    @unittest.skipUnless(os.path.exists(AE_MD_PATH), "skills/create-style/ae.md not present")
    def test_cites_match_ae_md(self):
        import re
        from aectx import validate as V
        with open(V.__file__, encoding="utf-8") as f:
            src = f.read()
        self.assertFalse(re.findall(r"ae\.md:\d", src), "cite ae.md by phrase via _cite(), not by line number")
        used = set(re.findall(r'_cite\("(\w+)"\)', src))
        self.assertTrue(used)
        for k in used:
            self.assertIn(k, V.AE_MD, f"_cite({k!r}) has no AE_MD phrase")
        with open(self.AE_MD_PATH, encoding="utf-8") as f:
            text = " ".join(f.read().split())
        for key, phrase in V.AE_MD.items():
            self.assertIn(phrase, text, f"ae.md no longer contains {phrase!r} (cite {key})")


class TestGrouping(unittest.TestCase):
    """Issue 10: identical per-shot findings merge into one line."""

    def test_same_finding_on_every_shot_is_one_line(self):
        data = template().data()
        for it in data["items"]:
            if it.get("type") == "comp" and it["name"] in ("01", "02", "03", "04", "05"):
                it["layers"] = [L for L in it["layers"] if L["name"] != "controller"]
                it["fps"] = 25
        text, _ = run(data)
        self.assertEqual(codes(text).count("NO_CONTROLLER"), 1, text)
        self.assertIn("[01, 02, 03, 04, 05]", line_for(text, "NO_CONTROLLER"))
        self.assertEqual(codes(text).count("SHOT_FPS"), 1, text)
        self.assertEqual(summary_counts(text)[1], len(codes(text, "WARN")))

    def test_steel_stress_stays_small(self):
        data = load_fixture("steel.json.gz")
        for it in data["items"]:
            if it.get("type") != "comp":
                continue
            if it.get("folder") == 13:           # ORIGINAL_SHOTS
                it["fps"], it["width"] = 25, 1000
                for L in it["layers"]:
                    if L["name"] == "controller":
                        for p in L["props"]:
                            if p["path"] in ("Effects/enter/Slider", "Effects/exit/Slider") and p.get("k"):
                                p["k"] = p["k"] + [[99, 100]]
            if it["name"].endswith("-text"):
                for L in it["layers"]:
                    for p in L.get("props", []):
                        if isinstance(p.get("v"), dict) and "box" in p["v"]:
                            p["v"]["box"] = [800, 200]
        text, _ = run(data)
        for c in ("SHOT_FPS", "SHOT_SIZE", "BOX_TEXT", "CONTROLLER_KEYS"):
            self.assertEqual(codes(text).count(c), 1, text)
        self.assertLess(len(text), 2600, text)


class TestSampleTime(unittest.TestCase):
    """Issue 11: no star for an expression alone; star only when the comp playhead differs from meta.at."""

    def test_expression_alone_has_no_star(self):
        data = template().data()
        layer(item(data, "01-text"), "textBlock")["props"][0]["x"] = "value.toUpperCase()"
        self.assertNotIn("*", line_for(run(data)[0], "SHOT_HAND"))

    def test_playhead_differs(self):
        data = template().data()
        tc = item(data, "01-text")
        layer(tc, "textBlock")["props"][0]["x"] = "value.toUpperCase()"
        tc["time"] = 2.5
        hand = line_for(run(data)[0], "SHOT_HAND")
        self.assertIn("01:14c*", hand)
        self.assertIn("sample read at t=0s", hand)


class TestNestedCompRefs(unittest.TestCase):
    """Issue 12: handleShot deep-duplicates precomps nested in a shot (not the slots)."""

    def test_comp_ref_to_nested_precomp(self):
        d = template()
        pf = next(f for f in d.items if f["name"] == "PRECOMPS")
        inner = d.comp("grain", pf)
        tex = d.comp("texture", pf, layers=[precomp("grain", inner)])
        Dump.add_layer(next(i for i in d.items if i["name"] == "01"), precomp("texture", tex))
        data = d.data()
        layer(item(data, "02"), "BG")["props"].append({"path": "Opacity", "v": 1, "x": 'comp("grain").duration'})
        ln = line_for(self.run_warn(data), "COMP_REF_FRAGILE")
        self.assertIn('comp("grain")', ln)
        self.assertIn("deep-duplicates", ln)

    def test_comp_ref_into_text_slot_subtree_is_fine(self):
        d = template()
        pf = next(f for f in d.items if f["name"] == "PRECOMPS")
        glyphs = d.comp("glyphs", pf)
        Dump.add_layer(next(i for i in d.items if i["name"] == "01-text"), precomp("glyphs", glyphs))
        data = d.data()
        layer(item(data, "02"), "BG")["props"].append({"path": "Opacity", "v": 1, "x": 'comp("glyphs").duration'})
        text, _ = run(data)
        self.assertNotIn("COMP_REF_FRAGILE", codes(text))

    def run_warn(self, data):
        text, code = run(data)
        self.assertEqual(code, 0, text)
        return text


class TestTypeConfusion(unittest.TestCase):
    """Issue 13: hand-edited / type-confused dumps report findings, never raise."""

    def test_specific_crashers(self):
        cases = []
        d = template().data(); d["items"][0]["id"] = {"x": 1}; cases.append(d)
        d = template().data(); item(d, "01")["name"] = ["01"]; cases.append(d)
        d = template().data(); layer(item(d, "01"), "01-text")["source"]["id"] = [1]; cases.append(d)
        d = template().data(); layer(item(d, "01"), "controller")["props"][0]["k"] = True; cases.append(d)
        d = template().data(); layer(item(d, "01-text"), "textBlock")["props"][0]["v"]["font"] = ["Inter"]; cases.append(d)
        d = template().data(); d["meta"]["warnings"] = 5; d["meta"]["errors"] = {"a": 1}; cases.append(d)
        d = template().data(); item(d, "01")["folder"] = [3]; cases.append(d)
        d = template().data(); item(d, "01-text")["time"] = True; d["meta"]["at"] = "x"; cases.append(d)
        for data in cases:
            text, code = run(data)
            self.assertIn(code, (0, 1))
            for line in text.splitlines():
                self.assertTrue(is_contract_line(line), line)

    def test_fuzz(self):
        import random
        rnd = random.Random(20261006)
        pool = [None, True, False, 0, -1, 2.5, float("nan"), "", "x", "01", "mainComp", "a\nb", [], [1, 2], [None],
                [[1]], {}, {"id": [1]}, {"text": 5}]
        base = template(hand=(("01", "text"), ("02", "media"), ("03", "both"))).data()
        base["items"].append({"id": 77, "name": "s", "error": "e"})

        def slots(o, out):
            if isinstance(o, dict):
                for k in list(o):
                    out.append((o, k))
                    slots(o[k], out)
            elif isinstance(o, list):
                for i in range(len(o)):
                    out.append((o, i))
                    slots(o[i], out)
            return out

        for n in range(1500):
            data = copy.deepcopy(base)
            for _ in range(rnd.randint(1, 3)):
                spots = slots(data, [])
                o, k = rnd.choice(spots)
                if isinstance(o, dict) and rnd.random() < 0.2:
                    del o[k]
                else:
                    o[k] = copy.deepcopy(rnd.choice(pool))
            try:
                text, code = run(data)
            except Exception as e:   # pragma: no cover - the failure message is the point
                self.fail(f"iteration {n}: {type(e).__name__}: {e}")
            self.assertIn(code, (0, 1))
            for line in text.splitlines():
                self.assertTrue(is_contract_line(line), f"iteration {n}: {line!r}")


if __name__ == "__main__":
    unittest.main()
