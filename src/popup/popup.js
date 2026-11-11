(async () => {
  const { api, MIN, MAX } = VSS;
  const ui = VSS.ui;
  const $ = (s) => document.querySelector(s);
  const cfg = await VSS.load();

  const lang = ui.resolveLang(cfg.lang);
  const t = ui.makeT(() => lang);

  /* ---- current site ---- */
  let host = "";
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const u = new URL(tab.url);
    if (/^https?:$/.test(u.protocol)) host = u.hostname;
  } catch { /* page not accessible (browser pages, new tab, ...) */ }

  const paused = () => !!host && cfg.disabledSites.includes(host);
  const siteMode = () => cfg.speedScope === "site";
  const controlsOff = () => paused() || (siteMode() && !host);
  const currentSpeed = () => VSS.speedFor(cfg, host);

  /* ---- rendering ---- */
  function renderSite() {
    $("#siteHost").textContent = host || "—";
    $("#siteState").textContent = !host ? t("siteNone") : paused() ? t("sitePaused") : t("siteActive");
    $("#dot").className = "dot" + (!host ? "" : paused() ? " paused" : " on");
    $("#siteOn").checked = !!host && !paused();
    $("#siteOn").disabled = !host;
    $("#siteOn").setAttribute("aria-label", $("#siteState").textContent);
  }

  function renderSpeed() {
    const s = currentSpeed();
    $("#value").textContent = s.toFixed(2) + "×";
    $("#slider").value = s;
    $$chips().forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === s));
    $("#speedLabel").textContent = !siteMode() ? t("speedAll") : host ? t("speedFor") : t("speedNoSite");
    $("#speedCard").classList.toggle("off", controlsOff());
  }

  function renderStats() {
    $("#saved").textContent = ui.fmtDuration(cfg.savedSeconds);
    $("#skipped").textContent = cfg.skipCount.toLocaleString(ui.LOCALES[lang]);
  }

  // A one-line reminder of the keys the user has configured.
  function renderTip() {
    const tip = $("#tip");
    tip.textContent = "";
    const find = (action, pred = () => true) => cfg.shortcuts.find((s) => s.action === action && s.code && pred(s));
    const parts = [
      [find("slower"), t("aSlower")],
      [find("faster"), t("aFaster")],
      [find("setSpeed", (s) => s.value === 1), t("reset")]
    ].filter(([s]) => s);
    if (!parts.length) return;
    tip.append(document.createTextNode(t("tipLabel") + ":"));
    for (const [s, label] of parts) {
      const k = document.createElement("kbd");
      k.textContent = ui.combo(s);
      tip.append(k, document.createTextNode(label));
    }
  }

  const $$chips = () => [...document.querySelectorAll("#chips button")];
  function renderChips() {
    $("#chips").textContent = "";
    cfg.presets.forEach((v) => {
      const b = document.createElement("button");
      b.dataset.v = v;
      b.textContent = v + "×";
      b.onclick = () => setSpeed(v);
      $("#chips").append(b);
    });
  }

  // The site (YouTube) ignored some of our skip clicks: say so instead of pretending it worked.
  function renderWarn() {
    const show = cfg.skipFails > 0 && !cfg.adSkipFallback;
    $("#warn").hidden = !show;
    if (show) $("#warn").textContent = "⚠ " + t("skipWarn", { n: cfg.skipFails });
  }

  function renderAll() {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;
    ui.translate(document, t);
    $("#pix").textContent = t("copyPix");
    renderWarn();
    renderSite();
    renderChips();
    renderSpeed();
    renderStats();
    renderTip();
  }

  /* ---- speed controls ---- */
  function setSpeed(n) {
    if (controlsOff()) return;
    n = Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));
    const patch = VSS.speedPatch(cfg, host, n);
    Object.assign(cfg, patch);
    VSS.save(patch);
    renderSpeed();
  }
  $("#slider").oninput = (e) => setSpeed(Number(e.target.value));
  $("#minus").onclick = () => setSpeed(currentSpeed() - 0.1);
  $("#plus").onclick = () => setSpeed(currentSpeed() + 0.1);
  $("#reset").onclick = () => setSpeed(1);

  /* ---- toggles ---- */
  for (const key of ["autoSkip", "skipIntro"]) {
    const box = $("#" + key);
    box.checked = cfg[key];
    box.onchange = () => { cfg[key] = box.checked; VSS.save({ [key]: cfg[key] }); };
  }

  $("#siteOn").onchange = () => {
    const set = new Set(cfg.disabledSites);
    $("#siteOn").checked ? set.delete(host) : set.add(host);
    cfg.disabledSites = [...set];
    VSS.save({ disabledSites: cfg.disabledSites });
    renderSite();
    renderSpeed();
  };

  /* ---- open the options page / dashboard ---- */
  const openOptions = () => { api.runtime.openOptionsPage(); window.close(); };
  $("#gear").onclick = openOptions;
  $("#warn").onclick = () => {
    api.tabs.create({ url: api.runtime.getURL("options/options.html#skip") });
    window.close();
  };
  $("#stats").onclick = openOptions;
  $("#stats").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openOptions(); } };

  /* ---- support ---- */
  const { buyMeACoffee, pixKey } = VSS_CONFIG;
  if (buyMeACoffee) $("#bmc").href = buyMeACoffee; else $("#bmc").hidden = true;
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
  if (!buyMeACoffee && !(pixKey && ui.inBrazil())) $("#support").hidden = true;

  /* ---- live updates (shortcut used while the popup is open, other tabs, options page) ---- */
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) if ("newValue" in c) cfg[k] = c.newValue;
    renderWarn();
    renderSite();
    renderChips();
    renderSpeed();
    renderStats();
    renderTip();
  });

  renderAll();
})();
