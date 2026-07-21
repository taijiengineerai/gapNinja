/* gapNinja — app shell: nav routing, toast, boot sequence.
   NOTE: window.GapNinja.Storage is set by the Firebase module (js/firebase.js), which is guaranteed
   to finish running before DOMContentLoaded fires — so it's safe to read window.GapNinja.Storage
   lazily inside functions below, just never capture it at top-level script scope.
*/
(function () {
  // ---- Toast ----
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  window.GapNinja.toast = toast;

  // ---- Shared: add a skill to the profile from anywhere in the app ----
  // Used by the gap-skill chips in Compare & Analyze and the saved-application modal, so a job
  // description with a skill you don't have yet — even one with zero overlap with your current
  // skills — is one click away from landing in Skills & knowledge. Writes straight to Storage
  // rather than touching the Profile view's DOM, since that view may not be the one currently
  // open; Profile's own render() picks up the change fresh the next time it's visited.
  // Returns true once the skill is confirmed present in the profile (newly added or already
  // there), false only on a real read/write error — callers use this to decide whether to mark
  // the chip as added or leave it clickable to retry.
  async function addSkillToProfile(name) {
    const clean = (name || "").trim();
    if (!clean) return false;
    const S = window.GapNinja.Storage;
    let profile;
    try {
      profile = await S.profile.get();
    } catch (e) {
      toast("Couldn't add skill: " + e.message);
      return false;
    }
    const skills = profile.skills || [];
    if (skills.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      toast(`"${clean}" is already in your Skills & knowledge`);
      return true;
    }
    try {
      await S.profile.save({ skills: skills.concat([clean]) });
    } catch (e) {
      toast("Couldn't add skill: " + e.message);
      return false;
    }
    toast(`Added "${clean}" to your Skills & knowledge`);
    return true;
  }
  window.GapNinja.addSkillToProfile = addSkillToProfile;

  // Shared by the Compare & Analyze results panel and the saved-application modal: wires every
  // gap-skill chip inside container to add itself to the profile on click, then swaps its look
  // from "gap" (red) to "matched" (green) so the click visibly registers. Safe to call after any
  // innerHTML rebuild — it only binds to whatever [data-add-skill] elements exist right now.
  function wireGapSkillChips(container) {
    if (!container) return;
    container.querySelectorAll("[data-add-skill]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const name = btn.getAttribute("data-add-skill");
        btn.disabled = true;
        const ok = await addSkillToProfile(name);
        if (ok) {
          btn.classList.remove("badge-gap", "high-priority");
          btn.classList.add("badge-matched");
          btn.textContent = "✓ " + name;
        } else {
          btn.disabled = false;
        }
      });
    });
  }
  window.GapNinja.wireGapSkillChips = wireGapSkillChips;

  // ---- Nav / routing ----
  function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll(".nav-item[data-view]").forEach((n) => n.classList.remove("active"));
    const view = document.getElementById("view-" + name);
    const nav = document.querySelector('.nav-item[data-view="' + name + '"]');
    if (view) view.classList.add("active");
    if (nav) nav.classList.add("active");

    // Re-render the view being entered so it reflects latest data. Each render() is async
    // (Firestore-backed) — we don't await here, the view just fills in once data arrives.
    if (name === "dashboard") window.GapNinja.UiDashboard.render();
    if (name === "resumes") window.GapNinja.UiResumes.render();
    if (name === "companies") window.GapNinja.UiCompanies.render();
    if (name === "support") window.GapNinja.UiSupport.render();
    if (name === "tasks") window.GapNinja.UiTasks.render();
    if (name === "compare") window.GapNinja.UiCompare.render();
    if (name === "profile") window.GapNinja.UiProfile.render();
    if (name === "admin") window.GapNinja.UiAdmin.render();
  }
  window.GapNinja.navigate = showView;

  function wireNav() {
    document.querySelectorAll("[data-view]").forEach((el) => {
      el.addEventListener("click", () => showView(el.getAttribute("data-view")));
    });
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => showView(el.getAttribute("data-nav")));
    });
  }

  // ---- Mobile nav drawer (hamburger menu) ----
  function wireMobileNav() {
    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.getElementById("mobile-menu-btn");
    const closeBtn = document.getElementById("sidebar-close-btn");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!sidebar || !menuBtn || !backdrop) return;

    function openDrawer() {
      sidebar.classList.add("open");
      backdrop.classList.add("open");
    }
    function closeDrawer() {
      sidebar.classList.remove("open");
      backdrop.classList.remove("open");
    }

    menuBtn.addEventListener("click", openDrawer);
    closeBtn && closeBtn.addEventListener("click", closeDrawer);
    backdrop.addEventListener("click", closeDrawer);
    // Any tap on a nav item (or the sign-out/profile/invite links in the sidebar footer)
    // should close the drawer too, so picking a destination doesn't leave the menu open on top of it.
    sidebar.querySelectorAll(".nav-item").forEach((el) => el.addEventListener("click", closeDrawer));
  }

  // ---- Boot ----
  document.addEventListener("DOMContentLoaded", () => {
    wireNav();
    wireMobileNav();
    window.GapNinja.UiDashboard.init();
    window.GapNinja.UiCompare.init();
    window.GapNinja.UiResumes.init();
    window.GapNinja.UiCompanies.init();
    window.GapNinja.UiSupport.init();
    window.GapNinja.UiTasks.init();
    window.GapNinja.UiInvite.init();
    window.GapNinja.UiProfile.init();
    window.GapNinja.UiAdmin.init();
    window.GapNinja.Onboarding.init();
    // Initial data render is triggered by auth-ui.js once sign-in state is known.
  });
})();
