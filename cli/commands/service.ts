import { install } from '../service/installer.js';
import { uninstall } from '../service/uninstaller.js';
import { status } from '../service/status.js';

export async function serviceCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help') {
    printServiceHelp();
    return;
  }

  switch (subcommand) {
    case 'install':
      await install();
      break;
    case 'uninstall':
      await uninstall();
      break;
    case 'status':
      await status();
      break;
    default:
      console.error(`Unknown service subcommand: ${subcommand}`);
      printServiceHelp();
      process.exit(1);
  }
}

function printServiceHelp() {
  console.log(`
bonsai service - Manage background heartbeat service

Usage:
  bonsai service install      Install and start the heartbeat scheduler
  bonsai service uninstall    Stop and remove the heartbeat scheduler
  bonsai service status       Show service status and last execution

The heartbeat runs every 60 seconds to process agent tickets.
`);
}
