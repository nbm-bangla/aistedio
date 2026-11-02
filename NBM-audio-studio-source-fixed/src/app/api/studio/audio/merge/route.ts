import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const root = () => path.resolve(process.env.NBM_DATA_DIR || path.join(process.cwd(), ".nbm-data"), "audio");

export async function POST(request: Request) {
  let body: { audioIds?: unknown; speed?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!Array.isArray(body.audioIds) || !body.audioIds.length || body.audioIds.length > 10000 || !body.audioIds.every((id) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id))) return Response.json({ error: "A sequence of completed audio segments is required." }, { status: 400 });
  const speed = Number(body.speed ?? 1);
  if (![0.8, 1, 1.25].includes(speed)) return Response.json({ error: "Unsupported narration speed." }, { status: 400 });
  const executable = ffmpegPath;
  if (!executable) return Response.json({ error: "FFmpeg is unavailable on this platform." }, { status: 501 });
  const dir = root();
  const id = randomUUID();
  const listPath = path.join(dir, `${id}.concat.txt`);
  const outputPath = path.join(dir, `${id}.wav`);
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const files = (body.audioIds as string[]).map((audioId) => path.join(dir, `${audioId}.wav`));
    for (const file of files) await access(file);
    const list = files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "\\'")}'`).join("\n");
    await writeFile(listPath, list, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath];
      args.push("-c", "copy");
      args.push(outputPath);
      const child = spawn(executable, args, { windowsHide: true, stdio: "ignore" });
      child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg merge failed (${code}).`)));
    });
    return Response.json({ id, url: `/api/studio/audio/${id}?format=wav&speed=${speed}`, mp3Url: `/api/studio/audio/${id}?format=mp3&speed=${speed}`, segments: files.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not merge the audio segments." }, { status: 500 });
  } finally { await rm(listPath, { force: true }).catch(() => undefined); }
}
