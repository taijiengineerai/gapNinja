/* gapNinja — Compare & Analyze view: the core matching + cover-letter/email generation flow */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }
  let lastAnalysis = null;
  let originTaskId = null; // set when arriving from the Job Queue's "Analyze this job" action
  let lastAutoFetchedUrl = ""; // guards against re-fetching the same link every time the field is blurred

  function init() {
    document.getElementById("compare-fetch-btn").addEventListener("click", () => tryAutoFetch({ manual: true }));
    document.getElementById("compare-analyze-btn").addEventListener("click", runAnalysis);
    document.getElementById("compare-jd").addEventListener("blur", autoFillCompensation);
    document.getElementById("compare-url").addEventListener("blur", maybeAutoFetchOnBlur);
    document.getElementById("compare-scamcheck-btn").addEventListener("click", runScamCheck);

    // If a result is already showing and the user edits any input it was built from, the old
    // result (and its "Save to Dashboard" button, wired to the old data) is no longer valid for
    // what's in the form — clear it so a stale comparison can never be saved by accident. The
    // user has to hit Analyze Fit again, which re-reads the form fresh.
    ["compare-company", "compare-role", "compare-url", "compare-jd", "compare-compensation", "compare-resume-select"].forEach((id) => {
      const el = document.getElementById(id);
      const evt = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, invalidateStaleResults);
    });

    // The scam-risk result reflects a specific link + description snapshot — if either changes,
    // clear it so an old "looks safe" result can't linger next to an edited (and now unchecked) link.
    ["compare-url", "compare-jd"].forEach((id) => {
      document.getElementById(id).addEventListener("input", clearScamCheckResult);
    });
  }

  function runScamCheck() {
    const url = document.getElementById("compare-url").value.trim();
    const jdText = document.getElementById("compare-jd").value.trim();
    if (!url && !jdText) {
      window.GapNinja.toast("Add a job link or paste the description first");
      return;
    }
    const result = window.GapNinja.ScamCheck.analyze(url, jdText);
    renderScamCheckResult(result);
  }

  function clearScamCheckResult() {
    document.getElementById("compare-scamcheck-result").innerHTML = "";
  }

  function renderScamCheckResult(result) {
    const el = document.getElementById("compare-scamcheck-result");
    const meta = {
      low: { color: "var(--neon)", label: "Low risk" },
      medium: { color: "var(--amber)", label: "Medium risk — review carefully" },
      high: { color: "var(--red)", label: "High risk — proceed with caution" },
    }[result.level];

    let html = `<div style="border:1px solid ${meta.color}; border-radius:8px; padding:10px 12px; margin-top:8px;">
      <div style="font-weight:600; color:${meta.color};">${escapeHtml(meta.label)}</div>`;

    if (result.flags.length) {
      html += `<ul style="margin:6px 0 0; padding-left:18px; font-size:12.5px; color:var(--text-dim);">`;
      result.flags.forEach((f) => {
        html += `<li>${escapeHtml(f.label)}</li>`;
      });
      html += `</ul>`;
    } else {
      html += `<div class="hint" style="margin-top:4px;">No common scam red flags detected in what you've entered.</div>`;
    }

    if (!result.checkedText) {
      html += `<div class="hint" style="margin-top:6px;">Paste the job description text too for a fuller check — right now this only scanned the link.</div>`;
    }
    html += `<div class="hint" style="margin-top:6px;">This is a pattern-based check, not a guarantee — always verify the company independently before sharing personal info or paying anything to apply.</div>`;
    html += `</div>`;
    el.innerHTML = html;
  }

  function invalidateStaleResults() {
    if (!lastAnalysis) return;
    lastAnalysis = null;
    const panel = document.getElementById("compare-results");
    panel.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 4h6l1 3h4v13H4V7h4l1-3z"/><path d="M9 12l2 2 4-4"/></svg>
        <div>Inputs changed — click Analyze Fit again to refresh the match before saving.</div>
      </div>`;
  }

  // Scans the pasted JD for a salary/comp figure and fills the field, but only if the user
  // hasn't already typed something in themselves — never overwrite a manual entry.
  function autoFillCompensation() {
    const jdText = document.getElementById("compare-jd").value;
    const compEl = document.getElementById("compare-compensation");
    const hintEl = document.getElementById("compare-compensation-hint");
    if (compEl.value.trim() || !jdText.trim()) return;
    const detected = window.GapNinja.Matching.extractCompensation(jdText);
    if (detected) {
      compEl.value = detected;
      hintEl.textContent = "Detected from the job description — edit if it's not quite right.";
      hintEl.style.color = "var(--neon)";
    }
  }

  // Called by ui-tasks.js when the user clicks "Analyze this job" on a queued link.
  function prefill({ url, note, taskId }) {
    document.getElementById("compare-url").value = url || "";
    document.getElementById("compare-company").value = "";
    document.getElementById("compare-role").value = "";
    document.getElementById("compare-jd").value = "";
    document.getElementById("compare-compensation").value = "";
    document.getElementById("compare-compensation-hint").textContent = "Auto-filled if the job description lists one — otherwise add it yourself.";
    document.getElementById("compare-compensation-hint").style.color = "";
    originTaskId = taskId || null;
    resetResultsPanel();
    clearScamCheckResult();
    // Arriving with a link already in hand — go ahead and try fetching it right away instead of
    // waiting for the field to be blurred.
    if (url && url.trim()) {
      lastAutoFetchedUrl = url.trim();
      tryAutoFetch({ manual: false, silentIfEmpty: true });
    }
  }

  // Fires when the user leaves the job link field (paste, type, or click away). Only kicks off a
  // fetch if the link actually changed since the last attempt and the JD box is still empty — so
  // clicking in and out of the field, or a link that already failed once, doesn't keep re-firing.
  function maybeAutoFetchOnBlur() {
    const url = document.getElementById("compare-url").value.trim();
    const jdEl = document.getElementById("compare-jd");
    if (!url || jdEl.value.trim() || url === lastAutoFetchedUrl) return;
    lastAutoFetchedUrl = url;
    tryAutoFetch({ manual: false, silentIfEmpty: true });
  }

  async function render() {
    // Populate resume dropdown with latest saved resumes, preserving whatever was already
    // selected — rebuilding the options used to silently reset the selection back to the first
    // resume every time this view re-rendered, which could lead to analyzing against the wrong
    // (or no) resume without the user noticing.
    const select = document.getElementById("compare-resume-select");
    const previouslySelected = select.value;
    select.innerHTML = `<option value="">Loading…</option>`;
    let resumes;
    try {
      resumes = await S().resumes.list();
    } catch (e) {
      select.innerHTML = `<option value="">Couldn't load resumes</option>`;
      return;
    }
    if (resumes.length === 0) {
      select.innerHTML = `<option value="">No resumes uploaded yet</option>`;
    } else {
      select.innerHTML = resumes
        .map((r) => `<option value="${r.id}">${escapeHtml(r.label)} (${new Date(r.createdAt).toLocaleDateString()})</option>`)
        .join("");
      if (previouslySelected && resumes.some((r) => r.id === previouslySelected)) {
        select.value = previouslySelected;
      }
    }
  }

  // manual: true when the "Retry auto-fetch" button was clicked (always shows a "trying…" toast
  // and always attempts, even if the JD box already has text — an explicit retry should retry).
  // silentIfEmpty: true for the automatic paths (blur / arriving from Job Queue) — skips the
  // "trying…" toast so simply tabbing through the form doesn't spam notifications, but still
  // reports success/failure so the user knows whether they need to paste the text themselves.
  async function tryAutoFetch(opts) {
    const options = opts || {};
    const url = document.getElementById("compare-url").value.trim();
    const jdEl = document.getElementById("compare-jd");
    if (!url) {
      if (options.manual) window.GapNinja.toast("Paste a job link first");
      return;
    }
    lastAutoFetchedUrl = url;
    if (options.manual || !options.silentIfEmpty) window.GapNinja.toast("Trying to fetch the posting…");
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length < 100) throw new Error("Page returned little readable text");
      jdEl.value = text.slice(0, 8000);
      window.GapNinja.toast("Fetched the job description automatically — review it below before analyzing");
      autoFillCompensation();
    } catch (e) {
      window.GapNinja.toast("Couldn't auto-fetch that link (most job sites block this from a browser) — paste the description text below instead");
    }
  }

  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,nav,header,footer").forEach((el) => el.remove());
    return (doc.body ? doc.body.textContent : "").replace(/\s+/g, " ").trim();
  }

  // Wipes the job entry fields (company, role, link, job description, compensation) and results
  // after a comparison is saved, so the form is ready for the next job instead of leaving the
  // just-analyzed posting sitting there for you to clear by hand. Your saved resume selection is
  // left as-is since you're likely to keep using the same one for the next comparison too.
  function clearJobFields() {
    document.getElementById("compare-company").value = "";
    document.getElementById("compare-role").value = "";
    document.getElementById("compare-url").value = "";
    document.getElementById("compare-jd").value = "";
    document.getElementById("compare-compensation").value = "";
    document.getElementById("compare-compensation-hint").textContent = "Auto-filled if the job description lists one — otherwise add it yourself.";
    document.getElementById("compare-compensation-hint").style.color = "";
    lastAutoFetchedUrl = "";
    resetResultsPanel();
    clearScamCheckResult();
  }

  function resetResultsPanel() {
    lastAnalysis = null;
    document.getElementById("compare-results").innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 4h6l1 3h4v13H4V7h4l1-3z"/><path d="M9 12l2 2 4-4"/></svg>
        <div>Fill in the job details and hit Analyze Fit to see your match score, skill gap, and a drafted cover letter.</div>
      </div>`;
  }

  async function runAnalysis() {
    const company = document.getElementById("compare-company").value.trim();
    const role = document.getElementById("compare-role").value.trim();
    const url = document.getElementById("compare-url").value.trim();
    const jdText = document.getElementById("compare-jd").value.trim();
    const resumeId = document.getElementById("compare-resume-select").value;

    if (!resumeId) {
      window.GapNinja.toast("Select or upload a resume first");
      return;
    }
    if (jdText.length < 40) {
      window.GapNinja.toast("Paste a fuller job description to analyze");
      return;
    }
    if (!company || !role) {
      window.GapNinja.toast("Add a company name and role title");
      return;
    }

    // Compensation is optional: use whatever's in the field, or make one last attempt to
    // detect it from the JD text if the field was left empty.
    let compensation = document.getElementById("compare-compensation").value.trim();
    if (!compensation) {
      compensation = window.GapNinja.Matching.extractCompensation(jdText) || "";
    }

    const analyzeBtn = document.getElementById("compare-analyze-btn");
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing…";
    try {
      const resume = await S().resumes.get(resumeId);
      if (!resume) {
        window.GapNinja.toast("That resume couldn't be found — pick another");
        return;
      }
      const analysis = window.GapNinja.Matching.analyze(resume.rawText, jdText);
      const profile = await S().profile.get();

      const coverLetter = window.GapNinja.Templates.generateCoverLetter({ profile, role, company, analysis });
      const email = window.GapNinja.Templates.generateFollowUpEmail({ profile, role, company, appliedDate: new Date().toISOString(), analysis });

      lastAnalysis = { company, role, url, jdText, resumeId, resumeLabel: resume.label, compensation, analysis, coverLetter, email };
      renderResults(lastAnalysis);
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Analysis failed: " + e.message);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analyze Fit";
    }
  }

  function scoreColor(score) {
    if (score >= 70) return "var(--neon)";
    if (score >= 40) return "var(--amber)";
    return "var(--red)";
  }

  function renderResults(data) {
    const { company, role, url, compensation, analysis, coverLetter, email } = data;
    const panel = document.getElementById("compare-results");

    const matchedBadges = analysis.matched.map((m) => `<span class="badge badge-matched">✓ ${escapeHtml(m.skill.name)}</span>`).join("") || `<span class="muted">None detected</span>`;
    // Gap badges are real buttons, not spans — clicking one adds that skill straight to your
    // profile via window.GapNinja.addSkillToProfile, even when the JD has zero overlap with what
    // you already have and every skill shown here is a "gap".
    const gapBadges = analysis.gap
      .map(
        (g) =>
          `<button type="button" class="badge badge-gap badge-clickable ${g.priority === "high" ? "high-priority" : ""}" data-add-skill="${escapeHtml(g.skill.name)}" title="Add to your Skills & knowledge">+ ${escapeHtml(g.skill.name)}</button>`
      )
      .join("") || `<span class="muted">No gap detected — great match!</span>`;
    const bonusBadges = analysis.bonus.slice(0, 10).map((b) => `<span class="badge badge-bonus">${escapeHtml(b.skill.name)}</span>`).join("") || "";

    const resourcesHtml = analysis.gap
      .slice(0, 6)
      .map((g) => {
        const links = window.GapNinja.SkillsData.resourcesForSkill(g.skill).slice(0, 2);
        return `<li><strong>${escapeHtml(g.skill.name)}</strong> — ${links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${escapeHtml(l.title)}</a>`).join(" · ")}</li>`;
      })
      .join("");

    panel.innerHTML = `
      <div class="flex-between" style="margin-bottom:6px;">
        <div>
          <div style="font-size:13px; color:var(--text-dim);">${escapeHtml(role)} at <strong style="color:var(--text)">${escapeHtml(company)}</strong></div>
          ${compensation ? `<div style="font-size:12.5px; color:var(--neon); margin-top:2px;">${escapeHtml(compensation)}</div>` : ""}
          ${url ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(url)}" style="margin-top:6px;">Open posting ↗</a>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--font-display); font-size:32px; font-weight:700; color:${scoreColor(analysis.score)};">${analysis.score}%</div>
          <div class="hint" style="margin-top:0;">match score</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="card-title" style="font-size:13px;">Matched skills (${analysis.matched.length})</div>
      <div class="chip-row">${matchedBadges}</div>

      <div class="card-title" style="font-size:13px; margin-top:14px;">Gap skills (${analysis.gap.length})</div>
      ${analysis.gap.length ? `<p class="hint" style="margin:-4px 0 6px;">Click a skill to add it to your profile — even if this job doesn't overlap with anything you have yet.</p>` : ""}
      <div class="chip-row">${gapBadges}</div>

      ${analysis.bonus.length ? `<div class="card-title" style="font-size:13px; margin-top:14px;">Bonus skills you have beyond the JD</div><div class="chip-row">${bonusBadges}</div>` : ""}

      ${resourcesHtml ? `<div class="card-title" style="font-size:13px; margin-top:14px;">Suggested resources to close the gap</div><ul class="link-list">${resourcesHtml}</ul>` : ""}

      <div class="divider"></div>
      <div class="pill-tab-row">
        <div class="pill-tab active" data-tab="letter">Cover Letter</div>
        <div class="pill-tab" data-tab="email">Follow-up Email</div>
      </div>

      <div id="tab-letter">
        <textarea id="cover-letter-text" style="min-height:220px;">${escapeHtml(coverLetter)}</textarea>
        <div class="copy-row">
          <button class="btn btn-secondary btn-sm" id="copy-letter-btn">Copy</button>
          <button class="btn btn-secondary btn-sm" id="download-letter-btn">Download .txt</button>
          <button class="btn btn-secondary btn-sm" id="download-letter-pdf-btn">Download PDF</button>
        </div>
      </div>
      <div id="tab-email" style="display:none;">
        <div class="field"><label>Subject</label><input type="text" id="email-subject-text" value="${escapeHtml(email.subject)}" /></div>
        <div class="field"><label>Body</label><textarea id="email-body-text" style="min-height:160px;">${escapeHtml(email.body)}</textarea></div>
        <div class="copy-row">
          <button class="btn btn-secondary btn-sm" id="copy-email-btn">Copy</button>
        </div>
      </div>

      <div class="divider"></div>
      <button class="btn btn-primary" id="save-application-btn" style="width:100%; justify-content:center;">Save to Dashboard</button>
    `;

    wireResultsPanel(data);
  }

  function wireResultsPanel(data) {
    document.querySelectorAll(".pill-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".pill-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const which = tab.getAttribute("data-tab");
        document.getElementById("tab-letter").style.display = which === "letter" ? "block" : "none";
        document.getElementById("tab-email").style.display = which === "email" ? "block" : "none";
      });
    });

    document.getElementById("copy-letter-btn").addEventListener("click", () => {
      copyToClipboard(document.getElementById("cover-letter-text").value);
    });
    document.getElementById("download-letter-btn").addEventListener("click", () => {
      downloadText(`${data.company}-${data.role}-cover-letter.txt`, document.getElementById("cover-letter-text").value);
    });
    document.getElementById("download-letter-pdf-btn").addEventListener("click", () => {
      try {
        window.GapNinja.PdfExport.downloadTextAsPdf(
          document.getElementById("cover-letter-text").value,
          `${data.company}-${data.role}-cover-letter.pdf`
        );
      } catch (e) {
        window.GapNinja.toast(e.message);
      }
    });
    document.getElementById("copy-email-btn").addEventListener("click", () => {
      const subject = document.getElementById("email-subject-text").value;
      const body = document.getElementById("email-body-text").value;
      copyToClipboard(`Subject: ${subject}\n\n${body}`);
    });

    document.getElementById("save-application-btn").addEventListener("click", () => saveApplication(data));

    window.GapNinja.wireGapSkillChips(document.getElementById("compare-results"));
  }

  async function saveApplication(data) {
    const saveBtn = document.getElementById("save-application-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const company = await window.GapNinja.UiCompanies.ensureCompany(data.company);
      const coverLetter = document.getElementById("cover-letter-text").value;
      const emailSubject = document.getElementById("email-subject-text").value;
      const emailBody = document.getElementById("email-body-text").value;

      const record = await S().applications.add({
        companyId: company ? company.id : null,
        companyName: data.company,
        role: data.role,
        jdText: data.jdText,
        jdUrl: data.url || "",
        resumeId: data.resumeId,
        resumeLabel: data.resumeLabel,
        compensation: data.compensation || "",
        matchScore: data.analysis.score,
        matchedSkills: data.analysis.matched.map((m) => m.skill.name),
        gapSkills: data.analysis.gap.map((g) => g.skill.name),
        coverLetter,
        emailSubject,
        emailBody,
        status: "ready",
        appliedAt: null,
        notes: "",
        taskId: originTaskId,
      });

      if (originTaskId) {
        await S().tasks.update(originTaskId, { status: "analyzed", linkedApplicationId: record.id });
        originTaskId = null;
      }

      clearJobFields();
      window.GapNinja.toast("Saved to Dashboard");
      window.GapNinja.navigate("dashboard");
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Couldn't save: " + e.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save to Dashboard";
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => window.GapNinja.toast("Copied to clipboard"))
      .catch(() => window.GapNinja.toast("Couldn't copy — select and copy manually"));
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename.replace(/[^a-z0-9.\-_]+/gi, "_");
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiCompare = { init, render, prefill };
})();
