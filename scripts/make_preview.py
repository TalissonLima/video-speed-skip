#!/usr/bin/env python3
"""Generate tests/popup-preview.html and tests/options-preview.html: the real pages with a
stubbed extension API and sample data, so they can be opened in a normal tab (dev only)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

STUB = """<script>
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
const daily = {}; [0,1,2,3,5,6,7,9,10,12,13].forEach((n, i) => daily[day(n)] = { s: 600 + ((i * 937) % 2400), a: (i * 3) % 7 });
const store = {
  speedScope: "site", siteSpeeds: { "www.youtube.com": 1.5, "vimeo.com": 1.25, "coursera.org": 2 },
  skipCount: 128, savedSeconds: 19800, disabledSites: ["example.org"],
  stats: { daily, sites: { "www.youtube.com": { s: 12000, a: 90 }, "coursera.org": { s: 5400, a: 0 }, "vimeo.com": { s: 1800, a: 12 }, "twitch.tv": { s: 600, a: 26 } } }
};
globalThis.chrome = {
  storage: { local: { get: async () => ({ ...store }), set: async (x) => Object.assign(store, x), remove: async () => {} }, onChanged: { addListener() {} } },
  tabs: { query: async () => [{ url: "https://www.youtube.com/watch?v=demo" }] },
  runtime: { getManifest: () => ({ version: "0.3.0" }), openOptionsPage() {} }
};
</script>"""

def build(src, out):
    p = (root / src).read_text()
    p = p.replace("</head>", STUB + "</head>", 1)
    p = re.sub(r'(href|src)="(\.\./shared/)', r'\1="../src/shared/', p)
    folder = pathlib.Path(src).parent.name
    p = re.sub(r'(href|src)="((?:popup|options)\.(?:css|js))"', lambda m: f'{m.group(1)}="../src/{folder}/{m.group(2)}"', p)
    (root / out).write_text(p)

build("src/popup/popup.html", "tests/popup-preview.html")
build("src/options/options.html", "tests/options-preview.html")
