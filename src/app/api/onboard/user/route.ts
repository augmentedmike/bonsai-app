import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// GET /api/onboard/user — return the first user from the users table
export async function GET() {
  const row = db.all(sql`SELECT id, name, avatar_url as avatarUrl FROM users LIMIT 1`)[0] as
    | { id: number; name: string; avatarUrl: string | null }
    | undefined;

  if (!row) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: { id: row.id, name: row.name, avatarUrl: row.avatarUrl },
  });
}
