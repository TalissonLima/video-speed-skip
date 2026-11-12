#!/usr/bin/env python3
"""Build dist/chrome and dist/firefox (+ .zip each). Stdlib only. Dev tool."""
import json, shutil, subprocess, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src, dist = root / "src", root / "dist"
manifest = json.loads((src / "manifest.json").read_text())
version = manifest["version"]

if "YOUR_" in (src / "shared" / "config.js").read_text():
    print("WARNING: placeholders still set in src/shared/config.js (Buy Me a Coffee / PIX / repo)", file=sys.stderr)

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from strip_comments import strip_css, strip_html, strip_js

STRIPPERS = {".js": strip_js, ".css": strip_css, ".html": strip_html}
keep_comments = "--keep-comments" in sys.argv  # handy when debugging a release build

shutil.rmtree(dist, ignore_errors=True)
for target in ("chrome", "firefox"):
    out = dist / target
    shutil.copytree(src, out)
    if not keep_comments:  # src/ stays commented; only the packaged copy is stripped
        for f in out.rglob("*"):
            if f.suffix in STRIPPERS:
                f.write_text(STRIPPERS[f.suffix](f.read_text()))
    m = json.loads(json.dumps(manifest))
    if target == "chrome":
        m["minimum_chrome_version"] = "111"  # color-mix() in the UI
    if target == "firefox":
        m["browser_specific_settings"] = {
            "gecko": {
                "id": "video-speed-skip@talissonlima.github.io",
                "strict_min_version": "142.0",  # data_collection_permissions needs 140 (desktop) / 142 (Android)
                "data_collection_permissions": {"required": ["none"]},
            }
        }
    (out / "manifest.json").write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    zip_path = dist / f"video-speed-skip-{target}-v{version}.zip"
    subprocess.run(["zip", "-qr", str(zip_path), "."], cwd=out, check=True)
    print("built", zip_path.relative_to(root))
