export type SupportedPlatform = 'darwin' | 'linux';

export function detectPlatform(): SupportedPlatform {
  const platform = process.platform;

  if (platform === 'darwin' || platform === 'linux') {
    return platform;
  }

  console.error(`Unsupported platform: ${platform}`);
  console.error('bonsai service only supports macOS (darwin) and Linux.');
  console.error('Windows support is not currently available.');
  process.exit(1);
}

export function getServiceName(): string {
  return 'com.bonsai.heartbeat';
}

export function getServiceDisplayName(): string {
  return 'Bonsai Heartbeat';
}
