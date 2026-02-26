import { NextResponse } from "next/server";
import { getProjects, createProject, updateProject, softDeleteProject } from "@/db/data/projects";
// GitHub token stored in settings table
import { execFileSync, execFile } from "node:child_process";
import type { Project } from "@/types";

// ── In-memory cache for GET /api/projects ────────────────────────────────
// Projects rarely change; a 30s TTL eliminates the cold-start SQLite hit.
let projectsCache: { data: Project[]; ts: number } | null = null;
const PROJECTS_CACHE_TTL_MS = 30_000;

function invalidateProjectsCache() {
  projectsCache = null;
}
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

const HOME = process.env.HOME || "~";
const PROJECTS_DIR = path.join(HOME, "development", "bonsai", "projects");

async function githubFetch(ghPath: string, token: string, options?: RequestInit) {
  return fetch(`https://api.github.com${ghPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

export async function POST(req: Request) {
  const { name, visibility, description } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const token = process.env.GITHUB_TOKEN;

  let githubOwner: string | undefined;
  let githubRepo: string | undefined;
  let finalSlug = slug;

  if (token) {
    // Get authenticated user
    const userRes = await githubFetch("/user", token);
    if (userRes.ok) {
      const githubUser = await userRes.json();
      githubOwner = githubUser.login;

      // Check if repo exists
      const repoCheckRes = await githubFetch(`/repos/${githubOwner}/${slug}`, token);
      if (repoCheckRes.status === 404) {
        // Create new repo
        const createRes = await githubFetch("/user/repos", token, {
          method: "POST",
          body: JSON.stringify({
            name: slug,
            description: description?.trim() || `${name.trim()} — managed by Bonsai`,
            private: visibility !== "public",
            auto_init: true,
          }),
        });
        if (createRes.ok) {
          const repo = await createRes.json();
          finalSlug = repo.name;
          githubRepo = repo.name;
        } else {
          const err = await createRes.json().catch(() => ({}));
          return NextResponse.json(
            { error: err.message || "Failed to create GitHub repository" },
            { status: createRes.status }
          );
        }
      } else if (repoCheckRes.ok) {
        githubRepo = slug;
      }

      // Clone repo into {projectDir}/repo/ subdirectory
      const projectDir = path.join(PROJECTS_DIR, finalSlug);
      const repoPath = path.join(projectDir, "repo");

      if (githubRepo && !fs.existsSync(repoPath)) {
        fs.mkdirSync(projectDir, { recursive: true });
        // Shallow clone (--depth 1) to handle large repos; async to not block event loop
        // Try gh CLI first (uses keyring auth), then authenticated HTTPS, then public HTTPS
        const cloneAttempts: { cmd: string; args: string[] }[] = [
          { cmd: "gh", args: ["repo", "clone", `${githubOwner}/${githubRepo}`, "repo", "--", "--depth", "1"] },
          { cmd: "git", args: ["clone", "--depth", "1", `https://${token}@github.com/${githubOwner}/${githubRepo}.git`, "repo"] },
          { cmd: "git", args: ["clone", "--depth", "1", `https://github.com/${githubOwner}/${githubRepo}.git`, "repo"] },
        ];
        let cloned = false;
        for (const attempt of cloneAttempts) {
          try {
            await execFileAsync(attempt.cmd, attempt.args, {
              cwd: projectDir,
              timeout: 120_000,
              env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
            });
            cloned = true;
            break;
          } catch (err: unknown) {
            console.error(`[POST /api/projects] clone failed (${attempt.cmd}):`, err instanceof Error ? err.message : err);
            const partialRepo = path.join(projectDir, "repo");
            if (fs.existsSync(partialRepo)) {
              fs.rmSync(partialRepo, { recursive: true, force: true });
            }
          }
        }
        if (!cloned) {
          console.error("[POST /api/projects] all clone attempts failed for", githubOwner, githubRepo);
        }
      }
    }
  }

  const localPath = path.join(PROJECTS_DIR, finalSlug);
  const repoDir = path.join(localPath, "repo");
  const worktreesDir = path.join(localPath, "worktrees");

  // Ensure project directory and worktrees directory exist
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // CRITICAL VERIFICATION: Ensure repo/ directory exists with .git
  if (!fs.existsSync(repoDir)) {
    return NextResponse.json(
      { error: "Failed to clone repository. Check your GitHub token or try again." },
      { status: 500 }
    );
  }
  const gitDir = path.join(repoDir, ".git");
  if (!fs.existsSync(gitDir)) {
    return NextResponse.json(
      { error: "Cloned directory is not a valid git repository. Try again." },
      { status: 500 }
    );
  }

  try {
    const project = await createProject({
      name: name.trim(),
      slug: finalSlug,
      visibility: visibility || "private",
      description: description?.trim() || undefined,
      localPath,
      githubOwner,
      githubRepo,
    });
    invalidateProjectsCache();
    return NextResponse.json({ success: true, project });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/projects] createProject failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const now = Date.now();
  if (projectsCache && now - projectsCache.ts < PROJECTS_CACHE_TTL_MS) {
    return NextResponse.json({ projects: projectsCache.data });
  }
  const allProjects = await getProjects();
  projectsCache = { data: allProjects, ts: now };
  return NextResponse.json({ projects: allProjects });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if ("description" in body) updates.description = body.description?.trim() || "";
  if ("targetCustomer" in body) updates.targetCustomer = body.targetCustomer?.trim() || "";
  if ("techStack" in body) updates.techStack = body.techStack?.trim() || "";
  if ("buildCommand" in body) updates.buildCommand = body.buildCommand?.trim() || null;
  if ("runCommand" in body) updates.runCommand = body.runCommand?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await updateProject(Number(id), updates);
  invalidateProjectsCache();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  }

  // Fetch project to get GitHub details before deleting
  const { getProjectById } = await import("@/db/data/projects");
  const project = await getProjectById(Number(id));

  // Delete GitHub repo if it exists
  if (project?.githubOwner && project?.githubRepo) {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      try {
        const res = await githubFetch(
          `/repos/${project.githubOwner}/${project.githubRepo}`,
          token,
          { method: "DELETE" }
        );
        if (!res.ok && res.status !== 404) {
          console.error("[DELETE /api/projects] GitHub repo deletion failed:", res.status);
        }
      } catch (err) {
        console.error("[DELETE /api/projects] GitHub repo deletion error:", err);
      }
    }
  }

  // Remove local clone directory
  if (project?.localPath) {
    try {
      fs.rmSync(project.localPath, { recursive: true, force: true });
    } catch {
      // Directory may not exist — that's fine
    }
  }

  // Delete associated resources to prevent orphans (order matters for FK constraints)
  const { db } = await import("@/db/index");
  const { personas, tickets, comments, ticketAttachments, agentRuns, projectMessages } = await import("@/db/schema");
  const { eq, inArray, sql } = await import("drizzle-orm");

  const projectId = Number(id);

  // Get all ticket IDs for this project
  const ticketRows = db.select({ id: tickets.id }).from(tickets).where(eq(tickets.projectId, projectId)).all();
  const ticketIds = ticketRows.map((r) => r.id);

  if (ticketIds.length > 0) {
    // Delete child records that reference tickets (deepest first)
    db.delete(comments).where(inArray(comments.ticketId, ticketIds)).run();
    db.delete(ticketAttachments).where(inArray(ticketAttachments.ticketId, ticketIds)).run();
    db.delete(agentRuns).where(inArray(agentRuns.ticketId, ticketIds)).run();
    // Audit log has no FK constraint but clean it up too
    db.run(sql`DELETE FROM ticket_audit_log WHERE ticket_id IN (${sql.join(ticketIds.map(id => sql`${id}`), sql`, `)})`);
    // Now safe to delete tickets
    db.delete(tickets).where(eq(tickets.projectId, projectId)).run();
  }

  // Delete project messages
  db.delete(projectMessages).where(eq(projectMessages.projectId, projectId)).run();
  await softDeleteProject(projectId);
  invalidateProjectsCache();
  return NextResponse.json({ success: true });
}
