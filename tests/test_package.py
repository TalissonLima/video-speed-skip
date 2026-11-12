"""Checks that the packages we upload to the stores are well formed.

Run:  python3 -m unittest discover -s tests -p "test_*.py" -v
"""
import json
import pathlib
import re
import subprocess
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / "src", ROOT / "dist"


class Package(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(["python3", str(ROOT / "scripts" / "build.py")], check=True, stdout=subprocess.DEVNULL)
        cls.manifest = json.loads((SRC / "manifest.json").read_text())
        cls.version = cls.manifest["version"]

    # ------------------------------------------------------------------ store metadata
    def test_descriptions_fit_the_chrome_limit(self):
        for messages in (SRC / "_locales").glob("*/messages.json"):
            data = json.loads(messages.read_text())
            self.assertLessEqual(len(data["extDescription"]["message"]), 132, messages.parent.name)
            self.assertLessEqual(len(data["extName"]["message"]), 45, messages.parent.name)

    def test_every_locale_is_complete(self):
        default = self.manifest["default_locale"]
        self.assertTrue((SRC / "_locales" / default / "messages.json").exists())
        for messages in (SRC / "_locales").glob("*/messages.json"):
            self.assertEqual(sorted(json.loads(messages.read_text())), ["extDescription", "extName"], messages.parent.name)

    def test_manifest_basics(self):
        m = self.manifest
        self.assertEqual(m["manifest_version"], 3)
        self.assertRegex(m["version"], r"^\d+\.\d+\.\d+$")
        self.assertIn("homepage_url", m)
        self.assertEqual(sorted(m["permissions"]), ["activeTab", "storage"])  # nothing else: it is what the privacy policy promises

    def test_every_referenced_file_exists(self):
        m = self.manifest
        files = list(m["icons"].values()) + list(m["action"]["default_icon"].values())
        files += [m["action"]["default_popup"], m["options_ui"]["page"]]
        for script in m["content_scripts"]:
            files += script["js"]
        for f in files:
            self.assertTrue((SRC / f).exists(), f)

    def test_pages_only_reference_files_that_exist(self):
        for page in SRC.rglob("*.html"):
            for ref in re.findall(r'(?:src|href)="([^"#]+)"', page.read_text()):
                if ref.startswith(("http:", "https:")):
                    continue
                self.assertTrue((page.parent / ref).resolve().exists(), f"{page.relative_to(SRC)} -> {ref}")

    # ------------------------------------------------------------------ the two builds
    def test_chrome_manifest(self):
        m = json.loads((DIST / "chrome" / "manifest.json").read_text())
        self.assertNotIn("browser_specific_settings", m)
        self.assertEqual(m["minimum_chrome_version"], "111")

    def test_firefox_manifest(self):
        m = json.loads((DIST / "firefox" / "manifest.json").read_text())
        gecko = m["browser_specific_settings"]["gecko"]
        self.assertEqual(gecko["data_collection_permissions"], {"required": ["none"]})
        self.assertGreaterEqual(float(gecko["strict_min_version"]), 142.0)  # the key is unknown to older versions
        self.assertNotIn("minimum_chrome_version", m)

    # ------------------------------------------------------------------ the zips
    def test_zips_are_clean(self):
        for target in ("chrome", "firefox"):
            zip_path = DIST / f"video-speed-skip-{target}-v{self.version}.zip"
            self.assertTrue(zip_path.exists(), zip_path.name)
            with zipfile.ZipFile(zip_path) as z:
                names = z.namelist()
                self.assertIn("manifest.json", names)  # at the root, not inside a folder
                self.assertFalse([n for n in names if n.endswith((".py", ".md", ".html~", ".DS_Store")) or n.startswith(("tests", "docs"))], names)
                self.assertLess(sum(i.file_size for i in z.infolist()), 1_000_000)
                for name in names:
                    if name.endswith(".js"):
                        code = z.read(name).decode()
                        for line in code.splitlines():
                            self.assertFalse(line.lstrip().startswith(("//", "/*")), f"comment left in {name}: {line[:60]}")

    def test_no_remote_code_or_network_in_the_package(self):
        for f in (DIST / "chrome").rglob("*.js"):
            code = f.read_text()
            self.assertNotRegex(code, r"\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|eval)\s*\(", f.name)
            self.assertNotIn("new Function", code, f.name)
        # the only absolute URLs are the support links the user clicks on
        urls = set()
        for f in (DIST / "chrome").rglob("*.js"):
            urls |= set(re.findall(r"https?://[^\s\"'`)]+", f.read_text()))
        self.assertTrue(all(u.startswith(("https://buymeacoffee.com/", "https://github.com/")) for u in urls), urls)


if __name__ == "__main__":
    unittest.main()
