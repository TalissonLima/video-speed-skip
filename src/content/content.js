// Video Speed & Skip — content script (runs in every frame).
// Two features: playback speed control and automatic "Skip Ad" clicking.
(() => {
  if (!globalThis.VSS || window.__vssLoaded) return;
  window.__vssLoaded = true;

  const { api, DEFAULTS, MIN, MAX } = VSS;
  let cfg = { ...DEFAULTS };
  let activeVideo = null;

  const hostname = () => {
    try { return top.location.hostname; } catch { return location.hostname; }
  };
  const enabled = () => !cfg.disabledSites.includes(hostname());
  const clamp = (n) => Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));

  /* ------------------------------------------------------------------ *
   * Overlay (shadow DOM so site CSS can't touch it)
   * ------------------------------------------------------------------ */
  let overlayHost, badge, hideTimer;

  function buildOverlay() {
    overlayHost = document.createElement("div");
    overlayHost.style.cssText = "all:initial;position:fixed;z-index:2147483647;pointer-events:none;";
    const root = overlayHost.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .b{font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
           background:rgba(17,17,27,.82);backdrop-filter:blur(6px);padding:8px 12px;border-radius:10px;
           box-shadow:0 4px 16px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);
           opacity:0;transform:translateY(-4px);transition:opacity .18s,transform .18s}
        .b.on{opacity:1;transform:none}
      </style><div class="b"></div>`;
    badge = root.querySelector(".b");
  }

  function pickVideo() {
    if (activeVideo?.isConnected) return activeVideo;
    const vids = [...document.querySelectorAll("video")].filter((v) => v.readyState > 0 || !v.paused);
    const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height; };
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
    overlayHost.style.left = Math.max(8, r.left + 12) + "px";
    overlayHost.style.top = Math.max(8, r.top + 12) + "px";
    badge.textContent = text;
    badge.classList.add("on");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => badge.classList.remove("on"), 1200);
  }

  /* ------------------------------------------------------------------ *
   * Speed control
   * ------------------------------------------------------------------ */
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  function applySpeed(v) {
    if (!enabled() || near(v.playbackRate, cfg.speed)) return;
    v.__vssSetting = true;
    v.playbackRate = cfg.speed;
  }

  function setSpeed(n) {
    cfg.speed = clamp(n);
    VSS.save({ speed: cfg.speed });
    document.querySelectorAll("video").forEach(applySpeed);
    flash(cfg.speed.toFixed(2).replace(/0$/, "") + "×");
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
    if (!enabled() || near(v.playbackRate, cfg.speed)) return;
    // Sites often reset the rate right after loading a new video: undo that.
    // Otherwise treat it as the user's own choice (e.g. the site's speed menu).
    if (Date.now() - (v.__vssLoadedAt ?? 0) < 1500) applySpeed(v);
    else { cfg.speed = clamp(v.playbackRate); VSS.save({ speed: cfg.speed }); }
  }, true);

  const typing = (t) => t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "");

  document.addEventListener("keydown", (e) => {
    if (!enabled() || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const v = pickVideo();
    if (!v) return;
    switch (e.code) {
      case "KeyS": setSpeed(cfg.speed - cfg.step); break;
      case "KeyD": setSpeed(cfg.speed + cfg.step); break;
      case "KeyR": setSpeed(1); break;
      case "KeyZ": v.currentTime = Math.max(0, v.currentTime - 10); flash("−10s"); break;
      case "KeyX": v.currentTime += 10; flash("+10s"); break;
      default: return;
    }
    e.preventDefault();
  }, true);

  /* ------------------------------------------------------------------ *
   * Ad skipper
   * ------------------------------------------------------------------ */
  // Known player buttons (YouTube and friends). Safe to click when visible.
  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-slot button",
    ".videoAdUiSkipButton"
  ].join(",");

  // Generic fallback: the button's whole label must look like "Skip Ad".
  // Deliberately strict so "Skip intro" or "Skip to content" are never clicked.
  const SKIP_TEXT = new RegExp(
    "^(" + [
      "skip (the )?ads?", "skip advertisements?",
      "pular (o )?an[uú]ncios?", "pular publicidade", "pular propaganda",
      "saltar (o )?an[uú]ncios?", "saltar publicidad", "omitir anuncios?",
      "passer la pub(licit[eé])?", "werbung [uü]berspringen", "anzeige [uü]berspringen",
      "salta (la )?pubblicit[aà]"
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

  // Ignore buttons we clicked in the last 2s (they may linger while the ad closes).
  const fresh = (el) => Date.now() - (el.__vssClickedAt ?? 0) >= 2000;

  function findSkipButton() {
    for (const el of document.querySelectorAll(SKIP_SELECTORS)) if (fresh(el) && visible(el)) return el;
    if (!document.querySelector("video")) return null;
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (fresh(el) && SKIP_TEXT.test(labelOf(el)) && visible(el)) return el;
    }
    return null;
  }

  function scanForAds() {
    if (!cfg.autoSkip || !enabled()) return;
    const btn = findSkipButton();
    if (!btn) return;
    btn.__vssClickedAt = Date.now();
    btn.click();
    cfg.skipCount += 1;
    VSS.save({ skipCount: cfg.skipCount });
  }

  let scanQueued = false;
  const scheduleScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => { scanQueued = false; scanForAds(); }, 250);
  };

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"]
  });
  setInterval(scanForAds, 1000); // safety net for changes the observer can't see

  /* ------------------------------------------------------------------ *
   * Boot + live settings sync (popup / other tabs)
   * ------------------------------------------------------------------ */
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) if ("newValue" in c) cfg[k] = c.newValue;
    if ("speed" in changes) document.querySelectorAll("video").forEach(applySpeed);
  });

  VSS.load().then((loaded) => {
    cfg = loaded;
    document.querySelectorAll("video").forEach(applySpeed);
    scanForAds();
  });
})();
