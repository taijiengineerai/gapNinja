/* gapNinja — interactive guided tour. Auto-shows once per account (tracked on the profile doc
   as onboardingSeen), and can be replayed anytime via the "Help / Tour" button in the sidebar.
   No external library — a small overlay + tooltip built from the same inline-style conventions
   used elsewhere in this app (see js/scam-check.js UI code for the same pattern).

   MAINTENANCE — keep this in sync with the app, every time:
   - New nav item / view added → add a STEPS entry here targeting its selector (usually
     '[data-view="yourview"]'), in the same order it appears in the sidebar.
   - Major new capability added to an EXISTING view (e.g. the scam-risk check, sort options,
     PDF preview) → update that step's `body` text to mention it, rather than leaving the
     tour describing an older, thinner version of the feature.
   - View removed/renamed → remove or update its STEPS entry so the tour never points at a
     dead element.
   - Whenever STEPS changes length, update the "N steps" count in the welcome step's body below.
   This file is the one place a person actually reads to learn the app, so it drifting out of
   date is worse than not having a tour at all — treat it as part of shipping the feature, not
   a follow-up task. */
(function () {
  const MOBILE_BREAKPOINT = 860;

  // Steps without a "selector" are shown centered, with no highlighted target (welcome/closing).
  const STEPS = [
    {
      title: "Welcome to gapNinja 👋",
      body: "A quick tour of the main features — eight steps, skip anytime with the link below.",
    },
    {
      selector: '[data-view="dashboard"]',
      title: "Dashboard",
      body: "Every job you've compared or applied to, with status and match score, all in one place.",
    },
    {
      selector: '[data-view="compare"]',
      title: "Compare & Analyze",
      body: "Paste a job description (or a link) and pick a resume — get a match score, the skills you're missing, a drafted cover letter and follow-up email, and a scam-risk check on the link itself.",
    },
    {
      selector: '[data-view="tasks"]',
      title: "Job Queue",
      body: "Save job links as you find them. Each one gets its own quick scam-risk check — analyze it properly whenever you're ready to apply.",
    },
    {
      selector: '[data-view="resumes"]',
      title: "Resumes",
      body: "Upload PDF versions of your resume, see which skills each one covers, and preview the actual file anytime.",
    },
    {
      selector: '[data-view="companies"]',
      title: "Companies",
      body: "Every company you've compared against, tracked automatically — contact info, notes, and your full comparison history, sortable A–Z or by most recent.",
    },
    {
      selector: '[data-view="links"]',
      title: "My Links",
      body: "Save your LinkedIn, portfolio, GitHub, or any other link you paste often — as many as you want, each one copyable with a click.",
    },
    {
      selector: '[data-view="support"]',
      title: "Support",
      body: "Stuck, or found a bug? Send it here — you'll see the status and any reply right on this page.",
    },
    {
      selector: "#nav-profile",
      title: "My Profile",
      body: "Your skills, experience, and job search preferences live here — you can also fetch live job listings that match you.",
    },
    {
      title: "That's the tour!",
      body: "Click \"Help / Tour\" in the sidebar anytime to see this again.",
    },
  ];

  let currentIndex = 0;
  let overlayEl = null;
  let tooltipEl = null;
  let highlightEl = null;
  let openedSidebarForTour = false;
  let resizeHandler = null;

  function buildChrome() {
    overlayEl = document.createElement("div");
    overlayEl.id = "onboarding-overlay";
    overlayEl.style.cssText = "position:fixed; inset:0; z-index:2000; pointer-events:none;";

    highlightEl = document.createElement("div");
    highlightEl.id = "onboarding-highlight";
    highlightEl.style.cssText =
      "position:fixed; z-index:2001; border-radius:10px; border:2px solid var(--neon); " +
      "box-shadow:0 0 0 9999px rgba(0,0,0,0.6), 0 0 16px 2px rgba(57,255,136,0.5); " +
      "pointer-events:none; transition:top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease; display:none;";

    tooltipEl = document.createElement("div");
    tooltipEl.id = "onboarding-tooltip";
    tooltipEl.style.cssText =
      "position:fixed; z-index:2002; width:300px; max-width:88vw; background:var(--bg-panel); " +
      "border:1px solid var(--border); border-radius:12px; padding:18px 20px; " +
      "box-shadow:0 12px 32px rgba(0,0,0,0.5); font-family:var(--font-body, sans-serif);";

    document.body.appendChild(overlayEl);
    document.body.appendChild(highlightEl);
    document.body.appendChild(tooltipEl);
  }

  function teardownChrome() {
    [overlayEl, highlightEl, tooltipEl].forEach((el) => el && el.remove());
    overlayEl = highlightEl = tooltipEl = null;
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
    if (openedSidebarForTour) {
      const sidebar = document.getElementById("sidebar");
      if (sidebar) sidebar.classList.remove("open");
      openedSidebarForTour = false;
    }
  }

  function isMobileLayout() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function ensureSidebarVisible() {
    if (!isMobileLayout()) return;
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.classList.contains("open")) {
      sidebar.classList.add("open");
      openedSidebarForTour = true;
    }
  }

  function start() {
    currentIndex = 0;
    openedSidebarForTour = false;
    buildChrome();
    renderStep();
    resizeHandler = () => renderStep();
    window.addEventListener("resize", resizeHandler);
  }

  function renderStep() {
    const step = STEPS[currentIndex];
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === STEPS.length - 1;

    let target = null;
    if (step.selector) {
      ensureSidebarVisible();
      target = document.querySelector(step.selector);
    }

    if (target) {
      target.scrollIntoView({ block: "center", behavior: "auto" });
      const rect = target.getBoundingClientRect();
      const pad = 6;
      overlayEl.style.background = "";
      tooltipEl.style.transform = "";
      highlightEl.style.display = "block";
      highlightEl.style.top = rect.top - pad + "px";
      highlightEl.style.left = rect.left - pad + "px";
      highlightEl.style.width = rect.width + pad * 2 + "px";
      highlightEl.style.height = rect.height + pad * 2 + "px";
      positionTooltipNear(rect);
    } else {
      highlightEl.style.display = "none";
      centerTooltip();
    }

    tooltipEl.innerHTML = `
      <div style="font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:var(--neon); margin-bottom:8px;">
        Step ${currentIndex + 1} of ${STEPS.length}
      </div>
      <div style="font-size:15.5px; font-weight:700; color:var(--text); margin-bottom:6px;">${escapeHtml(step.title)}</div>
      <div style="font-size:13.5px; color:var(--text-dim); line-height:1.5; margin-bottom:16px;">${escapeHtml(step.body)}</div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <button type="button" id="onboarding-skip" style="background:none; border:none; color:var(--text-dim); font-size:12.5px; cursor:pointer; padding:0; text-decoration:underline;">Skip tour</button>
        <div style="display:flex; gap:8px;">
          ${!isFirst ? `<button type="button" class="btn btn-secondary btn-sm" id="onboarding-back">Back</button>` : ""}
          <button type="button" class="btn btn-primary btn-sm" id="onboarding-next">${isLast ? "Done" : "Next"}</button>
        </div>
      </div>
    `;

    document.getElementById("onboarding-skip").addEventListener("click", finish);
    document.getElementById("onboarding-next").addEventListener("click", () => {
      if (isLast) finish();
      else {
        currentIndex++;
        renderStep();
      }
    });
    const backBtn = document.getElementById("onboarding-back");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        currentIndex--;
        renderStep();
      });
    }
  }

  function positionTooltipNear(rect) {
    const margin = 16;
    const tipRect = { width: 300, height: 180 }; // approximate before layout — good enough for placement math
    if (isMobileLayout()) {
      // Not enough horizontal room next to a full-width mobile sidebar — place below/above instead.
      let top = rect.bottom + margin;
      if (top + tipRect.height > window.innerHeight) top = Math.max(margin, rect.top - tipRect.height - margin);
      tooltipEl.style.top = top + "px";
      tooltipEl.style.left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, rect.left)) + "px";
    } else {
      let left = rect.right + margin;
      if (left + tipRect.width > window.innerWidth) left = Math.max(margin, rect.left - tipRect.width - margin);
      let top = Math.max(margin, Math.min(window.innerHeight - tipRect.height - margin, rect.top));
      tooltipEl.style.left = left + "px";
      tooltipEl.style.top = top + "px";
    }
  }

  function centerTooltip() {
    tooltipEl.style.top = "50%";
    tooltipEl.style.left = "50%";
    tooltipEl.style.transform = "translate(-50%, -50%)";
    overlayEl.style.background = "rgba(0,0,0,0.6)";
    overlayEl.style.pointerEvents = "none";
  }

  async function finish() {
    teardownChrome();
    // Re-render happens on next real navigation; nothing else to clean up. Persisting "seen" is
    // handled by the caller for the auto-start path — replays via the Help button don't touch it.
  }

  // Called once after sign-in (see js/auth-ui.js). Only auto-starts if the account has never
  // seen it before, and marks it seen immediately (not on completion) so refreshing mid-tour
  // doesn't re-trigger it every time.
  async function maybeAutoStart(profile) {
    if (profile && profile.onboardingSeen) return;
    try {
      await window.GapNinja.Storage.profile.save({ onboardingSeen: true });
    } catch (e) {
      console.error("Couldn't save onboarding-seen flag", e);
    }
    // Give the app shell a moment to finish its own render before measuring element positions.
    setTimeout(start, 400);
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function init() {
    const btn = document.getElementById("help-tour-btn");
    if (btn) btn.addEventListener("click", start);
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.Onboarding = { init, start, maybeAutoStart };
})();
