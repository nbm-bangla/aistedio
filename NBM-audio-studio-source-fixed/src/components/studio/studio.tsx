"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, AudioLines, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, FileText, FolderOpen, Headphones, Info, KeyRound, Languages, LoaderCircle, Plus, ShieldCheck, X } from "lucide-react";
import { STUDIO_CONFIG, VOICE_CANDIDATES } from "@/lib/studio/config";
import { bn } from "@/lib/studio/format";
import { estimateTtsCost, estimateTranslationCost } from "@/lib/studio/estimate";
import { importDocument } from "@/lib/studio/imports";
import { createDocument, createSegments, initialStore, SAMPLE_BENGALI, SAMPLE_ENGLISH, SAMPLE_URDU } from "@/lib/studio/samples";
import { loadStore, saveStore } from "@/lib/studio/storage";
import { speechService, translationService, wait } from "@/lib/studio/service";
import type { AudioSegment, DocumentKind, StudioDocument, StudioStore, View, VoiceId } from "@/lib/studio/types";
import { AudioPlayer } from "./audio-player";
import { GeminiMark, HeroWave, StudioBrand } from "./brand";
import { Dialog } from "./dialog";
import { BengaliEditor, TranslationEditor } from "./editor";
import { SavedWork } from "./saved-work";
import { VoicePanel } from "./voice-panel";
import { ApiManager } from "./api-manager";

type Modal = { type: "new" } | { type: "guide" } | { type: "api-manager" } | { type: "voice"; voiceId?: VoiceId } | { type: "attribution" } | { type: "confirm"; title: string; description: string; label: string; danger?: boolean; action: () => void } | null;

const NAVIGATION = [
  { id: "audio" as const, label: "বাংলা অডিও", icon: Headphones },
  { id: "translation" as const, label: "অনুবাদ ও অডিও", icon: Languages },
  { id: "works" as const, label: "আমার কাজ", icon: FolderOpen },
];

