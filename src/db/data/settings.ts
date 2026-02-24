import { db, asAsync, runAsync } from "./_driver";
import { settings } from "../schema";
import { eq, like } from "drizzle-orm";

export function getSetting(key: string): Promise<string | null> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return asAsync(row?.value ?? null);
}

export function setSetting(key: string, value: string): Promise<void> {
  return runAsync(() => {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  });
}

export function deleteSetting(key: string): Promise<void> {
  return runAsync(() => {
    db.delete(settings).where(eq(settings.key, key)).run();
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
