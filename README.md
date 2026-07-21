# gapNinja

*Stop hunting. Start landing.*

gapNinja compares your resume against any job description, scores how well you fit — even when you're not a perfect match — shows exactly which skills you're missing, and drafts a tailored cover letter and follow-up email. It's free, sign-in is with your Google account, and your data is private to your account.

## Quick start

1. **Set up a free Firebase project** (one-time, ~5 minutes) — see [Firebase setup](#firebase-setup) below.
2. Paste your project's config values into `js/firebase-config.js`.
3. Run the local server: `node server.js`
4. Open **http://localhost:8000** and click **Continue with Google**.

You need Node.js installed to run `server.js` (just the built-in `http` module — no npm install, no dependencies). If you don't have Node, any other static file server works too (e.g. `python3 -m http.server 8000`).

> **Why a server instead of double-clicking index.html?** Google sign-in popups don't work reliably from a `file://` page. Firebase projects authorize `localhost` automatically, so running `server.js` and opening `http://localhost:8000` is the easiest path.

## Going live (get a shareable URL)

Right now the app only runs on `localhost` — nobody else can open it. To put it on the real internet with a free public URL, use Firebase Hosting (same project you already set up, no new signup):

1. Install the Firebase CLI (one-time, needs Node/npm): `npm install -g firebase-tools`
2. Log in: `firebase login`
3. From the project root (`C:\gapNinja`):
   ```
   firebase deploy --only hosting
   ```
4. When it finishes, it prints your live URL — something like `https://gapninja-5c222.web.app`. That's the link you can share with anyone.

That's it — the hosting config is already set up (`firebase.json`), so there's no extra prompting or setup wizard to click through. Every time you make changes and want them live, run that same `firebase deploy --only hosting` command again.

Google and email/password sign-in will keep working automatically on the new URL — Firebase authorizes your project's `.web.app` and `.firebaseapp.com` domains by default. If you ever host it somewhere else entirely (a custom domain, a different provider), add that exact domain under Firebase Console → Authentication → Settings → Authorized domains, or sign-in will fail with "This domain isn't authorized."

## Firebase setup

This is the one-time setup that gives gapNinja real Google sign-in and a private, per-account cloud database — for free.

1. Go to **https://console.firebase.google.com/** and sign in with your Google account.
2. Click **Add project**. Name it anything (e.g. "gapninja"). You can disable Google Analytics for this project — it's not needed.
3. Once the project is created, click the **web icon (`</>`)** on the project overview page to register a new web app. Name it "gapNinja" and click **Register app**. Skip the Firebase Hosting step.
4. Firebase will show you a `firebaseConfig` object like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "gapninja-xxxxx.firebaseapp.com",
     projectId: "gapninja-xxxxx",
     storageBucket: "gapninja-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef",
   };
   ```
   Copy these values into **`js/firebase-config.js`** in this folder, replacing the `YOUR_...` placeholders.
5. **Enable sign-in methods:** in the left sidebar, go to **Build → Authentication → Get started**. Under the **Sign-in method** tab:
   - Click **Google**, toggle it **Enabled**, pick a support email, and **Save**.
   - Click **Email/Password**, toggle it **Enabled** (leave "Email link" off), and **Save**. This is what powers the "Log in / Sign up with email" form and the "Forgot password" reset-link flow — Firebase handles password hashing and the reset email for you, nothing to configure beyond enabling it here.
6. **Create the database:** in the left sidebar, go to **Build → Firestore Database → Create database**. Choose any location close to you, and start in **production mode**.
7. **Lock the database down:** the rules live in `firestore.rules` in this folder — either paste its contents into Firestore Console → **Rules** tab → **Publish**, or (once you've installed the Firebase CLI, see "Going live" below) just run:
   ```
   firebase deploy --only firestore:rules
   ```
   This is what makes it secure — every document lives under `users/{yourGoogleUserId}/...` and Firestore rejects any read or write that isn't from that exact signed-in account, with one exception: accounts listed in a separate `admins/` collection get read-only access across every user, which is what powers the Admin Dashboard (see below).
8. **Enable Cloud Storage (for resume PDF previews):** in the left sidebar, go to **Build → Storage → Get started**, and accept the default production-mode setup. Then lock it down the same way as Firestore — the rules live in `storage.rules` in this folder — paste its contents into Storage Console → **Rules** tab → **Publish**, or run:
   ```
   firebase deploy --only storage:rules
   ```
   This restricts every file to `users/{yourGoogleUserId}/...`, so only you can read or write your own uploaded resume files.
9. That's it — run `node server.js`, open `http://localhost:8000`, and sign in.

