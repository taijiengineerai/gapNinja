/* gapNinja — client-side PDF text extraction using pdf.js (loaded from CDN in index.html) */
(function (global) {
  function ensureWorker() {
    if (global.pdfjsLib && !global.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      global.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  }

  // pdf.js hands back a flat list of text fragments with no notion of "line" — joining them
  // with a single space (the old behavior) collapses an entire page into one run-on paragraph,
  // which loses section headers, bullets, and job-title lines entirely. This groups fragments
  // into lines by their vertical position (item.transform[5] is each fragment's y-coordinate;
  // fragments within ~2pt of each other are treated as the same visual line) so the extracted
  // text keeps its real line breaks, the way it looks in the actual PDF.
  async function extractTextFromPdf(file) {
    if (!global.pdfjsLib) {
      throw new Error("PDF engine failed to load. Check your internet connection and reload the page.");
    }
    ensureWorker();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = global.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const lines = [];
      let currentLine = [];
      let currentY = null;
      content.items.forEach((item) => {
        if (!item.str) return;
        const y = item.transform[5];
        if (currentY !== null && Math.abs(y - currentY) > 2) {
          lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
          currentLine = [];
        }
        currentLine.push(item.str);
        currentY = y;
      });
      if (currentLine.length) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
      fullText += lines.filter(Boolean).join("\n") + "\n\n";
    }
    return fullText.trim();
  }

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.PdfUtils = { extractTextFromPdf };
})(window);
