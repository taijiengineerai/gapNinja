/* gapNinja — My Profile page: basic info, resume-driven skills, experience, bio/hobbies,
   and a "Fetch matching jobs" button backed by the Adzuna job-search API (see adzuna-config.js).
   The DOM is the source of truth for skills chips and experience entries (rather than keeping a
   parallel JS array in sync) — add/remove just mutate the DOM directly, and Save reads it back out.
*/
(function () {
  function S() {
    return window.GapNinja.Storage;
  }
  function M() {
    return window.GapNinja.Matching;
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  // ---------- Skill chips ----------
  function getCurrentSkills() {
    return Array.from(document.querySelectorAll("#profile-skills-chips .skill-chip")).map((el) => el.getAttribute("data-skill"));
  }

  function addSkillChip(name) {
    const clean = (name || "").trim();
    if (!clean) return;
    const existing = getCurrentSkills().map((s) => s.toLowerCase());
    if (existing.includes(clean.toLowerCase())) return;
    const wrap = document.getElementById("profile-skills-chips");
    const chip = document.createElement("span");
    chip.className = "skill-chip";
    chip.setAttribute("data-skill", clean);
    chip.innerHTML = `${escapeHtml(clean)} <button type="button" aria-label="Remove ${escapeHtml(clean)}">✕</button>`;
    chip.querySelector("button").addEventListener("click", () => chip.remove());
    wrap.appendChild(chip);
  }

  function renderSkillChips(skills) {
    document.getElementById("profile-skills-chips").innerHTML = "";
    (skills || []).forEach((s) => addSkillChip(s));
  }

  // ---------- Experience entries ----------
  function addExpEntry(data) {
    data = data || {};
    const list = document.getElementById("profile-experience-list");
    const row = document.createElement("div");
    row.className = "exp-entry";
    row.innerHTML = `
      <div class="flex-between" style="margin-bottom:8px;">
        <div class="field-row" style="flex:1; margin-bottom:0;">
          <div class="field" style="margin-bottom:0;"><label>Title</label><input type="text" class="exp-title" placeholder="Senior Product Designer" /></div>
          <div class="field" style="margin-bottom:0;"><label>Company</label><input type="text" class="exp-company" placeholder="Acme Corp" /></div>
          <div class="field" style="margin-bottom:0; flex:0.6;"><label>Duration</label><input type="text" class="exp-duration" placeholder="2021–2024" /></div>
        </div>
        <button class="icon-btn exp-remove-btn" type="button" title="Remove" style="margin-left:8px; margin-top:20px;">✕</button>
      </div>
      <div class="field" style="margin-bottom:0;"><textarea class="exp-description" placeholder="What you did, what shipped, what you're proud of…" style="min-height:60px;"></textarea></div>
    `;
    row.querySelector(".exp-title").value = data.title || "";
    row.querySelector(".exp-company").value = data.company || "";
    row.querySelector(".exp-duration").value = data.duration || "";
    row.querySelector(".exp-description").value = data.description || "";
    row.querySelector(".exp-remove-btn").addEventListener("click", () => row.remove());
    list.appendChild(row);
  }

  function renderExperienceList(experience) {
    document.getElementById("profile-experience-list").innerHTML = "";
    (experience && experience.length ? experience : []).forEach((e) => addExpEntry(e));
  }

  function getCurrentExperience() {
    return Array.from(document.querySelectorAll("#profile-experience-list .exp-entry"))
      .map((row) => ({
        title: row.querySelector(".exp-title").value.trim(),
        company: row.querySelector(".exp-company").value.trim(),
        duration: row.querySelector(".exp-duration").value.trim(),
        description: row.querySelector(".exp-description").value.trim(),
      }))
      .filter((e) => e.title || e.company || e.duration || e.description);
  }

  // ---------- Appearance (accent color theme) ----------
  // Reads the current theme straight off the DOM (js/theme.js keeps document.documentElement's
  // data-theme attribute in sync from localStorage/profile), so this doesn't need its own fetch —
  // it's just reflecting whatever's already applied.
  function renderThemePicker() {
    const wrap = document.getElementById("profile-theme-picker");
    const Theme = window.GapNinja.Theme;
    if (!Theme) {
      wrap.innerHTML = "";
      return;
    }
    const current = Theme.getCurrentTheme();
    wrap.innerHTML = Theme.THEMES.map(
      (t) => `<button type="button" class="theme-swatch-btn${t.id === current ? " active" : ""}" data-theme-pick="${t.id}">
        <span class="theme-swatch" style="background:${t.swatch};"></span>${escapeHtml(t.label)}
      </button>`
    ).join("");
    wrap.querySelectorAll("[data-theme-pick]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-theme-pick");
        await Theme.setTheme(id);
        window.GapNinja.toast(`Theme set to ${Theme.THEMES.find((t) => t.id === id).label}`);
        renderThemePicker();
      });
    });
  }

  // ---------- Load / render ----------
  async function render() {
    renderThemePicker();
    let profile, resumes;
    try {
      [profile, resumes] = await Promise.all([S().profile.get(), S().resumes.list()]);
    } catch (e) {
      window.GapNinja.toast("Couldn't load profile: " + e.message);
      return;
    }
    profile = profile || {};

    document.getElementById("profile-name").value = profile.name || "";
    document.getElementById("profile-email").value = profile.email || "";
    document.getElementById("profile-phone").value = profile.phone || "";
    document.getElementById("profile-linkedin").value = profile.linkedin || "";
    document.getElementById("profile-knowledge").value = profile.knowledge || "";
    document.getElementById("profile-bio").value = profile.bio || "";
    document.getElementById("profile-hobbies").value = profile.hobbies || "";

    renderSkillChips(profile.skills || []);
    renderExperienceList(profile.experience || []);

    const js = profile.jobSearch || {};
    document.getElementById("profile-job-keywords").value = js.keywords || "";
    document.getElementById("profile-job-location").value = js.location || "";
    document.getElementById("profile-job-country").value = js.country || "us";
    document.getElementById("profile-job-days").value = js.maxDaysOld || 30;

    const select = document.getElementById("profile-resume-select");
    if (!resumes || resumes.length === 0) {
      select.innerHTML = `<option value="">No resumes uploaded yet</option>`;
    } else {
      select.innerHTML = resumes
        .map((r) => `<option value="${r.id}">${escapeHtml(r.label || r.filename || "Resume")}</option>`)
        .join("");
      if (profile.resumeId && resumes.some((r) => r.id === profile.resumeId)) {
        select.value = profile.resumeId;
      }
    }
    document.getElementById("profile-scan-status").textContent = "";
    document.getElementById("profile-scan-suggestions").innerHTML = "";
    document.getElementById("profile-jd-scan-text").value = "";
    document.getElementById("profile-jd-scan-status").textContent = "";
    document.getElementById("profile-jd-scan-results").innerHTML = "";
    document.getElementById("profile-jobs-status").textContent = "";
    document.getElementById("profile-jobs-results").innerHTML = "";

    document.getElementById("profile-summary-editor").style.display = "none";
    document.getElementById("profile-summary-text").value = "";
    document.getElementById("profile-summary-status").textContent = "";
    renderSummaryHistory();
  }

  // Reads the core identity/skills fields straight from the form — shared by Save Profile and
  // the summary generator, so the summary always reflects what's currently on screen even if you
  // haven't hit Save yet.
  function collectBasicProfileFields() {
    return {
      name: document.getElementById("profile-name").value.trim(),
      email: document.getElementById("profile-email").value.trim(),
      phone: document.getElementById("profile-phone").value.trim(),
      linkedin: document.getElementById("profile-linkedin").value.trim(),
      skills: getCurrentSkills(),
      knowledge: document.getElementById("profile-knowledge").value.trim(),
      experience: getCurrentExperience(),
      bio: document.getElementById("profile-bio").value.trim(),
      hobbies: document.getElementById("profile-hobbies").value.trim(),
    };
  }

  // ---------- Save ----------
  async function saveProfile() {
    const btn = document.getElementById("profile-save-btn");
    const basics = collectBasicProfileFields();
    if (basics.email && !isValidEmail(basics.email)) {
      window.GapNinja.toast("That email doesn't look valid.");
      return;
    }
    const payload = Object.assign({}, basics, {
      resumeId: document.getElementById("profile-resume-select").value || "",
      jobSearch: {
        keywords: document.getElementById("profile-job-keywords").value.trim(),
        location: document.getElementById("profile-job-location").value.trim(),
        country: document.getElementById("profile-job-country").value,
        maxDaysOld: clampDays(document.getElementById("profile-job-days").value),
      },
    });
    btn.disabled = true;
    try {
      await S().profile.save(payload);
      window.GapNinja.toast("Profile saved");
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Couldn't save profile: " + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  function clampDays(v) {
    let n = parseInt(v, 10);
    if (isNaN(n)) n = 30;
    return Math.max(1, Math.min(90, n));
  }

  // ---------- Skills Summary (generate, edit, save to history) ----------
  function generateSummary() {
    const basics = collectBasicProfileFields();
    if (!basics.skills.length && !basics.bio && !basics.experience.length) {
      window.GapNinja.toast("Add some skills, experience, or a bio first — there's nothing to summarize yet.");
      return;
    }
    const text = window.GapNinja.Templates.generateSkillsSummary(basics);
    document.getElementById("profile-summary-text").value = text;
    document.getElementById("profile-summary-editor").style.display = "block";
    const statusEl = document.getElementById("profile-summary-status");
    statusEl.style.color = "var(--neon)";
    statusEl.textContent = "Generated from your current profile — edit as needed, then \"Save to history\" to keep this version.";
  }

  async function saveSummaryToHistory() {
    const btn = document.getElementById("profile-summary-save-btn");
    const text = document.getElementById("profile-summary-text").value;
    if (!text.trim()) return;
    btn.disabled = true;
    try {
      await S().summaries.add({ content: text, label: `Summary — ${new Date().toLocaleDateString()}` });
      window.GapNinja.toast("Saved to your summary history");
      renderSummaryHistory();
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Couldn't save: " + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function renderSummaryHistory() {
    const wrap = document.getElementById("profile-summary-history");
    wrap.innerHTML = `<div class="hint">Loading…</div>`;
    let list;
    try {
      list = await S().summaries.list();
    } catch (e) {
      wrap.innerHTML = `<div class="hint">Couldn't load history: ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (!list.length) {
      wrap.innerHTML = `<div class="hint">No saved summaries yet — generate one above and click "Save to history" to keep it here for later.</div>`;
      return;
    }
    wrap.innerHTML = list
      .map((s) => {
        const snippet = escapeHtml((s.content || "").slice(0, 140)) + ((s.content || "").length > 140 ? "…" : "");
        return `<div class="history-row">
          <div class="flex-between">
            <div><strong>${escapeHtml(s.label || "Summary")}</strong> <span class="hint">· ${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ""}</span></div>
            <div class="flex gap-8">
              <button class="btn btn-secondary btn-sm" data-load-summary="${s.id}">Load</button>
              <button class="btn btn-danger btn-sm" data-del-summary="${s.id}">Delete</button>
            </div>
          </div>
          <div class="hint" style="margin-top:4px;">${snippet}</div>
        </div>`;
      })
      .join("");
    wrap.querySelectorAll("[data-load-summary]").forEach((btn) =>
      btn.addEventListener("click", () => loadSummary(btn.getAttribute("data-load-summary"), list))
    );
    wrap.querySelectorAll("[data-del-summary]").forEach((btn) =>
      btn.addEventListener("click", () => deleteSummary(btn.getAttribute("data-del-summary")))
    );
  }

  function loadSummary(id, list) {
    const s = list.find((x) => x.id === id);
    if (!s) return;
    document.getElementById("profile-summary-text").value = s.content || "";
    document.getElementById("profile-summary-editor").style.display = "block";
    const statusEl = document.getElementById("profile-summary-status");
    statusEl.style.color = "";
    statusEl.textContent = `Loaded "${s.label || "Summary"}" — editing here won't change the saved version unless you save it again.`;
  }

  async function deleteSummary(id) {
    if (!confirm("Delete this saved summary? This can't be undone.")) return;
    try {
      await S().summaries.remove(id);
      window.GapNinja.toast("Deleted");
      renderSummaryHistory();
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Couldn't delete: " + e.message);
    }
  }

  function copySummary() {
    const text = document.getElementById("profile-summary-text").value;
    navigator.clipboard
      .writeText(text)
      .then(() => window.GapNinja.toast("Copied to clipboard"))
      .catch(() => window.GapNinja.toast("Couldn't copy — select and copy manually"));
  }

  function downloadSummaryTxt() {
    const text = document.getElementById("profile-summary-text").value;
    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "skills-summary.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadSummaryPdf() {
    try {
      window.GapNinja.PdfExport.downloadTextAsPdf(document.getElementById("profile-summary-text").value, "skills-summary.pdf");
    } catch (e) {
      window.GapNinja.toast(e.message);
    }
  }

  // ---------- Resume scan ----------
  // Scanning no longer auto-adds every detected skill — it shows them as clickable suggestion
  // chips instead, so a resume that happens to mention something irrelevant in passing doesn't
  // silently end up in your skill list. Click a suggestion (or "Add all") to actually add it.
  async function scanResume() {
    const select = document.getElementById("profile-resume-select");
    const statusEl = document.getElementById("profile-scan-status");
    const suggestionsEl = document.getElementById("profile-scan-suggestions");
    const id = select.value;
    suggestionsEl.innerHTML = "";
    if (!id) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Upload a resume on the Resumes page first, or pick one above.";
      return;
    }
    statusEl.style.color = "";
    statusEl.textContent = "Scanning…";
    try {
      const resume = await S().resumes.get(id);
      if (!resume || !resume.rawText) throw new Error("Couldn't read that resume's text.");
      const found = M().extractSkills(resume.rawText);
      const existing = getCurrentSkills().map((s) => s.toLowerCase());
      const suggestions = found.filter((f) => !existing.includes(f.skill.name.toLowerCase()));

      if (suggestions.length === 0) {
        statusEl.style.color = "var(--neon)";
        statusEl.textContent = found.length ? "All skills gapNinja found in this resume are already in your list." : "No recognizable skills found in this resume.";
        return;
      }
      statusEl.style.color = "var(--neon)";
      statusEl.textContent = `Found ${suggestions.length} skill${suggestions.length === 1 ? "" : "s"} — click one to add it, or add them all.`;
      renderSkillSuggestionChips(suggestions.map((f) => f.skill.name), "profile-scan-suggestions", "profile-scan-status");
    } catch (e) {
      console.error(e);
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "Couldn't scan: " + e.message;
    }
  }

  // Shared by both the resume-scan suggestions and the job-description gap-scan below: renders a
  // row of clickable "+ SkillName" pills into containerId, each one adding that skill to the
  // profile's live chip list and removing itself, plus an "Add all" button. statusElId (optional)
  // gets a quick confirmation message once "Add all" is used.
  function renderSkillSuggestionChips(names, containerId, statusElId) {
    const el = document.getElementById(containerId);
    el.innerHTML =
      names.map((n) => `<button type="button" class="skill-suggestion-chip" data-suggest="${escapeHtml(n)}"><span class="plus">+</span> ${escapeHtml(n)}</button>`).join("") +
      (names.length > 1 ? `<button type="button" class="btn btn-secondary btn-sm" data-add-all style="margin:3px 0 3px 4px;">+ Add all ${names.length}</button>` : "");

    el.querySelectorAll("[data-suggest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        addSkillChip(btn.getAttribute("data-suggest"));
        btn.remove();
        updateAddAllCount(el);
      });
    });
    const addAllBtn = el.querySelector("[data-add-all]");
    if (addAllBtn) {
      addAllBtn.addEventListener("click", () => {
        el.querySelectorAll("[data-suggest]").forEach((btn) => addSkillChip(btn.getAttribute("data-suggest")));
        el.innerHTML = "";
        if (statusElId) {
          const s = document.getElementById(statusElId);
          s.textContent = "Added.";
          s.style.color = "var(--neon)";
        }
      });
    }
  }

  function updateAddAllCount(el) {
    const remaining = el.querySelectorAll("[data-suggest]").length;
    const addAllBtn = el.querySelector("[data-add-all]");
    if (remaining === 0) {
      el.innerHTML = "";
    } else if (addAllBtn) {
      addAllBtn.textContent = `+ Add all ${remaining}`;
    }
  }

  // ---------- Job description gap scan ----------
  function scanJobDescriptionForGaps() {
    const jdText = document.getElementById("profile-jd-scan-text").value.trim();
    const statusEl = document.getElementById("profile-jd-scan-status");
    const resultsEl = document.getElementById("profile-jd-scan-results");
    resultsEl.innerHTML = "";

    if (jdText.length < 40) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Paste a fuller job description to scan — at least a few sentences.";
      return;
    }

    const jdSkills = M().extractSkills(jdText);
    if (jdSkills.length === 0) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Couldn't recognize any skills in that text.";
      return;
    }

    const currentLower = getCurrentSkills().map((s) => s.toLowerCase());
    const matched = jdSkills.filter((f) => currentLower.includes(f.skill.name.toLowerCase()));
    const gaps = jdSkills.filter((f) => !currentLower.includes(f.skill.name.toLowerCase()));

    statusEl.style.color = "var(--neon)";
    statusEl.textContent = `You already have ${matched.length} of ${jdSkills.length} skills this job description mentions.`;

    const matchedHtml = matched.length
      ? `<div class="card-title" style="font-size:13px;">You already have</div><div class="chip-row">${matched
          .map((f) => `<span class="badge badge-matched">✓ ${escapeHtml(f.skill.name)}</span>`)
          .join("")}</div>`
      : "";

    const gapHtml = gaps.length
      ? `<div class="card-title" style="font-size:13px; margin-top:${matched.length ? "14px" : "0"};">Gap skills — click to add</div><div class="chip-row" id="profile-jd-gap-chips"></div>`
      : `<div class="hint" style="margin-top:10px;">No gaps — your profile already covers everything this job description mentions.</div>`;

    resultsEl.innerHTML = matchedHtml + gapHtml;
    if (gaps.length) {
      renderSkillSuggestionChips(gaps.map((f) => f.skill.name), "profile-jd-gap-chips", "profile-jd-scan-status");
    }
  }

  // ---------- Job fetch (Adzuna) ----------
  function buildProfileText() {
    const skills = getCurrentSkills().join(" ");
    const knowledge = document.getElementById("profile-knowledge").value;
    return [skills, skills, knowledge].join(" "); // skills weighted 2x — that's what we're matching on
  }

  function timeAgo(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  function matchClass(score) {
    if (score >= 60) return "job-match-high";
    if (score >= 30) return "job-match-mid";
    return "job-match-low";
  }

  async function fetchJobs() {
    const btn = document.getElementById("profile-fetch-jobs-btn");
    const statusEl = document.getElementById("profile-jobs-status");
    const resultsEl = document.getElementById("profile-jobs-results");
    const appId = window.GAPNINJA_ADZUNA_APP_ID;
    const appKey = window.GAPNINJA_ADZUNA_APP_KEY;

    if (!appId || !appKey) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Job search isn't configured yet — add your free Adzuna API keys to js/adzuna-config.js (see README.md, \"Job search (Adzuna)\").";
      return;
    }

    let keywords = document.getElementById("profile-job-keywords").value.trim();
    if (!keywords) {
      keywords = getCurrentSkills().slice(0, 5).join(" ");
      if (keywords) document.getElementById("profile-job-keywords").value = keywords;
    }
    if (!keywords) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Add some skills above, or type keywords to search for, first.";
      return;
    }

    const location = document.getElementById("profile-job-location").value.trim();
    const country = document.getElementById("profile-job-country").value;
    const days = clampDays(document.getElementById("profile-job-days").value);
    document.getElementById("profile-job-days").value = days;

    const params = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      results_per_page: "20",
      what: keywords,
      max_days_old: String(days),
      "content-type": "application/json",
    });
    if (location) params.set("where", location);
    const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/1?${params.toString()}`;

    btn.disabled = true;
    statusEl.style.color = "";
    statusEl.textContent = "Searching…";
    resultsEl.innerHTML = "";

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Adzuna returned an error (${res.status}). ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const results = data.results || [];
      if (results.length === 0) {
        statusEl.style.color = "var(--amber)";
        statusEl.textContent = "No jobs found — try broader keywords, a wider location, or a longer posted-within window.";
        return;
      }

      const profileText = buildProfileText();
      const scored = results.map((job) => {
        const analysis = M().analyze(profileText, job.description || job.title || "");
        return { job, score: analysis.score };
      });
      scored.sort((a, b) => b.score - a.score);

      statusEl.style.color = "var(--neon)";
      statusEl.textContent = `Found ${results.length} job${results.length === 1 ? "" : "s"}, sorted by match to your profile.`;
      resultsEl.innerHTML = scored.map(({ job, score }, idx) => renderJobCard(job, score, idx)).join("");
      resultsEl.querySelectorAll("[data-add-task]").forEach((b) =>
        b.addEventListener("click", () => addJobToQueue(b, scored[parseInt(b.getAttribute("data-add-task"), 10)].job))
      );
    } catch (e) {
      console.error(e);
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "Couldn't fetch jobs: " + (e && e.message ? e.message : "unknown error") + " — double-check your API keys in js/adzuna-config.js.";
    } finally {
      btn.disabled = false;
    }
  }

  function renderJobCard(job, score, idx) {
    const title = escapeHtml(job.title || "Untitled role");
    const company = escapeHtml((job.company && job.company.display_name) || "");
    const location = escapeHtml((job.location && job.location.display_name) || "");
    const posted = timeAgo(job.created);
    const snippet = escapeHtml((job.description || "").slice(0, 260)) + ((job.description || "").length > 260 ? "…" : "");
    const url = job.redirect_url || "#";
    return `<div class="job-result-card">
      <div class="flex-between" style="align-items:flex-start; gap:10px;">
        <div>
          <div style="font-weight:700; font-size:14.5px;">${title}</div>
          <div class="hint" style="margin-top:2px;">${company}${company && location ? " · " : ""}${location}${posted ? " · " + posted : ""}</div>
        </div>
        <span class="job-match-badge ${matchClass(score)}">${score}% match</span>
      </div>
      <div style="font-size:13px; color:var(--text-dim); margin-top:8px;">${snippet}</div>
      <div class="flex gap-8" style="margin-top:10px;">
        <a class="btn btn-secondary btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">View posting ↗</a>
        <button class="btn btn-primary btn-sm" type="button" data-add-task="${idx}">+ Add to Job Queue</button>
      </div>
    </div>`;
  }

  async function addJobToQueue(btn, job) {
    btn.disabled = true;
    btn.textContent = "Adding…";
    try {
      const company = (job.company && job.company.display_name) || "";
      await S().tasks.add({
        link: job.redirect_url || "",
        note: [job.title, company].filter(Boolean).join(" at "),
        status: "queued",
        linkedApplicationId: null,
      });
      btn.textContent = "Added ✓";
      window.GapNinja.toast("Added to Job Queue");
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      btn.textContent = "+ Add to Job Queue";
      window.GapNinja.toast("Couldn't add: " + e.message);
    }
  }

  function init() {
    document.getElementById("profile-save-btn").addEventListener("click", saveProfile);
    document.getElementById("profile-scan-resume-btn").addEventListener("click", scanResume);
    document.getElementById("profile-jd-scan-btn").addEventListener("click", scanJobDescriptionForGaps);
    document.getElementById("profile-exp-add-btn").addEventListener("click", () => addExpEntry());
    document.getElementById("profile-fetch-jobs-btn").addEventListener("click", fetchJobs);

    document.getElementById("profile-summary-generate-btn").addEventListener("click", generateSummary);
    document.getElementById("profile-summary-save-btn").addEventListener("click", saveSummaryToHistory);
    document.getElementById("profile-summary-copy-btn").addEventListener("click", copySummary);
    document.getElementById("profile-summary-download-txt-btn").addEventListener("click", downloadSummaryTxt);
    document.getElementById("profile-summary-download-pdf-btn").addEventListener("click", downloadSummaryPdf);

    const skillInput = document.getElementById("profile-skill-input");
    document.getElementById("profile-skill-add-btn").addEventListener("click", () => {
      addSkillChip(skillInput.value);
      skillInput.value = "";
      skillInput.focus();
    });
    skillInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addSkillChip(skillInput.value);
        skillInput.value = "";
      }
    });
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiProfile = { init, render };
})();
