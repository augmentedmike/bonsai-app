import { db, asAsync, runAsync } from "./_driver";
import { settings } from "../schema";
import { eq, like } from "drizzle-orm";

// In-memory cache with 30s TTL to avoid redundant DB reads during dispatch
const CACHE_TTL_MS = 30_000;
const settingsCache = new Map<string, { value: string | null; expiresAt: number }>();

export function getSetting(key: string): Promise<string | null> {
  const cached = settingsCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return asAsync(cached.value);
  }
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  const value = row?.value ?? null;
  settingsCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return asAsync(value);
}

export function setSetting(key: string, value: string): Promise<void> {
  return runAsync(() => {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
    settingsCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  });
}

export function deleteSetting(key: string): Promise<void> {
  return runAsync(() => {
    db.delete(settings).where(eq(settings.key, key)).run();
    settingsCache.delete(key);
  });
}

export function getSettingsByPrefix(prefix: string): Promise<Array<{ key: string; value: string }>> {
  const rows = db.select().from(settings).where(like(settings.key, `${prefix}%`)).all();
  return asAsync(rows.map(r => ({ key: r.key, value: r.value })));
}

export function deleteSettingsByPrefix(prefix: string): Promise<void> {
  return runAsync(() => {
    db.delete(settings).where(like(settings.key, `${prefix}%`)).run();
  });
}
