import { getSessionWithHuman } from "@/db/data/humans";
import type { Human } from "@/db/data/humans";

const COOKIE_NAME = "bonsai_session";

/**
 * Read the "bonsai_session" cookie from the request and return the authenticated
 * Human, or null if the session is missing, expired, or invalid.
 */
export async function getCurrentHuman(req: Request): Promise<Human | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const sessionId = parseCookie(cookieHeader, COOKIE_NAME);
  if (!sessionId) return null;

  const result = await getSessionWithHuman(sessionId);
  return result?.human ?? null;
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [k, ...vs] = part.trim().split("=");
    if (k.trim() === name) return decodeURIComponent(vs.join("="));
  }
  return null;
}

export { COOKIE_NAME };
