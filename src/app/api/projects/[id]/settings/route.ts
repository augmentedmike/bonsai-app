import { NextResponse } from "next/server";
import { getProjectById, updateProject } from "@/db/data/projects";
import { getWorktreeDir } from "@/lib/worktree-paths";
import * as fs from "fs";
import * as path from "path";

// GET /api/projects/[id]/settings - Get project settings including .env variables
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.localPath) {
    return NextResponse.json({ error: "Project has no local path" }, { status: 400 });
  }

  // Read .env file from project directory
  const envPath = path.join(project.localPath, ".env");
  let envVars: Array<{ key: string; value: string }> = [];

  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const lines = envContent.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key) {
            envVars.push({
              key: key.trim(),
              value: valueParts.join("=").trim()
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to read .env:", error);
  }

  // Check if worktree directory exists
  const worktreeDir = getWorktreeDir(project.localPath);
  const worktreeExists = fs.existsSync(worktreeDir);

  // Detect framework and suggest default commands
  let suggestedBuildCommand = "";
  let suggestedRunCommand = "npm run dev -- --port {{PORT}}";
  try {
    const pkgPath = path.join(project.localPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["next"]) {
        suggestedBuildCommand = "npm install";
        suggestedRunCommand = "npm run dev -- --port {{PORT}}";
      } else if (deps["vite"]) {
        suggestedBuildCommand = "npm install";
        suggestedRunCommand = "npx vite --port {{PORT}}";
      } else if (deps["react-scripts"]) {
        suggestedBuildCommand = "npm install";
        suggestedRunCommand = "PORT={{PORT}} npm start";
      } else {
        suggestedBuildCommand = "npm install";
      }
    } else if (fs.existsSync(path.join(project.localPath, "build.py"))) {
      suggestedBuildCommand = "python build.py";
      suggestedRunCommand = "python -m http.server {{PORT}} --directory docs";
    }
  } catch { /* ignore detection errors */ }

  return NextResponse.json({
    buildCommand: project.buildCommand,
    runCommand: project.runCommand,
    envVars,
    worktreeDir,
    worktreeExists,
    suggestedBuildCommand,
    suggestedRunCommand,
  });
}

// PATCH /api/projects/[id]/settings - Update build/run commands and env vars
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  const body = await req.json();

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.localPath) {
    return NextResponse.json({ error: "Project has no local path" }, { status: 400 });
  }

  // Update build/run commands in database
  if ("buildCommand" in body || "runCommand" in body) {
    await updateProject(projectId, {
      buildCommand: body.buildCommand ?? project.buildCommand,
      runCommand: body.runCommand ?? project.runCommand,
    });
  }

  // Update .env file
  if (body.envVars) {
    const envPath = path.join(project.localPath, ".env");
    const lines = body.envVars.map((v: { key: string; value: string }) =>
      `${v.key}=${v.value}`
    );
    fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
  }

  return NextResponse.json({ success: true });
}
