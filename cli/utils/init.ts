import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getBonsaiDirectory, getLogDirectory } from './paths.js';

export async function ensureDirectories(): Promise<void> {
  const directories = [
    getBonsaiDirectory(),
    getLogDirectory(),
  ];

  for (const dir of directories) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true, mode: 0o755 });
    }
  }
}
