# PRD: Global Team (One Team Per Bonsai Install)

## Summary

Right now each project gets its own set of Digital Sims (personas). That is wrong.
**One Bonsai install = one team.** The team is shared across all projects.

Projects don't own their workers — they borrow the team.

---

## Problem

The `personas` table has a `project_id` column, which locks each sim to a specific project.
This creates duplicate personas across projects (Adaora on project 1, Maeva on project 2, etc.)
and means every new project spawns an empty team that nobody manages.

---

## Goals

1. **One global team** — personas with `project_id = NULL` are the team. All projects use them.
2. **Four canonical roles**: `developer`, `researcher`, `designer`, `writer`
3. **Daily learning cron** — each role does web research on how to get better at their job, saved as markdown
4. **Sim seeding** — when a new sim is spawned, it starts as a blank slate and gets seeded with skills, history, and a task queue
5. **Ship it** — merged to `main`, old per-project personas soft-deleted, new global team seeded in DB

---

## Acceptance Criteria

- [ ] Schema: `personas.project_id` is still a column but global sims have it set to `NULL`
- [ ] `getPersonas()` when called without projectId returns global team (where `project_id IS NULL`)
- [ ] `getPersonas(projectId)` returns global team (not per-project personas) — the team is shared
- [ ] API: `GET /api/personas` returns global team (no project filter needed)
- [ ] API: `GET /api/workers` returns global team + activity across all projects (not scoped to one)
- [ ] Existing per-project personas are soft-deleted (`deleted_at` set) in a migration script
- [ ] A new global team of 4 is seeded if none exist:
  - `@developer` — one sim, name: **Emi**, color: `#6366f1`
  - `@researcher` — one sim, name: **Adaora**, color: `#8b5cf6`
  - `@designer` — one sim, name: **Layla**, color: `#ec4899`
  - `@writer` — one sim, name: **Remy**, color: `#f59e0b`
- [ ] `writer` role is added to the `roles` table (slug: `writer`, title: `Writer`, color: `#f59e0b`)
- [ ] Skill seeding: each sim is created with a `skills`, `processes`, `goals`, and `personality` JSON field appropriate to their role
- [ ] Daily learning cron: a script at `scripts/daily-learning.ts` (or `.mjs`) runs once per day per role, does a web search on "how to be a better [role] in 2025", and appends a markdown file to `skills/[role]/YYYY-MM-DD-learning.md`
- [ ] The daily learning script is documented so it can be hooked to an external cron (e.g., OpenClaw cron or system cron)
- [ ] Sim seeding utility: `scripts/seed-sim.ts` — takes `--role`, `--name`, optionally `--history` and `--tasks`, writes a new persona with starter data
- [ ] All existing ticket dispatch code that scopes by `project_id` on personas still works (sims just show up for all projects)
- [ ] UI: the Workers page shows the global team (no project dropdown needed to see sims)
- [ ] Tests pass: `pnpm run check` (or `pnpm tsc --noEmit` if no test suite)

---

## Implementation Plan

### Step 1 — Add `writer` role to DB seed
File: `src/db/index.ts` (or wherever roles are seeded on startup)
- Add `writer` role alongside existing researcher/developer/designer

### Step 2 — Update `getPersonas` logic
File: `src/db/data/personas.ts`
- `getPersonas()` with no args → return all where `project_id IS NULL AND deleted_at IS NULL`
- `getPersonas(projectId)` → ALSO return global team (project_id IS NULL), not per-project sims
  - This means ALL projects share the same sims
- Keep `getProjectPersonasRaw(projectId)` working for dispatch (it should also include global sims)

### Step 3 — Update workers API
File: `src/app/api/workers/route.ts`
- Remove project scoping from the global team listing
- Workers view shows all global sims + their activity across projects

### Step 4 — Migration script
File: `scripts/migrate-to-global-team.ts` (or `.mjs`)
- Soft-delete ALL existing per-project personas (`UPDATE personas SET deleted_at = datetime('now') WHERE project_id IS NOT NULL`)
- Seed 4 global personas if they don't already exist (check by `project_id IS NULL`)
- Run this once manually, then it's idempotent

### Step 5 — Seed starter skills/personality for each role

When creating global sims, set real content (not empty arrays):

