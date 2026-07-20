# gapNinja — Scaling & Monetization Plan

*Prepared July 2026. Cost figures are current published rates and will drift — re-check before making budget commitments.*

## 1. Where the current architecture stands

gapNinja runs on Firebase (Auth, Firestore, Hosting, Cloud Functions) with a static HTML/JS front end — no server to manage, which is the right foundation for scaling to millions of users. Firestore and Cloud Functions both scale horizontally by design; you won't hit a wall the way you would with a single Postgres box. The real risks aren't "will it scale" — it's cost surprises and a few specific query patterns that get expensive before the user count looks scary.

Two things in the current code are worth fixing before you grow much past where you are today:

**Admin dashboard queries fetch everything, every time.** `listAllUsers()`, `listAllActivity()`, and `listAllSupportTickets()` in `js/firebase.js` pull every document across every user with no pagination. At 100 users this is invisible. At 5,000 users with active applications/tasks, one admin dashboard page load could mean tens of thousands of document reads in a single request. Fix: paginate (`limit()` + `startAfter()`), or move admin analytics to a BigQuery export (see Phase 3 below) so it stops hitting production Firestore at all.

**Screenshots are stored as base64 inside Firestore documents.** This was the right call to avoid setting up Cloud Storage for an MVP, but base64 is ~33% larger than the raw file and eats into Firestore's per-document costs and the 1MiB document cap. Fix: move to Firebase Cloud Storage once ticket volume grows — it's a small migration and storage there is materially cheaper.

Neither is urgent today. Both should happen before you're much past a few thousand users.

## 2. What it actually costs at each scale

Firestore Blaze pricing: $0.06 per 100K reads, $0.18 per 100K writes, $0.02 per 100K deletes, $0.26/GB stored — after a daily free allowance of 50K reads / 20K writes / 20K deletes / 1GB storage. Cloud Functions: 2M invocations/month free. Hosting: 10GB free egress/month, then metered.

One correction to a common misconception: **standard Firebase Authentication (email/password, Google Sign-In — what gapNinja uses) is free at unlimited scale.** The per-MAU pricing you'll see quoted only applies if you later add phone/SMS auth or upgrade to Identity Platform for enterprise SSO/SAML — don't do either unless a customer specifically needs it.

Rough order-of-magnitude, assuming a typical ~20-30% daily-active rate and modest per-session read/write activity:

| Users | Daily active (~25%) | Estimated monthly Firebase cost |
|---|---|---|
| 100 | ~25 | $0 (comfortably inside free tier) |
| 10,000 | ~2,500 | $15–30/month |
| 1,000,000 | ~150,000 | roughly $1,000–1,800/month |

