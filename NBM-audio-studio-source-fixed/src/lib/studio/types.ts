export type View = "audio" | "translation" | "works";
export type DocumentKind = "audio" | "translation";
export type SourceLanguage = "bn" | "en" | "ur";
export type VoiceId = "Puck" | "Kore" | "Zephyr" | "Charon" | "Fenrir";
export type SpeechSpeed = 0.8 | 1 | 1.25;
export type TranslationStatus = "idle" | "processing" | "paused" | "complete" | "failed";

export interface TranslationSegment {
  id: string;
  order: number;
  source: string;
  separator: string;
  translation: string;
  status: "pending" | "complete" | "failed";
  error?: string;
}

export interface AudioAsset {
  id: string;
  cacheKey: string;
  url: string;
  wavUrl: string;
  duration: number;
  textSnapshot: string;
  voiceId: VoiceId;
  speed: SpeechSpeed;
  createdAt: string;
  audioId: string;
  isDemo: false;
}

export interface AudioSegment {
  id: string;
  order: number;
  text: string;
  separator: string;
  audioId?: string;
  wavUrl?: string;
  status: "pending" | "complete" | "failed";
  error?: string;
}

export interface StudioDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  sourceLanguage: SourceLanguage;
  sourceText: string;
  sourceSnapshot: string | null;
  text: string;
  voiceId: VoiceId;
  speed: SpeechSpeed;
  segments: TranslationSegment[];
  translationStatus: TranslationStatus;
  translationEdited?: boolean;
  translationApproved: boolean;
  translationApprovalProof?: string;
  audioStatus: "idle" | "generating" | "ready" | "failed";
  audio: AudioAsset | null;
  audioSegments: AudioSegment[];
  createdAt: string;
  updatedAt: string;
  isExample: boolean;
  importName?: string;
  pageCount?: number;
  pageBreakOffsets?: number[];
}

export interface StudioStore {
  version: 1;
  documents: StudioDocument[];
  activeAudioId: string;
  activeTranslationId: string;
}

export interface TranslationProvider {
  translateSegment(source: string, language: "en" | "ur", signal?: AbortSignal): Promise<string>;
}

export interface SpeechProvider {
  generate(text: string, voiceId: VoiceId, speed: SpeechSpeed, signal?: AbortSignal, approval?: { documentId: string; signature: string; approvedText: string }): Promise<AudioAsset>;
}
