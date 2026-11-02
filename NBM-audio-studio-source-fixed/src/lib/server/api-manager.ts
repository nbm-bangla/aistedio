import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ApiService = "translation" | "tts";
export interface ApiConfiguration {
  id: string;
  name: string;
  projectId: string;
  apiKey: string;
  translationModel: string;
  ttsModel: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface SafetyLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  maxConcurrent: number;
  minDelaySeconds: number;
  maxChunkCharacters: number;
}
export interface ApiVault {
  configurations: ApiConfiguration[];
  selected: Record<ApiService, string | null>;
  limits: SafetyLimits;
}

export const DEFAULT_LIMITS: SafetyLimits = {
  requestsPerMinute: 1,
  requestsPerHour: 10,
  requestsPerDay: 10,
  maxConcurrent: 1,
  minDelaySeconds: 60,
  maxChunkCharacters: 1800,
};

function dataDirectory() {
  return path.resolve(process.env.NBM_DATA_DIR || path.join(process.cwd(), ".nbm-data"));
}
function vaultPath() { return path.join(dataDirectory(), "api-vault.json"); }
function encryptionKey(): Buffer {
  const raw = process.env.NBM_VAULT_ENCRYPTION_KEY;
  if (!raw || !/^[\da-f]{64}$/i.test(raw)) throw new Error("NBM_VAULT_ENCRYPTION_KEY must be a 64-character hex key.");
  return Buffer.from(raw, "hex");
}
export function adminConfigured() { return Boolean(process.env.NBM_ADMIN_TOKEN && process.env.NBM_VAULT_ENCRYPTION_KEY); }
export function adminMatches(value: string | null) {
  const expected = process.env.NBM_ADMIN_TOKEN;
  if (!expected || !value) return false;
  // Fixed-time comparison for equal-length values.
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function freshVault(): ApiVault {
  return { configurations: [], selected: { translation: null, tts: null }, limits: { ...DEFAULT_LIMITS } };
}
let vaultQueue: Promise<void> = Promise.resolve();

function enqueueVaultOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = vaultQueue.then(operation);
  vaultQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function readVault(): Promise<ApiVault> {
  try {
    const record = JSON.parse(await readFile(vaultPath(), "utf8")) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "hex"));
    decipher.setAuthTag(Buffer.from(record.tag, "hex"));
    const plain = Buffer.concat([decipher.update(Buffer.from(record.data, "base64")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as ApiVault;
    return { ...freshVault(), ...parsed, selected: { ...freshVault().selected, ...parsed.selected }, limits: { ...DEFAULT_LIMITS, ...parsed.limits } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return freshVault();
    if (error instanceof Error && error.message.startsWith("NBM_VAULT_ENCRYPTION_KEY")) throw error;
    throw new Error("API Manager vault could not be decrypted. Check the encryption key and keep a backup of the encrypted vault.");
  }
}

async function persistVault(vault: ApiVault): Promise<void> {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(vault), "utf8"), cipher.final()]);
  const record = JSON.stringify({ version: 1, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), data: data.toString("base64") });
  await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
  const tempPath = `${vaultPath()}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, record, { mode: 0o600 });
  await rename(tempPath, vaultPath());
}

export function writeVault(vault: ApiVault): Promise<void> {
  return enqueueVaultOperation(() => persistVault(vault));
}

export function updateVault(update: (vault: ApiVault) => void | boolean | Promise<void | boolean>): Promise<ApiVault> {
  return enqueueVaultOperation(async () => {
    const vault = await readVault();
    const shouldPersist = await update(vault);
    if (shouldPersist !== false) await persistVault(vault);
    return vault;
  });
}

export function publicVault(vault: ApiVault) {
  const projectCounts = new Map<string, number>();
  for (const config of vault.configurations) projectCounts.set(config.projectId, (projectCounts.get(config.projectId) ?? 0) + 1);
  return {
    configurations: vault.configurations.map(({ apiKey, ...config }) => ({ ...config, keyConfigured: Boolean(apiKey), maskedKey: apiKey ? `••••${apiKey.slice(-4)}` : "" })),
    selected: vault.selected,
    limits: vault.limits,
    sharedProjects: [...projectCounts].filter(([, count]) => count > 1).map(([projectId]) => projectId),
    configured: adminConfigured(),
  };
}

export function bearer(request: Request) { return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null; }
