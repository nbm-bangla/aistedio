export const dynamic = "force-dynamic";

export async function GET() {
  let translationConnected = false;
  let ttsConnected = false;
  try {
    const { readVault } = await import("@/lib/server/api-manager");
    const vault = await readVault();
    translationConnected = Boolean(vault.configurations.find((config) => config.id === vault.selected.translation && config.enabled && config.apiKey));
    ttsConnected = Boolean(vault.configurations.find((config) => config.id === vault.selected.tts && config.enabled && config.apiKey));
  } catch { /* No configured encrypted vault means no configured API connection. */ }
  return Response.json({ ok: true, application: "NBM Audio Studio", mode: "local", translationConnected, ttsConnected, databaseConnected: false }, { headers: { "Cache-Control": "no-store" } });
}
