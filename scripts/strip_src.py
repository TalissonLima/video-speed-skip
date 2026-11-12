#!/usr/bin/env python3
"""Remove every comment from the extension source (src/) and from the tests (tests/), in place."""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "scripts"))
from strip_comments import strip_css, strip_html, strip_html_page, strip_js, strip_py, strip_py_js_strings


def clean(path, code):
    if path.is_relative_to(root / "src"):
        fn = {".js": strip_js, ".css": strip_css, ".html": strip_html}.get(path.suffix)
        return fn(code) if fn else code
    if path.suffix == ".py":
        code = strip_py(code)
        return code if path.name == "test_strip_comments.py" else strip_py_js_strings(code)
    if path.suffix == ".html":
        return strip_html_page(code)
    return code


for folder in ("src", "tests"):
    for f in sorted((root / folder).rglob("*")):
        if f.is_file():
            before = f.read_text() if f.suffix in (".js", ".css", ".html", ".py") else None
            if before is None:
                continue
            after = clean(f, before)
            if after != before:
                f.write_text(after)
                print("cleaned", f.relative_to(root))
