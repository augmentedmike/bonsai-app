import { db, asAsync, runAsync } from "./_driver";
import { ticketAttachments } from "../schema";
import { eq, and } from "drizzle-orm";

export function getAttachmentsByTicket(ticketId: number) {
  const rows = db
    .select()
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, ticketId))
    .all();
  return asAsync(rows);
}

export function getAttachment(id: number) {
  const row = db
    .select()
    .from(ticketAttachments)
    .where(eq(ticketAttachments.id, id))
    .get();
  return asAsync(row ?? null);
}

export function createAttachment(data: {
  ticketId: number;
  filename: string;
  mimeType: string;
  data: string;
  tag?: string | null;
  createdByType: "human" | "agent";
  createdById?: string | null;
}) {
  const row = db
    .insert(ticketAttachments)
    .values({
      ticketId: data.ticketId,
      filename: data.filename,
      mimeType: data.mimeType,
      data: data.data,
      tag: data.tag || null,
      createdByType: data.createdByType,
      createdById: data.createdById || null,
    })
    .returning()
    .get();
  return asAsync(row);
}

export function getAttachmentsByTag(ticketId: number, tag: string) {
  const rows = db
    .select()
    .from(ticketAttachments)
    .where(and(eq(ticketAttachments.ticketId, ticketId), eq(ticketAttachments.tag, tag)))
    .all();
  return asAsync(rows);
}

export function getLatestAttachmentByTag(ticketId: number, tag: string) {
  const rows = db
    .select()
    .from(ticketAttachments)
    .where(and(eq(ticketAttachments.ticketId, ticketId), eq(ticketAttachments.tag, tag)))
    .all();
  // Return the most recent one (highest id)
  const sorted = rows.sort((a, b) => b.id - a.id);
  return asAsync(sorted[0] ?? null);
}

export function deleteAttachment(id: number): Promise<void> {
  return runAsync(() => {
    db.delete(ticketAttachments).where(eq(ticketAttachments.id, id)).run();
  });
}

export function updateAttachmentData(
  id: number,
  data: { data: string; mimeType: string }
): Promise<void> {
  return runAsync(() => {
    db.update(ticketAttachments)
      .set({ data: data.data, mimeType: data.mimeType })
      .where(eq(ticketAttachments.id, id))
      .run();
  });
}
