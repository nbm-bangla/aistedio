import { STUDIO_CONFIG } from "./config";

export interface ImportedDocument {
  text: string;
  name: string;
  pages?: number;
  pageBreakOffsets?: number[];
  ocrPages?: number[];
}
type OcrWorker = { recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>; terminate(): Promise<unknown> };

export async function importDocument(file: File, allowPdf: boolean, onProgress?: (current: number, total: number) => void, ocrLanguage: "ben" | "eng" | "urd" = "ben"): Promise<ImportedDocument> {
  if (file.size > STUDIO_CONFIG.maxImportBytes) throw new Error("এই ইনস্টলেশনে সর্বোচ্চ ২০০ MB ফাইল যোগ করা যাবে।");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt") {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    if (!text.trim()) throw new Error("ফাইলটিতে কোনো লেখা নেই। অন্য একটি TXT ফাইল বেছে নিন।");
    if (text.length > STUDIO_CONFIG.maxDocumentCharacters) throw new Error("এই ইনস্টলেশনে সর্বোচ্চ ২ কোটি ৫০ লক্ষ অক্ষর রাখা যাবে। বড় নথি ছোট অংশে ভাগ করুন।");
    return { text, name: file.name };
  }
  if (extension !== "pdf" || !allowPdf) throw new Error(allowPdf ? "অনুগ্রহ করে একটি PDF অথবা UTF-8 TXT ফাইল বেছে নিন।" : "অনুগ্রহ করে একটি UTF-8 TXT ফাইল বেছে নিন।");

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    useSystemFonts: true,
  });
  let ocrWorker: OcrWorker | null = null;
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    let size = 0;
    const ocrPages: number[] = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let text = content.items.filter((item) => "str" in item).map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
      if (!text) {
        try {
          ocrPages.push(i);
          if (!ocrWorker) { const tesseract = await import("tesseract.js"); ocrWorker = await tesseract.createWorker(ocrLanguage); }
          const viewport = page.getViewport({ scale: 1.7 });
          const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("OCR canvas could not be created.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const recognized = await ocrWorker.recognize(canvas);
          text = recognized.data.text.trim();
          canvas.width = 0; canvas.height = 0;
        } catch (error) {
          throw new Error(`পৃষ্ঠা ${i} থেকে লেখা পড়া যায়নি। OCR ব্যর্থ হয়েছে: ${error instanceof Error ? error.message : "অজানা ত্রুটি"}। কোনো পৃষ্ঠা বাদ দিয়ে ফাইল যোগ করা হয়নি।`);
        }
      }
      if (!text) throw new Error(`পৃষ্ঠা ${i} থেকে লেখা পাওয়া যায়নি। OCR-এও পাঠ শনাক্ত হয়নি; কোনো পৃষ্ঠা বাদ দিয়ে ফাইল যোগ করা হয়নি।`);
      size += text.length;
      if (size > STUDIO_CONFIG.maxDocumentCharacters) throw new Error("এই PDF-টি ২ কোটি ৫০ লক্ষ অক্ষরের সীমা ছাড়িয়েছে। ছোট অংশে ভাগ করুন।");
      pages.push(text);
      onProgress?.(i, pdf.numPages);
      page.cleanup();
    }
    const pageBreakOffsets: number[] = [];
    let offset = 0;
    pages.forEach((page, index) => { offset += page.length; if (index < pages.length - 1) { pageBreakOffsets.push(offset); offset += 2; } });
    return { text: pages.join("\n\n"), name: file.name, pages: pdf.numPages, pageBreakOffsets, ocrPages };
  } catch (error) {
    if (error instanceof Error && /OCR|সীমা/.test(error.message)) throw error;
    throw new Error("PDF পড়া যায়নি। পাসওয়ার্ডমুক্ত, লেখা নির্বাচন করা যায় এমন PDF অথবা TXT ফাইল ব্যবহার করুন।");
  } finally {
    await task.destroy();
    await ocrWorker?.terminate();
  }
}
