/* gapNinja — auth gating: shows the landing page or the app based on Firebase sign-in state. */
(function () {
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showLanding() {
    document.getElementById("landing-page").style.display = "flex";
    document.querySelector(".app-shell").style.display = "none";
  }

  async function showApp(user) {
    document.getElementById("landing-page").style.display = "none";
    // Clear the inline display:none from the initial HTML rather than hardcoding "grid" here --
    // an inline style would always beat the CSS stylesheet (including the mobile media query
    // that switches .app-shell to display:block on phones), permanently breaking the mobile
    // layout regardless of screen size. Clearing it lets the CSS class rules take over normally.
    document.querySelector(".app-shell").style.display = "";
    updateUserChip(user);

    // First sign-in: seed the profile with Google's name/email if we don't have one yet.
    try {
      const profile = await window.GapNinja.Storage.profile.get();
      let changed = false;
      if (!profile.name && user.displayName) { profile.name = user.displayName; changed = true; }
      if (!profile.email && user.email) { profile.email = user.email; changed = true; }
      if (changed) await window.GapNinja.Storage.profile.save(profile);
    } catch (e) {
      console.error("Profile seed failed", e);
    }

    // Show the Admin nav item only for accounts with a doc at admins/{uid} — see firestore.rules.
    // Non-admins get a permission-denied error from Firestore even if they force this open, so
    // hiding it here is purely for a clean sidebar, not the actual access control.
    try {
      const isAdmin = await window.GapNinja.Admin.isAdmin(user.uid);
      const adminNav = document.getElementById("nav-admin");
      if (adminNav) adminNav.style.display = isAdmin ? "" : "none";
    } catch (e) {
      console.error("Admin check failed", e);
    }

    window.GapNinja.navigate("dashboard");
  }

  function updateUserChip(user) {
    const chip = document.getElementById("user-chip");
    if (!chip) return;
    const avatar = user.photoURL
      ? `<img src="${user.photoURL}" referrerpolicy="no-referrer" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;" />`
      : `<div style="width:28px;height:28px;border-radius:50%;background:var(--bg-panel-2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--neon);flex-shrink:0;">${escapeHtml((user.displayName || user.email || "?")[0].toUpperCase())}</div>`;
    chip.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; padding:8px; border-radius:10px; background:var(--bg-panel-2); margin-bottom:4px;">
        ${avatar}
        <div style="flex:1; overflow:hidden;">
          <div style="font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(user.displayName || "Signed in")}</div>
          <div style="font-size:11px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(user.email || "")}</div>
        </div>
      </div>`;
  }

  function wireSignInButton() {
    const btn = document.getElementById("google-signin-btn");
    const statusEl = document.getElementById("google-signin-status");
    if (!btn) return;

    if (window.GapNinja.firebaseConfigured === false) {
      btn.disabled = true;
      statusEl.innerHTML = `Firebase isn't configured yet. Add your project keys to <span class="mono">js/firebase-config.js</span> — see README.md for the step-by-step guide.`;
      statusEl.style.color = "var(--amber)";
      return;
    }

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      statusEl.textContent = "Opening Google sign-in…";
      statusEl.style.color = "";
      try {
        // window.GapNinja.Auth.signIn() tries a popup first and transparently falls back to a
        // full-page redirect if the browser blocks or doesn't support popups (Safari, in-app
        // browsers, etc.) — see js/firebase.js. When it falls back, this line never actually
        // returns because the page navigates away to Google and back; that's expected.
        await window.GapNinja.Auth.signIn();
      } catch (e) {
        console.error(e);
        statusEl.style.color = "var(--red)";
        statusEl.textContent = friendlyAuthError(e);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function friendlyAuthError(e) {
    const code = e && e.code;
    switch (code) {
      case "auth/email-already-in-use": return "An account already exists with that email — try logging in instead, or use Forgot password.";
      case "auth/invalid-email": return "That doesn't look like a valid email address.";
      case "auth/weak-password": return "Password must be at least 6 characters.";
      case "auth/user-not-found": return "No account found with that email — try Sign up instead.";
      case "auth/wrong-password":
      case "auth/invalid-credential": return "Incorrect email or password.";
      case "auth/too-many-requests": return "Too many attempts — wait a bit and try again.";
      case "auth/popup-blocked": return "Your browser blocked the sign-in popup — allow popups for this page and try again.";
      case "auth/unauthorized-domain": return "This domain isn't authorized in your Firebase project yet. Add it under Authentication → Settings → Authorized domains.";
      default: return (e && e.message) ? e.message : "Something went wrong — try again.";
    }
  }

  function wireEmailAuth() {
    const form = document.getElementById("email-auth-form");
    const tabSignin = document.getElementById("email-tab-signin");
    const tabSignup = document.getElementById("email-tab-signup");
    const submitBtn = document.getElementById("email-auth-submit");
    const statusEl = document.getElementById("email-auth-status");
    const emailEl = document.getElementById("email-auth-email");
    const passwordEl = document.getElementById("email-auth-password");
    const forgotLink = document.getElementById("forgot-password-link");
    const backLink = document.getElementById("back-to-signin-link");
    const emailAuthContainer = document.getElementById("email-auth-container");
    const forgotContainer = document.getElementById("forgot-password-container");
    const forgotSubmit = document.getElementById("forgot-password-submit");
    const forgotEmailEl = document.getElementById("forgot-password-email");
    const forgotStatusEl = document.getElementById("forgot-password-status");
    if (!form) return;

    let mode = "signin";

    function setMode(next) {
      mode = next;
      tabSignin.classList.toggle("active", mode === "signin");
      tabSignup.classList.toggle("active", mode === "signup");
      submitBtn.textContent = mode === "signin" ? "Log in" : "Create account";
      passwordEl.autocomplete = mode === "signin" ? "current-password" : "new-password";
      statusEl.textContent = "";
      statusEl.style.color = "";
    }
    tabSignin.addEventListener("click", () => setMode("signin"));
    tabSignup.addEventListener("click", () => setMode("signup"));

    if (window.GapNinja.firebaseConfigured === false) {
      submitBtn.disabled = true;
      statusEl.innerHTML = `Firebase isn't configured yet — see README.md.`;
      statusEl.style.color = "var(--amber)";
      return;
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = emailEl.value.trim();
      const password = passwordEl.value;
      if (!email || !password) return;
      submitBtn.disabled = true;
      statusEl.style.color = "";
      statusEl.textContent = mode === "signin" ? "Logging in…" : "Creating your account…";
      try {
        if (mode === "signin") {
          await window.GapNinja.Auth.signInEmail(email, password);
        } else {
          await window.GapNinja.Auth.signUpEmail(email, password);
        }
        // onAuthStateChanged picks up the new session and shows the app.
      } catch (e) {
        console.error(e);
        statusEl.style.color = "var(--red)";
        statusEl.textContent = friendlyAuthError(e);
      } finally {
        submitBtn.disabled = false;
      }
    });

    forgotLink.addEventListener("click", (ev) => {
      ev.preventDefault();
      forgotEmailEl.value = emailEl.value.trim();
      forgotStatusEl.textContent = "";
      emailAuthContainer.style.display = "none";
      forgotContainer.style.display = "block";
    });
    backLink.addEventListener("click", (ev) => {
      ev.preventDefault();
      forgotContainer.style.display = "none";
      emailAuthContainer.style.display = "block";
    });
    forgotSubmit.addEventListener("click", async () => {
      const email = forgotEmailEl.value.trim();
      if (!email) {
        forgotStatusEl.style.color = "var(--amber)";
        forgotStatusEl.textContent = "Enter your email first.";
        return;
      }
      forgotSubmit.disabled = true;
      forgotStatusEl.style.color = "";
      forgotStatusEl.textContent = "Sending…";
      try {
        await window.GapNinja.Auth.resetPassword(email);
        forgotStatusEl.style.color = "var(--neon)";
        forgotStatusEl.textContent = "If an account exists for that email, a reset link is on its way — check your inbox.";
      } catch (e) {
        console.error(e);
        forgotStatusEl.style.color = "var(--red)";
        forgotStatusEl.textContent = friendlyAuthError(e);
      } finally {
        forgotSubmit.disabled = false;
      }
    });
  }

  function wireSignOutButton() {
    const btn = document.getElementById("sign-out-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try {
        await window.GapNinja.Auth.signOut();
        window.GapNinja.toast && window.GapNinja.toast("Signed out");
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Fires if the browser fell back to the redirect sign-in flow (js/firebase.js) and Google sent
  // the user back with an error (e.g. they cancelled, or the domain isn't authorized) — surface
  // it on the landing page the same way a popup failure would show up.
  window.addEventListener("gapninja-redirect-signin-error", (ev) => {
    const statusEl = document.getElementById("google-signin-status");
    if (!statusEl) return;
    statusEl.style.color = "var(--red)";
    statusEl.textContent = friendlyAuthError(ev.detail || {});
  });

  document.addEventListener("DOMContentLoaded", () => {
    wireSignInButton();
    wireEmailAuth();
    wireSignOutButton();

    if (!window.GapNinja.Auth) {
      // Extremely unlikely given load-order guarantees, but fail safe rather than blank screen.
      showLanding();
      return;
    }
    window.GapNinja.Auth.onChange((user) => {
      if (user) showApp(user);
      else showLanding();
    });
  });
})();
