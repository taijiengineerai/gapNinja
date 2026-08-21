/* gapNinja — export plain text (resumes, cover letters, follow-up emails) as a formatted PDF,
   using jsPDF loaded from CDN (no npm needed). Adds light structure on top of the plain text:
   navy name/section headers, a centered contact line, real bullet dots, and job-title lines with
   the company in gray and the date range flush right — and sanitizes characters jsPDF's built-in
   fonts can't render cleanly. Used by the Profile page's Skills Summary and by cover letter
   downloads (Compare & Analyze and the Dashboard's application detail modal). */
(function (global) {
  function sanitizeFilename(name) {
    return (name || "document").replace(/[^a-z0-9.\-_]+/gi, "_");
  }

  // jsPDF's built-in fonts (Times/Helvetica/Courier) only support WinAnsi/Latin-1 — anything
  // outside that range (emoji, dingbats, stray PDF-extraction glyphs) renders as a blank box or
  // garbled shape. This expands common ligatures back to plain letters, normalizes smart
  // punctuation to safe equivalents, and strips anything else outside printable Latin-1.
  function sanitizeText(text) {
    return (text || "")
      .replace(/ﬁ/g, "fi")
      .replace(/ﬂ/g, "fl")
      .replace(/ﬀ/g, "ff")
      .replace(/ﬃ/g, "ffi")
      .replace(/ﬄ/g, "ffl")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, "...")
      .replace(/–/g, "-")
      .replace(/—/g, "--")
      .replace(/[·•]/g, "-")
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x00-\x7E -ÿ\n\t]/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // A line reads as a section header if it's short, has letters, and is already fully
  // uppercase (so it's unaffected by uppercasing itself) — e.g. "CORE SKILLS", "EXPERIENCE".
  function isSectionHeader(t) {
    if (!t || t.length > 60) return false;
    if (!/[A-Z]/.test(t)) return false;
    return t === t.toUpperCase() && t !== t.toLowerCase();
  }

  // Job-title/date-style lines read as short, punchy text without trailing sentence
  // punctuation — used to give them a little extra visual weight (and, when possible, split
  // into title / company / date below).
  function looksLikeSubHeader(t) {
    return t.length < 115 && !/[.!?]$/.test(t);
  }

  // A real name is short and doesn't read like a sentence or bullet. PDF text extraction
  // doesn't always come out in reading order (columns, headers/footers, unusual layouts can
  // shuffle line order), so the very first non-empty line isn't reliably the person's name —
  // this guards against mistaking a long bullet/sentence for one and blowing it up to 19pt.
  function looksLikeName(t) {
    return t.length > 0 && t.length <= 45 && !/[.!?]$/.test(t) && !/^-\s+/.test(t);
  }

  // Some job-header lines are written as segments joined by " — " (an em dash with spaces on
  // either side), optionally with a trailing "(dates)" parenthetical. This pulls a job header
  // apart into { title, company, date } so each part can get its own styling and the date can
  // sit flush right, like a normal resume. Returns null if the line doesn't look like a
  // two-part job header at all.
  function parseJobHeader(t) {
    let date = null;
    let rest = t;
    const parenMatch = rest.match(/\s*\(([^()]*(?:19|20)\d{2}[^()]*)\)\s*$/);
    if (parenMatch) {
      date = parenMatch[1].trim();
      rest = rest.slice(0, parenMatch.index).trim();
    }
    const parts = rest
      .split(/\s+—\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!date && parts.length >= 2) {
      const last = parts[parts.length - 1];
      if ((/\b(19|20)\d{2}\b/.test(last) || /present/i.test(last)) && last.length < 40) {
        date = last;
        parts.pop();
      }
    }
    if (!parts.length) return null;
    const title = parts[0];
    const company = parts.slice(1).join(" — ");
    if (!date && !company) return null;
    return { title, company, date: date || "" };
  }

  // Best-effort: finds the resume's own headline/title (e.g. "Wireless & Network Engineer") near
  // the top of the resume and swaps it for the specific job title being applied to, so a
  // downloaded resume reads as tailored to that role. Handles both common header shapes: name +
  // title + location/contact all on one line (e.g. "BILLY HUYNH  Wireless & Network Engineer
  // Woodland Park, CO | 314-422-6711 | ..."), and name and title on their own separate lines.
  // Only touches text it's confident about -- if the header doesn't match a recognizable shape,
  // it's left untouched rather than risk mangling someone's actual name or contact details.
  function injectTargetTitle(text, role) {
    if (!role) return text;
    const lines = text.split("\n");
    // Marks where phone/email contact info begins, when it trails on the same line as the
    // name/title (location is handled separately below, since a "City, ST" location can itself
    // contain title-case words that would otherwise get swallowed into the title by mistake).
    const boundaryRe = /(\s*\|\s*|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|[\w.+-]+@[\w-]+\.[a-z]{2,})/i;
    // A short run of 1-4 ALL-CAPS words at the very start of a line reads as a name in most
    // resume header styles (e.g. "BILLY HUYNH").
    const nameRe = /^([A-Z][A-Z'’.-]*(?:\s+[A-Z][A-Z'’.-]*){0,3})\b/;
    const locationRe = /,\s*[A-Z]{2}\b/;
    const looksLikeContact = (t) => /@|\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|,\s*[A-Z]{2}\b/.test(t);
    // Common job-title nouns, used to find where a title ends and a "City, ST" location begins
    // when both share a line (e.g. "Wireless & Network Engineer Woodland Park, CO") -- without
    // this, a multi-word city name reads just as capitalized as the title and can't otherwise be
    // told apart from it.
    const titleWordRe = /^(Engineer|Manager|Specialist|Analyst|Developer|Director|Lead|Architect|Administrator|Consultant|Technician|Coordinator|Designer|Scientist|Officer|Executive|Associate|Assistant|Supervisor|Representative|Strategist|Producer|Recruiter|Accountant|Advisor|Planner|President)s?$/i;

    for (let i = 0; i < Math.min(lines.length, 4); i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const boundaryMatch = line.match(boundaryRe);
      const head = boundaryMatch ? line.slice(0, boundaryMatch.index) : line;
      const tail = boundaryMatch ? line.slice(boundaryMatch.index) : "";
      const nameMatch = head.match(nameRe);
      if (!nameMatch) return text; // first content line isn't name-shaped -- don't guess further

      const name = nameMatch[1];
      const remainder = head.slice(nameMatch[0].length);

      if (!remainder.trim()) {
        // Name-only line -- the very next non-empty line might be a standalone title line
        // (short, no contact info, not a section header like "PROFESSIONAL SUMMARY").
        for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
          const t = lines[j].trim();
          if (!t) continue;
          if (t.length <= 60 && !looksLikeContact(t) && !isSectionHeader(t)) {
            lines[j] = role;
            return lines.join("\n");
          }
          break; // only ever consider the very next non-empty line
        }
        return text; // found the name but no safe title line to replace -- leave it alone
      }

      const locMatch = remainder.match(locationRe);
      if (locMatch) {
        // Title and location share this line -- find the last title-sounding word before the
        // location comma and split there, so the city name isn't mistaken for part of the title.
        const beforeLoc = remainder.slice(0, locMatch.index);
        const afterLocStart = remainder.slice(locMatch.index); // ", CO" onward
        const tokenRe = /\S+/g;
        let m;
        let splitIdx = -1;
        while ((m = tokenRe.exec(beforeLoc))) {
          if (titleWordRe.test(m[0].replace(/[^A-Za-z]/g, ""))) {
            splitIdx = m.index + m[0].length;
          }
        }
        if (splitIdx === -1) return text; // no confident title/location boundary -- don't guess
        const existingTitle = beforeLoc.slice(0, splitIdx).trim();
        const location = beforeLoc.slice(splitIdx).trim();
        if (!existingTitle) return text;
        lines[i] = `${name}  ${role}  ${location}${afterLocStart}${tail}`;
        return lines.join("\n");
      }

      const existingTitle = remainder.trim();
      if (existingTitle) {
        lines[i] = `${name}  ${role}${tail}`;
        return lines.join("\n");
      }
      return text;
    }
    return text;
  }

  // Renders `text` as a letter-formatted PDF: bold/colored name header, centered contact line,
  // bold underlined section headers, real bullet dots for "- " lines, job headers with the date
  // flush right, and wrapped body text.
  function downloadTextAsPdf(text, filename) {
    if (!global.jspdf || !global.jspdf.jsPDF) {
      throw new Error("PDF export library failed to load. Check your internet connection and reload the page.");
    }
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    const margin = 60;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const NAVY = [31, 58, 95];
    const GRAY = [90, 90, 90];
    const BLACK = [25, 25, 25];

    const clean = sanitizeText(text);
    const rawLines = clean.split("\n");
    let y = margin;
    let contentLineNumber = 0; // counts non-empty lines only, so blank lines before the name don't throw off "first"/"second" line detection
    let nameRendered = false; // only treat the line right after the name as a contact/subtitle line if a name was actually rendered

    function ensureRoom(h) {
      if (y + h > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    }

    function renderJobHeader(title, company, date) {
      const left = company ? `${title}  —  ${company}` : title;
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      const dateWidth = date ? doc.getTextWidth(date) + 6 : 0;
      const leftMaxWidth = dateWidth ? Math.max(maxWidth - dateWidth, maxWidth * 0.4) : maxWidth;
      const leftLines = doc.splitTextToSize(left, leftMaxWidth);
      ensureRoom(15);
      y += 3;
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      doc.text(leftLines[0], margin, y);
      if (date) {
        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        doc.text(date, pageWidth - margin, y, { align: "right" });
      }
      y += 13.5;
      leftLines.slice(1).forEach((l) => {
        ensureRoom(14);
        doc.setFont("times", "bold");
        doc.setFontSize(11);
        doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
        doc.text(l, margin, y);
        y += 13.5;
      });
      y += 2;
    }

    rawLines.forEach((line) => {
      const t = line.trim();
      if (t === "") {
        y += 8;
        return;
      }
      contentLineNumber++;

      // First non-empty line: only render it as the big bold centered "name" header if it
      // actually looks like a name (short, no sentence punctuation) — text extraction from a
      // PDF doesn't always preserve reading order (columns, headers, unusual layouts can shuffle
      // lines), so this can't be assumed. Getting it wrong used to blow a random long line up to
      // 19pt centered with no wrapping, running it straight off the page — this both guards
      // against that misfire and, just in case, always wraps rather than drawing one raw line.
      if (contentLineNumber === 1 && looksLikeName(t)) {
        doc.setFont("times", "bold");
        doc.setFontSize(19);
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        const nameLines = doc.splitTextToSize(t, maxWidth);
        nameLines.forEach((l) => {
          ensureRoom(24);
          doc.text(l, pageWidth / 2, y, { align: "center" });
          y += 22;
        });
        nameRendered = true;
        return;
      }

      // Second non-empty line, immediately after a real rendered name — treat as the
      // contact/subtitle line. Skipped entirely if the first line didn't look like a name, so a
      // wrong guess there doesn't cascade into centering body text that was never meant to be one.
      if (contentLineNumber === 2 && nameRendered) {
        doc.setFont("times", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        const clines = doc.splitTextToSize(t, maxWidth);
        clines.forEach((l) => {
          ensureRoom(14);
          doc.text(l, pageWidth / 2, y, { align: "center" });
          y += 13;
        });
        y += 5;
        return;
      }

      const isBullet = /^-\s+/.test(t);

      if (!isBullet && isSectionHeader(t)) {
        doc.setFont("times", "bold");
        doc.setFontSize(12.5);
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        ensureRoom(22);
        y += 6;
        doc.text(t, margin, y);
        doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.setLineWidth(0.75);
        doc.line(margin, y + 3, pageWidth - margin, y + 3);
        y += 16;
        return;
      }

      if (!isBullet) {
        const job = looksLikeSubHeader(t) ? parseJobHeader(t) : null;
        if (job) {
          renderJobHeader(job.title, job.company, job.date);
          return;
        }
      }

      const content = isBullet ? t.replace(/^-\s+/, "") : t;
      const indent = isBullet ? 14 : 0;
      const isSubHeader = !isBullet && looksLikeSubHeader(content);
      doc.setFont("times", isSubHeader ? "bold" : "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      if (isSubHeader) {
        y += 4;
        ensureRoom(14);
      }
      const lines = doc.splitTextToSize(content, maxWidth - indent);
      lines.forEach((l, i) => {
        ensureRoom(14);
        if (isBullet && i === 0) doc.text("•", margin, y);
        doc.text(l, margin + indent, y);
        y += 13.5;
      });
      y += isBullet ? 2 : 5;
    });

    doc.save(sanitizeFilename(filename));
  }

  // Downloads a saved resume record as a PDF named after, and tailored to, a specific job —
  // shared by Compare & Analyze's "Download Resume (PDF)" button and the Dashboard's application
  // detail modal, so both get identical behavior instead of two copies of this logic drifting
  // apart.
  //
  // When a role is known, this always rebuilds the resume from its extracted text (via
  // downloadTextAsPdf + injectTargetTitle above) rather than downloading the original file
  // unmodified — an existing PDF's bytes can't be edited in place, so showing the target job
  // title in the resume's own header means trading pixel-exact original formatting for an
  // editable, cleanly re-rendered version. Falls back to the original uploaded PDF (fetched as a
  // blob so it can be renamed on download) only when there's no role to tailor to, or no stored
  // text at all to rebuild from.
  //
  // `resume` is a resume record from Storage.resumes (needs .label, .rawText, and optionally
  // .pdfUrl). `titleParts` is an array of strings (e.g. [role, company]) — the first element
  // doubles as the target job title to inject; all elements are joined into the filename.
  async function downloadResumeAsPdf(resume, titleParts) {
    if (!resume) throw new Error("That resume couldn't be found.");
    const parts = [resume.label || "Resume"].concat((titleParts || []).filter(Boolean));
    const filename = sanitizeFilename(parts.join(" - ")) + ".pdf";
    const role = (titleParts || [])[0] || "";

    if (role && resume.rawText) {
      downloadTextAsPdf(injectTargetTitle(resume.rawText, role), filename);
      return;
    }

    if (resume.pdfUrl) {
      try {
        const res = await fetch(resume.pdfUrl);
        if (res.ok) {
          const blob = await res.blob();
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          link.click();
          URL.revokeObjectURL(link.href);
          return;
        }
      } catch (e) {
        // Fetching the original failed (CORS/network) — fall through to the text-reflow version below.
      }
    }
    if (!resume.rawText) throw new Error("No stored file or extracted text for this resume.");
    downloadTextAsPdf(resume.rawText, filename);
  }

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.PdfExport = { downloadTextAsPdf, sanitizeText, downloadResumeAsPdf };
})(window);
