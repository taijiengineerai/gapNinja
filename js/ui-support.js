/* gapNinja — Support view: submit a request (name, subject, comments, optional screenshot) and
   see the status/reply on your own past submissions. Screenshots are resized/compressed to a
   JPEG data URL entirely in the browser (via <canvas>) and stored directly on the ticket
   document — no Firebase Storage setup needed, just keeps each image well under Firestore's
   1MiB document size limit. */
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  // Longest dimension a screenshot gets resized to before compressing — plenty for reading UI
  // text/error messages, small enough to keep the resulting ticket document tiny.
  const MAX_DIMENSION = 1100;
  const JPEG_QUALITY = 0.72;
  // Firestore documents cap out at 1MiB; leave generous headroom for the rest of the ticket's
  // fields (message text, etc.) and base64's ~33% size overhead.
  const MAX_DATA_URL_LENGTH = 900000;

  let pendingScreenshotDataUrl = "";

  function init() {
    document.getElementById("support-submit-btn").addEventListener("click", submitTicket);
    document.getElementById("support-screenshot").addEventListener("change", handleScreenshotChange);
    document.getElementById("support-screenshot-remove-btn").addEventListener("click", clearScreenshot);

    // Prefill Name from your Profile, if you've filled one in — one less thing to type.
    S()
      .profile.get()
      .then((p) => {
        const el = document.getElementById("support-name");
        if (el && !el.value && p && p.name) el.value = p.name;
      })
      .catch(() => {});
  }

  function handleScreenshotChange(e) {
    const file = e.target.files && e.target.files[0];
    const statusEl = document.getElementById("support-submit-status");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "That doesn't look like an image file.";
      e.target.value = "";
      return;
    }

    statusEl.style.color = "";
    statusEl.textContent = "Processing screenshot…";

    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

        if (dataUrl.length > MAX_DATA_URL_LENGTH) {
          statusEl.style.color = "var(--amber)";
          statusEl.textContent = "That screenshot is still too large after compressing — try cropping it or picking a smaller image.";
          e.target.value = "";
          return;
        }

        pendingScreenshotDataUrl = dataUrl;
        document.getElementById("support-screenshot-preview-img").src = dataUrl;
        document.getElementById("support-screenshot-preview").style.display = "";
        statusEl.textContent = "Screenshot attached.";
        statusEl.style.color = "var(--neon)";
      };
      img.onerror = () => {
        statusEl.style.color = "var(--red)";
        statusEl.textContent = "Couldn't read that image — try a different file.";
        e.target.value = "";
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function clearScreenshot() {
    pendingScreenshotDataUrl = "";
    document.getElementById("support-screenshot").value = "";
    document.getElementById("support-screenshot-preview").style.display = "none";
    document.getElementById("support-screenshot-preview-img").src = "";
  }

  async function submitTicket() {
    const btn = document.getElementById("support-submit-btn");
    const statusEl = document.getElementById("support-submit-status");
    const name = document.getElementById("support-name").value.trim();
    const subject = document.getElementById("support-subject").value.trim();
    const message = document.getElementById("support-message").value.trim();

    if (!name || !subject || !message) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Name, subject, and a message are all required.";
      return;
    }

    const user = window.GapNinja.Auth.current();
    btn.disabled = true;
    statusEl.style.color = "";
    statusEl.textContent = "Submitting…";
    try {
      const created = await S().supportTickets.add({
        name,
        email: (user && user.email) || "",
        subject,
        message,
        screenshot: pendingScreenshotDataUrl || "",
        status: "open",
        reply: "",
        repliedAt: null,
      });
      document.getElementById("support-subject").value = "";
      document.getElementById("support-message").value = "";
      clearScreenshot();
      statusEl.style.color = "var(--neon)";
      statusEl.textContent = `Submitted as ${ticketLabel(created)} — thanks! You'll see any reply here on this page.`;
      window.GapNinja.toast(`Submitted as ${ticketLabel(created)}`);
      render();
    } catch (e) {
      console.error(e);
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "Couldn't submit: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // Older tickets submitted before this feature shipped won't have a ticketNumber — fall back
  // to a short id-based label instead of showing "#GN-undefined".
  function ticketLabel(t) {
    return t && t.ticketNumber ? `#GN-${t.ticketNumber}` : `#${(t && t.id ? t.id : "").slice(0, 6)}`;
  }

  function statusBadge(status) {
    const map = {
      open: { cls: "status-not_applied", label: "Open" },
      replied: { cls: "status-applied", label: "Replied" },
      resolved: { cls: "status-offer", label: "Resolved" },
    };
    const m = map[status] || map.open;
    return `<span class="badge badge-status ${m.cls}">${m.label}</span>`;
  }

  async function render() {
    const wrap = document.getElementById("support-ticket-list-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    let tickets;
    try {
      tickets = await S().supportTickets.list();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load your tickets: ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (tickets.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Nothing submitted yet — use the form above for any question, bug, or idea.</div>`;
      return;
    }
    let html = "";
    tickets.forEach((t) => {
      const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "";
      html += `<div class="history-row">
        <div class="flex-between">
          <div><span class="hint" style="margin-top:0;">${escapeHtml(ticketLabel(t))}</span> <strong>${escapeHtml(t.subject || "(no subject)")}</strong> <span class="hint">· ${escapeHtml(date)}</span></div>
          ${statusBadge(t.status)}
        </div>
        <div style="font-size:13px; margin-top:6px; color:var(--text-dim); white-space:pre-wrap;">${escapeHtml(t.message || "")}</div>
        ${t.screenshot ? `<div style="margin-top:8px;"><a href="${t.screenshot}" target="_blank" rel="noopener"><img src="${t.screenshot}" alt="Attached screenshot" style="max-width:180px; max-height:130px; border-radius:8px; border:1px solid var(--border);" /></a></div>` : ""}
        ${
          t.reply
            ? `<div style="margin-top:10px; padding:10px 12px; background:var(--bg-elevated, rgba(255,255,255,0.03)); border-left:2px solid var(--neon); border-radius:6px;">
                <div class="hint" style="margin-top:0; margin-bottom:4px;">Reply${t.repliedAt ? " · " + escapeHtml(new Date(t.repliedAt).toLocaleDateString()) : ""}</div>
                <div style="font-size:13px; white-space:pre-wrap;">${escapeHtml(t.reply)}</div>
              </div>`
            : ""
        }
      </div>`;
    });
    wrap.innerHTML = html;
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiSupport = { init, render };
})();
