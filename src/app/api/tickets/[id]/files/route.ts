import { NextRequest, NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { getProjectById } from "@/db/data/projects";
import { getWorktreePath } from "@/lib/worktree-paths";
import * as fs from "fs";
import * as path from "path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".bonsai-worktrees", ".bonsai-logs",
  "dist", "build", ".turbo", ".cache", "__pycache__", ".venv",
  "coverage", ".nyc_output",
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB max for content reads

interface FileEntry {
  path: string;
  isDir: boolean;
  size: number;
}

function listFilesRecursive(dir: string, base: string, result: FileEntry[], depth = 0) {
  if (depth > 12) return; // prevent infinite recursion
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(base, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      result.push({ path: relPath, isDir: true, size: 0 });
      listFilesRecursive(fullPath, relPath, result, depth + 1);
    } else {
      try {
        const stat = fs.statSync(fullPath);
        result.push({ path: relPath, isDir: false, size: stat.size });
      } catch {
        result.push({ path: relPath, isDir: false, size: 0 });
      }
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticketId = Number(id);

    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!ticket.projectId) {
      return NextResponse.json({ error: "Ticket has no project" }, { status: 400 });
    }
    const project = await getProjectById(ticket.projectId);
    if (!project || !project.localPath) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const worktreePath = getWorktreePath(project.localPath, ticketId);

    // Check if worktree exists, fall back to project root
    const rootPath = fs.existsSync(worktreePath) ? worktreePath : project.localPath;

    const url = new URL(request.url);
    const filePath = url.searchParams.get("path");

    if (!filePath) {
      // List all files
      const files: FileEntry[] = [];
      listFilesRecursive(rootPath, "", files);
      return NextResponse.json({
        files,
        root: rootPath === worktreePath ? "worktree" : "project",
      });
    }

    // Read specific file — validate path doesn't escape root
    const resolved = path.resolve(rootPath, filePath);
    if (!resolved.startsWith(rootPath)) {
      return NextResponse.json({ error: "Path traversal not allowed" }, { status: 403 });
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return NextResponse.json({ error: "Path is a directory" }, { status: 400 });
    }

    if (stat.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: "File too large to display",
        size: stat.size,
        path: filePath,
      }, { status: 413 });
    }

    // Raw mode — serve file directly (for images, etc.)
    const raw = url.searchParams.get("raw");
    if (raw === "1") {
      const ext = path.extname(resolved).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
        ".ico": "image/x-icon",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";
      const buffer = fs.readFileSync(resolved);
      return new NextResponse(buffer, {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
      });
    }

    // Try to read as text
    try {
      const content = fs.readFileSync(resolved, "utf-8");
      return NextResponse.json({ content, path: filePath, size: stat.size });
    } catch {
      return NextResponse.json({ error: "Binary file — cannot display as text", path: filePath }, { status: 422 });
    }
  } catch (error) {
    console.error("Error in files API:", error);
    return NextResponse.json({ error: "Failed to read files" }, { status: 500 });
  }
}
