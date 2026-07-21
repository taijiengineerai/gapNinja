/* gapNinja — accent color theme switcher (green / blue / purple). Only the accent hue changes
   (css/style.css's --neon/--neon-dim/--neon-rgb, overridden per [data-theme] on <html>) —
   backgrounds, borders, and text stay the same across every theme.

   Applied in two stages, same pattern as the rest of the app's "instant, then synced" prefs:
   1. init() runs as early as possible (this script tag is the very first one in index.html,
      before firebase-config.js) and applies whatever's in localStorage immediately — no waiting
      on auth or a Firestore read — so returning users don't see a flash of the default green
      before their chosen theme kicks in.
   2. syncFromProfile() is called once per sign-in (see js/auth-ui.js, alongside the onboarding
      auto-start hook) to reconcile with profile.theme in case this is a new device/browser
      where localStorage doesn't have anything saved yet.

   MAINTENANCE: adding a new theme? Add it to THEMES below AND add a matching [data-theme="id"]
   block in css/style.css right under the existing blue/purple ones. */
(function () {
  const STORAGE_KEY = "gapninja-theme";

  const THEMES = [
    { id: "green", label: "Green", swatch: "#39ff88" },
    { id: "blue", label: "Blue", swatch: "#3b9eff" },
    { id: "purple", label: "Purple", swatch: "#b678ff" },
  ];

  function isValidTheme(id) {
    return THEMES.some((t) => t.id === id);
  }

  function applyTheme(id) {
    if (!isValidTheme(id) || id === "green") {
      document.documentElement.removeAttribute("data-theme"); // "green" is the CSS default, no attribute needed
    } else {
      document.documentElement.setAttribute("data-theme", id);
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") || "green";
  }

  // Applies immediately + persists both locally (instant on next load, works even signed out)
  // and to the profile (so it follows you to another device). The profile write is best-effort —
  // a failure there shouldn't undo the instant visual change or block the UI.
  async function setTheme(id) {
    if (!isValidTheme(id)) return;
    applyTheme(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (e) {
      // Private browsing / storage disabled — the visual change still applies for this session.
    }
    try {
      if (window.GapNinja.Storage) await window.GapNinja.Storage.profile.save({ theme: id });
    } catch (e) {
      console.error("Couldn't save theme preference", e);
    }
  }

  // Called once per sign-in with the freshly-loaded profile. Only overrides what's already
  // showing if the profile actually has a different, valid theme saved — otherwise leaves
  // whatever init() already applied from localStorage alone.
  function syncFromProfile(profile) {
    const saved = profile && profile.theme;
    if (isValidTheme(saved) && saved !== getCurrentTheme()) {
      applyTheme(saved);
      try {
        localStorage.setItem(STORAGE_KEY, saved);
      } catch (e) {
        // ignore
      }
    }
  }

  function init() {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // ignore — falls through to default green
    }
    if (isValidTheme(stored)) applyTheme(stored);
  }

  init(); // runs immediately at script-parse time, not on DOMContentLoaded — see file header

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.Theme = { THEMES, init, setTheme, syncFromProfile, getCurrentTheme };
})();
