// UI helpers shared by the popup and the options page (needs defaults.js and i18n.js first).
(() => {
  const LANGS = ["en", "pt", "es"];
  const LOCALES = { en: "en-US", pt: "pt-BR", es: "es-ES" };
  const ARROWS = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "Space" };

  const BRAZIL_TZ =
    /^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Manaus|Belem|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Boa_Vista|Araguaina|Maceio|Noronha|Santarem|Eirunepe)$/;

  VSS.ui = {
    LANGS,
    LOCALES,

    resolveLang(setting) {
      if (LANGS.includes(setting)) return setting;
      const l = (navigator.language || "en").toLowerCase();
      return l.startsWith("pt") ? "pt" : l.startsWith("es") ? "es" : "en";
    },

    makeT(getLang) {
      return (key, vars = {}) =>
        (VSS_I18N[getLang()][key] ?? VSS_I18N.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
    },

    // Fills every [data-i18n] (text), [data-i18n-title] (tooltip + aria-label) and [data-i18n-ph] (placeholder).
    translate(root, t) {
      root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
      root.querySelectorAll("[data-i18n-title]").forEach((el) => {
        el.title = t(el.dataset.i18nTitle);
        el.setAttribute("aria-label", el.title);
      });
      root.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    },

    fmtDuration(sec) {
      sec = Math.round(sec);
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      return h ? `${h}h ${m}m` : m ? `${m}m` : `${sec}s`;
    },

    // PIX only makes sense for people in Brazil.
    inBrazil() {
      return /^pt-BR$/i.test(navigator.language) || BRAZIL_TZ.test(Intl.DateTimeFormat().resolvedOptions().timeZone);
    },

    keyLabel(e) {
      return e.code.startsWith("Key") ? e.code.slice(3)
        : e.code.startsWith("Digit") ? e.code.slice(5)
        : e.code.startsWith("Numpad") ? "Num " + e.code.slice(6)
        : ARROWS[e.code] ?? e.key;
    },

    combo(s) {
      return s.code
        ? [s.ctrl && "Ctrl", s.alt && "Alt", s.shift && "Shift", s.label || s.code].filter(Boolean).join("+")
        : "—";
    }
  };
})();
