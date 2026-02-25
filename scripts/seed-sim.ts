#!/usr/bin/env tsx
/**
 * seed-sim.ts — CLI to insert a new global persona (project_id = NULL).
 *
 * Usage:
 *   npx tsx scripts/seed-sim.ts --role writer --name "Remy"
 *   npx tsx scripts/seed-sim.ts --role developer --name "Emi" --history "Former lead eng." --tasks "Build auth module"
 *   npx tsx scripts/seed-sim.ts --role designer --name "Layla" --force
 *
 * Options:
 *   --role     Required. One of: developer, researcher, designer, writer
 *   --name     Required. Display name for the persona
 *   --history  Optional. Background / history text
 *   --tasks    Optional. Initial task queue description
 *   --force    Optional. Allow creating even if a global sim with that role exists
 */

import Database from "better-sqlite3";
import path from "node:path";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const hasFlag = (name: string) => args.includes(`--${name}`);

const role = getArg("role");
const name = getArg("name");
const history = getArg("history");
const tasks = getArg("tasks");
const force = hasFlag("force");

const VALID_ROLES = ["developer", "researcher", "designer", "writer"];

if (!role || !VALID_ROLES.includes(role)) {
  console.error(`Error: --role is required (one of: ${VALID_ROLES.join(", ")})`);
  process.exit(1);
}
if (!name) {
  console.error("Error: --name is required");
  process.exit(1);
}

const dbDir = process.env.BONSAI_DB_DIR || path.join(process.cwd(), ".data");
const dbFile = process.env.BONSAI_ENV === "dev" ? "bonsai-dev.db" : "bonsai-dev.db";
const dbPath = path.join(dbDir, dbFile);

console.log(`[seed-sim] Opening DB: ${dbPath}`);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Check for existing global sim with this role
const existing = db
  .prepare("SELECT id, name FROM personas WHERE role = ? AND project_id IS NULL AND deleted_at IS NULL")
  .get(role) as { id: string; name: string } | undefined;

if (existing && !force) {
  console.error(
    `Warning: Global ${role} already exists (${existing.name}, id=${existing.id}). Use --force to create another.`
  );
  process.exit(1);
}

// Look up role_id
const roleRow = db.prepare("SELECT id FROM roles WHERE slug = ?").get(role) as { id: number } | undefined;
const roleId = roleRow?.id ?? null;

const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const id = `g-${slug}`;

// Default starter data per role
const starterData: Record<string, { personality: string; skills: string[]; processes: string[]; goals: string[] }> = {
  developer: {
    personality: "Precise, pragmatic, prefers working code over theory. Gets things done.",
    skills: ["TypeScript", "Next.js", "SQLite/Drizzle", "API design", "Git worktrees"],
    processes: ["Read the ticket thoroughly before writing a single line", "Write the simplest thing that works", "Commit incrementally"],
    goals: ["Ship working software", "Keep the codebase clean", "Unblock the team"],
  },
  researcher: {
    personality: "Curious, thorough, connects dots others miss. Never skips the 'why'.",
    skills: ["Web research", "Competitive analysis", "Synthesis and summarization", "Market research", "User interviews"],
    processes: ["Start with the question, not the answer", "Collect before concluding", "Always cite sources"],
    goals: ["Surface the insight that changes the plan", "Save the team from building the wrong thing"],
  },
  designer: {
    personality: "Visual, opinionated, translates fuzzy ideas into concrete decisions.",
    skills: ["UI/UX design", "Figma", "Component systems", "Accessibility", "Copy review"],
    processes: ["Question the requirement before the design", "Design for edge cases", "Document decisions"],
    goals: ["Make it obvious", "Make it fast", "Make it feel right"],
  },
  writer: {
    personality: "Clear, direct, makes complex things readable. Hates jargon.",
    skills: ["Blog posts", "Marketing copy", "Technical writing", "SEO basics", "Social media content"],
    processes: ["Know the audience before the first word", "Write the headline last", "Edit out every word that doesn't earn its place"],
    goals: ["Get eyes on the work", "Build the brand", "Make the reader smarter or faster"],
  },
};

const starter = starterData[role];
const personality = history
  ? `${starter.personality}\n\nBackground: ${history}`
  : starter.personality;

db.prepare(
  `INSERT INTO personas (id, name, slug, color, role, role_id, personality, skills, processes, goals, project_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
).run(
  id,
  name,
  slug,
  role === "developer" ? "#6366f1" : role === "researcher" ? "#8b5cf6" : role === "designer" ? "#ec4899" : "#f59e0b",
  role,
  roleId,
  personality,
  JSON.stringify(starter.skills),
  JSON.stringify(starter.processes),
  JSON.stringify(tasks ? [...starter.goals, tasks] : starter.goals),
);

console.log(`[seed-sim] Created global persona: ${name} (${role}, id=${id})`);
db.close();
