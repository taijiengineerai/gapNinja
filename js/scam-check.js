/* gapNinja — heuristic job-scam risk check for pasted links/descriptions.
   This is pattern-matching, not a fraud database — it catches common red flags
   (payment-up-front, gift cards, wire transfers, sketchy links, etc.) but can
   miss well-written scams and can flag a few legitimate postings. Always treat
   the result as a prompt to look closer, not a verdict. */
(function () {
  const URL_SHORTENERS = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
    "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "tiny.cc", "lnkd.in",
  ];

  const FREE_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com"];

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

  function checkUrl(url) {
    const flags = [];
    if (!url) return flags;
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      flags.push({ label: "That doesn't look like a valid, complete URL", weight: 10 });
      return flags;
    }
    if (u.protocol !== "https:") {
      flags.push({ label: "Link isn't using a secure (https) connection", weight: 10 });
    }
    if (URL_SHORTENERS.includes(u.hostname.replace(/^www\./, ""))) {
      flags.push({ label: "Uses a link-shortening service instead of a direct company or job-board link", weight: 20 });
    }
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(u.hostname)) {
      flags.push({ label: "Link points to a raw IP address instead of a real domain name", weight: 25 });
    }
    if (url.includes("@") && url.indexOf("@") < url.indexOf(u.hostname)) {
      flags.push({ label: "Link uses an \"@\" trick that can hide where it actually goes", weight: 25 });
    }
    return flags;
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
  function analyze(url, text) {
    const urlFlags = checkUrl((url || "").trim());
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

  window.GapNinja = window.GapNinja || {};
  window.GapNinja.ScamCheck = { analyze };
})();
