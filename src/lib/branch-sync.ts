import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

const gitOpts = (cwd: string) => ({
  cwd,
  encoding: "utf-8" as const,
  stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
});

export type SyncResult =
  | { status: "up-to-date" }
  | { status: "synced"; mergeCommit: string }
  | { status: "conflict"; files: string[] }
  | { status: "error"; message: string };

/**
 * Check if a branch is behind main using rev-list.
 * Returns the number of commits the branch is behind.
 */
export function commitsBehindMain(mainRepo: string, branchName: string): number {
  try {
    const output = execFileSync(
      "git",
      ["rev-list", "--count", `${branchName}..main`],
      gitOpts(mainRepo)
    ).trim();
    return parseInt(output, 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Detect merge conflicts between a branch and main using git merge-tree.
 * Returns null if no conflicts, or a list of conflicting file paths.
 * Uses --write-tree which has zero side effects (no working tree changes).
 */
export function detectConflicts(
  mainRepo: string,
  branchName: string
): string[] | null {
  try {
    // git merge-tree --write-tree exits 0 if clean, 1 if conflicts
    execFileSync(
      "git",
      ["merge-tree", "--write-tree", branchName, "main"],
      gitOpts(mainRepo)
    );
    // Exit 0 = no conflicts
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? (err as NodeJS.ErrnoException & { stderr?: string }).stderr || err.message : String(err);
    // Parse conflict file list from merge-tree output
    // merge-tree --write-tree outputs conflicting paths on failure
    if (msg.includes("CONFLICT")) {
      const conflicts = msg
        .split("\n")
        .filter((line) => line.includes("CONFLICT"))
        .map((line) => {
          // Extract filename from "CONFLICT (content): Merge conflict in <file>"
          const match = line.match(/Merge conflict in (.+)/);
          return match ? match[1].trim() : line.trim();
        })
        .filter(Boolean);
      return conflicts.length > 0 ? conflicts : ["(unknown files)"];
    }
    // If merge-tree itself fails (e.g. old git version), fall back to null
    return null;
  }
}

/**
 * Synchronize a branch with main by merging main into it.
 * This is a forward-merge: non-destructive, atomic, no force-push needed.
 *
 * For worktree branches: performs the merge inside the worktree working directory.
 * For non-worktree branches: performs the merge in the main repo.
 *
 * @param mainRepo - Path to the main repository
 * @param branchName - Branch name (e.g. "ticket/tkt_42")
 * @param worktreePath - Optional path to the worktree (if branch has an active worktree)
 */
export function syncBranchWithMain(
  mainRepo: string,
  branchName: string,
  worktreePath?: string
): SyncResult {
  try {
    // 1. Fetch latest main from origin (if remote exists)
    try {
      execFileSync("git", ["fetch", "origin", "main"], gitOpts(mainRepo));
    } catch {
      // No remote or offline — continue with local main
    }

    // 2. Check if branch is behind main
    const behind = commitsBehindMain(mainRepo, branchName);
    if (behind === 0) {
      return { status: "up-to-date" };
    }

    // 3. Dry-run conflict detection
    const conflicts = detectConflicts(mainRepo, branchName);
    if (conflicts) {
      return { status: "conflict", files: conflicts };
    }

    // 4. Perform the actual merge
    const mergeCwd = worktreePath && fs.existsSync(worktreePath)
      ? worktreePath
      : mainRepo;

    // If working in the worktree, merge main into the current branch there
    // If no worktree, we need to checkout the branch first (or merge in main repo context)
    if (worktreePath && fs.existsSync(worktreePath)) {
      // Commit any uncommitted work first to prevent data loss
      try {
        execFileSync("git", ["add", "-A"], gitOpts(mergeCwd));
        const status = execFileSync(
          "git",
          ["status", "--porcelain"],
          gitOpts(mergeCwd)
        ).trim();
        if (status) {
          execFileSync(
            "git",
            ["commit", "-m", "auto-commit: save WIP before sync with main"],
            gitOpts(mergeCwd)
          );
        }
      } catch {
        // Nothing to commit — that's fine
      }

      // Merge main into the worktree's current branch
      execFileSync(
        "git",
        ["merge", "main", "-m", `sync: merge main into ${branchName}`],
        gitOpts(mergeCwd)
      );
    } else {
      // No active worktree — merge main into the branch using a temporary checkout
      // This case handles branches that exist but don't have a worktree yet
      // We use a temporary worktree to perform the merge safely
      const tmpWorktree = `${mainRepo}/.git/tmp-sync-${Date.now()}`;
      try {
        execFileSync(
          "git",
          ["worktree", "add", tmpWorktree, branchName],
          gitOpts(mainRepo)
        );
        execFileSync(
          "git",
          ["merge", "main", "-m", `sync: merge main into ${branchName}`],
          gitOpts(tmpWorktree)
        );
      } finally {
        // Always clean up the temporary worktree
        try {
          execFileSync(
            "git",
            ["worktree", "remove", tmpWorktree, "--force"],
            gitOpts(mainRepo)
          );
        } catch {
          // Best effort cleanup
        }
      }
    }

    const mergeCommit = execFileSync(
      "git",
      ["rev-parse", branchName],
      gitOpts(mainRepo)
    ).trim();

    return { status: "synced", mergeCommit };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the merge failed mid-way, abort it
    const mergeCwd = worktreePath && fs.existsSync(worktreePath)
      ? worktreePath
      : mainRepo;
    try {
      execFileSync("git", ["merge", "--abort"], gitOpts(mergeCwd));
    } catch {
      // No merge in progress — that's fine
    }
    return { status: "error", message: msg.slice(0, 500) };
  }
}

/**
 * Verify that a branch is up-to-date with main.
 * Returns true if the branch contains all commits from main.
 */
export function isBranchSyncedWithMain(
  mainRepo: string,
  branchName: string
): boolean {
  return commitsBehindMain(mainRepo, branchName) === 0;
}
