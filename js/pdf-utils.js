/* gapNinja — client-side PDF text extraction using pdf.js (loaded from CDN in index.html) */
(function (global) {
  function ensureWorker() {
    if (global.pdfjsLib && !global.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      global.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  }

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
      const pageText = content.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n\n";
    }
    return fullText.trim();
  }

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.PdfUtils = { extractTextFromPdf };
})(window);
