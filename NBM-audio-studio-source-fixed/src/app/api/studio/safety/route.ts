import { DEFAULT_LIMITS, readVault } from "@/lib/server/api-manager";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const vault = await readVault();
    const translation = vault.configurations.find((config) => config.id === vault.selected.translation && config.enabled);
    const tts = vault.configurations.find((config) => config.id === vault.selected.tts && config.enabled);
    return Response.json({ limits: vault.limits, models: { translation: translation?.translationModel ?? null, tts: tts?.ttsModel ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ limits: DEFAULT_LIMITS, configured: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
