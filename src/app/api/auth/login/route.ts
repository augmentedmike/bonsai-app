import { NextResponse } from "next/server";
import {
  getHumanByEmail,
  createHuman,
  createSession,
  verifyPassword,
  countHumans,
} from "@/db/data/humans";

const COOKIE_NAME = "bonsai_session";

function sessionCookie(sessionId: string, expiresAt: Date): string {
  return `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

/**
 * POST /api/auth/login
 *
 * Normal login:   { email, password }
 * First-run setup: { email, name, password, setup: true }
 *   — only allowed when no humans exist in the DB.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password, name, setup } = body as {
    email?: string;
    password?: string;
    name?: string;
    setup?: boolean;
  };

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // ── First-run setup ──────────────────────────────────────────────────────
  if (setup) {
    const count = await countHumans();
    if (count > 0) {
      return NextResponse.json(
        { error: "Setup already complete. Use the login form." },
        { status: 403 }
      );
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required for setup" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const human = await createHuman({
      email: email.trim(),
      name: name.trim(),
      password,
      isOwner: true,
    });
    console.log(`[auth] Created owner account: ${human.email}`);

    const session = await createSession(human.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: COOKIE_NAME,
      value: session.id,
      httpOnly: true,
      sameSite: "lax",
      expires: new Date(session.expiresAt),
      path: "/",
    });
    return res;
  }

  // ── Normal login ─────────────────────────────────────────────────────────
  const human = await getHumanByEmail(email.trim());
  if (!human) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ok = await verifyPassword(human, password);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const session = await createSession(human.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: session.id,
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(session.expiresAt),
    path: "/",
  });
  return res;
}
