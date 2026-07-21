/* gapNinja — My Links view: save personal links (LinkedIn, portfolio, GitHub, etc.) to copy
   and paste anytime — as many as you want, each with an optional label. */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  function init() {
    document.getElementById("link-add-btn").addEventListener("click", addLink);
  }

  async function addLink() {
    const labelEl = document.getElementById("link-label");
    const urlEl = document.getElementById("link-url");
    const label = labelEl.value.trim();
    const url = urlEl.value.trim();

    if (!url) {
      window.GapNinja.toast("Paste a link first");
      return;
    }

    try {
      await S().links.add({ label: label || hostnameOf(url), url });
      labelEl.value = "";
      urlEl.value = "";
      window.GapNinja.toast("Link saved");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't save: " + e.message);
    }
  }

  async function deleteLink(id) {
    if (!confirm("Remove this link?")) return;
    try {
      await S().links.remove(id);
      window.GapNinja.toast("Link removed");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't remove: " + e.message);
    }
  }

  function copyLink(url) {
    navigator.clipboard
      .writeText(url)
      .then(() => window.GapNinja.toast("Copied to clipboard"))
      .catch(() => window.GapNinja.toast("Couldn't copy — select and copy manually"));
  }

  // Only one row editable at a time — same pattern as the Job Queue's inline edit.
  let editingId = null;

  function startEdit(id) {
    editingId = id;
    render();
  }
  function cancelEdit() {
    editingId = null;
    render();
  }
  async function saveEdit(id, btn) {
    const row = btn.closest("tr");
    const label = row.querySelector("[data-edit-label]").value.trim();
    const url = row.querySelector("[data-edit-url]").value.trim();
    if (!url) {
      window.GapNinja.toast("The link can't be empty");
      return;
    }
    btn.disabled = true;
    try {
      await S().links.update(id, { label: label || hostnameOf(url), url });
      editingId = null;
      window.GapNinja.toast("Updated");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't save: " + e.message);
      btn.disabled = false;
    }
  }

  async function render() {
    const wrap = document.getElementById("link-list-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    let links;
    try {
      links = await S().links.list();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load links: ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (links.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No links saved yet. Add your LinkedIn, portfolio, or anything else above.</div>`;
      return;
    }

    let html = `<table><thead><tr><th>Label</th><th>Link</th><th></th></tr></thead><tbody>`;
    links.forEach((l) => {
      if (l.id === editingId) {
        html += `<tr>
          <td><input type="text" data-edit-label value="${escapeHtml(l.label)}" placeholder="Label" /></td>
          <td><input type="url" data-edit-url value="${escapeHtml(l.url)}" placeholder="https://…" /></td>
          <td class="flex gap-8">
            <button class="btn btn-primary btn-sm" data-save="${l.id}">Save</button>
            <button class="btn btn-secondary btn-sm" data-cancel="${l.id}">Cancel</button>
          </td>
        </tr>`;
      } else {
        html += `<tr>
          <td>${escapeHtml(l.label)}</td>
          <td class="mono" style="word-break:break-all;"><a href="${escapeHtml(withProtocol(l.url))}" target="_blank" rel="noopener">${escapeHtml(l.url)}</a></td>
          <td class="flex gap-8">
            <button class="btn btn-secondary btn-sm" data-copy="${l.id}">Copy</button>
            <button class="btn btn-secondary btn-sm" data-edit="${l.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${l.id}">Delete</button>
          </td>
        </tr>`;
      }
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll("[data-copy]").forEach((btn) => {
      const link = links.find((x) => x.id === btn.getAttribute("data-copy"));
      if (link) btn.addEventListener("click", () => copyLink(link.url));
    });
    wrap.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => startEdit(btn.getAttribute("data-edit"))));
    wrap.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => deleteLink(btn.getAttribute("data-del"))));
    wrap.querySelectorAll("[data-cancel]").forEach((btn) => btn.addEventListener("click", cancelEdit));
    wrap.querySelectorAll("[data-save]").forEach((btn) => btn.addEventListener("click", () => saveEdit(btn.getAttribute("data-save"), btn)));
  }

  function withProtocol(url) {
    return /^https?:\/\//i.test(url) ? url : "https://" + url;
  }

  function hostnameOf(url) {
    try {
      return new URL(withProtocol(url)).hostname.replace(/^www\./, "");
    } catch (e) {
      return url;
    }
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiLinks = { init, render };
})();
