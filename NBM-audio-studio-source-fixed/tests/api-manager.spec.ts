import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN_TOKEN = "playwright-test-admin-token";
const TEST_VAULT_KEY = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex");
const authorization = { Authorization: `Bearer ${ADMIN_TOKEN}` };

async function saveConfiguration(request: APIRequestContext, id: string, name: string, enabled = true) {
  const response = await request.post("/api/studio/manager", {
    headers: authorization,
    data: { action: "save", id, name, projectId: "test-project", apiKey: "test-only-key", enabled },
  });
  expect(response.ok()).toBeTruthy();
}

async function postAction(request: APIRequestContext, action: string, payload: Record<string, unknown> = {}) {
  return request.post("/api/studio/manager", {
    headers: authorization,
    data: { action, ...payload },
  });
}

function writeLegacyVault() {
  const dataDirectory = path.join(process.cwd(), ".artifacts", "playwright-test-data");
  mkdirSync(dataDirectory, { recursive: true });
  const vault = {
    configurations: [{
      id: "",
      name: "Legacy blank ID test API",
      projectId: "legacy-test-project",
      apiKey: "test-only-key",
      translationModel: "test-translation-model",
      ttsModel: "test-tts-model",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    selected: { translation: null, tts: null },
    limits: { requestsPerMinute: 2, requestsPerHour: 20, requestsPerDay: 30, maxConcurrent: 1, minDelaySeconds: 30, maxChunkCharacters: 1200 },
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", TEST_VAULT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(vault), "utf8"), cipher.final()]);
  writeFileSync(path.join(dataDirectory, "api-vault.json"), JSON.stringify({
    version: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    data: encrypted.toString("base64"),
  }));
}

async function openManager(page: Page) {
  await page.goto("/");
  await expect(page.locator(".save-status")).toContainText("ব্রাউজারে সংরক্ষিত");
  await page.getByRole("button", { name: "API Manager" }).click();
  await page.getByRole("textbox", { name: "সার্ভার অ্যাডমিন টোকেন" }).fill(ADMIN_TOKEN);
  await page.getByRole("button", { name: "খুলুন" }).click();
  await expect(page.getByLabel("অনুবাদ API নির্বাচন")).toBeVisible();
}

test("legacy blank IDs are backfilled once and the saved selection survives reload", async ({ request }) => {
  writeLegacyVault();

  const loaded = await request.get("/api/studio/manager", { headers: authorization });
  expect(loaded.status()).toBe(200);
  const state = await loaded.json();
  const config = state.configurations[0];
  expect(config.name).toBe("Legacy blank ID test API");
  expect(config.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(config.keyConfigured).toBe(true);
  expect(state.limits.maxChunkCharacters).toBe(1200);
  expect(JSON.stringify(state)).not.toContain("test-only-key");

  const selection = await postAction(request, "select", { service: "translation", id: config.id });
  expect(selection.status()).toBe(200);
  expect((await selection.json()).selected.translation).toBe(config.id);

  const reloaded = await request.get("/api/studio/manager", { headers: authorization });
  const saved = await reloaded.json();
  expect(saved.selected.translation).toBe(config.id);
  expect(saved.configurations[0].id).toBe(config.id);
});

test("saving a new configuration with a blank form ID assigns a selectable ID", async ({ request }) => {
  const response = await postAction(request, "save", {
    id: "",
    name: "Blank form ID test API",
    projectId: "new-test-project",
    apiKey: "test-only-key",
  });
  expect(response.status()).toBe(200);
  const state = await response.json();
  const config = state.configurations.find((item: { name: string }) => item.name === "Blank form ID test API");
  expect(config.id).toMatch(/^[0-9a-f-]{36}$/i);

  const selection = await postAction(request, "select", { service: "translation", id: config.id });
  expect(selection.status()).toBe(200);
  expect((await selection.json()).selected.translation).toBe(config.id);
});

test("valid selections switch, persist, validate, and retain independent services", async ({ request }) => {
  const firstId = randomUUID();
  const secondId = randomUUID();
  const disabledId = randomUUID();
  await saveConfiguration(request, firstId, "First test API");
  await saveConfiguration(request, secondId, "Second test API");
  await saveConfiguration(request, disabledId, "Disabled test API", false);

  const firstSelection = await postAction(request, "select", { service: "translation", id: firstId });
  expect(firstSelection.status()).toBe(200);
  expect((await firstSelection.json()).selected.translation).toBe(firstId);

  const switchedSelection = await postAction(request, "select", { service: "translation", id: secondId });
  expect(switchedSelection.ok()).toBeTruthy();
  expect((await switchedSelection.json()).selected.translation).toBe(secondId);

  const rejectedSelection = await postAction(request, "select", { service: "translation", id: disabledId });
  expect(rejectedSelection.status()).toBe(400);

  const concurrentSelections = await Promise.all([
    postAction(request, "select", { service: "translation", id: firstId }),
    postAction(request, "select", { service: "tts", id: secondId }),
  ]);
  expect(concurrentSelections.every((response) => response.ok())).toBeTruthy();

  const savedState = await request.get("/api/studio/manager", { headers: authorization });
  expect(savedState.ok()).toBeTruthy();
  const saved = await savedState.json();
  expect(saved.selected).toEqual({ translation: firstId, tts: secondId });
  expect(JSON.stringify(saved)).not.toContain("test-only-key");
});

test("the manager displays the server-confirmed selection after reopening", async ({ page, request }) => {
  const id = randomUUID();
  await saveConfiguration(request, id, "Reload test API");
  await openManager(page);
  const selector = page.getByLabel("অনুবাদ API নির্বাচন");
  const selectionRequest = page.waitForRequest((request) => {
    if (request.url().endsWith("/api/studio/manager") && request.method() === "POST") {
      return (request.postDataJSON() as { action?: string }).action === "select";
    }
    return false;
  });
  const selectionResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/studio/manager") && response.request().method() === "POST",
  );
  await selector.selectOption(id);
  const selectionPostRequest = await selectionRequest;
  expect((selectionPostRequest.postDataJSON() as { service?: string; id?: string }).service).toBe("translation");
  expect((selectionPostRequest.postDataJSON() as { id?: string }).id).toBe(id);
  const response = await selectionResponse;
  expect(response.status()).toBe(200);
  expect((await response.json()).selected.translation).toBe(id);
  await expect(selector).toHaveValue(id);
  await expect(page.locator(".api-manager-message")).toContainText("নির্বাচন সংরক্ষিত হয়েছে।");
  await page.reload();
  await openManager(page);
  await expect(page.getByLabel("অনুবাদ API নির্বাচন")).toHaveValue(id);
  await expect(page.getByLabel("অনুবাদ API নির্বাচন")).toBeEnabled();
});

test("rapid changes remain responsive and save in the user's selection order", async ({ page, request }) => {
  const firstId = randomUUID();
  const secondId = randomUUID();
  await saveConfiguration(request, firstId, "Queued first API");
  await saveConfiguration(request, secondId, "Queued second API");
  await openManager(page);
  const selector = page.getByLabel("অনুবাদ API নির্বাচন");
  const postedIds: string[] = [];
  let releaseFirstResponse!: () => void;
  const firstResponseGate = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });

  await page.route("**/api/studio/manager", async (route) => {
    const body = route.request().postDataJSON() as { action?: string; id?: string };
    if (route.request().method() !== "POST" || body.action !== "select") {
      await route.continue();
      return;
    }
    postedIds.push(body.id ?? "");
    const response = await route.fetch();
    if (body.id === firstId) await firstResponseGate;
    await route.fulfill({ response });
  });

  const firstRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/studio/manager") &&
    request.method() === "POST" &&
    (request.postDataJSON() as { id?: string }).id === firstId,
  );
  await selector.selectOption(firstId);
  await firstRequest;
  await selector.selectOption(secondId);
  await expect(selector).toHaveValue(secondId);
  await expect(selector).toBeEnabled();
  expect(postedIds).toEqual([firstId]);

  releaseFirstResponse();
  await expect.poll(() => postedIds).toEqual([firstId, secondId]);
  await expect(page.locator(".api-manager-message")).toContainText("নির্বাচন সংরক্ষিত হয়েছে।");
  const savedState = await request.get("/api/studio/manager", { headers: authorization });
  expect((await savedState.json()).selected.translation).toBe(secondId);
});

test("a failed selection save restores the confirmed value and shows an actionable error", async ({ page, request }) => {
  const id = randomUUID();
  await saveConfiguration(request, id, "Failure test API");
  await openManager(page);
  const selector = page.getByLabel("অনুবাদ API নির্বাচন");
  const confirmedValue = await selector.inputValue();

  await page.route("**/api/studio/manager", async (route) => {
    const requestBody = route.request().postDataJSON() as { action?: string };
    if (requestBody.action === "select") {
      await route.fulfill({ status: 500, json: { error: "Test save failed; retry the selection." } });
      return;
    }
    await route.continue();
  });

  await selector.selectOption(id);
  await expect(page.locator(".api-manager-message")).toContainText("Test save failed; retry the selection.");
  await expect(page.locator(".api-manager-message")).toBeInViewport();
  await expect(selector).toHaveValue(confirmedValue);
});
