#!/usr/bin/env python3
"""End-to-end test: loads the built Firefox extension in a real (headless) Firefox and checks the
content script, the options page and the popup.

Run from the repo root:   python3 tests/e2e/test_extension.py
Exit code is 0 when everything passes.
"""
import pathlib
import shutil
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ff import SITE, Firefox, prepare_extension, start_static_server  # noqa: E402

failures = []


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   ({detail})" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def approx(a, b, tol=0.011):
    return a is not None and abs(a - b) < tol


PRELUDE = """
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kd = (code, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', {code, bubbles: true, cancelable: true, ...o}));
const ku = (code) => document.dispatchEvent(new KeyboardEvent('keyup', {code, bubbles: true}));
"""

SEED = """
await browser.storage.local.clear();
const k = (action, value, code, label) => ({action, value, code, label, ctrl: false, alt: false, shift: false});
await browser.storage.local.set({
  skipIntro: __SKIP_INTRO__,
  shortcuts: [k('slower', 0.1, 'KeyS', 'S'), k('faster', 0.1, 'KeyD', 'D'), k('setSpeed', 1, 'KeyR', 'R'),
              k('rewind', 10, 'KeyZ', 'Z'), k('forward', 10, 'KeyX', 'X'),
              k('hold', 3, 'KeyH', 'H'), k('toggle', 2, 'KeyT', 'T'), k('toggleSkip', 0, 'KeyK', 'K'), k('toggleSite', 0, 'KeyP', 'P')]
});
return true;
"""


def seed(ff, skip_intro=False):
    ff.ext_run(SEED.replace("__SKIP_INTRO__", "true" if skip_intro else "false"))


