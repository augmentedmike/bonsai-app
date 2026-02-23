import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { generateSystemdService, generateSystemdTimer, type TemplateVariables } from '../templates.js';

const execAsync = promisify(exec);

function getSystemdServiceName(): string {
  return 'bonsai-heartbeat';
}

export async function installLinux(vars: TemplateVariables): Promise<void> {
  const systemdUserDir = join(homedir(), '.config', 'systemd', 'user');
  const serviceName = getSystemdServiceName();
  const servicePath = join(systemdUserDir, `${serviceName}.service`);
  const timerPath = join(systemdUserDir, `${serviceName}.timer`);

  // Create systemd user directory if it doesn't exist
  if (!existsSync(systemdUserDir)) {
    await mkdir(systemdUserDir, { recursive: true });
  }

  // Check if already installed
  if (existsSync(servicePath) || existsSync(timerPath)) {
    console.log('⚠️  Service already installed. Reinstalling...');
    await uninstallLinux();
  }

  // Generate and write service file
  const serviceContent = generateSystemdService(vars);
  await writeFile(servicePath, serviceContent, 'utf-8');
  console.log(`✓ Created systemd service: ${servicePath}`);

  // Generate and write timer file
  const timerContent = generateSystemdTimer(vars);
  await writeFile(timerPath, timerContent, 'utf-8');
  console.log(`✓ Created systemd timer: ${timerPath}`);

  // Reload systemd daemon
  await execAsync('systemctl --user daemon-reload');

  // Enable and start the timer
  try {
    await execAsync(`systemctl --user enable --now ${serviceName}.timer`);
    console.log(`✓ Service enabled and started`);
  } catch (error: any) {
    console.error(`✗ Failed to start service: ${error.message}`);
    throw error;
  }

  console.log('✓ Bonsai heartbeat service installed successfully');
  console.log(`  Runs every ${vars.intervalSeconds} seconds`);
  console.log(`  Logs: ${vars.logFilePath}`);
}

export async function uninstallLinux(): Promise<void> {
  const systemdUserDir = join(homedir(), '.config', 'systemd', 'user');
  const serviceName = getSystemdServiceName();
  const servicePath = join(systemdUserDir, `${serviceName}.service`);
  const timerPath = join(systemdUserDir, `${serviceName}.timer`);

  if (!existsSync(servicePath) && !existsSync(timerPath)) {
    console.log('Service is not installed');
    return;
  }

  // Stop and disable the timer
  try {
    await execAsync(`systemctl --user disable --now ${serviceName}.timer`);
    console.log('✓ Service stopped');
  } catch (error: any) {
    // Service might not be running, continue anyway
    console.log('  Service was not running');
  }

  // Remove service and timer files
  if (existsSync(servicePath)) {
    await unlink(servicePath);
  }
  if (existsSync(timerPath)) {
    await unlink(timerPath);
  }

  // Reload systemd daemon
  await execAsync('systemctl --user daemon-reload');

  console.log('✓ Service configuration removed');
  console.log('✓ Bonsai heartbeat service uninstalled');
}
