import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";

const env = process.env.BONSAI_ENV || "prod";
const dbFile = env === "dev" ? "bonsai-dev.db" : "bonsai.db";
// Use BONSAI_DB_DIR if set (for CLI from worktrees), otherwise use .data/ under cwd
// .data/ keeps DB files out of Turbopack's watch tree to prevent recompile loops
const dbDir = process.env.BONSAI_DB_DIR || path.join(process.cwd(), ".data");
const dbPath = path.join(dbDir, dbFile);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
// Reduce fsync calls in WAL mode (safe: survives crash, just slower startup if OS crashes)
sqlite.pragma("synchronous = NORMAL");
// Avoid SQLITE_BUSY when heartbeat and server share the same DB file
sqlite.pragma("busy_timeout = 5000");

// Auto-create tables if they don't exist (self-healing for fresh DBs / previews)
// This replaces the need for a separate `db:push` step.
// NOTE: Column names below are SQL snake_case (e.g. project_id).
// In Drizzle ORM queries, use the camelCase JS property (e.g. tickets.projectId).
const existingTables = new Set(
  (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
    .map((r) => r.name)
);

if (!existingTables.has("users")) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "users" (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "projects" (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      visibility TEXT DEFAULT 'private' NOT NULL,
      description TEXT,
      github_owner TEXT,
      github_repo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      target_customer TEXT,
      tech_stack TEXT,
      local_path TEXT,
      build_command TEXT,
      run_command TEXT,
      is_dogfooding INTEGER DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_unique ON projects (slug);
    CREATE TABLE IF NOT EXISTS "roles" (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6366f1' NOT NULL,
      icon TEXT,
      workflow TEXT,
      system_prompt TEXT,
      tools TEXT,
      folder_access TEXT,
      skill_definitions TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roles_slug_unique ON roles (slug);
    CREATE TABLE IF NOT EXISTS "skills" (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS skills_name_unique ON skills (name);
    CREATE TABLE IF NOT EXISTS "personas" (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      color TEXT NOT NULL,
      avatar TEXT,
      role_id INTEGER REFERENCES roles(id),
      role TEXT DEFAULT 'developer',
      personality TEXT,
      skills TEXT,
      processes TEXT,
      goals TEXT,
      permissions TEXT,
      project_id INTEGER REFERENCES projects(id),
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS "role_skills" (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      PRIMARY KEY(role_id, skill_id)
    );
    CREATE TABLE IF NOT EXISTS "settings" (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "tickets" (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      state TEXT DEFAULT 'backlog' NOT NULL,
      priority INTEGER DEFAULT 0 NOT NULL,
      assignee_id TEXT REFERENCES personas(id),
      created_by INTEGER REFERENCES users(id),
      comment_count INTEGER DEFAULT 0,
      acceptance_criteria TEXT,
      has_attachments INTEGER DEFAULT 0,
      last_agent_activity TEXT,
      last_human_comment_at TEXT,
      returned_from_verification INTEGER DEFAULT 0,
      project_id INTEGER REFERENCES projects(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      worktree_path TEXT,
      research_completed_at TEXT,
      research_completed_by TEXT REFERENCES personas(id),
      research_approved_at TEXT,
      research_approved_by INTEGER REFERENCES users(id),
      plan_completed_at TEXT,
      plan_completed_by TEXT REFERENCES personas(id),
      plan_approved_at TEXT,
      plan_approved_by INTEGER REFERENCES users(id),
      merged_at TEXT,
      merge_commit TEXT,
      blocked INTEGER DEFAULT 0,
      blocked_reason TEXT,
      blocked_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS "comments" (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      author_type TEXT NOT NULL,
      author_id INTEGER,
      persona_id TEXT REFERENCES personas(id),
      content TEXT NOT NULL,
      attachments TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      document_id INTEGER REFERENCES ticket_documents(id)
    );
    CREATE TABLE IF NOT EXISTS "ticket_documents" (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      author_persona_id TEXT REFERENCES personas(id)
    );
    CREATE TABLE IF NOT EXISTS "ticket_attachments" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_by_type TEXT NOT NULL,
      created_by_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "ticket_audit_log" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      event TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT NOT NULL,
      detail TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "project_notes" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "extracted_items" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'feature',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("[db] Auto-created tables (fresh database)");
}

// ── Seed default roles if empty ──────────────────
const roleCount = (sqlite.prepare("SELECT count(*) as n FROM roles").get() as { n: number }).n;
if (roleCount === 0) {
  const insertRole = sqlite.prepare("INSERT INTO roles (slug, title, description, color) VALUES (?, ?, ?, ?)");
  insertRole.run("researcher", "Researcher", "Investigates tickets before implementation. Explores the codebase, identifies constraints, and documents findings.", "#8b5cf6");
  insertRole.run("developer", "Developer", "Implements features and fixes bugs. Works in two phases: planning (creates implementation plan from research) and building (executes the approved plan).", "#3b82f6");
  insertRole.run("designer", "Designer", "Creates user interfaces and experiences. Works in planning (design spec) and building (component implementation). Assesses whether design work is needed per ticket.", "#ec4899");
  console.log("[db] Seeded 3 default roles: researcher, developer, designer");
}

// ── Self-heal: ensure all 4 core roles exist ──────────────────
{
  const coreRoles = [
    { slug: "researcher", title: "Researcher", description: "Investigates tickets before implementation. Explores the codebase, identifies constraints, and documents findings.", color: "#8b5cf6" },
    { slug: "developer", title: "Developer", description: "Implements features and fixes bugs. Works in two phases: planning (creates implementation plan from research) and building (executes the approved plan).", color: "#3b82f6" },
    { slug: "designer", title: "Designer", description: "Creates user interfaces and experiences. Works in planning (design spec) and building (component implementation). Assesses whether design work is needed per ticket.", color: "#ec4899" },
  ];
  const upsertRole = sqlite.prepare(
    "INSERT INTO roles (slug, title, description, color) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING"
  );
  for (const r of coreRoles) {
    upsertRole.run(r.slug, r.title, r.description, r.color);
  }
}

// ── context_role settings are now auto-built from roles.description at dispatch time ──────────────────
// No static seeds needed — team context is dynamic.

// ── Global team auto-seed (4 canonical sims if none exist) ──────────────────
{
  const globalPersonaCount = (sqlite.prepare("SELECT count(*) as n FROM personas WHERE project_id IS NULL AND deleted_at IS NULL").get() as { n: number }).n;
  if (globalPersonaCount === 0) {
    const getRoleId = (slug: string) =>
      (sqlite.prepare("SELECT id FROM roles WHERE slug = ?").get(slug) as { id: number } | undefined)?.id ?? null;

    const insertPersona = sqlite.prepare(
      `INSERT OR IGNORE INTO personas (id, name, slug, color, role, role_id, personality, skills, processes, goals, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    );

    const sims = [
      {
        id: "g-developer", name: "Emi", slug: "emi", color: "#6366f1", role: "developer",
        roleId: getRoleId("developer"),
        personality: "Precise, pragmatic, prefers working code over theory. Gets things done.",
        skills: JSON.stringify(["TypeScript", "Next.js", "SQLite/Drizzle", "API design", "Git worktrees"]),
        processes: JSON.stringify(["Read the ticket thoroughly before writing a single line", "Write the simplest thing that works", "Commit incrementally"]),
        goals: JSON.stringify(["Ship working software", "Keep the codebase clean", "Unblock the team"]),
      },
      {
        id: "g-researcher", name: "Adaora", slug: "adaora", color: "#8b5cf6", role: "researcher",
        roleId: getRoleId("researcher"),
        personality: "Curious, thorough, connects dots others miss. Never skips the 'why'.",
        skills: JSON.stringify(["Web research", "Competitive analysis", "Synthesis and summarization", "Market research", "User interviews"]),
        processes: JSON.stringify(["Start with the question, not the answer", "Collect before concluding", "Always cite sources"]),
        goals: JSON.stringify(["Surface the insight that changes the plan", "Save the team from building the wrong thing"]),
      },
      {
        id: "g-designer", name: "Layla", slug: "layla", color: "#ec4899", role: "designer",
        roleId: getRoleId("designer"),
        personality: "Visual, opinionated, translates fuzzy ideas into concrete decisions.",
        skills: JSON.stringify(["UI/UX design", "Figma", "Component systems", "Accessibility", "Copy review"]),
        processes: JSON.stringify(["Question the requirement before the design", "Design for edge cases", "Document decisions"]),
        goals: JSON.stringify(["Make it obvious", "Make it fast", "Make it feel right"]),
      },
    ];

    for (const s of sims) {
      insertPersona.run(s.id, s.name, s.slug, s.color, s.role, s.roleId, s.personality, s.skills, s.processes, s.goals);
    }
    console.log("[db] Seeded 3 global personas: Developer, Researcher, Designer");
  }
}

// ── agent_runs table (self-healing migration) ──────────────────
if (!existingTables.has("agent_runs")) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "agent_runs" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      tools TEXT,
      session_dir TEXT,
      dispatch_source TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_report_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (status);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_ticket ON agent_runs (ticket_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_persona_status ON agent_runs (persona_id, status);
  `);
  console.log("[db] Auto-created agent_runs table");
}

// ── project_messages table (self-healing migration) ──────────────────
if (!existingTables.has("project_messages")) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "project_messages" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      author_type TEXT NOT NULL,
      author_id INTEGER,
      persona_id TEXT REFERENCES personas(id),
      content TEXT NOT NULL,
      attachments TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_project_messages_project ON project_messages (project_id, created_at);
  `);
  console.log("[db] Auto-created project_messages table");
}

// ── blocked columns on tickets (self-healing migration) ──────────────────
{
  const cols = new Set(
    (sqlite.prepare("PRAGMA table_info(tickets)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!cols.has("blocked")) {
    sqlite.exec(`ALTER TABLE tickets ADD COLUMN blocked INTEGER DEFAULT 0`);
    sqlite.exec(`ALTER TABLE tickets ADD COLUMN blocked_reason TEXT`);
    sqlite.exec(`ALTER TABLE tickets ADD COLUMN blocked_at TEXT`);
    console.log("[db] Added blocked columns to tickets");
  }
  if (!cols.has("on_hold")) {
    sqlite.exec(`ALTER TABLE tickets ADD COLUMN on_hold INTEGER DEFAULT 0`);
    sqlite.exec(`ALTER TABLE tickets ADD COLUMN hold_reason TEXT`);
    sqlite.exec(`ALTER TABLE tickets ADD COLUMN hold_at TEXT`);
    console.log("[db] Added hold columns to tickets");
  }
}

// ── Performance indexes (self-healing, idempotent) ──────────────────
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets (project_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_state ON tickets (state);
  CREATE INDEX IF NOT EXISTS idx_tickets_project_state ON tickets (project_id, state, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments (ticket_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_comments_persona_id ON comments (persona_id);
  CREATE INDEX IF NOT EXISTS idx_personas_project_id ON personas (project_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_ticket_documents_tid ON ticket_documents (ticket_id);
  CREATE INDEX IF NOT EXISTS idx_ticket_attachments_tid ON ticket_attachments (ticket_id);
  CREATE INDEX IF NOT EXISTS idx_ticket_audit_log_tid ON ticket_audit_log (ticket_id, created_at);
`);

export const db = drizzle(sqlite, { schema });
