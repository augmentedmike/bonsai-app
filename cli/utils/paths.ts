import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export function getNodeBinaryPath(): string {
  return process.execPath;
}

export function getTsxPath(): string {
  // Assume tsx is in node_modules/.bin relative to webapp
  const webappDir = findWebappDirectory();
  return join(webappDir, 'node_modules', '.bin', 'tsx');
}

export function findWebappDirectory(): string {
  // Start from CLI location and search upwards
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  let currentDir = resolve(__dirname, '../../..'); // Start from agent/

  // Look for ../webapp from agent package
  const webappPath = resolve(currentDir, '..', 'webapp');

  if (existsSync(join(webappPath, 'package.json')) &&
      existsSync(join(webappPath, 'bonsai.db'))) {
    return webappPath;
  }

  console.error('Could not locate webapp directory.');
  console.error('Expected to find webapp/ sibling to agent/ package.');
  console.error(`Searched: ${webappPath}`);
  process.exit(1);
}

export function getHeartbeatScriptPath(): string {
  const webappDir = findWebappDirectory();
  return join(webappDir, 'scripts', 'heartbeat-dispatch.ts');
}

export function getLogDirectory(): string {
  return join(homedir(), '.bonsai', 'logs');
}

export function getLogFilePath(): string {
  return join(getLogDirectory(), 'heartbeat.log');
}

export function getBonsaiDirectory(): string {
  return join(homedir(), '.bonsai');
}
