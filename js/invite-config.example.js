/* gapNinja — Invite-by-email config TEMPLATE.
   This is the tracked, committed copy — it's blank on purpose. Your real, filled-in copy lives at
   js/invite-config.js, which is gitignored so your own deployed Cloud Function URLs never get
   committed or pushed to a public repo. First-time setup: copy this file to js/invite-config.js,
   then paste your URLs in there (not this file) as you deploy each optional function.

   The "Open in my email app" invite option always works, free, no setup — it's on by default.

   To ALSO offer one-click "Send invite" (gapNinja emails your friend directly, no email app
   needed), deploy the Cloud Function in functions/ — see README.md, "Automatic invite emails"
   — then paste its URL below. Leave this blank to keep the email-app-only flow.
   Example: window.GAPNINJA_INVITE_FUNCTION_URL = "https://us-central1-YOUR-PROJECT.cloudfunctions.net/sendInvite";
*/
window.GAPNINJA_INVITE_FUNCTION_URL = "";

/* Admin report email config.
   The Admin Dashboard's "Download CSV" and "Email report" (opens your email app) buttons always
   work, free, no setup. To ALSO offer "Send report by email" (emails the CSV as a real
   attachment, no manual download/attach step), deploy the Cloud Function in functions/ — see
   README.md, "Admin Dashboard" — then paste its URL below. Leave blank to keep the other two
   export options only.
   Example: window.GAPNINJA_ADMIN_REPORT_FUNCTION_URL = "https://us-central1-YOUR-PROJECT.cloudfunctions.net/sendAdminReport";
*/
window.GAPNINJA_ADMIN_REPORT_FUNCTION_URL = "";

/* Support ticket reply email config.
   Admin replies on the Support Tickets card always work, free, no setup — they're saved in-app
   and shown to the person the next time they check their own Support page. To ALSO email the
   reply to them directly, deploy the Cloud Function in functions/ — see README.md, "Support
   tickets" — then paste its URL below. Leave blank to keep the in-app-only reply.
   Example: window.GAPNINJA_SUPPORT_REPLY_FUNCTION_URL = "https://us-central1-YOUR-PROJECT.cloudfunctions.net/sendSupportReply";
*/
window.GAPNINJA_SUPPORT_REPLY_FUNCTION_URL = "";
