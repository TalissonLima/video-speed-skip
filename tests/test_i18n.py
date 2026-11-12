"""Every UI string exists in every language, every string the code asks for exists, and none is left unused.

Run:  python3 -m unittest discover -s tests -p "test_*.py" -v
"""
import pathlib
import re
import unittest

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"
I18N = (SRC / "shared" / "i18n.js").read_text()


def keys_by_language():
    out = {}
    blocks = list(re.finditer(r"^  (en|pt|es): \{", I18N, flags=re.M))
    for i, m in enumerate(blocks):
        end = blocks[i + 1].start() if i + 1 < len(blocks) else len(I18N)
        out[m.group(1)] = re.findall(r"^    (\w+):", I18N[m.end():end], flags=re.M)
    return out


def source_without_i18n():
    texts = []
    for f in list(SRC.rglob("*.js")) + list(SRC.rglob("*.html")):
        if f.name != "i18n.js":
            texts.append(f.read_text())
    return "\n".join(texts)


class I18n(unittest.TestCase):
    def test_three_languages_have_the_same_keys(self):
        langs = keys_by_language()
        self.assertEqual(sorted(langs), ["en", "es", "pt"])
        reference = set(langs["en"])
        for lang, keys in langs.items():
            self.assertEqual(len(keys), len(set(keys)), f"{lang}: duplicated keys")
            self.assertEqual(reference - set(keys), set(), f"{lang}: missing keys")
            self.assertEqual(set(keys) - reference, set(), f"{lang}: extra keys")

    def test_every_key_the_code_asks_for_exists(self):
        code = source_without_i18n()
        asked = set(re.findall(r'\bt\("(\w+)"', code)) | set(re.findall(r'data-i18n(?:-title|-ph)?="(\w+)"', code))
        missing = asked - set(keys_by_language()["en"])
        self.assertEqual(missing, set())

    def test_no_string_is_left_unused(self):
        code = source_without_i18n()
        unused = [k for k in keys_by_language()["en"] if not re.search(rf'["\']{k}["\']', code)]
        self.assertEqual(unused, [])

    def test_no_platform_names_in_descriptions(self):
        for key_line in re.findall(r"^    (?:\w+Desc|\w+Help|\w+Hint): .*$", I18N, flags=re.M):
            for name in ("YouTube", "Netflix", "Twitch", "Crunchyroll", "TikTok"):
                self.assertNotIn(name, key_line, key_line[:60])


if __name__ == "__main__":
    unittest.main()
