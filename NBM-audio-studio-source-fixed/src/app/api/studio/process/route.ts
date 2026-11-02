import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { readVault, type ApiConfiguration, type ApiService } from "@/lib/server/api-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsageRow = { at: number; service: ApiService; configId: string; characters: number; cacheKey: string; status: "ok" | "failed" };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const dataDir = () => path.resolve(process.env.NBM_DATA_DIR || path.join(process.cwd(), ".nbm-data"));
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
let active = 0;
const activeCacheKeys = new Set<string>();
let writeChain: Promise<unknown> = Promise.resolve();

async function readUsage(): Promise<UsageRow[]> {
  try { return JSON.parse(await readFile(path.join(dataDir(), "usage.json"), "utf8")) as UsageRow[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
function writeUsage(rows: UsageRow[]) {
  const next = writeChain.then(async () => {
    await mkdir(dataDir(), { recursive: true, mode: 0o700 });
    await writeFile(path.join(dataDir(), "usage.json"), JSON.stringify(rows), { mode: 0o600 });
  });
  writeChain = next.catch(() => undefined);
  return next;
}
async function cached<T>(key: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path.join(dataDir(), "cache", `${key}.json`), "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function setCache(key: string, value: unknown) {
  const dir = path.join(dataDir(), "cache");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir, `${key}.json`), JSON.stringify(value), { mode: 0o600 });
}
function selectedConfig(configurations: ApiConfiguration[], id: string | null) {
  return configurations.find((item) => item.id === id && item.enabled && item.apiKey) ?? null;
}
function providerMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Provider request failed.";
  if (/429|resource_exhausted|quota|rate.?limit/i.test(message)) return "Google API quota or rate limit reached. Work is saved. No other API was selected; choose one manually when ready.";
  if (/401|403|api.?key|permission/i.test(message)) return "The selected Google API configuration was rejected. Work is saved. Correct it or choose another configuration manually.";
  return `Provider request failed. Work is saved and no fallback was used. ${message.slice(0, 180)}`;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== request.headers.get("host"))) return json({ error: "Cross-origin requests are not allowed." }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid JSON." }, 400); }
  const service = body.service as ApiService;
  const text = typeof body.text === "string" ? body.text : "";
  if ((service !== "translation" && service !== "tts") || !text.trim()) return json({ error: "A service and non-empty text are required." }, 400);
  if (service === "tts" && body.translationWorkflow === true) {
    const key = process.env.NBM_VAULT_ENCRYPTION_KEY;
    const documentId = typeof body.documentId === "string" ? body.documentId : "";
    const approvalText = typeof body.approvalText === "string" ? body.approvalText : "";
    const supplied = typeof body.approvalSignature === "string" ? Buffer.from(body.approvalSignature, "hex") : Buffer.alloc(0);
    if (!key || !/^[\da-f]{64}$/i.test(key) || !documentId || !approvalText || !supplied.length) return json({ error: "Review and approve the Bengali translation before requesting audio." }, 403);
    const expected = createHmac("sha256", Buffer.from(key, "hex")).update(`${documentId}\0${approvalText}`).digest();
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || !approvalText.includes(text)) return json({ error: "This translation changed after approval. Review and approve the saved text again." }, 403);
  }
  let vault;
  try { vault = await readVault(); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "API Manager is unavailable." }, 503); }
  const configId = vault.selected[service];
  const config = selectedConfig(vault.configurations, configId);
  if (!config) return json({ error: `No enabled ${service === "tts" ? "Bengali TTS" : "translation"} API is manually selected. Configure and select one in API Manager.` }, 503);
  if (text.length > vault.limits.maxChunkCharacters) return json({ error: `This chunk has ${text.length} characters; the configured maximum is ${vault.limits.maxChunkCharacters}.` }, 413);

  const options = service === "translation"
    ? { language: body.language === "ur" ? "ur" : "en" }
    : { voice: String(body.voice ?? ""), format: "wav" };
  const model = service === "translation" ? config.translationModel : config.ttsModel;
  const cacheKey = hash([service, text, model, config.projectId, options]);
  if (activeCacheKeys.has(cacheKey)) return json({ error: "This exact request is already in progress; duplicate generation was prevented." }, 409);
  try {
    const prior = await cached<Record<string, unknown>>(cacheKey);
    if (prior) return json({ ...prior, cached: true });
  } catch { return json({ error: "Local cache could not be read; request stopped to avoid duplicate usage." }, 500); }

  const now = Date.now();
  if (active >= vault.limits.maxConcurrent) return json({ error: "The configured concurrency limit is full. Wait and manually resume." }, 429);
  let rows: UsageRow[];
  try { rows = await readUsage(); } catch { return json({ error: "Usage ledger could not be read; request stopped for safety." }, 500); }
  const previous = rows.filter((row) => row.service === service).reduce((latest, row) => Math.max(latest, row.at), 0);
  const delayLeft = Math.ceil(vault.limits.minDelaySeconds - (now - previous) / 1000);
  if (delayLeft > 0) return json({ error: `Safety delay active. Wait ${delayLeft} seconds; the same chunk will retry automatically.`, retryAfterSeconds: delayLeft, retryableSafetyDelay: true }, 429);
  const hour = rows.filter((row) => row.service === service && row.at > now - 60 * 60 * 1000).length;
  const minute = rows.filter((row) => row.service === service && row.at > now - 60 * 1000).length;
  const day = rows.filter((row) => row.service === service && row.at > now - 24 * 60 * 60 * 1000).length;
  if (minute >= vault.limits.requestsPerMinute || hour >= vault.limits.requestsPerHour || day >= vault.limits.requestsPerDay) return json({ error: `Application safety limit reached for ${service}. Completed work is saved. Choose a different limit or manually resume later; no API will be switched.`, usage: { minute, hour, day } }, 429);

  active += 1; activeCacheKeys.add(cacheKey);
  const client = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  try {
    let result: Record<string, unknown>;
    if (service === "translation") {
      const languageName = options.language === "ur" ? "Urdu" : "English";
      const response = await client.models.generateContent({
        model,
        contents: `Translate this ${languageName} passage into faithful, natural Bengali. Preserve every fact, name, event, dialogue, paragraph order, and literary tone. Do not summarize, shorten, add, omit, explain, or translate any content beyond the supplied passage. Return only the Bengali translation. Preserve paragraph breaks.\n\n--- SOURCE ---\n${text}\n--- END SOURCE ---`,
        config: { temperature: 0.2 },
      });
      const translated = response.text?.trim();
      if (!translated) throw new Error("Google returned an empty translation; the segment remains failed for manual retry.");
      result = { translation: translated, service, model, cacheKey };
    } else {
      const voice = String(body.voice ?? "");
      if (!/^[A-Za-z0-9_-]{2,80}$/.test(voice) || ![0.8, 1, 1.25].includes(Number(body.speed ?? 1))) return json({ error: "Choose a valid voice and narration speed." }, 400);
      const interaction = await client.interactions.create({
        model,
        input: [{ type: "user_input", content: [{ type: "text", text }] }],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice }] },
      });
      const audio = interaction.output_audio?.data;
      if (!audio) throw new Error("Google returned no audio data.");
      const id = randomUUID();
      const audioDir = path.join(dataDir(), "audio"); await mkdir(audioDir, { recursive: true, mode: 0o700 });
      await writeFile(path.join(audioDir, `${id}.wav`), Buffer.from(audio, "base64"), { mode: 0o600 });
      result = { audioId: id, audioUrl: `/api/studio/audio/${id}?format=wav`, service, model, voice, cacheKey };
    }
    await setCache(cacheKey, result);
    rows.push({ at: now, service, configId: config.id, characters: text.length, cacheKey, status: "ok" });
    await writeUsage(rows);
    return json({ ...result, cached: false });
  } catch (error) {
    rows.push({ at: now, service, configId: config.id, characters: text.length, cacheKey, status: "failed" });
    await writeUsage(rows).catch(() => undefined);
    const providerError = error as { status?: number; response?: { headers?: { get(name: string): string | null } }; headers?: { get(name: string): string | null } };
    const retryHeader = providerError.response?.headers?.get("retry-after") ?? providerError.headers?.get("retry-after");
    const retryAfterSeconds = retryHeader ? (Number(retryHeader) || Math.max(1, Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000))) : undefined;
    const isRateLimited = providerError.status === 429 || /429|resource_exhausted|quota|rate.?limit/i.test(error instanceof Error ? error.message : "");
    return json({ error: providerMessage(error), stopped: true, ...(retryAfterSeconds ? { retryAfterSeconds } : {}), ...(isRateLimited ? { retryableProviderRateLimit: true } : {}) }, isRateLimited ? 429 : 502);
  } finally { active -= 1; activeCacheKeys.delete(cacheKey); }
}
