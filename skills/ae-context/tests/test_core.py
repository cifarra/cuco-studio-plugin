"""Offline tests for aectx.core / aectx.cli plumbing (no After Effects needed)."""
import gzip
import io
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

from aectx import cli, core, phrases

FIX = Path(__file__).parent / "fixtures"


class Lint(unittest.TestCase):
    def errs(self, src):
        return [(ln, msg) for ln, sev, msg in core.es3_lint(src) if sev == "error"]

    def test_es6_syntax_blocks(self):
        self.assertTrue(self.errs("let a = 1;"))
        self.assertTrue(self.errs("const b = 2;"))
        self.assertTrue(self.errs("var f = (x) => x;"))
        self.assertTrue(self.errs("var s = `x`;"))
        self.assertTrue(self.errs("for (var x of xs) {}"))
        self.assertTrue(self.errs("class A {}"))
        self.assertTrue(self.errs("f(...args);"))

    def test_nested_ternary_vs_two_ternaries(self):
        self.assertTrue(self.errs("var r = a ? b : c ? d : e;"))
        self.assertFalse(self.errs("var a = x ? 1 : 2, b = y ? 3 : 4;"))
        self.assertFalse(self.errs("var r = a ? b : (c ? d : e);"))

    def test_line_numbers_survive_block_comments(self):
        self.assertEqual(self.errs("/* a\nb\nc */\nvar x = 1;\nlet y = 2;")[0][0], 5)

    def test_strings_comments_regex_are_ignored(self):
        self.assertFalse(self.errs('var s = "let x = 1 => a ? b : c ? d : e";'))
        self.assertFalse(self.errs("// let x = 1\nvar y = 1;"))
        self.assertEqual(self.errs("var t = s.replace(/'/g, '');\nlet z = 1;")[0][0], 2)
        self.assertFalse(self.errs("var t = s.replace(/[\\\\\"]/g, function (c) { return c; });"))

    def test_es5_api_warns_not_blocks(self):
        issues = core.es3_lint("xs.forEach(function(){}); var k = Object.keys(o);")
        self.assertTrue(issues)
        self.assertTrue(all(sev == "warn" for _, sev, _ in issues))


class Loader(unittest.TestCase):
    def test_gz_fixture_and_header_path(self):
        data, info, note = core.load_dump(str(FIX / "steel.json.gz"))
        self.assertEqual(data["schema"], "aectx/2")
        self.assertIn("steel.aep", core.header(info))
        data, info, _ = core.load_dump(str(FIX / "arr746.json.gz"))
        self.assertIn("projects/125/arrangements/746/project.aep", core.header(info))

    def test_bad_inputs_raise_aeerror(self):
        d = Path(tempfile.mkdtemp())
        try:
            (d / "bad.json").write_text("{nope")
            (d / "list.json").write_text("[1,2]")
            with self.assertRaises(core.AeError):
                core.load_dump(str(d / "missing.json"))
            with self.assertRaises(core.AeError):
                core.load_dump(str(d / "bad.json"))
            with self.assertRaises(core.AeError):
                core.load_dump(str(d / "list.json"))
        finally:
            shutil.rmtree(d)

    def test_display_name(self):
        self.assertEqual(core.display_name(None), "untitled")
        self.assertEqual(core.display_name("/a/b/steel.aep"), "steel.aep")
        self.assertEqual(core.display_name("/x/projects/9/arrangements/12/project.aep"),
                         "projects/9/arrangements/12/project.aep")


class Emit(unittest.TestCase):
    def test_spill_unique_files(self):
        old = core.OUTS
        core.OUTS = Path(tempfile.mkdtemp())
        try:
            big = "x" * (core.STDOUT_BUDGET + 10)
            with redirect_stdout(io.StringIO()):
                p1 = core.emit(big, "t")
                p2 = core.emit(big, "t")
            self.assertNotEqual(p1, p2)
            self.assertEqual(Path(p1).read_text(), big)
            with redirect_stdout(io.StringIO()) as buf:
                self.assertIsNone(core.emit("small", "t"))
            self.assertEqual(buf.getvalue().strip(), "small")
        finally:
            shutil.rmtree(core.OUTS)
            core.OUTS = old


