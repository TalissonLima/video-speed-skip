// Video Speed & Skip — content script (runs in every frame).
// Features: per-site playback speed, shortcuts (incl. hold / toggle),
// automatic "Skip Ad" and optional "Skip Intro" clicking, time-saved stats.
(() => {
  if (!globalThis.VSS || window.__vssLoaded) return;
  window.__vssLoaded = true;

  const { api, DEFAULTS, MIN, MAX } = VSS;
  let cfg = { ...DEFAULTS };
  let activeVideo = null;
  let tempSpeed = null;    // speed while a "hold" key is down (never saved)
  let held = null;         // { code } of the held key
  let beforeToggle = null; // speed to return to when a "toggle" shortcut is pressed again

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  // The hostname of the tab (not of the iframe) is the key for per-site speed.
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
  const speedNow = () => tempSpeed ?? VSS.speedFor(cfg, hostname());

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

  function pickVideo() {
    if (activeVideo?.isConnected) return activeVideo;
    const vids = [...document.querySelectorAll("video")].filter((v) => v.readyState > 0 || !v.paused);
    vids.sort((a, b) => (Number(!b.paused) - Number(!a.paused)) || area(b) - area(a));
    return vids[0] ?? null;
  }

  function flash(text) {
    if (!cfg.overlay || !enabled()) return;
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
  const applyAll = () => document.querySelectorAll("video").forEach(applySpeed);

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

  const mark = (e) => { if (e.target instanceof HTMLVideoElement) e.target.__vssLoadedAt = Date.now(); };

  // Media events don't bubble, but they can be captured on the document.
  for (const type of ["loadstart", "emptied", "loadedmetadata"]) {
    document.addEventListener(type, (e) => { mark(e); if (e.target instanceof HTMLVideoElement) applySpeed(e.target); }, true);
  }
  for (const type of ["play", "playing"]) {
    document.addEventListener(type, (e) => {
      if (!(e.target instanceof HTMLVideoElement)) return;
      activeVideo = e.target;
      applySpeed(e.target);
    }, true);
  }

  document.addEventListener("ratechange", (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    if (v.__vssSetting) { v.__vssSetting = false; return; }
    if (!enabled() || tempSpeed !== null || near(v.playbackRate, speedNow())) return;
    // Sites often reset the rate right after loading a new video: undo that.
    // Otherwise treat it as the user's own choice (e.g. the site's speed menu).
    if (Date.now() - (v.__vssLoadedAt ?? 0) < 1500) applySpeed(v);
    else persist(clamp(v.playbackRate));
  }, true);

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

  document.addEventListener("keydown", (e) => {
    if (!enabled() || e.metaKey || typing(e.target)) return;
    const sc = cfg.shortcuts.find((s) =>
      s.code && s.code === e.code &&
      !!s.ctrl === e.ctrlKey && !!s.alt === e.altKey && !!s.shift === e.shiftKey);
    if (!sc) return;
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
    if (!document.querySelector("video")) return null;
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (fresh(el) && text.test(labelOf(el)) && visible(el)) return el;
    }
    return null;
  }

  function click(el) {
    el.__vssClickedAt = Date.now();
    el.click();
  }

  function scan() {
    if (!enabled()) return;
    if (cfg.autoSkip) {
      const btn = find(AD_SELECTORS, AD_TEXT);
      if (btn) {
        click(btn);
        cfg.skipCount += 1;
        VSS.save({ skipCount: cfg.skipCount });
      }
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

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"]
  });
  setInterval(scan, 1000); // safety net for changes the observer can't see

  /* ------------------------------------------------------------------ *
   * Time saved: while the main video plays faster than 1x, every second of
   * real time saves (rate - 1) seconds. Flushed to storage in batches.
   * ------------------------------------------------------------------ */
  let pendingSaved = 0;
  let lastTick = performance.now();

  function mainPlaying() {
    let best = null, bestArea = 200 * 100; // ignore tiny previews
    for (const v of document.querySelectorAll("video")) {
      if (v.paused || v.ended || v.readyState < 3) continue;
      const a = area(v);
      if (a > bestArea) { best = v; bestArea = a; }
    }
    return best;
  }

  function flushSaved() {
    if (pendingSaved <= 0) return;
    cfg.savedSeconds = Math.round((cfg.savedSeconds + pendingSaved) * 10) / 10;
    pendingSaved = 0;
    VSS.save({ savedSeconds: cfg.savedSeconds });
  }

  setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 5);
    lastTick = now;
    if (enabled()) {
      const v = mainPlaying();
      if (v && v.playbackRate > 1) pendingSaved += (v.playbackRate - 1) * dt;
    }
    if (pendingSaved >= 5) flushSaved();
  }, 1000);
  addEventListener("pagehide", flushSaved);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushSaved(); });

  /* ------------------------------------------------------------------ *
   * Boot + live settings sync (popup / other tabs)
   * ------------------------------------------------------------------ */
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) if ("newValue" in c) cfg[k] = c.newValue;
    if (["speed", "siteSpeeds", "speedScope", "preservePitch"].some((k) => k in changes)) applyAll();
  });

  VSS.load().then((loaded) => {
    cfg = loaded;
    applyAll();
    scan();
  });
})();
