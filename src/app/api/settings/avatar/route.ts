import { NextResponse } from "next/server";
import { setSetting } from "@/db/data/settings";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function POST(req: Request) {
  const { avatarUrl } = await req.json();
  if (!avatarUrl) {
    return NextResponse.json({ error: "avatarUrl is required" }, { status: 400 });
  }

  // Save to settings (used by project-messages / chat)
  await setSetting("user_avatar_url", avatarUrl);
  // Keep users table in sync (used by /api/onboard/user → settings panel)
  db.run(sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = 1`);

  return NextResponse.json({ success: true });
}
