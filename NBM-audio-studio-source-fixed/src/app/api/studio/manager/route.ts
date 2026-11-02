import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { adminConfigured, adminMatches, bearer, publicVault, readVault, updateVault, type ApiService, type SafetyLimits } from "@/lib/server/api-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
function authorized(request: Request) { return adminConfigured() && adminMatches(bearer(request)); }
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" && (!origin || new URL(origin).host === request.headers.get("host"));
}
class ManagerError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function GET(request: Request) {
  if (!adminConfigured()) return json({ error: "API Manager is NOT CONNECTED. Configure NBM_ADMIN_TOKEN and NBM_VAULT_ENCRYPTION_KEY on the server." }, 503);
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
  if (!authorized(request)) return json({ error: "API Manager access token is missing or invalid." }, 401);
  try {
    let vault = await readVault();
    if (vault.configurations.some((config) => typeof config.id !== "string" || !config.id.trim())) {
      vault = await updateVault((current) => {
        let changed = false;
        current.configurations = current.configurations.map((config) => {
          if (typeof config.id === "string" && config.id.trim()) return config;
          changed = true;
          return { ...config, id: randomUUID() };
        });
        return changed;
      });
    }
    let rows: { at: number; service: string; configId: string; characters: number; status: string }[] = [];
    try { rows = JSON.parse(await readFile(path.resolve(process.env.NBM_DATA_DIR || path.join(process.cwd(), ".nbm-data"), "usage.json"), "utf8")) as typeof rows; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const windowStart = Date.now() - 24 * 60 * 60 * 1000;
    const usage = rows.filter((row) => row.at > windowStart).reduce((result, row) => {
      result[row.service] ??= { requests: 0, completed: 0, failed: 0, characters: 0 };
      result[row.service].requests += 1; result[row.service][row.status === "ok" ? "completed" : "failed"] += 1; result[row.service].characters += row.characters;
      return result;
    }, {} as Record<string, { requests: number; completed: number; failed: number; characters: number }>);
    return json({ ...publicVault(vault), usage, usageWindow: "rolling 24 hours; application request ledger, not provider billing data" });
  }
  catch (error) { return json({ error: error instanceof Error ? error.message : "API Manager could not be read." }, 500); }
}

export async function POST(request: Request) {
  if (!adminConfigured()) return json({ error: "API Manager is NOT CONNECTED. Configure NBM_ADMIN_TOKEN and NBM_VAULT_ENCRYPTION_KEY on the server." }, 503);
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
  if (!authorized(request)) return json({ error: "API Manager access token is missing or invalid." }, 401);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "JSON is required." }, 415);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON." }, 400); }
  try {
    if (body.action === "test") {
      const vault = await readVault();
      const config = vault.configurations.find((item) => item.id === body.id && item.enabled);
      const service = body.service as ApiService;
      if (!config?.apiKey) return json({ error: "Select an enabled configuration with a saved key." }, 400);
      if (service !== "translation" && service !== "tts") return json({ error: "Unknown service." }, 400);
      const model = service === "tts" ? config.ttsModel : config.translationModel;
      // This is a real authenticated model metadata request and does not synthesize audio or translate content.
      const ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
      const result = await ai.models.get({ model });
      return json({ ok: true, model: result.name ?? model, service, note: "Provider authenticated and model metadata is accessible. Bengali voice quality still requires a real listening test." });
    }
    if (!["save", "delete", "toggle", "select", "limits"].includes(String(body.action))) return json({ error: "Unknown API Manager action." }, 400);
    const vault = await updateVault((current) => {
      if (body.action === "save") {
        const id = typeof body.id === "string" && body.id.trim() ? body.id : randomUUID();
        const previous = current.configurations.find((item) => item.id === id);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
        const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : previous?.apiKey;
        if (!name || !projectId || !apiKey) throw new ManagerError("Name, Google Cloud Project ID, and API key are required.", 400);
        if (name.length > 40 || projectId.length > 200 || apiKey.length > 500) throw new ManagerError("A configuration field exceeds the allowed length.", 400);
        const config = {
          id, name, projectId, apiKey,
          translationModel: typeof body.translationModel === "string" && body.translationModel.trim() ? body.translationModel.trim() : "gemini-3.5-flash-lite",
          ttsModel: typeof body.ttsModel === "string" && body.ttsModel.trim() ? body.ttsModel.trim() : "gemini-3.8-flash-tts",
          enabled: typeof body.enabled === "boolean" ? body.enabled : previous?.enabled ?? true,
          createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        if (previous) current.configurations = current.configurations.map((item) => item.id === id ? config : item);
        else current.configurations.push(config);
        return;
      }
      if (body.action === "delete") {
        const id = String(body.id ?? "");
        current.configurations = current.configurations.filter((item) => item.id !== id);
        if (current.selected.translation === id) current.selected.translation = null;
        if (current.selected.tts === id) current.selected.tts = null;
        return;
      }
      if (body.action === "toggle") {
        const item = current.configurations.find((config) => config.id === body.id);
        if (!item) throw new ManagerError("Configuration not found.", 404);
        item.enabled = Boolean(body.enabled); item.updatedAt = new Date().toISOString();
        return;
      }
      if (body.action === "select") {
        const service = body.service as ApiService;
        const id = typeof body.id === "string" ? body.id : null;
        if (service !== "translation" && service !== "tts") throw new ManagerError("Unknown service.", 400);
        if (id && !current.configurations.some((item) => item.id === id && item.enabled && item.apiKey)) throw new ManagerError("Choose an enabled, configured API manually.", 400);
        current.selected[service] = id;
        return;
      }
      const value = body.limits as Partial<SafetyLimits>;
      const fields: (keyof SafetyLimits)[] = ["requestsPerMinute", "requestsPerHour", "requestsPerDay", "maxConcurrent", "minDelaySeconds", "maxChunkCharacters"];
      for (const field of fields) if (!Number.isInteger(value?.[field]) || Number(value[field]) < 1 || Number(value[field]) > (field === "maxChunkCharacters" ? 10000 : field === "minDelaySeconds" ? 3600 : 10000)) throw new ManagerError(`Invalid safety limit: ${field}`, 400);
      current.limits = value as SafetyLimits;
    });
    return json(publicVault(vault));
  } catch (error) {
    const message = error instanceof Error ? error.message : "API Manager action failed.";
    return json({ error: message.slice(0, 500) }, error instanceof ManagerError ? error.status : 500);
  }
}
