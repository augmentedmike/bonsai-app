#!/usr/bin/env npx tsx
/**
 * Bonsai CLI — database and workflow utilities
 * Usage: bonsai-cli <command> [args]
 */

import { db } from "../src/db/index.js";
import { tickets, projects, comments, ticketAttachments } from "../src/db/schema.js";
import { eq, and, isNull, desc } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { canTransition, canPerformAction, describeWorkflow } from "../src/lib/ticket-state-machine.js";

const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
  console.log(`
Bonsai CLI — database and workflow utilities

Usage: bonsai-cli <command> [args]

Commands:
  create-ticket <project-slug> <title> --type <feature|bug|chore> [--origin <issue|idea|blocker>] [--description <text>] [--context <text>] [--acceptance-criteria <text>] [--assignee <persona-id>] [--priority <0-1000>]
                                              Create a new ticket
  get-comments <project-slug> <ticket-id> [--head N | --tail N]
                                              Get all comments for a ticket
  get-persona <persona-id>                    Get persona details (name, role, avatar status)
  write-artifact <ticket-id> <tag> <file>     Save a tagged attachment (research-doc|implementation-plan|design-doc)
  read-artifact <ticket-id> <tag>            Read the latest tagged attachment
  sync-artifacts                              Export all tagged attachments to markdown files for QMD indexing
  search-artifacts <query>                    Search artifacts using QMD hybrid search
  report <ticket-id> <message>                Post a progress update to the ticket
  check-criteria <ticket-id> <index>          Mark an acceptance criterion as complete (0-indexed)
  update-ticket <ticket-id> --field <value>   Update ticket fields (--title, --description, --acceptance-criteria, --type, --state)
  upload-attachment <ticket-id> <file> [name] [--tag <tag>]  Upload a file attachment to a ticket
  credit-status                               Check if API credits are paused

Examples:
  bonsai-cli create-ticket my-project "Add login feature" --type feature --description "Implement user login" --acceptance-criteria "User can log in with email/password"
  bonsai-cli create-ticket my-project "Fix auth timeout" --type bug --origin issue --context "Observed in prod: sessions expire after 5 min" --assignee g-developer --priority 800
  bonsai-cli get-comments digitalworker-ai-demo 41 --tail 5
  bonsai-cli get-persona p8
  bonsai-cli write-artifact 41 research-doc /tmp/research.md
  bonsai-cli read-artifact 41 research-doc
  bonsai-cli sync-artifacts
  bonsai-cli search-artifacts "React 19 patterns"
  bonsai-cli report 41 "Starting implementation of auth module"
  bonsai-cli check-criteria 41 0
  bonsai-cli update-ticket 41 --acceptance-criteria "- [ ] User can log in\\n- [ ] Session persists"
  bonsai-cli update-ticket 41 --state building
  bonsai-cli upload-attachment 41 /tmp/screenshot.png "UI Screenshot"
  bonsai-cli credit-status
  `);
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────
// get-comments <project-slug> <ticket-id> [--head N | --tail N]
// ───────────────────────────────────────────────────────────────────────────
function getComments(projectSlug: string, ticketId: string, limit?: {type: 'head' | 'tail', count: number}) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  // Verify project exists
  const project = db.select().from(projects).where(and(
    eq(projects.slug, projectSlug),
    isNull(projects.deletedAt)
  )).get();

  if (!project) {
    console.error(`Error: project '${projectSlug}' not found`);
    process.exit(1);
  }

  // Verify ticket exists and belongs to project
  const ticket = db.select().from(tickets).where(and(
    eq(tickets.id, ticketIdNum),
    eq(tickets.projectId, project.id),
    isNull(tickets.deletedAt)
  )).get();

  if (!ticket) {
    console.error(`Error: ticket ${ticketId} not found in project '${projectSlug}'`);
    process.exit(1);
  }

  // Fetch comments
  const allComments = db.select().from(comments)
    .where(eq(comments.ticketId, ticketIdNum))
    .orderBy(comments.createdAt)
    .all();

  // Apply head/tail filtering
  let ticketComments = allComments;
  if (limit) {
    if (limit.type === 'head') {
      ticketComments = allComments.slice(0, limit.count);
    } else if (limit.type === 'tail') {
      ticketComments = allComments.slice(-limit.count);
    }
  }

  console.log(`\n=== Ticket #${ticketId}: ${ticket.title} ===`);
  console.log(`State: ${ticket.state}`);
  console.log(`Project: ${project.name} (${project.slug})`);
  console.log(`Comments: ${ticketComments.length}${limit ? ` (${limit.type} ${limit.count} of ${allComments.length} total)` : ''}\n`);

  ticketComments.forEach((c, idx) => {
    const displayIdx = limit?.type === 'tail' ? allComments.length - ticketComments.length + idx + 1 : idx + 1;
    console.log(`\n────────────────────────────────────────────────────────────────`);
    console.log(`Comment #${displayIdx} | ${c.authorType} | ${c.personaId || 'system'} | ${c.createdAt}`);
    console.log(`────────────────────────────────────────────────────────────────`);
    console.log(c.content);
  });

  console.log(`\n────────────────────────────────────────────────────────────────\n`);
}

