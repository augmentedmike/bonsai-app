#!/usr/bin/env node
/**
 * daily-learning.mjs
 *
 * Generates a 300-500 word markdown learning note per role using the Anthropic API.
 * Saves to skills/[role]/YYYY-MM-DD-learning.md
 *
 * Usage:
 *   node scripts/daily-learning.mjs                   # all 4 roles
 *   node scripts/daily-learning.mjs --role developer   # single role
 *
 * Env: ANTHROPIC_API_KEY
 *
 * Cron example (daily at 8am):
 *   0 8 * * * cd /path/to/bonsai-app && node scripts/daily-learning.mjs >> /tmp/daily-learning.log 2>&1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const ALL_ROLES = ["developer", "researcher", "designer", "writer"];

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY not set in environment");
  process.exit(1);
}

// Parse --role flag
const args = process.argv.slice(2);
const roleIdx = args.indexOf("--role");
const selectedRole = roleIdx !== -1 ? args[roleIdx + 1] : null;

if (selectedRole && !ALL_ROLES.includes(selectedRole)) {
  console.error(`Error: unknown role "${selectedRole}". Valid: ${ALL_ROLES.join(", ")}`);
  process.exit(1);
}

const roles = selectedRole ? [selectedRole] : ALL_ROLES;

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

async function generateLearning(role) {
  const prompt = `You are a world-class ${role}. Research and write a brief (300-500 word) learning note for yourself on: how to be a better ${role} in 2025. Focus on one specific skill, technique, or mindset shift. Be practical. Output clean markdown with a title heading.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("No text in API response");
  return text;
}

for (const role of roles) {
  try {
    console.log(`[${role}] Generating learning note...`);
    const markdown = await generateLearning(role);

    const dir = path.join(projectRoot, "skills", role);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${today}-learning.md`);
    fs.writeFileSync(filePath, markdown, "utf-8");

    console.log(`[${role}] learning saved -> skills/${role}/${today}-learning.md`);
  } catch (err) {
    console.error(`[${role}] Error: ${err.message}`);
  }
}

console.log("Done.");
