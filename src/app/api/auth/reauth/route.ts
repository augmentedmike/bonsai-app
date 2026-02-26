import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting, deleteSetting } from "@/db/data/settings";

const HOME = process.env.HOME || "~";
const CLAUDE_CLI = path.join(HOME, ".local", "bin", "claude");
const CLAUDE_JSON = path.join(HOME, ".claude.json");

// ── Token storage keys ───────────────────────────────
const KEY_ACCESS  = "claude_oauth_access_token";
const KEY_REFRESH = "claude_oauth_refresh_token";
const KEY_EXPIRES = "claude_oauth_expires_at";
const KEY_EMAIL   = "claude_oauth_email";

// ── CLI auth status check (works for keychain + file + env) ──
function checkCliAuthStatus(): Promise<{ loggedIn: boolean; authMethod: string; email?: string }> {
  return new Promise((resolve) => {
    let out = "";
    const proc = spawn(CLAUDE_CLI, ["auth", "status", "--json"], {
      env: { ...process.env, CLAUDECODE: "" },
    });
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr?.on("data", () => {});
    proc.on("close", () => {
      try {
        const data = JSON.parse(out);
        resolve({
          loggedIn: data.loggedIn === true,
          authMethod: data.authMethod || "none",
          email: data.email || data.primaryEmail || undefined,
        });
      } catch {
        resolve({ loggedIn: false, authMethod: "none" });
      }
    });
    proc.on("error", () => resolve({ loggedIn: false, authMethod: "none" }));
    setTimeout(() => resolve({ loggedIn: false, authMethod: "none" }), 6000);
  });
}

// ── Opportunistic: read token from ~/.claude.json if available ──
function readClaudeOauthFromDisk(): { accessToken: string; refreshToken?: string; expiresAt?: string; email?: string } | null {
  try {
    const data = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8"));
    const oauth = data?.claudeAiOauth;
    if (oauth?.accessToken) {
      return {
        accessToken: oauth.accessToken,
        refreshToken: oauth.refreshToken,
        expiresAt: oauth.expiresAt,
        email: data?.oauthAccount?.emailAddress,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// GET — source of truth is `claude auth status` (handles keychain + file + CLAUDE_CODE_OAUTH_TOKEN)
export async function GET() {
  const status = await checkCliAuthStatus();

  if (status.loggedIn) {
    // Opportunistically sync file-based token to DB for dispatch injection
    const disk = readClaudeOauthFromDisk();
    if (disk?.accessToken) {
      await setSetting(KEY_ACCESS, disk.accessToken);
      if (disk.refreshToken) await setSetting(KEY_REFRESH, disk.refreshToken);
      if (disk.expiresAt) await setSetting(KEY_EXPIRES, disk.expiresAt);
      if (disk.email) await setSetting(KEY_EMAIL, disk.email);
    }
    return NextResponse.json({ loggedIn: true, authMethod: status.authMethod, email: status.email });
  }

  return NextResponse.json({ loggedIn: false });
}

/**
 * POST — trigger `claude auth login` on the server machine.
 * Opens browser for Anthropic OAuth. Poll until logged in.
 */
export async function POST() {
  const child = spawn(CLAUDE_CLI, ["auth", "login"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, CLAUDECODE: "" },
  });
  child.unref();

  console.log("[auth] Spawned claude auth login — browser should open");
  pollUntilLoggedIn();

  return NextResponse.json({ ok: true, message: "Login started — complete OAuth in your browser." });
}

// DELETE — clear stored token
export async function DELETE() {
  await deleteSetting(KEY_ACCESS);
  await deleteSetting(KEY_REFRESH);
  await deleteSetting(KEY_EXPIRES);
  await deleteSetting(KEY_EMAIL);
  return NextResponse.json({ ok: true });
}

/** Poll claude auth status every 4s for up to 5 minutes */
function pollUntilLoggedIn() {
  const MAX = 75;
  let n = 0;
  const iv = setInterval(async () => {
    n++;
    try {
      const s = await checkCliAuthStatus();
      if (s.loggedIn) {
        await deleteSetting("auth_expired");
        // Sync disk token if available
        const disk = readClaudeOauthFromDisk();
        if (disk?.accessToken) {
          await setSetting(KEY_ACCESS, disk.accessToken);
          if (disk.refreshToken) await setSetting(KEY_REFRESH, disk.refreshToken);
          if (disk.expiresAt) await setSetting(KEY_EXPIRES, disk.expiresAt);
          if (disk.email) await setSetting(KEY_EMAIL, disk.email);
        }
        console.log(`[auth] Logged in as ${s.email}`);
        clearInterval(iv);
      }
    } catch {}
    if (n >= MAX) clearInterval(iv);
  }, 4_000);
}

/** Called by dispatch — returns access token if available in DB, otherwise null (CLI keychain auth works without it) */
export async function getOAuthTokenForDispatch(): Promise<string | null> {
  const token = await getSetting(KEY_ACCESS);
  if (!token) return null;
  const expiresAt = await getSetting(KEY_EXPIRES);
  if (expiresAt && new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000) return null;
  return token;
}
