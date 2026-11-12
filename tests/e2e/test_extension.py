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
          const t0 = v.currentTime; kd('KeyX'); kd('KeyX'); await sleep(100); out.forward = v.currentTime - t0;
          return out;
        """)
        check("D D raises speed to 1.2x", approx(r["faster"], 1.2), r["faster"])
        check("S lowers it by 0.1", approx(r["slower"], 1.1), r["slower"])
        check("R resets to 1x", approx(r["reset"], 1.0), r["reset"])
        check("hold: 3x while the key is down, back on release", approx(r["holdDown"], 3) and approx(r["holdUp"], r["base"]), r)
        check("toggle: jumps to 2x and back", approx(r["toggleOn"], 2) and approx(r["toggleOff"], r["base"]), r)
        check("X pressed twice moves forward ~20s", r["forward"] > 15, r["forward"])

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
          const after = v.playbackRate;
          player.classList.add('ad-showing'); await sleep(1600);
          player.classList.remove('ad-showing'); v.playbackRate = 1.5;   // the site leaves the ad speed behind, same tick
          await sleep(1800);
          return {base, during, after, raced: v.playbackRate};
        """)
        check("ad speed on: ads play at the chosen speed", approx(r["during"], 1.5), r)
        check("...and your speed returns afterwards", approx(r["after"], r["base"]), r)
        check("a site that resets the rate as the ad ends does not change your speed", approx(r["raced"], r["base"]), r)
        kept = stored(ff, "['siteSpeeds']")
        check("...and your saved speed is untouched", approx((kept.get("siteSpeeds") or {}).get("localhost"), r["base"]), kept)
        ff.go(f"{SITE}/real-extension.html")   # (reading storage navigated away)
        time.sleep(1.5)

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
          out.focused = document.activeElement && document.activeElement.id;
          for (const id of ['fake', 'generic']) document.getElementById(id).hidden = true;
          kd('KeyK'); await sleep(200);                       // ad skipping OFF
          document.getElementById('generic').hidden = false; for (const k in clicks) delete clicks[k];
          await sleep(1600); out.whileOff = {...clicks};
          kd('KeyK'); await sleep(2600);                      // ON again
          out.backOn = {...clicks};
          return out;
        """)
        f = r["first"]
        check("YouTube-style skip button is NOT clicked (YouTube reports scripted clicks)", "fake" not in f, f)
        check("...it gets keyboard focus instead, so the user can press Enter", r["focused"] == "fake", r["focused"])
        check("text-based 'Pular anúncio' is clicked", f.get("generic", 0) >= 1, f)
        check("'Skip to content' is never clicked", "nope" not in f, f)
        check("intro skipping is off by default", "intro" not in f, f)
        check("skip shortcut turns clicking off", not r["whileOff"].get("generic"), r["whileOff"])
        check("...and on again", r["backOn"].get("generic", 0) >= 1, r["backOn"])

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

        # ------------------------------------------------------------------ YouTube: never click, never seek
        # YouTube's player (base.js) treats a Skip click with isTrusted === false as an "abnormality" and
        # reports it; seeking inside an ad is reported too. So on YouTube-like markup we must not send any
        # scripted event: only put focus on the button, and let a REAL Enter key press skip the ad.
        print("Content script: YouTube-style skip button (no scripted clicks, no seeking)")
        YT = PRELUDE + """
          const v = document.getElementById('v');
          return {clicks: window.__clicks, events: window.__events,
                  adShowing: document.getElementById('player').classList.contains('ad-showing'),
                  time: v.currentTime, focused: document.activeElement && document.activeElement.id};
        """
        for mode in ("strict", "lenient"):
            seed(ff)
            ff.go(f"{SITE}/fake-youtube.html?mode={mode}")
            time.sleep(1.5)
            ff.run(PRELUDE + "await sleep(4500);")
            r, st = ff.run(YT), stored(ff, "['skipCount']")
            ff.go(f"{SITE}/fake-youtube.html?mode={mode}")   # (reading storage navigated away: start again for the Enter test)
            time.sleep(1.5)
            ff.run(PRELUDE + "await sleep(3000);")
            check(f"{mode}: no scripted click is ever sent", r["clicks"] == 0 and not r["events"], r)
            check(f"{mode}: the ad video is never seeked", r["time"] < 1 and r["adShowing"], r)
            check(f"{mode}: the Skip button gets keyboard focus", r["focused"] == "skip", r)
            check(f"{mode}: nothing is counted as skipped", not st.get("skipCount"), st)
            if mode == "strict":
                ff.press("\ue007")  # a real Enter key press: a trusted event
                time.sleep(0.8)
                r2 = ff.run(YT)
                check("the user's own Enter (a trusted event) skips the ad",
                      r2["clicks"] == 1 and not r2["adShowing"] and not any(e.endswith("*") for e in r2["events"]), r2)

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
          const S = VSS.seek;
          out.seekSum = S.accumulate(10, 10, 500);                     // quick presses add up: 20
          out.seekReset = S.accumulate(30, 10, 3500);                  // a pause of more than 3 s starts over: 10
          out.seekNet = S.accumulate(10, -10, 1000);                   // opposite direction: net 0
          out.seekFirst = S.accumulate(0, 10, 1e9);                    // first press ever
          out.labels = [S.label(30), S.label(-20), S.label(0), S.label(2.5)];
          return out;
        """)
        check("far behind the live edge is left alone", r["far"] == "keep", r)
        check("a few seconds behind starts catching up", r["near"] == "start", r)
        check("caught up stops", r["caught"] == "stop", r)
        check("still catching up keeps going", r["keep"] == "keep", r)
        check("drifting far behind while catching up stops", r["drifted"] == "stop", r)
        check("unknown lag never starts and always stops", r["unknownIdle"] == "keep" and r["unknownBoost"] == "stop", r)
        check("live edge comes from the seekable ranges", r["edge30"] == 30 and r["edgeNone"] == [True, True], r)
        check("seek badge: quick presses add up (3 x 10 s = +30s)", r["seekSum"] == 20 and r["labels"][0] == "+30s", r)
        check("seek badge: a pause longer than 3 s starts over", r["seekReset"] == 10 and r["seekFirst"] == 10, r)
        check("seek badge: opposite direction nets out", r["seekNet"] == 0 and r["labels"][1:] == ["−20s", "0s", "+2.5s"], r)

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
          const out = {found: true, left: parseFloat(host.style.left), top: parseFloat(host.style.top),
                       cx: b.left + b.width / 2, cy: b.top + b.height / 2, transform: host.style.transform};
          const text = () => host.shadowRoot.querySelector('.b').textContent;
          out.speedText = text();
          kd('KeyX'); kd('KeyX'); kd('KeyX'); await sleep(700);          // longer than one refresh tick (400 ms)
          out.seekText = text();
          await sleep(1800);
          out.backText = text();
          return out;
        """)
        check("always-visible badge sits on the video, centered",
              r.get("found") and abs(r["left"] - r["cx"]) < 3 and abs(r["top"] - r["cy"]) < 3 and "-50%" in r["transform"], r)
        check("always-visible badge shows the speed", r.get("speedText") == "1×", r.get("speedText"))
        check("...and keeps the summed seek (3 x 10 s = +30s) instead of overwriting it", r.get("seekText") == "+30s", r.get("seekText"))
        check("...then shows the speed again", r.get("backText") == "1×", r.get("backText"))

        # ------------------------------------------------------------------ default keys vs. the big players
        print("Default shortcuts")
        ff.go(f"{SITE}/live-logic.html")
        r = ff.run("""
          const reserved = {"plain": ["KeyK", "KeyJ", "KeyL", "KeyM", "KeyF", "KeyT", "KeyI", "KeyC", "KeyS", "Space", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Comma", "Period", "Home", "End", "PageUp", "PageDown", "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"], "shift": ["KeyN", "KeyP", "Comma", "Period", "Slash"], "alt": ["KeyT", "KeyR", "KeyK", "KeyX"]};
          const clashes = [], seen = new Set();
          for (const sc of VSS.DEFAULT_SHORTCUTS) {
            const kind = sc.ctrl ? 'ctrl' : sc.alt ? 'alt' : sc.shift ? 'shift' : 'plain';
            if ((reserved[kind] || []).includes(sc.code) || sc.ctrl) clashes.push(kind + '+' + sc.code);
            const id = [sc.code, sc.ctrl, sc.alt, sc.shift].join('|');
            if (seen.has(id)) clashes.push('duplicate ' + id);
            seen.add(id);
          }
          const has = (action, value, code, shift = false) => VSS.DEFAULT_SHORTCUTS.some(
            (s) => s.action === action && s.value === value && s.code === code && s.shift === shift);
          return {clashes, count: VSS.DEFAULT_SHORTCUTS.length,
                  hold3: has('hold', 3, 'KeyH'), toggle: VSS.DEFAULT_SHORTCUTS.some((s) => s.action === 'toggle'),
                  badge: VSS.DEFAULT_SHORTCUTS.some((s) => s.action === 'toggleAlways'),
                  seeks: [has('rewind', 30, 'KeyZ', true), has('forward', 30, 'KeyX', true), has('rewind', 60, 'KeyQ'), has('forward', 60, 'KeyE')]};
        """)
        check("default keys don't collide with YouTube, Netflix, Twitch, Crunchyroll or TikTok", not r["clashes"], r["clashes"])
        check("defaults: hold 3x, toggle, always-visible badge", r["hold3"] and r["toggle"] and r["badge"], r)
        check("defaults: +-30 s and +-60 s", all(r["seeks"]), r["seeks"])

        r = ff.ext_run("""
          const k = (action, value, code) => ({action, value, code, label: '', ctrl: false, alt: false, shift: false});
          await browser.storage.local.set({shortcuts: [k('slower', 0.1, 'KeyS'), k('faster', 0.1, 'KeyD'), k('setSpeed', 1, 'KeyR'),
                                                       k('rewind', 10, 'KeyZ'), k('forward', 10, 'KeyX')]});
          const migrated = (await VSS.load()).shortcuts.length;                 // the original five defaults
          await browser.storage.local.set({shortcuts: [k('slower', 0.1, 'KeyS')]});
          const custom = (await VSS.load()).shortcuts.length;                   // a list the user made
          return {migrated, custom};
        """)
        check("an install still on the old defaults moves to the new ones", r["migrated"] == 12, r)
        check("a shortcut list made by the user is never touched", r["custom"] == 1, r)

        print("Settings sync")
        r = ff.ext_run("""
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          await browser.storage.local.clear(); await browser.storage.sync.clear();
          await browser.storage.local.set({presets: [1, 2, 4], overlayOpacity: 0.4});
          const mode = await VSS.setSync(true);                                  // nothing there yet: this device uploads
          const first = await browser.storage.sync.get(['presets', 'overlayOpacity']);
          await VSS.save({overlayOpacity: 0.3}); await sleep(1500);              // pushes are debounced
          const second = await browser.storage.sync.get('overlayOpacity');
          await browser.storage.sync.set({presets: [1, 3]}); await sleep(600);   // "another device" changes a setting
          const pulled = await browser.storage.local.get('presets');
          const noStats = await browser.storage.sync.get(['stats', 'skipCount', 'savedSeconds']);
          await VSS.setSync(false);
          await browser.storage.sync.set({presets: [9]}); await sleep(600);
          const afterOff = await browser.storage.local.get('presets');           // no longer followed
          await browser.storage.sync.clear();
          // enabling on a device when another one already saved settings loads them
          await browser.storage.sync.set({presets: [5]}); await browser.storage.local.set({presets: [1]});
          const mode2 = await VSS.setSync(true);
          const loaded = await browser.storage.local.get('presets');
          await VSS.setSync(false); await browser.storage.sync.clear();
          return {mode, first, second, pulled, noStats, afterOff, mode2, loaded};
        """)
        check("sync on: this device's settings are uploaded when nothing was saved yet",
              r["mode"] == "pushed" and r["first"].get("presets") == [1, 2, 4], r)
        check("sync on: later changes are pushed", r["second"].get("overlayOpacity") == 0.3, r)
        check("sync on: a change from another device arrives", r["pulled"].get("presets") == [1, 3], r)
        check("sync never carries statistics", not r["noStats"], r["noStats"])
        check("sync off: remote changes are no longer followed", r["afterOff"].get("presets") == [1, 3], r)
        check("sync on with settings already saved elsewhere: they are loaded here",
              r["mode2"] == "pulled" and r["loaded"].get("presets") == [5], r)

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
          out.syncSwitch = !!document.getElementById('syncSettings');
          out.adSpeedDisabled = document.getElementById('adSpeed').disabled;
          out.noShapes = !document.getElementById('shapeSeg');
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
        check("badge position can be picked in the 4 corners (16:9 preview only)", r["positions"] == 4 and r["noShapes"], r)
        check("sync switch exists", r["syncSwitch"])
        check("the ad speed field is disabled while its switch is off", r["adSpeedDisabled"], r)
        check("live and badge shortcuts are offered", "goLive" in r["actions"] and "toggleAlways" in r["actions"], r["actions"])

        # ------------------------------------------------------------------ reorder shortcuts + confirmation dialog
        print("Options page: reordering and confirmation")
        seed_defaults = "await browser.storage.local.clear();"
        ff.ext_run(seed_defaults)
        ff.open_ext("options/options.html", 1100, 800)
        r = ff.run(PRELUDE + """
          document.querySelector('[data-nav="shortcuts"]').click(); await sleep(150);
          const order = () => [...document.querySelectorAll('#sc .keybtn')].map((b) => b.textContent);
          const rows = () => [...document.querySelectorAll('#sc .sc-row')];
          const out = {start: order().slice(0, 4), count: order().length};      // A D R H ...
          // keyboard: the handle of the 3rd row (R) + ArrowUp
          document.querySelector('#sc [data-index="2"] .grip').dispatchEvent(
            new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true, cancelable: true}));
          await sleep(150); out.afterKey = order().slice(0, 4);                  // A R D H
          // mouse: drag the first row (A) and drop it after the 3rd (D)
          const dt = new DataTransfer();
          rows()[0].dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: dt}));
          const target = rows()[2], box = target.getBoundingClientRect();
          target.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: dt, clientY: box.bottom - 2}));
          target.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt, clientY: box.bottom - 2}));
          await sleep(200); out.afterDrop = order().slice(0, 4);                 // R D A H
          out.saved = (await browser.storage.local.get('shortcuts')).shortcuts.map((s) => s.code).slice(0, 4);
          // "Restore defaults" asks first
          const dialog = document.getElementById('confirm');
          document.getElementById('restoreSc').click(); await sleep(200); out.asked = dialog.open;
          document.getElementById('confirmNo').click(); await sleep(200);
          out.stayed = !dialog.open && order().slice(0, 4).join() === out.afterDrop.join();
          document.getElementById('restoreSc').click(); await sleep(200);
          document.getElementById('confirmYes').click(); await sleep(300);
          out.restored = order().slice(0, 4); out.restoredCount = order().length;
          return out;
        """)
        ff.frame(None)
        check("shortcuts are one list (no group headings)", r["count"] == 12 and r["start"] == ["A", "D", "R", "H"], r)
        check("handle + arrow key moves a shortcut", r["afterKey"] == ["A", "R", "D", "H"], r["afterKey"])
        check("dragging a shortcut reorders it", r["afterDrop"] == ["R", "D", "A", "H"], r["afterDrop"])
        check("the new order is saved", r["saved"] == ["KeyR", "KeyD", "KeyA", "KeyH"], r["saved"])
        check("restore defaults asks for confirmation", r["asked"], r)
        check("cancelling the dialog changes nothing", r["stayed"], r)
        check("confirming restores the defaults", r["restored"] == ["A", "D", "R", "H"] and r["restoredCount"] == 12, r)

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
        # the step before cleared the storage, so the popup shows the 5 default quick speeds
        check("popup renders chips, gear and shortcut tip", r["chips"] == 5 and r["hasGear"] and r["tip"], r)
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
