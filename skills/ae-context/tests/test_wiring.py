"""Tests for aectx.wiring (offline; synthetic dumps + the two real fixtures).

Run: cd skills/ae-context && python3 -m unittest tests.test_wiring -v
"""
import gzip
import json
import types
import unittest
from pathlib import Path

from aectx import wiring as W
from aectx.wiring import Expr, tokenize, wiring

FIX = Path(__file__).resolve().parent / "fixtures"

MC = 'var MC = comp("mainComp").layer("mainControl");\n'
PRE = (MC +
       'var FORM = MC.effect("FORM")("Slider").value/100;\n'
       'var FLOW = MC.effect("FLOW")("Slider").value/100;\n'
       'var PRES = MC.effect("PRESSURE")("Slider").value/100;\n'
       'var CT = thisComp.layer("controller");\n'
       'var EN = CT.effect("enter")("Slider"), EX = CT.effect("exit")("Slider");\n'
       'var en = EN.value/100, ex = EX.value/100;\n'
       'function tAt(f) { return EN.numKeys > 1 ? EN.key(1).time + f : f; }\n'
       'function cl(p) { return Math.max(0, Math.min(1, p)); }\n'
       'function eo(p) { p = cl(p); return 1 - Math.pow(2, -10*p); }\n')


def used(src, **kw):
    return Expr(src, **kw).used


# ------------------------------------------------------------------ synthetic dump builders
def prop(path, v=0, x=None, mn=None, **kw):
    p = {"path": path, "mn": mn or ("ADBE " + path.replace("/", " ")), "v": v}
    if x is not None:
        p["x"] = x
    p.update(kw)
    return p


def layer(index, name, props=(), ltype="shape", **kw):
    L = {"index": index, "id": 1000 + index, "name": name, "type": ltype, "enabled": True,
         "in": 0, "out": 10, "start": 0, "props": list(props)}
    L.update(kw)
    return L


def comp(cid, name, layers=None, folder=None):
    c = {"id": cid, "name": name, "type": "comp", "folder": folder, "width": 1080, "height": 1920,
         "duration": 10, "fps": 30}
    if layers is not None:
        c["layers"] = layers
        c["numLayers"] = len(layers)
    return c


def folder(fid, name, parent=None):
    return {"id": fid, "name": name, "type": "folder", "folder": parent}


def main_comp(palette=((0.1, 0.1, 0.1), (0.9, 0.9, 0.9), (0.2, 0.3, 1.0))):
    fx = [{"name": n, "mn": "ADBE Slider Control", "on": True} for n in ("FORM", "FLOW", "PRESSURE")]
    fx += [{"name": n, "mn": "ADBE Color Control", "on": True} for n in ("1", "2", "3")]
    props = [prop(f"Effects/{n}/Slider", 50, mn="ADBE Effect Parade/ADBE Slider Control/ADBE Slider Control-0001")
             for n in ("FORM", "FLOW", "PRESSURE")]
    props += [prop(f"Effects/{n}/Color", list(rgb) + [1], mn="ADBE Effect Parade/ADBE Color Control/ADBE Color Control-0001")
              for n, rgb in zip(("1", "2", "3"), palette)]
    return comp(1, "mainComp", [layer(1, "mainControl", props, "null", effects=fx)])


def controller(index=99):
    return layer(index, "controller", [], "null",
                 effects=[{"name": "enter", "mn": "ADBE Slider Control", "on": True},
                          {"name": "exit", "mn": "ADBE Slider Control", "on": True}])


def dump(items):
    return {"schema": "aectx/2", "meta": {"name": "t.aep", "at": 0, "stats": {}}, "fonts": [], "items": items}


def template(shot_layers, precomps=None):
    """shot_layers: {shot name: [layers]} -> template dump with ORIGINAL_SHOTS / PRECOMPS."""
    items = [main_comp(), folder(10, "ORIGINAL_SHOTS"), folder(11, "PRECOMPS")]
    cid = 100
    for name, layers in shot_layers.items():
        items.append(comp(cid, name, layers + [controller()], folder=10))
        cid += 1
    for name, layers in (precomps or {}).items():
        items.append(comp(cid, name, layers, folder=11))
        cid += 1
    return dump(items)


def run(data, **args):
    return wiring(data, types.SimpleNamespace(**args))


# ================================================================== tokenizer
class TestTokenizer(unittest.TestCase):
    def test_strings_comments_regex(self):
        toks = tokenize('a = "x;\\"y"; // c MC.effect("FORM")\n/re"/g.test(s) /* q\n */ b')
        kinds = [(t.kind, t.text) for t in toks]
        self.assertEqual(kinds[:3], [("id", "a"), ("p", "="), ("str", 'x;"y')])
        self.assertIn(("re", '/re"/g'), kinds)
        self.assertNotIn(("str", "FORM"), kinds)
        self.assertTrue(toks[4].nl)                    # regex literal starts a new line
        self.assertEqual(toks[-1].text, "b")
        self.assertTrue(toks[-1].nl)                   # newline inside the block comment

    def test_division_is_not_regex(self):
        toks = tokenize("x = a / b / c; y = (d) / 2; z = 'q'\n/ 2")   # JS: '/' after a string divides
        self.assertFalse(any(t.kind == "re" for t in toks))

    def test_multichar_punct_and_numbers(self):
        toks = tokenize("a !== b >>>= 1.5e3 .5 0x1F")
        self.assertEqual([t.text for t in toks], ["a", "!==", "b", ">>>=", "1.5e3", ".5", "0x1F"])

    def test_unterminated_input(self):
        for src in ('"abc', "/* never closed", "a = /[/", "`tpl", "\\", ""):
            tokenize(src)                              # must not raise


