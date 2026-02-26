#!/usr/bin/env node
/**
 * Claude Code skill: read-artifact
 * Reads the latest tagged attachment artifact from a ticket
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, '../..');

export const skill = {
  name: 'read-artifact',
  description: 'Read the latest artifact of a given tag from a ticket',
  instructions: `Usage: /read-artifact <ticket-id> <tag>

Tags: research-doc, implementation-plan, design-doc, security-review, research-critique, plan-critique

Example: /read-artifact 41 research-doc

This retrieves the latest attachment with the specified tag from ticket_attachments and displays its content.`,
};

export async function run(args) {
  const [ticketId, tag] = args.split(/\s+/).filter(Boolean);

  if (!ticketId || !tag) {
    return {
      error: 'Usage: /read-artifact <ticket-id> <tag>\nTags: research-doc, implementation-plan, design-doc'
    };
  }

  const validTags = ['research-doc', 'implementation-plan', 'design-doc', 'security-review', 'research-critique', 'plan-critique'];
  if (!validTags.includes(tag)) {
    return {
      error: `Invalid tag '${tag}'. Must be one of: ${validTags.join(', ')}`
    };
  }

  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', 'bin/bonsai-cli.ts', 'read-artifact', ticketId, tag], {
      cwd: webappRoot,
      env: { ...process.env, BONSAI_ENV: process.env.BONSAI_ENV || 'prod' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ error: stderr || `Command failed with code ${code}` });
      } else {
        resolve({ output: stdout });
      }
    });

    proc.on('error', (err) => { resolve({ error: err.message }); });
  });
}
