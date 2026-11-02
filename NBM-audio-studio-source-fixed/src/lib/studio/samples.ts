import type { StudioDocument, StudioStore, TranslationSegment } from "./types";

export const BENGALI_PARAGRAPHS = [
  "আজ সকালে জানালা খুলতেই এক টুকরো রোদ এসে পড়ল টেবিলের ওপর। দূরে কোথাও একটি পাখি ডাকছিল। অনেক দিন পর মনে হলো, পৃথিবীটা এখনও কত সুন্দর।",
  "পুরোনো বইয়ের পাতায় হাত বুলিয়ে সে ভাবল, প্রতিটি গল্পেরই তো একটি নিজস্ব কণ্ঠ আছে। শুধু মন দিয়ে শুনতে জানতে হয়।",
  "এভাবেই শুরু হোক একটি নতুন গল্প। শব্দগুলো পাতা পেরিয়ে পৌঁছে যাক মনের গভীরে।",
];

export const ENGLISH_PARAGRAPHS = [
  "This morning, a little sunlight fell on the table as soon as I opened the window. Somewhere in the distance, a bird was singing. For the first time in a long while, I felt how beautiful the world still was.",
  "Running a hand over the pages of an old book, she thought: every story has a voice of its own. We only need to know how to listen.",
  "Let a new story begin this way. Let the words reach beyond the page, into the depths of the heart.",
];

export const URDU_PARAGRAPHS = [
  "آج صبح کھڑکی کھولتے ہی دھوپ کا ایک ٹکڑا میز پر آ گرا۔ دور کہیں ایک پرندہ گا رہا تھا۔ بہت دنوں بعد محسوس ہوا کہ دنیا اب بھی کتنی خوبصورت ہے۔",
  "پرانی کتاب کے صفحات پر ہاتھ پھیرتے ہوئے اس نے سوچا، ہر کہانی کی اپنی ایک آواز ہوتی ہے۔ ہمیں بس دل سے سننا آنا چاہیے۔",
  "اسی طرح ایک نئی کہانی شروع ہو۔ لفظ صفحوں سے آگے بڑھ کر دل کی گہرائیوں تک پہنچ جائیں۔",
];

export const SAMPLE_BENGALI = BENGALI_PARAGRAPHS.join("\n\n");
export const SAMPLE_ENGLISH = ENGLISH_PARAGRAPHS.join("\n\n");
export const SAMPLE_URDU = URDU_PARAGRAPHS.join("\n\n");

export function createSegments(source: string, maxLength = 2200): TranslationSegment[] {
  const parts = source.split(/(\n\s*\n)/);
  const segments: TranslationSegment[] = [];
  let leadingWhitespace = "";
  for (let index = 0; index < parts.length; index += 2) {
    let paragraph = parts[index];
    const separator = parts[index + 1] ?? "";
    if (!paragraph) {
      if (segments.length) segments[segments.length - 1].separator += separator;
      else leadingWhitespace += separator;
      continue;
    }
    paragraph = leadingWhitespace + paragraph;
    leadingWhitespace = "";
    let offset = 0;
    while (offset < paragraph.length) {
      let end = Math.min(offset + maxLength, paragraph.length);
      if (end < paragraph.length) {
        const window = paragraph.slice(offset, end);
        const sentenceBreaks = [...window.matchAll(/(?:[।!?؟.!…]["'”’»)]*)\s+/gu)];
        const sentenceBreak = sentenceBreaks.at(-1)?.index;
        const wordBreak = paragraph.lastIndexOf(" ", end);
        if (sentenceBreak !== undefined && sentenceBreak > maxLength / 2) end = offset + sentenceBreak + sentenceBreaks.at(-1)![0].trimEnd().length;
        else if (wordBreak > offset + maxLength / 2) end = wordBreak + 1;
      }
      segments.push({
        id: `segment-${segments.length + 1}`,
        order: segments.length,
        source: paragraph.slice(offset, end),
        separator: end === paragraph.length ? separator : "",
        translation: "",
        status: "pending",
      });
      offset = end;
    }
  }
  for (let offset = 0; offset < leadingWhitespace.length; offset += maxLength) {
    segments.push({ id: `segment-${segments.length + 1}`, order: segments.length, source: leadingWhitespace.slice(offset, offset + maxLength), separator: "", translation: "", status: "pending" });
  }
  return segments;
}

export function createDocument(kind: "audio" | "translation", title: string, useSample = false): StudioDocument {
  const now = new Date().toISOString();
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `work-${Date.now()}`,
    title: title.trim() || "শিরোনামহীন লেখা",
    kind,
    sourceLanguage: kind === "audio" ? "bn" : "en",
    sourceText: kind === "translation" && useSample ? SAMPLE_ENGLISH : "",
    sourceSnapshot: null,
    text: kind === "audio" && useSample ? SAMPLE_BENGALI : "",
    voiceId: "Kore",
    speed: 1,
    segments: [],
    translationStatus: "idle",
    translationApproved: false,
    audioStatus: "idle",
    audio: null,
    audioSegments: [],
    createdAt: now,
    updatedAt: now,
    isExample: useSample,
  };
}

export function initialStore(): StudioStore {
  const base: StudioDocument = {
    id: "example-bengali",
    title: "একটি নতুন সকাল",
    kind: "audio",
    sourceLanguage: "bn",
    sourceText: "",
    sourceSnapshot: null,
    text: SAMPLE_BENGALI,
    voiceId: "Kore",
    speed: 1,
    segments: [],
    translationStatus: "idle",
    translationApproved: false,
    audioStatus: "idle",
    audio: null,
    audioSegments: [],
    createdAt: "2026-10-30T09:00:00.000Z",
    updatedAt: "2026-10-30T09:00:00.000Z",
    isExample: true,
  };
  return {
    version: 1,
    documents: [
      base,
      { ...base, id: "example-english", title: "শব্দের ওপারে", kind: "translation", sourceLanguage: "en", sourceText: SAMPLE_ENGLISH, text: "", updatedAt: "2026-10-29T09:00:00.000Z" },
      { ...base, id: "example-urdu", title: "আলোর খোঁজে", kind: "translation", sourceLanguage: "ur", sourceText: SAMPLE_URDU, sourceSnapshot: null, text: "", translationStatus: "idle", translationApproved: false, segments: [], updatedAt: "2026-10-28T09:00:00.000Z" },
    ],
    activeAudioId: "example-bengali",
    activeTranslationId: "example-english",
  };
}

export function mockTranslation(source: string, language: "en" | "ur"): string | null {
  const candidates = language === "ur" ? URDU_PARAGRAPHS : ENGLISH_PARAGRAPHS;
  const index = candidates.findIndex((paragraph) => paragraph.trim() === source.trim());
  if (index !== -1) return BENGALI_PARAGRAPHS[index];
  const phrases: Record<string, string> = language === "en"
    ? { "Hello.": "হ্যালো।", "Hello": "হ্যালো", "How are you?": "আপনি কেমন আছেন?", "Thank you.": "ধন্যবাদ।", "Good morning.": "সুপ্রভাত।" }
    : { "السلام علیکم": "আসসালামু আলাইকুম", "آپ کیسے ہیں؟": "আপনি কেমন আছেন?", "شکریہ": "ধন্যবাদ" };
  return phrases[source.trim()] ?? null;
}
