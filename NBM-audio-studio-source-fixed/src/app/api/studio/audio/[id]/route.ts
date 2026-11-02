import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dir = () => path.resolve(process.env.NBM_DATA_DIR || path.join(process.cwd(), ".nbm-data"), "audio");

async function convert(input: string, output: string, format: string, speed: number) {
  const executable = ffmpegPath;
  if (!executable) throw new Error("FFmpeg is not available on this platform.");
  await new Promise<void>((resolve, reject) => {
    const args = ["-y", "-i", input];
    if (speed !== 1) args.push("-filter:a", `atempo=${speed}`);
    if (format === "mp3") args.push("-codec:a", "libmp3lame", "-b:a", "128k");
    else args.push("-codec:a", "pcm_s16le");
    args.push(output);
    const child = spawn(executable, args, { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}.`)));
  });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const format = new URL(request.url).searchParams.get("format") ?? "wav";
  if (format !== "wav" && format !== "mp3") return new Response("Unsupported format", { status: 400 });
  const speed = Number(new URL(request.url).searchParams.get("speed") ?? "1");
  if (![0.8, 1, 1.25].includes(speed)) return new Response("Unsupported speed", { status: 400 });
  const wavPath = path.join(dir(), `${id}.wav`);
  const outputPath = speed === 1 && format === "wav" ? wavPath : path.join(dir(), `${id}-${speed}.${format}`);
  try {
    await access(wavPath);
    try { await access(outputPath); } catch { await convert(wavPath, outputPath, format, speed); }
    const bytes = await readFile(outputPath);
    return new Response(bytes, { headers: { "Content-Type": format === "wav" ? "audio/wav" : "audio/mpeg", "Content-Disposition": `inline; filename="nbm-audio-${id}.${format}"`, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return new Response(error instanceof Error && error.message.includes("FFmpeg") ? "MP3 conversion is not supported by this installation." : "Audio file not found", { status: error instanceof Error && error.message.includes("FFmpeg") ? 501 : 404 });
  }
}
