/* gapNinja — cover letter & follow-up email template generation (rule-based, no external API) */
(function (global) {
  function topNames(list, n) {
    return list.slice(0, n).map((s) => s.skill.name);
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
    const gapNames = topNames(analysis.gap.filter((g) => g.priority === "high").concat(analysis.gap), 3);
    const gapText = gapNames.length ? joinList(gapNames) : null;
    const bonusNames = joinList(topNames(analysis.bonus, 3));
    const roleText = role || "[Role Title]";
    const companyText = company || "[Company Name]";

    let body = `Dear ${companyText} Hiring Team,\n\n`;
    body += `I'm excited to apply for the ${roleText} role at ${companyText}. `;
    if (matchedNames) {
      body += `Reviewing the job description, my background lines up closely with what you're looking for — particularly my hands-on experience with ${matchedNames}. `;
    } else {
      body += `I'm drawn to this role and believe my background makes me a strong candidate. `;
    }
    body += `In my recent work, I've applied these skills to deliver real results, and I'm confident I can contribute from day one.\n\n`;

    if (bonusNames) {
      body += `Beyond the core requirements, I also bring experience in ${bonusNames}, which I hope can add extra value to your team.\n\n`;
    }

    if (gapText) {
      body += `I'll be upfront: I'm still building deeper hands-on experience with ${gapText}. `;
      body += `I've already started closing that gap — I learn quickly, and I see this role as a great opportunity to grow those skills in a real-world setting while contributing everything else I bring on day one.\n\n`;
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
