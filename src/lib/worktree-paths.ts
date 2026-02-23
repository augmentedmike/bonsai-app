import * as path from "path";
import { formatTicketSlug } from "@/types";

/**
 * Get the worktree directory for a project
 * Single source of truth for worktree path structure
 */
export function getWorktreeDir(projectLocalPath: string): string {
  return path.join(projectLocalPath, "worktrees");
}

/**
 * Get the worktree path for a specific ticket
 */
export function getWorktreePath(projectLocalPath: string, ticketId: number): string {
  return path.join(getWorktreeDir(projectLocalPath), formatTicketSlug(ticketId));
}
