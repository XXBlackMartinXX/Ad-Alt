<#
.SYNOPSIS
    Fully automated local real-API smoke test for the ChatGPT browser adapter.

.DESCRIPTION
    Runs the ChatGPT browser adapter smoke test against the real local
    PromptProfit API (http://127.0.0.1:3001) instead of the embedded mock.

    Automated steps (all happen without manual intervention):
      1. Load .env if present (DATABASE_URL safety check applied)
      2. Validate DATABASE_URL points only to a local host
      3. Check Docker daemon is running
      4. Start Docker services: docker compose up -d
      5. Run: pnpm db:migrate
      6. Run: pnpm db:seed (idempotent)
      7. Check API health at http://127.0.0.1:3001/health
      8. If API not running: start it as a background job (or print command)
      9. Wait for /health with timeout
      10. Auto-mint local dev API key (never stored or printed by default)
      11. Run live ChatGPT smoke (browser opens, human must log in + submit prompt)
      12. Query local Postgres for sanitized recent events (privacy-safe columns only)
      13. Write sanitized local-API report to test-results/local-api/

    PRIVACY RULES:
    - Never reads ChatGPT page content, user prompts, AI responses.
    - API key is held only in process memory. Never printed, logged, or committed.
    - DB query uses only safe columns: event_type, adapter_id, ad_decision_id,
      campaign_id, creative_id, session_id, sequence_number, created_at.
    - Reports contain no keys, tokens, URLs, DOM text, or user data.

.PARAMETER Help
    Show usage information and exit.

.PARAMETER SkipDocker
    Skip docker compose up -d. Use when services are already running.

.PARAMETER SkipMigrate
    Skip pnpm db:migrate and pnpm db:seed.

.PARAMETER SkipBuild
    Skip pnpm build:test. Use when dist-test/ is already up to date.

.PARAMETER NoStartApi
    Do not attempt to start the API automatically. Print start command and exit
    if the API is not reachable (overrides default auto-start behavior).

.PARAMETER ApiUrl
    Local API base URL. Defaults to http://127.0.0.1:3001.

.PARAMETER HealthTimeoutSeconds
    Seconds to wait for the API health check. Default: 60.

.PARAMETER NoDbVerify
    Skip the post-run DB event query.

.PARAMETER SinceMinutes
    When querying the DB for events, look back this many minutes. Default: 30.

.EXAMPLE
    # Full automated run (recommended)
    pnpm -w run smoke:chatgpt:local-api
    .\scripts\run-local-real-api-smoke.ps1

.EXAMPLE
    # Skip Docker and build (services and dist-test/ already up to date)
    .\scripts\run-local-real-api-smoke.ps1 -SkipDocker -SkipBuild

.EXAMPLE
    # Show help
    pnpm -w run smoke:chatgpt:local-api:help

.NOTES
    EXIT CODES:
      0 - PASS (smoke ran, human must interpret PASSED/INCONCLUSIVE)
      1 - FAILED (one or more checks failed)
      2 - BLOCKED (prerequisites missing, nothing ran)
      3 - UNSAFE (non-local DB URL or other security violation)

    HUMAN ACTION REQUIRED:
    The browser opens to chatgpt.com. You must log in and submit a prompt.
    The test detects the wait state automatically.
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$SkipDocker,
    [switch]$SkipMigrate,
    [switch]$SkipBuild,
    [switch]$NoStartApi,
    [string]$ApiUrl                = "http://127.0.0.1:3001",
    [int]$HealthTimeoutSeconds     = 60,
    [switch]$NoDbVerify,
    [int]$SinceMinutes             = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Step([string]$msg)  { Write-Host ""; Write-Host ("[>>] " + $msg) -ForegroundColor Cyan }
function Write-Ok([string]$msg)    { Write-Host ("[OK] " + $msg) -ForegroundColor Green }
function Write-Info([string]$msg)  { Write-Host ("[--] " + $msg) -ForegroundColor Cyan }
function Write-Warn([string]$msg)  { Write-Host ("[!!] " + $msg) -ForegroundColor Yellow }
function Write-Err([string]$msg)   { Write-Host ("[XX] " + $msg) -ForegroundColor Red }
function Write-Separator           { Write-Host ("-" * 60) -ForegroundColor DarkGray }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir
$ExtDir    = Join-Path $RepoRoot "apps/browser-extension"

# ---------------------------------------------------------------------------
# Help mode
# ---------------------------------------------------------------------------

if ($Help) {
    Write-Host ""
    Write-Host "SYNOPSIS" -ForegroundColor Cyan
    Write-Host "  Fully automated local real-API smoke test for ChatGPT browser adapter."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  pnpm -w run smoke:chatgpt:local-api"
    Write-Host "  .\scripts\run-local-real-api-smoke.ps1 [options]"
    Write-Host ""
    Write-Host "OPTIONS"
    Write-Host "  -Help                    Show this help and exit."
    Write-Host "  -SkipDocker              Skip docker compose up -d."
    Write-Host "  -SkipMigrate             Skip db:migrate and db:seed."
    Write-Host "  -SkipBuild               Skip pnpm build:test."
    Write-Host "  -NoStartApi              Do not auto-start API (print command instead)."
    Write-Host "  -ApiUrl <url>            Local API URL (default: http://127.0.0.1:3001)."
    Write-Host "  -HealthTimeoutSeconds    Seconds to wait for /health (default: 60)."
    Write-Host "  -NoDbVerify              Skip post-run DB event query."
    Write-Host "  -SinceMinutes <int>      DB query lookback window (default: 30)."
    Write-Host ""
    Write-Host "EXIT CODES"
    Write-Host "  0 = PASS (smoke ran successfully)"
    Write-Host "  1 = FAILED (assertions failed)"
    Write-Host "  2 = BLOCKED (prerequisites missing)"
    Write-Host "  3 = UNSAFE (non-local DB/API URL detected)"
    Write-Host ""
    Write-Host "HUMAN ACTION REQUIRED"
    Write-Host "  The browser opens to chatgpt.com. Log in and submit a prompt."
    Write-Host "  The test detects the wait state automatically."
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Safety: validate API URL is local
# ---------------------------------------------------------------------------

Write-Step "Safety check: validating local-only API URL"

$allowedHosts = @("localhost", "127.0.0.1", "::1")
$apiUri = $null
try {
    $apiUri = [System.Uri]$ApiUrl
} catch {
    Write-Err ("Invalid API URL: " + $ApiUrl)
    exit 3
}

$isLocalApi = $false
foreach ($h in $allowedHosts) {
    if ($apiUri.Host -eq $h) { $isLocalApi = $true; break }
}

if (-not $isLocalApi) {
    Write-Err "UNSAFE: API URL does not point to a local host."
    Write-Err ("  Provided: " + $ApiUrl)
    Write-Err "  This script only runs against localhost/127.0.0.1."
    exit 3
}

Write-Ok ("API URL is local: " + $ApiUrl)

# ---------------------------------------------------------------------------
# Load .env if present (optional, for DATABASE_URL etc.)
# ---------------------------------------------------------------------------

$dotEnvPath = Join-Path $RepoRoot ".env"
if (Test-Path $dotEnvPath) {
    Write-Step "Loading .env"
    $envLines = Get-Content $dotEnvPath -ErrorAction SilentlyContinue
    foreach ($line in $envLines) {
        $line = $line.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { continue }
        if ($line -match '^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?$') {
            $envKey = $Matches[1]
            $envVal = $Matches[2]
            # Only set if not already set (env var wins over .env file)
            if (-not (Get-Item -Path ("Env:\" + $envKey) -ErrorAction SilentlyContinue)) {
                Set-Item -Path ("Env:\" + $envKey) -Value $envVal
            }
        }
    }
    Write-Ok ".env loaded (existing env vars take precedence)"
}

# ---------------------------------------------------------------------------
# Safety: validate DATABASE_URL points to local host
# ---------------------------------------------------------------------------

$dbUrl = $env:DATABASE_URL
if ($dbUrl) {
    Write-Step "Safety check: validating DATABASE_URL is local"
    $isLocalDb = $false
    foreach ($h in @("localhost", "127.0.0.1", "::1")) {
        if ($dbUrl -like ("*" + $h + "*")) { $isLocalDb = $true; break }
    }
    # Also allow Docker service names (postgres, db) - internal Docker network
    foreach ($svc in @("postgres", "db", "database")) {
        if ($dbUrl -like ("*@" + $svc + ":*") -or $dbUrl -like ("*@" + $svc + "/*")) {
            $isLocalDb = $true; break
        }
    }
    if (-not $isLocalDb) {
        Write-Err "UNSAFE: DATABASE_URL does not appear to point to a local database."
        Write-Err "  DATABASE_URL contains a non-local host. Refusing to run."
        Write-Err "  This script is for local development only."
        exit 3
    }
    Write-Ok "DATABASE_URL is local (host validated)"
} else {
    Write-Warn "DATABASE_URL is not set. Skipping DB URL safety check."
    Write-Warn "Ensure you are connected to a local database only."
}

# ---------------------------------------------------------------------------
# Step 1: Check Docker daemon
# ---------------------------------------------------------------------------

Write-Step "Checking Docker daemon"

$dockerInfo = & docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker daemon is not running."
    Write-Err "Start Docker Desktop or the Docker service, then re-run."
    exit 2
}
Write-Ok "Docker daemon is running"

# ---------------------------------------------------------------------------
# Step 2: Start Docker services
# ---------------------------------------------------------------------------

if (-not $SkipDocker) {
    Write-Step "Starting Docker services"
    Push-Location $RepoRoot
    try {
        & docker compose up -d 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "docker compose up -d failed."
            Pop-Location
            exit 2
        }
        Write-Ok "Docker services started (postgres, redis, maildev)"
        Write-Info "Waiting 3s for Postgres to accept connections..."
        Start-Sleep -Seconds 3
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "Skipping Docker start (-SkipDocker). Assuming services are running."
}

# ---------------------------------------------------------------------------
# Step 3: Database migrate + seed
# ---------------------------------------------------------------------------

if (-not $SkipMigrate) {
    Write-Step "Running database migrations"
    Push-Location $RepoRoot
    try {
        & pnpm db:migrate 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "pnpm db:migrate failed."
            Pop-Location
            exit 2
        }
        Write-Ok "Migrations applied"

        Write-Step "Running database seed (idempotent)"
        & pnpm db:seed 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "pnpm db:seed failed."
            Pop-Location
            exit 2
        }
        Write-Ok "Seed applied (or already present)"
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "Skipping migrate/seed (-SkipMigrate)."
}

# ---------------------------------------------------------------------------
# Step 4: Check API health / optionally start API
# ---------------------------------------------------------------------------

Write-Step ("Checking API health at " + $ApiUrl + "/health")

$healthUri    = $ApiUrl + "/health"
$apiHealthy   = $false
$apiJobHandle = $null

function Test-ApiHealth {
    try {
        $r = Invoke-WebRequest -Uri $healthUri -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (Test-ApiHealth) {
    Write-Ok "API is healthy and reachable"
    $apiHealthy = $true
} else {
    Write-Warn ("API not reachable at " + $healthUri)

    if ($NoStartApi) {
        Write-Err "-NoStartApi is set. Cannot auto-start API."
        Write-Err "Start the API manually, then re-run:"
        Write-Err "  pnpm dev:api"
        exit 2
    }

    Write-Info "Attempting to start API as a background job..."
    Write-Warn "NOTE: The API process will be started in a background PowerShell job."
    Write-Warn "      It will be stopped when this script exits."

    $apiJob = Start-Job -ScriptBlock {
        param($root)
        Set-Location $root
        & pnpm dev:api 2>&1
    } -ArgumentList $RepoRoot

    $apiJobHandle = $apiJob

    # Poll health with timeout
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    $dots = 0
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $dots++
        if ($dots % 5 -eq 0) {
            Write-Info ("Waiting for API health... (" + [int]((($deadline) - (Get-Date)).TotalSeconds) + "s remaining)")
        }
        if (Test-ApiHealth) {
            $apiHealthy = $true
            Write-Ok "API is now healthy"
            break
        }
    }

    if (-not $apiHealthy) {
        Write-Err ("API did not become healthy within " + $HealthTimeoutSeconds + "s.")
        Write-Err "Check the API logs with: pnpm dev:api"
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }
}

# ---------------------------------------------------------------------------
# Step 5: Mint local dev API key (if not already set)
# ---------------------------------------------------------------------------

Write-Step "Checking for local dev API key"

$keyMinted = $false

if ($env:PROMPTPROFIT_DEV_API_KEY -and $env:PROMPTPROFIT_DEV_API_KEY.Length -gt 0) {
    Write-Ok "PROMPTPROFIT_DEV_API_KEY is already set (using existing key)"
} else {
    Write-Info "PROMPTPROFIT_DEV_API_KEY not set. Auto-minting from dev@example.com..."

    $getMintScript = Join-Path $ScriptDir "get-local-dev-api-key.ps1"
    if (-not (Test-Path $getMintScript)) {
        Write-Err ("Key-minting script not found: " + $getMintScript)
        exit 2
    }

    # Capture key via -PrintKey -Quiet.
    # The helper uses Write-Output so the value flows to the Success pipeline (capturable).
    # Write-Host would go to the console Information stream and cannot be assigned here.
    $rawOutput = @(& $getMintScript -PrintKey -Quiet -ApiUrl $ApiUrl 2>$null)
    $mintExit  = $LASTEXITCODE
    $mintedKey = if ($rawOutput.Count -gt 0) { $rawOutput[0].Trim() } else { "" }

    if ($mintExit -ne 0) {
        Write-Err ("Key mint helper exited " + $mintExit + ". Cannot continue.")
        Write-Err "Ensure pnpm db:seed has been run and the API is healthy."
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }

    if ($mintedKey.Length -lt 8) {
        Write-Err "Key mint helper exited 0 but produced no capturable key."
        Write-Err "Verify get-local-dev-api-key.ps1 uses Write-Output (not Write-Host) for -PrintKey."
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }

    if (-not $mintedKey.StartsWith("ppft_")) {
        Write-Err "Captured key does not start with 'ppft_'. Refusing to use an unexpected key format."
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }

    $env:PROMPTPROFIT_DEV_API_KEY = $mintedKey
    $keyMinted = $true
    Write-Ok "Local dev API key minted and set in process environment (LOCAL ONLY, not printed)"
}

# ---------------------------------------------------------------------------
# Step 6: Build extension (dist-test/)
# ---------------------------------------------------------------------------

if (-not $SkipBuild) {
    Write-Step "Building extension (dist-test/)"
    Push-Location $ExtDir
    try {
        & pnpm build:test 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "pnpm build:test failed."
            Pop-Location
            exit 2
        }
        Write-Ok "dist-test/ built"
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "Skipping build (-SkipBuild)."
}

# ---------------------------------------------------------------------------
# Step 7: Run live ChatGPT smoke against local API
# ---------------------------------------------------------------------------

Write-Step "Starting local real-API ChatGPT smoke test"
Write-Separator
Write-Host ""
Write-Host "  HUMAN ACTION REQUIRED" -ForegroundColor Yellow
Write-Host "  ---------------------" -ForegroundColor Yellow
Write-Host "  A Chromium window will open and navigate to chatgpt.com." -ForegroundColor Yellow
Write-Host "  1. Log in if prompted." -ForegroundColor Yellow
Write-Host "  2. Submit any prompt (e.g. 'hello')." -ForegroundColor Yellow
Write-Host "  3. The test auto-detects the wait state and verifies the banner." -ForegroundColor Yellow
Write-Host "  4. Events go to the REAL local API at " + $ApiUrl -ForegroundColor Yellow
Write-Host ""
Write-Separator

$env:LIVE_SMOKE_USE_LOCAL_API   = "1"
$env:PLAYWRIGHT_API_BASE_URL    = $ApiUrl

$playwrightExit = 0
Push-Location $ExtDir
try {
    & pnpm exec playwright test --config playwright.config.live.ts
    $playwrightExit = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:\LIVE_SMOKE_USE_LOCAL_API   -ErrorAction SilentlyContinue
    Remove-Item Env:\PLAYWRIGHT_API_BASE_URL     -ErrorAction SilentlyContinue
    # Clear key from env after test (key is no longer needed)
    if ($keyMinted) {
        Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue
        Write-Info "Local dev API key cleared from process environment"
    }
}

# ---------------------------------------------------------------------------
# Step 8: Post-run DB event verification
# ---------------------------------------------------------------------------

if (-not $NoDbVerify) {
    Write-Step "Verifying events in local Postgres (sanitized query)"

    $queryScript = Join-Path $ScriptDir "query-local-browser-events.ps1"
    if (Test-Path $queryScript) {
        & $queryScript -SinceMinutes $SinceMinutes -Adapter "chatgpt" -Limit 20
        $dbQueryExit = $LASTEXITCODE
        if ($dbQueryExit -ne 0) {
            Write-Warn ("DB event query exited with code " + $dbQueryExit + " (non-fatal).")
        }
    } else {
        Write-Warn ("query-local-browser-events.ps1 not found: " + $queryScript)
    }
} else {
    Write-Warn "Skipping DB event verification (-NoDbVerify)."
}

# ---------------------------------------------------------------------------
# Step 9: Show report location
# ---------------------------------------------------------------------------

Write-Separator
$reportDir = Join-Path $ExtDir "test-results/local-api"
if (Test-Path $reportDir) {
    $reports = Get-ChildItem -Path $reportDir -Filter "*.md" -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending
    if ($reports.Count -gt 0) {
        $latest = $reports[0]
        Write-Ok ("Latest report: " + $latest.FullName)
        Write-Host ""
        Write-Host (Get-Content $latest.FullName -Raw)
    }
}

# ---------------------------------------------------------------------------
# Cleanup: stop background API job if we started it
# ---------------------------------------------------------------------------

if ($apiJobHandle) {
    Write-Step "Stopping background API job"
    Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
    Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    Write-Ok "Background API job stopped"
}

# ---------------------------------------------------------------------------
# Exit
# ---------------------------------------------------------------------------

Write-Separator
Write-Host ""
if ($playwrightExit -eq 0) {
    Write-Ok "Local real-API smoke completed (Playwright exit 0)."
    Write-Info "Check the report above for PASSED / INCONCLUSIVE / FAILED."
    Write-Info "INCONCLUSIVE = wait state not detected (submit a ChatGPT prompt to retry)."
} else {
    Write-Err ("Local real-API smoke FAILED (Playwright exit " + $playwrightExit + ").")
}
Write-Host ""

exit $playwrightExit
