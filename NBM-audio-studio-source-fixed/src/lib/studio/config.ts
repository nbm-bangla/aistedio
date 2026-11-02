import type { VoiceId } from "./types";

// Public, non-secret presentation configuration. Production provider configuration
// and GEMINI_API_KEY must live exclusively in the future Spring Boot backend.
export const STUDIO_CONFIG = {
  mode: "production-ready" as const,
  provider: "Google Gemini" as const,
  intendedProvider: "Google Gemini",
  ttsModel: "gemini-3.8-flash-tts",
  translationModel: "gemini-3.5-flash-lite",
  targetLanguage: "bn",
  maxSegmentCharacters: 1800,
  maxImportBytes: 200 * 1024 * 1024,
  maxDocumentCharacters: 25_000_000,
  speechDocumentation: "https://ai.google.dev/gemini-api/docs/speech-generation?hl=en",
  pricingDocumentation: "https://ai.google.dev/gemini-api/docs/pricing?hl=en",
  audioFixture: {
    mp3: "/audio/bengali-narration-demo.mp3",
    wav: "/audio/bengali-narration-demo.wav",
    duration: 26,
  },
};

export interface VoiceCandidate {
  id: VoiceId;
  description: string;
  officialDescription: string;
  color: string;
  catalogListed: boolean;
  bengaliQualityVerified: boolean;
}

// These IDs are listed in Google's prebuilt voice catalog. Catalog presence is
// NOT a guarantee of Bengali quality, project access, or model compatibility.
export const VOICE_CANDIDATES: VoiceCandidate[] = [
  { id: "Puck", description: "প্রাণবন্ত", officialDescription: "Upbeat", color: "#a6b09e", catalogListed: true, bengaliQualityVerified: false },
  { id: "Kore", description: "দৃঢ় ও স্পষ্ট", officialDescription: "Firm", color: "#c4a184", catalogListed: true, bengaliQualityVerified: false },
  { id: "Zephyr", description: "উজ্জ্বল", officialDescription: "Bright", color: "#a3b0bf", catalogListed: true, bengaliQualityVerified: false },
  { id: "Charon", description: "তথ্যনির্ভর", officialDescription: "Informative", color: "#b2a1b6", catalogListed: true, bengaliQualityVerified: false },
  { id: "Fenrir", description: "উচ্ছ্বসিত", officialDescription: "Excitable", color: "#c4b284", catalogListed: true, bengaliQualityVerified: false },
];
