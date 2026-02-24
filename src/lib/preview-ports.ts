import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";
import { execSync } from "node:child_process";

/**
 * Preview port allocator — round-robin of 10 ports per project.
 *
 * Each project gets ports: BASE + (projectId % 100) * 10 .. +9
 * Allocations are tracked in {projectLocalPath}/.bonsai-logs/preview-ports.json
 * When all 10 slots are taken, the oldest server is killed and its port reused.
 */

const PORT_BASE = 4000;
const PORTS_PER_PROJECT = 10;

interface PortEntry {
  ticketId: number;
  port: number;
  pid: number;
  startedAt: string;
}

function portMapPath(projectLocalPath: string): string {
  return path.join(projectLocalPath, ".bonsai-logs", "preview-ports.json");
}

function readPortMap(projectLocalPath: string): PortEntry[] {
  const p = portMapPath(projectLocalPath);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writePortMap(projectLocalPath: string, entries: PortEntry[]): void {
  const dir = path.dirname(portMapPath(projectLocalPath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(portMapPath(projectLocalPath), JSON.stringify(entries, null, 2));
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

function killPort(port: number): void {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: "ignore" });
  } catch {
    // Nothing running on that port
  }
}

/** Get the 10-port range for a project */
export function getProjectPortRange(projectId: number): { base: number; end: number } {
  const base = PORT_BASE + (projectId % 100) * PORTS_PER_PROJECT;
  return { base, end: base + PORTS_PER_PROJECT - 1 };
}

/**
 * Allocate a preview port for a ticket within its project's 10-port pool.
 *
 * 1. If this ticket already has a live port, return it.
 * 2. Otherwise find an unused slot in the pool.
 * 3. If all 10 are occupied, kill the oldest and reuse its port.
 *
 * Returns { port, reused } where reused indicates an existing server was found.
 */
export async function allocatePreviewPort(
  projectId: number,
  projectLocalPath: string,
  ticketId: number
): Promise<{ port: number; reused: boolean }> {
  const { base } = getProjectPortRange(projectId);
  let entries = readPortMap(projectLocalPath);

  // Prune entries whose ports are no longer in use
  const pruned: PortEntry[] = [];
  for (const e of entries) {
    if (await isPortInUse(e.port)) {
      pruned.push(e);
    }
  }
  entries = pruned;

  // Check if this ticket already has a live port
  const existing = entries.find((e) => e.ticketId === ticketId);
  if (existing && (await isPortInUse(existing.port))) {
    writePortMap(projectLocalPath, entries);
    return { port: existing.port, reused: true };
  }

  // Remove stale entry for this ticket if port is dead
  entries = entries.filter((e) => e.ticketId !== ticketId);

  // Find first free port in the pool
  const usedPorts = new Set(entries.map((e) => e.port));
  for (let slot = 0; slot < PORTS_PER_PROJECT; slot++) {
    const port = base + slot;
    if (!usedPorts.has(port) && !(await isPortInUse(port))) {
      entries.push({ ticketId, port, pid: 0, startedAt: new Date().toISOString() });
      writePortMap(projectLocalPath, entries);
      return { port, reused: false };
    }
  }

  // All 10 slots occupied — evict the oldest
  entries.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const oldest = entries.shift()!;
  console.log(`[preview-ports] Evicting ticket ${oldest.ticketId} from port ${oldest.port} (started ${oldest.startedAt})`);
  killPort(oldest.port);

  // Wait for port to be released
  await new Promise((resolve) => setTimeout(resolve, 500));

  const port = oldest.port;
  entries.push({ ticketId, port, pid: 0, startedAt: new Date().toISOString() });
  writePortMap(projectLocalPath, entries);
  return { port, reused: false };
}

/** Update the PID for a ticket's port entry after spawning the server */
export function updatePortPid(projectLocalPath: string, ticketId: number, pid: number): void {
  const entries = readPortMap(projectLocalPath);
  const entry = entries.find((e) => e.ticketId === ticketId);
  if (entry) {
    entry.pid = pid;
    entry.startedAt = new Date().toISOString();
    writePortMap(projectLocalPath, entries);
  }
}

/** Release a ticket's port (called when killing a preview) */
export function releasePort(projectLocalPath: string, ticketId: number): void {
  const entries = readPortMap(projectLocalPath).filter((e) => e.ticketId !== ticketId);
  writePortMap(projectLocalPath, entries);
}
