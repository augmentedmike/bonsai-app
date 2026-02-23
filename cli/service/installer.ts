import { detectPlatform, getServiceName, getServiceDisplayName } from '../utils/platform.js';
import {
  getNodeBinaryPath,
  getTsxPath,
  getHeartbeatScriptPath,
  findWebappDirectory,
  getLogDirectory,
  getLogFilePath,
  getBonsaiDirectory
} from '../utils/paths.js';
import { validateDependencies } from '../utils/validate.js';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { TemplateVariables } from './templates.js';
import { installMacOS } from './installers/macos.js';
import { installLinux } from './installers/linux.js';

export async function install(): Promise<void> {
  console.log('Installing Bonsai heartbeat service...\n');

  // Validate dependencies first
  validateDependencies();

  // Ensure directories exist
  const bonsaiDir = getBonsaiDirectory();
  const logDir = getLogDirectory();

  for (const dir of [bonsaiDir, logDir]) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
      console.log(`✓ Created directory: ${dir}`);
    }
  }

  // Prepare template variables
  const vars: TemplateVariables = {
    serviceName: getServiceName(),
    displayName: getServiceDisplayName(),
    nodePath: getNodeBinaryPath(),
    tsxPath: getTsxPath(),
    heartbeatScriptPath: getHeartbeatScriptPath(),
    workingDirectory: findWebappDirectory(),
    logFilePath: getLogFilePath(),
    intervalSeconds: 60,
  };

  // Validate paths exist
  if (!existsSync(vars.heartbeatScriptPath)) {
    console.error(`✗ Heartbeat script not found: ${vars.heartbeatScriptPath}`);
    console.error('  Ensure you are in the bonsai monorepo with webapp/ directory.');
    process.exit(1);
  }

  // Install based on platform
  const platform = detectPlatform();

  try {
    if (platform === 'darwin') {
      await installMacOS(vars);
    } else if (platform === 'linux') {
      await installLinux(vars);
    }
  } catch (error: any) {
    console.error('\n✗ Installation failed:', error.message);
    process.exit(1);
  }
}
