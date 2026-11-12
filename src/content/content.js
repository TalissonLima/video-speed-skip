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
  let liveBoost = null;    // catch-up speed while we close the gap to a live stream

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

  // A live stream: infinite duration, or YouTube's live markers. Never fast-forward those.
  function isLive(v) {
    if (v && !Number.isFinite(v.duration)) return true;
    if (document.querySelector(".html5-video-player.ytp-live")) return true;
    const badge = document.querySelector(".ytp-live-badge");
    return !!(badge && visible(badge));
  }

  // Speed we want right now: held key > ad speed (opt-in) > live catch-up > saved speed.
  const speedNow = () => {
    if (tempSpeed !== null) return tempSpeed;
    if (cfg.adNormalSpeed && adPlaying()) return clamp(Number(cfg.adSpeed) || 1.2);
    const base = VSS.speedFor(cfg, hostname());
    return liveBoost ? Math.max(base, liveBoost) : base;
  };

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
        .b.on{opacity:var(--o,1);transform:none}
      </style><div class="b"></div>`;
    badge = root.querySelector(".b");
  }

  let alwaysShown = false; // is the badge currently pinned by "always visible"?
  let flashUntil = 0;

  // Puts the badge on the video. `force` shows it even on a paused site (the pause shortcut itself).
  function placeBadge(text, force = false) {
    if (!cfg.overlay || (!force && !enabled())) return false;
    const v = pickVideo();
    if (!v) return false;
    if (!overlayHost) buildOverlay();

    let parent = document.fullscreenElement || document.documentElement;
    if (parent instanceof HTMLVideoElement) parent = parent.parentElement || document.documentElement;
    if (overlayHost.parentNode !== parent) parent.appendChild(overlayHost);

    // 3x3 grid relative to the video: row t/m/b, column l/c/r. The middle row/column are handy for
    // vertical videos (Shorts, Reels) where the corners are covered by the site's own buttons.
    const r = v.getBoundingClientRect();
    const [row, col] = (cfg.overlayPos || "tl").split("");
    const m = 12, s = overlayHost.style;
    let tx = "0", ty = "0";
    s.left = s.right = s.top = s.bottom = "auto";
    if (col === "l") s.left = Math.max(8, r.left + m) + "px";
    else if (col === "r") s.right = Math.max(8, innerWidth - r.right + m) + "px";
    else { s.left = r.left + r.width / 2 + "px"; tx = "-50%"; }
    if (row === "t") s.top = Math.max(8, r.top + m) + "px";
    else if (row === "b") s.bottom = Math.max(8, innerHeight - r.bottom + m) + "px";
    else { s.top = r.top + r.height / 2 + "px"; ty = "-50%"; }
    s.transform = `translate(${tx}, ${ty})`;

    badge.style.fontSize = (SIZES[cfg.overlaySize] ?? 14) + "px";
    badge.style.setProperty("--o", String(cfg.overlayOpacity ?? 1));
    badge.textContent = text;
    badge.classList.add("on");
    return true;
  }

  // Shows a message briefly (or lets the always-visible badge pick the speed up again right after).
  function flash(text, force = false) {
    if (!placeBadge(text, force)) return;
    flashUntil = Date.now() + 1200;
    clearTimeout(hideTimer);
    if (!cfg.overlayAlways) hideTimer = setTimeout(() => badge.classList.remove("on"), 1200);
  }

  // "Always visible" mode: keep the current speed on the video, following it around.
  function refreshBadge() {
    if (!cfg.overlayAlways) {
      if (alwaysShown && Date.now() >= flashUntil) { alwaysShown = false; badge?.classList.remove("on"); }
      return;
    }
    alwaysShown = true;
    const v = pickVideo();
    const r = v?.getBoundingClientRect();
    const onScreen = r && r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (!(onScreen && placeBadge(fmt(speedNow())))) badge?.classList.remove("on");
  }

  /* ------------------------------------------------------------------ *
   * Speed control
   * ------------------------------------------------------------------ */
  function applySpeed(v) {
    if (!enabled()) return;
    if ("preservesPitch" in v) v.preservesPitch = true; // always keep voices natural
    else if ("mozPreservesPitch" in v) v.mozPreservesPitch = true;
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

  // Seeks made in quick succession add up on the badge: 3 x "forward 10 s" shows "+30s".
  // After 3 s without pressing, the total starts over (see shared/seek.js).
  let seekTotal = 0, seekAt = 0;
  function seekBy(v, delta) {
    const now = Date.now();
    seekTotal = VSS.seek.accumulate(seekTotal, delta, now - seekAt);
    seekAt = now;
    v.currentTime = Math.max(0, v.currentTime + delta);
    flash(VSS.seek.label(seekTotal));
  }

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
      case "toggleAlways":
        cfg.overlayAlways = !cfg.overlayAlways;
        VSS.save({ overlayAlways: cfg.overlayAlways });
        flash(cfg.overlayAlways ? "◉ ON" : "○ OFF");
        break;
      case "goLive": goLive(v); break;
      case "rewind": seekBy(v, -(n || 10)); break;
      case "forward": seekBy(v, n || 10); break;
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

  const findBySelector = (selectors) => {
    for (const el of document.querySelectorAll(selectors)) if (fresh(el) && visible(el)) return el;
    return null;
  };

  // Buttons recognised by their label. Anything inside a YouTube player is left to the known-selector
  // path (and never clicked, see assistSkip below).
  const findByText = (text) => {
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (fresh(el) && !el.matches(AD_SELECTORS) && !el.closest(".html5-video-player") &&
          text.test(labelOf(el)) && visible(el)) return el;
    }
    return null;
  };

  const find = (selectors, text) => findBySelector(selectors) ?? findByText(text);

  function click(el) {
    el.__vssClickedAt = Date.now();
    el.click();
  }

  // Why we do NOT click on YouTube. Its player code (base.js) rejects a Skip click whose event is not
  // trusted: the button's onClick calls a check that treats `event.isTrusted === false` (every click made
  // by a script) as an "abnormality", does not skip the ad and reports the attempt. Seeking inside an ad
  // is reported too, so jumping to the end of an ad is out as well.
  // What a script can honestly do: put keyboard focus on the Skip button, so the user's own Enter or
  // Space (a trusted event) skips the ad.
  let hintedBtn = null;
  function assistSkip(btn) {
    if (hintedBtn === btn) return; // once per appearance of the button
    hintedBtn = btn;
    try { btn.focus({ preventScroll: true }); } catch { /* ignore */ }
    flash("⏭ ⏎");
  }

  // Other sites (no such check): click, then make sure the button went away before counting a skip.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const gone = (btn) => !btn.isConnected || !visible(btn);

  async function skipAd(btn) {
    btn.__vssClickedAt = Date.now() + 3000; // keep other scans away while we verify
    btn.click();
    await wait(900);
    btn.__vssClickedAt = Date.now();
    if (gone(btn)) recordStats({ ads: 1 });
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
    if (hintedBtn && (!hintedBtn.isConnected || !visible(hintedBtn))) hintedBtn = null;
    if (cfg.autoSkip) {
      const known = findBySelector(AD_SELECTORS); // YouTube & co: never clicked, only highlighted
      if (known) assistSkip(known);
      const generic = findByText(AD_TEXT);        // other sites: a verified click
      if (generic) skipAd(generic);
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
      if (v && v.playbackRate > 1 && !liveBoost) pendingSaved += (v.playbackRate - 1) * dt; // catching up isn't "saved"
    }
    if (pendingSaved >= 5) flushSaved();
  }
  /* ------------------------------------------------------------------ *
   * Live streams: jump to the live edge, or (opt-in) catch up to it by playing a bit faster
   * ------------------------------------------------------------------ */
  const liveEdge = (v) => VSS.live.edge(v.seekable);

  function goLive(v) {
    const edge = liveEdge(v);
    if (!isLive(v) || !Number.isFinite(edge)) return;
    v.currentTime = Math.max(0, edge - 0.5);
    flash("● LIVE");
  }

  // The thresholds live in shared/live.js. A stream watched far behind on purpose is left alone, and
  // nothing happens while the video is paused (mainPlaying() is null then).
  function liveTick() {
    const v = cfg.liveCatchUp && enabled() ? mainPlaying() : null;
    const lag = v && isLive(v) ? liveEdge(v) - v.currentTime : NaN;
    const action = VSS.live.decide(lag, liveBoost !== null);
    if (action === "stop") { liveBoost = null; applyAll(); }
    else if (action === "start") { liveBoost = clamp(Number(cfg.liveCatchUpSpeed) || 1.25); applyAll(); }
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
    setInterval(liveTick, 1000);
    setInterval(refreshBadge, 400); // only does work while "always visible" is on
    applyAll();
    scan();
  }

  /* ------------------------------------------------------------------ *
   * Boot + live settings sync (popup / options page / other tabs)
   * ------------------------------------------------------------------ */
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) if ("newValue" in c) cfg[k] = c.newValue;
    if (["speed", "siteSpeeds", "speedScope", "adNormalSpeed", "adSpeed", "disabledSites"].some((k) => k in changes)) applyAll();
  });

  listen(document);
  VSS.load().then((loaded) => {
    cfg = loaded;
    if (active) applyAll();           // a video fired events before the settings were loaded
    else if (hasVideo()) activate();
    else armObserver.observe(document.documentElement, { subtree: true, childList: true });
  });
})();
