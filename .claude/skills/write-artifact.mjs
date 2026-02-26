#!/usr/bin/env node
/**
 * Claude Code skill: write-artifact
 * Saves a document artifact as a tagged ticket attachment
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, '../..');

export const skill = {
  name: 'write-artifact',
  description: 'Save a document artifact to the ticket as a tagged attachment',
  instructions: `Usage: /write-artifact <ticket-id> <tag> <file-path>

Tags: research-doc, implementation-plan, design-doc, security-review, research-critique, plan-critique

Example: /write-artifact 41 research-doc /tmp/research.md

This saves the artifact to ticket_attachments with the given tag, creates a comment, and logs an audit event.

IMPORTANT: Use this to save research documents, implementation plans, and design documents. Do NOT post these as comments — save them as artifacts so they appear in the Attachments section of the ticket.`,
};

export async function run(args) {
  const parts = args.split(/\s+/).filter(Boolean);
  const [ticketId, tag, filePath] = parts;

  if (!ticketId || !tag || !filePath) {
    return {
      error: 'Usage: /write-artifact <ticket-id> <tag> <file-path>\nTags: research-doc, implementation-plan, design-doc'
    };
  }

  const validTags = ['research-doc', 'implementation-plan', 'design-doc', 'security-review', 'research-critique', 'plan-critique'];
  if (!validTags.includes(tag)) {
    return {
      error: `Invalid tag '${tag}'. Must be one of: ${validTags.join(', ')}`
    };
  }

  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', 'bin/bonsai-cli.ts', 'write-artifact', ticketId, tag, filePath], {
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
