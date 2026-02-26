# Bonsai — Press Kit

**Last updated:** February 2026  
**Contact:** Mike O'Neal — GitHub: [@augmentedmike](https://github.com/augmentedmike)  
**Website:** [bonsai-www] — See It In Action  
**GitHub:** [github.com/augmentedmike/bonsai-app](https://github.com/augmentedmike/bonsai-app)  
**License:** Open source

---

## The One-Liner

> **Bonsai is an open-source Kanban board where AI agent teams research, plan, and write code — so you just describe what you want and approve what ships.**

**Shorter version (tweet-length):**
> Bonsai — stop writing code. Shape it instead. Describe a ticket, watch AI agents build it in real time, approve and ship.

**Technical version (for dev-focused media):**
> Bonsai is an AI Developer OS: a Next.js app that turns Kanban tickets into shipped pull requests using autonomous Claude agents running a three-phase research → planning → implementation workflow.

---

## What Bonsai Does

Bonsai replaces the software development lifecycle with a three-step human loop:

**1. Define tickets**
Describe what you need built in plain language. No sprint planning. No assigning engineers. No architecture meetings. Just a title and a description.

**2. Watch agents build it**
Bonsai dispatches a team of AI agents — a Researcher, a Planner, and a Developer — that work through the problem autonomously. You see their progress in real time and can steer the direction as they go.

**3. Approve & ship**
When the output matches what you wanted, you approve it. Bonsai handles the Git branch, the worktree, the PR — everything.

---

## Why It Matters

The era of the solo developer shipping production software was supposed to be science fiction. It isn't anymore.

Tools like GitHub Copilot and Cursor showed that AI can write code. Bonsai goes one step further: it manages the *entire workflow* — from idea to shipped commit — without a human touching a keyboard.

This is not a coding autocomplete. This is digital labor.

---

## Key Stats & Facts

- **Open source** — MIT license, fork it and run it yourself
- **Built on Claude** — Powered by Anthropic's Claude SDK and Claude CLI
- **Three AI agent roles** — Researcher, Planner, Developer; each with phase-specific tools and permissions
- **SQLite-local** — No vendor lock-in, no SaaS subscription required; your projects and tickets live locally
- **GitHub-native** — Automatic branch creation, Git worktrees per ticket, PR-ready output
- **Encrypted credential vault** — age-encryption for all API keys and tokens stored locally
- **Tech stack** — Next.js 16, React 19, TypeScript 5, Drizzle ORM, better-sqlite3, Tailwind CSS 4
- **Launched:** February 2026
- **Creator:** Mike O'Neal — independent developer based in Mexico City

---

## What Makes It Different

| Product | What it does | What Bonsai adds |
|---|---|---|
| GitHub Copilot | Autocomplete in your editor | Full ticket-to-PR workflow, no editor required |
| Cursor | AI-powered code editor | Project management + multi-agent coordination |
| Linear | Beautiful project tracking | Actually *executes* the tickets |
| Devin / SWE-agent | AI software engineer | Open source, runs locally, human-in-the-loop by design |

**The Bonsai difference:** You stay in control of *what* ships. Agents handle *how* it gets built.

---

## Founder Quote

> "Every generation of developers gets a new lever. Unix gave us automation. Git gave us collaboration. The cloud gave us scale. AI agents give us *delegation*. Bonsai is my answer to the question: what does software development look like when you stop being the person who writes the code and start being the person who shapes what gets built?"
>
> — **Mike O'Neal**, Creator of Bonsai

**Additional quotes available on request for specific angles:**
- On open source strategy
- On the 'digital labor' market
- On building AI-native developer tools vs. AI-augmented ones

---

## Screenshot Descriptions

*(Request high-res images from Mike; described below for editorial reference)*

### Screenshot 1 — The Kanban Board
A dark-themed board (gray-950 background, cyan accents) showing tickets in columns: Draft → Research → Planning → Implementation → Shipped. Each ticket card shows the title, assigned AI persona avatar, and current phase indicator. The board is sparse and focused — no noise, just work.

### Screenshot 2 — Live Agent Activity
A ticket detail view showing real-time agent progress: the Researcher persona posting findings, the Planner breaking them into implementation steps, the Developer writing code. Each persona has a distinct avatar. The activity stream looks like a team Slack thread — except it's all autonomous.

### Screenshot 3 — The Three-Step Hero (from bonsai-www)
The marketing site's "How it works" section on a dark background with the three steps: Define tickets → Live preview → Approve & ship. Clean, bold typography with the cyan (#22d3ee) accent color that defines the Bonsai visual identity.

### Screenshot 4 — CLI / Terminal Output
An optional technical screenshot showing a Bonsai session directory (`~/.bonsai/sessions/`) with the agent's `output.md` file — demonstrating the transparent, inspectable nature of how agents work.

---

## Bonsai's Visual Identity

- **Primary color:** Cyan — `#22d3ee` (Tailwind `cyan-300`)
- **Background:** Near-black — `rgb(3,7,18)` (Tailwind `gray-950`)
- **Logo:** Bonsai tree icon (32×32px and 120×120px available)
- **Typography:** Geist font (optimized for code interfaces)
- **Aesthetic:** Minimal, dark, tool-like — built for developers, not for marketing teams

---

## Story Angles

**For AI / developer tools media:**
"Bonsai is what happens when you take the Linear playbook (beautiful, focused project management) and combine it with the Cursor playbook (AI that writes real code). The result is a tool that replaces the entire junior-to-mid developer workflow."

**For open source / indie hacker media:**
"Mike O'Neal built Bonsai to run his own software projects autonomously while he sleeps. It runs locally, stores everything in SQLite, and uses your own Anthropic API key. No SaaS, no subscription, no lock-in."

**For future-of-work media:**
"The tagline says it all: 'Build software while you are asleep.' Bonsai isn't automating tasks inside a developer's workflow — it's replacing the workflow itself with autonomous agents that work through the night."

**For AI safety / responsible AI media:**
"Bonsai is deliberately human-in-the-loop at every critical decision point. Agents can research and plan autonomously, but code only ships when a human approves it. The design treats AI as a powerful executor, not an autonomous decision-maker."

---

## Boilerplate (for article footers and credit lines)

> Bonsai is an open-source AI Developer OS that automates software engineering workflows through autonomous Claude-powered agent teams. Created by Mike O'Neal, Bonsai runs locally on Next.js and SQLite, requires no SaaS subscription, and is free to fork and self-host. Available at github.com/augmentedmike/bonsai-app.

---

## Quick Links

| Resource | URL |
|---|---|
| GitHub (fork) | github.com/augmentedmike/bonsai-app/fork |
| README / Setup | github.com/augmentedmike/bonsai-app#readme |
| Marketing site | [bonsai-www domain TBD] |
| "See It In Action" | [bonsai-www domain TBD]/see-it-in-action |
| Creator on GitHub | github.com/augmentedmike |

---

## Media FAQ

**Q: Is Bonsai free?**
A: Yes. Open source, MIT license. You bring your own Anthropic API key. No paid tier.

**Q: What does "autonomous agents" actually mean?**
A: Bonsai dispatches Claude processes that run independently — they read codebases, form plans, write and test code, and post their results back to the board. They are not copilots — you don't need to be at the keyboard while they work.

**Q: How is this different from Devin?**
A: Devin is a commercial SaaS product. Bonsai is open source and self-hosted. Bonsai also has a more deliberate human-approval workflow — agents execute, humans approve what ships. It's less autonomous by design, but more trusted.

**Q: What kind of projects is it best for?**
A: Greenfield web apps, feature additions to existing projects, bug fixes, documentation, and automation scripts. Anything that can be expressed as a clear ticket and verified against acceptance criteria.

**Q: When was it launched?**
A: February 2026. It's early. The founding insight — that AI agents can own the full dev workflow, not just assist in it — is the bet.

---

*Press kit compiled by AugmentedMike agent (g-researcher) | February 25, 2026*  
*Fact-checked against: bonsai-app README, ARCHITECTURE_GUIDE, www site source code, project database*
