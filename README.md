# Sweep — agentic email cleaner

Sweep cleans up your Gmail with Claude, but only acts on its own when it's sure. It unsubscribes from and trashes obvious junk automatically, and anything it's unsure about waits in a review queue for your call.

> **Status:** early scaffold. The API, run engine and data layer work and are tested; the UI screens are wired to real data and are next in line for the full visual build ([designs](docs/designs), [handoff spec](docs/HANDOFF.md)).

## How it decides

```
Gmail metadata ──► free checks ──► Claude (only if still unsure) ──► policy ──► act / review / protect
```

1. **Gather per sender, not per email.** Sweep reads headers only (From, Subject, List-Unsubscribe, Gmail categories, read state) plus short snippets. It never reads or sends full message bodies.
2. **Free checks first.** Senders you've emailed, starred mail, and senders you chose to keep are protected without a model call. Unambiguous junk (all Promotions, never opened, one-click unsubscribe available) is classified with no model call either.
3. **Claude for the rest.** Haiku returns structured output: action, confidence (0–100), a one-line reason, supporting signals, and any sensitive categories it spotted (receipts, travel, banking, …).
4. **Policy is plain code.** [`decide()`](packages/shared/src/policy.ts) enforces your threshold (95% by default) and protection rules. The model only reports confidence and never gets to decide whether it may act.

### Safety rules

- **No permanent deletes.** "Delete" moves mail to Gmail Trash, which Gmail keeps for 30 days, and every delete can be restored from the Activity screen.
- **Protected categories** (receipts, banks, travel, security alerts, people you've emailed, starred) are never touched or suggested.
- **Dry-run mode** logs what Sweep would do without doing it.
- **Every action is audited**, automatic or approved, with the reason and confidence.
- **Keep is a signal.** Senders you keep are skipped in future runs.

## Stack

|          |                                                                      |
| -------- | -------------------------------------------------------------------- |
| Monorepo | pnpm workspaces: `apps/web`, `apps/server`, `packages/shared`        |
| Web      | React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router + Query |
| Server   | Hono on Node 22, zod validation                                      |
| Data     | SQLite via libSQL + Drizzle ORM (one file, no setup)                 |
| AI       | Anthropic SDK, Claude Haiku, forced tool use for structured output   |
| Gmail    | `googleapis`, `gmail.modify` scope, RFC 8058 one-click unsubscribe   |
| Testing  | Vitest, Testing Library, MSW                                         |
| Shipping | Docker (single container), GitHub Actions CI                         |

## Quick start (demo mode)

Demo mode runs the full app on the same sample data as the designs, with no Gmail account or API key.

```bash
corepack enable
pnpm install
pnpm dev:demo
```

Open http://localhost:5173.

## Run it on your own inbox

Sweep is self-hosted: you bring your own Google OAuth client and Anthropic API key, and your mail never passes through anyone else's server.

1. In Google Cloud Console, create a project, enable the **Gmail API**, and create an **OAuth client ID** (Web application) with redirect URI `http://localhost:8787/auth/google/callback`. Leave the consent screen in **Testing** mode and add your own address as a test user. A personal-use app in Testing mode doesn't need Google's verification.
2. Copy `.env.example` to `.env`, set `SWEEP_DEMO=0`, and fill in the Google client, your `ANTHROPIC_API_KEY`, a `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), and an `APP_PASSWORD` you'll use to sign in to the app.
3. `pnpm dev`, open the app, and click **Connect Gmail**.

The server listens on `HOST`, which defaults to `127.0.0.1` so only your own machine can reach it. Set `HOST=0.0.0.0` only when other machines or containers need to connect, and keep `APP_PASSWORD` set when you do.

Start with **Dry run** switched on in Rules & safety and check the Activity log before letting Sweep act for real.

### Docker

```bash
docker build -t sweep .
docker run -p 8787:8787 --env-file .env -v sweep-data:/app/data sweep
```

The image sets `HOST=0.0.0.0` so the published port works. `APP_PASSWORD` must be in the env file; live mode won't start without it.

## Development

```bash
pnpm dev          # web on :5173, API on :8787 (live mode, reads .env)
pnpm dev:demo     # same, on demo data
pnpm test         # all packages
pnpm typecheck
pnpm build
pnpm db:generate  # after changing apps/server/src/db/schema.ts
```

```
apps/
  server/   Hono API, run engine, Gmail + Claude integrations, SQLite store
  web/      React UI (routes in src/routes, tokens in src/styles.css)
packages/
  shared/   zod schemas, the decide() policy, demo fixtures
docs/
  designs/  design source files for each screen
  HANDOFF.md
```

## License

MIT
