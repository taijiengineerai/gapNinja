/* gapNinja — Cover Letters view: a browsable library of every cover letter gapNinja has drafted
   for a saved application, so an old one can be reused (copied, downloaded, or used as a starting
   point) for a new job without digging through the Dashboard row by row. Read-only — editing a
   letter still happens on its original application in the Dashboard modal. */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  // Cache of the last-loaded data so typing in the search box just re-filters in memory instead
  // of re-fetching from Firestore on every keystroke — same pattern as ui-companies.js.
  let cachedApps = null;
  let currentPageSize = 20; // number, or "all"
  let currentPage = 1; // 1-based
  let previewAppId = null;

  function init() {
    document.getElementById("letter-search-input").addEventListener("input", () => {
      currentPage = 1; // a new search term changes what "page 1" means — start over
      renderList();
    });
    document.getElementById("letter-page-size").addEventListener("change", (e) => {
      currentPageSize = e.target.value === "all" ? "all" : parseInt(e.target.value, 10);
      currentPage = 1;
      renderList();
    });
    document.getElementById("letter-page-prev").addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderList();
      }
    });
    document.getElementById("letter-page-next").addEventListener("click", () => {
      currentPage++; // clamped inside renderList() against the actual page count
      renderList();
    });
    document.getElementById("letter-preview-close-btn").addEventListener("click", closePreview);
    document.getElementById("letter-preview-close-btn-2").addEventListener("click", closePreview);
    document.getElementById("letter-preview-copy-btn").addEventListener("click", () => {
      copyToClipboard(document.getElementById("letter-preview-text").value);
    });
    document.getElementById("letter-preview-download-btn").addEventListener("click", () => {
      const a = (cachedApps || []).find((app) => app.id === previewAppId);
      if (!a) return;
      downloadLetter(a);
    });
    document.getElementById("letter-preview-open-full-btn").addEventListener("click", () => {
      if (!previewAppId) return;
      const id = previewAppId;
      closePreview();
      window.GapNinja.UiDashboard.openModal(id);
    });

    document.getElementById("letter-template-save-btn").addEventListener("click", saveTemplate);
    document.getElementById("letter-template-copy-btn").addEventListener("click", () => {
      copyToClipboard(document.getElementById("letter-template-text").value);
    });
    document.getElementById("letter-template-download-btn").addEventListener("click", () => {
      try {
        window.GapNinja.PdfExport.downloadTextAsPdf(document.getElementById("letter-template-text").value, "cover-letter-template.pdf");
      } catch (e) {
        window.GapNinja.toast(e.message);
      }
    });
    document.getElementById("letter-template-reset-btn").addEventListener("click", () => {
      if (!confirm("Replace the current text with the example template? This won't save until you click Save Template.")) return;
      document.getElementById("letter-template-text").value = window.GapNinja.Templates.DEFAULT_COVER_LETTER_TEMPLATE;
    });
  }

  // Loads the saved template from the profile (falling back to the built-in example the very
  // first time, before anything's been saved) and fills the textarea. Called once on entering
  // the view — after that, the textarea is just left as whatever the user is editing.
  async function renderTemplate() {
    const textarea = document.getElementById("letter-template-text");
    try {
      const profile = await S().profile.get();
      textarea.value =
        profile && typeof profile.coverLetterTemplate === "string" && profile.coverLetterTemplate.trim()
          ? profile.coverLetterTemplate
          : window.GapNinja.Templates.DEFAULT_COVER_LETTER_TEMPLATE;
    } catch (e) {
      textarea.value = window.GapNinja.Templates.DEFAULT_COVER_LETTER_TEMPLATE;
    }
  }

  async function saveTemplate() {
    const btn = document.getElementById("letter-template-save-btn");
    const text = document.getElementById("letter-template-text").value;
    btn.disabled = true;
    try {
      await S().profile.save({ coverLetterTemplate: text });
      window.GapNinja.toast("Template saved");
    } catch (e) {
      window.GapNinja.toast("Couldn't save: " + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  // Re-fetches from Firestore, then renders. Call this on entering the view.
  async function render() {
    renderTemplate();
    const wrap = document.getElementById("letter-list-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    try {
      const apps = await S().applications.list();
      cachedApps = apps.filter((a) => (a.coverLetter || "").trim());
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load cover letters: ${escapeHtml(e.message)}</div>`;
      return;
    }
    renderList();
  }

  // Filters/sorts the already-loaded data and redraws the list — used by both render() and the
  // search box, so typing a search term never re-hits Firestore.
  function renderList() {
    const wrap = document.getElementById("letter-list-wrap");
    if (!cachedApps) return;
    if (cachedApps.length === 0) {
      document.getElementById("letter-pagination").style.display = "none";
      wrap.innerHTML = `<div class="empty-state">No cover letters yet. Run a comparison in <strong>Compare &amp; Analyze</strong> and save it to get your first one.</div>`;
      return;
    }

    const search = (document.getElementById("letter-search-input").value || "").trim().toLowerCase();
    let entries = cachedApps.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (search) {
      entries = entries.filter(
        (a) => (a.companyName || "").toLowerCase().includes(search) || (a.role || "").toLowerCase().includes(search)
      );
    }

    if (entries.length === 0) {
      document.getElementById("letter-pagination").style.display = "none";
      wrap.innerHTML = `<div class="empty-state">No cover letters matching "${escapeHtml(search)}".</div>`;
      return;
    }

    // Paginate: "all" shows every matching letter on one page; otherwise clamp currentPage to
    // whatever the filtered list can actually support (e.g. after a search narrows the results).
    const pageSize = currentPageSize === "all" ? entries.length : currentPageSize;
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    if (currentPage > pageCount) currentPage = pageCount;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * pageSize;
    const pageEntries = entries.slice(startIdx, startIdx + pageSize);

    const paginationEl = document.getElementById("letter-pagination");
    if (currentPageSize === "all" || pageCount <= 1) {
      paginationEl.style.display = "none";
    } else {
      paginationEl.style.display = "flex";
      const endIdx = Math.min(startIdx + pageSize, entries.length);
      document.getElementById("letter-pagination-summary").textContent =
        `Showing ${startIdx + 1}–${endIdx} of ${entries.length}`;
      document.getElementById("letter-page-prev").disabled = currentPage <= 1;
      document.getElementById("letter-page-next").disabled = currentPage >= pageCount;
    }

    let html = "";
    pageEntries.forEach((a) => {
      const letter = a.coverLetter || "";
      const snippet = escapeHtml(letter.slice(0, 220)) + (letter.length > 220 ? "…" : "");
      const date = a.createdAt ? formatTimestamp(a.createdAt) : "";
      html += `<div class="card">
        <div class="flex-between">
          <div class="card-title" style="margin:0;">${escapeHtml(a.role || "Role")} — ${escapeHtml(a.companyName || "Company")}</div>
          <span class="job-match-badge ${matchClass(a.matchScore)}">${a.matchScore != null ? a.matchScore + "%" : "—"}</span>
        </div>
        <div class="hint" style="margin:2px 0 8px 0;">${date} · ${escapeHtml(a.resumeLabel || "—")}</div>
        <div style="font-size:13.5px; color:var(--text-dim); white-space:pre-wrap;">${snippet}</div>
        <div class="flex gap-8" style="margin-top:10px;">
          <button class="btn btn-secondary btn-sm" data-preview="${a.id}">View full letter</button>
          <button class="btn btn-secondary btn-sm" data-copy="${a.id}">Copy</button>
          <button class="btn btn-secondary btn-sm" data-download="${a.id}">Download PDF</button>
        </div>
      </div>`;
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-preview]").forEach((btn) => btn.addEventListener("click", () => openPreview(btn.getAttribute("data-preview"))));
    wrap.querySelectorAll("[data-copy]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const a = (cachedApps || []).find((app) => app.id === btn.getAttribute("data-copy"));
        if (a) copyToClipboard(a.coverLetter || "");
      })
    );
    wrap.querySelectorAll("[data-download]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const a = (cachedApps || []).find((app) => app.id === btn.getAttribute("data-download"));
        if (a) downloadLetter(a);
      })
    );
  }

  function openPreview(appId) {
    const a = (cachedApps || []).find((app) => app.id === appId);
    if (!a) return;
    previewAppId = appId;
    document.getElementById("letter-preview-title").textContent = `${a.role || "Role"} — ${a.companyName || ""}`;
    document.getElementById("letter-preview-meta").textContent =
      `Match score: ${a.matchScore != null ? a.matchScore + "%" : "—"} · ${a.resumeLabel || "—"} · Saved ${a.createdAt ? formatTimestamp(a.createdAt) : "—"}`;
    document.getElementById("letter-preview-text").value = a.coverLetter || "";
    document.getElementById("letter-preview-modal").classList.add("open");
  }

  function closePreview() {
    document.getElementById("letter-preview-modal").classList.remove("open");
    previewAppId = null;
  }

  function downloadLetter(a) {
    try {
      window.GapNinja.PdfExport.downloadTextAsPdf(a.coverLetter || "", `${a.companyName || "company"}-${a.role || "role"}-cover-letter.pdf`);
    } catch (e) {
      window.GapNinja.toast(e.message);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => window.GapNinja.toast("Copied to clipboard"))
      .catch(() => window.GapNinja.toast("Couldn't copy — select and copy manually"));
  }

  function matchClass(score) {
    if (score == null) return "job-match-low";
    if (score >= 70) return "job-match-high";
    if (score >= 40) return "job-match-mid";
    return "job-match-low";
  }

  // Full date + time + timezone abbreviation (EST, CST, PDT, etc.) — whichever timezone the
  // browser viewing it is actually in, not a hardcoded one, so it's always locally correct.
  function formatTimestamp(ts) {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiLetters = { init, render };
})();
