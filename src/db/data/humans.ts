import { db, asAsync, runAsync } from "./_driver";
import { humans, sessions } from "../schema";
import { eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

export type Human = typeof humans.$inferSelect;
export type Session = typeof sessions.$inferSelect;

// ── Humans ────────────────────────────────────────────────────────────────

export function getHumans(): Promise<Human[]> {
  return asAsync(db.select().from(humans).orderBy(humans.createdAt).all());
}

export function getHumanById(id: number): Promise<Human | null> {
  return asAsync(db.select().from(humans).where(eq(humans.id, id)).get() ?? null);
}

export function getHumanByEmail(email: string): Promise<Human | null> {
  return asAsync(
    db.select().from(humans).where(eq(humans.email, email.toLowerCase().trim())).get() ?? null
  );
}

export async function createHuman(data: {
  email: string;
  name: string;
  password: string;
  isOwner?: boolean;
}): Promise<Human> {
  const passwordHash = await bcrypt.hash(data.password, 12);
  const row = db
    .insert(humans)
    .values({
      email: data.email.toLowerCase().trim(),
      name: data.name,
      passwordHash,
      isOwner: data.isOwner ?? false,
    })
    .returning()
    .get();
  return asAsync(row);
}

export async function verifyPassword(human: Human, password: string): Promise<boolean> {
  if (!human.passwordHash) return false;
  return bcrypt.compare(password, human.passwordHash);
}

export async function setPassword(humanId: number, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  db.update(humans).set({ passwordHash }).where(eq(humans.id, humanId)).run();
}

export function setAvatarData(humanId: number, avatarData: string): Promise<Human | null> {
  const row = db.update(humans).set({ avatarData }).where(eq(humans.id, humanId)).returning().get();
  return asAsync(row ?? null);
}

export function updateHuman(id: number, data: Partial<Pick<Human, "name" | "email">>): Promise<Human | null> {
  const update: Partial<Pick<Human, "name" | "email">> = {};
  if (data.name) update.name = data.name;
  if (data.email) update.email = data.email.toLowerCase().trim();
  const row = db.update(humans).set(update).where(eq(humans.id, id)).returning().get();
  return asAsync(row ?? null);
}

export function deleteHuman(id: number): Promise<void> {
  return runAsync(() => {
    db.delete(humans).where(eq(humans.id, id)).run();
  });
}

export function countHumans(): Promise<number> {
  const row = db.select({ count: humans.id }).from(humans).all();
  return asAsync(row.length);
}

// ── Sessions ──────────────────────────────────────────────────────────────

const SESSION_DAYS = 30;

export function createSession(humanId: number): Promise<Session> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const row = db
    .insert(sessions)
    .values({ id, humanId, expiresAt })
    .returning()
    .get();
  return asAsync(row);
}

export function getSessionWithHuman(sessionId: string): Promise<{ session: Session; human: Human } | null> {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return asAsync(null);
  if (new Date(session.expiresAt) <= new Date()) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return asAsync(null);
  }
  const human = db.select().from(humans).where(eq(humans.id, session.humanId)).get();
  if (!human) return asAsync(null);
  return asAsync({ session, human });
}

export function deleteSession(sessionId: string): Promise<void> {
  return runAsync(() => {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  });
}

export function pruneExpiredSessions(): Promise<void> {
  return runAsync(() => {
    db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
  });
}
