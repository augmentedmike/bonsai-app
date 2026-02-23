import { detectPlatform } from '../utils/platform.js';
import { uninstallMacOS } from './installers/macos.js';
import { uninstallLinux } from './installers/linux.js';

export async function uninstall(): Promise<void> {
  console.log('Uninstalling Bonsai heartbeat service...\n');

  const platform = detectPlatform();

  try {
    if (platform === 'darwin') {
      await uninstallMacOS();
    } else if (platform === 'linux') {
      await uninstallLinux();
    }
  } catch (error: any) {
    console.error('\n✗ Uninstallation failed:', error.message);
    process.exit(1);
  }
}
