(async () => {
  const { api, MIN, MAX } = VSS;
  const ui = VSS.ui;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cfg = await VSS.load();

  let lang = ui.resolveLang(cfg.lang);
  const t = ui.makeT(() => lang);
  const num = (n) => n.toLocaleString(ui.LOCALES[lang]);
  const clampSpeed = (n) => Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>';
  function removeButton(onClick) {
    const btn = el("button", "x");
    btn.innerHTML = TRASH;
    btn.title = t("remove");
    btn.setAttribute("aria-label", t("remove"));
    btn.onclick = onClick;
    return btn;
  }
  const valueGroup = (input, unit) => {
    const g = el("span", "valwrap");
    g.append(input, el("span", "unit", unit));
    return g;
  };

  /* ---- saving + feedback ---- */
  let toastTimer;
  function toast(msg = t("saved")) {
    const box = $("#toast");
    box.textContent = msg;
    box.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("on"), 1400);
  }
  function save(patch, quiet) {
    Object.assign(cfg, patch);
    VSS.save(patch);
    if (!quiet) toast();
  }

  // Two-step button: the first click asks for confirmation, the second runs the action.
  function confirmable(btn, labelKey, action) {
    let armed = false, timer;
    btn.onclick = () => {
      if (!armed) {
        armed = true;
        btn.textContent = t("confirmClick");
        timer = setTimeout(() => { armed = false; btn.textContent = t(labelKey); }, 3000);
        return;
      }
      clearTimeout(timer);
      armed = false;
      btn.textContent = t(labelKey);
      action();
    };
  }

  /* ---- navigation (hash based) ---- */
  const SECTIONS = ["dashboard", "shortcuts", "speed", "skip", "appearance", "data"];
  function route() {
    const id = SECTIONS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
    $$("[data-section]").forEach((s) => (s.hidden = s.id !== id));
    $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === id));
    scrollTo(0, 0);
    if (id === "dashboard") renderDashboard();
  }
  addEventListener("hashchange", route);
  addEventListener("popstate", route);
  $$("[data-nav]").forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault(); // no anchor jump: the page always starts at the top of the section
      history.pushState(null, "", "#" + a.dataset.nav);
      route();
    };
  });

  /* ================================================================== *
   * Dashboard
   * ================================================================== */
  let metric = "s"; // s = seconds saved, a = ads skipped
  let range = 14;

  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(dayKey(d));
    }
    return out;
  }

  function renderDashboard() {
    const st = cfg.stats;
    const keys = lastDays(range);
    const today = st.daily[keys[keys.length - 1]] ?? { s: 0, a: 0 };
    const fmtV = (v) => (metric === "s" ? ui.fmtDuration(v) : num(v));

    $("#kSaved").textContent = ui.fmtDuration(cfg.savedSeconds);
    $("#kToday").textContent = ui.fmtDuration(today.s);
    $("#kAds").textContent = num(cfg.skipCount);
    $("#kSites").textContent = num(Object.keys(cfg.siteSpeeds).length);
    $$("#metricSeg button").forEach((b) => b.classList.toggle("on", b.dataset.metric === metric));
    $$("#rangeSeg button").forEach((b) => b.classList.toggle("on", Number(b.dataset.range) === range));

    // Bar chart: one column per day.
    const chart = $("#chart");
    chart.textContent = "";
    const vals = keys.map((k) => st.daily[k]?.[metric] ?? 0);
    const max = Math.max(0, ...vals);
    if (!max) {
      chart.append(el("div", "empty", t("noData")));
    } else {
      const grid = el("div", "gridline");
      grid.append(el("span", "", fmtV(max)));
      chart.append(grid);
      keys.forEach((k, i) => {
        const col = el("div", "col" + (i === keys.length - 1 ? " today" : ""));
        col.title = `${k} · ${fmtV(vals[i])}`;
        const wrap = el("div", "bar-wrap");
        const bar = el("div", "bar" + (vals[i] ? "" : " zero"));
        bar.style.height = vals[i] ? Math.max(3, (vals[i] / max) * 100) + "%" : "2px";
        wrap.append(bar);
        const date = new Date(k + "T00:00");
        const monthMark = i === 0 || date.getDate() === 1; // show the month where it changes
        const label = el("small", "",
          range === 7
            ? date.toLocaleDateString(ui.LOCALES[lang], { weekday: "short" })
            : monthMark
              ? date.toLocaleDateString(ui.LOCALES[lang], { day: "numeric", month: "short" })
              : String(date.getDate()));
        if (range > 14 && i % 3 !== 0 && !monthMark) label.style.visibility = "hidden";
        col.append(wrap, label);
        chart.append(col);
      });
    }

    // Top sites for the selected metric (all time).
    const top = $("#top");
    top.textContent = "";
    const rows = Object.entries(st.sites)
      .map(([host, v]) => [host, v[metric] ?? 0])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (!rows.length) top.append(el("div", "muted-text", t("noData")));
    rows.forEach(([host, v]) => {
      const row = el("div", "top-row");
      const track = el("div", "track");
      const fill = el("div", "fill");
      fill.style.width = Math.max(3, (v / rows[0][1]) * 100) + "%";
      track.append(fill);
      row.append(el("span", "name", host), track, el("span", "val", fmtV(v)));
      top.append(row);
    });
  }

  $$("#metricSeg button").forEach((b) => (b.onclick = () => { metric = b.dataset.metric; renderDashboard(); }));
  $$("#rangeSeg button").forEach((b) => (b.onclick = () => { range = Number(b.dataset.range); renderDashboard(); }));
  confirmable($("#resetStats"), "resetStats", () => {
    save({ stats: { daily: {}, sites: {} }, savedSeconds: 0, skipCount: 0 });
    renderDashboard();
  });

  /* ================================================================== *
   * Shortcuts
   * ================================================================== */
  const ACTIONS = {
    slower: ["aSlower", "hSlower", "×", 0.1], faster: ["aFaster", "hFaster", "×", 0.1],
    setSpeed: ["aSet", "hSet", "×", 1], hold: ["aHold", "hHold", "×", 2],
    toggle: ["aToggle", "hToggle", "×", 2], toggleSkip: ["aToggleSkip", "hToggleSkip", "", 0],
    toggleSite: ["aToggleSite", "hToggleSite", "", 0],
    rewind: ["aBack", "hBack", "s", 10], forward: ["aForward", "hForward", "s", 10]
  };
  const MODIFIER_CODES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;
  const saveShortcuts = () => save({ shortcuts: cfg.shortcuts });

  function captureKey(index, btn) {
    btn.textContent = t("pressKey");
    btn.classList.add("rec");
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (MODIFIER_CODES.test(e.code)) return; // wait for the real key
      removeEventListener("keydown", onKey, true);
      if (e.code !== "Escape") {
        Object.assign(cfg.shortcuts[index], {
          code: e.code, label: ui.keyLabel(e), ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey
        });
        saveShortcuts();
      }
      renderShortcuts();
    };
    addEventListener("keydown", onKey, true);
  }

  function renderShortcuts() {
    const box = $("#sc");
    box.textContent = "";
    const counts = {};
    cfg.shortcuts.forEach((s) => { if (s.code) counts[ui.combo(s)] = (counts[ui.combo(s)] || 0) + 1; });

    cfg.shortcuts.forEach((s, i) => {
      const wrap = el("div", "sc-row");
      const row = el("div", "sc");

      const key = el("button", "keybtn" + (counts[ui.combo(s)] > 1 ? " dup" : ""), ui.combo(s));
      key.onclick = () => captureKey(i, key);

      const sel = el("select");
      for (const [action, [label]] of Object.entries(ACTIONS)) sel.add(new Option(t(label), action));
      sel.value = s.action;
      sel.onchange = () => {
        s.action = sel.value;
        s.value = ACTIONS[s.action][3];
        saveShortcuts();
        renderShortcuts();
      };

      const val = el("input");
      val.type = "number";
      val.min = "0.05";
      val.step = "0.05";
      val.value = s.value;
      val.oninput = () => {
        const n = Number(val.value);
        if (n > 0) { s.value = n; saveShortcuts(); }
      };
      const group = valueGroup(val, ACTIONS[s.action][2]);
      group.style.visibility = s.action === "toggleSkip" || s.action === "toggleSite" ? "hidden" : "";

      const del = removeButton(() => { cfg.shortcuts.splice(i, 1); saveShortcuts(); renderShortcuts(); });

      row.append(key, sel, group, del);
      wrap.append(row, el("div", "sc-hint", t(ACTIONS[s.action][1])));
      box.append(wrap);
    });
  }

  $("#addSc").onclick = () => {
    cfg.shortcuts.push({ action: "setSpeed", value: 2, code: "", label: "", ctrl: false, alt: false, shift: false });
    saveShortcuts();
    renderShortcuts();
    $("#sc").lastElementChild?.querySelector(".keybtn").click(); // go straight to "press a key"
  };
  $("#restoreSc").onclick = () => {
    cfg.shortcuts = structuredClone(VSS.DEFAULT_SHORTCUTS);
    saveShortcuts();
    renderShortcuts();
  };

  /* ================================================================== *
   * Speed
   * ================================================================== */
  function renderSpeed() {
    $$("#scope .choice").forEach((c) => c.classList.toggle("on", c.dataset.scope === cfg.speedScope));
    $("#presets").value = cfg.presets.join(", ");

    const list = $("#siteList");
    list.textContent = "";
    const hosts = Object.keys(cfg.siteSpeeds).sort();
    if (!hosts.length) list.append(el("div", "empty muted-text", t("savedSitesEmpty")));
    hosts.forEach((host) => {
      const row = el("div", "list-row");
      const input = el("input");
      input.type = "number";
      input.step = "0.05";
      input.min = MIN;
      input.max = MAX;
      input.value = cfg.siteSpeeds[host];
      input.onchange = () => {
        const n = Number(input.value);
        if (!Number.isFinite(n) || n <= 0) { input.value = cfg.siteSpeeds[host]; return; }
        save({ siteSpeeds: { ...cfg.siteSpeeds, [host]: clampSpeed(n) } });
      };
      const del = removeButton(() => {
        const next = { ...cfg.siteSpeeds };
        delete next[host];
        save({ siteSpeeds: next });
        renderSpeed();
      });
      row.append(el("span", "name", host), valueGroup(input, "×"), del);
      list.append(row);
    });
  }

  $$("#scope .choice").forEach((c) => (c.onclick = () => { save({ speedScope: c.dataset.scope }); renderSpeed(); }));
  $("#presets").onchange = () => {
    const list = [...new Set($("#presets").value.split(/[,;\s]+/).map(Number)
      .filter((n) => Number.isFinite(n) && n >= MIN && n <= MAX).map((n) => Math.round(n * 100) / 100))]
      .sort((a, b) => a - b).slice(0, 6);
    if (list.length) save({ presets: list });
    renderSpeed(); // normalises what the user typed (or restores it if it was invalid)
  };
  confirmable($("#clearSites"), "clearAll", () => { save({ siteSpeeds: {} }); renderSpeed(); });

  /* ================================================================== *
   * Skipping
   * ================================================================== */
  function renderPaused() {
    const list = $("#pausedList");
    list.textContent = "";
    if (!cfg.disabledSites.length) list.append(el("div", "empty muted-text", t("pausedEmpty")));
    cfg.disabledSites.forEach((host) => {
      const row = el("div", "list-row");
      const btn = el("button", "btn", t("resume"));
      btn.onclick = () => { save({ disabledSites: cfg.disabledSites.filter((h) => h !== host) }); renderPaused(); };
      row.append(el("span", "name", host), btn);
      list.append(row);
    });
  }

  function renderNotice() {
    $("#skipNotice").hidden = !(cfg.skipFails > 0);
    $("#skipNoticeTitle").textContent = t("skipBlocked", { n: cfg.skipFails });
  }
  $("#clearFails").onclick = () => { save({ skipFails: 0 }); renderNotice(); };

  for (const key of ["autoSkip", "skipIntro", "adNormalSpeed", "adSkipFallback", "overlay", "preservePitch"]) {
    const box = $("#" + key);
    box.checked = cfg[key];
    box.onchange = () => save({ [key]: box.checked });
  }

  /* ================================================================== *
   * Appearance
   * ================================================================== */
  const BADGE_PX = { s: 9, m: 11, l: 14 }; // scaled down to fit the mock screen

  function renderAppearance() {
    const pos = cfg.overlayPos, badge = $("#badge");
    $$("#screen [data-pos]").forEach((b) => (b.style.visibility = b.dataset.pos === pos ? "hidden" : ""));
    badge.style.cssText = `font-size:${BADGE_PX[cfg.overlaySize] ?? 11}px;` +
      `${pos[0] === "t" ? "top" : "bottom"}:8px;${pos[1] === "l" ? "left" : "right"}:8px;` +
      `opacity:${cfg.overlay ? 1 : 0.25}`;
    $$("#sizeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.size === cfg.overlaySize));
    $$("#langSeg button").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
  }

  $$("#screen [data-pos]").forEach((b) => (b.onclick = () => { save({ overlayPos: b.dataset.pos }); renderAppearance(); }));
  $$("#sizeSeg button").forEach((b) => (b.onclick = () => { save({ overlaySize: b.dataset.size }); renderAppearance(); }));
  $("#overlay").addEventListener("change", renderAppearance);
  $$("#langSeg button").forEach((b) => {
    b.onclick = () => { lang = b.dataset.lang; save({ lang }, true); renderAll(); toast(); };
  });

  /* ================================================================== *
   * Data: backup / restore / reset
   * ================================================================== */
  const EXPORT_KEYS = ["speed", "speedScope", "siteSpeeds", "presets", "shortcuts", "overlay", "overlayPos",
    "overlaySize", "preservePitch", "autoSkip", "skipIntro", "adNormalSpeed", "adSkipFallback", "lang", "disabledSites"];
  const ENUMS = { speedScope: ["site", "global"], overlayPos: ["tl", "tr", "bl", "br"], overlaySize: ["s", "m", "l"], lang: ["auto", ...ui.LANGS] };

  function sanitize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
    const out = {};
    for (const k of EXPORT_KEYS) {
      if (!(k in raw)) continue;
      const v = raw[k], d = VSS.DEFAULTS[k];
      if (Array.isArray(d) ? !Array.isArray(v) : typeof v !== typeof d || v === null || Array.isArray(v)) continue;
      if (ENUMS[k] && !ENUMS[k].includes(v)) continue;
      out[k] = v;
    }
    if (out.speed !== undefined) out.speed = clampSpeed(out.speed);
    if (out.disabledSites) out.disabledSites = out.disabledSites.filter((h) => typeof h === "string");
    if (out.presets) out.presets = out.presets.filter((n) => typeof n === "number" && n >= MIN && n <= MAX).slice(0, 6);
    if (out.siteSpeeds) {
      out.siteSpeeds = Object.fromEntries(Object.entries(out.siteSpeeds)
        .filter(([, n]) => typeof n === "number" && n >= MIN && n <= MAX));
    }
    if (out.shortcuts) {
      out.shortcuts = out.shortcuts
        .filter((s) => s && ACTIONS[s.action] && typeof s.code === "string" && Number.isFinite(Number(s.value)))
        .map((s) => ({ action: s.action, value: Number(s.value), code: s.code, label: String(s.label ?? ""),
          ctrl: !!s.ctrl, alt: !!s.alt, shift: !!s.shift }));
    }
    if (!Object.keys(out).length) throw new Error("nothing to import");
    return out;
  }

  const exportJson = () => JSON.stringify(Object.fromEntries(EXPORT_KEYS.map((k) => [k, cfg[k]])), null, 2);

  $("#exportCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      toast(t("copied"));
    } catch { /* clipboard blocked */ }
  };
  $("#exportFile").onclick = () => {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    a.download = "video-speed-skip-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#importFile").onclick = () => $("#fileInput").click();
  $("#fileInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (file) $("#importText").value = await file.text();
  };
  $("#applyImport").onclick = async () => {
    try {
      await VSS.save(sanitize(JSON.parse($("#importText").value)));
      toast(t("imported"));
      setTimeout(() => location.reload(), 600);
    } catch {
      $("#importMsg").textContent = t("invalidSettings");
    }
  };
  confirmable($("#resetAll"), "resetAll", async () => {
    await api.storage.local.remove(EXPORT_KEYS);
    location.reload();
  });

  /* ---- support + about ---- */
  const { buyMeACoffee, pixKey, repo } = VSS_CONFIG;
  if (buyMeACoffee) $("#bmc").href = buyMeACoffee; else $("#bmc").hidden = true;
  if (repo) $("#repo").href = repo; else $("#repo").hidden = true;
  if (pixKey && ui.inBrazil()) {
    const pix = $("#pix");
    pix.hidden = false;
    pix.onclick = async () => {
      try {
        await navigator.clipboard.writeText(pixKey);
        pix.textContent = "✓ " + t("pixCopied");
        setTimeout(() => (pix.textContent = t("copyPix")), 1800);
      } catch { /* clipboard blocked */ }
    };
  }

  /* ================================================================== *
   * Boot
   * ================================================================== */
  function renderAll() {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;
    ui.translate(document, t);
    $("#pix").textContent = t("copyPix");
    $("#version").textContent = t("version", { v: api.runtime.getManifest().version });
    renderDashboard();
    renderShortcuts();
    renderSpeed();
    renderPaused();
    renderNotice();
    renderAppearance();
  }

  // Keep the dashboard live while the page is open (stats are written by the content scripts).
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) {
      if ("newValue" in c && !["shortcuts", "presets"].includes(k)) cfg[k] = c.newValue;
    }
    cfg.stats = { daily: {}, sites: {}, ...cfg.stats };
    if (!$("#dashboard").hidden) renderDashboard();
    if (!$("#speed").hidden) renderSpeed();
    if (!$("#skip").hidden) { renderPaused(); renderNotice(); }
  });

  renderAll();
  route();
})();