# ================================================================== per-expression analysis
class TestExpr(unittest.TestCase):
    def test_preamble_only_is_unused(self):
        e = Expr(PRE + "100;")
        self.assertEqual(e.used, set())
        self.assertEqual(e.mentioned, {"FORM", "FLOW", "PRESSURE", "enter", "exit"})

    def test_single_alias_use(self):
        self.assertEqual(used(PRE + "1.8 + 1.6*PRES;"), {"PRESSURE"})

    def test_transitive_alias(self):
        self.assertEqual(used(PRE + "var g = cl(linear(FORM, 0.18, 0.38, 0, 1));\n100*g;"), {"FORM"})
        self.assertEqual(used(PRE + "var g = cl(linear(FORM, 0.18, 0.38, 0, 1));\n100;"), set())

    def test_uncalled_function_dropped_called_function_kept(self):
        self.assertEqual(used(PRE + "eo(0.5)*100;"), set())          # eo/cl read nothing
        self.assertEqual(used(PRE + "tAt(0.5);"), {"enter"})          # tAt reads EN
        self.assertEqual(used(PRE + "var q = tAt(0.5);\n7;"), set())  # called only from dead code

    def test_comma_declarations(self):
        src = 'var a = comp("mainComp").layer("mainControl").effect("1")("Color"), ' \
              'b = comp("mainComp").layer("mainControl").effect("2")("Color"); a;'
        self.assertEqual(used(src), {"1"})
        self.assertEqual(used(src.replace("a;", "add(a, mul(sub(b, a), 0.13));")), {"1", "2"})

    def test_direct_read(self):
        self.assertEqual(used('comp("mainComp").layer("mainControl").effect("3")("Color");'), {"3"})
        self.assertEqual(used('thisComp.layer("controller").effect("exit")("Slider").value;'), {"exit"})

    def test_numeric_effect_index(self):
        self.assertEqual(used(MC + 'MC.effect(2)("Slider");'), {"FLOW"})
        self.assertEqual(used(MC + 'MC.effect(5)("Color");'), {"2"})
        self.assertEqual(used(MC + 'MC.effect(9)("Color");'), set())
        e = Expr(MC + 'MC.effect(1)("Slider");', mc_effects=("FLOW", "FORM"))
        self.assertEqual(e.used, {"FLOW"})                           # maps by the real effect order

    def test_asi_without_semicolons(self):
        src = ('var MC = comp("mainComp").layer("mainControl")\n'
               'var F = MC.effect("FORM")("Slider").value\n'
               'var G = MC.effect("FLOW")("Slider").value\n'
               '  + 3\n'
               'F * 2')
        self.assertEqual(used(src), {"FORM"})

    def test_trailing_assignment_is_the_result(self):
        src = PRE + "if (time > 1) { r = FORM*100 } else { r = 0 }"
        self.assertEqual(used(src), {"FORM"})

    def test_parameter_shadowing(self):
        src = MC + 'var a = MC.effect("1")("Color");\nfunction f(a) { return a; }\nf(3);'
        self.assertEqual(used(src), set())

    def test_reads_inside_strings_and_comments_ignored(self):
        src = MC + "// MC.effect(\"FORM\")\nvar s = 'MC.effect(\"FLOW\")'; /* MC.effect(\"3\") */ s;"
        self.assertEqual(Expr(src).mentioned, set())

    def test_other_layers_not_controls(self):
        self.assertEqual(used('thisComp.layer("other").effect("FORM")("Slider");'), set())
        self.assertEqual(used('var L = thisComp.layer("x"); L.effect("enter")("Slider");'), set())
        self.assertEqual(used('effect("FORM")("Slider");'), set())   # own layer is not mainControl

    def test_bare_effect_on_own_layer(self):
        self.assertEqual(used('effect("enter")("Slider")*2;', own_kind="CT"), {"enter"})
        self.assertEqual(used('thisLayer.effect("FORM")("Slider");', own_kind="MC"), {"FORM"})

    def test_alias_of_alias(self):
        src = 'var M = comp("mainComp").layer("mainControl"); var N = M; N.effect("FORM")("Slider");'
        self.assertEqual(used(src), {"FORM"})

    def test_effect_alias(self):
        self.assertEqual(used('var E = thisComp.layer("controller").effect("enter"); E("Slider").value;'),
                         {"enter"})

    def test_loops_and_iife_are_live(self):
        src = PRE + ("var PS = [];\n(function () { for (var k = 1; k <= 3; k++) PS.push(EN.key(k).time); })();\n"
                     "var G = (FORM >= 0.5) ? 2 : 3;\nfor (var q = 0; q < 3; q++) { if (q % G == 0) PS.push(q); }\n"
                     "PS[0];")
        self.assertEqual(used(src), {"enter", "FORM"})

    def test_function_expression_and_object_keys(self):
        src = PRE + "var f = function (x) { return x*FLOW; };\nvar o = {FORM: 1, p: 2};\nf(2) + o.p;"
        self.assertEqual(used(src), {"FLOW"})

    def test_witness(self):
        e = Expr(PRE + "1.8 + 1.6*PRES;")
        self.assertEqual(e.witness("PRESSURE"), "1.8 + 1.6*PRES;")
        self.assertEqual(e.witness("FORM"), "")
        long_line = "var a = 1; " * 20 + "PRES*2;"
        w = Expr(PRE + long_line).witness("PRESSURE")
        self.assertTrue(w.startswith("...") and "PRES*2" in w and len(w) <= W.WITNESS_CHARS + 6)

    def test_malformed_sources_do_not_crash(self):
        for src in ("", "   ", "// only a comment", 'function f( { var x = MC.effect("FORM"',
                    ")))}}]]", "var", "var = 3", "function", "x = ", 'comp("mainComp").layer("mainControl").effect(',
                    "function f() { return 1; ", "if (a) { b = MC.effect"):
            e = Expr(src)
            self.assertIsInstance(e.used, set)


