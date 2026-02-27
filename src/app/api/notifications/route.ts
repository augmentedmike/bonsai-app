import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { getCurrentHuman } from "@/lib/auth";

/** GET /api/notifications — unread count + newest notification for current user */
export async function GET(req: Request) {
  const human = await getCurrentHuman(req);
  if (!human) return NextResponse.json({ unread: 0, latest: null });

  const unreadRows = db
    .select({ count: sql<number>`count(*)`, latestId: sql<number>`max(id)` })
    .from(notifications)
    .where(and(eq(notifications.humanId, human.id), isNull(notifications.readAt)))
    .get();

  const unread = unreadRows?.count ?? 0;

  return NextResponse.json({ unread, latestId: unreadRows?.latestId ?? null });
}

/** POST /api/notifications/read — mark all notifications as read for current user */
export async function POST(req: Request) {
  const human = await getCurrentHuman(req);
  if (!human) return NextResponse.json({ ok: false }, { status: 401 });

  db.update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.humanId, human.id), isNull(notifications.readAt)))
    .run();

  return NextResponse.json({ ok: true });
}
