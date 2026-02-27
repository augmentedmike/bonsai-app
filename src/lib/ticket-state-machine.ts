/**
 * Bonsai Ticket State Machine
 *
 * Enforces:
 *  1. Valid state transitions (what state can follow what)
 *  2. Valid agent actions per state (what CLI commands / API actions
 *     are allowed when a ticket is in a given state)
 *
 * Human operators (via the board UI) bypass enforcement — this is agent-only.
 * Custom / pipeline states (target, contacted, etc.) allow free transitions
 * among themselves but still validate entry from / exit to core states.
 */

// ── State definitions ────────────────────────────────────────────────────────

export const CORE_STATES = ["planning", "building", "review", "blocked", "shipped"] as const;
export type CoreState = (typeof CORE_STATES)[number];

/** Any string outside CORE_STATES is a "pipeline" state (investor funnel, etc.) */
export type TicketState = CoreState | string;

// ── Transition map ───────────────────────────────────────────────────────────
// Key   = "from" state
// Value = allowed "to" states (agent-initiated; human can always override)

const TRANSITIONS: Record<string, string[]> = {
  planning:  ["building", "blocked"],
  building:  ["shipped", "planning", "blocked", "review"],
  review:    ["building", "shipped"],
  blocked:   ["planning", "building"],
  shipped:   ["planning"],   // reopen
};

// ── Agent CLI / API actions ──────────────────────────────────────────────────

export type AgentAction =
  | "dispatch"            // spin up an agent on the ticket
  | "write-artifact"      // POST /documents / attachments
  | "upload-attachment"   // POST /attachments
  | "report"              // POST /report  (agent progress comment)
  | "check-criteria"      // POST /check-criteria
  | "block-ticket"        // POST /block
  | "agent-complete"      // POST /agent-complete (mark work done)
  | "ship"                // POST /ship (merge & mark shipped)
  | "approve-plan"        // POST /approve-plan
  | "approve-research"    // POST /approve-research
  | "read-artifact"       // GET  /documents  (always allowed)
  | "get-comments"        // GET  /comments   (always allowed)
  | "get-ticket"          // GET              (always allowed)
  | "create-comment"      // direct comment insert
  | "sync-artifacts"      // file-sync helper
  | "search-artifacts";   // search helper

/** Actions that are always read-only / safe — never blocked. */
const ALWAYS_ALLOWED: AgentAction[] = [
  "read-artifact",
  "get-comments",
  "get-ticket",
  "sync-artifacts",
  "search-artifacts",
];

/** Actions allowed per core state. Pipeline states allow everything except ship/dispatch. */
const STATE_ACTIONS: Record<string, AgentAction[]> = {
  planning: [
    "dispatch",
    "approve-plan",
    "approve-research",
    "report",          // initial research note
  ],
  building: [
    "write-artifact",
    "upload-attachment",
    "report",
    "check-criteria",
    "block-ticket",
    "agent-complete",
    "approve-research",
    "create-comment",
  ],
  review: [
    "write-artifact",  // address review comments
    "upload-attachment",
    "report",
    "block-ticket",
    "create-comment",
  ],
  blocked: [
    "report",          // explain what's blocked
    "create-comment",
  ],
  shipped: [
    // shipped is read-only for agents
    "create-comment",  // post-ship notes only
  ],
};

// ── Public API ───────────────────────────────────────────────────────────────

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if an agent is allowed to move a ticket from `from` to `to`.
 * Humans (actorType="human") always bypass this check.
 */
