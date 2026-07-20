/* gapNinja — Job Queue view: paste job links to analyze/apply later */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  function init() {
    document.getElementById("task-add-btn").addEventListener("click", addTask);
  }

  async function addTask() {
    const linkEl = document.getElementById("task-link");
    const noteEl = document.getElementById("task-note");
    const link = linkEl.value.trim();
    if (!link) {
      window.GapNinja.toast("Paste a job link first");
      return;
    }
    try {
      await S().tasks.add({ link, note: noteEl.value.trim(), status: "queued", linkedApplicationId: null });
      linkEl.value = "";
      noteEl.value = "";
      window.GapNinja.toast("Added to queue");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't add: " + e.message);
    }
  }

  async function deleteTask(id) {
    if (!confirm("Remove this from the queue?")) return;
    try {
      await S().tasks.remove(id);
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't remove: " + e.message);
    }
  }

  async function analyzeTask(id) {
    const task = await S().tasks.get(id);
    if (!task) return;
    window.GapNinja.UiCompare.prefill({ url: task.link, note: task.note, taskId: task.id });
    window.GapNinja.navigate("compare");
  }

  // Only one row editable at a time — id of the task currently in edit mode, or null.
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
    const link = row.querySelector("[data-edit-link]").value.trim();
    const note = row.querySelector("[data-edit-note]").value.trim();
    if (!link) {
      window.GapNinja.toast("The link can't be empty");
      return;
    }
    btn.disabled = true;
    try {
      await S().tasks.update(id, { link, note });
      editingId = null;
      window.GapNinja.toast("Updated");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't save: " + e.message);
      btn.disabled = false;
    }
  }

  const STATUS_LABEL = {
    queued: "Ready to analyze",
    analyzed: "Analyzed — ready to apply",
    applied: "Applied",
  };

  async function render() {
    const wrap = document.getElementById("task-list-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    let tasks;
    try {
      tasks = await S().tasks.list();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load queue: ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (tasks.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Your job queue is empty. Paste a job link above to save it for later.</div>`;
      return;
    }
    let html = `<table><thead><tr><th>Posting</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>`;
    tasks.forEach((t) => {
      if (t.id === editingId) {
        html += `<tr>
          <td>
            <input type="url" data-edit-link value="${escapeHtml(t.link)}" placeholder="https://company.com/careers/job/123" />
          </td>
          <td>
            <input type="text" data-edit-note value="${escapeHtml(t.note || "")}" placeholder="Quick note (optional)" />
          </td>
          <td><span class="badge badge-status status-${t.status === "applied" ? "applied" : t.status === "analyzed" ? "ready" : "not_applied"}">${STATUS_LABEL[t.status] || t.status}</span></td>
          <td class="flex gap-8">
            <button class="btn btn-primary btn-sm" data-save="${t.id}">Save</button>
            <button class="btn btn-secondary btn-sm" data-cancel="${t.id}">Cancel</button>
          </td>
        </tr>`;
      } else {
        html += `<tr>
          <td>
            <a class="btn btn-secondary btn-sm" href="${escapeHtml(t.link)}" target="_blank" rel="noopener" title="${escapeHtml(t.link)}">Open posting ↗</a>
            <div class="hint mono" style="margin-top:4px; word-break:break-all;">${escapeHtml(hostnameOf(t.link))}</div>
          </td>
          <td class="muted">${escapeHtml(t.note || "—")}</td>
          <td><span class="badge badge-status status-${t.status === "applied" ? "applied" : t.status === "analyzed" ? "ready" : "not_applied"}">${STATUS_LABEL[t.status] || t.status}</span></td>
          <td class="flex gap-8">
            <button class="btn btn-secondary btn-sm" data-analyze="${t.id}">Analyze this job</button>
            <button class="btn btn-secondary btn-sm" data-edit="${t.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${t.id}">Remove</button>
          </td>
        </tr>`;
      }
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-analyze]").forEach((btn) => btn.addEventListener("click", () => analyzeTask(btn.getAttribute("data-analyze"))));
    wrap.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => deleteTask(btn.getAttribute("data-del"))));
    wrap.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => startEdit(btn.getAttribute("data-edit"))));
    wrap.querySelectorAll("[data-cancel]").forEach((btn) => btn.addEventListener("click", cancelEdit));
    wrap.querySelectorAll("[data-save]").forEach((btn) => btn.addEventListener("click", () => saveEdit(btn.getAttribute("data-save"), btn)));
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return url || "";
    }
  }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiTasks = { init, render };
})();