// ───────────────────────────────────────────────────────────────────────────
// create-ticket <project-slug> <title> --type <type> [--description <text>] [--acceptance-criteria <text>]
// ───────────────────────────────────────────────────────────────────────────
async function createTicketCmd(projectSlug: string, title: string, options: {
  type?: string;
  description?: string;
  acceptanceCriteria?: string;
  origin?: string;
  context?: string;
  assignee?: string;
  priority?: number;
}) {
  // Verify project exists
  const project = db.select().from(projects).where(and(
    eq(projects.slug, projectSlug),
    isNull(projects.deletedAt)
  )).get();

  if (!project) {
    console.error(`Error: project '${projectSlug}' not found`);
    process.exit(1);
  }

  // Validate type
  const validTypes = ["feature", "bug", "chore"];
  if (!options.type || !validTypes.includes(options.type)) {
    console.error(`Error: --type is required and must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  // Validate origin type if provided
  const validOrigins = ["issue", "idea", "blocker"];
  if (options.origin && !validOrigins.includes(options.origin)) {
    console.error(`Error: --origin must be one of: ${validOrigins.join(", ")}`);
    process.exit(1);
  }

  // Build description: context + description combined
  let finalDescription = "";
  if (options.context && options.description) {
    finalDescription = `**Context:** ${options.context}\n\n---\n\n${options.description}`;
  } else if (options.context) {
    finalDescription = `**Context:** ${options.context}`;
  } else if (options.description) {
    finalDescription = options.description;
  }

  const personaId = process.env.BONSAI_PERSONA_ID;

  // Create ticket via API
  try {
    const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";
    const res = await fetch(`${apiBase}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        title: title,
        type: options.type,
        description: finalDescription || "",
        acceptanceCriteria: options.acceptanceCriteria || "",
        priority: options.priority ?? 500,
        originType: options.origin || undefined,
        assigneeId: options.assignee || undefined,
        createdByType: personaId ? "sim" : "human",
        createdById: personaId || undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error(`Error creating ticket: ${data.error || res.statusText}`);
      process.exit(1);
    }

    const result = await res.json();
    const ticket = result.ticket || result;
    console.log(`✓ Created ticket #${ticket.id}: ${ticket.title}`);
    console.log(`  Type: ${ticket.type}`);
    if (options.origin) console.log(`  Origin: ${options.origin}`);
    console.log(`  State: ${ticket.state}`);
    console.log(`  Priority: ${options.priority ?? 500}`);
    console.log(`  Project: ${project.name} (${project.slug})`);
    if (options.assignee) console.log(`  Assignee: ${options.assignee}`);
    if (options.context) console.log(`  Context: ${options.context.substring(0, 100)}${options.context.length > 100 ? '...' : ''}`);
    if (options.description) console.log(`  Description: ${options.description.substring(0, 100)}${options.description.length > 100 ? '...' : ''}`);
    if (options.acceptanceCriteria) console.log(`  Acceptance criteria: ${options.acceptanceCriteria.substring(0, 100)}${options.acceptanceCriteria.length > 100 ? '...' : ''}`);
  } catch (err: any) {
    console.error(`Error creating ticket: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// write-artifact <ticket-id> <tag> <file>
// ───────────────────────────────────────────────────────────────────────────
async function writeArtifact(ticketId: string, tag: string, filePath: string) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  const validTags = ["research-doc", "implementation-plan", "design-doc", "security-review", "research-critique", "plan-critique"];
  if (!validTags.includes(tag)) {
    console.error(`Error: tag must be one of: ${validTags.join(", ")}`);
    process.exit(1);
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketIdNum)).get();
  if (!ticket) {
    console.error(`Error: ticket ${ticketId} not found`);
    process.exit(1);
  }

  // Read file content
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err: any) {
    console.error(`Error reading file '${filePath}': ${err.message}`);
    process.exit(1);
  }

  if (!content.trim()) {
    console.error(`Error: file '${filePath}' is empty`);
    process.exit(1);
  }

  // Upload as a tagged attachment (markdown data URL)
  const personaId = process.env.BONSAI_PERSONA_ID || null;
  const filename = `${tag}-${ticketId}.md`;
  const dataUrl = `data:text/markdown;base64,${Buffer.from(content.trim()).toString("base64")}`;

  try {
    const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";
    const res = await fetch(`${apiBase}/api/tickets/${ticketId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        mimeType: "text/markdown",
        data: dataUrl,
        tag,
        createdByType: "agent",
        createdById: personaId,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`Error: ${data.error || "Failed to save artifact"}`);
      process.exit(1);
    }

    console.log(`✓ ${tag} saved as attachment to ticket ${ticketId} (id: ${data.id})`);
  } catch (err: any) {
    console.error(`Error calling API: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// read-artifact <ticket-id> <tag>
// ───────────────────────────────────────────────────────────────────────────
function readArtifact(ticketId: string, tag: string) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  const validTags = ["research-doc", "implementation-plan", "design-doc", "security-review", "research-critique", "plan-critique"];
  if (!validTags.includes(tag)) {
    console.error(`Error: tag must be one of: ${validTags.join(", ")}`);
    process.exit(1);
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketIdNum)).get();
  if (!ticket) {
    console.error(`Error: ticket ${ticketId} not found`);
    process.exit(1);
  }

  // Fetch latest attachment with this tag (highest id = most recent)
  const attachments = db.select().from(ticketAttachments)
    .where(and(
      eq(ticketAttachments.ticketId, ticketIdNum),
      eq(ticketAttachments.tag, tag)
    ))
    .all();

  if (attachments.length === 0) {
    console.error(`No ${tag} attachments found for ticket ${ticketId}`);
    process.exit(1);
  }

  const latest = attachments.sort((a, b) => b.id - a.id)[0];

  // Decode base64 data URL to text
  let content: string;
  const match = latest.data.match(/^data:[^;]+;base64,(.+)$/);
  if (match) {
    content = Buffer.from(match[1], "base64").toString("utf-8");
  } else {
    content = latest.data;
  }

  console.log(`\n=== ${tag} | Ticket #${ticketId} ===`);
  console.log(`Created: ${latest.createdAt}`);
  console.log(`Author: ${latest.createdById || 'human'}\n`);
  console.log(`────────────────────────────────────────────────────────────────\n`);
  console.log(content);
  console.log(`\n────────────────────────────────────────────────────────────────\n`);
}

// ───────────────────────────────────────────────────────────────────────────
// get-persona <persona-id>
// ───────────────────────────────────────────────────────────────────────────
function getPersona(personaId: string) {
  const { personas } = require("../src/db/schema");

  const persona = db.select().from(personas).where(eq(personas.id, personaId)).get();

  if (!persona) {
    console.error(`Error: persona '${personaId}' not found`);
    process.exit(1);
  }

  const hasAvatar = persona.avatar && persona.avatar.length > 0;
  const avatarPreview = hasAvatar
    ? persona.avatar!.substring(0, 100) + `... (${persona.avatar!.length} chars total)`
    : 'No avatar';

  console.log(`\n=== Persona: ${persona.name} (${personaId}) ===`);
  console.log(`Role: ${persona.role}`);
  console.log(`Color: ${persona.color}`);
  console.log(`Avatar: ${avatarPreview}`);
  console.log(`Deleted: ${persona.deletedAt || 'No'}\n`);
}

// ───────────────────────────────────────────────────────────────────────────
// sync-artifacts — Export all tagged attachments to markdown files for QMD
// ───────────────────────────────────────────────────────────────────────────
async function syncArtifacts() {
  const os = await import('node:os');
  const path = await import('node:path');

  const artifactsDir = path.join(os.homedir(), '.bonsai', 'artifacts');

  // Create directory structure
  await fs.mkdir(path.join(artifactsDir, 'research'), { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'plans'), { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'designs'), { recursive: true });

  // Fetch all tagged attachments (only markdown/text ones with a tag)
  const allAttachments = db.select().from(ticketAttachments).all()
    .filter(a => a.tag && (a.mimeType === 'text/markdown' || a.mimeType === 'text/plain'));

  console.log(`Syncing ${allAttachments.length} tagged artifacts to ${artifactsDir}...\n`);

  let synced = 0;
  for (const att of allAttachments) {
    const ticket = db.select().from(tickets).where(eq(tickets.id, att.ticketId)).get();
    if (!ticket) continue;

    const ticketSlug = ticket.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let subdir: string;
    if (att.tag === 'research-doc' || att.tag === 'research-critique') {
      subdir = 'research';
    } else if (att.tag === 'implementation-plan' || att.tag === 'plan-critique') {
      subdir = 'plans';
    } else if (att.tag === 'design-doc') {
      subdir = 'designs';
    } else {
      subdir = 'other';
      await fs.mkdir(path.join(artifactsDir, 'other'), { recursive: true });
    }

    const filename = `ticket-${att.ticketId}-${ticketSlug}-${att.tag}-${att.id}.md`;
    const filePath = path.join(artifactsDir, subdir, filename);

    // Decode base64 data URL to text
    let content: string;
    const match = att.data.match(/^data:[^;]+;base64,(.+)$/);
    if (match) {
      content = Buffer.from(match[1], "base64").toString("utf-8");
    } else {
      content = att.data;
    }

    // Add frontmatter with metadata
    const frontmatter = `---
ticketId: ${att.ticketId}
ticketTitle: ${ticket.title}
tag: ${att.tag}
author: ${att.createdById || 'human'}
created: ${att.createdAt}
---

`;

    await fs.writeFile(filePath, frontmatter + content, 'utf-8');
    synced++;
  }

  console.log(`✓ Synced ${synced} artifacts to ${artifactsDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. cd ~/.bonsai/artifacts`);
  console.log(`  2. qmd collection add . --name bonsai-artifacts --mask "**/*.md"`);
  console.log(`  3. qmd embed`);
  console.log(`  4. qmd search "your query" -c bonsai-artifacts`);
}

// ───────────────────────────────────────────────────────────────────────────
// search-artifacts <query> — Search artifacts using QMD
// ───────────────────────────────────────────────────────────────────────────
async function searchArtifacts(query: string) {
  const { spawn } = await import('node:child_process');

  if (!query?.trim()) {
    console.error("Error: search query is required");
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('qmd', ['search', query, '-c', 'bonsai-artifacts'], {
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`\nQMD search failed. Run 'bonsai-cli sync-artifacts' first to set up the collection.`);
        process.exit(code || 1);
      }
      resolve(undefined);
    });

    proc.on('error', (err) => {
      console.error(`Error: ${err.message}`);
      console.error(`\nMake sure QMD is installed: npm install -g @arcadeum/qmd`);
      process.exit(1);
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// report <ticket-id> <message> — Post progress update to ticket
// ───────────────────────────────────────────────────────────────────────────
async function reportProgress(ticketId: string, message: string) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  if (!message?.trim()) {
    console.error("Error: message is required");
    process.exit(1);
  }

  // Get persona ID and API base from environment
  const personaId = process.env.BONSAI_PERSONA_ID;
  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";

  if (!personaId) {
    console.error("Error: BONSAI_PERSONA_ID environment variable not set");
    process.exit(1);
  }

  try {
    const response = await fetch(`${apiBase}/api/tickets/${ticketIdNum}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, content: message }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(data.error || data.detail || "Failed to post report");
      process.exit(1);
    }

    console.log(`✓ Progress update posted to ticket ${ticketId}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// check-criteria <ticket-id> <index> — Mark acceptance criterion complete
// ───────────────────────────────────────────────────────────────────────────
async function checkCriteria(ticketId: string, indexStr: string) {
  const ticketIdNum = Number(ticketId);
  const index = Number(indexStr);

  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  if (isNaN(index) || index < 0) {
    console.error("Error: index must be a non-negative number");
    process.exit(1);
  }

  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";

  try {
    const response = await fetch(`${apiBase}/api/tickets/${ticketIdNum}/check-criteria`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(data.error || data.detail || "Failed to check criterion");
      process.exit(1);
    }

    const data = await response.json();
    console.log(`✓ Checked criterion ${index} on ticket ${ticketId}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// update-ticket <ticket-id> --field <value> — Update ticket fields
// ───────────────────────────────────────────────────────────────────────────
async function updateTicketCmd(ticketId: string, flags: string[]) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";
  const updates: Record<string, unknown> = { ticketId: ticketIdNum };

  // Parse --flag value pairs
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const value = flags[i + 1];
    switch (flag) {
      case "--title":
        updates.title = value; i++; break;
      case "--description":
        updates.description = value; i++; break;
      case "--acceptance-criteria":
        // Support \n in the value for multi-line criteria
        updates.acceptanceCriteria = value?.replace(/\\n/g, "\n"); i++; break;
      case "--type":
        updates.type = value; i++; break;
      case "--state":
        updates.state = value; i++; break;
      default:
        console.error(`Unknown flag: ${flag}`);
        process.exit(1);
    }
  }

  if (Object.keys(updates).length <= 1) {
    console.error("Error: at least one --field is required");
    console.error("Flags: --title, --description, --acceptance-criteria, --type, --state");
    process.exit(1);
  }

  try {
    // Always identify as agent when called from CLI (human uses the board UI)
    const body = { ...updates, actorType: "agent" };

    const response = await fetch(`${apiBase}/api/tickets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.error === "state_machine_violation") {
        console.error(`\n[state-machine] ${data.message}`);
        console.error(`\n${data.workflow}`);
      } else {
        console.error(`Error: ${response.status} ${response.statusText}`);
        console.error(data.error || "Failed to update ticket");
      }
      process.exit(1);
    }

    const changed = Object.keys(updates).filter(k => k !== "ticketId");
    console.log(`✓ Updated ticket #${ticketId}: ${changed.join(", ")}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// credit-status — Check if API credits are paused
// ───────────────────────────────────────────────────────────────────────────
async function creditStatus() {
  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3090";

  try {
    const response = await fetch(`${apiBase}/api/credit-pause?all=true`, {
      method: "GET",
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();

    if (data.paused) {
      console.log(`⏸️  Credits are PAUSED until ${data.pausedUntil}`);
      console.log(`   Reason: ${data.reason || 'Unknown'}`);
      console.log(`   Remaining: ${Math.round(data.remainingMs / 1000 / 60)} minutes`);
      process.exit(1); // Exit with error code when paused
    } else {
      console.log(`✓ Credits are active (not paused)`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// upload-attachment <ticket-id> <file> [name] — Upload a file attachment
// ───────────────────────────────────────────────────────────────────────────
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".html": "text/html",
  ".xml": "application/xml",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
};

async function uploadAttachment(ticketId: string, filePath: string, displayName?: string, tag?: string) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  const personaId = process.env.BONSAI_PERSONA_ID;
  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";

  // Read file
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (err: any) {
    console.error(`Error reading file '${filePath}': ${err.message}`);
    process.exit(1);
  }

  if (fileBuffer.length === 0) {
    console.error(`Error: file '${filePath}' is empty`);
    process.exit(1);
  }

  // Detect MIME type from extension
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  // Use display name or basename
  const filename = displayName || path.basename(filePath);

  // Base64 encode as data URL (matches frontend FileReader.readAsDataURL format)
  const data = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  try {
    const response = await fetch(`${apiBase}/api/tickets/${ticketIdNum}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        mimeType,
        data,
        tag: tag || null,
        createdByType: "agent",
        createdById: personaId || null,
      }),
    });

    if (!response.ok) {
      const resData = await response.json().catch(() => ({}));
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(resData.error || "Failed to upload attachment");
      process.exit(1);
    }

    const attachment = await response.json();
    console.log(`✓ Attachment '${filename}' (${mimeType}) uploaded to ticket ${ticketId}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// State Machine Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Fetch the current state of a ticket from the local DB (fast, no HTTP).
 * Returns null if ticket not found.
 */
function getTicketState(ticketId: number): string | null {
  try {
    const row = db.select({ state: tickets.state }).from(tickets).where(eq(tickets.id, ticketId)).get();
    return row?.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Guard an agent CLI action against the state machine.
 * Prints a clear error and exits with code 1 if the action is not permitted.
 */
function assertActionAllowed(
  ticketId: number,
  action: Parameters<typeof canPerformAction>[1],
  actorType: "agent" | "human" | "operator" = "agent"
) {
  const state = getTicketState(ticketId);
  if (!state) return; // can't validate without state; let API handle it

  const check = canPerformAction(state, action, actorType);
  if (!check.allowed) {
    console.error(`\n[state-machine] Action "${action}" is NOT allowed on ticket #${ticketId} (current state: "${state}")\n`);
    console.error(`Reason: ${check.reason}\n`);
    console.error(describeWorkflow());
    process.exit(1);
  }
}

/**
 * Guard a state transition against the state machine.
 * Prints a clear error and exits with code 1 if the transition is not permitted.
 */
function assertTransitionAllowed(
  ticketId: number,
  toState: string,
  actorType: "agent" | "human" | "operator" = "agent"
) {
  const fromState = getTicketState(ticketId);
  if (!fromState) return; // can't validate; let API handle it

  const check = canTransition(fromState, toState, actorType);
  if (!check.allowed) {
    console.error(`\n[state-machine] Transition "${fromState}" → "${toState}" is NOT allowed for ticket #${ticketId}\n`);
    console.error(`Reason: ${check.reason}\n`);
    console.error(describeWorkflow());
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────
async function main() {
  if (!command) usage();

  switch (command) {
    case "create-ticket": {
      if (args.length < 2) {
        console.error("Error: create-ticket requires <project-slug> <title>");
        usage();
      }
      const projectSlug = args[0];
      const title = args[1];
      const options: {
        type?: string;
        description?: string;
        acceptanceCriteria?: string;
        origin?: string;
        context?: string;
        assignee?: string;
        priority?: number;
      } = {};

      // Parse flags
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--type' && args[i + 1]) {
          options.type = args[i + 1];
          i++;
        } else if (args[i] === '--description' && args[i + 1]) {
          options.description = args[i + 1];
          i++;
        } else if (args[i] === '--acceptance-criteria' && args[i + 1]) {
          options.acceptanceCriteria = args[i + 1];
          i++;
        } else if (args[i] === '--origin' && args[i + 1]) {
          options.origin = args[i + 1];
          i++;
        } else if (args[i] === '--context' && args[i + 1]) {
          options.context = args[i + 1];
          i++;
        } else if (args[i] === '--assignee' && args[i + 1]) {
          options.assignee = args[i + 1];
          i++;
        } else if (args[i] === '--priority' && args[i + 1]) {
          options.priority = Number(args[i + 1]);
          i++;
        }
      }

      await createTicketCmd(projectSlug, title, options);
      break;
    }

    case "get-comments": {
      if (args.length < 2) {
        console.error("Error: get-comments requires <project-slug> <ticket-id>");
        usage();
      }
      const projectSlug = args[0];
      const ticketId = args[1];
      let limit: {type: 'head' | 'tail', count: number} | undefined;

      // Check for --head or --tail
      const headIdx = args.indexOf('--head');
      const tailIdx = args.indexOf('--tail');
      if (headIdx >= 0 && args[headIdx + 1]) {
        limit = { type: 'head', count: Number(args[headIdx + 1]) };
      } else if (tailIdx >= 0 && args[tailIdx + 1]) {
        limit = { type: 'tail', count: Number(args[tailIdx + 1]) };
      }

      getComments(projectSlug, ticketId, limit);
      break;
    }

    case "get-persona":
      if (args.length < 1) {
        console.error("Error: get-persona requires <persona-id>");
        usage();
      }
      getPersona(args[0]);
      break;

    case "write-artifact":
      if (args.length < 3) {
        console.error("Error: write-artifact requires <ticket-id> <type> <file>");
        usage();
      }
      assertActionAllowed(Number(args[0]), "write-artifact");
      await writeArtifact(args[0], args[1], args[2]);
      break;

    case "read-artifact":
      if (args.length < 2) {
        console.error("Error: read-artifact requires <ticket-id> <type>");
        usage();
      }
      readArtifact(args[0], args[1]);
      break;

    case "sync-artifacts":
      await syncArtifacts();
      break;

    case "search-artifacts":
      if (args.length < 1) {
        console.error("Error: search-artifacts requires <query>");
        usage();
      }
      await searchArtifacts(args.join(' '));
      break;

    case "report":
      if (args.length < 2) {
        console.error("Error: report requires <ticket-id> <message>");
        usage();
      }
      assertActionAllowed(Number(args[0]), "report");
      await reportProgress(args[0], args.slice(1).join(' '));
      break;

    case "check-criteria":
      if (args.length < 2) {
        console.error("Error: check-criteria requires <ticket-id> <index>");
        usage();
      }
      assertActionAllowed(Number(args[0]), "check-criteria");
      await checkCriteria(args[0], args[1]);
      break;

    case "update-ticket": {
      if (args.length < 2) {
        console.error("Error: update-ticket requires <ticket-id> --field <value>");
        usage();
      }
      // Pre-flight state machine check if --state flag is present
      const stateIdx = args.indexOf("--state");
      if (stateIdx >= 0 && args[stateIdx + 1]) {
        assertTransitionAllowed(Number(args[0]), args[stateIdx + 1]);
      }
      await updateTicketCmd(args[0], args.slice(1));
      break;
    }

    case "upload-attachment": {
      if (args.length < 2) {
        console.error("Error: upload-attachment requires <ticket-id> <file> [name] [--tag <tag>]");
        usage();
      }
      assertActionAllowed(Number(args[0]), "upload-attachment");
      const tagIdx = args.indexOf("--tag");
      const uploadTag = tagIdx >= 0 ? args[tagIdx + 1] : undefined;
      const uploadArgs = tagIdx >= 0 ? args.slice(0, tagIdx) : args;
      await uploadAttachment(uploadArgs[0], uploadArgs[1], uploadArgs[2], uploadTag);
      break;
    }

    case "credit-status":
      await creditStatus();
      break;

    case "block-ticket": {
      if (args.length < 1) {
        console.error("Error: block-ticket requires <ticket-id> [reason]");
        usage();
      }
      const blockTicketId = args[0];
      const blockReason = args.slice(1).join(" ") || "Agent hit a blocker — needs human intervention";
      const blockApiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";
      const blockPersonaId = process.env.BONSAI_PERSONA_ID || null;
      const blockRes = await fetch(`${blockApiBase}/api/tickets/${blockTicketId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: blockReason,
          actorType: "agent",
          actorId: blockPersonaId,
        }),
      });
      if (!blockRes.ok) {
        console.error(`Failed to block ticket: ${blockRes.status}`);
        process.exit(1);
      }
      console.log(`Ticket ${blockTicketId} blocked: ${blockReason}`);
      break;
    }

    default:
      console.error(`Error: unknown command '${command}'`);
      usage();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
