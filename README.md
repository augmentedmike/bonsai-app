<div align="center">
  <img src="public/bonsai-os-logo-d.png" alt="Bonsai Developer OS" width="200" />
  <h1>Bonsai Developer OS</h1>
  <p><strong>Autonomous AI agents that ship software while you sleep.</strong></p>
  <p>
    <a href="https://usebonsai.ai">Website</a> &middot;
    <a href="https://miniclaw.bot">Mini Claw</a> &middot;
    <a href="https://github.com/augmentedmike/bonsai-app">GitHub</a> &middot;
    <a href="./docs/">Documentation</a>
  </p>

  <br />

  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
  ![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
  ![Claude](https://img.shields.io/badge/Claude-Agent_SDK-D97757?logo=anthropic&logoColor=white)
  ![SQLite](https://img.shields.io/badge/SQLite-Local--First-003B57?logo=sqlite&logoColor=white)
  ![License](https://img.shields.io/badge/License-MIT-green)
</div>

---

## What Is Bonsai?

Bonsai is a ticket-based development environment that turns AI agents into a functioning engineering team. You file a ticket. Agents research the codebase, plan the approach, write the code, run the tests, and open a pull request — all without you touching the keyboard.

Every ticket moves through three phases with human approval gates between them:

1. **Research** — Agents explore the codebase, identify constraints, and document findings
2. **Planning** — Agents design the implementation and present it for review
3. **Implementation** — Agents write code, run tests, and submit a pull request

No black boxes. You review every phase before agents move forward.

---

## Features

- **Autonomous Agent Teams** — Multi-persona agents with specialized roles (researcher, planner, developer, designer, writer) that collaborate like a real engineering team
- **Three-Phase Workflow** — Research → Plan → Implement, with human approval gates between each phase
- **Encrypted Credential Vault** — API keys and tokens stored with [age encryption](https://age-encryption.org/), never in plaintext
- **Heartbeat Automation** — Continuous progress engine that drives tickets forward without manual dispatch
- **GitHub Integration** — Automated repository operations, branch management, and pull request creation
- **Local-First Architecture** — SQLite database, no cloud dependency, runs entirely on your machine
- **Built on Claude** — Powered by the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk) and [Claude CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)

---

## Getting Started

### Prerequisites

- **Node.js 22.x+** and npm
- **Claude CLI** — [Install here](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)
- **Anthropic API key** or Claude Max subscription

### Quick Start

```bash
# Clone the repository
git clone https://github.com/augmentedmike/bonsai-app.git
cd bonsai-app

# Build the agent package (required dependency)
cd agent && npm install && npm run build && npm link && cd ..

# Install webapp dependencies
npm install
npm link @bonsai/agent

# Configure environment
cp .env.development .env.local
# Edit .env.local — add your ANTHROPIC_API_KEY

# Initialize the database
npm run db:push
npm run db:seed

# Start the dev server
npm run dev
```

Open [http://localhost:3080](http://localhost:3080) and you're in.

For the complete setup walkthrough (prerequisites, troubleshooting, environment details), see **[DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md)**.

---

## Architecture

Bonsai is a full-stack Next.js application with an embedded agent runtime:

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

### Project Structure

```
bonsai-app/
├── src/
│   ├── app/              # Next.js pages and API routes
│   │   ├── api/          # Backend endpoints (tickets, settings, agents)
│   │   ├── board/        # Kanban board view
│   │   ├── activity/     # Activity feed
│   │   └── onboard/      # First-run onboarding
│   ├── components/       # React components
│   ├── db/               # Database schema, queries, seeds
│   └── lib/              # Core utilities (dispatch, vault, prompts)
├── scripts/              # Automation (heartbeat, dispatch)
├── prompts/              # Agent role definitions and templates
├── public/               # Static assets and logos
├── docs/                 # Architecture documentation (15+ docs)
└── agent/                # @bonsai/agent package (agent roles)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16, React 19, TypeScript 5 |
| **Database** | SQLite via better-sqlite3, Drizzle ORM |
| **AI Runtime** | Anthropic Claude SDK, Claude Agent SDK |
| **Security** | age-encryption for credential vault |
| **Styling** | Tailwind CSS 4 |
| **Testing** | Vitest |

For deep-dive architecture documentation, see **[ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md)** and the **[docs/](./docs/)** directory.

---

## Development

```bash
npm run dev              # Start dev server (port 3080)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run ESLint
npm run test             # Run tests (Vitest)
npm run test:coverage    # Test coverage report
npm run type-check       # TypeScript type checking
npm run db:push          # Apply schema changes
npm run db:seed          # Seed sample data
npm run db:studio        # Launch Drizzle Studio (database UI)
```

---

## Contributing

Contributions are welcome. Whether it's a bug fix, feature, or documentation improvement — we're glad to have you.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests (`npm run test`) and lint (`npm run lint`)
5. Open a pull request

For detailed guidelines — code style, testing strategy, architecture patterns, and where to find things — read **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

**Found a bug?** [Open an issue](https://github.com/augmentedmike/bonsai-app/issues).

---

## Who Built This

<div align="center">
  <img src="public/mike-portrait.png" alt="Mike O'Neal" width="150" style="border-radius: 50%;" />
  <br />
  <strong>Mike O'Neal</strong>
  <br />
  Creator &middot; <a href="https://miniclaw.bot">Mini Claw</a> &middot; <a href="https://usebonsai.ai">usebonsai.ai</a>
</div>

<br />

Bonsai is a core component of **[Mini Claw](https://miniclaw.bot)** — an autonomous development platform where AI agents build, ship, and operate software around the clock.

---

## License

This project is licensed under the [MIT License](./LICENSE).

---

<div align="center">
  <sub>Built with conviction. Shipped by agents.</sub>
</div>
