/* gapNinja — optional Cloud Function: sends an invite-a-friend email automatically.
   This is entirely optional. Without deploying this, the app still works fully — the
   "Invite a friend" modal just uses the free "open in my email app" (mailto:) option.

   What this does, once deployed and wired up (see README.md "Automatic invite emails"):
   - Verifies the caller is a signed-in gapNinja user (checks their Firebase ID token).
   - Sends a short invite email to the friend's address via Resend's HTTP API.

   Requirements to deploy:
   - Firebase project on the "Blaze" (pay-as-you-go) plan — Cloud Functions aren't available
     on the free "Spark" plan. Blaze still has a generous free tier (2M invocations/month);
     this function will not cost anything at personal-project volume.
   - A Resend account (https://resend.com) — free tier covers 100 emails/day / 3,000/month,
     no credit card required to start. Verify a sending domain (or use their onboarding test
     address while developing), then create an API key.
   - Set the key as a Cloud Functions secret (never put it in code or in the repo):
       firebase functions:secrets:set RESEND_API_KEY
   - Update the "from" address below to an address on a domain you've verified in Resend.
*/
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

// Update this to an address on a domain you've verified in your Resend account.
const FROM_ADDRESS = "gapNinja <invites@yourdomain.com>";

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

exports.sendInvite = onRequest({ secrets: [RESEND_API_KEY], cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(401).send("Missing sign-in token — sign in first.");
    return;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    res.status(401).send("Invalid or expired sign-in — refresh the page and try again.");
    return;
  }

  const { toEmail, fromName, note } = req.body || {};
  if (!isValidEmail(toEmail)) {
    res.status(400).send("A valid recipient email is required.");
    return;
  }

  const senderName = (fromName || decoded.name || decoded.email || "A friend").toString().slice(0, 80);
  const safeNote = (note || "").toString().slice(0, 1000);
  const subject = `${senderName} thinks you'd like gapNinja`;
  const bodyText = safeNote
    ? safeNote
    : `${senderName} is using gapNinja to close the skills gap on job applications — matching resumes against job descriptions, drafting cover letters, and tracking every application in one place. It's free.`;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject,
        text: bodyText,
      }),
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      res.status(502).send("The email service rejected the request — check functions logs.");
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send("Failed to send the invite.");
  }
});

/* Optional Cloud Function: emails a support-ticket reply directly to the person who submitted
   it, instead of relying on them to come back and check their Support page. Entirely optional —
   without deploying this, admin replies still work fully, they're just saved in-app only.

   Security note: this re-checks admin status server-side against the admins/{uid} collection
   using the Admin SDK, same as sendAdminReport below — it never trusts anything the client
   claims about its own role.

   Requirements: same Blaze plan + Resend account + RESEND_API_KEY secret as "Automatic invite
   emails" above — no new signup needed if you've already set that up.
*/
exports.sendSupportReply = onRequest({ secrets: [RESEND_API_KEY], cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(401).send("Missing sign-in token — sign in first.");
    return;
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    res.status(401).send("Invalid or expired sign-in — refresh the page and try again.");
    return;
  }
  const callerIsAdmin = await isAdminUid(decoded.uid).catch(() => false);
  if (!callerIsAdmin) {
    res.status(403).send("Admin access required.");
    return;
  }

  const { toEmail, toName, subject, originalMessage, reply } = req.body || {};
  if (!isValidEmail(toEmail)) {
    res.status(400).send("A valid recipient email is required.");
    return;
  }
  if (!reply || typeof reply !== "string") {
    res.status(400).send("Missing reply text.");
    return;
  }

  const emailSubject = `Re: ${(subject || "your gapNinja support request").toString().slice(0, 200)}`;
  const bodyText = [
    `Hi ${(toName || "there").toString().slice(0, 80)},`,
    "",
    reply.toString().slice(0, 5000),
    "",
    "---",
    "Your original message:",
    (originalMessage || "").toString().slice(0, 3000),
  ].join("\n");

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject: emailSubject,
        text: bodyText,
      }),
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      res.status(502).send("The email service rejected the request — check functions logs.");
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send("Failed to send the reply email.");
  }
});

/* Optional Cloud Function: emails an Admin Dashboard export as a real CSV attachment.
   Entirely optional — without deploying this, the Admin Dashboard still works fully via its
   "Download CSV" and "Email report" (opens your own email app) buttons.

   Security note: this re-checks admin status server-side against the admins/{uid} collection
   using the Admin SDK (which bypasses Firestore security rules) — it never trusts anything the
   client claims about its own role. Anyone can call this endpoint's URL, but only a signed-in
   uid with a document at admins/{uid} will get past the check below.

   Requirements: same Blaze plan + Resend account + RESEND_API_KEY secret as sendInvite above —
   no new signup needed if you've already set that up.
*/
async function isAdminUid(uid) {
  const snap = await db.collection("admins").doc(uid).get();
  return snap.exists;
}

exports.sendAdminReport = onRequest({ secrets: [RESEND_API_KEY], cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(401).send("Missing sign-in token — sign in first.");
    return;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    res.status(401).send("Invalid or expired sign-in — refresh the page and try again.");
    return;
  }

  const callerIsAdmin = await isAdminUid(decoded.uid).catch(() => false);
  if (!callerIsAdmin) {
    res.status(403).send("Admin access required.");
    return;
  }

  const { toEmail, csvContent, filename } = req.body || {};
  if (!isValidEmail(toEmail)) {
    res.status(400).send("A valid recipient email is required.");
    return;
  }
  if (!csvContent || typeof csvContent !== "string") {
    res.status(400).send("Missing report content.");
    return;
  }

  const safeFilename = (filename || "gapninja-admin-report.csv").toString().replace(/[^a-zA-Z0-9.\-_]+/g, "_");
  const base64Content = Buffer.from(csvContent, "utf-8").toString("base64");

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject: `gapNinja admin report — ${new Date().toLocaleDateString()}`,
        text: "Attached is the requested gapNinja admin activity report.",
        attachments: [{ filename: safeFilename, content: base64Content }],
      }),
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      res.status(502).send("The email service rejected the request — check functions logs.");
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send("Failed to send the report.");
  }
});
