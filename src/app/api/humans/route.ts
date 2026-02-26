import { NextResponse } from "next/server";
import { getHumans, createHuman, getHumanByEmail } from "@/db/data/humans";
import { getCurrentHuman } from "@/lib/auth";

/**
 * GET /api/humans
 * List all registered humans (auth required).
 */
export async function GET(req: Request) {
  const actor = await getCurrentHuman(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await getHumans();
  return NextResponse.json({ humans: list });
}

/**
 * POST /api/humans
 * Create a new human account (owner only).
 * Body: { name: string, email: string, password: string }
 */
export async function POST(req: Request) {
  const actor = await getCurrentHuman(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.isOwner) return NextResponse.json({ error: "Owner only" }, { status: 403 });

  const { name, email, password } = await req.json().catch(() => ({})) as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await getHumanByEmail(email.trim());
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const human = await createHuman({ name: name.trim(), email: email.trim(), password });
  return NextResponse.json({ human }, { status: 201 });
}
