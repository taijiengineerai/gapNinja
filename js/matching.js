/* gapNinja — skill extraction & gap-analysis engine (all client-side, no API calls) */
(function (global) {
  const SKILLS = global.GapNinja.SkillsData.SKILLS;

  function normalize(text) {
    return " " + (text || "").toLowerCase().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") + " ";
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Count occurrences of a phrase/alias in normalized text using loose word-boundary matching.
  function countOccurrences(normText, alias) {
    const a = alias.trim().toLowerCase();
    if (!a) return 0;
    // For short/ambiguous tokens (like "r", "c", "go") aliases already carry padding spaces in skills-data.
    const pattern = new RegExp("(?<![a-z0-9])" + escapeRegex(a) + "(?![a-z0-9])", "g");
    const matches = normText.match(pattern);
    return matches ? matches.length : 0;
  }

  // Extract skills present in a block of text. Returns array of { skill, count }
  function extractSkills(text) {
    const normText = normalize(text);
    const found = [];
    for (const skill of SKILLS) {
      let count = 0;
      for (const alias of skill.aliases) {
        count += countOccurrences(normText, alias.trim());
      }
      if (count > 0) found.push({ skill, count });
    }
    return found.sort((a, b) => b.count - a.count);
  }

  // Compare a resume's text against a job description's text.
  function analyze(resumeText, jdText) {
    const resumeSkills = extractSkills(resumeText);
    const jdSkills = extractSkills(jdText);

    const resumeNames = new Set(resumeSkills.map((s) => s.skill.name));

    const matched = jdSkills.filter((s) => resumeNames.has(s.skill.name));
    const gap = jdSkills.filter((s) => !resumeNames.has(s.skill.name));
    const bonus = resumeSkills.filter((s) => !jdSkills.some((j) => j.skill.name === s.skill.name));

    const score = jdSkills.length > 0 ? Math.round((matched.length / jdSkills.length) * 100) : 0;

    // Flag gap skills mentioned 2+ times in the JD as higher priority to learn.
    const gapPrioritized = gap
      .slice()
      .sort((a, b) => b.count - a.count)
      .map((g) => Object.assign({ priority: g.count >= 2 ? "high" : "normal" }, g));

    return {
      score,
      matched,
      gap: gapPrioritized,
      bonus,
      resumeSkillCount: resumeSkills.length,
      jdSkillCount: jdSkills.length,
    };
  }

  // Best-effort scan for a compensation figure in free text (job descriptions).
  // Prefers a range ("$90,000 - $110,000", "$40/hr - $55/hr") and falls back to a single figure.
  function extractCompensation(text) {
    if (!text) return null;

    const money = "\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\s?[kK]?";
    const moneyLoose = "\\$?\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\s?[kK]?";
    const suffix = "(?:\\s*(?:\\/\\s?(?:hr|hour|yr|year)|\\s?per\\s+(?:hour|year|annum)|\\s?(?:annually|yearly|hourly)))?";

    const rangeRe = new RegExp(money + suffix + "\\s*(?:-|–|—|to)\\s*" + moneyLoose + suffix, "i");
    const singleRe = new RegExp(money + suffix, "i");

    const rangeMatch = text.match(rangeRe);
    if (rangeMatch) return rangeMatch[0].replace(/\s+/g, " ").trim();

    const singleMatch = text.match(singleRe);
    if (singleMatch) return singleMatch[0].replace(/\s+/g, " ").trim();

    return null;
  }

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.Matching = { extractSkills, analyze, extractCompensation };
})(window);
