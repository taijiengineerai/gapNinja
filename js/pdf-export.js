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

  // Downloads a saved resume record as a PDF named after a specific job — shared by Compare &
  // Analyze's "Download Resume (PDF)" button and the Dashboard's application detail modal, so
  // both get identical behavior instead of two copies of this logic drifting apart.
  //
  // Prefers the original uploaded PDF (fetched as a blob and re-triggered with a custom
  // filename — the browser's native `download` attribute doesn't reliably rename cross-origin
  // files, which is why this fetches the bytes itself instead of just linking to resume.pdfUrl)
  // so your actual formatting is preserved. Falls back to downloadTextAsPdf() above (a plain-text
  // reflow) if there's no stored original or the fetch fails — e.g. Cloud Storage CORS isn't
  // configured for this account. Either path always ends in a correctly-named download.
  //
  // `resume` is a resume record from Storage.resumes (needs .label, .rawText, and optionally
  // .pdfUrl). `titleParts` is an array of strings (e.g. [role, company]) joined into the filename.
  async function downloadResumeAsPdf(resume, titleParts) {
    if (!resume) throw new Error("That resume couldn't be found.");
    const parts = [resume.label || "Resume"].concat((titleParts || []).filter(Boolean));
    const filename = sanitizeFilename(parts.join(" - ")) + ".pdf";

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
