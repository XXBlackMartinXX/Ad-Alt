# PromptProfit Installation Guide

Privacy-first, opt-in monetization for AI wait-states. This guide covers local developer setup, VS Code extension installation, browser extension testing, API key creation, and troubleshooting for common failure modes.

---

## 1. Local Developer Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| Node.js | 20.x | https://nodejs.org/ (use nvm or fnm to pin the version) |
| pnpm | 9.4.0 exactly | `npm install -g pnpm@9.4.0` |

### Steps

**Clone the repository**

```bash
git clone https://github.com/XXBlackMartinXX/Ad-Alt.git
cd Ad-Alt
```

**Install dependencies**

```bash
pnpm install --frozen-lockfile
```

**Configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values. At minimum for local development:

- `DATABASE_URL` — defaults in `.env.example` match `docker-compose.yml`, no change needed locally
- `REDIS_URL` — same as above
- `API_SECRET_KEY`, `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `EVENT_SIGNING_SECRET` — generate with `openssl rand -hex 32`

**Start infrastructure**

Docker Desktop must be running before executing this command.

```bash
docker compose up -d
```

This starts three services:

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL 16 | 5432 | Primary datastore |
| Redis 7 | 6379 | Rate limiting, dedup, cache |
| MailDev | 1080 (UI), 1025 (SMTP) | Captures outbound emails in development |

Verify all containers are healthy:

```bash
docker compose ps
```

Wait until all services show `healthy` or `running` before continuing.

**Build workspace packages**

The database migration tooling reads compiled output, not TypeScript source. Build packages first:

```bash
pnpm --filter @ad-alt/database build
pnpm --filter @ad-alt/shared build
```

**Run migrations**

```bash
cd packages/database && pnpm db:migrate
```

**Seed development data**

```bash
pnpm db:seed
```

**Start all services**

```bash
pnpm dev
```

This runs the API (`http://localhost:3001`), web dashboard (`http://localhost:3000`), and any other workspace packages with a `dev` script via Turborepo.

Confirm the API is healthy:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"status":"ok","checks":{"database":"ok","redis":"ok"},"timestamp":"..."}
```

---

## 2. VS Code Extension Test

The packaged extension is checked into the repository at `apps/extension/promptprofit-0.1.0.vsix`.

**Install via the CLI**

```bash
code --install-extension apps/extension/promptprofit-0.1.0.vsix
```

**Install via the Extensions panel**

1. Open VS Code
2. Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Click the `...` menu (top-right of the panel)
4. Select **Install from VSIX...**
5. Navigate to `apps/extension/promptprofit-0.1.0.vsix` and confirm

**Obtain an API key**

For local testing, generate a key directly against the running API (see [Section 4](#4-api-key-creation) for the full curl command). For the production dashboard, sign in at `/dashboard/api-key`.

**Enable the extension**

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

```
PromptProfit: Enable
```

**Configure for local testing without an AI assistant**

Open VS Code settings (`Ctrl+,` / `Cmd+,`), search for `promptprofit`, and set:

| Setting | Value | Effect |
|---|---|---|
| `promptprofit.adapter` | `mock` | Fires synthetic wait-states — no real AI extension required |
| `promptprofit.apiUrl` | `http://localhost:3001` | Points extension at the local API |

Alternatively, add to your `settings.json`:

```json
{
  "promptprofit.adapter": "mock",
  "promptprofit.apiUrl": "http://localhost:3001"
}
```

---

## 3. Browser Extension Local Test

> **Note:** The browser extension (`apps/browser-extension/`) is currently in development and has not been published to the Chrome Web Store.

Once the package is implemented, load it as an unpacked extension for local testing:

**Build the extension**

```bash
cd apps/browser-extension
pnpm build
```

**Load unpacked in Chrome**