class Args(unittest.TestCase):
    def test_times_and_json_args(self):
        self.assertEqual(cli._times("0, 0.5,2"), [0.0, 0.5, 2.0])
        with self.assertRaises(core.AeError):
            cli._times("a,b")
        with self.assertRaises(core.AeError):
            cli._times("")
        self.assertEqual(cli._json_args('{"k": 1}'), {"k": 1})
        with self.assertRaises(core.AeError):
            cli._json_args("[1]")
        with self.assertRaises(core.AeError):
            cli._json_args("{bad")


class Generated(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_boot_and_wrappers_are_valid_js(self):
        d = Path(tempfile.mkdtemp())
        try:
            boot = core.BOOT.format(job=json.dumps("/j"), nonce=json.dumps("n"), lib=json.dumps("/l"),
                                    script=json.dumps("/s"), args=json.dumps({"a": "x\"y"}))
            snippet = core.SNIPPET_HEAD + "var a = 1;\nreturn a;" + core.SNIPPET_TAIL
            run = core.wrap_script("var b = 2;\nAECTX.out(b);")
            for name, src in (("boot.js", boot), ("snip.js", snippet), ("run.js", run)):
                (d / name).write_text(src)
                r = subprocess.run(["node", "--check", str(d / name)], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, f"{name}: {r.stderr}")
        finally:
            shutil.rmtree(d)

    def test_snippet_first_line_is_user_line_one(self):
        src = core.SNIPPET_HEAD + "X\nY" + core.SNIPPET_TAIL
        self.assertTrue(src.splitlines()[0].endswith("X"))
        self.assertTrue(core.wrap_script("X\nY").splitlines()[0].endswith("X"))

    def test_applescript_never_launches(self):
        s = core._applescript("Adobe After Effects 2025", "/tmp/boot.jsx", 30)
        self.assertIn('if application "Adobe After Effects 2025" is running then', s)
        self.assertNotIn("activate", s)


class BuildStatus(unittest.TestCase):
    def setUp(self):
        self.old = core.BUILD_LOG
        self.d = Path(tempfile.mkdtemp())
        core.BUILD_LOG = self.d / "ae-build.log"

    def tearDown(self):
        core.BUILD_LOG = self.old
        shutil.rmtree(self.d)

    def _log(self, text, age):
        core.BUILD_LOG.write_text(text)
        t = os.path.getmtime(core.BUILD_LOG) - age
        os.utime(core.BUILD_LOG, (t, t))

    def test_states(self):
        self._log("12:00:00 handleShot 1/3\r12:00:01 finalize done\r", 5)
        self.assertFalse(core.build_status()["active"])
        self._log("12:00:00 handleShot 1/3\r", 5)
        self.assertTrue(core.build_status()["active"])
        self._log("12:00:00 handleShot 1/3\r", 3600)
        self.assertFalse(core.build_status()["active"])
        self._log("12:00:00 finalize start\r12:00:01 render start\r", 1800)   # long render, no log writes
        self.assertTrue(core.build_status()["active"])


class Phrases(unittest.TestCase):
    def test_arrangement_timeline(self):
        data = json.load(gzip.open(FIX / "arr746.json.gz", "rt"))
        text, code = phrases.phrases(data, SimpleNamespace(comp=None))
        self.assertEqual(code, 0)
        self.assertIn("7 sections", text)
        self.assertIn("== 01-3", text)
        self.assertIn("Tell / your / video", text)

    def test_template_samples(self):
        data = json.load(gzip.open(FIX / "steel.json.gz", "rt"))
        text, _ = phrases.phrases(data, SimpleNamespace(comp="^0[12]$"))
        self.assertIn("01: 20 chars", text)
        self.assertNotIn("03:", text)


if __name__ == "__main__":
    unittest.main()
