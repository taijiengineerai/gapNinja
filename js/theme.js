/* gapNinja — appearance switcher: accent color (green/blue/purple) and light/dark mode, as two
   independent settings (css/style.css's [data-theme] and [data-mode] attributes on <html>). Any
   accent works with either mode — 6 combinations total, all defined in css/style.css.

   Applied in two stages, same pattern as the rest of the app's "instant, then synced" prefs:
   1. init() runs as early as possible (this script tag is the very first one in index.html,
      before firebase-config.js) and applies whatever's in localStorage immediately — no waiting
      on auth or a Firestore read — so returning users don't see a flash of the defaults before
      their chosen appearance kicks in.
   2. syncFromProfile() is called once per sign-in (see js/auth-ui.js, alongside the onboarding
      auto-start hook) to reconcile with profile.theme/profile.mode in case this is a new device/
      browser where localStorage doesn't have anything saved yet.

   MAINTENANCE:
   - Adding a new accent? Add it to THEMES below AND add matching [data-theme="id"] (dark) and
     [data-mode="light"][data-theme="id"] (light) blocks in css/style.css.
   - Adding a new mode isn't really supported by this two-mode design — MODES assumes exactly
     "dark" (the default, no attribute) and "light". */
(function () {
  const THEME_KEY = "gapninja-theme";
  const MODE_KEY = "gapninja-mode";

  const THEMES = [
    { id: "green", label: "Green", swatch: "#39ff88" },
    { id: "blue", label: "Blue", swatch: "#3b9eff" },
    { id: "purple", label: "Purple", swatch: "#b678ff" },
  ];
  const MODES = [
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
  ];

  function isValidTheme(id) {
    return THEMES.some((t) => t.id === id);
  }
  function isValidMode(id) {
    return MODES.some((m) => m.id === id);
  }

  function applyTheme(id) {
    if (!isValidTheme(id) || id === "green") {
      document.documentElement.removeAttribute("data-theme"); // "green" is the CSS default, no attribute needed
    } else {
      document.documentElement.setAttribute("data-theme", id);
    }
  }
  function applyMode(id) {
    if (!isValidMode(id) || id === "dark") {
      document.documentElement.removeAttribute("data-mode"); // "dark" is the CSS default, no attribute needed
    } else {
      document.documentElement.setAttribute("data-mode", id);
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") || "green";
  }
  function getCurrentMode() {
    return document.documentElement.getAttribute("data-mode") || "dark";
  }

  function persistLocal(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Private browsing / storage disabled — the visual change still applies for this session.
    }
  }

  // Applies immediately + persists both locally (instant on next load, works even signed out)
  // and to the profile (so it follows you to another device). The profile write is best-effort —
  // a failure there shouldn't undo the instant visual change or block the UI.
  async function setTheme(id) {
    if (!isValidTheme(id)) return;
    applyTheme(id);
    persistLocal(THEME_KEY, id);
    try {
      if (window.GapNinja.Storage) await window.GapNinja.Storage.profile.save({ theme: id });
    } catch (e) {
      console.error("Couldn't save theme preference", e);
    }
  }

  async function setMode(id) {
    if (!isValidMode(id)) return;
    applyMode(id);
    persistLocal(MODE_KEY, id);
    try {
      if (window.GapNinja.Storage) await window.GapNinja.Storage.profile.save({ mode: id });
    } catch (e) {
      console.error("Couldn't save mode preference", e);
    }
  }

  // Called once per sign-in with the freshly-loaded profile. Only overrides what's already
  // showing if the profile actually has a different, valid value saved — otherwise leaves
  // whatever init() already applied from localStorage alone.
  function syncFromProfile(profile) {
    const savedTheme = profile && profile.theme;
    if (isValidTheme(savedTheme) && savedTheme !== getCurrentTheme()) {
      applyTheme(savedTheme);
      persistLocal(THEME_KEY, savedTheme);
    }
    const savedMode = profile && profile.mode;
    if (isValidMode(savedMode) && savedMode !== getCurrentMode()) {
      applyMode(savedMode);
      persistLocal(MODE_KEY, savedMode);
    }
  }

  function init() {
    let storedTheme = null;
    let storedMode = null;
    try {
      storedTheme = localStorage.getItem(THEME_KEY);
      storedMode = localStorage.getItem(MODE_KEY);
    } catch (e) {
      // ignore — falls through to the defaults (green, dark)
    }
    if (isValidTheme(storedTheme)) applyTheme(storedTheme);
    if (isValidMode(storedMode)) applyMode(storedMode);
  }

  init(); // runs immediately at script-parse time, not on DOMContentLoaded — see file header

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.Theme = {
    THEMES,
    MODES,
    init,
    setTheme,
    setMode,
    syncFromProfile,
    getCurrentTheme,
    getCurrentMode,
  };
})();
