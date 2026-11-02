import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createSegments, SAMPLE_BENGALI, SAMPLE_ENGLISH } from "../src/lib/studio/samples";

async function load(page: Page) {
  await page.goto("/");
  await expect(page.locator(".save-status")).toContainText("ব্রাউজারে সংরক্ষিত");
}

function textPdf(): Buffer {
  const stream = "BT /F1 15 Tf 50 740 Td (PDF text import preserves this sentence.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("chunking preserves all source characters, ordering, and paragraph separators", () => {
  for (const source of [SAMPLE_ENGLISH, `\n\n${SAMPLE_ENGLISH}\n\n`, "First\n\nSecond\n\nThird", "A very long paragraph. ".repeat(200)]) {
    const segments = createSegments(source, 80);
    expect(segments.map((segment) => segment.source + segment.separator).join("")).toBe(source);
    expect(segments.every((segment, index) => segment.order === index)).toBeTruthy();
    expect(segments.every((segment) => segment.source.length <= 80)).toBeTruthy();
  }
});

test("the existing two workflows and My Work remain accessible, with no third workflow", async ({ page }) => {
  await load(page);
  await expect(page.locator(".main-navigation .nav-item")).toHaveCount(3);
  for (const label of ["বাংলা অডিও", "অনুবাদ ও অডিও", "আমার কাজ"]) await expect(page.locator(".main-navigation .nav-item").filter({ hasText: label })).toHaveCount(1);
  await expect(page.locator("#bengali-text")).toHaveValue(SAMPLE_BENGALI);
  await expect(page.getByRole("button", { name: "API Manager" })).toBeVisible();
  await expect(page.locator(".demo-mode")).toContainText("NOT CONNECTED");
});

test("translation audio stays blocked until review approval and editing invalidates approval", async ({ page }) => {
  await load(page);
  await page.locator(".main-navigation").getByText("অনুবাদ ও অডিও", { exact: true }).click();
  await expect(page.locator("#source-text")).toHaveValue(SAMPLE_ENGLISH);
  const generate = page.getByRole("button", { name: "বাংলা অডিও তৈরি করুন", exact: true });
  await expect(generate).toBeDisabled();
  const translation = "আজ সকালে জানালা খুলতেই রোদ এসে পড়ল।";
  await page.locator("#translation-text").fill(translation);
  const approveButton = page.getByRole("button", { name: "পর্যালোচনা করে অনুমোদন", exact: true });
  await approveButton.click();
  await expect(page.locator(".toast")).toContainText("পর্যালোচনা করে অনুমোদন করা হয়েছে");
  await expect(page.getByRole("button", { name: "অনুমোদিত", exact: true })).toBeVisible();
  await expect(generate).toBeEnabled();
  await page.locator("#translation-text").fill(`${translation} নতুন বাক্য।`);
  await expect(generate).toBeDisabled();
  await expect(page.locator("#source-text")).toHaveValue(SAMPLE_ENGLISH);
});

test("a provider 429 retries only the pending translation chunk after ten seconds", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/studio/safety", (route) => route.fulfill({ json: { limits: { maxChunkCharacters: 1800, minDelaySeconds: 0 }, models: { translation: "test-model", tts: "test-tts" } } }));
  await page.route("**/api/studio/process", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    if (calls.length === 1) return route.fulfill({ status: 429, json: { error: "Provider rate limited this request.", retryableProviderRateLimit: true } });
    return route.fulfill({ json: { translation: "সুপ্রভাত।", cached: false } });
  });
  await load(page);
  await page.locator(".main-navigation").getByText("অনুবাদ ও অডিও", { exact: true }).click();
  await page.locator("#source-text").fill("Good morning.");
  await page.getByRole("button", { name: "বাংলায় অনুবাদ করুন", exact: true }).click();
  await expect.poll(() => calls.length).toBe(1);
  await expect.poll(() => calls.length, { timeout: 12_000 }).toBe(2);
  expect(calls[0]).toEqual(calls[1]);
  await expect(page.locator("#translation-text")).toHaveValue("সুপ্রভাত।");
  await expect(page.locator(".translation-job")).toContainText("অনুবাদ সম্পূর্ণ");
});

test("TXT and native text-layer PDF imports preserve their readable content", async ({ page }) => {
  await load(page);
  const imported = "\nহুবহু TXT আমদানি।\n\nশেষ অনুচ্ছেদ।  ";
  let chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /ফাইল যোগ করুন/ }).click();
  await (await chooser).setFiles({ name: "story.txt", mimeType: "text/plain", buffer: Buffer.from(imported) });
  await expect(page.locator("#bengali-text")).toHaveValue(imported);
  chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /ফাইল যোগ করুন/ }).click();
  await (await chooser).setFiles({ name: "story.pdf", mimeType: "application/pdf", buffer: textPdf() });
  await page.getByRole("dialog").getByRole("button", { name: "ফাইলের লেখা যোগ করুন", exact: true }).click();
  await expect(page.locator("#bengali-text")).toHaveValue(/PDF text import preserves this sentence/);
  await expect(page.locator(".imported-file")).toContainText("১ পৃষ্ঠা");
});

test("API Manager does not expose vault data without authentication", async ({ request }) => {
  const response = await request.get("/api/studio/manager");
  expect(response.status()).toBe(401);
  const payload = await response.json();
  expect(JSON.stringify(payload)).not.toContain("apiKey");
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const healthPayload = await health.json();
  expect(healthPayload.translationConnected).toBe(false);
  expect(healthPayload.ttsConnected).toBe(false);
  expect(JSON.stringify(healthPayload)).not.toMatch(/AIza|apiKey|secret/i);
});