**Free tier:** Firestore's free "Spark" plan includes 50,000 reads and 20,000 writes per day and 1GB storage — far more than a personal job search will ever use. No credit card is required to stay on this plan.

## What it does

- **Sign in with Google, or email/password** — real Firebase Authentication. Your resumes, companies, applications, and profile are stored in Firestore under your account only; no one else can read them, enforced by the security rule above (not just app logic). Password accounts use Firebase's built-in secure hashing (nothing is ever stored or handled as plain text), and a "Forgot password?" link on the sign-in form emails a reset link via Firebase.
- **Resumes** — upload PDF resumes. Text is extracted right in your browser (via pdf.js) and scanned against a built-in library of ~100 skills. Keep multiple versions (e.g. one general, one backend-focused) and pick which to use per comparison. The original PDF is also saved to Cloud Storage (private to your account, same per-user isolation as Firestore) so you can click **View** on any saved version to see the actual file rendered, not just its extracted text.
- **Compare & Analyze** — pick a resume, enter the company/role, paste a job description (or try auto-fetching from a link — most job sites block this, so pasting is the reliable path). You get:
  - a match score
  - matched, missing (gap), and bonus skill lists
  - suggested learning resources for each gap skill
  - a drafted, editable cover letter that leads with your strengths and frames the gaps honestly
  - a drafted, editable follow-up email
  - a "Check for scam risk" button (`js/scam-check.js`) that scans the link and description for common job-scam red flags — upfront fees, wire transfers, gift cards, crypto payments, no-interview-required, link shorteners/IP-address links, and more. It's pattern-matching, not a fraud database, so treat a "low risk" result as one signal among many, not a guarantee — always verify a company independently before sharing personal info or paying anything to apply.
