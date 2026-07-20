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
    let firstContentLine = true;

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

    rawLines.forEach((line, idx) => {
      const t = line.trim();
      if (t === "") {
        y += 8;
        return;
      }

      // First non-empty line = name.
      if (firstContentLine) {
        doc.setFont("times", "bold");
        doc.setFontSize(19);
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        ensureRoom(24);
        doc.text(t, pageWidth / 2, y, { align: "center" });
        y += 22;
        firstContentLine = false;
        return;
      }

      // Second line = contact/subtitle line right under the name.
      if (idx === 1) {
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

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.PdfExport = { downloadTextAsPdf, sanitizeText };
})(window);
