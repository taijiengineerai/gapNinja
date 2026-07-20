/* gapNinja — Invite a friend, by email only (no public links, no social sharing).
   Two ways to send, both gated to a single recipient email at a time:
   1. "Open in my email app" — builds a mailto: link and hands off to the user's own mail client.
      Always available, free, no setup.
   2. "Send invite" — calls a Cloud Function (see functions/) that emails the friend directly via
      a transactional email API. Only shown if js/invite-config.js has a function URL configured;
      hidden otherwise so the feature never looks broken on a fresh setup.
*/
(function () {
  function S() {
    return window.GapNinja.Storage;
  }

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  // Cached ahead of time (when the modal opens) rather than looked up inside the click handler.
  // Reason: mailto: hand-off to the OS/browser only works if it happens synchronously within the
  // click — any `await` first (e.g. a Firestore lookup) breaks that "trusted user gesture" window
  // and most browsers silently swallow the mailto: navigation instead of opening the mail app.
  let cachedSenderName = "A friend";

  async function openModal() {
    document.getElementById("invite-email").value = "";
    document.getElementById("invite-note").value = "";
    document.getElementById("invite-status").textContent = "";
    document.getElementById("invite-status").style.color = "";
    const autoBtn = document.getElementById("invite-auto-btn");
    autoBtn.style.display = window.GAPNINJA_INVITE_FUNCTION_URL ? "" : "none";
    document.getElementById("invite-modal").classList.add("open");
    senderName().then((n) => { cachedSenderName = n; });
  }

  function closeModal() {
    document.getElementById("invite-modal").classList.remove("open");
  }

  async function senderName() {
    try {
      const p = await S().profile.get();
      if (p && p.name) return p.name;
    } catch (e) { /* fall through */ }
    const user = window.GapNinja.Auth && window.GapNinja.Auth.current();
    return (user && (user.displayName || user.email)) || "A friend";
  }

  function buildInviteCopy(fromName, note) {
    const subject = `${fromName} thinks you'd like gapNinja`;
    const siteUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, "");
    const lines = [
      note ? note.trim() : `${fromName} is using gapNinja to close the skills gap on job applications — matching resumes against job descriptions, drafting cover letters, and tracking every application in one place.`,
      "",
      "It's free: " + siteUrl,
      "",
      "— sent via gapNinja's invite-a-friend, one email at a time, no spam.",
    ];
    return { subject, body: lines.join("\n") };
  }

  function wireMailto() {
    document.getElementById("invite-mailto-btn").addEventListener("click", () => {
      // Deliberately synchronous, no async/await — see note on cachedSenderName above.
      const email = document.getElementById("invite-email").value.trim();
      const statusEl = document.getElementById("invite-status");
      if (!email || !isValidEmail(email)) {
        statusEl.style.color = "var(--amber)";
        statusEl.textContent = "Enter a valid email first.";
        return;
      }
      const note = document.getElementById("invite-note").value;
      const { subject, body } = buildInviteCopy(cachedSenderName, note);
      const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      // A real, temporarily-inserted <a> click is handed off to the OS more reliably across
      // browsers than reassigning window.location.href, which some browsers (and extensions)
      // treat as a page navigation attempt and quietly block.
      const link = document.createElement("a");
      link.href = mailto;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      statusEl.style.color = "var(--neon)";
      statusEl.textContent = "Opening your email app… if nothing happens, you may not have a default email app set on this device — you can also just copy the recipient and message yourself.";
    });
  }

  function wireAutoSend() {
    document.getElementById("invite-auto-btn").addEventListener("click", async () => {
      const btn = document.getElementById("invite-auto-btn");
      const statusEl = document.getElementById("invite-status");
      const email = document.getElementById("invite-email").value.trim();
      const url = window.GAPNINJA_INVITE_FUNCTION_URL;
      if (!email || !isValidEmail(email)) {
        statusEl.style.color = "var(--amber)";
        statusEl.textContent = "Enter a valid email first.";
        return;
      }
      if (!url) return;
      const user = window.GapNinja.Auth && window.GapNinja.Auth.current();
      if (!user) {
        statusEl.style.color = "var(--red)";
        statusEl.textContent = "You need to be signed in to send an invite.";
        return;
      }
      btn.disabled = true;
      statusEl.style.color = "";
      statusEl.textContent = "Sending…";
      try {
        const token = await user.getIdToken();
        const fromName = await senderName();
        const note = document.getElementById("invite-note").value.trim();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ toEmail: email, fromName, note }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Request failed (${res.status})`);
        }
        statusEl.style.color = "var(--neon)";
        statusEl.textContent = `Invite sent to ${email}.`;
        document.getElementById("invite-email").value = "";
        document.getElementById("invite-note").value = "";
      } catch (e) {
        console.error(e);
        statusEl.style.color = "var(--red)";
        statusEl.textContent = "Couldn't send: " + (e && e.message ? e.message : "unknown error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function init() {
    const navBtn = document.getElementById("nav-invite");
    if (navBtn) navBtn.addEventListener("click", openModal);
    document.getElementById("invite-cancel-btn").addEventListener("click", closeModal);
    wireMailto();
    wireAutoSend();
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiInvite = { init };
})();
