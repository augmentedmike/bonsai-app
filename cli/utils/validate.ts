import { existsSync } from 'node:fs';
import { getTsxPath, getHeartbeatScriptPath } from './paths.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function validateDependencies(): void {
  const errors: string[] = [];

  // Check tsx exists
  const tsxPath = getTsxPath();
  if (!existsSync(tsxPath)) {
    errors.push(
      `tsx not found at ${tsxPath}`,
      '  Run: npm install --save-dev tsx (from webapp directory)'
    );
  }

  // Check heartbeat script exists
  const heartbeatPath = getHeartbeatScriptPath();
  if (!existsSync(heartbeatPath)) {
    errors.push(
      `Heartbeat script not found at ${heartbeatPath}`,
      '  Ensure you are in the bonsai monorepo'
    );
  }

  // Check Claude CLI exists
  const claudePath = join(homedir(), '.local', 'bin', 'claude');
  if (!existsSync(claudePath)) {
    errors.push(
      `Claude CLI not found at ${claudePath}`,
      '  Install from: https://claude.ai/code'
    );
  }

  if (errors.length > 0) {
    console.error('✗ Missing dependencies:\n');
    errors.forEach(err => console.error(err));
    console.error('');
    process.exit(1);
  }
}
