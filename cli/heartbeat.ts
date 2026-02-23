#!/usr/bin/env node

/**
 * heartbeat.ts — CLI entry point for the Bonsai heartbeat automation
 *
 * Invoked by system scheduler (launchd on macOS, cron on Linux) every 60 seconds.
 * Uses file locking to prevent concurrent execution.
 *
 * Usage: bonsai-heartbeat [options]
 *   --limit N       Maximum tickets to dispatch per phase (default: 1)
 *   --env ENV       Environment: dev or prod (default: from BONSAI_ENV)
 *   --help, -h      Show help message
 *   --version, -v   Show version
 *
 * Exit codes:
 *   0 - Success or already running (lock held)
 *   1 - Error occurred
 */

import * as path from "path";
import * as os from "os";
import { FileLock } from "../lib/file-lock.js";
import { runDispatch } from "../lib/dispatcher.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

interface CliOptions {
  limit: number;
  env: "dev" | "prod";
  help: boolean;
  version: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    limit: 1,
    env: (process.env.BONSAI_ENV as any) === "dev" ? "dev" : "prod",
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--limit") {
      const limitArg = args[++i];
      if (limitArg) {
        options.limit = parseInt(limitArg, 10);
      }
    } else if (arg === "--env") {
      const envArg = args[++i];
      if (envArg === "dev" || envArg === "prod") {
        options.env = envArg;
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Bonsai Heartbeat CLI

Usage: bonsai-heartbeat [options]

Options:
  --limit N       Maximum tickets to dispatch per phase (default: 1)
  --env ENV       Environment: dev or prod (default: from BONSAI_ENV)
  --help, -h      Show this help message
  --version, -v   Show version

Exit codes:
  0 - Success or already running
  1 - Error occurred

Description:
  The heartbeat runs a three-phase ticket lifecycle:
    1. RESEARCH — backlog tickets without research → researcher agent
    2. PLANNING — research-approved tickets without plan → planner agent
    3. IMPLEMENTATION — plan-approved tickets → developer agent

  File locking ensures only one heartbeat runs at a time. If a heartbeat is
  already running, this command exits immediately with code 0 (not an error).

Examples:
  bonsai-heartbeat                  # Run once with default settings
  bonsai-heartbeat --limit 5        # Dispatch up to 5 tickets per phase
  bonsai-heartbeat --env dev        # Use development database
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    // Read version from package.json
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    console.log(pkg.version);
    process.exit(0);
  }

  // Determine lock path based on environment
  const homeDir = os.homedir();
  const bonsaiDir = options.env === "dev" ? ".bonsai-dev" : ".bonsai";
  const lockPath = path.join(homeDir, bonsaiDir, "heartbeat.lock");

  const lock = new FileLock(lockPath);

  // Attempt to acquire lock
  if (!lock.acquire()) {
    // Already running - not an error
    console.log("Heartbeat already running (lock held)");
    process.exit(0);
  }

  try {
    // Run dispatcher
    const result = await runDispatch({
      limit: options.limit,
      env: options.env,
    });

    console.log(
      `Heartbeat completed: dispatched=${result.dispatched}, completed=${result.completed}, skipped=${result.skipped}`
    );

    if (result.errors.length > 0) {
      console.error(`Errors encountered: ${result.errors.join(", ")}`);
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error("Heartbeat error:", err);
    process.exit(1);
  } finally {
    lock.release();
  }
}

main();
