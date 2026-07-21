/* gapNinja — job-scam risk check for pasted links/descriptions on Compare & Analyze.
   Two layers:
   1. Pattern-matching (analyze) — always runs, no setup, no cost. Catches common red flags in
      the link and description text. Not a fraud database — can miss well-written scams and can
      flag a few legitimate postings. Treat the result as a prompt to look closer, not a verdict.
   2. Google Safe Browsing lookup (checkSafeBrowsing) — optional, needs a free API key in
      js/safebrowsing-config.js (see js/safebrowsing-config.example.js + README). Checks the link
      against Google's real, live list of reported phishing/malware sites. Skipped silently if no
      key is configured. */
(function () {
  const URL_SHORTENERS = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
    "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "tiny.cc", "lnkd.in",
  ];

  const FREE_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com"];

  // TLDs that see disproportionate use in phishing/spam campaigns because they're cheap or
  // unmoderated. A job posted from one of these isn't automatically fake — plenty of small,
  // legitimate sites use them too — but it's worth a second look.
  const RISKY_TLDS = [
    "top", "xyz", "click", "work", "support", "loan", "link", "gq", "tk", "ml", "cf", "ga",
    "icu", "rest", "cam", "fit", "cyou", "bar", "mom", "live", "monster", "quest",
  ];

  // Domains a job link legitimately comes from even when it doesn't contain the company's name —
  // applicant-tracking systems and job boards post on their own domain on the company's behalf.
  const KNOWN_JOB_BOARDS = [
    "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "monster.com",
    "greenhouse.io", "lever.co", "myworkdayjobs.com", "workday.com", "smartrecruiters.com",
    "icims.com", "jobvite.com", "breezy.hr", "bamboohr.com", "ashbyhq.com", "adzuna.com",
    "simplyhired.com", "dice.com", "angel.co", "wellfound.com", "builtin.com", "hired.com",
    "careerbuilder.com", "google.com",
  ];

  // Heavier weight — these are the classic "you will lose money or personal info" patterns.
  const HIGH_RISK_PHRASES = [
    { pattern: /wire transfer/i, label: "Mentions a wire transfer" },
    { pattern: /western union/i, label: "Mentions Western Union" },
    { pattern: /(bank (account )?details|routing number)/i, label: "Asks for your bank account details" },
    { pattern: /(processing|registration|starter kit|training|onboarding)\s+fee/i, label: "Asks you to pay a fee before you can start" },
    { pattern: /(buy|purchase)\s+(gift\s?cards?|itunes)/i, label: "Asks you to buy gift cards" },
    { pattern: /(bitcoin|crypto(currency)?)\s+(payment|wallet)/i, label: "Involves cryptocurrency payment" },
    { pattern: /reship(ping)?\s+(packages?|items?|merchandise)/i, label: "Involves reshipping packages (a common repackaging scam)" },
    { pattern: /mystery shopper/i, label: "\"Mystery shopper\" offer" },
    { pattern: /deposit (this|the|a) check/i, label: "Asks you to deposit a check for them" },
    { pattern: /no interview (necessary|required|needed)/i, label: "Says no interview is required" },
    { pattern: /(whatsapp|telegram)\s+only/i, label: "Only offers contact via WhatsApp/Telegram, not email or phone" },
  ];

  // Lighter weight — worth a second look, but common enough in real postings that they're not
  // damning on their own.
  const MEDIUM_RISK_PHRASES = [
    { pattern: /\$\s?\d{3,}\s*(\/|per)\s*(day|week)\b/i, label: "Advertises unusually high pay per day/week" },
    { pattern: /work from home[^.]{0,25}(no experience|earn \$)/i, label: "Vague \"work from home, no experience needed\" pitch" },
    { pattern: /(send|provide|share) (us )?your (home address|date of birth|ssn|social security)/i, label: "Asks for sensitive personal info very early" },
    { pattern: /urgent(ly)? hiring/i, label: "Uses urgency language (\"urgently hiring\")" },
    { pattern: /(text|message) (us|me) (directly|now) at/i, label: "Pushes you to a personal text/phone number instead of a company process" },
  ];

  function checkUrl(url, companyName) {
    const flags = [];
    if (!url) return flags;
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      flags.push({ label: "That doesn't look like a valid, complete URL", weight: 10 });
      return flags;
    }
    const host = u.hostname.toLowerCase();
    const hostNoWww = host.replace(/^www\./, "");

    if (u.protocol !== "https:") {
      flags.push({ label: "Link isn't using a secure (https) connection", weight: 10 });
    }
    if (URL_SHORTENERS.includes(hostNoWww)) {
      flags.push({ label: "Uses a link-shortening service instead of a direct company or job-board link", weight: 20 });
    }
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      flags.push({ label: "Link points to a raw IP address instead of a real domain name", weight: 25 });
    }
    if (url.includes("@") && url.indexOf("@") < url.indexOf(host)) {
      flags.push({ label: "Link uses an \"@\" trick that can hide where it actually goes", weight: 25 });
    }
    if (host.includes("xn--")) {
      flags.push({ label: "Domain uses international characters encoded as \"xn--\" (punycode) — a known technique for making a fake domain look like a trusted brand at a glance", weight: 20 });
    }
    const tld = hostNoWww.split(".").pop();
    if (RISKY_TLDS.includes(tld)) {
      flags.push({ label: `Uses a ".${tld}" domain ending, which sees disproportionate use in spam/phishing sites`, weight: 10 });
    }
    const hyphenCount = (hostNoWww.match(/-/g) || []).length;
    if (hyphenCount >= 3) {
      flags.push({ label: "Domain name has an unusually large number of hyphens — a common trick to mimic a real brand's name", weight: 10 });
    }
    const mismatch = checkDomainMatch(hostNoWww, companyName);
    if (mismatch) flags.push(mismatch);

    return flags;
  }

  function checkDomainMatch(hostNoWww, companyName) {
    if (!companyName || !companyName.trim()) return null;
    if (KNOWN_JOB_BOARDS.some((b) => hostNoWww === b || hostNoWww.endsWith("." + b))) return null;
    const hostCompact = hostNoWww.replace(/[^a-z0-9]/g, "");
    const companyCompact = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const firstWord = companyName.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    if (companyCompact.length >= 3 && hostCompact.includes(companyCompact)) return null;
    if (firstWord.length >= 3 && hostCompact.includes(firstWord)) return null;
    if (companyCompact.length >= 3 && companyCompact.includes(hostCompact.split(".")[0])) return null;
    return {
      label: `The link's domain (${hostNoWww}) doesn't obviously match the company name you entered ("${companyName.trim()}") — confirm this is the company's real site (or a known job board) before applying`,
      weight: 10,
    };
  }

  function checkText(text) {
    const flags = [];
    if (!text) return flags;
    HIGH_RISK_PHRASES.forEach((p) => {
      if (p.pattern.test(text)) flags.push({ label: p.label, weight: 20 });
    });
    MEDIUM_RISK_PHRASES.forEach((p) => {
      if (p.pattern.test(text)) flags.push({ label: p.label, weight: 10 });
    });
    const emails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    if (emails.length && emails.every((e) => FREE_EMAIL_DOMAINS.some((d) => e.toLowerCase().endsWith("@" + d)))) {
      flags.push({ label: "The only contact email listed uses a free personal service (Gmail, Yahoo, etc.), not a company domain", weight: 10 });
    }
    return flags;
  }

  // Returns { score (0-100), level ('low'|'medium'|'high'), flags[], checkedUrl, checkedText }
  function analyze(url, text, companyName) {
    const urlFlags = checkUrl((url || "").trim(), companyName);
    const textFlags = checkText((text || "").trim());
    const flags = urlFlags.concat(textFlags);
    const score = Math.min(100, flags.reduce((sum, f) => sum + f.weight, 0));
    let level = "low";
    if (score >= 50) level = "high";
    else if (score >= 20) level = "medium";
    return {
      score,
      level,
      flags,
      checkedUrl: !!(url && url.trim()),
      checkedText: !!(text && text.trim()),
    };
  }

  const THREAT_LABELS = {
    MALWARE: "malware",
    SOCIAL_ENGINEERING: "phishing",
    UNWANTED_SOFTWARE: "unwanted software",
    POTENTIALLY_HARMFUL_APPLICATION: "a potentially harmful application",
  };

  // Checks a link against Google's live Safe Browsing blocklist. Requires a free API key in
  // js/safebrowsing-config.js — returns { configured: false } immediately if none is set, so
  // callers can show a "not configured" hint instead of a broken check.
  async function checkSafeBrowsing(url) {
    const apiKey = window.GAPNINJA_SAFEBROWSING_API_KEY;
    if (!apiKey || !url) return { configured: false, matched: false, threatTypes: [], error: null };
    try {
      const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "gapninja", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const matches = data.matches || [];
      return {
        configured: true,
        matched: matches.length > 0,
        threatTypes: matches.map((m) => THREAT_LABELS[m.threatType] || m.threatType),
        error: null,
      };
    } catch (e) {
      return { configured: true, matched: false, threatTypes: [], error: e.message };
    }
  }

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.ScamCheck = { analyze, checkSafeBrowsing };
})();
