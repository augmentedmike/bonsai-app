# Bonsai — Fundraising Narrative
**Version 1.0 — February 2026**
*Internal working document. Foundation for all investor materials.*

---

## The One-Line Version

**Bonsai is the kanban board that does the work — an AI developer OS where tickets execute themselves.**

---

## The Problem We're Solving

Every software team runs on a project management tool — Linear, Jira, GitHub Issues. These tools are excellent at *tracking* work. None of them *do* work.

The result: developers spend an estimated 40–60% of their time on work that isn't core engineering — writing tickets, reading old code to understand context, plumbing APIs together, writing tests, opening PRs. These tasks are necessary. They're also increasingly automatable.

Meanwhile, "AI coding tools" have become a crowded category. But there's a gap at the center of the market:

- **Copilots** (GitHub Copilot, Cursor, Codeium) are cursor-level. They help you write code faster, but you still write all the code. A brilliant autocomplete.
- **Fully autonomous agents** (Devin, SWE-agent, OpenHands) try to go end-to-end, but they operate headless. No workflow. No memory. No human gates. When they fail, there's no recovery path.

**Nobody has built the product in between**: a structured workflow system where AI agents handle execution *inside* the developer's actual process — with checkpoints, personas, and human approval where it matters.

That's Bonsai.

---

## What Bonsai Is

Bonsai is a **ticket-based AI development environment** that orchestrates autonomous agent teams to take tickets from idea to pull request.

A developer (or solo founder) creates a ticket: *"Add Stripe subscription billing."*

Bonsai does the rest:

1. **Research phase** — An AI agent explores the codebase, reads the relevant files, and gathers everything needed to implement without guessing.
2. **Planning phase** — A second agent writes a detailed implementation plan. Human reviews and approves.
3. **Implementation phase** — A third agent writes the code, runs the tests, and opens a PR against the repo.

Each phase uses a specialized AI persona with a distinct role, tool access, and prompt strategy — modeled after how a real small engineering team works.

Key design decisions that set Bonsai apart:
- **Phase-gated workflow** with human approval between phases — not fully autonomous, which means not dangerously wrong
- **SQLite-first, local-run architecture** — project state lives with the developer, not in a cloud silo
- **Multi-persona agent teams** — context doesn't collapse; the researcher doesn't write code, the developer doesn't plan
- **GitHub-native** — integrates with the repo you already have, doesn't replace it
- **Encrypted credential vault** — API keys and tokens stored with age-encryption, not in a `.env` file on a shared server

The metaphor is intentional: bonsai cultivation is the art of deliberate, patient shaping. You prune. You guide. You don't let the tree grow wild. That's how software should be built with AI.

---

## Traction

Bonsai is **eating its own cooking**. The investor outreach project you're reading this through was created inside Bonsai. The media outreach campaign, the research pipeline, the feature backlog — all managed as Bonsai tickets, executed by Bonsai agents.

This is the most honest traction signal we can offer at this stage: the product is real enough that we use it as our primary operational tool.

**What's built and working:**
- Full three-phase agent workflow (research → plan → implement) end-to-end
- Multi-project kanban with ticket states, priorities, and agent dispatch
- Agent session management with progress reporting and completion webhooks
- Encrypted credential vault (age-encryption)
- GitHub integration for PR creation and repo operations
- Persona system: Researcher, Planner, Developer, and Reviewer agents
- Heartbeat automation for async, long-running agent tasks

**What's in active development:**
- Team collaboration layer (multiple human users, shared projects)
- One-click onboarding (connect repo, add API key, create first ticket in <5 min)
- Public beta launch preparation (bonsai-www marketing site in build)

The product is pre-revenue, pre-public-launch. We're raising to get from "solo founder using it every day" to "100 developers using it every day and paying for it."

---

## The Market

The AI developer tools market is one of the fastest-moving categories in tech:

- **Cursor** reached a reported $9B valuation in 2025, growing from $400M in 2024, purely on the strength of being a better IDE for AI-assisted coding
- **Cognition AI (Devin)** raised $175M at a $2B valuation — and Devin is specifically the fully-autonomous bet that Bonsai's phase-gated design intentionally avoids
- **Replit** has grown its AI-first coding environment to millions of users
- The segment broad enough to contain all of these is sometimes called "AI-first developer tools" — but the real prize is the **workflow layer**: the system of record for how software gets made

Total addressable market is every software development team on Earth. The SAM is the subset who are open to AI-assisted execution today: early adopters in startups, indie developers, and small product teams. That's easily 5–10M developers globally, with willingness-to-pay in the $20–100/month range per seat.

Bonsai's approach — structured, phase-gated, human-in-the-loop — is designed to be the product that *cautious but curious* developers adopt first. That's a much larger pool than the pure "just let it rip" autonomous agent early adopters.

---

## The Ask

**We are raising a pre-seed round of $750,000.**

Target close: Q2 2026.
Structure: SAFE, $6M cap, MFN, no discount.

This is a 12-month runway at the current burn rate, with budget to hire one additional contractor engineer to accelerate the public beta launch.

---

## Use of Funds

| Allocation | Amount | Purpose |
|---|---|---|
| Engineering capacity | $350,000 | Contract senior engineer (6 months) + founder salary continuation |
| Infrastructure & API costs | $75,000 | Anthropic API, hosting, tooling for beta scale |
| Go-to-market (beta launch) | $125,000 | Content, SEO, community, dev relations, first paid channels |
| Operations & legal | $50,000 | Entity, IP filings, accounting, SaaS tooling |
| Reserve | $150,000 | Runway buffer and opportunistic hires |

**The milestone this round funds:** 100 paying customers, $5,000 MRR, and a clear signal on which use case (solo dev / small team / startup) drives the highest retention. That's the proof point for a seed round at meaningful valuation.

---

## Why Now

Three things became true in the last 18 months that make Bonsai possible:

1. **Claude 3.5+ and the Agent SDK** — Long-context models that can read real codebases and take tool actions reliably enough to build on. Six months ago this wasn't true at production quality.
2. **Developer fatigue with Copilot-tier tools** — The market has had autocomplete for two years. Developers know what it can and can't do. Demand is pulling toward the next tier: execution, not just suggestion.
3. **AI-native founders are ready** — The person who wants to build software with a small team + AI agents is a growing cohort. Bonsai is built exactly for them.

---

## The Team

**Mike O'Neal** — Creator and lead developer. Bootstrapped and shipped the core product. Building the AI-native development workflow from first principles as both creator and primary user.

*[Additional team members / advisors to be added as they join]*

---

## The Bottom Line

The kanban board is the center of how software teams work. Nobody has made it autonomous yet. That's Bonsai.

We're raising $750K to go from dogfood to product-market fit. We want investors who've seen what happens when a workflow tool becomes the system of record for an entire industry — and who want in at the beginning.

---

*Questions or follow-up: Mike O'Neal — mike@[domain] | GitHub: coderaugment*

*For the one-pager (print/deck version), see ticket #97.*
*For the investor target list, see ticket #96.*
