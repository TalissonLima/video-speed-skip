#!/usr/bin/env python3
"""Generate the store screenshots (1280x800) in docs/store/screenshots/{en,pt,es}/.

Run from the repo root:   python3 tests/e2e/store_screenshots.py

They use SAMPLE data (seeded below), not a real user's statistics, and the popup is shown the way it
looks on a video site (the popup can't know the site when it is loaded inside a test page).
"""
import pathlib
import shutil
import sys
import time
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ff import EXT, ROOT, SITE, Firefox, prepare_extension, start_static_server  # noqa: E402

OUT = ROOT / "docs" / "store" / "screenshots"

COPY = {
    "en": ("Watch faster. Skip sooner.", "Set your speed once, skip ads with one key and see the time you save. Private and open source."),
    "pt": ("Assista mais rápido. Pule mais cedo.", "Defina sua velocidade uma vez, pule anúncios com uma tecla e veja o tempo que você economiza. Privado e de código aberto."),
    "es": ("Mira más rápido. Salta antes.", "Elige tu velocidad una vez, salta anuncios con una tecla y mira el tiempo que ahorras. Privado y de código abierto."),
}

SAMPLE = """
await browser.storage.local.clear();
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const daily = {}; [0,1,2,3,5,6,7,9,10,12,13].forEach((n, i) => daily[day(n)] = { s: 600 + ((i * 937) % 2400), a: (i * 3) % 7 });
const k = (action, value, code, label) => ({action, value, code, label, ctrl: false, alt: false, shift: false});
await browser.storage.local.set({
  lang: '__LANG__',
  siteSpeeds: { 'www.youtube.com': 1.5, 'vimeo.com': 1.25, 'coursera.org': 2, 'twitch.tv': 1.1 },
  skipCount: 128, savedSeconds: 19800,
  stats: { daily, sites: { 'www.youtube.com': { s: 12000, a: 90 }, 'coursera.org': { s: 5400, a: 0 }, 'vimeo.com': { s: 1800, a: 12 }, 'twitch.tv': { s: 600, a: 26 } } },
  // the shortcuts are left out on purpose: the screenshots show the real defaults
});
return true;
"""

POPUP_AS_ON_YOUTUBE = """
await new Promise(r => setTimeout(r, 600));
const q = (s) => document.querySelector(s); const T = (key) => VSS_I18N['__LANG__'][key];
q('#siteHost').textContent = 'www.youtube.com'; q('#siteState').textContent = T('siteActive');
q('#dot').className = 'dot on'; q('#siteOn').checked = true; q('#siteOn').disabled = false;
if ('__LANG__' !== 'pt') q('#pix').hidden = true;   // the PIX button is only offered to users in Brazil
q('#speedLabel').textContent = T('speedFor'); q('#speedCard').classList.remove('off');
q('#value').textContent = '1.50×'; q('#slider').value = 1.5;
document.querySelectorAll('#chips button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === 1.5));
return true;
"""


def set_viewport(ff, w, h):
    """Size the window so the *page* area is exactly w x h."""
    ff.size(w, h)
    iw, ih = ff.run("return [innerWidth, innerHeight];")
    ff.size(w + (w - iw), h + (h - ih))


def main():
    server = start_static_server()
    tmp, ext = prepare_extension()
    ff = Firefox()
    try:
        ff.install(ext)
        for lang in ("en", "pt", "es"):
            folder = OUT / lang
            folder.mkdir(parents=True, exist_ok=True)
            ff.ext_run(SAMPLE.replace("__LANG__", lang))

            # 1. popup next to a headline
            headline, sub = COPY[lang]
            src = f"{EXT}/popup/popup.html"
            ff.go(f"{SITE}/store-popup.html?" + urllib.parse.urlencode({"src": src, "h": headline, "p": sub}))
            set_viewport(ff, 1280, 800)
            time.sleep(1.5)
            ff.frame(0)
            ff.run(POPUP_AS_ON_YOUTUBE.replace("__LANG__", lang))
            ff.frame(None)
            time.sleep(0.6)  # let the switch/chip transitions finish before the picture is taken
            ff.shot(folder / "01-popup.png")

            # 2-4. options page sections
            ff.go(f"{SITE}/frame-host.html?{EXT}/options/options.html")
            set_viewport(ff, 1280, 800)
            time.sleep(1.5)
            for number, section in ((2, "dashboard"), (3, "shortcuts"), (4, "speed")):
                ff.frame(0)
                ff.run(f"document.querySelector('[data-nav=\"{section}\"]').click(); await new Promise(r => setTimeout(r, 300)); return true;")
                ff.frame(None)
                ff.shot(folder / f"0{number}-{section}.png")
            print(f"{lang}: 4 screenshots -> {folder.relative_to(ROOT)}")

        # promo tiles (Chrome Web Store: the small one is recommended, the marquee optional; neither can be localized)
        promo = OUT.parent / "promo"
        promo.mkdir(parents=True, exist_ok=True)
        for name, (w, h) in {"small-440x280": (440, 280), "marquee-1400x560": (1400, 560)}.items():
            ff.go(f"{SITE}/store-promo.html")
            set_viewport(ff, w, h)
            time.sleep(0.8)
            ff.shot(promo / f"{name}.png")
        print(f"promo tiles -> {promo.relative_to(ROOT)}")
    finally:
        ff.quit()
        server.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