**@developer (Emi):**
```json
{
  "personality": "Precise, pragmatic, prefers working code over theory. Gets things done.",
  "skills": ["TypeScript", "Next.js", "SQLite/Drizzle", "API design", "Git worktrees"],
  "processes": ["Read the ticket thoroughly before writing a single line", "Write the simplest thing that works", "Commit incrementally"],
  "goals": ["Ship working software", "Keep the codebase clean", "Unblock the team"]
}
```

**@researcher (Adaora):**
```json
{
  "personality": "Curious, thorough, connects dots others miss. Never skips the 'why'.",
  "skills": ["Web research", "Competitive analysis", "Synthesis and summarization", "Market research", "User interviews"],
  "processes": ["Start with the question, not the answer", "Collect before concluding", "Always cite sources"],
  "goals": ["Surface the insight that changes the plan", "Save the team from building the wrong thing"]
}
```

**@designer (Layla):**
```json
{
  "personality": "Visual, opinionated, translates fuzzy ideas into concrete decisions.",
  "skills": ["UI/UX design", "Figma", "Component systems", "Accessibility", "Copy review"],
  "processes": ["Question the requirement before the design", "Design for edge cases", "Document decisions"],
  "goals": ["Make it obvious", "Make it fast", "Make it feel right"]
}
```

**@writer (Remy):**
```json
{
  "personality": "Clear, direct, makes complex things readable. Hates jargon.",
  "skills": ["Blog posts", "Marketing copy", "Technical writing", "SEO basics", "Social media content"],
  "processes": ["Know the audience before the first word", "Write the headline last", "Edit out every word that doesn't earn its place"],
  "goals": ["Get eyes on the work", "Build the brand", "Make the reader smarter or faster"]
}
```

### Step 6 — Daily learning cron
File: `scripts/daily-learning.mjs`

```
Usage: node scripts/daily-learning.mjs [--role developer|researcher|designer|writer]
       (no --role = runs for all 4 roles)
```

For each role:
1. Use `fetch` to call Claude API with a prompt: "You are a world-class [role]. Research and write a brief (300-500 word) learning note for yourself on: how to be a better [role] in 2025. Focus on one specific skill, technique, or mindset shift. Be practical. Output clean markdown."
2. Save to `skills/[role]/YYYY-MM-DD-learning.md`
3. Log: `[role] learning saved → skills/[role]/YYYY-MM-DD-learning.md`

The script reads `ANTHROPIC_API_KEY` from env. Add a sample cron entry to the README.

### Step 7 — Sim seeding utility  
File: `scripts/seed-sim.ts`

```bash
npx tsx scripts/seed-sim.ts --role writer --name "Remy" --history "Former content strategist. Joined the team in 2025." --tasks "Write 3 blog post outlines for bonsai-www"
```

Creates a new persona in the DB with the seeded data. If a global sim with that role already exists and `--force` is not passed, prints a warning and exits.

### Step 8 — DB auto-seed on startup
In `src/db/index.ts`, after the roles seed block:
- Check if any global personas exist (`project_id IS NULL AND deleted_at IS NULL`)
- If count == 0, seed the 4 default sims with full personality/skills/etc.

### Step 9 — Commit and merge to main
```bash
git add -A
git commit -m "feat: global team — one team per Bonsai, 4 canonical roles + daily learning"
git checkout main
git merge --no-ff feat/global-team -m "Merge: global team"
```

---

## Out of Scope
- UI changes to create/edit team members (existing workers page is fine)
- Authentication / multi-tenant (this is single-install Bonsai)
- Per-project team overrides (always global for now)

---

## Files to Touch

| File | Change |
|---|---|
| `src/db/index.ts` | Add `writer` role seed; add global persona auto-seed |
| `src/db/data/personas.ts` | `getPersonas()` and `getProjectPersonasRaw()` return global sims |
| `src/app/api/workers/route.ts` | Remove per-project scoping |
| `src/app/api/personas/route.ts` | Return global team by default |
| `scripts/migrate-to-global-team.mjs` | One-time migration |
| `scripts/daily-learning.mjs` | Daily learning cron per role |
| `scripts/seed-sim.ts` | Utility to spawn a new seeded sim |
| `skills/writer/` | Create dir (for daily learning output) |
| `skills/developer/`, `skills/researcher/`, `skills/designer/` | Ensure dirs exist |
| `README.md` or `DEVELOPER_SETUP.md` | Document cron setup |

---

## Ticket Reference

This PRD corresponds to Bonsai ticket: **"Global Team — one team per Bonsai install, not per project"**
State flow: planning → researching → building → verifying → shipped
