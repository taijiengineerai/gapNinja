/* gapNinja — Companies view */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  // Cache of the last-loaded data so typing in the search box or switching the period filter
  // just re-filters in memory instead of re-fetching from Firestore on every keystroke.
  let cachedCompanies = null;
  let cachedApps = null;

  function init() {
    document.getElementById("company-add-btn").addEventListener("click", () => openModal(null));
    document.getElementById("company-modal-cancel-btn").addEventListener("click", closeModal);
    document.getElementById("company-modal-save-btn").addEventListener("click", saveModal);
    document.getElementById("company-modal-lookup-btn").addEventListener("click", lookupContactInfo);
    document.getElementById("company-search-input").addEventListener("input", renderList);
    document.getElementById("company-period-filter").addEventListener("change", renderList);
    document.getElementById("company-sort").addEventListener("change", renderList);
  }

  async function openModal(id) {
    const isEdit = !!id;
    document.getElementById("company-modal-title").textContent = isEdit ? "Edit company" : "Add company";
    document.getElementById("company-modal-id").value = id || "";
    document.getElementById("company-modal-lookup-status").textContent = "";
    if (isEdit) {
      const c = await S().companies.get(id);
      document.getElementById("company-modal-name").value = (c && c.name) || "";
      document.getElementById("company-modal-website").value = (c && c.website) || "";
      document.getElementById("company-modal-email").value = (c && c.contactEmail) || "";
      document.getElementById("company-modal-phone").value = (c && c.contactPhone) || "";
      document.getElementById("company-modal-linkedin").value = (c && c.linkedin) || "";
      document.getElementById("company-modal-notes").value = (c && c.notes) || "";
    } else {
      document.getElementById("company-modal-name").value = "";
      document.getElementById("company-modal-website").value = "";
      document.getElementById("company-modal-email").value = "";
      document.getElementById("company-modal-phone").value = "";
      document.getElementById("company-modal-linkedin").value = "";
      document.getElementById("company-modal-notes").value = "";
    }
    document.getElementById("company-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("company-modal").classList.remove("open");
  }

  async function saveModal() {
    const id = document.getElementById("company-modal-id").value;
    const name = document.getElementById("company-modal-name").value.trim();
    if (!name) {
      alert("Company name is required.");
      return;
    }
    const payload = {
      name,
      website: document.getElementById("company-modal-website").value.trim(),
      contactEmail: document.getElementById("company-modal-email").value.trim(),
      contactPhone: document.getElementById("company-modal-phone").value.trim(),
      linkedin: document.getElementById("company-modal-linkedin").value.trim(),
      notes: document.getElementById("company-modal-notes").value.trim(),
    };
    try {
      if (id) {
        await S().companies.update(id, payload);
        window.GapNinja.toast("Company updated");
      } else {
        await S().companies.add(payload);
        window.GapNinja.toast("Company added");
      }
      closeModal();
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't save: " + e.message);
    }
  }

  async function deleteCompany(id) {
    if (!confirm("Delete this company? Its applications will stay, just without a linked company record.")) return;
    try {
      await S().companies.remove(id);
      window.GapNinja.toast("Company deleted");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't delete: " + e.message);
    }
  }

  // Ensures a company record exists for a given name; used when saving an application from Compare view.
  async function ensureCompany(name) {
    if (!name || !name.trim()) return null;
    const existing = await S().companies.findByName(name);
    if (existing) return existing;
    return S().companies.add({ name: name.trim(), website: "", contactEmail: "", contactPhone: "", linkedin: "", notes: "" });
  }

  // ---- Auto-fill: best-effort fetch of the company's website, then pattern-match for
  // an email, phone number, and LinkedIn company link. No AI API involved — just regex over
  // whatever page text we can actually reach. Most company sites block cross-origin fetches
  // from a browser, so this often comes back empty; that's expected, not a bug.
  async function lookupContactInfo() {
    const url = document.getElementById("company-modal-website").value.trim();
    const statusEl = document.getElementById("company-modal-lookup-status");
    const btn = document.getElementById("company-modal-lookup-btn");

    if (!url) {
      statusEl.textContent = "Add a website URL first.";
      statusEl.style.color = "var(--amber)";
      return;
    }

    btn.disabled = true;
    statusEl.style.color = "";
    statusEl.textContent = "Searching the site…";

    const candidateUrls = buildCandidateUrls(url);
    let found = { email: "", phone: "", linkedin: "" };
    let reachedAnyPage = false;

    for (const candidate of candidateUrls) {
      try {
        const res = await fetch(candidate, { mode: "cors" });
        if (!res.ok) continue;
        const html = await res.text();
        reachedAnyPage = true;
        const extracted = extractContactInfo(html);
        found.email = found.email || extracted.email;
        found.phone = found.phone || extracted.phone;
        found.linkedin = found.linkedin || extracted.linkedin;
        if (found.email && found.phone && found.linkedin) break; // got everything, stop early
      } catch (e) {
        // CORS block or network error — try the next candidate page, if any.
      }
    }

    btn.disabled = false;

    if (!reachedAnyPage) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Couldn't reach that site from the browser (most company websites block this). Fill in the fields manually.";
      return;
    }

    let filledCount = 0;
    if (found.email) {
      document.getElementById("company-modal-email").value = found.email;
      filledCount++;
    }
    if (found.phone) {
      document.getElementById("company-modal-phone").value = found.phone;
      filledCount++;
    }
    if (found.linkedin) {
      document.getElementById("company-modal-linkedin").value = found.linkedin;
      filledCount++;
    }

    if (filledCount === 0) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Reached the site, but didn't spot any contact details on that page — try a contact/about page URL, or fill in manually.";
    } else {
      statusEl.style.color = "var(--neon)";
      statusEl.textContent = `Found ${filledCount} field${filledCount === 1 ? "" : "s"} — double-check before saving.`;
    }
  }

  function buildCandidateUrls(rawUrl) {
    let base;
    try {
      base = new URL(rawUrl.match(/^https?:\/\//i) ? rawUrl : "https://" + rawUrl);
    } catch (e) {
      return [rawUrl];
    }
    const origin = base.origin;
    const candidates = [base.toString()];
    // If they gave the homepage, also peek at common contact-info pages on the same origin.
    if (base.pathname === "/" || base.pathname === "") {
      ["/contact", "/contact-us", "/about"].forEach((path) => candidates.push(origin + path));
    }
    return candidates;
  }

  function extractContactInfo(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style").forEach((el) => el.remove());
    const text = (doc.body ? doc.body.textContent : "").replace(/\s+/g, " ");

    // Email: prefer generic inboxes (contact/info/hello/careers/hr/jobs) over a random one.
    const emailMatches = Array.from(text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)).map((m) => m[0]);
    const genericPrefixes = ["contact", "info", "hello", "careers", "hr", "jobs", "recruiting", "talent"];
    const email =
      emailMatches.find((e) => genericPrefixes.some((p) => e.toLowerCase().startsWith(p + "@"))) ||
      emailMatches.find((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e)) ||
      "";

    // Phone: loose US/international pattern, e.g. (555) 123-4567, 555-123-4567, +1 555 123 4567
    const phoneMatch = text.match(/(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
    const phone = phoneMatch ? phoneMatch[0].trim() : "";

    // LinkedIn company page link, pulled from raw HTML (need the href attribute, not visible text).
    const linkedinMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/[a-zA-Z0-9\-_%]+/i);
    const linkedin = linkedinMatch ? linkedinMatch[0] : "";

    return { email, phone, linkedin };
  }

  function isThisMonth(ts) {
    if (!ts) return false;
    const d = new Date(ts);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }

  // Re-fetches from Firestore, then renders. Call this after anything that changes the
  // underlying data (add/edit/delete a company, or first entering the view).
  async function render() {
    const wrap = document.getElementById("company-list-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    try {
      [cachedCompanies, cachedApps] = await Promise.all([S().companies.list(), S().applications.list()]);
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load companies: ${escapeHtml(e.message)}</div>`;
      return;
    }
    renderList();
  }

  // Filters/sorts the already-loaded data and redraws the grid — used both by render() and by
  // the search box / period select, so typing a search term never re-hits Firestore.
  function renderList() {
    const wrap = document.getElementById("company-list-wrap");
    if (!cachedCompanies) return;
    if (cachedCompanies.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No companies yet. They're created automatically when you save a comparison, or add one manually.</div>`;
      return;
    }

    const search = (document.getElementById("company-search-input").value || "").trim().toLowerCase();
    const period = document.getElementById("company-period-filter").value || "all";

    // Each company's "activity date" is its most recent comparison, falling back to when the
    // company record itself was created (so a freshly-added company with no comparisons yet
    // still counts as "this month" instead of disappearing under that filter).
    let entries = cachedCompanies.map((c) => {
      const relatedApps = cachedApps
        .filter((a) => a.companyId === c.id)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const mostRecent = relatedApps[0];
      const activityDate = (mostRecent && mostRecent.createdAt) || c.createdAt || 0;
      return { c, relatedApps, mostRecent, activityDate };
    });

    if (search) {
      entries = entries.filter(({ c }) => (c.name || "").toLowerCase().includes(search));
    }
    if (period === "month") {
      entries = entries.filter(({ activityDate }) => isThisMonth(activityDate));
    }

    // Each card also surfaces its most recent application date (from the history below) so you
    // can see at a glance whether it's something you applied to recently or a much older
    // comparison — independent of whichever sort order is chosen below.
    const sortBy = document.getElementById("company-sort").value || "name";
    if (sortBy === "recent") {
      // Most recent comparison first; companies with no comparison yet sort to the bottom,
      // then alphabetically among themselves so that group isn't left in random order.
      entries.sort((a, b) => {
        if (!a.mostRecent && !b.mostRecent) return (a.c.name || "").localeCompare(b.c.name || "", undefined, { sensitivity: "base" });
        if (!a.mostRecent) return 1;
        if (!b.mostRecent) return -1;
        return (b.activityDate || 0) - (a.activityDate || 0);
      });
    } else {
      entries.sort((a, b) => (a.c.name || "").localeCompare(b.c.name || "", undefined, { sensitivity: "base" }));
    }

    if (entries.length === 0) {
      const reason = search && period === "month"
        ? `matching "${escapeHtml(search)}" with activity this month`
        : search
        ? `matching "${escapeHtml(search)}"`
        : "with activity this month";
      wrap.innerHTML = `<div class="empty-state">No companies ${reason}.</div>`;
      return;
    }

    let html = "";
    entries.forEach(({ c, relatedApps }) => {
      const contactLines = [
        c.contactEmail ? `<a href="mailto:${escapeHtml(c.contactEmail)}">${escapeHtml(c.contactEmail)}</a>` : "",
        c.contactPhone ? escapeHtml(c.contactPhone) : "",
        c.linkedin ? `<a href="${escapeHtml(withProtocol(c.linkedin))}" target="_blank" rel="noopener">LinkedIn</a>` : "",
      ].filter(Boolean);
      html += `<div class="card">
        <div class="flex-between">
          <div class="card-title" style="margin:0;">${escapeHtml(c.name)}</div>
          <div class="flex gap-8">
            <button class="icon-btn" data-edit="${c.id}" title="Edit">✎</button>
            <button class="icon-btn" data-del="${c.id}" title="Delete">✕</button>
          </div>
        </div>
        ${c.website ? `<div class="hint"><a href="${escapeHtml(withProtocol(c.website))}" target="_blank" rel="noopener">${escapeHtml(c.website)}</a></div>` : ""}
        ${contactLines.length ? `<div class="hint" style="margin-top:4px;">${contactLines.join(" &nbsp;·&nbsp; ")}</div>` : ""}
        ${c.notes ? `<div style="font-size:13px; margin-top:8px; color:var(--text-dim);">${escapeHtml(c.notes)}</div>` : ""}
        <div class="divider"></div>
        ${renderHistoryToggle(c.id, relatedApps)}
        ${renderHistoryList(c.id, relatedApps)}
      </div>`;
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openModal(btn.getAttribute("data-edit"))));
    wrap.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => deleteCompany(btn.getAttribute("data-del"))));
    wrap.querySelectorAll("[data-toggle-history]").forEach((btn) =>
      btn.addEventListener("click", () => toggleHistory(btn.getAttribute("data-toggle-history")))
    );
    wrap.querySelectorAll("[data-view-history-app]").forEach((btn) =>
      btn.addEventListener("click", () => window.GapNinja.UiDashboard.openModal(btn.getAttribute("data-view-history-app")))
    );
  }

  function renderHistoryToggle(companyId, relatedApps) {
    if (relatedApps.length === 0) {
      return `<div class="hint">No comparisons run for this company yet.</div>`;
    }
    return `<button class="btn btn-secondary btn-sm" type="button" data-toggle-history="${companyId}" style="width:100%; justify-content:center;">
      ${relatedApps.length} comparison${relatedApps.length === 1 ? "" : "s"} run — view history
    </button>`;
  }

  function renderHistoryList(companyId, relatedApps) {
    if (relatedApps.length === 0) return "";
    const rows = relatedApps
      .map((a) => {
        const snippet = escapeHtml((a.jdText || "").slice(0, 140)) + ((a.jdText || "").length > 140 ? "…" : "");
        const date = a.createdAt ? formatTimestamp(a.createdAt) : "";
        return `<div class="history-row">
          <div class="flex-between">
            <div><strong>${escapeHtml(a.role || "Role")}</strong> <span class="hint">· ${date} · ${escapeHtml(a.resumeLabel || "—")}</span></div>
            <span class="job-match-badge ${matchClass(a.matchScore)}">${a.matchScore != null ? a.matchScore + "%" : "—"}</span>
          </div>
          ${snippet ? `<div class="hint" style="margin-top:4px;">${snippet}</div>` : `<div class="hint" style="margin-top:4px;">No job description text saved for this one.</div>`}
          <button class="btn btn-secondary btn-sm" type="button" data-view-history-app="${a.id}" style="margin-top:6px;">View full analysis</button>
        </div>`;
      })
      .join("");
    return `<div class="history-list" id="history-${companyId}" style="display:none;">${rows}</div>`;
  }

  function matchClass(score) {
    if (score == null) return "job-match-low";
    if (score >= 70) return "job-match-high";
    if (score >= 40) return "job-match-mid";
    return "job-match-low";
  }

  function toggleHistory(companyId) {
    const el = document.getElementById("history-" + companyId);
    if (!el) return;
    const showing = el.style.display !== "none";
    el.style.display = showing ? "none" : "block";
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

  function withProtocol(url) {
    return /^https?:\/\//i.test(url) ? url : "https://" + url;
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiCompanies = { init, render, ensureCompany };
})();
