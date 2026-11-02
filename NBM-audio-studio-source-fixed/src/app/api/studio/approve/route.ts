import { createHmac } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== request.headers.get("host"))) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  const key = process.env.NBM_VAULT_ENCRYPTION_KEY;
  if (!key || !/^[\da-f]{64}$/i.test(key)) return Response.json({ error: "Server approval signing is NOT CONNECTED. Configure NBM_VAULT_ENCRYPTION_KEY." }, { status: 503 });
  let body: { documentId?: unknown; text?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.documentId !== "string" || typeof body.text !== "string" || !body.text.trim()) return Response.json({ error: "A document and reviewed Bengali text are required." }, { status: 400 });
  const signature = createHmac("sha256", Buffer.from(key, "hex")).update(`${body.documentId}\0${body.text}`).digest("hex");
  return Response.json({ signature }, { headers: { "Cache-Control": "no-store" } });
}