- **Resumes** — upload PDF resumes (parsed client-side for skills and section content), keep multiple labeled versions, and delete any you no longer need.
- **Job Queue** — paste job links as you find them, then run them through Compare & Analyze when you're ready.
- **Dashboard** — every comparison you've saved, with status (not applied / ready / applied / interviewing / offer / rejected), match score, notes, and the full cover letter/email, all editable.
- **Companies** — auto-created from your comparisons, or add manually; track website, contact email/phone, LinkedIn, and notes per company. Given a website, "Auto-fill contact info from website" tries to fetch the page and pattern-matches for an email, phone number, and LinkedIn company link — no AI API, just regex, and it's best-effort since most company sites block cross-origin fetches from a browser. Anything it can't find (which is often) just stays blank for you to fill in.
- **Invite a friend** — email-only, one person at a time, no public link and no social sharing. Click "Invite a friend" in the sidebar, enter their email and an optional note. By default this opens your own email app with the invite pre-written, ready to send — free, no setup. If you deploy the optional Cloud Function (below), you get a second "Send invite" button that emails them directly, no email app required.
- **My Profile** — a full page for everything about you beyond a single resume: pick a saved resume and pull its skills in with one click, add more skills manually, list your experience, and write a short bio and hobbies. Set your job search preferences (keywords, location, country, and how recently a job must have been posted — 1 to 90 days) and click **Fetch matching jobs** to pull live listings from the internet (via the Adzuna API — see setup below), each one scored against your profile and one click away from your Job Queue. You can also paste any job description into the "Scan a job description for skill gaps" card to find skills worth adding to your profile, and generate a downloadable, editable "Skills Summary" (a cover-letter-styled writeup of your current skills/experience) with one click, keeping a history of past versions to revisit.
- **Admin Dashboard** — hidden from every account except the ones granted admin access (see [Admin Dashboard](#admin-dashboard-optional) below). Lets an admin see every user's name/email, every saved job link and company comparison across all accounts, and export it as CSV or email it.
- **Support** — a form for bugs, questions, or feature ideas: name, subject, comments, and an optional screenshot (resized/compressed in your browser, no file storage setup needed). Every submission shows up on your own Support page along with its status and any reply. Admins get a **Support Tickets** card on the Admin Dashboard listing every request across all accounts, with View/Email/Reply on each — replies are saved in-app and shown to the person automatically, or emailed directly too if you deploy the optional Cloud Function (see [Support tickets](#support-tickets-optional) below).

## Job search (Adzuna)

The "Fetch matching jobs" button on your Profile page needs a free Adzuna API key — Adzuna aggregates job listings from many boards and, unlike most job sites, its API is built to be called straight from a browser (no backend needed) and supports filtering by how recently a job was posted.

1. Go to [developer.adzuna.com/signup](https://developer.adzuna.com/signup) and register a free account (no credit card).
2. On your account page, copy your **Application ID** and **Application Key**.
3. Copy `js/adzuna-config.example.js` to `js/adzuna-config.js` (that filename is gitignored, so your keys never get committed — see "Keeping this repo public-safe" below), then paste your keys in:
   ```js
   window.GAPNINJA_ADZUNA_APP_ID = "your-app-id";
   window.GAPNINJA_ADZUNA_APP_KEY = "your-app-key";
   ```
4. Reload the app. On your Profile page, fill in keywords (or leave blank to use your top skills), a location, a country, and how many days back to search (1–90), then click **Fetch matching jobs**.

Without these keys, the button still shows up but tells you it isn't configured yet instead of failing silently.

## Automatic invite emails (optional)

Skip this section entirely if the "open in my email app" invite button is enough for you — that one needs zero setup and always works.

To let gapNinja send the invite email itself:

1. **Upgrade to the Blaze plan.** Cloud Functions require it — in Firebase Console, click **Upgrade** (bottom of the left sidebar) and switch to **Blaze (pay as you go)**. This needs a credit card on file, but Blaze still includes a free tier (2M function invocations/month); a personal project won't be charged anything.
2. **Create a free Resend account** at [resend.com](https://resend.com) (or swap in any transactional email API you prefer — the function only touches one `fetch` call). Verify a sending domain under **Domains**, then create an **API key** under **API Keys**.
3. **Install the Firebase CLI** (one-time, needs Node/npm): `npm install -g firebase-tools`, then `firebase login`.
4. From the project root (`C:\gapNinja`), store your Resend key as a secret — never put it in code:
   ```
   firebase functions:secrets:set RESEND_API_KEY
   ```
   Paste the key when prompted.
5. Open `functions/index.js` and change `FROM_ADDRESS` to an address on the domain you verified in Resend (e.g. `"gapNinja <invites@yourdomain.com>"`).
6. Deploy:
   ```
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```
7. Copy the function URL the deploy prints (looks like `https://us-central1-gapninja-5c222.cloudfunctions.net/sendInvite`) into `js/invite-config.js`:
   ```js
   window.GAPNINJA_INVITE_FUNCTION_URL = "https://us-central1-gapninja-5c222.cloudfunctions.net/sendInvite";
   ```
8. Reload the app — the Invite modal now shows a second **Send invite** button.

## Admin Dashboard (optional)

The Admin Dashboard is a separate page, hidden from the sidebar for everyone except accounts explicitly granted admin access. It shows every user's name/email, every job link they've queued, and every company comparison they've run (with a link to open the full analysis), and can export that as a CSV download, a pre-filled email (opens your own email app, no setup), or — if you deploy the optional Cloud Function below — a real emailed CSV attachment sent server-side.

**This is enforced by Firestore security rules, not just hidden in the UI.** Only accounts with a document at `admins/{uid}` can read other users' data at all — see `firestore.rules`. A regular user who somehow opens the Admin view sees a permission error, not other people's data.

**Bootstrapping your first admin** (one-time, chicken-and-egg problem — admins are the only ones who can grant admin, so the very first one has to be created by hand):

1. Sign in to the app normally at least once, so your account exists.
2. In Firebase Console, go to **Build → Firestore Database → Data**.
3. Click **Start collection**, name it exactly `admins`.
4. For the document ID, paste in your own **User UID** — find it under **Build → Authentication → Users**, in the "User UID" column next to your email.
5. Add any single field to the document (e.g. `grantedAt`, type `timestamp`, any value) and click **Save**. The document just needs to exist — its contents aren't checked, only that a doc at `admins/{yourUid}` is present.
6. Reload the app and sign in — an **Admin** item now appears in the sidebar. From there you can grant or revoke admin access for any other user with one click; no more manual Console steps needed after this first one.

**Optional: email reports as a real attachment.** By default, "Email report" opens your own email app with the CSV data in the body (capped at 40 rows to stay under email length limits — fine for most exports). To send the full CSV as an actual file attachment instead, deploy the `sendAdminReport` Cloud Function — it reuses the same Blaze plan + Resend account + `RESEND_API_KEY` secret as "Automatic invite emails" above, so there's nothing new to sign up for if you've already set that up:

1. Complete steps 1–6 of "Automatic invite emails" above if you haven't already (Blaze plan, Resend account, `RESEND_API_KEY` secret, `FROM_ADDRESS`).
2. Deploy (or redeploy) functions:
   ```
   firebase deploy --only functions
   ```
3. Copy the printed `sendAdminReport` function URL into `js/invite-config.js`:
   ```js
   window.GAPNINJA_ADMIN_REPORT_FUNCTION_URL = "https://us-central1-gapninja-5c222.cloudfunctions.net/sendAdminReport";
   ```
4. Reload the app — the Admin Dashboard now shows a third **Send report by email** button alongside Download CSV and the mailto option.

## Support tickets (optional)

Anyone signed in can submit a request from the **Support** page (name, subject, comments, optional screenshot) — this always works, free, no setup, and screenshots are resized/compressed to a small JPEG entirely in the browser before being saved, so there's no Firebase Storage bucket to configure. Admins see every submission on the Admin Dashboard's **Support Tickets** card, and can View a ticket, click **Email** to open their own email app pre-addressed to the sender, or type a **Reply** — replies save straight to the ticket and appear on the sender's own Support page automatically.

**Optional: also send replies as a real email**, instead of relying on the sender to check back. Deploy the `sendSupportReply` Cloud Function — it reuses the same Blaze plan + Resend account + `RESEND_API_KEY` secret as "Automatic invite emails" above:

1. Complete steps 1–6 of "Automatic invite emails" above if you haven't already (Blaze plan, Resend account, `RESEND_API_KEY` secret, `FROM_ADDRESS`).
2. Deploy (or redeploy) functions:
   ```
   firebase deploy --only functions
   ```
3. Copy the printed `sendSupportReply` function URL into `js/invite-config.js`:
   ```js
   window.GAPNINJA_SUPPORT_REPLY_FUNCTION_URL = "https://us-central1-gapninja-5c222.cloudfunctions.net/sendSupportReply";
   ```
4. Reload the app — saving a reply from the Support Tickets card now also emails it to the sender. If the email send fails for any reason (bad address, Resend issue, etc.), the reply is still saved in-app regardless — emailing it is a bonus on top, not a requirement.

## How matching works

Matching is done entirely client-side with a curated skills dictionary (`js/skills-data.js`) and keyword/phrase detection (`js/matching.js`) — no external AI API call, fast and free. It's keyword-based, so it won't catch every synonym a human (or an LLM) would catch. Treat the score and gap list as a strong first pass — always read the JD yourself before sending anything.

## Project structure

```
index.html              Landing page + app shell (all views, modals)
server.js                Zero-dependency local static server
firebase.json             Firestore rules + Storage rules + Hosting + Cloud Functions deploy config
firestore.rules            Security rules — per-user data isolation + admins/{uid} read access
storage.rules              Cloud Storage rules — per-user isolation for uploaded resume PDFs
.firebaserc               Links this folder to your Firebase project
functions/                Optional Cloud Functions: sendInvite, sendAdminReport (see README above)
css/style.css             Styling (dark "ninja" theme + landing page)
js/firebase-config.js     Your Firebase project keys (fill these in) — tracked in git; these values are safe to expose (see below)
js/invite-config.example.js  Tracked template, blank on purpose — copy to js/invite-config.js (gitignored) and fill in your own Cloud Function URLs
js/adzuna-config.example.js  Tracked template, blank on purpose — copy to js/adzuna-config.js (gitignored) and fill in your own Adzuna keys
js/firebase.js            Firebase Auth (Google + email/password, password reset) + Firestore-backed data layer + Admin API (ES module)
js/auth-ui.js              Shows the landing page or the app based on sign-in state
js/skills-data.js         Skills dictionary + learning-resource links
js/matching.js             Skill extraction & gap-scoring engine
js/scam-check.js           Heuristic job-scam red-flag scanner for Compare & Analyze
js/templates.js            Cover letter, follow-up email, and Skills Summary generation
js/pdf-utils.js            PDF text extraction (pdf.js wrapper)
js/pdf-export.js            Plain-text-to-PDF export (jsPDF wrapper), used for cover letters and Skills Summaries
js/ui-*.js                  View logic: dashboard, compare, resumes, companies, tasks, invite, profile, admin
js/app.js                   Nav routing, profile modal, boot
js/storage.js               Unused — superseded by js/firebase.js, kept only to avoid 404s
js/ui-resume-builder.js     Unused — an earlier visual resume builder, reverted; kept only to avoid 404s
```

## Keeping this repo public-safe

This repo is meant to be safe to make public. Two different rules apply, depending on the file:

**`js/firebase-config.js` is tracked with real values on purpose.** Firebase's client-side config (the `apiKey` included) isn't a secret — it identifies which project to talk to, but it grants no access by itself. Access is enforced entirely by `firestore.rules`, which is also tracked and meant to be public; hiding your rules wouldn't make them any more secure, and showing them is a fine way to demonstrate they're actually solid.

**Every other `*-config.js` file is gitignored, and only its `*-config.example.js` counterpart is tracked.** `js/adzuna-config.js` and `js/invite-config.js` hold things you fill in yourself (API keys, deployed Cloud Function URLs) — even though the specific values used today aren't especially dangerous, this pattern means you never have to think about it again: copy the `.example.js` file to the real filename, fill it in locally, and git will never see it. The same pattern is already set up for anything named `js/*-config.js` you add later — a future `js/stripe-config.js`, for instance, will be gitignored automatically without needing another `.gitignore` change.

**Real secrets never go in a file at all.** The Resend and Anthropic API keys (used by the optional Cloud Functions) are stored in Google Secret Manager via `defineSecret()` in `functions/index.js`, set once with `firebase functions:secrets:set SECRET_NAME` — never committed, never in a config file, not even in the gitignored ones. Stripe's secret key and webhook signing secret will follow this exact same pattern when that's built.

## Data model (Firestore)

Every document lives under the signed-in user's own subtree:

```
users/{uid}/resumes/{id}        label, filename, rawText, skillCount, createdAt, pdfUrl, pdfPath
                                  (pdfUrl/pdfPath point at the original uploaded PDF in Cloud
                                  Storage, at users/{uid}/resumes/{id}.pdf — used by the "View"
                                  button to preview the actual file; absent if the Storage upload
                                  failed, in which case matching still works from rawText alone)
users/{uid}/companies/{id}      name, website, contactEmail, contactPhone, linkedin, notes,
                                  createdAt
users/{uid}/applications/{id}   companyId, companyName, role, jdText, resumeId, matchScore,
                                  matchedSkills[], gapSkills[], coverLetter, emailSubject,
                                  emailBody, compensation, status, notes, appliedAt, createdAt
users/{uid}/tasks/{id}          link, note, status, linkedApplicationId, createdAt
users/{uid}/meta/profile        name, email, phone, linkedin, skills[], knowledge, experience[]
                                  (title, company, duration, description), bio, hobbies, resumeId,
                                  jobSearch (keywords, location, country, maxDaysOld)
users/{uid}/summaries/{id}      title, text, createdAt   (saved "Skills Summary" history, from Profile)
users/{uid}/supportTickets/{id} ticketNumber (sequential, starts at 1001 — shown in the UI as
                                  "#GN-1001"), name, email, subject, message, screenshot (a resized
                                  JPEG data URL, or ""), status (open/replied/resolved), reply,
                                  repliedAt, repliedBy, createdAt

admins/{uid}                    Top-level allowlist — existence of this doc is what grants admin
                                  access (see "Admin Dashboard" above). Not nested under users/{uid}
                                  so a user can never grant themselves access by writing their own doc.
counters/supportTickets          Top-level, single document. One field, next (number) — the next
                                  ticket number to hand out. Any signed-in user can read/write this
                                  one specific document (not a general-purpose collection); each
                                  ticket submission bumps it atomically via a Firestore transaction
                                  (see allocateTicketNumber() in js/firebase.js) so two people
                                  submitting at the same instant never get the same number.
```

The security rule from the Firebase setup section (`match /users/{userId}/{document=**}`) already covers every subcollection for its owner — no extra rules needed there if you add more later. Admin accounts get read-only access to every user's subtree via a second rule scoped to `admins/{uid}`, plus collection-group rules for a few specific subcollections that the Admin Dashboard needs to query across every user at once (`meta`, `tasks`, `applications` — read-only; `supportTickets` — read AND write, since admins need to save a reply onto another user's ticket) — see `firestore.rules` for the exact logic. The admin Support Tickets list can also be filtered by a free-text search box that matches ticket number, email, or subject.

## Troubleshooting

- **"Firebase isn't configured yet"** on the landing page — you haven't filled in `js/firebase-config.js` yet.
- **Sign-in popup blocked** — allow popups for `localhost` in your browser and try again.
- **"This domain isn't authorized"** — you're opening the app from something other than `localhost` (e.g. a different port, or a deployed URL). Add that exact origin under Firebase Console → Authentication → Settings → Authorized domains.
- Data not showing up after signing in with a different Google account — that's expected; each Google account only sees its own data.
- **"An account already exists with that email"** when signing up — you (or someone) already created an account with that address; use the **Log in** tab instead, or **Forgot password** to reset it.
- **Not receiving the password reset email** — check spam/junk. Firebase sends it from a `firebaseapp.com` address by default; you can customize the sender under Authentication → Templates once you're comfortable with the setup.
- **Email/password button disabled with "Firebase isn't configured yet"** — same fix as Google sign-in: fill in `js/firebase-config.js`, and make sure you enabled **Email/Password** under Authentication → Sign-in method (not just Google).
- **"Job search isn't configured yet"** on the Profile page — add your free keys to `js/adzuna-config.js` (see "Job search (Adzuna)" above).
- **"Couldn't fetch jobs" / Adzuna error** — double-check the app ID and key were pasted correctly (no extra quotes or spaces), and that you copied them from your actual Adzuna account page, not the docs example.

## Extending it

- Add more skills or better aliases in `js/skills-data.js`.
- Swap the template-based cover letter generator in `js/templates.js` for a call to an LLM API if you want more natural phrasing.
- Deploy it for free with **Firebase Hosting** (`firebase deploy`, requires the Firebase CLI) if you want a public URL instead of `localhost`.
