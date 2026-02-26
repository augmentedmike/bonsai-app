import { NextResponse } from "next/server";
import { deleteSession } from "@/db/data/humans";

const COOKIE_NAME = "bonsai_session";

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [k, ...vs] = part.trim().split("=");
    if (k.trim() === name) return decodeURIComponent(vs.join("="));
  }
  return null;
}

/**
 * POST /api/auth/logout
 * Delete the session and clear the cookie.
 */
export async function POST(req: Request) {
  const sessionId = parseCookie(req.headers.get("cookie") ?? "", COOKIE_NAME);
  if (sessionId) await deleteSession(sessionId);

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  return res;
}
