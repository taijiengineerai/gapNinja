/* gapNinja — Google Safe Browsing API config TEMPLATE.
   This is the tracked, committed copy — it's blank on purpose. Your real, filled-in copy lives at
   js/safebrowsing-config.js, which is gitignored so your own key never gets committed or pushed
   to a public repo. First-time setup: copy this file to js/safebrowsing-config.js, then fill in
   your key there.

   Powers the "Check for scam risk" button's live blocklist check on Compare & Analyze — flags a
   pasted job link if Google has already reported it for phishing or malware. Without this key,
   the scam-risk check still works fine — it just skips this part and relies on the built-in
   pattern checks only (see js/scam-check.js).

   Get a free key (up to 10,000 lookups/day, no credit card):
   1. Go to https://console.cloud.google.com and select your gapNinja project (gapninja-5c222).
   2. Go to APIs & Services > Library, search "Safe Browsing API", and click Enable.
   3. Go to APIs & Services > Credentials > Create Credentials > API key.
   4. Click the new key to restrict it: under "API restrictions," limit it to the Safe Browsing
      API only. Under "Application restrictions," choose "Websites" and add your site's URL
      (e.g. https://gapninja-5c222.web.app/*) so the key only works from your own deployed app.
   5. Paste the key into js/safebrowsing-config.js (not this file). See README.md,
      "Job-scam link check (Safe Browsing)".
*/
window.GAPNINJA_SAFEBROWSING_API_KEY = "";
