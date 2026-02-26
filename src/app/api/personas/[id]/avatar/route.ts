import { NextResponse } from "next/server";
import { getPersonaRaw } from "@/db/data/personas";

// GET /api/personas/[id]/avatar — serve the persona's avatar image
// Returns the stored PNG/JPEG with long-lived cache headers so the browser
// only fetches it once per day instead of embedding the blob in every
// comments/agent-runs response.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const persona = await getPersonaRaw(id);

  if (!persona?.avatar) {
    return new NextResponse(null, { status: 404 });
  }

  const match = persona.avatar.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return new NextResponse(null, { status: 404 });
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
