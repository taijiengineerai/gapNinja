/* gapNinja — Resumes view: upload PDFs, list saved versions, delete */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  function init() {
    document.getElementById("resume-upload-btn").addEventListener("click", handleUpload);
    document.getElementById("resume-preview-close-btn").addEventListener("click", closePreview);
    document.getElementById("resume-preview-modal").addEventListener("click", (e) => {
      if (e.target.id === "resume-preview-modal") closePreview();
    });
  }

  async function handleUpload() {
    const fileInput = document.getElementById("resume-file");
    const labelInput = document.getElementById("resume-label");
    const statusEl = document.getElementById("resume-upload-status");
    const file = fileInput.files && fileInput.files[0];

    if (!file) {
      statusEl.textContent = "Choose a PDF file first.";
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      statusEl.textContent = "Please upload a .pdf file.";
      return;
    }

    const label = labelInput.value.trim() || file.name.replace(/\.pdf$/i, "");
    statusEl.textContent = "Reading PDF…";

    try {
      const text = await window.GapNinja.PdfUtils.extractTextFromPdf(file);
      if (!text || text.length < 20) {
        statusEl.textContent = "Couldn't find readable text in that PDF (it may be a scanned image). Try a text-based PDF export of your resume.";
        return;
      }
      const skills = window.GapNinja.Matching.extractSkills(text);
      statusEl.textContent = "Saving…";
      await S().resumes.add(
        {
          label,
          filename: file.name,
          rawText: text,
          skillCount: skills.length,
        },
        file
      );
      statusEl.textContent = `Saved "${label}" — found ${skills.length} recognized skills.`;
      fileInput.value = "";
      labelInput.value = "";
      window.GapNinja.toast("Resume uploaded");
      render();
    } catch (e) {
      console.error(e);
      statusEl.textContent = "Something went wrong: " + e.message;
    }
  }

  function openPreview(url) {
    if (!url) return;
    document.getElementById("resume-preview-frame").src = url;
    document.getElementById("resume-preview-open-tab-link").href = url;
    document.getElementById("resume-preview-modal").classList.add("open");
  }

  function closePreview() {
    document.getElementById("resume-preview-modal").classList.remove("open");
    document.getElementById("resume-preview-frame").src = "";
  }

  async function deleteResume(id) {
    if (!confirm("Delete this resume version? This can't be undone.")) return;
    try {
      await S().resumes.remove(id);
      window.GapNinja.toast("Resume deleted");
      render();
    } catch (e) {
      window.GapNinja.toast("Couldn't delete: " + e.message);
    }
  }

  async function render() {
    const wrap = document.getElementById("resume-list-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    let resumes;
    try {
      resumes = await S().resumes.list();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load resumes: ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (resumes.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No resumes uploaded yet. Add your first PDF above.</div>`;
      return;
    }
    let html = `<table><thead><tr><th>Version</th><th>File</th><th>Skills found</th><th>Uploaded</th><th></th></tr></thead><tbody>`;
    resumes.forEach((r) => {
      html += `<tr>
        <td>${escapeHtml(r.label)}</td>
        <td class="muted">${escapeHtml(r.filename || "")}</td>
        <td>${r.skillCount != null ? r.skillCount : "—"}</td>
        <td class="muted">${new Date(r.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
        <td class="flex gap-8">
          ${r.pdfUrl ? `<button class="btn btn-secondary btn-sm" data-view="${r.id}">View</button>` : ""}
          <button class="btn btn-danger btn-sm" data-del="${r.id}">Delete</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteResume(btn.getAttribute("data-del")));
    });
    wrap.querySelectorAll("[data-view]").forEach((btn) => {
      const r = resumes.find((x) => x.id === btn.getAttribute("data-view"));
      btn.addEventListener("click", () => openPreview(r && r.pdfUrl));
    });
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiResumes = { init, render };
})();
