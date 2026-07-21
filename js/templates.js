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

  // Picks up to n bonus-skill names (skills you have that the posting doesn't ask for) for the
  // "beyond what the posting asks for" line, preferring ones in the SAME category as skills the
  // job actually asks about (matched + gap) — e.g. for a Marketing role, "SEO" or "Content
  // Strategy" outrank an unrelated "AWS" just because it's mentioned more in the resume. Falls
  // back to the next-most-relevant bonus skills if fewer than n are in a related category, so the
  // sentence always fills in rather than coming up short.
  function relatedBonusNames(analysis, n) {
    const jdCategories = new Set(analysis.matched.concat(analysis.gap).map((s) => s.skill.category));
    const ranked = analysis.bonus.slice().sort((a, b) => {
      const aRelated = jdCategories.has(a.skill.category) ? 1 : 0;
      const bRelated = jdCategories.has(b.skill.category) ? 1 : 0;
      return bRelated - aRelated; // stable sort — ties keep their original (resume-count) order
    });
    return ranked.slice(0, n).map((s) => s.skill.name);
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
    const bonusNames = joinList(relatedBonusNames(analysis, 3));
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

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.Templates = {
    generateCoverLetter,
    generateFollowUpEmail,
    generateSkillsSummary,
  };
})(window);
