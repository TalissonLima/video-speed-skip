// Video Speed & Skip — content script (runs in every frame).
// Features: per-site playback speed, shortcuts (incl. hold / toggle / pause site),
// automatic "Skip Ad" and optional "Skip Intro" clicking, normal speed during ads,
// time-saved stats.
//
// Performance: on a page without a <video> this script only keeps one cheap, throttled
// observer. The heavy work (timers, attribute observer, scanning) starts the moment a
// video shows up (see activate()).
(() => {
  if (!globalThis.VSS || window.__vssLoaded) return;
  window.__vssLoaded = true;

  const { api, DEFAULTS, MIN, MAX } = VSS;
  let cfg = { ...DEFAULTS };
  let activeVideo = null;
  let tempSpeed = null;    // speed while a "hold" key is down (never saved)
  let held = null;         // { code } of the held key
  let beforeToggle = null; // speed to return to when a "toggle" shortcut is pressed again
  let active = false;      // false until the page actually has a video
  let lastAd = false;      // was an ad playing at the last scan?
  let adChangedAt = 0;     // when an ad started/ended (to ignore the site's own rate resets)

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  // The hostname of the tab (not of the iframe) is the key for per-site settings.
  let cachedHost;
  const hostname = () => (cachedHost ??= (() => {
    try { return top.location.hostname; } catch { /* cross-origin frame */ }
    const o = location.ancestorOrigins; // Chrome only
    if (o?.length) { try { return new URL(o[o.length - 1]).hostname; } catch { /* ignore */ } }
    return location.hostname;
  })());

  const enabled = () => !cfg.disabledSites.includes(hostname());
  const clamp = (n) => Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const fmt = (n) => n.toFixed(2).replace(/\.?0+$/, "") + "×";
  const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height; };

  // YouTube marks its player while an ad is playing.
  const AD_PLAYING = ".html5-video-player.ad-showing, .html5-video-player.ad-interrupting";
  const adPlaying = () => !!document.querySelector(AD_PLAYING);

  // Speed we want right now: held key > normal speed during ads > saved speed.
  const speedNow = () =>
    tempSpeed ?? (cfg.adNormalSpeed && adPlaying() ? 1 : VSS.speedFor(cfg, hostname()));

  /* ------------------------------------------------------------------ *
   * Finding videos (also inside open shadow roots, e.g. web-component players)
   * ------------------------------------------------------------------ */
  const roots = [];            // open shadow roots we listen on
  const seenRoots = new WeakSet();
  let lastShadowScan = 0;

  function scanShadows(force = false) {
    const now = Date.now();
    if (!force && now - lastShadowScan < 1500) return;
    lastShadowScan = now;
    const visit = (scope) => {
      for (const el of scope.querySelectorAll("*")) {
        const sr = el.shadowRoot;
        if (sr && !seenRoots.has(sr)) {
          seenRoots.add(sr);
          roots.push(sr);
          listen(sr);
        }
      }
    };
    visit(document);
    for (let i = 0; i < roots.length; i++) visit(roots[i]); // roots grows while we iterate: nested shadows
  }

  function allVideos() {
    const out = [...document.querySelectorAll("video")];
    for (const r of roots) if (r.host.isConnected) out.push(...r.querySelectorAll("video"));
    return out;
  }

  function pickVideo() {
    if (activeVideo?.isConnected) return activeVideo;
    const vids = allVideos().filter((v) => v.readyState > 0 || !v.paused);
    vids.sort((a, b) => (Number(!b.paused) - Number(!a.paused)) || area(b) - area(a));
    return vids[0] ?? null;
  }

  /* ------------------------------------------------------------------ *
   * Overlay (shadow DOM so site CSS can't touch it)
   * ------------------------------------------------------------------ */
  const SIZES = { s: 12, m: 14, l: 18 };
  let overlayHost, badge, hideTimer;

  function buildOverlay() {
    overlayHost = document.createElement("div");
    overlayHost.style.cssText = "all:initial;position:fixed;z-index:2147483647;pointer-events:none;";
    const root = overlayHost.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .b{font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
           background:rgba(17,17,27,.82);backdrop-filter:blur(6px);padding:.57em .86em;border-radius:.72em;
           box-shadow:0 4px 16px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);
           opacity:0;transform:translateY(-4px);transition:opacity .18s,transform .18s}
        .b.on{opacity:1;transform:none}
      </style><div class="b"></div>`;
    badge = root.querySelector(".b");
  }

  // `force` shows the badge even on a paused site (used by the pause shortcut itself).
  function flash(text, force = false) {
    if (!cfg.overlay || (!force && !enabled())) return;
    const v = pickVideo();
    if (!v) return;
    if (!overlayHost) buildOverlay();

    let parent = document.fullscreenElement || document.documentElement;
    if (parent instanceof HTMLVideoElement) parent = parent.parentElement || document.documentElement;
    if (overlayHost.parentNode !== parent) parent.appendChild(overlayHost);

    const r = v.getBoundingClientRect();
    const pos = cfg.overlayPos || "tl";
    const m = 12, s = overlayHost.style;
    s.left = s.right = s.top = s.bottom = "auto";
    if (pos[1] === "l") s.left = Math.max(8, r.left + m) + "px";
    else s.right = Math.max(8, innerWidth - r.right + m) + "px";
    if (pos[0] === "t") s.top = Math.max(8, r.top + m) + "px";
    else s.bottom = Math.max(8, innerHeight - r.bottom + m) + "px";

    badge.style.fontSize = (SIZES[cfg.overlaySize] ?? 14) + "px";
    badge.textContent = text;
    badge.classList.add("on");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => badge.classList.remove("on"), 1200);
  }

  /* ------------------------------------------------------------------ *
   * Speed control
   * ------------------------------------------------------------------ */
  function applySpeed(v) {
    if (!enabled()) return;
    if ("preservesPitch" in v) v.preservesPitch = !!cfg.preservePitch;
    else if ("mozPreservesPitch" in v) v.mozPreservesPitch = !!cfg.preservePitch;
    const want = speedNow();
    if (near(v.playbackRate, want)) return;
    v.__vssSetting = true;
    v.playbackRate = want;
  }
  const applyAll = () => allVideos().forEach(applySpeed);

  // Save a speed for this site (or globally, depending on the scope setting).
  function persist(n) {
    const patch = VSS.speedPatch(cfg, hostname(), n);
    Object.assign(cfg, patch);
    VSS.save(patch);
  }

  function setSpeed(n) {
    n = clamp(n);
    tempSpeed = null;
    held = null;
    persist(n);
    applyAll();
    flash(fmt(n));
  }

  // Media events don't bubble, but they can be captured on the document / a shadow root.
  const isVideo = (e) => e.target instanceof HTMLVideoElement;

  function onLoad(e) {
    if (!isVideo(e)) return;
    if (!active) activate();
    e.target.__vssLoadedAt = Date.now();
    applySpeed(e.target);
  }

  function onPlay(e) {
    if (!isVideo(e)) return;
    if (!active) activate();
    activeVideo = e.target;
    applySpeed(e.target);
  }

  function onRate(e) {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    if (v.__vssSetting) { v.__vssSetting = false; return; }
    if (!enabled() || tempSpeed !== null || near(v.playbackRate, speedNow())) return;
    // Never learn a speed from the ad player or right after an ad starts/ends, and undo
    // the resets sites do right after loading a new video. Anything else is the user's
    // own choice (e.g. the site's speed menu), so remember it.
    if (adPlaying() || Date.now() - adChangedAt < 1500 || Date.now() - (v.__vssLoadedAt ?? 0) < 1500) applySpeed(v);
    else persist(clamp(v.playbackRate));
  }

  function listen(target) {
    for (const type of ["loadstart", "emptied", "loadedmetadata"]) target.addEventListener(type, onLoad, true);
    for (const type of ["play", "playing"]) target.addEventListener(type, onPlay, true);
    target.addEventListener("ratechange", onRate, true);
  }

  /* ------------------------------------------------------------------ *
   * Keyboard shortcuts
   * ------------------------------------------------------------------ */
  const typing = (t) => t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "");

  function releaseHold() {
    if (!held) return;
    held = null;
    tempSpeed = null;
    applyAll();
    flash(fmt(speedNow()));
  }
  document.addEventListener("keyup", (e) => { if (held && e.code === held.code) releaseHold(); }, true);
  addEventListener("blur", releaseHold);

  function toggleSite() {
    const host = hostname();
    const set = new Set(cfg.disabledSites);
    const nowOff = !set.has(host);
    if (nowOff) set.add(host); else set.delete(host);
    cfg.disabledSites = [...set];
    VSS.save({ disabledSites: cfg.disabledSites });
    if (!nowOff) applyAll();
    flash(nowOff ? "⏸ OFF" : "▶ ON", true);
  }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || typing(e.target)) return;
    const sc = cfg.shortcuts.find((s) =>
      s.code && s.code === e.code &&
      !!s.ctrl === e.ctrlKey && !!s.alt === e.altKey && !!s.shift === e.shiftKey);
    if (!sc) return;

    if (sc.action === "toggleSite") { // works even while the site is paused
      toggleSite();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!enabled()) return;
    const v = pickVideo();
    if (!v) return;
    const n = Number(sc.value);
    switch (sc.action) {
      case "slower": setSpeed(speedNow() - (n || 0.1)); break;
      case "faster": setSpeed(speedNow() + (n || 0.1)); break;
      case "setSpeed": setSpeed(n || 1); break;
      case "toggle": {
        const target = clamp(n || 2);
        if (near(speedNow(), target)) setSpeed(beforeToggle ?? 1);
        else { beforeToggle = speedNow(); setSpeed(target); }
        break;
      }
      case "hold":
        if (!held) { // ignore key auto-repeat
          held = { code: e.code };
          tempSpeed = clamp(n || 2);
          applyAll();
          flash(fmt(tempSpeed));
        }
        break;
      case "toggleSkip":
        cfg.autoSkip = !cfg.autoSkip;
        VSS.save({ autoSkip: cfg.autoSkip });
        flash(cfg.autoSkip ? "⏭ ON" : "⏭ OFF");
        break;
      case "rewind": v.currentTime = Math.max(0, v.currentTime - (n || 10)); flash(`−${n || 10}s`); break;
      case "forward": v.currentTime += n || 10; flash(`+${n || 10}s`); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation(); // keep the site's own handler for this key from also firing
  }, true);

  /* ------------------------------------------------------------------ *
   * Skip buttons
   * ------------------------------------------------------------------ */
  // Known player buttons (YouTube and friends). Safe to click when visible.
  const AD_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-slot button",
    ".videoAdUiSkipButton"
  ].join(",");

  // Generic fallback: the button's whole label must look like "Skip Ad".
  // Deliberately strict so "Skip intro" or "Skip to content" are never clicked as ads.
  const AD_TEXT = new RegExp(
    "^(" + [
      "skip (the )?ads?", "skip advertisements?",
      "pular (o )?an[uú]ncios?", "pular publicidade", "pular propaganda",
      "saltar (o )?an[uú]ncios?", "saltar publicidad", "omitir anuncios?",
      "passer la pub(licit[eé])?", "werbung [uü]berspringen", "anzeige [uü]berspringen",
      "salta (la )?pubblicit[aà]"
    ].join("|") + ")$", "i");

  // Optional: intros / recaps on streaming sites.
  const INTRO_SELECTORS = [
    '[data-uia="player-skip-intro"]',
    '[data-uia="player-skip-recap"]',
    ".atvwebplayersdk-skipelement-button"
  ].join(",");

  const INTRO_TEXT = new RegExp(
    "^(" + [
      "skip (the )?(intro|recap|opening|credits|previously)",
      "pular (a )?(abertura|introdu[cç][aã]o|intro|recapitula[cç][aã]o|resumo|cr[eé]ditos)",
      "saltar (la )?(intro(ducci[oó]n)?|resumen|cr[eé]ditos)",
      "omitir (la )?(intro(ducci[oó]n)?|resumen)"
    ].join("|") + ")$", "i");

  const labelOf = (el) =>
    (el.getAttribute("aria-label") || el.textContent || "")
      .replace(/[»›>▶⏭]/g, "").replace(/\s+/g, " ").trim();

  const visible = (el) => {
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Ignore buttons we clicked in the last 2s (they may linger while the player closes them).
  const fresh = (el) => Date.now() - (el.__vssClickedAt ?? 0) >= 2000;

  function find(selectors, text) {
    for (const el of document.querySelectorAll(selectors)) if (fresh(el) && visible(el)) return el;
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (fresh(el) && text.test(labelOf(el)) && visible(el)) return el;
    }
    return null;
  }

  function click(el) {
    el.__vssClickedAt = Date.now();
    el.click();
  }

  // YouTube ignores clicks made by scripts (their events have isTrusted === false), so "we clicked"
  // does not mean "the ad was skipped". Every ad skip is therefore verified before it is counted,
  // and when the click is ignored we escalate: fuller pointer events, then (opt-in) jumping to the
  // end of the ad. Only ever done while the Skip button is showing, i.e. when the ad is skippable.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const gone = (btn) => !btn.isConnected || !visible(btn); // the button vanished: the ad moved on

  function pointerClick(el) {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: window, button: 0,
                   clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const [Ctor, type] of [[PointerEvent, "pointerdown"], [MouseEvent, "mousedown"],
                                [PointerEvent, "pointerup"], [MouseEvent, "mouseup"], [MouseEvent, "click"]]) {
      el.dispatchEvent(new Ctor(type, init));
    }
  }

  const adVideo = () =>
    document.querySelector(".html5-video-player.ad-showing video, .html5-video-player.ad-interrupting video");

  async function recordSkipFailure() {
    try {
      const { skipFails = 0 } = await api.storage.local.get("skipFails");
      await VSS.save({ skipFails: skipFails + 1 });
    } catch { /* extension was reloaded */ }
  }

  async function skipAd(btn) {
    const onYouTube = adPlaying();
    btn.__vssClickedAt = Date.now() + 6000; // keep other scans away from this button while we work on it
    btn.click();
    await wait(900);
    if (gone(btn)) return recordStats({ ads: 1 });
    if (!onYouTube) {                       // other sites: a click is all we can do
      btn.__vssClickedAt = Date.now();
      return;
    }

    pointerClick(btn);
    await wait(900);
    if (gone(btn)) return recordStats({ ads: 1 });

    if (cfg.adSkipFallback) {
      const v = adVideo();
      if (v && Number.isFinite(v.duration) && v.duration > 0) {
        v.currentTime = v.duration;
        await wait(1200);
        if (gone(btn) || !adPlaying()) return recordStats({ ads: 1 });
      }
    }
    btn.__vssClickedAt = Date.now() + 18000; // don't hammer the same ad
    recordSkipFailure();
  }

  // Runs on DOM changes and once a second while the page has a video.
  function scan() {
    if (!active) return;
    scanShadows();

    // When an ad starts or ends, move videos to the right speed straight away.
    const ad = adPlaying();
    if (ad !== lastAd) {
      lastAd = ad;
      adChangedAt = Date.now();
      applyAll();
    }

    if (!enabled()) return;
    if (cfg.autoSkip) {
      const btn = find(AD_SELECTORS, AD_TEXT);
      if (btn) skipAd(btn);
    }
    if (cfg.skipIntro) {
      const btn = find(INTRO_SELECTORS, INTRO_TEXT);
      if (btn) click(btn);
    }
  }

  let scanQueued = false;
  const scheduleScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => { scanQueued = false; scan(); }, 250);
  };

  /* ------------------------------------------------------------------ *
   * Stats: time saved while the main video plays faster than 1x
   * (every second of real time saves (rate - 1) seconds), flushed in batches.
   * ------------------------------------------------------------------ */
  let pendingSaved = 0;
  let lastTick = performance.now();

  function mainPlaying() {
    let best = null, bestArea = 200 * 100; // ignore tiny previews
    for (const v of allVideos()) {
      if (v.paused || v.ended || v.readyState < 3) continue;
      const a = area(v);
      if (a > bestArea) { best = v; bestArea = a; }
    }
    return best;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Lifetime totals + per-day and per-site breakdown for the dashboard. Always
  // reads fresh values so several frames/tabs don't overwrite each other.
  async function recordStats({ saved = 0, ads = 0 }) {
    try {
      const cur = await api.storage.local.get(["stats", "savedSeconds", "skipCount"]);
      const st = cur.stats ?? {};
      st.daily ??= {};
      st.sites ??= {};
      const r1 = (n) => Math.round(n * 10) / 10;
      const day = (st.daily[todayKey()] ??= { s: 0, a: 0 });
      const site = (st.sites[hostname()] ??= { s: 0, a: 0 });
      day.s = r1(day.s + saved); day.a += ads;
      site.s = r1(site.s + saved); site.a += ads;

      const days = Object.keys(st.daily).sort(); // keep the last 90 days
      while (days.length > 90) delete st.daily[days.shift()];
      const hosts = Object.keys(st.sites);      // keep the 100 most relevant sites
      if (hosts.length > 100) {
        const score = (h) => st.sites[h].s + st.sites[h].a * 30;
        hosts.sort((x, y) => score(x) - score(y)).slice(0, hosts.length - 100).forEach((h) => delete st.sites[h]);
      }
      await VSS.save({
        stats: st,
        savedSeconds: r1((cur.savedSeconds ?? 0) + saved),
        skipCount: (cur.skipCount ?? 0) + ads
      });
    } catch { /* extension was reloaded while this page was open */ }
  }

  function flushSaved() {
    if (pendingSaved <= 0) return;
    const saved = pendingSaved;
    pendingSaved = 0;
    recordStats({ saved });
  }

  function tickStats() {
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 5);
    lastTick = now;
    if (enabled()) {
      const v = mainPlaying();
      if (v && v.playbackRate > 1) pendingSaved += (v.playbackRate - 1) * dt;
    }
    if (pendingSaved >= 5) flushSaved();
  }
  addEventListener("pagehide", flushSaved);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushSaved(); });

  /* ------------------------------------------------------------------ *
   * Lazy start: do nothing heavy until the page has a video
   * ------------------------------------------------------------------ */
  function hasVideo() {
    if (document.querySelector("video")) return true;
    scanShadows(true);
    return roots.some((r) => r.host.isConnected && r.querySelector("video"));
  }

  // Cheap watcher used only while there is no video yet (child additions, throttled).
  let armTimer = null;
  const armObserver = new MutationObserver(() => {
    if (armTimer) return;
    armTimer = setTimeout(() => {
      armTimer = null;
      if (!active && hasVideo()) activate();
    }, 500);
  });

  function activate() {
    if (active) return;
    active = true;
    armObserver.disconnect();
    new MutationObserver(scheduleScan).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"]
    });
    setInterval(scan, 1000);       // safety net for changes the observer can't see
    setInterval(tickStats, 1000);
    applyAll();
    scan();
  }

  /* ------------------------------------------------------------------ *
   * Boot + live settings sync (popup / options page / other tabs)
   * ------------------------------------------------------------------ */
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) if ("newValue" in c) cfg[k] = c.newValue;
    if (["speed", "siteSpeeds", "speedScope", "preservePitch", "adNormalSpeed", "disabledSites"].some((k) => k in changes)) applyAll();
  });

  listen(document);
  VSS.load().then((loaded) => {
    cfg = loaded;
    if (active) applyAll();           // a video fired events before the settings were loaded
    else if (hasVideo()) activate();
    else armObserver.observe(document.documentElement, { subtree: true, childList: true });
  });
})();