# ================================================================== backward slice (review issue 1)
class TestBackwardSlice(unittest.TestCase):
    def test_dead_top_level_if_and_for(self):
        src = PRE + ('var PS = [];\nif (PS.length == 0) PS.push(EN.numKeys > 1 ? EN.key(1).time : 0);\n'
                     'var G = 0; for (var q = 0; q < 3; q++) { if (PRES > 0.5) G++; }\n100*FORM;')
        self.assertEqual(used(src), {"FORM"})
        self.assertEqual(used(src.replace("100*FORM;", "100*FORM*G;")), {"FORM", "PRESSURE"})
        self.assertEqual(used(src.replace("100*FORM;", "PS[0]*FORM;")), {"FORM", "enter"})

    def test_mutations_make_writers_live(self):
        self.assertEqual(used(PRE + "var A = [];\nA[0] = FORM;\nA[0];"), {"FORM"})
        self.assertEqual(used(PRE + "var A = [], B = [];\nA.push(FLOW);\nB.push(PRES);\nA[0];"), {"FLOW"})
        self.assertEqual(used(PRE + "var o = {};\no.k = PRES;\no.k;"), {"PRESSURE"})
        self.assertEqual(used(PRE + "var c = 0;\nfor (var i = 0; i < 3; i++) { if (PRES > 0.5) c++; }\nc*FORM;"),
                         {"PRESSURE", "FORM"})
        self.assertEqual(used(PRE + "var c = 0;\nif (FLOW > 0.5) ++c;\nc;"), {"FLOW"})

    def test_function_writing_a_global(self):
        src = PRE + "var G = [];\nfunction add(v) { G.push(v); }\nfunction reset() { G = [PRES]; }\nadd(FORM);\nG[0];"
        self.assertEqual(used(src), {"FORM"})                          # reset() is never called
        self.assertEqual(used(src.replace("add(FORM);", "add(FORM); reset();")), {"FORM", "PRESSURE"})
        src = PRE + "var T = 0;\nfunction a() { b(); }\nfunction b() { T = FLOW; }\na();\nT;"
        self.assertEqual(used(src), {"FLOW"})                          # transitively through a -> b

    def test_side_effect_calls_are_live(self):
        self.assertEqual(used(PRE + "posterizeTime(12*FLOW);\nvalue;"), {"FLOW"})
        self.assertEqual(used(PRE + "seedRandom(PRES*10, true);\nrandom(0, 100);"), {"PRESSURE"})

    def test_result_statement_selection(self):
        self.assertEqual(used(PRE + "var r = FORM*2;"), {"FORM"})             # trailing var (ExtendScript value)
        self.assertEqual(used(PRE + "FLOW*2;\nvar z = PRES;"), {"FLOW", "PRESSURE"})   # ... and JS's value
        self.assertEqual(used(PRE + "PRES*2;\nfunction q() { return FORM; }"), {"PRESSURE"})
        self.assertEqual(used(PRE + "FORM;\n;;\n"), {"FORM"})
        self.assertEqual(used(PRE + "x = FLOW*3;"), {"FLOW"})

    def test_statement_splitting(self):
        src = PRE + "var x = 0;\nif (time < 1) { x = 1 }\nelse if (time < 2) { x = FORM }\nelse { x = 2 }\nx;"
        self.assertEqual(used(src), {"FORM"})
        src = PRE + "var x = 0;\ntry { x = PRES }\ncatch (e) { x = 0 }\nfinally { }\nx;"
        self.assertEqual(used(src), {"PRESSURE"})
        src = PRE + "var i = 0;\ndo { i++ }\nwhile (i < FLOW*10);\nvar u = FORM;\ni;"
        self.assertEqual(used(src), {"FLOW"})                           # u is dead: `i;` is the result
        src = PRE + "var s = 0\nswitch (Math.round(PRES)) { case 1: s = 2; break; default: s = 3 }\ns"
        self.assertEqual(used(src), {"PRESSURE"})
        src = PRE + "var y = 0\nwhile (y < 3)\n  y += FLOW\nFORM"
        self.assertEqual(used(src), {"FORM"})

    def test_scoped_locals_do_not_collide(self):
        src = PRE + "function f() { var b = FORM; return b; }\nfunction g() { var b = 1; return b; }\ng();"
        self.assertEqual(used(src), set())
        # steel's IIFE loop variable k vs a later top-level `var k = 1`
        src = PRE + ("var PS = [];\n(function () { for (var k = 1; k <= 2; k++) PS.push(EN.key(k).time); })();\n"
                     "var k = 1;\nk*FORM;")
        self.assertEqual(used(src), {"FORM"})
        self.assertEqual(used(src.replace("k*FORM;", "PS[0]*FORM;")), {"FORM", "enter"})
        src = PRE + "function h(n) { var r = n*2; return r; }\nvar r = PRES;\nh(3);"
        self.assertEqual(used(src), set())

    def test_local_alias_and_param_shadowing_alias(self):
        src = 'function f() { var M = comp("mainComp").layer("mainControl"); return M.effect("FORM")("Slider"); }\nf();'
        self.assertEqual(used(src), {"FORM"})
        self.assertEqual(used(MC + 'function f(MC) { return MC.effect("FORM"); }\nf(3);'), set())

    def test_witness_prefers_the_result_line(self):
        e = Expr(PRE + "var BK = [];\nfor (var q = 0; q < 2; q++) { BK.push(FORM*q); }\nBK[0]*2;")
        self.assertEqual(e.used, {"FORM"})
        self.assertEqual(e.witness("FORM"), "BK[0]*2;")


class TestTemplateLiterals(unittest.TestCase):
    def test_substitution_tokens(self):
        toks = [(t.kind, t.text) for t in tokenize("`a${PRES}b`")]
        self.assertEqual(toks, [("str", "a"), ("p", "+"), ("p", "("), ("id", "PRES"), ("p", ")"), ("p", "+"),
                                ("str", "b")])

    def test_reads_inside_substitutions(self):
        self.assertEqual(used(PRE + "`${Math.round(PRES*100)}%`;"), {"PRESSURE"})
        self.assertEqual(used(PRE + "`${ {a: 1}.a + `${FORM}` } and } ${'}'}`;"), {"FORM"})
        self.assertEqual(used(PRE + "var s = `x ${FLOW} y`;\n`plain ${'q'}`;"), set())
        self.assertEqual(used('`${comp("mainComp").layer("mainControl").effect("3")("Color")}`;'), {"3"})

    def test_unterminated(self):
        for src in ("`${FORM", "`abc ${", "`${`${", "`\\", "`${a}`${"):
            tokenize(src)
            Expr(PRE + src)


