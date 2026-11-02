import type { AudioAsset, SourceLanguage, SpeechProvider, SpeechSpeed, TranslationProvider, VoiceId } from "./types";

export class StudioServiceError extends Error {
  constructor(message: string, public code = "UNKNOWN") { super(message); this.name = "StudioServiceError"; }
}

export function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function process(body: Record<string, unknown>, signal?: AbortSignal) {
  let provider429Count = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetch("/api/studio/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal, cache: "no-store" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new StudioServiceError("সংযোগ করা যায়নি। সম্পূর্ণ হওয়া অংশ সংরক্ষিত আছে; আবার চালু করতে আপনার স্পষ্ট পদক্ষেপ দরকার।", "NETWORK");
    }
    const data = await response.json();
    if (response.ok) return data;
    if (data.retryableSafetyDelay === true) {
      await wait(Math.max(1, Number(data.retryAfterSeconds) || 1) * 1000, signal);
      continue;
    }
    if (data.retryableProviderRateLimit === true) {
      const exponentialDelay = Math.min(300, 10 * (2 ** Math.min(provider429Count, 5)));
      const delaySeconds = Math.max(exponentialDelay, Number(data.retryAfterSeconds) || 0);
      provider429Count += 1;
      await wait(delaySeconds * 1000, signal);
      continue;
    }
    throw new StudioServiceError(data.error ?? "অনুরোধটি সম্পন্ন হয়নি।", String(response.status));
  }
}

export const translationService: TranslationProvider = {
  async translateSegment(source: string, language: Exclude<SourceLanguage, "bn">, signal?: AbortSignal) {
    const data = await process({ service: "translation", text: source, language }, signal);
    if (typeof data.translation !== "string") throw new StudioServiceError("Provider returned no translation.");
    return data.translation;
  },
};

const speechCache = new Map<string, AudioAsset>();
export const speechService: SpeechProvider = {
  async generate(text: string, voiceId: VoiceId, speed: SpeechSpeed, signal?: AbortSignal, approval?: { documentId: string; signature: string; approvedText: string }) {
    const key = `${voiceId}:${speed}:${text}`;
    const cached = speechCache.get(key);
    if (cached) return cached;
    const data = await process({ service: "tts", text, voice: voiceId, speed, ...(approval ? { translationWorkflow: true, documentId: approval.documentId, approvalText: approval.approvedText, approvalSignature: approval.signature } : {}) }, signal);
    const asset: AudioAsset = {
      id: String(data.audioId), audioId: String(data.audioId), cacheKey: String(data.cacheKey),
      url: String(data.audioUrl), wavUrl: String(data.audioUrl), duration: 0,
      textSnapshot: text, voiceId, speed, createdAt: new Date().toISOString(), isDemo: false,
    };
    speechCache.set(key, asset);
    return asset;
  },
};
