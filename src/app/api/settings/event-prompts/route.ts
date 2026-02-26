import { NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting } from "@/db/data/settings";

// ── Role Context ──
// Team context is now auto-built from the roles table at dispatch time.
// The context_role_* settings are no longer used — team descriptions come
// from roles.description (editable in Settings > Roles).

const CONTEXT_KEYS = [] as const;

// ── Event Prompts (triggered on specific lifecycle events) ──

const EVENT_PROMPT_KEYS = [
  "prompt_researcher_new_ticket",
  "prompt_developer_new_ticket",
  "prompt_designer_new_ticket",
  "prompt_researcher_epic_subtask",
  "prompt_developer_epic_subtask",
  "prompt_designer_epic_subtask",
] as const;

const EVENT_DEFAULTS: Record<string, string> = {
  prompt_researcher_new_ticket: `New ticket created. Begin your investigation — explore the codebase, understand the problem space, and produce your research artifact. Hand off findings to the right team member when done.`,

  prompt_developer_new_ticket: `New ticket created. @researcher is investigating. Once research is complete, create your implementation plan. Do not start coding yet.`,

  prompt_designer_new_ticket: `New ticket created. Assess whether there is design work involved. If yes: review research from @researcher, survey existing components, and produce a design spec. If no: report that and stand down.`,

  prompt_researcher_epic_subtask: `New sub-ticket created (part of an epic). Investigate this specific piece — understand its scope, codebase context, and constraints. Produce a focused research artifact and hand off to the appropriate team member.`,

  prompt_developer_epic_subtask: `New sub-ticket created (part of an epic). @researcher is investigating this piece. Once research is complete, create your implementation plan for this specific sub-ticket.`,

  prompt_designer_epic_subtask: `New sub-ticket created (part of an epic). Assess whether this sub-ticket has design work. If yes: scope the design and produce a spec. If no: report that and stand down.`,
};

const ALL_KEYS = [...CONTEXT_KEYS, ...EVENT_PROMPT_KEYS] as const;
type AllKey = (typeof ALL_KEYS)[number];
const ALL_DEFAULTS: Record<string, string> = { ...EVENT_DEFAULTS };

export async function GET() {
  const contexts: Record<string, { value: string; isDefault: boolean }> = {};
  const prompts: Record<string, { value: string; isDefault: boolean }> = {};

  for (const key of EVENT_PROMPT_KEYS) {
    const stored = await getSetting(key);
    prompts[key] = {
      value: stored ?? EVENT_DEFAULTS[key],
      isDefault: !stored,
    };
  }

  return NextResponse.json({
    contexts,
    prompts,
    defaults: ALL_DEFAULTS,
  });
}

export async function POST(req: Request) {
  const { key, value } = await req.json();

  if (!ALL_KEYS.includes(key as AllKey)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  if (value === undefined || value === null) {
    return NextResponse.json({ error: "Value required" }, { status: 400 });
  }

  const trimmed = (value as string).trim();
  setSetting(key, trimmed);

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { key } = await req.json();

  if (!ALL_KEYS.includes(key as AllKey)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  await deleteSetting(key);

  return NextResponse.json({ success: true, value: ALL_DEFAULTS[key] });
}
