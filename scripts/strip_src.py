#!/usr/bin/env python3
"""Remove every comment from src/ in place (the project keeps the extension source comment-free)."""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "scripts"))
from strip_comments import strip_css, strip_html, strip_js

strippers = {".js": strip_js, ".css": strip_css, ".html": strip_html}
for f in sorted((root / "src").rglob("*")):
    if f.suffix in strippers:
        before = f.read_text()
        after = strippers[f.suffix](before)
        if after != before:
            f.write_text(after)
            print("cleaned", f.relative_to(root))
