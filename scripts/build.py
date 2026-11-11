#!/usr/bin/env python3
"""Build dist/chrome and dist/firefox (+ .zip each). Stdlib only. Dev tool."""
import json, shutil, subprocess, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src, dist = root / "src", root / "dist"
manifest = json.loads((src / "manifest.json").read_text())
version = manifest["version"]

if "YOUR_" in (src / "shared" / "config.js").read_text():
    print("WARNING: placeholders still set in src/shared/config.js (Buy Me a Coffee / PIX / repo)", file=sys.stderr)

shutil.rmtree(dist, ignore_errors=True)
for target in ("chrome", "firefox"):
    out = dist / target
    shutil.copytree(src, out)
    m = json.loads(json.dumps(manifest))
    if target == "firefox":
        m["browser_specific_settings"] = {
            "gecko": {
                "id": "video-speed-skip@example.com",  # TODO: change to your own id
                "strict_min_version": "115.0",
                "data_collection_permissions": {"required": ["none"]},
            }
        }
    (out / "manifest.json").write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    zip_path = dist / f"video-speed-skip-{target}-v{version}.zip"
    subprocess.run(["zip", "-qr", str(zip_path), "."], cwd=out, check=True)
    print("built", zip_path.relative_to(root))