1. Navigate to `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `apps/browser-extension/dist/` directory

**Configure the extension**

Open the extension's options page and set:

- **API URL** — `http://localhost:3001` for local development
- **API Key** — your `ppft_` prefixed key (see [Section 4](#4-api-key-creation))

---

## 4. API Key Creation

### Local: POST /v1/auth/exchange

Use this endpoint to mint an API key directly against the local API. You need a valid `userId` (UUID of an existing user row, created by `pnpm db:seed`).

```bash
curl -X POST http://localhost:3001/v1/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "dev-machine-01",
    "userId": "<your-user-uuid>",
    "keyName": "local-dev-key"
  }'
```

A successful response returns the raw key in the `apiKey` field:

```json
{
  "apiKey": "ppft_<64-hex-chars>",
  "deviceId": "dev-machine-01"
}
```

> **Important:** The raw key is returned exactly once. It is stored hashed in the database and cannot be recovered. Save it immediately — regenerate if lost.

### Production: Web Dashboard

Sign in to the web dashboard and navigate to **Dashboard → API Keys** (`/dashboard/api-key`) to create and manage keys.

---

## 5. Troubleshooting: Windows

**Use Node.js 20, not 22+**

The project targets Node 20. Node 22+ can introduce module resolution changes that break the monorepo's `NodeNext` import style.

```bash
node --version   # must be v20.x.x
```

**Use pnpm 9.4.0 exactly**

```bash
npm install -g pnpm@9.4.0
pnpm --version   # must be 9.4.0
```

**Run pnpm install on an NTFS drive**

Workspace symlinks (`node_modules/.pnpm` virtual store links) will silently fail on exFAT or FAT32 volumes. Clone the repository to an NTFS drive (typically `C:\`).

**Docker Desktop must be running**

Before `docker compose up -d`, confirm Docker Desktop is open and fully started. The system tray icon should show no error state.

**Environment variables are not auto-loaded**

Neither `npm` nor `pnpm` scripts load `.env` automatically. Choose one of the following approaches:

- **Bash (Git Bash / WSL):**
  ```bash
  set -a && source .env && set +a
  pnpm dev
  ```

- **PowerShell:**
  ```powershell
  Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
    }
  }
  pnpm dev
  ```

- **Add a dotenv loader** to the API start script (e.g., `dotenv -e ../../.env -- node dist/server.js`).

**Windows line endings**

Shell scripts committed with CRLF line endings will fail to execute. Ensure `.gitattributes` enforces LF for `*.sh` files:

```
*.sh text eol=lf
```

---

## 6. Troubleshooting: Docker

**"Cannot connect to Docker daemon"**

Docker Desktop is not running. Start it and wait for the whale icon in the system tray to stabilize before retrying.

**Port conflicts (5432 or 6379 already in use)**

A local PostgreSQL or Redis instance may already occupy the default ports. Identify the conflict:

```bash
# Linux / macOS
netstat -tlnp | grep -E '5432|6379'

# Windows (PowerShell)
netstat -ano | findstr "5432 6379"
```

Stop the conflicting service, or override the host port in `docker-compose.yml` (e.g., `"5433:5432"`) and update `DATABASE_URL` in `.env` accordingly.

**"Image pull blocked" / network restricted environment**

Some corporate or sandbox environments block Docker Hub pulls. In that case, install PostgreSQL 16 and Redis 7 natively and point `DATABASE_URL` and `REDIS_URL` at the local instances.

**Checking service health**

```bash
docker compose ps
```

All three services (`promptprofit_postgres`, `promptprofit_redis`, `promptprofit_maildev`) should show `healthy` or `running`. If a container is restarting, check its logs:

```bash
docker compose logs postgres
docker compose logs redis
```

---

## 7. Troubleshooting: pnpm

**Install the exact version**

```bash
npm install -g pnpm@9.4.0
```

The `packageManager` field in `package.json` is pinned to `pnpm@9.4.0`. Using a different version may cause lockfile mismatches.

**"ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL"**

Turborepo's task graph requires compiled packages before running the full dev server. Build the internal packages first:

```bash
pnpm --filter @ad-alt/database build
pnpm --filter @ad-alt/shared build
pnpm dev
```

**Workspace link errors on Windows**

Symlink creation for workspace packages requires NTFS. If you see link errors, verify the repository is on an NTFS volume (not a network share, exFAT USB drive, or Windows Subsystem for Linux mount that doesn't support symlinks).

---

## 8. Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `Missing required env var: DATABASE_URL` | `.env` file not loaded into the process environment | Load `.env` before starting (see [Section 5](#5-troubleshooting-windows) for platform-specific methods) |
| `relation "users" does not exist` | Database migrations have not been run | Run `cd packages/database && pnpm db:migrate` after infrastructure is healthy |
| `Cannot find module '@ad-alt/database'` | Internal packages are not built | Run `pnpm --filter @ad-alt/database build` and `pnpm --filter @ad-alt/shared build` first |
| `VSIX install fails` | Incompatible Node or vsce version | Ensure Node 20 is active; rebuild with `cd apps/extension && pnpm build` and repackage |
| Health check returns `"redis": "error"` | Redis container is not running or not yet healthy | Run `docker compose up -d redis` and wait for the health check to pass |
| API key not working / 401 responses | Key format wrong, or key was lost and must be regenerated | Verify the key starts with `ppft_`; keys are stored hashed and cannot be recovered — use `POST /v1/auth/exchange` to issue a new one |
