# Local Development Setup

This guide walks through setting up PromptProfit for local development from a fresh clone: infrastructure, database, API, web dashboard, and the VS Code extension.

For day-to-day commands once everything is running, see the [root README](../README.md#quick-start-local-development). For how to exercise the system end-to-end without a real AI assistant installed, see [`LOCAL_TESTING.md`](./LOCAL_TESTING.md).

## Prerequisites

- Node.js 20 or later
- pnpm 9 or later (`npm install -g pnpm@9`)
- Docker + Docker Compose (PostgreSQL, Redis, Maildev)
- VS Code (to run the extension)

## 1. Clone and install

```bash
git clone https://github.com/XXBlackMartinXX/Ad-Alt.git
cd Ad-Alt
pnpm install
```

## 2. Start local infrastructure

```bash
docker compose up -d
```

This starts:

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL 16 | 5432 | Primary datastore |
| Redis 7 | 6379 | Rate limiting, dedup, cache |
| Maildev | 1080 (UI), 1025 (SMTP) | Captures magic-link emails sent in development |

Check `docker compose ps` to confirm all three containers are `healthy`/`running` before continuing.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in real values for:

- `API_SECRET_KEY`, `EVENT_SIGNING_SECRET`, `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32` (or `openssl rand -hex 32` for `EVENT_SIGNING_SECRET`)
- `DATABASE_URL` / `REDIS_URL` — the `.env.example` defaults already match `docker-compose.yml`, so no change is needed for local development
- OAuth provider credentials (`GITHUB_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`) are optional in MVP — the web dashboard's login flow is not required to exercise the extension/API/ledger path described in `LOCAL_TESTING.md`
- Stripe keys can stay as the placeholder `sk_test_...` / `whsec_...` / `pk_test_...` values — payout integration is not implemented yet (see the README's MVP Status section)

Never commit `.env`. It is already covered by `.gitignore`.

## 4. Build packages and run database migrations

```bash
pnpm -r build
pnpm db:migrate
```

`pnpm -r build` must run before `pnpm db:migrate`/`db:generate`: the database package's Drizzle config reads the compiled schema in `packages/database/dist`, not the TypeScript source, because `drizzle-kit`'s schema loader does not resolve this repo's `NodeNext`-style `.js`-extension relative imports in raw `.ts` files. See the comment in `packages/database/drizzle.config.ts` for detail.

## 5. Seed development data (optional)

```bash
pnpm db:seed
```

## 6. Run the API

```bash
cd apps/api
pnpm dev
```

The API listens on `http://localhost:3001` by default (`PORT` env var). Confirm it's up:

```bash
curl http://localhost:3001/health
```

A healthy response looks like:

```json
{"status":"ok","checks":{"database":"ok","redis":"ok"},"timestamp":"..."}
```

## 7. Run the web dashboard

```bash
cd apps/web
pnpm dev
```

Opens on `http://localhost:3000`.

## 8. Load the VS Code extension

Open the monorepo root in VS Code and press **F5** to launch an Extension Development Host with the extension loaded (this uses the `apps/extension` launch configuration and runs an esbuild watch build automatically).

Alternatively, build the extension manually:

```bash
cd apps/extension
pnpm build       # production bundle → dist/
pnpm dev         # esbuild watch mode
```

Once loaded, configure the extension via VS Code settings (`Cmd/Ctrl+,`, search "promptprofit"):

| Setting | Default | Description |
|---|---|---|
| `promptprofit.enabled` | `true` | Master on/off switch |
| `promptprofit.adapter` | `"ai_status_bar"` | Wait-state source: `"ai_status_bar"` (real AI extension status bar) or `"mock"` (synthetic wait-states for local testing, see `LOCAL_TESTING.md`) |
| `promptprofit.displaySurface` | status bar | Where the sponsored line is rendered |
| `promptprofit.apiUrl` | `http://localhost:3001` | Base URL the extension talks to |

For local development without a real AI coding assistant installed, set `promptprofit.adapter` to `"mock"`.

## Troubleshooting

- **`ECONNREFUSED` on `db:migrate`/API startup** — Docker infrastructure isn't up yet, or hasn't finished its health check. Run `docker compose ps` and wait for `healthy`.
- **`Cannot find module './<name>.js'` from `drizzle-kit`** — you skipped step 4's `pnpm -r build`. The Drizzle config points at compiled output, not source.
- **`next lint` prompts interactively / fails in CI** — make sure `apps/web` dependencies installed correctly (`eslint` + `eslint-config-next` are devDependencies of `apps/web`).