The 1M-user number is dominated by Firestore storage and Hosting egress, not reads/writes — those stay cheap even at scale. Treat this as a planning-grade estimate, not a quote; your actual DAU/MAU ratio and average document sizes will move it up or down. Set a GCP budget alert now (there's no hard spending cap on Blaze) so you get a warning before a runaway query turns into a surprise bill.

**The one line item that could dwarf all of this is AI.** If you bring back AI-powered resume generation (built earlier, then removed), each generation calls the Claude API — at current Sonnet pricing (~$3/$15 per million input/output tokens), a single resume rewrite likely costs somewhere in the $0.01–0.05 range depending on length. That's trivial at 100 users doing it occasionally, but at real scale with unlimited free usage it becomes your single largest cost line by far. This is the strongest technical argument for gating AI features behind a paid plan — it keeps the feature's cost tied to the revenue it generates.

## 3. What competitors charge

| Product | Free tier | Paid tier |
|---|---|---|
| Teal HQ | Unlimited job tracking | Teal+ $29/mo — AI resume scoring, unlimited cover letters, interview prep |
| Huntr | ~40 jobs tracked | $10–40/mo depending on plan/term (reviewers frequently call the $40 tier overpriced) |
| Careerflow | 15 jobs tracked, basic LinkedIn review | Pro $12–19/mo (unlimited tracking); Premium $25/mo (+ mock interviews, networking) |

Takeaway: unlimited free tracking is table stakes in this category now (Teal and Simplify both do it), and the market has room below Huntr's $40 ceiling. Careerflow's $12–19/mo tier is the closest match to what gapNinja could credibly charge for — AI resume help plus unlimited history — without over- or under-pricing relative to the field.

## 4. Recommended plan structure

*Updated with a second research pass on freemium usage-cap benchmarks and pricing-page conversion best practices — see additional sources below.*

**The comparison engine itself stays unlimited on every tier.** This is a deliberate split worth calling out explicitly, since it's easy to accidentally gate the wrong thing: the *action* of comparing a resume against a job description (skills-gap matching, cover letter generation) has near-zero marginal cost — it's rule-based, no AI API call — and it's the feature that actually demonstrates gapNinja's value. Gating it would mean nobody experiences the product well enough to want to pay for anything. What's capped instead is *persistence*: how many of those comparisons get saved as a tracked application in your pipeline. A user can run unlimited comparisons on Free; only their most recent 15 stay saved and organized. This means the free tier is a fully functional tool, not a crippled demo — the paywall only appears once someone has a real, multi-application search underway and needs it organized, which is also exactly when they're most likely to convert.

**Free tier cap — history, not features.** The freemium mechanic that converts best gates a usage metric tied to the product's core value (here: how many applications you can keep on record), not arbitrary feature walls. Careerflow caps its free tier at 15 tracked jobs, Huntr at 40, Teal doesn't cap at all. A cap of 10 would undercut every competitor in the category and risks reading as stingy next to Teal's "unlimited free tracking" marketing. **Recommended: cap Free at 15 saved applications** — matches Careerflow's benchmark, still creates real pressure for anyone running an active search (most job seekers exceed 15 within a few weeks), and the number is a config value you can A/B test later without a rebuild. Older applications beyond the cap become read-only/archived rather than deleted — softer, and still a strong nudge to upgrade.

**Three tiers, not two — matches what actually converts.** A 2024 conversion analysis found 3–4 tier pricing pages outperform 4+ tier pages by 31%, and a highlighted "Most popular" middle/upper tier lifts its own conversion 25–35%. Structure:

- **Free** — unlimited skills-gap matching, cover letter/follow-up generator, PDF export, unlimited support tickets, 1 resume stored, 15 saved applications (older ones archived read-only past the cap).
- **Pro ($9/mo or $79/yr — "2 months free", flagged Most popular)** — unlimited saved applications and history, unlimited resumes, AI-powered resume rewriting (reintroduce the removed feature here — it directly ties your real marginal AI cost to a paying user), priority support.
- **Teams (contact us, build later)** — for career coaches and university career centers managing multiple clients; seat-based. Don't build this until Pro has real paying users — it's a placeholder tier on the pricing page today, not a q3 engineering task.

**Annual discount framing matters.** Default the pricing page to monthly (clearer at a glance), but show the annual price prominently with a "2 months free" badge rather than a round "20% off" — the 16.7%-framed discount converts 31% better than round-number discounts in 2026 benchmark data, and defaulting-to-annual-visible (without forcing it) lifts annual adoption 19-35%.

This price point sits below Teal's $29 and meaningfully below Huntr's criticized $40 tier, while covering AI costs with wide margin — at $9/mo, roughly 200 paying subscribers already covers the estimated infrastructure cost of running the app at 1M total users. Infra is not the constraint on this business; conversion rate and AI cost-per-use are. At a realistic 3-5% freemium conversion rate, 200 paying Pro users means roughly 4,000-6,500 total signups — an early, achievable milestone, not a scale milestone.

A first pass at the actual pricing page — on-brand, dark theme, monthly/annual toggle, FAQ — is in `docs/pricing-preview.html`. It's a standalone preview (not wired into `index.html` or Stripe yet) meant for review before it becomes a real page on the site.

## 5. Build plan, in order

1. **Set a GCP budget alert now** — free, five minutes, and the only real protection against a runaway query before you have paying customers to absorb it.
2. **Paginate the admin dashboard queries** and move screenshot storage to Cloud Storage — do this before user count climbs into the low thousands, since both get harder to change under load.
3. **Add Stripe billing.** The standard, low-effort path in a Firebase app is the official "Run Payments with Stripe" Firebase Extension — it handles Checkout, webhooks, and syncs subscription status straight into a Firestore field, which fits gapNinja's existing per-user document structure without a new backend.
4. **Add a `plan` field** to each user's profile doc and gate paid features. Client-side checks are fine for UI, but any feature with a real marginal cost (the AI resume call, specifically) needs the check re-verified inside the Cloud Function itself — a client-side-only gate can be bypassed.
5. **Reintroduce the AI Resume Builder** behind the paid gate (it was fully built earlier and removed; likely restorable from git history rather than rebuilt from scratch).
6. **Turn on Firebase Analytics** (free) and let it run for ~60–90 days before finalizing pricing — the DAU/MAU ratios and usage assumptions above are estimates; real data should replace them before you commit to a number publicly.

## Sources

- [Firestore pricing — Google Cloud](https://cloud.google.com/firestore/pricing)
- [Firebase pricing plans — Firebase Documentation](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firebase Auth Pricing 2026 — MetaCTO](https://www.metacto.com/blogs/the-complete-guide-to-firebase-auth-costs-setup-integration-and-maintenance)
- [Firebase Pricing 2026 — BudgetForge](https://www.budgetforge.dev/tools/firebase-pricing-2026)
- [Claude API Pricing — Claude Platform Docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Teal job tracker](https://www.tealhq.com/tools/job-tracker)
- [JobShinobi vs Huntr vs Teal vs Careerflow comparison](https://www.jobshinobi.com/compare/huntr-vs-teal-vs-careerflow-job-tracker)
- [Huntr Alternative pricing critique](https://resumeoptimizerpro.com/blog/huntr-alternative)
- [SaaS Freemium Conversion Rates 2026 — First Page Sage](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/)
- [The SaaS Conversion Report — ChartMogul](https://chartmogul.com/reports/saas-conversion-report/)
- [SaaS Pricing Page Best Practices 2026 — InfluenceFlow](https://influenceflow.io/resources/saas-pricing-page-best-practices-complete-guide-for-2026/)
- [27 SaaS Pricing Pages That Actually Convert — 925 Studios](https://www.925studios.co/blog/saas-pricing-page-examples-convert-2026)
- [Pricing Page Psychology 2026 — Digital Applied](https://www.digitalapplied.com/blog/subscription-pricing-page-psychology-decision-framework-2026)
