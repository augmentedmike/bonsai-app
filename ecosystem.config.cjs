// Bonsai Production — PM2 Ecosystem Config
// Secrets are loaded from vault at startup via the prestart hook.
// Run: pm2 start ecosystem.config.cjs --env production

const VAULT = '/Users/augmentedmike/.crabby/bin/vault';

function vaultGet(key) {
  const { execSync } = require('child_process');
  try {
    const raw = execSync(`${VAULT} get ${key}`, { encoding: 'utf8' }).trim();
    // vault outputs "key = value" format — extract just the value
    const match = raw.match(/=\s*(.+)$/);
    return match ? match[1].trim() : raw;
  } catch {
    return '';
  }
}

module.exports = {
  apps: [
    {
      name: 'bonsai-dev',
      cwd: '/Users/augmentedmike/projects/bonsai-app',
      script: '/Users/augmentedmike/projects/bonsai-app/node_modules/.bin/next',
      args: 'dev --port 3080 --hostname 0.0.0.0',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development',
        PORT: '3080',
        BONSAI_ENV: 'dev',
        API_BASE: 'http://localhost:3080',
        NEXT_TELEMETRY_DISABLED: '1',
        GITHUB_TOKEN: vaultGet('gh-token'),
        GEMINI_API_KEY: vaultGet('gemini-api-key'),
        ANTHROPIC_API_KEY: vaultGet('anthropic-api-key'),
      },
      max_memory_restart: '1500M',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/augmentedmike/.pm2/logs/bonsai-dev-error.log',
      out_file: '/Users/augmentedmike/.pm2/logs/bonsai-dev-out.log',
      merge_logs: true,
    },
    {
      name: 'bonsai-prod',
      cwd: '/Users/augmentedmike/projects/bonsai-app',
      script: '/Users/augmentedmike/projects/bonsai-app/node_modules/.bin/next',
      args: 'start --port 3090 --hostname 0.0.0.0',
      interpreter: 'node',
      env_production: {
        NODE_ENV: 'production',
        PORT: '3090',
        BONSAI_ENV: 'prod',
        API_BASE: 'http://localhost:3090',
        NEXT_TELEMETRY_DISABLED: '1',
        // Secrets loaded inline — no shell wrapper needed
        GITHUB_TOKEN: vaultGet('gh-token'),
        GEMINI_API_KEY: vaultGet('gemini-api-key'),
        ANTHROPIC_API_KEY: vaultGet('anthropic-api-key'),
      },
      max_memory_restart: '1500M',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/augmentedmike/.pm2/logs/bonsai-prod-error.log',
      out_file: '/Users/augmentedmike/.pm2/logs/bonsai-prod-out.log',
      merge_logs: true,
    },
  ],
};
