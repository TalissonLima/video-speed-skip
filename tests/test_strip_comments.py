"""Unit tests for scripts/strip_comments.py (it generates the code that ships to the stores).

Run:  python3 -m unittest discover -s tests -p "test_*.py" -v
"""
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from strip_comments import strip_css, strip_html, strip_js  # noqa: E402


class StripJs(unittest.TestCase):
    def test_line_comment_removed_and_gap_trimmed(self):
        self.assertEqual(strip_js("let a = 1;   // note\nlet b = 2;\n"), "let a = 1;\nlet b = 2;\n")

    def test_comment_only_lines_are_dropped_entirely(self):
        self.assertEqual(strip_js("a();\n  // just a comment\nb();\n"), "a();\nb();\n")

    def test_multiline_block_comment_is_dropped(self):
        self.assertEqual(strip_js("a();\n/*\n * long\n * comment\n */\nb();\n"), "a();\nb();\n")

    def test_inline_block_comment(self):
        self.assertEqual(strip_js("call(a, /* why */ b);\n"), "call(a,  b);\n")

    def test_slashes_inside_strings_survive(self):
        src = 'const u = "https://example.com/a//b"; // real comment\nconst v = \'//x\';\n'
        self.assertEqual(strip_js(src), 'const u = "https://example.com/a//b";\nconst v = \'//x\';\n')

    def test_comment_markers_inside_strings_survive(self):
        src = 'const s = "/* not a comment */";\n'
        self.assertEqual(strip_js(src), src)

    def test_escaped_quote_does_not_end_the_string(self):
        src = 'const s = "a \\" // still string"; // gone\n'
        self.assertEqual(strip_js(src), 'const s = "a \\" // still string";\n')

    def test_regex_literals_are_left_alone(self):
        for src in [
            r'const r = /[»›>▶⏭]/g; // c' + "\n",
            r'const r = /^(Control|Shift)(Left|Right)$/; // c' + "\n",
            r'const r = /\/\//; // c' + "\n",
            r'const r = /[/]x/; // c' + "\n",
            r'x.replace(/\s+/g, " ").trim(); // c' + "\n",
        ]:
            out = strip_js(src)
            self.assertNotIn("// c", out, src)
            self.assertEqual(out, src.replace(" // c", ""), src)

    def test_division_is_not_a_regex(self):
        self.assertEqual(strip_js("const a = b / c / d; // note\n"), "const a = b / c / d;\n")
        self.assertEqual(strip_js("const a = (b + 1) / 2; // note\n"), "const a = (b + 1) / 2;\n")

    def test_regex_after_return_keyword(self):
        self.assertEqual(strip_js("return /a\\/b/.test(x); // c\n"), "return /a\\/b/.test(x);\n")

    def test_template_literal_text_is_preserved(self):
        src = "const t = `a // not a comment\n  /* nor this */ ${x}`;\n"
        self.assertEqual(strip_js(src), src)

    def test_comment_inside_template_expression_is_removed(self):
        self.assertEqual(strip_js("const t = `a ${x /* c */} b`;\n"), "const t = `a ${x } b`;\n")

    def test_nested_template_in_expression(self):
        src = "const t = `a ${ `b ${c}` } // text`;\n"
        self.assertEqual(strip_js(src), src)

    def test_idempotent_on_the_real_sources(self):
        for f in (ROOT / "src").rglob("*.js"):
            once = strip_js(f.read_text())
            self.assertEqual(strip_js(once), once, f.name)
            self.assertLessEqual(len(once), len(f.read_text()), f.name)

    def test_real_sources_keep_all_code_lines(self):
        """Stripping may only remove comments: every non-comment line of the source must survive."""
        for f in (ROOT / "src").rglob("*.js"):
            def norm(s):  # ignore comments and whitespace differences
                s = re.sub(r"/\*.*?\*/", "", s)
                s = re.sub(r"\s+//\s.*$", "", s)
                return re.sub(r"\s+", " ", s).strip()

            src = f.read_text()
            out = [norm(ln) for ln in strip_js(src).splitlines()]
            code = [norm(ln) for ln in src.splitlines()
                    if ln.strip() and not ln.strip().startswith(("//", "/*", "*"))]
            # every code line of the source must appear, in order, in the stripped output
            pos = 0
            for ln in code:
                if not ln:
                    continue
                while pos < len(out) and out[pos] != ln:
                    pos += 1
                self.assertLess(pos, len(out), f"{f.name}: lost line: {ln!r}")
                pos += 1


class SourceHasNoComments(unittest.TestCase):
    """The extension source is kept free of comments (the project is developed with AI agents, which add them by habit)."""

    def test_src_has_no_comments(self):
        strippers = {".js": strip_js, ".css": strip_css, ".html": strip_html}
        offenders = [str(f.relative_to(ROOT)) for f in sorted((ROOT / "src").rglob("*"))
                     if f.suffix in strippers and strippers[f.suffix](f.read_text()) != f.read_text()]
        self.assertEqual(offenders, [], "comments found; run: python3 scripts/strip_src.py")


class StripCssHtml(unittest.TestCase):
    def test_css(self):
        self.assertEqual(strip_css("/* head */\na { color: red; } /* x */\n/* tail */\n"), "a { color: red; }\n")

    def test_html(self):
        self.assertEqual(strip_html("<!-- c -->\n<p>x</p> <!-- y -->\n"), "<p>x</p>\n")


if __name__ == "__main__":
    unittest.main()
