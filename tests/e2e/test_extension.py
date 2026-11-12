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
  skipIntro: __SKIP_INTRO__, __EXTRA__

  shortcuts: [k('slower', 0.1, 'KeyS', 'S'), k('faster', 0.1, 'KeyD', 'D'), k('setSpeed', 1, 'KeyR', 'R'),
              k('rewind', 10, 'KeyZ', 'Z'), k('forward', 10, 'KeyX', 'X'),
              k('hold', 3, 'KeyH', 'H'), k('toggle', 2, 'KeyT', 'T'), k('toggleSkip', 0, 'KeyK', 'K'), k('toggleSite', 0, 'KeyP', 'P'),
              k('toggleAlways', 0, 'KeyL', 'L'), k('goLive', 0, 'KeyG', 'G')]
});
return true;
"""


def seed(ff, skip_intro=False, extra=""):
    ff.ext_run(SEED.replace("__SKIP_INTRO__", "true" if skip_intro else "false").replace("__EXTRA__", extra))


def stored(ff, keys):
    return ff.ext_run("return await browser.storage.local.get(%s);" % keys)


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
        check("ads keep your speed by default (ad speed is opt-in)", approx(r["duringAd"], r["saved"]), r)
        check("speed is unchanged after the ad", approx(r["afterAd"], r["saved"]), r)

        print("Content script: opt-in ad speed")
        seed(ff, extra="adNormalSpeed: true, adSpeed: 1.5,")
        ff.go(f"{SITE}/real-extension.html")
        time.sleep(1.5)
        r = ff.run(PRELUDE + """
          const v = document.getElementById('v'); await v.play(); await sleep(300);
          kd('KeyD'); await sleep(200); const base = v.playbackRate;
          const player = document.createElement('div'); player.className = 'html5-video-player';
          document.body.append(player);
          player.classList.add('ad-showing'); await sleep(1600); const during = v.playbackRate;
          player.classList.remove('ad-showing'); await sleep(1600);
          return {base, during, after: v.playbackRate};
        """)
        check("ad speed on: ads play at the chosen speed", approx(r["during"], 1.5), r)
        check("...and your speed returns afterwards", approx(r["after"], r["base"]), r)

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

        # ------------------------------------------------------------------ a site that ignores scripted clicks
        print("Content script: a site that ignores scripted clicks (like YouTube)")
        keys = "['skipCount', 'skipFails']"
        STATE = PRELUDE + """
          const v = document.getElementById('v');
          return {clicks: window.__clicks, events: window.__events,
                  adShowing: document.getElementById('player').classList.contains('ad-showing'),
                  time: v.currentTime, duration: v.duration,
                  content: (document.getElementById('content') || {}).currentTime};
        """

        seed(ff, extra="adSkipFallback: false,")  # the fallback is on by default now: switch it off here
        ff.go(f"{SITE}/fake-youtube.html?mode=strict")
        time.sleep(1.5)
        ff.run(PRELUDE + "await sleep(5500);")
        r, s = ff.run(STATE), stored(ff, keys)
        check("tries the click, then full pointer events", r["clicks"] >= 2 and any("pointerdown" in e for e in r["events"]), r)
        check("a skip the site ignored is NOT counted", not s.get("skipCount"), s)
        check("...it is reported as ignored instead", s.get("skipFails") == 1, s)

        seed(ff, extra="adSkipFallback: true,")
        ff.go(f"{SITE}/fake-youtube.html?mode=strict")
        time.sleep(1.5)
        ff.run(PRELUDE + "await sleep(6500);")
        r, s = ff.run(STATE), stored(ff, keys)
        check("fallback on: the skippable ad jumps to its end", not r["adShowing"] and r["time"] > r["duration"] - 1, r)
        check("...and that skip is counted once", s.get("skipCount") == 1 and not s.get("skipFails"), s)

        seed(ff)
        ff.go(f"{SITE}/fake-youtube.html?mode=lenient")
        time.sleep(1.5)
        ff.run(PRELUDE + "await sleep(3000);")
        r, s = ff.run(STATE), stored(ff, keys)
        check("site that accepts the click: ad skipped and counted", not r["adShowing"] and s.get("skipCount") == 1 and not s.get("skipFails"), (r, s))

        # a live stream must never be fast-forwarded, even with the fallback on
        seed(ff, extra="adSkipFallback: true,")
        ff.go(f"{SITE}/fake-youtube.html?mode=strict&live=1")
        time.sleep(1.5)
        ff.run(PRELUDE + "await sleep(5500);")
        r, s = ff.run(STATE), stored(ff, keys)
        check("live stream: the fallback never jumps to the end", r["time"] < 2, r)
        check("...the ignored skip is reported instead", s.get("skipFails") == 1 and not s.get("skipCount"), s)

        # YouTube may keep the live stream in a separate <video> next to the ad's: only the ad may be touched
        seed(ff, extra="adSkipFallback: true,")
        ff.go(f"{SITE}/fake-youtube.html?mode=strict&two=1")
        time.sleep(1.5)
        ff.run(PRELUDE + "await sleep(6500);")
        r = ff.run(STATE)
        check("two videos: the ad jumps to its end...", not r["adShowing"] and r["time"] > r["duration"] - 1, r)
        check("...and the stream's own video is left alone", not r["content"], r)

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

        # ------------------------------------------------------------------ live streams (the decisions)
        # The page can't fake a live stream for the extension (it sees the browser's own values), so the
        # decisions are tested as pure functions with plain objects.
        print("Live streams: decisions")
        ff.go(f"{SITE}/live-logic.html")
        r = ff.run("""
          const L = VSS.live; const out = {};
          out.far = L.decide(110, false);          // watching far behind on purpose
          out.near = L.decide(20, false);          // a few seconds behind
          out.caught = L.decide(1, true);          // caught up
          out.keep = L.decide(20, true);           // still catching up
          out.drifted = L.decide(80, true);        // fell far behind while catching up
          out.unknownIdle = L.decide(NaN, false);
          out.unknownBoost = L.decide(NaN, true);
          out.edge30 = L.edge({length: 1, end: () => 30});
          out.edgeNone = [Number.isNaN(L.edge({length: 0})), Number.isNaN(L.edge(null))];
          const v = (duration, paused = true) => ({duration, paused, ended: false});
          const stream = v(7200, false), ad = v(30, false), idleAd = v(20, true);
          out.pickShort = L.pickAd([stream, ad]) === ad;               // the long stream is never the ad
          out.pickFinite = L.pickAd([v(Infinity, false), idleAd]) === idleAd;
          out.pickNone = L.pickAd([stream]) === null;                  // only the stream: nothing to skip
          out.pickPlaying = L.pickAd([idleAd, ad]) === ad;             // the playing one wins
          return out;
        """)
        check("far behind the live edge is left alone", r["far"] == "keep", r)
        check("a few seconds behind starts catching up", r["near"] == "start", r)
        check("caught up stops", r["caught"] == "stop", r)
        check("still catching up keeps going", r["keep"] == "keep", r)
        check("drifting far behind while catching up stops", r["drifted"] == "stop", r)
        check("unknown lag never starts and always stops", r["unknownIdle"] == "keep" and r["unknownBoost"] == "stop", r)
        check("live edge comes from the seekable ranges", r["edge30"] == 30 and r["edgeNone"] == [True, True], r)
        check("ad video: never the long stream", r["pickShort"] and r["pickFinite"] and r["pickNone"], r)
        check("ad video: the playing one is preferred", r["pickPlaying"], r)

        # ------------------------------------------------------------------ always-visible badge
        print("Content script: always-visible badge")
        seed(ff, extra="overlayAlways: true, overlayPos: 'mc', overlayOpacity: 0.5,")
        ff.go(f"{SITE}/real-extension.html")
        time.sleep(1.5)
        r = ff.run(PRELUDE + """
          const v = document.getElementById('v'); await v.play(); await sleep(1200);
          const host = [...document.documentElement.children].find((e) => e.style && e.style.zIndex === '2147483647');
          if (!host) return {found: false};
          const b = v.getBoundingClientRect();
          return {found: true, left: parseFloat(host.style.left), top: parseFloat(host.style.top),
                  cx: b.left + b.width / 2, cy: b.top + b.height / 2, transform: host.style.transform};
        """)
        check("always-visible badge sits on the video, centered",
              r.get("found") and abs(r["left"] - r["cx"]) < 3 and abs(r["top"] - r["cy"]) < 3 and "-50%" in r["transform"], r)

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
          out.newControls = ['adSpeed', 'overlayOpacity', 'overlayAlways', 'liveCatchUp', 'liveSpeed'].every((id) => document.getElementById(id));
          out.noPitchOption = !document.getElementById('preservePitch');
          out.positions = document.querySelectorAll('#screen [data-pos]').length;
          return out;
        """)
        ff.frame(None)
        for s in ["dashboard", "shortcuts", "speed", "skip", "appearance", "data"]:
            check(f"section '{s}' opens at the top", r[s]["visible"] and r[s]["scrollY"] == 0 and r[s]["title"], r[s])
        check("'normal speed during ads' switch exists", r["adNormal"])
        check("pause-site action is offered", "toggleSite" in r["actions"] and "hold" in r["actions"], r["actions"])
        check("quick speeds are normalised", r["presets"] == "1, 1.5, 2, 3", r["presets"])
        check("new controls exist (ad speed, opacity, always visible, live)", r["newControls"])
        check("voice pitch option is gone", r["noPitchOption"])
        check("9 badge positions", r["positions"] == 9, r["positions"])
        check("live and badge shortcuts are offered", "goLive" in r["actions"] and "toggleAlways" in r["actions"], r["actions"])

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