export default function Studio() {
  const [store, setStore] = useState<StudioStore>(initialStore);
  const [view, setView] = useState<View>("audio");
  const [hydrated, setHydrated] = useState(false);
  const [persistence, setPersistence] = useState(true);
  const [processingLimits, setProcessingLimits] = useState({ maxChunkCharacters: STUDIO_CONFIG.maxSegmentCharacters, minDelaySeconds: 60, translationModel: "", ttsModel: "" });
  const [apiStatus, setApiStatus] = useState({ translation: false, tts: false });
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<DocumentKind>("audio");
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState<{ id: string; message: string } | null>(null);
  const storeRef = useRef(store);
  const fileInput = useRef<HTMLInputElement>(null);
  const importTarget = useRef<string>("");
  const translationJobs = useRef(new Map<string, AbortController>());
  const audioJobs = useRef(new Map<string, AbortController>());

  useEffect(() => { storeRef.current = store; }, [store]);
  const notify = useCallback((message: string) => setToast({ message, id: Date.now() }), []);

  const refreshSafetyLimits = useCallback(async () => {
    try {
      const [safeResponse, healthResponse] = await Promise.all([fetch("/api/studio/safety", { cache: "no-store" }), fetch("/api/health", { cache: "no-store" })]);
      const data = await safeResponse.json(); const health = await healthResponse.json();
      if (safeResponse.ok && data.limits) setProcessingLimits({ maxChunkCharacters: Number(data.limits.maxChunkCharacters) || 1800, minDelaySeconds: Number(data.limits.minDelaySeconds) || 60, translationModel: data.models?.translation ?? "", ttsModel: data.models?.tts ?? "" });
      setApiStatus({ translation: Boolean(health.translationConnected), tts: Boolean(health.ttsConnected) });
    } catch { /* The API route enforces limits even if the UI cannot read them. */ }
  }, []);

  const selectView = useCallback((next: View, changeHash = true) => {
    setView(next);
    if (changeHash && window.location.hash !== `#${next}`) window.location.hash = next;
    if (next !== "works") {
      setStore((previous) => {
        const key = next === "audio" ? "activeAudioId" : "activeTranslationId";
        const existing = previous.documents.find((doc) => doc.id === previous[key] && doc.kind === next) ?? previous.documents.find((doc) => doc.kind === next);
        if (existing) return previous[key] === existing.id ? previous : { ...previous, [key]: existing.id };
        const doc = createDocument(next, "শিরোনামহীন লেখা");
        return { ...previous, documents: [doc, ...previous.documents], [key]: doc.id };
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshSafetyLimits(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshSafetyLimits]);

  useEffect(() => {
    let cancelled = false;
    const readHash = () => {
      const hash = window.location.hash.slice(1);
      selectView(hash === "translation" || hash === "works" ? hash : "audio", false);
    };
    void loadStore().then((saved) => {
      if (cancelled) return;
      setStore(saved);
      readHash();
      setHydrated(true);
    }).catch(() => {
      if (cancelled) return;
      setPersistence(false); setSaveState("error");
      notify("আগের সংরক্ষিত ডেটা পড়া যায়নি। এই সেশনের কাজ আলাদা রাখা হচ্ছে; পুরোনো ডেটা বদলানো হয়নি।");
      readHash(); setHydrated(true);
    });
    window.addEventListener("hashchange", readHash);
    const translations = translationJobs.current;
    const audios = audioJobs.current;
    return () => {
      window.removeEventListener("hashchange", readHash);
      cancelled = true;
      translations.forEach((controller) => controller.abort());
      audios.forEach((controller) => controller.abort());
    };
  }, [notify, selectView]);

  useEffect(() => {
    if (!hydrated || !persistence) return;
    const timeout = setTimeout(() => {
      setSaveState("saving");
      void saveStore(store).then(() => setSaveState("saved")).catch(() => { setSaveState("error"); setPersistence(false); notify("ব্রাউজারের IndexedDB ও localStorage-এ সংরক্ষণ করা যায়নি। কাজটি এই সেশনে আছে।"); });
    }, 500);
    return () => clearTimeout(timeout);
  }, [store, hydrated, persistence, notify]);

  useEffect(() => {
    if (!hydrated || !persistence) return;
    const flush = () => {
      void saveStore(storeRef.current).catch(() => { /* The regular autosave reports storage failures. */ });
    };
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [hydrated, persistence]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const persistNow = useCallback(async (showNotice = true) => {
    try {
      await saveStore(storeRef.current);
      setPersistence(true); setSaveState("saved");
      if (showNotice) notify("আপনার কাজ এই ব্রাউজারে সংরক্ষিত হয়েছে।");
      return true;
    } catch {
      setSaveState("error"); setPersistence(false);
      notify("কাজ সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ খালি করে আবার চেষ্টা করুন।");
      return false;
    }
  }, [notify]);

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void persistNow(); }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  }, [persistNow]);

  const updateDocument = useCallback((id: string, patch: Partial<StudioDocument>) => {
    setStore((previous) => ({ ...previous, documents: previous.documents.map((doc) => doc.id === id ? { ...doc, ...patch, updatedAt: new Date().toISOString() } : doc) }));
  }, []);

  const current = view === "translation"
    ? store.documents.find((doc) => doc.id === store.activeTranslationId && doc.kind === "translation") ?? store.documents.find((doc) => doc.kind === "translation")
    : store.documents.find((doc) => doc.id === store.activeAudioId && doc.kind === "audio") ?? store.documents.find((doc) => doc.kind === "audio");

  function patchCurrent(patch: Partial<StudioDocument>) {
    if (!current) return;
    const invalidatesAudio = (patch.text !== undefined && patch.text !== current.text) || (patch.voiceId !== undefined && patch.voiceId !== current.voiceId);
    const changesSource = patch.sourceText !== undefined && patch.sourceText !== current.sourceText;
    updateDocument(current.id, {
      ...patch,
      ...(invalidatesAudio ? { audio: null, audioSegments: [], audioStatus: "idle" as const, ...(current.kind === "translation" ? { translationApproved: false, translationApprovalProof: undefined } : {}) } : {}),
      ...(changesSource && !current.sourceSnapshot ? { segments: [], translationStatus: "idle" as const, text: "", audio: null, audioSegments: [], audioStatus: "idle" as const, translationEdited: false, translationApproved: false, translationApprovalProof: undefined } : {}),
    });
  }

  function openDocument(doc: StudioDocument) {
    setStore((previous) => ({ ...previous, [doc.kind === "audio" ? "activeAudioId" : "activeTranslationId"]: doc.id }));
    selectView(doc.kind);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function insertDocument(doc: StudioDocument) {
    setStore((previous) => ({ ...previous, documents: [doc, ...previous.documents], [doc.kind === "audio" ? "activeAudioId" : "activeTranslationId"]: doc.id }));
    selectView(doc.kind);
  }

  function openNew() {
    setNewTitle(""); setNewKind(view === "translation" ? "translation" : "audio"); setModal({ type: "new" });
  }

  function submitNew(event: FormEvent) {
    event.preventDefault();
    insertDocument(createDocument(newKind, newTitle));
    setModal(null); notify("নতুন কাজ তৈরি হয়েছে। আপনার লেখা যোগ করুন।");
  }

  function requestSample() {
    if (!current) return;
    const doc = current;
    const apply = () => {
      if (doc.kind === "translation" && doc.sourceSnapshot !== null) {
        const next = createDocument("translation", "একটি নতুন সকাল — নমুনা", true);
        if (doc.sourceLanguage === "ur") { next.sourceLanguage = "ur"; next.sourceText = SAMPLE_URDU; }
        insertDocument(next);
      } else updateDocument(doc.id, { text: doc.kind === "audio" ? SAMPLE_BENGALI : "", sourceText: doc.kind === "translation" ? doc.sourceLanguage === "ur" ? SAMPLE_URDU : SAMPLE_ENGLISH : "", sourceSnapshot: null, segments: [], translationStatus: "idle", translationEdited: false, audio: null, audioStatus: "idle", isExample: true, importName: undefined });
      notify("নমুনা লেখা যোগ হয়েছে। এবার প্রকৃত Gemini অনুবাদ বা TTS সংযোগ পরীক্ষা করতে পারেন।");
    };
    if ((!doc.isExample && (doc.text.trim() || doc.sourceText.trim())) || doc.sourceSnapshot !== null) setModal({ type: "confirm", title: "নমুনা লেখা দিয়ে শুরু করবেন?", description: doc.sourceSnapshot !== null ? "আপনার মূল উৎস অক্ষত থাকবে। নমুনা লেখার জন্য একটি নতুন কাজ তৈরি হবে।" : "বর্তমান এডিটরের লেখা নমুনা দিয়ে বদলে যাবে। দরকারি লেখা আগে কপি করে রাখুন।", label: "নমুনা যোগ করুন", action: apply });
    else apply();
  }

  function requestClear() {
    if (!current) return;
    const doc = current;
    setModal({ type: "confirm", title: doc.sourceSnapshot !== null ? "নতুন খসড়ায় শুরু করবেন?" : "এডিটরের লেখা মুছবেন?", description: doc.sourceSnapshot !== null ? "এই কাজের মূল লেখা ও অনুবাদ অক্ষত থাকবে। আপনার জন্য একটি নতুন খালি কাজ তৈরি হবে।" : "এই কাজের লেখা ও অডিও প্রিভিউ মুছে যাবে। এটি ফিরিয়ে আনা যাবে না।", label: doc.sourceSnapshot !== null ? "নতুন খসড়া খুলুন" : "লেখা মুছুন", danger: doc.sourceSnapshot === null, action: () => {
      if (doc.sourceSnapshot !== null) insertDocument(createDocument(doc.kind, `${doc.title} — নতুন খসড়া`));
      else updateDocument(doc.id, { text: "", sourceText: "", sourceSnapshot: null, segments: [], translationStatus: "idle", translationEdited: false, audio: null, audioStatus: "idle", isExample: false, importName: undefined });
    } });
  }

  function resetSource() {
    if (!current) return;
    const doc = current;
    setModal({ type: "confirm", title: "মূল লেখা অক্ষত রেখে নতুন উৎস?", description: "বর্তমান উৎস ও অনুবাদ এই কাজেই সংরক্ষিত থাকবে। একই উৎসের একটি নতুন, সম্পাদনাযোগ্য খসড়া খুলবে।", label: "নতুন উৎসের খসড়া", action: () => {
      const copy = createDocument("translation", `${doc.title} — নতুন উৎস`);
      copy.sourceText = doc.sourceSnapshot ?? doc.sourceText; copy.sourceLanguage = doc.sourceLanguage;
      insertDocument(copy);
    } });
  }

  function changeLanguage(language: "en" | "ur") {
    if (!current || current.sourceSnapshot !== null) return;
    const doc = current;
    const apply = () => updateDocument(doc.id, { sourceLanguage: language, ...(doc.isExample || !doc.sourceText.trim() ? { sourceText: language === "ur" ? SAMPLE_URDU : SAMPLE_ENGLISH, isExample: true } : {}), text: "", segments: [], translationStatus: "idle", translationEdited: false, audio: null, audioStatus: "idle" });
    if (doc.text.trim()) setModal({ type: "confirm", title: "উৎসের ভাষা বদলাবেন?", description: "বর্তমান বাংলা খসড়া মুছে নতুন উৎসের জন্য অনুবাদ শুরু হবে। নিজের সম্পাদনা আগে কপি করে রাখুন।", label: "ভাষা বদলান", action: apply });
    else apply();
  }

  function chooseFile() {
    if (!current || (current.kind === "translation" && current.sourceSnapshot !== null)) return;
    importTarget.current = current.id;
    fileInput.current?.click();
  }

  async function readFile(file: File, id: string) {
    const doc = storeRef.current.documents.find((item) => item.id === id);
    if (!doc) return;
    setImporting({ id, message: "ফাইল পড়া হচ্ছে…" });
    try {
      const ocrLanguage = doc.kind === "audio" ? "ben" : doc.sourceLanguage === "ur" ? "urd" : "eng";
      const result = await importDocument(file, true, (page, total) => setImporting({ id, message: `পৃষ্ঠা ${bn(page)}/${bn(total)} পড়া হচ্ছে` }), ocrLanguage);
      updateDocument(id, {
        ...(doc.kind === "audio" ? { text: result.text } : { sourceText: result.text, text: "", sourceSnapshot: null, segments: [], translationStatus: "idle" as const, translationEdited: false }),
        ...(doc.isExample || doc.title === "শিরোনামহীন লেখা" ? { title: result.name.replace(/\.[^.]+$/, "") } : {}),
        importName: result.name, isExample: false, audio: null, audioStatus: "idle",
        audioSegments: [], pageCount: result.pages, pageBreakOffsets: result.pageBreakOffsets ?? [],
      });
      notify(result.pages ? `${bn(result.pages)} পৃষ্ঠার পাঠ যোগ হয়েছে${result.ocrPages?.length ? `; ${bn(result.ocrPages.length)}টি স্ক্যান পৃষ্ঠায় OCR চলেছে` : ""}। পৃষ্ঠা ও অধ্যায়ের ক্রম মিলিয়ে নিন।` : "TXT ফাইলের লেখা যোগ হয়েছে।");
    } catch (error) { notify(error instanceof Error ? error.message : "ফাইলটি পড়া যায়নি।"); }
    finally { setImporting(null); }
  }

  function receiveFile(file: File | undefined) {
    if (!file) return;
    const id = importTarget.current;
    const doc = storeRef.current.documents.find((item) => item.id === id);
    if (!doc || doc.sourceSnapshot !== null) return;
    const hasText = doc.kind === "audio" ? doc.text.trim() : doc.sourceText.trim();
    if (hasText && !doc.isExample) setModal({ type: "confirm", title: "ফাইলের লেখা দিয়ে বদলাবেন?", description: "এডিটরের বর্তমান লেখা বদলে নির্বাচিত ফাইলের লেখা বসবে। প্রয়োজন হলে আগের লেখাটি কপি করে রাখুন।", label: "ফাইলের লেখা যোগ করুন", action: () => { void readFile(file, id); } });
    else void readFile(file, id);
  }

  async function generateAudio() {
    if (!current) return;
    const doc = storeRef.current.documents.find((item) => item.id === current.id);
    if (!doc || !doc.text.trim() || audioJobs.current.has(doc.id)) return;
    if (doc.kind === "translation" && (!doc.translationApproved || !doc.translationApprovalProof)) { notify("অডিওর আগে বাংলা অনুবাদ পর্যালোচনা করে অনুমোদন দিন।"); return; }
    const chunks = createSegments(doc.text, processingLimits.maxChunkCharacters);
    const incomplete = chunks.filter((chunk) => !doc.audioSegments.some((saved) => saved.text === chunk.source + chunk.separator && saved.status === "complete")).length;
    if (incomplete === 0 && doc.audioSegments.length === chunks.length) { notify("এই লেখার সব অডিও অংশ ইতিমধ্যে প্রস্তুত আছে।"); return; }
    if (chunks.length > 1) {
      setModal({ type: "confirm", title: "বড় অডিও কাজ শুরু করবেন?", description: `${bn(Array.from(doc.text).length)} অক্ষর · ${bn(incomplete)}টি নতুন অনুরোধ · ${bn(chunks.filter((chunk) => chunk.source.trim()).length)}টি অভ্যন্তরীণ অংশ। ${estimateTtsCost(doc.text, processingLimits.ttsModel)} প্রতিটি সম্পন্ন অংশ সংরক্ষিত হবে; সীমায় থামলে নিজে আবার চালু করতে হবে।`, label: "অডিও কাজ শুরু করুন", action: () => { void startAudioGeneration(doc.id); } });
      return;
    }
    void startAudioGeneration(doc.id);
  }

  async function startAudioGeneration(id: string) {
    const doc = storeRef.current.documents.find((item) => item.id === id);
    if (!doc || !doc.text.trim() || audioJobs.current.has(id)) return;
    if (doc.kind === "translation" && (!doc.translationApproved || !doc.translationApprovalProof)) { notify("অডিওর আগে বাংলা অনুবাদ পর্যালোচনা করে অনুমোদন দিন।"); return; }
    if (!await persistNow(false)) return;
    const controller = new AbortController();
    audioJobs.current.set(id, controller);
    const snapshot = doc.text; // Exact saved string. Never trim, summarize, or rewrite.
    const parts = createSegments(snapshot, processingLimits.maxChunkCharacters);
    let segments: AudioSegment[] = parts.map((part, index) => {
      const text = part.source + part.separator;
      const saved = doc.audioSegments.find((segment) => segment.text === text && segment.status === "complete");
      return saved ? { ...saved, order: index } : { id: `audio-${index + 1}`, order: index, text, separator: part.separator, status: "pending" };
    });
    updateDocument(id, { audioStatus: "generating", audioSegments: segments, audio: null });
    try {
      for (let i = 0; i < segments.length; i += 1) {
        if (segments[i].status === "complete") continue;
        if (segments.slice(0, i).some((segment) => segment.status === "complete")) await wait(processingLimits.minDelaySeconds * 1000, controller.signal);
        try {
          const approval = doc.kind === "translation" ? { documentId: doc.id, signature: doc.translationApprovalProof!, approvedText: snapshot } : undefined;
          const asset = await speechService.generate(segments[i].text, doc.voiceId, doc.speed, controller.signal, approval);
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
          segments = segments.map((segment, index) => index === i ? { ...segment, audioId: asset.audioId, wavUrl: asset.wavUrl, status: "complete", error: undefined } : segment);
          updateDocument(id, { audioSegments: segments });
          setAudioProgress((previous) => ({ ...previous, [id]: Math.round((segments.filter((segment) => segment.status === "complete").length / segments.length) * 100) }));
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          const message = error instanceof Error ? error.message : "অডিও অংশ তৈরি হয়নি।";
          segments = segments.map((segment, index) => index === i ? { ...segment, status: "failed", error: message } : segment);
          updateDocument(id, { audioSegments: segments, audioStatus: "failed" });
          notify(`${bn(i + 1)} নম্বর অডিও অংশে কাজ থেমেছে। সম্পন্ন অংশ সংরক্ষিত আছে; সীমা/ত্রুটি ঠিক করে ম্যানুয়ালি আবার চালু করুন। ${message}`);
          return;
        }
      }
      updateDocument(id, { audioSegments: segments, audioStatus: "ready", audio: null });
      setAudioProgress((previous) => ({ ...previous, [id]: 100 }));
      notify("সব বাংলা অডিও অংশ প্রস্তুত হয়েছে এবং ক্রমানুসারে সংরক্ষিত আছে।");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        updateDocument(id, { audioSegments: segments, audioStatus: "failed" });
        notify(error instanceof Error ? error.message : "অডিও তৈরি হয়নি। আবার চালু করতে API সীমা পরীক্ষা করুন।");
      }
    } finally { audioJobs.current.delete(id); }
  }

  async function runTranslation(id: string, approved = false, confirmedLarge = false) {
    const doc = storeRef.current.documents.find((item) => item.id === id);
    if (!doc || doc.kind !== "translation" || !doc.sourceText.trim() || translationJobs.current.has(id)) return;
    if (doc.translationEdited && doc.text.trim() && !approved) {
      setModal({ type: "confirm", title: "অনুবাদ আবার প্রসেস করবেন?", description: "নিজে সম্পাদনা করা বাংলা লেখা প্রসেস করা অনুবাদ দিয়ে বদলে যাবে। প্রয়োজনীয় সম্পাদনা আগে কপি করে রাখুন। মূল উৎস বদলাবে না।", label: "অনুবাদ চালু করুন", action: () => { void runTranslation(id, true, false); } });
      return;
    }
    const snapshot = doc.sourceSnapshot ?? doc.sourceText;
    const startFresh = !doc.segments.length || doc.translationStatus === "complete";
    let segments = startFresh ? createSegments(snapshot, processingLimits.maxChunkCharacters) : doc.segments.map((segment) => ({ ...segment }));
    if (segments.length > 1 && !confirmedLarge) {
      const pending = segments.filter((segment) => segment.status !== "complete").length;
      setModal({ type: "confirm", title: "বড় অনুবাদ কাজ শুরু করবেন?", description: `${bn(Array.from(snapshot).length)} অক্ষর · ${bn(pending)}টি নতুন অনুবাদ অনুরোধ · ${bn(segments.length)}টি ক্রমানুসারী অংশ। ${estimateTranslationCost(snapshot, processingLimits.translationModel, doc.sourceLanguage === "ur" ? "ur" : "en")} নিরাপত্তা সীমায় থামলে কাজ সংরক্ষিত থাকবে এবং ম্যানুয়ালি চালু করতে হবে।`, label: "অনুবাদ শুরু করুন", action: () => { void runTranslation(id, approved, true); } });
      return;
    }
    const output = () => segments.map((segment) => segment.status === "complete" ? segment.translation + segment.separator : "").join("");
    const controller = new AbortController();
    translationJobs.current.set(id, controller);
    updateDocument(id, { sourceSnapshot: snapshot, segments, text: output(), translationStatus: "processing", translationEdited: false, translationApproved: false, translationApprovalProof: undefined, audio: null, audioSegments: [], audioStatus: "idle" });
    try {
      for (let i = 0; i < segments.length; i += 1) {
        if (segments[i].status === "complete") continue;
        try {
          const translation = await translationService.translateSegment(segments[i].source, doc.sourceLanguage === "ur" ? "ur" : "en", controller.signal);
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
          segments = segments.map((segment, index) => index === i ? { ...segment, translation, status: "complete" as const, error: undefined } : segment);
          updateDocument(id, { segments, text: output() });
          if (i < segments.length - 1 && segments.slice(0, i + 1).some((segment) => segment.status === "complete")) await wait(processingLimits.minDelaySeconds * 1000, controller.signal);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          const message = error instanceof Error ? error.message : "অংশটি প্রসেস করা যায়নি।";
          segments = segments.map((segment, index) => index === i ? { ...segment, status: "failed" as const, error: message } : segment);
          updateDocument(id, { segments, text: output(), translationStatus: "failed" });
          notify(message); return;
        }
      }
      updateDocument(id, { segments, text: output(), translationStatus: "complete" });
      notify("অনুবাদ সম্পূর্ণ। বাংলা লেখা পর্যালোচনা ও সম্পাদনা করে অনুমোদন দিন; তারপর অডিও তৈরি করুন।");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") updateDocument(id, { translationStatus: "paused" });
      else { updateDocument(id, { translationStatus: "failed" }); notify("প্রসেসিং থেমেছে। সংরক্ষিত জায়গা থেকে আবার শুরু করুন।"); }
    } finally { translationJobs.current.delete(id); }
  }

  function pauseTranslation() {
    if (!current) return;
    translationJobs.current.get(current.id)?.abort();
    updateDocument(current.id, { translationStatus: "paused" });
    notify("অনুবাদ বিরত আছে। সম্পূর্ণ হওয়া অংশগুলো সংরক্ষিত থাকবে।");
  }

  async function approveTranslation() {
    if (!current || current.kind !== "translation" || !current.text.trim()) return;
    const docId = current.id;
    const reviewedText = current.text;
    try {
      const response = await fetch("/api/studio/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId, text: reviewedText }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok || typeof data.signature !== "string") throw new Error(data.error || "অনুমোদন সংরক্ষণ হয়নি।");
      const latest = storeRef.current.documents.find((doc) => doc.id === docId);
      if (!latest || latest.text !== reviewedText) throw new Error("অনুমোদনের সময় লেখা বদলে গেছে। আবার পর্যালোচনা করুন।");
      updateDocument(docId, { translationApproved: true, translationApprovalProof: data.signature });
      notify("এই বাংলা পাঠ পর্যালোচনা করে অনুমোদন করা হয়েছে। এখন TTS নির্বাচন করে অডিও তৈরি করতে পারেন।");
    } catch (error) { notify(error instanceof Error ? error.message : "অনুবাদ অনুমোদন করা যায়নি।"); }
  }

  function requestDelete(doc: StudioDocument) {
    setModal({ type: "confirm", title: "কাজটি মুছে ফেলবেন?", description: `‘${doc.title || "শিরোনামহীন লেখা"}’-এর মূল লেখা, অনুবাদ ও অংশের তালিকা এই ব্রাউজার থেকে মুছে যাবে। এটি ফিরিয়ে আনা যাবে না।`, label: "কাজ মুছে ফেলুন", danger: true, action: () => {
      translationJobs.current.get(doc.id)?.abort(); audioJobs.current.get(doc.id)?.abort();
      setStore((previous) => {
        const documents = previous.documents.filter((item) => item.id !== doc.id);
        return { ...previous, documents, activeAudioId: previous.activeAudioId === doc.id ? documents.find((item) => item.kind === "audio")?.id ?? "" : previous.activeAudioId, activeTranslationId: previous.activeTranslationId === doc.id ? documents.find((item) => item.kind === "translation")?.id ?? "" : previous.activeTranslationId };
      });
      notify("কাজটি মুছে ফেলা হয়েছে।");
    } });
  }

  const navLabel = NAVIGATION.find((item) => item.id === view)?.label;
  const isImporting = importing?.id === current?.id ? importing?.message ?? null : null;
  const step = current?.audioStatus === "ready" ? 3 : current?.audioStatus === "generating" ? 2 : 1;

  return <div className="studio-shell">
    <a className="skip-link" href="#main-content">মূল ওয়ার্কস্পেসে যান</a>
    <aside className="sidebar"><a className="brand-link" href="#audio" onClick={(event) => { event.preventDefault(); selectView("audio"); }} aria-label="NBM Audio Studio — বাংলা অডিও"><StudioBrand /></a><button className="new-work-button" onClick={openNew}><Plus size={17} /><span>নতুন কাজ</span><small>＋</small></button><div className="nav-section-label">আপনার স্টুডিও</div><nav className="main-navigation" aria-label="প্রধান নেভিগেশন">{NAVIGATION.map((item) => <a key={item.id} className={`nav-item${view === item.id ? " active" : ""}`} href={`#${item.id}`} aria-current={view === item.id ? "page" : undefined} title={item.label} onClick={(event) => { event.preventDefault(); selectView(item.id); }}><item.icon size={19} strokeWidth={1.6} /><span>{item.label}</span>{item.id === "works" ? <small>{bn(store.documents.length)}</small> : view === item.id ? <i className="nav-active-dot" /> : null}</a>)}</nav><div className="sidebar-bottom"><div className="studio-quote"><span className="quote-mark">“</span><p>প্রতিটি শব্দের<br />একটি কণ্ঠ আছে।</p><span className="quote-caption">LET YOUR STORIES BE HEARD</span></div><div className="provider-block"><GeminiMark /><div><span>Provider</span><strong>Google Gemini</strong></div><span className="provider-note" title="Gemini API status">AI</span></div><div className="demo-mode"><i />{apiStatus.translation && apiStatus.tts ? "অনুবাদ ও TTS সংযুক্ত" : apiStatus.translation ? "TTS API সংযুক্ত নয়" : apiStatus.tts ? "অনুবাদ API সংযুক্ত নয়" : "Gemini API · NOT CONNECTED"}</div><button className="guide-button" onClick={() => setModal({ type: "guide" })}><BookOpen size={15} /><span>ছোট্ট একটি ব্যবহার নির্দেশিকা</span><ChevronRight size={13} /></button></div></aside>
      <div className="studio-main"><header className="topbar"><div className="breadcrumbs"><span>স্টুডিও</span><ChevronRight size={12} /><strong>{navLabel}</strong></div><div className="mobile-brand"><StudioBrand compact /></div><div className="topbar-actions"><button className={`save-status ${saveState}`} onClick={() => void persistNow()} title="এই ব্রাউজারে কাজ সংরক্ষণ করুন (Ctrl / ⌘ + S)">{saveState === "saving" ? <LoaderCircle size={14} className="spin" /> : saveState === "error" ? <Info size={14} /> : <CheckCheck size={15} />}<span>{!hydrated ? "প্রস্তুত হচ্ছে" : saveState === "saving" ? "সংরক্ষণ হচ্ছে…" : saveState === "error" ? "সেশনে রাখা আছে" : "ব্রাউজারে সংরক্ষিত"}</span></button><span className="prototype-badge"><i />{apiStatus.translation && apiStatus.tts ? "Gemini সংযুক্ত" : "API NOT CONNECTED"}</span><span className="topbar-divider" /><button className="secondary-button api-manager-open" onClick={() => setModal({ type: "api-manager" })}><KeyRound size={14} />API Manager</button><button className="icon-button help-button" aria-label="ব্যবহার নির্দেশিকা" onClick={() => setModal({ type: "guide" })}><CircleHelp size={18} /></button><button className="profile-button" aria-label="NBM Audio Studio সম্পর্কে" onClick={() => setModal({ type: "guide" })}>N</button><button className="mobile-new icon-button" aria-label="নতুন কাজ" onClick={openNew}><Plus size={20} /></button></div></header>
      <main id="main-content" className={`studio-content view-${view}`}>
        <section className="workspace-intro"><div className="intro-copy"><div className="intro-eyebrow"><span />{view === "audio" ? "শব্দ থেকে শ্রুতি" : view === "translation" ? "ভাষার সীমানা পেরিয়ে" : "আপনার সৃজনের নিজস্ব ঠিকানা"}</div><h1>{view === "audio" ? <>আপনার লেখা, <span>এবার কণ্ঠে।</span></> : view === "translation" ? <>অন্য ভাষার গল্প, <span>আপনার বাংলায়।</span></> : <>আপনার গল্প, <span>যত্নে রাখা।</span></>}</h1><p>{view === "audio" ? <>গল্প, উপন্যাস কিংবা প্রিয় কোনো লেখা—<br className="intro-break" /> স্বাভাবিক বাংলা উচ্চারণে শুনুন প্রতিটি শব্দ।</> : view === "translation" ? <>ইংরেজি বা উর্দু থেকে বিশ্বস্ত বাংলা অনুবাদ।<br className="intro-break" /> তারপর, আপনার পছন্দের কণ্ঠে একটি নতুন অভিজ্ঞতা।</> : <>অসমাপ্ত লেখা থেকে প্রস্তুত অডিও—<br className="intro-break" /> যেখানে থেমেছিলেন, সেখান থেকেই আবার শুরু করুন।</>}</p></div><HeroWave /></section>
        {view === "works" ? <SavedWork documents={store.documents} onOpen={openDocument} onDelete={requestDelete} onNew={openNew} /> : current ? <>
          <div className="workspace-section-heading"><h2><span />{view === "audio" ? "বাংলা অডিও ওয়ার্কস্পেস" : "অনুবাদ ও অডিও ওয়ার্কস্পেস"}</h2><ol className="workflow-steps">{[view === "translation" ? "অনুবাদ করুন" : "লেখা যোগ করুন", "কণ্ঠ বেছে নিন", "শুনুন ও ডাউনলোড"].map((label, index) => <li key={label} className={index + 1 <= step ? "active" : ""}><span>{bn(index + 1)}</span>{label}{index < 2 && <i />}</li>)}</ol></div>
          <div className={`workspace-grid${view === "translation" ? " translation-workspace" : ""}`}>
            {view === "audio" ? <BengaliEditor key={current.id} document={current} importing={isImporting} onPatch={patchCurrent} onImport={chooseFile} onSample={requestSample} onClear={requestClear} /> : <TranslationEditor key={current.id} document={current} importing={isImporting} onPatch={patchCurrent} onImport={chooseFile} onSample={requestSample} onClear={requestClear} onTranslate={() => { void runTranslation(current.id); }} onApprove={() => { void approveTranslation(); }} onPause={pauseTranslation} onResetSource={resetSource} onLanguage={changeLanguage} />}
            <VoicePanel document={current} progress={audioProgress[current.id] ?? 0} disabled={!!isImporting} canGenerate={current.kind !== "translation" || current.translationApproved} onVoice={(voiceId) => patchCurrent({ voiceId })} onSpeed={(speed) => patchCurrent({ speed })} onGenerate={() => { void generateAudio(); }} onPreview={(voiceId) => setModal({ type: "voice", voiceId })} onInfo={() => setModal({ type: "voice" })} />
            <AudioPlayer key={`player-${current.id}`} document={current} onNotify={notify} onAttribution={() => setModal({ type: "attribution" })} />
          </div>
          <div className="studio-principles"><span><ShieldCheck size={13} />আপনার লেখা, হুবহু অক্ষত</span><i /><span><AudioLines size={13} />শুধু কণ্ঠ, কোনো সংগীত নয়</span><i /><span><BookOpen size={13} />দীর্ঘ গল্পের জন্য পরিকল্পিত</span><button onClick={() => setModal({ type: "guide" })}>ব্যবহার নির্দেশিকা<ArrowRight size={12} /></button></div>
        </> : <div className="workspace-loading"><LoaderCircle className="spin" size={24} />ওয়ার্কস্পেস প্রস্তুত হচ্ছে…</div>}
        <footer className="studio-footer"><span>NBM AUDIO STUDIO<span className="footer-dot">·</span>CRAFTED FOR BENGALI STORIES</span><span>প্রতিটি গল্প শোনা হোক।<span className="footer-version">V 0.1</span></span></footer>
      </main>
    </div>
    <nav className="mobile-navigation" aria-label="মোবাইল নেভিগেশন">{NAVIGATION.map((item) => <a key={item.id} href={`#${item.id}`} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={(event) => { event.preventDefault(); selectView(item.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}><item.icon size={19} /><span>{item.label}</span></a>)}</nav>
    <input ref={fileInput} className="sr-only" type="file" tabIndex={-1} aria-label="লেখার ফাইল নির্বাচন করুন" accept=".txt,.pdf,text/plain,application/pdf" onChange={(event) => { receiveFile(event.target.files?.[0]); event.target.value = ""; }} />
    {toast && <div className="toast" role="status" aria-live="polite"><span className="toast-icon"><Check size={15} /></span><p>{toast.message}</p><button className="icon-button" aria-label="বার্তা বন্ধ করুন" onClick={() => setToast(null)}><X size={15} /></button></div>}
    {modal?.type === "api-manager" && <ApiManager onClose={() => { setModal(null); void refreshSafetyLimits(); }} />}
    {modal?.type === "new" && <Dialog title="একটি নতুন গল্পের শুরু" eyebrow="আপনার সৃজনের জায়গা" onClose={() => setModal(null)}><form onSubmit={submitNew}><label className="form-label" htmlFor="new-work-title">কাজের নাম</label><input id="new-work-title" className="form-input" data-autofocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={120} placeholder="যেমন: একটি নতুন সকাল" /><label className="form-label">কীভাবে শুরু করতে চান?</label><div className="new-kind-options">{([{ kind: "audio", title: "বাংলা অডিও", description: "বাংলা লেখা থেকে অডিও", icon: Headphones }, { kind: "translation", title: "অনুবাদ ও অডিও", description: "ইংরেজি / উর্দু থেকে বাংলা", icon: Languages }] as const).map((option) => <button type="button" className={newKind === option.kind ? "selected" : ""} aria-pressed={newKind === option.kind} key={option.kind} onClick={() => setNewKind(option.kind)}><option.icon size={20} /><strong>{option.title}</strong><span>{option.description}</span>{newKind === option.kind && <Check size={13} className="kind-check" />}</button>)}</div><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setModal(null)}>এখন নয়</button><button className="primary-button" type="submit">শুরু করুন<ArrowRight size={15} /></button></div></form></Dialog>}
    {modal?.type === "confirm" && <Dialog title={modal.title} onClose={() => setModal(null)}><p className="confirmation-copy">{modal.description}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setModal(null)}>ফিরে যান</button><button className={`primary-button${modal.danger ? " danger" : ""}`} onClick={() => { const action = modal.action; setModal(null); action(); }}>{modal.label}</button></div></Dialog>}
    {modal?.type === "guide" && <Dialog title="আপনার গল্পের একটি নতুন কণ্ঠ" eyebrow="NBM AUDIO STUDIO" onClose={() => setModal(null)} wide><p className="dialog-description">শুধু দুটি পথ। সহজ, মনোযোগী এবং সম্পূর্ণ বাংলা-কেন্দ্রিক।</p><div className="guide-workflows"><div><span className="guide-workflow-icon"><Headphones size={20} /></span><h3>বাংলা লেখা → বাংলা অডিও</h3><p>বাংলা লেখা বা PDF/TXT যোগ করুন। API Manager-এ TTS API বেছে নিন, কণ্ঠ ও গতি ঠিক করে WAV তৈরি করুন; FFmpeg থাকলে MP3-ও নামাতে পারবেন।</p></div><div><span className="guide-workflow-icon"><Languages size={20} /></span><h3>ইংরেজি / উর্দু → বাংলা → অডিও</h3><p>ইংরেজি বা উর্দু উৎসের বাংলা অনুবাদ তৈরি করুন। পাঠ সম্পাদনা করে অনুমোদন দেওয়ার পরেই TTS চালু হবে। থামলে সম্পন্ন অংশ সেভ থাকে; আবার চালু করতে স্পষ্ট পদক্ষেপ লাগে।</p></div></div><div className="info-callout"><Info size={18} /><p><strong>এটি NBM Audio Studio-র বর্তমান Next.js সংস্করণ।</strong>Gemini API-গুলো API Manager-এ কনফিগার ও ম্যানুয়ালি নির্বাচন করতে হবে। API key সার্ভারে এনক্রিপ্ট থাকে। ব্যবহার সীমা, মডেল মূল্য এবং Bengali voice quality আপনার প্রকল্পে পরীক্ষা করুন।</p></div><div className="guide-details"><p><ShieldCheck size={15} /><span><strong>এই ব্রাউজারে প্রকল্প সংরক্ষণ</strong>কাজ IndexedDB-তে থাকে। Browser data মুছলে প্রকল্প হারাতে পারেন; server-side audio ও encrypted vault .nbm-data-তে থাকে।</span></p><p><FileText size={15} /><span><strong>TXT, native PDF ও OCR</strong>দুই workflow-তেই TXT/PDF যোগ করা যায়। স্ক্যান পৃষ্ঠা Bengali, English বা Urdu OCR দিয়ে পড়ার চেষ্টা হয়; প্রতিটি পৃষ্ঠা ও অধ্যায়ের ক্রম যাচাই করুন। OCR-এর জন্য ইন্টারনেট দরকার।</span></p><p><BookOpen size={15} /><span><strong>বড় বই, ক্রম ও অগ্রগতি</strong>ভেতরে বাক্যভিত্তিক অংশে কাজ হয়, অধ্যায় তৈরি হয় না। প্রতিটি সম্পন্ন অংশ সেভ হয়। অ্যাপ ২৫ মিলিয়ন অক্ষর পর্যন্ত আমদানি দেয়; provider quota ও local hardware সীমা প্রযোজ্য।</span></p></div><div className="architecture-note"><span>বর্তমান প্রযুক্তি</span><p>Next.js · React · TypeScript · Google GenAI SDK · FFmpeg</p><small>Gemini API এবং usage control সার্ভার route-এ চলে। API keys encrypted local vault-এ থাকে। প্রকল্প browser IndexedDB-তে থাকে; multi-instance deployment-এর জন্য shared database/lock এখনো নেই।</small></div><div className="dialog-actions"><button className="primary-button" onClick={() => setModal(null)}>ঠিক আছে, শুরু করি<ArrowRight size={15} /></button></div></Dialog>}
    {modal?.type === "voice" && <Dialog title={modal.voiceId ? `${modal.voiceId} কণ্ঠের প্রিভিউ` : "একটি গল্প, একটি মানানসই কণ্ঠ"} eyebrow="কণ্ঠ সম্পর্কে" onClose={() => setModal(null)}><div className="voice-dialog-symbol"><AudioLines size={35} strokeWidth={1.2} /></div><p className="dialog-description">{modal.voiceId ? `${modal.voiceId} — ${VOICE_CANDIDATES.find((voice) => voice.id === modal.voiceId)?.officialDescription}। ` : "Puck, Kore, Zephyr, Charon ও Fenrir — "}Google-এর প্রিবিল্ট ভয়েস তালিকায় রয়েছে। তবে তালিকাভুক্ত হওয়া মানেই নির্দিষ্ট মডেলে বাংলা উচ্চারণের মান বা আপনার প্রকল্পে প্রাপ্যতা যাচাই হয়েছে, এমন নয়।</p><div className="info-callout"><Info size={17} /><p><strong>এই ভয়েসের বাংলা উচ্চারণ এখনো পরীক্ষা করা হয়নি।</strong>Puck, Kore, Zephyr, Charon ও Fenrir Google-এর prebuilt তালিকায় আছে; আপনার নির্বাচিত মডেল/প্রকল্পে সংযোগ পরীক্ষা ও বাংলা উচ্চারণ শোনার আগে এগুলোকে যাচাইকৃত কণ্ঠ বলা যাবে না।</p></div><div className="model-information"><span>প্রস্তাবিত, পরিবর্তনযোগ্য TTS মডেল</span><code>{STUDIO_CONFIG.ttsModel}</code></div><a className="documentation-link" href={STUDIO_CONFIG.speechDocumentation} target="_blank" rel="noreferrer">Google-এর অফিসিয়াল TTS ডকুমেন্টেশন<ArrowRight size={14} /></a><div className="dialog-actions"><button className="primary-button" onClick={() => setModal(null)}>বুঝেছি<Check size={15} /></button></div></Dialog>}
    {modal?.type === "attribution" && <Dialog title="নমুনা কণ্ঠের উৎস" eyebrow="অডিও ক্রেডিট ও লাইসেন্স" onClose={() => setModal(null)}><div className="voice-dialog-symbol"><BookOpen size={30} strokeWidth={1.3} /></div><p className="dialog-description">রবীন্দ্রনাথ ঠাকুরের <strong>‘গিন্নি’</strong> গল্পের অডিওবুক থেকে ২৬ সেকেন্ডের একটি অংশ (০০:৪৮–০১:১৪)।</p><dl className="attribution-details"><div><dt>কণ্ঠশিল্পী</dt><dd>Tisha Mukherjee</dd></div><div><dt>রেকর্ডিং ও পোস্ট-প্রোডাকশন</dt><dd>Paramanu Sarkar</dd></div><div><dt>উৎস</dt><dd><a href="https://commons.wikimedia.org/wiki/File:গিন্নি_-_রবীন্দ্রনাথ_ঠাকুর.oga" target="_blank" rel="noreferrer">Wikimedia Commons ↗</a></dd></div><div><dt>লাইসেন্স</dt><dd><a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0 ↗</a></dd></div></dl><p className="attribution-note">মূল রেকর্ডিং থেকে অংশ কেটে 24 kHz mono WAV ও MP3-তে রূপান্তর করা হয়েছে। কোনো সংগীত বা আবহ যোগ করা হয়নি। পরিবর্তিত নমুনাও CC BY-SA 4.0 লাইসেন্সে বিতরণ করা হচ্ছে। এটি Gemini-তৈরি নয়, নির্বাচিত কণ্ঠ নয়, এবং আপনার লেখার পাঠ নয়।</p><div className="dialog-actions"><button className="primary-button" onClick={() => setModal(null)}>ঠিক আছে<Check size={15} /></button></div></Dialog>}
  </div>;
}
