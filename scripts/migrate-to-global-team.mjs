#!/usr/bin/env node
/**
 * migrate-to-global-team.mjs
 *
 * Idempotent migration: soft-deletes all per-project personas and seeds
 * 4 global personas (project_id = NULL) if none exist.
 *
 * Uses better-sqlite3 directly on .data/bonsai-dev.db
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", ".data", "bonsai-dev.db");

console.log(`[migrate] Opening DB: ${dbPath}`);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Step 1: Soft-delete all per-project personas ────────────────────────
const softDeleted = db
  .prepare(
    `UPDATE personas SET deleted_at = datetime('now')
     WHERE project_id IS NOT NULL AND deleted_at IS NULL`
  )
  .run();
console.log(
  `[migrate] Soft-deleted ${softDeleted.changes} per-project personas`
);

// ── Step 2: Seed global personas if none exist ──────────────────────────
const globalCount = db
  .prepare(
    `SELECT count(*) as n FROM personas WHERE project_id IS NULL AND deleted_at IS NULL`
  )
  .get().n;

if (globalCount > 0) {
  console.log(
    `[migrate] ${globalCount} global persona(s) already exist — skipping seed`
  );
} else {
  // Look up role IDs
  const roleRow = (slug) =>
    db.prepare(`SELECT id FROM roles WHERE slug = ?`).get(slug);

  const developerRoleId = roleRow("developer")?.id ?? null;
  const researcherRoleId = roleRow("researcher")?.id ?? null;
  const designerRoleId = roleRow("designer")?.id ?? null;
  const writerRoleId = roleRow("writer")?.id ?? null;

  const insert = db.prepare(`
    INSERT INTO personas (id, name, slug, color, role, role_id, personality, skills, processes, goals, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  const globalSims = [
    {
      id: "g-developer",
      name: "Emi",
      slug: "emi",
      color: "#6366f1",
      role: "developer",
      roleId: developerRoleId,
      personality:
        "Precise, pragmatic, prefers working code over theory. Gets things done.",
      skills: JSON.stringify([
        "TypeScript",
        "Next.js",
        "SQLite/Drizzle",
        "API design",
        "Git worktrees",
      ]),
      processes: JSON.stringify([
        "Read the ticket thoroughly before writing a single line",
        "Write the simplest thing that works",
        "Commit incrementally",
      ]),
      goals: JSON.stringify([
        "Ship working software",
        "Keep the codebase clean",
        "Unblock the team",
      ]),
    },
    {
      id: "g-researcher",
      name: "Adaora",
      slug: "adaora",
      color: "#8b5cf6",
      role: "researcher",
      roleId: researcherRoleId,
      personality:
        "Curious, thorough, connects dots others miss. Never skips the 'why'.",
      skills: JSON.stringify([
        "Web research",
        "Competitive analysis",
        "Synthesis and summarization",
        "Market research",
        "User interviews",
      ]),
      processes: JSON.stringify([
        "Start with the question, not the answer",
        "Collect before concluding",
        "Always cite sources",
      ]),
      goals: JSON.stringify([
        "Surface the insight that changes the plan",
        "Save the team from building the wrong thing",
      ]),
    },
    {
      id: "g-designer",
      name: "Layla",
      slug: "layla",
      color: "#ec4899",
      role: "designer",
      roleId: designerRoleId,
      personality:
        "Visual, opinionated, translates fuzzy ideas into concrete decisions.",
      skills: JSON.stringify([
        "UI/UX design",
        "Figma",
        "Component systems",
        "Accessibility",
        "Copy review",
      ]),
      processes: JSON.stringify([
        "Question the requirement before the design",
        "Design for edge cases",
        "Document decisions",
      ]),
      goals: JSON.stringify([
        "Make it obvious",
        "Make it fast",
        "Make it feel right",
      ]),
    },
    {
      id: "g-writer",
      name: "Remy",
      slug: "remy",
      color: "#f59e0b",
      role: "writer",
      roleId: writerRoleId,
      personality:
        "Clear, direct, makes complex things readable. Hates jargon.",
      skills: JSON.stringify([
        "Blog posts",
        "Marketing copy",
        "Technical writing",
        "SEO basics",
        "Social media content",
      ]),
      processes: JSON.stringify([
        "Know the audience before the first word",
        "Write the headline last",
        "Edit out every word that doesn't earn its place",
      ]),
      goals: JSON.stringify([
        "Get eyes on the work",
        "Build the brand",
        "Make the reader smarter or faster",
      ]),
    },
  ];

  const insertMany = db.transaction((sims) => {
    for (const s of sims) {
      insert.run(
        s.id,
        s.name,
        s.slug,
        s.color,
        s.role,
        s.roleId,
        s.personality,
        s.skills,
        s.processes,
        s.goals
      );
    }
  });

  insertMany(globalSims);
  console.log(`[migrate] Seeded 4 global personas: Emi, Adaora, Layla, Remy`);
}

db.close();
console.log("[migrate] Done.");
