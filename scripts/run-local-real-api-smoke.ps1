<#
.SYNOPSIS
    Run the ChatGPT adapter smoke test against the local PromptProfit API.

.DESCRIPTION
    Points the extension at http://127.0.0.1:3001 (local API) instead of
    the embedded MockApiServer, so ad decisions and events flow through the
    full backend stack.

    CURRENT STATUS: BLOCKED
    See docs/LOCAL_REAL_API_SMOKE_MODE.md for the exact blockers and what
    is needed to enable this mode.

.PARAMETER Help
    Show usage information and exit.

.PARAMETER SkipChecks
    Skip pre-flight checks (Docker, psql). Use only if you are certain
    the local API is already running and the database is seeded.

.NOTES
    Prerequisites before this script can run end-to-end:
      1. Docker daemon running: docker compose up -d
      2. Database migrated and seeded: pnpm db:migrate && pnpm db:seed
      3. API server running: pnpm dev:api
      4. Dev API key exported: $env:PROMPTPROFIT_DEV_API_KEY = "..."
    See docs/LOCAL_REAL_API_SMOKE_MODE.md for full setup instructions.
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$SkipChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Step([string]$msg)  { Write-Host ("[>>] " + $msg) -ForegroundColor Cyan }
function Write-Ok([string]$msg)    { Write-Host ("[OK] " + $msg) -ForegroundColor Green }
function Write-Warn([string]$msg)  { Write-Host ("[!!] " + $msg) -ForegroundColor Yellow }
function Write-Err([string]$msg)   { Write-Host ("[XX] " + $msg) -ForegroundColor Red }
function Write-Info([string]$msg)  { Write-Host ("[--] " + $msg) -ForegroundColor Cyan }

if ($Help) {
    Write-Host ""
    Write-Host "SYNOPSIS" -ForegroundColor Cyan
    Write-Host "  Run the ChatGPT adapter smoke test against the local PromptProfit API."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  .\scripts\run-local-real-api-smoke.ps1 [-SkipChecks]"
    Write-Host "  pnpm -w run smoke:chatgpt:local-api"
    Write-Host ""
    Write-Host "STATUS"
    Write-Host "  BLOCKED - see docs/LOCAL_REAL_API_SMOKE_MODE.md for prerequisites."
    Write-Host ""
    Write-Host "PREREQUISITES"
    Write-Host "  1. Docker daemon running:  docker compose up -d"
    Write-Host "  2. DB migrated/seeded:     pnpm db:migrate && pnpm db:seed"
    Write-Host "  3. API server running:     pnpm dev:api"
    Write-Host "  4. Dev API key set:        " + '$env:PROMPTPROFIT_DEV_API_KEY = "..."'
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "===== Local Real-API Smoke (ChatGPT) =====" -ForegroundColor Magenta
Write-Host ""

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

$blockers = [System.Collections.Generic.List[string]]::new()

if (-not $SkipChecks) {
    Write-Step "Running pre-flight checks..."

    # Check 1: Docker daemon
    $dockerResult = & docker ps 2>&1
    if ($LASTEXITCODE -ne 0) {
        $blockers.Add("Docker daemon is not running. Start with: docker compose up -d")
        Write-Warn "Docker daemon is not running."
    } else {
        Write-Ok "Docker daemon is running."
    }

    # Check 2: Local API health
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -TimeoutSec 3 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Ok "Local API is reachable at http://127.0.0.1:3001"
        } else {
            $blockers.Add("Local API health check returned status " + $response.StatusCode)
            Write-Warn ("Local API returned status " + $response.StatusCode)
        }
    } catch {
        $blockers.Add("Local API is not reachable at http://127.0.0.1:3001. Start with: pnpm dev:api")
        Write-Warn "Local API is not reachable at http://127.0.0.1:3001."
    }

    # Check 3: Dev API key
    if (-not $env:PROMPTPROFIT_DEV_API_KEY) {
        $blockers.Add("PROMPTPROFIT_DEV_API_KEY environment variable is not set.")
        Write-Warn "PROMPTPROFIT_DEV_API_KEY is not set."
    } else {
        Write-Ok "PROMPTPROFIT_DEV_API_KEY is set."
    }
}

# ---------------------------------------------------------------------------
# Report blockers and exit
# ---------------------------------------------------------------------------

if ($blockers.Count -gt 0) {
    Write-Host ""
    Write-Err "BLOCKED: Local real-API smoke cannot run."
    Write-Host ""
    Write-Host "  Blockers:" -ForegroundColor Yellow
    foreach ($blocker in $blockers) {
        Write-Host ("    - " + $blocker) -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Info "See docs/LOCAL_REAL_API_SMOKE_MODE.md for the full setup guide."
    Write-Info "Use the fixture smoke instead: pnpm smoke:chatgpt:fixture"
    Write-Host ""
    exit 2
}

# ---------------------------------------------------------------------------
# Run smoke test against local API
# ---------------------------------------------------------------------------

Write-Step "Starting local real-API smoke test..."
Write-Info "Target: http://127.0.0.1:3001"
Write-Info "Note: This validates DB and API ingestion - not a mock."
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir

Push-Location $RepoRoot
try {
    $env:PLAYWRIGHT_API_BASE_URL = "http://127.0.0.1:3001"
    pnpm --filter "@ad-alt/browser-extension" test:e2e:live
    $exitCode = $LASTEXITCODE
} finally {
    Remove-Item Env:\PLAYWRIGHT_API_BASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Ok "Local real-API smoke PASSED."
    Write-Info "Verify events were ingested: pnpm -w run query:local-events"
} else {
    Write-Host ""
    Write-Err ("Local real-API smoke FAILED (exit code " + $exitCode + ").")
}

exit $exitCode
