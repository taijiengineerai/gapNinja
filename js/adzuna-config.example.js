/* gapNinja — Adzuna job-search API config TEMPLATE.
   This is the tracked, committed copy — it's blank on purpose. Your real, filled-in copy lives at
   js/adzuna-config.js, which is gitignored so your own keys never get committed or pushed to a
   public repo. First-time setup: copy this file to js/adzuna-config.js, then fill in your keys
   there.

   Powers the "Fetch matching jobs" button on your Profile page — pulls live job listings from
   Adzuna (which aggregates many job boards) filtered by your skills, location, and how recently
   the job was posted.

   Get your free keys (no credit card):
   1. Go to https://developer.adzuna.com/signup and register.
   2. Copy the "Application ID" and "Application Key" from your account page.
   3. Paste them into js/adzuna-config.js (not this file). See README.md, "Job search (Adzuna)".

   These are safe to keep in a browser-facing app — Adzuna's search API is designed to be called
   directly from client-side code (rate-limited to your account, not a secret admin credential).
   They're still gitignored here as a matter of habit, not because leaking one is dangerous.
*/
window.GAPNINJA_ADZUNA_APP_ID = "";
window.GAPNINJA_ADZUNA_APP_KEY = "";