# ================================================================== whole-dump view (synthetic)
class TestWiringSynthetic(unittest.TestCase):
    def test_empty_project(self):
        text, code = run(dump([]))
        self.assertEqual(code, 0)
        self.assertIn("NO mainComp/mainControl", text)
        self.assertIn("no comps in dump", text)
        text, code = run({"schema": "aectx/2"})                  # no items, no meta at all
        self.assertEqual(code, 0)

    def test_error_stubs_and_layerless_comps(self):
        d = template({"01": [layer(1, "a", [prop("Transform/Opacity", 100, x=PRE + "100*FORM;")]),
                             {"index": 2, "name": "broken", "error": "boom"}]})
        d["items"].append({"id": 500, "name": "bad item", "error": "failed"})
        d["items"].append(comp(501, "nolayers"))                 # comp without "layers"
        d["items"].append(comp(502, "skipped", None))
        d["items"][-1]["skipped"] = True
        d["items"].append("not a dict")
        text, code = run(d)
        self.assertEqual(code, 0)
        self.assertIn("INCOMPLETE: 1 item error stubs, 1 layer error stubs, 1 comps skipped", text)
        self.assertRegex(text, r"\n01 +1 +1 +1 +0 +0 ")

    def test_missing_optional_fields(self):
        d = dump([main_comp(), folder(10, "ORIGINAL_SHOTS"),
                  {"id": 100, "type": "comp", "folder": 10, "name": "01",
                   "layers": [{"name": "L", "props": [{"x": PRE + "FORM;"}, {"v": [1, 0, 0, 1]}, {}]},
                              {"props": None}, {}]}])
        text, code = run(d)
        self.assertEqual(code, 0)
        self.assertIn("01 ", text)
        self.assertIn("[?] L / ?", text)                          # the FORM single-use flag, path missing
        self.assertIn("#ff0000", text)                           # hard-coded red with no path/mn

    def test_template_attribution_and_flags(self):
        x_form = PRE + "100*FORM*en*(1-ex);"
        d = template({
            "01": [layer(1, "a", [prop("Transform/Opacity", 100, x=x_form),
                                  prop("Transform/Rotation", 0, x=PRE + "FLOW*PRES*360;"),
                                  prop("Effects/Fill/Color", [0, 0, 0, 1], x='comp("mainComp").layer("mainControl").effect("1")("Color");')])],
            "02": [layer(1, "FINISH grain", [prop("Effects/Noise/Amount of Noise", 2, x=PRE + "1.8 + 1.6*PRES;")]),
                   layer(2, "b", [prop("Transform/Opacity", 100, x=PRE + "FORM*100;"),
                                  prop("Transform/Scale", [100, 100], x=PRE + "[FORM, FORM];")])],
        }, precomps={"01-text": [layer(1, "textBlock", [prop("Text/Source Text", {"text": "x"}, x=PRE + "PRES > 0.5 ? value : value;")])],
                     "02-frame": [layer(1, "ph", [prop("Transform/Opacity", 100, x=PRE + "FORM;")])],
                     "orphan": [layer(1, "z", [prop("Transform/Opacity", 100, x=PRE + "FLOW;")])]})
        text, code = run(d)
        self.assertEqual(code, 0)
        lines = text.splitlines()
        row01 = next(l for l in lines if l.startswith("01 "))
        row02 = next(l for l in lines if l.startswith("02 "))
        # 01: 3 own + 1 from 01-text; FORM 1, FLOW 1, PRES 2, palette 1 once, enter/exit 1
        self.assertEqual(row01.split()[1:], ["4", "4", "1", "1", "2", "1", "0", "0", "1", "1"])
        # 02: 3 own + 1 from 02-frame; FORM 3, FLOW 0, PRES 1
        self.assertEqual(row02.split()[1:], ["4", "4", "3", "0", "1", "0", "0", "0", "0", "0"])
        self.assertIn("(other) = orphan", text)
        self.assertIn("02 PRESSURE: used by 1 prop only - [1] FINISH grain / Effects/Noise/Amount of Noise  "
                      "`1.8 + 1.6*PRES;`", text)
        self.assertIn("02 FLOW: used by 0 props", text)
        self.assertIn("02 no enter/exit usage", text)
        self.assertIn("02 uses no palette color 1/2/3", text)
        self.assertIn("01 FORM: used by 1 prop only", text)
        self.assertIn("01 FLOW: used by 1 prop only - [1] a / Transform/Rotation", text)
        self.assertNotIn("01 PRESSURE", text)
        self.assertNotIn("orphan FLOW", text)
        dead = next(l for l in lines if l.startswith("dead "))
        # dead FORM / FLOW / PRESSURE reads, all comps incl. the unattributed one (orphan)
        self.assertEqual(dead.split()[3:6], ["4", "6", "5"])

    def test_arrangement_attribution_and_order(self):
        x = PRE + "FORM*FLOW*PRES*en*ex;"
        items = [folder(2, "PROJECT_SHOTS"), folder(3, "PROJECT_TARGETS"), folder(4, "ORIGINAL_SHOTS"),
                 main_comp(),
                 comp(10, "01-3", [layer(1, "a", [prop("T/O", 1, x=x)]), controller()], folder=2),
                 comp(11, "05-0", [layer(1, "a", [prop("T/O", 1, x=x)]), controller()], folder=2),
                 comp(12, "01-10", [layer(1, "a", [prop("T/O", 1, x=x)]), controller()], folder=2),
                 comp(13, "01-3-text", [layer(1, "textBlock", [prop("T/O", 1, x=PRE + "FORM;")])], folder=3),
                 comp(14, "01", [layer(1, "a", [prop("T/O", 1, x=x)])], folder=4)]   # template remnant
        text, code = run(dump(items))
        rows = [l.split()[0] for l in text.splitlines() if l[:2] in ("01", "05")]
        self.assertEqual(rows, ["05-0", "01-3", "01-10"])          # sequence (section) order
        row = next(l for l in text.splitlines() if l.startswith("01-3 "))
        self.assertEqual(row.split()[1:4], ["2", "2", "2"])        # 01-3-text folded into 01-3
        self.assertIn("PROJECT_SHOTS instances", text)

    def test_generic_project_fallback(self):
        d = dump([comp(1, "07", [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;")])])])
        text, _ = run(d)
        self.assertIn("comps named NN", text)
        self.assertIn("07 ", text)
        text, _ = run(dump([comp(1, "Comp 1", [])]))
        self.assertIn("no shots found", text)

    def test_disabled_and_erroring_expressions(self):
        d = template({"01": [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;", xOn=False),
                                            prop("T/R", 1, x=PRE + "FLOW;", xErr="boom")])]})
        text, _ = run(d)
        self.assertIn("1 exprs (1 disabled skipped, 1 with errors): 1 mention mainControl -> 1 use it", text)
        self.assertIn("01 FORM: used by 0 props", text)

    def test_hardcoded_colors(self):
        d = template({"01": [
            layer(1, "seams", [prop(f"Contents/Group {i}/Contents/Stroke 1/Color", [0.94, 0.96, 1, 1],
                                    mn="ADBE Root Vectors Group/ADBE Vector Stroke Color") for i in (1, 2, 3)]),
            layer(2, "toner", [prop("Effects/CC Toner/Midtones", [0.56, 0.32, 0.22, 1], mn="X/CC Toner-0002"),
                               prop("Effects/Fill/Color", [0.5, 0.5, 0.51, 1]),                       # neutral
                               prop("Effects/Fill 2/Color", [1, 0, 0, 1], x="[1,0,0,1]"),              # has expr
                               prop("Effects/Fill 3/Color", [0, 1, 0, 1], x="[0,1,0,1]", xOn=False),   # expr off
                               prop("Effects/Fill 4/Color", [0.2, 0.3, 1, 1], k=[[0, [0.2, 0.3, 1, 1]]]),
                               prop("Transform/Position", [0.2, 0.9, 0.1, 0.4]),                      # 4-d, colorish
                               prop("Transform/Anchor", [200, 900, 0, 1])])]})                       # not a color
        d["items"].append(comp(300, "02", [layer(1, "seams", [prop("Contents/Group 1/Contents/Stroke 1/Color",
                                                                   [0.94, 0.96, 1, 1])])], folder=10))
        text, _ = run(d)
        sec = text[text.index("hard-coded colors"):]
        self.assertIn("8 props with no expression", sec.splitlines()[0])
        self.assertIn("  01 / seams / Contents/Group 1-3/Contents/Stroke 1/Color / #f0f5ff x3", sec)
        self.assertIn("  02 / seams / Contents/Group 1/Contents/Stroke 1/Color / #f0f5ff", sec)
        self.assertIn("toner / Effects/CC Toner/Midtones / #8f5238", sec)
        self.assertIn("#00ff00 (expr off)", sec)
        self.assertIn("#334cff (keyed, = palette 3, not linked)", sec)
        self.assertIn("Transform/Position / #33e61a", sec)
        self.assertNotIn("#808082", sec)
        self.assertNotIn("#ff0000", sec)
        self.assertNotIn("Anchor", sec)
        self.assertNotIn("mainControl", sec)                       # the palette source itself is exempt

    def test_shot_prefixed_layers_merge_and_cap(self):
        shots = {f"{i:02d}": [layer(1, f"{i:02d} seams", [prop("Contents/Stroke 1/Color", [0.9, 0.2, 0.1, 1])]),
                              layer(2, "x", [prop(f"Effects/F{j}/Color", [j / 40, i / 20, 0.9, 1]) for j in range(3)])]
                 for i in range(1, 12)}
        text, _ = run(template(shots))
        sec = text[text.index("hard-coded colors"):]
        self.assertIn("  01,02,03,04,05,06,07,08,+3 comps / {shot} seams / Contents/Stroke 1/Color / #e6331a x11", sec)
        self.assertRegex(sec, r"\.\.\. \+\d+ more groups")
        self.assertLessEqual(len(sec.splitlines()), W.COLOR_ROWS_MAX + 2)

    def test_comp_filter(self):
        d = template({"01": [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;"), prop("E/C/Color", [1, 0, 0, 1])])],
                      "02": [layer(1, "b", [prop("T/O", 1, x=PRE + "FLOW;"), prop("E/C/Color", [0, 0, 1, 1])])]},
                     precomps={"02-text": [layer(1, "t", [prop("E/C/Color", [0, 1, 0, 1])])]})
        text, code = run(d, comp="^02")
        self.assertEqual(code, 0)
        self.assertNotIn("\n01 ", text)
        self.assertIn("\n02 ", text)
        self.assertNotIn("#ff0000", text)
        self.assertIn("#0000ff", text)
        self.assertIn("#00ff00", text)                             # 02-text belongs to shot 02
        self.assertNotIn("01 FORM", text)
        text, code = run(d, comp="(")
        self.assertEqual(code, 2)

    def test_control_detail(self):
        d = template({"01": [layer(1, "a", [prop("Transform/Opacity", 1, x=PRE + "PRES;")]),
                             layer(2, "dup", [prop(f"Contents/Group {i}/Opacity", 1, x=PRE + "PRES*2;")
                                              for i in (1, 2)]),
                             layer(3, "dup", [prop(f"Contents/Group {i}/Opacity", 1, x=PRE + "PRES*2;")
                                              for i in (1, 2)]),
                             layer(4, "z", [prop("Transform/Scale", 1, x=PRE + "FORM;")])]})
        text, code = run(d, control="pres")
        self.assertEqual(code, 0)
        self.assertIn("01: 5 prop(s) use PRESSURE; 1 read it but never use it", text)
        self.assertIn("[1] a / Transform/Opacity  `PRES;`", text)
        self.assertIn("[2,3] dup / Contents/Group 1,2/Opacity x4  `PRES*2;`", text)
        self.assertNotIn("FLAGS", text)
        text, code = run(d, control="nope")
        self.assertEqual(code, 2)
        self.assertIn("unknown control", text)

    def test_args_without_fields_and_none(self):
        d = template({"01": [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;")])]})
        a = run(d)[0]
        b = wiring(d, None)[0]
        self.assertEqual(a, b)
        self.assertNotIn("drill down", a)                          # cli has no --control yet
        self.assertIn("drill down", run(d, control=None)[0])

    def test_deterministic(self):
        d = template({"02": [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;")])],
                      "01": [layer(1, "b", [prop("T/O", 1, x=PRE + "FLOW;"), prop("C/Color", [1, 0, 0, 1])])]})
        self.assertEqual(run(d)[0], run(json.loads(json.dumps(d)))[0])
        rows = [l.split()[0] for l in run(d)[0].splitlines() if l[:2] in ("01", "02")]
        self.assertEqual(rows[:2], ["01", "02"])


# ================================================================== review fixes (whole dump)
def arrangement(instances, extra=(), main_extra=()):
    """instances: [(name, layers)] -> PROJECT_SHOTS dump with the instances sequenced in mainComp."""
    items = [folder(2, "PROJECT_SHOTS"), folder(3, "PROJECT_TARGETS"), folder(11, "PRECOMPS")]
    mc = main_comp()
    items.append(mc)
    cid = 100                                       # ids must not collide with the folders above
    for name, layers in instances:
        items.append(comp(cid, name, layers + [controller()], folder=2))
        mc["layers"].append(layer(len(mc["layers"]) + 1, name, [], "precomp", source={"id": cid, "name": name}))
        cid += 1
    mc["layers"].extend(main_extra)
    items.extend(extra)
    return dump(items)


def src_layer(index, name, cid, cname, props=()):
    return layer(index, name, props, "precomp", source={"id": cid, "name": cname})


class TestReviewFixes(unittest.TestCase):
    def test_flags_after_slicing(self):
        dead_lib = PRE + ('var PS = [];\nif (PS.length == 0) PS.push(EN.numKeys > 1 ? EN.key(1).time : 0);\n'
                          'var G = 0; for (var q = 0; q < 3; q++) { if (PRES > 0.5) G++; }\n')
        d = template({"01": [layer(1, "a", [prop("T/O", 1, x=dead_lib + "100*FORM;"),
                                            prop("T/R", 1, x=dead_lib + "FORM*FLOW*ex;")])]})
        text, _ = run(d)
        self.assertIn("01 PRESSURE: used by 0 props", text)
        self.assertIn("01 no enter usage", text)
        self.assertNotIn("PRESSURE: used by 1 prop only", text)
        self.assertRegex(text, r"\n01 +2 +2 +2 +1 +0 +0 +0 +0 +0 +1\n")

    def test_media_arrangement_source_graph(self):
        frame_x = PRE + "linear(PRES, 0, 1, 20, 80);"
        asset_x = PRE + "FLOW*100;"
        tex_x = PRE + "FORM*PRES;"
        extra = [comp(30, "window comp 2", [layer(1, "w", [prop("T/O", 1, x=asset_x)]),
                                            src_layer(2, "tex", 34, "tex 2")], folder=2),
                 comp(31, "window comp 3", [layer(1, "w", [prop("T/O", 1, x=asset_x)]),
                                            src_layer(2, "tex", 35, "tex 3")], folder=2),
                 comp(34, "tex 2", [layer(1, "t", [prop("T/S", 1, x=tex_x)])], folder=11),
                 comp(35, "tex 3", [layer(1, "t", [prop("T/S", 1, x=tex_x)])], folder=11),
                 comp(32, "03-frame 2", [layer(1, "clip", [prop("T/O", 1, x=frame_x)])], folder=11),
                 comp(33, "03-frame 3", [layer(1, "clip", [prop("T/O", 1, x=frame_x)])], folder=11),
                 comp(36, "03-0-text", [layer(1, "textBlock", [prop("T/O", 1, x=PRE + "en*100;")])], folder=3),
                 comp(37, "03-1-text", [layer(1, "textBlock", [prop("T/O", 1, x=PRE + "en*100;")])], folder=3)]
        own = PRE + "FORM*ex;"
        d = arrangement([("03-0", [layer(1, "a", [prop("T/O", 1, x=own)]), src_layer(2, "03-frame", 32, "03-frame 2"),
                                   src_layer(3, "window", 30, "window comp 2"), src_layer(4, "03-text", 36, "03-0-text")]),
                         ("03-1", [layer(1, "a", [prop("T/O", 1, x=own)]), src_layer(2, "03-frame", 33, "03-frame 3"),
                                   src_layer(3, "window", 31, "window comp 3"), src_layer(4, "03-text", 37, "03-1-text")])],
                        extra)
        text, code = run(d)
        self.assertEqual(code, 0)
        rows = [l.split()[0] for l in text.splitlines() if l[:1].isalnum() and not l.startswith(("mainComp", "props"))
                and "exprs" not in l.split()[0]]
        self.assertNotIn("window", " ".join(rows))
        self.assertNotIn("(other)", text)
        for inst in ("03-0", "03-1"):
            row = next(l for l in text.splitlines() if l.startswith(inst + " "))
            # exprs any FORM FLOW PRESSURE 1 2 3 enter exit: own + frame + asset + tex + text = 5
            self.assertEqual(row.split()[1:], ["5", "5", "2", "1", "2", "0", "0", "0", "1", "1"])
        self.assertNotIn("PRESSURE: used by 1 prop only", text)
        self.assertNotIn("\n  window comp", text)                       # never a row of its own

    def test_shared_precomp_counts_in_each_shot(self):
        d = template({"01": [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;")]), src_layer(2, "s", 300, "shared")],
                      "02": [layer(1, "b", [prop("T/O", 1, x=PRE + "FLOW;")]), src_layer(2, "s", 300, "shared")]})
        d["items"].append(comp(300, "shared", [layer(1, "g", [prop("T/O", 1, x=PRE + "PRES;")])], folder=11))
        d["items"].append(comp(301, "asset in shots folder", [layer(1, "g", [prop("T/O", 1, x=PRE + "PRES;")])],
                               folder=10))
        d["items"][3]["layers"].append(src_layer(9, "asset", 301, "asset in shots folder"))   # nested in 01
        text, _ = run(d)
        row01 = next(l for l in text.splitlines() if l.startswith("01 "))
        row02 = next(l for l in text.splitlines() if l.startswith("02 "))
        self.assertEqual(row01.split()[1:6], ["3", "3", "1", "0", "2"])
        self.assertEqual(row02.split()[1:6], ["2", "2", "0", "1", "1"])
        self.assertNotIn("asset in shots folder ", text)

    def test_name_fallback_is_exact(self):
        d = template({"01": [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;")])]},
                     precomps={"01-textures": [layer(1, "t", [prop("T/O", 1, x=PRE + "FLOW;")])],
                               "01-framework": [layer(1, "t", [prop("T/O", 1, x=PRE + "FLOW;")])],
                               "01-text-old": [layer(1, "t", [prop("T/O", 1, x=PRE + "FLOW;")])],
                               "01-frame 2": [layer(1, "t", [prop("T/O", 1, x=PRE + "PRES;")])],
                               "01-text": [layer(1, "t", [prop("T/O", 1, x=PRE + "PRES;")])]})
        text, _ = run(d)
        row01 = next(l for l in text.splitlines() if l.startswith("01 "))
        self.assertEqual(row01.split()[1:6], ["3", "3", "1", "0", "2"])
        self.assertIn("(other) = 01-framework, 01-text-old, 01-textures", text)

    def test_control_characters_are_escaped(self):
        d = template({"01\nINJECTED ROW 9 9 9": [
            layer(1, "lay\ner", [prop("Contents/Gr\noup 1/Color", [1, 0, 0, 1]),
                                 prop("T/O", 1, x=PRE + "FORM*\tFLOW;")]),
            layer(2, "ü名 grain\r\x1b[31m", [prop("T/R", 1, x=PRE + "PRES;")])]},
            precomps={"bad name": [layer(1, "z", [prop("T/O", 1, x=PRE + "FLOW;")])]})
        for args in ({}, {"control": "FORM"}, {"control": "PRESSURE"}):
            text, _ = run(d, **args)
            self.assertNotIn("\x1b", text)
            prefixes = ("[", "mainComp/", "NO ", "INCOMPLETE", "NOTE", "props ", "shot ", "01\\n", "dead ",
                        "(other)", "FLAGS", "  ", "hard-coded", "drill down", "no ")
            for line in text.splitlines():
                self.assertTrue(line.startswith(prefixes) or line[0].isdigit(), repr(line))
            self.assertIn("lay\\ner" if args.get("control") != "PRESSURE" else "grain\\r\\x1b[31m", text)
        text, _ = run(d)
        self.assertIn("01\\nINJECTED ROW 9 9 9 / lay\\ner / Contents/Gr\\noup 1/Color / #ff0000", text)
        self.assertIn("grain\\r\\x1b[31m", text)
        self.assertIn("(other) = bad\\u2028name", text)

    def test_odd_field_types_do_not_crash(self):
        d = template({"01": [layer(1, "a", [{"path": 7, "v": [1, 0, 0, 1], "mn": 9},
                                            {"path": ["x"], "v": [0, 1, 0, 1], "mn": None, "x": PRE + "FORM;"},
                                            {"path": None, "v": [0, 0, 1, 1]}]),
                             {"index": [1], "name": 12, "props": {"not": "a list"}},
                             {"index": 3, "name": "m", "props": "nope", "effects": 5}]})
        d["items"].append({"id": [1], "name": 5, "type": "comp", "folder": [2], "layers": "x"})
        d["items"].append({"id": 900, "name": None, "type": "comp", "folder": 10, "layers": [
            {"name": "L", "source": "not a dict", "props": [{"x": PRE + "FLOW;", "path": 3}]}]})
        for args in ({}, {"control": "FORM"}, {"comp": "0"}):
            text, code = run(d, **args)
            self.assertEqual(code, 0, text)
        self.assertIn("#ff0000", run(d)[0])
        self.assertEqual(run(None)[1], 2)
        self.assertEqual(run([])[1], 2)
        self.assertEqual(run({"items": "nope"})[1], 0)
        self.assertEqual(run({"items": [{"id": 1, "type": "comp", "name": "mainComp",
                                          "layers": [{"name": "mainControl", "effects": "x", "props": 3}]}]})[1], 0)

    def test_detail_groups_identical_instances_and_caps(self):
        x = PRE + "FORM*PRES;"
        inst = [(f"01-{i}", [layer(1, "a", [prop("T/O", 1, x=x)]), src_layer(2, "01-text", 40 + i, f"01-{i}-text")])
                for i in range(1, 4)]
        extra = [comp(40 + i, f"01-{i}-text", [layer(1, "textBlock", [prop("T/O", 1, x=x)])], folder=3)
                 for i in range(1, 4)]
        inst.append(("05-0", [layer(1, "b", [prop("T/O", 1, x=x)])]))
        text, _ = run(arrangement(inst, extra), control="PRESSURE")
        self.assertIn("01-1,01-2,01-3: 2 prop(s) use PRESSURE; 0 read it but never use it", text)
        self.assertIn("  {shot}-text / [1] textBlock / T/O  `FORM*PRES;`", text)
        self.assertIn("05-0: 1 prop(s) use PRESSURE", text)
        self.assertIn("  [1] b / T/O  `FORM*PRES;`", text)
        self.assertEqual(text.count("[1] a / T/O"), 1)
        # char budget: many distinct rows stop near OUTPUT_BUDGET
        big = template({"01": [layer(i, f"layer number {i} with a long name", [prop(f"Effects/E{i}/Amount", 1, x=x)])
                               for i in range(1, 200)]})
        text, _ = run(big, control="FORM")
        self.assertLessEqual(len(text), W.OUTPUT_BUDGET + 200)
        self.assertRegex(text, r"\.\.\. \+\d+ more rows")

    def test_duplicate_shot_names_and_mc_stub(self):
        d = template({"01": [layer(1, "a", [prop("T/O", 1, x=PRE + "FORM;")])]})
        d["items"].append(comp(400, "01", [layer(1, "b", [prop("T/O", 1, x=PRE + "FLOW;")]), controller()], folder=10))
        text, _ = run(d)
        self.assertIn("NOTE: duplicate shot comp names merged into one row: 01 x2", text)
        self.assertRegex(text, r"\n01 +2 +2 +1 +1 ")
        d["items"][0]["layers"] = [{"index": 1, "name": "mainControl", "error": "boom"}]
        text, _ = run(d)
        self.assertIn("mainComp/mainControl failed to extract (error stub)", text)
        self.assertNotIn("NO mainComp/mainControl", text)
        self.assertIn("INCOMPLETE: 1 layer error stubs", text)


# ================================================================== real fixtures
def _load(name):
    p = FIX / f"{name}.json.gz"
    if not p.exists():
        raise unittest.SkipTest(f"missing fixture {p}")
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return json.load(f)


class TestFixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.steel = _load("steel")
        cls.arr = _load("arr746")

    def test_steel(self):
        text, code = run(self.steel)
        self.assertEqual(code, 0)
        self.assertLessEqual(len(text), 4000)
        self.assertIn("836 exprs: 810 mention mainControl -> 799 use it; 553 mention controller -> 450 use it", text)
        rows = [l.split()[0] for l in text.splitlines() if l[:2] in ("01", "02", "03", "04", "05", "06")
                and l[2] == " "]
        self.assertEqual(rows, ["01", "02", "03", "04", "05", "06"])
        row02 = next(l for l in text.splitlines() if l.startswith("02 "))
        self.assertEqual(row02.split()[5], "1")                     # PRESSURE column
        self.assertIn("02 PRESSURE: used by 1 prop only - [1] FINISH grain / Effects/Noise/Amount of Noise", text)
        self.assertIn("1.6*PRES", text)
        self.assertIn("CC Toner", text)
        self.assertIn("hard-coded colors (confirm intent): 74 props", text)
        self.assertTrue(text.isascii())

    def test_arrangement(self):
        text, code = run(self.arr)
        self.assertEqual(code, 0)
        self.assertLessEqual(len(text), 4000)
        rows = [l.split()[0] for l in text.splitlines() if l[:2] in ("01", "05") and "/" not in l]
        self.assertEqual(rows, ["05-0", "01-1", "01-2", "01-3", "05-4", "01-5", "01-6"])
        self.assertIn("FLAGS: none", text)
        self.assertIn("PROJECT_SHOTS instances", text)
        self.assertTrue(text.isascii())

    def test_steel_slice_numbers(self):
        text, _ = run(self.steel)
        row = {l.split()[0]: l.split()[1:] for l in text.splitlines() if l[:2].isdigit() and l[2] == " "}
        cols = ["exprs", "any", "FORM", "FLOW", "PRESSURE", "1", "2", "3", "enter", "exit"]
        r01 = dict(zip(cols, row["01"]))
        self.assertEqual((r01["FORM"], r01["PRESSURE"], r01["enter"], r01["exit"]), ("100", "90", "79", "30"))
        self.assertEqual(row["02"][2:], ["10", "11", "1", "8", "8", "8", "12", "11"])
        mod = __import__("aectx.wiring", fromlist=["Wiring"])
        Wg = mod.Wiring(self.steel)
        seams = {(L["name"], p["path"]): e.used for r, c, L, p, e in Wg.uses if r == "01" and L["name"] == "01 seams"}
        self.assertNotIn(("01 seams", "Transform/Position"), seams)          # result depends on SRC only
        self.assertEqual(seams[("01 seams", "Contents/Group 1/Contents/Path 1/Path")], {"FORM", "PRESSURE"})

    def test_arrangement_slice_numbers(self):
        text, _ = run(self.arr)
        self.assertIn("910 exprs: 903 mention mainControl -> 889 use it; 651 mention controller -> 553 use it", text)

    def test_detail_budget_on_fixtures(self):
        for data in (self.steel, self.arr):
            for ctl in ("FORM", "FLOW", "PRESSURE", "1", "2", "3", "enter", "exit"):
                text, code = run(data, control=ctl)
                self.assertEqual(code, 0)
                self.assertLessEqual(len(text), 4000, ctl)
        text, _ = run(self.arr, control="PRESSURE")
        self.assertIn("01-1,01-2,01-3,01-5,01-6: 90 prop(s) use PRESSURE", text)
        self.assertIn("05-0,05-4: 90 prop(s) use PRESSURE", text)

    def test_detail_mode_on_fixture(self):
        text, code = run(self.steel, control="PRESSURE", comp="^02$")
        self.assertEqual(code, 0)
        self.assertIn("02: 1 prop(s) use PRESSURE", text)
        self.assertIn("FINISH grain", text)


if __name__ == "__main__":
    unittest.main()
