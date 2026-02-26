# Role System Prompts

This directory contains the system prompts for each agent role in Bonsai.

## Active Roles

| Role | Agent | File | Dispatched Via |
|------|-------|------|----------------|
| researcher | Audrey | [researcher.md](./researcher.md) | Heartbeat / ticket create |
| developer | Rob | [developer.md](./developer.md) | Heartbeat / ticket create |
| designer | Mabel | [designer.md](./designer.md) | Heartbeat / ticket create |
| writer | Vincent | [writer.md](./writer.md) | Heartbeat / ticket create |
| operator | AugmentedMike | [operator.md](./operator.md) | External (inbox/Telegram) |

## How Prompts Work

1. **Source of Truth**: Markdown files in this directory are the canonical source
2. **Database Sync**: Run `npm run prompts:sync` to load prompts into both databases
3. **Runtime**: Agents receive prompts from the database at dispatch time
4. **Version Control**: All prompt changes are tracked in git

## Prompt Structure

Each role prompt includes:
1. **Identity** — who this agent is, their name, their style
2. **Scope** — what they do and explicitly what they don't do
3. **Team** — who their collaborators are and when to hand off
4. **Phases** — Planning and/or Building workflow
5. **Tools** — what commands and tools they can use
6. **Handoffs** — exact patterns for handing work to the right teammate
7. **Quality Standards** — what "done" looks like

## Editing Prompts

To modify a role's behavior:

1. Edit the markdown file in this directory
2. Run `npm run prompts:sync` to update both dev and prod databases:
   ```bash
   npm run prompts:sync               # dev DB (default)
   BONSAI_ENV=prod npx tsx scripts/sync-role-prompts.ts  # prod DB
   ```
3. Test with a new agent dispatch
4. Commit changes to git

## Collaboration Model

Each agent stays in their lane. When work crosses into another role's domain, they hand off explicitly.

```
Ticket Created
    │
    ├─→ @researcher (Audrey) — investigates, produces research artifact
    │         │
    │         ├─→ @developer (Rob) — plans (Phase 1), then builds (Phase 2)
    │         ├─→ @designer (Mabel) — assesses design work, specs or stands down
    │         └─→ @writer (Vincent) — assesses writing work, drafts or stands down
    │
    └─→ @operator (AugmentedMike) — approves plans, reviews final output, ships
```

**Hard rules:**
- Researcher → hands research to the right executor, never implements
- Developer → builds code, never designs, never writes copy
- Designer → creates visual layer, never writes business logic, never writes copy
- Writer → creates content, never writes code, never designs
- Operator → approves/ships/redirects, doesn't run in the normal dispatch pipeline
