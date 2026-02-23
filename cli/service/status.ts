import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { detectPlatform, getServiceName } from '../utils/platform.js';
import { getLogFilePath } from '../utils/paths.js';

const execAsync = promisify(exec);

export async function status(): Promise<void> {
  const platform = detectPlatform();

  console.log('Bonsai Heartbeat Service Status\n');
  console.log(`Platform: ${platform}`);

  if (platform === 'darwin') {
    await statusMacOS();
  } else if (platform === 'linux') {
    await statusLinux();
  }

  await checkLogFile();
}

async function statusMacOS(): Promise<void> {
  const serviceName = getServiceName();

  try {
    const { stdout } = await execAsync(`launchctl list | grep ${serviceName}`);
    if (stdout.trim()) {
      const parts = stdout.trim().split(/\s+/);
      const pid = parts[0];
      const status = parts[1];

      console.log(`Status: ✓ Running`);
      console.log(`PID: ${pid === '-' ? 'Not currently active' : pid}`);
      console.log(`Exit Status: ${status}`);
    }
  } catch (error) {
    console.log(`Status: ✗ Not installed or not running`);
  }
}

async function statusLinux(): Promise<void> {
  const serviceName = 'bonsai-heartbeat';

  try {
    const { stdout } = await execAsync(`systemctl --user is-active ${serviceName}.timer`);
    const isActive = stdout.trim() === 'active';

    console.log(`Status: ${isActive ? '✓ Running' : '✗ Inactive'}`);

    // Get more detailed status
    const { stdout: statusOutput } = await execAsync(
      `systemctl --user status ${serviceName}.timer --no-pager || true`
    );

    // Extract last trigger time
    const triggerMatch = statusOutput.match(/Trigger: (.+)/);
    if (triggerMatch) {
      console.log(`Next Run: ${triggerMatch[1]}`);
    }
  } catch (error) {
    console.log(`Status: ✗ Not installed`);
  }
}

async function checkLogFile(): Promise<void> {
  const logPath = getLogFilePath();

  console.log(`\nLog File: ${logPath}`);

  if (!existsSync(logPath)) {
    console.log('  No log file found (service has not run yet)');
    return;
  }

  try {
    const stats = await stat(logPath);
    console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`  Modified: ${stats.mtime.toLocaleString()}`);

    // Read last few lines
    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    const lastLines = lines.slice(-5);

    console.log('\nRecent Log Output:');
    lastLines.forEach(line => console.log(`  ${line}`));
  } catch (error: any) {
    console.log(`  Error reading log: ${error.message}`);
  }
}
