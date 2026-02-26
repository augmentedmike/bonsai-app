#!/usr/bin/env tsx
/**
 * seed-augmentedmike.ts — Inserts the MiniClaw Soul role and AugmentedMike persona.
 *
 * Usage:
 *   BONSAI_ENV=dev npx tsx scripts/seed-augmentedmike.ts
 */

import Database from "better-sqlite3";
import path from "node:path";

const dbDir = process.env.BONSAI_DB_DIR || path.join(process.cwd(), ".data");
const env = process.env.BONSAI_ENV || "prod";
const dbFile = env === "dev" ? "bonsai-dev.db" : "bonsai.db";
const dbPath = path.join(dbDir, dbFile);

console.log(`[seed-augmentedmike] Opening DB: ${dbPath}`);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// ── 1. Ensure miniclaw_soul role exists ──────────────────────────────────
const existingRole = db
  .prepare("SELECT id FROM roles WHERE slug = ?")
  .get("miniclaw_soul") as { id: number } | undefined;

let roleId: number;

if (existingRole) {
  roleId = existingRole.id;
  console.log(`[seed-augmentedmike] Role 'miniclaw_soul' already exists (id=${roleId})`);
} else {
  const result = db.prepare(
    `INSERT INTO roles (slug, title, description, color)
     VALUES (?, ?, ?, ?)`
  ).run(
    "miniclaw_soul",
    "MiniClaw Soul",
    "A soul for a MiniClaw avatar",
    "#ec4899"
  );
  roleId = Number(result.lastInsertRowid);
  console.log(`[seed-augmentedmike] Created role 'miniclaw_soul' (id=${roleId})`);
}

// ── 2. Ensure AugmentedMike persona exists ───────────────────────────────
const existingPersona = db
  .prepare("SELECT id, name FROM personas WHERE slug = ? AND deleted_at IS NULL")
  .get("augmentedmike") as { id: string; name: string } | undefined;

if (existingPersona) {
  console.log(`[seed-augmentedmike] Persona 'AugmentedMike' already exists (id=${existingPersona.id})`);
} else {
  const id = "g-augmentedmike";
  db.prepare(
    `INSERT INTO personas (id, name, slug, color, role, role_id, personality, skills, processes, goals, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    id,
    "AugmentedMike",
    "augmentedmike",
    "#ec4899",
    "miniclaw_soul",
    roleId,
    "I am AugmentedMike — Michael ONeal's digital representation. I run 24/7 on AugmentedMikes-Mac-mini. I ship autonomously, report clearly, and coordinate with the team.",
    JSON.stringify(["Full-stack development", "System administration", "Automation", "Research", "Writing"]),
    JSON.stringify(["Autonomous execution", "Progress reporting", "Team coordination"]),
    JSON.stringify(["Keep systems running", "Ship autonomously", "Report status clearly"]),
  );
  console.log(`[seed-augmentedmike] Created persona 'AugmentedMike' (id=${id}, role=miniclaw_soul)`);
}

console.log("[seed-augmentedmike] Done.");
db.close();
