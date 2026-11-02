import { STUDIO_CONFIG, VOICE_CANDIDATES } from "./config";
import { initialStore } from "./samples";
import type { StudioDocument, StudioStore } from "./types";

const STORAGE_KEY = "nbm-audio-studio:v1";
const DB_NAME = "nbm-audio-studio";
const DB_STORE = "projects";
const DB_KEY = "workspace";

function validDocument(value: unknown): value is StudioDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as StudioDocument;
  return typeof doc.id === "string" && typeof doc.title === "string"
    && ["audio", "translation"].includes(doc.kind)
    && ["bn", "en", "ur"].includes(doc.sourceLanguage)
    && typeof doc.text === "string" && doc.text.length <= STUDIO_CONFIG.maxDocumentCharacters
    && typeof doc.sourceText === "string" && doc.sourceText.length <= STUDIO_CONFIG.maxDocumentCharacters
    && (doc.sourceSnapshot === null || typeof doc.sourceSnapshot === "string")
    && VOICE_CANDIDATES.some((voice) => voice.id === doc.voiceId)
    && [0.8, 1, 1.25].includes(doc.speed)
    && typeof doc.updatedAt === "string"
    && Array.isArray(doc.segments)
    && doc.segments.every((segment) => typeof segment.id === "string" && typeof segment.source === "string" && typeof segment.separator === "string" && typeof segment.translation === "string" && ["pending", "complete", "failed"].includes(segment.status))
    && (doc.audioSegments === undefined || (Array.isArray(doc.audioSegments) && doc.audioSegments.every((segment) => typeof segment.id === "string" && typeof segment.text === "string" && ["pending", "complete", "failed"].includes(segment.status))));
}

function normalize(value: StudioStore): StudioStore {
  if (value.version !== 1 || !Array.isArray(value.documents) || !value.documents.every(validDocument)) throw new Error("The saved project data could not be read. Original stored data has not been changed.");
  return {
    ...value,
    documents: value.documents.map((doc) => ({
      ...doc,
      translationApproved: Boolean(doc.translationApproved),
      audioSegments: Array.isArray(doc.audioSegments) ? doc.audioSegments : [],
      translationStatus: doc.translationStatus === "processing" ? "paused" : doc.translationStatus,
      audioStatus: doc.audioStatus === "generating" ? "failed" : doc.audioStatus,
      audio: doc.audio && typeof doc.audio.url === "string" && doc.audio.url.startsWith("/api/studio/audio/") && doc.audio.isDemo === false ? doc.audio : null,
    })),
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("IndexedDB is unavailable.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Project database could not be opened."));
  });
}
async function idbGet(): Promise<StudioStore | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
    request.onsuccess = () => { db.close(); resolve((request.result as StudioStore | undefined) ?? null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
async function idbSet(value: StudioStore): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(value, DB_KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export async function loadStore(): Promise<StudioStore> {
  try {
    const stored = await idbGet();
    if (stored) return normalize(stored);
  } catch { /* Keep compatibility with the previous localStorage-only prototype. */ }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialStore();
  const migrated = normalize(JSON.parse(raw) as StudioStore);
  await idbSet(migrated).catch(() => undefined);
  return migrated;
}

export async function saveStore(store: StudioStore): Promise<void> {
  let idbError: unknown;
  try { await idbSet(store); } catch (error) { idbError = error; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); return; }
  catch (storageError) {
    if (!idbError) return;
    throw new Error(storageError instanceof Error ? storageError.message : "Browser storage is full.");
  }
}
