<p align="center">
  <a href="https://usebonsai.ai">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="public/bonsai-os-logo-d.png">
      <img alt="Bonsai" src="public/bonsai-os-logo-l.png" height="128">
    </picture>
  </a>
</p>

<h1 align="center">Bonsai</h1>

<p align="center">
  Autonomous AI agents that ship software while you sleep.
</p>

<p align="center">
  <a href="https://usebonsai.ai"><strong>Website</strong></a> ·
  <a href="https://miniclaw.bot"><strong>Mini Claw</strong></a> ·
  <a href="https://github.com/augmentedmike/bonsai-app/issues"><strong>Issues</strong></a> ·
  <a href="./docs/"><strong>Docs</strong></a>
</p>

<p align="center">
  <a href="https://github.com/augmentedmike/bonsai-app/stargazers"><img src="https://img.shields.io/github/stars/augmentedmike/bonsai-app" alt="GitHub Stars"></a>
  <a href="https://github.com/augmentedmike/bonsai-app/blob/main/LICENSE"><img src="https://img.shields.io/github/license/augmentedmike/bonsai-app" alt="License"></a>
  <a href="https://github.com/augmentedmike/bonsai-app/pulse"><img src="https://img.shields.io/github/commit-activity/m/augmentedmike/bonsai-app" alt="Commits per month"></a>
  <a href="https://github.com/augmentedmike/bonsai-app/issues"><img src="https://img.shields.io/github/issues/augmentedmike/bonsai-app" alt="Open issues"></a>
</p>

---

Bonsai is a ticket-based development environment that turns AI agents into a functioning engineering team. File a ticket. Agents research the codebase, plan the approach, write the code, run the tests, and open a pull request — without you touching the keyboard.

Every ticket moves through three phases with human approval gates:

1. **Research** — agents explore the codebase, identify constraints, document findings
2. **Planning** — agents design the implementation, present it for review
3. **Implementation** — agents write code, run tests, submit a pull request

No black boxes. You review every phase before agents move forward.

![Bonsai Dashboard](public/bonsai-os-logo-d.png)

## Key Features

- **Multi-Agent Team** — specialized roles (researcher, planner, developer, designer, writer) that collaborate like a real engineering team
- **Three-Phase Workflow** — Research → Plan → Implement, with human gates between each phase
- **Encrypted Vault** — API keys and tokens stored with [age encryption](https://age-encryption.org/), never in plaintext
- **Heartbeat Engine** — continuous progress automation that drives tickets forward without manual dispatch
- **GitHub Integration** — automated repo operations, branch management, and pull request creation
- **Local-First** — SQLite database, no cloud dependency, runs entirely on your machine
- **Built on Claude** — powered by the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk) and [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)

## Quick Start

> **Prerequisites:** Node.js 22+, [Claude CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code), and an Anthropic API key or Claude Max subscription.

```bash
git clone https://github.com/augmentedmike/bonsai-app.git
cd bonsai-app

# Build the agent package
cd agent && npm install && npm run build && npm link && cd ..

# Install dependencies
npm install && npm link @bonsai/agent

# Configure environment
cp .env.development .env.local
# Edit .env.local — add your ANTHROPIC_API_KEY

# Initialize the database
npm run db:push && npm run db:seed

# Start
npm run dev
```

Open [http://localhost:3080](http://localhost:3080) and you're in.

For the full setup walkthrough, see [DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Database | SQLite via better-sqlite3, Drizzle ORM |
| AI Runtime | Anthropic Claude SDK, Claude Agent SDK |
| Security | age-encryption for credential vault |
| Styling | Tailwind CSS 4 |
| Testing | Vitest |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Bonsai Web UI                   │
│              Next.js 16 (App Router)             │
├─────────────┬──────────────┬────────────────────┤
│  Ticket UI  │  Board View  │  Onboarding Wizard │
├─────────────┴──────────────┴────────────────────┤
│                   API Layer                      │
│         /api/tickets  /api/settings  etc.        │
├─────────────────────────────────────────────────┤
│               Agent Runtime                      │
│    Claude Agent SDK  ·  Multi-Persona Dispatch   │
├─────────────────────────────────────────────────┤
│              Data & Security                     │
│   SQLite (Drizzle ORM)  ·  age-encrypted vault   │
└─────────────────────────────────────────────────┘
```

<details>
<summary><strong>Project Structure</strong></summary>

```
bonsai-app/
├── src/
│   ├── app/              # Next.js pages and API routes
│   │   ├── api/          # Backend endpoints
│   │   ├── board/        # Kanban board view
│   │   ├── activity/     # Activity feed
│   │   └── onboard/      # First-run onboarding
│   ├── components/       # React components
│   ├── db/               # Schema, queries, seeds
│   └── lib/              # Core utilities (dispatch, vault, prompts)
├── scripts/              # Automation (heartbeat, dispatch)
├── prompts/              # Agent role definitions and templates
├── agent/                # @bonsai/agent package
└── docs/                 # Architecture docs
```

</details>

For deep-dive architecture docs, see [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) and the [docs/](./docs/) directory.

## Development

```bash
npm run dev              # Start dev server (port 3080)
npm run build            # Production build
npm run lint             # ESLint
npm run test             # Vitest
npm run test:coverage    # Coverage report
npm run type-check       # TypeScript checks
npm run db:push          # Apply schema changes
npm run db:seed          # Seed sample data
npm run db:studio        # Drizzle Studio (database UI)
```

## Contributing

Contributions welcome — bug fixes, features, docs. See [CONTRIBUTING.md](./CONTRIBUTING.md) for code style, testing, and architecture patterns.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests (`npm run test`) and lint (`npm run lint`)
5. Open a pull request

Found a bug? [Open an issue](https://github.com/augmentedmike/bonsai-app/issues).

## Community & Support

- [GitHub Issues](https://github.com/augmentedmike/bonsai-app/issues) — bug reports and feature requests
- [GitHub Discussions](https://github.com/augmentedmike/bonsai-app/discussions) — questions, ideas, and show & tell

## Who Built This

Bonsai is a core component of **[Mini Claw](https://miniclaw.bot)** — an autonomous development platform where AI agents build, ship, and operate software around the clock.

Built by [Mike O'Neal](https://usebonsai.ai).

## License

MIT — see [LICENSE](./LICENSE) for details.
