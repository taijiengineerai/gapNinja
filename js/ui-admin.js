/* gapNinja — Admin Dashboard: visible only to admins (enforced by Firestore security rules, not
   just this file — see firestore.rules). Shows every user's job links and saved company
   comparisons in one place, lets an admin grant/revoke admin rights, and exports the activity
   list as CSV, via a mailto summary, or (if configured) a real emailed attachment.
*/
(function () {
  function A() {
    return window.GapNinja.Admin;
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Cached from the last render() so the export buttons don't need to re-fetch everything.
  let lastUsers = [];
  let lastActivity = [];
  let lastTickets = [];

  async function render() {
    const usersWrap = document.getElementById("admin-users-wrap");
    const activityWrap = document.getElementById("admin-activity-wrap");
    const supportWrap = document.getElementById("admin-support-wrap");
    usersWrap.innerHTML = `<div class="empty-state">Checking access…</div>`;
    activityWrap.innerHTML = "";
    if (supportWrap) supportWrap.innerHTML = "";

    const amAdmin = await A().isAdmin();
    if (!amAdmin) {
      // Belt-and-suspenders: the nav item is hidden for non-admins, but if someone lands here
      // anyway (e.g. typing GapNinja.navigate('admin') in the console), the actual data reads
      // below would be rejected by Firestore's security rules regardless of what this page shows.
      usersWrap.innerHTML = `<div class="empty-state">You don't have admin access. If you believe this is a mistake, ask an existing admin to grant it to your account.</div>`;
      return;
    }

    let users, adminUids, activity, tickets;
    try {
      [users, adminUids, activity, tickets] = await Promise.all([
        A().listAllUsers(),
        A().listAdminUids(),
        A().listAllActivity(),
        A().listAllSupportTickets(),
      ]);
    } catch (e) {
      usersWrap.innerHTML = `<div class="empty-state">Couldn't load admin data: ${escapeHtml(e.message)}</div>`;
      return;
    }

    lastUsers = users;
    lastActivity = activity.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    lastTickets = tickets.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    renderUsers(users, adminUids);
    renderActivity(lastActivity, users);
    renderSupportTickets();
  }

  function renderUsers(users, adminUids) {
    const wrap = document.getElementById("admin-users-wrap");
    if (users.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No users yet.</div>`;
      return;
    }
    const myUid = window.GapNinja.Auth.current() ? window.GapNinja.Auth.current().uid : null;
    const adminSet = new Set(adminUids);

    let html = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>`;
    users
      .slice()
      .sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "", undefined, { sensitivity: "base" }))
      .forEach((u) => {
        const isAdminUser = adminSet.has(u.uid);
        const isMe = u.uid === myUid;
        html += `<tr>
          <td>${escapeHtml(u.name || "—")}${isMe ? ` <span class="hint">(you)</span>` : ""}</td>
          <td class="muted">${escapeHtml(u.email || "—")}</td>
          <td><span class="badge ${isAdminUser ? "badge-matched" : "badge-status status-not_applied"}">${isAdminUser ? "Admin" : "User"}</span></td>
          <td>
            ${
              isAdminUser
                ? `<button class="btn btn-danger btn-sm" data-revoke="${u.uid}" ${isMe ? "disabled title=\"Ask another admin to remove your own access\"" : ""}>Remove admin</button>`
                : `<button class="btn btn-secondary btn-sm" data-grant="${u.uid}">Make admin</button>`
            }
          </td>
        </tr>`;
      });
    html += `</tbody></table>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll("[data-grant]").forEach((btn) => btn.addEventListener("click", () => grantAdmin(btn.getAttribute("data-grant"), btn)));
    wrap.querySelectorAll("[data-revoke]").forEach((btn) => btn.addEventListener("click", () => revokeAdmin(btn.getAttribute("data-revoke"), btn)));
  }

  async function grantAdmin(uid, btn) {
    btn.disabled = true;
    try {
      await A().grant(uid);
      window.GapNinja.toast("Admin access granted");
      render();
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Couldn't grant admin: " + e.message);
      btn.disabled = false;
    }
  }

  async function revokeAdmin(uid, btn) {
    if (!confirm("Remove admin access for this user?")) return;
    btn.disabled = true;
    try {
      await A().revoke(uid);
      window.GapNinja.toast("Admin access removed");
      render();
    } catch (e) {
      console.error(e);
      window.GapNinja.toast("Couldn't remove admin: " + e.message);
      btn.disabled = false;
    }
  }

  function userLookup(users) {
    const map = new Map();
    users.forEach((u) => map.set(u.uid, u));
    return map;
  }

  function renderActivity(activity, users) {
    const wrap = document.getElementById("admin-activity-wrap");
    if (activity.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No activity yet — nothing has been queued or compared by any user.</div>`;
      return;
    }
    const byUid = userLookup(users);
    let html = `<table><thead><tr><th>User</th><th>Email</th><th>Company</th><th>Link</th><th>Type</th><th>Date</th></tr></thead><tbody>`;
    activity.forEach((r) => {
      const u = byUid.get(r.uid) || {};
      const company = r.type === "comparison" ? r.companyName || "—" : "—";
      const link = r.type === "comparison" ? r.jdUrl : r.link;
      const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—";
      html += `<tr>
        <td>${escapeHtml(u.name || "—")}</td>
        <td class="muted">${escapeHtml(u.email || "—")}</td>
        <td>${escapeHtml(company)}</td>
        <td>${link ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(link)}" target="_blank" rel="noopener">Open ↗</a>` : "—"}</td>
        <td><span class="badge ${r.type === "comparison" ? "badge-matched" : "badge-bonus"}">${r.type === "comparison" ? "Comparison" : "Queued link"}</span></td>
        <td class="muted">${escapeHtml(date)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
  }

  // ---------- Support Tickets ----------
  function ticketStatusBadge(status) {
    const map = {
      open: { cls: "status-not_applied", label: "Open" },
      replied: { cls: "status-applied", label: "Replied" },
      resolved: { cls: "status-offer", label: "Resolved" },
    };
    const m = map[status] || map.open;
    return `<span class="badge badge-status ${m.cls}">${m.label}</span>`;
  }

  // Older tickets submitted before ticket numbers shipped won't have one — fall back to a
  // short id-based label instead of showing "#GN-undefined".
  function ticketLabel(t) {
    return t && t.ticketNumber ? `#GN-${t.ticketNumber}` : `#${(t && t.id ? t.id : "").slice(0, 6)}`;
  }

  function renderSupportTickets() {
    const wrap = document.getElementById("admin-support-wrap");
    if (!wrap) return;
    const filterEl = document.getElementById("admin-support-status-filter");
    const searchEl = document.getElementById("admin-support-search");
    const statusFilter = filterEl ? filterEl.value : "";
    const search = (searchEl ? searchEl.value : "").trim().toLowerCase();

    let tickets = lastTickets;
    if (statusFilter) tickets = tickets.filter((t) => (t.status || "open") === statusFilter);
    if (search) {
      const searchNoHash = search.replace(/^#/, "");
      tickets = tickets.filter((t) => {
        const num = t.ticketNumber ? String(t.ticketNumber) : "";
        const label = ticketLabel(t).toLowerCase();
        return (
          label.includes(search) ||
          num === searchNoHash ||
          (t.email || "").toLowerCase().includes(search) ||
          (t.subject || "").toLowerCase().includes(search)
        );
      });
    }

    if (lastTickets.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No support tickets yet.</div>`;
      return;
    }
    if (tickets.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No tickets match${search ? ` "${escapeHtml(search)}"` : ""}${statusFilter ? " with that status" : ""}.</div>`;
      return;
    }

    let html = `<table><thead><tr><th>Ticket</th><th>From</th><th>Subject</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>`;
    tickets.forEach((t) => {
      const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—";
      html += `<tr>
        <td class="muted">${escapeHtml(ticketLabel(t))}</td>
        <td>${escapeHtml(t.name || "—")}<br/><span class="hint" style="margin-top:0;">${escapeHtml(t.email || "—")}</span></td>
        <td>${escapeHtml(t.subject || "(no subject)")}</td>
        <td>${ticketStatusBadge(t.status || "open")}</td>
        <td class="muted">${date}</td>
        <td><button class="btn btn-secondary btn-sm" data-ticket="${t.id}">View</button></td>
      </tr>`;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-ticket]").forEach((btn) =>
      btn.addEventListener("click", () => openTicketModal(btn.getAttribute("data-ticket")))
    );
  }

  function openTicketModal(ticketId) {
    const t = lastTickets.find((x) => x.id === ticketId);
    if (!t) return;
    document.getElementById("support-ticket-modal-id").value = t.id;
    document.getElementById("support-ticket-modal-uid").value = t.uid;
    document.getElementById("support-ticket-modal-subject").textContent = `${ticketLabel(t)} — ${t.subject || "(no subject)"}`;
    const date = t.createdAt ? new Date(t.createdAt).toLocaleString() : "—";
    document.getElementById("support-ticket-modal-meta").textContent = `${t.name || "—"} · ${t.email || "—"} · ${date}`;
    document.getElementById("support-ticket-modal-message").textContent = t.message || "";

    const shotWrap = document.getElementById("support-ticket-modal-screenshot-wrap");
    if (t.screenshot) {
      document.getElementById("support-ticket-modal-screenshot-img").src = t.screenshot;
      document.getElementById("support-ticket-modal-screenshot-link").href = t.screenshot;
      shotWrap.style.display = "";
    } else {
      shotWrap.style.display = "none";
    }

    const replyWrap = document.getElementById("support-ticket-modal-existing-reply");
    if (t.reply) {
      document.getElementById("support-ticket-modal-existing-reply-text").textContent = t.reply;
      replyWrap.style.display = "";
    } else {
      replyWrap.style.display = "none";
    }

    document.getElementById("support-ticket-modal-reply-text").value = "";
    document.getElementById("support-ticket-modal-status").textContent = "";
    document.getElementById("support-ticket-modal").classList.add("open");
  }

  function closeTicketModal() {
    document.getElementById("support-ticket-modal").classList.remove("open");
  }

  function emailTicket() {
    const uid = document.getElementById("support-ticket-modal-uid").value;
    const ticketId = document.getElementById("support-ticket-modal-id").value;
    const t = lastTickets.find((x) => x.id === ticketId && x.uid === uid);
    if (!t || !t.email) {
      window.GapNinja.toast("No email on file for this ticket");
      return;
    }
    const subject = `Re: ${t.subject || "your gapNinja support request"}`;
    const body = `Hi ${t.name || "there"},\n\n\n\n---\nYour original message:\n${t.message || ""}`;
    const mailto = `mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const a = document.createElement("a");
    a.href = mailto;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function saveTicketReply() {
    const btn = document.getElementById("support-ticket-modal-reply-btn");
    const statusEl = document.getElementById("support-ticket-modal-status");
    const uid = document.getElementById("support-ticket-modal-uid").value;
    const ticketId = document.getElementById("support-ticket-modal-id").value;
    const replyText = document.getElementById("support-ticket-modal-reply-text").value.trim();
    if (!replyText) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Write a reply first.";
      return;
    }
    const admin = window.GapNinja.Auth.current();
    btn.disabled = true;
    statusEl.style.color = "";
    statusEl.textContent = "Saving…";
    try {
      await A().replyToSupportTicket(uid, ticketId, {
        reply: replyText,
        status: "replied",
        repliedAt: Date.now(),
        repliedBy: (admin && admin.email) || "",
      });
      let emailedNote = "";
      if (window.GAPNINJA_SUPPORT_REPLY_FUNCTION_URL) {
        try {
          await sendReplyEmail(uid, ticketId, replyText);
          emailedNote = " and emailed to them";
        } catch (e) {
          console.error("Support reply email failed:", e);
          emailedNote = " (in-app only — emailing it failed, see console)";
        }
      }
      statusEl.style.color = "var(--neon)";
      statusEl.textContent = `Reply saved${emailedNote} — they'll see it on their Support page.`;
      window.GapNinja.toast("Reply saved");
      render();
    } catch (e) {
      console.error(e);
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "Couldn't save reply: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // Optional: if the sendSupportReply Cloud Function is deployed and its URL configured (see
  // js/invite-config.js), also email the reply directly instead of relying on the person to
  // check back on their Support page.
  async function sendReplyEmail(uid, ticketId, replyText) {
    const url = window.GAPNINJA_SUPPORT_REPLY_FUNCTION_URL;
    const t = lastTickets.find((x) => x.id === ticketId && x.uid === uid);
    const admin = window.GapNinja.Auth.current();
    if (!url || !t || !t.email || !admin) return;
    const token = await admin.getIdToken();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ toEmail: t.email, toName: t.name, subject: t.subject, originalMessage: t.message, reply: replyText }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed (${res.status})`);
    }
  }

  async function markTicketResolved() {
    const btn = document.getElementById("support-ticket-modal-resolve-btn");
    const statusEl = document.getElementById("support-ticket-modal-status");
    const uid = document.getElementById("support-ticket-modal-uid").value;
    const ticketId = document.getElementById("support-ticket-modal-id").value;
    btn.disabled = true;
    try {
      await A().replyToSupportTicket(uid, ticketId, { status: "resolved" });
      window.GapNinja.toast("Marked resolved");
      closeTicketModal();
      render();
    } catch (e) {
      console.error(e);
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "Couldn't update status: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Export ----------
  function selectedColumns() {
    return {
      name: document.getElementById("admin-col-name").checked,
      email: document.getElementById("admin-col-email").checked,
      company: document.getElementById("admin-col-company").checked,
      link: document.getElementById("admin-col-link").checked,
      date: document.getElementById("admin-col-date").checked,
    };
  }

  function buildRows() {
    const byUid = userLookup(lastUsers);
    return lastActivity.map((r) => {
      const u = byUid.get(r.uid) || {};
      return {
        name: u.name || "",
        email: u.email || "",
        company: r.type === "comparison" ? r.companyName || "" : "",
        link: (r.type === "comparison" ? r.jdUrl : r.link) || "",
        date: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "",
      };
    });
  }

  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function buildCsv(cols, rows) {
    const headerMap = { name: "Name", email: "Email", company: "Company", link: "Link", date: "Date" };
    const activeCols = Object.keys(cols).filter((k) => cols[k]);
    const header = activeCols.map((k) => headerMap[k]).join(",");
    const lines = rows.map((r) => activeCols.map((k) => csvEscape(r[k])).join(","));
    return [header].concat(lines).join("\n");
  }

  function downloadCsv() {
    const cols = selectedColumns();
    if (!Object.values(cols).some(Boolean)) {
      window.GapNinja.toast("Pick at least one column to export");
      return;
    }
    const rows = buildRows();
    const csv = buildCsv(cols, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `gapninja-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    document.getElementById("admin-export-status").textContent = `Downloaded ${rows.length} row${rows.length === 1 ? "" : "s"} as CSV — opens directly in Excel.`;
    document.getElementById("admin-export-status").style.color = "var(--neon)";
  }

  // mailto: URLs have a practical length limit (~2000 characters is safe across browsers/mail
  // clients), so this caps how many rows get written into the message body and says so if it
  // had to truncate — for the full dataset, use Download CSV instead.
  function emailReportMailto() {
    const cols = selectedColumns();
    if (!Object.values(cols).some(Boolean)) {
      window.GapNinja.toast("Pick at least one column to export");
      return;
    }
    const rows = buildRows();
    const headerMap = { name: "Name", email: "Email", company: "Company", link: "Link", date: "Date" };
    const activeCols = Object.keys(cols).filter((k) => cols[k]);
    const MAX_ROWS = 40;
    const truncated = rows.length > MAX_ROWS;
    const rowLines = rows.slice(0, MAX_ROWS).map((r) => activeCols.map((k) => `${headerMap[k]}: ${r[k] || "—"}`).join(" | "));

    const to = document.getElementById("admin-report-recipient").value.trim();
    const subject = `gapNinja admin report — ${new Date().toLocaleDateString()}`;
    const bodyLines = [`gapNinja activity report (${rows.length} total row${rows.length === 1 ? "" : "s"}${truncated ? `, showing first ${MAX_ROWS}` : ""}):`, ""]
      .concat(rowLines)
      .concat(truncated ? ["", "(Truncated for email length — use Download CSV for the full report.)"] : []);
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;

    const a = document.createElement("a");
    a.href = mailto;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    document.getElementById("admin-export-status").textContent = "Opening your email app…";
    document.getElementById("admin-export-status").style.color = "var(--neon)";
  }

  async function sendReportByEmail() {
    const btn = document.getElementById("admin-export-send-btn");
    const statusEl = document.getElementById("admin-export-status");
    const url = window.GAPNINJA_ADMIN_REPORT_FUNCTION_URL;
    if (!url) return;

    const toEmail = document.getElementById("admin-report-recipient").value.trim();
    if (!toEmail) {
      statusEl.style.color = "var(--amber)";
      statusEl.textContent = "Add a recipient email first.";
      return;
    }
    const cols = selectedColumns();
    if (!Object.values(cols).some(Boolean)) {
      window.GapNinja.toast("Pick at least one column to export");
      return;
    }
    const user = window.GapNinja.Auth.current();
    if (!user) return;

    btn.disabled = true;
    statusEl.style.color = "";
    statusEl.textContent = "Sending…";
    try {
      const token = await user.getIdToken();
      const csv = buildCsv(cols, buildRows());
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ toEmail, csvContent: csv, filename: `gapninja-admin-report-${new Date().toISOString().slice(0, 10)}.csv` }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status})`);
      }
      statusEl.style.color = "var(--neon)";
      statusEl.textContent = `Report emailed to ${toEmail}.`;
    } catch (e) {
      console.error(e);
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "Couldn't send: " + (e && e.message ? e.message : "unknown error");
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    document.getElementById("admin-export-csv-btn").addEventListener("click", downloadCsv);
    document.getElementById("admin-export-mailto-btn").addEventListener("click", emailReportMailto);
    document.getElementById("admin-export-send-btn").addEventListener("click", sendReportByEmail);
    if (window.GAPNINJA_ADMIN_REPORT_FUNCTION_URL) {
      document.getElementById("admin-export-send-btn").style.display = "";
    }

    document.getElementById("admin-support-status-filter").addEventListener("change", renderSupportTickets);
    document.getElementById("admin-support-search").addEventListener("input", renderSupportTickets);
    document.getElementById("support-ticket-modal-close-btn").addEventListener("click", closeTicketModal);
    document.getElementById("support-ticket-modal-email-btn").addEventListener("click", emailTicket);
    document.getElementById("support-ticket-modal-reply-btn").addEventListener("click", saveTicketReply);
    document.getElementById("support-ticket-modal-resolve-btn").addEventListener("click", markTicketResolved);
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.UiAdmin = { init, render };
})();
