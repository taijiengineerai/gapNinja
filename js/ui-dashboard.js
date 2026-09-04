/* gapNinja — Dashboard view: overview stats + full application history */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }
  let currentFilter = "";
  let currentSearch = ""; // company-name search, lowercased
  let currentPageSize = 20; // number, or "all"
  let currentPage = 1; // 1-based
  let openAppId = null;
  let openAppMeta = { companyName: "", role: "", resumeId: "", resumeLabel: "" };
  // Set by "Regenerate analysis" when it recomputes a fresher match score / matched / gap skill
  // list than what's saved. Nothing in Firestore changes until Save changes is clicked (same
  // rule as editing the cover letter or email text) -- this just rides along in that same save.
  let pendingRegenerated = null;

  const STATUS_LABEL = {
    not_applied: "Not applied",
    ready: "Ready to apply",
    applied: "Applied",
    interviewing: "Interviewing",
    offer: "Offer",
    rejected: "Rejected",
  };

  function init() {
    document.getElementById("dashboard-company-search").addEventListener("input", (e) => {
      currentSearch = e.target.value.trim().toLowerCase();
      currentPage = 1; // changing the search changes what "page 1" means — start over
      render();
    });
    document.getElementById("dashboard-status-filter").addEventListener("change", (e) => {
      currentFilter = e.target.value;
      currentPage = 1; // changing the filter changes what "page 1" means — start over
      render();
    });
    document.getElementById("dashboard-page-size").addEventListener("change", (e) => {
      currentPageSize = e.target.value === "all" ? "all" : parseInt(e.target.value, 10);
      currentPage = 1;
      render();
    });
    document.getElementById("dashboard-page-prev").addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        render();
      }
    });
    document.getElementById("dashboard-page-next").addEventListener("click", () => {
      currentPage++; // clamped inside render() against the actual page count
      render();
    });
    // Switching status to "Applied" fills in today's date if the field is still empty — one
    // less thing to type when you're marking something applied right after sending it. Only
    // fills a blank field (never overwrites a date you already set or backdated), and only
    // reacts to an actual change, not just opening the modal on an old record.
    document.getElementById("application-modal-status").addEventListener("change", (e) => {
      if (e.target.value !== "applied") return;
      const dateInput = document.getElementById("application-modal-applied-date");
      if (!dateInput.value) dateInput.value = todayLocalISODate();
    });
    document.getElementById("application-modal-close-btn").addEventListener("click", closeModal);
    document.getElementById("application-modal-save-btn").addEventListener("click", saveModal);
    document.getElementById("application-modal-delete-btn").addEventListener("click", deleteFromModal);
    document.getElementById("application-modal-copy-letter").addEventListener("click", () => {
      copyToClipboard(document.getElementById("application-modal-letter").value);
    });
    document.getElementById("application-modal-download-resume-btn").addEventListener("click", async () => {
      const btn = document.getElementById("application-modal-download-resume-btn");
      if (!openAppMeta.resumeId && !openAppMeta.resumeLabel) {
        window.GapNinja.toast("No resume linked to this application");
        return;
      }
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Preparing…";
      try {
        let resume = await S().resumes.get(openAppMeta.resumeId);
        // The resume this application was originally compared against may since have been
        // deleted and re-uploaded (e.g. after a fix to how resumes are read) — that gives it a
        // brand-new ID, so the old resumeId saved on this application no longer resolves. Fall
        // back to matching by the saved resume label against the current resume list, so a
        // delete-and-re-upload doesn't permanently break downloading for past comparisons.
        if (!resume && openAppMeta.resumeLabel) {
          const all = await S().resumes.list();
          resume = all.find((r) => r.label === openAppMeta.resumeLabel) || null;
        }
        await window.GapNinja.PdfExport.downloadResumeAsPdf(resume, [openAppMeta.role, openAppMeta.companyName]);
        window.GapNinja.toast("Resume downloaded");
      } catch (e) {
        console.error(e);
        window.GapNinja.toast("Couldn't download resume: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
    document.getElementById("application-modal-regenerate-btn").addEventListener("click", regenerateAnalysis);
    document.getElementById("application-modal-download-letter-pdf").addEventListener("click", () => {
      try {
        window.GapNinja.PdfExport.downloadTextAsPdf(
          document.getElementById("application-modal-letter").value,
          `${openAppMeta.companyName}-${openAppMeta.role}-cover-letter.pdf`
        );
      } catch (e) {
        window.GapNinja.toast(e.message);
      }
    });
    document.getElementById("application-modal-use-template").addEventListener("click", async () => {
      const btn = document.getElementById("application-modal-use-template");
      btn.disabled = true;
      try {
        const profile = await S().profile.get();
        const T = window.GapNinja.Templates;
        const template =
          profile && typeof profile.coverLetterTemplate === "string" && profile.coverLetterTemplate.trim()
            ? profile.coverLetterTemplate
            : T.DEFAULT_COVER_LETTER_TEMPLATE;
        const jdText = document.getElementById("application-modal-jd").value;
        const highlight = T.extractCompanyHighlight(jdText, openAppMeta.companyName);
        let filled = template
          .split("[Company Name]").join(openAppMeta.companyName || "[Company Name]")
          .split("[Job Title]").join(openAppMeta.role || "[Job Title]");
        if (highlight) {
          filled = filled.split(T.COMPANY_HIGHLIGHT_PLACEHOLDER).join(highlight);
        }
        document.getElementById("application-modal-letter").value = filled;
        window.GapNinja.toast(
          highlight
            ? "Template applied — double-check the pulled-in sentence, then Save changes"
            : "Template applied — fill in the remaining [brackets], then Save changes"
        );
      } catch (e) {
        window.GapNinja.toast("Couldn't load your template: " + e.message);
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById("application-modal-copy-email").addEventListener("click", () => {
      const s = document.getElementById("application-modal-email-subject").value;
      const b = document.getElementById("application-modal-email-body").value;
      copyToClipboard(`Subject: ${s}\n\n${b}`);
    });
    document.querySelectorAll("#application-modal .pill-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll("#application-modal .pill-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const which = tab.getAttribute("data-amtab");
        document.getElementById("amtab-jd").style.display = which === "jd" ? "block" : "none";
        document.getElementById("amtab-letter").style.display = which === "letter" ? "block" : "none";
        document.getElementById("amtab-email").style.display = which === "email" ? "block" : "none";
        document.getElementById("amtab-skills").style.display = which === "skills" ? "block" : "none";
      });
    });
  }

  function renderStats(apps) {
    const total = apps.length;
    const applied = apps.filter((a) => ["applied", "interviewing", "offer", "rejected"].includes(a.status)).length;
    const pending = apps.filter((a) => ["not_applied", "ready"].includes(a.status)).length;
    const avgScore = total ? Math.round(apps.reduce((sum, a) => sum + (a.matchScore || 0), 0) / total) : 0;

    const stats = [
      { label: "Tracked roles", value: total },
      { label: "Applied", value: applied },
      { label: "Awaiting action", value: pending },
      { label: "Avg. match score", value: avgScore + "%" },
    ];
    document.getElementById("dashboard-stats").innerHTML = stats
      .map((s) => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`)
      .join("");
  }

  async function render() {
    const wrap = document.getElementById("dashboard-table-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    let apps;
    try {
      apps = await S().applications.list();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load applications: ${escapeHtml(e.message)}</div>`;
      return;
    }
    renderStats(apps);

    let filtered = currentFilter ? apps.filter((a) => a.status === currentFilter) : apps;
    if (currentSearch) {
      filtered = filtered.filter((a) => (a.companyName || "").toLowerCase().includes(currentSearch));
    }

    if (apps.length === 0) {
      document.getElementById("dashboard-pagination").style.display = "none";
      wrap.innerHTML = `<div class="empty-state">No comparisons saved yet. Head to <strong>Compare &amp; Analyze</strong> to score your first job match.</div>`;
      return;
    }
    if (filtered.length === 0) {
      document.getElementById("dashboard-pagination").style.display = "none";
      wrap.innerHTML = `<div class="empty-state">${
        currentSearch ? `No companies matching "${escapeHtml(currentSearch)}".` : "No applications with that status."
      }</div>`;
      return;
    }

    // Paginate: "all" shows everything on one page; otherwise clamp currentPage to whatever the
    // filtered list can actually support (e.g. after a filter change shrinks the result count).
    const pageSize = currentPageSize === "all" ? filtered.length : currentPageSize;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > pageCount) currentPage = pageCount;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    const paginationEl = document.getElementById("dashboard-pagination");
    if (currentPageSize === "all" || pageCount <= 1) {
      paginationEl.style.display = "none";
    } else {
      paginationEl.style.display = "flex";
      const endIdx = Math.min(startIdx + pageSize, filtered.length);
      document.getElementById("dashboard-pagination-summary").textContent =
        `Showing ${startIdx + 1}–${endIdx} of ${filtered.length}`;
      document.getElementById("dashboard-page-prev").disabled = currentPage <= 1;
      document.getElementById("dashboard-page-next").disabled = currentPage >= pageCount;
    }

    let html = `<table><thead><tr><th>Company</th><th>Role</th><th>Resume</th><th>Pay</th><th>Score</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>`;
    pageItems.forEach((a) => {
      html += `<tr>
        <td>${escapeHtml(a.companyName || "—")}</td>
        <td>${escapeHtml(a.role || "—")}</td>
        <td class="muted">${escapeHtml(a.resumeLabel || "—")}</td>
        <td class="muted">${escapeHtml(a.compensation || "—")}</td>
        <td><strong style="color:${scoreColor(a.matchScore)}">${a.matchScore != null ? a.matchScore + "%" : "—"}</strong></td>
        <td><span class="badge badge-status status-${a.status}">${STATUS_LABEL[a.status] || a.status}</span></td>
        <td class="muted">${new Date(a.createdAt).toLocaleDateString()}</td>
        <td><button class="btn btn-secondary btn-sm" data-open="${a.id}">View</button></td>
      </tr>`;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => openModal(btn.getAttribute("data-open"))));
  }

  function scoreColor(score) {
    if (score == null) return "var(--text-dim)";
    if (score >= 70) return "var(--neon)";
    if (score >= 40) return "var(--amber)";
    return "var(--red)";
  }

  async function openModal(id) {
    const a = await S().applications.get(id);
    if (!a) return;
    openAppId = id;
    openAppMeta = { companyName: a.companyName || "company", role: a.role || "role", resumeId: a.resumeId || "", resumeLabel: a.resumeLabel || "", createdAt: a.createdAt };
    pendingRegenerated = null; // clear any leftover regenerated-but-unsaved state from a previously opened application
    document.getElementById("application-modal-title").textContent = `${a.role} — ${a.companyName}`;
    document.getElementById("application-modal-meta").textContent = `Resume: ${a.resumeLabel || "—"} · Match score: ${a.matchScore}% · Saved ${new Date(a.createdAt).toLocaleDateString()}`;
    document.getElementById("application-modal-id").value = a.id;
    document.getElementById("application-modal-status").value = a.status;
    document.getElementById("application-modal-applied-date").value = a.appliedAt ? a.appliedAt.slice(0, 10) : "";
    document.getElementById("application-modal-compensation").value = a.compensation || "";
    document.getElementById("application-modal-notes").value = a.notes || "";
    document.getElementById("application-modal-jd").value = a.jdText || "(No job description text was saved for this comparison.)";
    document.getElementById("application-modal-jd-url").innerHTML = a.jdUrl
      ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(a.jdUrl)}" target="_blank" rel="noopener" title="${escapeHtml(a.jdUrl)}">Open posting ↗</a>`
      : "";
    document.getElementById("application-modal-letter").value = a.coverLetter || "";
    document.getElementById("application-modal-email-subject").value = a.emailSubject || "";
    document.getElementById("application-modal-email-body").value = a.emailBody || "";
    document.getElementById("application-modal-matched").innerHTML = (a.matchedSkills || []).map((s) => `<span class="badge badge-matched">✓ ${escapeHtml(s)}</span>`).join("") || `<span class="muted">None</span>`;
    const gapWrap = document.getElementById("application-modal-gap");
    gapWrap.innerHTML =
      (a.gapSkills || [])
        .map((s) => `<button type="button" class="badge badge-gap badge-clickable" data-add-skill="${escapeHtml(s)}" title="Add to your Skills & knowledge">+ ${escapeHtml(s)}</button>`)
        .join("") || `<span class="muted">None</span>`;
    window.GapNinja.wireGapSkillChips(gapWrap);

    // reset to first tab (Job Description)
    document.querySelectorAll("#application-modal .pill-tab").forEach((t, i) => t.classList.toggle("active", i === 0));
    document.getElementById("amtab-jd").style.display = "block";
    document.getElementById("amtab-letter").style.display = "none";
    document.getElementById("amtab-email").style.display = "none";
    document.getElementById("amtab-skills").style.display = "none";

    document.getElementById("application-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("application-modal").classList.remove("open");
    openAppId = null;
    pendingRegenerated = null;
  }

  // Re-runs Analyze Fit against the saved job description and resume, using whatever the
  // matching/cover-letter logic does TODAY rather than what it did back when this was first
  // saved — so a bug fix (e.g. an irrelevant "bonus skill" no longer getting suggested) shows up
  // in an old comparison without redoing it from scratch on Compare & Analyze. Updates the match
  // score, matched/gap skill chips, cover letter, and follow-up email right here in the modal;
  // none of it touches Firestore until Save changes is clicked, same as hand-editing any of those
  // fields — this only stages fresher values in place of what's currently shown.
  async function regenerateAnalysis() {
    const btn = document.getElementById("application-modal-regenerate-btn");
    const jdText = document.getElementById("application-modal-jd").value;
    if (!jdText || jdText.startsWith("(No job description")) {
      window.GapNinja.toast("No job description was saved for this comparison — nothing to re-analyze");
      return;
    }
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Regenerating…";
    try {
      let resume = await S().resumes.get(openAppMeta.resumeId);
      // Same fallback as the resume-download button: the original resume may have been deleted
      // and re-uploaded since, which gives it a new ID the saved resumeId no longer resolves to.
      if (!resume && openAppMeta.resumeLabel) {
        const all = await S().resumes.list();
        resume = all.find((r) => r.label === openAppMeta.resumeLabel) || null;
      }
      if (!resume) {
        window.GapNinja.toast("Couldn't find the resume this was compared against — it may have been deleted");
        return;
      }

      const profile = await S().profile.get();
      const analysis = window.GapNinja.Matching.analyze(resume.rawText, jdText);
      const coverLetter = window.GapNinja.Templates.generateCoverLetter({
        profile,
        role: openAppMeta.role,
        company: openAppMeta.companyName,
        analysis,
      });
      const appliedDateVal = document.getElementById("application-modal-applied-date").value;
      const appliedDate = appliedDateVal ? new Date(appliedDateVal).toISOString() : new Date().toISOString();
      const email = window.GapNinja.Templates.generateFollowUpEmail({
        profile,
        role: openAppMeta.role,
        company: openAppMeta.companyName,
        appliedDate,
        analysis,
      });

      document.getElementById("application-modal-letter").value = coverLetter;
      document.getElementById("application-modal-email-subject").value = email.subject;
      document.getElementById("application-modal-email-body").value = email.body;
      document.getElementById("application-modal-matched").innerHTML =
        analysis.matched.map((m) => `<span class="badge badge-matched">✓ ${escapeHtml(m.skill.name)}</span>`).join("") || `<span class="muted">None</span>`;
      const gapWrap = document.getElementById("application-modal-gap");
      gapWrap.innerHTML =
        analysis.gap
          .map((g) => `<button type="button" class="badge badge-gap badge-clickable" data-add-skill="${escapeHtml(g.skill.name)}" title="Add to your Skills & knowledge">+ ${escapeHtml(g.skill.name)}</button>`)
          .join("") || `<span class="muted">None</span>`;
      window.GapNinja.wireGapSkillChips(gapWrap);

      document.getElementById("application-modal-meta").textContent =
        `Resume: ${openAppMeta.resumeLabel || "—"} · Match score: ${analysis.score}% (regenerated — not saved yet) · Saved ${
          openAppMeta.createdAt ? new Date(openAppMeta.createdAt).toLocaleDateString() : "—"
        }`;

      pendingRegenerated = {
        matchScore: analysis.score,
        matchedSkills: analysis.matched.map((m) => m.skill.name),
        gapSkills: analysis.gap.map((g) => g.skill.name),
      };

      window.GapNinja.toast("Regenerated — review the cover letter and email, then Save changes to keep them");
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Couldn't regenerate: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  // Today's date as "YYYY-MM-DD" in the browser's LOCAL timezone, for a <input type="date">
  // value — new Date().toISOString() alone would use UTC, which reads as tomorrow (or
  // yesterday) for anyone west (or east) of UTC for part of the day.
  function todayLocalISODate() {
    const d = new Date();
    const tzOffsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  }

  async function saveModal() {
    if (!openAppId) return;
    const status = document.getElementById("application-modal-status").value;
    const appliedDateVal = document.getElementById("application-modal-applied-date").value;
    try {
      await S().applications.update(openAppId, {
        status,
        appliedAt: appliedDateVal ? new Date(appliedDateVal).toISOString() : null,
        compensation: document.getElementById("application-modal-compensation").value.trim(),
        notes: document.getElementById("application-modal-notes").value,
        coverLetter: document.getElementById("application-modal-letter").value,
        emailSubject: document.getElementById("application-modal-email-subject").value,
        emailBody: document.getElementById("application-modal-email-body").value,
        // Only present after "Regenerate analysis" has run this session — carries the refreshed
        // match score and matched/gap skill lists into the same save as everything else.
        ...(pendingRegenerated || {}),
      });
      window.GapNinja.toast("Saved");
      closeModal();
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't save: " + e.message);
    }
  }

  async function deleteFromModal() {
    if (!openAppId) return;
    if (!confirm("Delete this tracked application? This can't be undone.")) return;
    try {
      await S().applications.remove(openAppId);
      window.GapNinja.toast("Deleted");
      closeModal();
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't delete: " + e.message);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => window.GapNinja.toast("Copied to clipboard"))
      .catch(() => window.GapNinja.toast("Couldn't copy — select and copy manually"));
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiDashboard = { init, render, openModal };
})();
