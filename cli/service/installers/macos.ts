import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { generateLaunchAgentPlist, type TemplateVariables } from '../templates.js';
import { getServiceName } from '../../utils/platform.js';

const execAsync = promisify(exec);

export async function installMacOS(vars: TemplateVariables): Promise<void> {
  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
  const plistPath = join(launchAgentsDir, `${vars.serviceName}.plist`);

  // Create LaunchAgents directory if it doesn't exist
  if (!existsSync(launchAgentsDir)) {
    await mkdir(launchAgentsDir, { recursive: true });
  }

  // Check if already installed
  if (existsSync(plistPath)) {
    console.log('⚠️  Service already installed. Reinstalling...');
    await uninstallMacOS();
  }

  // Generate and write plist file
  const plistContent = generateLaunchAgentPlist(vars);
  await writeFile(plistPath, plistContent, 'utf-8');
  console.log(`✓ Created LaunchAgent plist: ${plistPath}`);

  // Load the service
  try {
    await execAsync(`launchctl load "${plistPath}"`);
    console.log(`✓ Service loaded and started`);
  } catch (error: any) {
    console.error(`✗ Failed to load service: ${error.message}`);
    throw error;
  }

  console.log('✓ Bonsai heartbeat service installed successfully');
  console.log(`  Runs every ${vars.intervalSeconds} seconds`);
  console.log(`  Logs: ${vars.logFilePath}`);
}

export async function uninstallMacOS(): Promise<void> {
  const serviceName = getServiceName();
  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
  const plistPath = join(launchAgentsDir, `${serviceName}.plist`);

  if (!existsSync(plistPath)) {
    console.log('Service is not installed');
    return;
  }

  // Unload the service
  try {
    await execAsync(`launchctl unload "${plistPath}"`);
    console.log('✓ Service stopped');
  } catch (error: any) {
    // Service might not be loaded, continue anyway
    console.log('  Service was not running');
  }

  // Remove plist file
  await unlink(plistPath);
  console.log('✓ Service configuration removed');
  console.log('✓ Bonsai heartbeat service uninstalled');
}
