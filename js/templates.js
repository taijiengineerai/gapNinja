/* gapNinja — cover letter & follow-up email template generation (rule-based, no external API) */
(function (global) {
  function topNames(list, n) {
    return list.slice(0, n).map((s) => s.skill.name);
  }

  // Picks up to n DISTINCT gap-skill names for THIS analysis, high-priority ones first. Plain
  // topNames() can't be used here because a naive "high-priority gaps, then all gaps" concat
  // duplicates any high-priority skill (it appears once from the filter and again from the full
  // list) — which could make the cover letter repeat a skill or crowd out a real, different gap
  // from this job description. This dedupes by skill name so every name shown is unique and
  // actually reflects the current job's gap list, not an artifact of how the list was built.
  function topUniqueGapNames(gapList, n) {
    const ordered = gapList.filter((g) => g.priority === "high").concat(gapList.filter((g) => g.priority !== "high"));
    const seen = new Set();
    const names = [];
    for (const g of ordered) {
      const name = g.skill.name;
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
      if (names.length >= n) break;
    }
    return names;
  }

  // Picks up to n skills straight from THE RESUME you're comparing against (analysis.resumeSkills
  // — every taxonomy skill found in that resume's actual text, per js/matching.js), for the
  // "beyond what the posting asks for" line. This is deliberately sourced from the resume itself
  // rather than the Profile page's typed-in skills list, since that list may be sparse, stale, or
  // just not what the user means by "the resume I compare to."
  //
  // Already-mentioned matched skills are excluded first (resumeSkills = matched ∪ bonus, so this
  // reduces to the resume's skills the JD doesn't ask about) so this sentence never repeats the
  // earlier "this posting calls for X" line. What's left is ranked with same-category-as-the-JD
  // skills first (highest relevance), but relatedness only affects ORDER, not whether a skill is
  // included — if the resume has fewer than n extra skills, whatever it has is used, in order of
  // how often it appears in that resume.
  function topResumeSkillNames(analysis, n) {
    const matchedLower = new Set(analysis.matched.map((s) => s.skill.name.toLowerCase()));
    const jdCategories = new Set(analysis.matched.concat(analysis.gap).map((s) => s.skill.category));

    const candidates = (analysis.resumeSkills || []).filter((s) => !matchedLower.has(s.skill.name.toLowerCase()));
    const ranked = candidates.slice().sort((a, b) => {
      const aRelated = jdCategories.has(a.skill.category) ? 1 : 0;
      const bRelated = jdCategories.has(b.skill.category) ? 1 : 0;
      return bRelated - aRelated; // stable — ties keep the resume's own count-desc order
    });

    const seen = new Set();
    const names = [];
    for (const s of ranked) {
      const key = s.skill.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(s.skill.name);
      if (names.length >= n) break;
    }
    return names;
  }

  function joinList(arr) {
    if (arr.length === 0) return "";
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + " and " + arr[1];
    return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
  }

  function generateCoverLetter({ profile, role, company, analysis, resumeHighlights }) {
    const name = (profile && profile.name) || "[Your Name]";
    const matchedNames = joinList(topNames(analysis.matched, 5));
    const gapNames = topUniqueGapNames(analysis.gap, 3);
    const gapText = gapNames.length ? joinList(gapNames) : null;
    const bonusNames = joinList(topResumeSkillNames(analysis, 5));
    const roleText = role || "[Role Title]";
    const companyText = company || "[Company Name]";

    // Every sentence below reads straight off THIS analysis (matched/gap/bonus skills computed
    // fresh from the resume + job description text currently in the form) — nothing here is
    // carried over from a previous comparison. Re-running Analyze Fit always regenerates this
    // from scratch against whatever's in the form right now.
    let body = `Dear ${companyText} Hiring Team,\n\n`;
    body += `I'm excited to apply for the ${roleText} role at ${companyText}. `;
    if (matchedNames) {
      body += `This posting calls for ${matchedNames} — skills I've used hands-on in my recent work, and exactly what I'd bring to this specific role from day one. `;
    } else {
      body += `I'm drawn to this role and believe my background makes me a strong candidate. `;
    }
    body += `I'm confident that experience translates directly to what this position requires.\n\n`;

    if (bonusNames) {
      body += `Beyond what the posting asks for, I also bring experience in ${bonusNames}, which I hope adds extra value to your team.\n\n`;
    }

    if (gapText) {
      body += `I'll be upfront about where I'm still building depth: this role's requirements around ${gapText} are an area I'm actively growing in, rather than years of hands-on experience. `;
      body += `I learn quickly, and I see this position as a strong opportunity to close that specific gap on the job while contributing everything else outlined above from day one.\n\n`;
    }

    body += `I'd welcome the chance to talk about how I can help ${companyText} succeed. Thank you for considering my application — I look forward to hearing from you.\n\n`;
    body += `Best regards,\n${name}`;

    return body;
  }

  function generateFollowUpEmail({ profile, role, company, appliedDate, analysis, contactName }) {
    const name = (profile && profile.name) || "[Your Name]";
    const roleText = role || "[Role Title]";
    const companyText = company || "[Company Name]";
    const who = contactName || "there";
    const dateText = appliedDate ? new Date(appliedDate).toLocaleDateString() : "recently";
    const topSkill = analysis && analysis.matched.length ? analysis.matched[0].skill.name : null;

    const subject = `Following up on my ${roleText} application — ${name}`;

    let body = `Hi ${who},\n\n`;
    body += `I wanted to follow up on my application for the ${roleText} position at ${companyText}, submitted on ${dateText}. `;
    body += `I remain very interested in the opportunity`;
    if (topSkill) {
      body += ` and think my experience with ${topSkill} would let me contribute quickly to the team`;
    }
    body += `.\n\n`;
    body += `Please let me know if there's any additional information I can provide, or if there's an update on next steps. I appreciate your time and consideration.\n\n`;
    body += `Best,\n${name}`;

    return { subject, body };
  }

  // A general-purpose, cover-letter-styled summary of your profile — not tied to any specific
  // job or company, unlike generateCoverLetter. Meant to read like the opening of a strong resume
  // or a LinkedIn "About" section, built from whatever you've filled in on the Profile page.
  function generateSkillsSummary(profile) {
    const p = profile || {};
    const name = p.name || "[Your Name]";
    const skills = (p.skills || []).filter(Boolean);
    const experience = (p.experience || []).filter((e) => e && (e.title || e.company || e.description));
    const bio = (p.bio || "").trim();
    const knowledge = (p.knowledge || "").trim();
    const hobbies = (p.hobbies || "").trim();
    const topSkillsText = joinList(skills.slice(0, 8));

    let body = `${name}\nProfessional Summary\n\n`;

    if (bio) {
      body += `${bio}\n\n`;
    } else if (topSkillsText) {
      body += `A motivated professional with hands-on experience in ${topSkillsText}. Known for adapting quickly, picking up new tools on the fly, and delivering real results.\n\n`;
    } else {
      body += `A motivated professional ready to bring focus and adaptability to a new role.\n\n`;
    }

    if (skills.length) {
      body += `Core Skills\n${skills.join(" · ")}\n\n`;
    }

    if (knowledge) {
      body += `Additional Knowledge\n${knowledge}\n\n`;
    }

    if (experience.length) {
      body += `Experience\n`;
      experience.forEach((e) => {
        const header = [e.title, e.company].filter(Boolean).join(" — ") + (e.duration ? ` (${e.duration})` : "");
        body += `${header || "Role"}\n`;
        if (e.description) body += `${e.description}\n`;
        body += `\n`;
      });
    }

    if (hobbies) {
      body += `Outside of Work\n${hobbies}\n\n`;
    }

    const contactParts = [p.email, p.phone, p.linkedin].filter(Boolean);
    if (contactParts.length) {
      body += `Contact\n${contactParts.join(" · ")}\n`;
    }

    return body.trim();
  }

  // A cover letter template for the "Your reusable template" card on the Cover Letters tab,
  // written for this account (Billy Huynh) from his actual resume and career background rather
  // than generic filler. Unlike generateCoverLetter above (which is generated fresh from a
  // specific analysis every time), this is a fixed block of text meant to be saved, hand-edited
  // further as needed, and reused across applications — with [Company Name] and [Job Title] as
  // the only two placeholders "Use my template" (in Compare & Analyze) knows how to fill in
  // automatically; the rest (hiring manager name, the "something you found out about them" line)
  // are left as brackets since guessing at those would mean fabricating content. Deliberately
  // plain, short-sentence writing with no em dashes, so it doesn't read as AI-generated the way a
  // heavily polished template can.
  const DEFAULT_COVER_LETTER_TEMPLATE = `Billy Huynh
Woodland Park, CO | 314-422-6711 | Billy.huynh@gmail.com

[Date]

[Hiring Manager Name, if known]
[Company Name]

Dear [Hiring Manager Name / Hiring Team],

I'm applying for the [Job Title] role at [Company Name]. [One sentence about something specific you found out about them, a product, initiative, or value that caught your attention.]

I've spent 17+ years designing, testing, and troubleshooting network infrastructure across carrier, enterprise, and U.S. defense environments, so I can step into this role and be useful right away. But the technical side isn't the only reason I'm writing. How a team works together matters just as much to me.

In my current role as a Wireless Network Engineer III, I lead regression and feature testing for CPE hardware from vendors like Sagemcom, Sercomm, Askey, and CommScope. I test access points through conductive and over the air testing before they ever reach a customer. I'm also the vendor lead on trouble tickets, and I mentor newer engineers on building out test suites. That mentoring work has shown me something simple: teams do their best work when people actually share what they know instead of sitting on it. Earlier in my career, coordinating with commercial vendors and DISA stakeholders across every military branch on the Ground Based Midcourse Defense program taught me the same thing. Good working relationships solve problems faster than any one person's expertise can on its own.

That's what I look for in a company too. A team that treats mentoring and knowledge sharing as part of the job, not something extra. A place where people can raise a problem early instead of sitting on it until it's bigger. [Optional: one sentence connecting this to something specific you learned about how their team works.]

I'd like to talk about how my background fits what your team is building. Thanks for taking the time to read this.

Sincerely,
Billy Huynh`;

  // The exact bracket text in DEFAULT_COVER_LETTER_TEMPLATE (and, if the user kept the wording,
  // in their saved template too) that stands in for a company-specific detail. Kept as a shared
  // constant so "Use my template" can find-and-replace it without hardcoding the string twice.
  const COMPANY_HIGHLIGHT_PLACEHOLDER =
    "[One sentence about something specific you found out about them, a product, initiative, or value that caught your attention.]";

  // Best-effort: pulls one sentence straight out of the job description that reads like it's
  // ABOUT THE COMPANY (mission, product, values) rather than about the role's duties or
  // requirements, for the COMPANY_HIGHLIGHT_PLACEHOLDER slot in the template. Job postings
  // usually open with a paragraph like this before listing responsibilities/requirements, so this
  // looks in that opening section first, then scores candidate sentences by whether they mention
  // the company name or company-description language, and skips anything that reads like a
  // requirement ("years of experience", "bachelor's degree", etc.) or a bullet point. Returns the
  // sentence verbatim (nothing is paraphrased or invented) so it can't misrepresent the posting,
  // or null if nothing in the JD text scores confidently enough to guess at over leaving the
  // bracket for the user to fill in by hand.
  function extractCompanyHighlight(jdText, companyName) {
    const text = (jdText || "").replace(/\r/g, "");
    if (!text.trim()) return null;

    // Cut the text off at the first line that reads like a "Responsibilities" / "Requirements" /
    // "Qualifications" section header, so scoring only looks at the company-intro portion above
    // it (if no such header is found, fall back to just the first ~800 characters).
    const sectionHeaderRe = /^\s{0,3}(responsibilities|requirements|qualifications|what you.?ll do|what you bring|the role|about the role|duties|who you are|skills( & | and )experience|minimum qualifications|preferred qualifications)\b/im;
    const headerMatch = text.match(sectionHeaderRe);
    const introText = headerMatch ? text.slice(0, headerMatch.index) : text.slice(0, 800);

    // A short line with no sentence-ending punctuation reads as a heading or job title ("About
    // Us", "Solutions Engineer - WiFi") rather than prose. Dropping these before joining lines
    // into sentences matters because plain-text job postings often put a heading directly above
    // its paragraph with no blank line between them -- without this, "About Us" would glue onto
    // the front of the very sentence being extracted.
    function looksLikeHeading(line) {
      return line.length > 0 && line.length < 45 && !/[.!?]$/.test(line);
    }

    // Split into rough sentences, paragraph by paragraph (blank-line-separated blocks) so a
    // heading or job title in one paragraph never gets glued onto a sentence in the next. This is
    // a simple heuristic split (period/!/? followed by whitespace), not a real sentence
    // tokenizer, so it can slice awkwardly on abbreviations -- that's fine here since the
    // fallback (leaving the bracket alone) is safe.
    const rawSentences = [];
    introText.split(/\n\s*\n/).forEach((para) => {
      const lines = para
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !looksLikeHeading(l));
      if (!lines.length) return;
      lines
        .join(" ")
        .split(/(?<=[.!?])\s+(?=[A-Z(])/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => rawSentences.push(s));
    });

    const nameLower = (companyName || "").trim().toLowerCase();
    const requirementRe = /\b(years? of experience|bachelor'?s?|master'?s?|degree|required|must have|preferred qualifications|minimum qualifications|proficien)\b/i;
    const companyLanguageRe = /\b(mission|vision|believe|values?|culture|founded|passionate|committed|empower|building?|helps?|helping|transform|innovat|purpose|journey|dedicated to|our team|we're|we are)\b/i;

    let best = null;
    let bestScore = 0;
    rawSentences.forEach((sentence) => {
      if (sentence.length < 30 || sentence.length > 240) return; // too short to say anything, or too long to read as one clean sentence
      if (/^[-*•]/.test(sentence)) return; // bullet point, not prose
      if (requirementRe.test(sentence)) return; // reads like a job requirement, not a company detail

      let score = 0;
      if (nameLower && sentence.toLowerCase().includes(nameLower)) score += 3;
      if (companyLanguageRe.test(sentence)) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = sentence;
      }
    });

    if (!best || bestScore < 2) return null; // nothing confident enough to use over leaving it blank
    return /[.!?]$/.test(best) ? best : best + ".";
  }

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.Templates = {
    generateCoverLetter,
    generateFollowUpEmail,
    generateSkillsSummary,
    DEFAULT_COVER_LETTER_TEMPLATE,
    COMPANY_HIGHLIGHT_PLACEHOLDER,
    extractCompanyHighlight,
  };
})(window);