test("audio endpoints serve WAV and convert it to playable MP3 with FFmpeg", async ({ request }) => {
  const id = "a0000000-0000-4000-8000-000000000001";
  const audioDir = path.join(process.cwd(), ".artifacts", "playwright-test-data", "audio");
  mkdirSync(audioDir, { recursive: true });
  const sampleRate = 8000;
  const sampleCount = sampleRate;
  const wav = Buffer.alloc(44 + sampleCount * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(sampleCount * 2, 40);
  for (let i = 0; i < sampleCount; i++) wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 5000), 44 + i * 2);
  writeFileSync(path.join(audioDir, `${id}.wav`), wav);

  const wavResponse = await request.get(`/api/studio/audio/${id}?format=wav`);
  expect(wavResponse.ok()).toBeTruthy();
  expect(wavResponse.headers()["content-type"]).toContain("audio/wav");
  expect(Buffer.from(await wavResponse.body()).subarray(0, 4).toString()).toBe("RIFF");
  const mp3Response = await request.get(`/api/studio/audio/${id}?format=mp3`);
  expect(mp3Response.ok(), `MP3 conversion failed: ${await mp3Response.text()}`).toBeTruthy();
  expect(mp3Response.headers()["content-type"]).toContain("audio/mpeg");
  expect(Buffer.from(await mp3Response.body()).length).toBeGreaterThan(100);
});

test("API Manager keeps its admin token password-masked and reports missing setup safely", async ({ page }) => {
  await load(page);
  await page.getByRole("button", { name: "API Manager" }).click();
  await expect(page.getByRole("dialog")).toContainText("কোনো স্বয়ংক্রিয় পরিবর্তন");
  await page.getByLabel("সার্ভার অ্যাডমিন টোকেন").fill("test-token");
  await expect(page.getByLabel("সার্ভার অ্যাডমিন টোকেন")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "খুলুন", exact: true }).click();
  await expect(page.locator(".api-manager-message[role=alert]")).toContainText("invalid");
});

test("API Manager keeps a selected configuration visible while server selection is pending", async ({ page }) => {
  const id = "a0000000-0000-4000-8000-000000000002";
  const state = {
    configurations: [{ id, name: "ritu 1296", projectId: "ritu-1296", translationModel: "gemini-3.5-flash-lite", ttsModel: "gemini-3.8-flash-tts", enabled: true, keyConfigured: true, maskedKey: "••••1296" }],
    selected: { translation: null as string | null, tts: null as string | null },
    limits: { requestsPerMinute: 1, requestsPerHour: 10, requestsPerDay: 10, maxConcurrent: 1, minDelaySeconds: 60, maxChunkCharacters: 1800 },
    sharedProjects: [], configured: true, usage: {},
  };
  let responseCompleted = false;
  await page.route("**/api/studio/manager", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: state });
    const body = route.request().postDataJSON() as { action: string; service: "translation" | "tts"; id: string };
    expect(body).toMatchObject({ action: "select", service: "translation", id });
    await new Promise((resolve) => setTimeout(resolve, 800));
    state.selected.translation = body.id;
    responseCompleted = true;
    return route.fulfill({ json: state });
  });
  await load(page);
  await page.getByRole("button", { name: "API Manager" }).click();
  await page.getByLabel("সার্ভার অ্যাডমিন টোকেন").fill("playwright-test-admin-token");
  await page.getByRole("button", { name: "খুলুন", exact: true }).click();
  const selector = page.getByLabel("অনুবাদ API নির্বাচন");
  await expect(selector.locator("option").filter({ hasText: "ritu 1296" })).toHaveCount(1);
  const savedResponse = page.waitForResponse((response) => response.url().includes("/api/studio/manager") && response.request().method() === "POST");
  await selector.selectOption(id);
  expect(responseCompleted).toBe(false);
  await expect(selector).toHaveValue(id);
  await expect(selector).toBeEnabled();
  await expect(selector).toBeFocused();
  expect((await savedResponse).ok()).toBeTruthy();
  await expect(selector).toHaveValue(id);
  await expect(selector).toBeEnabled();
  await expect(page.locator(".api-manager-message[role=status]")).toContainText("নির্বাচন সংরক্ষিত");
  await page.getByRole("button", { name: "বন্ধ করুন", exact: true }).click();
  await page.getByRole("button", { name: "API Manager" }).click();
  await page.getByLabel("সার্ভার অ্যাডমিন টোকেন").fill("playwright-test-admin-token");
  await page.getByRole("button", { name: "খুলুন", exact: true }).click();
  await expect(page.getByLabel("অনুবাদ API নির্বাচন")).toHaveValue(id);
});

test("mobile layout retains navigation without horizontal overflow", async ({ page }) => {
  await load(page);
  for (const width of [320, 360, 390, 520, 760]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => ({
      amount: document.documentElement.scrollWidth - innerWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")]
        .map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) }))
        .filter((element) => element.right > innerWidth + 1).slice(0, 8),
    }));
    expect(overflow.amount, `horizontal overflow at ${width}px: ${JSON.stringify(overflow.offenders)}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-navigation").getByText("অনুবাদ ও অডিও", { exact: true }).click();
  await expect(page.locator("#translation-text")).toBeVisible();
});