export function canTransition(
  from: TicketState,
  to: TicketState,
  actorType: "agent" | "human" | "operator" | "system" = "agent"
): TransitionResult {
  // Humans and system can always move tickets
  if (actorType === "human" || actorType === "system") {
    return { allowed: true };
  }

  // Same state — no-op is always fine
  if (from === to) return { allowed: true };

  // Both are pipeline/custom states → free movement within the pipeline
  const fromIsCore = CORE_STATES.includes(from as CoreState);
  const toIsCore   = CORE_STATES.includes(to as CoreState);

  if (!fromIsCore && !toIsCore) {
    return { allowed: true }; // pipeline→pipeline free
  }

  // Core→custom or custom→core: only allow if custom transitions to/from "planning"
  if (!fromIsCore && toIsCore) {
    if (to === "planning") return { allowed: true };
    return {
      allowed: false,
      reason: `Cannot move from custom state "${from}" directly to "${to}". Move to "planning" first.`,
    };
  }

  if (fromIsCore && !toIsCore) {
    if (from === "planning") return { allowed: true }; // planning→custom (e.g. investor pipeline entry)
    return {
      allowed: false,
      reason: `Cannot move from "${from}" to custom state "${to}". Only "planning" state can transition to pipeline states.`,
    };
  }

  // Both core — check transition map
  const allowed = TRANSITIONS[from]?.includes(to) ?? false;
  if (!allowed) {
    const validNext = TRANSITIONS[from] ?? [];
    return {
      allowed: false,
      reason: validNext.length > 0
        ? `Cannot move from "${from}" → "${to}". Valid transitions from "${from}": ${validNext.join(", ")}.`
        : `"${from}" is a terminal state — no transitions allowed for agents.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if an agent action is permitted on a ticket in the given state.
 * Always-allowed read actions pass through unconditionally.
 */
export function canPerformAction(
  state: TicketState,
  action: AgentAction,
  actorType: "agent" | "human" | "operator" | "system" = "agent"
): TransitionResult {
  // Humans and operators always bypass
  if (actorType === "human" || actorType === "operator" || actorType === "system") {
    return { allowed: true };
  }

  // Read-only actions are always safe
  if (ALWAYS_ALLOWED.includes(action)) return { allowed: true };

  // ship action: only allowed in building or review
  if (action === "ship") {
    const ok = state === "building" || state === "review";
    return ok
      ? { allowed: true }
      : { allowed: false, reason: `Cannot ship a ticket that is in "${state}" state. Ticket must be in "building" or "review".` };
  }

  // dispatch action: allowed in planning (researcher) and building (developer), blocked elsewhere
  if (action === "dispatch") {
    if (state === "shipped") {
      return { allowed: false, reason: `Ticket is "shipped" — cannot dispatch an agent on completed work. Reopen to "planning" first if rework is needed.` };
    }
    if (state === "blocked") {
      return { allowed: false, reason: `Ticket is "blocked" — a human must resolve the blocker before dispatch.` };
    }
    // planning and building are both valid dispatch targets (researcher / developer respectively)
    return { allowed: true };
  }

  // Pipeline states allow most actions except ship/dispatch (handled above)
  const isCore = CORE_STATES.includes(state as CoreState);
  if (!isCore) {
    // Pipeline state — agents can report and create comments, but no code actions
    const pipelineAllowed: AgentAction[] = ["report", "create-comment", "block-ticket"];
    if (!pipelineAllowed.includes(action)) {
      return {
        allowed: false,
        reason: `Action "${action}" is not allowed on a ticket in pipeline state "${state}". Pipeline tickets only support: ${pipelineAllowed.join(", ")}.`,
      };
    }
    return { allowed: true };
  }

  // Core state check
  const allowed = STATE_ACTIONS[state]?.includes(action) ?? false;
  if (!allowed) {
    const validActions = STATE_ACTIONS[state] ?? [];
    return {
      allowed: false,
      reason: `Action "${action}" is not allowed when ticket is in "${state}" state. ` +
        (validActions.length > 0
          ? `Allowed actions in "${state}": ${[...ALWAYS_ALLOWED, ...validActions].join(", ")}.`
          : `Ticket is in "${state}" — agent actions are not permitted.`),
    };
  }

  return { allowed: true };
}

/**
 * Describe the expected flow in a human-readable format.
 * Used in error messages to orient confused agents.
 */
export function describeWorkflow(): string {
  return `
Ticket workflow:
  planning  → (dispatch agent) → building → (agent-complete) → shipped
  building  → (block-ticket)   → blocked  → (human unblocks) → planning/building
  building  → (submit review)  → review   → (approve)        → shipped
  shipped   → (reopen)         → planning

Agent actions by state:
  planning : dispatch, report, approve-plan, approve-research
  building : write-artifact, upload-attachment, report, check-criteria, block-ticket, agent-complete
  review   : write-artifact, upload-attachment, report, block-ticket
  blocked  : report (explain blocker)
  shipped  : create-comment (read-only, no code changes)
`.trim();
}

/** Emit a structured error payload for API responses */
export function stateMachineError(result: TransitionResult, ticketId?: number) {
  return {
    error: "state_machine_violation",
    message: result.reason ?? "Action not permitted in current ticket state.",
    workflow: describeWorkflow(),
    ticketId,
  };
}
