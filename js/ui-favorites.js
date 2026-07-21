/* gapNinja — Favorites view: save a company + a career page/job link worth revisiting.
   The same favorite-modal is also opened from Compare & Analyze ("Add to Favorites" on a
   result) and the Job Queue (a "Favorite" button per row) — see openAddModal(). */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  let editingId = null; // set when the modal is editing an existing favorite, null when adding new

  function init() {
    document.getElementById("favorite-add-btn").addEventListener("click", () => openModal());
    document.getElementById("favorite-modal-cancel-btn").addEventListener("click", closeModal);
    document.getElementById("favorite-modal-save-btn").addEventListener("click", saveModal);
    document.getElementById("favorite-modal").addEventListener("click", (e) => {
      if (e.target.id === "favorite-modal") closeModal();
    });
  }

  // Opens the modal pre-filled with whatever the caller already knows — Compare & Analyze
  // passes { company, link }, the Job Queue passes just { link }, the Favorites view's own
  // "+ Add Favorite" button passes nothing. Also used internally for editing an existing entry.
  function openModal(prefill) {
    const p = prefill || {};
    editingId = p.id || null;
    document.getElementById("favorite-modal-id").value = editingId || "";
    document.getElementById("favorite-modal-company").value = p.company || "";
    document.getElementById("favorite-modal-link").value = p.link || "";
    document.getElementById("favorite-modal-note").value = p.note || "";
    document.getElementById("favorite-modal").classList.add("open");
  }

  function closeModal() {
    document.getElementById("favorite-modal").classList.remove("open");
  }

  async function saveModal() {
    const company = document.getElementById("favorite-modal-company").value.trim();
    const link = document.getElementById("favorite-modal-link").value.trim();
    const note = document.getElementById("favorite-modal-note").value.trim();
    if (!company) {
      window.GapNinja.toast("Add a company name first");
      return;
    }
    if (!link) {
      window.GapNinja.toast("Add a career page or job link first");
      return;
    }
    try {
      if (editingId) {
        await S().favoriteCompanies.update(editingId, { company, link, note });
        window.GapNinja.toast("Favorite updated");
      } else {
        await S().favoriteCompanies.add({ company, link, note });
        window.GapNinja.toast("Added to Favorites");
      }
      closeModal();
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't save: " + e.message);
    }
  }

  async function deleteFavorite(id) {
    if (!confirm("Remove this favorite?")) return;
    try {
      await S().favoriteCompanies.remove(id);
      window.GapNinja.toast("Removed");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't remove: " + e.message);
    }
  }

  function copyFavoriteLink(link) {
    navigator.clipboard
      .writeText(link)
      .then(() => window.GapNinja.toast("Copied to clipboard"))
      .catch(() => window.GapNinja.toast("Couldn't copy — select and copy manually"));
  }

  async function render() {
    const wrap = document.getElementById("favorite-list-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    let favorites;
    try {
      favorites = await S().favoriteCompanies.list();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load favorites: ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (favorites.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No favorites yet. Add one above, or use "Add to Favorites" from a job comparison or the Job Queue.</div>`;
      return;
    }

    let html = "";
    favorites.forEach((f) => {
      html += `<div class="card" style="margin-bottom:12px;">
        <div class="flex-between">
          <div class="card-title" style="margin:0;">${escapeHtml(f.company)}</div>
          <div class="flex gap-8">
            <button class="icon-btn" data-edit="${f.id}" title="Edit">✎</button>
            <button class="icon-btn" data-del="${f.id}" title="Delete">✕</button>
          </div>
        </div>
        <div class="hint mono" style="margin-top:4px; word-break:break-all;">
          <a href="${escapeHtml(withProtocol(f.link))}" target="_blank" rel="noopener">${escapeHtml(f.link)}</a>
        </div>
        ${f.note ? `<div style="font-size:13px; margin-top:8px; color:var(--text-dim);">${escapeHtml(f.note)}</div>` : ""}
        <div class="flex gap-8" style="margin-top:10px;">
          <button class="btn btn-secondary btn-sm" data-copy="${f.id}">Copy link</button>
        </div>
      </div>`;
    });
    wrap.innerHTML = html;

    wrap.querySelectorAll("[data-copy]").forEach((btn) => {
      const fav = favorites.find((x) => x.id === btn.getAttribute("data-copy"));
      if (fav) btn.addEventListener("click", () => copyFavoriteLink(fav.link));
    });
    wrap.querySelectorAll("[data-edit]").forEach((btn) => {
      const fav = favorites.find((x) => x.id === btn.getAttribute("data-edit"));
      if (fav) btn.addEventListener("click", () => openModal(fav));
    });
    wrap.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => deleteFavorite(btn.getAttribute("data-del"))));
  }

  function withProtocol(url) {
    return /^https?:\/\//i.test(url) ? url : "https://" + url;
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiFavorites = { init, render, openAddModal: openModal };
})();
