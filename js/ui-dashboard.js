/* gapNinja — Dashboard view: overview stats + full application history */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }
  let currentFilter = "";
  let currentPageSize = 20; // number, or "all"
  let currentPage = 1; // 1-based
  let openAppId = null;
  let openAppMeta = { companyName: "", role: "" };

  const STATUS_LABEL = {
    not_applied: "Not applied",
    ready: "Ready to apply",
    applied: "Applied",
    interviewing: "Interviewing",
    offer: "Offer",
    rejected: "Rejected",
  };

  function init() {
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

    const filtered = currentFilter ? apps.filter((a) => a.status === currentFilter) : apps;

    if (apps.length === 0) {
      document.getElementById("dashboard-pagination").style.display = "none";
      wrap.innerHTML = `<div class="empty-state">No comparisons saved yet. Head to <strong>Compare &amp; Analyze</strong> to score your first job match.</div>`;
      return;
    }
    if (filtered.length === 0) {
      document.getElementById("dashboard-pagination").style.display = "none";
      wrap.innerHTML = `<div class="empty-state">No applications with that status.</div>`;
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
    openAppMeta = { companyName: a.companyName || "company", role: a.role || "role" };
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