def main():
    server = start_static_server()
    tmp, ext = prepare_extension()
    ff = Firefox()
    try:
        ff.install(ext)

        # ------------------------------------------------------------------ speed + shortcuts
        print("Content script: speed and shortcuts")
        seed(ff)
        ff.go(f"{SITE}/real-extension.html")
        time.sleep(1.5)
        r = ff.run(PRELUDE + """
          const v = document.getElementById('v'); const out = {};
          await v.play(); await sleep(300);
          kd('KeyD'); kd('KeyD'); await sleep(200); out.faster = v.playbackRate;
          kd('KeyS'); await sleep(100); out.slower = v.playbackRate;
          kd('KeyR'); await sleep(100); out.reset = v.playbackRate;
          kd('KeyD'); await sleep(100); out.base = v.playbackRate;
          kd('KeyH'); kd('KeyH', {repeat: true}); await sleep(100); out.holdDown = v.playbackRate;
          ku('KeyH'); await sleep(100); out.holdUp = v.playbackRate;
          kd('KeyT'); await sleep(100); out.toggleOn = v.playbackRate;
          kd('KeyT'); await sleep(100); out.toggleOff = v.playbackRate;
          const t0 = v.currentTime; kd('KeyX'); await sleep(100); out.forward = v.currentTime - t0;
          return out;
        """)
        check("D D raises speed to 1.2x", approx(r["faster"], 1.2), r["faster"])
        check("S lowers it by 0.1", approx(r["slower"], 1.1), r["slower"])
        check("R resets to 1x", approx(r["reset"], 1.0), r["reset"])
        check("hold: 3x while the key is down, back on release", approx(r["holdDown"], 3) and approx(r["holdUp"], r["base"]), r)
        check("toggle: jumps to 2x and back", approx(r["toggleOn"], 2) and approx(r["toggleOff"], r["base"]), r)
        check("X moves forward ~10s", r["forward"] > 5, r["forward"])

        # ------------------------------------------------------------------ pause site + normal speed in ads
        print("Content script: pause shortcut and ads at normal speed")
        r = ff.run(PRELUDE + """
          const v = document.getElementById('v'); const out = {};
          out.before = v.playbackRate;
          kd('KeyP'); await sleep(200);                       // pause the extension on this site
          kd('KeyD'); await sleep(200); out.whilePaused = v.playbackRate;
          kd('KeyP'); await sleep(300);                       // resume
          kd('KeyD'); await sleep(200); out.afterResume = v.playbackRate;

          const player = document.createElement('div'); player.className = 'html5-video-player';
          document.body.append(player);
          const saved = v.playbackRate;
          player.classList.add('ad-showing'); await sleep(1600); out.duringAd = v.playbackRate;
          player.classList.remove('ad-showing'); await sleep(1600); out.afterAd = v.playbackRate;
          out.saved = saved;
          return out;
        """)
        check("paused site ignores shortcuts", approx(r["whilePaused"], r["before"]), r)
        check("resumed site works again", approx(r["afterResume"], r["before"] + 0.1), r)
        check("ad plays at 1x", approx(r["duringAd"], 1.0), r["duringAd"])
        check("speed comes back after the ad", approx(r["afterAd"], r["saved"]), r)

        # ------------------------------------------------------------------ skip buttons
        print("Content script: skip buttons")
        r = ff.run(PRELUDE + """
          const out = {}; const clicks = {};
          for (const id of ['fake', 'generic', 'nope', 'intro']) {
            document.getElementById(id).addEventListener('click', () => clicks[id] = (clicks[id] || 0) + 1);
            document.getElementById(id).hidden = false;
          }
          await sleep(2600);
          out.first = {...clicks};
          for (const id of ['fake', 'generic']) document.getElementById(id).hidden = true;
          kd('KeyK'); await sleep(200);                       // ad skipping OFF
          document.getElementById('fake').hidden = false; for (const k in clicks) delete clicks[k];
          await sleep(1600); out.whileOff = {...clicks};
          kd('KeyK'); await sleep(2600);                      // ON again
          out.backOn = {...clicks};
          return out;
        """)
        f = r["first"]
        check("YouTube-style skip button is clicked", f.get("fake", 0) >= 1, f)
        check("text-based 'Pular anúncio' is clicked", f.get("generic", 0) >= 1, f)
        check("'Skip to content' is never clicked", "nope" not in f, f)
        check("intro skipping is off by default", "intro" not in f, f)
        check("skip shortcut turns clicking off", not r["whileOff"].get("fake"), r["whileOff"])
        check("...and on again", r["backOn"].get("fake", 0) >= 1, r["backOn"])

        # ------------------------------------------------------------------ intro skip when enabled
        seed(ff, skip_intro=True)
        ff.go(f"{SITE}/real-extension.html")
        time.sleep(1.5)
        r = ff.run(PRELUDE + """
          const clicks = {};
          for (const id of ['intro', 'nope']) {
            document.getElementById(id).addEventListener('click', () => clicks[id] = (clicks[id] || 0) + 1);
            document.getElementById(id).hidden = false;
          }
          await sleep(2600); return clicks;
        """)
        check("intro button is clicked when enabled", r.get("intro", 0) >= 1, r)
        check("...but not unrelated buttons", "nope" not in r, r)

        # ------------------------------------------------------------------ lazy start
        print("Content script: stays idle until a video exists")
        seed(ff)
        ff.go(f"{SITE}/novideo.html")
        time.sleep(1.5)
        idle = ff.run(PRELUDE + "await sleep(2500); return window.__clicks;")
        check("no video: skip button is left alone", idle == 0, idle)
        woke = ff.run(PRELUDE + """
          const v = document.createElement('video'); v.muted = true; v.src = '/tests/silence.wav';
          document.body.append(v); await sleep(3500); return window.__clicks;
        """)
        check("video appears: the extension wakes up and clicks", woke >= 1, woke)

        # ------------------------------------------------------------------ shadow DOM video
        print("Content script: video inside a shadow root")
        ff.go(f"{SITE}/novideo.html")
        time.sleep(1.5)
        r = ff.run(PRELUDE + """
          const host = document.createElement('x-player'); document.body.append(host);
          host.attachShadow({mode: 'open'}).innerHTML = '<video muted loop width="300" height="170" src="/tests/silence.wav"></video>';
          await sleep(2600);                                   // discovery runs on a throttled timer
          const v = host.shadowRoot.querySelector('video');
          await v.play(); await sleep(300);
          const before = v.playbackRate;
          kd('KeyD'); await sleep(300);
          return {before, after: v.playbackRate};
        """)
        check("shortcut controls a video in a shadow root", approx(r["after"], r["before"] + 0.1), r)

        # ------------------------------------------------------------------ options page
        print("Options page")
        ff.open_ext("options/options.html", 1100, 800)
        r = ff.run(PRELUDE + """
          const out = {};
          for (const s of ['dashboard', 'shortcuts', 'speed', 'skip', 'appearance', 'data']) {
            document.querySelector(`[data-nav="${s}"]`).click(); await sleep(150);
            out[s] = {visible: !document.getElementById(s).hidden, scrollY: window.scrollY,
                      title: document.getElementById(s).querySelector('h2').textContent};
          }
          document.querySelector('[data-nav="skip"]').click(); await sleep(100);
          out.adNormal = !!document.getElementById('adNormalSpeed');
          document.querySelector('[data-nav="shortcuts"]').click(); await sleep(100);
          out.actions = [...document.querySelector('.sc select').options].map(o => o.value);
          document.querySelector('[data-nav="speed"]').click(); await sleep(100);
          const p = document.getElementById('presets'); p.value = '3, 1, 1.5, abc, 1, 20, 2';
          p.dispatchEvent(new Event('change')); await sleep(100); out.presets = p.value;
          return out;
        """)
        ff.frame(None)
        for s in ["dashboard", "shortcuts", "speed", "skip", "appearance", "data"]:
            check(f"section '{s}' opens at the top", r[s]["visible"] and r[s]["scrollY"] == 0 and r[s]["title"], r[s])
        check("'normal speed during ads' switch exists", r["adNormal"])
        check("pause-site action is offered", "toggleSite" in r["actions"] and "hold" in r["actions"], r["actions"])
        check("quick speeds are normalised", r["presets"] == "1, 1.5, 2, 3", r["presets"])

        # ------------------------------------------------------------------ popup
        print("Popup")
        ff.open_ext("popup/popup.html", 360, 640)
        r = ff.run(PRELUDE + """
          await sleep(300);
          const q = (s) => document.querySelector(s);
          return {chips: document.querySelectorAll('#chips button').length, speed: q('#value').textContent,
                  height: document.body.offsetHeight, hasGear: !!q('#gear'), tip: q('#tip').textContent.length > 0};
        """)
        ff.frame(None)
        # the options step above saved the presets "1, 1.5, 2, 3", so the popup shows 4 quick speeds
        check("popup renders chips, gear and shortcut tip", r["chips"] == 4 and r["hasGear"] and r["tip"], r)
        check("popup fits the 600px browser limit", r["height"] <= 600, r["height"])
    finally:
        ff.quit()
        server.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)  # the temp copy this script created under $HOME

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED: " + "; ".join(failures))
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
